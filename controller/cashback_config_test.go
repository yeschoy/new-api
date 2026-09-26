package controller

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

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
	require.NoError(t, db.AutoMigrate(&model.Option{}, &model.User{}, &model.TopUp{}, &model.CashbackCampaign{}, &model.CashbackOrderContext{}, &model.EpayPaymentEvidence{}, &model.Log{}, &model.AuditLog{}))
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

const validCashbackConfigJSON = `{
	"inviter_enabled":false,"invitee_enabled":false,
	"inviter_rate_bps":0,"invitee_rate_bps":0,
	"settlement_days":7,"max_reward_quota":1000,"daily_reward_quota":5000,
	"ip_account_threshold":3,"device_account_threshold":2,"daily_topup_count_threshold":5
}`

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

func TestRecordedSpendRejectsInvalidCurrencyConfirmations(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupCashbackConfigControllerTest(t)
	for _, query := range []string{
		"confirm_cny_top_up_id=0", "confirm_cny_top_up_id=abc",
		"confirm_cny_top_up_id=1&confirm_cny_top_up_id=1",
		"confirm_cny_top_up_id=123", // No such order for this user.
	} {
		t.Run(query, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/api/cashback/users/1/recorded-spend?start_at=100&end_at=200&"+query, nil)
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)
			context.Params = gin.Params{{Key: "id", Value: "1"}}
			context.Request = request
			GetCashbackRecordedSpend(context)
			assert.Equal(t, http.StatusBadRequest, recorder.Code)
		})
	}
}

func TestRecordedSpendConfirmsOutsideWindowAndAudits(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupCashbackConfigControllerTest(t)
	payer := model.User{Username: "report-outside-payer", AffCode: "report-outside-payer", Status: common.UserStatusEnabled}
	require.NoError(t, model.DB.Create(&payer).Error)
	order := model.TopUp{UserId: payer.Id, TradeNo: "report-outside-epay", Amount: 100, Status: common.TopUpStatusSuccess, CompleteTime: 100, PaymentProvider: model.PaymentProviderEpay}
	require.NoError(t, model.DB.Create(&order).Error)
	require.NoError(t, model.DB.Create(&model.CashbackOrderContext{TopUpID: order.Id, UserID: payer.Id, TradeNo: order.TradeNo, PaymentProvider: model.PaymentProviderEpay, BaseQuota: 100, CreditedQuota: 100, DeviceSignalStatus: model.CashbackDeviceSignalMissing, CompletionSource: model.CashbackCompletionProviderCallback, CompletionProvider: model.PaymentProviderEpay}).Error)
	require.NoError(t, model.DB.Create(&model.EpayPaymentEvidence{TopUpID: order.Id, TradeNo: order.TradeNo, GatewayTradeNo: "gateway", MerchantID: "merchant", PaidCents: 10000, Source: model.CashbackCompletionProviderCallback, VerifiedAt: order.CompleteTime}).Error)
	request := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/cashback/users/%d/recorded-spend?start_at=200&end_at=300&confirm_cny_top_up_id=%d", payer.Id, order.Id), nil)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Params = gin.Params{{Key: "id", Value: fmt.Sprint(payer.Id)}}
	context.Request = request
	context.Set("id", 1)
	context.Set("username", "cashback-config-admin")
	GetCashbackRecordedSpend(context)
	assert.Equal(t, http.StatusOK, recorder.Code)
	assert.Contains(t, recorder.Body.String(), `"refund_status":"manual_reconciliation"`)
	assert.Contains(t, recorder.Body.String(), `"top_ups":[]`)
	var audit []model.AuditLog
	require.NoError(t, model.DB.Where("action = ?", "cashback.recorded_spend_view").Find(&audit).Error)
	require.Len(t, audit, 1)
	require.NotNil(t, audit[0].Other.Op)
	assert.Contains(t, fmt.Sprint(audit[0].Other.Op.Params["confirmed_cny_top_up_ids"]), fmt.Sprint(order.Id))
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

func TestUpdateCashbackConfigPreservesReviewPolicyForOldClients(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupCashbackConfigControllerTest(t)
	current, err := model.GetCashbackSettingFromDB()
	require.NoError(t, err)
	assert.False(t, current.AutoReviewEnabled)
	assert.False(t, current.LowReviewRequired)
	assert.False(t, current.MediumReviewRequired)
	assert.True(t, current.HighReviewRequired)
	assert.True(t, current.SevereReviewRequired)
	assert.True(t, current.AutoReviewImmediateIssue)

	body := `{"inviter_enabled":false,"invitee_enabled":false,"inviter_rate_bps":0,"invitee_rate_bps":0,
		"settlement_days":7,"max_reward_quota":1000,"daily_reward_quota":5000,
		"ip_account_threshold":3,"device_account_threshold":2,"daily_topup_count_threshold":5,
		"auto_review_enabled":true,"medium_review_required":true,"high_review_required":false,"auto_review_immediate_issue":false}`
	response := runCashbackConfigUpdate(t, body)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	current, err = model.GetCashbackSettingFromDB()
	require.NoError(t, err)
	assert.True(t, current.AutoReviewEnabled)
	assert.True(t, current.MediumReviewRequired)
	assert.False(t, current.HighReviewRequired)
	assert.True(t, current.SevereReviewRequired)
	assert.False(t, current.AutoReviewImmediateIssue)
	response = runCashbackConfigUpdate(t, validCashbackConfigJSON)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	stored, err := model.GetCashbackSettingFromDB()
	require.NoError(t, err)
	assert.Equal(t, current.AutoReviewEnabled, stored.AutoReviewEnabled)
	assert.Equal(t, current.MediumReviewRequired, stored.MediumReviewRequired)
	assert.Equal(t, current.HighReviewRequired, stored.HighReviewRequired)
	assert.Equal(t, current.AutoReviewImmediateIssue, stored.AutoReviewImmediateIssue)
}

func TestCashbackCampaignCreateAndStop(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupCashbackConfigControllerTest(t)
	start := time.Now().Unix() + 60
	body := fmt.Sprintf(`{"start_at":%d,"end_at":%d,"max_rewards_per_user":1}`, start, start+3600)
	call := func(method, path, body string, handler gin.HandlerFunc) *httptest.ResponseRecorder {
		t.Helper()
		recorder := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(recorder)
		context.Request = httptest.NewRequest(method, path, bytes.NewBufferString(body))
		context.Set("id", 1)
		context.Set("role", common.RoleRootUser)
		context.Set("username", "cashback-config-admin")
		if path != "/api/cashback/campaigns" {
			context.Params = gin.Params{{Key: "id", Value: "1"}}
		}
		handler(context)
		return recorder
	}
	response := call(http.MethodPost, "/api/cashback/campaigns", body, CreateCashbackCampaign)
	require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	assert.Contains(t, response.Body.String(), `"status":"planned"`)
	response = call(http.MethodPost, "/api/cashback/campaigns", body, CreateCashbackCampaign)
	assert.Equal(t, http.StatusConflict, response.Code)
	response = call(http.MethodPost, "/api/cashback/campaigns/1/stop", "", StopCashbackCampaign)
	assert.Equal(t, http.StatusOK, response.Code)
	assert.Contains(t, response.Body.String(), `"status":"ended"`)
	response = call(http.MethodPost, "/api/cashback/campaigns/1/stop", "", StopCashbackCampaign)
	assert.Equal(t, http.StatusOK, response.Code)
	response = call(http.MethodPost, "/api/cashback/campaigns", body, CreateCashbackCampaign)
	assert.Equal(t, http.StatusOK, response.Code)

	var audit []model.AuditLog
	require.NoError(t, model.LOG_DB.Where("action IN ?", []string{"cashback.campaign_create", "cashback.campaign_stop"}).Order("id").Find(&audit).Error)
	require.Len(t, audit, 4) // Successful create, stop, idempotent stop, replacement create.
	assert.Equal(t, "cashback.campaign_create", audit[0].Action)
	assert.Equal(t, "cashback.campaign_stop", audit[1].Action)
	assert.Equal(t, "cashback.campaign_stop", audit[2].Action)
	assert.Equal(t, "cashback.campaign_create", audit[3].Action)
	for _, event := range audit {
		assert.Equal(t, 1, event.UserId)
		assert.Equal(t, common.RoleRootUser, event.ActorRole)
		assert.True(t, event.Success)
	}
}

func TestUpdateCashbackConfigMalformedJSONReturnsStableConfigField(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupCashbackConfigControllerTest(t)

	response := runCashbackConfigUpdate(t, `{"inviter_enabled":`)

	assert.Equal(t, http.StatusBadRequest, response.Code)
	assert.JSONEq(t, `{"success":false,"message":"invalid cashback configuration","field":"config"}`, response.Body.String())
}

func TestUpdateCashbackConfigRejectsIncompleteReplacementWithoutMutation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, testCase := range []struct {
		name         string
		body         string
		missingField string
	}{
		{
			name: "boolean",
			body: `{
				"invitee_enabled":false,
				"inviter_rate_bps":0,"invitee_rate_bps":0,
				"settlement_days":7,"max_reward_quota":1000,"daily_reward_quota":5000,
				"ip_account_threshold":3,"device_account_threshold":2,"daily_topup_count_threshold":5
			}`,
			missingField: "inviter_enabled",
		},
		{
			name: "numeric",
			body: `{
				"inviter_enabled":false,"invitee_enabled":false,
				"inviter_rate_bps":0,"invitee_rate_bps":0,
				"settlement_days":7,"max_reward_quota":1000,"daily_reward_quota":5000,
				"ip_account_threshold":3,"device_account_threshold":2
			}`,
			missingField: "daily_topup_count_threshold",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			setupCashbackConfigControllerTest(t)
			before, err := model.GetCashbackSettingFromDB()
			require.NoError(t, err)

			response := runCashbackConfigUpdate(t, testCase.body)

			assert.Equal(t, http.StatusBadRequest, response.Code)
			assert.Contains(t, response.Body.String(), `"field":"`+testCase.missingField+`"`)
			after, err := model.GetCashbackSettingFromDB()
			require.NoError(t, err)
			assert.Equal(t, before, after)
		})
	}
}

func TestUpdateCashbackConfigRejectsTrailingJSONWithoutMutation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	setupCashbackConfigControllerTest(t)
	before, err := model.GetCashbackSettingFromDB()
	require.NoError(t, err)

	response := runCashbackConfigUpdate(t, validCashbackConfigJSON+` {"extra":true}`)

	assert.Equal(t, http.StatusBadRequest, response.Code)
	assert.Contains(t, response.Body.String(), `"field":"config"`)
	after, err := model.GetCashbackSettingFromDB()
	require.NoError(t, err)
	assert.Equal(t, before, after)
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
