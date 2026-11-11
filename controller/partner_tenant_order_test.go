package controller

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Calcium-Ion/go-epay/epay"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func setupPartnerTenantOrderController(t *testing.T) (*gin.Engine, *model.PartnerTenant, string, *model.SubscriptionPlan) {
	t.Helper()
	engine := setupPartnerOAuthPaymentController(t)
	model.ResetPartnerTenantMembershipCache()
	t.Cleanup(model.ResetPartnerTenantMembershipCache)
	previous := operation_setting.CustomCallbackAddress
	operation_setting.CustomCallbackAddress = "https://platform.example"
	t.Cleanup(func() { operation_setting.CustomCallbackAddress = previous })
	require.NoError(t, model.DB.AutoMigrate(&model.PartnerTenant{}, &model.PartnerTenantAccount{}, &model.PartnerTenantSubscriptionOrder{}, &model.SubscriptionPlan{}, &model.UserSubscription{}))
	tenant, secret, err := model.CreatePartnerTenant("Test", "tenant-order")
	require.NoError(t, err)
	plan := &model.SubscriptionPlan{PartnerTenantId: tenant.Id, Title: "Monthly model", PriceAmount: 9.99, Currency: "CNY", Enabled: true, DurationUnit: "month", DurationValue: 1,
		ApplicableGroup: tenant.Group, TotalAmount: 1000, QuotaResetPeriod: "monthly", AllowWalletOverflow: common.GetPointer(false)}
	require.NoError(t, model.DB.Create(plan).Error)
	partner := engine.Group("/api/partner/v1", middleware.PartnerOAuthNoStore(), middleware.PartnerTenantBearer())
	partner.POST("/subscription-orders", PartnerTenantCreateSubscriptionOrder)
	partner.GET("/subscription-orders/:order_no", PartnerTenantGetSubscriptionOrder)
	partner.PUT("/accounts", PartnerTenantProvisionAccount)
	engine.GET("/api/partner/checkout/:order_no", PartnerTenantCashier)
	engine.GET("/api/partner/subscription/epay/notify", PartnerTenantEpayNotify)
	engine.POST("/api/partner/subscription/epay/notify", PartnerTenantEpayNotify)
	engine.GET("/api/partner/subscription/epay/return", PartnerTenantEpayReturn)
	return engine, tenant, secret, plan
}
func createTenantTestOrder(t *testing.T, engine *gin.Engine, secret string, plan *model.SubscriptionPlan, key string) partnerTenantOrderView {
	t.Helper()
	body := `{"external_user_id":"buyer-7","plan_id":` + strconv.Itoa(plan.Id) + `,"payment_method":"alipay"}`
	response := partnerIntegrationRequest(engine, "POST", "/api/partner/v1/subscription-orders", secret, key, body)
	require.Equal(t, 201, response.Code, response.Body.String())
	var order partnerTenantOrderView
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &order))
	return order
}
func tenantSignedNotification(t *testing.T, orderNo string, changes map[string]string) string {
	t.Helper()
	fields := map[string]string{"pid": "merchant-id", "type": "alipay", "out_trade_no": orderNo, "trade_no": "tx-" + orderNo, "trade_status": epay.StatusTradeSuccess, "money": "9.99"}
	for k, v := range changes {
		fields[k] = v
	}
	signed, err := epay.GenerateParamsWithError(fields, "merchant-secret")
	require.NoError(t, err)
	values := url.Values{}
	for k, v := range signed {
		values.Set(k, v)
	}
	return values.Encode()
}

func TestPartnerTenantOrderCheckoutAndPublicScope(t *testing.T) {
	engine, tenant, secret, plan := setupPartnerTenantOrderController(t)
	gateway := startFakeZPay(t)
	order := createTenantTestOrder(t, engine, secret, plan, "tenant-order-000001")
	require.Equal(t, "9.99", order.Amount)
	require.Equal(t, "pending", order.PaymentStatus)
	require.Equal(t, "not_ready", order.FulfillmentStatus)
	require.Empty(t, order.QRCode)
	require.Empty(t, order.PayURL)
	link, err := url.Parse(order.CheckoutURL)
	require.NoError(t, err)
	require.Equal(t, "/partner/checkout", link.Path)
	require.NotContains(t, link.RawQuery, "pc_")
	fragment, err := url.ParseQuery(link.Fragment)
	require.NoError(t, err)
	token := fragment.Get("token")
	require.True(t, strings.HasPrefix(token, "pc_"))
	require.Len(t, gateway.requests, 1)
	require.Equal(t, order.OrderNo, gateway.requests[0].Get("out_trade_no"))
	require.Equal(t, "9.99", gateway.requests[0].Get("money"))
	require.Equal(t, "https://platform.example/api/partner/subscription/epay/notify", gateway.requests[0].Get("notify_url"))
	require.NotContains(t, gateway.requests[0].Encode(), "buyer-7")
	require.NotContains(t, gateway.requests[0].Encode(), "pc_")
	var accounts int64
	require.NoError(t, model.DB.Model(&model.PartnerTenantAccount{}).Count(&accounts).Error)
	require.Zero(t, accounts)
	body := `{"external_user_id":"buyer-7","plan_id":` + strconv.Itoa(plan.Id) + `,"payment_method":"alipay"}`
	replay := partnerIntegrationRequest(engine, "POST", "/api/partner/v1/subscription-orders", secret, "tenant-order-000001", body)
	require.Equal(t, 200, replay.Code, replay.Body.String())
	require.Len(t, gateway.requests, 1)
	var replayOrder partnerTenantOrderView
	require.NoError(t, json.Unmarshal(replay.Body.Bytes(), &replayOrder))
	require.Equal(t, order.CheckoutURL, replayOrder.CheckoutURL)
	// A prepared order remains replayable while NEW payment methods are off.
	methods := operation_setting.PayMethods
	operation_setting.PayMethods = nil
	offReplay := partnerIntegrationRequest(engine, "POST", "/api/partner/v1/subscription-orders", secret, "tenant-order-000001", body)
	operation_setting.PayMethods = methods
	require.Equal(t, 200, offReplay.Code, offReplay.Body.String())
	status := partnerIntegrationRequest(engine, "GET", "/api/partner/v1/subscription-orders/"+order.OrderNo, secret, "", "")
	require.Equal(t, 200, status.Code)
	require.NotContains(t, status.Body.String(), "checkout_url")
	require.NotContains(t, status.Body.String(), "qrcode")
	public := partnerIntegrationRequest(engine, "GET", "/api/partner/checkout/"+order.OrderNo, token, "", "")
	require.Equal(t, 200, public.Code, public.Body.String())
	require.Equal(t, "no-store", public.Header().Get("Cache-Control"))
	require.Equal(t, "no-referrer", public.Header().Get("Referrer-Policy"))
	require.Contains(t, public.Body.String(), "weixin://")
	for _, field := range []string{"external_user_id", "user_id", "api_key", "tenant_id", "subscription_id", "checkout_url"} {
		require.NotContains(t, public.Body.String(), `"`+field+`"`)
	}
	for _, credential := range []string{"", secret, "sk-test", token + "x"} {
		invalid := partnerIntegrationRequest(engine, "GET", "/api/partner/checkout/"+order.OrderNo, credential, "", "")
		require.Equal(t, 401, invalid.Code)
	}
	foreign, foreignSecret, err := model.CreatePartnerTenant("Other", "tenant-other")
	require.NoError(t, err)
	require.NotEqual(t, tenant.Id, foreign.Id)
	require.Equal(t, 404, partnerIntegrationRequest(engine, "GET", "/api/partner/v1/subscription-orders/"+order.OrderNo, foreignSecret, "", "").Code)
	require.Equal(t, 401, partnerIntegrationRequest(engine, "GET", "/api/partner/checkout/"+order.OrderNo+"?token="+url.QueryEscape(token), "", "", "").Code)
}

func TestPartnerTenantVerifiedPaymentAndInformationalReturn(t *testing.T) {
	engine, _, secret, plan := setupPartnerTenantOrderController(t)
	startFakeZPay(t)
	order := createTenantTestOrder(t, engine, secret, plan, "tenant-payment-000001")
	forgedReturn := partnerIntegrationRequest(engine, "GET", "/api/partner/subscription/epay/return?"+tenantSignedNotification(t, order.OrderNo, nil), "", "", "")
	require.Equal(t, 303, forgedReturn.Code)
	require.Equal(t, "/partner/checkout?order_no="+order.OrderNo, forgedReturn.Header().Get("Location"))
	stored, err := model.GetPartnerTenantSubscriptionOrder(0, order.OrderNo)
	require.NoError(t, err)
	require.Equal(t, "pending", stored.PaymentStatus)
	for _, change := range []map[string]string{{"pid": "foreign"}, {"money": "10.00"}, {"money": "9.999"}, {"type": "wxpay"}, {"trade_no": ""}, {"trade_status": "WAIT_BUYER_PAY"}, {"out_trade_no": "PTO" + strings.Repeat("x", 32)}} {
		rec := partnerIntegrationRequest(engine, "GET", "/api/partner/subscription/epay/notify?"+tenantSignedNotification(t, order.OrderNo, change), "", "", "")
		require.Equal(t, "fail", rec.Body.String())
	}
	validQuery := tenantSignedNotification(t, order.OrderNo, nil)
	forged := strings.Replace(validQuery, "money=9.99", "money=0.01", 1)
	require.Equal(t, "fail", partnerIntegrationRequest(engine, "GET", "/api/partner/subscription/epay/notify?"+forged, "", "", "").Body.String())
	require.Equal(t, "fail", partnerIntegrationRequest(engine, "GET", "/api/partner/subscription/epay/notify?"+validQuery+"&money=9.99", "", "", "").Body.String())
	// A real late callback still settles even after purchase availability is off.
	require.NoError(t, model.DB.Model(stored).Update("expires_at", time.Now().Unix()-1).Error)
	oldMethods := operation_setting.PayMethods
	operation_setting.PayMethods = nil
	rec := partnerIntegrationRequest(engine, "GET", "/api/partner/subscription/epay/notify?"+validQuery, "", "", "")
	operation_setting.PayMethods = oldMethods
	require.Equal(t, "success", rec.Body.String())
	require.Equal(t, "success", partnerIntegrationRequest(engine, "GET", "/api/partner/subscription/epay/notify?"+validQuery, "", "", "").Body.String())
	stored, err = model.GetPartnerTenantSubscriptionOrder(0, order.OrderNo)
	require.NoError(t, err)
	require.Equal(t, "paid", stored.PaymentStatus)
	require.Equal(t, "fulfilled", stored.FulfillmentStatus)
	var count int64
	require.NoError(t, model.DB.Model(&model.UserSubscription{}).Count(&count).Error)
	require.EqualValues(t, 1, count)
	require.Equal(t, "fail", partnerIntegrationRequest(engine, "GET", "/api/partner/subscription/epay/notify?"+tenantSignedNotification(t, order.OrderNo, map[string]string{"trade_no": "other"}), "", "", "").Body.String())
}

func TestPartnerTenantPaidDeliveryFailureAcknowledgesTruth(t *testing.T) {
	engine, _, secret, plan := setupPartnerTenantOrderController(t)
	startFakeZPay(t)
	order := createTenantTestOrder(t, engine, secret, plan, "tenant-failure-000001")
	require.NoError(t, model.DB.Model(plan).Update("enabled", false).Error)
	params := tenantSignedNotification(t, order.OrderNo, nil)
	request := httptest.NewRequest(http.MethodPost, "/api/partner/subscription/epay/notify", strings.NewReader(params))
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response := httptest.NewRecorder()
	engine.ServeHTTP(response, request)
	require.Equal(t, "success", response.Body.String())
	stored, err := model.GetPartnerTenantSubscriptionOrder(0, order.OrderNo)
	require.NoError(t, err)
	require.Equal(t, "paid", stored.PaymentStatus)
	require.Equal(t, "failed_retryable", stored.FulfillmentStatus)
	view := partnerTenantOrderDTO(stored, true)
	require.Equal(t, "paid", view.PaymentStatus)
	require.Empty(t, view.QRCode)
	require.Empty(t, view.PayURL)
	require.NoError(t, model.DB.Model(plan).Update("enabled", true).Error)
	require.NoError(t, model.DB.Model(stored).Update("next_delivery_at", 0).Error)
	require.NoError(t, model.RecoverPartnerTenantSubscriptionOrders(100))
	stored, err = model.GetPartnerTenantSubscriptionOrder(0, order.OrderNo)
	require.NoError(t, err)
	require.Equal(t, "fulfilled", stored.FulfillmentStatus)
}

func TestPartnerTenantGatewayRetryAndRequestValidation(t *testing.T) {
	engine, _, secret, plan := setupPartnerTenantOrderController(t)
	gateway := startFakeZPay(t)
	key := "tenant-retry-000001"
	body := `{"external_user_id":"buyer-7","plan_id":` + strconv.Itoa(plan.Id) + `,"payment_method":"alipay"}`
	gateway.reply = func(w http.ResponseWriter) { w.WriteHeader(http.StatusBadGateway) }
	failed := partnerIntegrationRequest(engine, "POST", "/api/partner/v1/subscription-orders", secret, key, body)
	require.Equal(t, 503, failed.Code)
	require.NotContains(t, failed.Body.String(), "merchant-secret")
	var orders []model.PartnerTenantSubscriptionOrder
	require.NoError(t, model.DB.Find(&orders).Error)
	require.Len(t, orders, 1)
	require.Equal(t, "pending", orders[0].PaymentStatus)
	gateway.reply = func(w http.ResponseWriter) {
		_, _ = io.WriteString(w, `{"code":1,"payurl":"https://gateway.example/pay"}`)
	}
	replay := partnerIntegrationRequest(engine, "POST", "/api/partner/v1/subscription-orders", secret, key, body)
	require.Equal(t, 200, replay.Code, replay.Body.String())
	require.Contains(t, replay.Body.String(), orders[0].OrderNo)
	conflict := partnerIntegrationRequest(engine, "POST", "/api/partner/v1/subscription-orders", secret, key, strings.Replace(body, "buyer-7", "buyer-8", 1))
	require.Equal(t, 409, conflict.Code)
	for _, invalid := range []string{strings.TrimSuffix(body, "}") + `,"paid":true}`, strings.TrimSuffix(body, "}") + `,"amount":"0.01"}`, `{"external_user_id":"","plan_id":1,"payment_method":"alipay"}`, body + body} {
		require.Equal(t, 400, partnerIntegrationRequest(engine, "POST", "/api/partner/v1/subscription-orders", secret, "tenant-invalid-00001", invalid).Code)
	}
	require.NoError(t, model.DB.Model(plan).Update("currency", "USD").Error)
	currency := partnerIntegrationRequest(engine, "POST", "/api/partner/v1/subscription-orders", secret, "tenant-currency-0001", body)
	require.Equal(t, 400, currency.Code)
	require.Contains(t, currency.Body.String(), "unsupported_currency")
}

func TestPartnerTenantCashierCapabilityAndSafeLinks(t *testing.T) {
	now := time.Now().Unix()
	a := &model.PartnerTenantSubscriptionOrder{OrderNo: "PTO" + strings.Repeat("a", 32), ExpiresAt: now + 300}
	b := *a
	b.OrderNo = "PTO" + strings.Repeat("b", 32)
	token := partnerTenantCashierToken(a)
	require.Equal(t, token, partnerTenantCashierToken(a))
	require.True(t, validPartnerTenantCashierToken(a, token, now))
	require.False(t, validPartnerTenantCashierToken(&b, token, now))
	require.False(t, validPartnerTenantCashierToken(a, token, a.ExpiresAt))
	require.False(t, validPartnerTenantCashierToken(a, "pc_"+strings.Repeat("0", 64), now))
	for _, s := range []string{"javascript:alert(1)", "http://gateway.example/pay", "//gateway.example/pay", "https://user:pass@gateway.example/pay", "data:text/html,x"} {
		require.False(t, safePartnerTenantPayURL(s), s)
	}
	require.True(t, safePartnerTenantPayURL("https://gateway.example/pay"))
}

func TestPartnerEpaySharedTransportBoundsAndNoRedirect(t *testing.T) {
	gateway := startFakeZPay(t)
	fields := map[string]string{"pid": "test", "money": "1.00", "out_trade_no": "test-only"}
	for _, reply := range []func(http.ResponseWriter){
		func(w http.ResponseWriter) {
			_, _ = io.WriteString(w, strings.Repeat("x", partnerServerMapiResponseLimit+1))
		},
		func(w http.ResponseWriter) {
			w.Header().Set("Location", "http://unsafe.example")
			w.WriteHeader(http.StatusTemporaryRedirect)
		},
		func(w http.ResponseWriter) { _, _ = io.WriteString(w, `{"code":1,"qrcode":"x"}trailing`) },
	} {
		gateway.reply = reply
		_, err := partnerEpayMapiPurchase(fields)
		require.Error(t, err)
	}
	gateway.reply = func(w http.ResponseWriter) { _, _ = io.WriteString(w, `{"code":1,"qrcode":"weixin://test"}`) }
	checkout, err := partnerEpayMapiPurchase(fields)
	require.NoError(t, err)
	require.Equal(t, "weixin://test", checkout.QRCode)
}
