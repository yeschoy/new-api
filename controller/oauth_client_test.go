package controller

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupOAuthClientControllerTest(t *testing.T) {
	t.Helper()
	previousTranslate := common.TranslateMessage
	require.NoError(t, i18n.Init())
	previousDB := model.DB
	previousType := common.MainDatabaseType()
	previousSecret := common.SessionSecret
	previousAddress := system_setting.ServerAddress
	previousCustomDomains := common.CustomDomainEnabled
	previousRedisEnabled := common.RedisEnabled
	previousRedisClient := common.RDB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserSession{}, &model.OAuthClientSession{}, &model.AuthFlow{}))
	model.DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.SessionSecret = "oauth-client-controller-test-secret"
	common.CustomDomainEnabled = false
	common.RedisEnabled = false
	common.RDB = nil
	system_setting.ServerAddress = "https://yeschoy.com"
	require.NoError(t, db.Create(&model.User{
		Id:          42,
		Username:    "oauth-client-user",
		Password:    "unused",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
		Group:       "default",
		AuthVersion: 3,
		AffCode:     "oauth-client-user-aff",
	}).Error)
	t.Cleanup(func() {
		common.TranslateMessage = previousTranslate
		model.DB = previousDB
		common.SetMainDatabaseType(previousType)
		common.SessionSecret = previousSecret
		common.CustomDomainEnabled = previousCustomDomains
		common.RedisEnabled = previousRedisEnabled
		common.RDB = previousRedisClient
		system_setting.ServerAddress = previousAddress
	})
}

func oauthClientAuthorizeQuery() string {
	query := url.Values{
		"response_type":         {"code"},
		"client_id":             {service.OAuthClientID},
		"redirect_uri":          {"http://127.0.0.1:49182/oauth/callback"},
		"state":                 {"AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE"},
		"code_challenge":        {"E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"},
		"code_challenge_method": {"S256"},
		"scope":                 {"profile offline_access sessions"},
	}
	return query.Encode()
}

func oauthClientBrowserIdentity() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("id", 42)
		c.Set("session_id", "browser-session")
		c.Set("auth_version", int64(3))
		c.Set("session_version", int64(2))
		c.Set("login_method", "password")
		c.Next()
	}
}

func newOAuthClientAuthorizationTestRouter() *gin.Engine {
	router := gin.New()
	router.Use(middleware.RequestId())
	router.GET("/api/oauth/authorize", BeginOAuthClientAuthorization)
	router.GET("/api/oauth/authorize/request", oauthClientBrowserIdentity(), GetOAuthClientAuthorizationRequest)
	router.POST("/api/oauth/authorize/decision", oauthClientBrowserIdentity(), DecideOAuthClientAuthorization)
	router.POST("/api/oauth/token", OAuthClientToken)
	router.GET("/api/oauth/userinfo", middleware.OAuthClientAuth("profile"), OAuthClientUserInfo)
	router.GET("/api/oauth/sessions", middleware.OAuthClientAuth("sessions"), GetOAuthClientSessions)
	router.DELETE("/api/oauth/sessions/:session_id", middleware.OAuthClientAuth("sessions"), DeleteOAuthClientSession)
	router.POST("/api/oauth/revoke", RevokeOAuthClientToken)
	return router
}

func beginOAuthClientAuthorizationForTest(t *testing.T, router *gin.Engine) string {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, "https://yeschoy.com/api/oauth/authorize?"+oauthClientAuthorizeQuery(), nil)
	request.Host = "yeschoy.com"
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusSeeOther, response.Code)
	location, err := url.Parse(response.Header().Get("Location"))
	require.NoError(t, err)
	requestToken := location.Query().Get("request")
	require.NotEmpty(t, requestToken)
	return requestToken
}

func TestOAuthClientAuthorizationEndpointCreatesBrowserRequest(t *testing.T) {
	setupOAuthClientControllerTest(t)
	router := newOAuthClientAuthorizationTestRouter()
	request := httptest.NewRequest(http.MethodGet, "https://yeschoy.com/api/oauth/authorize?"+oauthClientAuthorizeQuery(), nil)
	request.Host = "yeschoy.com"
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	assert.Equal(t, http.StatusSeeOther, response.Code)
	assert.Contains(t, response.Header().Get("Location"), "/oauth/authorize?request=")
	assert.Equal(t, "no-store", response.Header().Get("Cache-Control"))
	assert.Equal(t, "no-referrer", response.Header().Get("Referrer-Policy"))
}

func TestOAuthClientAuthorizationEndpointRejectsDuplicateAndUntrustedHost(t *testing.T) {
	setupOAuthClientControllerTest(t)
	router := newOAuthClientAuthorizationTestRouter()

	duplicate := httptest.NewRequest(http.MethodGet, "https://yeschoy.com/api/oauth/authorize?"+oauthClientAuthorizeQuery()+"&client_id=other", nil)
	duplicate.Host = "yeschoy.com"
	duplicateResponse := httptest.NewRecorder()
	router.ServeHTTP(duplicateResponse, duplicate)
	assert.Equal(t, http.StatusBadRequest, duplicateResponse.Code)
	assert.Empty(t, duplicateResponse.Header().Get("Location"))

	untrusted := httptest.NewRequest(http.MethodGet, "https://attacker.example/api/oauth/authorize?"+oauthClientAuthorizeQuery(), nil)
	untrusted.Host = "attacker.example"
	untrusted.Header.Set("X-Forwarded-Host", "yeschoy.com")
	untrustedResponse := httptest.NewRecorder()
	router.ServeHTTP(untrustedResponse, untrusted)
	assert.Equal(t, http.StatusNotFound, untrustedResponse.Code)
	assert.Empty(t, untrustedResponse.Header().Get("Location"))
}

func TestOAuthClientAuthorizationErrorPageUsesBrowserLanguage(t *testing.T) {
	setupOAuthClientControllerTest(t)
	router := newOAuthClientAuthorizationTestRouter()
	for _, test := range []struct {
		header, lang, title, description string
	}{
		{"en-US,en;q=0.9", "en", "Authorization error", "The OAuth client is invalid."},
		{"zh-CN,zh;q=0.9", "zh-CN", "授权错误", "OAuth 客户端无效。"},
		{"zh-TW", "zh-TW", "授權錯誤", "OAuth 用戶端無效。"},
		{"fr-FR", "fr", "Erreur d’autorisation", "Le client OAuth est invalide."},
		{"ja-JP", "ja", "認証エラー", "OAuth クライアントが無効です。"},
		{"ru-RU", "ru", "Ошибка авторизации", "Недействительный клиент OAuth."},
		{"vi-VN", "vi", "Lỗi ủy quyền", "Ứng dụng OAuth không hợp lệ."},
		{"de-DE", "en", "Authorization error", "The OAuth client is invalid."},
	} {
		t.Run(test.header, func(t *testing.T) {
			query, err := url.ParseQuery(oauthClientAuthorizeQuery())
			require.NoError(t, err)
			query.Set("client_id", "invalid-client")
			request := httptest.NewRequest(http.MethodGet, "https://yeschoy.com/api/oauth/authorize?"+query.Encode(), nil)
			request.Header.Set("Accept-Language", test.header)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			assert.Equal(t, http.StatusBadRequest, response.Code)
			assert.Empty(t, response.Header().Get("Location"))
			assert.Equal(t, "no-store", response.Header().Get("Cache-Control"))
			assert.Contains(t, response.Body.String(), `<html lang="`+test.lang+`">`)
			assert.Contains(t, response.Body.String(), "<title>"+test.title+"</title>")
			assert.Contains(t, response.Body.String(), "<p>"+test.description+"</p>")
		})
	}
}

func TestOAuthClientAuthorizationBrowserCanInspectAndApprove(t *testing.T) {
	setupOAuthClientControllerTest(t)
	router := newOAuthClientAuthorizationTestRouter()
	requestToken := beginOAuthClientAuthorizationForTest(t, router)

	inspect := httptest.NewRequest(http.MethodGet, "/api/oauth/authorize/request?request="+url.QueryEscape(requestToken), nil)
	inspect.Host = "yeschoy.com"
	inspectResponse := httptest.NewRecorder()
	router.ServeHTTP(inspectResponse, inspect)
	require.Equal(t, http.StatusOK, inspectResponse.Code)
	assert.Contains(t, inspectResponse.Body.String(), `"client_id":"yeschoy-desktop"`)
	assert.Contains(t, inspectResponse.Body.String(), `"scopes":["profile","offline_access","sessions"]`)

	body := `{"flow_token":"` + requestToken + `","decision":"approve"}`
	decision := httptest.NewRequest(http.MethodPost, "/api/oauth/authorize/decision", strings.NewReader(body))
	decision.Host = "yeschoy.com"
	decision.Header.Set("Content-Type", "application/json")
	decisionResponse := httptest.NewRecorder()
	router.ServeHTTP(decisionResponse, decision)
	require.Equal(t, http.StatusOK, decisionResponse.Code)
	assert.Contains(t, decisionResponse.Body.String(), `"redirect_to":"http://127.0.0.1:49182/oauth/callback?code=`)
	assert.Contains(t, decisionResponse.Body.String(), `state=AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE`)

	replayResponse := httptest.NewRecorder()
	replay := httptest.NewRequest(http.MethodPost, "/api/oauth/authorize/decision", strings.NewReader(body))
	replay.Host = "yeschoy.com"
	replay.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(replayResponse, replay)
	assert.Equal(t, http.StatusBadRequest, replayResponse.Code)
}

func approvedOAuthClientCodeForControllerTest(t *testing.T, router *gin.Engine) string {
	t.Helper()
	requestToken := beginOAuthClientAuthorizationForTest(t, router)
	body := `{"flow_token":"` + requestToken + `","decision":"approve"}`
	request := httptest.NewRequest(http.MethodPost, "/api/oauth/authorize/decision", strings.NewReader(body))
	request.Host = "yeschoy.com"
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusOK, response.Code)
	var result struct {
		Data struct {
			RedirectTo string `json:"redirect_to"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &result))
	callback, err := url.Parse(result.Data.RedirectTo)
	require.NoError(t, err)
	code := callback.Query().Get("code")
	require.NotEmpty(t, code)
	return code
}

func TestOAuthClientTokenEndpointExchangesCodeAndRefreshes(t *testing.T) {
	setupOAuthClientControllerTest(t)
	router := newOAuthClientAuthorizationTestRouter()
	query := url.Values{}
	query.Set("grant_type", "authorization_code")
	query.Set("client_id", service.OAuthClientID)
	query.Set("code", approvedOAuthClientCodeForControllerTest(t, router))
	query.Set("redirect_uri", "http://127.0.0.1:49182/oauth/callback")
	query.Set("code_verifier", "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
	query.Set("device_id", "550e8400-e29b-41d4-a716-446655440000")
	query.Set("device_name", "我的 MacBook")
	query.Set("platform", "macos")
	query.Set("client_version", "1.0.0")
	request := httptest.NewRequest(http.MethodPost, "/api/oauth/token", strings.NewReader(query.Encode()))
	request.Host = "yeschoy.com"
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response := httptest.NewRecorder()

	router.ServeHTTP(response, request)

	require.Equal(t, http.StatusOK, response.Code)
	assert.Equal(t, "no-store", response.Header().Get("Cache-Control"))
	assert.Equal(t, "no-cache", response.Header().Get("Pragma"))
	assert.NotEmpty(t, response.Header().Get("X-Request-Id"))
	assert.NotContains(t, response.Body.String(), `"success"`)
	var tokens struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		TokenType    string `json:"token_type"`
		ExpiresIn    int    `json:"expires_in"`
		Scope        string `json:"scope"`
		SessionID    string `json:"session_id"`
	}
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &tokens))
	assert.NotEmpty(t, tokens.AccessToken)
	assert.NotEmpty(t, tokens.RefreshToken)
	assert.Equal(t, "Bearer", tokens.TokenType)
	assert.Positive(t, tokens.ExpiresIn)
	assert.Equal(t, "profile offline_access sessions", tokens.Scope)
	assert.NotEmpty(t, tokens.SessionID)

	refreshForm := url.Values{
		"grant_type":    {"refresh_token"},
		"client_id":     {service.OAuthClientID},
		"refresh_token": {tokens.RefreshToken},
	}
	refresh := httptest.NewRequest(http.MethodPost, "/api/oauth/token", strings.NewReader(refreshForm.Encode()))
	refresh.Host = "yeschoy.com"
	refresh.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	refreshResponse := httptest.NewRecorder()
	router.ServeHTTP(refreshResponse, refresh)
	require.Equal(t, http.StatusOK, refreshResponse.Code)
	assert.NotContains(t, refreshResponse.Body.String(), tokens.RefreshToken)
}

func TestOAuthClientTokenEndpointRejectsMalformedForms(t *testing.T) {
	setupOAuthClientControllerTest(t)
	router := newOAuthClientAuthorizationTestRouter()
	tests := []struct {
		name        string
		contentType string
		body        string
		wantError   string
	}{
		{name: "wrong content type", contentType: "application/json", body: `{}`, wantError: "invalid_request"},
		{name: "duplicate grant", contentType: "application/x-www-form-urlencoded", body: "grant_type=authorization_code&grant_type=refresh_token&client_id=yeschoy-desktop", wantError: "invalid_request"},
		{name: "unsupported grant", contentType: "application/x-www-form-urlencoded", body: "grant_type=client_credentials&client_id=yeschoy-desktop", wantError: "unsupported_grant_type"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api/oauth/token", strings.NewReader(test.body))
			request.Host = "yeschoy.com"
			request.Header.Set("Content-Type", test.contentType)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			assert.Equal(t, http.StatusBadRequest, response.Code)
			assert.Contains(t, response.Body.String(), `"error":"`+test.wantError+`"`)
			assert.NotEmpty(t, response.Header().Get("X-Request-Id"))
		})
	}
}

type oauthClientControllerTokens struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	SessionID    string `json:"session_id"`
}

func exchangeOAuthClientTokensForControllerTest(t *testing.T, router *gin.Engine) oauthClientControllerTokens {
	t.Helper()
	form := url.Values{
		"grant_type":    {"authorization_code"},
		"client_id":     {service.OAuthClientID},
		"code":          {approvedOAuthClientCodeForControllerTest(t, router)},
		"redirect_uri":  {"http://127.0.0.1:49182/oauth/callback"},
		"code_verifier": {"dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"},
		"device_name":   {"OAuth Mac"},
		"platform":      {"macos"},
	}
	request := httptest.NewRequest(http.MethodPost, "/api/oauth/token", strings.NewReader(form.Encode()))
	request.Host = "yeschoy.com"
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	require.Equal(t, http.StatusOK, response.Code)
	var tokens oauthClientControllerTokens
	require.NoError(t, common.Unmarshal(response.Body.Bytes(), &tokens))
	require.NotEmpty(t, tokens.AccessToken)
	require.NotEmpty(t, tokens.RefreshToken)
	require.NotEmpty(t, tokens.SessionID)
	return tokens
}

func TestOAuthClientResourceEndpointsReturnUserAndDeviceSession(t *testing.T) {
	setupOAuthClientControllerTest(t)
	router := newOAuthClientAuthorizationTestRouter()
	tokens := exchangeOAuthClientTokensForControllerTest(t, router)

	userinfo := httptest.NewRequest(http.MethodGet, "/api/oauth/userinfo", nil)
	userinfo.Host = "yeschoy.com"
	userinfo.Header.Set("Authorization", "Bearer "+tokens.AccessToken)
	userinfoResponse := httptest.NewRecorder()
	router.ServeHTTP(userinfoResponse, userinfo)
	require.Equal(t, http.StatusOK, userinfoResponse.Code)
	assert.Contains(t, userinfoResponse.Body.String(), `"id":"42"`)
	assert.Contains(t, userinfoResponse.Body.String(), `"username":"oauth-client-user"`)
	assert.Contains(t, userinfoResponse.Body.String(), `"email":null`)
	assert.Contains(t, userinfoResponse.Body.String(), `"status":"active"`)

	sessions := httptest.NewRequest(http.MethodGet, "/api/oauth/sessions?limit=20", nil)
	sessions.Host = "yeschoy.com"
	sessions.Header.Set("Authorization", "Bearer "+tokens.AccessToken)
	sessionsResponse := httptest.NewRecorder()
	router.ServeHTTP(sessionsResponse, sessions)
	require.Equal(t, http.StatusOK, sessionsResponse.Code)
	assert.Contains(t, sessionsResponse.Body.String(), `"id":"`+tokens.SessionID+`"`)
	assert.Contains(t, sessionsResponse.Body.String(), `"current":true`)

	remove := httptest.NewRequest(http.MethodDelete, "/api/oauth/sessions/"+tokens.SessionID, nil)
	remove.Host = "yeschoy.com"
	remove.Header.Set("Authorization", "Bearer "+tokens.AccessToken)
	removeResponse := httptest.NewRecorder()
	router.ServeHTTP(removeResponse, remove)
	assert.Equal(t, http.StatusNoContent, removeResponse.Code)

	afterRevoke := httptest.NewRequest(http.MethodGet, "/api/oauth/userinfo", nil)
	afterRevoke.Host = "yeschoy.com"
	afterRevoke.Header.Set("Authorization", "Bearer "+tokens.AccessToken)
	afterRevokeResponse := httptest.NewRecorder()
	router.ServeHTTP(afterRevokeResponse, afterRevoke)
	assert.Equal(t, http.StatusUnauthorized, afterRevokeResponse.Code)
}

func TestOAuthClientRevokeIsIdempotentAndReturnsNoBody(t *testing.T) {
	setupOAuthClientControllerTest(t)
	router := newOAuthClientAuthorizationTestRouter()
	tokens := exchangeOAuthClientTokensForControllerTest(t, router)

	for _, token := range []string{tokens.AccessToken, tokens.RefreshToken, "unknown-token"} {
		form := url.Values{
			"client_id": {service.OAuthClientID},
			"token":     {token},
		}
		request := httptest.NewRequest(http.MethodPost, "/api/oauth/revoke", strings.NewReader(form.Encode()))
		request.Host = "yeschoy.com"
		request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		assert.Equal(t, http.StatusOK, response.Code)
		assert.Empty(t, response.Body.String())
	}
}
