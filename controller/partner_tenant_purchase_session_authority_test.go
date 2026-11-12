package controller

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

// Runs after the handler's initial authorization, at the first body read. This
// deterministic gate reproduces authority changes during a delayed upload.
type purchaseControlledBody struct {
	io.Reader
	once   sync.Once
	before func()
}

func (b *purchaseControlledBody) Read(p []byte) (int, error) {
	b.once.Do(b.before)
	return b.Reader.Read(p)
}
func (*purchaseControlledBody) Close() error { return nil }

// Runtime execution, including SQLite fixtures and timing gates, is Docker-only.
func TestPartnerTenantPurchaseRechecksAuthorityAfterBodyBeforeInsertOrReplay(t *testing.T) {
	for _, state := range []string{"new", "unprepared", "prepared", "paid"} {
		for _, change := range []string{"rotation", "expiry"} {
			t.Run(state+"/"+change, func(t *testing.T) {
				engine, tenant, secret, plan := setupPartnerTenantPurchaseController(t)
				gateway := startFakeZPay(t)
				view, launch := createPurchaseControllerSession(t, engine, secret, "authority-intent-001")
				token := exchangePurchaseControllerSession(t, engine, view, launch)
				path := "/api/partner/purchase-sessions/" + view.SessionId
				body := fmt.Sprintf(`{"plan_id":%d,"payment_method":"alipay"}`, plan.Id)
				var original *model.PartnerTenantSubscriptionOrder
				if state != "new" {
					if state == "unprepared" {
						gateway.reply = func(w http.ResponseWriter) { w.WriteHeader(502) }
					}
					created := partnerIntegrationRequest(engine, "POST", path+"/orders", token, "", body)
					if state == "unprepared" {
						require.Equal(t, 503, created.Code)
					} else {
						require.Equal(t, 201, created.Code, created.Body.String())
					}
					var err error
					original, err = model.FindPartnerTenantOrderByIdempotency(tenant.Id, model.PartnerTenantPurchaseOrderIdempotencyHash(view.SessionId))
					require.NoError(t, err)
					if state == "paid" {
						require.NoError(t, model.RecordPartnerTenantPayment(original.OrderNo, model.PaymentProviderEpay, original.MerchantId, original.PaymentMethod, "authority-paid", original.AmountCents))
					}
				}
				gateway.reply = func(w http.ResponseWriter) {
					_, _ = io.WriteString(w, `{"code":1,"payurl":"https://gateway.example/pay"}`)
				}
				// Issue a valid short-lived token BEFORE the request. Waiting in the
				// body reader crosses the actual unchanged deadline, not a signature
				// mismatch caused by mutating expires_at mid-request.
				var deadline int64
				if change == "expiry" {
					deadline = time.Now().Unix() + 3
					require.NoError(t, model.DB.Model(&model.PartnerTenantPurchaseSession{}).Where("session_id = ?", view.SessionId).Update("expires_at", deadline).Error)
					session, err := model.GetPartnerTenantPurchaseSession(tenant.Id, view.SessionId)
					require.NoError(t, err)
					token = model.PartnerTenantPurchaseAccessToken(session)
				}
				beforeRequests := len(gateway.requests)
				read := false
				reader := &purchaseControlledBody{Reader: strings.NewReader(body), before: func() {
					read = true
					if change == "rotation" {
						_, err := model.RotatePartnerTenantSecret(tenant.Id)
						require.NoError(t, err)
					} else {
						time.Sleep(time.Until(time.Unix(deadline, 0)))
					}
				}}
				req := httptest.NewRequest("POST", path+"/orders", reader)
				req.Header.Set("Authorization", "Bearer "+token)
				req.Header.Set("Content-Type", "application/json")
				response := httptest.NewRecorder()
				engine.ServeHTTP(response, req)
				require.True(t, read, "initial authorization succeeded before the controlled body read")
				require.Equal(t, 401, response.Code, response.Body.String())
				require.Contains(t, response.Body.String(), "invalid_purchase_access")
				require.NotContains(t, response.Body.String(), "checkout_url")
				require.NotContains(t, response.Body.String(), "pc_")
				require.Len(t, gateway.requests, beforeRequests, "revoked/expired request must not prepare a payment")
				var count int64
				require.NoError(t, model.DB.Model(&model.PartnerTenantSubscriptionOrder{}).Where("tenant_id = ?", tenant.Id).Count(&count).Error)
				if original == nil {
					require.Zero(t, count)
				} else {
					require.EqualValues(t, 1, count)
					stored, err := model.GetPartnerTenantSubscriptionOrder(tenant.Id, original.OrderNo)
					require.NoError(t, err)
					require.Equal(t, original.PlanSnapshot, stored.PlanSnapshot)
					require.Equal(t, original.AmountCents, stored.AmountCents)
					require.Equal(t, original.ExpiresAt, stored.ExpiresAt)
					require.True(t, validPartnerTenantCashierToken(stored, partnerTenantCashierToken(original), time.Now().Unix()), "already issued cashier authority is independent")
					if state == "paid" {
						require.Equal(t, "paid", stored.PaymentStatus)
					}
				}
			})
		}
	}
}
