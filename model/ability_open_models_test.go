package model

import (
	"fmt"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupAbilityOpenModelsTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	common.RedisEnabled = false
	initCol()

	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", strings.ReplaceAll(t.Name(), "/", "_"))
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	previousDB, previousLogDB := DB, LOG_DB
	DB = db
	LOG_DB = db
	require.NoError(t, db.AutoMigrate(&Channel{}, &Ability{}))
	t.Cleanup(func() {
		DB, LOG_DB = previousDB, previousLogDB
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})
	return db
}

func TestGetGroupEnabledModelsHidesDefaultOnlyUpstreamDump(t *testing.T) {
	prev := HideDefaultOnlyModels
	HideDefaultOnlyModels = true
	t.Cleanup(func() { HideDefaultOnlyModels = prev })

	db := setupAbilityOpenModelsTestDB(t)
	require.NoError(t, db.Create(&[]Channel{
		{Id: 1, Name: "open", Key: "k1", Status: common.ChannelStatusEnabled, Group: "default,vip", Models: "gpt-open"},
		{Id: 2, Name: "dump", Key: "k2", Status: common.ChannelStatusEnabled, Group: "default", Models: "cf-dump"},
		{Id: 3, Name: "disabled", Key: "k3", Status: common.ChannelStatusManuallyDisabled, Group: "vip", Models: "vip-dead"},
	}).Error)
	require.NoError(t, db.Create(&[]Ability{
		{Group: "default", Model: "gpt-open", ChannelId: 1, Enabled: true},
		{Group: "vip", Model: "gpt-open", ChannelId: 1, Enabled: true},
		{Group: "default", Model: "cf-dump", ChannelId: 2, Enabled: true},
		{Group: "vip", Model: "vip-dead", ChannelId: 3, Enabled: true},
	}).Error)

	require.ElementsMatch(t, []string{"gpt-open"}, GetGroupEnabledModels("default"))
	require.ElementsMatch(t, []string{"gpt-open"}, GetGroupEnabledModels("vip"))
	require.ElementsMatch(t, []string{"gpt-open", "cf-dump"}, GetEnabledModels())
}

func TestGetAllEnableAbilityWithChannelsSkipsDisabledChannel(t *testing.T) {
	db := setupAbilityOpenModelsTestDB(t)
	require.NoError(t, db.Create(&[]Channel{
		{Id: 10, Name: "on", Key: "k10", Status: common.ChannelStatusEnabled, Type: 1, Group: "default", Models: "alive"},
		{Id: 11, Name: "off", Key: "k11", Status: common.ChannelStatusManuallyDisabled, Type: 1, Group: "default", Models: "dead"},
	}).Error)
	require.NoError(t, db.Create(&[]Ability{
		{Group: "default", Model: "alive", ChannelId: 10, Enabled: true},
		{Group: "default", Model: "dead", ChannelId: 11, Enabled: true},
	}).Error)

	abilities, err := GetAllEnableAbilityWithChannels()
	require.NoError(t, err)
	names := make([]string, 0, len(abilities))
	for _, ability := range abilities {
		names = append(names, ability.Model)
	}
	require.ElementsMatch(t, []string{"alive"}, names)
}

func TestIsDefaultOnlyEnableGroup(t *testing.T) {
	require.True(t, IsDefaultOnlyEnableGroup([]string{"default"}))
	require.True(t, IsDefaultOnlyEnableGroup([]string{"default", "default"}))
	require.False(t, IsDefaultOnlyEnableGroup([]string{"default", "vip"}))
	require.False(t, IsDefaultOnlyEnableGroup([]string{"vip"}))
	require.False(t, IsDefaultOnlyEnableGroup(nil))
}

func TestUpdatePricingSkipsDefaultOnlyUpstreamDump(t *testing.T) {
	prev := HideDefaultOnlyModels
	HideDefaultOnlyModels = true
	t.Cleanup(func() {
		HideDefaultOnlyModels = prev
		InvalidatePricingCache()
	})

	db := setupAbilityOpenModelsTestDB(t)
	require.NoError(t, db.AutoMigrate(&Model{}, &Vendor{}))
	require.NoError(t, db.Create(&[]Channel{
		{Id: 21, Name: "open", Key: "k21", Status: common.ChannelStatusEnabled, Group: "default,vip", Models: "gpt-open"},
		{Id: 22, Name: "dump", Key: "k22", Status: common.ChannelStatusEnabled, Group: "default", Models: "cf-dump"},
	}).Error)
	require.NoError(t, db.Create(&[]Ability{
		{Group: "default", Model: "gpt-open", ChannelId: 21, Enabled: true},
		{Group: "vip", Model: "gpt-open", ChannelId: 21, Enabled: true},
		{Group: "default", Model: "cf-dump", ChannelId: 22, Enabled: true},
	}).Error)

	InvalidatePricingCache()
	pricing := GetPricing()
	names := make([]string, 0, len(pricing))
	for _, item := range pricing {
		names = append(names, item.ModelName)
	}
	require.Contains(t, names, "gpt-open")
	require.NotContains(t, names, "cf-dump")
}
