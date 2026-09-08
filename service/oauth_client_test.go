package service

import (
	"encoding/base64"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func oauthClientTestBase64URL(fill byte) string {
	return base64.RawURLEncoding.EncodeToString([]byte(strings.Repeat(string([]byte{fill}), 32)))
}

func oauthClientErrorCode(t *testing.T, err error) string {
	t.Helper()
	var oauthErr *OAuthClientError
	require.ErrorAs(t, err, &oauthErr)
	return oauthErr.Code
}

func validOAuthAuthorizeRequest() OAuthAuthorizeRequest {
	return OAuthAuthorizeRequest{
		ResponseType:        "code",
		ClientID:            OAuthClientID,
		RedirectURI:         "http://127.0.0.1:49182/oauth/callback",
		State:               oauthClientTestBase64URL(1),
		CodeChallenge:       oauthClientTestBase64URL(2),
		CodeChallengeMethod: "S256",
		Scope:               "sessions profile offline_access",
	}
}

func TestValidateOAuthAuthorizeRequestCanonicalizesAllowedScopes(t *testing.T) {
	validated, err := ValidateOAuthAuthorizeRequest(validOAuthAuthorizeRequest())
	require.NoError(t, err)
	assert.Equal(t, "profile offline_access sessions", validated.Scope)

	withoutScope := validOAuthAuthorizeRequest()
	withoutScope.Scope = ""
	validated, err = ValidateOAuthAuthorizeRequest(withoutScope)
	require.NoError(t, err)
	assert.Equal(t, "profile", validated.Scope)
}

func TestValidateOAuthAuthorizeRequestRejectsInvalidProtocolFields(t *testing.T) {
	tests := []struct {
		name     string
		mutate   func(*OAuthAuthorizeRequest)
		wantCode string
	}{
		{name: "response type", mutate: func(r *OAuthAuthorizeRequest) { r.ResponseType = "token" }, wantCode: "unsupported_response_type"},
		{name: "client", mutate: func(r *OAuthAuthorizeRequest) { r.ClientID = "unknown" }, wantCode: "invalid_client"},
		{name: "state", mutate: func(r *OAuthAuthorizeRequest) { r.State = "short" }, wantCode: "invalid_request"},
		{name: "challenge", mutate: func(r *OAuthAuthorizeRequest) { r.CodeChallenge = "short" }, wantCode: "invalid_request"},
		{name: "challenge method", mutate: func(r *OAuthAuthorizeRequest) { r.CodeChallengeMethod = "plain" }, wantCode: "invalid_request"},
		{name: "unknown scope", mutate: func(r *OAuthAuthorizeRequest) { r.Scope = "profile api" }, wantCode: "invalid_scope"},
		{name: "duplicate scope", mutate: func(r *OAuthAuthorizeRequest) { r.Scope = "profile profile" }, wantCode: "invalid_scope"},
		{name: "non space separator", mutate: func(r *OAuthAuthorizeRequest) { r.Scope = "profile\toffline_access" }, wantCode: "invalid_scope"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := validOAuthAuthorizeRequest()
			test.mutate(&request)
			_, err := ValidateOAuthAuthorizeRequest(request)
			assert.Equal(t, test.wantCode, oauthClientErrorCode(t, err))
		})
	}
}

func TestValidateOAuthAuthorizeRequestRejectsNonCanonicalLoopbackRedirects(t *testing.T) {
	redirects := []string{
		"http://127.0.0.1:0/oauth/callback",
		"http://127.0.0.1:049182/oauth/callback",
		"http://127.0.0.1/oauth/callback",
		"http://localhost:49182/oauth/callback",
		"http://[::1]:49182/oauth/callback",
		"http://0.0.0.0:49182/oauth/callback",
		"http://127.0.0.1:49182/other",
		"http://127.0.0.1:49182/oauth/callback/",
		"http://127.0.0.1:49182/oauth/callback?next=x",
		"http://127.0.0.1:49182/oauth/callback#fragment",
		"http://127.0.0.1.attacker.example:49182/oauth/callback",
		"http://127.0.0.1@attacker.example:49182/oauth/callback",
		"HTTP://127.0.0.1:49182/oauth/callback",
		"http://127.0.0.1:49182/oauth%2Fcallback",
	}
	for _, redirectURI := range redirects {
		t.Run(redirectURI, func(t *testing.T) {
			request := validOAuthAuthorizeRequest()
			request.RedirectURI = redirectURI
			_, err := ValidateOAuthAuthorizeRequest(request)
			assert.Equal(t, "invalid_request", oauthClientErrorCode(t, err))
		})
	}
}

func TestVerifyOAuthPKCEUsesRFC7636S256Vector(t *testing.T) {
	const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
	const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
	require.NoError(t, VerifyOAuthPKCE(verifier, challenge))
	assert.Equal(t, "invalid_grant", oauthClientErrorCode(t, VerifyOAuthPKCE(verifier+"x", challenge)))
	assert.Equal(t, "invalid_grant", oauthClientErrorCode(t, VerifyOAuthPKCE("short", challenge)))
}

func TestValidateOAuthDeviceMetadataEnforcesDisplayOnlyBounds(t *testing.T) {
	valid, err := ValidateOAuthDeviceMetadata(OAuthDeviceMetadata{
		DeviceID:      "550e8400-e29b-41d4-a716-446655440000",
		DeviceName:    "我的 MacBook",
		Platform:      "macos",
		ClientVersion: "1.0.0",
	})
	require.NoError(t, err)
	assert.Equal(t, "我的 MacBook", valid.DeviceName)

	tests := []OAuthDeviceMetadata{
		{DeviceID: "not-a-uuid"},
		{DeviceName: strings.Repeat("界", 81)},
		{DeviceName: "device\nname"},
		{Platform: "ios"},
		{ClientVersion: strings.Repeat("v", 65)},
		{ClientVersion: "1.0\nsecret"},
	}
	for _, input := range tests {
		_, err := ValidateOAuthDeviceMetadata(input)
		assert.Equal(t, "invalid_request", oauthClientErrorCode(t, err))
	}
}

func TestOAuthAccessTokenIsPurposeIsolatedFromDashboardTokens(t *testing.T) {
	previousSecret := common.SessionSecret
	common.SessionSecret = "oauth-client-token-test-secret"
	t.Cleanup(func() { common.SessionSecret = previousSecret })
	identity := OAuthAccessIdentity{
		AuthIdentity: AuthIdentity{
			UserID:          7,
			SessionID:       "oauth-sid",
			UserAuthVersion: 2,
			SessionVersion:  3,
		},
		ClientID: OAuthClientID,
		Scopes:   []string{"profile", "offline_access"},
	}

	raw, expiresAt, err := IssueOAuthAccessToken(identity, time.Now().Add(time.Hour).Unix())
	require.NoError(t, err)
	assert.WithinDuration(t, time.Now().Add(time.Hour), time.Unix(expiresAt, 0), 5*time.Second)
	parsed, err := ParseOAuthAccessToken(raw)
	require.NoError(t, err)
	assert.Equal(t, identity, parsed)

	_, err = ParseAccessToken(raw)
	assert.ErrorIs(t, err, ErrAuthTokenInvalid)
	_, internal, err := ParseDashboardAccessToken(raw)
	assert.True(t, internal, "a recognized OAuth JWT must not fall through to PAT authentication")
	assert.ErrorIs(t, err, ErrAuthTokenInvalid)
}

func TestOAuthAccessTokenWithWrongAudienceStillCannotFallThroughToPAT(t *testing.T) {
	previousSecret := common.SessionSecret
	common.SessionSecret = "oauth-client-wrong-audience-test-secret"
	t.Cleanup(func() { common.SessionSecret = previousSecret })
	now := time.Now()
	raw, err := jwt.NewWithClaims(jwt.SigningMethodHS256, authClaims{
		TokenUse:        oauthAccessTokenUse,
		SessionID:       "oauth-wrong-audience",
		UserAuthVersion: 1,
		SessionVersion:  1,
		ClientID:        OAuthClientID,
		Scopes:          []string{"profile"},
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    authTokenIssuer,
			Subject:   "7",
			Audience:  jwt.ClaimStrings{"wrong-audience"},
			ExpiresAt: jwt.NewNumericDate(now.Add(time.Hour)),
			NotBefore: jwt.NewNumericDate(now.Add(-time.Second)),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        "wrong-audience-token",
		},
	}).SignedString(authSigningKey(oauthAccessTokenUse))
	require.NoError(t, err)

	_, internal, err := ParseDashboardAccessToken(raw)
	assert.True(t, internal)
	assert.ErrorIs(t, err, ErrAuthTokenInvalid)
}

func TestOAuthAccessTokenRevocationParserOnlyRelaxesExpiry(t *testing.T) {
	previousSecret := common.SessionSecret
	common.SessionSecret = "oauth-client-expired-revocation-test-secret"
	t.Cleanup(func() { common.SessionSecret = previousSecret })
	now := time.Now()
	claims := authClaims{
		TokenUse:        oauthAccessTokenUse,
		SessionID:       "oauth-expired-revocation",
		UserAuthVersion: 2,
		SessionVersion:  3,
		ClientID:        OAuthClientID,
		Scopes:          []string{"profile", "offline_access"},
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    authTokenIssuer,
			Subject:   "7",
			Audience:  jwt.ClaimStrings{OAuthClientID},
			ExpiresAt: jwt.NewNumericDate(now.Add(-time.Minute)),
			NotBefore: jwt.NewNumericDate(now.Add(-2 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now.Add(-2 * time.Hour)),
			ID:        "expired-revocation-token",
		},
	}
	raw, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(authSigningKey(oauthAccessTokenUse))
	require.NoError(t, err)

	_, err = ParseOAuthAccessToken(raw)
	assert.ErrorIs(t, err, ErrAuthTokenExpired)
	identity, err := ParseOAuthAccessTokenForRevocation(raw)
	require.NoError(t, err)
	assert.Equal(t, 7, identity.UserID)
	assert.Equal(t, claims.SessionID, identity.SessionID)
	assert.Equal(t, claims.Scopes, identity.Scopes)

	claims.Audience = jwt.ClaimStrings{"wrong-audience"}
	wrongAudience, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(authSigningKey(oauthAccessTokenUse))
	require.NoError(t, err)
	_, err = ParseOAuthAccessTokenForRevocation(wrongAudience)
	assert.ErrorIs(t, err, ErrAuthTokenInvalid)

	claims.Audience = jwt.ClaimStrings{OAuthClientID}
	claims.NotBefore = jwt.NewNumericDate(now.Add(time.Hour))
	notYetValid, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(authSigningKey(oauthAccessTokenUse))
	require.NoError(t, err)
	_, err = ParseOAuthAccessTokenForRevocation(notYetValid)
	assert.ErrorIs(t, err, ErrAuthTokenInvalid)

	claims.NotBefore = jwt.NewNumericDate(now.Add(-2 * time.Hour))
	claims.TokenUse = accessTokenUse
	wrongUse, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(authSigningKey(oauthAccessTokenUse))
	require.NoError(t, err)
	_, err = ParseOAuthAccessTokenForRevocation(wrongUse)
	assert.ErrorIs(t, err, ErrAuthTokenInvalid)

	claims.TokenUse = oauthAccessTokenUse
	wrongSignature, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte("wrong-signing-key"))
	require.NoError(t, err)
	_, err = ParseOAuthAccessTokenForRevocation(wrongSignature)
	assert.ErrorIs(t, err, ErrAuthTokenInvalid)
}

func TestIssueOAuthAccessTokenNeverAddsAnImplicitScope(t *testing.T) {
	identity := OAuthAccessIdentity{
		AuthIdentity: AuthIdentity{
			UserID:          7,
			SessionID:       "oauth-no-scope",
			UserAuthVersion: 1,
			SessionVersion:  1,
		},
		ClientID: OAuthClientID,
	}
	_, _, err := IssueOAuthAccessToken(identity, time.Now().Add(time.Hour).Unix())
	assert.ErrorIs(t, err, ErrAuthTokenInvalid)
}

func TestOAuthAuthorizationRequestApprovalCreatesSeparateCodeFlow(t *testing.T) {
	user := setupAuthSessionTestDB(t)
	requestToken, browserURL, err := BeginOAuthAuthorization(validOAuthAuthorizeRequest())
	require.NoError(t, err)
	require.NotEmpty(t, requestToken)
	assert.Equal(t, "/oauth/authorize?request="+url.QueryEscape(requestToken), browserURL)

	view, err := InspectOAuthAuthorization(requestToken)
	require.NoError(t, err)
	assert.Equal(t, OAuthClientID, view.ClientID)
	assert.Equal(t, OAuthClientName, view.ClientName)
	assert.Equal(t, []string{"profile", "offline_access", "sessions"}, view.Scopes)
	assert.NotEmpty(t, view.ExpiresAt)

	browser := AuthIdentity{
		UserID:          user.Id,
		SessionID:       "browser-session",
		UserAuthVersion: user.AuthVersion,
		SessionVersion:  1,
		LoginMethod:     "password",
	}
	callbackURL, err := DecideOAuthAuthorization(requestToken, "approve", browser)
	require.NoError(t, err)
	parsedCallback, err := url.Parse(callbackURL)
	require.NoError(t, err)
	assert.Equal(t, "127.0.0.1:49182", parsedCallback.Host)
	assert.Equal(t, oauthLoopbackPath, parsedCallback.Path)
	assert.Equal(t, validOAuthAuthorizeRequest().State, parsedCallback.Query().Get("state"))
	code := parsedCallback.Query().Get("code")
	require.NotEmpty(t, code)
	assert.NotEqual(t, requestToken, code)

	flow, err := model.GetAuthFlow(code, model.AuthFlowMatch{
		Purpose:   model.AuthFlowPurposeOAuthClientCode,
		Provider:  OAuthClientID,
		Intent:    "exchange",
		UserId:    user.Id,
		SessionId: browser.SessionID,
	})
	require.NoError(t, err)
	assert.Equal(t, user.Id, flow.UserId)
	_, err = model.GetAuthFlow(requestToken, model.AuthFlowMatch{Purpose: model.AuthFlowPurposeOAuthClientRequest})
	assert.ErrorIs(t, err, model.ErrAuthFlowConsumed)

	_, err = DecideOAuthAuthorization(requestToken, "approve", browser)
	assert.Equal(t, "invalid_request", oauthClientErrorCode(t, err))
}

func TestOAuthAuthorizationDenialConsumesRequestWithoutCreatingCode(t *testing.T) {
	user := setupAuthSessionTestDB(t)
	requestToken, _, err := BeginOAuthAuthorization(validOAuthAuthorizeRequest())
	require.NoError(t, err)
	browser := AuthIdentity{
		UserID:          user.Id,
		SessionID:       "browser-session",
		UserAuthVersion: user.AuthVersion,
		SessionVersion:  1,
		LoginMethod:     "password",
	}

	callbackURL, err := DecideOAuthAuthorization(requestToken, "deny", browser)
	require.NoError(t, err)
	parsedCallback, err := url.Parse(callbackURL)
	require.NoError(t, err)
	assert.Equal(t, "access_denied", parsedCallback.Query().Get("error"))
	assert.Equal(t, validOAuthAuthorizeRequest().State, parsedCallback.Query().Get("state"))
	assert.Empty(t, parsedCallback.Query().Get("code"))

	var codeCount int64
	require.NoError(t, model.DB.Model(&model.AuthFlow{}).
		Where("purpose = ?", model.AuthFlowPurposeOAuthClientCode).
		Count(&codeCount).Error)
	assert.Zero(t, codeCount)
}

func TestOAuthAuthorizationRejectsNonBrowserIdentityBeforeConsumption(t *testing.T) {
	setupAuthSessionTestDB(t)
	requestToken, _, err := BeginOAuthAuthorization(validOAuthAuthorizeRequest())
	require.NoError(t, err)

	_, err = DecideOAuthAuthorization(requestToken, "approve", AuthIdentity{
		UserID:          1,
		SessionID:       "oauth-session",
		UserAuthVersion: 1,
		SessionVersion:  1,
		LoginMethod:     model.UserSessionLoginMethodOAuthClient,
	})
	assert.Equal(t, "access_denied", oauthClientErrorCode(t, err))
	_, err = InspectOAuthAuthorization(requestToken)
	require.NoError(t, err)
}

func approvedOAuthClientCode(t *testing.T, user *model.User, scope string) (string, OAuthAuthorizeRequest) {
	t.Helper()
	request := validOAuthAuthorizeRequest()
	request.CodeChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
	request.Scope = scope
	requestToken, _, err := BeginOAuthAuthorization(request)
	require.NoError(t, err)
	callbackURL, err := DecideOAuthAuthorization(requestToken, "approve", AuthIdentity{
		UserID:          user.Id,
		SessionID:       "browser-session",
		UserAuthVersion: user.AuthVersion,
		SessionVersion:  1,
		LoginMethod:     "password",
	})
	require.NoError(t, err)
	parsed, err := url.Parse(callbackURL)
	require.NoError(t, err)
	code := parsed.Query().Get("code")
	require.NotEmpty(t, code)
	return code, request
}

func TestOAuthAuthorizationCodeExchangeCreatesIsolatedSession(t *testing.T) {
	useTestSessionSecret(t)
	user := setupAuthSessionTestDB(t)
	require.NoError(t, model.DB.AutoMigrate(&model.OAuthClientSession{}))
	code, request := approvedOAuthClientCode(t, user, "profile offline_access sessions")

	bundle, err := ExchangeOAuthAuthorizationCode(OAuthCodeExchangeRequest{
		ClientID:     OAuthClientID,
		Code:         code,
		RedirectURI:  request.RedirectURI,
		CodeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
		Device: OAuthDeviceMetadata{
			DeviceID:      "550e8400-e29b-41d4-a716-446655440000",
			DeviceName:    "我的 MacBook",
			Platform:      "macos",
			ClientVersion: "1.0.0",
		},
	}, "127.0.0.1", "oauth-client-test")
	require.NoError(t, err)
	assert.NotEmpty(t, bundle.AccessToken)
	assert.NotEmpty(t, bundle.RefreshToken)
	assert.Equal(t, "profile offline_access sessions", bundle.Scope)
	assert.NotEmpty(t, bundle.SessionID)

	identity, err := ParseOAuthAccessToken(bundle.AccessToken)
	require.NoError(t, err)
	assert.Equal(t, bundle.SessionID, identity.SessionID)
	assert.Equal(t, user.Id, identity.UserID)
	assert.Equal(t, []string{"profile", "offline_access", "sessions"}, identity.Scopes)
	stored, err := model.GetUserSessionBySID(bundle.SessionID)
	require.NoError(t, err)
	assert.Equal(t, model.UserSessionLoginMethodOAuthClient, stored.LoginMethod)
	extension, err := model.GetOAuthClientSession(bundle.SessionID)
	require.NoError(t, err)
	assert.Equal(t, OAuthClientID, extension.ClientID)
	assert.Equal(t, "我的 MacBook", extension.DeviceName)

	_, err = ExchangeOAuthAuthorizationCode(OAuthCodeExchangeRequest{
		ClientID:     OAuthClientID,
		Code:         code,
		RedirectURI:  request.RedirectURI,
		CodeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
	}, "127.0.0.1", "oauth-client-test")
	assert.Equal(t, "invalid_grant", oauthClientErrorCode(t, err))
}

func TestOAuthAuthorizationCodeExchangeDoesNotConsumeCodeOnWrongVerifier(t *testing.T) {
	useTestSessionSecret(t)
	user := setupAuthSessionTestDB(t)
	require.NoError(t, model.DB.AutoMigrate(&model.OAuthClientSession{}))
	code, request := approvedOAuthClientCode(t, user, "profile")

	_, err := ExchangeOAuthAuthorizationCode(OAuthCodeExchangeRequest{
		ClientID:     OAuthClientID,
		Code:         code,
		RedirectURI:  request.RedirectURI,
		CodeVerifier: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	}, "127.0.0.1", "oauth-client-test")
	assert.Equal(t, "invalid_grant", oauthClientErrorCode(t, err))

	bundle, err := ExchangeOAuthAuthorizationCode(OAuthCodeExchangeRequest{
		ClientID:     OAuthClientID,
		Code:         code,
		RedirectURI:  request.RedirectURI,
		CodeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
	}, "127.0.0.1", "oauth-client-test")
	require.NoError(t, err)
	assert.Empty(t, bundle.RefreshToken)
	assert.LessOrEqual(t, bundle.SessionExpiresAt-bundle.AccessExpiresAt, int64(1))
}

func TestOAuthAuthorizationCodeExchangeHasOneConcurrentWinner(t *testing.T) {
	useTestSessionSecret(t)
	user := setupAuthSessionTestDB(t)
	require.NoError(t, model.DB.AutoMigrate(&model.OAuthClientSession{}))
	code, request := approvedOAuthClientCode(t, user, "profile offline_access")
	input := OAuthCodeExchangeRequest{
		ClientID:     OAuthClientID,
		Code:         code,
		RedirectURI:  request.RedirectURI,
		CodeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
	}

	results := make(chan error, 2)
	var group sync.WaitGroup
	for range 2 {
		group.Add(1)
		go func() {
			defer group.Done()
			_, err := ExchangeOAuthAuthorizationCode(input, "127.0.0.1", "oauth-concurrent-test")
			results <- err
		}()
	}
	group.Wait()
	close(results)

	successes := 0
	invalidGrants := 0
	for err := range results {
		if err == nil {
			successes++
			continue
		}
		if oauthClientErrorCode(t, err) == "invalid_grant" {
			invalidGrants++
		}
	}
	assert.Equal(t, 1, successes)
	assert.Equal(t, 1, invalidGrants)
}

func TestOAuthAuthorizationCodeExchangeLocksUserBeforeReadingBudgets(t *testing.T) {
	for _, dialect := range []common.DatabaseType{common.DatabaseTypeMySQL, common.DatabaseTypePostgreSQL} {
		t.Run(string(dialect), func(t *testing.T) {
			user := setupAuthSessionTestDB(t)
			code, request := approvedOAuthClientCode(t, user, "profile offline_access")
			previousType := common.MainDatabaseType()
			common.SetMainDatabaseType(dialect)
			t.Cleanup(func() { common.SetMainDatabaseType(previousType) })

			// SQLite executes the real exchange below. Observe the locking clause
			// separately because its driver strips FOR UPDATE from emitted SQL.
			userLocked := false
			budgetReads := 0
			const callback = "test:oauth_issuance_lock_order"
			require.NoError(t, model.DB.Callback().Query().Before("gorm:query").Register(callback, func(tx *gorm.DB) {
				if tx.Statement.Table == "users" {
					locking, ok := tx.Statement.Clauses["FOR"].Expression.(clause.Locking)
					userLocked = ok && locking.Strength == "UPDATE"
				}
				if tx.Statement.Table == "oauth_client_sessions" {
					budgetReads++
					assert.True(t, userLocked, "both budgets must be read after taking the shared user row lock")
				}
			}))
			t.Cleanup(func() { _ = model.DB.Callback().Query().Remove(callback) })

			_, err := ExchangeOAuthAuthorizationCode(OAuthCodeExchangeRequest{
				ClientID: OAuthClientID, Code: code, RedirectURI: request.RedirectURI,
				CodeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
			}, "127.0.0.1", "oauth-budget-test")
			require.NoError(t, err)
			assert.Equal(t, 2, budgetReads)
		})
	}
}

func TestOAuthAuthorizationCodeExchangeDifferentCodesRespectBudgets(t *testing.T) {
	for _, budget := range []string{"active", "issuance"} {
		t.Run(budget, func(t *testing.T) {
			user := setupAuthSessionTestDB(t)
			web, err := CreateLoginSession(user.Id, "password", "127.0.0.1", "browser")
			require.NoError(t, err)
			if budget == "active" {
				common.UserSessionActiveLimit = 1
			} else {
				common.UserSessionIssuanceLimit = 1
			}
			inputs := make([]OAuthCodeExchangeRequest, 2)
			for i := range inputs {
				code, request := approvedOAuthClientCode(t, user, "profile offline_access")
				inputs[i] = OAuthCodeExchangeRequest{
					ClientID: OAuthClientID, Code: code, RedirectURI: request.RedirectURI,
					CodeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
				}
			}
			start := make(chan struct{})
			results := make(chan error, len(inputs))
			for _, input := range inputs {
				go func() {
					<-start
					_, exchangeErr := ExchangeOAuthAuthorizationCode(input, "127.0.0.1", "oauth-budget-test")
					results <- exchangeErr
				}()
			}
			close(start)
			successes := 0
			for range inputs {
				if exchangeErr := <-results; exchangeErr == nil {
					successes++
				} else if budget == "active" {
					assert.ErrorIs(t, exchangeErr, model.ErrUserSessionLimit)
				} else {
					assert.ErrorIs(t, exchangeErr, model.ErrUserSessionIssuanceLimit)
				}
			}
			assert.Equal(t, 1, successes)
			count, err := model.CountActiveOAuthClientSessions(user.Id, OAuthClientID, time.Now().Unix())
			require.NoError(t, err)
			assert.EqualValues(t, 1, count)
			_, err = model.GetUserSessionCached(web.Session.SID)
			require.NoError(t, err)
		})
	}
}

func TestOAuthRefreshRotatesStrictlyWithoutChangingSID(t *testing.T) {
	useTestSessionSecret(t)
	user := setupAuthSessionTestDB(t)
	require.NoError(t, model.DB.AutoMigrate(&model.OAuthClientSession{}))
	code, request := approvedOAuthClientCode(t, user, "profile offline_access")
	bundle, err := ExchangeOAuthAuthorizationCode(OAuthCodeExchangeRequest{
		ClientID:     OAuthClientID,
		Code:         code,
		RedirectURI:  request.RedirectURI,
		CodeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
	}, "127.0.0.1", "oauth-client-test")
	require.NoError(t, err)

	refreshed, err := RefreshOAuthClientSession(OAuthRefreshRequest{
		ClientID:     OAuthClientID,
		RefreshToken: bundle.RefreshToken,
	}, "127.0.0.2", "oauth-client-refresh-test")
	require.NoError(t, err)
	assert.Equal(t, bundle.SessionID, refreshed.SessionID)
	assert.NotEqual(t, bundle.AccessToken, refreshed.AccessToken)
	assert.NotEqual(t, bundle.RefreshToken, refreshed.RefreshToken)
	assert.Equal(t, bundle.SessionExpiresAt, refreshed.SessionExpiresAt)

	_, err = RefreshOAuthClientSession(OAuthRefreshRequest{
		ClientID:     OAuthClientID,
		RefreshToken: bundle.RefreshToken,
	}, "127.0.0.2", "oauth-client-refresh-test")
	assert.Equal(t, "invalid_grant", oauthClientErrorCode(t, err))
	_, err = model.GetUserSessionCached(bundle.SessionID)
	assert.ErrorIs(t, err, model.ErrUserSessionInactive)
}

func TestOAuthRefreshRejectsWebTokenAndWebRefreshRejectsOAuthToken(t *testing.T) {
	useTestSessionSecret(t)
	user := setupAuthSessionTestDB(t)
	require.NoError(t, model.DB.AutoMigrate(&model.OAuthClientSession{}))
	webBundle, err := CreateLoginSession(user.Id, "password", "127.0.0.1", "browser")
	require.NoError(t, err)
	_, err = CreateLoginSession(user.Id, model.UserSessionLoginMethodOAuthClient, "127.0.0.1", "wrong-issuer")
	assert.ErrorIs(t, err, ErrLoginSessionMethod)

	_, err = RefreshOAuthClientSession(OAuthRefreshRequest{
		ClientID:     OAuthClientID,
		RefreshToken: webBundle.RefreshToken,
	}, "127.0.0.1", "oauth-client-test")
	assert.Equal(t, "invalid_grant", oauthClientErrorCode(t, err))

	code, request := approvedOAuthClientCode(t, user, "profile offline_access")
	oauthBundle, err := ExchangeOAuthAuthorizationCode(OAuthCodeExchangeRequest{
		ClientID:     OAuthClientID,
		Code:         code,
		RedirectURI:  request.RedirectURI,
		CodeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
	}, "127.0.0.1", "oauth-client-test")
	require.NoError(t, err)

	_, _, err = RefreshLoginSession(oauthBundle.RefreshToken, oauthBundle.SessionID, "127.0.0.1", "browser")
	assert.ErrorIs(t, err, ErrLoginSessionMethod)
	err = RevokeByRefreshToken(oauthBundle.RefreshToken, oauthBundle.SessionID, "browser_logout")
	assert.ErrorIs(t, err, ErrLoginSessionMethod)
	_, err = model.GetUserSessionCached(oauthBundle.SessionID)
	require.NoError(t, err)
	webSession, err := model.GetUserSessionCached(webBundle.Session.SID)
	require.NoError(t, err)
	assert.Equal(t, model.UserSessionStatusActive, webSession.Status)
}

func issueOAuthClientBundle(t *testing.T, user *model.User, scope, deviceName string) *OAuthTokenBundle {
	t.Helper()
	code, request := approvedOAuthClientCode(t, user, scope)
	bundle, err := ExchangeOAuthAuthorizationCode(OAuthCodeExchangeRequest{
		ClientID:     OAuthClientID,
		Code:         code,
		RedirectURI:  request.RedirectURI,
		CodeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
		Device: OAuthDeviceMetadata{
			DeviceName: deviceName,
			Platform:   "macos",
		},
	}, "127.0.0.1", "oauth-client-test")
	require.NoError(t, err)
	return bundle
}

func TestAuthenticateOAuthClientAccessTokenEnforcesSessionAndScope(t *testing.T) {
	useTestSessionSecret(t)
	user := setupAuthSessionTestDB(t)
	require.NoError(t, model.DB.AutoMigrate(&model.OAuthClientSession{}))
	bundle := issueOAuthClientBundle(t, user, "profile offline_access", "Profile Mac")
	staleActivity := time.Now().Add(-time.Hour).Unix()
	require.NoError(t, model.DB.Model(&model.UserSession{}).
		Where("sid = ?", bundle.SessionID).
		Update("last_active_at", staleActivity).Error)

	identity, authenticatedUser, err := AuthenticateOAuthClientAccessToken(bundle.AccessToken, "profile")
	require.NoError(t, err)
	assert.Equal(t, bundle.SessionID, identity.SessionID)
	assert.Equal(t, user.Id, authenticatedUser.Id)
	activeSession, err := model.GetUserSessionBySID(bundle.SessionID)
	require.NoError(t, err)
	assert.Greater(t, activeSession.LastActiveAt, staleActivity)

	_, _, err = AuthenticateOAuthClientAccessToken(bundle.AccessToken, "sessions")
	assert.Equal(t, "insufficient_scope", oauthClientErrorCode(t, err))
	revoked, err := model.RevokeUserSession(user.Id, bundle.SessionID, "test_revoke")
	require.NoError(t, err)
	require.True(t, revoked)
	_, _, err = AuthenticateOAuthClientAccessToken(bundle.AccessToken, "profile")
	assert.Equal(t, "invalid_token", oauthClientErrorCode(t, err))
}

func TestListAndRevokeAuthorizedOAuthDevicesStayInsideClient(t *testing.T) {
	useTestSessionSecret(t)
	user := setupAuthSessionTestDB(t)
	require.NoError(t, model.DB.AutoMigrate(&model.OAuthClientSession{}))
	current := issueOAuthClientBundle(t, user, "profile offline_access sessions", "Current Mac")
	other := issueOAuthClientBundle(t, user, "profile offline_access sessions", "Other Mac")
	identity, _, err := AuthenticateOAuthClientAccessToken(current.AccessToken, "sessions")
	require.NoError(t, err)

	devices, nextCursor, err := ListAuthorizedOAuthDevices(identity, 20, "")
	require.NoError(t, err)
	require.Len(t, devices, 2)
	assert.Empty(t, nextCursor)
	currentCount := 0
	for _, device := range devices {
		if device.Current {
			currentCount++
			assert.Equal(t, current.SessionID, device.ID)
		}
	}
	assert.Equal(t, 1, currentCount)
	firstPage, cursor, err := ListAuthorizedOAuthDevices(identity, 1, "")
	require.NoError(t, err)
	require.Len(t, firstPage, 1)
	require.NotEmpty(t, cursor)
	secondPage, finalCursor, err := ListAuthorizedOAuthDevices(identity, 1, cursor)
	require.NoError(t, err)
	require.Len(t, secondPage, 1)
	assert.Empty(t, finalCursor)
	assert.NotEqual(t, firstPage[0].ID, secondPage[0].ID)

	revoked, err := RevokeAuthorizedOAuthDevice(identity, other.SessionID)
	require.NoError(t, err)
	assert.True(t, revoked)
	revoked, err = RevokeAuthorizedOAuthDevice(identity, other.SessionID)
	require.NoError(t, err)
	assert.False(t, revoked)
	_, err = RevokeAuthorizedOAuthDevice(identity, "unknown-session")
	assert.ErrorIs(t, err, model.ErrUserSessionInvalid)

	_, _, err = AuthenticateOAuthClientAccessToken(current.AccessToken, "sessions")
	require.NoError(t, err)
	_, _, err = AuthenticateOAuthClientAccessToken(other.AccessToken, "sessions")
	assert.Equal(t, "invalid_token", oauthClientErrorCode(t, err))
}

func TestRevokeOAuthClientTokenRevokesOnlyItsOAuthSID(t *testing.T) {
	useTestSessionSecret(t)
	user := setupAuthSessionTestDB(t)
	require.NoError(t, model.DB.AutoMigrate(&model.OAuthClientSession{}))
	web, err := CreateLoginSession(user.Id, "password", "127.0.0.1", "browser")
	require.NoError(t, err)
	oauth := issueOAuthClientBundle(t, user, "profile offline_access sessions", "OAuth Mac")

	require.NoError(t, RevokeOAuthClientToken(OAuthClientID, oauth.AccessToken))
	_, _, err = AuthenticateOAuthClientAccessToken(oauth.AccessToken, "profile")
	assert.Equal(t, "invalid_token", oauthClientErrorCode(t, err))
	_, err = model.GetUserSessionCached(web.Session.SID)
	require.NoError(t, err)

	require.NoError(t, RevokeOAuthClientToken(OAuthClientID, oauth.RefreshToken))
	require.NoError(t, RevokeOAuthClientToken(OAuthClientID, "unknown-token"))
}

func TestAccountDisableInvalidatesWebAndOAuthCredentials(t *testing.T) {
	useTestSessionSecret(t)
	user := setupAuthSessionTestDB(t)
	require.NoError(t, model.DB.AutoMigrate(&model.OAuthClientSession{}))
	web, err := CreateLoginSession(user.Id, "password", "127.0.0.1", "browser")
	require.NoError(t, err)
	oauth := issueOAuthClientBundle(t, user, "profile offline_access", "OAuth Mac")
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", user.Id).Update("status", common.UserStatusDisabled).Error)

	_, _, err = AuthenticateOAuthClientAccessToken(oauth.AccessToken, "profile")
	assert.Equal(t, "account_disabled", oauthClientErrorCode(t, err))
	_, err = RefreshOAuthClientSession(OAuthRefreshRequest{ClientID: OAuthClientID, RefreshToken: oauth.RefreshToken}, "127.0.0.1", "oauth-client-test")
	assert.Equal(t, "invalid_grant", oauthClientErrorCode(t, err))

	webIdentity, err := ParseAccessToken(web.AccessToken)
	require.NoError(t, err)
	_, _, err = ValidateLoginSession(webIdentity)
	assert.ErrorIs(t, err, ErrLoginSessionRevoked)
}
