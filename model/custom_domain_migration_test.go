package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestMigrateDBCreatesCustomDomainsAndPreservesAssignmentsOnRestart(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	previousDB := DB
	previousDatabaseType := common.MainDatabaseType()
	DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	t.Cleanup(func() {
		DB = previousDB
		common.SetMainDatabaseType(previousDatabaseType)
		require.NoError(t, sqlDB.Close())
	})

	require.NoError(t, migrateDB())
	owner := User{Username: "migration-domain-owner", AffCode: "migration-owner", Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(&owner).Error)
	domain, err := CreateCustomDomain("customer", owner.Id)
	require.NoError(t, err)
	_, err = EnableCustomDomain(domain.Label)
	require.NoError(t, err)

	require.NoError(t, migrateDB())
	persisted, err := GetCustomDomainByLabel(domain.Label)
	require.NoError(t, err)
	assert.Equal(t, domain.Id, persisted.Id)
	assert.Equal(t, owner.Id, persisted.OwnerUserID)
	assert.True(t, persisted.Enabled)
	require.NotNil(t, persisted.ActiveOwnerID)
	assert.Equal(t, owner.Id, *persisted.ActiveOwnerID)
}
