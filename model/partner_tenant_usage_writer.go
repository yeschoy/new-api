package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/gin-gonic/gin"
)

// Usage routing for the three model-call writers (RecordConsumeLog,
// RecordErrorLog and the consume/error branch of RecordTaskBillingLog).
//
// The destination is decided only by the safe owner of the user ID passed to
// the writer:
//
//   - confirmed non-member: the original createLog path, unchanged;
//   - member: exactly one row in partner_tenant_usage_logs, never logs, never
//     both, no fallback;
//   - owner lookup failure: nothing is written to either table.
//
// Logging stays best effort and outside any billing transaction: a failure
// here never changes settled quota, and the dashboard feed (LogQuotaData) is
// fed by the callers exactly as before, independent of the destination.
//
// For the member and lookup-failure branches the diagnostics are bounded
// correlation lines only: no params, content, other, raw database error or SQL.

const partnerTenantUsageLogWriteFailedText = "partner tenant usage log write failed"

// partnerTenantUsageSubscriptionId returns the subscription actually settled
// for this event, as recorded by the settlement path in other.public. Anything
// else (absent, non-positive, foreign type) is unknown and stays 0; it is never
// looked up afterwards.
func partnerTenantUsageSubscriptionId(other *LogOther) int64 {
	if other == nil || other.public == nil {
		return 0
	}
	switch value := other.public["subscription_id"].(type) {
	case int:
		if value > 0 {
			return int64(value)
		}
	case int64:
		if value > 0 {
			return value
		}
	}
	return 0
}

// newPartnerTenantUsageLogRow copies the usage facts of an already built Log
// and adds the frozen owner snapshot. Nothing is re-read or re-derived.
func newPartnerTenantUsageLogRow(log *Log, owner PartnerTenantOwner, other *LogOther) *PartnerTenantUsageLog {
	return &PartnerTenantUsageLog{
		CreatedAt:         log.CreatedAt,
		Type:              log.Type,
		TenantId:          owner.TenantId,
		AccountId:         owner.AccountId,
		TenantName:        owner.TenantName,
		IdentitySource:    owner.IdentitySource,
		UserId:            int64(log.UserId),
		Username:          log.Username,
		ModelName:         log.ModelName,
		Quota:             int64(log.Quota),
		PromptTokens:      int64(log.PromptTokens),
		CompletionTokens:  int64(log.CompletionTokens),
		UseTime:           int64(log.UseTime),
		IsStream:          log.IsStream,
		ChannelId:         int64(log.ChannelId),
		TokenId:           int64(log.TokenId),
		TokenName:         log.TokenName,
		Group:             log.Group,
		Ip:                log.Ip,
		RequestId:         log.RequestId,
		UpstreamRequestId: log.UpstreamRequestId,
		SubscriptionId:    partnerTenantUsageSubscriptionId(other),
		Content:           log.Content,
		Other:             log.Other,
	}
}

// partnerTenantUsageLogFailureText maps an insert failure to fixed text. The
// insert function already returns only fixed sentinels; anything else is
// collapsed rather than printed.
func partnerTenantUsageLogFailureText(err error) string {
	for _, known := range []error{ErrPartnerTenantUsageLogInvalid, ErrPartnerTenantUsageLogUnavailable, ErrPartnerTenantUsageLogWrite} {
		if errors.Is(err, known) {
			return known.Error()
		}
	}
	return partnerTenantUsageLogWriteFailedText
}

// logPartnerTenantUsageRecord replaces the original "record consume/error log"
// lines (which print full params or content) for members and for events whose
// owner could not be resolved. Only correlation identifiers are printed.
func logPartnerTenantUsageRecord(c *gin.Context, kind string, userID int, owner PartnerTenantOwner, member bool, requestID string, quota int) {
	if member {
		logger.LogInfo(c, common.LogText("record partner tenant usage %s log: user_id=%d, tenant_id=%d, request_id=%s, quota=%d", kind, userID, owner.TenantId, requestID, quota))
		return
	}
	logger.LogInfo(c, common.LogText("record usage %s log with unresolved owner: user_id=%d, request_id=%s, quota=%d", kind, userID, requestID, quota))
}

// warnPartnerTenantUsageOwnerLookup reports a skipped event. The lookup error
// renders only its fixed sentinel text, which is printed via the sentinel.
func warnPartnerTenantUsageOwnerLookup(c *gin.Context, userID int, requestID string) {
	message := common.LogText("usage log skipped: %s (user_id=%d, request_id=%s)", ErrPartnerTenantOwnerLookup.Error(), userID, requestID)
	if c == nil {
		common.SysError(message)
		return
	}
	logger.LogWarn(c, message)
}

// writePartnerTenantUsageLog stores one member event in the dedicated table.
// A failure is reported with fixed text and is never retried into logs.
func writePartnerTenantUsageLog(c *gin.Context, log *Log, owner PartnerTenantOwner, other *LogOther) {
	row := newPartnerTenantUsageLogRow(log, owner, other)
	err := insertPartnerTenantUsageLog(row)
	if err == nil {
		return
	}
	message := common.LogText("usage log not recorded: %s (user_id=%d, tenant_id=%d, request_id=%s)", partnerTenantUsageLogFailureText(err), log.UserId, owner.TenantId, row.RequestId)
	if c == nil {
		common.SysError(message)
		return
	}
	logger.LogWarn(c, message)
}
