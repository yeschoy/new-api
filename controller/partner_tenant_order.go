package controller

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Calcium-Ion/go-epay/epay"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
)

type partnerTenantOrderView struct {
	OrderNo           string `json:"order_no"`
	ExternalUserId    string `json:"external_user_id,omitempty"`
	PlanId            int    `json:"plan_id,omitempty"`
	PlanTitle         string `json:"plan_title"`
	Amount            string `json:"amount"`
	Currency          string `json:"currency"`
	PaymentMethod     string `json:"payment_method"`
	PaymentStatus     string `json:"payment_status"`
	FulfillmentStatus string `json:"fulfillment_status"`
	CreatedAt         int64  `json:"created_at"`
	ExpiresAt         int64  `json:"expires_at"`
	CheckoutURL       string `json:"checkout_url,omitempty"`
	QRCode            string `json:"qr_code,omitempty"`
	PayURL            string `json:"pay_url,omitempty"`
	SubscriptionId    int    `json:"subscription_id,omitempty"`
}

func partnerTenantOrderDTO(order *model.PartnerTenantSubscriptionOrder, public bool) partnerTenantOrderView {
	view := partnerTenantOrderView{OrderNo: order.OrderNo, PlanTitle: order.PlanTitle, Amount: order.Amount(), Currency: order.Currency,
		PaymentMethod: order.PaymentMethod, PaymentStatus: order.VisiblePaymentStatus(time.Now().Unix()), FulfillmentStatus: order.FulfillmentStatus,
		CreatedAt: order.CreatedAt, ExpiresAt: order.ExpiresAt}
	if public {
		if view.PaymentStatus == "pending" {
			view.QRCode, view.PayURL = order.QRCode, order.PayURL
		}
	} else {
		view.ExternalUserId, view.PlanId, view.SubscriptionId = order.ExternalUserId, order.PlanId, order.SubscriptionId
	}
	return view
}

// Purpose-separated from login tokens. SESSION_SECRET/CRYPTO_SECRET must be
// stable across restarts and replicas; rotating it intentionally revokes links.
// Expiry is immutable order data, so replays produce the identical capability.
func partnerTenantCashierToken(order *model.PartnerTenantSubscriptionOrder) string {
	mac := hmac.New(sha256.New, []byte(common.CryptoSecret))
	_, _ = fmt.Fprintf(mac, "partner-tenant-cashier:v1\x00%s\x00%d", order.OrderNo, order.ExpiresAt)
	return "pc_" + hex.EncodeToString(mac.Sum(nil))
}
func validPartnerTenantCashierToken(order *model.PartnerTenantSubscriptionOrder, token string, now int64) bool {
	expected := partnerTenantCashierToken(order)
	return len(token) == len(expected) && hmac.Equal([]byte(token), []byte(expected)) && now < order.ExpiresAt
}
func partnerTenantCheckoutURL(order *model.PartnerTenantSubscriptionOrder) (string, error) {
	origin, err := url.Parse(strings.TrimSpace(service.GetCallbackAddress()))
	if err != nil || origin.Scheme != "https" || origin.Host == "" || origin.User != nil || origin.RawQuery != "" || origin.Fragment != "" || (origin.Path != "" && origin.Path != "/") {
		return "", model.ErrPartnerTenantOrderUnavailable
	}
	origin.Path = "/partner/checkout"
	origin.RawPath = ""
	origin.RawQuery = url.Values{"order_no": []string{order.OrderNo}}.Encode()
	origin.Fragment = "token=" + partnerTenantCashierToken(order)
	return origin.String(), nil
}

func partnerTenantOrderError(c *gin.Context, err error) {
	var admission *model.PartnerTenantAuditAdmissionError
	if errors.As(err, &admission) {
		c.Set(model.PartnerTenantAuditReceiptContext, admission.Receipt)
	}
	status, code, message := http.StatusInternalServerError, "server_error", "please try again later"
	switch {
	case errors.Is(err, model.ErrPartnerTenantIntegrationMode):
		status, code, message = 403, "integration_mode_mismatch", "operation is not allowed for this integration mode"
	case errors.Is(err, model.ErrPartnerTenantIdempotencyConflict):
		status, code, message = 409, "idempotency_conflict", "Idempotency-Key was used with a different request"
	case errors.Is(err, model.ErrPartnerTenantPlanNotFound):
		status, code, message = 404, "plan_not_found", "plan is unavailable"
	case errors.Is(err, model.ErrPartnerTenantOrderNotFound):
		status, code, message = 404, "order_not_found", "order not found"
	case errors.Is(err, model.ErrPartnerTenantNotFound):
		status, code, message = 401, "invalid_partner_secret", "partner authentication failed"
	case errors.Is(err, model.ErrPartnerTenantAccountDisabled):
		status, code, message = 403, "account_disabled", "account is disabled"
	case errors.Is(err, model.ErrPartnerTenantCredentialUnavailable):
		status, code, message = 409, "credential_unavailable", "account credential is unavailable"
	case errors.Is(err, model.ErrPartnerTenantPurchaseLimit):
		status, code, message = 409, "purchase_limit_reached", "purchase limit for this plan has been reached"
	case errors.Is(err, model.ErrPartnerTenantUnsupportedCurrency):
		status, code, message = 400, "unsupported_currency", "Epay supports CNY plans only"
	case errors.Is(err, model.ErrPartnerTenantOrderLimited):
		status, code, message = 429, "rate_limited", "too many orders, please retry later"
		c.Header("Retry-After", "60")
	case errors.Is(err, model.ErrPartnerTenantOrderUnavailable):
		status, code, message = 503, "payment_unavailable", "payment is temporarily unavailable; retry with the same Idempotency-Key"
		c.Header("Retry-After", "3")
	}
	writePartnerTenantAPIError(c, status, code, message)
}

func preparePartnerTenantCheckout(c *gin.Context, order *model.PartnerTenantSubscriptionOrder) error {
	if order.VisiblePaymentStatus(time.Now().Unix()) != "pending" || order.QRCode != "" || order.PayURL != "" {
		return nil
	}
	if !partnerEpayMethodAvailable(order.PaymentMethod) || order.MerchantId != operation_setting.EpayId {
		return model.ErrPartnerTenantOrderUnavailable
	}
	claim, err := model.ClaimPartnerTenantCheckout(order.Id)
	if err != nil {
		return err
	}
	if claim == 0 {
		fresh, err := model.GetPartnerTenantSubscriptionOrder(order.TenantId, order.OrderNo)
		if err != nil {
			return err
		}
		*order = *fresh
		return nil
	}
	origin, err := url.Parse(service.GetCallbackAddress())
	if err != nil || origin.Scheme != "https" || origin.Host == "" || origin.User != nil || origin.RawQuery != "" || origin.Fragment != "" || (origin.Path != "" && origin.Path != "/") {
		_ = model.SavePartnerTenantCheckout(order.Id, claim, "", "")
		return model.ErrPartnerTenantOrderUnavailable
	}
	// No cashier capability or buyer identity is sent to the gateway/return URL.
	checkout, err := partnerEpayMapiPurchase(map[string]string{
		"pid": order.MerchantId, "type": order.PaymentMethod, "out_trade_no": order.OrderNo,
		"notify_url": strings.TrimRight(service.GetCallbackAddress(), "/") + "/api/partner/subscription/epay/notify",
		"return_url": strings.TrimRight(service.GetCallbackAddress(), "/") + "/api/partner/subscription/epay/return",
		"name":       "Tenant subscription", "money": order.Amount(), "clientip": c.ClientIP(), "device": "pc",
	})
	if err != nil || (checkout != nil && (len(checkout.QRCode) > 8192 || len(checkout.PayURL) > 8192 || (checkout.PayURL != "" && !safePartnerTenantPayURL(checkout.PayURL)))) {
		_ = model.SavePartnerTenantCheckout(order.Id, claim, "", "")
		return model.ErrPartnerTenantOrderUnavailable
	}
	if err := model.SavePartnerTenantCheckout(order.Id, claim, checkout.QRCode, checkout.PayURL); err != nil {
		return err
	}
	fresh, err := model.GetPartnerTenantSubscriptionOrder(order.TenantId, order.OrderNo)
	if err != nil {
		return err
	}
	*order = *fresh
	return nil
}
func safePartnerTenantPayURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https" && u.Hostname() != "" && u.User == nil
}

func PartnerTenantCreateSubscriptionOrder(c *gin.Context) {
	tenant := middleware.PartnerTenantFromContext(c)
	if tenant == nil {
		partnerTenantOrderError(c, model.ErrPartnerTenantNotFound)
		return
	}
	partnerTenantOrderError(c, model.ErrPartnerTenantIntegrationMode)
}

// Local predicates only: safe to call after guarded replay lookup while holding
// the order transaction's tenant lock. Actual gateway preparation stays outside.
func validatePartnerTenantNewCheckout(method string) error {
	if _, err := partnerTenantCheckoutURL(&model.PartnerTenantSubscriptionOrder{}); err != nil {
		return err
	}
	if !partnerEpayMethodAvailable(method) {
		return model.ErrPartnerTenantOrderUnavailable
	}
	return nil
}

func respondPartnerTenantCreatedOrder(c *gin.Context, order *model.PartnerTenantSubscriptionOrder, created bool) {
	if err := preparePartnerTenantCheckout(c, order); err != nil {
		partnerTenantOrderError(c, err)
		return
	}
	view := partnerTenantOrderDTO(order, false)
	var err error
	view.CheckoutURL, err = partnerTenantCheckoutURL(order)
	if err != nil {
		partnerTenantOrderError(c, err)
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	c.JSON(status, view)
}

func PartnerTenantGetSubscriptionOrder(c *gin.Context) {
	tenant := middleware.PartnerTenantFromContext(c)
	if tenant == nil {
		partnerTenantOrderError(c, model.ErrPartnerTenantNotFound)
		return
	}
	if c.Request.URL.RawQuery != "" || !validPartnerTenantOrderNo(c.Param("order_no")) {
		writePartnerTenantAPIError(c, 400, "invalid_request", "request is invalid")
		return
	}
	order, err := model.GetPartnerTenantHostedOrder(tenant.Id, tenant.SecretHash, c.Param("order_no"))
	if err == nil && order.EntryMode != model.PartnerTenantIdentityExternal {
		err = model.ErrPartnerTenantOrderNotFound
	}
	if err != nil {
		partnerTenantOrderError(c, err)
		return
	}
	c.JSON(http.StatusOK, partnerTenantOrderDTO(order, false))
}
func validPartnerTenantOrderNo(s string) bool {
	if len(s) != 35 || !strings.HasPrefix(s, "PTO") {
		return false
	}
	for _, r := range s[3:] {
		if !(r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9') {
			return false
		}
	}
	return true
}

func PartnerTenantCashier(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.Header("Pragma", "no-cache")
	c.Header("Referrer-Policy", "no-referrer")
	unauthorized := func() {
		writePartnerTenantAPIError(c, 401, "invalid_checkout_access", "checkout access is invalid or expired; return to the merchant")
	}
	if c.Request.URL.RawQuery != "" || !validPartnerTenantOrderNo(c.Param("order_no")) {
		unauthorized()
		return
	}
	auth := c.GetHeader("Authorization")
	if !strings.HasPrefix(auth, "Bearer pc_") || len(auth) != len("Bearer pc_")+64 {
		unauthorized()
		return
	}
	order, err := model.GetPartnerTenantSubscriptionOrder(0, c.Param("order_no"))
	if errors.Is(err, model.ErrPartnerTenantOrderNotFound) {
		unauthorized()
		return
	}
	if err != nil {
		partnerTenantOrderError(c, err)
		return
	}
	if !validPartnerTenantCashierToken(order, strings.TrimPrefix(auth, "Bearer "), time.Now().Unix()) {
		unauthorized()
		return
	}
	c.JSON(http.StatusOK, partnerTenantOrderDTO(order, true))
}

// Bounded and unambiguous parsing: duplicate fields and mixed query/body
// signatures are refused rather than normalized into different signed data.
func partnerTenantEpayNotificationParams(c *gin.Context) (map[string]string, error) {
	var values url.Values
	if c.Request.Method == http.MethodPost {
		if c.Request.URL.RawQuery != "" {
			return nil, model.ErrPartnerTenantPaymentEvidence
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 8192)
		if err := c.Request.ParseForm(); err != nil {
			return nil, err
		}
		values = c.Request.PostForm
	} else {
		if len(c.Request.URL.RawQuery) > 8192 {
			return nil, model.ErrPartnerTenantPaymentEvidence
		}
		var err error
		values, err = url.ParseQuery(c.Request.URL.RawQuery)
		if err != nil {
			return nil, err
		}
	}
	if len(values) == 0 || len(values) > 32 {
		return nil, model.ErrPartnerTenantPaymentEvidence
	}
	params := make(map[string]string, len(values))
	for k, v := range values {
		if len(v) != 1 || len(k) > 64 || len(v[0]) > 1024 {
			return nil, model.ErrPartnerTenantPaymentEvidence
		}
		params[k] = v[0]
	}
	return params, nil
}
func PartnerTenantEpayNotify(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	fail := func() { c.String(http.StatusOK, "fail") }
	params, err := partnerTenantEpayNotificationParams(c)
	if err != nil {
		fail()
		return
	}
	client := GetEpayClient()
	if client == nil {
		fail()
		return
	}
	verified, err := client.Verify(params)
	if err != nil || !verified.VerifyStatus || params["trade_status"] != string(epay.StatusTradeSuccess) || params["pid"] != operation_setting.EpayId || !validPartnerTenantOrderNo(params["out_trade_no"]) || params["trade_no"] == "" {
		fail()
		return
	}
	cents, err := model.ParsePartnerTenantPaymentCents(params["money"])
	if err != nil {
		fail()
		return
	}
	// Do not gate genuine settlement on a switch used to disable NEW purchases.
	if err := model.RecordPartnerTenantPayment(params["out_trade_no"], model.PaymentProviderEpay, params["pid"], params["type"], params["trade_no"], cents); err != nil {
		fail()
		return
	}
	// Recovery retries local delivery independently; acknowledge durable payment.
	_ = model.FulfillPartnerTenantSubscriptionOrder(params["out_trade_no"])
	c.String(http.StatusOK, "success")
}

func PartnerTenantEpayReturn(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	c.Header("Referrer-Policy", "no-referrer")
	// Informational only, including forged/late browser returns. The original
	// cashier tab retains its per-order capability; no secret enters this URL.
	orderNo := c.Query("out_trade_no")
	dest := "/partner/checkout"
	if validPartnerTenantOrderNo(orderNo) {
		dest += "?order_no=" + url.QueryEscape(orderNo)
	}
	c.Redirect(http.StatusSeeOther, dest)
}
