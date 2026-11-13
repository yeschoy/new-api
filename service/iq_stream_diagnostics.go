package service

// IQResponseDiagnostics contains bounded counters and literal-only classifications
// for operator logs. Raw events, finish reasons, provider errors and output text
// must never be retained here. Private strings prevent callers from injecting
// arbitrary provider values into the classifications exposed by these getters.
type IQResponseDiagnostics struct {
	ResponseBytes int
	// DataEvents counts data: lines handled by the existing IQ parser, not
	// reconstructed multi-line SSE event frames. InvalidDataEvents is a subset.
	DataEvents        int
	InvalidDataEvents int
	CompletionSeen    bool
	DoneSeen          bool
	TokenLimit        bool
	lastEvent         string
	finishReason      string
	endReason         string
}

func (d IQResponseDiagnostics) LastEvent() string {
	if d.lastEvent == "" {
		return "none"
	}
	return d.lastEvent
}

func (d IQResponseDiagnostics) FinishReason() string {
	if d.finishReason == "" {
		return "none"
	}
	return d.finishReason
}

func (d IQResponseDiagnostics) EndReason() string {
	if d.endReason == "" {
		return "not_parsed"
	}
	return d.endReason
}

func (d *IQResponseDiagnostics) recordFinishReason(value string) {
	if value == "" {
		return
	}
	// Each assignment is a fixed literal, never a provider-controlled string.
	switch value {
	case "stop":
		d.finishReason = "stop"
	case "length":
		d.finishReason = "length"
	case "content_filter":
		d.finishReason = "content_filter"
	case "tool_calls":
		d.finishReason = "tool_calls"
	case "function_call":
		d.finishReason = "function_call"
	case "end_turn":
		d.finishReason = "end_turn"
	case "stop_sequence":
		d.finishReason = "stop_sequence"
	case "max_tokens":
		d.finishReason = "max_tokens"
	case "max_output_tokens":
		d.finishReason = "max_output_tokens"
	case "STOP":
		d.finishReason = "STOP"
	case "MAX_TOKENS":
		d.finishReason = "MAX_TOKENS"
	case "SAFETY":
		d.finishReason = "SAFETY"
	case "RECITATION":
		d.finishReason = "RECITATION"
	default:
		d.finishReason = "other"
	}
}

func (d *IQResponseDiagnostics) recordFailure(reason string) {
	// Internal callers pass only fixed classifications. Keep the first failure
	// even if the stream later emits a successful completion or [DONE].
	if d.endReason == "" {
		d.endReason = reason
	}
}
