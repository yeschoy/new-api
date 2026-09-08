package controller

import (
	"errors"
	"html"
	"mime"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type oauthAuthorizationDecisionRequest struct {
	FlowToken string `json:"flow_token"`
	Decision  string `json:"decision"`
}

const oauthClientFormMaxBytes = 16 * 1024

func BeginOAuthClientAuthorization(c *gin.Context) {
	setOAuthNoStore(c)
	setOAuthRequestID(c)
	c.Header("Referrer-Policy", "no-referrer")
	if !isOAuthClientHost(c) {
		c.Status(http.StatusNotFound)
		return
	}
	request, err := parseOAuthAuthorizeQuery(c.Request.URL.Query())
	if err != nil {
		writeOAuthAuthorizationPageError(c, err)
		return
	}

	_, browserURL, err := service.BeginOAuthAuthorization(request)
	if err != nil {
		writeOAuthAuthorizationPageError(c, err)
		return
	}
	c.Redirect(http.StatusSeeOther, browserURL)
}

func GetOAuthClientAuthorizationRequest(c *gin.Context) {
	setOAuthNoStore(c)
	setOAuthRequestID(c)
	if !isOAuthClientHost(c) {
		c.Status(http.StatusNotFound)
		return
	}
	if _, ok := middleware.GetBrowserSessionAuthIdentity(c); !ok {
		writeOAuthBrowserError(c, service.NewOAuthClientError(http.StatusForbidden, "access_denied", "A live browser session is required."))
		return
	}
	requestToken, ok := singleOAuthQueryValue(c.Request.URL.Query(), "request", true)
	if !ok {
		writeOAuthBrowserError(c, service.NewOAuthClientError(http.StatusBadRequest, "invalid_request", "The authorization request is invalid."))
		return
	}
	view, err := service.InspectOAuthAuthorization(requestToken)
	if err != nil {
		writeOAuthBrowserError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": view})
}

func DecideOAuthClientAuthorization(c *gin.Context) {
	setOAuthNoStore(c)
	setOAuthRequestID(c)
	if !isOAuthClientHost(c) {
		c.Status(http.StatusNotFound)
		return
	}
	browser, ok := middleware.GetBrowserSessionAuthIdentity(c)
	if !ok {
		writeOAuthBrowserError(c, service.NewOAuthClientError(http.StatusForbidden, "access_denied", "A live browser session is required."))
		return
	}
	var request oauthAuthorizationDecisionRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil || strings.TrimSpace(request.FlowToken) == "" {
		writeOAuthBrowserError(c, service.NewOAuthClientError(http.StatusBadRequest, "invalid_request", "The authorization request is invalid."))
		return
	}
	callbackURL, err := service.DecideOAuthAuthorization(strings.TrimSpace(request.FlowToken), request.Decision, browser)
	if err != nil {
		writeOAuthBrowserError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"redirect_to": callbackURL}})
}

func OAuthClientToken(c *gin.Context) {
	setOAuthNoStore(c)
	setOAuthRequestID(c)
	if !isOAuthClientHost(c) {
		c.Status(http.StatusNotFound)
		return
	}
	form, err := parseOAuthForm(c)
	if err != nil {
		writeOAuthProtocolError(c, err)
		return
	}
	grantType, ok := singleOAuthFormValue(form, "grant_type", true)
	if !ok {
		writeOAuthProtocolError(c, service.NewOAuthClientError(http.StatusBadRequest, "invalid_request", "The token request is invalid."))
		return
	}
	clientID, ok := singleOAuthFormValue(form, "client_id", true)
	if !ok {
		writeOAuthProtocolError(c, service.NewOAuthClientError(http.StatusBadRequest, "invalid_request", "The token request is invalid."))
		return
	}

	var bundle *service.OAuthTokenBundle
	switch grantType {
	case "authorization_code":
		values, valid := oauthFormValues(form, []string{"code", "redirect_uri", "code_verifier"}, []string{"device_id", "device_name", "platform", "client_version"})
		if !valid || hasUnexpectedOAuthFormField(form, "grant_type", "client_id", "code", "redirect_uri", "code_verifier", "device_id", "device_name", "platform", "client_version") {
			writeOAuthProtocolError(c, service.NewOAuthClientError(http.StatusBadRequest, "invalid_request", "The token request is invalid."))
			return
		}
		bundle, err = service.ExchangeOAuthAuthorizationCode(service.OAuthCodeExchangeRequest{
			ClientID:     clientID,
			Code:         values["code"],
			RedirectURI:  values["redirect_uri"],
			CodeVerifier: values["code_verifier"],
			Device: service.OAuthDeviceMetadata{
				DeviceID:      values["device_id"],
				DeviceName:    values["device_name"],
				Platform:      values["platform"],
				ClientVersion: values["client_version"],
			},
		}, c.ClientIP(), c.Request.UserAgent())
	case "refresh_token":
		refreshToken, valid := singleOAuthFormValue(form, "refresh_token", true)
		if !valid || hasUnexpectedOAuthFormField(form, "grant_type", "client_id", "refresh_token") {
			writeOAuthProtocolError(c, service.NewOAuthClientError(http.StatusBadRequest, "invalid_request", "The token request is invalid."))
			return
		}
		bundle, err = service.RefreshOAuthClientSession(service.OAuthRefreshRequest{
			ClientID:     clientID,
			RefreshToken: refreshToken,
		}, c.ClientIP(), c.Request.UserAgent())
	default:
		err = service.NewOAuthClientError(http.StatusBadRequest, "unsupported_grant_type", "The grant type is not supported.")
	}
	if err != nil {
		writeOAuthProtocolError(c, err)
		return
	}
	now := time.Now().Unix()
	response := gin.H{
		"access_token": bundle.AccessToken,
		"token_type":   "Bearer",
		"expires_in":   max(bundle.AccessExpiresAt-now, 0),
		"scope":        bundle.Scope,
		"session_id":   bundle.SessionID,
	}
	if bundle.RefreshToken != "" {
		response["refresh_token"] = bundle.RefreshToken
		response["refresh_expires_in"] = max(bundle.SessionExpiresAt-now, 0)
	}
	c.JSON(http.StatusOK, response)
}

func OAuthClientUserInfo(c *gin.Context) {
	setOAuthNoStore(c)
	setOAuthRequestID(c)
	if !isOAuthClientHost(c) {
		c.Status(http.StatusNotFound)
		return
	}
	user, ok := middleware.GetOAuthClientUser(c)
	if !ok {
		writeOAuthProtocolError(c, service.NewOAuthClientError(http.StatusUnauthorized, "invalid_token", "The access token is invalid or expired."))
		return
	}
	var email any
	if user.Email != "" {
		email = user.Email
	}
	remaining, unit := oauthQuotaDisplay(user.Quota)
	c.JSON(http.StatusOK, gin.H{
		"id":       strconv.Itoa(user.Id),
		"username": user.Username,
		"email":    email,
		"group":    user.Group,
		"status":   "active",
		"quota": gin.H{
			"remaining": remaining,
			"unit":      unit,
		},
	})
}

func GetOAuthClientSessions(c *gin.Context) {
	setOAuthNoStore(c)
	setOAuthRequestID(c)
	if !isOAuthClientHost(c) {
		c.Status(http.StatusNotFound)
		return
	}
	identity, ok := middleware.GetOAuthClientIdentity(c)
	if !ok {
		writeOAuthProtocolError(c, service.NewOAuthClientError(http.StatusUnauthorized, "invalid_token", "The access token is invalid or expired."))
		return
	}
	limit := 20
	limitRaw, valid := singleOAuthQueryValue(c.Request.URL.Query(), "limit", false)
	if !valid {
		writeOAuthProtocolError(c, service.NewOAuthClientError(http.StatusBadRequest, "invalid_request", "The session query is invalid."))
		return
	}
	if limitRaw != "" {
		parsed, err := strconv.Atoi(limitRaw)
		if err != nil || parsed < 1 || parsed > 100 || strconv.Itoa(parsed) != limitRaw {
			writeOAuthProtocolError(c, service.NewOAuthClientError(http.StatusBadRequest, "invalid_request", "The session query is invalid."))
			return
		}
		limit = parsed
	}
	cursor, valid := singleOAuthQueryValue(c.Request.URL.Query(), "cursor", false)
	if !valid {
		writeOAuthProtocolError(c, service.NewOAuthClientError(http.StatusBadRequest, "invalid_request", "The session query is invalid."))
		return
	}
	sessions, nextCursor, err := service.ListAuthorizedOAuthDevices(identity, limit, cursor)
	if err != nil {
		writeOAuthProtocolError(c, err)
		return
	}
	var next any
	if nextCursor != "" {
		next = nextCursor
	}
	c.JSON(http.StatusOK, gin.H{"data": sessions, "next_cursor": next})
}

func DeleteOAuthClientSession(c *gin.Context) {
	setOAuthNoStore(c)
	setOAuthRequestID(c)
	if !isOAuthClientHost(c) {
		c.Status(http.StatusNotFound)
		return
	}
	identity, ok := middleware.GetOAuthClientIdentity(c)
	if !ok {
		writeOAuthProtocolError(c, service.NewOAuthClientError(http.StatusUnauthorized, "invalid_token", "The access token is invalid or expired."))
		return
	}
	_, err := service.RevokeAuthorizedOAuthDevice(identity, strings.TrimSpace(c.Param("session_id")))
	if err != nil {
		if errors.Is(err, model.ErrUserSessionInvalid) || errors.Is(err, gorm.ErrRecordNotFound) {
			writeOAuthProtocolError(c, service.NewOAuthClientError(http.StatusNotFound, "not_found", "The session was not found."))
			return
		}
		writeOAuthProtocolError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func RevokeOAuthClientToken(c *gin.Context) {
	setOAuthNoStore(c)
	setOAuthRequestID(c)
	if !isOAuthClientHost(c) {
		c.Status(http.StatusNotFound)
		return
	}
	form, err := parseOAuthForm(c)
	if err != nil {
		writeOAuthProtocolError(c, err)
		return
	}
	clientID, clientOK := singleOAuthFormValue(form, "client_id", true)
	token, tokenOK := singleOAuthFormValue(form, "token", true)
	hint, hintOK := singleOAuthFormValue(form, "token_type_hint", false)
	if !clientOK || !tokenOK || !hintOK || hasUnexpectedOAuthFormField(form, "client_id", "token", "token_type_hint") || (hint != "" && hint != "access_token" && hint != "refresh_token") {
		writeOAuthProtocolError(c, service.NewOAuthClientError(http.StatusBadRequest, "invalid_request", "The revocation request is invalid."))
		return
	}
	if clientID != service.OAuthClientID {
		writeOAuthProtocolError(c, service.NewOAuthClientError(http.StatusBadRequest, "invalid_client", "The OAuth client is invalid."))
		return
	}
	if err := service.RevokeOAuthClientToken(clientID, token); err != nil {
		writeOAuthProtocolError(c, err)
		return
	}
	c.Status(http.StatusOK)
}

func singleOAuthQueryValue(values url.Values, key string, required bool) (string, bool) {
	items, found := values[key]
	if !found {
		return "", !required
	}
	if len(items) != 1 || (required && items[0] == "") {
		return "", false
	}
	return items[0], true
}

func parseOAuthAuthorizeQuery(values url.Values) (service.OAuthAuthorizeRequest, error) {
	required := []string{"response_type", "client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method"}
	parsed := make(map[string]string, len(required)+1)
	for _, key := range required {
		value, ok := singleOAuthQueryValue(values, key, true)
		if !ok {
			return service.OAuthAuthorizeRequest{}, service.NewOAuthClientError(http.StatusBadRequest, "invalid_request", "The authorization request is invalid.")
		}
		parsed[key] = value
	}
	scope, ok := singleOAuthQueryValue(values, "scope", false)
	if !ok {
		return service.OAuthAuthorizeRequest{}, service.NewOAuthClientError(http.StatusBadRequest, "invalid_request", "The authorization request is invalid.")
	}
	return service.OAuthAuthorizeRequest{
		ResponseType:        parsed["response_type"],
		ClientID:            parsed["client_id"],
		RedirectURI:         parsed["redirect_uri"],
		State:               parsed["state"],
		CodeChallenge:       parsed["code_challenge"],
		CodeChallengeMethod: parsed["code_challenge_method"],
		Scope:               scope,
	}, nil
}

func singleOAuthFormValue(values url.Values, key string, required bool) (string, bool) {
	items, found := values[key]
	if !found {
		return "", !required
	}
	if len(items) != 1 || (required && items[0] == "") {
		return "", false
	}
	return items[0], true
}

func parseOAuthForm(c *gin.Context) (url.Values, error) {
	mediaType, params, err := mime.ParseMediaType(c.GetHeader("Content-Type"))
	if err != nil || mediaType != "application/x-www-form-urlencoded" || (params["charset"] != "" && !strings.EqualFold(params["charset"], "utf-8")) || c.Request.URL.RawQuery != "" {
		return nil, service.NewOAuthClientError(http.StatusBadRequest, "invalid_request", "The form request is invalid.")
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, oauthClientFormMaxBytes)
	if err := c.Request.ParseForm(); err != nil {
		return nil, service.NewOAuthClientError(http.StatusBadRequest, "invalid_request", "The form request is invalid.")
	}
	for _, items := range c.Request.PostForm {
		for _, item := range items {
			if !utf8.ValidString(item) {
				return nil, service.NewOAuthClientError(http.StatusBadRequest, "invalid_request", "The form request is invalid.")
			}
		}
	}
	return c.Request.PostForm, nil
}

func oauthFormValues(values url.Values, required, optional []string) (map[string]string, bool) {
	result := make(map[string]string, len(required)+len(optional))
	for _, key := range required {
		value, ok := singleOAuthFormValue(values, key, true)
		if !ok {
			return nil, false
		}
		result[key] = value
	}
	for _, key := range optional {
		value, ok := singleOAuthFormValue(values, key, false)
		if !ok {
			return nil, false
		}
		result[key] = value
	}
	return result, true
}

func hasUnexpectedOAuthFormField(values url.Values, allowed ...string) bool {
	allowlist := make(map[string]bool, len(allowed))
	for _, key := range allowed {
		allowlist[key] = true
	}
	for key := range values {
		if !allowlist[key] {
			return true
		}
	}
	return false
}

func isOAuthClientHost(c *gin.Context) bool {
	if common.CustomDomainEnabled {
		return isCustomDomainCallbackRequest(c)
	}
	configured, err := url.Parse(strings.TrimSpace(system_setting.ServerAddress))
	if err != nil || configured.Scheme != "https" || configured.User != nil || configured.Host == "" || (configured.Path != "" && configured.Path != "/") || configured.RawQuery != "" || configured.Fragment != "" {
		return false
	}
	return strings.EqualFold(c.Request.Host, configured.Host)
}

func setOAuthNoStore(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.Header("Pragma", "no-cache")
}

func setOAuthRequestID(c *gin.Context) {
	if requestID := c.GetString(common.RequestIdKey); requestID != "" {
		c.Header("X-Request-Id", requestID)
	}
}

func oauthQuotaDisplay(quota int) (string, string) {
	unit := operation_setting.GetQuotaDisplayType()
	if unit == operation_setting.QuotaDisplayTypeTokens {
		return strconv.Itoa(quota), unit
	}
	if common.QuotaPerUnit <= 0 {
		return "0", unit
	}
	amount := float64(quota) / common.QuotaPerUnit * operation_setting.GetUsdToCurrencyRate(operation_setting.USDExchangeRate)
	formatted := strconv.FormatFloat(amount, 'f', 4, 64)
	formatted = strings.TrimRight(strings.TrimRight(formatted, "0"), ".")
	if formatted == "" || formatted == "-0" {
		formatted = "0"
	}
	return formatted, unit
}

func writeOAuthAuthorizationPageError(c *gin.Context, err error) {
	status, _ := oauthClientErrorResponse(err)
	code := "server_error"
	var oauthErr *service.OAuthClientError
	if errors.As(err, &oauthErr) {
		code = oauthErr.Code
	}
	title, description, lang := i18n.OAuthAuthorizationError(c.GetHeader("Accept-Language"), code)
	title = html.EscapeString(title)
	c.Header("Content-Language", lang)
	c.Data(status, "text/html; charset=utf-8", []byte("<!doctype html><html lang=\""+html.EscapeString(lang)+"\"><meta charset=\"utf-8\"><meta name=\"referrer\" content=\"no-referrer\"><title>"+title+"</title><body><main><h1>"+title+"</h1><p>"+html.EscapeString(description)+"</p></main></body></html>"))
}

func writeOAuthBrowserError(c *gin.Context, err error) {
	status, description := oauthClientErrorResponse(err)
	var oauthErr *service.OAuthClientError
	code := "server_error"
	if errors.As(err, &oauthErr) && oauthErr.Code != "" {
		code = oauthErr.Code
	}
	c.JSON(status, gin.H{"success": false, "code": code, "message": description})
}

func writeOAuthProtocolError(c *gin.Context, err error) {
	status, description := oauthClientErrorResponse(err)
	var oauthErr *service.OAuthClientError
	code := "server_error"
	if errors.As(err, &oauthErr) && oauthErr.Code != "" {
		code = oauthErr.Code
	}
	if status >= http.StatusInternalServerError {
		logger.LogError(c.Request.Context(), "OAuth client endpoint failed: "+err.Error())
	}
	c.JSON(status, gin.H{
		"error":             code,
		"error_description": description,
		"request_id":        c.GetString(common.RequestIdKey),
	})
}

func oauthClientErrorResponse(err error) (int, string) {
	var oauthErr *service.OAuthClientError
	if errors.As(err, &oauthErr) {
		status := oauthErr.HTTPStatus
		if status < 400 || status > 599 {
			status = http.StatusInternalServerError
		}
		return status, oauthErr.Description
	}
	return http.StatusInternalServerError, "The authorization server could not process the request."
}
