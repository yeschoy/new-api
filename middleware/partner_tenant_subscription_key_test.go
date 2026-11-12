package middleware

import (
	"bytes"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestPartnerTenantSubscriptionKeyAccessLogRedaction(t *testing.T) {
	if os.Getenv("TEST_PARTNER_SUBSCRIPTION_KEY_POSTGRES_DSN") == "" {
		t.Skip("task-owned pq suite only")
	}
	var log bytes.Buffer
	writer := gin.DefaultWriter
	gin.DefaultWriter = &log
	t.Cleanup(func() { gin.DefaultWriter = writer })
	gin.SetMode(gin.TestMode)
	r := gin.New()
	SetUpLogger(r)
	r.NoRoute(func(c *gin.Context) { c.Status(400) })
	secret := "sub_" + strings.Repeat("a", 64)
	for _, path := range []string{"/api/partner/subscription", "/api/partner/v1/subscription-key-orders", "/api/partner/v1/subscriptions/1/key/rotate"} {
		req := httptest.NewRequest("GET", path+"?subscription_key="+secret, nil)
		req.Header.Set("Authorization", "Bearer "+secret)
		req.Header.Set("X-Subscription-Key", secret)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
	}
	require.NotContains(t, log.String(), secret)
	require.NotContains(t, log.String(), "subscription_key=")
}
