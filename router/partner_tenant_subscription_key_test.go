package router

import (
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestPartnerTenantSubscriptionKeyRoutes(t *testing.T) {
	if os.Getenv("TEST_PARTNER_SUBSCRIPTION_KEY_POSTGRES_DSN") == "" {
		t.Skip("run only with task-owned pq suite; no runtime acceptance without PostgreSQL")
	}
	old := common.RedisEnabled
	common.RedisEnabled = false
	t.Cleanup(func() { common.RedisEnabled = old })
	gin.SetMode(gin.TestMode)
	r := gin.New()
	SetPartnerTenantRouter(r)
	routes := map[string]bool{}
	for _, route := range r.Routes() {
		routes[route.Method+" "+route.Path] = true
	}
	for _, route := range []string{
		"POST /api/partner/v1/subscription-key-orders",
		"GET /api/partner/v1/subscription-key-orders/:order_no",
		"GET /api/partner/v1/subscription-key-orders/:order_no/subscription-key",
		"POST /api/partner/v1/subscriptions/:subscription_id/key/rotate",
		"GET /api/partner/subscription",
		"POST /api/partner/v1/subscription-orders",
		"POST /api/partner/purchase-sessions/:session_id/orders",
		"GET /api/partner/checkout/:order_no",
		"GET /api/partner/subscription/epay/notify",
	} {
		require.True(t, routes[route], route)
	}
	for _, path := range []string{"/api/partner/v1/subscription-key-orders", "/api/partner/v1/subscriptions/1/key/rotate"} {
		req := httptest.NewRequest("POST", path, strings.NewReader(`{}`))
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		require.Equal(t, 401, rec.Code)
		require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
		require.Equal(t, "no-referrer", rec.Header().Get("Referrer-Policy"))
	}
	// Independent route must reach its own sub_ validator, not pt_ / login auth.
	req := httptest.NewRequest("GET", "/api/partner/subscription", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	require.Equal(t, 401, rec.Code)
	require.Contains(t, rec.Body.String(), "invalid_subscription_key")
	require.NotContains(t, rec.Body.String(), "invalid_partner_secret")
}
