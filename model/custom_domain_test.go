package model

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	mysqldriver "github.com/go-sql-driver/mysql"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	gormmysql "gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func TestNormalizeCustomDomainLabelAcceptsOneDNSLabelAndRejectsReservedOrMalformedValues(t *testing.T) {
	reserved := map[string]struct{}{
		"admin": {},
		"www":   {},
	}

	label, err := NormalizeCustomDomainLabel("  Customer-42  ", reserved)
	require.NoError(t, err)
	assert.Equal(t, "customer-42", label)

	for _, input := range []string{"", "-customer", "customer-", "customer.domain", "customer_42", strings.Repeat("a", 64)} {
		_, err := NormalizeCustomDomainLabel(input, reserved)
		assert.ErrorIs(t, err, ErrCustomDomainInvalidLabel, input)
	}

	_, err = NormalizeCustomDomainLabel("WWW", reserved)
	assert.ErrorIs(t, err, ErrCustomDomainReservedLabel)
}

func TestCustomDomainLifecycleKeepsTombstoneOwnerAndAllowsOnlyOneActiveDomain(t *testing.T) {
	truncateTables(t)
	t.Cleanup(func() { DB.Exec("DELETE FROM custom_domains") })

	ownerA := User{Username: "custom-domain-owner-a", AffCode: "custom-domain-aff-a", Status: common.UserStatusEnabled}
	ownerB := User{Username: "custom-domain-owner-b", AffCode: "custom-domain-aff-b", Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(&ownerA).Error)
	require.NoError(t, DB.Create(&ownerB).Error)

	alpha, err := CreateCustomDomain("Alpha", ownerA.Id)
	require.NoError(t, err)
	assert.Equal(t, "alpha", alpha.Label)
	assert.False(t, alpha.Enabled)
	assert.Nil(t, alpha.ActiveOwnerID)

	alpha, err = EnableCustomDomain("alpha")
	require.NoError(t, err)
	assert.True(t, alpha.Enabled)
	require.NotNil(t, alpha.ActiveOwnerID)
	assert.Equal(t, ownerA.Id, *alpha.ActiveOwnerID)

	_, err = CreateCustomDomain("Beta", ownerA.Id)
	require.NoError(t, err)
	_, err = EnableCustomDomain("beta")
	assert.ErrorIs(t, err, ErrCustomDomainOwnerAlreadyActive)

	alpha, err = DisableCustomDomain("alpha")
	require.NoError(t, err)
	assert.False(t, alpha.Enabled)
	assert.Nil(t, alpha.ActiveOwnerID)
	require.NotNil(t, alpha.DisabledAt)

	beta, err := EnableCustomDomain("beta")
	require.NoError(t, err)
	assert.True(t, beta.Enabled)

	_, err = CreateCustomDomain("alpha", ownerB.Id)
	assert.ErrorIs(t, err, ErrCustomDomainAlreadyAssigned)

	persisted, err := GetCustomDomainByLabel("ALPHA")
	require.NoError(t, err)
	assert.Equal(t, ownerA.Id, persisted.OwnerUserID)
}

func TestCustomDomainDuplicateKeyDetectionUsesTheCurrentDatabaseDialect(t *testing.T) {
	truncateTables(t)
	owner := User{Username: "duplicate-domain-owner", AffCode: "duplicate-domain-aff", Status: common.UserStatusEnabled}
	require.NoError(t, DB.Create(&owner).Error)
	require.NoError(t, DB.Create(&CustomDomain{Label: "duplicate", OwnerUserID: owner.Id}).Error)
	err := DB.Create(&CustomDomain{Label: "duplicate", OwnerUserID: owner.Id}).Error
	require.Error(t, err)
	assert.False(t, errors.Is(err, gorm.ErrDuplicatedKey), "the test database intentionally leaves global GORM translation disabled")
	assert.True(t, isDatabaseDuplicatedKey(DB, err))
	assert.True(t, isDatabaseDuplicatedKey(DB, &mysqldriver.MySQLError{Number: 1062, Message: "duplicate"}))
	assert.False(t, isDatabaseDuplicatedKey(DB, errors.New("database unavailable")))
}

func testCustomDomainActiveOwnerMigrationNonPostgreSQL(t *testing.T, db *gorm.DB) {
	t.Helper()
	tableName := fmt.Sprintf("custom_domain_migration_%d", time.Now().UnixNano())
	t.Cleanup(func() { _ = db.Migrator().DropTable(tableName) })

	tableDB := db.Table(tableName)
	require.NoError(t, tableDB.AutoMigrate(&CustomDomain{}))
	ownerID := 7
	original := CustomDomain{Label: "preserved", OwnerUserID: ownerID, ActiveOwnerID: &ownerID, Enabled: true}
	require.NoError(t, tableDB.Create(&original).Error)

	for range 2 {
		require.NoError(t, migrateCustomDomainActiveOwnerUniqueness(db))
		require.NoError(t, tableDB.AutoMigrate(&CustomDomain{}))
	}

	var preserved CustomDomain
	require.NoError(t, tableDB.First(&preserved, original.Id).Error)
	assert.Equal(t, original.Label, preserved.Label)
	assert.Equal(t, original.OwnerUserID, preserved.OwnerUserID)
	assert.True(t, tableDB.Migrator().HasIndex(&CustomDomain{}, customDomainActiveOwnerIndex))
}

func TestMigrateCustomDomainActiveOwnerUniquenessSQLite(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	testCustomDomainActiveOwnerMigrationNonPostgreSQL(t, db)
}

func TestMigrateCustomDomainActiveOwnerUniquenessMySQL(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TEST_MYSQL_DSN"))
	if dsn == "" {
		t.Skip("TEST_MYSQL_DSN is not configured")
	}

	db, err := gorm.Open(gormmysql.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, sqlDB.Close()) })
	testCustomDomainActiveOwnerMigrationNonPostgreSQL(t, db)
}

func TestMigrateCustomDomainActiveOwnerUniquenessPostgreSQL(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("TEST_POSTGRES_DSN"))
	if dsn == "" {
		t.Skip("TEST_POSTGRES_DSN is not configured")
	}

	db, err := gorm.Open(postgres.New(postgres.Config{
		DSN:                  dsn,
		PreferSimpleProtocol: true,
	}), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, sqlDB.Close()) })

	for _, test := range []struct {
		name          string
		prepareLegacy func(*testing.T, *gorm.DB)
		expectedError string
	}{
		{name: "fresh_database"},
		{
			name: "production_constraint_and_target_index",
			prepareLegacy: func(t *testing.T, tx *gorm.DB) {
				t.Helper()
				require.NoError(t, tx.Exec(
					"ALTER TABLE ? ADD CONSTRAINT ? UNIQUE (?)",
					clause.Table{Name: "custom_domains"},
					clause.Column{Name: legacyCustomDomainActiveOwnerConstraint},
					clause.Column{Name: "active_owner_id"},
				).Error)
			},
		},
		{
			name: "legacy_constraint_without_target_index",
			prepareLegacy: func(t *testing.T, tx *gorm.DB) {
				t.Helper()
				require.NoError(t, tx.Migrator().DropIndex(&CustomDomain{}, customDomainActiveOwnerIndex))
				require.NoError(t, tx.Exec(
					"ALTER TABLE ? ADD CONSTRAINT ? UNIQUE (?)",
					clause.Table{Name: "custom_domains"},
					clause.Column{Name: legacyCustomDomainActiveOwnerConstraint},
					clause.Column{Name: "active_owner_id"},
				).Error)
			},
		},
		{
			name: "unknown_constraint_is_preserved",
			prepareLegacy: func(t *testing.T, tx *gorm.DB) {
				t.Helper()
				require.NoError(t, tx.Exec(
					"ALTER TABLE ? ADD CONSTRAINT ? UNIQUE (?)",
					clause.Table{Name: "custom_domains"},
					clause.Column{Name: "keep_custom_domains_active_owner_unique"},
					clause.Column{Name: "active_owner_id"},
				).Error)
			},
			expectedError: "unsupported unique constraint",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			tx := db.Begin()
			require.NoError(t, tx.Error)
			t.Cleanup(func() { _ = tx.Rollback().Error })

			schemaName := fmt.Sprintf("custom_domain_migration_%d", time.Now().UnixNano())
			require.NoError(t, tx.Exec("CREATE SCHEMA ?", clause.Table{Name: schemaName}).Error)
			require.NoError(t, tx.Exec("SET LOCAL search_path TO ?", clause.Table{Name: schemaName}).Error)

			require.NoError(t, migrateCustomDomainActiveOwnerUniqueness(tx))
			require.NoError(t, tx.AutoMigrate(&CustomDomain{}))
			ownerID := 7
			original := CustomDomain{Label: "preserved", OwnerUserID: ownerID, ActiveOwnerID: &ownerID, Enabled: true}
			require.NoError(t, tx.Create(&original).Error)
			if test.prepareLegacy != nil {
				test.prepareLegacy(t, tx)
			}

			if test.expectedError != "" {
				err := migrateCustomDomainActiveOwnerUniqueness(tx)
				require.Error(t, err)
				assert.Contains(t, err.Error(), test.expectedError)
				assert.True(t, tx.Migrator().HasConstraint(&CustomDomain{}, "keep_custom_domains_active_owner_unique"))
				return
			}

			for range 2 {
				require.NoError(t, migrateCustomDomainActiveOwnerUniqueness(tx))
				require.NoError(t, tx.AutoMigrate(&CustomDomain{}))
			}

			var preserved CustomDomain
			require.NoError(t, tx.First(&preserved, original.Id).Error)
			assert.Equal(t, original.Label, preserved.Label)
			assert.Equal(t, original.OwnerUserID, preserved.OwnerUserID)

			var constraintCount int64
			require.NoError(t, tx.Raw(`
SELECT count(*)
FROM pg_catalog.pg_constraint AS constraint_meta
WHERE constraint_meta.conrelid = to_regclass('custom_domains')
  AND constraint_meta.contype = 'u'
  AND cardinality(constraint_meta.conkey) = 1
  AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attribute_meta
      WHERE attribute_meta.attrelid = constraint_meta.conrelid
        AND attribute_meta.attnum = constraint_meta.conkey[1]
        AND attribute_meta.attname = 'active_owner_id'
  )`).Scan(&constraintCount).Error)
			assert.Zero(t, constraintCount)

			var targetIndexCount int64
			require.NoError(t, tx.Raw(`
SELECT count(*)
FROM pg_catalog.pg_index AS index_meta
JOIN pg_catalog.pg_class AS index_class
  ON index_class.oid = index_meta.indexrelid
JOIN pg_catalog.pg_attribute AS attribute_meta
  ON attribute_meta.attrelid = index_meta.indrelid
 AND attribute_meta.attnum = index_meta.indkey[0]
WHERE index_meta.indrelid = to_regclass('custom_domains')
  AND index_class.relname = ?
  AND index_meta.indisunique
  AND index_meta.indisvalid
  AND index_meta.indisready
  AND NOT index_meta.indisprimary
  AND index_meta.indpred IS NULL
  AND index_meta.indexprs IS NULL
  AND index_meta.indnatts = 1
  AND attribute_meta.attname = 'active_owner_id'
  AND NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS constraint_meta
      WHERE constraint_meta.conindid = index_meta.indexrelid
  )`, customDomainActiveOwnerIndex).Scan(&targetIndexCount).Error)
			assert.EqualValues(t, 1, targetIndexCount)

			duplicateOwnerID := ownerID
			duplicateError := tx.Transaction(func(duplicateTx *gorm.DB) error {
				return duplicateTx.Create(&CustomDomain{
					Label: "duplicate", OwnerUserID: 8, ActiveOwnerID: &duplicateOwnerID, Enabled: true,
				}).Error
			})
			require.Error(t, duplicateError)
			require.NoError(t, tx.Create(&CustomDomain{Label: "disabled-a", OwnerUserID: 9}).Error)
			require.NoError(t, tx.Create(&CustomDomain{Label: "disabled-b", OwnerUserID: 9}).Error)
		})
	}
}
