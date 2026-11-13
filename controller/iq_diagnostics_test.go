package controller

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	hosttypes "github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type iqDiagnosticBody struct {
	reads  int
	closed bool
	err    error
}

func (b *iqDiagnosticBody) Read([]byte) (int, error) {
	b.reads++
	return 0, b.err
}
func (b *iqDiagnosticBody) Close() error {
	b.closed = true
	return nil
}

func TestIQResponseDiagnosticsNeverReadProviderErrorBodies(t *testing.T) {
	for _, status := range []int{302, 401, 429, 500, 502, 504} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			body := &iqDiagnosticBody{err: errors.New("secret-provider-body")}
			result := captureIQResponse(nil, &http.Response{StatusCode: status, Body: body}, nil, 0, 0, hosttypes.PriceData{}, time.Now())
			require.Error(t, result.localErr)
			require.Equal(t, status, result.iqHTTPStatus)
			require.Equal(t, "response", result.iqStage)
			require.Zero(t, body.reads)
			require.Zero(t, result.iqDiagnostics.ResponseBytes)
			require.Equal(t, "not_parsed", result.iqDiagnostics.EndReason())
			require.True(t, body.closed)
			require.NotContains(t, result.localErr.Error(), "secret")
		})
	}
	body := &iqDiagnosticBody{err: errors.New("secret-read-error")}
	result := captureIQResponse(nil, &http.Response{StatusCode: 200, Body: body}, nil, 0, 0, hosttypes.PriceData{}, time.Now())
	require.Equal(t, 200, result.iqHTTPStatus)
	require.Equal(t, "response", result.iqStage)
	require.True(t, body.closed)
	_, code, message := classifyIQFailure(context.Background(), result)
	require.Equal(t, "response_read_failed", code)
	require.NotContains(t, message, "secret")
}

func TestIQResponseDiagnosticsReadFailuresAndLimit(t *testing.T) {
	for _, tc := range []struct {
		name string
		body io.Reader
		size int
	}{
		{"partial-read", io.MultiReader(strings.NewReader("private-partial-body"), &iqDiagnosticBody{err: io.ErrUnexpectedEOF}), len("private-partial-body")},
		{"response-limit", strings.NewReader(strings.Repeat("x", model.IQMaxResponseBytes+100)), model.IQMaxResponseBytes + 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			result := captureIQResponse(nil, &http.Response{StatusCode: 200, Body: io.NopCloser(tc.body)}, nil, 0, 0, hosttypes.PriceData{}, time.Now())
			require.Error(t, result.localErr)
			require.Equal(t, tc.size, result.iqDiagnostics.ResponseBytes)
			require.Zero(t, result.iqDiagnostics.DataEvents)
			require.Equal(t, "not_parsed", result.iqDiagnostics.EndReason(), "do not pretend partially read or oversized responses completed parsing")
			require.False(t, result.iqDiagnostics.CompletionSeen)
			require.Empty(t, result.text)
		})
	}
}

func TestIQStreamFailureDiagnosticsLogs(t *testing.T) {
	for _, tc := range []struct {
		name, body, expected, stage string
	}{
		{"heartbeat", ": heartbeat\n\n", "sse_data_events=0 invalid_data_events=0 completion_seen=false done_seen=false token_limit=false stream_end=no_sse_data last_event=none finish_reason=none", "response"},
		{"missing-end", "data: {\"choices\":[{\"delta\":{\"content\":\"<svg>private-artwork</svg>\"}}]}\n\n", "completion_seen=false done_seen=false token_limit=false stream_end=missing_completion last_event=chat_chunk finish_reason=none", "response"},
		{"upstream-error", "data: {\"type\":\"error\",\"error\":{\"message\":\"secret-key https://provider.invalid\"}}\n\ndata: [DONE]\n\n", "completion_seen=true done_seen=true token_limit=false stream_end=upstream_error last_event=done finish_reason=none", "response"},
		{"token-limit", "data: {\"choices\":[{\"finish_reason\":\"length\"}]}\n\ndata: [DONE]\n\n", "completion_seen=true done_seen=true token_limit=true stream_end=token_limit last_event=done finish_reason=length", "response"},
		{"unknown-reason", "data: {\"choices\":[{\"finish_reason\":\"secret-key\\nAuthorization: private\"}]}\n\n", "stream_end=invalid_finish_reason last_event=chat_chunk finish_reason=other", "response"},
		{"unknown-event", "data: {\"type\":\"secret-key\\nAuthorization: private\"}\n\n", "stream_end=missing_completion last_event=other finish_reason=none", "response"},
		{"bad-json", "data: secret-key\n\n", "sse_data_events=1 invalid_data_events=1 completion_seen=false done_seen=false token_limit=false stream_end=no_valid_sse_data", "response"},
		{"artifact-extraction", "data: {\"choices\":[{\"delta\":{\"content\":\"private-artwork-link\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n", "completion_seen=true done_seen=true token_limit=false stream_end=completed last_event=done finish_reason=stop", "artifact"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			root, _ := setupIQController(t)
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				_, _ = io.Copy(io.Discard, r.Body)
				w.Header().Set("Content-Type", "text/event-stream")
				w.Header().Set("X-Provider-Secret", "secret-header")
				fmt.Fprint(w, tc.body)
			}))
			defer server.Close()
			ch := &model.Channel{Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled, Key: "secret-channel-key", BaseURL: &server.URL, Models: "gpt-4o", Group: "public"}
			require.NoError(t, model.DB.Create(ch).Error)
			require.NoError(t, ch.AddAbilities(nil))
			var logs bytes.Buffer
			common.LogWriterMu.Lock()
			previous := gin.DefaultErrorWriter
			gin.DefaultErrorWriter = &logs
			common.LogWriterMu.Unlock()
			t.Cleanup(func() {
				common.LogWriterMu.Lock()
				gin.DefaultErrorWriter = previous
				common.LogWriterMu.Unlock()
			})
			result := executeIQPair(context.Background(), root.Id, "public", "gpt-4o", "secret-prompt", "")
			require.Equal(t, "invalid_artifact", result.Status)
			require.Equal(t, "invalid_artifact", result.ErrorCode)
			require.Empty(t, result.Artifact)
			require.EqualValues(t, 1, calls.Load(), "diagnostics must not replay or retry")
			common.LogWriterMu.Lock()
			output := logs.String()
			common.LogWriterMu.Unlock()
			require.Equal(t, 1, strings.Count(output, "IQ execution failed:"))
			require.Contains(t, output, "stage="+tc.stage+" http_status=200 error_code=invalid_artifact")
			require.Contains(t, output, fmt.Sprintf("response_bytes=%d ", len(tc.body)))
			require.Contains(t, output, tc.expected)
			for _, secret := range []string{"secret-", "private", "provider.invalid", "Authorization", "<svg>", server.URL} {
				require.NotContains(t, output, secret)
			}
			public, err := json.Marshal(result)
			require.NoError(t, err)
			for _, field := range []string{"response_bytes", "last_event", "channel_id", "finish_reason", "stream_end"} {
				require.NotContains(t, string(public), field, "diagnostics must remain operator-only")
			}
		})
	}
}

func TestIQFailureClassificationIsSanitized(t *testing.T) {
	deadline, cancelDeadline := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancelDeadline()
	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	secret := errors.New("secret-key https://user:password@provider.invalid/private prompt <html>")
	timeout := &url.Error{Op: "Post", URL: "https://secret-key@provider.invalid", Err: &net.DNSError{Err: "secret", IsTimeout: true}}
	for _, tc := range []struct {
		name   string
		ctx    context.Context
		result testResult
		status string
		code   string
	}{
		{"deadline wins", deadline, testResult{localErr: timeout, iqHTTPStatus: 504}, "timeout", "timeout"},
		{"canceled", canceled, testResult{localErr: secret}, "interrupted", "interrupted"},
		{"HTTP error", context.Background(), testResult{localErr: secret, iqHTTPStatus: 429}, "error", "upstream_http_429"},
		{"transport timeout", context.Background(), testResult{localErr: timeout, iqStage: "request"}, "error", "transport_timeout"},
		{"independent deadline", context.Background(), testResult{localErr: fmt.Errorf("secret: %w", context.DeadlineExceeded)}, "error", "transport_timeout"},
		{"transport error", context.Background(), testResult{localErr: secret, iqStage: "request"}, "error", "transport_error"},
		{"read error", context.Background(), testResult{localErr: secret, iqStage: "response"}, "error", "response_read_failed"},
		{"setup error", context.Background(), testResult{localErr: secret, iqStage: "prepare"}, "error", "request_setup_failed"},
		{"incomplete output", context.Background(), testResult{localErr: errors.Join(secret, errIQInvalidOutput)}, "invalid_artifact", "invalid_artifact"},
		{"oversized response", context.Background(), testResult{localErr: errIQResponseTooLarge}, "invalid_artifact", "invalid_artifact"},
		{"truncated body", context.Background(), testResult{localErr: io.ErrUnexpectedEOF}, "invalid_artifact", "invalid_artifact"},
		{"unknown", context.Background(), testResult{localErr: secret}, "error", "execution_failed"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			status, code, message := classifyIQFailure(tc.ctx, tc.result)
			require.Equal(t, tc.status, status)
			require.Equal(t, tc.code, code)
			for _, sensitive := range []string{"secret", "password", "provider.invalid", "<html>"} {
				require.NotContains(t, message, sensitive)
			}
		})
	}
}

func TestIQTransportTimeoutIsNotPairTimeout(t *testing.T) {
	root, _ := setupIQController(t)
	previous := common.RelayResponseHeaderTimeout
	common.RelayResponseHeaderTimeout = 1
	service.InitHttpClient()
	t.Cleanup(func() {
		common.RelayResponseHeaderTimeout = previous
		service.InitHttpClient()
	})
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		_, _ = io.Copy(io.Discard, r.Body)
		<-r.Context().Done()
	}))
	defer server.Close()
	ch := &model.Channel{Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled, Key: "mock", BaseURL: &server.URL, Models: "gpt-4o", Group: "public"}
	require.NoError(t, model.DB.Create(ch).Error)
	require.NoError(t, ch.AddAbilities(nil))
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	result := executeIQPair(ctx, root.Id, "public", "gpt-4o", "mock", "")
	require.NoError(t, ctx.Err(), "the pair's execution budget has not expired")
	require.Equal(t, "error", result.Status)
	require.Equal(t, "transport_timeout", result.ErrorCode)
	require.EqualValues(t, 1, calls.Load())
}

func TestIQFailureLogsContainOnlySafeMetadataAndNeverRetry(t *testing.T) {
	root, _ := setupIQController(t)
	var calls atomic.Int32
	var status atomic.Int32
	status.Store(429)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		_, _ = io.Copy(io.Discard, r.Body)
		w.WriteHeader(int(status.Load()))
		fmt.Fprint(w, `{"error":{"message":"secret-provider-body"}}`)
	}))
	defer server.Close()
	ch := &model.Channel{Type: constant.ChannelTypeOpenAI, Status: common.ChannelStatusEnabled, Key: "secret-channel-key", BaseURL: &server.URL, Models: "gpt-4o", Group: "public"}
	require.NoError(t, model.DB.Create(ch).Error)
	require.NoError(t, ch.AddAbilities(nil))

	var logs bytes.Buffer
	common.LogWriterMu.Lock()
	previous := gin.DefaultErrorWriter
	gin.DefaultErrorWriter = &logs
	common.LogWriterMu.Unlock()
	t.Cleanup(func() {
		common.LogWriterMu.Lock()
		gin.DefaultErrorWriter = previous
		common.LogWriterMu.Unlock()
	})

	for i, httpStatus := range []int{429, 502, 504} {
		status.Store(int32(httpStatus))
		result := executeIQPair(context.Background(), root.Id, "public", "gpt-4o", "secret-prompt", "")
		require.Equal(t, "error", result.Status)
		require.Equal(t, fmt.Sprintf("upstream_http_%d", httpStatus), result.ErrorCode)
		require.Equal(t, fmt.Sprintf("Upstream rejected IQ request (HTTP %d)", httpStatus), result.ErrorMessage)
		require.EqualValues(t, i+1, calls.Load(), "HTTP failures must not retry or fall back")
	}
	// A successful HTTP status containing no eligible final output is distinct
	// from a rejected request and still cannot expose the provider response.
	status.Store(200)
	result := executeIQPair(context.Background(), root.Id, "public", "gpt-4o", "secret-prompt", "")
	require.Equal(t, "invalid_artifact", result.Status)
	require.EqualValues(t, 4, calls.Load())
	server.Close()
	result = executeIQPair(context.Background(), root.Id, "public", "gpt-4o", "secret-prompt", "")
	require.Equal(t, "transport_error", result.ErrorCode)
	result = executeIQPair(context.Background(), -1, "public", "gpt-4o", "secret-prompt", "")
	require.Equal(t, "request_setup_failed", result.ErrorCode)
	require.EqualValues(t, 4, calls.Load())

	common.LogWriterMu.Lock()
	output := logs.String()
	common.LogWriterMu.Unlock()
	require.Contains(t, output, "pair_id="+model.IQPairID("public", "gpt-4o"))
	require.Contains(t, output, fmt.Sprintf("channel_id=%d", ch.Id))
	require.Contains(t, output, "stage=response http_status=429 error_code=upstream_http_429")
	require.Contains(t, output, "stage=request http_status=0 error_code=transport_error")
	require.Contains(t, output, "stage=prepare http_status=0 error_code=request_setup_failed")
	require.Contains(t, output, "duration_ms=")
	for _, sensitive := range []string{"secret-", server.URL, "Authorization", "<html>"} {
		require.NotContains(t, output, sensitive)
	}
	require.Equal(t, 6, strings.Count(output, "IQ execution failed:"))
}
