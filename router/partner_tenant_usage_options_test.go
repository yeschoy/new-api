package router

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
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
const partnerTenantUsageRouterSecretMarker = "PTUSAGEROUTERSECRETMARKER"

const (
	partnerTenantUsageLogOptionsPath  = "/api/log/partner-tenants/options"
	partnerTenantUsageUserOptionsPath = "/api/user/tenant-options"
)

// Task-owned PostgreSQL only: a unique retained pt_usage_ schema, no SQLite,
// no drop/truncate. A missing DSN fails the test; it is never a pass. Tests
// using these process globals are serial.
func setupPartnerTenantUsageRouterPQ(t *testing.T, prefix string) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("TEST_PARTNER_USAGE_POSTGRES_DSN")
	require.NotEmpty(t, dsn, "BLOCKED: explicit task-owned Docker/pq DSN required; no SQLite/MySQL/production substitute")
	require.True(t, strings.HasPrefix(prefix, "pt_usage_"), "usage fixtures own the pt_usage_ schema prefix")
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
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserSession{}, &model.UserAccessToken{}, &model.Token{}))
	require.NoError(t, model.MigratePartnerTenantSubscriptionKeys(db))
	require.NoError(t, model.MigrateAuditLogs()) // personal access token access audit (LOG_DB = DB here)
	return db
}

// Route and PAT-rule declarations of the real production registration (no
// database): each options entry is registered once with its own explicit
// scope, never the "any" rule, and the root-only management API stays
// session-bound.
func TestPartnerTenantUsageOptionsRouteDeclarations(t *testing.T) {
	engine := newAccessTokenScopeTestEngine(t)
	registered := map[string]int{}
	for _, route := range engine.Routes() {
		registered[route.Method+" "+route.Path]++
	}
	options := map[string]string{
		http.MethodGet + " " + partnerTenantUsageLogOptionsPath:  "log:read",
		http.MethodGet + " " + partnerTenantUsageUserOptionsPath: "user:read",
	}
	for key, scope := range options {
		require.Equal(t, 1, registered[key], key)
		rule, declared := middleware.AccessTokenRouteRule(key)
		require.True(t, declared, key)
		require.Equal(t, "scope", rule.Kind(), key)
		require.Equal(t, scope, rule.Scope(), key)
	}
	for key := range registered {
		if strings.Contains(key, "tenant-options") || strings.Contains(key, "partner-tenants/options") {
			require.Contains(t, options, key, "no other method or alias exposes the options")
		}
	}
	for _, key := range []string{
		"GET /api/partner-tenants",
		"POST /api/partner-tenants",
		"POST /api/partner-tenants/:id/secret",
		"PATCH /api/partner-tenants/:id/status",
	} {
		require.Equal(t, 1, registered[key], key)
		rule, declared := middleware.AccessTokenRouteRule(key)
		require.True(t, declared, key)
		require.Equal(t, "session", rule.Kind(), key)
	}
}

func TestPartnerTenantUsageOptionsProductionRouteAuth(t *testing.T) {
	db := setupPartnerTenantUsageRouterPQ(t, "pt_usage_options_router_")
	oldSecret, oldMaster, oldRate := common.SessionSecret, common.IsMasterNode, common.GlobalApiRateLimitEnable
	common.SessionSecret = "usage-options-route-fixture-only"
	common.IsMasterNode = true
	common.GlobalApiRateLimitEnable = false // Not a global-IP-budget test.
	t.Cleanup(func() {
		common.SessionSecret, common.IsMasterNode, common.GlobalApiRateLimitEnable = oldSecret, oldMaster, oldRate
	})
	gin.SetMode(gin.TestMode)

	markerHash := func(index int) string {
		return fmt.Sprintf("%s%0*d", partnerTenantUsageRouterSecretMarker, 64-len(partnerTenantUsageRouterSecretMarker), index)
	}
	tenant := func(name, group, mode string, index int) *model.PartnerTenant {
		created, _, err := model.CreatePartnerTenantWithIntegrationMode(name, group, mode)
		require.NoError(t, err)
		require.NoError(t, db.Model(&model.PartnerTenant{}).Where("id = ?", created.Id).Update("secret_hash", markerHash(index)).Error)
		return created
	}
	enabled := tenant("Usage Route Enabled", "usage-route-enabled", model.PartnerTenantIntegrationHostedH5, 1)
	disabled := tenant("Usage Route Disabled", "usage-route-disabled", model.PartnerTenantIntegrationSubscriptionKey, 2)
	require.NoError(t, model.UpdatePartnerTenantStatus(disabled.Id, model.PartnerTenantStatusDisabled))

	login := func(name string, role int, group string) (*model.User, string) {
		t.Helper()
		user := &model.User{Username: name, AffCode: name, Role: role, Group: group, Status: common.UserStatusEnabled, AuthVersion: 1}
		require.NoError(t, db.Create(user).Error)
		bundle, err := service.CreateLoginSession(user.Id, "password", "192.0.2.210", "usage-options-route-test")
		require.NoError(t, err)
		return user, bundle.AccessToken
	}
	scoped := func(userID int, scopes ...string) string {
		t.Helper()
		suffix, err := common.GenerateRandomCharsKey(43)
		require.NoError(t, err)
		raw := model.AccessTokenPrefix + suffix
		token := &model.UserAccessToken{Name: "usage options", TokenHash: model.AccessTokenFingerprint(raw), TokenHint: model.AccessTokenHint(raw)}
		require.NoError(t, token.SetScopes(scopes))
		require.NoError(t, model.CreateUserAccessToken(userID, token, service.AccessTokenMaxPerUser))
		return raw
	}
	ordinary, ordinarySession := login("usage-route-user", common.RoleCommonUser, "default")
	admin, adminSession := login("usage-route-admin", common.RoleAdminUser, "default")
	root, rootSession := login("usage-route-root", common.RoleRootUser, "default")
	// A real merchant sub-account is still an ordinary dashboard user here.
	merchant, merchantSession := login("p_usage_route", common.RoleCommonUser, enabled.Group)
	modelToken := &model.Token{UserId: merchant.Id, Key: partnerTenantUsageRouterSecretMarker + "tokenkey", Status: common.TokenStatusEnabled, Name: "usage route", ExpiredTime: -1, UnlimitedQuota: true, Group: enabled.Group}
	require.NoError(t, db.Create(modelToken).Error)
	require.NoError(t, db.Create(&model.PartnerTenantAccount{
		IdentitySource:     model.PartnerTenantIdentityExternal,
		TenantId:           enabled.Id,
		ExternalUserId:     partnerTenantUsageRouterSecretMarker + "-external",
		ExternalUserIdHash: model.HashPartnerOAuthSecret(partnerTenantUsageRouterSecretMarker + "-external"),
		UserId:             merchant.Id,
		TokenId:            modelToken.Id,
		Status:             model.PartnerTenantStatusEnabled,
	}).Error)
	// A desktop-client session of an administrator: the closed desktop route
	// list does not contain either options entry.
	desktopBundle, err := service.CreateLoginSession(admin.Id, service.DesktopLoginMethod, "192.0.2.211", "usage-options-desktop-test")
	require.NoError(t, err)

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
		require.NotContains(t, response.Body.String(), partnerTenantUsageRouterSecretMarker)
		return response
	}
	keys := func(object map[string]json.RawMessage) []string {
		names := make([]string, 0, len(object))
		for name := range object {
			names = append(names, name)
		}
		sort.Strings(names)
		return names
	}
	wantOptions := map[string]string{
		strconv.FormatInt(enabled.Id, 10):  enabled.Name,
		strconv.FormatInt(disabled.Id, 10): disabled.Name,
	}
	requireOptions := func(response *httptest.ResponseRecorder) {
		t.Helper()
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
		require.Contains(t, response.Header().Get("Cache-Control"), "no-store")
		var envelope struct {
			Success bool `json:"success"`
			Data    struct {
				Total int64                        `json:"total"`
				Items []map[string]json.RawMessage `json:"items"`
			} `json:"data"`
		}
		require.NoError(t, json.Unmarshal(response.Body.Bytes(), &envelope))
		require.True(t, envelope.Success)
		require.EqualValues(t, len(wantOptions), envelope.Data.Total)
		got := map[string]string{}
		for _, item := range envelope.Data.Items {
			require.Equal(t, []string{"id", "name"}, keys(item), "an option is exactly id and name")
			var id, name string
			require.NoError(t, json.Unmarshal(item["id"], &id), "the id is a JSON string")
			require.NoError(t, json.Unmarshal(item["name"], &name))
			got[id] = name
		}
		require.Equal(t, wantOptions, got, "disabled merchants are included")
		for _, forbidden := range []string{"secret", "usage-route-enabled", "usage-route-disabled", "integration_mode", "hosted_h5", "external", "status", "p_usage_route"} {
			require.NotContains(t, response.Body.String(), forbidden)
		}
	}
	requireDenied := func(response *httptest.ResponseRecorder, status int, code string) {
		t.Helper()
		require.Equal(t, status, response.Code, response.Body.String())
		require.Contains(t, response.Body.String(), `"code":"`+code+`"`)
		require.NotContains(t, response.Body.String(), "Usage Route")
		require.NotContains(t, response.Body.String(), `"items"`)
	}

	bothScopes := []string{"log:read", "user:read"}
	credentials := []struct {
		name, credential string
		// Expected outcome per entry: 0 means allowed.
		logStatus, userStatus int
		logCode, userCode     string
	}{
		{name: "anonymous", logStatus: http.StatusUnauthorized, userStatus: http.StatusUnauthorized, logCode: "AUTH_UNAUTHORIZED", userCode: "AUTH_UNAUTHORIZED"},
		{name: "ordinary user session", credential: ordinarySession, logStatus: http.StatusForbidden, userStatus: http.StatusForbidden, logCode: "AUTH_INSUFFICIENT_PRIVILEGE", userCode: "AUTH_INSUFFICIENT_PRIVILEGE"},
		{name: "merchant sub-account session", credential: merchantSession, logStatus: http.StatusForbidden, userStatus: http.StatusForbidden, logCode: "AUTH_INSUFFICIENT_PRIVILEGE", userCode: "AUTH_INSUFFICIENT_PRIVILEGE"},
		{name: "ordinary user PAT with both scopes", credential: scoped(ordinary.Id, bothScopes...), logStatus: http.StatusForbidden, userStatus: http.StatusForbidden, logCode: "AUTH_INSUFFICIENT_PRIVILEGE", userCode: "AUTH_INSUFFICIENT_PRIVILEGE"},
		{name: "ordinary admin session", credential: adminSession},
		{name: "root session", credential: rootSession},
		{name: "admin desktop-client session", credential: desktopBundle.AccessToken, logStatus: http.StatusForbidden, userStatus: http.StatusForbidden, logCode: "AUTH_DESKTOP_SCOPE_DENIED", userCode: "AUTH_DESKTOP_SCOPE_DENIED"},
		{name: "admin PAT with both scopes", credential: scoped(admin.Id, bothScopes...)},
		{name: "admin PAT log:read only", credential: scoped(admin.Id, "log:read"), userStatus: http.StatusForbidden, userCode: "ACCESS_TOKEN_SCOPE_DENIED"},
		{name: "admin PAT user:read only", credential: scoped(admin.Id, "user:read"), logStatus: http.StatusForbidden, logCode: "ACCESS_TOKEN_SCOPE_DENIED"},
		{name: "root PAT log:read only", credential: scoped(root.Id, "log:read"), userStatus: http.StatusForbidden, userCode: "ACCESS_TOKEN_SCOPE_DENIED"},
		{name: "root PAT user:read only", credential: scoped(root.Id, "user:read"), logStatus: http.StatusForbidden, logCode: "ACCESS_TOKEN_SCOPE_DENIED"},
		{name: "admin PAT with unrelated scopes", credential: scoped(admin.Id, "usage:read", "profile:read", "billing:read"), logStatus: http.StatusForbidden, userStatus: http.StatusForbidden, logCode: "ACCESS_TOKEN_SCOPE_DENIED", userCode: "ACCESS_TOKEN_SCOPE_DENIED"},
		{name: "admin PAT without scopes", credential: scoped(admin.Id), logStatus: http.StatusForbidden, userStatus: http.StatusForbidden, logCode: "ACCESS_TOKEN_SCOPE_DENIED", userCode: "ACCESS_TOKEN_SCOPE_DENIED"},
	}
	for _, test := range credentials {
		t.Run(test.name, func(t *testing.T) {
			for _, entry := range []struct {
				path, code string
				status     int
			}{
				{partnerTenantUsageLogOptionsPath, test.logCode, test.logStatus},
				{partnerTenantUsageUserOptionsPath, test.userCode, test.userStatus},
			} {
				response := do(entry.path, test.credential)
				if entry.status == 0 {
					requireOptions(response)
					continue
				}
				requireDenied(response, entry.status, entry.code)
			}
		})
	}

	t.Run("strict validation applies behind the production gate", func(t *testing.T) {
		for _, target := range []string{
			partnerTenantUsageLogOptionsPath + "?selected_id=0",
			partnerTenantUsageUserOptionsPath + "?selected_id=9223372036854775808",
			partnerTenantUsageLogOptionsPath + "?page_size=101",
			partnerTenantUsageUserOptionsPath + "?tenant_id=" + strconv.FormatInt(enabled.Id, 10),
		} {
			response := do(target, adminSession)
			require.Equal(t, http.StatusBadRequest, response.Code, target)
			require.NotContains(t, response.Body.String(), "Usage Route", target)
		}
		// Validation never precedes authentication.
		requireDenied(do(partnerTenantUsageLogOptionsPath+"?selected_id=0", ""), http.StatusUnauthorized, "AUTH_UNAUTHORIZED")
		requireDenied(do(partnerTenantUsageUserOptionsPath+"?selected_id=0", ordinarySession), http.StatusForbidden, "AUTH_INSUFFICIENT_PRIVILEGE")
	})

	t.Run("root-only tenant management is not loosened", func(t *testing.T) {
		const management = "/api/partner-tenants"
		for _, test := range []struct {
			name, credential, code string
			status                 int
		}{
			{"anonymous", "", "AUTH_UNAUTHORIZED", http.StatusUnauthorized},
			{"ordinary user session", ordinarySession, "AUTH_INSUFFICIENT_PRIVILEGE", http.StatusForbidden},
			{"ordinary admin session", adminSession, "AUTH_INSUFFICIENT_PRIVILEGE", http.StatusForbidden},
			{"admin PAT with both option scopes", scoped(admin.Id, bothScopes...), "AUTH_INSUFFICIENT_PRIVILEGE", http.StatusForbidden},
			{"root PAT with both option scopes", scoped(root.Id, bothScopes...), "AUTH_SESSION_REQUIRED", http.StatusForbidden},
		} {
			requireDenied(do(management, test.credential), test.status, test.code)
		}
		response := do(management, rootSession)
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
		var envelope struct {
			Success bool                         `json:"success"`
			Data    []map[string]json.RawMessage `json:"data"`
		}
		require.NoError(t, json.Unmarshal(response.Body.Bytes(), &envelope))
		require.True(t, envelope.Success)
		require.Len(t, envelope.Data, 2)
		for _, item := range envelope.Data {
			// The existing management shape is unchanged (numeric id, group, mode, status).
			require.Equal(t, []string{"created_at", "group", "id", "integration_mode", "name", "status", "updated_at"}, keys(item))
			var id int64
			require.NoError(t, json.Unmarshal(item["id"], &id))
		}
	})
}
