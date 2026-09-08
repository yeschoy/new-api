package middleware

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestSetUpLoggerRedactsCustomDomainCallbackSecretsWithoutMutatingRequests(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousWriter := gin.DefaultWriter
	var output bytes.Buffer
	gin.DefaultWriter = &output
	t.Cleanup(func() { gin.DefaultWriter = previousWriter })

	router := gin.New()
	SetUpLogger(router)
	for _, path := range []string{
		"/api/stripe/return",
		"/api/user/epay/return",
		"/api/reset_password/return",
		"/user/reset",
	} {
		routePath := path
		router.GET(routePath, func(c *gin.Context) {
			assert.Equal(t, "order-secret", c.Query("trade_no"))
			assert.Equal(t, "signature-secret", c.Query("sign"))
			assert.Equal(t, "reset-token-secret", c.Query("token"))
			c.Status(http.StatusNoContent)
		})
	}
	query := "trade_no=order-secret&out_trade_no=merchant-secret&sign=signature-secret&email=person%40example.com&token=reset-token-secret&context=context-secret&keep=visible"
	for _, path := range []string{
		"/api/stripe/return",
		"/api/user/epay/return",
		"/api/reset_password/return",
		"/user/reset",
	} {
		request := httptest.NewRequest(http.MethodGet, path+"?"+query, nil)
		router.ServeHTTP(httptest.NewRecorder(), request)
	}
	logged := output.String()
	for _, secret := range []string{"order-secret", "merchant-secret", "signature-secret", "person%40example.com", "reset-token-secret", "context-secret"} {
		assert.NotContains(t, logged, secret)
	}
	assert.Contains(t, logged, "keep=visible")
	assert.Contains(t, logged, strings.ToUpper("%5Bredacted%5D"))
}

func TestSetUpLoggerRedactsOAuthClientSecretsWithoutMutatingRequests(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousWriter := gin.DefaultWriter
	var output bytes.Buffer
	gin.DefaultWriter = &output
	t.Cleanup(func() { gin.DefaultWriter = previousWriter })

	router := gin.New()
	SetUpLogger(router)
	for _, path := range []string{
		"/api/oauth/authorize",
		"/api/oauth/authorize/request",
		"/api/oauth/authorize/decision",
		"/api/oauth/token",
		"/api/oauth/userinfo",
		"/api/oauth/revoke",
		"/api/oauth/sessions",
		"/api/oauth/custom-provider",
		"/oauth/authorize",
	} {
		routePath := path
		router.GET(routePath, func(c *gin.Context) {
			assert.Equal(t, "state-secret", c.Query("state"))
			assert.Equal(t, "request-secret", c.Query("request"))
			c.Status(http.StatusNoContent)
		})
	}
	router.GET("/sign-in", func(c *gin.Context) {
		assert.Equal(t, "/oauth/authorize?request=request-secret", c.Query("redirect"))
		c.Status(http.StatusNoContent)
	})

	query := "redirect_uri=http%3A%2F%2F127.0.0.1%3A49182%2Foauth%2Fcallback&state=state-secret&code_challenge=challenge-secret&request=request-secret&code=code-secret&code_verifier=verifier-secret&access_token=access-secret&refresh_token=refresh-secret&token=token-secret&keep=visible"
	for _, path := range []string{
		"/api/oauth/authorize",
		"/api/oauth/authorize/request",
		"/api/oauth/authorize/decision",
		"/api/oauth/token",
		"/api/oauth/userinfo",
		"/api/oauth/revoke",
		"/api/oauth/sessions",
		"/api/oauth/custom-provider",
		"/oauth/authorize",
	} {
		request := httptest.NewRequest(http.MethodGet, path+"?"+query, nil)
		router.ServeHTTP(httptest.NewRecorder(), request)
	}
	signIn := httptest.NewRequest(http.MethodGet, "/sign-in?redirect=%2Foauth%2Fauthorize%3Frequest%3Drequest-secret&keep=visible", nil)
	router.ServeHTTP(httptest.NewRecorder(), signIn)

	logged := output.String()
	for _, secret := range []string{
		"127.0.0.1",
		"state-secret",
		"challenge-secret",
		"request-secret",
		"code-secret",
		"verifier-secret",
		"access-secret",
		"refresh-secret",
		"token-secret",
	} {
		assert.NotContains(t, logged, secret)
	}
	assert.Contains(t, logged, "keep=visible")

	for _, rawPath := range []string{
		"/api/oauth/token/?code=code-secret",
		"/api/oauth/revoke?token=refresh-secret&invalid=%zz",
	} {
		assert.NotContains(t, redactSensitiveLogPath(rawPath), "secret")
	}
}
