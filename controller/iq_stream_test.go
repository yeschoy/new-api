package controller

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/relayconvert"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

// Return native SSE, including usage and completion markers, rather than a
// non-streaming JSON response that could hide a request-mode regression.
func writeIQTestStream(w http.ResponseWriter, path string) {
	w.Header().Set("Content-Type", "text/event-stream")
	var events []string
	switch {
	case strings.Contains(path, "GenerateContent"), strings.Contains(path, ":generateContent"):
		events = []string{
			`{"candidates":[{"content":{"parts":[{"thought":true,"text":"private reasoning"},{"text":"<svg>"}]}}]}`,
			`{"candidates":[{"finishReason":"STOP","content":{"parts":[{"text":"</svg>"}]}}],"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":20}}`,
		}
	case strings.HasSuffix(path, "/messages"):
		events = []string{
			`{"type":"message_start","message":{"usage":{"input_tokens":10}}}`,
			`{"type":"content_block_start","content_block":{"type":"text","text":"<svg>"}}`,
			`{"type":"content_block_delta","delta":{"type":"text_delta","text":"</svg>"}}`,
			`{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":20}}`,
			`{"type":"message_stop"}`,
		}
	case strings.HasSuffix(path, "/responses"):
		events = []string{
			`{"type":"response.output_text.delta","delta":"<svg>"}`,
			`{"type":"response.output_text.delta","delta":"</svg>"}`,
			`{"type":"response.completed","response":{"status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"<svg></svg>"}]}],"usage":{"input_tokens":10,"output_tokens":20}}}`,
		}
	default:
		events = []string{
			`{"choices":[{"index":0,"delta":{"content":"<svg>"}}]}`,
			`{"choices":[{"index":0,"delta":{"content":"</svg>"},"finish_reason":"stop"}]}`,
			`{"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":20}}`,
			`[DONE]`,
		}
	}
	for _, event := range events {
		fmt.Fprintf(w, "data: %s\n\n", event)
		w.(http.Flusher).Flush()
	}
}

func TestIQStreamingCannotBeDisabledByOverrides(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		gemini     bool
	}{
		{"chat", `{"messages":[],"stream":false}`, false},
		{"responses", `{"input":[],"stream":false}`, false},
		{"claude", `{"messages":[],"max_tokens":100,"stream":false}`, false},
		{"gemini", `{"contents":[],"stream":false}`, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			body, err := boundIQRequest([]byte(tc.body))
			require.NoError(t, err)
			if tc.gemini {
				require.False(t, gjson.GetBytes(body, "stream").Exists())
			} else {
				require.True(t, gjson.GetBytes(body, "stream").Bool())
			}
		})
	}
}

func TestIQChannelTestForcesStreamingWithoutChangingOrdinaryTests(t *testing.T) {
	for _, iq := range []bool{false, true} {
		t.Run(fmt.Sprintf("iq=%t", iq), func(t *testing.T) {
			root, _ := setupIQController(t)
			var calls atomic.Int32
			streams := make(chan bool, 1)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				body, _ := io.ReadAll(r.Body)
				stream := gjson.GetBytes(body, "stream").Bool()
				select {
				case streams <- stream:
				default:
				}
				if stream {
					writeIQTestStream(w, r.URL.Path)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				fmt.Fprint(w, `{"choices":[{"index":0,"finish_reason":"stop","message":{"role":"assistant","content":"<svg></svg>"}}],"usage":{"prompt_tokens":10,"completion_tokens":20}}`)
			}))
			defer server.Close()
			ch := &model.Channel{Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled, Key: "mock", BaseURL: &server.URL, Models: "gpt-4o", Group: "public"}
			require.NoError(t, model.DB.Create(ch).Error)
			var options *iqChannelTestOptions
			if iq {
				options = &iqChannelTestOptions{group: "public", prompt: "exact"}
			}
			result := testChannelWithIQ(context.Background(), ch, root.Id, "gpt-4o", string(constant.EndpointTypeOpenAI), false, options)
			require.NoError(t, result.localErr)
			require.Equal(t, iq, <-streams, "IQ must force streaming even if a caller passes false; ordinary tests must retain the caller's mode")
			require.EqualValues(t, 1, calls.Load())
		})
	}
}

func TestIQAdvancedCustomStreamingWireRequests(t *testing.T) {
	for _, tc := range []struct {
		name, incoming, upstream, converter string
		gemini                              bool
	}{
		{"chat-to-gemini", "/v1/chat/completions", "/v1beta/models/{model}:generateContent", relayconvert.ConverterOpenAIChatToGeminiContent, true},
		{"responses-to-gemini", "/v1/responses", "/v1beta/models/{model}:generateContent", relayconvert.ConverterOpenAIResponsesToGemini, true},
		{"gemini-to-chat", "/v1beta/models/{model}:generateContent", "/v1/chat/completions", relayconvert.ConverterGeminiContentToOpenAIChat, false},
		{"native-gemini", "/v1beta/models/{model}:generateContent", "/v1beta/models/{model}:generateContent", relayconvert.ConverterNone, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root, _ := setupIQController(t)
			type wireRequest struct {
				body        []byte
				path, query string
			}
			requests := make(chan wireRequest, 1)
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				body, _ := io.ReadAll(r.Body)
				select {
				case requests <- wireRequest{body, r.URL.Path, r.URL.Query().Get("alt")}:
				default:
				}
				writeIQTestStream(w, r.URL.Path)
			}))
			defer server.Close()
			override := `{"stream":false}`
			ch := &model.Channel{Type: constant.ChannelTypeAdvancedCustom, Status: common.ChannelStatusEnabled, Key: "mock", BaseURL: &server.URL, Models: "gpt-4o", Group: "public", ParamOverride: &override}
			ch.SetOtherSettings(dto.ChannelOtherSettings{AdvancedCustom: &dto.AdvancedCustomConfig{Routes: []dto.AdvancedCustomRoute{{IncomingPath: tc.incoming, UpstreamPath: tc.upstream, Converter: tc.converter}}}})
			require.NoError(t, model.DB.Create(ch).Error)
			require.NoError(t, ch.AddAbilities(nil))
			result := executeIQPair(context.Background(), root.Id, "public", "gpt-4o", "exact", "")
			require.Equal(t, "success", result.Status, result.ErrorMessage)
			wire := <-requests
			if tc.gemini {
				require.Contains(t, wire.path, ":streamGenerateContent")
				require.Equal(t, "sse", wire.query)
				require.False(t, gjson.GetBytes(wire.body, "stream").Exists())
				require.EqualValues(t, model.IQOutputTokens, gjson.GetBytes(wire.body, "generationConfig.maxOutputTokens").Int())
			} else {
				require.True(t, gjson.GetBytes(wire.body, "stream").Bool(), "the converted wire protocol, not the original Gemini endpoint, owns the stream field")
				require.EqualValues(t, model.IQOutputTokens, gjson.GetBytes(wire.body, "max_tokens").Int())
			}
			require.Equal(t, model.IQText("<svg></svg>"), result.Artifact)
			require.EqualValues(t, 1, calls.Load())
		})
	}
}

func TestIQStreamingRequiresCompleteOutputWithoutRetry(t *testing.T) {
	for _, tc := range []struct {
		name, event string
	}{
		{"chat-disconnected", `{"choices":[{"index":0,"delta":{"content":"<svg></svg>"}}]}`},
		{"responses-incomplete", `{"type":"response.incomplete","response":{"status":"incomplete"}}`},
		{"claude-token-limit", `{"type":"message_delta","delta":{"stop_reason":"max_tokens"}}`},
		{"gemini-token-limit", `{"candidates":[{"finishReason":"MAX_TOKENS","content":{"parts":[{"text":"<svg></svg>"}]}}]}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root, _ := setupIQController(t)
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				_, _ = io.Copy(io.Discard, r.Body)
				w.Header().Set("Content-Type", "text/event-stream")
				fmt.Fprintf(w, "data: %s\n\n", tc.event)
			}))
			defer server.Close()
			ch := &model.Channel{Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled, Key: "mock", BaseURL: &server.URL, Models: "gpt-4o", Group: "public"}
			require.NoError(t, model.DB.Create(ch).Error)
			require.NoError(t, ch.AddAbilities(nil))
			result := executeIQPair(context.Background(), root.Id, "public", "gpt-4o", "exact", "")
			require.Equal(t, "invalid_artifact", result.Status)
			require.Equal(t, "invalid_artifact", result.ErrorCode)
			require.Empty(t, result.Artifact)
			require.EqualValues(t, 1, calls.Load(), "incomplete streams must not retry or fall back to non-streaming")
		})
	}
}
