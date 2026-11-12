package controller

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// Runtime execution, including this SQLite-backed fixture, is Docker-only.
func setupPartnerTenantPurchaseController(t *testing.T) (*gin.Engine, *model.PartnerTenant, string, *model.SubscriptionPlan) {
	t.Helper()
	engine, tenant, secret, plan := setupPartnerTenantOrderController(t)
	require.NoError(t, model.DB.AutoMigrate(&model.PartnerTenantPurchaseSession{}))
	merchant := engine.Group("/api/partner/v1", middleware.PartnerOAuthNoStore(), middleware.PartnerTenantBearer())
	merchant.GET("/plans", PartnerTenantListPlans)
	merchant.POST("/purchase-sessions", PartnerTenantCreatePurchaseSession)
	merchant.GET("/purchase-sessions/:session_id", PartnerTenantGetPurchaseSession)
	engine.POST("/api/partner/purchase-sessions/:session_id/exchange", PartnerTenantExchangePurchaseSession)
	engine.GET("/api/partner/purchase-sessions/:session_id", PartnerTenantPublicPurchaseSession)
	engine.POST("/api/partner/purchase-sessions/:session_id/orders", PartnerTenantPurchaseSessionCreateOrder)
	return engine, tenant, secret, plan
}

func createPurchaseControllerSession(t *testing.T, engine *gin.Engine, secret, key string) (partnerTenantPurchaseSessionView, string) {
	t.Helper()
	response := partnerIntegrationRequest(engine, "POST", "/api/partner/v1/purchase-sessions", secret, key, `{"external_user_id":"trusted-buyer"}`)
	require.Equal(t, 201, response.Code, response.Body.String())
	var view partnerTenantPurchaseSessionView
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &view))
	u, err := url.Parse(view.PurchaseURL)
	require.NoError(t, err)
	require.Equal(t, "https://platform.example", u.Scheme+"://"+u.Host)
	require.Equal(t, "/partner/purchase", u.Path)
	require.Equal(t, view.SessionId, u.Query().Get("session_id"))
	require.NotContains(t, u.RawQuery, "pl_")
	fragment, err := url.ParseQuery(u.Fragment)
	require.NoError(t, err)
	return view, fragment.Get("launch")
}

func exchangePurchaseControllerSession(t *testing.T, engine *gin.Engine, view partnerTenantPurchaseSessionView, launch string) string {
	t.Helper()
	body := `{"launch_code":"` + launch + `","client_nonce":"` + strings.Repeat("a", 64) + `"}`
	response := partnerIntegrationRequest(engine, "POST", "/api/partner/purchase-sessions/"+view.SessionId+"/exchange", "", "", body)
	require.Equal(t, 200, response.Code, response.Body.String())
	var exchanged struct {
		SessionId   string `json:"session_id"`
		ExpiresAt   int64  `json:"expires_at"`
		AccessToken string `json:"access_token"`
	}
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &exchanged))
	require.Equal(t, view.SessionId, exchanged.SessionId)
	require.Equal(t, view.ExpiresAt, exchanged.ExpiresAt)
	require.True(t, strings.HasPrefix(exchanged.AccessToken, "ps_"))
	require.NotContains(t, response.Body.String(), "trusted-buyer")
	return exchanged.AccessToken
}

func TestPartnerTenantPurchaseSessionHTTPFlowAndOriginalAPIParity(t *testing.T) {
	engine, tenant, secret, plan := setupPartnerTenantPurchaseController(t)
	gateway := startFakeZPay(t)
	view, launch := createPurchaseControllerSession(t, engine, secret, "purchase-intent-0001")
	replay := partnerIntegrationRequest(engine, "POST", "/api/partner/v1/purchase-sessions", secret, "purchase-intent-0001", `{"external_user_id":"trusted-buyer"}`)
	require.Equal(t, 200, replay.Code)
	var replayView partnerTenantPurchaseSessionView
	require.NoError(t, json.Unmarshal(replay.Body.Bytes(), &replayView))
	require.Equal(t, view, replayView)
	conflict := partnerIntegrationRequest(engine, "POST", "/api/partner/v1/purchase-sessions", secret, "purchase-intent-0001", `{"external_user_id":"another-buyer"}`)
	require.Equal(t, 409, conflict.Code)
	require.Contains(t, conflict.Body.String(), "idempotency_conflict")
	merchantPath := "/api/partner/v1/purchase-sessions/" + view.SessionId
	initial := partnerIntegrationRequest(engine, "GET", merchantPath, secret, "", "")
	require.Equal(t, 200, initial.Code)
	require.Contains(t, initial.Body.String(), `"order":null`)
	for _, field := range []string{"purchase_url", "checkout_url", "api_key", "secret_hash", "client_nonce_hash", "access_token"} {
		require.NotContains(t, initial.Body.String(), `"`+field+`"`)
	}
	token := exchangePurchaseControllerSession(t, engine, view, launch)
	require.Equal(t, token, exchangePurchaseControllerSession(t, engine, view, launch))
	publicPath := "/api/partner/purchase-sessions/" + view.SessionId
	catalog := partnerIntegrationRequest(engine, "GET", publicPath, token, "", "")
	require.Equal(t, 200, catalog.Code, catalog.Body.String())
	require.Equal(t, "no-store", catalog.Header().Get("Cache-Control"))
	require.Equal(t, "no-referrer", catalog.Header().Get("Referrer-Policy"))
	require.Contains(t, catalog.Body.String(), `"amount":"9.99"`)
	require.Contains(t, catalog.Body.String(), `"order":null`)
	for _, field := range []string{"external_user_id", "tenant_id", "secret_hash", "api_key", "user_id", "merchant_id", "access_token", "purchase_url"} {
		require.NotContains(t, catalog.Body.String(), `"`+field+`"`)
	}
	body := fmt.Sprintf(`{"plan_id":%d,"payment_method":"alipay"}`, plan.Id)
	created := partnerIntegrationRequest(engine, "POST", publicPath+"/orders", token, "ignored-client-key", body)
	require.Equal(t, 201, created.Code, created.Body.String())
	var response map[string]string
	require.NoError(t, json.Unmarshal(created.Body.Bytes(), &response))
	require.Len(t, response, 2)
	require.True(t, strings.HasPrefix(response["order_no"], "PTO"))
	require.Contains(t, response["checkout_url"], "#token=pc_")
	stored, err := model.FindPartnerTenantOrderByIdempotency(tenant.Id, model.PartnerTenantPurchaseOrderIdempotencyHash(view.SessionId))
	require.NoError(t, err)
	require.Equal(t, "trusted-buyer", stored.ExternalUserId)
	require.Equal(t, response["order_no"], stored.OrderNo)
	require.Equal(t, tenant.Id, stored.TenantId)
	var accounts int64
	require.NoError(t, model.DB.Model(&model.PartnerTenantAccount{}).Count(&accounts).Error)
	require.Zero(t, accounts)
	require.Len(t, gateway.requests, 1)
	methods := operation_setting.PayMethods
	operation_setting.PayMethods = nil
	retry := partnerIntegrationRequest(engine, "POST", publicPath+"/orders", token, "a-different-ignored-key", body)
	operation_setting.PayMethods = methods
	require.Equal(t, 200, retry.Code, retry.Body.String())
	require.JSONEq(t, created.Body.String(), retry.Body.String())
	require.Len(t, gateway.requests, 1)
	for _, changed := range []string{strings.Replace(body, "alipay", "wxpay", 1), fmt.Sprintf(`{"plan_id":%d,"payment_method":"alipay"}`, plan.Id+100)} {
		conflict := partnerIntegrationRequest(engine, "POST", publicPath+"/orders", token, "", changed)
		require.Equal(t, 409, conflict.Code)
		require.Contains(t, conflict.Body.String(), "idempotency_conflict")
	}
	catalog = partnerIntegrationRequest(engine, "GET", publicPath, token, "", "")
	require.Contains(t, catalog.Body.String(), stored.OrderNo)
	require.Contains(t, catalog.Body.String(), "checkout_url")
	require.NotContains(t, catalog.Body.String(), "trusted-buyer")
	require.NotContains(t, catalog.Body.String(), "qrcode")
	merchant := partnerIntegrationRequest(engine, "GET", merchantPath, secret, "", "")
	require.Equal(t, 200, merchant.Code)
	require.Contains(t, merchant.Body.String(), stored.OrderNo)
	require.NotContains(t, merchant.Body.String(), "checkout_url")
	require.NotContains(t, merchant.Body.String(), "pay_url")
	// Merchant APIs keep their original richer DTO, 201/200 and exact replay
	// when new payments are disabled, independently of the session hash domain.
	original := createTenantTestOrder(t, engine, secret, plan, "old-api-intent-00001")
	require.Equal(t, plan.Id, original.PlanId)
	require.Equal(t, "buyer-7", original.ExternalUserId)
	require.NotEqual(t, stored.OrderNo, original.OrderNo)
	oldBody := fmt.Sprintf(`{"external_user_id":"buyer-7","plan_id":%d,"payment_method":"alipay"}`, plan.Id)
	operation_setting.PayMethods = nil
	oldReplay := partnerIntegrationRequest(engine, "POST", "/api/partner/v1/subscription-orders", secret, "old-api-intent-00001", oldBody)
	operation_setting.PayMethods = methods
	require.Equal(t, 200, oldReplay.Code)
	require.Contains(t, oldReplay.Body.String(), original.OrderNo)
	require.Contains(t, oldReplay.Body.String(), `"external_user_id":"buyer-7"`)
	// Paid exact replay also precedes NEW-payment availability and never does
	// gateway I/O, in both entry paths. Conflicting requests still fail first.
	require.NoError(t, model.RecordPartnerTenantPayment(stored.OrderNo, model.PaymentProviderEpay, stored.MerchantId, stored.PaymentMethod, "h5-paid-replay", stored.AmountCents))
	oldStored, err := model.GetPartnerTenantSubscriptionOrder(tenant.Id, original.OrderNo)
	require.NoError(t, err)
	require.NoError(t, model.RecordPartnerTenantPayment(oldStored.OrderNo, model.PaymentProviderEpay, oldStored.MerchantId, oldStored.PaymentMethod, "merchant-paid-replay", oldStored.AmountCents))
	beforePaidReplay := len(gateway.requests)
	operation_setting.PayMethods = nil
	paidReplay := partnerIntegrationRequest(engine, "POST", publicPath+"/orders", token, "", body)
	paidConflict := partnerIntegrationRequest(engine, "POST", publicPath+"/orders", token, "", strings.Replace(body, "alipay", "wxpay", 1))
	oldPaidReplay := partnerIntegrationRequest(engine, "POST", "/api/partner/v1/subscription-orders", secret, "old-api-intent-00001", oldBody)
	oldPaidConflict := partnerIntegrationRequest(engine, "POST", "/api/partner/v1/subscription-orders", secret, "old-api-intent-00001", strings.Replace(oldBody, "alipay", "wxpay", 1))
	operation_setting.PayMethods = methods
	require.Equal(t, 200, paidReplay.Code, paidReplay.Body.String())
	require.JSONEq(t, created.Body.String(), paidReplay.Body.String())
	require.Equal(t, 200, oldPaidReplay.Code, oldPaidReplay.Body.String())
	require.Contains(t, oldPaidReplay.Body.String(), `"payment_status":"paid"`)
	for _, conflict := range []int{paidConflict.Code, oldPaidConflict.Code} {
		require.Equal(t, 409, conflict)
	}
	require.Len(t, gateway.requests, beforePaidReplay)
}

func TestPartnerTenantPurchaseStrictBodiesQueriesAndCapabilityScope(t *testing.T) {
	engine, _, secret, plan := setupPartnerTenantPurchaseController(t)
	startFakeZPay(t)
	for _, body := range []string{`null`, `[]`, `{}`, `{"external_user_id":null}`, `{"External_user_id":"x"}`, `{"external_user_id":"x","external_user_id":"y"}`, `{"external_user_id":"x","tenant_id":1}`, `{"external_user_id":"x"}{}`, `{"external_user_id":"` + strings.Repeat("x", 2048) + `"}`} {
		r := partnerIntegrationRequest(engine, "POST", "/api/partner/v1/purchase-sessions", secret, "strict-intent-00001", body)
		require.Equal(t, 400, r.Code, r.Body.String())
	}
	require.Equal(t, 400, partnerIntegrationRequest(engine, "POST", "/api/partner/v1/purchase-sessions?x=1", secret, "strict-intent-00001", `{"external_user_id":"x"}`).Code)
	require.Equal(t, 400, partnerIntegrationRequest(engine, "POST", "/api/partner/v1/purchase-sessions", secret, "short", `{"external_user_id":"x"}`).Code)
	view, launch := createPurchaseControllerSession(t, engine, secret, "scope-intent-00001")
	path := "/api/partner/purchase-sessions/" + view.SessionId
	valid := `{"launch_code":"` + launch + `","client_nonce":"` + strings.Repeat("a", 64) + `"}`
	for _, body := range []string{`{}`, `null`, valid + valid, strings.Replace(valid, `"client_nonce"`, `"Client_nonce"`, 1), strings.TrimSuffix(valid, "}") + `,"buyer":"bad"}`, strings.TrimSuffix(valid, "}") + `,"client_nonce":"` + strings.Repeat("b", 64) + `"}`, strings.Replace(valid, strings.Repeat("a", 64), strings.Repeat("A", 64), 1), strings.Repeat("x", 2049)} {
		r := partnerIntegrationRequest(engine, "POST", path+"/exchange", "", "", body)
		require.Equal(t, 401, r.Code, r.Body.String())
		require.NotContains(t, r.Body.String(), "trusted-buyer")
	}
	require.Equal(t, 401, partnerIntegrationRequest(engine, "POST", path+"/exchange?launch_code="+launch, "", "", valid).Code)
	token := exchangePurchaseControllerSession(t, engine, view, launch)
	replayed := strings.Replace(valid, strings.Repeat("a", 64), strings.Repeat("b", 64), 1)
	require.Equal(t, 401, partnerIntegrationRequest(engine, "POST", path+"/exchange", "", "", replayed).Code)
	for _, credential := range []string{"", secret, launch, "pc_" + token[3:], token + "x"} {
		require.Equal(t, 401, partnerIntegrationRequest(engine, "GET", path, credential, "", "").Code)
	}
	for _, query := range []string{"?access_token=" + token, "?x=1", "?"} {
		require.Equal(t, 401, partnerIntegrationRequest(engine, "GET", path+query, token, "", "").Code)
		require.Equal(t, 400, partnerIntegrationRequest(engine, "GET", "/api/partner/v1/purchase-sessions/"+view.SessionId+query, secret, "", "").Code)
	}
	other, otherLaunch := createPurchaseControllerSession(t, engine, secret, "scope-intent-00002")
	otherToken := exchangePurchaseControllerSession(t, engine, other, otherLaunch)
	require.Equal(t, 401, partnerIntegrationRequest(engine, "GET", path, otherToken, "", "").Code)
	_, foreignSecret, err := model.CreatePartnerTenant("Other", "other-purchase")
	require.NoError(t, err)
	require.Equal(t, 404, partnerIntegrationRequest(engine, "GET", "/api/partner/v1/purchase-sessions/"+view.SessionId, foreignSecret, "", "").Code)
	body := fmt.Sprintf(`{"plan_id":%d,"payment_method":"alipay"}`, plan.Id)
	for _, field := range []string{`"external_user_id":"other"`, `"tenant_id":2`, `"amount":"0.01"`, `"paid":true`, `"order_no":"PTOother"`, `"plan_id":123`} {
		r := partnerIntegrationRequest(engine, "POST", path+"/orders", token, "", strings.TrimSuffix(body, "}")+","+field+"}")
		require.Equal(t, 400, r.Code, r.Body.String())
	}
	for _, invalid := range []string{`null`, `{}`, body + body, strings.Replace(body, "alipay", strings.Repeat("a", 17), 1)} {
		require.Equal(t, 400, partnerIntegrationRequest(engine, "POST", path+"/orders", token, "", invalid).Code)
	}
	var count int64
	require.NoError(t, model.DB.Model(&model.PartnerTenantSubscriptionOrder{}).Count(&count).Error)
	require.Zero(t, count)
}

func TestPartnerTenantPurchaseCatalogCheckoutFailureExpiryAndRevocation(t *testing.T) {
	engine, tenant, secret, plan := setupPartnerTenantPurchaseController(t)
	gateway := startFakeZPay(t)
	view, launch := createPurchaseControllerSession(t, engine, secret, "failure-intent-0001")
	token := exchangePurchaseControllerSession(t, engine, view, launch)
	path := "/api/partner/purchase-sessions/" + view.SessionId
	// Invalid plan shape, foreign ownership, wrong currency and fractional
	// cents never appear in the new public projection.
	for i, mutate := range []func(*model.SubscriptionPlan){
		func(p *model.SubscriptionPlan) { p.Currency = "USD" }, func(p *model.SubscriptionPlan) { p.PriceAmount = 1.001 },
		func(p *model.SubscriptionPlan) { p.PartnerTenantId = tenant.Id + 100 }, func(p *model.SubscriptionPlan) { p.DurationValue = 2 },
		func(p *model.SubscriptionPlan) { p.AllowWalletOverflow = common.GetPointer(true) }, func(p *model.SubscriptionPlan) { p.ApplicableGroup = "other" },
	} {
		p := *plan
		p.Id = 0
		p.Title = fmt.Sprintf("invalid-%d", i)
		mutate(&p)
		require.NoError(t, model.DB.Create(&p).Error)
	}
	catalog := partnerIntegrationRequest(engine, "GET", path, token, "", "")
	require.Equal(t, 200, catalog.Code)
	require.NotContains(t, catalog.Body.String(), "invalid-")
	var catalogDTO struct {
		Plans   []partnerTenantPurchasePlanView `json:"plans"`
		Methods []partnerPaymentMethod          `json:"payment_methods"`
	}
	require.NoError(t, json.Unmarshal(catalog.Body.Bytes(), &catalogDTO))
	require.Len(t, catalogDTO.Plans, 1)
	require.NotEmpty(t, catalogDTO.Methods)
	methods := operation_setting.PayMethods
	operation_setting.PayMethods = nil
	empty := partnerIntegrationRequest(engine, "GET", path, token, "", "")
	require.Contains(t, empty.Body.String(), `"payment_methods":[]`)
	operation_setting.PayMethods = methods
	body := fmt.Sprintf(`{"plan_id":%d,"payment_method":"alipay"}`, plan.Id)
	gateway.reply = func(w http.ResponseWriter) { w.WriteHeader(http.StatusBadGateway) }
	failed := partnerIntegrationRequest(engine, "POST", path+"/orders", token, "", body)
	require.Equal(t, 503, failed.Code)
	require.NotContains(t, failed.Body.String(), "merchant-secret")
	stored, err := model.FindPartnerTenantOrderByIdempotency(tenant.Id, model.PartnerTenantPurchaseOrderIdempotencyHash(view.SessionId))
	require.NoError(t, err)
	require.Equal(t, "pending", stored.PaymentStatus)
	require.Empty(t, stored.QRCode)
	require.Empty(t, stored.PayURL)
	// A refresh/remount sees a persisted order, not order:null. GET must remain
	// read-only; explicit resume uses these authoritative original parameters.
	afterFailure := partnerIntegrationRequest(engine, "GET", path, token, "", "")
	require.Equal(t, 200, afterFailure.Code, afterFailure.Body.String())
	var recovered struct {
		Order *partnerTenantPurchaseOrderView `json:"order"`
	}
	require.NoError(t, json.Unmarshal(afterFailure.Body.Bytes(), &recovered))
	require.NotNil(t, recovered.Order)
	require.Equal(t, stored.OrderNo, recovered.Order.OrderNo)
	require.Equal(t, stored.ExpiresAt, recovered.Order.ExpiresAt)
	require.Len(t, gateway.requests, 1, "status GET never prepares payment")
	// The current catalog may change/disappear without replacing the accepted
	// price, snapshot or deadline, or preventing exact preparation retry.
	require.NoError(t, model.DB.Model(plan).Updates(map[string]any{"enabled": false, "price_amount": 88}).Error)
	resumeBody := fmt.Sprintf(`{"plan_id":%d,"payment_method":%q}`, recovered.Order.PlanId, recovered.Order.PaymentMethod)
	require.JSONEq(t, body, resumeBody)
	gateway.reply = func(w http.ResponseWriter) {
		_, _ = io.WriteString(w, `{"code":1,"payurl":"https://gateway.example/pay"}`)
	}
	retry := partnerIntegrationRequest(engine, "POST", path+"/orders", token, "", resumeBody)
	require.Equal(t, 200, retry.Code, retry.Body.String())
	require.Contains(t, retry.Body.String(), stored.OrderNo)
	prepared, err := model.GetPartnerTenantSubscriptionOrder(tenant.Id, stored.OrderNo)
	require.NoError(t, err)
	require.Equal(t, stored.PlanSnapshot, prepared.PlanSnapshot)
	require.Equal(t, stored.AmountCents, prepared.AmountCents)
	require.Equal(t, stored.ExpiresAt, prepared.ExpiresAt)
	require.Equal(t, "https://gateway.example/pay", prepared.PayURL)
	require.Len(t, gateway.requests, 2)
	operation_setting.PayMethods = nil
	preparedReplay := partnerIntegrationRequest(engine, "POST", path+"/orders", token, "", resumeBody)
	operation_setting.PayMethods = methods
	require.Equal(t, 200, preparedReplay.Code, preparedReplay.Body.String())
	require.JSONEq(t, retry.Body.String(), preparedReplay.Body.String())
	require.Len(t, gateway.requests, 2, "prepared resume never duplicates payment preparation")
	var count int64
	require.NoError(t, model.DB.Model(&model.PartnerTenantSubscriptionOrder{}).Count(&count).Error)
	require.EqualValues(t, 1, count)
	// H5 expiry does not shorten the existing cashier capability's deadline.
	require.NoError(t, model.DB.Model(&model.PartnerTenantPurchaseSession{}).Where("session_id = ?", view.SessionId).Update("expires_at", time.Now().Unix()-1).Error)
	require.Equal(t, 401, partnerIntegrationRequest(engine, "GET", path, token, "", "").Code)
	require.Equal(t, 401, partnerIntegrationRequest(engine, "POST", path+"/orders", token, "", body).Code)
	require.True(t, validPartnerTenantCashierToken(stored, partnerTenantCashierToken(stored), time.Now().Unix()))
	merchant := partnerIntegrationRequest(engine, "GET", "/api/partner/v1/purchase-sessions/"+view.SessionId, secret, "", "")
	require.Equal(t, 200, merchant.Code)
	require.Contains(t, merchant.Body.String(), stored.OrderNo)
	require.NotContains(t, merchant.Body.String(), "checkout_url")
	// Current merchant credentials can reconcile after rotation, while old
	// browser capabilities (including unredeemed launches) fail closed.
	fresh, freshLaunch := createPurchaseControllerSession(t, engine, secret, "revoke-intent-00001")
	freshToken := exchangePurchaseControllerSession(t, engine, fresh, freshLaunch)
	require.NoError(t, model.UpdatePartnerTenantStatus(tenant.Id, model.PartnerTenantStatusDisabled))
	require.Equal(t, 401, partnerIntegrationRequest(engine, "GET", "/api/partner/purchase-sessions/"+fresh.SessionId, freshToken, "", "").Code)
	require.NoError(t, model.UpdatePartnerTenantStatus(tenant.Id, model.PartnerTenantStatusEnabled))
	newSecret, err := model.RotatePartnerTenantSecret(tenant.Id)
	require.NoError(t, err)
	require.Equal(t, 401, partnerIntegrationRequest(engine, "GET", "/api/partner/purchase-sessions/"+fresh.SessionId, freshToken, "", "").Code)
	require.Equal(t, 200, partnerIntegrationRequest(engine, "GET", "/api/partner/v1/purchase-sessions/"+view.SessionId, newSecret, "", "").Code)
}
