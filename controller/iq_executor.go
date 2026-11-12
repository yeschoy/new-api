package controller

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/relayconvert/reasoning"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	hosttypes "github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
	"github.com/tidwall/gjson"
	"github.com/tidwall/sjson"
)

var (
	errIQInvalidOutput    = errors.New("invalid IQ output")
	errIQResponseTooLarge = errors.New("IQ response exceeds 2 MiB")
)

// Only known single-HTTP-request adaptors are eligible. SDK/job/image/audio
// adaptors must not silently acquire retry/tool/job semantics through IQ.
func iqEndpoint(channel *model.Channel, name string) string {
	switch channel.Type {
	case constant.ChannelTypeOpenAI, constant.ChannelTypeAzure, constant.ChannelTypeAnthropic, constant.ChannelTypeGemini, constant.ChannelTypeCodex, constant.ChannelTypeNewAPI, constant.ChannelTypeSub2API, constant.ChannelTypeOpenRouter, constant.ChannelTypeDeepSeek, constant.ChannelTypeXai, constant.ChannelTypeAdvancedCustom, constant.ChannelTypeVLLM, constant.ChannelTypeSGLang:
	default:
		return ""
	}
	// Reuse production chained mapping (including cycle detection) before native
	// endpoint selection; a public alias may actually target Responses-only Codex.
	if channel.GetModelMapping() != "" {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		c.Set("model_mapping", channel.GetModelMapping())
		info := &relaycommon.RelayInfo{OriginModelName: name, ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: name}}
		if err := helper.ModelMappedHelper(c, info, nil); err != nil {
			return ""
		}
		name = info.UpstreamModelName
	}
	lower := strings.ToLower(name)
	if common.IsImageGenerationModel(name) || strings.Contains(lower, "embed") || strings.Contains(lower, "rerank") || strings.Contains(lower, "tts") || strings.Contains(lower, "whisper") || strings.Contains(lower, "audio") || strings.Contains(lower, "realtime") {
		return ""
	}
	for _, nonText := range []string{"sora", "veo", "kling", "seedream", "suno", "midjourney", "video", "stable-diffusion"} {
		if strings.Contains(lower, nonText) {
			return ""
		}
	}
	endpoints := common.GetEndpointTypesByChannelType(channel.Type, name)
	if constant.IsAdvancedCustomChannel(channel.Type) {
		if cfg := channel.GetOtherSettings().AdvancedCustom; cfg != nil {
			endpoints = cfg.SupportedEndpointTypesForModel(name)
		}
	}
	if strings.Contains(lower, "codex") {
		if channel.Type == constant.ChannelTypeOpenAI || channel.Type == constant.ChannelTypeAzure {
			return string(constant.EndpointTypeOpenAIResponse)
		}
		for _, e := range endpoints {
			if e == constant.EndpointTypeOpenAIResponse {
				return string(e)
			}
		}
		return ""
	}
	if common.IsOpenAIResponseOnlyModel(name) {
		for _, e := range endpoints {
			if e == constant.EndpointTypeOpenAIResponse {
				return string(e)
			}
		}
		return ""
	}
	for _, e := range endpoints {
		switch e {
		case constant.EndpointTypeOpenAI, constant.EndpointTypeOpenAIResponse, constant.EndpointTypeAnthropic, constant.EndpointTypeGemini:
			return string(e)
		}
	}
	return ""
}
func buildIQRequest(name, endpoint, prompt string, stream bool) dto.Request {
	limit := uint(model.IQOutputTokens)
	switch constant.EndpointType(endpoint) {
	case constant.EndpointTypeOpenAIResponse:
		input, _ := json.Marshal([]dto.Message{{Role: "user", Content: prompt}})
		return &dto.OpenAIResponsesRequest{Model: name, Input: input, Stream: &stream, MaxOutputTokens: &limit}
	case constant.EndpointTypeAnthropic:
		return &dto.ClaudeRequest{Model: name, Stream: &stream, MaxTokens: &limit, Messages: []dto.ClaudeMessage{{Role: "user", Content: prompt}}}
	case constant.EndpointTypeGemini:
		return &dto.GeminiChatRequest{Contents: []dto.GeminiChatContent{{Role: "user", Parts: []dto.GeminiPart{{Text: prompt}}}}, GenerationConfig: dto.GeminiChatGenerationConfig{MaxOutputTokens: &limit}}
	default:
		return &dto.GeneralOpenAIRequest{Model: name, Stream: &stream, MaxTokens: &limit, Messages: []dto.Message{{Role: "user", Content: prompt}}}
	}
}

// Reuse the production reasoning renderers after model mapping. Native Claude
// and Gemini requests consume the portable state; OpenAI also needs its explicit
// request field. Model modifiers keep their normal precedence over these defaults.
func applyIQReasoning(request dto.Request, info *relaycommon.RelayInfo, value string) error {
	effort, err := reasoning.ParseEffort(value)
	if err != nil || effort == "" {
		return err
	}
	intent := reasoning.Intent{Mode: reasoning.ModeEnabled, Effort: effort}
	if effort == reasoning.EffortNone {
		intent.Mode = reasoning.ModeDisabled
	}
	info.ReasoningConversion = reasoning.StateFromIntent(intent)
	info.SetReasoningEffort(string(effort))
	switch request := request.(type) {
	case *dto.GeneralOpenAIRequest:
		request.ReasoningEffort = string(effort)
	case *dto.OpenAIResponsesRequest:
		request.Reasoning = &dto.Reasoning{Effort: string(effort)}
	}
	return nil
}

// Preserve the already-converted reasoning controls for an explicitly configured
// IQ run, without inventing provider-native fields or bypassing model modifiers.
func restoreIQReasoning(body, original []byte) ([]byte, error) {
	for _, key := range []string{"reasoning_effort", "reasoning", "thinking", "output_config.effort", "generationConfig.thinkingConfig"} {
		var err error
		if value := gjson.GetBytes(original, key); value.Exists() {
			body, err = sjson.SetRawBytes(body, key, []byte(value.Raw))
		} else {
			body, err = sjson.DeleteBytes(body, key)
		}
		if err != nil {
			return nil, err
		}
	}
	return body, nil
}

// Keep the converted saved user input intact even when a channel has parameter
// overrides. Adapter-added system instructions remain part of normal routing.
func restoreIQInput(body, original []byte) ([]byte, error) {
	for _, key := range []string{"messages", "input", "contents"} {
		if value := gjson.GetBytes(original, key); value.Exists() {
			var err error
			body, err = sjson.SetRawBytes(body, key, []byte(value.Raw))
			if err != nil {
				return nil, err
			}
		}
	}
	return body, nil
}

func boundIQRequest(body []byte, endpoint string) ([]byte, error) {
	key := "max_tokens"
	// Advanced-custom converters can change the wire protocol. Bound its actual
	// body, not just the originally requested endpoint.
	switch {
	case gjson.GetBytes(body, "contents").Exists():
		key = "generationConfig.maxOutputTokens"
		endpoint = string(constant.EndpointTypeGemini)
	case gjson.GetBytes(body, "input").Exists():
		key = "max_output_tokens"
	case gjson.GetBytes(body, "messages").Exists():
		if gjson.GetBytes(body, "max_completion_tokens").Exists() {
			key = "max_completion_tokens"
		}
	default:
		return nil, errors.New("unsupported IQ wire format")
	}

	// One candidate, no model tools or n-sampling. Channel overrides cannot expand cost.
	for _, k := range []string{"tools", "tool_choice", "parallel_tool_calls", "n", "functions", "function_call", "audio", "modalities", "generationConfig.imageConfig", "generationConfig.speechConfig"} {
		body, _ = sjson.DeleteBytes(body, k)
	}
	if endpoint == string(constant.EndpointTypeGemini) {
		body, _ = sjson.DeleteBytes(body, "generationConfig.candidateCount")
		body, _ = sjson.SetBytes(body, "generationConfig.responseModalities", []string{"TEXT"})
	}
	for _, k := range []string{"max_tokens", "max_completion_tokens", "max_output_tokens", "generationConfig.maxOutputTokens"} {
		if gjson.GetBytes(body, k).Exists() {
			var err error
			body, err = sjson.SetBytes(body, k, model.IQOutputTokens)
			if err != nil {
				return nil, err
			}
		}
	}
	return sjson.SetBytes(body, key, model.IQOutputTokens)
}
func captureIQResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo, userID, channelID int, price hosttypes.PriceData, started time.Time) (result testResult) {
	defer resp.Body.Close()
	defer func() {
		result.iqStage = "response"
		result.iqHTTPStatus = resp.StatusCode
	}()
	// Retain only the numeric status, never provider bodies/headers or error DTOs.
	if resp.StatusCode != http.StatusOK {
		return testResult{localErr: errors.New("upstream rejected IQ request")}
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, model.IQMaxResponseBytes+1))
	if err != nil {
		return testResult{localErr: err}
	}
	if len(body) > model.IQMaxResponseBytes {
		return testResult{localErr: errIQResponseTooLarge}
	}
	stream := strings.Contains(resp.Header.Get("Content-Type"), "text/event-stream") || info.IsStream
	text, textErr := service.IQVisibleText(body, stream)
	if textErr != nil {
		textErr = errors.Join(errIQInvalidOutput, textErr)
	}
	// Existing test funding records usage without pre-consuming/debiting quota.
	usage := iqResponseUsage(body, stream)
	quota, tiered := settleTestQuota(info, price, usage)
	model.RecordConsumeLog(c, userID, model.RecordConsumeLogParams{ChannelId: channelID, PromptTokens: usage.PromptTokens, CompletionTokens: usage.CompletionTokens, ModelName: info.OriginModelName, TokenName: "IQ test", Quota: quota, Content: []*common.Message{common.NewMessage("IQ test")}, UseTimeSeconds: int(time.Since(started).Seconds()), IsStream: stream, Group: info.UsingGroup, Other: buildTestLogOther(c, info, price, usage, tiered)})
	return testResult{context: c, text: text, localErr: textErr}
}
func iqResponseUsage(body []byte, stream bool) *dto.Usage {
	var input, output int64
	consume := func(v gjson.Result) {
		for _, path := range []string{"usage.prompt_tokens", "usage.input_tokens", "usageMetadata.promptTokenCount", "response.usage.input_tokens", "message.usage.input_tokens"} {
			if n := v.Get(path).Int(); n > input {
				input = n
			}
		}
		for _, path := range []string{"usage.completion_tokens", "usage.output_tokens", "usageMetadata.candidatesTokenCount", "response.usage.output_tokens"} {
			if n := v.Get(path).Int(); n > output {
				output = n
			}
		}
	}
	if !stream {
		consume(gjson.ParseBytes(body))
	} else {
		for _, line := range strings.Split(string(body), "\n") {
			if strings.HasPrefix(strings.TrimSpace(line), "data:") {
				consume(gjson.Parse(strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "data:"))))
			}
		}
	}
	return &dto.Usage{PromptTokens: int(input), CompletionTokens: int(output), TotalTokens: int(input + output)}
}

// Public diagnostics come only from this allowlist. In particular, url.Error
// and provider errors may contain credentials, request URLs or generated text.
func classifyIQFailure(ctx context.Context, result testResult) (status, code, message string) {
	var timeout net.Error
	switch {
	case errors.Is(ctx.Err(), context.DeadlineExceeded):
		return "timeout", "timeout", fmt.Sprintf("IQ request exceeded the %d-minute limit", int(iqPairTimeout/time.Minute))
	case ctx.Err() != nil:
		return "interrupted", "interrupted", "Execution interrupted; not retried"
	case result.iqHTTPStatus >= 100 && result.iqHTTPStatus <= 599 && result.iqHTTPStatus != http.StatusOK:
		return "error", fmt.Sprintf("upstream_http_%d", result.iqHTTPStatus), fmt.Sprintf("Upstream rejected IQ request (HTTP %d)", result.iqHTTPStatus)
	case errors.Is(result.localErr, errIQInvalidOutput), errors.Is(result.localErr, errIQResponseTooLarge), errors.Is(result.localErr, io.ErrUnexpectedEOF):
		return "invalid_artifact", "invalid_artifact", "Model output was incomplete or exceeded the size limit"
	case errors.Is(result.localErr, context.DeadlineExceeded), errors.As(result.localErr, &timeout) && timeout.Timeout():
		return "error", "transport_timeout", "The upstream connection timed out"
	case result.iqStage == "request":
		return "error", "transport_error", "The upstream request failed before a response was received"
	case result.iqStage == "response":
		return "error", "response_read_failed", "Unable to read the upstream response"
	case result.iqStage == "prepare":
		return "error", "request_setup_failed", "Unable to prepare the IQ request"
	default:
		return "error", "execution_failed", "IQ request failed"
	}
}

func logIQFailure(r model.IQResult, channelID, httpStatus int, stage string, started time.Time) {
	// Hash the pair instead of logging administrator-controlled group/model text.
	// Channel IDs stay in operator logs, not in the viewer-facing result metadata.
	common.SysError(fmt.Sprintf("IQ execution failed: pair_id=%s channel_id=%d stage=%s http_status=%d error_code=%s duration_ms=%d",
		model.IQPairID(r.Group, r.Model), channelID, stage, httpStatus, r.ErrorCode, time.Since(started).Milliseconds()))
}

type iqPairExecutor func(context.Context, int, string, string, string, string) model.IQResult

func executeIQPair(ctx context.Context, userID int, group, name, prompt, reasoningEffort string) model.IQResult {
	r := model.IQResult{Group: group, Model: name, Status: "unavailable", ErrorCode: "unavailable", ErrorMessage: "No compatible enabled route is available"}
	if ctx.Err() != nil {
		r.Status = "interrupted"
		r.ErrorCode = "interrupted"
		r.ErrorMessage = "Execution interrupted; not retried"
		return r
	}
	if !ratio_setting.ContainsGroupRatio(group) {
		return r
	}
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequestWithContext(ctx, http.MethodPost, "/v1/chat/completions", nil)
	common.SetContextKey(c, constant.ContextKeyUsingGroup, group)
	// No enumeration, priority fallback, retry controller or channel-health updates.
	channel, _, err := service.CacheGetRandomSatisfiedChannel(&service.RetryParam{Ctx: c, TokenGroup: group, ModelName: name, Retry: lo.ToPtr(0)})
	if err != nil || channel == nil || channel.Status != common.ChannelStatusEnabled {
		return r
	}
	endpoint := iqEndpoint(channel, name)
	if endpoint == "" {
		return r
	}
	started := time.Now()
	result := testChannelWithIQ(ctx, channel, userID, name, endpoint, channel.Type == constant.ChannelTypeCodex, &iqChannelTestOptions{group: group, prompt: prompt, reasoningEffort: reasoningEffort})
	if result.localErr != nil {
		r.Status, r.ErrorCode, r.ErrorMessage = classifyIQFailure(ctx, result)
		logIQFailure(r, channel.Id, result.iqHTTPStatus, result.iqStage, started)
		return r
	}
	kind, artifact, err := service.ExtractIQArtifact(result.text)
	if err != nil {
		r.Status = "invalid_artifact"
		r.ErrorCode = "invalid_artifact"
		r.ErrorMessage = "Model did not return a complete bounded HTML or SVG artifact"
		logIQFailure(r, channel.Id, result.iqHTTPStatus, "artifact", started)
		return r
	}
	r.Status = "success"
	r.ArtifactKind = kind
	r.Artifact = model.IQText(artifact)
	r.ErrorCode = ""
	r.ErrorMessage = ""
	return r
}
