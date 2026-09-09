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
	Quota              int64   `json:"quota"`
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

// GetUserLogSummary scans the complete bounded window without transferring raw
// logs to the client or relying on database-specific JSON/date functions.
func GetUserLogSummary(ctx context.Context, userID int, start, end int64, timezoneOffset int) (*UserLogSummary, error) {
	query := LOG_DB.WithContext(ctx).Model(&Log{}).
		Select("created_at", "type", "quota", "prompt_tokens", "completion_tokens", "is_stream", "other").
		Where("user_id = ? AND created_at >= ? AND created_at <= ? AND type IN ?", userID, start, end, []int{LogTypeConsume, LogTypeError})
	rows, err := query.Rows()
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := &UserLogSummary{Daily: []DailyLogSummary{}}
	days := make(map[string]*DailyLogSummary)
	location := time.FixedZone("report", timezoneOffset*60)
	for rows.Next() {
		var log Log
		if err := LOG_DB.ScanRows(rows, &log); err != nil {
			return nil, err
		}
		var other struct {
			GroupRatio         *float64 `json:"group_ratio"`
			UserGroupRatio     *float64 `json:"user_group_ratio"`
			FeeQuota           *float64 `json:"fee_quota"`
			BillingSource      string   `json:"billing_source"`
			ViolationFee       bool     `json:"violation_fee"`
			ViolationFeeCode   string   `json:"violation_fee_code"`
			ViolationFeeMarker string   `json:"violation_fee_marker"`
			StreamStatus       struct {
				Status string `json:"status"`
			} `json:"stream_status"`
		}
		validOther := common.UnmarshalJsonStr(log.Other, &other) == nil
		failed := log.Type == LogTypeError || (log.IsStream && other.StreamStatus.Status == "error")
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
		for _, totals := range []*LogSummaryTotals{&result.LogSummaryTotals, &day.LogSummaryTotals} {
			totals.Requests++
			if failed {
				totals.Failed++
			} else {
				totals.Succeeded++
			}
			if log.Type == LogTypeConsume {
				totals.Quota += int64(log.Quota)
				totals.Tokens += int64(log.PromptTokens) + int64(log.CompletionTokens)
			}
			totals.SavedQuota += saved
			if comparable {
				totals.ComparableRequests++
			}
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for _, day := range days {
		result.Daily = append(result.Daily, *day)
	}
	sort.Slice(result.Daily, func(i, j int) bool { return result.Daily[i].Date > result.Daily[j].Date })
	return result, nil
}
