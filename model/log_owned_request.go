package model

import (
	"cmp"
	"context"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// Two-table variants of the own-user request outcome list and usage summary.
// They run only when the dedicated Tenant usage table holds rows of the
// authenticated user; otherwise the single-table code runs unchanged.

// ownedLogSummaryProjection is the minimal projection of the usage summary,
// the same columns the single-table summary selects.
var ownedLogSummaryProjection = []string{
	"id", "request_id", "created_at", "type", "quota", "prompt_tokens",
	"completion_tokens", "is_stream", "other",
}

// ownedLogSummaryOrder makes the rows of one request adjacent under the
// database's own collation, exactly like the single-table summary, then orders
// equal rows by the private source marker and event identity.
const ownedLogSummaryOrder = "logs.request_id ASC, logs.created_at ASC, logs.id ASC, logs.log_source ASC, logs.log_event_id ASC"

// ownedRequestWindowUnion is the union of the authenticated user's consume and
// error rows of one time window. Ownership, type and window are bound
// parameters inside each branch, so nothing of another user reaches the union.
func ownedRequestWindowUnion(ctx context.Context, userId int, startTimestamp int64, endTimestamp int64, projection []string) *gorm.DB {
	databaseType := common.LogDatabaseType()
	groupCol := ownedLogGroupColumn(databaseType)
	branch := func(table string, dedicated bool) *gorm.DB {
		return LOG_DB.Table(table).
			Select(ownedLogBranchColumns(databaseType, groupCol, dedicated, projection)).
			Where("logs.user_id = ?", userId).
			Where("logs.type IN ?", []int{LogTypeConsume, LogTypeError}).
			Where("logs.created_at >= ? AND logs.created_at <= ?", startTimestamp, endTimestamp)
	}
	return ownedLogReadSession(ctx).Table("(? UNION ALL ?) AS logs",
		branch("logs", false), branch(partnerTenantUsageLogTable+" AS logs", true))
}

// compareOwnedRequestOutcomes ranks two rows of one request. The shared
// compareRequestOutcomes decides on the rows' original local facts; only rows
// it reports as completely equal are ordered by the private source marker and
// event identity, which keeps the choice deterministic.
func compareOwnedRequestOutcomes(a, b *ownedLogRow) int {
	if order := compareRequestOutcomes(&a.Log, &b.Log); order != 0 {
		return order
	}
	if order := cmp.Compare(a.LogSource, b.LogSource); order != 0 {
		return order
	}
	return cmp.Compare(a.LogEventId, b.LogEventId)
}

// queryOwnedRequestOutcomes loads the window from both tables in global order
// and keeps one outcome per non-empty request_id. Rows without a request_id
// are never folded, and the local id is never used to identify a row: the two
// tables have independent sequences. The returned logs keep their original
// local ids; display ids are assigned by the caller after paging.
func queryOwnedRequestOutcomes(ctx context.Context, userId int, startTimestamp int64, endTimestamp int64) ([]*Log, error) {
	databaseType := common.LogDatabaseType()
	var rows []ownedLogRow
	if err := ownedRequestWindowUnion(ctx, userId, startTimestamp, endTimestamp, ownedLogProjection).
		Select(ownedLogUnionOuterColumns(ownedLogGroupColumn(databaseType))).
		Order(ownedLogUnionOrder(databaseType)).Find(&rows).Error; err != nil {
		return nil, errOwnedLogRead
	}
	settled := make(map[string]*ownedLogRow)
	for i := range rows {
		row := &rows[i]
		if row.RequestId == "" {
			continue
		}
		if previous := settled[row.RequestId]; previous == nil || compareOwnedRequestOutcomes(row, previous) > 0 {
			settled[row.RequestId] = row
		}
	}
	outcomes := make([]*Log, 0, len(rows))
	for i := range rows {
		row := &rows[i]
		if row.RequestId == "" || settled[row.RequestId] == row {
			outcomes = append(outcomes, &row.Log)
		}
	}
	return outcomes, nil
}

// streamOwnedLogSummaryRows yields the summary projection of both tables in
// ownedLogSummaryOrder, one row at a time. The database sorts the union, so
// the window is never held in memory and no ordering is recomputed in Go.
func streamOwnedLogSummaryRows(ctx context.Context, userId int, startTimestamp int64, endTimestamp int64, yield func(*ownedLogRow)) error {
	rows, err := ownedRequestWindowUnion(ctx, userId, startTimestamp, endTimestamp, ownedLogSummaryProjection).
		Select(ownedLogOuterColumns(ownedLogGroupColumn(common.LogDatabaseType()), ownedLogSummaryProjection)).
		Order(ownedLogSummaryOrder).Rows()
	if err != nil {
		return errOwnedLogRead
	}
	defer rows.Close()
	for rows.Next() {
		var row ownedLogRow
		if err := LOG_DB.ScanRows(rows, &row); err != nil {
			return errOwnedLogRead
		}
		yield(&row)
	}
	if err := rows.Err(); err != nil {
		return errOwnedLogRead
	}
	return nil
}
