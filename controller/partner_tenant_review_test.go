package controller

import (
	"encoding/json"
	"net/http"
	"strconv"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestPartnerTenantPlanCurrencyNormalization(t *testing.T) {
	for _, tc := range []struct {
		name, currency, wantCurrency string
		tenantID                     int64
		price                        float64
		valid                        bool
	}{
		{"tenant defaults to CNY", "", "CNY", 1, 9.99, true},
		{"tenant exact cents", "CNY", "CNY", 1, 0.29, true},
		{"tenant USD refused", "USD", "USD", 1, 9.99, false},
		{"tenant EUR refused", "EUR", "EUR", 1, 9.99, false},
		{"tenant zero refused", "CNY", "CNY", 1, 0, false},
		{"tenant sub-cent refused", "CNY", "CNY", 1, 1.001, false},
		{"ordinary USD unchanged", "USD", "USD", 0, 9.99, true},
		{"ordinary retains USD contract", "CNY", "USD", 0, 9.99, true},
		{"ordinary zero unchanged", "USD", "USD", 0, 0, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			plan := model.SubscriptionPlan{PartnerTenantId: tc.tenantID, Currency: tc.currency, PriceAmount: tc.price}
			require.Equal(t, tc.valid, normalizeSubscriptionPlanCurrency(&plan))
			require.Equal(t, tc.wantCurrency, plan.Currency)
			require.Equal(t, tc.price, plan.PriceAmount, "currency validation must not convert the amount")
		})
	}
}

// Docker-only controller integration: write through the actual admin handlers,
// then purchase through the authenticated Tenant order API and mock gateway.
func TestPartnerTenantAdminPlanCurrencyCheckout(t *testing.T) {
	engine, tenant, secret, _ := setupPartnerTenantOrderController(t)
	gateway := startFakeZPay(t)
	previousRatios := ratio_setting.GroupRatio2JSONString()
	t.Cleanup(func() { require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(previousRatios)) })
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"tenant-order":1,"default":1}`))
	root := func(c *gin.Context) { c.Set("role", common.RoleRootUser) }
	engine.POST("/admin/tenant-plans", root, AdminCreateSubscriptionPlan)
	engine.PUT("/admin/tenant-plans/:id", root, AdminUpdateSubscriptionPlan)
	type adminResponse struct {
		Success bool                   `json:"success"`
		Data    model.SubscriptionPlan `json:"data"`
	}
	adminWrite := func(method, path string, plan model.SubscriptionPlan) adminResponse {
		t.Helper()
		body, err := json.Marshal(AdminUpsertSubscriptionPlanRequest{Plan: plan})
		require.NoError(t, err)
		rec := partnerIntegrationRequest(engine, method, path, "", "", string(body))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		var response adminResponse
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &response), rec.Body.String())
		return response
	}
	plan := model.SubscriptionPlan{PartnerTenantId: tenant.Id, Title: "Admin-created CNY", PriceAmount: 5, Currency: "CNY", Enabled: true, TotalAmount: 1000}
	created := adminWrite(http.MethodPost, "/admin/tenant-plans", plan)
	require.True(t, created.Success)
	require.Positive(t, created.Data.Id)
	require.Equal(t, "CNY", created.Data.Currency)
	require.Equal(t, tenant.Group, created.Data.ApplicableGroup)
	require.Equal(t, "month", created.Data.DurationUnit)
	require.False(t, *created.Data.AllowWalletOverflow)
	plan = created.Data
	plan.PriceAmount = 9.99
	path := "/admin/tenant-plans/" + strconv.Itoa(plan.Id)
	updated := adminWrite(http.MethodPut, path, plan)
	require.True(t, updated.Success)
	var persisted model.SubscriptionPlan
	require.NoError(t, model.DB.First(&persisted, plan.Id).Error)
	require.Equal(t, "CNY", persisted.Currency)
	require.Equal(t, 9.99, persisted.PriceAmount)
	order := createTenantTestOrder(t, engine, secret, &persisted, "admin-created-order-0001")
	require.Equal(t, "9.99", order.Amount)
	require.Equal(t, "CNY", order.Currency)
	require.Len(t, gateway.requests, 1)
	require.Equal(t, "9.99", gateway.requests[0].Get("money"))
	paid := partnerIntegrationRequest(engine, http.MethodGet, "/api/partner/subscription/epay/notify?"+tenantSignedNotification(t, order.OrderNo, nil), "", "", "")
	require.Equal(t, "success", paid.Body.String())
	stored, err := model.GetPartnerTenantSubscriptionOrder(tenant.Id, order.OrderNo)
	require.NoError(t, err)
	require.Equal(t, "fulfilled", stored.FulfillmentStatus)

	for _, invalid := range []struct {
		currency string
		amount   float64
	}{{"USD", 9.99}, {"EUR", 9.99}, {"CNY", 1.001}, {"CNY", 0}} {
		bad := plan
		bad.Currency, bad.PriceAmount = invalid.currency, invalid.amount
		require.False(t, adminWrite(http.MethodPut, path, bad).Success)
		require.False(t, adminWrite(http.MethodPost, "/admin/tenant-plans", bad).Success)
	}
	require.NoError(t, model.DB.First(&persisted, plan.Id).Error)
	require.Equal(t, "CNY", persisted.Currency)
	require.Equal(t, 9.99, persisted.PriceAmount)
	// Default Tenant currency is payable CNY; ordinary plans remain USD even
	// when the caller supplies CNY, preserving their historical contract.
	plan.Id, plan.Currency, plan.Title = 0, "", "Default Tenant currency"
	defaulted := adminWrite(http.MethodPost, "/admin/tenant-plans", plan)
	require.True(t, defaulted.Success)
	require.Equal(t, "CNY", defaulted.Data.Currency)
	ordinary := model.SubscriptionPlan{Title: "Ordinary USD", Currency: "CNY", PriceAmount: 9.99, Enabled: true}
	normal := adminWrite(http.MethodPost, "/admin/tenant-plans", ordinary)
	require.True(t, normal.Success)
	require.Equal(t, "USD", normal.Data.Currency)
	ordinary = normal.Data
	ordinary.Currency = "CNY"
	require.True(t, adminWrite(http.MethodPut, "/admin/tenant-plans/"+strconv.Itoa(ordinary.Id), ordinary).Success)
	require.NoError(t, model.DB.First(&ordinary, ordinary.Id).Error)
	require.Equal(t, "USD", ordinary.Currency)
}

func TestPartnerTenantOrderPurchaseLimitRejectsBeforeGateway(t *testing.T) {
	engine, tenant, secret, plan := setupPartnerTenantOrderController(t)
	gateway := startFakeZPay(t)
	require.NoError(t, model.DB.Model(plan).Update("max_purchase_per_user", 1).Error)
	order := createTenantTestOrder(t, engine, secret, plan, "limited-paid-order-0001")
	require.Equal(t, "success", partnerIntegrationRequest(engine, http.MethodGet, "/api/partner/subscription/epay/notify?"+tenantSignedNotification(t, order.OrderNo, nil), "", "", "").Body.String())
	stored, err := model.GetPartnerTenantSubscriptionOrder(tenant.Id, order.OrderNo)
	require.NoError(t, err)
	require.NoError(t, model.DB.Model(&model.UserSubscription{}).Where("id = ?", stored.SubscriptionId).Updates(map[string]any{"end_time": time.Now().Unix() - 1, "status": "expired"}).Error)
	body := `{"external_user_id":"buyer-7","plan_id":` + strconv.Itoa(plan.Id) + `,"payment_method":"alipay"}`
	rejected := partnerIntegrationRequest(engine, http.MethodPost, "/api/partner/v1/subscription-orders", secret, "limited-second-order-0001", body)
	require.Equal(t, http.StatusConflict, rejected.Code, rejected.Body.String())
	require.Equal(t, "purchase_limit_reached", partnerIntegrationErrorCode(t, rejected))
	require.Len(t, gateway.requests, 1, "known ineligibility must never contact the payment gateway")
	var count int64
	require.NoError(t, model.DB.Model(&model.PartnerTenantSubscriptionOrder{}).Where("tenant_id = ?", tenant.Id).Count(&count).Error)
	require.EqualValues(t, 1, count)
}
