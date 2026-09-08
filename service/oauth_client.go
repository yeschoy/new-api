package service

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

const (
	OAuthClientID                = "yeschoy-desktop"
	OAuthClientName              = "野菜API Desktop"
	OAuthAccessTokenTTL          = time.Hour
	OAuthAuthorizationRequestTTL = 10 * time.Minute
	OAuthAuthorizationCodeTTL    = 5 * time.Minute
	oauthAccessTokenUse          = "oauth_access"
	oauthLoopbackPath            = "/oauth/callback"
	oauthScopeProfile            = "profile"
	oauthScopeOffline            = "offline_access"
	oauthScopeSessions           = "sessions"
)

var oauthScopes = []string{oauthScopeProfile, oauthScopeOffline, oauthScopeSessions}

type OAuthAuthorizeRequest struct {
	ResponseType        string `json:"response_type"`
	ClientID            string `json:"client_id"`
	RedirectURI         string `json:"redirect_uri"`
	State               string `json:"state"`
	CodeChallenge       string `json:"code_challenge"`
	CodeChallengeMethod string `json:"code_challenge_method"`
	Scope               string `json:"scope"`
}

type OAuthDeviceMetadata struct {
	DeviceID      string
	DeviceName    string
	Platform      string
	ClientVersion string
}

type OAuthCodeExchangeRequest struct {
	ClientID     string
	Code         string
	RedirectURI  string
	CodeVerifier string
	Device       OAuthDeviceMetadata
}

type OAuthRefreshRequest struct {
	ClientID     string
	RefreshToken string
}

type OAuthTokenBundle struct {
	AccessToken      string
	AccessExpiresAt  int64
	RefreshToken     string
	SessionExpiresAt int64
	Scope            string
	SessionID        string
}

type OAuthSessionView struct {
	ID           string  `json:"id"`
	ClientID     string  `json:"client_id"`
	DeviceName   *string `json:"device_name"`
	Platform     *string `json:"platform"`
	CreatedAt    string  `json:"created_at"`
	LastActiveAt string  `json:"last_active_at"`
	Current      bool    `json:"current"`
}

type OAuthAccessIdentity struct {
	AuthIdentity
	ClientID string
	Scopes   []string
}

type OAuthAuthorizationView struct {
	ClientID   string   `json:"client_id"`
	ClientName string   `json:"client_name"`
	Scopes     []string `json:"scopes"`
	ExpiresAt  string   `json:"expires_at"`
}

type oauthAuthorizationCodePayload struct {
	ClientID        string `json:"client_id"`
	RedirectURI     string `json:"redirect_uri"`
	CodeChallenge   string `json:"code_challenge"`
	Scope           string `json:"scope"`
	UserAuthVersion int64  `json:"user_auth_version"`
	AuthorizedAt    int64  `json:"authorized_at"`
}

// oauthRevocationClaims keeps every normal JWT validation except expiry.
// An expired, correctly signed access token may identify a Session to revoke,
// but this claims type must never be used for resource authorization.
type oauthRevocationClaims struct {
	authClaims
}

func (claims oauthRevocationClaims) GetExpirationTime() (*jwt.NumericDate, error) {
	if claims.ExpiresAt == nil {
		return nil, nil
	}
	return jwt.NewNumericDate(time.Now().Add(time.Minute)), nil
}

type OAuthClientError struct {
	HTTPStatus  int
	Code        string
	Description string
	Cause       error
}

func (err *OAuthClientError) Error() string {
	if err == nil {
		return ""
	}
	if err.Cause != nil {
		return fmt.Sprintf("%s: %v", err.Code, err.Cause)
	}
	return err.Code
}

func (err *OAuthClientError) Unwrap() error {
	if err == nil {
		return nil
	}
	return err.Cause
}

func NewOAuthClientError(status int, code, description string) error {
	return &OAuthClientError{HTTPStatus: status, Code: code, Description: description}
}

func oauthClientError(status int, code, description string, cause error) error {
	return &OAuthClientError{HTTPStatus: status, Code: code, Description: description, Cause: cause}
}

func ValidateOAuthAuthorizeRequest(input OAuthAuthorizeRequest) (OAuthAuthorizeRequest, error) {
	if input.ResponseType != "code" {
		return OAuthAuthorizeRequest{}, oauthClientError(http.StatusBadRequest, "unsupported_response_type", "Only the code response type is supported.", nil)
	}
	if input.ClientID != OAuthClientID {
		return OAuthAuthorizeRequest{}, oauthClientError(http.StatusBadRequest, "invalid_client", "The OAuth client is invalid.", nil)
	}
	if err := validateOAuthLoopbackRedirect(input.RedirectURI); err != nil {
		return OAuthAuthorizeRequest{}, oauthClientError(http.StatusBadRequest, "invalid_request", "The redirect URI is invalid.", err)
	}
	if !isCanonicalBase64URL32(input.State) {
		return OAuthAuthorizeRequest{}, oauthClientError(http.StatusBadRequest, "invalid_request", "The state parameter is invalid.", nil)
	}
	if input.CodeChallengeMethod != "S256" || !isCanonicalBase64URL32(input.CodeChallenge) {
		return OAuthAuthorizeRequest{}, oauthClientError(http.StatusBadRequest, "invalid_request", "A valid S256 code challenge is required.", nil)
	}
	canonicalScope, err := canonicalOAuthScope(input.Scope)
	if err != nil {
		return OAuthAuthorizeRequest{}, err
	}
	input.Scope = canonicalScope
	return input, nil
}

func BeginOAuthAuthorization(input OAuthAuthorizeRequest) (string, string, error) {
	validated, err := ValidateOAuthAuthorizeRequest(input)
	if err != nil {
		return "", "", err
	}
	payload, err := common.Marshal(validated)
	if err != nil {
		return "", "", oauthClientError(http.StatusInternalServerError, "server_error", "The authorization server could not process the request.", err)
	}
	requestToken, _, err := model.CreateAuthFlow(model.AuthFlowCreate{
		Purpose:   model.AuthFlowPurposeOAuthClientRequest,
		Provider:  OAuthClientID,
		Intent:    "authorize",
		Payload:   string(payload),
		ExpiresAt: time.Now().Add(OAuthAuthorizationRequestTTL),
	})
	if err != nil {
		return "", "", oauthClientError(http.StatusInternalServerError, "server_error", "The authorization server could not process the request.", err)
	}
	browserURL := &url.URL{Path: "/oauth/authorize"}
	query := browserURL.Query()
	query.Set("request", requestToken)
	browserURL.RawQuery = query.Encode()
	return requestToken, browserURL.String(), nil
}

func InspectOAuthAuthorization(requestToken string) (*OAuthAuthorizationView, error) {
	flow, err := model.GetAuthFlow(requestToken, model.AuthFlowMatch{
		Purpose:  model.AuthFlowPurposeOAuthClientRequest,
		Provider: OAuthClientID,
		Intent:   "authorize",
	})
	if err != nil {
		return nil, oauthAuthFlowError(err)
	}
	request, err := decodeOAuthAuthorizationRequest(flow.Payload)
	if err != nil {
		return nil, err
	}
	return &OAuthAuthorizationView{
		ClientID:   request.ClientID,
		ClientName: OAuthClientName,
		Scopes:     strings.Split(request.Scope, " "),
		ExpiresAt:  flow.ExpiresAt.UTC().Format(time.RFC3339),
	}, nil
}

func DecideOAuthAuthorization(requestToken, decision string, browser AuthIdentity) (string, error) {
	if decision != "approve" && decision != "deny" {
		return "", oauthClientError(http.StatusBadRequest, "invalid_request", "The authorization decision is invalid.", nil)
	}
	if browser.UserID <= 0 || browser.SessionID == "" || browser.UserAuthVersion <= 0 || browser.SessionVersion <= 0 || browser.LoginMethod == "" || browser.LoginMethod == DesktopLoginMethod || browser.LoginMethod == model.UserSessionLoginMethodOAuthClient {
		return "", oauthClientError(http.StatusForbidden, "access_denied", "A live browser session is required.", nil)
	}

	var request OAuthAuthorizeRequest
	var code string
	_, err := model.ConsumeAuthFlowWithAction(requestToken, model.AuthFlowMatch{
		Purpose:  model.AuthFlowPurposeOAuthClientRequest,
		Provider: OAuthClientID,
		Intent:   "authorize",
	}, func(tx *gorm.DB, flow *model.AuthFlow) error {
		decoded, decodeErr := decodeOAuthAuthorizationRequest(flow.Payload)
		if decodeErr != nil {
			return decodeErr
		}
		request = decoded
		if decision == "deny" {
			return nil
		}
		codePayload, marshalErr := common.Marshal(oauthAuthorizationCodePayload{
			ClientID:        decoded.ClientID,
			RedirectURI:     decoded.RedirectURI,
			CodeChallenge:   decoded.CodeChallenge,
			Scope:           decoded.Scope,
			UserAuthVersion: browser.UserAuthVersion,
			AuthorizedAt:    time.Now().Unix(),
		})
		if marshalErr != nil {
			return marshalErr
		}
		code, _, marshalErr = model.CreateAuthFlowWithTx(tx, model.AuthFlowCreate{
			Purpose:   model.AuthFlowPurposeOAuthClientCode,
			Provider:  OAuthClientID,
			Intent:    "exchange",
			UserId:    browser.UserID,
			SessionId: browser.SessionID,
			Payload:   string(codePayload),
			ExpiresAt: time.Now().Add(OAuthAuthorizationCodeTTL),
		})
		return marshalErr
	})
	if err != nil {
		return "", oauthAuthFlowError(err)
	}
	callback, err := url.Parse(request.RedirectURI)
	if err != nil {
		return "", oauthClientError(http.StatusInternalServerError, "server_error", "The authorization server could not process the request.", err)
	}
	query := callback.Query()
	query.Set("state", request.State)
	if decision == "approve" {
		query.Set("code", code)
	} else {
		query.Set("error", "access_denied")
	}
	callback.RawQuery = query.Encode()
	return callback.String(), nil
}

func ExchangeOAuthAuthorizationCode(input OAuthCodeExchangeRequest, ip, userAgent string) (*OAuthTokenBundle, error) {
	if input.ClientID != OAuthClientID {
		return nil, oauthClientError(http.StatusBadRequest, "invalid_client", "The OAuth client is invalid.", nil)
	}
	if !isCanonicalBase64URL32(input.Code) {
		return nil, oauthClientError(http.StatusBadRequest, "invalid_grant", "The authorization grant is invalid.", nil)
	}
	if err := validateOAuthLoopbackRedirect(input.RedirectURI); err != nil {
		return nil, oauthClientError(http.StatusBadRequest, "invalid_grant", "The authorization grant is invalid.", err)
	}
	device, err := ValidateOAuthDeviceMetadata(input.Device)
	if err != nil {
		return nil, err
	}
	flow, err := model.GetAuthFlow(input.Code, model.AuthFlowMatch{
		Purpose:  model.AuthFlowPurposeOAuthClientCode,
		Provider: OAuthClientID,
		Intent:   "exchange",
	})
	if err != nil {
		return nil, oauthGrantError(err)
	}
	codePayload, err := decodeOAuthAuthorizationCode(flow.Payload)
	if err != nil {
		return nil, err
	}
	if codePayload.ClientID != input.ClientID || codePayload.RedirectURI != input.RedirectURI {
		return nil, oauthClientError(http.StatusBadRequest, "invalid_grant", "The authorization grant is invalid.", nil)
	}
	if err := VerifyOAuthPKCE(input.CodeVerifier, codePayload.CodeChallenge); err != nil {
		return nil, err
	}

	now := time.Now().Unix()
	refreshSecret, err := common.GenerateRandomCharsKey(64)
	if err != nil {
		return nil, oauthClientError(http.StatusInternalServerError, "server_error", "The authorization server could not process the request.", err)
	}
	session := &model.UserSession{
		SID:                 uuid.NewString(),
		UserID:              flow.UserId,
		Version:             1,
		UserAuthVersion:     codePayload.UserAuthVersion,
		Status:              model.UserSessionStatusActive,
		RefreshHash:         hashRefreshSecret(refreshSecret),
		LoginMethod:         model.UserSessionLoginMethodOAuthClient,
		IP:                  truncateAuthMetadata(ip, 64),
		UserAgent:           truncateAuthMetadata(userAgent, 512),
		CreatedAt:           now,
		LastActiveAt:        now,
		ExpiresAt:           now + int64(OAuthAccessTokenTTL/time.Second),
		PreviousValidUntil:  0,
		PreviousRefreshHash: "",
	}
	if HasOAuthScope(strings.Split(codePayload.Scope, " "), oauthScopeOffline) {
		session.ExpiresAt = now + int64(LoginSessionTTL/time.Second)
	}
	extension := &model.OAuthClientSession{
		SessionID:     session.SID,
		UserID:        session.UserID,
		ClientID:      codePayload.ClientID,
		Scopes:        codePayload.Scope,
		DeviceID:      device.DeviceID,
		DeviceName:    device.DeviceName,
		Platform:      device.Platform,
		ClientVersion: device.ClientVersion,
		CreatedAt:     now,
	}
	_, err = model.ConsumeAuthFlowWithAction(input.Code, model.AuthFlowMatch{
		Purpose:  model.AuthFlowPurposeOAuthClientCode,
		Provider: OAuthClientID,
		Intent:   "exchange",
		UserId:   flow.UserId,
	}, func(tx *gorm.DB, consumed *model.AuthFlow) error {
		currentPayload, decodeErr := decodeOAuthAuthorizationCode(consumed.Payload)
		if decodeErr != nil || currentPayload != codePayload {
			return oauthClientError(http.StatusBadRequest, "invalid_grant", "The authorization grant is invalid.", decodeErr)
		}
		user, queryErr := model.LockOAuthClientUserWithTx(tx, consumed.UserId)
		if queryErr != nil {
			if errors.Is(queryErr, gorm.ErrRecordNotFound) {
				return oauthClientError(http.StatusBadRequest, "invalid_grant", "The authorization grant is invalid.", queryErr)
			}
			return queryErr
		}
		if user.Status != common.UserStatusEnabled || user.AuthVersion != currentPayload.UserAuthVersion {
			return oauthClientError(http.StatusBadRequest, "invalid_grant", "The authorization grant is invalid.", nil)
		}
		activeCount, countErr := model.CountActiveOAuthClientSessionsWithTx(tx, user.Id, OAuthClientID, now)
		if countErr != nil {
			return countErr
		}
		if activeCount >= int64(common.UserSessionActiveLimit) {
			return model.ErrUserSessionLimit
		}
		issuanceCount, countErr := model.CountOAuthClientSessionsCreatedSinceWithTx(tx, user.Id, OAuthClientID, now-common.UserSessionIssuanceWindowSeconds)
		if countErr != nil {
			return countErr
		}
		if issuanceCount >= int64(common.UserSessionIssuanceLimit) {
			return model.ErrUserSessionIssuanceLimit
		}
		if createErr := model.CreateUserSessionWithTx(tx, session); createErr != nil {
			return createErr
		}
		return model.CreateOAuthClientSessionWithTx(tx, extension)
	})
	if err != nil {
		if errors.Is(err, model.ErrAuthFlowInvalid) || errors.Is(err, model.ErrAuthFlowExpired) || errors.Is(err, model.ErrAuthFlowConsumed) {
			return nil, oauthClientError(http.StatusBadRequest, "invalid_grant", "The authorization grant is invalid.", err)
		}
		var oauthErr *OAuthClientError
		if errors.As(err, &oauthErr) {
			return nil, err
		}
		return nil, oauthClientError(http.StatusServiceUnavailable, "server_error", "The authorization server could not process the request.", err)
	}

	scopes := strings.Split(codePayload.Scope, " ")
	accessToken, accessExpiresAt, err := IssueOAuthAccessToken(OAuthAccessIdentity{
		AuthIdentity: AuthIdentity{
			UserID:          session.UserID,
			SessionID:       session.SID,
			UserAuthVersion: session.UserAuthVersion,
			SessionVersion:  session.Version,
		},
		ClientID: OAuthClientID,
		Scopes:   scopes,
	}, session.ExpiresAt)
	if err != nil {
		_, _ = model.RevokeUserSession(session.UserID, session.SID, "token_issue_failed")
		return nil, oauthClientError(http.StatusInternalServerError, "server_error", "The authorization server could not process the request.", err)
	}
	bundle := &OAuthTokenBundle{
		AccessToken:      accessToken,
		AccessExpiresAt:  accessExpiresAt,
		SessionExpiresAt: session.ExpiresAt,
		Scope:            codePayload.Scope,
		SessionID:        session.SID,
	}
	if HasOAuthScope(scopes, oauthScopeOffline) {
		bundle.RefreshToken = session.SID + "." + refreshSecret
	}
	return bundle, nil
}

func RefreshOAuthClientSession(input OAuthRefreshRequest, ip, userAgent string) (*OAuthTokenBundle, error) {
	if input.ClientID != OAuthClientID {
		return nil, oauthClientError(http.StatusBadRequest, "invalid_client", "The OAuth client is invalid.", nil)
	}
	sid, _, ok := splitRefreshToken(input.RefreshToken)
	if !ok {
		return nil, oauthClientError(http.StatusBadRequest, "invalid_grant", "The authorization grant is invalid.", nil)
	}
	extension, err := model.GetOAuthClientSession(sid)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, oauthClientError(http.StatusBadRequest, "invalid_grant", "The authorization grant is invalid.", err)
		}
		return nil, oauthClientError(http.StatusServiceUnavailable, "server_error", "The authorization server could not process the request.", err)
	}
	if extension.ClientID != OAuthClientID || extension.UserID <= 0 {
		return nil, oauthClientError(http.StatusBadRequest, "invalid_grant", "The authorization grant is invalid.", err)
	}
	canonicalScope, err := canonicalOAuthScope(extension.Scopes)
	if err != nil || canonicalScope != extension.Scopes || !HasOAuthScope(strings.Split(canonicalScope, " "), oauthScopeOffline) {
		return nil, oauthClientError(http.StatusBadRequest, "invalid_grant", "The authorization grant is invalid.", err)
	}
	rotated, _, nextRefreshToken, err := rotateLoginSessionRefresh(input.RefreshToken, sid, model.UserSessionLoginMethodOAuthClient, ip, userAgent, 0)
	if err != nil {
		return nil, oauthGrantError(err)
	}
	if rotated.UserID != extension.UserID {
		_, _ = model.RevokeUserSession(rotated.UserID, rotated.SID, "oauth_session_mismatch")
		return nil, oauthClientError(http.StatusBadRequest, "invalid_grant", "The authorization grant is invalid.", nil)
	}
	accessToken, accessExpiresAt, err := IssueOAuthAccessToken(OAuthAccessIdentity{
		AuthIdentity: AuthIdentity{
			UserID:          rotated.UserID,
			SessionID:       rotated.SID,
			UserAuthVersion: rotated.UserAuthVersion,
			SessionVersion:  rotated.Version,
		},
		ClientID: extension.ClientID,
		Scopes:   strings.Split(extension.Scopes, " "),
	}, rotated.ExpiresAt)
	if err != nil {
		return nil, oauthClientError(http.StatusInternalServerError, "server_error", "The authorization server could not process the request.", err)
	}
	return &OAuthTokenBundle{
		AccessToken:      accessToken,
		AccessExpiresAt:  accessExpiresAt,
		RefreshToken:     nextRefreshToken,
		SessionExpiresAt: rotated.ExpiresAt,
		Scope:            extension.Scopes,
		SessionID:        rotated.SID,
	}, nil
}

func AuthenticateOAuthClientAccessToken(raw, requiredScope string) (OAuthAccessIdentity, *model.UserBase, error) {
	identity, err := ParseOAuthAccessToken(raw)
	if err != nil {
		return OAuthAccessIdentity{}, nil, oauthClientError(http.StatusUnauthorized, "invalid_token", "The access token is invalid or expired.", err)
	}
	session, user, err := ValidateLoginSession(identity.AuthIdentity)
	if err != nil {
		if current, userErr := model.GetUserCache(identity.UserID); userErr == nil && current.Status != common.UserStatusEnabled {
			return OAuthAccessIdentity{}, nil, oauthClientError(http.StatusForbidden, "account_disabled", "The account is disabled.", err)
		}
		if errors.Is(err, ErrLoginSessionRevoked) || errors.Is(err, ErrAuthTokenInvalid) || errors.Is(err, ErrAuthTokenExpired) || errors.Is(err, gorm.ErrRecordNotFound) {
			return OAuthAccessIdentity{}, nil, oauthClientError(http.StatusUnauthorized, "invalid_token", "The access token is invalid or expired.", err)
		}
		return OAuthAccessIdentity{}, nil, oauthClientError(http.StatusInternalServerError, "server_error", "The authorization server could not process the request.", err)
	}
	if session.LoginMethod != model.UserSessionLoginMethodOAuthClient {
		return OAuthAccessIdentity{}, nil, oauthClientError(http.StatusUnauthorized, "invalid_token", "The access token is invalid or expired.", nil)
	}
	extension, err := model.GetOAuthClientSessionForUser(session.SID, session.UserID, identity.ClientID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return OAuthAccessIdentity{}, nil, oauthClientError(http.StatusUnauthorized, "invalid_token", "The access token is invalid or expired.", err)
		}
		return OAuthAccessIdentity{}, nil, oauthClientError(http.StatusInternalServerError, "server_error", "The authorization server could not process the request.", err)
	}
	canonicalScope, err := canonicalOAuthScope(extension.Scopes)
	if err != nil || canonicalScope != extension.Scopes || canonicalScope != strings.Join(identity.Scopes, " ") {
		return OAuthAccessIdentity{}, nil, oauthClientError(http.StatusUnauthorized, "invalid_token", "The access token is invalid or expired.", err)
	}
	if requiredScope != "" && !HasOAuthScope(identity.Scopes, requiredScope) {
		return OAuthAccessIdentity{}, nil, oauthClientError(http.StatusForbidden, "insufficient_scope", "The access token does not include the required scope.", nil)
	}
	if err := model.TouchUserSessionLastActive(session.UserID, session.SID, time.Now().Unix()); err != nil {
		return OAuthAccessIdentity{}, nil, oauthClientError(http.StatusInternalServerError, "server_error", "The authorization server could not process the request.", err)
	}
	identity.LoginMethod = session.LoginMethod
	return identity, user, nil
}

func ListAuthorizedOAuthDevices(identity OAuthAccessIdentity, limit int, cursor string) ([]OAuthSessionView, string, error) {
	if identity.UserID <= 0 || identity.SessionID == "" || identity.ClientID != OAuthClientID || !HasOAuthScope(identity.Scopes, oauthScopeSessions) || limit < 1 || limit > 100 {
		return nil, "", oauthClientError(http.StatusForbidden, "insufficient_scope", "The access token does not include the required scope.", nil)
	}
	records, err := model.ListOAuthClientSessions(identity.UserID, identity.ClientID, cursor, limit+1, time.Now().Unix())
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) || errors.Is(err, model.ErrUserSessionInvalid) {
			return nil, "", oauthClientError(http.StatusBadRequest, "invalid_request", "The session cursor is invalid.", err)
		}
		return nil, "", oauthClientError(http.StatusInternalServerError, "server_error", "The authorization server could not process the request.", err)
	}
	nextCursor := ""
	if len(records) > limit {
		records = records[:limit]
		nextCursor = records[len(records)-1].Session.SID
	}
	views := make([]OAuthSessionView, 0, len(records))
	for i := range records {
		views = append(views, OAuthSessionView{
			ID:           records[i].Session.SID,
			ClientID:     records[i].OAuth.ClientID,
			DeviceName:   optionalOAuthString(records[i].OAuth.DeviceName),
			Platform:     optionalOAuthString(records[i].OAuth.Platform),
			CreatedAt:    time.Unix(records[i].Session.CreatedAt, 0).UTC().Format(time.RFC3339),
			LastActiveAt: time.Unix(records[i].Session.LastActiveAt, 0).UTC().Format(time.RFC3339),
			Current:      records[i].Session.SID == identity.SessionID,
		})
	}
	return views, nextCursor, nil
}

func RevokeAuthorizedOAuthDevice(identity OAuthAccessIdentity, targetSID string) (bool, error) {
	if identity.UserID <= 0 || identity.ClientID != OAuthClientID || !HasOAuthScope(identity.Scopes, oauthScopeSessions) || strings.TrimSpace(targetSID) == "" {
		return false, model.ErrUserSessionInvalid
	}
	if _, err := model.GetOAuthClientSessionForUser(targetSID, identity.UserID, identity.ClientID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return false, model.ErrUserSessionInvalid
		}
		return false, err
	}
	return model.RevokeUserSession(identity.UserID, targetSID, "oauth_device_revoked")
}

func RevokeOAuthClientToken(clientID, rawToken string) error {
	if clientID != OAuthClientID || strings.TrimSpace(rawToken) == "" {
		return nil
	}
	if identity, err := ParseOAuthAccessTokenForRevocation(rawToken); err == nil {
		extension, lookupErr := model.GetOAuthClientSessionForUser(identity.SessionID, identity.UserID, identity.ClientID)
		if lookupErr != nil {
			if errors.Is(lookupErr, gorm.ErrRecordNotFound) {
				return nil
			}
			return oauthClientError(http.StatusInternalServerError, "server_error", "The authorization server could not process the request.", lookupErr)
		}
		_, revokeErr := model.RevokeUserSession(extension.UserID, extension.SessionID, "oauth_token_revoked")
		return revokeErr
	}

	sid, secret, ok := splitRefreshToken(rawToken)
	if !ok {
		return nil
	}
	extension, err := model.GetOAuthClientSession(sid)
	if err != nil || extension.ClientID != clientID {
		if err == nil || errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return oauthClientError(http.StatusInternalServerError, "server_error", "The authorization server could not process the request.", err)
	}
	_, err = model.RevokeUserSessionByRefreshHash(sid, hashRefreshSecret(secret), "oauth_token_revoked")
	if errors.Is(err, model.ErrUserSessionRefreshInvalid) || errors.Is(err, model.ErrUserSessionInactive) || errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	return err
}

func optionalOAuthString(value string) *string {
	if value == "" {
		return nil
	}
	copy := value
	return &copy
}

func decodeOAuthAuthorizationRequest(payload string) (OAuthAuthorizeRequest, error) {
	var request OAuthAuthorizeRequest
	if err := common.UnmarshalJsonStr(payload, &request); err != nil {
		return OAuthAuthorizeRequest{}, oauthClientError(http.StatusInternalServerError, "server_error", "The authorization server could not process the request.", err)
	}
	validated, err := ValidateOAuthAuthorizeRequest(request)
	if err != nil || validated != request {
		return OAuthAuthorizeRequest{}, oauthClientError(http.StatusInternalServerError, "server_error", "The authorization server could not process the request.", err)
	}
	return request, nil
}

func decodeOAuthAuthorizationCode(payload string) (oauthAuthorizationCodePayload, error) {
	var code oauthAuthorizationCodePayload
	if err := common.UnmarshalJsonStr(payload, &code); err != nil {
		return oauthAuthorizationCodePayload{}, oauthClientError(http.StatusInternalServerError, "server_error", "The authorization server could not process the request.", err)
	}
	canonicalScope, err := canonicalOAuthScope(code.Scope)
	if err != nil || code.ClientID != OAuthClientID || validateOAuthLoopbackRedirect(code.RedirectURI) != nil || !isCanonicalBase64URL32(code.CodeChallenge) || canonicalScope != code.Scope || code.UserAuthVersion <= 0 || code.AuthorizedAt <= 0 {
		return oauthAuthorizationCodePayload{}, oauthClientError(http.StatusInternalServerError, "server_error", "The authorization server could not process the request.", err)
	}
	return code, nil
}

func oauthAuthFlowError(err error) error {
	var oauthErr *OAuthClientError
	if errors.As(err, &oauthErr) {
		return err
	}
	if errors.Is(err, model.ErrAuthFlowInvalid) || errors.Is(err, model.ErrAuthFlowExpired) || errors.Is(err, model.ErrAuthFlowConsumed) {
		return oauthClientError(http.StatusBadRequest, "invalid_request", "The authorization request is invalid or expired.", err)
	}
	return oauthClientError(http.StatusInternalServerError, "server_error", "The authorization server could not process the request.", err)
}

func oauthGrantError(err error) error {
	var oauthErr *OAuthClientError
	if errors.As(err, &oauthErr) {
		if oauthErr.Code == "invalid_grant" || oauthErr.Code == "invalid_client" {
			return err
		}
	}
	if errors.Is(err, model.ErrAuthFlowInvalid) || errors.Is(err, model.ErrAuthFlowExpired) || errors.Is(err, model.ErrAuthFlowConsumed) ||
		errors.Is(err, ErrRefreshTokenInvalid) || errors.Is(err, ErrLoginSessionRevoked) || errors.Is(err, ErrLoginSessionMismatch) || errors.Is(err, ErrLoginSessionMethod) || errors.Is(err, ErrRefreshRace) {
		return oauthClientError(http.StatusBadRequest, "invalid_grant", "The authorization grant is invalid.", err)
	}
	return oauthClientError(http.StatusServiceUnavailable, "server_error", "The authorization server could not process the request.", err)
}

func validateOAuthLoopbackRedirect(raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "http" || parsed.Opaque != "" || parsed.User != nil || parsed.Hostname() != "127.0.0.1" || parsed.Path != oauthLoopbackPath || parsed.RawPath != "" || parsed.RawQuery != "" || parsed.ForceQuery || parsed.Fragment != "" {
		return errors.New("redirect URI does not match the loopback policy")
	}
	port := parsed.Port()
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 1 || portNumber > 65535 || strconv.Itoa(portNumber) != port {
		return errors.New("redirect URI port is invalid")
	}
	canonical := "http://127.0.0.1:" + port + oauthLoopbackPath
	if parsed.Host != "127.0.0.1:"+port || raw != canonical {
		return errors.New("redirect URI is not canonical")
	}
	return nil
}

func isCanonicalBase64URL32(value string) bool {
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	return err == nil && len(decoded) == 32 && base64.RawURLEncoding.EncodeToString(decoded) == value
}

func canonicalOAuthScope(raw string) (string, error) {
	if raw == "" {
		return oauthScopeProfile, nil
	}
	requested := strings.Split(raw, " ")
	found := make(map[string]bool, len(requested))
	for _, scope := range requested {
		if scope == "" || found[scope] {
			return "", oauthClientError(http.StatusBadRequest, "invalid_scope", "The requested scope is invalid.", nil)
		}
		switch scope {
		case oauthScopeProfile, oauthScopeOffline, oauthScopeSessions:
			found[scope] = true
		default:
			return "", oauthClientError(http.StatusBadRequest, "invalid_scope", "The requested scope is invalid.", nil)
		}
	}
	canonical := make([]string, 0, len(found))
	for _, scope := range oauthScopes {
		if found[scope] {
			canonical = append(canonical, scope)
		}
	}
	return strings.Join(canonical, " "), nil
}

func VerifyOAuthPKCE(verifier, expectedChallenge string) error {
	if len(verifier) < 43 || len(verifier) > 128 {
		return oauthClientError(http.StatusBadRequest, "invalid_grant", "The authorization grant is invalid.", nil)
	}
	for _, char := range verifier {
		if !((char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z') || (char >= '0' && char <= '9') || strings.ContainsRune("-._~", char)) {
			return oauthClientError(http.StatusBadRequest, "invalid_grant", "The authorization grant is invalid.", nil)
		}
	}
	if !isCanonicalBase64URL32(expectedChallenge) {
		return oauthClientError(http.StatusBadRequest, "invalid_grant", "The authorization grant is invalid.", nil)
	}
	digest := sha256.Sum256([]byte(verifier))
	actualChallenge := base64.RawURLEncoding.EncodeToString(digest[:])
	if subtle.ConstantTimeCompare([]byte(actualChallenge), []byte(expectedChallenge)) != 1 {
		return oauthClientError(http.StatusBadRequest, "invalid_grant", "The authorization grant is invalid.", nil)
	}
	return nil
}

func ValidateOAuthDeviceMetadata(input OAuthDeviceMetadata) (OAuthDeviceMetadata, error) {
	input.DeviceID = strings.TrimSpace(input.DeviceID)
	input.DeviceName = strings.TrimSpace(input.DeviceName)
	input.Platform = strings.TrimSpace(input.Platform)
	input.ClientVersion = strings.TrimSpace(input.ClientVersion)
	if input.DeviceID != "" {
		parsed, err := uuid.Parse(input.DeviceID)
		if err != nil {
			return OAuthDeviceMetadata{}, oauthClientError(http.StatusBadRequest, "invalid_request", "The device metadata is invalid.", err)
		}
		input.DeviceID = parsed.String()
	}
	if !validOAuthDisplayText(input.DeviceName, 80) || !validOAuthDisplayText(input.ClientVersion, 64) {
		return OAuthDeviceMetadata{}, oauthClientError(http.StatusBadRequest, "invalid_request", "The device metadata is invalid.", nil)
	}
	if input.Platform != "" && input.Platform != "windows" && input.Platform != "macos" && input.Platform != "linux" {
		return OAuthDeviceMetadata{}, oauthClientError(http.StatusBadRequest, "invalid_request", "The device metadata is invalid.", nil)
	}
	return input, nil
}

func validOAuthDisplayText(value string, maxRunes int) bool {
	if !utf8.ValidString(value) || utf8.RuneCountInString(value) > maxRunes {
		return false
	}
	for _, char := range value {
		if unicode.IsControl(char) {
			return false
		}
	}
	return true
}

func IssueOAuthAccessToken(identity OAuthAccessIdentity, sessionExpiresAt int64) (string, int64, error) {
	rawScope := strings.Join(identity.Scopes, " ")
	canonicalScope, err := canonicalOAuthScope(rawScope)
	if err != nil || rawScope == "" || canonicalScope != rawScope || identity.UserID <= 0 || identity.SessionID == "" || identity.UserAuthVersion <= 0 || identity.SessionVersion <= 0 || identity.ClientID != OAuthClientID {
		return "", 0, ErrAuthTokenInvalid
	}
	now := time.Now()
	expiresAt := now.Add(OAuthAccessTokenTTL)
	if sessionExpiresAt <= now.Unix() {
		return "", 0, ErrAuthTokenInvalid
	}
	if sessionExpiry := time.Unix(sessionExpiresAt, 0); sessionExpiry.Before(expiresAt) {
		expiresAt = sessionExpiry
	}
	claims := authClaims{
		TokenUse:        oauthAccessTokenUse,
		SessionID:       identity.SessionID,
		UserAuthVersion: identity.UserAuthVersion,
		SessionVersion:  identity.SessionVersion,
		ClientID:        identity.ClientID,
		Scopes:          strings.Split(canonicalScope, " "),
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    authTokenIssuer,
			Subject:   strconv.Itoa(identity.UserID),
			Audience:  jwt.ClaimStrings{OAuthClientID},
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			NotBefore: jwt.NewNumericDate(now.Add(-5 * time.Second)),
			IssuedAt:  jwt.NewNumericDate(now),
			ID:        uuid.NewString(),
		},
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(authSigningKey(oauthAccessTokenUse))
	return signed, expiresAt.Unix(), err
}

func ParseOAuthAccessToken(raw string) (OAuthAccessIdentity, error) {
	claims, err := parseAuthClaimsForAudience(raw, oauthAccessTokenUse, authSigningKey(oauthAccessTokenUse), OAuthClientID)
	if err != nil {
		return OAuthAccessIdentity{}, err
	}
	return oauthAccessIdentityFromClaims(claims)
}

func ParseOAuthAccessTokenForRevocation(raw string) (OAuthAccessIdentity, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return OAuthAccessIdentity{}, ErrAuthTokenInvalid
	}
	claims := &oauthRevocationClaims{}
	parsed, err := jwt.ParseWithClaims(raw, claims, func(token *jwt.Token) (any, error) {
		if token.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, fmt.Errorf("%w: unexpected signing method", ErrAuthTokenInvalid)
		}
		return authSigningKey(oauthAccessTokenUse), nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithIssuer(authTokenIssuer), jwt.WithAudience(OAuthClientID), jwt.WithExpirationRequired(), jwt.WithIssuedAt(), jwt.WithLeeway(5*time.Second))
	if err != nil || !parsed.Valid || claims.TokenUse != oauthAccessTokenUse || claims.ID == "" || claims.IssuedAt == nil || claims.NotBefore == nil {
		return OAuthAccessIdentity{}, ErrAuthTokenInvalid
	}
	return oauthAccessIdentityFromClaims(&claims.authClaims)
}

func oauthAccessIdentityFromClaims(claims *authClaims) (OAuthAccessIdentity, error) {
	userID, err := strconv.Atoi(claims.Subject)
	canonicalScope, scopeErr := canonicalOAuthScope(strings.Join(claims.Scopes, " "))
	if err != nil || scopeErr != nil || userID <= 0 || claims.SessionID == "" || claims.UserAuthVersion <= 0 || claims.SessionVersion <= 0 || claims.ClientID != OAuthClientID || canonicalScope != strings.Join(claims.Scopes, " ") {
		return OAuthAccessIdentity{}, ErrAuthTokenInvalid
	}
	return OAuthAccessIdentity{
		AuthIdentity: AuthIdentity{
			UserID:          userID,
			SessionID:       claims.SessionID,
			UserAuthVersion: claims.UserAuthVersion,
			SessionVersion:  claims.SessionVersion,
		},
		ClientID: claims.ClientID,
		Scopes:   append([]string(nil), claims.Scopes...),
	}, nil
}

func HasOAuthScope(scopes []string, required string) bool {
	for _, scope := range scopes {
		if scope == required {
			return true
		}
	}
	return false
}
