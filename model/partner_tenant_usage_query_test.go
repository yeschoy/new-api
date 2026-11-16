package model

import (
	"context"
	"fmt"
	"math"
	"math/big"
	"sort"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// Fixed window used by the read-side fixtures.
const (
	partnerTenantUsageQueryStart = int64(1794500000)
	partnerTenantUsageQueryEnd   = int64(1794503600)
)

var partnerTenantUsageQuerySeq int

// Task-owned PostgreSQL schema holding both logs and the dedicated table, so a
// reader that touched the wrong table would be caught.
func setupPartnerTenantUsageQueryPQ(t *testing.T, prefix string) *gorm.DB {
	t.Helper()
	db := setupPartnerTenantUsagePQ(t, prefix)
	usePartnerTenantUsageLogDB(t, db)
	require.NoError(t, db.AutoMigrate(&Log{}))
	require.NoError(t, MigratePartnerTenantUsageLogs())
	oldCache := common.MemoryCacheEnabled
	common.MemoryCacheEnabled = false
	t.Cleanup(func() { common.MemoryCacheEnabled = oldCache })
	return db
}

// Rows are inserted by the test directly: the production insert function fills
// an empty request_id, and the writer is not enabled anyway.
func seedPartnerTenantUsageQueryRow(t *testing.T, db *gorm.DB, row PartnerTenantUsageLog) PartnerTenantUsageLog {
	t.Helper()
	partnerTenantUsageQuerySeq++
	row.Id = 0
	row.EventId = fmt.Sprintf("ptu_query_%06d", partnerTenantUsageQuerySeq)
	if row.AccountId == 0 {
		row.AccountId = row.TenantId*10 + 1
	}
	if row.CreatedAt == 0 {
		row.CreatedAt = partnerTenantUsageQueryStart + 100
	}
	if row.Type == 0 {
		row.Type = LogTypeConsume
	}
	require.NoError(t, db.Create(&row).Error)
	return row
}

func partnerTenantUsageQueryWindow(filter PartnerTenantUsageFilter) PartnerTenantUsageFilter {
	if filter.StartTimestamp == 0 && filter.EndTimestamp == 0 {
		filter.StartTimestamp, filter.EndTimestamp = partnerTenantUsageQueryStart, partnerTenantUsageQueryEnd
	}
	return filter
}

// Reads every page of a filter and proves total, page boundaries and the
// statistics describe the same rows.
func partnerTenantUsageQueryAllPages(t *testing.T, filter PartnerTenantUsageFilter, pageSize int) []string {
	t.Helper()
	filter = partnerTenantUsageQueryWindow(filter)
	seen := map[string]bool{}
	var events []string
	var total int64
	for offset := 0; ; offset += pageSize {
		records, pageTotal, err := ListPartnerTenantUsageLogs(context.Background(), filter, offset, pageSize, true)
		require.NoError(t, err)
		if offset == 0 {
			total = pageTotal
		}
		require.Equal(t, total, pageTotal, "the total is stable across pages")
		for i, record := range records {
			require.False(t, seen[record.EventId], "no row appears on two pages: %s", record.EventId)
			seen[record.EventId] = true
			events = append(events, record.EventId)
			if i > 0 {
				previous := records[i-1]
				require.True(t, previous.CreatedAt > record.CreatedAt || (previous.CreatedAt == record.CreatedAt && previous.Id > record.Id), "newest first by created_at then id")
			}
		}
		if len(records) < pageSize {
			break
		}
		require.LessOrEqual(t, offset, 10000, "paging must terminate")
	}
	require.EqualValues(t, len(events), total, "total equals the rows returned across all pages")
	stat, err := GetPartnerTenantUsageStat(context.Background(), filter)
	require.NoError(t, err)
	require.Equal(t, total, stat.RecordCount, "list and statistics select the same rows")
	require.Equal(t, stat.RequestCount, stat.SucceededCount+stat.FailedCount)
	sort.Strings(events)
	return events
}

func TestPartnerTenantUsageQueryRejectsInvalidFilter(t *testing.T) {
	oldLog := LOG_DB
	LOG_DB = nil
	t.Cleanup(func() { LOG_DB = oldLog })
	valid := PartnerTenantUsageFilter{StartTimestamp: 10, EndTimestamp: 20}
	for name, filter := range map[string]PartnerTenantUsageFilter{
		"negative tenant":  {TenantId: -1, StartTimestamp: 10, EndTimestamp: 20},
		"negative user":    {UserId: -1, StartTimestamp: 10, EndTimestamp: 20},
		"negative start":   {StartTimestamp: -1, EndTimestamp: 20},
		"end before start": {StartTimestamp: 21, EndTimestamp: 20},
		"unsupported type": {Type: LogTypeTopup, StartTimestamp: 10, EndTimestamp: 20},
	} {
		_, _, err := ListPartnerTenantUsageLogs(context.Background(), filter, 0, 10, false)
		require.ErrorIs(t, err, ErrPartnerTenantUsageLogFilter, name)
		_, err = GetPartnerTenantUsageStat(context.Background(), filter)
		require.ErrorIs(t, err, ErrPartnerTenantUsageLogFilter, name)
	}
	_, _, err := ListPartnerTenantUsageLogs(context.Background(), valid, -1, 10, false)
	require.ErrorIs(t, err, ErrPartnerTenantUsageLogFilter)
	_, _, err = ListPartnerTenantUsageLogs(context.Background(), valid, 0, 0, false)
	require.ErrorIs(t, err, ErrPartnerTenantUsageLogFilter)
	// A valid filter without a log database is a fixed read error, never a panic.
	_, _, err = ListPartnerTenantUsageLogs(context.Background(), valid, 0, 10, false)
	require.ErrorIs(t, err, ErrPartnerTenantUsageLogRead)
	_, err = GetPartnerTenantUsageStat(context.Background(), valid)
	require.ErrorIs(t, err, ErrPartnerTenantUsageLogRead)
}

// Pure contract: the dedicated reader uses the same failure classification as
// the user log summary, and ranks outcomes on the stored facts.
func TestPartnerTenantUsageQueryOutcomeClassification(t *testing.T) {
	cases := []struct {
		name   string
		row    PartnerTenantUsageLog
		failed bool
	}{
		{"plain consume", PartnerTenantUsageLog{Type: LogTypeConsume, Other: `{"billing_source":"subscription"}`}, false},
		{"consume without other", PartnerTenantUsageLog{Type: LogTypeConsume}, false},
		{"error row", PartnerTenantUsageLog{Type: LogTypeError}, true},
		{"violation flag", PartnerTenantUsageLog{Type: LogTypeConsume, Other: `{"violation_fee":true}`}, true},
		{"violation code", PartnerTenantUsageLog{Type: LogTypeConsume, Other: `{"violation_fee_code":"x"}`}, true},
		{"violation marker", PartnerTenantUsageLog{Type: LogTypeConsume, Other: `{"violation_fee_marker":"m"}`}, true},
		{"stream ended in error", PartnerTenantUsageLog{Type: LogTypeConsume, IsStream: true, Other: `{"stream_status":{"status":"error"}}`}, true},
		{"stream status on a non-stream row", PartnerTenantUsageLog{Type: LogTypeConsume, Other: `{"stream_status":{"status":"error"}}`}, false},
		{"stream ok", PartnerTenantUsageLog{Type: LogTypeConsume, IsStream: true, Other: `{"stream_status":{"status":"ok"}}`}, false},
		{"malformed other", PartnerTenantUsageLog{Type: LogTypeConsume, IsStream: true, Other: `not json`}, false},
	}
	for _, tc := range cases {
		require.Equal(t, tc.failed, partnerTenantUsageOutcomeFailed(&tc.row), tc.name)
	}
	require.True(t, logViolationFeeMarked(false, "", "m"))
	require.False(t, logViolationFeeMarked(false, "", ""))
	require.True(t, logOutcomeFailed(LogTypeConsume, true, false, "error"))
	require.False(t, logOutcomeFailed(LogTypeConsume, false, false, "error"))

	// The stored id is ranked as is, never replaced by a display id.
	consume := PartnerTenantUsageLog{Id: 5, CreatedAt: 100, Type: LogTypeConsume, Quota: math.MaxInt64}
	failure := PartnerTenantUsageLog{Id: 9, CreatedAt: 200, Type: LogTypeError}
	require.Positive(t, compareRequestOutcomes(partnerTenantUsageOutcomeLog(&consume), partnerTenantUsageOutcomeLog(&failure)), "consume outranks a later error")
	converted := partnerTenantUsageOutcomeLog(&consume)
	require.Equal(t, 5, converted.Id)
	require.EqualValues(t, math.MaxInt64, converted.Quota, "a 64-bit quota is not truncated")
}

func TestPartnerTenantUsageQueryFiltersAndPaging(t *testing.T) {
	db := setupPartnerTenantUsageQueryPQ(t, "pt_usage_query_filter_")
	type seeded struct {
		PartnerTenantUsageLog
		inWindow bool
	}
	var rows []seeded
	add := func(row PartnerTenantUsageLog) {
		stored := seedPartnerTenantUsageQueryRow(t, db, row)
		rows = append(rows, seeded{stored, stored.CreatedAt >= partnerTenantUsageQueryStart && stored.CreatedAt <= partnerTenantUsageQueryEnd})
	}
	sameSecond := partnerTenantUsageQueryStart + 500
	// Seven rows of one merchant share one created_at: page boundaries must be
	// decided by the id tie-break.
	for i := range 7 {
		row := PartnerTenantUsageLog{TenantId: 11, UserId: 101, Username: "member-a", ModelName: "model-a", CreatedAt: sameSecond, RequestId: fmt.Sprintf("req-a-%d", i), Quota: int64(10 + i)}
		if i%3 == 0 {
			row.Type, row.Quota = LogTypeError, 0
		}
		if i%2 == 0 {
			row.UserId, row.Username, row.ModelName = 102, "member-b", "model-b"
		}
		add(row)
	}
	add(PartnerTenantUsageLog{TenantId: 12, UserId: 201, Username: "member-a", ModelName: "model-a", CreatedAt: sameSecond, RequestId: "req-other-1", Quota: 1000})
	add(PartnerTenantUsageLog{TenantId: 12, UserId: 201, Username: "other", ModelName: "model-b", CreatedAt: sameSecond + 1, RequestId: "req-other-2", Type: LogTypeError})
	add(PartnerTenantUsageLog{TenantId: 11, UserId: 101, Username: "member-a", ModelName: "model-a", CreatedAt: partnerTenantUsageQueryStart, RequestId: "req-edge-start", Quota: 3})
	add(PartnerTenantUsageLog{TenantId: 11, UserId: 101, Username: "member-a", ModelName: "model-a", CreatedAt: partnerTenantUsageQueryEnd, RequestId: "req-edge-end", Quota: 4})
	add(PartnerTenantUsageLog{TenantId: 11, UserId: 101, Username: "member-a", ModelName: "model-a", CreatedAt: partnerTenantUsageQueryStart - 1, RequestId: "req-before", Quota: 5})
	add(PartnerTenantUsageLog{TenantId: 11, UserId: 101, Username: "member-a", ModelName: "model-a", CreatedAt: partnerTenantUsageQueryEnd + 1, RequestId: "req-after", Quota: 6})
	// The default table holds an old merchant row and an ordinary row with the
	// same identifiers; neither may ever be returned.
	require.NoError(t, db.Create(&Log{UserId: 101, Username: "member-a", ModelName: "model-a", CreatedAt: sameSecond, Type: LogTypeConsume, Quota: 77, RequestId: "req-a-1"}).Error)
	require.NoError(t, db.Create(&Log{UserId: 999, Username: "ordinary", ModelName: "model-a", CreatedAt: sameSecond, Type: LogTypeError, RequestId: "req-default-only"}).Error)

	filters := map[string]PartnerTenantUsageFilter{
		"window only":        {},
		"tenant":             {TenantId: 11},
		"other tenant":       {TenantId: 12},
		"user":               {UserId: 102},
		"username":           {Username: "member-a"},
		"model":              {ModelName: "model-b"},
		"request":            {RequestId: "req-a-1"},
		"consume":            {Type: LogTypeConsume},
		"error":              {Type: LogTypeError},
		"combined":           {TenantId: 11, UserId: 101, Username: "member-a", ModelName: "model-a", Type: LogTypeConsume},
		"combined no match":  {TenantId: 12, UserId: 101},
		"default-only id":    {RequestId: "req-default-only"},
		"unknown tenant":     {TenantId: 4242},
		"narrow window":      {StartTimestamp: sameSecond, EndTimestamp: sameSecond},
		"tenant narrow type": {TenantId: 11, Type: LogTypeError, StartTimestamp: sameSecond, EndTimestamp: sameSecond},
	}
	for name, filter := range filters {
		effective := partnerTenantUsageQueryWindow(filter)
		var want []string
		for _, row := range rows {
			if row.CreatedAt < effective.StartTimestamp || row.CreatedAt > effective.EndTimestamp ||
				(filter.TenantId != 0 && row.TenantId != filter.TenantId) ||
				(filter.UserId != 0 && row.UserId != filter.UserId) ||
				(filter.Username != "" && row.Username != filter.Username) ||
				(filter.ModelName != "" && row.ModelName != filter.ModelName) ||
				(filter.RequestId != "" && row.RequestId != filter.RequestId) ||
				(filter.Type != 0 && row.Type != filter.Type) {
				continue
			}
			want = append(want, row.EventId)
		}
		sort.Strings(want)
		for _, pageSize := range []int{1, 3, 100} {
			got := partnerTenantUsageQueryAllPages(t, filter, pageSize)
			if len(want) == 0 {
				require.Empty(t, got, "%s page size %d", name, pageSize)
				continue
			}
			require.Equal(t, want, got, "%s page size %d", name, pageSize)
		}
	}
	require.Empty(t, partnerTenantUsageQueryAllPages(t, PartnerTenantUsageFilter{RequestId: "req-default-only"}, 10), "rows of logs never appear")

	// Tenant filter never leaks another merchant's row.
	records, _, err := ListPartnerTenantUsageLogs(context.Background(), partnerTenantUsageQueryWindow(PartnerTenantUsageFilter{TenantId: 12}), 0, 100, false)
	require.NoError(t, err)
	require.Len(t, records, 2)
	for _, record := range records {
		require.EqualValues(t, 12, record.TenantId)
	}
}

func TestPartnerTenantUsageQueryStatFolding(t *testing.T) {
	db := setupPartnerTenantUsageQueryPQ(t, "pt_usage_query_fold_")
	at := partnerTenantUsageQueryStart + 1000
	stat := func(filter PartnerTenantUsageFilter) *PartnerTenantUsageStat {
		t.Helper()
		result, err := GetPartnerTenantUsageStat(context.Background(), partnerTenantUsageQueryWindow(filter))
		require.NoError(t, err)
		require.Equal(t, result.RequestCount, result.SucceededCount+result.FailedCount)
		return result
	}
	requireStat := func(result *PartnerTenantUsageStat, records, requests, succeeded, failed, quota, tokens int64) {
		t.Helper()
		require.EqualValues(t, records, result.RecordCount, "records")
		require.EqualValues(t, requests, result.RequestCount, "requests")
		require.EqualValues(t, succeeded, result.SucceededCount, "succeeded")
		require.EqualValues(t, failed, result.FailedCount, "failed")
		require.Equal(t, fmt.Sprint(quota), result.Quota.String(), "quota")
		require.Equal(t, fmt.Sprint(tokens), new(big.Int).Add(result.PromptTokens, result.CompletionTokens).String(), "tokens")
	}

	// 21: a failed attempt and its charged successful retry share a request_id.
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 21, UserId: 1, RequestId: "retry", Type: LogTypeError, CreatedAt: at})
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 21, UserId: 1, RequestId: "retry", Type: LogTypeConsume, CreatedAt: at - 5, Quota: 40, PromptTokens: 3, CompletionTokens: 4})
	requireStat(stat(PartnerTenantUsageFilter{TenantId: 21}), 2, 1, 1, 0, 40, 7)

	// 22: consume is chosen, but the stream ended in error: failed, quota kept.
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 22, UserId: 1, RequestId: "stream", Type: LogTypeConsume, CreatedAt: at, IsStream: true, Quota: 50, PromptTokens: 1, CompletionTokens: 1, Other: `{"stream_status":{"status":"error"}}`})
	requireStat(stat(PartnerTenantUsageFilter{TenantId: 22}), 1, 1, 0, 1, 50, 2)

	// 23: a violation fee recorded as consume plus its error row: one failed
	// request, the fee stays, the error row adds nothing.
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 23, UserId: 1, RequestId: "fee", Type: LogTypeConsume, CreatedAt: at, Quota: 30, Other: `{"violation_fee":true,"violation_fee_code":"policy"}`})
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 23, UserId: 1, RequestId: "fee", Type: LogTypeError, CreatedAt: at + 1, Quota: 999, PromptTokens: 9})
	requireStat(stat(PartnerTenantUsageFilter{TenantId: 23}), 2, 1, 0, 1, 30, 0)

	// 24: error-only request.
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 24, UserId: 1, RequestId: "only-error", Type: LogTypeError, CreatedAt: at})
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 24, UserId: 1, RequestId: "only-error", Type: LogTypeError, CreatedAt: at + 2})
	requireStat(stat(PartnerTenantUsageFilter{TenantId: 24}), 2, 1, 0, 1, 0, 0)

	// 25: rows without a request_id are each their own request.
	for i := range 3 {
		row := PartnerTenantUsageLog{TenantId: 25, UserId: 1, RequestId: "", Type: LogTypeConsume, CreatedAt: at, Quota: 5}
		if i == 2 {
			row.Type, row.Quota = LogTypeError, 0
		}
		stored := seedPartnerTenantUsageQueryRow(t, db, row)
		require.Empty(t, stored.RequestId, "the fixture keeps the request_id empty")
	}
	requireStat(stat(PartnerTenantUsageFilter{TenantId: 25}), 3, 3, 2, 1, 10, 0)

	// 26: every charged retry attempt is summed; type=error folds only among
	// error rows.
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 26, UserId: 1, RequestId: "multi", Type: LogTypeConsume, CreatedAt: at, Quota: 7, PromptTokens: 1})
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 26, UserId: 1, RequestId: "multi", Type: LogTypeConsume, CreatedAt: at + 1, Quota: 8, PromptTokens: 1})
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 26, UserId: 1, RequestId: "multi", Type: LogTypeError, CreatedAt: at + 2})
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 26, UserId: 1, RequestId: "multi", Type: LogTypeError, CreatedAt: at + 3})
	requireStat(stat(PartnerTenantUsageFilter{TenantId: 26}), 4, 1, 1, 0, 15, 2)
	requireStat(stat(PartnerTenantUsageFilter{TenantId: 26, Type: LogTypeError}), 2, 1, 0, 1, 0, 0)
	requireStat(stat(PartnerTenantUsageFilter{TenantId: 26, Type: LogTypeConsume}), 2, 1, 1, 0, 15, 2)

	// 27: the successful consume row is outside the window, so it cannot rescue
	// the selected error row; and a model filter excludes it the same way.
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 27, UserId: 1, RequestId: "window", ModelName: "m-error", Type: LogTypeError, CreatedAt: at})
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 27, UserId: 1, RequestId: "window", ModelName: "m-ok", Type: LogTypeConsume, CreatedAt: partnerTenantUsageQueryEnd + 10, Quota: 60})
	requireStat(stat(PartnerTenantUsageFilter{TenantId: 27}), 1, 1, 0, 1, 0, 0)
	requireStat(stat(PartnerTenantUsageFilter{TenantId: 27, StartTimestamp: partnerTenantUsageQueryStart, EndTimestamp: partnerTenantUsageQueryEnd + 10}), 2, 1, 1, 0, 60, 0)
	requireStat(stat(PartnerTenantUsageFilter{TenantId: 27, ModelName: "m-error", StartTimestamp: partnerTenantUsageQueryStart, EndTimestamp: partnerTenantUsageQueryEnd + 10}), 1, 1, 0, 1, 0, 0)

	// A row of logs with the same request_id never joins the fold.
	require.NoError(t, db.Create(&Log{UserId: 1, CreatedAt: at, Type: LogTypeConsume, Quota: 12345, RequestId: "only-error"}).Error)
	requireStat(stat(PartnerTenantUsageFilter{TenantId: 24}), 2, 1, 0, 1, 0, 0)

	// The whole window: requests are independent across merchants here.
	requireStat(stat(PartnerTenantUsageFilter{}), 15, 9, 4, 5, 145, 11)
}

func TestPartnerTenantUsageQueryExactSums(t *testing.T) {
	db := setupPartnerTenantUsageQueryPQ(t, "pt_usage_query_sum_")
	const beyondFloat = int64(1)<<53 + 1
	for i := range 3 {
		seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 31, UserId: 1, RequestId: fmt.Sprintf("big-%d", i), Type: LogTypeConsume, Quota: math.MaxInt64, PromptTokens: beyondFloat, CompletionTokens: beyondFloat + 2})
	}
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 31, UserId: 1, RequestId: "big-error", Type: LogTypeError, Quota: math.MaxInt64, PromptTokens: math.MaxInt64})
	stat, err := GetPartnerTenantUsageStat(context.Background(), partnerTenantUsageQueryWindow(PartnerTenantUsageFilter{TenantId: 31}))
	require.NoError(t, err)
	require.Equal(t, "27670116110564327421", stat.Quota.String(), "3 x MaxInt64, above the int64 range")
	require.Equal(t, "27021597764222979", stat.PromptTokens.String(), "3 x (2^53+1)")
	require.Equal(t, "27021597764222985", stat.CompletionTokens.String(), "3 x (2^53+3)")
	require.EqualValues(t, 4, stat.RecordCount)
	require.EqualValues(t, 4, stat.RequestCount)
	require.EqualValues(t, 1, stat.FailedCount)

	// A cancelled request stops the scan with the fixed read error.
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = GetPartnerTenantUsageStat(cancelled, partnerTenantUsageQueryWindow(PartnerTenantUsageFilter{TenantId: 31}))
	require.ErrorIs(t, err, ErrPartnerTenantUsageLogRead)
	require.Equal(t, ErrPartnerTenantUsageLogRead.Error(), err.Error(), "no driver text")
}

// Generated-order contract only (no database, no live ClickHouse): the list
// tie-break and the statistics adjacency order for both driver families.
func TestPartnerTenantUsageQueryOrderContract(t *testing.T) {
	require.Equal(t, "created_at DESC, id DESC", partnerTenantUsageListOrder(false))
	require.Equal(t, "created_at DESC, event_id DESC", partnerTenantUsageListOrder(true), "ClickHouse ids are all 0: event_id breaks ties")
	require.Equal(t, "request_id ASC, created_at ASC, id ASC", partnerTenantUsageStatOrder(false))
	require.Equal(t, "request_id ASC, created_at ASC, event_id ASC", partnerTenantUsageStatOrder(true))
}

// channel_name comes from the main database (one bulk query) or the channel
// cache; there is no SQL join, and a failed lookup is the fixed read error.
func TestPartnerTenantUsageQueryChannelName(t *testing.T) {
	db := setupPartnerTenantUsageQueryPQ(t, "pt_usage_query_channel_")
	filter := partnerTenantUsageQueryWindow(PartnerTenantUsageFilter{TenantId: 51})
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 51, UserId: 1, RequestId: "ch-known", ChannelId: 8, CreatedAt: partnerTenantUsageQueryStart + 10})
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 51, UserId: 1, RequestId: "ch-unknown", ChannelId: 9, CreatedAt: partnerTenantUsageQueryStart + 20})
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 51, UserId: 1, RequestId: "ch-none", CreatedAt: partnerTenantUsageQueryStart + 30})

	// The task-owned schema has no channels table yet: the main-database lookup
	// fails and the list answers the fixed read error, never partial rows.
	require.False(t, db.Migrator().HasTable("channels"), "the fixture schema is expected to have no channels table")
	records, total, err := ListPartnerTenantUsageLogs(context.Background(), filter, 0, 10, false)
	require.ErrorIs(t, err, ErrPartnerTenantUsageLogRead)
	require.Equal(t, ErrPartnerTenantUsageLogRead.Error(), err.Error(), "no driver text")
	require.Nil(t, records)
	require.Zero(t, total)
	// The statistics never touch the main database.
	stat, err := GetPartnerTenantUsageStat(context.Background(), filter)
	require.NoError(t, err)
	require.EqualValues(t, 3, stat.RecordCount)

	// A minimal channels table owned by this schema: bulk main-database path.
	require.NoError(t, db.Exec("CREATE TABLE channels (id bigint PRIMARY KEY, name text)").Error)
	require.NoError(t, db.Exec("INSERT INTO channels (id, name) VALUES (?, ?)", 8, "Channel Eight").Error)
	records, total, err = ListPartnerTenantUsageLogs(context.Background(), filter, 0, 10, false)
	require.NoError(t, err)
	require.EqualValues(t, 3, total)
	names := map[string]string{}
	for _, record := range records {
		names[record.RequestId] = record.ChannelName
	}
	require.Equal(t, map[string]string{"ch-known": "Channel Eight", "ch-unknown": "", "ch-none": ""}, names)

	// Cache path: names come from the channel cache only. The main-database row
	// above must not be read, and an uncached channel is an empty name, not an
	// error. (The fixture cleanup restores the switch.)
	common.MemoryCacheEnabled = true
	records, _, err = ListPartnerTenantUsageLogs(context.Background(), filter, 0, 10, false)
	require.NoError(t, err)
	require.Len(t, records, 3)
	for _, record := range records {
		want := ""
		if record.ChannelId > 0 {
			if cached, cacheErr := CacheGetChannel(int(record.ChannelId)); cacheErr == nil {
				want = cached.Name
			}
		}
		require.Equal(t, want, record.ChannelName, record.RequestId)
		require.NotEqual(t, "Channel Eight", record.ChannelName, "the cache path does not query the main database")
	}
}

func TestPartnerTenantUsageQueryRoleProjectionAndDefaultReadersUntouched(t *testing.T) {
	db := setupPartnerTenantUsageQueryPQ(t, "pt_usage_query_role_")
	at := partnerTenantUsageQueryStart + 2000
	// The default table before any dedicated row exists.
	require.NoError(t, db.Create(&Log{UserId: 7, Username: "old-merchant", ModelName: "model-a", CreatedAt: at, Type: LogTypeConsume, Quota: 70, RequestId: "old-1"}).Error)
	require.NoError(t, db.Create(&Log{UserId: 8, Username: "ordinary", ModelName: "model-a", CreatedAt: at, Type: LogTypeConsume, Quota: 80, RequestId: "old-2"}).Error)
	defaultFilter := LogFilter{StartTimestamp: partnerTenantUsageQueryStart, EndTimestamp: partnerTenantUsageQueryEnd}
	beforeLogs, beforeTotal, err := GetAllLogs(defaultFilter, 0, 100)
	require.NoError(t, err)
	beforeStat, err := SumUsedQuota(LogTypeConsume, partnerTenantUsageQueryStart, partnerTenantUsageQueryEnd, "", "", "", 0, "")
	require.NoError(t, err)

	other := `{"billing_source":"subscription","` + logOtherAdminInfoKey + `":{"note":"admin-only"},"` + logOtherRootInfoKey + `":{"note":"root-only"}}`
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 7, Username: "old-merchant", ModelName: "model-a", RequestId: "new-1", CreatedAt: at, Quota: 500, Other: other, Content: "recorded content"})

	admin, total, err := ListPartnerTenantUsageLogs(context.Background(), partnerTenantUsageQueryWindow(PartnerTenantUsageFilter{TenantId: 41}), 0, 10, false)
	require.NoError(t, err)
	require.EqualValues(t, 1, total)
	require.Contains(t, admin[0].Other, "admin-only")
	require.NotContains(t, admin[0].Other, "root-only", "administrators get the administrator projection")
	require.Equal(t, formatLogOtherJSON(other, logOtherVisibilityAdmin), admin[0].Other, "same projection as the default logs")
	root, _, err := ListPartnerTenantUsageLogs(context.Background(), partnerTenantUsageQueryWindow(PartnerTenantUsageFilter{TenantId: 41}), 0, 10, true)
	require.NoError(t, err)
	require.Contains(t, root[0].Other, "root-only")
	require.Equal(t, formatLogOtherJSON(other, logOtherVisibilityRoot), root[0].Other)
	require.Empty(t, root[0].ChannelName)

	// Rows of the dedicated table change nothing for the default readers.
	afterLogs, afterTotal, err := GetAllLogs(defaultFilter, 0, 100)
	require.NoError(t, err)
	require.Equal(t, beforeTotal, afterTotal)
	require.Equal(t, beforeLogs, afterLogs)
	afterStat, err := SumUsedQuota(LogTypeConsume, partnerTenantUsageQueryStart, partnerTenantUsageQueryEnd, "", "", "", 0, "")
	require.NoError(t, err)
	require.Equal(t, beforeStat.Quota, afterStat.Quota)
	require.EqualValues(t, 150, afterStat.Quota, "the old merchant row is still counted by the default statistics")
}
