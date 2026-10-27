package controller

import (
	"encoding/base64"
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
)

const (
	partnerServerMaxAccountsLimit       = 1_000_000
	partnerServerAccountsPerMinuteLimit = 10_000
)

// partnerServerClientCredentials handles grant_type=client_credentials on
// /oauth/token. Partner servers authenticate with HTTP Basic and a server
// secret; OAuth client secrets are never accepted here, and server secrets are
// never accepted by the authorization code grant.
func partnerServerClientCredentials(c *gin.Context, form map[string]string) {
	middleware.StripPartnerServerCORS(c)
	for key := range form {
		if key != "grant_type" && key != "scope" && key != "client_id" {
			writePartnerOAuthError(c, partnerOAuthRequestErr("invalid_request", "unsupported parameter: "+key))
			return
		}
	}
	clientID, secret, ok := parsePartnerServerBasic(c.GetHeader("Authorization"))
	if !ok {
		writePartnerOAuthError(c, &service.PartnerOAuthError{Status: http.StatusUnauthorized, Code: "invalid_client", Description: "client authentication failed", WWWAuth: `Basic realm="oauth"`})
		return
	}
	if formID, present := form["client_id"]; present && formID != clientID {
		writePartnerOAuthError(c, &service.PartnerOAuthError{Status: http.StatusUnauthorized, Code: "invalid_client", Description: "client authentication failed", WWWAuth: `Basic realm="oauth"`})
		return
	}
	issued, reason, known, err := service.IssuePartnerServerToken(clientID, secret, form["scope"], c.ClientIP())
	if err != nil {
		typed := service.AsPartnerOAuthError(err)
		if typed != nil && typed.Code == "invalid_client" {
			if middleware.PartnerOAuthClientAuthLimited(c, clientID) {
				return
			}
			if known {
				model.RecordPartnerOAuthAuthorizationLog(c, model.PartnerOauthAuthorizationLog{Action: "partner_server.token_issue_failed",
					Success: false, ClientId: clientID, Reason: reason, Status: http.StatusUnauthorized})
			}
		}
		if typed == nil {
			logger.LogError(c.Request.Context(), common.LogText("partner server token issue failed (request_id=%s): database error", c.GetString(common.RequestIdKey)))
		}
		writePartnerOAuthError(c, err)
		return
	}
	model.RecordPartnerOAuthAuthorizationLog(c, model.PartnerOauthAuthorizationLog{Action: "partner_server.token_issue", Success: true,
		ClientId: clientID, Status: http.StatusOK})
	c.JSON(http.StatusOK, issued)
}

func parsePartnerServerBasic(header string) (string, string, bool) {
	scheme, encoded, ok := strings.Cut(strings.TrimSpace(header), " ")
	if !ok || !strings.EqualFold(scheme, "Basic") || encoded == "" {
		return "", "", false
	}
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", "", false
	}
	id, secret, ok := strings.Cut(string(decoded), ":")
	if !ok {
		return "", "", false
	}
	id, err = url.QueryUnescape(id)
	if err != nil {
		return "", "", false
	}
	secret, err = url.QueryUnescape(secret)
	if err != nil {
		return "", "", false
	}
	return id, secret, id != "" && secret != ""
}

type partnerServerConfigView struct {
	ClientId          string                    `json:"client_id"`
	Configured        bool                      `json:"configured"`
	Enabled           bool                      `json:"enabled"`
	AccountGroup      string                    `json:"account_group"`
	IPAllowlist       []string                  `json:"ip_allowlist"`
	MaxAccounts       int                       `json:"max_accounts"`
	AccountsPerMinute int                       `json:"accounts_per_minute"`
	Suspended         bool                      `json:"suspended"`
	AccountCount      int64                     `json:"account_count"`
	Secrets           []partnerServerSecretView `json:"secrets"`
}

type partnerServerSecretView struct {
	Id        int64  `json:"id"`
	Status    string `json:"status"`
	CreatedAt int64  `json:"created_at"`
	RevokedAt int64  `json:"revoked_at"`
}

func buildPartnerServerConfigView(clientID string) (*partnerServerConfigView, error) {
	view := &partnerServerConfigView{
		ClientId:          clientID,
		MaxAccounts:       model.PartnerServerDefaultMaxAccounts,
		AccountsPerMinute: model.PartnerServerDefaultAccountsPerMinute,
		IPAllowlist:       []string{},
		Secrets:           []partnerServerSecretView{},
	}
	config, err := model.GetPartnerServerConfig(clientID)
	if err != nil && !errors.Is(err, model.ErrPartnerServerConfigNotFound) {
		return nil, err
	}
	if config != nil {
		allowlist, err := service.ParsePartnerServerIPAllowlist(config.IPAllowlist)
		if err != nil {
			return nil, err
		}
		view.Configured = true
		view.Enabled = config.Enabled
		view.AccountGroup = config.AccountGroup
		if allowlist != nil {
			view.IPAllowlist = allowlist
		}
		view.MaxAccounts = config.MaxAccounts
		view.AccountsPerMinute = config.AccountsPerMinute
		view.Suspended = config.SuspendedAt != 0
	}
	if view.AccountCount, err = model.CountPartnerAccounts(clientID); err != nil {
		return nil, err
	}
	secrets, err := model.ListPartnerServerSecrets(clientID)
	if err != nil {
		return nil, err
	}
	for _, secret := range secrets {
		view.Secrets = append(view.Secrets, partnerServerSecretView{Id: secret.Id, Status: secret.Status, CreatedAt: secret.CreatedAt, RevokedAt: secret.RevokedAt})
	}
	return view, nil
}

func GetPartnerServerConfig(c *gin.Context) {
	client, ok := loadPartnerOAuthClientByParam(c)
	if !ok {
		return
	}
	view, err := buildPartnerServerConfigView(client.ClientId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": view})
}

type partnerServerConfigRequest struct {
	Enabled           bool     `json:"enabled"`
	AccountGroup      string   `json:"account_group"`
	IPAllowlist       []string `json:"ip_allowlist"`
	MaxAccounts       int      `json:"max_accounts"`
	AccountsPerMinute int      `json:"accounts_per_minute"`
}

func UpdatePartnerServerConfig(c *gin.Context) {
	client, ok := loadPartnerOAuthClientByParam(c)
	if !ok {
		return
	}
	var req partnerServerConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid request"})
		return
	}
	req.AccountGroup = strings.TrimSpace(req.AccountGroup)
	if req.AccountGroup == "" || !ratio_setting.ContainsGroupRatio(req.AccountGroup) {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "account_group must be an existing group"})
		return
	}
	if req.MaxAccounts < 1 || req.MaxAccounts > partnerServerMaxAccountsLimit {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "max_accounts must be between 1 and " + strconv.Itoa(partnerServerMaxAccountsLimit)})
		return
	}
	if req.AccountsPerMinute < 1 || req.AccountsPerMinute > partnerServerAccountsPerMinuteLimit {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "accounts_per_minute must be between 1 and " + strconv.Itoa(partnerServerAccountsPerMinuteLimit)})
		return
	}
	allowlist, err := service.NormalizePartnerServerIPAllowlist(req.IPAllowlist)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	if middleware.RequireSecurityProof(c, service.VerificationOperation{
		Scope:   service.VerificationScopePartnerOAuthClientSensitiveWrite,
		Context: mustPartnerOAuthProofContext(`{"action":"update_server","client_id":"` + client.ClientId + `"}`),
	}) == nil {
		return
	}
	encoded, err := common.Marshal(allowlist)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.SavePartnerServerConfig(&model.PartnerServerConfig{
		ClientId:          client.ClientId,
		Enabled:           req.Enabled,
		AccountGroup:      req.AccountGroup,
		IPAllowlist:       string(encoded),
		MaxAccounts:       req.MaxAccounts,
		AccountsPerMinute: req.AccountsPerMinute,
	}); err != nil {
		common.ApiError(c, err)
		return
	}
	service.InvalidatePartnerServerSnapshot(client.ClientId)
	recordPartnerOAuthAdminAudit(c, "partner_server.config.update", client.ClientId, []string{"enabled", "account_group", "ip_allowlist", "max_accounts", "accounts_per_minute"})
	view, err := buildPartnerServerConfigView(client.ClientId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": view})
}

func CreatePartnerServerSecret(c *gin.Context) {
	client, ok := loadPartnerOAuthClientByParam(c)
	if !ok {
		return
	}
	if middleware.RequireSecurityProof(c, service.VerificationOperation{
		Scope:   service.VerificationScopePartnerOAuthClientSensitiveWrite,
		Context: mustPartnerOAuthProofContext(`{"action":"issue_server_secret","client_id":"` + client.ClientId + `"}`),
	}) == nil {
		return
	}
	secret, err := service.GeneratePartnerServerSecret()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	stored, err := model.CreatePartnerServerSecret(client.ClientId, model.HashPartnerOAuthSecret(secret))
	switch {
	case errors.Is(err, model.ErrPartnerServerConfigNotFound):
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "configure server access before issuing a secret"})
		return
	case errors.Is(err, model.ErrPartnerServerSecretLimit):
		c.JSON(http.StatusConflict, gin.H{"success": false, "message": "revoke an existing secret first; at most two can be active"})
		return
	case err != nil:
		common.ApiError(c, err)
		return
	}
	service.InvalidatePartnerServerSnapshot(client.ClientId)
	model.RecordPartnerOAuthAuthorizationLog(c, model.PartnerOauthAuthorizationLog{Action: "partner_server.secret_issue", Success: true,
		ActorUserId: c.GetInt("id"), ClientId: client.ClientId, Status: http.StatusOK})
	recordPartnerOAuthAdminAudit(c, "partner_server.secret.issue", client.ClientId, []string{"server_secret"})
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{
		"secret": partnerServerSecretView{Id: stored.Id, Status: stored.Status, CreatedAt: stored.CreatedAt},
		"value":  secret,
	}})
}

func RevokePartnerServerSecret(c *gin.Context) {
	client, ok := loadPartnerOAuthClientByParam(c)
	if !ok {
		return
	}
	secretID, err := strconv.ParseInt(c.Param("secret_id"), 10, 64)
	if err != nil || secretID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid secret id"})
		return
	}
	if middleware.RequireSecurityProof(c, service.VerificationOperation{
		Scope:   service.VerificationScopePartnerOAuthClientSensitiveWrite,
		Context: mustPartnerOAuthProofContext(`{"action":"revoke_server_secret","client_id":"` + client.ClientId + `","secret_id":` + strconv.FormatInt(secretID, 10) + `}`),
	}) == nil {
		return
	}
	if err := model.RevokePartnerServerSecret(client.ClientId, secretID); err != nil {
		if errors.Is(err, model.ErrPartnerServerSecretNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "secret not found"})
			return
		}
		common.ApiError(c, err)
		return
	}
	service.InvalidatePartnerServerSnapshot(client.ClientId)
	model.RecordPartnerOAuthAuthorizationLog(c, model.PartnerOauthAuthorizationLog{Action: "partner_server.secret_revoke", Success: true,
		ActorUserId: c.GetInt("id"), ClientId: client.ClientId, Status: http.StatusOK})
	recordPartnerOAuthAdminAudit(c, "partner_server.secret.revoke", client.ClientId, []string{"server_secret"})
	c.JSON(http.StatusOK, gin.H{"success": true})
}
