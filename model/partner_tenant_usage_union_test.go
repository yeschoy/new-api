package model

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// Both tables in one task-owned PostgreSQL schema, with the log database type
// pinned to PostgreSQL. LOG_DB, the type and the quoted columns are restored by
// usePartnerTenantUsageLogDB's cleanup.
func setupPartnerTenantUsageUnionPQ(t *testing.T, prefix string) *gorm.DB {
	t.Helper()
	db := setupPartnerTenantUsageQueryPQ(t, prefix)
	common.SetLogDatabaseType(common.DatabaseTypePostgreSQL)
	initCol()
	return db
}

// Records every statement gorm builds on this fixture connection, including
// the ones issued through silenced sessions and dry-run subqueries.
func capturePartnerTenantUsageUnionSQL(t *testing.T, db *gorm.DB) *[]string {
	t.Helper()
	statements := &[]string{}
	record := func(tx *gorm.DB) { *statements = append(*statements, tx.Statement.SQL.String()) }
	require.NoError(t, db.Callback().Query().After("gorm:query").Register("pt_usage_union:capture_query", record))
	require.NoError(t, db.Callback().Row().After("gorm:row").Register("pt_usage_union:capture_row", record))
	return statements
}

func partnerTenantUsageUnionRequestIds(logs []*Log) []string {
	ids := make([]string, len(logs))
	for i, log := range logs {
		ids[i] = log.RequestId
	}
	return ids
}

func partnerTenantUsageUnionDedicatedStatements(statements []string) []string {
	var hits []string
	for _, statement := range statements {
		if strings.Contains(statement, partnerTenantUsageLogTable) {
			hits = append(hits, statement)
		}
	}
	return hits
}

// Pure contract of the per-driver projection: no database, no live ClickHouse.
func TestPartnerTenantUsageUnionProjectionContract(t *testing.T) {
	cases := []struct {
		name      string
		driver    common.DatabaseType
		groupCol  string
		contains  []string
		forbidden []string
		order     string
	}{
		{
			name: "clickhouse", driver: common.DatabaseTypeClickHouse, groupCol: "`group`",
			contains: []string{
				"logs.id AS id", "logs.created_at AS created_at", "logs.type AS type",
				"toInt64(logs.user_id) AS user_id", "toInt64(logs.quota) AS quota",
				"toInt64(logs.prompt_tokens) AS prompt_tokens", "toInt64(logs.completion_tokens) AS completion_tokens",
				"toInt64(logs.use_time) AS use_time", "toInt64(logs.channel_id) AS channel_id", "toInt64(logs.token_id) AS token_id",
				"logs.is_stream AS is_stream", "logs.`group` AS `group`",
			},
			forbidden: []string{"CAST(", "channel_name", `"group"`},
			order:     "logs.created_at desc, logs.id desc, logs.request_id desc, logs.log_source asc, logs.log_event_id asc",
		},
		{
			name: "postgres", driver: common.DatabaseTypePostgreSQL, groupCol: `"group"`,
			contains: []string{
				"CAST(logs.id AS BIGINT) AS id", "CAST(logs.user_id AS BIGINT) AS user_id", "CAST(logs.created_at AS BIGINT) AS created_at",
				"CAST(logs.type AS BIGINT) AS type", "CAST(logs.quota AS BIGINT) AS quota", "CAST(logs.token_id AS BIGINT) AS token_id",
				`logs."group" AS "group"`, "logs.is_stream AS is_stream",
			},
			forbidden: []string{"toInt64(", "channel_name", "`group`"},
			order:     "logs.created_at desc, logs.id desc, logs.log_source asc, logs.log_event_id asc",
		},
		{
			name: "mysql", driver: common.DatabaseTypeMySQL, groupCol: "`group`",
			contains:  []string{"CAST(logs.id AS SIGNED) AS id", "CAST(logs.quota AS SIGNED) AS quota", "logs.`group` AS `group`"},
			forbidden: []string{"toInt64(", "AS BIGINT", "channel_name"},
			order:     "logs.created_at desc, logs.id desc, logs.log_source asc, logs.log_event_id asc",
		},
		{
			name: "sqlite", driver: common.DatabaseTypeSQLite, groupCol: "`group`",
			contains:  []string{"CAST(logs.id AS BIGINT) AS id", "CAST(logs.channel_id AS BIGINT) AS channel_id"},
			forbidden: []string{"toInt64(", "AS SIGNED", "channel_name"},
			order:     "logs.created_at desc, logs.id desc, logs.log_source asc, logs.log_event_id asc",
		},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			legacy := ownedLogUnionBranchColumns(test.driver, test.groupCol, false)
			dedicated := ownedLogUnionBranchColumns(test.driver, test.groupCol, true)
			for _, branch := range []string{legacy, dedicated} {
				for _, fragment := range test.contains {
					require.Contains(t, branch, fragment)
				}
				for _, fragment := range test.forbidden {
					require.NotContains(t, branch, fragment)
				}
			}
			// UNION ALL matches by position: same width, same aliases, same order.
			legacyColumns, dedicatedColumns := strings.Split(legacy, ", "), strings.Split(dedicated, ", ")
			require.Len(t, legacyColumns, len(ownedLogProjection)+2)
			require.Len(t, dedicatedColumns, len(legacyColumns))
			for i := range ownedLogProjection {
				require.Equal(t, legacyColumns[i], dedicatedColumns[i], "identical expression for projected column %d", i)
			}
			require.Equal(t, "0 AS log_source", legacyColumns[len(legacyColumns)-2])
			require.Equal(t, "1 AS log_source", dedicatedColumns[len(dedicatedColumns)-2])
			require.True(t, strings.HasSuffix(legacy, " AS log_event_id"))
			require.NotContains(t, legacy, "event_id AS log_event_id", "logs has no event identity")
			require.True(t, strings.HasSuffix(dedicated, "logs.event_id AS log_event_id"))
			require.Equal(t, test.order, ownedLogUnionOrder(test.driver))

			outer := strings.Split(ownedLogUnionOuterColumns(test.groupCol), ", ")
			require.Len(t, outer, len(legacyColumns))
			require.Contains(t, outer, "logs."+test.groupCol)
			require.Equal(t, []string{"logs.log_source", "logs.log_event_id"}, outer[len(outer)-2:])
		})
	}
	// Ownership identifiers are fixed constants; anything else is refused.
	_, err := dedicatedLogOwnerHasRows(context.Background(), "tenant_id", 1)
	require.ErrorIs(t, err, errOwnedLogRead)
}

// Generated-SQL contract of the whole union, per driver. Statements are built
// in dry-run mode on the PostgreSQL fixture; no ClickHouse is contacted.
func TestPartnerTenantUsageUnionGeneratedSQL(t *testing.T) {
	setupPartnerTenantUsageUnionPQ(t, "pt_usage_union_sql_")
	filter := LogFilter{Type: LogTypeConsume, ModelName: "model-a", Group: "group-a", StartTimestamp: 10, EndTimestamp: 20}
	for _, driver := range []common.DatabaseType{common.DatabaseTypePostgreSQL, common.DatabaseTypeClickHouse} {
		t.Run(string(driver), func(t *testing.T) {
			common.SetLogDatabaseType(driver)
			initCol()
			union, err := ownedLogUnion(context.Background(), ownedLogUserColumn, 7, filter)
			require.NoError(t, err)
			statement := union.Session(&gorm.Session{DryRun: true}).
				Select(ownedLogUnionOuterColumns(logGroupCol)).Order(ownedLogUnionOrder(driver)).
				Limit(5).Offset(10).Find(&[]ownedLogRow{}).Statement
			sql := statement.SQL.String()

			require.Equal(t, 1, strings.Count(sql, " UNION ALL "), "exactly one UNION ALL")
			require.Equal(t, 1, strings.Count(sql, "UNION"), "never a deduplicating UNION")
			require.Contains(t, sql, partnerTenantUsageLogTable+" AS logs")
			require.Contains(t, sql, ") AS logs")
			require.Equal(t, 2, strings.Count(sql, "logs.user_id = "), "ownership predicate inside each branch")
			require.Equal(t, 2, strings.Count(sql, "logs.type = "), "filter inside each branch")
			require.Equal(t, 2, strings.Count(sql, "logs.model_name = "))
			require.Equal(t, 2, strings.Count(sql, "logs."+logGroupCol+" = "))
			require.Equal(t, 2, strings.Count(sql, "logs.created_at >= "))
			require.Contains(t, sql, "ORDER BY "+ownedLogUnionOrder(driver))
			require.NotContains(t, sql, "JOIN")
			require.NotContains(t, sql, "channel_name")
			owners := 0
			for _, value := range statement.Vars {
				if value == 7 {
					owners++
				}
			}
			require.Equal(t, 2, owners, "the owner is a bound parameter of both branches")
			if driver == common.DatabaseTypeClickHouse {
				require.Contains(t, sql, "toInt64(logs.user_id) AS user_id")
				require.Contains(t, sql, "logs.`group` AS `group`")
				require.Contains(t, sql, "logs.request_id desc")
			} else {
				require.Contains(t, sql, "CAST(logs.user_id AS BIGINT) AS user_id")
				require.Contains(t, sql, `logs."group" AS "group"`)
				require.Contains(t, sql, "CAST('' AS VARCHAR(64)) AS log_event_id")
			}

			// The self count keeps the legacy count limit on the union.
			countUnion, err := ownedLogUnion(context.Background(), ownedLogUserColumn, 7, filter)
			require.NoError(t, err)
			var total int64
			countSQL := countUnion.Session(&gorm.Session{DryRun: true}).Limit(logSearchCountLimit).Count(&total).Statement.SQL.String()
			require.Contains(t, countSQL, "count(*)")
			require.Contains(t, countSQL, " UNION ALL ")
			require.Contains(t, countSQL, "LIMIT")
		})
	}
}

func TestPartnerTenantUsageUnionOrdinaryUserKeepsLegacyPath(t *testing.T) {
	db := setupPartnerTenantUsageUnionPQ(t, "pt_usage_union_ordinary_")
	at := partnerTenantUsageQueryStart + 100
	other := `{"billing_source":"wallet","` + logOtherAdminInfoKey + `":{"note":"admin-only"}}`
	for i := 0; i < 5; i++ {
		require.NoError(t, db.Create(&Log{UserId: 9, Username: "ordinary", TokenId: 91, TokenName: "tk", ModelName: "model-a", Type: LogTypeConsume, Quota: 10 + i, CreatedAt: at - int64(i), RequestId: fmt.Sprintf("ord-%d", i), Other: other, ChannelId: 3}).Error)
	}
	// A member's dedicated rows must not change the ordinary user's path.
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 7, TokenId: 71, Username: "ordinary", TokenName: "tk", ModelName: "model-a", RequestId: "ord-0", Quota: 999})

	filter := LogFilter{StartTimestamp: partnerTenantUsageQueryStart, EndTimestamp: partnerTenantUsageQueryEnd}
	// Legacy expectation computed with the pre-change statements.
	var expected []*Log
	require.NoError(t, db.Where("logs.user_id = ?", 9).Where("logs.created_at >= ? AND logs.created_at <= ?", filter.StartTimestamp, filter.EndTimestamp).Order("logs.id desc").Limit(3).Offset(1).Find(&expected).Error)
	formatUserLogs(expected, 1)
	// The pre-change export and token-recent statements, shaped as before.
	var expectedStream []*Log
	require.NoError(t, db.Where("logs.user_id = ?", 9).Where("logs.created_at >= ? AND logs.created_at <= ?", filter.StartTimestamp, filter.EndTimestamp).Order("logs.id desc").Find(&expectedStream).Error)
	for i, log := range expectedStream {
		log.Id = i + 1
		log.ChannelName = ""
		log.Other = formatLogOtherJSON(log.Other, logOtherVisibilityUser)
	}
	var expectedRecent []*Log
	require.NoError(t, db.Model(&Log{}).Where("token_id = ?", 91).Order("id desc").Limit(common.MaxRecentItems).Find(&expectedRecent).Error)
	formatUserLogs(expectedRecent, 0)

	statements := capturePartnerTenantUsageUnionSQL(t, db)
	logs, total, err := GetUserLogs(9, filter, 1, 3)
	require.NoError(t, err)
	require.EqualValues(t, 5, total)
	require.Equal(t, expected, logs, "identical rows, order (id desc), display ids and user projection")
	require.Equal(t, []string{"ord-3", "ord-2", "ord-1"}, partnerTenantUsageUnionRequestIds(logs), "id desc, not created_at desc")

	var streamed []string
	var streamedRows []*Log
	require.NoError(t, StreamUserLogs(context.Background(), 9, filter, func(log *Log) error {
		streamed = append(streamed, fmt.Sprintf("%d:%s", log.Id, log.RequestId))
		row := *log
		streamedRows = append(streamedRows, &row)
		return nil
	}))
	require.Equal(t, []string{"1:ord-4", "2:ord-3", "3:ord-2", "4:ord-1", "5:ord-0"}, streamed)
	require.Equal(t, expectedStream, streamedRows, "identical exported rows, not only their number")

	recent, err := GetLogByTokenId(91)
	require.NoError(t, err)
	require.Len(t, recent, 5)
	require.Equal(t, expectedRecent, recent, "identical token-recent rows, order and user projection")

	legacyStat, err := SumUsedQuota(LogTypeConsume, filter.StartTimestamp, filter.EndTimestamp, "", "ordinary", "", 0, "")
	require.NoError(t, err)
	stat, err := SumUserUsedQuota(9, "ordinary", LogTypeConsume, filter.StartTimestamp, filter.EndTimestamp, "", "", 0, "")
	require.NoError(t, err)
	require.Equal(t, legacyStat, stat, "an ordinary user's self statistics are the legacy statistics")

	dedicated := partnerTenantUsageUnionDedicatedStatements(*statements)
	require.Len(t, dedicated, 4, "one probe per reader call and nothing else touches the dedicated table")
	for _, statement := range dedicated {
		require.Contains(t, statement, "SELECT 1 AS hit FROM")
		require.NotContains(t, statement, "UNION")
	}
}

func TestPartnerTenantUsageUnionMergedOrderAndPaging(t *testing.T) {
	db := setupPartnerTenantUsageUnionPQ(t, "pt_usage_union_paging_")
	at := partnerTenantUsageQueryStart + 1000
	// logs: local ids 1..4. Dedicated: local ids 1..4. Same numbers in both.
	require.NoError(t, db.Create(&Log{UserId: 7, Username: "member", TokenName: "tk", Type: LogTypeConsume, CreatedAt: at + 10, RequestId: "old-a"}).Error)
	require.NoError(t, db.Create(&Log{UserId: 7, Username: "member", TokenName: "tk", Type: LogTypeConsume, CreatedAt: at + 20, RequestId: "old-b"}).Error)
	require.NoError(t, db.Create(&Log{UserId: 7, Username: "member", TokenName: "tk", Type: LogTypeError, CreatedAt: at + 20, RequestId: "old-c"}).Error)
	require.NoError(t, db.Create(&Log{UserId: 8, Username: "member", TokenName: "tk", Type: LogTypeConsume, CreatedAt: at + 20, RequestId: "old-a"}).Error)
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 7, Username: "member", TokenName: "tk", CreatedAt: at + 20, RequestId: "new-a"})
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 7, Username: "member", TokenName: "tk", CreatedAt: at + 20, RequestId: "new-b"})
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 7, Username: "member", TokenName: "tk", CreatedAt: at + 30, RequestId: "new-c", Type: LogTypeError})
	// Another user's rows: same request id, token name, username and local id range.
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 8, Username: "member", TokenName: "tk", CreatedAt: at + 20, RequestId: "new-a"})

	// created_at desc, local id desc, source (logs first), event identity.
	expected := []string{"new-c", "old-c", "old-b", "new-b", "new-a", "old-a"}
	filter := LogFilter{StartTimestamp: partnerTenantUsageQueryStart, EndTimestamp: partnerTenantUsageQueryEnd}
	for _, pageSize := range []int{1, 2, 4, 50} {
		var seen []string
		var displayIds []int
		for start := 0; ; start += pageSize {
			logs, total, err := GetUserLogs(7, filter, start, pageSize)
			require.NoError(t, err)
			require.EqualValues(t, len(expected), total, "total counts the union")
			if len(logs) == 0 {
				break
			}
			for _, log := range logs {
				require.Equal(t, 7, log.UserId, "ownership applied before the union")
				displayIds = append(displayIds, log.Id)
			}
			seen = append(seen, partnerTenantUsageUnionRequestIds(logs)...)
		}
		require.Equal(t, expected, seen, "page size %d: every row once, in global order", pageSize)
		for i, id := range displayIds {
			require.Equal(t, i+1, id, "continuous display ids across sources")
		}
	}

	var streamed []string
	require.NoError(t, StreamUserLogs(context.Background(), 7, filter, func(log *Log) error {
		streamed = append(streamed, fmt.Sprintf("%d:%s", log.Id, log.RequestId))
		return nil
	}))
	require.Equal(t, []string{"1:new-c", "2:old-c", "3:old-b", "4:new-b", "5:new-a", "6:old-a"}, streamed)

	// The stream is row by row: a callback failure or a cancellation stops it.
	stop := errors.New("stop")
	delivered := 0
	require.ErrorIs(t, StreamUserLogs(context.Background(), 7, filter, func(*Log) error {
		delivered++
		if delivered == 2 {
			return stop
		}
		return nil
	}), stop)
	require.Equal(t, 2, delivered)
	ctx, cancel := context.WithCancel(context.Background())
	delivered = 0
	err := StreamUserLogs(ctx, 7, filter, func(*Log) error {
		delivered++
		cancel()
		// database/sql closes the rows from a watcher goroutine.
		time.Sleep(200 * time.Millisecond)
		return nil
	})
	require.ErrorIs(t, err, context.Canceled)
	require.Less(t, delivered, len(expected))
	// A request cancelled before the export starts delivers nothing.
	delivered = 0
	require.ErrorIs(t, StreamUserLogs(ctx, 7, filter, func(*Log) error {
		delivered++
		return nil
	}), context.Canceled)
	require.Zero(t, delivered)

	// The other user sees only their own two rows.
	logs, total, err := GetUserLogs(8, filter, 0, 50)
	require.NoError(t, err)
	require.EqualValues(t, 2, total)
	require.ElementsMatch(t, []string{"old-a", "new-a"}, partnerTenantUsageUnionRequestIds(logs))
}

func TestPartnerTenantUsageUnionFiltersRestrictBothSources(t *testing.T) {
	db := setupPartnerTenantUsageUnionPQ(t, "pt_usage_union_filter_")
	at := partnerTenantUsageQueryStart + 100
	require.NoError(t, db.Create(&Log{UserId: 7, Type: LogTypeConsume, ModelName: "m-a", TokenName: "tk-a", Group: "g-a", CreatedAt: at + 10, RequestId: "old-1"}).Error)
	require.NoError(t, db.Create(&Log{UserId: 7, Type: LogTypeError, ModelName: "m-b", TokenName: "tk-b", Group: "g-b", CreatedAt: at + 500, RequestId: "old-2"}).Error)
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 7, Type: LogTypeConsume, ModelName: "m-a", TokenName: "tk-a", Group: "g-a", CreatedAt: at + 20, RequestId: "new-1"})
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 7, Type: LogTypeError, ModelName: "m-b", TokenName: "tk-b", Group: "g-b", CreatedAt: at + 510, RequestId: "new-2"})

	cases := []struct {
		name     string
		filter   LogFilter
		expected []string
	}{
		{"none", LogFilter{}, []string{"new-1", "new-2", "old-1", "old-2"}},
		{"type", LogFilter{Type: LogTypeConsume}, []string{"new-1", "old-1"}},
		{"types", LogFilter{Types: []int{LogTypeError}}, []string{"new-2", "old-2"}},
		{"types both", LogFilter{Types: []int{LogTypeConsume, LogTypeError}}, []string{"new-1", "new-2", "old-1", "old-2"}},
		{"model", LogFilter{ModelName: "m-b"}, []string{"new-2", "old-2"}},
		{"model pattern", LogFilter{ModelName: "m-a%"}, []string{"new-1", "old-1"}},
		{"token name", LogFilter{TokenName: "tk-a"}, []string{"new-1", "old-1"}},
		{"window", LogFilter{StartTimestamp: at + 400, EndTimestamp: at + 600}, []string{"new-2", "old-2"}},
		{"group", LogFilter{Group: "g-b"}, []string{"new-2", "old-2"}},
		{"request id new", LogFilter{RequestId: "new-1"}, []string{"new-1"}},
		{"request id old", LogFilter{RequestId: "old-2"}, []string{"old-2"}},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			logs, total, err := GetUserLogs(7, test.filter, 0, 50)
			require.NoError(t, err)
			got := partnerTenantUsageUnionRequestIds(logs)
			sort.Strings(got)
			require.Equal(t, test.expected, got)
			require.EqualValues(t, len(test.expected), total)
			var streamed []string
			require.NoError(t, StreamUserLogs(context.Background(), 7, test.filter, func(log *Log) error {
				streamed = append(streamed, log.RequestId)
				return nil
			}))
			sort.Strings(streamed)
			require.Equal(t, test.expected, streamed)
		})
	}
	// An invalid pattern is still reported by the filter itself.
	_, _, err := GetUserLogs(7, LogFilter{ModelName: "%%%%%"}, 0, 10)
	require.Error(t, err)
}

func TestPartnerTenantUsageUnionUserProjection(t *testing.T) {
	db := setupPartnerTenantUsageUnionPQ(t, "pt_usage_union_projection_")
	other := `{"billing_source":"subscription","` + logOtherAdminInfoKey + `":{"note":"admin-only"},"` + logOtherRootInfoKey + `":{"note":"root-only"}}`
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, AccountId: 4242, TenantName: "TENANTNAMEMARKER", IdentitySource: "subscription_key", SubscriptionId: 77, UserId: 7, TokenId: 71, Username: "member", TokenName: "tk", ModelName: "m", Quota: 1 << 40, PromptTokens: 3, CompletionTokens: 4, UseTime: 5, IsStream: true, ChannelId: 6, Group: "g", Ip: "203.0.113.9", RequestId: "new-1", UpstreamRequestId: "up-1", Content: "content", Other: other})

	plain, err := json.Marshal(&Log{RequestId: "x", UpstreamRequestId: "y"})
	require.NoError(t, err)
	var plainKeys map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(plain, &plainKeys))

	check := func(t *testing.T, log *Log) {
		require.Equal(t, 1, log.Id, "display id, not the local id")
		require.Empty(t, log.ChannelName)
		require.Equal(t, formatLogOtherJSON(other, logOtherVisibilityUser), log.Other)
		require.NotContains(t, log.Other, "admin-only")
		require.NotContains(t, log.Other, "root-only")
		require.Equal(t, 1<<40, log.Quota, "64-bit quota survives the projection")
		require.Equal(t, []any{7, 71, 6, 3, 4, 5, true, "g", "203.0.113.9", "up-1", "content", LogTypeConsume},
			[]any{log.UserId, log.TokenId, log.ChannelId, log.PromptTokens, log.CompletionTokens, log.UseTime, log.IsStream, log.Group, log.Ip, log.UpstreamRequestId, log.Content, log.Type})
		encoded, err := json.Marshal(log)
		require.NoError(t, err)
		var keys map[string]json.RawMessage
		require.NoError(t, json.Unmarshal(encoded, &keys))
		require.Len(t, keys, len(plainKeys))
		for key := range plainKeys {
			require.Contains(t, keys, key)
		}
		for _, leaked := range []string{"TENANTNAMEMARKER", "subscription_key", "ptu_query_", "tenant", "account", "event", "log_source"} {
			require.NotContains(t, string(encoded), leaked)
		}
	}
	logs, _, err := GetUserLogs(7, LogFilter{}, 0, 10)
	require.NoError(t, err)
	require.Len(t, logs, 1)
	check(t, logs[0])
	recent, err := GetLogByTokenId(71)
	require.NoError(t, err)
	require.Len(t, recent, 1)
	check(t, recent[0])
	require.NoError(t, StreamUserLogs(context.Background(), 7, LogFilter{}, func(log *Log) error {
		check(t, log)
		return nil
	}))
}

func TestPartnerTenantUsageUnionTokenRecent(t *testing.T) {
	db := setupPartnerTenantUsageUnionPQ(t, "pt_usage_union_token_")
	at := partnerTenantUsageQueryStart + 100
	require.NoError(t, db.Create(&Log{UserId: 7, TokenId: 71, Type: LogTypeConsume, CreatedAt: at + 1, RequestId: "old-1"}).Error)
	require.NoError(t, db.Create(&Log{UserId: 7, TokenId: 72, Type: LogTypeConsume, CreatedAt: at + 9, RequestId: "old-other-token"}).Error)
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 7, TokenId: 71, CreatedAt: at + 2, RequestId: "new-1"})
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 7, TokenId: 72, CreatedAt: at + 9, RequestId: "new-other-token"})
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 8, TokenId: 81, CreatedAt: at + 9, RequestId: "new-1"})

	recent, err := GetLogByTokenId(71)
	require.NoError(t, err)
	require.Equal(t, []string{"new-1", "old-1"}, partnerTenantUsageUnionRequestIds(recent), "both sources, this token only, newest first")
	require.Equal(t, []int{1, 2}, []int{recent[0].Id, recent[1].Id})

	// The recent list stays capped on the union.
	batch := make([]PartnerTenantUsageLog, 0, common.MaxRecentItems+3)
	for i := 0; i < common.MaxRecentItems+3; i++ {
		batch = append(batch, PartnerTenantUsageLog{EventId: fmt.Sprintf("ptu_union_cap_%06d", i), TenantId: 41, AccountId: 411, UserId: 7, TokenId: 71, Type: LogTypeConsume, CreatedAt: at + 100 + int64(i), RequestId: fmt.Sprintf("cap-%d", i)})
	}
	require.NoError(t, db.CreateInBatches(&batch, 200).Error)
	recent, err = GetLogByTokenId(71)
	require.NoError(t, err)
	require.Len(t, recent, common.MaxRecentItems)
	require.Equal(t, fmt.Sprintf("cap-%d", common.MaxRecentItems+2), recent[0].RequestId)
}

func TestPartnerTenantUsageUnionSelfStat(t *testing.T) {
	db := setupPartnerTenantUsageUnionPQ(t, "pt_usage_union_stat_")
	at := partnerTenantUsageQueryStart + 100
	now := time.Now().Unix()
	require.NoError(t, db.Create(&Log{UserId: 7, Username: "member", Type: LogTypeConsume, ModelName: "m-a", TokenName: "tk-a", Group: "g-a", ChannelId: 3, Quota: 100, CreatedAt: at}).Error)
	require.NoError(t, db.Create(&Log{UserId: 9, Username: "ordinary", Type: LogTypeConsume, ModelName: "m-a", Quota: 55, CreatedAt: at}).Error)
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 7, Username: "member", ModelName: "m-a", TokenName: "tk-a", Group: "g-a", ChannelId: 3, Quota: 1000, CreatedAt: at})
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 7, Username: "member", ModelName: "m-b", TokenName: "tk-b", Group: "g-b", ChannelId: 4, Quota: 2000, CreatedAt: at + 900})
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 7, Username: "member", ModelName: "m-a", Type: LogTypeError, Quota: 0, CreatedAt: at})
	// Same username, another user: never part of user 7's statistics.
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 8, Username: "member", ModelName: "m-a", Quota: 5000, CreatedAt: at})

	start, end := partnerTenantUsageQueryStart, partnerTenantUsageQueryEnd
	adminBefore, err := SumUsedQuota(LogTypeConsume, start, end, "", "", "", 0, "")
	require.NoError(t, err)
	require.Equal(t, 155, adminBefore.Quota, "the administrator statistics read logs only")

	cases := []struct {
		name                 string
		start, end           int64
		model, token, group  string
		channel              int
		legacy, dedicatedSum int
	}{
		{"none", start, end, "", "", "", 0, 100, 3000},
		{"model", start, end, "m-b", "", "", 0, 0, 2000},
		{"model pattern", start, end, "m-a%", "", "", 0, 100, 1000},
		{"token name", start, end, "", "tk-a", "", 0, 100, 1000},
		{"group", start, end, "", "", "g-a", 0, 100, 1000},
		{"channel", start, end, "", "", "", 4, 0, 2000},
		{"window", start, at + 500, "", "", "", 0, 100, 1000},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			legacy, err := SumUsedQuota(LogTypeConsume, test.start, test.end, test.model, "member", test.token, test.channel, test.group)
			require.NoError(t, err)
			require.Equal(t, test.legacy, legacy.Quota)
			stat, err := SumUserUsedQuota(7, "member", LogTypeConsume, test.start, test.end, test.model, test.token, test.channel, test.group)
			require.NoError(t, err)
			require.Equal(t, test.legacy+test.dedicatedSum, stat.Quota, "legacy + dedicated")
		})
	}

	// rpm / tpm: only the last 60 seconds, consume rows only, both sources.
	// Deltas, so the assertion does not depend on the runner's clock.
	rateBefore, err := SumUserUsedQuota(7, "member", LogTypeConsume, 0, 0, "", "", 0, "")
	require.NoError(t, err)
	require.NoError(t, db.Create(&Log{UserId: 7, Username: "member", Type: LogTypeConsume, PromptTokens: 1, CompletionTokens: 2, CreatedAt: now}).Error)
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 7, Username: "member", PromptTokens: 3, CompletionTokens: 4, CreatedAt: now})
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 7, Username: "member", Type: LogTypeError, PromptTokens: 50, CreatedAt: now})
	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 8, Username: "member", PromptTokens: 900, CreatedAt: now})
	stat, err := SumUserUsedQuota(7, "member", LogTypeConsume, 0, 0, "", "", 0, "")
	require.NoError(t, err)
	require.Equal(t, []int{2, 10}, []int{stat.Rpm - rateBefore.Rpm, stat.Tpm - rateBefore.Tpm})

	ordinaryLegacy, err := SumUsedQuota(LogTypeConsume, start, end, "", "ordinary", "", 0, "")
	require.NoError(t, err)
	ordinary, err := SumUserUsedQuota(9, "ordinary", LogTypeConsume, start, end, "", "", 0, "")
	require.NoError(t, err)
	require.Equal(t, ordinaryLegacy, ordinary)
	require.Equal(t, 55, ordinary.Quota)
}

func TestPartnerTenantUsageUnionAdministratorReadersUnaffected(t *testing.T) {
	db := setupPartnerTenantUsageUnionPQ(t, "pt_usage_union_admin_")
	at := partnerTenantUsageQueryStart + 100
	require.NoError(t, db.Create(&Log{UserId: 7, Username: "member", Type: LogTypeConsume, Quota: 70, CreatedAt: at, RequestId: "old-1"}).Error)
	require.NoError(t, db.Create(&Log{UserId: 9, Username: "ordinary", Type: LogTypeConsume, Quota: 80, CreatedAt: at, RequestId: "old-2"}).Error)
	filter := LogFilter{StartTimestamp: partnerTenantUsageQueryStart, EndTimestamp: partnerTenantUsageQueryEnd}
	snapshot := func() ([]*Log, int64, Stat, []string) {
		logs, total, err := GetAllLogs(filter, 0, 100)
		require.NoError(t, err)
		stat, err := SumUsedQuota(LogTypeConsume, filter.StartTimestamp, filter.EndTimestamp, "", "", "", 0, "")
		require.NoError(t, err)
		var exported []string
		require.NoError(t, StreamAllLogs(context.Background(), filter, common.RoleRootUser, func(log *Log) error {
			exported = append(exported, fmt.Sprintf("%d:%s", log.Id, log.RequestId))
			return nil
		}))
		return logs, total, stat, exported
	}
	beforeLogs, beforeTotal, beforeStat, beforeExport := snapshot()

	seedPartnerTenantUsageQueryRow(t, db, PartnerTenantUsageLog{TenantId: 41, UserId: 7, Username: "member", Quota: 500, CreatedAt: at, RequestId: "new-1"})
	statements := capturePartnerTenantUsageUnionSQL(t, db)
	afterLogs, afterTotal, afterStat, afterExport := snapshot()
	require.Equal(t, beforeLogs, afterLogs)
	require.Equal(t, beforeTotal, afterTotal)
	require.Equal(t, beforeStat, afterStat)
	require.Equal(t, beforeExport, afterExport)
	require.Empty(t, partnerTenantUsageUnionDedicatedStatements(*statements), "administrator list / stat / export never read the dedicated table")
}
