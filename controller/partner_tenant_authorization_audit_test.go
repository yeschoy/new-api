package controller

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestPartnerTenantAuthorizationAuditHTTPToAdmin(t *testing.T) {
	dsn := os.Getenv("TEST_PARTNER_ACCESS_AUDIT_POSTGRES_DSN")
	require.NotEmpty(t, dsn, "BLOCKED: task-owned Docker/pq required")
	_, tenant, secret, plan := setupPartnerTenantIsolatedHTTPPQ(t, dsn, "pt_authorization_audit_http_")
	oldLog := model.LOG_DB
	model.LOG_DB = model.DB
	t.Cleanup(func() { model.LOG_DB = oldLog })
	require.NoError(t, model.MigratePartnerOAuthAuthorizationLogs())
	r := gin.New()
	merchant := r.Group("/api/partner/v1", middleware.RequestId(), middleware.PartnerOAuthNoStore(), middleware.PartnerTenantAuthorizationAudit(), PartnerTenantSubscriptionKeyRequestPolicy(), middleware.PartnerTenantBearer())
	merchant.GET("/subscription-key-orders/:order_no/subscription-key", middleware.PartnerTenantAdmission(model.PartnerTenantOperationSubscriptionKey), PartnerTenantClaimSubscriptionKey)
	merchant.POST("/subscriptions/:subscription_id/key/rotate", middleware.PartnerTenantAdmission(model.PartnerTenantOperationSubscriptionKey), PartnerTenantRotateSubscriptionKey)
	r.GET("/api/partner/subscription", middleware.RequestId(), middleware.PartnerOAuthNoStore(), middleware.PartnerTenantAuthorizationAudit(), PartnerTenantSubscriptionKeyRequestPolicy(), PartnerTenantIndependentSubscription)
	// This fixture tests projection/filter only. Production permission gate remains
	// authz.PartnerOAuthClientRead; it is NOT replaced by this test-only route.
	r.GET("/admin-logs", GetPartnerOAuthAuthorizationLogs)
	order, _, err := model.CreatePartnerTenantSubscriptionKeyOrder(model.PartnerTenantSubscriptionKeyOrderInput{TenantId: tenant.Id, TenantSecretHash: tenant.SecretHash, IdempotencyHash: strings.Repeat("a", 64), PlanId: plan.Id, PaymentMethod: "alipay", MerchantId: "audit-test"}, nil)
	require.NoError(t, err)
	require.NoError(t, model.RecordPartnerTenantPayment(order.OrderNo, model.PaymentProviderEpay, "audit-test", "alipay", "audit-transaction", order.AmountCents))
	require.NoError(t, model.FulfillPartnerTenantSubscriptionOrder(order.OrderNo))
	claim := subscriptionKeyHTTPRequest(r, "GET", "/api/partner/v1/subscription-key-orders/"+order.OrderNo+"/subscription-key", secret, "", "", "")
	require.Equal(t, 200, claim.Code, claim.Body.String())
	var key model.PartnerTenantSubscriptionKeyResult
	require.NoError(t, json.Unmarshal(claim.Body.Bytes(), &key))
	for _, state := range []string{"active", "exhausted", "expired", "cancelled"} {
		status, used := "active", int64(0)
		if state == "exhausted" {
			used = plan.TotalAmount
		}
		if state == "expired" || state == "cancelled" {
			status = state
		}
		require.NoError(t, model.DB.Model(&model.UserSubscription{}).Where("id = ?", key.SubscriptionId).Updates(map[string]any{"status": status, "amount_used": used}).Error)
		read := subscriptionKeyHTTPRequest(r, "GET", "/api/partner/subscription", key.SubscriptionKey, "", "", "")
		require.Equal(t, 200, read.Code, read.Body.String())
	}
	rows, total, err := model.GetPartnerOAuthAuthorizationLogs(model.PartnerOauthAuthorizationLogFilter{Action: model.PartnerTenantAuditRead}, 0, 20)
	require.NoError(t, err)
	require.EqualValues(t, 4, total)
	for _, row := range rows {
		require.True(t, row.Success)
		require.Equal(t, tenant.Id, row.TenantId)
		require.EqualValues(t, key.SubscriptionId, row.SubscriptionId)
	}
	path := "/api/partner/v1/subscriptions/" + strconv.Itoa(key.SubscriptionId) + "/key/rotate"
	for range 2 {
		rotated := subscriptionKeyHTTPRequest(r, "POST", path, secret, "audit-rotation-000001", "", `{"expected_version":1}`)
		require.Equal(t, 200, rotated.Code, rotated.Body.String())
	}
	rotations, n, err := model.GetPartnerOAuthAuthorizationLogs(model.PartnerOauthAuthorizationLogFilter{Action: model.PartnerTenantAuditRotate}, 0, 20)
	require.NoError(t, err)
	require.EqualValues(t, 2, n)
	replays := 0
	for _, row := range rotations {
		if row.Replayed {
			replays++
		}
	}
	require.Equal(t, 1, replays)
	for _, row := range rotations {
		require.EqualValues(t, 2, row.KeyVersion)
	}
	// Strict parser returns before bearer lookup but still has request correlation,
	// one read failure and no ownership guessed from an otherwise valid header.
	req := httptest.NewRequest("GET", "/api/partner/subscription", nil)
	req.Header.Add("Authorization", "Bearer "+key.SubscriptionKey)
	req.Header.Add("Authorization", "Bearer sub_untrusted")
	response := httptest.NewRecorder()
	r.ServeHTTP(response, req)
	require.Equal(t, 400, response.Code)
	require.NotEmpty(t, response.Header().Get("X-Request-Id"))
	unknown := subscriptionKeyHTTPRequest(r, "GET", "/api/partner/subscription", "sub_"+strings.Repeat("f", 64), "", "", "")
	require.Equal(t, 401, unknown.Code)
	require.NoError(t, model.DB.Model(tenant).Update("integration_mode", model.PartnerTenantIntegrationHostedH5).Error)
	denied := subscriptionKeyHTTPRequest(r, "GET", "/api/partner/v1/subscription-key-orders/PTO"+strings.Repeat("Z", 32)+"/subscription-key", secret, "", "", "")
	require.Equal(t, 403, denied.Code)
	failures, n, err := model.GetPartnerOAuthAuthorizationLogs(model.PartnerOauthAuthorizationLogFilter{Action: model.PartnerTenantAuditDenied, TenantId: tenant.Id}, 0, 20)
	require.NoError(t, err)
	require.EqualValues(t, 1, n)
	require.Equal(t, "integration_mode_mismatch", failures[0].Reason)
	require.Empty(t, failures[0].OrderNo)
	admin := httptest.NewRecorder()
	r.ServeHTTP(admin, httptest.NewRequest("GET", "/admin-logs?tenant_id="+strconv.FormatInt(tenant.Id, 10)+"&action="+model.PartnerTenantAuditDenied, nil))
	require.Equal(t, 200, admin.Code)
	require.Contains(t, admin.Body.String(), `"tenant_id":"`+strconv.FormatInt(tenant.Id, 10)+`"`)
	for _, q := range []string{"tenant_id=01", "tenant_id=0", "tenant_id=-1", "tenant_id=9223372036854775808", "tenant_id=1&tenant_id=1", "tenant_id=1&unknown=1"} {
		bad := httptest.NewRecorder()
		r.ServeHTTP(bad, httptest.NewRequest("GET", "/admin-logs?"+q, nil))
		require.Equal(t, 400, bad.Code, q)
	}
	all, _, err := model.GetPartnerOAuthAuthorizationLogs(model.PartnerOauthAuthorizationLogFilter{}, 0, 100)
	require.NoError(t, err)
	safe, err := json.Marshal(model.PartnerTenantAuthorizationLogViews(all))
	require.NoError(t, err)
	for _, secretValue := range []string{secret, tenant.SecretHash, key.SubscriptionKey, "sub_untrusted"} {
		require.False(t, bytes.Contains(safe, []byte(secretValue)))
	}
	reads, n, err := model.GetPartnerOAuthAuthorizationLogs(model.PartnerOauthAuthorizationLogFilter{Action: model.PartnerTenantAuditRead}, 0, 20)
	require.NoError(t, err)
	require.EqualValues(t, 6, n)
	for _, row := range reads {
		if !row.Success {
			require.Zero(t, row.TenantId)
			require.Zero(t, row.TargetUserId)
			require.Empty(t, row.OrderNo)
		}
	}
}

func TestPartnerTenantAuthorizationAuditRateOutcome(t *testing.T) {
	dsn := os.Getenv("TEST_PARTNER_ACCESS_AUDIT_POSTGRES_DSN")
	require.NotEmpty(t, dsn, "BLOCKED: task-owned Docker/pq required")
	_, tenant, secret, _ := setupPartnerTenantIsolatedHTTPPQ(t, dsn, "pt_authorization_audit_rate_")
	oldLog := model.LOG_DB
	model.LOG_DB = model.DB
	t.Cleanup(func() { model.LOG_DB = oldLog })
	require.NoError(t, model.MigratePartnerOAuthAuthorizationLogs())
	r := gin.New()
	// Other suites share in-memory rate state and tenant sequences restart at 1.
	// Give this principal a unique ID; do NOT replace the production 1200 budget.
	id := time.Now().UnixNano()
	require.NoError(t, model.DB.Model(tenant).Update("id", id).Error)
	tenant.Id = id
	r.GET("/limited", middleware.RequestId(), middleware.PartnerTenantAuthorizationAudit(), PartnerTenantSubscriptionKeyRequestPolicy(), middleware.PartnerTenantBearer(), func(c *gin.Context) { c.Status(204) })
	for i := 0; i <= 1200; i++ {
		response := subscriptionKeyHTTPRequest(r, "GET", "/limited", secret, "", "", "")
		if i < 1200 {
			require.Equal(t, 204, response.Code, "request %d", i+1)
		} else {
			require.Equal(t, 429, response.Code)
			require.NotEmpty(t, response.Header().Get("Retry-After"))
		}
	}
	rows, total, err := model.GetPartnerOAuthAuthorizationLogs(model.PartnerOauthAuthorizationLogFilter{}, 0, 20)
	require.NoError(t, err)
	require.EqualValues(t, 1, total)
	require.Equal(t, model.PartnerTenantAuditDenied, rows[0].Action)
	require.Equal(t, "rate_limited", rows[0].Reason)
	require.Equal(t, tenant.Id, rows[0].TenantId)
}

func TestPartnerTenantAuthorizationAuditSlowBodyCurrentMode(t *testing.T) {
	for _, test := range []struct {
		name, path, body, initial, current, action string
	}{
		{"session", "/purchase-sessions", `{"external_user_id":"buyer"}`, model.PartnerTenantIntegrationHostedH5, model.PartnerTenantIntegrationSubscriptionKey, model.PartnerTenantAuditDenied},
		{"account", "/accounts", `{"external_user_id":"buyer"}`, model.PartnerTenantIntegrationHostedH5, model.PartnerTenantIntegrationSubscriptionKey, model.PartnerTenantAuditDenied},
		{"rotate", "/subscriptions/1/key/rotate", `{"expected_version":1}`, model.PartnerTenantIntegrationSubscriptionKey, model.PartnerTenantIntegrationHostedH5, model.PartnerTenantAuditRotate},
	} {
		t.Run(test.name, func(t *testing.T) {
			dsn := os.Getenv("TEST_PARTNER_ACCESS_AUDIT_POSTGRES_DSN")
			require.NotEmpty(t, dsn, "BLOCKED: task-owned Docker/pq required")
			_, tenant, secret, _ := setupPartnerTenantIsolatedHTTPPQ(t, dsn, "pt_authorization_audit_body_")
			oldLog := model.LOG_DB
			model.LOG_DB = model.DB
			t.Cleanup(func() { model.LOG_DB = oldLog })
			require.NoError(t, model.MigratePartnerOAuthAuthorizationLogs())
			require.NoError(t, model.DB.Model(tenant).Update("integration_mode", test.initial).Error)
			r := gin.New()
			g := r.Group("/api/partner/v1", middleware.RequestId(), middleware.PartnerTenantAuthorizationAudit(), PartnerTenantSubscriptionKeyRequestPolicy(), middleware.PartnerTenantBearer())
			g.POST("/purchase-sessions", middleware.PartnerTenantAdmission(model.PartnerTenantOperationHostedH5), PartnerTenantCreatePurchaseSession)
			g.PUT("/accounts", middleware.PartnerTenantAdmission(model.PartnerTenantOperationHostedH5), PartnerTenantProvisionAccount)
			g.POST("/subscriptions/:subscription_id/key/rotate", middleware.PartnerTenantAdmission(model.PartnerTenantOperationSubscriptionKey), PartnerTenantRotateSubscriptionKey)
			body := &accessModeSlowBody{entered: make(chan struct{}), release: make(chan struct{}), Reader: strings.NewReader(test.body)}
			released := false
			t.Cleanup(func() {
				if !released {
					close(body.release)
				}
			})
			method := "POST"
			if test.name == "account" {
				method = "PUT"
			}
			req := httptest.NewRequest(method, "/api/partner/v1"+test.path, nil)
			req.Body = body
			req.Header.Set("Authorization", "Bearer "+secret)
			req.Header.Set("Idempotency-Key", "audit-slow-body-000001")
			response := httptest.NewRecorder()
			done := make(chan struct{})
			go func() { r.ServeHTTP(response, req); close(done) }()
			select {
			case <-body.entered:
			case <-time.After(5 * time.Second):
				t.Fatal("body was not reached")
			}
			require.NoError(t, model.DB.Model(tenant).Update("integration_mode", test.current).Error)
			close(body.release)
			released = true
			select {
			case <-done:
			case <-time.After(5 * time.Second):
				t.Fatal("body waiter did not complete")
			}
			require.Equal(t, 403, response.Code, response.Body.String())
			rows, n, err := model.GetPartnerOAuthAuthorizationLogs(model.PartnerOauthAuthorizationLogFilter{}, 0, 20)
			require.NoError(t, err)
			require.EqualValues(t, 1, n)
			require.Len(t, rows, 1)
			require.Equal(t, test.action, rows[0].Action)
			require.Equal(t, "integration_mode_mismatch", rows[0].Reason)
			require.Equal(t, tenant.Id, rows[0].TenantId)
			require.Equal(t, test.current, rows[0].IntegrationMode)
			require.Empty(t, rows[0].OrderNo)
			require.Zero(t, rows[0].SubscriptionId)
			require.Zero(t, rows[0].KeyVersion)
		})
	}
}
