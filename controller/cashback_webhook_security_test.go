package controller

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	stripewebhook "github.com/stripe/stripe-go/v81/webhook"
	"gorm.io/gorm"
)

func newCashbackWebhookTestContext(method, target, body string) (*gin.Context, *httptest.ResponseRecorder) {
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(method, target, strings.NewReader(body))
	context.Request.Header.Set("Content-Type", "application/json")
	return context, recorder
}

func generateWaffoTestKeys(t *testing.T) (string, string) {
	t.Helper()
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	privateDER, err := x509.MarshalPKCS8PrivateKey(privateKey)
	require.NoError(t, err)
	publicDER, err := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
	require.NoError(t, err)
	return base64.StdEncoding.EncodeToString(privateDER), base64.StdEncoding.EncodeToString(publicDER)
}

func TestStripeWebhookRetriesWhenCashbackTransactionRollsBack(t *testing.T) {
	gin.SetMode(gin.TestMode)
	oldDB, oldLogDB := model.DB, model.LOG_DB
	oldDatabaseType := common.MainDatabaseType()
	oldRedisEnabled := common.RedisEnabled
	oldQuotaPerUnit := common.QuotaPerUnit
	oldPayment := *operation_setting.GetPaymentSetting()
	oldCashback := *operation_setting.GetCashbackSetting()
	oldStripeAPISecret := setting.StripeApiSecret
	oldStripeWebhookSecret := setting.StripeWebhookSecret
	oldStripePriceID := setting.StripePriceId
	common.OptionMapRWMutex.Lock()
	oldOptionMap := common.OptionMap
	common.OptionMap = make(map[string]string)
	common.OptionMapRWMutex.Unlock()

	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&model.User{}, &model.TopUp{}, &model.Option{}, &model.CashbackOrderContext{},
		&model.CashbackReward{}, &model.CashbackDeviceLink{}, &model.SubscriptionOrder{}, &model.Log{},
	))
	model.DB, model.LOG_DB = db, db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.RedisEnabled = false
	common.QuotaPerUnit = 1_000
	payment := operation_setting.GetPaymentSetting()
	payment.ComplianceConfirmed = true
	payment.ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion
	setting.StripeApiSecret = "sk_test_cashback_retry"
	setting.StripeWebhookSecret = "whsec_cashback_retry"
	setting.StripePriceId = "price_cashback_retry"
	t.Cleanup(func() {
		model.DB, model.LOG_DB = oldDB, oldLogDB
		common.SetMainDatabaseType(oldDatabaseType)
		common.RedisEnabled = oldRedisEnabled
		common.QuotaPerUnit = oldQuotaPerUnit
		*operation_setting.GetPaymentSetting() = oldPayment
		*operation_setting.GetCashbackSetting() = oldCashback
		setting.StripeApiSecret = oldStripeAPISecret
		setting.StripeWebhookSecret = oldStripeWebhookSecret
		setting.StripePriceId = oldStripePriceID
		common.OptionMapRWMutex.Lock()
		common.OptionMap = oldOptionMap
		common.OptionMapRWMutex.Unlock()
		sqlDB, dbErr := db.DB()
		if dbErr == nil {
			_ = sqlDB.Close()
		}
	})

	now := time.Now().Unix()
	cashbackSetting := operation_setting.DefaultCashbackSetting()
	cashbackSetting.InviterEnabled = true
	cashbackSetting.InviterRateBPS = 1_000
	cashbackSetting.MaxRewardQuota = 10_000
	cashbackSetting.DailyRewardQuota = 50_000
	_, _, err = model.UpdateCashbackSettingAtomic(cashbackSetting, true, now-100)
	require.NoError(t, err)
	user := model.User{Username: "stripe-cashback-retry", Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(&user).Error)
	topUp := model.TopUp{
		UserId: user.Id, Amount: 1, Money: 1, TradeNo: "stripe-cashback-retry",
		PaymentMethod: model.PaymentMethodStripe, PaymentProvider: model.PaymentProviderStripe,
		CreateTime: now, Status: common.TopUpStatusPending,
	}
	// Deliberately bypass InsertOnlineTopUp to simulate a broken post-enable
	// order that lacks its required cashback side-table context.
	require.NoError(t, db.Create(&topUp).Error)

	payload := []byte(`{"id":"evt_cashback_retry","type":"checkout.session.completed","data":{"object":{"object":"checkout.session","client_reference_id":"stripe-cashback-retry","status":"complete","payment_status":"paid","customer":"cus_cashback","amount_total":100,"currency":"usd"}}}`)
	signed := stripewebhook.GenerateTestSignedPayload(&stripewebhook.UnsignedPayload{
		Payload: payload, Secret: setting.StripeWebhookSecret, Timestamp: time.Now(),
	})
	context, recorder := newCashbackWebhookTestContext(http.MethodPost, "/api/stripe/webhook", string(payload))
	context.Request.Header.Set("Stripe-Signature", signed.Header)

	StripeWebhook(context)

	assert.Equal(t, http.StatusInternalServerError, recorder.Code)
	var storedTopUp model.TopUp
	require.NoError(t, db.First(&storedTopUp, topUp.Id).Error)
	assert.Equal(t, common.TopUpStatusPending, storedTopUp.Status)
	var storedUser model.User
	require.NoError(t, db.First(&storedUser, user.Id).Error)
	assert.Zero(t, storedUser.Quota)
}

func TestCashbackEligibleWebhooksRejectForgedSignatures(t *testing.T) {
	gin.SetMode(gin.TestMode)
	confirmPaymentComplianceForTest(t)

	originalCustomDomainEnabled := common.CustomDomainEnabled
	originalStripeAPISecret := setting.StripeApiSecret
	originalStripeWebhookSecret := setting.StripeWebhookSecret
	originalStripePriceID := setting.StripePriceId
	originalCreemAPIKey := setting.CreemApiKey
	originalCreemProducts := setting.CreemProducts
	originalCreemWebhookSecret := setting.CreemWebhookSecret
	originalWaffoEnabled := setting.WaffoEnabled
	originalWaffoSandbox := setting.WaffoSandbox
	originalWaffoSandboxAPIKey := setting.WaffoSandboxApiKey
	originalWaffoSandboxPrivateKey := setting.WaffoSandboxPrivateKey
	originalWaffoSandboxPublicCert := setting.WaffoSandboxPublicCert
	originalPancakeMerchantID := setting.WaffoPancakeMerchantID
	originalPancakePrivateKey := setting.WaffoPancakePrivateKey
	originalPancakeProductID := setting.WaffoPancakeProductID
	originalPayAddress := operation_setting.PayAddress
	originalEpayID := operation_setting.EpayId
	originalEpayKey := operation_setting.EpayKey
	originalPayMethods := operation_setting.PayMethods
	t.Cleanup(func() {
		common.CustomDomainEnabled = originalCustomDomainEnabled
		setting.StripeApiSecret = originalStripeAPISecret
		setting.StripeWebhookSecret = originalStripeWebhookSecret
		setting.StripePriceId = originalStripePriceID
		setting.CreemApiKey = originalCreemAPIKey
		setting.CreemProducts = originalCreemProducts
		setting.CreemWebhookSecret = originalCreemWebhookSecret
		setting.WaffoEnabled = originalWaffoEnabled
		setting.WaffoSandbox = originalWaffoSandbox
		setting.WaffoSandboxApiKey = originalWaffoSandboxAPIKey
		setting.WaffoSandboxPrivateKey = originalWaffoSandboxPrivateKey
		setting.WaffoSandboxPublicCert = originalWaffoSandboxPublicCert
		setting.WaffoPancakeMerchantID = originalPancakeMerchantID
		setting.WaffoPancakePrivateKey = originalPancakePrivateKey
		setting.WaffoPancakeProductID = originalPancakeProductID
		operation_setting.PayAddress = originalPayAddress
		operation_setting.EpayId = originalEpayID
		operation_setting.EpayKey = originalEpayKey
		operation_setting.PayMethods = originalPayMethods
	})
	common.CustomDomainEnabled = false

	t.Run("stripe", func(t *testing.T) {
		setting.StripeApiSecret = "sk_test_cashback"
		setting.StripeWebhookSecret = "whsec_cashback"
		setting.StripePriceId = "price_cashback"
		context, recorder := newCashbackWebhookTestContext(http.MethodPost, "/api/stripe/webhook", `{}`)
		context.Request.Header.Set("Stripe-Signature", "forged")

		StripeWebhook(context)

		assert.Equal(t, http.StatusBadRequest, recorder.Code)
	})

	t.Run("creem", func(t *testing.T) {
		setting.CreemApiKey = "creem_cashback"
		setting.CreemProducts = `[{"productId":"cashback"}]`
		setting.CreemWebhookSecret = "creem_webhook_cashback"
		context, recorder := newCashbackWebhookTestContext(http.MethodPost, "/api/creem/webhook", `{}`)
		context.Request.Header.Set(CreemSignatureHeader, "forged")

		CreemWebhook(context)

		assert.Equal(t, http.StatusUnauthorized, recorder.Code)
	})

	t.Run("waffo", func(t *testing.T) {
		privateKey, publicKey := generateWaffoTestKeys(t)
		setting.WaffoEnabled = true
		setting.WaffoSandbox = true
		setting.WaffoSandboxApiKey = "waffo_cashback"
		setting.WaffoSandboxPrivateKey = privateKey
		setting.WaffoSandboxPublicCert = publicKey
		context, recorder := newCashbackWebhookTestContext(http.MethodPost, "/api/waffo/webhook", `{"eventType":"PAYMENT_NOTIFICATION"}`)
		context.Request.Header.Set("X-SIGNATURE", "forged")

		WaffoWebhook(context)

		assert.Equal(t, http.StatusBadRequest, recorder.Code)
	})

	t.Run("waffo pancake", func(t *testing.T) {
		setting.WaffoPancakeMerchantID = "merchant_cashback"
		setting.WaffoPancakePrivateKey = "private_cashback"
		setting.WaffoPancakeProductID = "product_cashback"
		context, recorder := newCashbackWebhookTestContext(http.MethodPost, "/api/waffo-pancake/webhook/test", `{}`)
		context.Params = gin.Params{{Key: "env", Value: "test"}}
		context.Request.Header.Set("X-Waffo-Signature", "forged")

		WaffoPancakeWebhook(context)

		assert.Equal(t, http.StatusUnauthorized, recorder.Code)
	})

	t.Run("epay", func(t *testing.T) {
		operation_setting.PayAddress = "https://pay.example.com"
		operation_setting.EpayId = "epay_cashback"
		operation_setting.EpayKey = "epay_key_cashback"
		operation_setting.PayMethods = []map[string]string{{"type": "alipay"}}
		context, recorder := newCashbackWebhookTestContext(http.MethodPost, "/api/user/epay/notify", "pid=forged")
		context.Request.Header.Set("Content-Type", "application/x-www-form-urlencoded")

		EpayNotify(context)

		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Equal(t, "fail", recorder.Body.String())
	})
}
