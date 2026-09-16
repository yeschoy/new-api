package controller

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupCashbackConfigControllerTest(t *testing.T) {
	t.Helper()
	oldDB, oldLogDB := model.DB, model.LOG_DB
	oldType := common.MainDatabaseType()
	oldPayment := *operation_setting.GetPaymentSetting()
	oldCashback := *operation_setting.GetCashbackSetting()
	oldRedis := common.RedisEnabled
	common.OptionMapRWMutex.Lock()
	oldOptionMap := common.OptionMap
	common.OptionMap = make(map[string]string)
	common.OptionMapRWMutex.Unlock()

	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Option{}, &model.User{}, &model.Log{}))
	model.DB, model.LOG_DB = db, db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.RedisEnabled = false
	payment := operation_setting.GetPaymentSetting()
	payment.ComplianceConfirmed = true
	payment.ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion
	admin := model.User{Username: "cashback-config-admin", Password: "password", Status: common.UserStatusEnabled, Role: common.RoleRootUser}
	require.NoError(t, db.Create(&admin).Error)

	t.Cleanup(func() {
		model.DB, model.LOG_DB = oldDB, oldLogDB
		common.SetMainDatabaseType(oldType)
		common.RedisEnabled = oldRedis
		*operation_setting.GetPaymentSetting() = oldPayment
		*operation_setting.GetCashbackSetting() = oldCashback
		common.OptionMapRWMutex.Lock()
		common.OptionMap = oldOptionMap
		common.OptionMapRWMutex.Unlock()
	})
}

func runCashbackConfigUpdate(t *testing.T, body string) *httptest.ResponseRecorder {
	t.Helper()
	request := httptest.NewRequest(http.MethodPut, "/api/cashback/config", bytes.NewBufferString(body))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = request
	context.Set("id", 1)
	context.Set("username", "cashback-config-admin")
	context.Set("role", common.RoleRootUser)
	UpdateCashbackConfig(context)
	return recorder
}

func TestUpdateCashbackConfigPreservesFirstEnableBoundary(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupCashbackConfigControllerTest(t)

	first := runCashbackConfigUpdate(t, `{
		"inviter_enabled":true,"invitee_enabled":false,
		"inviter_rate_bps":1000,"invitee_rate_bps":0,
		"settlement_days":7,"max_reward_quota":1000,"daily_reward_quota":5000,
		"ip_account_threshold":3,"device_account_threshold":2,"daily_topup_count_threshold":5
	}`)
	assert.Equal(t, http.StatusOK, first.Code)
	stored, err := model.GetCashbackSettingFromDB()
	require.NoError(t, err)
	require.Positive(t, stored.FirstEnabledAt)
	firstEnabledAt := stored.FirstEnabledAt
	assert.EqualValues(t, 1, stored.Version)

	second := runCashbackConfigUpdate(t, `{
		"inviter_enabled":false,"invitee_enabled":false,
		"inviter_rate_bps":0,"invitee_rate_bps":0,
		"settlement_days":14,"max_reward_quota":0,"daily_reward_quota":0,
		"ip_account_threshold":4,"device_account_threshold":3,"daily_topup_count_threshold":8,
		"first_enabled_at":0,"version":0
	}`)
	assert.Equal(t, http.StatusOK, second.Code)
	stored, err = model.GetCashbackSettingFromDB()
	require.NoError(t, err)
	assert.Equal(t, firstEnabledAt, stored.FirstEnabledAt)
	assert.EqualValues(t, 2, stored.Version)
}

func TestUpdateCashbackConfigRejectsCombinedRateAboveOneHundredPercent(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupCashbackConfigControllerTest(t)

	response := runCashbackConfigUpdate(t, `{
		"inviter_enabled":true,"invitee_enabled":true,
		"inviter_rate_bps":6000,"invitee_rate_bps":5000,
		"settlement_days":7,"max_reward_quota":1000,"daily_reward_quota":5000,
		"ip_account_threshold":3,"device_account_threshold":2,"daily_topup_count_threshold":5
	}`)

	assert.Equal(t, http.StatusBadRequest, response.Code)
	assert.Contains(t, response.Body.String(), "combined cashback rate")
	stored, err := model.GetCashbackSettingFromDB()
	require.NoError(t, err)
	assert.False(t, stored.AnyDirectionEnabled())
}
