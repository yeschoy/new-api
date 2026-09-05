package controller

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/service"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func requireSecureLoginCookies(t *testing.T, response *http.Response) *http.Cookie {
	t.Helper()
	cookies := response.Cookies()
	require.Len(t, cookies, 2)
	byName := make(map[string]*http.Cookie, len(cookies))
	for _, cookie := range cookies {
		byName[cookie.Name] = cookie
		assert.Empty(t, cookie.Domain)
		assert.True(t, cookie.Secure)
		assert.Equal(t, http.SameSiteStrictMode, cookie.SameSite)
	}
	refresh := byName[service.RefreshCookieName]
	hint := byName[service.SessionHintCookieName]
	require.NotNil(t, refresh)
	require.NotNil(t, hint)
	assert.NotEmpty(t, refresh.Value)
	assert.True(t, refresh.HttpOnly)
	assert.Equal(t, "/api/user/auth", refresh.Path)
	assert.Positive(t, refresh.MaxAge)
	assert.Equal(t, service.SessionHintCookieValue, hint.Value)
	assert.False(t, hint.HttpOnly)
	assert.Equal(t, "/", hint.Path)
	assert.Equal(t, refresh.Expires, hint.Expires)
	assert.Equal(t, refresh.MaxAge, hint.MaxAge)
	return refresh
}
