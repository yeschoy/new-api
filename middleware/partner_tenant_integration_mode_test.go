package middleware

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestPartnerTenantAccessModeEarlyPolicy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, mode := range []string{model.PartnerTenantIntegrationSubscriptionKey, model.PartnerTenantIntegrationHostedH5, "", "unknown"} {
		for _, op := range []model.PartnerTenantOperation{model.PartnerTenantOperationCatalog, model.PartnerTenantOperationSubscriptionKey, model.PartnerTenantOperationHostedH5, model.PartnerTenantOperationDirectOrder} {
			r := gin.New()
			tenant := &model.PartnerTenant{Id: 1, IntegrationMode: mode}
			reached := false
			var seen *model.PartnerTenant
			// Isolate guard policy only; real bearer/scoped DB paths have pq HTTP tests.
			r.Use(func(c *gin.Context) {
				common.SetContextKey(c, partnerTenantContextKey, tenant)
				c.Next()
				seen = PartnerTenantFromContext(c)
			})
			r.GET("/entry", PartnerTenantAdmission(op), func(c *gin.Context) { reached = true; c.Status(204) })
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, httptest.NewRequest("GET", "/entry", nil))
			allowed := (mode == model.PartnerTenantIntegrationSubscriptionKey && (op == model.PartnerTenantOperationCatalog || op == model.PartnerTenantOperationSubscriptionKey)) || (mode == model.PartnerTenantIntegrationHostedH5 && (op == model.PartnerTenantOperationCatalog || op == model.PartnerTenantOperationHostedH5))
			require.Same(t, tenant, seen)
			if allowed {
				require.Equal(t, 204, rec.Code)
				require.True(t, reached)
			} else {
				require.Equal(t, 403, rec.Code)
				require.False(t, reached)
				require.Contains(t, rec.Body.String(), "integration_mode_mismatch")
			}
		}
	}
}
