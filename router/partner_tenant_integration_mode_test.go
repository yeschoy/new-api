package router

import (
	"fmt"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func TestPartnerTenantAccessModeActualRoutes(t *testing.T) {
	dsn := os.Getenv("TEST_PARTNER_ACCESS_AUDIT_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("BLOCKED: task-owned PostgreSQL DSN required, no runtime evidence")
	}
	cfg, err := pgx.ParseConfig(dsn)
	require.NoError(t, err)
	cfg.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	base := stdlib.OpenDB(*cfg)
	schema := fmt.Sprintf("pt_access_mode_router_%d", time.Now().UnixNano())
	_, err = base.Exec("CREATE SCHEMA " + schema)
	require.NoError(t, err)
	require.NoError(t, base.Close())
	cfg.RuntimeParams["search_path"] = schema
	cfg.RuntimeParams["application_name"] = schema
	conn := stdlib.OpenDB(*cfg)
	db, err := gorm.Open(postgres.New(postgres.Config{Conn: conn, PreferSimpleProtocol: true}), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	previous, redis, main, log := model.DB, common.RedisEnabled, common.MainDatabaseType(), common.LogDatabaseType()
	model.DB = db
	common.RedisEnabled = false
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	t.Cleanup(func() {
		model.DB = previous
		common.RedisEnabled = redis
		common.SetDatabaseTypes(main, log)
		_ = conn.Close()
	})
	require.NoError(t, model.MigratePartnerTenantIntegrationModes(db))
	r := gin.New()
	SetPartnerTenantRouter(r)
	for _, mode := range []string{model.PartnerTenantIntegrationSubscriptionKey, model.PartnerTenantIntegrationHostedH5} {
		tenant, secret, err := model.CreatePartnerTenantWithIntegrationMode("route", mode, mode)
		require.NoError(t, err)
		denied := []struct{ method, path string }{{"POST", "/subscription-orders"}}
		if mode == model.PartnerTenantIntegrationSubscriptionKey {
			denied = append(denied, struct{ method, path string }{"POST", "/purchase-sessions"}, struct{ method, path string }{"GET", "/purchase-sessions/PPS" + strings.Repeat("a", 32)}, struct{ method, path string }{"PUT", "/accounts"}, struct{ method, path string }{"GET", "/accounts/buyer/subscription/quota"}, struct{ method, path string }{"GET", "/subscription-orders/PTO" + strings.Repeat("a", 32)})
		} else {
			denied = append(denied, struct{ method, path string }{"POST", "/subscription-key-orders"}, struct{ method, path string }{"GET", "/subscription-key-orders/PTO" + strings.Repeat("a", 32)}, struct{ method, path string }{"GET", "/subscription-key-orders/PTO" + strings.Repeat("a", 32) + "/subscription-key"}, struct{ method, path string }{"POST", "/subscriptions/1/key/rotate"})
		}
		for _, ep := range denied {
			// No order/account/session tables: reaching a handler/model mutation would
			// cause a DB failure, not the required early safe denial.
			req := httptest.NewRequest(ep.method, "/api/partner/v1"+ep.path, strings.NewReader("not JSON"))
			req.Header.Set("Authorization", "Bearer "+secret)
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, req)
			require.Equal(t, 403, rec.Code, rec.Body.String())
			require.Contains(t, rec.Body.String(), "integration_mode_mismatch")
			require.NotContains(t, rec.Body.String(), tenant.SecretHash)
		}
	}
	t.Logf("Retained task-owned PostgreSQL schema: %s; no cleanup", schema)
}
