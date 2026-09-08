package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func setupOAuthClientSessionTest(t *testing.T) {
	t.Helper()
	truncateTables(t)
	require.NoError(t, DB.AutoMigrate(&OAuthClientSession{}))
	require.NoError(t, DB.Exec("DELETE FROM oauth_client_sessions").Error)
}

func TestOAuthClientSessionUsesSeparateExtensionTable(t *testing.T) {
	setupOAuthClientSessionTest(t)

	require.True(t, DB.Migrator().HasTable(&OAuthClientSession{}))
	assert.False(t, DB.Migrator().HasColumn(&UserSession{}, "client_id"))
	assert.False(t, DB.Migrator().HasColumn(&UserSession{}, "scopes"))
}

func TestOAuthClientSessionQueriesStayInsideUserAndClient(t *testing.T) {
	setupOAuthClientSessionTest(t)
	createUserSessionTestUser(t, 1201, 1)
	createUserSessionTestUser(t, 1202, 1)
	now := time.Now().Unix()

	active := newTestUserSession("oauth-current", 1201, now)
	active.LoginMethod = UserSessionLoginMethodOAuthClient
	web := newTestUserSession("web-current", 1201, now)
	revoked := newTestUserSession("oauth-revoked", 1201, now)
	revoked.LoginMethod = UserSessionLoginMethodOAuthClient
	revoked.Status = UserSessionStatusRevoked
	revoked.RevokedAt = now
	otherUser := newTestUserSession("oauth-other-user", 1202, now)
	otherUser.LoginMethod = UserSessionLoginMethodOAuthClient
	for _, session := range []*UserSession{active, web, revoked, otherUser} {
		require.NoError(t, DB.Create(session).Error)
	}

	rows := []*OAuthClientSession{
		{SessionID: active.SID, UserID: 1201, ClientID: "yeschoy-desktop", Scopes: "profile sessions", CreatedAt: now},
		{SessionID: revoked.SID, UserID: 1201, ClientID: "yeschoy-desktop", Scopes: "profile", CreatedAt: now - 1},
		{SessionID: otherUser.SID, UserID: 1202, ClientID: "yeschoy-desktop", Scopes: "profile", CreatedAt: now},
	}
	for _, row := range rows {
		require.NoError(t, DB.Create(row).Error)
	}

	sessions, err := ListOAuthClientSessions(1201, "yeschoy-desktop", "", 20, now)
	require.NoError(t, err)
	require.Len(t, sessions, 1)
	assert.Equal(t, active.SID, sessions[0].Session.SID)
	assert.Equal(t, "profile sessions", sessions[0].OAuth.Scopes)
}

func TestOAuthClientSessionDoesNotConsumeWebSessionBudget(t *testing.T) {
	setupOAuthClientSessionTest(t)
	createUserSessionTestUser(t, 1203, 1)
	now := time.Now().Unix()

	web := newTestUserSession("web-budget", 1203, now)
	oauth := newTestUserSession("oauth-budget", 1203, now)
	oauth.LoginMethod = UserSessionLoginMethodOAuthClient
	require.NoError(t, DB.Create(web).Error)
	require.NoError(t, DB.Create(oauth).Error)
	require.NoError(t, DB.Create(&OAuthClientSession{
		SessionID: oauth.SID,
		UserID:    1203,
		ClientID:  "yeschoy-desktop",
		Scopes:    "profile",
		CreatedAt: now,
	}).Error)

	webCount, err := CountActiveNonOAuthUserSessions(1203, now)
	require.NoError(t, err)
	assert.EqualValues(t, 1, webCount)
	oauthCount, err := CountActiveOAuthClientSessions(1203, "yeschoy-desktop", now)
	require.NoError(t, err)
	assert.EqualValues(t, 1, oauthCount)

	previousLimit := common.UserSessionActiveLimit
	common.UserSessionActiveLimit = 1
	t.Cleanup(func() { common.UserSessionActiveLimit = previousLimit })
	assert.EqualValues(t, common.UserSessionActiveLimit, webCount)
	assert.EqualValues(t, common.UserSessionActiveLimit, oauthCount)
}
