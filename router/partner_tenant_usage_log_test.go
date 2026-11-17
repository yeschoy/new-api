package router

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

const (
	partnerTenantUsageLogListPath = "/api/log/partner-tenants"
	partnerTenantUsageLogStatPath = "/api/log/partner-tenants/stat"
)

// Route and PAT-rule declarations of the real production registration (no
// database): both read endpoints are registered once with the explicit
// log:read scope, never the "any" rule, and the default log routes keep theirs.
func TestPartnerTenantUsageLogRouteDeclarations(t *testing.T) {
	engine := newAccessTokenScopeTestEngine(t)
	registered := map[string]int{}
	for _, route := range engine.Routes() {
		registered[route.Method+" "+route.Path]++
	}
	for _, key := range []string{
		http.MethodGet + " " + partnerTenantUsageLogListPath,
		http.MethodGet + " " + partnerTenantUsageLogStatPath,
		"GET /api/log/",
		"GET /api/log/stat",
		"GET /api/log/export",
	} {
		require.Equal(t, 1, registered[key], key)
		rule, declared := middleware.AccessTokenRouteRule(key)
		require.True(t, declared, key)
		require.Equal(t, "scope", rule.Kind(), key)
		require.Equal(t, "log:read", rule.Scope(), key)
	}
	// Only GET, and only these two paths plus the options entry, live under
	// the merchant log prefix.
	for key := range registered {
		if strings.Contains(key, partnerTenantUsageLogListPath) {
			require.Contains(t, []string{
				"GET " + partnerTenantUsageLogListPath,
				"GET " + partnerTenantUsageLogStatPath,
				"GET " + partnerTenantUsageLogOptionsPath,
			}, key)
		}
	}
	for _, key := range []string{"GET /api/partner-tenants", "POST /api/partner-tenants"} {
		rule, declared := middleware.AccessTokenRouteRule(key)
		require.True(t, declared, key)
		require.Equal(t, "session", rule.Kind(), key)
	}
}

func TestPartnerTenantUsageLogProductionRouteAuth(t *testing.T) {
	db := setupPartnerTenantUsageRouterPQ(t, "pt_usage_log_router_")
	oldSecret, oldMaster, oldRate, oldCache := common.SessionSecret, common.IsMasterNode, common.GlobalApiRateLimitEnable, common.MemoryCacheEnabled
	common.SessionSecret = "usage-log-route-fixture-only"
	common.IsMasterNode = true
	common.GlobalApiRateLimitEnable = false // Not a global-IP-budget test.
	common.MemoryCacheEnabled = false
	t.Cleanup(func() {
		common.SessionSecret, common.IsMasterNode, common.GlobalApiRateLimitEnable, common.MemoryCacheEnabled = oldSecret, oldMaster, oldRate, oldCache
	})
	gin.SetMode(gin.TestMode)
	require.NoError(t, db.AutoMigrate(&model.Log{}))
	require.NoError(t, model.MigratePartnerTenantUsageLogs())

	login := func(name string, role int) (*model.User, string) {
		t.Helper()
		user := &model.User{Username: name, AffCode: name, Role: role, Group: "default", Status: common.UserStatusEnabled, AuthVersion: 1}
		require.NoError(t, db.Create(user).Error)
		bundle, err := service.CreateLoginSession(user.Id, "password", "192.0.2.220", "usage-log-route-test")
		require.NoError(t, err)
		return user, bundle.AccessToken
	}
	scoped := func(userID int, scopes ...string) string {
		t.Helper()
		suffix, err := common.GenerateRandomCharsKey(43)
		require.NoError(t, err)
		raw := model.AccessTokenPrefix + suffix
		token := &model.UserAccessToken{Name: "usage log", TokenHash: model.AccessTokenFingerprint(raw), TokenHint: model.AccessTokenHint(raw)}
		require.NoError(t, token.SetScopes(scopes))
		require.NoError(t, model.CreateUserAccessToken(userID, token, service.AccessTokenMaxPerUser))
		return raw
	}
	ordinary, ordinarySession := login("usage-log-user", common.RoleCommonUser)
	admin, adminSession := login("usage-log-admin", common.RoleAdminUser)
	root, rootSession := login("usage-log-root", common.RoleRootUser)
	// Merchant membership does not add an administrator role or bypass gates.
	merchant, merchantSession := login("usage-log-merchant", common.RoleCommonUser)
	tenant, _, err := model.CreatePartnerTenantWithIntegrationMode("Usage Auth Merchant", "usage-auth-merchant", model.PartnerTenantIntegrationHostedH5)
	require.NoError(t, err)
	token := &model.Token{UserId: merchant.Id, Key: "usagelogmerchantkey", Status: common.TokenStatusEnabled, ExpiredTime: -1, UnlimitedQuota: true}
	require.NoError(t, db.Create(token).Error)
	require.NoError(t, db.Create(&model.PartnerTenantAccount{TenantId: tenant.Id, UserId: merchant.Id, TokenId: token.Id, IdentitySource: model.PartnerTenantIdentityExternal, ExternalUserId: "usage-log-buyer", ExternalUserIdHash: model.HashPartnerOAuthSecret("usage-log-buyer"), Status: model.PartnerTenantStatusEnabled}).Error)
	desktopBundle, err := service.CreateLoginSession(admin.Id, service.DesktopLoginMethod, "192.0.2.221", "usage-log-desktop-test")
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
		return response
	}

	now := common.GetTimestamp()
	window := fmt.Sprintf("?start_timestamp=%d&end_timestamp=%d", now-3600, now)
	// An old merchant row and an ordinary row live in the default table.
	require.NoError(t, db.Create(&model.Log{UserId: ordinary.Id, Username: "old-merchant", CreatedAt: now - 600, Type: model.LogTypeConsume, Quota: 70, RequestId: "route-default-old"}).Error)
	require.NoError(t, db.Create(&model.Log{UserId: ordinary.Id, Username: "ordinary", CreatedAt: now - 590, Type: model.LogTypeError, RequestId: "route-default-error"}).Error)
	const defaultList, defaultStat = "/api/log/", "/api/log/stat"
	beforeList := do(defaultList+window, adminSession)
	require.Equal(t, http.StatusOK, beforeList.Code, beforeList.Body.String())
	require.Contains(t, beforeList.Body.String(), "route-default-old", "old merchant history stays on the default page")
	beforeStat := do(defaultStat+window+"&type=2", adminSession)
	require.Equal(t, http.StatusOK, beforeStat.Code, beforeStat.Body.String())

	other := `{"billing_source":"subscription","admin_info":{"note":"admin-only-note"},"root_info":{"note":"root-only-note"}}`
	require.NoError(t, db.Create(&model.PartnerTenantUsageLog{EventId: "ptu_route_1", CreatedAt: now - 500, Type: model.LogTypeConsume, TenantId: 61, AccountId: 62, TenantName: "Route Merchant",
		IdentitySource: model.PartnerTenantIdentityExternal, UserId: int64(ordinary.Id), Username: "member", ModelName: "model-a", Quota: 4242, RequestId: "route-new-1", Other: other}).Error)
	require.NoError(t, db.Create(&model.PartnerTenantUsageLog{EventId: "ptu_route_2", CreatedAt: now - 400, Type: model.LogTypeError, TenantId: 61, AccountId: 62, TenantName: "Route Merchant",
		IdentitySource: model.PartnerTenantIdentityExternal, UserId: int64(ordinary.Id), Username: "member", ModelName: "model-a", RequestId: "route-new-2"}).Error)

	// The default administrator readers never see the dedicated rows.
	afterList := do(defaultList+window, adminSession)
	require.Equal(t, beforeList.Body.String(), afterList.Body.String(), "GET /api/log/ is unchanged by rows of the dedicated table")
	require.NotContains(t, afterList.Body.String(), "route-new-1")
	afterStat := do(defaultStat+window+"&type=2", adminSession)
	require.Equal(t, beforeStat.Body.String(), afterStat.Body.String(), "GET /api/log/stat is unchanged by rows of the dedicated table")

	requireAllowed := func(path string, response *httptest.ResponseRecorder) map[string]json.RawMessage {
		t.Helper()
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
		require.Contains(t, response.Header().Get("Cache-Control"), "no-store")
		var envelope struct {
			Success bool                       `json:"success"`
			Data    map[string]json.RawMessage `json:"data"`
		}
		require.NoError(t, json.Unmarshal(response.Body.Bytes(), &envelope))
		require.True(t, envelope.Success)
		require.NotContains(t, response.Body.String(), "route-default", "rows of logs never appear on the merchant surface")
		if path == partnerTenantUsageLogListPath {
			require.Equal(t, "2", string(envelope.Data["total"]))
			require.Contains(t, response.Body.String(), "route-new-1")
		} else {
			require.Equal(t, `"2"`, string(envelope.Data["record_count"]))
			require.Equal(t, `"4242"`, string(envelope.Data["quota"]))
			require.Equal(t, `"1"`, string(envelope.Data["failed_count"]))
		}
		return envelope.Data
	}
	requireDenied := func(response *httptest.ResponseRecorder, status int, code string) {
		t.Helper()
		require.Equal(t, status, response.Code, response.Body.String())
		require.Contains(t, response.Body.String(), `"code":"`+code+`"`)
		for _, leaked := range []string{"Route Merchant", "route-new", `"items"`, `"record_count"`} {
			require.NotContains(t, response.Body.String(), leaked)
		}
	}

	paths := []string{partnerTenantUsageLogListPath, partnerTenantUsageLogStatPath}
	credentials := []struct {
		name, credential, code string
		status                 int // 0 means allowed
	}{
		{name: "anonymous", status: http.StatusUnauthorized, code: "AUTH_UNAUTHORIZED"},
		{name: "ordinary user session", credential: ordinarySession, status: http.StatusForbidden, code: "AUTH_INSUFFICIENT_PRIVILEGE"},
		{name: "ordinary user PAT with log:read", credential: scoped(ordinary.Id, "log:read"), status: http.StatusForbidden, code: "AUTH_INSUFFICIENT_PRIVILEGE"},
		{name: "merchant sub-account session", credential: merchantSession, status: http.StatusForbidden, code: "AUTH_INSUFFICIENT_PRIVILEGE"},
		{name: "ordinary admin session", credential: adminSession},
		{name: "root session", credential: rootSession},
		{name: "admin desktop-client session", credential: desktopBundle.AccessToken, status: http.StatusForbidden, code: "AUTH_DESKTOP_SCOPE_DENIED"},
		{name: "admin PAT log:read", credential: scoped(admin.Id, "log:read")},
		{name: "root PAT log:read", credential: scoped(root.Id, "log:read")},
		{name: "admin PAT user:read only", credential: scoped(admin.Id, "user:read"), status: http.StatusForbidden, code: "ACCESS_TOKEN_SCOPE_DENIED"},
		{name: "root PAT user:read only", credential: scoped(root.Id, "user:read"), status: http.StatusForbidden, code: "ACCESS_TOKEN_SCOPE_DENIED"},
		{name: "admin PAT usage:read only", credential: scoped(admin.Id, "usage:read"), status: http.StatusForbidden, code: "ACCESS_TOKEN_SCOPE_DENIED"},
		{name: "admin PAT without scopes", credential: scoped(admin.Id), status: http.StatusForbidden, code: "ACCESS_TOKEN_SCOPE_DENIED"},
	}
	for _, test := range credentials {
		t.Run(test.name, func(t *testing.T) {
			for _, path := range paths {
				response := do(path+window, test.credential)
				if test.status == 0 {
					requireAllowed(path, response)
					continue
				}
				requireDenied(response, test.status, test.code)
			}
		})
	}

	t.Run("administrator and root projections differ as on the default logs", func(t *testing.T) {
		adminBody := do(partnerTenantUsageLogListPath+window, adminSession).Body.String()
		rootBody := do(partnerTenantUsageLogListPath+window, rootSession).Body.String()
		require.Contains(t, adminBody, "admin-only-note")
		require.NotContains(t, adminBody, "root-only-note")
		require.Contains(t, rootBody, "admin-only-note")
		require.Contains(t, rootBody, "root-only-note")
	})

	t.Run("other is projected exactly like the default logs for each role", func(t *testing.T) {
		// The same recorded metadata in the default table, read through the
		// default administrator list by the same caller.
		require.NoError(t, db.Create(&model.Log{UserId: ordinary.Id, Username: "member", CreatedAt: now - 500, Type: model.LogTypeConsume, Quota: 1, RequestId: "route-default-other", Other: other}).Error)
		projected := func(path, credential, requestID string) string {
			t.Helper()
			response := do(path+window, credential)
			require.Equal(t, http.StatusOK, response.Code, response.Body.String())
			var envelope struct {
				Data struct {
					Items []struct {
						RequestId string `json:"request_id"`
						Other     string `json:"other"`
					} `json:"items"`
				} `json:"data"`
			}
			require.NoError(t, json.Unmarshal(response.Body.Bytes(), &envelope))
			for _, item := range envelope.Data.Items {
				if item.RequestId == requestID {
					return item.Other
				}
			}
			require.Failf(t, "record not found", "%s on %s", requestID, path)
			return ""
		}
		for _, credential := range []string{adminSession, rootSession} {
			onDefault := projected(defaultList, credential, "route-default-other")
			require.NotEmpty(t, onDefault)
			require.Equal(t, onDefault, projected(partnerTenantUsageLogListPath, credential, "route-new-1"), "a role sees no more of other here than on GET /api/log/")
		}
	})

	t.Run("strict validation applies behind the production gate", func(t *testing.T) {
		for _, target := range []string{
			partnerTenantUsageLogListPath + "?tenant_id=0",
			partnerTenantUsageLogListPath + "?page_size=101",
			partnerTenantUsageLogListPath + "?unknown=1",
			partnerTenantUsageLogStatPath + "?p=1",
			partnerTenantUsageLogStatPath + "?tenant_id=" + strconv.Itoa(61) + "&tenant_id=61",
		} {
			response := do(target, adminSession)
			require.Equal(t, http.StatusBadRequest, response.Code, target)
			require.NotContains(t, response.Body.String(), "Route Merchant", target)
		}
		// Validation never precedes authentication.
		requireDenied(do(partnerTenantUsageLogListPath+"?tenant_id=0", ""), http.StatusUnauthorized, "AUTH_UNAUTHORIZED")
		requireDenied(do(partnerTenantUsageLogStatPath+"?p=1", ordinarySession), http.StatusForbidden, "AUTH_INSUFFICIENT_PRIVILEGE")
	})

	t.Run("tenant filter through the real route", func(t *testing.T) {
		data := requireAllowed(partnerTenantUsageLogListPath, do(partnerTenantUsageLogListPath+window+"&tenant_id=61", adminSession))
		require.Equal(t, "2", string(data["total"]))
		response := do(partnerTenantUsageLogListPath+window+"&tenant_id=62", adminSession)
		require.Equal(t, http.StatusOK, response.Code)
		require.NotContains(t, response.Body.String(), "route-new")
		require.Contains(t, response.Body.String(), `"total":0`)
	})
}
