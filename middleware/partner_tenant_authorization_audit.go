package middleware

import (
	"context"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// Installed after request-ID/privacy, before parser/auth/rate/recovery. It only
// observes approved credential outcomes, not arbitrary successful route access.
func PartnerTenantAuthorizationAudit() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Production normally has RequestId globally; standalone routers still get
		// server-generated correlation, never an incoming header copied into logs.
		if c.GetString(common.RequestIdKey) == "" {
			id := common.NewRequestId()
			c.Set(common.RequestIdKey, id)
			c.Request = c.Request.WithContext(context.WithValue(c.Request.Context(), common.RequestIdKey, id))
			c.Header("X-Request-Id", id)
		}
		c.Next()
		status := c.Writer.Status()
		action := c.GetString(model.PartnerTenantAuditOperationContext)
		if c.FullPath() == "/api/partner/subscription" {
			action = model.PartnerTenantAuditRead
		}
		reason := c.GetString(model.PartnerTenantAuditReasonContext)
		if action == "" {
			if status < 400 {
				return
			}
			// Only credential/policy/parser/rate/recovery failures, not generic resource errors.
			switch reason {
			case "invalid_request", "invalid_partner_secret", "invalid_subscription_key", "integration_mode_mismatch", "invalid_purchase_access", "rate_limited", "server_error", "account_disabled", "credential_unavailable", "subscription_key_unavailable":
			default:
				if status != 429 && status != 500 {
					return
				}
			}
			action = model.PartnerTenantAuditDenied
		}
		success := status >= 200 && status < 300
		if !success && (reason == "" || !model.ValidPartnerTenantAuditReason(reason)) {
			if status == 429 {
				reason = "rate_limited"
			} else {
				reason = "server_error"
			}
		}
		var receipt model.PartnerTenantAuditReceipt
		if value, ok := c.Get(model.PartnerTenantAuditReceiptContext); ok {
			receipt, _ = value.(model.PartnerTenantAuditReceipt)
		}
		model.RecordPartnerTenantAudit(c, action, status, success, reason, receipt)
	}
}
