package controller

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

type partnerTenantPurchaseSessionView struct {
	SessionId       string `json:"session_id"`
	ExternalUserId  string `json:"external_user_id"`
	CreatedAt       int64  `json:"created_at"`
	LaunchExpiresAt int64  `json:"launch_expires_at"`
	ExpiresAt       int64  `json:"expires_at"`
	PurchaseURL     string `json:"purchase_url,omitempty"`
}

type partnerTenantPurchasePlanView struct {
	Id                int    `json:"id"`
	Title             string `json:"title"`
	Subtitle          string `json:"subtitle"`
	Amount            string `json:"amount"`
	Currency          string `json:"currency"`
	DurationUnit      string `json:"duration_unit"`
	DurationValue     int    `json:"duration_value"`
	TotalAmount       string `json:"total_amount"`
	QuotaUnlimited    bool   `json:"quota_unlimited"`
	RequestsPerMinute int    `json:"requests_per_minute"`
}

type partnerTenantPurchaseOrderView struct {
	OrderNo           string `json:"order_no"`
	PlanId            int    `json:"plan_id"`
	PaymentMethod     string `json:"payment_method"`
	PaymentStatus     string `json:"payment_status"`
	FulfillmentStatus string `json:"fulfillment_status"`
	ExpiresAt         int64  `json:"expires_at"`
	CheckoutURL       string `json:"checkout_url,omitempty"`
}

func partnerTenantPurchaseSessionDTO(s *model.PartnerTenantPurchaseSession) partnerTenantPurchaseSessionView {
	return partnerTenantPurchaseSessionView{SessionId: s.SessionId, ExternalUserId: s.ExternalUserId, CreatedAt: s.CreatedAt, LaunchExpiresAt: s.LaunchExpiresAt, ExpiresAt: s.ExpiresAt}
}

func partnerTenantPurchaseURL(s *model.PartnerTenantPurchaseSession) (string, error) {
	// Reuse the cashier's trusted callback-origin validation, not a client Host
	// header, arbitrary redirect or separate origin policy.
	trusted, err := partnerTenantCheckoutURL(&model.PartnerTenantSubscriptionOrder{})
	if err != nil {
		return "", err
	}
	origin, err := url.Parse(trusted)
	if err != nil {
		return "", model.ErrPartnerTenantOrderUnavailable
	}
	origin.Path, origin.RawPath = "/partner/purchase", ""
	origin.RawQuery = url.Values{"session_id": []string{s.SessionId}}.Encode()
	origin.Fragment = "launch=" + model.PartnerTenantPurchaseLaunchCode(s)
	return origin.String(), nil
}

func partnerTenantPurchaseError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, model.ErrPartnerTenantPurchaseAccess):
		writePartnerTenantAPIError(c, 401, "invalid_purchase_access", "purchase access is invalid or expired; return to the merchant")
	case errors.Is(err, model.ErrPartnerTenantPurchaseSessionNotFound):
		writePartnerTenantAPIError(c, 404, "purchase_session_not_found", "purchase session not found")
	default:
		partnerTenantOrderError(c, err)
	}
}

func partnerTenantPurchasePrivacy(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.Header("Pragma", "no-cache")
	c.Header("Referrer-Policy", "no-referrer")
}

func partnerTenantPurchaseHasQuery(c *gin.Context) bool {
	return c.Request.URL.RawQuery != "" || c.Request.URL.ForceQuery
}

// Strict bounded objects: refuse unknown, duplicate and case-aliased fields as
// well as concatenated JSON. Never permit browser identity/price overrides.
func decodePartnerTenantPurchaseBody(c *gin.Context, dst any, fields ...string) bool {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 2048)
	decoder := json.NewDecoder(c.Request.Body)
	start, err := decoder.Token()
	if err != nil || start != json.Delim('{') {
		return false
	}
	values := make(map[string]json.RawMessage, len(fields))
	for decoder.More() {
		token, err := decoder.Token()
		if err != nil {
			return false
		}
		key, ok := token.(string)
		if !ok {
			return false
		}
		allowed := false
		for _, field := range fields {
			if key == field {
				allowed = true
				break
			}
		}
		if !allowed {
			return false
		}
		if _, duplicate := values[key]; duplicate {
			return false
		}
		var value json.RawMessage
		if decoder.Decode(&value) != nil || string(value) == "null" {
			return false
		}
		values[key] = value
	}
	end, err := decoder.Token()
	if err != nil || end != json.Delim('}') || decoder.Decode(&struct{}{}) != io.EOF || len(values) != len(fields) {
		return false
	}
	body, err := json.Marshal(values)
	return err == nil && json.Unmarshal(body, dst) == nil
}

func PartnerTenantCreatePurchaseSession(c *gin.Context) {
	partnerTenantPurchasePrivacy(c)
	tenant := middleware.PartnerTenantFromContext(c)
	if tenant == nil {
		partnerTenantOrderError(c, model.ErrPartnerTenantNotFound)
		return
	}
	var req struct {
		ExternalUserId string `json:"external_user_id"`
	}
	if partnerTenantPurchaseHasQuery(c) || !decodePartnerTenantPurchaseBody(c, &req, "external_user_id") {
		writePartnerTenantAPIError(c, 400, "invalid_request", "request body is invalid")
		return
	}
	req.ExternalUserId = strings.TrimSpace(req.ExternalUserId)
	if !model.IsValidPartnerTenantExternalUserID(req.ExternalUserId) {
		writePartnerTenantAPIError(c, 400, "invalid_request", "external_user_id is required")
		return
	}
	hash, err := service.ValidatePartnerOAuthIdempotencyKey(c.GetHeader("Idempotency-Key"))
	if err != nil {
		writePartnerTenantAPIError(c, 400, "invalid_request", "Idempotency-Key must be 16-64 URL-safe characters")
		return
	}
	// Refuse invalid configuration before creating an entry. No payment channel
	// is required yet: the public page can honestly display an empty state.
	if _, err := partnerTenantPurchaseURL(&model.PartnerTenantPurchaseSession{}); err != nil {
		partnerTenantPurchaseError(c, err)
		return
	}
	session, created, err := model.CreatePartnerTenantPurchaseSession(tenant.Id, tenant.SecretHash, req.ExternalUserId, hash)
	if err != nil {
		partnerTenantPurchaseError(c, err)
		return
	}
	view := partnerTenantPurchaseSessionDTO(session)
	view.PurchaseURL, err = partnerTenantPurchaseURL(session)
	if err != nil {
		partnerTenantPurchaseError(c, err)
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	c.JSON(status, view)
}

func partnerTenantPurchaseOrder(s *model.PartnerTenantPurchaseSession) (*model.PartnerTenantSubscriptionOrder, error) {
	order, err := model.FindPartnerTenantOrderByIdempotency(s.TenantId, model.PartnerTenantPurchaseOrderIdempotencyHash(s.SessionId))
	if errors.Is(err, model.ErrPartnerTenantOrderNotFound) {
		return nil, nil
	}
	return order, err
}

func PartnerTenantGetPurchaseSession(c *gin.Context) {
	partnerTenantPurchasePrivacy(c)
	tenant := middleware.PartnerTenantFromContext(c)
	if tenant == nil {
		partnerTenantOrderError(c, model.ErrPartnerTenantNotFound)
		return
	}
	if partnerTenantPurchaseHasQuery(c) || !model.IsValidPartnerTenantPurchaseSessionID(c.Param("session_id")) {
		writePartnerTenantAPIError(c, 400, "invalid_request", "request is invalid")
		return
	}
	session, err := model.GetPartnerTenantPurchaseSession(tenant.Id, c.Param("session_id"))
	if err != nil {
		partnerTenantPurchaseError(c, err)
		return
	}
	order, err := partnerTenantPurchaseOrder(session)
	if err != nil {
		partnerTenantPurchaseError(c, err)
		return
	}
	var orderView *partnerTenantOrderView
	if order != nil {
		view := partnerTenantOrderDTO(order, false)
		orderView = &view
	}
	c.JSON(http.StatusOK, struct {
		partnerTenantPurchaseSessionView
		Redeemed bool                    `json:"redeemed"`
		Order    *partnerTenantOrderView `json:"order"`
	}{partnerTenantPurchaseSessionDTO(session), session.ClientNonceHash != nil, orderView})
}

func PartnerTenantExchangePurchaseSession(c *gin.Context) {
	partnerTenantPurchasePrivacy(c)
	var req struct {
		LaunchCode  string `json:"launch_code"`
		ClientNonce string `json:"client_nonce"`
	}
	if partnerTenantPurchaseHasQuery(c) || !decodePartnerTenantPurchaseBody(c, &req, "launch_code", "client_nonce") || len(req.LaunchCode) != 67 || !strings.HasPrefix(req.LaunchCode, "pl_") {
		partnerTenantPurchaseError(c, model.ErrPartnerTenantPurchaseAccess)
		return
	}
	session, err := model.ExchangePartnerTenantPurchaseSession(c.Param("session_id"), req.LaunchCode, req.ClientNonce, time.Now().Unix())
	if err != nil {
		partnerTenantPurchaseError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"session_id": session.SessionId, "expires_at": session.ExpiresAt, "access_token": model.PartnerTenantPurchaseAccessToken(session)})
}

func authorizePartnerTenantPurchase(c *gin.Context) (*model.PartnerTenantPurchaseSession, *model.PartnerTenant, bool) {
	partnerTenantPurchasePrivacy(c)
	header := c.GetHeader("Authorization")
	if partnerTenantPurchaseHasQuery(c) || !strings.HasPrefix(header, "Bearer ps_") || len(header) != len("Bearer ps_")+64 {
		partnerTenantPurchaseError(c, model.ErrPartnerTenantPurchaseAccess)
		return nil, nil, false
	}
	session, tenant, err := model.AuthorizePartnerTenantPurchaseSession(c.Param("session_id"), strings.TrimPrefix(header, "Bearer "), time.Now().Unix())
	if err != nil {
		partnerTenantPurchaseError(c, err)
		return nil, nil, false
	}
	return session, tenant, true
}

func PartnerTenantPublicPurchaseSession(c *gin.Context) {
	session, tenant, ok := authorizePartnerTenantPurchase(c)
	if !ok {
		return
	}
	plans, err := model.ListPartnerTenantPurchasePlans(tenant)
	if err != nil {
		partnerTenantPurchaseError(c, err)
		return
	}
	views := make([]partnerTenantPurchasePlanView, 0, len(plans))
	for _, plan := range plans {
		cents, err := model.PartnerTenantPlanCents(plan.PriceAmount)
		if err != nil {
			continue
		}
		views = append(views, partnerTenantPurchasePlanView{Id: plan.Id, Title: plan.Title, Subtitle: plan.Subtitle, Amount: fmt.Sprintf("%d.%02d", cents/100, cents%100), Currency: plan.Currency,
			DurationUnit: plan.DurationUnit, DurationValue: plan.DurationValue, TotalAmount: strconv.FormatInt(plan.TotalAmount, 10), QuotaUnlimited: plan.TotalAmount == 0, RequestsPerMinute: plan.RequestsPerMinute})
	}
	methods := make([]partnerPaymentMethod, 0)
	for _, method := range partnerEpayMethods() {
		if len(method.ID) <= 16 && partnerEpayMethodAvailable(method.ID) {
			methods = append(methods, method)
		}
	}
	order, err := partnerTenantPurchaseOrder(session)
	if err != nil {
		partnerTenantPurchaseError(c, err)
		return
	}
	var orderView *partnerTenantPurchaseOrderView
	if order != nil {
		orderView = &partnerTenantPurchaseOrderView{OrderNo: order.OrderNo, PlanId: order.PlanId, PaymentMethod: order.PaymentMethod, PaymentStatus: order.VisiblePaymentStatus(time.Now().Unix()), FulfillmentStatus: order.FulfillmentStatus, ExpiresAt: order.ExpiresAt}
		if time.Now().Unix() < order.ExpiresAt {
			orderView.CheckoutURL, err = partnerTenantCheckoutURL(order)
			if err != nil {
				partnerTenantPurchaseError(c, err)
				return
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{"session_id": session.SessionId, "expires_at": session.ExpiresAt, "merchant_name": tenant.Name, "plans": views, "payment_methods": methods, "order": orderView})
}

func PartnerTenantPurchaseSessionCreateOrder(c *gin.Context) {
	session, _, ok := authorizePartnerTenantPurchase(c)
	if !ok {
		return
	}
	var req struct {
		PlanId        int    `json:"plan_id"`
		PaymentMethod string `json:"payment_method"`
	}
	if !decodePartnerTenantPurchaseBody(c, &req, "plan_id", "payment_method") || req.PlanId <= 0 || req.PaymentMethod == "" || len(req.PaymentMethod) > 16 {
		writePartnerTenantAPIError(c, 400, "invalid_request", "plan_id and payment_method are required")
		return
	}
	order, created, err := model.CreatePartnerTenantPurchaseOrder(session.SessionId, strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer "), req.PlanId, req.PaymentMethod,
		operation_setting.EpayId, func() error { return validatePartnerTenantNewCheckout(req.PaymentMethod) })
	if err != nil {
		partnerTenantPurchaseError(c, err)
		return
	}
	if err := preparePartnerTenantCheckout(c, order); err != nil {
		partnerTenantPurchaseError(c, err)
		return
	}
	checkoutURL, err := partnerTenantCheckoutURL(order)
	if err != nil {
		partnerTenantPurchaseError(c, err)
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	c.JSON(status, gin.H{"order_no": order.OrderNo, "checkout_url": checkoutURL})
}
