package router

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// Real production routes: the caller's request outcomes and usage summary fold
// rows of both log tables for the authenticated user only; forged ownership
// parameters change nothing and no ownership snapshot is returned.
func TestPartnerTenantUsageRequestSelfRoutesIgnoreForgedOwnership(t *testing.T) {
	db := setupPartnerTenantUsageRouterPQ(t, "pt_usage_request_router_")
	oldSecret, oldMaster, oldRate, oldCache := common.SessionSecret, common.IsMasterNode, common.GlobalApiRateLimitEnable, common.MemoryCacheEnabled
	common.SessionSecret = "usage-request-route-fixture-only"
	common.IsMasterNode = true
	common.GlobalApiRateLimitEnable = false // Not a global-IP-budget test.
	common.MemoryCacheEnabled = false
	t.Cleanup(func() {
		common.SessionSecret, common.IsMasterNode, common.GlobalApiRateLimitEnable, common.MemoryCacheEnabled = oldSecret, oldMaster, oldRate, oldCache
	})
	gin.SetMode(gin.TestMode)
	require.NoError(t, db.AutoMigrate(&model.Log{}))
	require.NoError(t, model.MigratePartnerTenantUsageLogs())

	login := func(name string) (*model.User, string) {
		t.Helper()
		user := &model.User{Username: name, AffCode: name, Role: common.RoleCommonUser, Group: "default", Status: common.UserStatusEnabled, AuthVersion: 1}
		require.NoError(t, db.Create(user).Error)
		bundle, err := service.CreateLoginSession(user.Id, "password", "192.0.2.231", "usage-request-route-test")
		require.NoError(t, err)
		return user, bundle.AccessToken
	}
	member, memberSession := login("usage-request-member")
	other, otherSession := login("usage-request-other")

	engine := gin.New()
	engine.Use(middleware.RequestId())
	SetApiRouter(engine) // Actual production registration and middleware chain.
	do := func(target, credential string) string {
		t.Helper()
		request := httptest.NewRequest(http.MethodGet, target, nil)
		request.Header.Set("Authorization", "Bearer "+credential)
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, request)
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
		return response.Body.String()
	}

	now := common.GetTimestamp()
	window := fmt.Sprintf("?start_timestamp=%d&end_timestamp=%d", now-3600, now)
	subscription := `{"billing_source":"subscription","admin_info":{"note":"admin-only-note"}}`
	dedicated := func(event string, userID int, quota int64, createdAt int64, requestID string) {
		t.Helper()
		require.NoError(t, db.Create(&model.PartnerTenantUsageLog{EventId: event, CreatedAt: createdAt, Type: model.LogTypeConsume, TenantId: 61, AccountId: 62, TenantName: "Request Route Merchant",
			IdentitySource: model.PartnerTenantIdentityExternal, UserId: int64(userID), Username: member.Username, ModelName: "model-a", Quota: quota, RequestId: requestID, Other: subscription}).Error)
	}
	// Member: failed attempt in logs, successful retry in the dedicated table.
	require.NoError(t, db.Create(&model.Log{UserId: member.Id, Username: member.Username, CreatedAt: now - 600, Type: model.LogTypeError, RequestId: "rq-1"}).Error)
	dedicated("ptu_request_route_1", member.Id, 4000, now-500, "rq-1")
	// Another user reusing the request id and the member's username.
	dedicated("ptu_request_route_2", other.Id, 800, now-400, "rq-1")
	require.NoError(t, db.Create(&model.Log{UserId: other.Id, Username: other.Username, CreatedAt: now - 300, Type: model.LogTypeConsume, Quota: 9, RequestId: "rq-other", Other: `{"billing_source":"wallet"}`}).Error)

	forged := fmt.Sprintf("&user_id=%d&tenant_id=61&token_id=1&username=%s&account_id=62", other.Id, other.Username)
	type requestEnvelope struct {
		Success bool `json:"success"`
		Data    struct {
			Total int `json:"total"`
			Items []struct {
				UserId    int    `json:"user_id"`
				Type      int    `json:"type"`
				Quota     int64  `json:"quota"`
				RequestId string `json:"request_id"`
			} `json:"items"`
		} `json:"data"`
	}
	type summaryEnvelope struct {
		Success bool                 `json:"success"`
		Data    model.UserLogSummary `json:"data"`
	}
	requireSafe := func(t *testing.T, body string) {
		t.Helper()
		for _, leaked := range []string{"admin-only-note", "Request Route Merchant", "ptu_request_route", "tenant_id", "account_id", "event_id", "log_source", "identity_source"} {
			require.NotContains(t, body, leaked)
		}
	}

	requests := do("/api/log/self/requests"+window+"&p=1&page_size=10", memberSession)
	requireSafe(t, requests)
	require.Equal(t, requests, do("/api/log/self/requests"+window+"&p=1&page_size=10"+forged, memberSession), "forged ownership parameters change nothing")
	var memberRequests requestEnvelope
	require.NoError(t, json.Unmarshal([]byte(requests), &memberRequests))
	require.True(t, memberRequests.Success)
	require.Equal(t, 1, memberRequests.Data.Total)
	require.Len(t, memberRequests.Data.Items, 1)
	require.Equal(t, member.Id, memberRequests.Data.Items[0].UserId)
	require.Equal(t, model.LogTypeConsume, memberRequests.Data.Items[0].Type)
	require.EqualValues(t, 4000, memberRequests.Data.Items[0].Quota)
	require.Equal(t, "rq-1", memberRequests.Data.Items[0].RequestId)

	summary := do("/api/log/self/summary"+window+"&timezone_offset=0", memberSession)
	requireSafe(t, summary)
	require.Equal(t, summary, do("/api/log/self/summary"+window+"&timezone_offset=0"+forged, memberSession), "forged ownership parameters change nothing")
	var memberSummary summaryEnvelope
	require.NoError(t, json.Unmarshal([]byte(summary), &memberSummary))
	require.True(t, memberSummary.Success)
	require.Equal(t, model.LogSummaryTotals{Requests: 1, Succeeded: 1, SubscriptionQuota: 4000}, memberSummary.Data.LogSummaryTotals)

	// The other user sees only their own two requests.
	var otherRequests requestEnvelope
	require.NoError(t, json.Unmarshal([]byte(do("/api/log/self/requests"+window+"&p=1&page_size=10", otherSession)), &otherRequests))
	require.Equal(t, 2, otherRequests.Data.Total)
	for _, item := range otherRequests.Data.Items {
		require.Equal(t, other.Id, item.UserId)
	}
	var otherSummary summaryEnvelope
	require.NoError(t, json.Unmarshal([]byte(do("/api/log/self/summary"+window+"&timezone_offset=0", otherSession)), &otherSummary))
	require.Equal(t, model.LogSummaryTotals{Requests: 2, Succeeded: 2, Quota: 9, SubscriptionQuota: 800}, otherSummary.Data.LogSummaryTotals)
}
