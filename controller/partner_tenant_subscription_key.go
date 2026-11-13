package controller

import (
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

// Scoped recovery avoids Gin's default request dump (which only masks
// Authorization, not X-Subscription-Key). Install before authentication/body work.
func PartnerTenantSubscriptionKeyRequestPolicy() gin.HandlerFunc {
	recovery := gin.CustomRecoveryWithWriter(io.Discard, func(c *gin.Context, _ any) {
		writePartnerTenantAPIError(c, 500, "server_error", "please try again later")
		c.Abort()
	})
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		if path != "/api/partner/subscription" && !strings.HasPrefix(path, "/api/partner/v1/subscription-key-orders") && !strings.HasPrefix(path, "/api/partner/v1/subscriptions/") {
			partnerTenantPurchasePrivacy(c)
			recovery(c)
			return
		}
		partnerTenantPurchasePrivacy(c)
		for _, name := range []string{"Authorization", "Idempotency-Key", "X-Subscription-Key"} {
			if _, _, ok := partnerTenantSingleHeader(c, name); !ok {
				writePartnerTenantAPIError(c, 400, "invalid_request", "credential and idempotency headers must be single valued")
				c.Abort()
				return
			}
		}
		recovery(c)
	}
}

func partnerTenantSubscriptionKeyError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, model.ErrPartnerTenantSubscriptionKeyInvalid):
		writePartnerTenantAPIError(c, 401, "invalid_subscription_key", "subscription authentication failed")
	case errors.Is(err, model.ErrPartnerTenantSubscriptionKeyUnavailable):
		writePartnerTenantAPIError(c, 503, "subscription_key_unavailable", "subscription key is temporarily unavailable")
	case errors.Is(err, model.ErrPartnerTenantSubscriptionKeyNotFound):
		writePartnerTenantAPIError(c, 404, "subscription_key_not_found", "subscription key not found")
	case errors.Is(err, model.ErrPartnerTenantSubscriptionKeyNotReady):
		writePartnerTenantAPIError(c, 409, "subscription_key_not_ready", "payment and delivery must complete before claiming the key")
	case errors.Is(err, model.ErrPartnerTenantSubscriptionKeyChanged):
		writePartnerTenantAPIError(c, 409, "subscription_key_changed", "subscription key version has changed")
	case errors.Is(err, model.ErrPartnerTenantSubscriptionNotFound):
		writePartnerTenantAPIError(c, 404, "subscription_not_found", "subscription not found")
	default:
		partnerTenantOrderError(c, err)
	}
}

// Inspect all values, not GetHeader's first-value normalization. Reject comma
// lists, duplicate differently-cased header names, and whitespace aliases.
func partnerTenantSingleHeader(c *gin.Context, name string) (string, bool, bool) {
	var values []string
	present := false
	for key, vs := range c.Request.Header {
		if strings.EqualFold(key, name) {
			present = true
			values = append(values, vs...)
		}
	}
	if !present {
		return "", false, true
	}
	if len(values) != 1 || values[0] == "" || values[0] != strings.TrimSpace(values[0]) || strings.Contains(values[0], ",") {
		return "", true, false
	}
	return values[0], true, true
}
func partnerTenantSubscriptionMerchant(c *gin.Context) (*model.PartnerTenant, bool) {
	partnerTenantPurchasePrivacy(c)
	tenant := middleware.PartnerTenantFromContext(c)
	if tenant == nil {
		partnerTenantOrderError(c, model.ErrPartnerTenantNotFound)
		return nil, false
	}
	auth, present, ok := partnerTenantSingleHeader(c, "Authorization")
	if !ok || !present || !strings.HasPrefix(auth, "Bearer pt_") {
		writePartnerTenantAPIError(c, 400, "invalid_request", "a single merchant Authorization header is required")
		return nil, false
	}
	if partnerTenantPurchaseHasQuery(c) {
		writePartnerTenantAPIError(c, 400, "invalid_request", "query parameters are not accepted")
		return nil, false
	}
	return tenant, true
}
func partnerTenantSubscriptionIdempotency(c *gin.Context) (string, bool) {
	value, present, ok := partnerTenantSingleHeader(c, "Idempotency-Key")
	hash, err := service.ValidatePartnerOAuthIdempotencyKey(value)
	if !ok || !present || err != nil {
		writePartnerTenantAPIError(c, 400, "invalid_request", "a single Idempotency-Key of 16-64 URL-safe characters is required")
		return "", false
	}
	return hash, true
}
func partnerTenantNoSubscriptionHeader(c *gin.Context) bool {
	if _, present, _ := partnerTenantSingleHeader(c, "X-Subscription-Key"); present {
		writePartnerTenantAPIError(c, 400, "invalid_request", "X-Subscription-Key is accepted only when creating a renewal order")
		return false
	}
	return true
}
func PartnerTenantCreateSubscriptionKeyOrder(c *gin.Context) {
	tenant, ok := partnerTenantSubscriptionMerchant(c)
	if !ok {
		return
	}
	hash, ok := partnerTenantSubscriptionIdempotency(c)
	if !ok {
		return
	}
	renewal, present, ok := partnerTenantSingleHeader(c, "X-Subscription-Key")
	if !ok || present && !model.IsValidPartnerTenantSubscriptionKey(renewal) {
		partnerTenantSubscriptionKeyError(c, model.ErrPartnerTenantSubscriptionKeyInvalid)
		return
	}
	var req struct {
		PlanId        int    `json:"plan_id"`
		PaymentMethod string `json:"payment_method"`
	}
	if !decodePartnerTenantPurchaseBody(c, &req, "plan_id", "payment_method") || req.PlanId < 1 || req.PaymentMethod == "" || len(req.PaymentMethod) > 16 {
		writePartnerTenantAPIError(c, 400, "invalid_request", "plan_id and payment_method are required")
		return
	}
	order, created, err := model.CreatePartnerTenantSubscriptionKeyOrder(model.PartnerTenantSubscriptionKeyOrderInput{TenantId: tenant.Id, TenantSecretHash: tenant.SecretHash, IdempotencyHash: hash,
		PlanId: req.PlanId, PaymentMethod: req.PaymentMethod, MerchantId: operation_setting.EpayId, SubscriptionKey: renewal}, func() error { return validatePartnerTenantNewCheckout(req.PaymentMethod) })
	if err != nil {
		partnerTenantSubscriptionKeyError(c, err)
		return
	}
	// Shared preparation and cashier stay mode neutral; no raw long-lived secret
	// is sent to the provider or included in this safe initial DTO.
	respondPartnerTenantCreatedOrder(c, order, created)
}
func PartnerTenantGetSubscriptionKeyOrder(c *gin.Context) {
	tenant, ok := partnerTenantSubscriptionMerchant(c)
	if !ok || !partnerTenantNoSubscriptionHeader(c) {
		return
	}
	if !validPartnerTenantOrderNo(c.Param("order_no")) {
		writePartnerTenantAPIError(c, 400, "invalid_request", "request is invalid")
		return
	}
	order, err := model.GetPartnerTenantSubscriptionKeyOrder(tenant.Id, tenant.SecretHash, c.Param("order_no"))
	if err != nil {
		partnerTenantSubscriptionKeyError(c, err)
		return
	}
	c.JSON(http.StatusOK, partnerTenantOrderDTO(order, false))
}
func PartnerTenantClaimSubscriptionKey(c *gin.Context) {
	c.Set(model.PartnerTenantAuditOperationContext, model.PartnerTenantAuditClaim)
	tenant, ok := partnerTenantSubscriptionMerchant(c)
	if !ok || !partnerTenantNoSubscriptionHeader(c) {
		return
	}
	if !validPartnerTenantOrderNo(c.Param("order_no")) {
		writePartnerTenantAPIError(c, 400, "invalid_request", "request is invalid")
		return
	}
	var audit model.PartnerTenantAuditReceipt
	result, err := model.ClaimPartnerTenantSubscriptionKeyWithAudit(tenant.Id, tenant.SecretHash, c.Param("order_no"), &audit)
	c.Set(model.PartnerTenantAuditReceiptContext, audit)
	if err != nil {
		partnerTenantSubscriptionKeyError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}
func PartnerTenantRotateSubscriptionKey(c *gin.Context) {
	c.Set(model.PartnerTenantAuditOperationContext, model.PartnerTenantAuditRotate)
	tenant, ok := partnerTenantSubscriptionMerchant(c)
	if !ok || !partnerTenantNoSubscriptionHeader(c) {
		return
	}
	hash, ok := partnerTenantSubscriptionIdempotency(c)
	if !ok {
		return
	}
	id, err := strconv.Atoi(c.Param("subscription_id"))
	var req struct {
		ExpectedVersion int64 `json:"expected_version"`
	}
	if err != nil || id < 1 || strconv.Itoa(id) != c.Param("subscription_id") || !decodePartnerTenantPurchaseBody(c, &req, "expected_version") || req.ExpectedVersion < 1 {
		writePartnerTenantAPIError(c, 400, "invalid_request", "subscription_id and expected_version are invalid")
		return
	}
	var audit model.PartnerTenantAuditReceipt
	result, err := model.RotatePartnerTenantSubscriptionKeyWithAudit(tenant.Id, tenant.SecretHash, id, req.ExpectedVersion, hash, &audit)
	c.Set(model.PartnerTenantAuditReceiptContext, audit)
	if err != nil {
		partnerTenantSubscriptionKeyError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}
func PartnerTenantIndependentSubscription(c *gin.Context) {
	c.Set(model.PartnerTenantAuditOperationContext, model.PartnerTenantAuditRead)
	partnerTenantPurchasePrivacy(c)
	if partnerTenantPurchaseHasQuery(c) {
		writePartnerTenantAPIError(c, 400, "invalid_request", "query parameters are not accepted")
		return
	}
	auth, present, ok := partnerTenantSingleHeader(c, "Authorization")
	if !ok || !present || !strings.HasPrefix(auth, "Bearer ") || !model.IsValidPartnerTenantSubscriptionKey(strings.TrimPrefix(auth, "Bearer ")) {
		partnerTenantSubscriptionKeyError(c, model.ErrPartnerTenantSubscriptionKeyInvalid)
		return
	}
	if !partnerTenantNoSubscriptionHeader(c) {
		return
	}
	// Existing rate-limiter state receives only a one-way digest, never Bearer.
	middleware.PartnerOAuthRateLimit("PT-SUBKEY-"+model.HashPartnerOAuthSecret(auth), 120, 60, "integration")(c)
	if c.IsAborted() {
		return
	}
	var audit model.PartnerTenantAuditReceipt
	result, err := model.QueryPartnerTenantSubscriptionWithAudit(strings.TrimPrefix(auth, "Bearer "), &audit)
	c.Set(model.PartnerTenantAuditReceiptContext, audit)
	if err != nil {
		partnerTenantSubscriptionKeyError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}
