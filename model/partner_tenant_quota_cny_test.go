package model

import (
	"encoding/json"
	"math"
	"sort"
	"strings"
	"sync"
	"testing"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm/schema"
)

// Pure shape guards (no database): the fixed-CNY display projection is added
// by merchant-only controller wrappers. The model DTOs, the shared plan JSON
// and the persisted schema must stay exactly as they were. Selecting
// ^TestPartnerTenantQuotaCNY makes TestMain return before the SQLite bootstrap.

func TestPartnerTenantQuotaCNYIndependentModelDTOStaysLegacy(t *testing.T) {
	active := &PartnerTenantIndependentSubscription{}
	active.Subscription.Id, active.Subscription.PlanId, active.Subscription.PlanTitle = 7, 3, "Monthly"
	active.Subscription.Status, active.Subscription.StartTime, active.Subscription.EndTime = "active", 100, 200
	active.Subscription.RequestsPerMinute = 60
	active.Quota.Total, active.Quota.Used, active.Quota.Remaining = "9007199254740993", "16008", "9007199254724985"
	active.Quota.Usable, active.Quota.NextResetTime = true, 150
	active.APIKey = "sk-fixture"
	encoded, err := json.Marshal(active)
	require.NoError(t, err)
	require.Equal(t,
		`{"subscription":{"id":7,"plan_id":3,"plan_title":"Monthly","status":"active","start_time":100,"end_time":200,"requests_per_minute":60},`+
			`"quota":{"quota_total":"9007199254740993","quota_used":"16008","quota_remaining":"9007199254724985","quota_unlimited":false,"quota_usable":true,"next_reset_time":150},`+
			`"api_key":"sk-fixture"}`,
		string(encoded))

	terminal := &PartnerTenantIndependentSubscription{}
	terminal.Subscription.Id, terminal.Subscription.PlanId, terminal.Subscription.PlanTitle = 7, 3, "Monthly"
	terminal.Subscription.Status, terminal.Subscription.StartTime, terminal.Subscription.EndTime = "expired", 100, 200
	terminal.Quota.Total, terminal.Quota.Used, terminal.Quota.Remaining = "15000000", "16008", "0"
	historical := "14983992"
	terminal.Quota.HistoricalRemaining = &historical
	encoded, err = json.Marshal(terminal)
	require.NoError(t, err)
	require.Equal(t,
		`{"subscription":{"id":7,"plan_id":3,"plan_title":"Monthly","status":"expired","start_time":100,"end_time":200,"requests_per_minute":0},`+
			`"quota":{"quota_total":"15000000","quota_used":"16008","quota_remaining":"0","quota_unlimited":false,"quota_usable":false,"next_reset_time":0,"historical_quota_remaining":"14983992"}}`,
		string(encoded))
	require.NotContains(t, string(encoded), "quota_cny")
	require.NotContains(t, string(encoded), "api_key")
}

func TestPartnerTenantQuotaCNYSharedPlanShapeStaysLegacy(t *testing.T) {
	plan := SubscriptionPlan{Id: 12, PartnerTenantId: 5, Title: "Monthly", PriceAmount: 9.99, Currency: "CNY", DurationUnit: "month", DurationValue: 1, Enabled: true, TotalAmount: math.MaxInt64, QuotaResetPeriod: "monthly"}
	plan.NormalizeDefaults()
	encoded, err := json.Marshal(plan)
	require.NoError(t, err)
	var object map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(encoded, &object))
	keys := make([]string, 0, len(object))
	for key := range object {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	want := []string{
		"allow_balance_pay", "allow_wallet_overflow", "applicable_group", "created_at", "creem_product_id", "currency", "custom_seconds",
		"downgrade_group", "duration_unit", "duration_value", "enabled", "id", "max_purchase_per_user", "partner_tenant_id", "price_amount",
		"quota_reset_custom_seconds", "quota_reset_period", "requests_per_minute", "sort_order", "stripe_price_id", "subtitle", "title",
		"total_amount", "updated_at", "upgrade_group", "waffo_pancake_product_id",
	}
	require.Equal(t, want, keys, "the shared plan JSON gains no display field")
	// total_amount stays an exact int64 JSON number and the price is untouched.
	require.Equal(t, "9223372036854775807", string(object["total_amount"]))
	require.Equal(t, "9.99", string(object["price_amount"]))
	require.Equal(t, `"CNY"`, string(object["currency"]))

	// No display column may reach the persisted plan or subscription tables.
	for _, table := range []any{&SubscriptionPlan{}, &UserSubscription{}} {
		parsed, err := schema.Parse(table, &sync.Map{}, schema.NamingStrategy{})
		require.NoError(t, err)
		for _, field := range parsed.Fields {
			require.NotContains(t, strings.ToLower(field.DBName), "cny", parsed.Table)
			require.NotContains(t, strings.ToLower(field.Name), "cny", parsed.Table)
		}
	}
}
