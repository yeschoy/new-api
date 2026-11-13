package model

import (
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	PartnerTenantAuditDenied           = "partner_tenant.auth.denied"
	PartnerTenantAuditIssue            = "partner_tenant.credential.issue"
	PartnerTenantAuditClaim            = "partner_tenant.subscription_key.claim"
	PartnerTenantAuditRotate           = "partner_tenant.subscription_key.rotate"
	PartnerTenantAuditRead             = "partner_tenant.subscription.read"
	PartnerTenantAuditReceiptContext   = "partner_tenant_audit_receipt"
	PartnerTenantAuditReasonContext    = "partner_tenant_audit_reason"
	PartnerTenantAuditOperationContext = "partner_tenant_audit_operation"
)

// Separate from secret-bearing persistence models and public business DTOs.
// Only populated from a verified principal / locked owning binding.
type PartnerTenantAuditReceipt struct {
	TenantId        int64
	OrderNo         string
	SubscriptionId  int64
	IntegrationMode string
	KeyVersion      int64
	TargetUserId    int
	Replayed        bool
}

func PartnerTenantAuditPrincipal(t *PartnerTenant) PartnerTenantAuditReceipt {
	if t == nil {
		return PartnerTenantAuditReceipt{}
	}
	mode := t.IntegrationMode
	if mode != PartnerTenantIntegrationSubscriptionKey && mode != PartnerTenantIntegrationHostedH5 {
		mode = ""
	}
	return PartnerTenantAuditReceipt{TenantId: t.Id, IntegrationMode: mode}
}
func partnerTenantBindingReceipt(t *PartnerTenant, b *partnerTenantSubscriptionBinding) PartnerTenantAuditReceipt {
	r := PartnerTenantAuditPrincipal(t)
	r.OrderNo = b.orderNo
	r.SubscriptionId, r.KeyVersion, r.TargetUserId = int64(b.subscription.Id), b.key.KeyVersion, b.account.UserId
	return r
}
func ValidPartnerTenantAuditReason(reason string) bool {
	switch reason {
	case "", "invalid_request", "invalid_partner_secret", "invalid_subscription_key", "integration_mode_mismatch", "account_disabled", "credential_unavailable", "subscription_key_not_ready", "subscription_key_changed", "subscription_key_unavailable", "resource_not_found", "idempotency_conflict", "rate_limited", "server_error", "invalid_purchase_access":
		return true
	}
	return false
}
func SetPartnerTenantAuditReason(c *gin.Context, reason string) {
	if !ValidPartnerTenantAuditReason(reason) {
		switch reason {
		case "order_not_found", "subscription_not_found", "subscription_key_not_found", "plan_not_found", "purchase_session_not_found":
			reason = "resource_not_found"
		default:
			reason = "operation_failed"
		}
	}
	c.Set(PartnerTenantAuditReasonContext, reason)
}
func RecordPartnerTenantAudit(c *gin.Context, action string, status int, success bool, reason string, r PartnerTenantAuditReceipt) {
	if success {
		reason = ""
	}
	RecordPartnerOAuthAuthorizationLog(c, PartnerOauthAuthorizationLog{Action: action, Status: status, Success: success, Reason: reason, TenantId: r.TenantId, OrderNo: r.OrderNo, SubscriptionId: r.SubscriptionId, IntegrationMode: r.IntegrationMode, KeyVersion: r.KeyVersion, Replayed: r.Replayed, TargetUserId: r.TargetUserId})
}
func positiveAuditDecimal(id int64) string {
	if id <= 0 {
		return ""
	}
	return strconv.FormatInt(id, 10)
}

// Preserve every legacy field/type; only the new identifiers use decimal text.
type PartnerTenantAuthorizationLogView struct {
	PartnerOauthAuthorizationLog
	TenantID       string `json:"tenant_id"`
	SubscriptionID string `json:"subscription_id"`
	Version        string `json:"key_version"`
}

func PartnerTenantAuthorizationLogViews(rows []PartnerOauthAuthorizationLog) []PartnerTenantAuthorizationLogView {
	views := make([]PartnerTenantAuthorizationLogView, 0, len(rows))
	for _, r := range rows {
		views = append(views, PartnerTenantAuthorizationLogView{PartnerOauthAuthorizationLog: r, TenantID: positiveAuditDecimal(r.TenantId), SubscriptionID: positiveAuditDecimal(r.SubscriptionId), Version: positiveAuditDecimal(r.KeyVersion)})
	}
	return views
}
func validPartnerTenantAuditMetadata(e PartnerOauthAuthorizationLog) bool {
	tenantAction := strings.HasPrefix(e.Action, "partner_tenant.")
	if !tenantAction {
		return e.TenantId == 0 && e.SubscriptionId == 0 && e.OrderNo == "" && e.IntegrationMode == "" && e.KeyVersion == 0 && !e.Replayed
	}
	if !ValidPartnerTenantAuditReason(e.Reason) || e.TenantId < 0 || e.SubscriptionId < 0 || e.KeyVersion < 0 || e.ClientId != "" || e.BindingId != "" || e.ActorUserId != 0 || e.Success && e.Reason != "" || !e.Success && e.Reason == "" {
		return false
	}
	switch e.Reason {
	case "subscription_key_not_ready":
		if e.Action != PartnerTenantAuditClaim {
			return false
		}
	case "subscription_key_changed", "idempotency_conflict":
		if e.Action != PartnerTenantAuditRotate {
			return false
		}
	case "invalid_purchase_access":
		if e.Action != PartnerTenantAuditDenied {
			return false
		}
	case "invalid_subscription_key":
		if e.Action != PartnerTenantAuditDenied && e.Action != PartnerTenantAuditRead {
			return false
		}
	case "resource_not_found":
		if e.Action == PartnerTenantAuditDenied || e.Action == PartnerTenantAuditIssue {
			return false
		}
	}
	if e.IntegrationMode != "" && e.IntegrationMode != PartnerTenantIntegrationSubscriptionKey && e.IntegrationMode != PartnerTenantIntegrationHostedH5 {
		return false
	}
	if e.TenantId == 0 && (e.SubscriptionId != 0 || e.KeyVersion != 0 || e.TargetUserId != 0 || e.OrderNo != "" || e.IntegrationMode != "") {
		return false
	}
	if e.OrderNo != "" && !partnerTenantAuditOrderNo.MatchString(e.OrderNo) {
		return false
	}
	if e.Success && e.Action != PartnerTenantAuditDenied && (e.TenantId == 0 || e.SubscriptionId == 0 || e.KeyVersion == 0 || e.TargetUserId == 0) {
		return false
	}
	if e.Replayed && (e.Action != PartnerTenantAuditRotate || !e.Success) {
		return false
	}
	if e.Action == PartnerTenantAuditDenied && e.Success {
		return false
	}
	if e.Action == PartnerTenantAuditIssue && (!e.Success || e.TenantId == 0 || e.OrderNo == "" || e.SubscriptionId == 0 || e.KeyVersion == 0 || e.TargetUserId == 0) {
		return false
	}
	return true
}

// Carries only a current authenticated principal when locked policy supersedes
// middleware admission. errors.Is remains compatible with the mode contract.
type PartnerTenantAuditAdmissionError struct{ Receipt PartnerTenantAuditReceipt }

func (e *PartnerTenantAuditAdmissionError) Error() string {
	return ErrPartnerTenantIntegrationMode.Error()
}
func (e *PartnerTenantAuditAdmissionError) Unwrap() error { return ErrPartnerTenantIntegrationMode }
