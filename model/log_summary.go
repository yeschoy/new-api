package model

import (
	"context"
	"math"
	"sort"
	"time"

	"github.com/QuantumNous/new-api/common"
)

type LogSummaryTotals struct {
	Requests           int64   `json:"requests"`
	Succeeded          int64   `json:"succeeded"`
	Failed             int64   `json:"failed"`
	Quota              int64   `json:"quota"` // Wallet spending only.
	SubscriptionQuota  int64   `json:"subscription_quota"`
	Tokens             int64   `json:"tokens"`
	SavedQuota         float64 `json:"saved_quota"`
	ComparableRequests int64   `json:"comparable_requests"`
}

type DailyLogSummary struct {
	Date string `json:"date"`
	LogSummaryTotals
}

type UserLogSummary struct {
	LogSummaryTotals
	Daily []DailyLogSummary `json:"daily"`
}

// logViolationFeeMarked reports whether a log's other carries any violation-fee
// marker. Shared by every reader that classifies request outcomes.
func logViolationFeeMarked(fee bool, code string, marker string) bool {
	return fee || code != "" || marker != ""
}

// logOutcomeFailed is the single failure classification of a settled request
// fact: an error row, a violation fee, or a stream that ended in error. A
// charged consume row can therefore still be a failed outcome.
func logOutcomeFailed(logType int, isStream bool, violation bool, streamStatus string) bool {
	return logType == LogTypeError || violation || (isStream && streamStatus == "error")
}

// GetUserLogSummary scans the complete bounded window without transferring raw
// logs to the client or relying on database-specific JSON/date functions.
func GetUserLogSummary(ctx context.Context, userID int, start, end int64, timezoneOffset int) (*UserLogSummary, error) {
	// Rows of this authenticated user may also live in the dedicated Tenant
	// usage table. Without any, the single-table query below runs unchanged.
	dedicated, err := dedicatedLogOwnerHasRows(ctx, ownedLogUserColumn, userID)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return nil, ctxErr
		}
		common.SysError("failed to probe dedicated user log summary")
		return nil, common.NewMessage("Failed to query logs")
	}
	if dedicated {
		summary, err := foldUserLogSummary(timezoneOffset, func(yield func(*ownedLogRow)) error {
			return streamOwnedLogSummaryRows(ctx, userID, start, end, yield)
		})
		if err != nil {
			if ctxErr := ctx.Err(); ctxErr != nil {
				return nil, ctxErr
			}
			common.SysError("failed to summarize user logs across log tables")
			return nil, common.NewMessage("Failed to query logs")
		}
		return summary, nil
	}
	return foldUserLogSummary(timezoneOffset, func(yield func(*ownedLogRow)) error {
		query := LOG_DB.WithContext(ctx).Model(&Log{}).
			Select("id", "request_id", "created_at", "type", "quota", "prompt_tokens", "completion_tokens", "is_stream", "other").
			Where("user_id = ? AND created_at >= ? AND created_at <= ? AND type IN ?", userID, start, end, []int{LogTypeConsume, LogTypeError}).
			Order("request_id ASC, created_at ASC, id ASC")
		rows, err := query.Rows()
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			// Single-table rows carry no source marker or event identity.
			var row ownedLogRow
			if err := LOG_DB.ScanRows(rows, &row.Log); err != nil {
				return err
			}
			yield(&row)
		}
		return rows.Err()
	})
}

// foldUserLogSummary is the one accumulation loop of the usage summary. source
// yields rows ordered by request_id, created_at, id (then source marker and
// event identity), so the rows of one request are adjacent. Each row is its
// own allocation and is retained as the current request outcome.
func foldUserLogSummary(timezoneOffset int, source func(yield func(*ownedLogRow)) error) (*UserLogSummary, error) {
	result := &UserLogSummary{Daily: []DailyLogSummary{}}
	days := make(map[string]*DailyLogSummary)
	location := time.FixedZone("report", timezoneOffset*60)
	// Keep only the current request outcome; ordered rows make retries adjacent.
	var previousRow *ownedLogRow
	var previousDay *DailyLogSummary
	var previousFailed bool
	err := source(func(row *ownedLogRow) {
		log := &row.Log
		var other struct {
			GroupRatio           *float64 `json:"group_ratio"`
			UserGroupRatio       *float64 `json:"user_group_ratio"`
			FeeQuota             *float64 `json:"fee_quota"`
			WalletQuotaDeducted  *int64   `json:"wallet_quota_deducted"`
			SubscriptionConsumed *int64   `json:"subscription_consumed"`
			BillingSource        string   `json:"billing_source"`
			ViolationFee         bool     `json:"violation_fee"`
			ViolationFeeCode     string   `json:"violation_fee_code"`
			ViolationFeeMarker   string   `json:"violation_fee_marker"`
			StreamStatus         struct {
				Status string `json:"status"`
			} `json:"stream_status"`
		}
		validOther := common.UnmarshalJsonStr(log.Other, &other) == nil
		violation := logViolationFeeMarked(other.ViolationFee, other.ViolationFeeCode, other.ViolationFeeMarker)
		failed := logOutcomeFailed(log.Type, log.IsStream, violation, other.StreamStatus.Status)
		var saved float64
		comparable := false
		if validOther && log.Type == LogTypeConsume && other.BillingSource != "subscription" &&
			!other.ViolationFee && other.ViolationFeeCode == "" && other.ViolationFeeMarker == "" {
			ratio := other.GroupRatio
			if other.UserGroupRatio != nil && *other.UserGroupRatio > 0 {
				ratio = other.UserGroupRatio
			}
			charged := float64(log.Quota)
			if other.FeeQuota != nil && *other.FeeQuota >= 0 {
				charged = *other.FeeQuota
			}
			if ratio != nil && *ratio > 0 && charged > 0 {
				candidate := charged / *ratio - charged
				if !math.IsNaN(candidate) && !math.IsInf(candidate, 0) {
					comparable = true
					saved = math.Max(candidate, 0)
				}
			}
		}
		date := time.Unix(log.CreatedAt, 0).In(location).Format("2006-01-02")
		day := days[date]
		if day == nil {
			day = &DailyLogSummary{Date: date}
			days[date] = day
		}
		sameRequest := log.RequestId != "" && previousRow != nil && log.RequestId == previousRow.RequestId
		// compareRequestOutcomes decides; the private source marker and event
		// identity only order rows it reports as completely equal, and are
		// always equal between two single-table rows.
		replaceOutcome := !sameRequest || compareOwnedRequestOutcomes(row, previousRow) > 0
		if sameRequest && replaceOutcome {
			for _, totals := range []*LogSummaryTotals{&result.LogSummaryTotals, &previousDay.LogSummaryTotals} {
				totals.Requests--
				if previousFailed {
					totals.Failed--
				} else {
					totals.Succeeded--
				}
			}
		}
		if replaceOutcome {
			for _, totals := range []*LogSummaryTotals{&result.LogSummaryTotals, &day.LogSummaryTotals} {
				totals.Requests++
				if failed {
					totals.Failed++
				} else {
					totals.Succeeded++
				}
			}
			previousRow, previousDay = row, day
			previousFailed = failed
		}
		for _, totals := range []*LogSummaryTotals{&result.LogSummaryTotals, &day.LogSummaryTotals} {
			if log.Type == LogTypeConsume {
				walletQuota := int64(log.Quota)
				if other.BillingSource == "subscription" {
					walletQuota = 0
					subscriptionQuota := int64(log.Quota)
					if other.SubscriptionConsumed != nil && *other.SubscriptionConsumed >= 0 {
						subscriptionQuota = *other.SubscriptionConsumed
					}
					totals.SubscriptionQuota += subscriptionQuota
				}
				if other.WalletQuotaDeducted != nil && *other.WalletQuotaDeducted >= 0 {
					walletQuota = *other.WalletQuotaDeducted
				}
				totals.Quota += walletQuota
				totals.Tokens += int64(log.PromptTokens) + int64(log.CompletionTokens)
			}
			totals.SavedQuota += saved
			if comparable {
				totals.ComparableRequests++
			}
		}
	})
	if err != nil {
		return nil, err
	}
	for _, day := range days {
		result.Daily = append(result.Daily, *day)
	}
	sort.Slice(result.Daily, func(i, j int) bool { return result.Daily[i].Date > result.Daily[j].Date })
	return result, nil
}
