package router

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Isolated pq only; unlike historical router/authz fixtures this does not open
// SQLite or drop/reset shared tables. Tests using these globals are serial.
func setupPartnerTenantAuthorizationAuditRouterPQ(t *testing.T, prefix string) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("TEST_PARTNER_ACCESS_AUDIT_POSTGRES_DSN")
	require.NotEmpty(t, dsn, "BLOCKED: task-owned Docker/pq required")
	cfg, err := pgx.ParseConfig(dsn)
	require.NoError(t, err)
	cfg.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	base := stdlib.OpenDB(*cfg)
	schema := fmt.Sprintf("%s%d", prefix, time.Now().UnixNano())
	_, err = base.Exec("CREATE SCHEMA " + schema)
	require.NoError(t, err)
	require.NoError(t, base.Close())
	cfg.RuntimeParams["search_path"] = schema
	cfg.RuntimeParams["application_name"] = schema
	conn := stdlib.OpenDB(*cfg)
	db, err := gorm.Open(postgres.New(postgres.Config{Conn: conn, PreferSimpleProtocol: true}), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	oldDB, oldLog, mainType, logType, redis := model.DB, model.LOG_DB, common.MainDatabaseType(), common.LogDatabaseType(), common.RedisEnabled
	model.DB, model.LOG_DB = db, db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	common.RedisEnabled = false
	t.Cleanup(func() {
		model.DB, model.LOG_DB = oldDB, oldLog
		common.SetDatabaseTypes(mainType, logType)
		common.RedisEnabled = redis
		_ = conn.Close()
	})
	t.Logf("Retained task-owned schema: %s (no drop)", schema)
	require.NoError(t, model.MigratePartnerTenantIntegrationModes(db))
	require.NoError(t, model.MigratePartnerOAuthAuthorizationLogs())
	return db
}

func TestPartnerTenantAuthorizationAuditActualRouter(t *testing.T) {
	db := setupPartnerTenantAuthorizationAuditRouterPQ(t, "pt_authorization_audit_router_")
	tenant, secret, err := model.CreatePartnerTenantWithIntegrationMode("Audit", "router-audit", model.PartnerTenantIntegrationHostedH5)
	require.NoError(t, err)
	r := gin.New()
	SetPartnerTenantRouter(r)
	r.GET("/admin-logs", controller.GetPartnerOAuthAuthorizationLogs)
	request := httptest.NewRequest("GET", "/api/partner/v1/subscription-key-orders/PTO"+strings.Repeat("A", 32)+"/subscription-key", nil)
	request.Header.Set("Authorization", "Bearer "+secret)
	response := httptest.NewRecorder()
	r.ServeHTTP(response, request)
	require.Equal(t, 403, response.Code)
	require.NotEmpty(t, response.Header().Get("X-Request-Id"))
	rows, total, err := model.GetPartnerOAuthAuthorizationLogs(model.PartnerOauthAuthorizationLogFilter{TenantId: tenant.Id}, 0, 20)
	require.NoError(t, err)
	require.EqualValues(t, 1, total)
	require.Equal(t, model.PartnerTenantAuditDenied, rows[0].Action)
	require.Empty(t, rows[0].OrderNo)
	require.Equal(t, "/api/partner/v1/subscription-key-orders/:order_no/subscription-key", rows[0].Route)
	// Parser must run AFTER correlation/privacy/recorder, and before lookup.
	malformed := httptest.NewRequest("GET", "/api/partner/subscription", nil)
	malformed.Header.Add("Authorization", "Bearer sub_untrusted")
	malformed.Header.Add("Authorization", "Bearer sub_other")
	response = httptest.NewRecorder()
	r.ServeHTTP(response, malformed)
	require.Equal(t, 400, response.Code)
	require.NotEmpty(t, response.Header().Get("X-Request-Id"))
	require.Equal(t, "no-referrer", response.Header().Get("Referrer-Policy"))
	// Panic inside bearer lookup is caught without Gin dumping secret headers.
	var captured bytes.Buffer
	previous := gin.DefaultErrorWriter
	gin.DefaultErrorWriter = &captured
	t.Cleanup(func() { gin.DefaultErrorWriter = previous })
	require.NoError(t, db.Callback().Query().Before("gorm:query").Register("audit_panic", func(tx *gorm.DB) {
		if tx.Statement.Table == "partner_tenants" {
			panic("sub_untrusted panic")
		}
	}))
	response = httptest.NewRecorder()
	r.ServeHTTP(response, request.Clone(request.Context()))
	require.Equal(t, 500, response.Code)
	require.NotContains(t, captured.String(), secret)
	require.NotContains(t, captured.String(), "sub_untrusted")
	require.NoError(t, db.Callback().Query().Remove("audit_panic"))
	failures, total, err := model.GetPartnerOAuthAuthorizationLogs(model.PartnerOauthAuthorizationLogFilter{Action: model.PartnerTenantAuditDenied}, 0, 20)
	require.NoError(t, err)
	require.EqualValues(t, 2, total)
	seenServerError := false
	for _, row := range failures {
		if row.Reason == "server_error" {
			seenServerError = true
			require.Zero(t, row.TenantId)
		}
	}
	require.True(t, seenServerError)
}

func TestPartnerTenantAuthorizationAuditProductionAdminPermission(t *testing.T) {
	db := setupPartnerTenantAuthorizationAuditRouterPQ(t, "pt_authorization_audit_admin_")
	oldSecret, oldMaster, oldRate := common.SessionSecret, common.IsMasterNode, common.GlobalApiRateLimitEnable
	common.SessionSecret = "audit-admin-route-fixture-only"
	common.IsMasterNode = true
	common.GlobalApiRateLimitEnable = false // Not a global-IP-budget test.
	t.Cleanup(func() {
		common.SessionSecret, common.IsMasterNode, common.GlobalApiRateLimitEnable = oldSecret, oldMaster, oldRate
	})
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserSession{}, &model.CasbinRule{}, &model.AuthzRole{}))
	// Real production initialization on this fresh task schema, not the old
	// SQLite authz test setup. No SavePolicy/drop-table fixture is invoked.
	require.NoError(t, authz.Init(db))
	login := func(name string, role int) (*model.User, string) {
		t.Helper()
		user := &model.User{Username: name, AffCode: name, Role: role, Group: "default", Status: common.UserStatusEnabled, AuthVersion: 1}
		require.NoError(t, db.Create(user).Error)
		bundle, err := service.CreateLoginSession(user.Id, "password", "192.0.2.200", "audit-admin-route-test")
		require.NoError(t, err)
		return user, bundle.AccessToken
	}
	_, ordinaryToken := login("audit-user", common.RoleCommonUser)
	denied, deniedToken := login("audit-denied", common.RoleAdminUser)
	_, readToken := login("audit-reader", common.RoleAdminUser)
	_, rootToken := login("audit-root", common.RoleRootUser)
	require.NoError(t, authz.SetUserPermissions(denied.Id, authz.PermissionsMap{
		authz.ResourcePartnerOAuthClient: {authz.ActionRead: false},
	}))
	// Safe fixture rows make the actual handler prove tenant filtering and all
	// new decimal-string fields, not just a successful authorization sentinel.
	for _, tenantID := range []int64{9007199254740993, 9007199254740994} {
		model.RecordPartnerTenantAudit(nil, model.PartnerTenantAuditIssue, 0, true, "", model.PartnerTenantAuditReceipt{
			TenantId: tenantID, OrderNo: "PTO" + strings.Repeat("A", 32), SubscriptionId: 9007199254740995,
			IntegrationMode: model.PartnerTenantIntegrationSubscriptionKey, KeyVersion: 2, TargetUserId: 42,
		})
	}
	engine := gin.New()
	engine.Use(middleware.RequestId())
	SetApiRouter(engine) // Actual production registration: DisableCache -> AdminAuth -> RequirePermission.
	for _, test := range []struct {
		name, token string
		status      int
	}{
		{"anonymous", "", http.StatusUnauthorized},
		{"ordinary", ordinaryToken, http.StatusForbidden},
		{"admin_without_read", deniedToken, http.StatusForbidden},
		{"read_admin", readToken, http.StatusOK},
		{"root", rootToken, http.StatusOK},
	} {
		t.Run(test.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/partner-oauth/authorization-logs?tenant_id=9007199254740993", nil)
			if test.token != "" {
				req.Header.Set("Authorization", "Bearer "+test.token)
			}
			response := httptest.NewRecorder()
			engine.ServeHTTP(response, req)
			require.Equal(t, test.status, response.Code, response.Body.String())
			require.Contains(t, response.Header().Get("Cache-Control"), "no-store")
			if test.status != http.StatusOK {
				require.NotContains(t, response.Body.String(), "PTO"+strings.Repeat("A", 32))
				return
			}
			var result struct {
				Success bool `json:"success"`
				Data    struct {
					Items []model.PartnerTenantAuthorizationLogView `json:"items"`
					Total int64                                     `json:"total"`
				} `json:"data"`
			}
			require.NoError(t, json.Unmarshal(response.Body.Bytes(), &result))
			require.True(t, result.Success)
			require.EqualValues(t, 1, result.Data.Total)
			require.Len(t, result.Data.Items, 1)
			item := result.Data.Items[0]
			require.Equal(t, "9007199254740993", item.TenantID)
			require.Equal(t, "9007199254740995", item.SubscriptionID)
			require.Equal(t, "2", item.Version)
			require.Equal(t, model.PartnerTenantAuditIssue, item.Action)
			require.Zero(t, item.Status)
		})
	}
}
