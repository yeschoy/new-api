package controller

import (
	"encoding/json"
	"fmt"
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
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func setupPartnerTenantAccessModeHTTP(t *testing.T) (*gin.Engine, *model.PartnerTenant, string, *model.SubscriptionPlan) {
	_, tenant, secret, plan := setupPartnerTenantIsolatedHTTPPQ(t, os.Getenv("TEST_PARTNER_ACCESS_AUDIT_POSTGRES_DSN"), "pt_access_mode_http_")
	r := gin.New()
	merchant := r.Group("/api/partner/v1", PartnerTenantSubscriptionKeyRequestPolicy(), middleware.PartnerOAuthNoStore(), middleware.PartnerTenantBearer())
	merchant.GET("/plans", middleware.PartnerTenantAdmission(model.PartnerTenantOperationCatalog), PartnerTenantListPlans)
	merchant.POST("/subscription-key-orders", middleware.PartnerTenantAdmission(model.PartnerTenantOperationSubscriptionKey), PartnerTenantCreateSubscriptionKeyOrder)
	merchant.GET("/subscription-key-orders/:order_no", middleware.PartnerTenantAdmission(model.PartnerTenantOperationSubscriptionKey), PartnerTenantGetSubscriptionKeyOrder)
	merchant.GET("/subscription-key-orders/:order_no/subscription-key", middleware.PartnerTenantAdmission(model.PartnerTenantOperationSubscriptionKey), PartnerTenantClaimSubscriptionKey)
	merchant.POST("/subscriptions/:subscription_id/key/rotate", middleware.PartnerTenantAdmission(model.PartnerTenantOperationSubscriptionKey), PartnerTenantRotateSubscriptionKey)
	merchant.POST("/purchase-sessions", middleware.PartnerTenantAdmission(model.PartnerTenantOperationHostedH5), PartnerTenantCreatePurchaseSession)
	merchant.GET("/purchase-sessions/:session_id", middleware.PartnerTenantAdmission(model.PartnerTenantOperationHostedH5), PartnerTenantGetPurchaseSession)
	merchant.PUT("/accounts", middleware.PartnerTenantAdmission(model.PartnerTenantOperationHostedH5), PartnerTenantProvisionAccount)
	merchant.GET("/accounts/:external_user_id/subscription/quota", middleware.PartnerTenantAdmission(model.PartnerTenantOperationHostedH5), PartnerTenantSubscriptionQuota)
	merchant.POST("/subscription-orders", middleware.PartnerTenantAdmission(model.PartnerTenantOperationDirectOrder), PartnerTenantCreateSubscriptionOrder)
	merchant.GET("/subscription-orders/:order_no", middleware.PartnerTenantAdmission(model.PartnerTenantOperationHostedH5), PartnerTenantGetSubscriptionOrder)
	r.POST("/api/partner/purchase-sessions/:session_id/exchange", PartnerTenantExchangePurchaseSession)
	r.GET("/api/partner/purchase-sessions/:session_id", PartnerTenantPublicPurchaseSession)
	r.POST("/api/partner/purchase-sessions/:session_id/orders", PartnerTenantPurchaseSessionCreateOrder)
	r.GET("/api/partner/subscription", PartnerTenantSubscriptionKeyRequestPolicy(), PartnerTenantIndependentSubscription)
	r.GET("/api/partner/checkout/:order_no", PartnerTenantCashier)
	r.GET("/api/partner/subscription/epay/notify", PartnerTenantEpayNotify)
	return r, tenant, secret, plan
}

func TestPartnerTenantAccessModeHTTPMatrix(t *testing.T) {
	r, tenant, secret, plan := setupPartnerTenantAccessModeHTTP(t)
	gateway := startFakeZPay(t)
	for _, mode := range []string{model.PartnerTenantIntegrationSubscriptionKey, model.PartnerTenantIntegrationHostedH5} {
		require.NoError(t, model.DB.Model(tenant).Update("integration_mode", mode).Error)
		type endpoint struct{ method, path string }
		denied := []endpoint{{"POST", "/subscription-orders"}}
		if mode == model.PartnerTenantIntegrationSubscriptionKey {
			denied = append(denied, endpoint{"POST", "/purchase-sessions"}, endpoint{"GET", "/purchase-sessions/PPS" + strings.Repeat("a", 32)}, endpoint{"PUT", "/accounts"}, endpoint{"GET", "/accounts/buyer/subscription/quota"}, endpoint{"GET", "/subscription-orders/PTO" + strings.Repeat("a", 32)})
		} else {
			denied = append(denied, endpoint{"POST", "/subscription-key-orders"}, endpoint{"GET", "/subscription-key-orders/PTO" + strings.Repeat("a", 32)}, endpoint{"GET", "/subscription-key-orders/PTO" + strings.Repeat("a", 32) + "/subscription-key"}, endpoint{"POST", "/subscriptions/1/key/rotate"})
		}
		for _, ep := range denied {
			response := subscriptionKeyHTTPRequest(r, ep.method, "/api/partner/v1"+ep.path, secret, "test-mode-denied-0001", "", `{"ignored":true}`)
			require.Equal(t, 403, response.Code, response.Body.String())
			require.Equal(t, "integration_mode_mismatch", partnerIntegrationErrorCode(t, response))
		}
		require.Equal(t, 200, subscriptionKeyHTTPRequest(r, "GET", "/api/partner/v1/plans", secret, "", "", "").Code)
	}
	require.Empty(t, gateway.requests)
	for _, table := range []any{&model.User{}, &model.PartnerTenantPurchaseSession{}, &model.PartnerTenantSubscriptionOrder{}, &model.PartnerTenantSubscriptionAccessKey{}} {
		var count int64
		require.NoError(t, model.DB.Model(table).Count(&count).Error)
		require.Zero(t, count)
	}
	// Allowed H5 support and session flow retains external identity and no sub_.
	view, launch := createPurchaseControllerSession(t, r, secret, "h5-access-mode-0001")
	token := exchangePurchaseControllerSession(t, r, view, launch)
	path := "/api/partner/purchase-sessions/" + view.SessionId
	require.Equal(t, 200, partnerIntegrationRequest(r, "GET", path, token, "", "").Code)
	body := fmt.Sprintf(`{"plan_id":%d,"payment_method":"alipay"}`, plan.Id)
	response := partnerIntegrationRequest(r, "POST", path+"/orders", token, "", body)
	require.Equal(t, 201, response.Code, response.Body.String())
	var result struct {
		OrderNo string `json:"order_no"`
	}
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &result))
	response = partnerIntegrationRequest(r, "GET", "/api/partner/v1/subscription-orders/"+result.OrderNo, secret, "", "")
	require.Equal(t, 200, response.Code, response.Body.String())
	response = partnerIntegrationRequest(r, "PUT", "/api/partner/v1/accounts", secret, "", `{"external_user_id":"trusted-buyer"}`)
	require.Equal(t, 201, response.Code, response.Body.String())
	// Switching DB in fixture simulates stale/corrupt state, not an admin feature.
	require.NoError(t, model.DB.Model(tenant).Update("integration_mode", model.PartnerTenantIntegrationSubscriptionKey).Error)
	for _, ep := range []struct{ method, path, auth, body string }{{"POST", path + "/exchange", "", `{"launch_code":"` + launch + `","client_nonce":"` + strings.Repeat("a", 64) + `"}`}, {"GET", path, token, ""}, {"POST", path + "/orders", token, body}} {
		bad := partnerIntegrationRequest(r, ep.method, ep.path, ep.auth, "", ep.body)
		require.Equal(t, 401, bad.Code, bad.Body.String())
		require.Equal(t, "invalid_purchase_access", partnerIntegrationErrorCode(t, bad))
		require.NotContains(t, bad.Body.String(), "trusted-buyer")
	}
	require.Len(t, gateway.requests, 1)
	stored, err := model.GetPartnerTenantSubscriptionOrder(tenant.Id, result.OrderNo)
	require.NoError(t, err)
	// Existing cashier capability remains independent of tenant admission.
	cashier := partnerIntegrationRequest(r, "GET", "/api/partner/checkout/"+stored.OrderNo, partnerTenantCashierToken(stored), "", "")
	require.Equal(t, 200, cashier.Code, cashier.Body.String())
	require.NoError(t, model.DB.Model(stored).Update("expires_at", time.Now().Unix()-1).Error)
	notify := partnerIntegrationRequest(r, "GET", "/api/partner/subscription/epay/notify?"+tenantSignedNotification(t, stored.OrderNo, nil), "", "", "")
	require.Equal(t, "success", notify.Body.String())
	stored, err = model.GetPartnerTenantSubscriptionOrder(tenant.Id, stored.OrderNo)
	require.NoError(t, err)
	require.Equal(t, "fulfilled", stored.FulfillmentStatus)

	require.NoError(t, model.DB.Model(tenant).Update("integration_mode", model.PartnerTenantIntegrationHostedH5).Error)
	quota := partnerIntegrationRequest(r, "GET", "/api/partner/v1/accounts/trusted-buyer/subscription/quota", secret, "", "")
	require.Equal(t, 200, quota.Code, quota.Body.String())
	require.Contains(t, quota.Body.String(), "subscriptions")
}

type accessModeSlowBody struct {
	once    sync.Once
	entered chan struct{}
	release chan struct{}
	io.Reader
}

func (b *accessModeSlowBody) Read(p []byte) (int, error) {
	b.once.Do(func() { close(b.entered); <-b.release })
	return b.Reader.Read(p)
}
func (b *accessModeSlowBody) Close() error { return nil }

func TestPartnerTenantAccessModeSlowBody(t *testing.T) {
	r, tenant, secret, plan := setupPartnerTenantAccessModeHTTP(t)
	gateway := startFakeZPay(t)
	for _, target := range []string{"mode", "secret"} {
		require.NoError(t, model.DB.Model(tenant).Updates(map[string]any{"integration_mode": model.PartnerTenantIntegrationSubscriptionKey, "secret_hash": model.HashPartnerOAuthSecret(secret)}).Error)
		body := &accessModeSlowBody{entered: make(chan struct{}), release: make(chan struct{}), Reader: strings.NewReader(fmt.Sprintf(`{"plan_id":%d,"payment_method":"alipay"}`, plan.Id))}
		req := httptest.NewRequest("POST", "/api/partner/v1/subscription-key-orders", nil)
		req.Body = body
		req.Header.Set("Authorization", "Bearer "+secret)
		req.Header.Set("Idempotency-Key", "slow-body-mode-0001")
		rec := httptest.NewRecorder()
		done := make(chan struct{})
		go func() { r.ServeHTTP(rec, req); close(done) }()
		select {
		case <-body.entered:
		case <-time.After(5 * time.Second):
			t.Fatal("body not reached")
		}
		status := 403
		if target == "mode" {
			require.NoError(t, model.DB.Model(tenant).Update("integration_mode", model.PartnerTenantIntegrationHostedH5).Error)
		} else {
			_, err := model.RotatePartnerTenantSecret(tenant.Id)
			require.NoError(t, err)
			status = 401
		}
		close(body.release)
		select {
		case <-done:
		case <-time.After(5 * time.Second):
			t.Fatal("body waiter not completed")
		}
		require.Equal(t, status, rec.Code, rec.Body.String())
	}
	require.Empty(t, gateway.requests)
	var n int64
	require.NoError(t, model.DB.Model(&model.PartnerTenantSubscriptionOrder{}).Count(&n).Error)
	require.Zero(t, n)
}

func TestPartnerTenantAccessModeAdminProofAndImmutable(t *testing.T) {
	_, _, _, _ = setupPartnerTenantAccessModeHTTP(t)
	db := model.DB
	require.NoError(t, db.AutoMigrate(&model.UserSession{}, &model.AuthFlow{}, &model.TwoFA{}, &model.PasskeyCredential{}, &model.AuditLog{}))
	oldLog, oldSession := model.LOG_DB, common.SessionSecret
	model.LOG_DB = db
	common.SessionSecret = "access-mode-proof-test-only"
	oldGroups, _ := json.Marshal(ratio_setting.GetGroupRatioCopy())
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"access-proof-a":1,"access-proof-b":1}`))
	t.Cleanup(func() {
		model.LOG_DB = oldLog
		common.SessionSecret = oldSession
		_ = ratio_setting.UpdateGroupRatioByJSONString(string(oldGroups))
	})
	actor := createPartnerOAuthAdminActor(t, "access-mode-root", common.RoleRootUser)
	admin := gin.New()
	group := admin.Group("/api/partner-tenants", middleware.RootAuth())
	group.POST("", AdminCreatePartnerTenant)
	group.GET("", AdminListPartnerTenants)
	group.POST("/:id/secret", AdminRotatePartnerTenantSecret)
	group.PATCH("/:id/status", AdminUpdatePartnerTenantStatus)
	issue := func(group, mode string) string {
		binding, err := service.BindVerificationOperation(service.VerificationOperation{Scope: service.VerificationScopePartnerTenantSensitiveWrite, Context: []byte(fmt.Sprintf(`{"action":"create","group":%q,"integration_mode":%q}`, group, mode))})
		require.NoError(t, err)
		proof, _, err := service.IssueSecurityProof(actor.identity, service.VerificationMethodPassword, binding)
		require.NoError(t, err)
		return proof
	}
	proof := issue("access-proof-a", model.PartnerTenantIntegrationSubscriptionKey)
	for _, value := range []string{`null`, `""`, `"unknown"`, `"external"`, `"legacy"`} {
		bad := partnerOAuthAdminRequest(admin, "POST", "/api/partner-tenants", actor.token, proof, `{"name":"test","group":"access-proof-a","integration_mode":`+value+`}`)
		require.NotContains(t, bad.Body.String(), `"success":true`)
	}
	wrongMode := partnerOAuthAdminRequest(admin, "POST", "/api/partner-tenants", actor.token, proof, `{"name":"test","group":"access-proof-a","integration_mode":"hosted_h5"}`)
	require.Equal(t, 403, wrongMode.Code, wrongMode.Body.String())
	require.Contains(t, wrongMode.Body.String(), "SECURITY_PROOF_CONTEXT_MISMATCH")
	omitted := partnerOAuthAdminRequest(admin, "POST", "/api/partner-tenants", actor.token, proof, `{"name":"default","group":"access-proof-a"}`)
	require.Equal(t, 200, omitted.Code, omitted.Body.String())
	require.Contains(t, omitted.Body.String(), `"success":true`)
	require.Contains(t, omitted.Body.String(), `"integration_mode":"subscription_key"`)
	replay := partnerOAuthAdminRequest(admin, "POST", "/api/partner-tenants", actor.token, proof, `{"name":"replay","group":"access-proof-a"}`)
	require.Contains(t, replay.Body.String(), "SECURITY_PROOF_CONSUMED")
	created := partnerOAuthAdminRequest(admin, "POST", "/api/partner-tenants", actor.token, issue("access-proof-b", model.PartnerTenantIntegrationHostedH5), `{"name":"H5","group":"access-proof-b","integration_mode":"hosted_h5"}`)
	require.Contains(t, created.Body.String(), `"integration_mode":"hosted_h5"`)
	var tenant model.PartnerTenant
	require.NoError(t, db.Where("name = ?", "H5").First(&tenant).Error)
	path := "/api/partner-tenants/" + strconv.FormatInt(tenant.Id, 10)
	rotationBinding, err := service.BindVerificationOperation(service.VerificationOperation{Scope: service.VerificationScopePartnerTenantSensitiveWrite, Context: []byte(fmt.Sprintf(`{"action":"rotate_secret","tenant_id":%d}`, tenant.Id))})
	require.NoError(t, err)
	rotationProof, _, err := service.IssueSecurityProof(actor.identity, service.VerificationMethodPassword, rotationBinding)
	require.NoError(t, err)
	for _, ep := range []struct{ method, path, body string }{{"PATCH", path + "/status", `{"status":2,"integration_mode":"subscription_key"}`}, {"POST", path + "/secret", `{"integration_mode":"subscription_key"}`}} {
		denied := partnerOAuthAdminRequest(admin, ep.method, ep.path, actor.token, rotationProof, ep.body)
		require.NotContains(t, denied.Body.String(), `"success":true`)
	}
	var current model.PartnerTenant
	require.NoError(t, db.First(&current, tenant.Id).Error)
	require.Equal(t, tenant.SecretHash, current.SecretHash)
	require.Equal(t, tenant.Status, current.Status)
	require.Equal(t, tenant.IntegrationMode, current.IntegrationMode)
	// Rejected extra input did not consume the valid proof; legal rotation and
	// status operations preserve the stored integration mode.
	rotated := partnerOAuthAdminRequest(admin, "POST", path+"/secret", actor.token, rotationProof, "")
	require.Contains(t, rotated.Body.String(), `"success":true`)
	changed := partnerOAuthAdminRequest(admin, "PATCH", path+"/status", actor.token, "", `{"status":2}`)
	require.Contains(t, changed.Body.String(), `"success":true`)
	require.NoError(t, db.First(&current, tenant.Id).Error)
	require.NotEqual(t, tenant.SecretHash, current.SecretHash)
	require.Equal(t, model.PartnerTenantStatusDisabled, current.Status)
	require.Equal(t, model.PartnerTenantIntegrationHostedH5, current.IntegrationMode)
	nonRoot := createPartnerOAuthAdminActor(t, "access-mode-admin", common.RoleAdminUser)
	forbidden := partnerOAuthAdminRequest(admin, "GET", "/api/partner-tenants", nonRoot.token, "", "")
	require.Equal(t, 403, forbidden.Code, forbidden.Body.String())
	listed := partnerOAuthAdminRequest(admin, "GET", "/api/partner-tenants", actor.token, "", "")
	require.Contains(t, listed.Body.String(), `"integration_mode":"hosted_h5"`)
	var audits []model.AuditLog
	require.NoError(t, db.Where("action = ?", "partner_tenant.create").Find(&audits).Error)
	require.Len(t, audits, 2)
	for _, audit := range audits {
		encoded, err := json.Marshal(audit.Other)
		require.NoError(t, err)
		require.Contains(t, string(encoded), "integration_mode")
	}
}

func TestPartnerTenantAccessModeH5SlowBody(t *testing.T) {
	for _, state := range []string{"new", "unprepared", "prepared", "paid"} {
		t.Run(state, func(t *testing.T) {
			r, tenant, secret, plan := setupPartnerTenantAccessModeHTTP(t)
			require.NoError(t, model.DB.Model(tenant).Update("integration_mode", model.PartnerTenantIntegrationHostedH5).Error)
			gateway := startFakeZPay(t)
			view, launch := createPurchaseControllerSession(t, r, secret, "h5-slow-body-mode-0001")
			token := exchangePurchaseControllerSession(t, r, view, launch)
			path := "/api/partner/purchase-sessions/" + view.SessionId + "/orders"
			body := fmt.Sprintf(`{"plan_id":%d,"payment_method":"alipay"}`, plan.Id)
			if state != "new" {
				if state == "unprepared" {
					gateway.reply = func(w http.ResponseWriter) { w.WriteHeader(502) }
				}
				initial := partnerIntegrationRequest(r, "POST", path, token, "", body)
				if state == "unprepared" {
					require.Equal(t, 503, initial.Code)
				} else {
					require.Equal(t, 201, initial.Code, initial.Body.String())
				}
				if state == "paid" {
					order, err := model.FindPartnerTenantOrderByIdempotency(tenant.Id, model.PartnerTenantPurchaseOrderIdempotencyHash(view.SessionId))
					require.NoError(t, err)
					require.NoError(t, model.RecordPartnerTenantPayment(order.OrderNo, model.PaymentProviderEpay, order.MerchantId, order.PaymentMethod, "slow-body-paid", order.AmountCents))
				}
			}
			before := len(gateway.requests)
			reader := &purchaseControlledBody{Reader: strings.NewReader(body), before: func() {
				require.NoError(t, model.DB.Model(tenant).Update("integration_mode", model.PartnerTenantIntegrationSubscriptionKey).Error)
			}}
			req := httptest.NewRequest("POST", path, reader)
			req.Header.Set("Authorization", "Bearer "+token)
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)
			require.Equal(t, 401, rec.Code, rec.Body.String())
			require.Contains(t, rec.Body.String(), "invalid_purchase_access")
			require.Len(t, gateway.requests, before)
			var n int64
			require.NoError(t, model.DB.Model(&model.PartnerTenantSubscriptionOrder{}).Count(&n).Error)
			if state == "new" {
				require.Zero(t, n)
			} else {
				require.EqualValues(t, 1, n)
			}
		})
	}
}
