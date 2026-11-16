package model

import (
	"context"
	"errors"
	"math/big"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/types"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

// Fixed, content-free read errors. The driver error is dropped on purpose: its
// text can carry SQL, bound parameters or row content.
var (
	ErrPartnerTenantUsageLogFilter = errors.New("partner tenant usage log read rejected: invalid filter")
	ErrPartnerTenantUsageLogRead   = errors.New("partner tenant usage log read failed: database error")
)

// PartnerTenantUsageFilter is the single typed filter of the administrator
// read side of partner_tenant_usage_logs. List, count and statistics all go
// through apply, so they always select the same rows. Zero means "no filter"
// for every field except the window, which is always applied.
type PartnerTenantUsageFilter struct {
	TenantId  int64
	UserId    int64
	Username  string
	ModelName string
	RequestId string
	// LogTypeUnknown selects consume and error rows; otherwise LogTypeConsume
	// or LogTypeError.
	Type int
	// Effective inclusive window in Unix seconds.
	StartTimestamp int64
	EndTimestamp   int64
}

func (f PartnerTenantUsageFilter) valid() bool {
	if f.TenantId < 0 || f.UserId < 0 || f.StartTimestamp < 0 || f.EndTimestamp < f.StartTimestamp {
		return false
	}
	return f.Type == LogTypeUnknown || f.Type == LogTypeConsume || f.Type == LogTypeError
}

// apply is the only place that turns the filter into predicates. Every value
// is a bound parameter and no identifier is built from input.
func (f PartnerTenantUsageFilter) apply(tx *gorm.DB) *gorm.DB {
	if f.Type == LogTypeUnknown {
		tx = tx.Where("type IN ?", []int{LogTypeConsume, LogTypeError})
	} else {
		tx = tx.Where("type = ?", f.Type)
	}
	tx = tx.Where("created_at >= ? AND created_at <= ?", f.StartTimestamp, f.EndTimestamp)
	if f.TenantId != 0 {
		tx = tx.Where("tenant_id = ?", f.TenantId)
	}
	if f.UserId != 0 {
		tx = tx.Where("user_id = ?", f.UserId)
	}
	if f.Username != "" {
		tx = tx.Where("username = ?", f.Username)
	}
	if f.ModelName != "" {
		tx = tx.Where("model_name = ?", f.ModelName)
	}
	if f.RequestId != "" {
		tx = tx.Where("request_id = ?", f.RequestId)
	}
	return tx
}

// partnerTenantUsageReadSession reads only the dedicated table. SQL logging is
// silenced even in DEBUG so interpolated statements never reach the log.
func partnerTenantUsageReadSession(ctx context.Context) *gorm.DB {
	return LOG_DB.WithContext(ctx).
		Session(&gorm.Session{Logger: gormlogger.Default.LogMode(gormlogger.Silent)}).
		Model(&PartnerTenantUsageLog{})
}

// partnerTenantUsageListOrder is newest first with a deterministic tie-break.
// ClickHouse has no auto increment (id is always 0): event_id breaks ties.
func partnerTenantUsageListOrder(clickHouse bool) string {
	if clickHouse {
		return "created_at DESC, event_id DESC"
	}
	return "created_at DESC, id DESC"
}

// partnerTenantUsageStatOrder makes the rows of one request adjacent.
func partnerTenantUsageStatOrder(clickHouse bool) string {
	if clickHouse {
		return "request_id ASC, created_at ASC, event_id ASC"
	}
	return "request_id ASC, created_at ASC, id ASC"
}

// PartnerTenantUsageLogRecord is one stored usage event with its role-shaped
// other and the channel name looked up from the main database.
type PartnerTenantUsageLogRecord struct {
	PartnerTenantUsageLog
	ChannelName string
}

// ListPartnerTenantUsageLogs returns one page of the dedicated table (newest
// first) and the number of rows matching the same filter. It never reads logs.
// Other is already projected for the caller's role: root keeps root-only
// diagnostics, any other caller gets the administrator projection.
func ListPartnerTenantUsageLogs(ctx context.Context, filter PartnerTenantUsageFilter, offset int, limit int, root bool) ([]PartnerTenantUsageLogRecord, int64, error) {
	if !filter.valid() || offset < 0 || limit < 1 {
		return nil, 0, ErrPartnerTenantUsageLogFilter
	}
	if LOG_DB == nil {
		return nil, 0, ErrPartnerTenantUsageLogRead
	}
	var total int64
	if err := filter.apply(partnerTenantUsageReadSession(ctx)).Count(&total).Error; err != nil {
		return nil, 0, ErrPartnerTenantUsageLogRead
	}
	order := partnerTenantUsageListOrder(common.UsingLogDatabase(common.DatabaseTypeClickHouse))
	var rows []PartnerTenantUsageLog
	if err := filter.apply(partnerTenantUsageReadSession(ctx)).Order(order).Limit(limit).Offset(offset).Find(&rows).Error; err != nil {
		return nil, 0, ErrPartnerTenantUsageLogRead
	}
	visibility := logOtherVisibilityAdmin
	if root {
		visibility = logOtherVisibilityRoot
	}
	records := make([]PartnerTenantUsageLogRecord, len(rows))
	channelIds := types.NewSet[int]()
	for i := range rows {
		rows[i].Other = formatLogOtherJSON(rows[i].Other, visibility)
		records[i].PartnerTenantUsageLog = rows[i]
		if rows[i].ChannelId > 0 {
			channelIds.Add(int(rows[i].ChannelId))
		}
	}
	if channelIds.Len() == 0 {
		return records, total, nil
	}
	// Same enrichment as GetAllLogs: cache or one bulk main-database query.
	// There is no SQL join between the log database and the main database.
	channelNames := make(map[int64]string, channelIds.Len())
	if common.MemoryCacheEnabled {
		for _, channelId := range channelIds.Items() {
			if channel, err := CacheGetChannel(channelId); err == nil {
				channelNames[int64(channelId)] = channel.Name
			}
		}
	} else {
		var channels []struct {
			Id   int64  `gorm:"column:id"`
			Name string `gorm:"column:name"`
		}
		if err := DB.WithContext(ctx).Table("channels").Select("id, name").Where("id IN ?", channelIds.Items()).Find(&channels).Error; err != nil {
			return nil, 0, ErrPartnerTenantUsageLogRead
		}
		for _, channel := range channels {
			channelNames[channel.Id] = channel.Name
		}
	}
	for i := range records {
		records[i].ChannelName = channelNames[records[i].ChannelId]
	}
	return records, total, nil
}

// PartnerTenantUsageStat aggregates the rows one filter selects. Sums are
// arbitrary precision: they never pass through float64 or a narrower integer.
type PartnerTenantUsageStat struct {
	// Matching rows (consume and error), not requests.
	RecordCount int64
	// Request outcomes after folding; RequestCount = SucceededCount + FailedCount.
	RequestCount   int64
	SucceededCount int64
	FailedCount    int64
	// Sums over consume rows only. Every charged fact counts, including a
	// charged failure and every charged retry attempt.
	Quota            *big.Int
	PromptTokens     *big.Int
	CompletionTokens *big.Int
}

// partnerTenantUsageOutcomeLog converts a row to the shape compareRequestOutcomes
// ranks. The stored id is kept as is; it is never replaced by a display id.
func partnerTenantUsageOutcomeLog(row *PartnerTenantUsageLog) *Log {
	return &Log{
		Id:               int(row.Id),
		CreatedAt:        row.CreatedAt,
		Type:             row.Type,
		IsStream:         row.IsStream,
		Other:            row.Other,
		Quota:            int(row.Quota),
		PromptTokens:     int(row.PromptTokens),
		CompletionTokens: int(row.CompletionTokens),
	}
}

// partnerTenantUsageOutcomeFailed applies the failure classification of the
// user log summary to one chosen outcome. Being chosen is not being successful.
func partnerTenantUsageOutcomeFailed(row *PartnerTenantUsageLog) bool {
	var other struct {
		ViolationFee       bool   `json:"violation_fee"`
		ViolationFeeCode   string `json:"violation_fee_code"`
		ViolationFeeMarker string `json:"violation_fee_marker"`
		StreamStatus       struct {
			Status string `json:"status"`
		} `json:"stream_status"`
	}
	// Like the summary, a malformed other keeps whatever was decoded.
	_ = common.UnmarshalJsonStr(row.Other, &other)
	violation := logViolationFeeMarked(other.ViolationFee, other.ViolationFeeCode, other.ViolationFeeMarker)
	return logOutcomeFailed(row.Type, row.IsStream, violation, other.StreamStatus.Status)
}

// GetPartnerTenantUsageStat streams the rows the filter selects exactly once,
// ordered so that the rows of one request are adjacent, and keeps only the
// current request outcome in memory. Folding never looks at a row the filter
// excluded. It never reads logs and stops when ctx is cancelled.
func GetPartnerTenantUsageStat(ctx context.Context, filter PartnerTenantUsageFilter) (*PartnerTenantUsageStat, error) {
	if !filter.valid() {
		return nil, ErrPartnerTenantUsageLogFilter
	}
	if LOG_DB == nil {
		return nil, ErrPartnerTenantUsageLogRead
	}
	order := partnerTenantUsageStatOrder(common.UsingLogDatabase(common.DatabaseTypeClickHouse))
	rows, err := filter.apply(partnerTenantUsageReadSession(ctx)).
		Select("id", "event_id", "request_id", "created_at", "type", "quota", "prompt_tokens", "completion_tokens", "is_stream", "other").
		Order(order).Rows()
	if err != nil {
		return nil, ErrPartnerTenantUsageLogRead
	}
	defer rows.Close()

	stat := &PartnerTenantUsageStat{Quota: new(big.Int), PromptTokens: new(big.Int), CompletionTokens: new(big.Int)}
	var term big.Int
	// The outcome currently chosen for the request being folded.
	var chosen *PartnerTenantUsageLog
	var chosenLog *Log
	var chosenFailed bool
	for rows.Next() {
		var row PartnerTenantUsageLog
		if err := LOG_DB.ScanRows(rows, &row); err != nil {
			return nil, ErrPartnerTenantUsageLogRead
		}
		stat.RecordCount++
		if row.Type == LogTypeConsume {
			stat.Quota.Add(stat.Quota, term.SetInt64(row.Quota))
			stat.PromptTokens.Add(stat.PromptTokens, term.SetInt64(row.PromptTokens))
			stat.CompletionTokens.Add(stat.CompletionTokens, term.SetInt64(row.CompletionTokens))
		}
		// An empty request_id never folds: each such row is its own request.
		sameRequest := row.RequestId != "" && chosen != nil && row.RequestId == chosen.RequestId
		rowLog := partnerTenantUsageOutcomeLog(&row)
		if sameRequest {
			rank := compareRequestOutcomes(rowLog, chosenLog)
			// Identical facts (possible on ClickHouse, where id is always 0):
			// the greater event_id wins, deterministically.
			if rank < 0 || (rank == 0 && row.EventId <= chosen.EventId) {
				continue
			}
			stat.RequestCount--
			if chosenFailed {
				stat.FailedCount--
			} else {
				stat.SucceededCount--
			}
		}
		chosen, chosenLog = &row, rowLog
		chosenFailed = partnerTenantUsageOutcomeFailed(&row)
		stat.RequestCount++
		if chosenFailed {
			stat.FailedCount++
		} else {
			stat.SucceededCount++
		}
	}
	if err := rows.Err(); err != nil {
		return nil, ErrPartnerTenantUsageLogRead
	}
	if err := ctx.Err(); err != nil {
		return nil, ErrPartnerTenantUsageLogRead
	}
	return stat, nil
}
