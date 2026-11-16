package model

import (
	"bytes"
	"errors"
	"log"
	"math"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
	"gorm.io/gorm/schema"
)

// Columns of partner_tenant_usage_logs in declaration order with the DDL type
// the PostgreSQL dialect must emit.
var partnerTenantUsageLogColumns = []struct{ name, postgres string }{
	{"id", "bigserial"}, {"event_id", "varchar(64)"}, {"created_at", "bigint"}, {"type", "bigint"},
	{"tenant_id", "bigint"}, {"account_id", "bigint"}, {"tenant_name", "varchar(64)"}, {"identity_source", "varchar(24)"},
	{"user_id", "bigint"}, {"username", "text"}, {"model_name", "text"}, {"quota", "bigint"},
	{"prompt_tokens", "bigint"}, {"completion_tokens", "bigint"}, {"use_time", "bigint"}, {"is_stream", "boolean"},
	{"channel_id", "bigint"}, {"token_id", "bigint"}, {"token_name", "text"}, {"group", "text"}, {"ip", "text"},
	{"request_id", "varchar(64)"}, {"upstream_request_id", "varchar(128)"}, {"subscription_id", "bigint"},
	{"content", "text"}, {"other", "text"},
}

var partnerTenantUsageLogIndexes = map[string][]string{
	"idx_ptul_time":        {"created_at", "id"},
	"idx_ptul_tenant_time": {"tenant_id", "created_at", "id"},
	"idx_ptul_user_time":   {"user_id", "created_at", "id"},
	"idx_ptul_token_time":  {"token_id", "created_at", "id"},
	"idx_ptul_request":     {"request_id"},
	"ux_ptul_event":        {"event_id"},
}

// Bare task-owned schema (no main-database tables) for a separate log database.
func setupPartnerTenantUsageLogOnlyPQ(t *testing.T, prefix string) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("TEST_PARTNER_USAGE_POSTGRES_DSN")
	require.NotEmpty(t, dsn, "BLOCKED: explicit task-owned Docker/pq DSN required; no SQLite/MySQL/production substitute")
	require.True(t, strings.HasPrefix(prefix, "pt_usage_"), "usage fixtures own the pt_usage_ schema prefix")
	return setupPartnerTenantIsolatedPQ(t, dsn, prefix)
}

// Saves and restores the process-global log database handle and type.
func usePartnerTenantUsageLogDB(t *testing.T, logDB *gorm.DB) {
	t.Helper()
	oldLog, oldLogType := LOG_DB, common.LogDatabaseType()
	LOG_DB = logDB
	t.Cleanup(func() {
		LOG_DB = oldLog
		common.SetLogDatabaseType(oldLogType)
		initCol()
	})
}

func partnerTenantUsageLogSample(requestID string) PartnerTenantUsageLog {
	return PartnerTenantUsageLog{
		CreatedAt: 1794500000, Type: LogTypeConsume,
		TenantId: 11, AccountId: 22, TenantName: "Merchant", IdentitySource: PartnerTenantIdentityExternal,
		UserId: 33, Username: "member", ModelName: "model-a", Quota: 44, PromptTokens: 5, CompletionTokens: 6,
		UseTime: 7, IsStream: true, ChannelId: 8, TokenId: 9, TokenName: "key", Group: "tenant-group",
		Ip: "203.0.113.7", RequestId: requestID, UpstreamRequestId: "up-" + requestID, SubscriptionId: 10,
		Content: "content " + partnerTenantUsageSecretMarker, Other: `{"marker":"` + partnerTenantUsageSecretMarker + `"}`,
	}
}

func partnerTenantUsageLogRowDump(t *testing.T, db *gorm.DB, table string) []string {
	t.Helper()
	rows := make([]string, 0)
	require.NoError(t, db.Raw("SELECT to_jsonb(t)::text FROM "+table+" t ORDER BY 1").Scan(&rows).Error)
	return rows
}

func partnerTenantUsageLogIndexDump(t *testing.T, db *gorm.DB, table string) map[string]string {
	t.Helper()
	var rows []struct {
		Indexname string
		Indexdef  string
	}
	require.NoError(t, db.Raw("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND tablename = ?", table).Scan(&rows).Error)
	indexes := make(map[string]string, len(rows))
	for _, row := range rows {
		indexes[row.Indexname] = row.Indexdef
	}
	return indexes
}

// Actual catalog facts of the migrated table: column types and index columns.
func requirePartnerTenantUsageLogCatalog(t *testing.T, db *gorm.DB) {
	t.Helper()
	var columns []struct {
		ColumnName string
		DataType   string
		MaxLength  int
	}
	require.NoError(t, db.Raw("SELECT column_name, data_type, COALESCE(character_maximum_length, 0) AS max_length FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? ORDER BY ordinal_position", partnerTenantUsageLogTable).Scan(&columns).Error)
	require.Len(t, columns, len(partnerTenantUsageLogColumns))
	for i, want := range partnerTenantUsageLogColumns {
		got := columns[i]
		require.Equal(t, want.name, got.ColumnName)
		switch {
		case want.postgres == "bigserial" || want.postgres == "bigint":
			require.Equal(t, "bigint", got.DataType, want.name)
		case strings.HasPrefix(want.postgres, "varchar("):
			require.Equal(t, "character varying", got.DataType, want.name)
			require.Equal(t, strings.TrimSuffix(strings.TrimPrefix(want.postgres, "varchar("), ")"), strconv.Itoa(got.MaxLength), want.name)
		default:
			require.Equal(t, want.postgres, got.DataType, want.name)
			require.Zero(t, got.MaxLength, want.name)
		}
	}
	indexes := partnerTenantUsageLogIndexDump(t, db, partnerTenantUsageLogTable)
	require.Len(t, indexes, len(partnerTenantUsageLogIndexes)+1)
	require.Contains(t, indexes, partnerTenantUsageLogTable+"_pkey")
	for name, fields := range partnerTenantUsageLogIndexes {
		require.Contains(t, indexes, name)
		require.Contains(t, indexes[name], "("+strings.Join(fields, ", ")+")", name)
		require.Equal(t, strings.HasPrefix(name, "ux_"), strings.Contains(indexes[name], "UNIQUE"), name)
	}
}

// Pure structural guard (no database): explicit columns, dialect DDL types,
// prefixed index names that cannot collide with other LOG_DB models, and no
// credential-bearing column.
func TestPartnerTenantUsageLogSchemaShape(t *testing.T) {
	parse := func(model any) *schema.Schema {
		parsed, err := schema.Parse(model, &sync.Map{}, schema.NamingStrategy{})
		require.NoError(t, err)
		return parsed
	}
	usage := parse(&PartnerTenantUsageLog{})
	require.Equal(t, "partner_tenant_usage_logs", usage.Table)
	require.Len(t, usage.Fields, len(partnerTenantUsageLogColumns))
	pq := postgres.Dialector{Config: &postgres.Config{}}
	for i, want := range partnerTenantUsageLogColumns {
		field := usage.Fields[i]
		require.Equal(t, want.name, field.DBName)
		require.Equal(t, want.postgres, pq.DataTypeOf(field), want.name)
		for _, forbidden := range []string{"external", "secret", "hash", "seed", "key", "password", "credential"} {
			require.NotContains(t, field.DBName, forbidden)
		}
	}
	require.Len(t, usage.PrimaryFields, 1)
	require.Equal(t, "id", usage.PrimaryFields[0].DBName)
	require.True(t, usage.PrimaryFields[0].AutoIncrement)
	require.Zero(t, usage.LookUpField("created_at").AutoCreateTime, "created_at is a copied fact, not an ORM timestamp")

	// MySQL keeps unbounded text for content/other and a bounded key length for
	// every indexed string column.
	my := mysql.Dialector{Config: &mysql.Config{}}
	for column, want := range map[string]string{"content": "longtext", "other": "longtext", "username": "varchar(191)", "group": "varchar(191)", "request_id": "varchar(64)", "event_id": "varchar(64)"} {
		require.Equal(t, want, my.DataTypeOf(usage.LookUpField(column)), column)
	}

	indexes := usage.ParseIndexes()
	require.Len(t, indexes, len(partnerTenantUsageLogIndexes))
	for name, fields := range partnerTenantUsageLogIndexes {
		index, ok := indexes[name]
		require.True(t, ok, name)
		require.LessOrEqual(t, len(name), 63)
		require.True(t, strings.HasPrefix(name, "idx_ptul_") || strings.HasPrefix(name, "ux_ptul_"), name)
		got := make([]string, 0, len(index.Fields))
		for _, field := range index.Fields {
			got = append(got, field.DBName)
		}
		require.Equal(t, fields, got, name)
		require.Equal(t, strings.HasPrefix(name, "ux_"), index.Class == "UNIQUE", name)
	}
	require.NotContains(t, indexes, "idx_ptul_request_unique")
	require.Empty(t, indexes["idx_ptul_request"].Class, "request_id is shared by retries and must not be unique")
	for _, other := range []any{&Log{}, &AuditLog{}, &PartnerOauthAuthorizationLog{}} {
		for name := range parse(other).ParseIndexes() {
			require.NotContains(t, indexes, name, "index name collides with another LOG_DB model")
		}
	}
}

// Generated-SQL contract only: no live ClickHouse is involved.
func TestPartnerTenantUsageLogClickHouseDDL(t *testing.T) {
	create := partnerTenantUsageLogClickHouseCreateTableSQL(0)
	require.Contains(t, create, "CREATE TABLE IF NOT EXISTS partner_tenant_usage_logs (")
	require.Contains(t, create, "ENGINE = MergeTree()")
	require.Contains(t, create, "PARTITION BY toYYYYMM(toDateTime(created_at))")
	require.Contains(t, create, "ORDER BY (created_at, event_id)")
	require.NotContains(t, create, "TTL")
	for _, column := range []string{"id", "created_at", "tenant_id", "account_id", "user_id", "quota", "prompt_tokens", "completion_tokens", "use_time", "channel_id", "token_id", "subscription_id"} {
		require.Contains(t, create, "\t"+column+" Int64 DEFAULT 0", column)
	}
	for _, column := range []string{"event_id", "tenant_name", "identity_source", "username", "model_name", "token_name", "`group`", "ip", "request_id", "upstream_request_id", "content", "other"} {
		require.Contains(t, create, "\t"+column+" String DEFAULT ''", column)
	}
	require.Contains(t, create, "\ttype Int32 DEFAULT 0")
	require.Contains(t, create, "\tis_stream UInt8 DEFAULT 0")
	// Every model column is declared exactly once.
	for _, column := range partnerTenantUsageLogColumns {
		name := column.name
		if name == "group" {
			name = "`group`"
		}
		require.Equal(t, 1, strings.Count(create, "\t"+name+" "), name)
	}
	require.Equal(t, len(partnerTenantUsageLogColumns), strings.Count(create, " DEFAULT "))

	withTTL := partnerTenantUsageLogClickHouseCreateTableSQL(30)
	require.True(t, strings.HasSuffix(withTTL, "ORDER BY (created_at, event_id)\nTTL toDateTime(created_at) + INTERVAL 30 DAY DELETE"))
	require.True(t, clickHouseCreateTableHasTTL(withTTL))
	require.False(t, clickHouseCreateTableHasTTL(create))

	require.Equal(t, "ALTER TABLE partner_tenant_usage_logs MODIFY TTL toDateTime(created_at) + INTERVAL 30 DAY DELETE", partnerTenantUsageLogClickHouseTTLStatement(30, false))
	require.Equal(t, "ALTER TABLE partner_tenant_usage_logs MODIFY TTL toDateTime(created_at) + INTERVAL 7 DAY DELETE", partnerTenantUsageLogClickHouseTTLStatement(7, true))
	require.Equal(t, "ALTER TABLE partner_tenant_usage_logs REMOVE TTL", partnerTenantUsageLogClickHouseTTLStatement(0, true))
	require.Equal(t, "ALTER TABLE partner_tenant_usage_logs REMOVE TTL", partnerTenantUsageLogClickHouseTTLStatement(-1, true))
	require.Empty(t, partnerTenantUsageLogClickHouseTTLStatement(0, false))
	require.Equal(t, "SHOW CREATE TABLE partner_tenant_usage_logs", partnerTenantUsageLogClickHouseShowCreateSQL())
	// The default logs statements are untouched by the new table.
	require.Contains(t, clickHouseLogCreateTableSQL(0), "CREATE TABLE IF NOT EXISTS logs (")
	require.NotContains(t, clickHouseLogCreateTableSQL(0), "partner_tenant_usage_logs")
}

// No database: a missing log database and an invalid row are rejected with
// fixed errors before any write.
func TestPartnerTenantUsageLogInsertRejectsWithoutDatabase(t *testing.T) {
	oldLog := LOG_DB
	LOG_DB = nil
	t.Cleanup(func() { LOG_DB = oldLog })
	row := partnerTenantUsageLogSample("req-nil")
	require.ErrorIs(t, insertPartnerTenantUsageLog(&row), ErrPartnerTenantUsageLogUnavailable)
	require.Empty(t, row.EventId)
	require.ErrorIs(t, MigratePartnerTenantUsageLogs(), ErrPartnerTenantUsageLogUnavailable)
	require.ErrorIs(t, insertPartnerTenantUsageLog(nil), ErrPartnerTenantUsageLogInvalid)
	for _, err := range []error{ErrPartnerTenantUsageLogInvalid, ErrPartnerTenantUsageLogUnavailable, ErrPartnerTenantUsageLogWrite} {
		require.NotContains(t, err.Error(), partnerTenantUsageSecretMarker)
		require.Nil(t, errors.Unwrap(err))
	}
}

// Shared LOG_DB = DB through the real InitLogDB branch, in a schema that already
// holds main tables, logs with rows and the other LOG_DB tables: no index-name
// collision, no historical move, repeat migration preserves rows.
func TestPartnerTenantUsageLogMigrationSharedDatabase(t *testing.T) {
	db := setupPartnerTenantUsagePQ(t, "pt_usage_log_shared_")
	usePartnerTenantUsageLogDB(t, db)
	require.NoError(t, db.AutoMigrate(&Log{}))
	require.NoError(t, MigrateAuditLogs())
	require.NoError(t, MigratePartnerOAuthAuthorizationLogs())
	// Upgrade: default logs already hold merchant-looking history.
	for i, logType := range []int{LogTypeConsume, LogTypeError, LogTypeTopup} {
		require.NoError(t, db.Create(&Log{UserId: 33, CreatedAt: int64(1794400000 + i), Type: logType, Content: "legacy " + partnerTenantUsageSecretMarker, Username: "member", ModelName: "model-a", Quota: 100 + i, TokenId: 9, Group: "tenant-group", RequestId: "legacy-" + strconv.Itoa(i), Other: `{"legacy":true}`}).Error)
	}
	logsBefore := partnerTenantUsageLogRowDump(t, db, "logs")
	logIndexesBefore := partnerTenantUsageLogIndexDump(t, db, "logs")
	require.Len(t, logsBefore, 3)
	require.False(t, db.Migrator().HasTable(partnerTenantUsageLogTable))

	t.Setenv("LOG_SQL_DSN", "")
	oldMaster := common.IsMasterNode
	common.IsMasterNode = true
	t.Cleanup(func() { common.IsMasterNode = oldMaster })
	for range 2 {
		require.NoError(t, InitLogDB())
	}
	require.Same(t, DB, LOG_DB)
	require.True(t, db.Migrator().HasTable(partnerTenantUsageLogTable))
	requirePartnerTenantUsageLogCatalog(t, db)
	require.Equal(t, logsBefore, partnerTenantUsageLogRowDump(t, db, "logs"), "default logs must be byte-for-byte unchanged")
	require.Equal(t, logIndexesBefore, partnerTenantUsageLogIndexDump(t, db, "logs"))
	require.Empty(t, partnerTenantUsageLogRowDump(t, db, partnerTenantUsageLogTable), "no historical row is moved or copied")

	row := partnerTenantUsageLogSample("shared-1")
	require.NoError(t, insertPartnerTenantUsageLog(&row))
	usageBefore := partnerTenantUsageLogRowDump(t, db, partnerTenantUsageLogTable)
	require.Len(t, usageBefore, 1)
	for range 2 {
		require.NoError(t, MigratePartnerTenantUsageLogs())
	}
	require.NoError(t, InitLogDB())
	require.Equal(t, usageBefore, partnerTenantUsageLogRowDump(t, db, partnerTenantUsageLogTable))
	require.Equal(t, logsBefore, partnerTenantUsageLogRowDump(t, db, "logs"), "the insert must not write the default table")
	requirePartnerTenantUsageLogCatalog(t, db)
}

// Separate log database through the real migrateLOGDB path: the table exists
// only in the log schema and repeat migration preserves rows.
func TestPartnerTenantUsageLogMigrationSeparateLogDatabase(t *testing.T) {
	main := setupPartnerTenantUsagePQ(t, "pt_usage_log_main_")
	logs := setupPartnerTenantUsageLogOnlyPQ(t, "pt_usage_log_separate_")
	DB = main // The second fixture pointed DB at the log schema; both are restored on cleanup.
	usePartnerTenantUsageLogDB(t, logs)
	require.NoError(t, main.AutoMigrate(&Log{}))
	require.NoError(t, main.Create(&Log{UserId: 33, CreatedAt: 1794400000, Type: LogTypeConsume, Content: "stale main copy", RequestId: "main-legacy"}).Error)
	mainLogsBefore := partnerTenantUsageLogRowDump(t, main, "logs")

	for range 2 {
		require.NoError(t, migrateLOGDB())
	}
	require.True(t, logs.Migrator().HasTable(partnerTenantUsageLogTable))
	require.True(t, logs.Migrator().HasTable(&Log{}))
	require.False(t, main.Migrator().HasTable(partnerTenantUsageLogTable), "a separate LOG_DB must not create the table in the main database")
	requirePartnerTenantUsageLogCatalog(t, logs)
	require.Empty(t, partnerTenantUsageLogRowDump(t, logs, partnerTenantUsageLogTable))
	require.Empty(t, partnerTenantUsageLogRowDump(t, logs, "logs"))

	row := partnerTenantUsageLogSample("separate-1")
	require.NoError(t, insertPartnerTenantUsageLog(&row))
	usageBefore := partnerTenantUsageLogRowDump(t, logs, partnerTenantUsageLogTable)
	require.Len(t, usageBefore, 1)
	require.NoError(t, migrateLOGDB())
	require.Equal(t, usageBefore, partnerTenantUsageLogRowDump(t, logs, partnerTenantUsageLogTable))
	require.Empty(t, partnerTenantUsageLogRowDump(t, logs, "logs"))
	require.Equal(t, mainLogsBefore, partnerTenantUsageLogRowDump(t, main, "logs"))
	require.False(t, main.Migrator().HasTable(partnerTenantUsageLogTable))
}

func TestPartnerTenantUsageLogPersistence(t *testing.T) {
	db := setupPartnerTenantUsagePQ(t, "pt_usage_log_persist_")
	usePartnerTenantUsageLogDB(t, db)
	require.NoError(t, db.AutoMigrate(&Log{}))
	require.NoError(t, MigratePartnerTenantUsageLogs())
	const beyondFloat = int64(1)<<53 + 1 // 9007199254740993 is not a float64 integer.

	t.Run("64-bit columns and long text read back exactly", func(t *testing.T) {
		row := PartnerTenantUsageLog{
			Id: 777, EventId: "caller-supplied", CreatedAt: beyondFloat + 2, Type: LogTypeConsume,
			TenantId: math.MaxInt64, AccountId: beyondFloat + 4, TenantName: "商户", IdentitySource: PartnerTenantIdentitySubscriptionKey,
			UserId: beyondFloat + 6, Username: "member", ModelName: "model-a", Quota: math.MaxInt64 - 1,
			PromptTokens: beyondFloat + 8, CompletionTokens: beyondFloat + 10, UseTime: beyondFloat + 12, IsStream: true,
			ChannelId: beyondFloat + 14, TokenId: beyondFloat + 16, TokenName: "key", Group: "tenant-group", Ip: "2001:db8::1",
			RequestId: "big-1", UpstreamRequestId: "up-big-1", SubscriptionId: beyondFloat + 18,
			Content: strings.Repeat("c", 64*1024+17), Other: `{"pad":"` + strings.Repeat("o", 64*1024+33) + `"}`,
		}
		require.NoError(t, insertPartnerTenantUsageLog(&row))
		require.NotEqual(t, int64(777), row.Id, "the local id is assigned by the table")
		require.Positive(t, row.Id)
		require.True(t, strings.HasPrefix(row.EventId, "ptu_"))
		require.Len(t, row.EventId, 36)
		var got PartnerTenantUsageLog
		require.NoError(t, db.Where("event_id = ?", row.EventId).First(&got).Error)
		require.Equal(t, row, got)
		// The numeric text PostgreSQL holds, independent of Go scanning.
		var text struct{ TenantId, Quota, SubscriptionId, UserId string }
		require.NoError(t, db.Raw("SELECT tenant_id::text AS tenant_id, quota::text AS quota, subscription_id::text AS subscription_id, user_id::text AS user_id FROM partner_tenant_usage_logs WHERE id = ?", row.Id).Scan(&text).Error)
		require.Equal(t, "9223372036854775807", text.TenantId)
		require.Equal(t, "9223372036854775806", text.Quota)
		require.Equal(t, "9007199254741011", text.SubscriptionId)
		require.Equal(t, "9007199254740999", text.UserId)
		// The local primary key column itself is 64-bit.
		manual := partnerTenantUsageLogSample("big-id")
		manual.Id, manual.EventId = beyondFloat, "ptu_manual_big_id"
		require.NoError(t, db.Create(&manual).Error)
		var reread PartnerTenantUsageLog
		require.NoError(t, db.First(&reread, "id = ?", beyondFloat).Error)
		require.Equal(t, manual, reread)
	})

	t.Run("retries share a request id and keep distinct events", func(t *testing.T) {
		first, second := partnerTenantUsageLogSample("retry-1"), partnerTenantUsageLogSample("retry-1")
		first.Type, first.Quota = LogTypeError, 0
		second.EventId = "duplicate"
		require.NoError(t, insertPartnerTenantUsageLog(&first))
		require.NoError(t, insertPartnerTenantUsageLog(&second))
		require.NotEmpty(t, first.EventId)
		require.NotEmpty(t, second.EventId)
		require.NotEqual(t, first.EventId, second.EventId)
		require.NotEqual(t, first.Id, second.Id)
		var rows []PartnerTenantUsageLog
		require.NoError(t, db.Where("request_id = ?", "retry-1").Order("id").Find(&rows).Error)
		require.Len(t, rows, 2)
		require.Equal(t, []int{LogTypeError, LogTypeConsume}, []int{rows[0].Type, rows[1].Type})
		// The event identity is unique even though request_id is not.
		clash := partnerTenantUsageLogSample("retry-2")
		clash.EventId = first.EventId
		require.Error(t, db.Session(&gorm.Session{Logger: gormlogger.Default.LogMode(gormlogger.Silent)}).Create(&clash).Error)
	})

	t.Run("a zero created_at is stamped and zero-valued facts persist", func(t *testing.T) {
		row := PartnerTenantUsageLog{Type: LogTypeError, TenantId: 1, AccountId: 1, UserId: 1, RequestId: "zero-1"}
		before := common.GetTimestamp()
		require.NoError(t, insertPartnerTenantUsageLog(&row))
		require.GreaterOrEqual(t, row.CreatedAt, before)
		var got PartnerTenantUsageLog
		require.NoError(t, db.Where("event_id = ?", row.EventId).First(&got).Error)
		require.Equal(t, row, got)
		require.Zero(t, got.SubscriptionId, "an unknown subscription stays zero")
		require.False(t, got.IsStream)
		// A missing request id is generated, as createLog does for logs.
		anonymous := PartnerTenantUsageLog{Type: LogTypeError, TenantId: 1, AccountId: 1, UserId: 1}
		require.NoError(t, insertPartnerTenantUsageLog(&anonymous))
		require.NotEmpty(t, anonymous.RequestId)
		require.NotEqual(t, anonymous.RequestId, anonymous.EventId)
	})

	t.Run("invalid rows never reach the table", func(t *testing.T) {
		var before int64
		require.NoError(t, db.Model(&PartnerTenantUsageLog{}).Count(&before).Error)
		for name, mutate := range map[string]func(*PartnerTenantUsageLog){
			"no tenant":    func(row *PartnerTenantUsageLog) { row.TenantId = 0 },
			"no account":   func(row *PartnerTenantUsageLog) { row.AccountId = 0 },
			"no user":      func(row *PartnerTenantUsageLog) { row.UserId = 0 },
			"topup type":   func(row *PartnerTenantUsageLog) { row.Type = LogTypeTopup },
			"refund type":  func(row *PartnerTenantUsageLog) { row.Type = LogTypeRefund },
			"unknown type": func(row *PartnerTenantUsageLog) { row.Type = LogTypeUnknown },
		} {
			row := partnerTenantUsageLogSample("invalid")
			mutate(&row)
			require.ErrorIs(t, insertPartnerTenantUsageLog(&row), ErrPartnerTenantUsageLogInvalid, name)
			require.Empty(t, row.EventId, name)
		}
		var after, logRows int64
		require.NoError(t, db.Model(&PartnerTenantUsageLog{}).Count(&after).Error)
		require.Equal(t, before, after)
		require.NoError(t, db.Model(&Log{}).Count(&logRows).Error)
		require.Zero(t, logRows, "nothing is ever written to the default table")
	})
}

// A DEBUG-level log database handle must not leak content/other through SQL
// diagnostics, and a failed write returns a fixed error with no fallback.
func TestPartnerTenantUsageLogInsertRedaction(t *testing.T) {
	db := setupPartnerTenantUsagePQ(t, "pt_usage_log_redact_")
	usePartnerTenantUsageLogDB(t, db)
	require.NoError(t, db.AutoMigrate(&Log{}))
	require.NoError(t, MigratePartnerTenantUsageLogs())
	var statements bytes.Buffer
	LOG_DB = db.Session(&gorm.Session{Logger: gormlogger.New(log.New(&statements, "", 0), gormlogger.Config{LogLevel: gormlogger.Info})})

	// Positive control: this handle really prints interpolated SQL.
	var probe int64
	require.NoError(t, LOG_DB.Model(&PartnerTenantUsageLog{}).Where("request_id = ?", "control-probe").Count(&probe).Error)
	require.Contains(t, statements.String(), "control-probe")
	statements.Reset()

	row := partnerTenantUsageLogSample("redact-1")
	require.NoError(t, insertPartnerTenantUsageLog(&row))
	require.Empty(t, statements.String(), "the insert must not emit any SQL diagnostic")

	// A driver failure whose text carries the marker.
	fail := false
	name := "pt_usage_log_fail_" + strconv.FormatInt(time.Now().UnixNano(), 10)
	require.NoError(t, db.Callback().Create().Before("gorm:create").Register(name, func(tx *gorm.DB) {
		if fail {
			_ = tx.AddError(errors.New("forced failure near " + partnerTenantUsageSecretMarker))
		}
	}))
	t.Cleanup(func() { _ = db.Callback().Create().Remove(name) })
	fail = true
	forced := partnerTenantUsageLogSample("redact-2")
	err := insertPartnerTenantUsageLog(&forced)
	fail = false
	require.ErrorIs(t, err, ErrPartnerTenantUsageLogWrite)
	require.NotContains(t, err.Error(), partnerTenantUsageSecretMarker)
	require.Nil(t, errors.Unwrap(err))

	// A real PostgreSQL rejection (value longer than the column).
	tooLong := partnerTenantUsageLogSample(strings.Repeat("r", 65))
	err = insertPartnerTenantUsageLog(&tooLong)
	require.ErrorIs(t, err, ErrPartnerTenantUsageLogWrite)
	require.NotContains(t, err.Error(), partnerTenantUsageSecretMarker)
	require.NotContains(t, err.Error(), "rrrr")
	require.NotContains(t, strings.ToUpper(err.Error()), "INSERT")
	require.Empty(t, statements.String(), "failed writes must stay silent as well")

	// No fallback and no dual write: only the first row exists, logs stays empty.
	var usageRows, logRows int64
	require.NoError(t, db.Model(&PartnerTenantUsageLog{}).Count(&usageRows).Error)
	require.EqualValues(t, 1, usageRows)
	require.NoError(t, db.Model(&Log{}).Count(&logRows).Error)
	require.Zero(t, logRows)
	var stored []string
	require.NoError(t, db.Model(&PartnerTenantUsageLog{}).Pluck("request_id", &stored).Error)
	sort.Strings(stored)
	require.Equal(t, []string{"redact-1"}, stored)
}
