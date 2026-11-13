package controller

import (
	"bytes"
	"encoding/json"
	"fmt"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func setupPartnerTenantSubscriptionKeyHTTPPQ(t *testing.T) (*gin.Engine, *model.PartnerTenant, string, *model.SubscriptionPlan) {
	t.Helper()
	return setupPartnerTenantIsolatedHTTPPQ(t, os.Getenv("TEST_PARTNER_SUBSCRIPTION_KEY_POSTGRES_DSN"), "pt_subkey_http_")
}

func setupPartnerTenantIsolatedHTTPPQ(t *testing.T, dsn, prefix string) (*gin.Engine, *model.PartnerTenant, string, *model.SubscriptionPlan) {
	t.Helper()
	if dsn == "" {
		t.Skip("BLOCKED: task-owned PostgreSQL DSN required; no SQLite fixture or runtime evidence")
	}
	cfg, err := pgx.ParseConfig(dsn)
	require.NoError(t, err)
	base, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	schema := fmt.Sprintf("%s%d", prefix, time.Now().UnixNano())
	require.NoError(t, base.Exec("CREATE SCHEMA "+schema).Error)
	baseConn, err := base.DB()
	require.NoError(t, err)
	require.NoError(t, baseConn.Close())
	cfg.RuntimeParams["search_path"] = schema
	cfg.RuntimeParams["application_name"] = schema
	cfg.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	conn := stdlib.OpenDB(*cfg)
	db, err := gorm.Open(postgres.New(postgres.Config{Conn: conn, PreferSimpleProtocol: true}), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	oldDB, oldMain, oldLog, oldRoot, oldRedis := model.DB, common.MainDatabaseType(), common.LogDatabaseType(), common.CryptoSecret, common.RedisEnabled
	callback, pid, secret, methods := operation_setting.CustomCallbackAddress, operation_setting.EpayId, operation_setting.EpayKey, operation_setting.PayMethods
	model.DB = db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	common.RedisEnabled = false
	common.CryptoSecret = "subscription-http-fixture-only"
	operation_setting.CustomCallbackAddress = "https://platform.example"
	operation_setting.EpayId = "merchant-id"
	operation_setting.EpayKey = "merchant-secret"
	operation_setting.PayMethods = []map[string]string{{"type": "alipay", "name": "Alipay"}}
	t.Cleanup(func() {
		model.DB = oldDB
		common.SetDatabaseTypes(oldMain, oldLog)
		common.CryptoSecret = oldRoot
		common.RedisEnabled = oldRedis
		operation_setting.CustomCallbackAddress = callback
		operation_setting.EpayId = pid
		operation_setting.EpayKey = secret
		operation_setting.PayMethods = methods
		model.ResetPartnerTenantMembershipCache()
		_ = conn.Close()
	})
	confirmPaymentComplianceForTest(t)
	require.NoError(t, i18n.Init())
	require.NoError(t, model.MigratePartnerTenantIntegrationModes(db))
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}, &model.SubscriptionPlan{}, &model.UserSubscription{}))
	require.NoError(t, db.AutoMigrate(&model.PartnerTenantPurchaseSession{}))
	require.NoError(t, model.MigratePartnerTenantSubscriptionKeys(db))
	tenant, merchant, err := model.CreatePartnerTenant("HTTP Merchant", schema)
	require.NoError(t, err)
	plan := &model.SubscriptionPlan{Title: "Monthly", PartnerTenantId: tenant.Id, Enabled: true, Currency: "CNY", PriceAmount: 9.99, DurationUnit: "month", DurationValue: 1, QuotaResetPeriod: "monthly", ApplicableGroup: tenant.Group, TotalAmount: 9007199254740993, AllowWalletOverflow: common.GetPointer(false)}
	require.NoError(t, db.Create(plan).Error)
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set(common.RequestIdKey, "subscription-fixture-request"); c.Next() })
	partner := r.Group("/api/partner/v1", PartnerTenantSubscriptionKeyRequestPolicy(), middleware.PartnerOAuthNoStore(), middleware.PartnerTenantBearer())
	partner.POST("/subscription-key-orders", PartnerTenantCreateSubscriptionKeyOrder)
	partner.GET("/subscription-key-orders/:order_no", PartnerTenantGetSubscriptionKeyOrder)
	partner.GET("/subscription-key-orders/:order_no/subscription-key", PartnerTenantClaimSubscriptionKey)
	partner.POST("/subscriptions/:subscription_id/key/rotate", PartnerTenantRotateSubscriptionKey)
	partner.GET("/subscription-orders/:order_no", PartnerTenantGetSubscriptionOrder)
	r.GET("/api/partner/subscription", PartnerTenantSubscriptionKeyRequestPolicy(), PartnerTenantIndependentSubscription)
	r.GET("/api/partner/checkout/:order_no", PartnerTenantCashier)
	r.GET("/api/partner/subscription/epay/notify", PartnerTenantEpayNotify)
	r.GET("/api/partner/subscription/epay/return", PartnerTenantEpayReturn)
	// Real Coding authentication; the sentinel must never be reached with sub_.
	sentinel := func(c *gin.Context) { t.Error("subscription key reached Coding upstream"); c.Status(599) }
	r.GET("/v1/models", middleware.TokenAuth(), sentinel)
	r.POST("/v1/chat/completions", middleware.TokenAuth(), sentinel)
	r.GET("/token-readonly", middleware.TokenAuthReadOnly(), sentinel)
	t.Logf("Retained task-owned PostgreSQL schema: %s; no cleanup", schema)
	return r, tenant, merchant, plan
}
func subscriptionKeyHTTPRequest(r *gin.Engine, method, path, auth, key, renewal, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.RemoteAddr = "192.0.2.79:1000"
	if auth != "" {
		req.Header.Set("Authorization", "Bearer "+auth)
	}
	if key != "" {
		req.Header.Set("Idempotency-Key", key)
	}
	if renewal != "" {
		req.Header.Set("X-Subscription-Key", renewal)
	}
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}
func TestPartnerTenantSubscriptionKeyHTTPPostgres(t *testing.T) {
	r, tenant, merchant, p := setupPartnerTenantSubscriptionKeyHTTPPQ(t)
	gateway := startFakeZPay(t)
	body := fmt.Sprintf(`{"plan_id":%d,"payment_method":"alipay"}`, p.Id)
	create := func(intent, renew string) *httptest.ResponseRecorder {
		return subscriptionKeyHTTPRequest(r, "POST", "/api/partner/v1/subscription-key-orders", merchant, intent, renew, body)
	}
	countUsers := func() int64 { var n int64; require.NoError(t, model.DB.Model(&model.User{}).Count(&n).Error); return n }
	response := create("subscription-http-0001", "")
	require.Equal(t, 201, response.Code, response.Body.String())
	require.Equal(t, "no-store", response.Header().Get("Cache-Control"))
	require.Equal(t, "no-referrer", response.Header().Get("Referrer-Policy"))
	var order partnerTenantOrderView
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &order))
	require.Contains(t, order.CheckoutURL, "https://platform.example/partner/checkout?order_no=")
	require.EqualValues(t, 0, countUsers())
	for _, field := range []string{"external_user_id", "account_id", "user_id", "api_key", "subscription_key", "seed"} {
		require.NotContains(t, response.Body.String(), `"`+field+`"`)
	}
	require.Len(t, gateway.requests, 1)
	claimPath := "/api/partner/v1/subscription-key-orders/" + order.OrderNo + "/subscription-key"
	pending := subscriptionKeyHTTPRequest(r, "GET", claimPath, merchant, "", "", "")
	require.Equal(t, 409, pending.Code)
	fakeReturn := subscriptionKeyHTTPRequest(r, "GET", "/api/partner/subscription/epay/return?out_trade_no="+order.OrderNo, "", "", "", "")
	require.Equal(t, 303, fakeReturn.Code)
	require.Zero(t, countUsers())
	forged := subscriptionKeyHTTPRequest(r, "GET", "/api/partner/subscription/epay/notify?out_trade_no="+order.OrderNo+"&trade_status=TRADE_SUCCESS", "", "", "", "")
	require.Equal(t, "fail", forged.Body.String())
	require.Zero(t, countUsers())
	replay := create("subscription-http-0001", "")
	require.Equal(t, 200, replay.Code)
	require.Len(t, gateway.requests, 1)
	// Exact old merchant status cannot project a new-mode order, but the shared
	// public cashier and verified callback must still read it successfully.
	old := subscriptionKeyHTTPRequest(r, "GET", "/api/partner/v1/subscription-orders/"+order.OrderNo, merchant, "", "", "")
	require.Equal(t, 403, old.Code)
	stored, err := model.GetPartnerTenantSubscriptionOrder(tenant.Id, order.OrderNo)
	require.NoError(t, err)
	cashier := subscriptionKeyHTTPRequest(r, "GET", "/api/partner/checkout/"+order.OrderNo, partnerTenantCashierToken(stored), "", "", "")
	require.Equal(t, 200, cashier.Code)
	require.NotContains(t, cashier.Body.String(), "subscription_key")
	require.NotContains(t, cashier.Body.String(), "api_key")
	signed := tenantSignedNotification(t, order.OrderNo, nil)
	paid := subscriptionKeyHTTPRequest(r, "GET", "/api/partner/subscription/epay/notify?"+signed, "", "", "", "")
	require.Equal(t, "success", paid.Body.String())
	require.EqualValues(t, 1, countUsers())
	paid = subscriptionKeyHTTPRequest(r, "GET", "/api/partner/subscription/epay/notify?"+signed, "", "", "", "")
	require.Equal(t, "success", paid.Body.String())
	require.EqualValues(t, 1, countUsers())
	claim := subscriptionKeyHTTPRequest(r, "GET", claimPath, merchant, "", "", "")
	require.Equal(t, 200, claim.Code, claim.Body.String())
	var k model.PartnerTenantSubscriptionKeyResult
	require.NoError(t, json.Unmarshal(claim.Body.Bytes(), &k))
	require.True(t, model.IsValidPartnerTenantSubscriptionKey(k.SubscriptionKey))
	independent := subscriptionKeyHTTPRequest(r, "GET", "/api/partner/subscription", k.SubscriptionKey, "", "", "")
	require.Equal(t, 200, independent.Code, independent.Body.String())
	require.Contains(t, independent.Body.String(), `"quota_total":"9007199254740993"`)
	require.Contains(t, independent.Body.String(), `"api_key":"sk-`)
	require.NotContains(t, independent.Body.String(), k.SubscriptionKey)
	for _, wrong := range []string{merchant, partnerTenantCashierToken(stored), "pl_" + strings.Repeat("a", 64), "ps_" + strings.Repeat("b", 64), "sk-" + strings.Repeat("c", 48), ""} {
		res := subscriptionKeyHTTPRequest(r, "GET", "/api/partner/subscription", wrong, "", "", "")
		require.Equal(t, 401, res.Code, res.Body.String())
	}
	for _, path := range []string{"/v1/models", "/v1/chat/completions", "/token-readonly"} {
		method := "GET"
		if strings.Contains(path, "chat") {
			method = "POST"
		}
		res := subscriptionKeyHTTPRequest(r, method, path, k.SubscriptionKey, "", "", `{}`)
		require.Equal(t, 401, res.Code, res.Body.String())
	}
	for _, query := range []string{"?subscription_id=999", "?user_id=999", "?api_key=" + k.SubscriptionKey, "?"} {
		res := subscriptionKeyHTTPRequest(r, "GET", "/api/partner/subscription"+query, k.SubscriptionKey, "", "", "")
		require.Equal(t, 400, res.Code)
	}
	for _, badBody := range []string{strings.Replace(body, "plan_id", "Plan_ID", 1), body[:len(body)-1] + `,"plan_id":1}`, body + `{}`, `{"plan_id":1,"payment_method":"alipay","external_user_id":"x"}`, strings.Repeat(" ", 2049) + body} {
		res := subscriptionKeyHTTPRequest(r, "POST", "/api/partner/v1/subscription-key-orders", merchant, "subscription-bad-json", "", badBody)
		require.Equal(t, 400, res.Code, res.Body.String())
	}
	req := httptest.NewRequest("POST", "/api/partner/v1/subscription-key-orders", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+merchant)
	req.Header.Add("Authorization", "Bearer "+merchant)
	req.Header.Set("Idempotency-Key", "subscription-duplicate")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.Equal(t, 400, w.Code)
	req = httptest.NewRequest("POST", "/api/partner/v1/subscription-key-orders", strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+merchant)
	req.Header.Set("Idempotency-Key", "subscription-empty-key")
	req.Header["X-Subscription-Key"] = []string{""}
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	require.NotEqual(t, 201, w.Code)
	require.EqualValues(t, 1, countUsers())
	renewal := create("subscription-renew-0001", k.SubscriptionKey)
	require.Equal(t, 201, renewal.Code, renewal.Body.String())
	require.EqualValues(t, 1, countUsers())
	rotatePath := "/api/partner/v1/subscriptions/" + strconv.Itoa(k.SubscriptionId) + "/key/rotate"
	rotated := subscriptionKeyHTTPRequest(r, "POST", rotatePath, merchant, "subscription-rotate-001", "", `{"expected_version":1}`)
	require.Equal(t, 200, rotated.Code, rotated.Body.String())
	var next model.PartnerTenantSubscriptionKeyResult
	require.NoError(t, json.Unmarshal(rotated.Body.Bytes(), &next))
	require.NotEqual(t, k.SubscriptionKey, next.SubscriptionKey)
	require.Equal(t, 401, subscriptionKeyHTTPRequest(r, "GET", "/api/partner/subscription", k.SubscriptionKey, "", "", "").Code)
	require.Equal(t, 401, create("subscription-renew-0001", k.SubscriptionKey).Code)
	require.Equal(t, 200, create("subscription-renew-0001", next.SubscriptionKey).Code)
	require.Equal(t, 401, subscriptionKeyHTTPRequest(r, "POST", rotatePath, next.SubscriptionKey, "subscription-rotate-sub", "", `{"expected_version":2}`).Code)
	// The scoped panic boundary must not invoke Gin's credential-bearing dump.
	var panicLog bytes.Buffer
	oldErrorWriter := gin.DefaultErrorWriter
	gin.DefaultErrorWriter = &panicLog
	panicRouter := gin.New()
	panicRouter.Use(PartnerTenantSubscriptionKeyRequestPolicy())
	panicRouter.GET("/api/partner/subscription", func(c *gin.Context) { panic("fixture panic") })
	panicReq := httptest.NewRequest("GET", "/api/partner/subscription", nil)
	panicReq.Header.Set("Authorization", "Bearer "+next.SubscriptionKey)
	panicReq.Header.Set("X-Subscription-Key", next.SubscriptionKey)
	panicRec := httptest.NewRecorder()
	panicRouter.ServeHTTP(panicRec, panicReq)
	gin.DefaultErrorWriter = oldErrorWriter
	require.Equal(t, 500, panicRec.Code)
	require.NotContains(t, panicLog.String(), next.SubscriptionKey)
	require.NotContains(t, panicRec.Body.String(), next.SubscriptionKey)
	cookieReq := httptest.NewRequest("GET", "/api/partner/subscription", nil)
	cookieReq.Header.Set("Cookie", "subscription_key="+next.SubscriptionKey)
	cookieRec := httptest.NewRecorder()
	r.ServeHTTP(cookieRec, cookieReq)
	require.Equal(t, 401, cookieRec.Code)
	// Representative existing billing boundary: an internal member with wallet
	// funds and cancelled entitlement still cannot fall back to wallet_first.
	require.NoError(t, model.DB.AutoMigrate(&model.SubscriptionPreConsumeRecord{}))
	stored, err = model.GetPartnerTenantSubscriptionOrder(tenant.Id, order.OrderNo)
	require.NoError(t, err)
	var account model.PartnerTenantAccount
	require.NoError(t, model.DB.First(&account, stored.AccountId).Error)
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", account.UserId).Update("quota", 1000).Error)
	require.NoError(t, model.DB.Model(&model.UserSubscription{}).Where("id = ?", k.SubscriptionId).Update("status", "cancelled").Error)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	info := &relaycommon.RelayInfo{UserId: account.UserId, UsingGroup: tenant.Group, RequestId: "subscription-funding-fixture", IsPlayground: true}
	info.UserSetting.BillingPreference = "wallet_first"
	session, apiErr := service.NewBillingSession(ctx, info, 20)
	require.Nil(t, session)
	require.NotNil(t, apiErr)
	var user model.User
	require.NoError(t, model.DB.First(&user, account.UserId).Error)
	require.Equal(t, 1000, user.Quota)
	// A failed provider preparation persists one pending purchase, no user;
	// GET is read-only, and the same POST recovers the original order/deadline.
	gateway.reply = func(w http.ResponseWriter) { w.WriteHeader(503) }
	failed := create("subscription-prepare-fail", "")
	require.Equal(t, 503, failed.Code)
	var pendingOrder model.PartnerTenantSubscriptionOrder
	require.NoError(t, model.DB.Where("tenant_id = ? AND entry_mode = ? AND payment_status = ? AND qr_code = ?", tenant.Id, model.PartnerTenantIdentitySubscriptionKey, "pending", "").Order("id desc").First(&pendingOrder).Error)
	beforeRequests := len(gateway.requests)
	status := subscriptionKeyHTTPRequest(r, "GET", "/api/partner/v1/subscription-key-orders/"+pendingOrder.OrderNo, merchant, "", "", "")
	require.Equal(t, 200, status.Code)
	require.Equal(t, beforeRequests, len(gateway.requests))
	gateway.reply = func(w http.ResponseWriter) {
		_, _ = io.WriteString(w, `{"code":1,"msg":"ok","qrcode":"weixin://fixture"}`)
	}
	recovered := create("subscription-prepare-fail", "")
	require.Equal(t, 200, recovered.Code, recovered.Body.String())
	require.Contains(t, recovered.Body.String(), pendingOrder.OrderNo)
	require.EqualValues(t, 1, countUsers())
	// Slow body after middleware authenticated old pt_: transaction-time hash
	// revalidation must reject rather than creating/preparing a second order.
	reader := &subscriptionKeyDelayedBody{reader: strings.NewReader(body), entered: make(chan struct{}), resume: make(chan struct{})}
	req = httptest.NewRequest("POST", "/api/partner/v1/subscription-key-orders", nil)
	req.Body = reader
	req.Header.Set("Authorization", "Bearer "+merchant)
	req.Header.Set("Idempotency-Key", "subscription-slow-body")
	done := make(chan *httptest.ResponseRecorder, 1)
	go func() { rec := httptest.NewRecorder(); r.ServeHTTP(rec, req); done <- rec }()
	select {
	case <-reader.entered:
	case <-time.After(5 * time.Second):
		t.Fatal("body reader not entered")
	}
	_, err = model.RotatePartnerTenantSecret(tenant.Id)
	require.NoError(t, err)
	close(reader.resume)
	select {
	case stale := <-done:
		require.Equal(t, 401, stale.Code, stale.Body.String())
	case <-time.After(5 * time.Second):
		t.Fatal("slow body request did not finish")
	}
}

type subscriptionKeyDelayedBody struct {
	reader          io.Reader
	entered, resume chan struct{}
	once            sync.Once
}

func (b *subscriptionKeyDelayedBody) Read(p []byte) (int, error) {
	b.once.Do(func() { close(b.entered); <-b.resume })
	return b.reader.Read(p)
}
func (*subscriptionKeyDelayedBody) Close() error { return nil }
