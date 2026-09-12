package service

import (
	"testing"

	"github.com/QuantumNous/new-api/pkg/billingexpr"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/assert"
)

func TestInjectTieredBillingInfoAddsSettlementTrace(t *testing.T) {
	other := map[string]interface{}{}
	relayInfo := &relaycommon.RelayInfo{
		TieredBillingSnapshot: &billingexpr.BillingSnapshot{
			ExprString: `tier("base", p * 2 + c * 10)`,
		},
	}
	result := &billingexpr.TieredResult{
		ActualUsage:           billingexpr.TokenParams{P: 5, C: 16},
		ActualCostBeforeGroup: 0.00017,
		MatchedTier:           "base",
	}

	InjectTieredBillingInfo(other, relayInfo, result)

	assert.Equal(t, result.ActualUsage, other["billing_usage"])
	assert.Equal(t, 0.00017, other["billing_cost_before_group"])
	assert.Equal(t, "base", other["matched_tier"])
	assert.NotEmpty(t, other["expr_b64"])
}
