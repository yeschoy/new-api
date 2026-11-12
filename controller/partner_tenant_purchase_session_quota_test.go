package controller

import (
	"encoding/json"
	"fmt"
	"math"
	"os"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/require"
)

// The same expected BACKEND output is consumed by the public frontend tests.
// Even this SQLite-backed HTTP regression must execute only in task-owned Docker.
func TestPartnerTenantPurchaseQuotaDTOFullInt64StringContract(t *testing.T) {
	engine, _, secret, basePlan := setupPartnerTenantPurchaseController(t)
	startFakeZPay(t)
	view, launch := createPurchaseControllerSession(t, engine, secret, "quota-contract-00001")
	token := exchangePurchaseControllerSession(t, engine, view, launch)
	require.NoError(t, model.DB.Model(basePlan).Update("enabled", false).Error)
	// Inputs are actual signed int64 model values, not parsed expected output.
	for i, quota := range []int64{0, 9007199254740991, 9007199254740992, math.MaxInt64} {
		plan := *basePlan
		plan.Id, plan.Title, plan.Subtitle = 104-i, fmt.Sprintf("Quota %d", quota), ""
		plan.Enabled, plan.TotalAmount, plan.RequestsPerMinute = true, quota, 0
		require.NoError(t, model.DB.Create(&plan).Error)
	}
	response := partnerIntegrationRequest(engine, "GET", "/api/partner/purchase-sessions/"+view.SessionId, token, "", "")
	require.Equal(t, 200, response.Code, response.Body.String())
	var catalog struct {
		Plans json.RawMessage `json:"plans"`
	}
	require.NoError(t, json.Unmarshal(response.Body.Bytes(), &catalog))
	expected, err := os.ReadFile("testdata/partner_purchase_quota_plans.json")
	require.NoError(t, err)
	require.JSONEq(t, string(expected), string(catalog.Plans))
	// The old merchant DTO still has its numeric contract (including max int64).
	legacy := partnerIntegrationRequest(engine, "GET", "/api/partner/v1/plans", secret, "", "")
	require.Equal(t, 200, legacy.Code)
	require.Contains(t, legacy.Body.String(), `"total_amount":9223372036854775807`)
}
