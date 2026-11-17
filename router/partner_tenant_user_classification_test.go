package router

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// A recognisable credential marker seeded into the tenant secret hash, the
// external buyer ID and a model token key. No response body may contain it.
const partnerTenantUserClassificationRouterSecretMarker = "PTUSERCLASSROUTERSECRETMARKER"

// Route and PAT-rule declarations of the real production registration (no
// database): the classification adds no route and loosens none.
func TestPartnerTenantUserClassificationRouteDeclarations(t *testing.T) {
	engine := newAccessTokenScopeTestEngine(t)
	registered := map[string]int{}
	for _, route := range engine.Routes() {
		registered[route.Method+" "+route.Path]++
	}
	for _, key := range []string{"GET /api/user/", "GET /api/user/search", "GET /api/user/tenant-options"} {
		require.Equal(t, 1, registered[key], key)
		rule, declared := middleware.AccessTokenRouteRule(key)
		require.True(t, declared, key)
		require.Equal(t, "scope", rule.Kind(), key)
		require.Equal(t, "user:read", rule.Scope(), key)
	}
	for key := range registered {
		for _, invented := range []string{"user_category", "user-category", "merchant-users", "tenant-users", "classification"} {
			require.NotContains(t, key, invented, "no new route exposes the classification")
		}
	}
	// The root-only management API stays session-bound.
	rule, declared := middleware.AccessTokenRouteRule("GET /api/partner-tenants")
	require.True(t, declared)
	require.Equal(t, "session", rule.Kind())
}

// Task-owned PostgreSQL only: a unique retained pt_user_class_ schema, no
// SQLite, no drop/truncate. A missing DSN fails the test; it is never a pass.
// Tests using these process globals are serial.
func setupPartnerTenantUserClassificationRouterPQ(t *testing.T, prefix string) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("TEST_PARTNER_USER_CLASSIFICATION_POSTGRES_DSN")
	require.NotEmpty(t, dsn, "BLOCKED: explicit task-owned Docker/pq DSN required; no SQLite/MySQL/production substitute")
	require.True(t, strings.HasPrefix(prefix, "pt_user_class_"), "classification fixtures own the pt_user_class_ schema prefix")
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
	model.ResetPartnerTenantMembershipCache()
	t.Cleanup(func() {
		model.DB, model.LOG_DB = oldDB, oldLog
		common.SetDatabaseTypes(mainType, logType)
		common.RedisEnabled = redis
		model.ResetPartnerTenantMembershipCache()
		_ = conn.Close()
	})
	t.Logf("Retained task-owned schema: %s (no drop)", schema)
	require.NoError(t, model.MigratePartnerTenantIntegrationModes(db))
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserSession{}, &model.UserAccessToken{}, &model.Token{}, &model.SubscriptionPlan{}, &model.UserSubscription{}))
	require.NoError(t, model.MigratePartnerTenantSubscriptionKeys(db))
	require.NoError(t, db.AutoMigrate(&model.PartnerOAuthClient{}, &model.PartnerAccount{}, &model.PartnerOAuthBinding{}))
	require.NoError(t, model.MigrateAuditLogs()) // personal access token access audit (LOG_DB = DB here)
	return db
}

func TestPartnerTenantUserClassificationProductionRouteAuth(t *testing.T) {
	db := setupPartnerTenantUserClassificationRouterPQ(t, "pt_user_class_router_")
	oldSecret, oldMaster, oldRate := common.SessionSecret, common.IsMasterNode, common.GlobalApiRateLimitEnable
	common.SessionSecret = "user-classification-route-fixture-only"
	common.IsMasterNode = true
	common.GlobalApiRateLimitEnable = false // Not a global-IP-budget test.
	t.Cleanup(func() {
		common.SessionSecret, common.IsMasterNode, common.GlobalApiRateLimitEnable = oldSecret, oldMaster, oldRate
	})
	gin.SetMode(gin.TestMode)
	const marker = partnerTenantUserClassificationRouterSecretMarker

	tenant, _, err := model.CreatePartnerTenantWithIntegrationMode("Class Route Merchant", "class-route-group", model.PartnerTenantIntegrationHostedH5)
	require.NoError(t, err)
	require.NoError(t, db.Model(&model.PartnerTenant{}).Where("id = ?", tenant.Id).Update("secret_hash", fmt.Sprintf("%s%0*d", marker, 64-len(marker), 1)).Error)
	tenantID := strconv.FormatInt(tenant.Id, 10)

	login := func(name string, role int, group string) (*model.User, string) {
		t.Helper()
		user := &model.User{Username: name, AffCode: name, Role: role, Group: group, Status: common.UserStatusEnabled, AuthVersion: 1}
		require.NoError(t, db.Create(user).Error)
		bundle, err := service.CreateLoginSession(user.Id, "password", "192.0.2.220", "user-classification-route-test")
		require.NoError(t, err)
		return user, bundle.AccessToken
	}
	scoped := func(userID int, scopes ...string) string {
		t.Helper()
		suffix, err := common.GenerateRandomCharsKey(43)
		require.NoError(t, err)
		raw := model.AccessTokenPrefix + suffix
		token := &model.UserAccessToken{Name: "user classification", TokenHash: model.AccessTokenFingerprint(raw), TokenHint: model.AccessTokenHint(raw)}
		require.NoError(t, token.SetScopes(scopes))
		require.NoError(t, model.CreateUserAccessToken(userID, token, service.AccessTokenMaxPerUser))
		return raw
	}
	ordinary, ordinarySession := login("class-route-user", common.RoleCommonUser, "default")
	admin, adminSession := login("class-route-admin", common.RoleAdminUser, "default")
	root, rootSession := login("class-route-root", common.RoleRootUser, "default")
	// A real merchant sub-account is still an ordinary dashboard user here.
	merchant, merchantSession := login("p_class_route", common.RoleCommonUser, tenant.Group)
	modelToken := &model.Token{UserId: merchant.Id, Key: marker + "tokenkey", Status: common.TokenStatusEnabled, Name: "class route", ExpiredTime: -1, UnlimitedQuota: true, Group: tenant.Group}
	require.NoError(t, db.Create(modelToken).Error)
	require.NoError(t, db.Create(&model.PartnerTenantAccount{
		IdentitySource:     model.PartnerTenantIdentityExternal,
		TenantId:           tenant.Id,
		ExternalUserId:     marker + "-external",
		ExternalUserIdHash: model.HashPartnerOAuthSecret(marker + "-external"),
		UserId:             merchant.Id,
		TokenId:            modelToken.Id,
		Status:             model.PartnerTenantStatusEnabled,
	}).Error)

	engine := gin.New()
	engine.Use(middleware.RequestId())
	SetApiRouter(engine) // Actual production registration and middleware chain.
	do := func(target, credential string) *httptest.ResponseRecorder {
		t.Helper()
		request := httptest.NewRequest(http.MethodGet, target, nil)
		if credential != "" {
			request.Header.Set("Authorization", "Bearer "+credential)
		}
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, request)
		require.NotContains(t, response.Body.String(), marker)
		return response
	}
	// Both entries with the new parameters; each must list exactly the merchant.
	targets := []string{
		"/api/user/?user_category=merchant&tenant_id=" + tenantID,
		"/api/user/search?user_category=merchant&tenant_id=" + tenantID,
		"/api/user/?tenant_id=" + tenantID,
		"/api/user/search?user_category=all&tenant_id=" + tenantID + "&keyword=p_class",
	}
	requireMerchant := func(response *httptest.ResponseRecorder, target string) {
		t.Helper()
		require.Equal(t, http.StatusOK, response.Code, "%s: %s", target, response.Body.String())
		var envelope struct {
			Success bool `json:"success"`
			Data    struct {
				Total int                          `json:"total"`
				Items []map[string]json.RawMessage `json:"items"`
			} `json:"data"`
		}
		require.NoError(t, json.Unmarshal(response.Body.Bytes(), &envelope))
		require.True(t, envelope.Success, response.Body.String())
		require.Equal(t, 1, envelope.Data.Total, target)
		require.Len(t, envelope.Data.Items, 1, target)
		item := envelope.Data.Items[0]
		var id int
		require.NoError(t, json.Unmarshal(item["id"], &id))
		require.Equal(t, merchant.Id, id)
		for key, want := range map[string]string{"user_category": "merchant", "partner_tenant_id": tenantID, "partner_tenant_name": tenant.Name} {
			var got string
			require.NoError(t, json.Unmarshal(item[key], &got), "%s is a JSON string", key)
			require.Equal(t, want, got, key)
		}
		for _, forbidden := range []string{"secret_hash", "external_user_id", "identity_source", "account_id", "hosted_h5", "integration_mode"} {
			require.NotContains(t, response.Body.String(), forbidden)
		}
	}
	requireDenied := func(response *httptest.ResponseRecorder, status int, code, target string) {
		t.Helper()
		require.Equal(t, status, response.Code, "%s: %s", target, response.Body.String())
		require.Contains(t, response.Body.String(), `"code":"`+code+`"`)
		for _, forbidden := range []string{"Class Route Merchant", "p_class_route", `"items"`, "user_category", "partner_tenant_id"} {
			require.NotContains(t, response.Body.String(), forbidden, target)
		}
	}

	for _, test := range []struct {
		name, credential, code string
		status                 int // 0 means allowed
	}{
		{name: "anonymous", status: http.StatusUnauthorized, code: "AUTH_UNAUTHORIZED"},
		{name: "ordinary user session", credential: ordinarySession, status: http.StatusForbidden, code: "AUTH_INSUFFICIENT_PRIVILEGE"},
		{name: "merchant sub-account session", credential: merchantSession, status: http.StatusForbidden, code: "AUTH_INSUFFICIENT_PRIVILEGE"},
		{name: "ordinary user PAT user:read", credential: scoped(ordinary.Id, "user:read"), status: http.StatusForbidden, code: "AUTH_INSUFFICIENT_PRIVILEGE"},
		{name: "admin session", credential: adminSession},
		{name: "root session", credential: rootSession},
		{name: "admin PAT user:read", credential: scoped(admin.Id, "user:read")},
		{name: "root PAT user:read", credential: scoped(root.Id, "user:read")},
		{name: "admin PAT log:read only", credential: scoped(admin.Id, "log:read"), status: http.StatusForbidden, code: "ACCESS_TOKEN_SCOPE_DENIED"},
		{name: "root PAT unrelated scopes", credential: scoped(root.Id, "usage:read", "profile:read", "log:read"), status: http.StatusForbidden, code: "ACCESS_TOKEN_SCOPE_DENIED"},
		{name: "admin PAT without scopes", credential: scoped(admin.Id), status: http.StatusForbidden, code: "ACCESS_TOKEN_SCOPE_DENIED"},
	} {
		t.Run(test.name, func(t *testing.T) {
			for _, target := range targets {
				response := do(target, test.credential)
				if test.status == 0 {
					requireMerchant(response, target)
					continue
				}
				requireDenied(response, test.status, test.code, target)
			}
		})
	}

	t.Run("strict validation applies behind the production gate", func(t *testing.T) {
		adminUserRead, adminLogRead := scoped(admin.Id, "user:read"), scoped(admin.Id, "log:read")
		for _, target := range []string{
			"/api/user/?user_category=vip",
			"/api/user/search?user_category=ordinary&tenant_id=" + tenantID,
			"/api/user/?tenant_id=0",
			"/api/user/search?tenant_id=9223372036854775808",
			"/api/user/?tenant_id=" + tenantID + "&tenant_id=" + tenantID,
		} {
			for _, credential := range []string{adminSession, rootSession, adminUserRead} {
				response := do(target, credential)
				require.Equal(t, http.StatusBadRequest, response.Code, target)
				require.NotContains(t, response.Body.String(), "p_class_route", target)
				require.NotContains(t, response.Body.String(), `"items"`, target)
			}
			// Validation never precedes authentication or authorization.
			requireDenied(do(target, ""), http.StatusUnauthorized, "AUTH_UNAUTHORIZED", target)
			requireDenied(do(target, ordinarySession), http.StatusForbidden, "AUTH_INSUFFICIENT_PRIVILEGE", target)
			requireDenied(do(target, adminLogRead), http.StatusForbidden, "ACCESS_TOKEN_SCOPE_DENIED", target)
		}
	})

	t.Run("ordinary filter excludes the merchant on both entries", func(t *testing.T) {
		for _, target := range []string{"/api/user/?user_category=ordinary&page_size=100", "/api/user/search?user_category=ordinary&page_size=100"} {
			response := do(target, adminSession)
			require.Equal(t, http.StatusOK, response.Code, response.Body.String())
			require.NotContains(t, response.Body.String(), "p_class_route")
			require.NotContains(t, response.Body.String(), `"user_category":"merchant"`)
			require.Contains(t, response.Body.String(), `"user_category":"ordinary"`)
			require.Contains(t, response.Body.String(), `"partner_tenant_id":""`)
		}
	})
}
