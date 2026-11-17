package router

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// Real production routes: the caller's own list / statistics / export return
// rows of both log tables for the authenticated user only, forged ownership
// parameters select nothing else, and the output is the plain user Log shape.
func TestPartnerTenantUsageUnionSelfRoutesIgnoreForgedOwnership(t *testing.T) {
	db := setupPartnerTenantUsageRouterPQ(t, "pt_usage_union_router_")
	oldSecret, oldMaster, oldRate, oldCache := common.SessionSecret, common.IsMasterNode, common.GlobalApiRateLimitEnable, common.MemoryCacheEnabled
	common.SessionSecret = "usage-union-route-fixture-only"
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
		bundle, err := service.CreateLoginSession(user.Id, "password", "192.0.2.230", "usage-union-route-test")
		require.NoError(t, err)
		return user, bundle.AccessToken
	}
	member, memberSession := login("usage-union-member", common.RoleCommonUser)
	other, otherSession := login("usage-union-other", common.RoleCommonUser)
	ordinary, ordinarySession := login("usage-union-ordinary", common.RoleCommonUser)
	admin, adminSession := login("usage-union-admin", common.RoleAdminUser)

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
	adminOther := `{"billing_source":"subscription","admin_info":{"note":"admin-only-note"},"root_info":{"note":"root-only-note"}}`
	require.NoError(t, db.Create(&model.Log{UserId: member.Id, Username: member.Username, CreatedAt: now - 600, Type: model.LogTypeConsume, Quota: 70, TokenName: "tk", RequestId: "union-self-old", Other: adminOther}).Error)
	require.NoError(t, db.Create(&model.Log{UserId: other.Id, Username: other.Username, CreatedAt: now - 600, Type: model.LogTypeConsume, Quota: 9, TokenName: "tk", RequestId: "union-other-old"}).Error)
	require.NoError(t, db.Create(&model.Log{UserId: ordinary.Id, Username: ordinary.Username, CreatedAt: now - 600, Type: model.LogTypeConsume, Quota: 5, RequestId: "union-ordinary-old"}).Error)
	dedicated := func(event string, userID int, username string, quota int64, requestID string) {
		t.Helper()
		require.NoError(t, db.Create(&model.PartnerTenantUsageLog{EventId: event, CreatedAt: now - 500, Type: model.LogTypeConsume, TenantId: 61, AccountId: 62, TenantName: "Union Route Merchant",
			IdentitySource: model.PartnerTenantIdentityExternal, UserId: int64(userID), Username: username, TokenName: "tk", ModelName: "model-a", Quota: quota, RequestId: requestID, Other: adminOther}).Error)
	}
	// Before any dedicated row: baselines of the ordinary user and the administrator default readers.
	ordinaryBefore := do("/api/log/self"+window, ordinarySession).Body.String()
	ordinaryStatBefore := do("/api/log/self/stat"+window, ordinarySession).Body.String()
	adminListBefore := do("/api/log/"+window, adminSession).Body.String()
	adminStatBefore := do("/api/log/stat"+window, adminSession).Body.String()
	adminExportBefore := do("/api/log/export"+window, adminSession).Body.String()

	dedicated("ptu_union_route_1", member.Id, member.Username, 4000, "union-self-new")
	dedicated("ptu_union_route_2", other.Id, other.Username, 800, "union-other-new")
	// Same username, request id and token name as the member, another user id.
	dedicated("ptu_union_route_3", other.Id, member.Username, 600, "union-self-new-forged")

	forged := fmt.Sprintf("&user_id=%d&tenant_id=61&token_id=1&username=%s&account_id=62", other.Id, other.Username)
	expectedKeys := []string{"channel", "channel_name", "completion_tokens", "content", "created_at", "group", "id", "ip", "is_stream", "model_name", "other", "prompt_tokens", "quota", "request_id", "token_id", "token_name", "type", "use_time", "user_id", "username"}
	requireUserShape := func(t *testing.T, body string) {
		t.Helper()
		for _, leaked := range []string{"admin-only-note", "root-only-note", "Union Route Merchant", "ptu_union_route", "tenant_id", "account_id", "event_id", "log_source", "identity_source", "union-other", "union-self-new-forged", "union-ordinary"} {
			require.NotContains(t, body, leaked)
		}
	}
	requireLogKeys := func(t *testing.T, item map[string]json.RawMessage) {
		t.Helper()
		keys := make([]string, 0, len(item))
		for key := range item {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		require.Equal(t, expectedKeys, keys, "exactly the Log field set")
		require.Equal(t, `""`, string(item["channel_name"]))
		require.Equal(t, fmt.Sprint(member.Id), string(item["user_id"]))
	}

	t.Run("list", func(t *testing.T) {
		response := do("/api/log/self"+window, memberSession)
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
		var envelope struct {
			Success bool `json:"success"`
			Data    struct {
				Total int                          `json:"total"`
				Items []map[string]json.RawMessage `json:"items"`
			} `json:"data"`
		}
		require.NoError(t, json.Unmarshal(response.Body.Bytes(), &envelope))
		require.True(t, envelope.Success)
		require.Equal(t, 2, envelope.Data.Total)
		require.Len(t, envelope.Data.Items, 2)
		require.Equal(t, []string{`"union-self-new"`, `"union-self-old"`}, []string{string(envelope.Data.Items[0]["request_id"]), string(envelope.Data.Items[1]["request_id"])}, "newest first across both tables")
		require.Equal(t, []string{"1", "2"}, []string{string(envelope.Data.Items[0]["id"]), string(envelope.Data.Items[1]["id"])})
		for _, item := range envelope.Data.Items {
			requireLogKeys(t, item)
		}
		requireUserShape(t, response.Body.String())
		require.Equal(t, response.Body.String(), do("/api/log/self"+window+forged, memberSession).Body.String(), "forged ownership parameters change nothing")
	})
	t.Run("stat", func(t *testing.T) {
		response := do("/api/log/self/stat"+window, memberSession)
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
		var envelope struct {
			Success bool                       `json:"success"`
			Data    map[string]json.RawMessage `json:"data"`
		}
		require.NoError(t, json.Unmarshal(response.Body.Bytes(), &envelope))
		require.True(t, envelope.Success)
		require.Equal(t, "4070", string(envelope.Data["quota"]), "legacy 70 + dedicated 4000, a JSON number")
		require.Len(t, envelope.Data, 3)
		require.Contains(t, envelope.Data, "rpm")
		require.Contains(t, envelope.Data, "tpm")
		require.Equal(t, response.Body.String(), do("/api/log/self/stat"+window+forged, memberSession).Body.String())
	})
	t.Run("export", func(t *testing.T) {
		response := do("/api/log/self/export"+window, memberSession)
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
		lines := strings.Split(strings.TrimSpace(response.Body.String()), "\n")
		require.Len(t, lines, 3, "two logs and the trailer")
		for index, requestID := range []string{"union-self-new", "union-self-old"} {
			var item map[string]json.RawMessage
			require.NoError(t, json.Unmarshal([]byte(lines[index]), &item))
			requireLogKeys(t, item)
			require.Equal(t, `"`+requestID+`"`, string(item["request_id"]))
			require.Equal(t, fmt.Sprint(index+1), string(item["id"]), "continuous numbering")
		}
		require.Contains(t, lines[2], `"count":2`)
		requireUserShape(t, response.Body.String())
		require.Equal(t, response.Body.String(), do("/api/log/self/export"+window+forged, memberSession).Body.String())
	})
	t.Run("other user sees only their own rows", func(t *testing.T) {
		body := do("/api/log/self"+window+fmt.Sprintf("&user_id=%d", member.Id), otherSession).Body.String()
		require.Contains(t, body, "union-other-old")
		require.Contains(t, body, "union-other-new")
		require.Contains(t, body, "union-self-new-forged", "the row stored under this user id, whatever its username")
		require.NotContains(t, body, "union-self-old")
		require.NotContains(t, body, `"union-self-new"`)
	})
	t.Run("ordinary user and administrator default readers are unchanged", func(t *testing.T) {
		require.Equal(t, ordinaryBefore, do("/api/log/self"+window, ordinarySession).Body.String())
		require.Equal(t, ordinaryStatBefore, do("/api/log/self/stat"+window, ordinarySession).Body.String())
		require.Equal(t, adminListBefore, do("/api/log/"+window, adminSession).Body.String())
		require.Equal(t, adminStatBefore, do("/api/log/stat"+window, adminSession).Body.String())
		require.Equal(t, adminExportBefore, do("/api/log/export"+window, adminSession).Body.String())
		require.NotContains(t, adminListBefore, "union-self-new")
	})
	_ = admin
}

// Unlike the self-route cases, exercise the actual model-Key authentication
// middleware and its database key lookup. InitLogDB is the production column
// initializer (including commonKeyCol); no unsafe test-only exported setter.
func TestPartnerTenantUsageTokenProductionRouteIgnoresForgedOwnership(t *testing.T) {
	db := setupPartnerTenantUsageRouterPQ(t, "pt_usage_token_router_")
	oldSecret, oldMaster, oldRate, oldCache := common.SessionSecret, common.IsMasterNode, common.GlobalApiRateLimitEnable, common.MemoryCacheEnabled
	common.SessionSecret, common.IsMasterNode, common.GlobalApiRateLimitEnable, common.MemoryCacheEnabled = "usage-token-route-fixture", true, false, false
	t.Cleanup(func() {
		common.SessionSecret, common.IsMasterNode, common.GlobalApiRateLimitEnable, common.MemoryCacheEnabled = oldSecret, oldMaster, oldRate, oldCache
	})
	t.Setenv("LOG_SQL_DSN", "")
	require.NoError(t, model.InitLogDB())
	require.NoError(t, db.AutoMigrate(&model.Log{}))
	user := &model.User{Username: "usage-token-member", AffCode: "usage-token-member", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AuthVersion: 1, Group: "default"}
	require.NoError(t, db.Create(user).Error)
	other := &model.User{Username: "usage-token-other", AffCode: "usage-token-other", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AuthVersion: 1, Group: "default"}
	require.NoError(t, db.Create(other).Error)
	key := &model.Token{UserId: user.Id, Key: "usagetokenfixturelegalkey", Status: common.TokenStatusEnabled, Name: "token-fixture", ExpiredTime: -1, UnlimitedQuota: true}
	require.NoError(t, db.Create(key).Error)
	sibling := &model.Token{UserId: user.Id, Key: "usagetokenfixturesibling", Status: common.TokenStatusEnabled, Name: "sibling", ExpiredTime: -1, UnlimitedQuota: true}
	require.NoError(t, db.Create(sibling).Error)
	foreign := &model.Token{UserId: other.Id, Key: "usagetokenfixtureforeign", Status: common.TokenStatusEnabled, Name: "foreign", ExpiredTime: -1, UnlimitedQuota: true}
	require.NoError(t, db.Create(foreign).Error)
	for i, token := range []*model.Token{key, sibling, foreign} {
		for _, source := range []string{"old", "new"} {
			rid := fmt.Sprintf("token-%s-%d", source, i)
			// Same merchant/account metadata and a forged username cannot change the
			// token-scoped identity. Sibling token belongs to the very same user.
			otherInfo := `{"admin_info":{"note":"token-admin-secret"},"root_info":{"note":"token-root-secret"}}`
			if source == "old" {
				require.NoError(t, db.Create(&model.Log{UserId: token.UserId, TokenId: token.Id, CreatedAt: 100 + int64(i), Type: model.LogTypeConsume, RequestId: rid, Quota: 7, Other: otherInfo}).Error)
			} else {
				require.NoError(t, db.Create(&model.PartnerTenantUsageLog{EventId: "ptu_" + rid, UserId: int64(token.UserId), TokenId: int64(token.Id), TenantId: 61, AccountId: 62, TenantName: "token-private-merchant", CreatedAt: 200 + int64(i), Type: model.LogTypeConsume, RequestId: rid, Quota: 11, Other: otherInfo}).Error)
			}
		}
	}
	engine := gin.New()
	engine.Use(middleware.RequestId())
	SetApiRouter(engine)
	do := func(target, credential string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, target, nil)
		if credential != "" {
			req.Header.Set("Authorization", "Bearer "+credential)
		}
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, req)
		return response
	}
	baseline := do("/api/log/token", "sk-"+key.Key)
	require.Equal(t, http.StatusOK, baseline.Code, baseline.Body.String())
	var envelope struct {
		Success bool        `json:"success"`
		Data    []model.Log `json:"data"`
	}
	require.NoError(t, json.Unmarshal(baseline.Body.Bytes(), &envelope))
	require.True(t, envelope.Success)
	require.Len(t, envelope.Data, 2)
	require.Equal(t, []string{"token-new-0", "token-old-0"}, []string{envelope.Data[0].RequestId, envelope.Data[1].RequestId})
	for _, row := range envelope.Data {
		require.Equal(t, key.Id, row.TokenId)
		require.Equal(t, user.Id, row.UserId)
	}
	for _, forbidden := range []string{"token-new-1", "token-old-1", "token-new-2", "token-old-2", "token-private-merchant", "token-admin-secret", "token-root-secret", "event_id", "tenant_id", "log_source", key.Key} {
		require.NotContains(t, baseline.Body.String(), forbidden)
	}
	for _, target := range []string{
		fmt.Sprintf("/api/log/token?user_id=%d&tenant_id=61&token_id=%d&account_id=62", other.Id, foreign.Id),
		fmt.Sprintf("/api/log/token?user_id=%d&tenant_id=999&token_id=%d", user.Id, sibling.Id),
	} {
		response := do(target, "sk-"+key.Key)
		require.Equal(t, http.StatusOK, response.Code)
		require.Equal(t, baseline.Body.String(), response.Body.String(), "external selectors never replace authenticated token_id")
	}
	require.Equal(t, http.StatusUnauthorized, do("/api/log/token", "").Code)
	require.Equal(t, http.StatusUnauthorized, do("/api/log/token", "sk-nonexistentfixturekey").Code)
}
