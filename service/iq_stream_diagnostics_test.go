package service

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

func TestIQStreamDiagnostics(t *testing.T) {
	for _, tc := range []struct {
		name, events, outcome, event, finish string
		complete, done, limited, success     bool
	}{
		{"chat", `{"choices":[{"index":0,"delta":{"content":"<svg></svg>"},"finish_reason":"stop"}]}` + "\n[DONE]", "completed", "done", "stop", true, true, false, true},
		{"missing-end", `{"choices":[{"delta":{"content":"<svg></svg>"}}]}`, "missing_completion", "chat_chunk", "none", false, false, false, false},
		{"chat-limit", `{"choices":[{"finish_reason":"length"}]}` + "\n[DONE]", "token_limit", "done", "length", true, true, true, false},
		{"chat-filter", `{"choices":[{"finish_reason":"content_filter"}]}`, "invalid_finish_reason", "chat_chunk", "content_filter", true, false, false, false},
		{"chat-unknown-reason", `{"choices":[{"finish_reason":"secret-key\nhttps://provider.invalid"}]}`, "invalid_finish_reason", "chat_chunk", "other", true, false, false, false},
		{"responses", `{"type":"response.output_text.delta","delta":"discarded"}` + "\n" + `{"type":"response.completed","response":{"status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"<svg></svg>"}]}]}}`, "completed", "response.completed", "none", true, false, false, true},
		{"responses-failed", `{"type":"response.failed","response":{"error":{"message":"secret-key"}}}` + "\n[DONE]", "upstream_error", "done", "none", true, true, false, false},
		{"failed-then-completed", `{"type":"response.failed"}` + "\n" + `{"type":"response.completed","response":{"status":"completed","output":[]}}`, "upstream_error", "response.completed", "none", true, false, false, false},
		{"responses-incomplete", `{"type":"response.incomplete","response":{"incomplete_details":{"reason":"content_filter"}}}`, "upstream_incomplete", "response.incomplete", "content_filter", false, false, false, false},
		{"responses-limit", `{"type":"response.incomplete","response":{"incomplete_details":{"reason":"max_output_tokens"}}}`, "token_limit", "response.incomplete", "max_output_tokens", false, false, true, false},
		{"responses-unknown-reason", `{"type":"response.incomplete","response":{"incomplete_details":{"reason":"secret-key"}}}`, "upstream_incomplete", "response.incomplete", "other", false, false, false, false},
		{"responses-invalid-final", `{"type":"response.completed","response":{"status":"secret-status"}}`, "invalid_final_response", "response.completed", "none", true, false, false, false},
		{"claude", `{"type":"content_block_start","content_block":{"type":"text","text":"<svg>"}}` + "\n" + `{"type":"content_block_delta","delta":{"type":"text_delta","text":"</svg>"}}` + "\n" + `{"type":"message_delta","delta":{"stop_reason":"end_turn"}}` + "\n" + `{"type":"message_stop"}`, "completed", "message_stop", "end_turn", true, false, false, true},
		{"claude-limit", `{"type":"message_delta","delta":{"stop_reason":"max_tokens"}}` + "\n" + `{"type":"message_stop"}`, "token_limit", "message_stop", "max_tokens", true, false, true, false},
		{"gemini", `{"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"<svg></svg>"}]}}]}`, "completed", "gemini_chunk", "STOP", true, false, false, true},
		{"gemini-limit", `{"candidates":[{"finishReason":"MAX_TOKENS"}]}` + "\n[DONE]", "token_limit", "done", "MAX_TOKENS", true, true, true, false},
		{"error", `{"type":"error","error":{"code":"secret-key","message":"<html>private</html>"}}` + "\n[DONE]", "upstream_error", "done", "none", true, true, false, false},
		{"unknown-event", `{"type":"secret-key\nhttps://provider.invalid","delta":"private"}`, "missing_completion", "other", "none", false, false, false, false},
		{"bad-json", "secret-key", "no_valid_sse_data", "invalid_json", "none", false, false, false, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var body strings.Builder
			for _, event := range strings.Split(tc.events, "\n") {
				body.WriteString("data: " + event + "\n\n")
			}
			text, diagnostic, err := IQVisibleTextWithDiagnostics([]byte(body.String()), true)
			if tc.success {
				require.NoError(t, err)
				require.Equal(t, "<svg></svg>", text)
			} else {
				require.Error(t, err)
				require.Empty(t, text, "partial or failed output must not become artwork")
			}
			require.Equal(t, body.Len(), diagnostic.ResponseBytes)
			require.Equal(t, strings.Count(tc.events, "\n")+1, diagnostic.DataEvents)
			require.Equal(t, tc.outcome, diagnostic.EndReason())
			require.Equal(t, tc.event, diagnostic.LastEvent())
			require.Equal(t, tc.finish, diagnostic.FinishReason())
			require.Equal(t, tc.complete, diagnostic.CompletionSeen)
			require.Equal(t, tc.done, diagnostic.DoneSeen)
			require.Equal(t, tc.limited, diagnostic.TokenLimit)
			description := diagnostic.EndReason() + diagnostic.LastEvent() + diagnostic.FinishReason()
			for _, secret := range []string{"secret", "provider.invalid", "private", "<html>"} {
				require.NotContains(t, description, secret)
			}
			// The compatibility entry point must retain exactly the same result.
			oldText, oldErr := IQVisibleText([]byte(body.String()), true)
			require.Equal(t, text, oldText)
			require.Equal(t, err == nil, oldErr == nil)
		})
	}
}

func TestIQStreamDiagnosticsFramingAndBounds(t *testing.T) {
	for _, body := range []string{"", ": heartbeat\n\n", `{"error":{"message":"secret-key"}}`, "<html>secret-key</html>"} {
		_, d, err := IQVisibleTextWithDiagnostics([]byte(body), true)
		require.Error(t, err)
		require.Equal(t, "no_sse_data", d.EndReason())
		require.Equal(t, len(body), d.ResponseBytes)
		require.Zero(t, d.DataEvents)
		require.False(t, d.CompletionSeen)
	}
	_, d, err := IQVisibleTextWithDiagnostics([]byte("data: bad-json\n\ndata: [DONE]\n\n"), true)
	require.NoError(t, err, "diagnostics must not silently tighten the existing acceptance policy")
	require.Equal(t, 1, d.InvalidDataEvents)
	require.Equal(t, "completed", d.EndReason())
	_, d, err = IQVisibleTextWithDiagnostics([]byte(strings.Repeat("x", model.IQMaxResponseBytes+1)), true)
	require.Error(t, err)
	require.Equal(t, "response_too_large", d.EndReason())
	require.Equal(t, model.IQMaxResponseBytes+1, d.ResponseBytes)
	text, d, err := IQVisibleTextWithDiagnostics([]byte(`{"choices":[{"message":{"content":"<svg></svg>"},"finish_reason":"stop"}]}`), false)
	require.NoError(t, err)
	require.Equal(t, "<svg></svg>", text)
	require.Zero(t, d.DataEvents)
	require.False(t, d.DoneSeen)
	_, d, err = IQVisibleTextWithDiagnostics([]byte(`secret-key`), false)
	require.Error(t, err)
	require.Equal(t, "invalid_json", d.EndReason())
	_, d, err = IQVisibleTextWithDiagnostics([]byte("data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"length\"}}\n\n"), true)
	require.Error(t, err)
	require.False(t, d.TokenLimit, "a Chat limit string in an unrelated protocol is not proof of a token limit")
	require.Equal(t, "missing_completion", d.EndReason())
	_, d, err = IQVisibleTextWithDiagnostics([]byte("data: {\"choices\":[{\"index\":1,\"finish_reason\":\"length\"}]}\n\n"), true)
	require.Error(t, err)
	require.False(t, d.TokenLimit, "ignored candidates must not affect diagnostics")
	// Unknown values never enter diagnostics, even if encoded as valid JSON.
	b, err := json.Marshal(map[string]any{"type": "Authorization: secret-key", "error": "secret-key"})
	require.NoError(t, err)
	_, d, err = IQVisibleTextWithDiagnostics([]byte("data: "+string(b)+"\n\n"), true)
	require.Error(t, err)
	require.Equal(t, "other", d.LastEvent())
	require.Equal(t, "none", d.FinishReason())
}
