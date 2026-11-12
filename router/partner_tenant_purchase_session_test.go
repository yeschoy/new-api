package router

import (
	"net/http"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// These router tests, even ones without database access, run only in the
// task-owned Docker Go runner alongside the paid-order regression suite.
func TestPartnerTenantPurchaseRoutesAreScopedAndPrivate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previous := common.RedisEnabled
	common.RedisEnabled = false
	t.Cleanup(func() { common.RedisEnabled = previous })
	engine := gin.New()
	SetPartnerTenantRouter(engine)
	sessionID := "PPS" + strings.Repeat("a", 32)
	for _, request := range []struct{ method, path string }{
		{http.MethodPost, "/api/partner/v1/purchase-sessions"},
		{http.MethodGet, "/api/partner/v1/purchase-sessions/" + sessionID},
		{http.MethodPost, "/api/partner/purchase-sessions/" + sessionID + "/exchange"},
		{http.MethodGet, "/api/partner/purchase-sessions/" + sessionID},
		{http.MethodPost, "/api/partner/purchase-sessions/" + sessionID + "/orders"},
	} {
		response := performPluginRequest(engine, request.method, request.path)
		require.Equal(t, http.StatusUnauthorized, response.Code, response.Body.String())
		require.Equal(t, "no-store", response.Header().Get("Cache-Control"))
		require.Empty(t, response.Header().Get("Access-Control-Allow-Origin"))
		require.NotContains(t, response.Body.String(), "external_user_id")
		if strings.HasPrefix(request.path, "/api/partner/purchase-sessions/") {
			require.Equal(t, "no-referrer", response.Header().Get("Referrer-Policy"))
			require.Contains(t, response.Body.String(), "invalid_purchase_access")
		}
	}
}

func TestPartnerPurchaseHTMLPrivacyCanonicalizationAndNegativePaths(t *testing.T) {
	engine := gin.New()
	SetWebRouter(engine, WebAssets{IndexPage: []byte("public-purchase")}, func(c *gin.Context) { c.Next() })
	const query = "session_id=PPStest&extra=a%2Fb"
	checkPrivacy := func(t *testing.T, headers http.Header) {
		t.Helper()
		require.Contains(t, headers.Get("Cache-Control"), "no-store")
		require.Equal(t, "no-referrer", headers.Get("Referrer-Policy"))
		require.Equal(t, "DENY", headers.Get("X-Frame-Options"))
		require.Equal(t, "frame-ancestors 'none'", headers.Get("Content-Security-Policy"))
	}
	canonical := performPluginRequest(engine, http.MethodGet, "/partner/purchase?"+query)
	require.Equal(t, http.StatusOK, canonical.Code)
	require.Equal(t, "public-purchase", canonical.Body.String())
	checkPrivacy(t, canonical.Header())
	for _, path := range []string{"/partner/%70urchase", "/%70artner/purchase", "/partner%2Fpurchase", "/partner/%70urchase%2f", "/partner/purchase/"} {
		t.Run(path, func(t *testing.T) {
			response := performPluginRequest(engine, http.MethodGet, path+"?"+query)
			require.Equal(t, http.StatusMovedPermanently, response.Code)
			require.Equal(t, "/partner/purchase?"+query, response.Header().Get("Location"))
			checkPrivacy(t, response.Header())
			require.NotContains(t, response.Header().Get("Location"), "pl_")
		})
	}
	for _, path := range []string{"/partner/%2570urchase", "/partner/purchase-other", "/partner/purchase/child", "/partner/purchases", "/partner/other"} {
		response := performPluginRequest(engine, http.MethodGet, path)
		require.Empty(t, response.Header().Get("Location"), path)
		require.Empty(t, response.Header().Get("X-Frame-Options"), path)
	}
	// Malformed encodings cannot enter Go's decoded routing as valid aliases.
	for _, path := range []string{"/partner/%", "/partner/%zzurchase"} {
		_, err := http.NewRequest(http.MethodGet, path, nil)
		require.Error(t, err)
	}
	cashier := performPluginRequest(engine, http.MethodGet, "/partner/checkout")
	require.Equal(t, http.StatusOK, cashier.Code)
	checkPrivacy(t, cashier.Header())
}
