package model

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// TestIQPostgresMigrationAndConfigRoundTrip requires a disposable PostgreSQL
// test DSN. It isolates all objects in a unique schema, never the public schema.
func TestIQPostgresMigrationAndConfigRoundTrip(t *testing.T) {
	dsn := os.Getenv("TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured")
	}
	admin, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{})
	require.NoError(t, err)
	adminSQL, err := admin.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = adminSQL.Close() })
	schemaName := fmt.Sprintf("iq_hotfix_%d", time.Now().UnixNano())
	require.NoError(t, admin.Exec("CREATE SCHEMA "+schemaName).Error)
	t.Cleanup(func() { require.NoError(t, admin.Exec("DROP SCHEMA "+schemaName+" CASCADE").Error) })
	scopedDSN := dsn
	if strings.HasPrefix(dsn, "postgres://") || strings.HasPrefix(dsn, "postgresql://") {
		parsed, err := url.Parse(dsn)
		require.NoError(t, err)
		query := parsed.Query()
		query.Set("search_path", schemaName)
		parsed.RawQuery = query.Encode()
		scopedDSN = parsed.String()
	} else {
		scopedDSN += " search_path=" + schemaName
	}
	db, err := gorm.Open(postgres.New(postgres.Config{DSN: scopedDSN, PreferSimpleProtocol: true}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	oldDB := DB
	oldMain, oldLog := common.MainDatabaseType(), common.LogDatabaseType()
	DB = db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	initCol()
	t.Cleanup(func() {
		DB = oldDB
		common.SetDatabaseTypes(oldMain, oldLog)
		initCol()
		_ = sqlDB.Close()
	})
	var currentSchema string
	require.NoError(t, db.Raw("SELECT current_schema()").Scan(&currentSchema).Error)
	require.Equal(t, schemaName, currentSchema, "never migrate outside the disposable test schema")
	var version string
	require.NoError(t, db.Raw("SHOW server_version").Scan(&version).Error)
	t.Logf("Live PostgreSQL version: %s", version)

	// Reproduce the deployed definition's actual server rejection, not just
	// a string assertion about what a dialect would generate.
	err = db.Exec("CREATE TABLE iq_legacy_targets (targets varchar(16777215))").Error
	require.ErrorContains(t, err, "SQLSTATE 22023")
	models := []any{&IQConfig{}, &IQBatch{}, &IQAttempt{}, &IQResult{}, &SystemTask{}, &SystemTaskLock{}}
	require.NoError(t, db.AutoMigrate(models...))
	var columnType string
	require.NoError(t, db.Raw("SELECT data_type FROM information_schema.columns WHERE table_schema = ? AND table_name = 'iq_configs' AND column_name = 'targets'", schemaName).Scan(&columnType).Error)
	require.Equal(t, "text", columnType)
	cfg, err := GetIQConfig()
	require.NoError(t, err)
	require.False(t, cfg.Enabled)
	// Simulate an existing installation without the optional effort column.
	require.NoError(t, db.Migrator().DropColumn(&IQConfig{}, "ReasoningEffort"))
	require.NoError(t, db.Migrator().DropColumn(&IQConfig{}, "Prompts"))
	require.NoError(t, db.Migrator().DropColumn(&IQConfig{}, "Group"))
	require.NoError(t, db.Migrator().DropColumn(&IQConfig{}, "Deleted"))
	require.NoError(t, db.Migrator().DropColumn(&IQConfig{}, "SortOrder"))
	require.NoError(t, db.AutoMigrate(models...))
	cfg, err = GetIQConfig()
	require.NoError(t, err)
	require.Empty(t, cfg.ReasoningEffort)
	require.False(t, cfg.Deleted, "upgraded plans remain visible by default")
	require.Zero(t, cfg.SortOrder, "existing plans use deterministic name order")
	cfg.Prompt = " exact saved PostgreSQL prompt\n"
	cfg.ReasoningEffort = "xhigh"
	cfg.Targets = []IQTarget{{Group: "fixture", Models: []string{"model-a", "model-b"}}}
	saved, err := SaveIQConfig(*cfg, 42, time.Now())
	require.NoError(t, err)
	// A second startup migration must preserve the saved JSON and exact prompt.
	require.NoError(t, db.AutoMigrate(models...))
	reloaded, err := GetIQConfig()
	require.NoError(t, err)
	require.Equal(t, saved.Version, reloaded.Version)
	require.Equal(t, saved.Prompt, reloaded.Prompt)
	require.Equal(t, "xhigh", reloaded.ReasoningEffort)
	require.Equal(t, saved.Targets, reloaded.Targets)
	require.False(t, reloaded.Enabled)
	groups, err := ListIQConfigs()
	require.NoError(t, err)
	require.Len(t, groups, 1)
	group := groups[0]
	group.Prompts = IQPrompts{" exact first PostgreSQL prompt\n", "second prompt"}
	groupSaved, err := SaveIQConfig(group, 42, time.Now())
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(models...))
	groupReloaded, err := GetIQGroupConfig("fixture")
	require.NoError(t, err)
	require.Equal(t, groupSaved.Prompts, groupReloaded.Prompts)
	require.Equal(t, groupSaved.ID, groupReloaded.ID)
	require.Equal(t, groupSaved.Group, groupReloaded.Group)
	other, err := GetIQGroupConfig("order-fixture")
	require.NoError(t, err)
	other, err = SaveIQConfig(*other, 42, time.Now())
	require.NoError(t, err)
	// Upgrade real saved group rows, not only the legacy template row.
	require.NoError(t, db.Migrator().DropColumn(&IQConfig{}, "SortOrder"))
	require.NoError(t, db.AutoMigrate(models...))
	legacyOrder, err := ListIQConfigs()
	require.NoError(t, err)
	for _, cfg := range legacyOrder {
		require.Zero(t, cfg.SortOrder)
	}
	require.NoError(t, SaveIQGroupOrder([]string{"order-fixture", "fixture"}, []string{"fixture", "order-fixture"}))
	require.NoError(t, db.AutoMigrate(models...))
	ordered, err := ListIQConfigs()
	require.NoError(t, err)
	require.Equal(t, "order-fixture", ordered[0].Group)
	require.Equal(t, 2, ordered[1].SortOrder)
	// Real row locking serializes two editors that observed the same order.
	saves := make(chan error, 2)
	for i := 0; i < 2; i++ {
		go func() {
			saves <- SaveIQGroupOrder([]string{"fixture", "order-fixture"}, []string{"order-fixture", "fixture"})
		}()
	}
	succeeded, conflicted := 0, 0
	for i := 0; i < 2; i++ {
		err := <-saves
		if err == nil {
			succeeded++
		} else if errors.Is(err, ErrIQConflict) {
			conflicted++
		} else {
			require.NoError(t, err)
		}
	}
	require.Equal(t, 1, succeeded)
	require.Equal(t, 1, conflicted)
	require.NoError(t, DeleteIQGroupConfig(other.Group, other.Version, time.Now()))
	result := IQResult{ID: "pg-plan-result", Group: "fixture", Model: "model-a", TaskID: "pg-plan-run", RunSeq: 1, Status: "success", Artifact: "<svg>retained</svg>"}
	require.NoError(t, db.Create(&result).Error)
	latest, err := ListIQLatestResults([]string{"fixture"})
	require.NoError(t, err)
	require.Len(t, latest, 1)
	require.Equal(t, result.ID, latest[0].ID)
	require.Empty(t, latest[0].Artifact)
	require.NoError(t, DeleteIQGroupConfig("fixture", groupReloaded.Version, time.Now()))
	require.NoError(t, db.AutoMigrate(models...))
	groups, err = ListIQConfigs()
	require.NoError(t, err)
	require.Empty(t, groups, "startup migration must not resurrect deleted plans")
	recreated, err := GetIQGroupConfig("fixture")
	require.NoError(t, err)
	require.Zero(t, recreated.Version)
	recreated.Targets = groupSaved.Targets
	recreated, err = SaveIQConfig(*recreated, 42, time.Now())
	require.NoError(t, err)
	require.Greater(t, recreated.Version, groupReloaded.Version)
	require.ErrorIs(t, DeleteIQGroupConfig("fixture", groupReloaded.Version, time.Now()), ErrIQConflict)
	kept, err := GetIQResult(result.ID)
	require.NoError(t, err)
	require.Equal(t, result.Artifact, kept.Artifact)
	t.Log("PostgreSQL migration, repeat migration, targets TEXT, concurrent group ordering, plan deletion/recreation and config round trip passed")
}

func TestIQSchemaPortableTextColumns(t *testing.T) {
	cases := []struct {
		name    string
		dialect gorm.Dialector
		want    string
	}{
		{"postgres", postgres.New(postgres.Config{DSN: "host=127.0.0.1 port=1 dbname=iq_schema_test sslmode=disable", PreferSimpleProtocol: true}), "text"},
		{"mysql", mysql.New(mysql.Config{DSN: "iq_test@tcp(127.0.0.1:1)/iq_schema_test", SkipInitializeWithVersion: true}), "mediumtext"},
		{"sqlite", sqlite.Open(":memory:"), "text"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// Use the real dialect's migration type resolver without contacting
			// a server. SQLite alone does not enforce PostgreSQL varchar limits.
			db, err := gorm.Open(tc.dialect, &gorm.Config{DisableAutomaticPing: true})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			t.Cleanup(func() { _ = sqlDB.Close() })
			for _, column := range []struct {
				value any
				field string
			}{
				{&IQConfig{}, "Targets"},
				{&IQConfig{}, "Prompt"},
				{&IQConfig{}, "Prompts"},
				{&IQBatch{}, "Snapshot"},
				{&IQResult{}, "Artifact"},
			} {
				statement := &gorm.Statement{DB: db}
				require.NoError(t, statement.Parse(column.value))
				field := statement.Schema.LookUpField(column.field)
				require.NotNil(t, field)
				sqlType := strings.ToLower(db.Migrator().FullDataTypeOf(field).SQL)
				require.Equal(t, tc.want, sqlType, "%s.%s", statement.Schema.Table, field.DBName)
				t.Logf("%s.%s: %s", statement.Schema.Table, field.DBName, sqlType)
			}
		})
	}
}
