package controller

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/require"
)

func TestPartnerTenantPurchaseNewOrderValidationAndEmptyCatalog(t *testing.T) {
	engine, tenant, secret, plan := setupPartnerTenantPurchaseController(t)
	startFakeZPay(t)
	view, launch := createPurchaseControllerSession(t, engine, secret, "validation-intent-01")
	token := exchangePurchaseControllerSession(t, engine, view, launch)
	path := "/api/partner/purchase-sessions/" + view.SessionId
	body := fmt.Sprintf(`{"plan_id":%d,"payment_method":"alipay"}`, plan.Id)
	require.NoError(t, model.DB.Model(plan).Update("currency", "USD").Error)
	invalidCurrency := partnerIntegrationRequest(engine, "POST", path+"/orders", token, "", body)
	require.Equal(t, 400, invalidCurrency.Code)
	require.Contains(t, invalidCurrency.Body.String(), "unsupported_currency")
	empty := partnerIntegrationRequest(engine, "GET", path, token, "", "")
	require.Equal(t, 200, empty.Code)
	require.Contains(t, empty.Body.String(), `"plans":[]`)
	// The original merchant catalog remains truthful about historical currency.
	legacyCatalog := partnerIntegrationRequest(engine, "GET", "/api/partner/v1/plans", secret, "", "")
	require.Equal(t, 200, legacyCatalog.Code)
	require.Contains(t, legacyCatalog.Body.String(), `"currency":"USD"`)
	require.NoError(t, model.DB.Model(plan).Updates(map[string]any{"currency": "CNY", "partner_tenant_id": tenant.Id + 100}).Error)
	foreign := partnerIntegrationRequest(engine, "POST", path+"/orders", token, "", body)
	require.Equal(t, 404, foreign.Code)
	require.Contains(t, foreign.Body.String(), "plan_not_found")
	require.NoError(t, model.DB.Model(plan).Updates(map[string]any{"partner_tenant_id": tenant.Id, "enabled": false}).Error)
	require.Equal(t, 404, partnerIntegrationRequest(engine, "POST", path+"/orders", token, "", body).Code)
	require.NoError(t, model.DB.Model(plan).Update("enabled", true).Error)
	methods := operation_setting.PayMethods
	operation_setting.PayMethods = nil
	unavailable := partnerIntegrationRequest(engine, "POST", path+"/orders", token, "", body)
	operation_setting.PayMethods = methods
	require.Equal(t, 503, unavailable.Code)
	var count int64
	require.NoError(t, model.DB.Model(&model.PartnerTenantSubscriptionOrder{}).Count(&count).Error)
	require.Zero(t, count)
	created := partnerIntegrationRequest(engine, "POST", path+"/orders", token, "", body)
	require.Equal(t, 201, created.Code, created.Body.String())
	stored, err := model.FindPartnerTenantOrderByIdempotency(tenant.Id, model.PartnerTenantPurchaseOrderIdempotencyHash(view.SessionId))
	require.NoError(t, err)
	require.NoError(t, model.DB.Model(stored).Update("expires_at", time.Now().Unix()-1).Error)
	result := partnerIntegrationRequest(engine, "GET", path, token, "", "")
	require.Equal(t, 200, result.Code)
	require.Contains(t, result.Body.String(), `"payment_status":"expired"`)
	require.NotContains(t, result.Body.String(), "checkout_url")
	require.NotContains(t, result.Body.String(), "trusted-buyer")
	// Changing price/availability cannot change an accepted request's snapshot
	// or create a second row, including an already expired order.
	require.NoError(t, model.DB.Model(plan).Updates(map[string]any{"enabled": false, "price_amount": 88}).Error)
	operation_setting.PayMethods = nil
	replay := partnerIntegrationRequest(engine, "POST", path+"/orders", token, "", body)
	operation_setting.PayMethods = methods
	require.Equal(t, 200, replay.Code, replay.Body.String())
	require.Contains(t, replay.Body.String(), stored.OrderNo)
	require.NoError(t, model.DB.Model(&model.PartnerTenantSubscriptionOrder{}).Count(&count).Error)
	require.EqualValues(t, 1, count)
	persisted, err := model.GetPartnerTenantSubscriptionOrder(tenant.Id, stored.OrderNo)
	require.NoError(t, err)
	require.Equal(t, "9.99", persisted.Amount())
}

func TestPartnerTenantPurchaseOriginAndLaunchExpiry(t *testing.T) {
	engine, _, secret, _ := setupPartnerTenantPurchaseController(t)
	for _, origin := range []string{"http://platform.example", "https://user:pass@platform.example", "https://platform.example/other", "https://platform.example?x=y", "https://platform.example#fragment"} {
		operation_setting.CustomCallbackAddress = origin
		response := partnerIntegrationRequest(engine, "POST", "/api/partner/v1/purchase-sessions", secret, "invalid-origin-00001", `{"external_user_id":"trusted-buyer"}`)
		require.Equal(t, 503, response.Code, origin)
	}
	var count int64
	require.NoError(t, model.DB.Model(&model.PartnerTenantPurchaseSession{}).Count(&count).Error)
	require.Zero(t, count)
	operation_setting.CustomCallbackAddress = "https://platform.example"
	view, _ := createPurchaseControllerSession(t, engine, secret, "expired-launch-00001")
	require.NoError(t, model.DB.Model(&model.PartnerTenantPurchaseSession{}).Where("session_id = ?", view.SessionId).Update("launch_expires_at", time.Now().Unix()-1).Error)
	session, err := model.GetPartnerTenantPurchaseSession(0, view.SessionId)
	require.NoError(t, err)
	// Even a correctly signed launch at the stored deadline cannot redeem.
	body := `{"launch_code":"` + model.PartnerTenantPurchaseLaunchCode(session) + `","client_nonce":"` + strings.Repeat("a", 64) + `"}`
	response := partnerIntegrationRequest(engine, "POST", "/api/partner/purchase-sessions/"+view.SessionId+"/exchange", "", "", body)
	require.Equal(t, 401, response.Code)
	require.NotContains(t, response.Body.String(), "trusted-buyer")
	merchant := partnerIntegrationRequest(engine, "GET", "/api/partner/v1/purchase-sessions/"+view.SessionId, secret, "", "")
	require.Equal(t, 200, merchant.Code)
	require.Contains(t, merchant.Body.String(), `"order":null`)
}
