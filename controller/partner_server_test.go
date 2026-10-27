package controller

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var partnerServerTestModels = []any{
	&model.PartnerServerConfig{}, &model.PartnerServerSecret{}, &model.PartnerServerToken{},
	&model.PartnerAccount{}, &model.PartnerAccountPaymentOrder{},
	&model.WalletRefundCreditEvent{}, &model.UserAccessToken{},
}

// setupPartnerServerController extends the partner OAuth test engine with a
// protected probe route. A middleware in front of every route sets a
// wildcard CORS header, standing in for the engine-wide CORS of production.
func setupPartnerServerController(t *testing.T) *gin.Engine {
	t.Helper()
	engine := setupPartnerOAuthController(t)
	require.NoError(t, model.DB.AutoMigrate(partnerServerTestModels...))
	engine.Use(func(c *gin.Context) { c.Header("Access-Control-Allow-Origin", "*") })
	engine.GET("/api/partner/v1/probe", middleware.PartnerServerBearer(), func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"client_id": middleware.PartnerServerPrincipalFrom(c).Partner.ClientId})
	})
	engine.GET("/api/partner/v1/limited", middleware.PartnerServerBearer(), middleware.PartnerServerRateLimit("PSV-TEST", 1, "partner_account.credential_rate_limited"), func(c *gin.Context) {
		c.Status(http.StatusNoContent)
	})
	// Mirrors router.SetPartnerServerRouter (router imports this package).
	accounts := engine.Group("/api/partner/v1/accounts/:external_user_id", middleware.PartnerServerBearer())
	accounts.GET("", PartnerServerGetAccount)
	accounts.POST("/credential", PartnerServerIssueCredential)
	accounts.POST("/credential/rotate", PartnerServerRotateCredential)
	accounts.POST("/disable", PartnerServerDisableAccount)
	accounts.POST("/enable", PartnerServerEnableAccount)
	previousRunner := service.PartnerServerJobRunner
	service.PartnerServerJobRunner = func(task func()) { task() }
	t.Cleanup(func() { service.PartnerServerJobRunner = previousRunner })
	return engine
}

type partnerServerFixture struct {
	client      *model.PartnerOAuthClient
	oauthSecret string
	secret      string
	secretID    int64
}

func seedPartnerServerFixture(t *testing.T, allowlist string) partnerServerFixture {
	t.Helper()
	client, oauthSecret := createPartnerTestClient(t, model.PartnerOAuthTokenAuthMethodBasic, []string{"https://partner.example.com/oauth/callback"})
	require.NoError(t, model.SavePartnerServerConfig(&model.PartnerServerConfig{
		ClientId: client.ClientId, Enabled: true, AccountGroup: "default", IPAllowlist: allowlist,
		MaxAccounts: model.PartnerServerDefaultMaxAccounts, AccountsPerMinute: model.PartnerServerDefaultAccountsPerMinute,
	}))
	secret, err := service.GeneratePartnerServerSecret()
	require.NoError(t, err)
	stored, err := model.CreatePartnerServerSecret(client.ClientId, model.HashPartnerOAuthSecret(secret))
	require.NoError(t, err)
	service.InvalidatePartnerServerSnapshot(client.ClientId)
	return partnerServerFixture{client: client, oauthSecret: oauthSecret, secret: secret, secretID: stored.Id}
}

func partnerServerTokenRequest(engine http.Handler, clientID, secret, form, remoteIP string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/oauth/token", strings.NewReader(form))
	req.Host = "localhost:3000"
	req.RemoteAddr = remoteIP + ":40000"
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(url.QueryEscape(clientID)+":"+url.QueryEscape(secret))))
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	return rec
}

func partnerServerGet(engine http.Handler, path, token, remoteIP string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodGet, path, nil)
	req.Host = "localhost:3000"
	req.RemoteAddr = remoteIP + ":40000"
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	return rec
}

func issuePartnerServerTestToken(t *testing.T, engine http.Handler, fixture partnerServerFixture) string {
	t.Helper()
	rec := partnerServerTokenRequest(engine, fixture.client.ClientId, fixture.secret, "grant_type=client_credentials", "203.0.113.10")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body service.PartnerServerTokenResponse
	require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &body))
	return body.AccessToken
}

func partnerServerLogs(t *testing.T, action string) []model.PartnerOauthAuthorizationLog {
	t.Helper()
	var logs []model.PartnerOauthAuthorizationLog
	require.NoError(t, model.LOG_DB.Where("action = ?", action).Find(&logs).Error)
	return logs
}

func TestPartnerServerClientCredentialsIssueAndUse(t *testing.T) {
	engine := setupPartnerServerController(t)
	fixture := seedPartnerServerFixture(t, "")

	rec := partnerServerTokenRequest(engine, fixture.client.ClientId, fixture.secret, "grant_type=client_credentials&scope=partner%3Aaccounts", "203.0.113.10")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	assert.Empty(t, rec.Header().Get("Access-Control-Allow-Origin"), "server token responses carry no CORS headers")
	assert.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	var body service.PartnerServerTokenResponse
	require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &body))
	assert.True(t, strings.HasPrefix(body.AccessToken, "pst_"))
	assert.Equal(t, "Bearer", body.TokenType)
	assert.Equal(t, 3600, body.ExpiresIn)
	assert.Equal(t, service.PartnerServerScope, body.Scope)
	assert.Len(t, partnerServerLogs(t, "partner_server.token_issue"), 1, "successful issues are audited")

	probe := partnerServerGet(engine, "/api/partner/v1/probe", body.AccessToken, "198.51.100.7")
	require.Equal(t, http.StatusOK, probe.Code, probe.Body.String())
	assert.Contains(t, probe.Body.String(), fixture.client.ClientId)
	assert.Equal(t, http.StatusBadRequest, partnerServerGet(engine, "/api/partner/v1/probe?access_token="+body.AccessToken, body.AccessToken, "198.51.100.7").Code)

	bad := partnerServerTokenRequest(engine, fixture.client.ClientId, fixture.secret, "grant_type=client_credentials&scope=account%3Aread", "203.0.113.10")
	assert.Equal(t, http.StatusBadRequest, bad.Code)
	assert.Contains(t, bad.Body.String(), "invalid_scope")
}

func TestPartnerServerClientCredentialsRefusals(t *testing.T) {
	tests := []struct {
		name     string
		allow    string
		prepare  func(t *testing.T, f partnerServerFixture)
		clientID func(f partnerServerFixture) string
		secret   func(f partnerServerFixture) string
		reason   string
	}{
		{name: "wrong secret", secret: func(partnerServerFixture) string { return "pss_" + strings.Repeat("0", 64) }, reason: service.PartnerServerReasonInvalidSecret},
		{name: "oauth client secret is not a server secret", secret: func(f partnerServerFixture) string { return f.oauthSecret }, reason: service.PartnerServerReasonInvalidSecret},
		{name: "revoked secret", prepare: func(t *testing.T, f partnerServerFixture) {
			require.NoError(t, model.RevokePartnerServerSecret(f.client.ClientId, f.secretID))
		}, reason: service.PartnerServerReasonInvalidSecret},
		{name: "client disabled", prepare: func(t *testing.T, f partnerServerFixture) {
			f.client.Status = model.PartnerOAuthClientStatusDisabled
			require.NoError(t, model.UpdatePartnerOAuthClient(f.client))
		}, reason: service.PartnerServerReasonUnavailable},
		{name: "server access switched off", prepare: func(t *testing.T, f partnerServerFixture) {
			require.NoError(t, model.SavePartnerServerConfig(&model.PartnerServerConfig{ClientId: f.client.ClientId, AccountGroup: "default", MaxAccounts: 1, AccountsPerMinute: 1}))
		}, reason: service.PartnerServerReasonUnavailable},
		{name: "partner suspended", prepare: func(t *testing.T, f partnerServerFixture) {
			_, err := model.SetPartnerServerSuspended(f.client.ClientId, true)
			require.NoError(t, err)
		}, reason: service.PartnerServerReasonUnavailable},
		{name: "address not allowed", allow: `["192.0.2.0/24"]`, reason: service.PartnerServerReasonIPNotAllowed},
		{name: "unknown client is not audited", clientID: func(partnerServerFixture) string { return "pc_" + strings.Repeat("f", 32) }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			engine := setupPartnerServerController(t)
			fixture := seedPartnerServerFixture(t, tt.allow)
			if tt.prepare != nil {
				tt.prepare(t, fixture)
			}
			clientID, secret := fixture.client.ClientId, fixture.secret
			if tt.clientID != nil {
				clientID = tt.clientID(fixture)
			}
			if tt.secret != nil {
				secret = tt.secret(fixture)
			}
			rec := partnerServerTokenRequest(engine, clientID, secret, "grant_type=client_credentials", "203.0.113.10")
			assert.Equal(t, http.StatusUnauthorized, rec.Code)
			assert.Contains(t, rec.Body.String(), `"invalid_client"`, "every failure looks the same")
			assert.Equal(t, `Basic realm="oauth"`, rec.Header().Get("WWW-Authenticate"))
			logs := partnerServerLogs(t, "partner_server.token_issue_failed")
			if tt.reason == "" {
				assert.Empty(t, logs)
				return
			}
			require.Len(t, logs, 1)
			assert.Equal(t, tt.reason, logs[0].Reason)
			assert.False(t, logs[0].Success)
		})
	}
}

func TestPartnerServerSecretsAndTokensStayInTheirLane(t *testing.T) {
	engine := setupPartnerServerController(t)
	fixture := seedPartnerServerFixture(t, "")

	refresh := partnerServerTokenRequest(engine, fixture.client.ClientId, fixture.secret, "grant_type=refresh_token&refresh_token=or_x", "203.0.113.10")
	assert.Equal(t, http.StatusUnauthorized, refresh.Code, "a server secret cannot authenticate OAuth grants")

	serverToken := issuePartnerServerTestToken(t, engine, fixture)
	integration := partnerServerGet(engine, "/api/integrations/v1/account", serverToken, "203.0.113.10")
	assert.Equal(t, http.StatusUnauthorized, integration.Code, "server tokens are not OAuth access tokens")

	user := &model.User{Username: "partner-lane-user", Password: "unused", Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1}
	require.NoError(t, model.DB.Create(user).Error)
	seedPartnerPaymentBinding(t, user, fixture.client, "account:read", "oa_partner_lane_access")
	require.Equal(t, http.StatusOK, partnerServerGet(engine, "/api/integrations/v1/account", "oa_partner_lane_access", "203.0.113.10").Code)
	probe := partnerServerGet(engine, "/api/partner/v1/probe", "oa_partner_lane_access", "203.0.113.10")
	assert.Equal(t, http.StatusUnauthorized, probe.Code, "OAuth access tokens are not server tokens")
}

func TestPartnerServerBearerFollowsRevocationAndAllowlist(t *testing.T) {
	engine := setupPartnerServerController(t)
	fixture := seedPartnerServerFixture(t, `["203.0.113.0/24"]`)
	token := issuePartnerServerTestToken(t, engine, fixture)
	require.Equal(t, http.StatusOK, partnerServerGet(engine, "/api/partner/v1/probe", token, "203.0.113.99").Code)

	denied := partnerServerGet(engine, "/api/partner/v1/probe", token, "198.51.100.7")
	assert.Equal(t, http.StatusUnauthorized, denied.Code, "a stolen token is useless from another address")
	assert.Equal(t, http.StatusUnauthorized, partnerServerGet(engine, "/api/partner/v1/probe", token, "198.51.100.8").Code)
	auditDenied := partnerServerLogs(t, "partner_server.auth_denied")
	require.Len(t, auditDenied, 1, "refusals are audited at most once a minute per reason")
	assert.Equal(t, service.PartnerServerReasonIPNotAllowed, auditDenied[0].Reason)

	require.NoError(t, model.RevokePartnerServerSecret(fixture.client.ClientId, fixture.secretID))
	service.InvalidatePartnerServerSnapshot(fixture.client.ClientId)
	assert.Equal(t, http.StatusUnauthorized, partnerServerGet(engine, "/api/partner/v1/probe", token, "203.0.113.99").Code,
		"revoking the secret kills its tokens on the next request")
}

func TestPartnerServerRateLimitAuditsRefusal(t *testing.T) {
	engine := setupPartnerServerController(t)
	fixture := seedPartnerServerFixture(t, "")
	token := issuePartnerServerTestToken(t, engine, fixture)
	assert.Equal(t, http.StatusNoContent, partnerServerGet(engine, "/api/partner/v1/limited", token, "203.0.113.10").Code)
	limited := partnerServerGet(engine, "/api/partner/v1/limited", token, "203.0.113.10")
	assert.Equal(t, http.StatusTooManyRequests, limited.Code)
	logs := partnerServerLogs(t, "partner_account.credential_rate_limited")
	require.Len(t, logs, 1)
	assert.Equal(t, "rate_limited", logs[0].Reason)
}

func TestPartnerServerAdminConfigAndSecrets(t *testing.T) {
	engine := setupPartnerOAuthAdminController(t)
	require.NoError(t, model.DB.AutoMigrate(partnerServerTestModels...))
	previousRatios := ratio_setting.GroupRatio2JSONString()
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1,"partner_kede":1}`))
	t.Cleanup(func() { _ = ratio_setting.UpdateGroupRatioByJSONString(previousRatios) })
	clients := engine.Group("/api/partner-oauth/clients")
	clients.Use(middleware.AdminAuth())
	clients.GET("/:id/server", middleware.RequirePermission(authz.PartnerOAuthClientRead), GetPartnerServerConfig)
	clients.PUT("/:id/server", middleware.RequirePermission(authz.PartnerOAuthClientSensitiveWrite), UpdatePartnerServerConfig)
	clients.POST("/:id/server-secrets", middleware.RequirePermission(authz.PartnerOAuthClientSensitiveWrite), CreatePartnerServerSecret)
	clients.DELETE("/:id/server-secrets/:secret_id", middleware.RequirePermission(authz.PartnerOAuthClientSensitiveWrite), RevokePartnerServerSecret)

	root := createPartnerOAuthAdminActor(t, "partner-server-root", common.RoleRootUser)
	client, _ := createPartnerTestClient(t, model.PartnerOAuthTokenAuthMethodBasic, []string{"https://partner.example.com/oauth/callback"})
	base := "/api/partner-oauth/clients/" + strconv.FormatInt(client.Id, 10)
	updateProof := func() string {
		return issuePartnerOAuthAdminProof(t, root, `{"action":"update_server","client_id":"`+client.ClientId+`"}`)
	}
	issueProof := func() string {
		return issuePartnerOAuthAdminProof(t, root, `{"action":"issue_server_secret","client_id":"`+client.ClientId+`"}`)
	}

	early := partnerOAuthAdminRequest(engine, http.MethodPost, base+"/server-secrets", root.token, issueProof(), "")
	assert.Equal(t, http.StatusBadRequest, early.Code, "secrets need a server config first")

	for _, body := range []string{
		`{"enabled":true,"account_group":"missing","ip_allowlist":[],"max_accounts":10,"accounts_per_minute":1}`,
		`{"enabled":true,"account_group":"partner_kede","ip_allowlist":["not-an-ip"],"max_accounts":10,"accounts_per_minute":1}`,
		`{"enabled":true,"account_group":"partner_kede","ip_allowlist":[],"max_accounts":0,"accounts_per_minute":1}`,
	} {
		rec := partnerOAuthAdminRequest(engine, http.MethodPut, base+"/server", root.token, updateProof(), body)
		assert.Equal(t, http.StatusBadRequest, rec.Code, body)
	}
	assert.Equal(t, http.StatusForbidden, partnerOAuthAdminRequest(engine, http.MethodPut, base+"/server", root.token, "",
		`{"enabled":true,"account_group":"partner_kede","ip_allowlist":[],"max_accounts":10,"accounts_per_minute":1}`).Code, "config writes need a security proof")

	saved := partnerOAuthAdminRequest(engine, http.MethodPut, base+"/server", root.token, updateProof(),
		`{"enabled":true,"account_group":"partner_kede","ip_allowlist":["203.0.113.5","2001:db8::/32"],"max_accounts":100000,"accounts_per_minute":60}`)
	require.Equal(t, http.StatusOK, saved.Code, saved.Body.String())
	assert.Contains(t, saved.Body.String(), `"203.0.113.5/32"`)

	var secretIDs []int64
	for range 2 {
		rec := partnerOAuthAdminRequest(engine, http.MethodPost, base+"/server-secrets", root.token, issueProof(), "")
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		assert.Contains(t, rec.Body.String(), `"value":"pss_`)
		var resp struct {
			Data struct {
				Secret partnerServerSecretView `json:"secret"`
			} `json:"data"`
		}
		require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &resp))
		secretIDs = append(secretIDs, resp.Data.Secret.Id)
	}
	third := partnerOAuthAdminRequest(engine, http.MethodPost, base+"/server-secrets", root.token, issueProof(), "")
	assert.Equal(t, http.StatusConflict, third.Code)

	view := partnerOAuthAdminRequest(engine, http.MethodGet, base+"/server", root.token, "", "")
	require.Equal(t, http.StatusOK, view.Code)
	assert.NotContains(t, view.Body.String(), "pss_", "secrets are shown once")

	revokeProof := issuePartnerOAuthAdminProof(t, root, `{"action":"revoke_server_secret","client_id":"`+client.ClientId+`","secret_id":`+strconv.FormatInt(secretIDs[0], 10)+`}`)
	revoked := partnerOAuthAdminRequest(engine, http.MethodDelete, base+"/server-secrets/"+strconv.FormatInt(secretIDs[0], 10), root.token, revokeProof, "")
	require.Equal(t, http.StatusOK, revoked.Code, revoked.Body.String())
	assert.Len(t, partnerServerLogs(t, "partner_server.secret_issue"), 2)
	assert.Len(t, partnerServerLogs(t, "partner_server.secret_revoke"), 1)
}

const partnerServerTestUser = "kede-user-0000000000000000000000001"

func partnerServerPost(engine http.Handler, path, token, body string, headers map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
	req.Host = "localhost:3000"
	req.RemoteAddr = "203.0.113.10:40000"
	req.Header.Set("Authorization", "Bearer "+token)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	for name, value := range headers {
		req.Header.Set(name, value)
	}
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	return rec
}

func decodePartnerCredential(t *testing.T, rec *httptest.ResponseRecorder) service.PartnerAccountCredentialView {
	t.Helper()
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var view service.PartnerAccountCredentialView
	require.NoError(t, common.Unmarshal(rec.Body.Bytes(), &view))
	return view
}

func assertPartnerError(t *testing.T, rec *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	assert.Equal(t, status, rec.Code, rec.Body.String())
	assert.Contains(t, rec.Body.String(), `"code":"`+code+`"`)
}

func TestPartnerServerAccountLifecycle(t *testing.T) {
	engine := setupPartnerServerController(t)
	fixture := seedPartnerServerFixture(t, "")
	token := issuePartnerServerTestToken(t, engine, fixture)
	base := "/api/partner/v1/accounts/" + partnerServerTestUser

	assertPartnerError(t, partnerServerGet(engine, base, token, "203.0.113.10"), http.StatusNotFound, "account_not_found")
	assertPartnerError(t, partnerServerGet(engine, "/api/partner/v1/accounts/too-short", token, "203.0.113.10"), http.StatusBadRequest, "invalid_external_user_id")
	count, err := model.CountPartnerAccounts(fixture.client.ClientId)
	require.NoError(t, err)
	assert.Zero(t, count, "lookups never create accounts")

	assertPartnerError(t, partnerServerPost(engine, base+"/credential", token, `{"extra":1}`, nil), http.StatusBadRequest, "invalid_request")
	first := decodePartnerCredential(t, partnerServerPost(engine, base+"/credential", token, "{}", nil))
	assert.True(t, strings.HasPrefix(first.APIKey, "sk-"))
	assert.Equal(t, "http://localhost:3000/v1", first.BaseURL)
	assert.Equal(t, partnerServerTestUser, first.ExternalUserID)
	again := decodePartnerCredential(t, partnerServerPost(engine, base+"/credential", token, "", nil))
	assert.Equal(t, first.APIKey, again.APIKey, "the key can be fetched again")
	assert.Len(t, partnerServerLogs(t, "partner_account.create"), 1)
	assert.Len(t, partnerServerLogs(t, "partner_account.credential_issue"), 1)

	account := partnerServerGet(engine, base, token, "203.0.113.10")
	require.Equal(t, http.StatusOK, account.Code)
	var view service.PartnerAccountView
	require.NoError(t, common.Unmarshal(account.Body.Bytes(), &view))
	assert.Equal(t, first.AccountID, view.AccountID)
	assert.Zero(t, view.Quota)
	assert.Equal(t, model.PartnerAccountStatusActive, view.Status)

	other := seedPartnerServerFixture(t, "")
	otherToken := issuePartnerServerTestToken(t, engine, other)
	assertPartnerError(t, partnerServerGet(engine, base, otherToken, "203.0.113.10"), http.StatusNotFound, "account_not_found")
}

func TestPartnerServerRotationOverHTTP(t *testing.T) {
	engine := setupPartnerServerController(t)
	fixture := seedPartnerServerFixture(t, "")
	token := issuePartnerServerTestToken(t, engine, fixture)
	base := "/api/partner/v1/accounts/" + partnerServerTestUser
	first := decodePartnerCredential(t, partnerServerPost(engine, base+"/credential", token, "{}", nil))

	assertPartnerError(t, partnerServerPost(engine, base+"/credential/rotate", token, "{}", nil), http.StatusBadRequest, "invalid_request")
	key := map[string]string{"Idempotency-Key": "rotate-0000000000000001"}
	graced := decodePartnerCredential(t, partnerServerPost(engine, base+"/credential/rotate", token, "{}", key))
	assert.NotEqual(t, first.APIKey, graced.APIKey)
	require.NotNil(t, graced.OldKeyExpiresAt, "a graced rotation reports when the old key stops")
	replay := decodePartnerCredential(t, partnerServerPost(engine, base+"/credential/rotate", token, "", key))
	assert.Equal(t, graced.APIKey, replay.APIKey, "retrying with the same key does not rotate again")
	assertPartnerError(t, partnerServerPost(engine, base+"/credential/rotate", token, `{"revoke_old":"immediately"}`, key), http.StatusConflict, "idempotency_conflict")
	assertPartnerError(t, partnerServerPost(engine, base+"/credential/rotate", token, `{"revoke_old":"later"}`, map[string]string{"Idempotency-Key": "rotate-0000000000000002"}), http.StatusBadRequest, "invalid_request")

	now := decodePartnerCredential(t, partnerServerPost(engine, base+"/credential/rotate", token, `{"revoke_old":"immediately"}`, map[string]string{"Idempotency-Key": "rotate-0000000000000003"}))
	assert.Nil(t, now.OldKeyExpiresAt)
	logs := partnerServerLogs(t, "partner_account.credential_rotate")
	require.Len(t, logs, 2, "replays are not audited again")
	assert.Equal(t, service.PartnerAccountRevokeAfterGrace, logs[0].Reason)
	assert.Equal(t, service.PartnerAccountRevokeImmediately, logs[1].Reason)

	assertPartnerError(t, partnerServerPost(engine, "/api/partner/v1/accounts/kede-unknown-00000000000000000000000/credential/rotate", token, "{}", map[string]string{"Idempotency-Key": "rotate-0000000000000004"}), http.StatusNotFound, "account_not_found")
}

func TestPartnerServerAccountDisableAndAdminPrecedence(t *testing.T) {
	engine := setupPartnerServerController(t)
	fixture := seedPartnerServerFixture(t, "")
	token := issuePartnerServerTestToken(t, engine, fixture)
	base := "/api/partner/v1/accounts/" + partnerServerTestUser
	decodePartnerCredential(t, partnerServerPost(engine, base+"/credential", token, "{}", nil))
	account, err := model.GetPartnerAccount(fixture.client.ClientId, partnerServerTestUser)
	require.NoError(t, err)

	require.Equal(t, http.StatusOK, partnerServerPost(engine, base+"/disable", token, "", nil).Code)
	user, err := model.GetUserById(account.UserId, true)
	require.NoError(t, err)
	assert.Equal(t, common.UserStatusDisabled, user.Status)
	assertPartnerError(t, partnerServerPost(engine, base+"/credential", token, "{}", nil), http.StatusForbidden, "account_disabled")

	require.Equal(t, http.StatusOK, partnerServerPost(engine, base+"/enable", token, "", nil).Code)
	decodePartnerCredential(t, partnerServerPost(engine, base+"/credential", token, "{}", nil))

	require.NoError(t, model.SyncPartnerAccountAdminStatus(account.UserId, false))
	assertPartnerError(t, partnerServerPost(engine, base+"/enable", token, "", nil), http.StatusForbidden, "account_disabled_by_admin")
	assert.Len(t, partnerServerLogs(t, "partner_account.disable"), 1)
	assert.Len(t, partnerServerLogs(t, "partner_account.enable"), 1)
}

func TestAdminCannotGivePartnerSubAccountAPassword(t *testing.T) {
	engine := setupPartnerServerController(t)
	fixture := seedPartnerServerFixture(t, "")
	token := issuePartnerServerTestToken(t, engine, fixture)
	decodePartnerCredential(t, partnerServerPost(engine, "/api/partner/v1/accounts/"+partnerServerTestUser+"/credential", token, "{}", nil))
	account, err := model.GetPartnerAccount(fixture.client.ClientId, partnerServerTestUser)
	require.NoError(t, err)
	user, err := model.GetUserById(account.UserId, true)
	require.NoError(t, err)

	probe := model.User{Username: user.Username, Password: "any-password-1"}
	assert.ErrorIs(t, probe.ValidateAndFill(), model.ErrInvalidCredentials, "password sign-in cannot reach a sub-account")

	body := `{"id":` + strconv.Itoa(user.Id) + `,"username":"` + user.Username + `","password":"new-password-123","display_name":"x","group":"default"}`
	ctx, rec := newAdminUpdateContext(t, body)
	UpdateUser(ctx)
	assert.Contains(t, rec.Body.String(), `"success":false`)
	stored, err := model.GetUserById(user.Id, true)
	require.NoError(t, err)
	assert.Empty(t, stored.Password)
}

func newAdminUpdateContext(t *testing.T, body string) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()
	rec := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(rec)
	ctx.Request = httptest.NewRequest(http.MethodPut, "/api/user/", strings.NewReader(body))
	ctx.Request.Header.Set("Content-Type", "application/json")
	ctx.Set("id", 1)
	ctx.Set("role", common.RoleRootUser)
	return ctx, rec
}

func TestPartnerSuspensionThroughClientStatus(t *testing.T) {
	engine := setupPartnerOAuthAdminController(t)
	require.NoError(t, model.DB.AutoMigrate(partnerServerTestModels...))
	previousRunner := service.PartnerServerJobRunner
	service.PartnerServerJobRunner = func(task func()) { task() }
	t.Cleanup(func() { service.PartnerServerJobRunner = previousRunner })
	root := createPartnerOAuthAdminActor(t, "partner-suspend-root", common.RoleRootUser)
	fixture := seedPartnerServerFixture(t, "")
	account, _, _, err := model.IssuePartnerAccountCredential(model.PartnerAccountOwner{ClientId: fixture.client.ClientId, ExternalUserId: partnerServerTestUser, DisplayName: "Kede"},
		model.PartnerAccountKey{Key: strings.Repeat("k", 48), Name: "partner:Kede", AutoGroups: []string{"default"}})
	require.NoError(t, err)

	status := func(value int) {
		rec := partnerOAuthAdminRequest(engine, http.MethodPost, "/api/partner-oauth/clients/"+strconv.FormatInt(fixture.client.Id, 10)+"/status", root.token, "", `{"status":`+strconv.Itoa(value)+`}`)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	}
	status(model.PartnerOAuthClientStatusDisabled)
	user, err := model.GetUserById(account.UserId, true)
	require.NoError(t, err)
	assert.Equal(t, common.UserStatusDisabled, user.Status, "suspending the partner disables its sub-accounts")
	config, err := model.GetPartnerServerConfig(fixture.client.ClientId)
	require.NoError(t, err)
	assert.NotZero(t, config.SuspendedAt)

	status(model.PartnerOAuthClientStatusEnabled)
	user, err = model.GetUserById(account.UserId, true)
	require.NoError(t, err)
	assert.Equal(t, common.UserStatusEnabled, user.Status, "resuming restores them")
	assert.Len(t, partnerServerLogs(t, "partner_server.suspend"), 1)
	assert.Len(t, partnerServerLogs(t, "partner_server.resume"), 1)
	assert.Equal(t, service.PartnerServerJobProgress{Processed: 1}, service.GetPartnerServerJobProgress(service.PartnerServerJobSuspension, fixture.client.ClientId))
}
