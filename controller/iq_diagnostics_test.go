package controller

import (
	"bytes"
	"context"
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
