package router

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestOAuthClientAuthorizationRoutesUseStaticHandlers(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerOAuthClientRoutes(router.Group("/api"))

	handlers := make(map[string]string)
	for _, route := range router.Routes() {
		handlers[route.Method+" "+route.Path] = route.Handler
	}
	assert.True(t, strings.HasSuffix(handlers[http.MethodGet+" /api/oauth/authorize"], ".BeginOAuthClientAuthorization"))
	assert.True(t, strings.HasSuffix(handlers[http.MethodGet+" /api/oauth/authorize/request"], ".GetOAuthClientAuthorizationRequest"))
	assert.True(t, strings.HasSuffix(handlers[http.MethodPost+" /api/oauth/authorize/decision"], ".DecideOAuthClientAuthorization"))
	assert.True(t, strings.HasSuffix(handlers[http.MethodPost+" /api/oauth/token"], ".OAuthClientToken"))
	assert.True(t, strings.HasSuffix(handlers[http.MethodGet+" /api/oauth/userinfo"], ".OAuthClientUserInfo"))
	assert.True(t, strings.HasSuffix(handlers[http.MethodPost+" /api/oauth/revoke"], ".RevokeOAuthClientToken"))
	assert.True(t, strings.HasSuffix(handlers[http.MethodGet+" /api/oauth/sessions"], ".GetOAuthClientSessions"))
	assert.True(t, strings.HasSuffix(handlers[http.MethodDelete+" /api/oauth/sessions/:session_id"], ".DeleteOAuthClientSession"))
}

func TestOAuthAuthorizationPageUsesNoReferrerPolicy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.NoRoute(oauthAuthorizationReferrerPolicy, func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	for _, path := range []string{"/oauth/authorize", "/oauth/authorize/"} {
		request := httptest.NewRequest(http.MethodGet, path+"?request=sensitive", nil)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		assert.Equal(t, "no-referrer", response.Header().Get("Referrer-Policy"), path)
	}

	request := httptest.NewRequest(http.MethodGet, "/dashboard", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	assert.Empty(t, response.Header().Get("Referrer-Policy"))
}
