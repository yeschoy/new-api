package model

import (
	"bytes"
	"context"
	dbsql "database/sql"
	"errors"
	"fmt"
	"log"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

// A task-owned PostgreSQL schema whose log database has logs but NOT the
// dedicated table: the state of a node that has not been migrated yet.
func setupPartnerTenantUsageLegacyOnlyPQ(t *testing.T, prefix string) *gorm.DB {
	t.Helper()
	db := setupPartnerTenantUsagePQ(t, prefix)
	usePartnerTenantUsageLogDB(t, db)
	common.SetLogDatabaseType(common.DatabaseTypePostgreSQL)
	initCol()
	require.NoError(t, db.AutoMigrate(&Log{}))
	return db
}

func partnerTenantUsageRequestModels(logs []*Log) []string {
	models := make([]string, len(logs))
	for i, log := range logs {
		models[i] = log.ModelName
	}
	return models
}

// Every self reader on a log database without the dedicated table is the
// legacy reader; absence is not remembered and a positive answer is bound to
// the handle it was observed on.
func TestPartnerTenantUsageProbeAbsentTableKeepsLegacyReaders(t *testing.T) {
	db := setupPartnerTenantUsageLegacyOnlyPQ(t, "pt_usage_probe_absent_")
	at := partnerTenantUsageQueryStart + 100
	seedLegacy := func(target *gorm.DB) {
		require.NoError(t, target.Create(&Log{UserId: 9, Username: "ordinary", TokenId: 91, ModelName: "l-error", Type: LogTypeError, CreatedAt: at + 1, RequestId: "r-1"}).Error)
		require.NoError(t, target.Create(&Log{UserId: 9, Username: "ordinary", TokenId: 91, ModelName: "l-consume", Type: LogTypeConsume, Quota: 40, PromptTokens: 3, CompletionTokens: 2, CreatedAt: at + 2, RequestId: "r-1", Other: `{"billing_source":"wallet"}`}).Error)
		require.NoError(t, target.Create(&Log{UserId: 9, Username: "ordinary", TokenId: 91, ModelName: "l-plain", Type: LogTypeConsume, Quota: 2, CreatedAt: at + 3, Other: `{"billing_source":"wallet"}`}).Error)
	}
	seedLegacy(db)
	filter := LogFilter{StartTimestamp: partnerTenantUsageQueryStart, EndTimestamp: partnerTenantUsageQueryEnd}

	requireLegacy := func(t *testing.T, listTotal int64) {
		logs, total, err := GetUserLogs(9, filter, 0, 10)
		require.NoError(t, err)
		require.Equal(t, listTotal, total)
		require.Len(t, logs, int(listTotal))
		streamed := 0
		require.NoError(t, StreamUserLogs(context.Background(), 9, filter, func(*Log) error {
			streamed++
			return nil
		}))
		require.EqualValues(t, listTotal, streamed)
		recent, err := GetLogByTokenId(91)
		require.NoError(t, err)
		require.Len(t, recent, int(listTotal))
		legacyStat, err := SumUsedQuota(LogTypeConsume, filter.StartTimestamp, filter.EndTimestamp, "", "ordinary", "", 0, "")
		require.NoError(t, err)
		stat, err := SumUserUsedQuota(9, "ordinary", LogTypeConsume, filter.StartTimestamp, filter.EndTimestamp, "", "", 0, "")
		require.NoError(t, err)
		require.Equal(t, legacyStat.Quota, stat.Quota)
	}
	requireLegacy(t, 3)
	outcomes, total, err := GetUserRequestLogs(context.Background(), 9, filter.StartTimestamp, filter.EndTimestamp, 0, 10)
	require.NoError(t, err)
	require.EqualValues(t, 2, total)
	require.Equal(t, []string{"l-plain", "l-consume"}, partnerTenantUsageRequestModels(outcomes), "legacy id desc, retry folded")
	summary, err := GetUserLogSummary(context.Background(), 9, filter.StartTimestamp, filter.EndTimestamp, 0)
	require.NoError(t, err)
	require.Equal(t, LogSummaryTotals{Requests: 2, Succeeded: 2, Quota: 42, Tokens: 5}, summary.LogSummaryTotals)
	require.NotSame(t, db, dedicatedLogTableKnown.Load(), "an absent table is never remembered as present")

	// The master node creates the table a moment later on the same handle.
	require.NoError(t, MigratePartnerTenantUsageLogs())
	requireLegacy(t, 3)
	require.Same(t, db, dedicatedLogTableKnown.Load(), "a successful probe remembers this handle")
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 9, TokenId: 91, Username: "ordinary", ModelName: "d-consume", Quota: 5, CreatedAt: at + 4, RequestId: "r-2", Other: `{"billing_source":"subscription"}`})
	logs, total, err := GetUserLogs(9, filter, 0, 10)
	require.NoError(t, err)
	require.EqualValues(t, 4, total, "absence was not cached: the new row is picked up")
	require.Equal(t, "d-consume", logs[0].ModelName)
	outcomes, total, err = GetUserRequestLogs(context.Background(), 9, filter.StartTimestamp, filter.EndTimestamp, 0, 10)
	require.NoError(t, err)
	require.EqualValues(t, 3, total)
	require.Equal(t, []string{"d-consume", "l-plain", "l-consume"}, partnerTenantUsageRequestModels(outcomes))
	summary, err = GetUserLogSummary(context.Background(), 9, filter.StartTimestamp, filter.EndTimestamp, 0)
	require.NoError(t, err)
	require.Equal(t, LogSummaryTotals{Requests: 3, Succeeded: 3, Quota: 42, SubscriptionQuota: 5, Tokens: 5}, summary.LogSummaryTotals)

	// Another handle without the table does not inherit the positive answer.
	other := setupPartnerTenantUsageLegacyOnlyPQ(t, "pt_usage_probe_swapped_")
	require.NotSame(t, db, other)
	seedLegacy(other)
	requireLegacy(t, 3)
	outcomes, total, err = GetUserRequestLogs(context.Background(), 9, filter.StartTimestamp, filter.EndTimestamp, 0, 10)
	require.NoError(t, err)
	require.EqualValues(t, 2, total)
	require.Equal(t, []string{"l-plain", "l-consume"}, partnerTenantUsageRequestModels(outcomes))
	summary, err = GetUserLogSummary(context.Background(), 9, filter.StartTimestamp, filter.EndTimestamp, 0)
	require.NoError(t, err)
	require.Equal(t, LogSummaryTotals{Requests: 2, Succeeded: 2, Quota: 42, Tokens: 5}, summary.LogSummaryTotals)
	require.NotSame(t, other, dedicatedLogTableKnown.Load())
}

// A table that exists but cannot be probed, and a presence check that cannot
// run, are read failures: never an empty result and never "absent".
func TestPartnerTenantUsageProbeFailuresAreReadFailures(t *testing.T) {
	db := setupPartnerTenantUsageLegacyOnlyPQ(t, "pt_usage_probe_broken_")
	require.NoError(t, db.Create(&Log{UserId: 7, Username: "member", TokenId: 71, Type: LogTypeConsume, Quota: 70, CreatedAt: partnerTenantUsageQueryStart + 1, RequestId: "old-1"}).Error)
	start, end := partnerTenantUsageQueryStart, partnerTenantUsageQueryEnd

	// Presence check forced to fail (cancelled context) on a handle where the
	// table is not known: an error, not "absent".
	cancelled, cancel := context.WithCancel(context.Background())
	cancel()
	present, err := dedicatedLogTablePresent(cancelled, db)
	require.Error(t, err)
	require.False(t, present)
	hasRows, err := dedicatedLogOwnerHasRows(cancelled, ownedLogUserColumn, 7)
	require.Error(t, err, "a failed presence check is not a successful no-rows answer")
	require.False(t, hasRows)
	_, _, err = GetUserRequestLogs(cancelled, 7, start, end, 0, 10)
	require.Error(t, err)
	_, err = GetUserLogSummary(cancelled, 7, start, end, 0)
	require.Error(t, err)
	require.Error(t, StreamUserLogs(cancelled, 7, LogFilter{}, func(*Log) error { return nil }))
	// The failure left nothing behind: with a live context the table is absent.
	logs, total, err := GetUserLogs(7, LogFilter{}, 0, 10)
	require.NoError(t, err)
	require.EqualValues(t, 1, total)
	require.Len(t, logs, 1)

	// Table present but unusable for the probe (owned schema, no owner columns).
	require.NoError(t, db.Exec("CREATE TABLE "+partnerTenantUsageLogTable+" (id bigint)").Error)
	requireSafe := func(t *testing.T, err error) {
		require.Error(t, err, "a failed probe is never an empty result")
		for _, leaked := range []string{partnerTenantUsageLogTable, "SELECT", "relation", "column", "SQLSTATE", "old-1"} {
			require.NotContains(t, err.Error(), leaked)
		}
	}
	logs, total, err = GetUserLogs(7, LogFilter{}, 0, 10)
	requireSafe(t, err)
	require.Nil(t, logs)
	require.Zero(t, total)
	recent, err := GetLogByTokenId(71)
	requireSafe(t, err)
	require.Nil(t, recent)
	delivered := 0
	requireSafe(t, StreamUserLogs(context.Background(), 7, LogFilter{}, func(*Log) error {
		delivered++
		return nil
	}))
	require.Zero(t, delivered)
	stat, err := SumUserUsedQuota(7, "member", LogTypeConsume, 0, 0, "", "", 0, "")
	requireSafe(t, err)
	require.Equal(t, Stat{}, stat, "no partial sum presented as complete")
	outcomes, total, err := GetUserRequestLogs(context.Background(), 7, start, end, 0, 10)
	requireSafe(t, err)
	require.Nil(t, outcomes)
	require.Zero(t, total)
	summary, err := GetUserLogSummary(context.Background(), 7, start, end, 0)
	requireSafe(t, err)
	require.Nil(t, summary)
}

// The probe and both catalog lookups are forced to fail on a handle where the
// table is not known, while every legacy statement keeps working. Each self
// reader, including the ones that take no caller context, must fail: a
// presence check that cannot run is never "absent" and never an empty result.
func TestPartnerTenantUsagePresenceCheckFailureFailsEveryReader(t *testing.T) {
	db := setupPartnerTenantUsageLegacyOnlyPQ(t, "pt_usage_probe_catalog_")
	require.NoError(t, db.Create(&Log{UserId: 7, Username: "member", TokenId: 71, Type: LogTypeConsume, Quota: 70, CreatedAt: partnerTenantUsageQueryStart + 1, RequestId: "old-1"}).Error)
	start, end := partnerTenantUsageQueryStart, partnerTenantUsageQueryEnd
	failing, forced := false, 0
	// GORM runs Find/First through the Query chain but Scan (the probe) and
	// Raw(...).Scan (the migrator's catalog lookups) through the Row chain, so
	// the failure is injected on both; registering it on Query alone never fires
	// and silently exercises the table-absent path instead.
	failPresence := func(tx *gorm.DB) {
		if !failing {
			return
		}
		if tx.Statement.Table == partnerTenantUsageLogTable || strings.Contains(tx.Statement.SQL.String(), "information_schema.tables") {
			forced++
			_ = tx.AddError(errors.New("forced catalog failure old-1"))
		}
	}
	require.NoError(t, db.Callback().Query().Before("gorm:query").Register("pt_usage_request:fail_presence", failPresence))
	require.NoError(t, db.Callback().Row().Before("gorm:row").Register("pt_usage_request:fail_presence_row", failPresence))
	requireSafe := func(t *testing.T, err error) {
		require.Error(t, err, "a failed presence check is never an empty result")
		for _, leaked := range []string{"forced", "catalog", "old-1", partnerTenantUsageLogTable} {
			require.NotContains(t, err.Error(), leaked)
		}
	}

	failing = true
	logs, total, err := GetUserLogs(7, LogFilter{}, 0, 10)
	requireSafe(t, err)
	require.Nil(t, logs)
	require.Zero(t, total)
	recent, err := GetLogByTokenId(71)
	requireSafe(t, err)
	require.Nil(t, recent)
	stat, err := SumUserUsedQuota(7, "member", LogTypeConsume, 0, 0, "", "", 0, "")
	requireSafe(t, err)
	require.Equal(t, Stat{}, stat, "the legacy part alone is not presented as the statistic")
	delivered := 0
	requireSafe(t, StreamUserLogs(context.Background(), 7, LogFilter{}, func(*Log) error {
		delivered++
		return nil
	}))
	require.Zero(t, delivered)
	outcomes, total, err := GetUserRequestLogs(context.Background(), 7, start, end, 0, 10)
	requireSafe(t, err)
	require.Nil(t, outcomes)
	require.Zero(t, total)
	summary, err := GetUserLogSummary(context.Background(), 7, start, end, 0)
	requireSafe(t, err)
	require.Nil(t, summary)
	// Per reader: the probe, the dedicated-table lookup and the control lookup.
	require.Equal(t, 6*3, forced, "every failure came from the probe and the presence check")
	require.NotSame(t, db, dedicatedLogTableKnown.Load(), "a failed check remembers nothing")

	// Nothing was remembered: with a working catalog the table is simply absent.
	failing = false
	logs, total, err = GetUserLogs(7, LogFilter{}, 0, 10)
	require.NoError(t, err)
	require.EqualValues(t, 1, total)
	require.Len(t, logs, 1)
	legacyStat, err := SumUsedQuota(LogTypeConsume, 0, 0, "", "member", "", 0, "")
	require.NoError(t, err)
	stat, err = SumUserUsedQuota(7, "member", LogTypeConsume, 0, 0, "", "", 0, "")
	require.NoError(t, err)
	require.Equal(t, legacyStat, stat)
}

// One member (user 7) with request facts spread over both tables, and another
// user (8) reusing the same request ids in both tables.
func seedPartnerTenantUsageRequestScenario(t *testing.T, db *gorm.DB) int64 {
	t.Helper()
	at := partnerTenantUsageQueryStart + 100
	wallet, subscription := `{"billing_source":"wallet"}`, `{"billing_source":"subscription"}`
	legacy := func(log Log) {
		log.UserId, log.Username = 7, "member"
		require.NoError(t, db.Create(&log).Error)
	}
	dedicated := func(row PartnerTenantUsageLog) {
		row.TenantId, row.UserId, row.Username = 41, 7, "member"
		seedPartnerTenantUsageQueryRow(t, db, row)
	}
	// Failed attempt in logs, successful retry in the dedicated table.
	legacy(Log{Type: LogTypeError, CreatedAt: at + 1, RequestId: "retry-1", ModelName: "retry-1-l-error"})
	dedicated(PartnerTenantUsageLog{Type: LogTypeConsume, CreatedAt: at + 2, RequestId: "retry-1", ModelName: "retry-1-d-consume", Quota: 100, PromptTokens: 10, CompletionTokens: 5, Other: `{"billing_source":"subscription","subscription_consumed":100}`})
	// The other way round.
	dedicated(PartnerTenantUsageLog{Type: LogTypeError, CreatedAt: at + 3, RequestId: "retry-2", ModelName: "retry-2-d-error"})
	legacy(Log{Type: LogTypeConsume, CreatedAt: at + 4, RequestId: "retry-2", ModelName: "retry-2-l-consume", Quota: 40, PromptTokens: 4, CompletionTokens: 1, Other: wallet})
	// Charged consume whose stream ended in error.
	dedicated(PartnerTenantUsageLog{Type: LogTypeConsume, CreatedAt: at + 5, RequestId: "stream-fail", ModelName: "stream-fail-d", IsStream: true, Quota: 30, PromptTokens: 3, Other: `{"billing_source":"subscription","stream_status":{"status":"error"}}`})
	// Violation fee recorded as consume next to its error.
	legacy(Log{Type: LogTypeError, CreatedAt: at + 6, RequestId: "violation", ModelName: "violation-l-error"})
	dedicated(PartnerTenantUsageLog{Type: LogTypeConsume, CreatedAt: at + 7, RequestId: "violation", ModelName: "violation-d-consume", Quota: 5, Other: `{"billing_source":"wallet","violation_fee":true}`})
	dedicated(PartnerTenantUsageLog{Type: LogTypeError, CreatedAt: at + 8, RequestId: "err-only", ModelName: "err-only-d"})
	// Rows without a request id are separate events in either table.
	legacy(Log{Type: LogTypeConsume, CreatedAt: at + 9, ModelName: "empty-l-consume", Quota: 1, Other: wallet})
	legacy(Log{Type: LogTypeError, CreatedAt: at + 10, ModelName: "empty-l-error"})
	dedicated(PartnerTenantUsageLog{Type: LogTypeConsume, CreatedAt: at + 11, ModelName: "empty-d-consume", Quota: 2, Other: subscription})
	dedicated(PartnerTenantUsageLog{Type: LogTypeError, CreatedAt: at + 12, ModelName: "empty-d-error"})
	// Completely equal facts (including the local id) under one request id.
	legacy(Log{Id: 900001, Type: LogTypeConsume, CreatedAt: at + 13, RequestId: "twin", ModelName: "twin-legacy", Quota: 7, Other: wallet})
	require.NoError(t, db.Create(&PartnerTenantUsageLog{Id: 900001, EventId: "ptu_request_twin", TenantId: 41, AccountId: 411, UserId: 7, Username: "member", Type: LogTypeConsume, CreatedAt: at + 13, RequestId: "twin", ModelName: "twin-dedicated", Quota: 7, Other: wallet}).Error)
	// The same local id in both tables for two different requests.
	legacy(Log{Id: 900002, Type: LogTypeConsume, CreatedAt: at + 14, RequestId: "same-id-l", ModelName: "same-id-l", Quota: 3, Other: wallet})
	require.NoError(t, db.Create(&PartnerTenantUsageLog{Id: 900002, EventId: "ptu_request_same_id", TenantId: 41, AccountId: 411, UserId: 7, Username: "member", Type: LogTypeConsume, CreatedAt: at + 14, RequestId: "same-id-d", ModelName: "same-id-d", Quota: 3, Other: wallet}).Error)
	// Another user's rows with the same request ids, in both tables.
	require.NoError(t, db.Create(&Log{UserId: 8, Username: "member", Type: LogTypeConsume, CreatedAt: at + 20, RequestId: "err-only", ModelName: "foreign-l", Quota: 1000, PromptTokens: 1000, Other: wallet}).Error)
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 8, Username: "member", CreatedAt: at + 21, RequestId: "err-only", ModelName: "foreign-d", Quota: 2000, PromptTokens: 2000, Other: subscription})
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 8, Username: "member", CreatedAt: at + 22, RequestId: "stream-fail", ModelName: "foreign-d-2", Quota: 3000, Other: subscription})
	return at
}

var partnerTenantUsageRequestExpectedModels = []string{
	"same-id-l", "same-id-d", "twin-dedicated", "empty-d-error", "empty-d-consume",
	"empty-l-error", "empty-l-consume", "err-only-d", "violation-d-consume",
	"stream-fail-d", "retry-2-l-consume", "retry-1-d-consume",
}

func TestPartnerTenantUsageRequestOutcomesAcrossTables(t *testing.T) {
	db := setupPartnerTenantUsageUnionPQ(t, "pt_usage_request_outcomes_")
	seedPartnerTenantUsageRequestScenario(t, db)
	start, end := partnerTenantUsageQueryStart, partnerTenantUsageQueryEnd

	all, total, err := GetUserRequestLogs(context.Background(), 7, start, end, 0, 50)
	require.NoError(t, err)
	require.EqualValues(t, 12, total)
	require.Equal(t, partnerTenantUsageRequestExpectedModels, partnerTenantUsageRequestModels(all),
		"global time order; one outcome per request id; empty ids and equal local ids all kept; equal facts resolved to the dedicated row")
	for i, log := range all {
		require.Equal(t, i+1, log.Id, "display ids are assigned after folding")
		require.Equal(t, 7, log.UserId)
		require.Empty(t, log.ChannelName)
	}
	types := map[string]int{}
	for _, log := range all {
		types[log.ModelName] = log.Type
	}
	require.Equal(t, LogTypeConsume, types["retry-1-d-consume"])
	require.Equal(t, LogTypeConsume, types["retry-2-l-consume"])
	require.Equal(t, LogTypeConsume, types["violation-d-consume"], "the charged fact wins over its error")
	require.Equal(t, LogTypeError, types["err-only-d"], "another user's consume with this request id does not settle it")

	// Deterministic across repeated calls.
	for i := 0; i < 3; i++ {
		again, againTotal, err := GetUserRequestLogs(context.Background(), 7, start, end, 0, 50)
		require.NoError(t, err)
		require.Equal(t, total, againTotal)
		require.Equal(t, all, again)
	}
	// Paging and total over both sources.
	for _, size := range []int{1, 3, 5, 12, 50} {
		var paged []string
		for offset := 0; ; offset += size {
			page, pageTotal, err := GetUserRequestLogs(context.Background(), 7, start, end, offset, size)
			require.NoError(t, err)
			require.EqualValues(t, 12, pageTotal)
			if len(page) == 0 {
				break
			}
			for i, log := range page {
				require.Equal(t, offset+i+1, log.Id)
			}
			paged = append(paged, partnerTenantUsageRequestModels(page)...)
		}
		require.Equal(t, partnerTenantUsageRequestExpectedModels, paged, fmt.Sprintf("page size %d", size))
	}
	// The other user only ever sees their own two requests.
	foreign, foreignTotal, err := GetUserRequestLogs(context.Background(), 8, start, end, 0, 50)
	require.NoError(t, err)
	require.EqualValues(t, 2, foreignTotal)
	require.Equal(t, []string{"foreign-d-2", "foreign-d"}, partnerTenantUsageRequestModels(foreign), "foreign-l is folded into foreign-d (later consume)")
}

func TestPartnerTenantUsageSummaryAcrossTables(t *testing.T) {
	db := setupPartnerTenantUsageUnionPQ(t, "pt_usage_request_summary_")
	seedPartnerTenantUsageRequestScenario(t, db)
	start, end := partnerTenantUsageQueryStart, partnerTenantUsageQueryEnd

	summary, err := GetUserLogSummary(context.Background(), 7, start, end, 0)
	require.NoError(t, err)
	// Requests: retry-1, retry-2, twin, same-id x2, two empty consumes succeed;
	// stream-fail, violation, err-only and two empty errors fail.
	// Wallet quota: 40 + 5 + 1 + 7 + 7 + 3 + 3; subscription: 100 + 30 + 2.
	require.Equal(t, LogSummaryTotals{Requests: 12, Succeeded: 7, Failed: 5, Quota: 66, SubscriptionQuota: 132, Tokens: 23}, summary.LogSummaryTotals)
	require.Len(t, summary.Daily, 1)
	require.Equal(t, summary.LogSummaryTotals, summary.Daily[0].LogSummaryTotals)
	again, err := GetUserLogSummary(context.Background(), 7, start, end, 0)
	require.NoError(t, err)
	require.Equal(t, summary, again)

	// The consume totals are exactly the sums over both tables' consume rows.
	var legacySum, dedicatedSum struct {
		Quota  int64
		Tokens int64
	}
	require.NoError(t, db.Table("logs").Select("COALESCE(sum(quota),0) quota, COALESCE(sum(prompt_tokens),0)+COALESCE(sum(completion_tokens),0) tokens").Where("user_id = ? AND type = ?", 7, LogTypeConsume).Scan(&legacySum).Error)
	require.NoError(t, db.Table(partnerTenantUsageLogTable).Select("COALESCE(sum(quota),0) quota, COALESCE(sum(prompt_tokens),0)+COALESCE(sum(completion_tokens),0) tokens").Where("user_id = ? AND type = ?", 7, LogTypeConsume).Scan(&dedicatedSum).Error)
	require.Equal(t, legacySum.Quota+dedicatedSum.Quota, summary.Quota+summary.SubscriptionQuota)
	require.Equal(t, legacySum.Tokens+dedicatedSum.Tokens, summary.Tokens)

	foreign, err := GetUserLogSummary(context.Background(), 8, start, end, 0)
	require.NoError(t, err)
	require.Equal(t, LogSummaryTotals{Requests: 2, Succeeded: 2, Quota: 1000, SubscriptionQuota: 5000, Tokens: 3000}, foreign.LogSummaryTotals)
}

// A retry chain crossing local midnight under UTC+8 is bucketed exactly as the
// single-table rules bucket the same facts.
func TestPartnerTenantUsageSummaryRetryAcrossLocalMidnight(t *testing.T) {
	db := setupPartnerTenantUsageUnionPQ(t, "pt_usage_request_midnight_")
	const offsetMinutes = 480
	midnight := ((partnerTenantUsageQueryStart+offsetMinutes*60)/86400+1)*86400 - offsetMinutes*60
	other := `{"billing_source":"subscription","subscription_consumed":9}`
	// Member: error before midnight in logs, consume after midnight in the dedicated table.
	require.NoError(t, db.Create(&Log{UserId: 7, Type: LogTypeError, CreatedAt: midnight - 10, RequestId: "midnight"}).Error)
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 7, CreatedAt: midnight + 10, RequestId: "midnight", Quota: 9, PromptTokens: 2, CompletionTokens: 1, Other: other})
	// Oracle: the same facts of an ordinary user, both in logs (legacy path).
	require.NoError(t, db.Create(&Log{UserId: 17, Type: LogTypeError, CreatedAt: midnight - 10, RequestId: "midnight"}).Error)
	require.NoError(t, db.Create(&Log{UserId: 17, Type: LogTypeConsume, CreatedAt: midnight + 10, RequestId: "midnight", Quota: 9, PromptTokens: 2, CompletionTokens: 1, Other: other}).Error)

	member, err := GetUserLogSummary(context.Background(), 7, midnight-100, midnight+100, offsetMinutes)
	require.NoError(t, err)
	legacy, err := GetUserLogSummary(context.Background(), 17, midnight-100, midnight+100, offsetMinutes)
	require.NoError(t, err)
	require.Equal(t, legacy, member, "two-table and single-table summaries agree")

	location := time.FixedZone("report", offsetMinutes*60)
	after := time.Unix(midnight+10, 0).In(location).Format("2006-01-02")
	before := time.Unix(midnight-10, 0).In(location).Format("2006-01-02")
	require.NotEqual(t, before, after)
	require.Equal(t, LogSummaryTotals{Requests: 1, Succeeded: 1, SubscriptionQuota: 9, Tokens: 3}, member.LogSummaryTotals)
	require.Equal(t, []DailyLogSummary{
		{Date: after, LogSummaryTotals: LogSummaryTotals{Requests: 1, Succeeded: 1, SubscriptionQuota: 9, Tokens: 3}},
		{Date: before},
	}, member.Daily, "the settled outcome is counted on the day of the consume")
}

// Wallet deductions next to subscription consumption, recorded-rate savings
// and a negative timezone offset all come from the one shared loop: a member
// whose facts are split over both tables gets exactly the summary of an
// ordinary user holding the same facts in logs.
func TestPartnerTenantUsageSummaryMixedBillingMatchesSingleTable(t *testing.T) {
	db := setupPartnerTenantUsageUnionPQ(t, "pt_usage_request_mixed_")
	const offsetMinutes = -300
	midnight := ((partnerTenantUsageQueryStart+offsetMinutes*60)/86400+1)*86400 - offsetMinutes*60
	facts := []struct {
		dedicated          bool
		logType            int
		at                 int64
		requestID          string
		quota              int
		prompt, completion int
		stream             bool
		other              string
	}{
		{false, LogTypeConsume, midnight - 50, "saved-l", 100, 4, 6, false, `{"billing_source":"wallet","group_ratio":0.5}`},
		{true, LogTypeConsume, midnight - 40, "saved-d", 300, 1, 2, false, `{"billing_source":"wallet","group_ratio":2,"user_group_ratio":0.25,"fee_quota":200}`},
		{true, LogTypeConsume, midnight + 30, "mixed-d", 90, 3, 3, false, `{"billing_source":"subscription","subscription_consumed":60,"wallet_quota_deducted":30}`},
		{false, LogTypeConsume, midnight + 40, "mixed-l", 80, 2, 0, true, `{"billing_source":"wallet","wallet_quota_deducted":50,"group_ratio":0.5}`},
		// One request: failed before local midnight in logs, charged after it in the dedicated table.
		{false, LogTypeError, midnight - 5, "cross", 0, 0, 0, false, ""},
		{true, LogTypeConsume, midnight + 5, "cross", 20, 1, 1, false, `{"billing_source":"wallet","group_ratio":0.5}`},
	}
	for _, fact := range facts {
		if fact.dedicated {
			seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 7, Type: fact.logType, CreatedAt: fact.at, RequestId: fact.requestID,
				Quota: int64(fact.quota), PromptTokens: int64(fact.prompt), CompletionTokens: int64(fact.completion), IsStream: fact.stream, Other: fact.other})
		} else {
			require.NoError(t, db.Create(&Log{UserId: 7, Type: fact.logType, CreatedAt: fact.at, RequestId: fact.requestID,
				Quota: fact.quota, PromptTokens: fact.prompt, CompletionTokens: fact.completion, IsStream: fact.stream, Other: fact.other}).Error)
		}
		// Oracle: the same fact of an ordinary user, always in logs (legacy path).
		require.NoError(t, db.Create(&Log{UserId: 17, Type: fact.logType, CreatedAt: fact.at, RequestId: fact.requestID,
			Quota: fact.quota, PromptTokens: fact.prompt, CompletionTokens: fact.completion, IsStream: fact.stream, Other: fact.other}).Error)
	}

	member, err := GetUserLogSummary(context.Background(), 7, midnight-100, midnight+100, offsetMinutes)
	require.NoError(t, err)
	legacy, err := GetUserLogSummary(context.Background(), 17, midnight-100, midnight+100, offsetMinutes)
	require.NoError(t, err)
	require.Equal(t, legacy, member, "two-table and single-table summaries agree field by field, per day")
	// Wallet: 100 + 300 + 30 (deducted next to the subscription) + 50 (deducted) + 20.
	// Saved at the recorded rates: 100 + 600 + 80 + 20; the subscription row is not comparable.
	require.Equal(t, LogSummaryTotals{Requests: 5, Succeeded: 5, Quota: 500, SubscriptionQuota: 60, Tokens: 23, SavedQuota: 800, ComparableRequests: 4}, member.LogSummaryTotals)
	require.Len(t, member.Daily, 2, "the window crosses local midnight at UTC-5")
}

// Generated-SQL contract of the two request-window unions (request outcomes
// and usage summary), per driver. Statements are built in dry-run mode on the
// PostgreSQL fixture; no ClickHouse is contacted.
func TestPartnerTenantUsageRequestWindowGeneratedSQL(t *testing.T) {
	setupPartnerTenantUsageUnionPQ(t, "pt_usage_request_sql_")
	for _, driver := range []common.DatabaseType{common.DatabaseTypePostgreSQL, common.DatabaseTypeClickHouse} {
		t.Run(string(driver), func(t *testing.T) {
			common.SetLogDatabaseType(driver)
			initCol()
			cases := []struct {
				name       string
				projection []string
				order      string
			}{
				{"outcomes", ownedLogProjection, ownedLogUnionOrder(driver)},
				{"summary", ownedLogSummaryProjection, ownedLogSummaryOrder},
			}
			for _, test := range cases {
				statement := ownedRequestWindowUnion(context.Background(), 7, 100, 200, test.projection).
					Session(&gorm.Session{DryRun: true}).
					Select(ownedLogOuterColumns(logGroupCol, test.projection)).Order(test.order).
					Find(&[]ownedLogRow{}).Statement
				sql := statement.SQL.String()
				require.Equal(t, 1, strings.Count(sql, " UNION ALL "), test.name)
				require.Equal(t, 1, strings.Count(sql, "UNION"), "never a deduplicating UNION")
				require.Contains(t, sql, partnerTenantUsageLogTable+" AS logs")
				require.Equal(t, 2, strings.Count(sql, "logs.user_id = "), "ownership inside each branch")
				require.Equal(t, 2, strings.Count(sql, "logs.type IN "))
				require.Equal(t, 2, strings.Count(sql, "logs.created_at >= "))
				require.Equal(t, 2, strings.Count(sql, "logs.created_at <= "))
				require.Contains(t, sql, "ORDER BY "+test.order)
				require.Contains(t, sql, "0 AS log_source")
				require.Contains(t, sql, "1 AS log_source")
				require.Contains(t, sql, "logs.event_id AS log_event_id")
				require.NotContains(t, sql, "JOIN")
				require.NotContains(t, sql, "channel_name")
				// Bound values in placeholder order: owner, both types, window; once per branch.
				branch := []interface{}{7, LogTypeConsume, LogTypeError, int64(100), int64(200)}
				require.Equal(t, append(append([]interface{}{}, branch...), branch...), statement.Vars, test.name)
				if driver == common.DatabaseTypeClickHouse {
					require.Contains(t, sql, "toInt64(logs.quota) AS quota")
					require.Contains(t, sql, "logs.id AS id")
				} else {
					require.Contains(t, sql, "CAST(logs.quota AS BIGINT) AS quota")
					require.Contains(t, sql, "CAST('' AS VARCHAR(64)) AS log_event_id")
				}
			}
		})
	}
}

// An ordinary user keeps the single-table request list and summary; only the
// probes mention the dedicated table.
func TestPartnerTenantUsageRequestOrdinaryUserKeepsLegacyPath(t *testing.T) {
	db := setupPartnerTenantUsageUnionPQ(t, "pt_usage_request_ordinary_")
	at := partnerTenantUsageQueryStart + 100
	wallet := `{"billing_source":"wallet"}`
	// Inserted in an order where id desc differs from created_at desc.
	require.NoError(t, db.Create(&Log{UserId: 9, Type: LogTypeConsume, CreatedAt: at + 50, RequestId: "o-late", ModelName: "o-late", Quota: 5, PromptTokens: 1, Other: wallet}).Error)
	require.NoError(t, db.Create(&Log{UserId: 9, Type: LogTypeError, CreatedAt: at + 10, RequestId: "o-retry", ModelName: "o-retry-error"}).Error)
	require.NoError(t, db.Create(&Log{UserId: 9, Type: LogTypeConsume, CreatedAt: at + 11, RequestId: "o-retry", ModelName: "o-retry-consume", Quota: 6, CompletionTokens: 2, Other: wallet}).Error)
	require.NoError(t, db.Create(&Log{UserId: 9, Type: LogTypeError, CreatedAt: at + 12, ModelName: "o-empty-error"}).Error)
	// A member's dedicated row with the same request id must not matter.
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 7, RequestId: "o-late", Quota: 999, Other: wallet})

	statements := capturePartnerTenantUsageUnionSQL(t, db)
	outcomes, total, err := GetUserRequestLogs(context.Background(), 9, partnerTenantUsageQueryStart, partnerTenantUsageQueryEnd, 0, 10)
	require.NoError(t, err)
	require.EqualValues(t, 3, total)
	require.Equal(t, []string{"o-empty-error", "o-retry-consume", "o-late"}, partnerTenantUsageRequestModels(outcomes), "legacy id desc, not created_at desc")
	summary, err := GetUserLogSummary(context.Background(), 9, partnerTenantUsageQueryStart, partnerTenantUsageQueryEnd, 0)
	require.NoError(t, err)
	require.Equal(t, LogSummaryTotals{Requests: 3, Succeeded: 2, Failed: 1, Quota: 11, Tokens: 3}, summary.LogSummaryTotals)

	dedicated := partnerTenantUsageUnionDedicatedStatements(*statements)
	require.Len(t, dedicated, 2, "one probe per reader and nothing else touches the dedicated table")
	for _, statement := range dedicated {
		require.Contains(t, statement, "SELECT 1 AS hit FROM")
		require.NotContains(t, statement, "UNION")
	}
}

// Returned errors alone cannot prove diagnostic safety. Both the application
// writers and an enabled GORM DEBUG logger observe failures *after* SQL has
// been built (and the real statement executed), with secret-like bind/error
// markers. Probe and UNION Query/Row callback chains are asserted live.
func TestPartnerTenantUsageOwnedReadFailureDiagnostics(t *testing.T) {
	db := setupPartnerTenantUsageUnionPQ(t, "pt_usage_read_diagnostics_")
	now := partnerTenantUsageQueryStart + 100
	require.NoError(t, db.Create(&Log{UserId: 7, Username: "member", TokenId: 71, Type: LogTypeConsume, CreatedAt: now, Quota: 3, RequestId: "diag-old"}).Error)
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 61, UserId: 7, Username: "member", TokenId: 71, CreatedAt: now, ModelName: partnerTenantUsageSecretMarker, RequestId: "diag-new", Quota: 11, Other: `{"note":"` + partnerTenantUsageSecretMarker + `"}`})
	var app, debug bytes.Buffer
	oldWriter, oldErrorWriter := gin.DefaultWriter, gin.DefaultErrorWriter
	common.LogWriterMu.Lock()
	gin.DefaultWriter, gin.DefaultErrorWriter = &app, &app
	common.LogWriterMu.Unlock()
	t.Cleanup(func() {
		common.LogWriterMu.Lock()
		gin.DefaultWriter, gin.DefaultErrorWriter = oldWriter, oldErrorWriter
		common.LogWriterMu.Unlock()
	})
	LOG_DB = db.Session(&gorm.Session{Logger: gormlogger.New(log.New(&debug, "", 0), gormlogger.Config{LogLevel: gormlogger.Info})})
	var control int
	require.NoError(t, LOG_DB.Raw("SELECT 1 AS logger_positive_control").Scan(&control).Error)
	require.Contains(t, debug.String(), "logger_positive_control", "DEBUG capture is enabled, not vacuous")
	hasRows, err := dedicatedLogOwnerHasRows(context.Background(), ownedLogUserColumn, 7)
	require.NoError(t, err)
	require.True(t, hasRows)
	stat, err := SumUserUsedQuota(7, "member", LogTypeConsume, partnerTenantUsageQueryStart, partnerTenantUsageQueryEnd, "", "", 0, "")
	require.NoError(t, err)
	require.Equal(t, 14, stat.Quota, "positive control includes nonzero legacy and dedicated sums")
	phase, forced := "", 0
	fail := func(tx *gorm.DB) {
		if tx.DryRun {
			return // GORM also builds UNION branches using the Query chain.
		}
		sql := tx.Statement.SQL.String()
		dedicated := strings.Contains(sql, partnerTenantUsageLogTable) && !strings.Contains(sql, "UNION ALL")
		if (phase == "probe" && dedicated && strings.Contains(sql, "1 AS hit")) ||
			(phase == "union" && strings.Contains(sql, "UNION ALL")) ||
			(phase == "stat_quota" && dedicated && strings.Contains(sql, "sum(quota)")) ||
			(phase == "stat_rate" && dedicated && strings.Contains(sql, "count(*) rpm")) {
			require.NoError(t, tx.Error, "a real successful statement precedes injected failure")
			forced++
			if rows, ok := tx.Statement.Dest.(*dbsql.Rows); ok {
				_ = rows.Close()
			}
			_ = tx.AddError(errors.New("raw reader failure " + partnerTenantUsageSecretMarker))
		}
	}
	require.NoError(t, db.Callback().Query().After("gorm:query").Register("pt_usage_diag:query", fail))
	require.NoError(t, db.Callback().Row().After("gorm:row").Register("pt_usage_diag:row", fail))
	t.Cleanup(func() {
		_ = db.Callback().Query().Remove("pt_usage_diag:query")
		_ = db.Callback().Row().Remove("pt_usage_diag:row")
	})
	filter := LogFilter{ModelName: partnerTenantUsageSecretMarker}
	readers := []struct {
		name string
		read func(*testing.T) error
	}{
		{"list", func(t *testing.T) error {
			rows, total, err := GetUserLogs(7, filter, 0, 10)
			require.Nil(t, rows)
			require.Zero(t, total)
			return err
		}},
		{"token", func(t *testing.T) error { rows, err := GetLogByTokenId(71); require.Nil(t, rows); return err }},
		{"stream", func(t *testing.T) error {
			return StreamUserLogs(context.Background(), 7, filter, func(*Log) error { t.Fatal("failed stream must yield nothing"); return nil })
		}},
		{"requests", func(t *testing.T) error {
			rows, total, err := GetUserRequestLogs(context.Background(), 7, partnerTenantUsageQueryStart, partnerTenantUsageQueryEnd, 0, 10)
			require.Nil(t, rows)
			require.Zero(t, total)
			return err
		}},
		{"summary", func(t *testing.T) error {
			rows, err := GetUserLogSummary(context.Background(), 7, partnerTenantUsageQueryStart, partnerTenantUsageQueryEnd, 0)
			require.Nil(t, rows)
			return err
		}},
	}
	requireFailure := func(t *testing.T, read func(*testing.T) error) {
		t.Helper()
		before := forced
		err := read(t)
		require.Error(t, err)
		require.NotContains(t, err.Error(), partnerTenantUsageSecretMarker)
		require.Equal(t, before+1, forced, "exactly one executed SQL chain must fail, not dry-run branches")
	}
	for _, target := range []string{"probe", "union"} {
		phase = target
		for _, reader := range readers {
			t.Run(target+"/"+reader.name, func(t *testing.T) {
				requireFailure(t, reader.read)
			})
		}
	}
	// Self statistics do not use UNION: they add a dedicated quota/rate pair
	// after the legacy sum. Fail each stage independently, never returning the
	// already-read legacy quota (3) or a partial combined total.
	for _, target := range []string{"probe", "stat_quota", "stat_rate"} {
		phase = target
		t.Run(target+"/self_stat", func(t *testing.T) {
			requireFailure(t, func(t *testing.T) error {
				stat, err := SumUserUsedQuota(7, "member", LogTypeConsume, partnerTenantUsageQueryStart, partnerTenantUsageQueryEnd, "", "", 0, "")
				require.Equal(t, Stat{}, stat)
				return err
			})
		})
	}
	require.NotContains(t, app.String(), partnerTenantUsageSecretMarker)
	require.NotContains(t, debug.String(), partnerTenantUsageSecretMarker, "no interpolated model bind or driver error in DEBUG")
	require.Contains(t, app.String(), "failed to probe dedicated user logs", "application diagnostic capture is live")
	require.Contains(t, app.String(), "failed to query user logs across log tables")
	require.Contains(t, app.String(), "failed to probe dedicated user log statistics")
	require.Equal(t, 2, strings.Count(app.String(), "failed to query dedicated user log statistics"))
}
