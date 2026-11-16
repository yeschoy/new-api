package service

import (
	"encoding/json"
	"math"
	"math/big"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/require"
)

// Pure converter suite: no database, no i18n and no fixture. Selecting
// ^TestPartnerTenantQuotaCNY makes TestMain return before the SQLite
// bootstrap; nothing below reads model.DB. Tests that touch the process-wide
// conversion settings save and restore them and never run in parallel.

var partnerTenantQuotaCNYFixedPoint = regexp.MustCompile(`^-?(0|[1-9][0-9]*)\.[0-9]{6}$`)

func holdPartnerTenantQuotaCNYSettings(t *testing.T) {
	t.Helper()
	quotaPerUnit, rate, general := common.QuotaPerUnit, operation_setting.USDExchangeRate, *operation_setting.GetGeneralSetting()
	t.Cleanup(func() {
		common.QuotaPerUnit, operation_setting.USDExchangeRate = quotaPerUnit, rate
		*operation_setting.GetGeneralSetting() = general
	})
}

func partnerTenantQuotaCNYJSON(t *testing.T, value any) string {
	t.Helper()
	encoded, err := json.Marshal(value)
	require.NoError(t, err)
	return string(encoded)
}

func partnerTenantQuotaCNYKeys(t *testing.T, encoded string) []string {
	t.Helper()
	var object map[string]json.RawMessage
	require.NoError(t, json.Unmarshal([]byte(encoded), &object))
	keys := make([]string, 0, len(object))
	for key := range object {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// Expected strings were derived independently with exact rational arithmetic
// (quota × rate ÷ quota_per_unit, ties away from zero at the sixth place).
func TestPartnerTenantQuotaCNYAmountTable(t *testing.T) {
	for _, test := range []struct {
		quotaPerUnit, rate float64
		quota, want        string
	}{
		// Reference figures of the task: 500000 quota per unit, rate 1.
		{500000, 1, "15000000", "30.000000"},
		{500000, 1, "16008", "0.032016"},
		{500000, 1, "14983992", "29.967984"},
		{500000, 1, "0", "0.000000"},
		{500000, 1, "1", "0.000002"},
		// Above 2^53 a float64 round trip would turn ...993 into ...992.
		{500000, 1, "9007199254740992", "18014398509.481984"},
		{500000, 1, "9007199254740993", "18014398509.481986"},
		{500000, 1, "9223372036854775806", "18446744073709.551612"},
		{500000, 1, "9223372036854775807", "18446744073709.551614"},
		// Aggregated quota larger than int64 (3 × int64 max, then 10^30).
		{500000, 1, "27670116110564327421", "55340232221128.654842"},
		{500000, 1, "1000000000000000000000000000000", "2000000000000000000000000.000000"},
		// A different rate and ratio, including non-terminating quotients.
		{500000, 7.3, "15000000", "219.000000"},
		{500000, 7.3, "16008", "0.233717"},
		{500000, 7.3, "14983992", "218.766283"},
		{500000, 7.3, "1", "0.000015"},
		{500000, 7.3, "9007199254740993", "131505109119.218498"},
		{500000, 7.3, "9223372036854775807", "134661231738079.726782"},
		{1000, 7.25, "7", "0.050750"},
		{1000, 7.25, "15000000", "108750.000000"},
		{1000, 7.3, "9223372036854775807", "67330615869039863.391100"},
		{3, 1, "1", "0.333333"},
		{3, 1, "2", "0.666667"},
		{3, 1, "-2", "-0.666667"},
		// Very low and very high rates: a positive quota may round to zero.
		{500000, 0.000001, "15000000", "0.000030"},
		{500000, 0.000001, "1", "0.000000"},
		{500000, 0.1, "1", "0.000000"},
		{500000, 1e21, "1", "2000000000000000.000000"},
		// Exact half units go away from zero. Banker's rounding would give
		// 0.000000 / 0.000002 for 1 and 5; half-up would give 0 for -1.
		{2000000, 1, "1", "0.000001"},
		{2000000, 1, "3", "0.000002"},
		{2000000, 1, "5", "0.000003"},
		{2000000, 1, "-1", "-0.000001"},
		{2000000, 1, "-3", "-0.000002"},
		{2000000, 1, "-5", "-0.000003"},
		{2000000, 0.999999, "1", "0.000000"},
		{2000000, 1.000001, "1", "0.000001"},
		// 0.00000049999995: rounding to seven places first would reach the half.
		{2000000, 0.9999999, "1", "0.000000"},
		// Exactly 0.0000005 only when multiplied before the single division; a
		// 16-digit quotient times 1.5 is 0.00000049999999995 and rounds down.
		{3000000, 1.5, "1", "0.000001"},
	} {
		name := test.quota + "x" + strconv.FormatFloat(test.rate, 'f', -1, 64) + "/" + strconv.FormatFloat(test.quotaPerUnit, 'f', -1, 64)
		config := NewPartnerTenantQuotaCNYConfig(test.quotaPerUnit, test.rate)
		require.True(t, config.Available(), name)
		value, err := decimal.NewFromString(test.quota)
		require.NoError(t, err, name)
		got, ok := config.AmountDecimal(value)
		require.True(t, ok, name)
		require.Equal(t, test.want, got, name)
		require.Regexp(t, partnerTenantQuotaCNYFixedPoint, got, name)
		if !strings.HasPrefix(test.quota, "-") {
			fromString, ok := config.AmountString(test.quota)
			require.True(t, ok, name)
			require.Equal(t, test.want, fromString, name)
		}
		if exact, err := strconv.ParseInt(test.quota, 10, 64); err == nil {
			fromInt, ok := config.AmountInt64(exact)
			require.True(t, ok, name)
			require.Equal(t, test.want, fromInt, name)
		}
	}
}

func TestPartnerTenantQuotaCNYSumsRawQuotaBeforeConverting(t *testing.T) {
	// Three rows of quota 1 are each exactly half a display unit.
	config := NewPartnerTenantQuotaCNYConfig(2000000, 1)
	row, ok := config.AmountInt64(1)
	require.True(t, ok)
	require.Equal(t, "0.000001", row)
	sum := decimal.NewFromInt(1).Add(decimal.NewFromInt(1)).Add(decimal.NewFromInt(1))
	total, ok := config.AmountDecimal(sum)
	require.True(t, ok)
	require.Equal(t, "0.000002", total, "convert the summed raw quota once; three rounded rows would add up to 0.000003")

	// A sum beyond int64 keeps every unit.
	config = NewPartnerTenantQuotaCNYConfig(500000, 1)
	sum = decimal.Zero
	for range 3 {
		sum = sum.Add(decimal.NewFromInt(math.MaxInt64))
	}
	require.Equal(t, "27670116110564327421", sum.String())
	total, ok = config.AmountDecimal(sum)
	require.True(t, ok)
	require.Equal(t, "55340232221128.654842", total)
	fromText, ok := config.AmountString(sum.String())
	require.True(t, ok)
	require.Equal(t, total, fromText)
}

func TestPartnerTenantQuotaCNYCanonicalQuotaStrings(t *testing.T) {
	config := NewPartnerTenantQuotaCNYConfig(500000, 1)
	longest := "1" + strings.Repeat("0", partnerTenantQuotaCNYMaxDigits-1)
	for _, quota := range []string{"0", "1", "10", "9223372036854775808", longest} {
		amount, ok := config.AmountString(quota)
		require.True(t, ok, quota)
		require.Regexp(t, partnerTenantQuotaCNYFixedPoint, amount, quota)
	}
	for _, quota := range []string{"", "-1", "+1", "-0", "00", "01", "1.0", "1.", ".5", "1e3", "1E3", "0x10", " 1", "1 ", "1\n", "１", "1,000", "1_000", "abc", "NaN", "Infinity", longest + "0"} {
		amount, ok := config.AmountString(quota)
		require.False(t, ok, "%q", quota)
		require.Empty(t, amount, "%q", quota)
	}
}

func TestPartnerTenantQuotaCNYBoundedDecimalInput(t *testing.T) {
	config := NewPartnerTenantQuotaCNYConfig(500000, 1)
	zero, ok := config.AmountDecimal(decimal.Decimal{})
	require.True(t, ok)
	require.Equal(t, "0.000000", zero)
	atLimit, ok := config.AmountDecimal(decimal.New(1, partnerTenantQuotaCNYMaxExponent))
	require.True(t, ok)
	require.Equal(t, "2"+strings.Repeat("0", partnerTenantQuotaCNYMaxExponent-6)+".000000", atLimit)
	// Out-of-range values are refused before any power of ten is built.
	tooWide := new(big.Int).Lsh(big.NewInt(1), partnerTenantQuotaCNYMaxBits)
	for name, quota := range map[string]decimal.Decimal{
		"exponent above the limit": decimal.New(1, partnerTenantQuotaCNYMaxExponent+1),
		"exponent below the limit": decimal.New(1, -partnerTenantQuotaCNYMaxExponent-1),
		"largest exponent":         decimal.New(1, math.MaxInt32),
		"smallest exponent":        decimal.New(1, math.MinInt32),
		"coefficient too wide":     decimal.NewFromBigInt(tooWide, 0),
	} {
		amount, ok := config.AmountDecimal(quota)
		require.False(t, ok, name)
		require.Empty(t, amount, name)
	}
}

func TestPartnerTenantQuotaCNYInvalidConfigIsUnavailable(t *testing.T) {
	invalid := map[string]float64{
		"zero":          0,
		"negative zero": math.Copysign(0, -1),
		"negative":      -1,
		"negative rate": -7.3,
		"NaN":           math.NaN(),
		"+Inf":          math.Inf(1),
		"-Inf":          math.Inf(-1),
	}
	historical := "14983992"
	facts := PartnerTenantQuotaCNYSubscriptionFacts{Total: "15000000", Used: "16008", Remaining: "14983992", HistoricalRemaining: &historical, Active: true, Usable: true}
	check := func(name string, config PartnerTenantQuotaCNYConfig, quotaPerUnit, rate string) {
		t.Helper()
		require.False(t, config.Available(), name)
		for _, amount := range []func() (string, bool){
			func() (string, bool) { return config.AmountInt64(15000000) },
			func() (string, bool) { return config.AmountString("15000000") },
			func() (string, bool) { return config.AmountDecimal(decimal.NewFromInt(15000000)) },
		} {
			got, ok := amount()
			require.False(t, ok, name)
			require.Empty(t, got, name)
		}
		subscription := config.Subscription(facts)
		require.False(t, subscription.Available, name)
		require.Equal(t, PartnerTenantQuotaCNYReasonInvalidConfig, subscription.Reason, name)
		require.Nil(t, subscription.Total, name)
		require.Nil(t, subscription.Used, name)
		require.Nil(t, subscription.Remaining, name)
		require.Nil(t, subscription.HistoricalRemaining, name)
		// Entitlement facts are not amounts and are still reported.
		require.True(t, subscription.Usable, name)
		require.False(t, subscription.Unlimited, name)
		require.Equal(t,
			`{"currency":"CNY","available":false,"reason":"invalid_conversion_config","total":null,"used":null,"remaining":null,"unlimited":false,"usable":true,"quota_per_unit":`+quotaPerUnit+`,"usd_to_cny_rate":`+rate+`,"scale":6,"rounding":"half_away_from_zero"}`,
			partnerTenantQuotaCNYJSON(t, subscription), name)
		require.Equal(t,
			`{"currency":"CNY","available":false,"reason":"invalid_conversion_config","total":null,"unlimited":false,"quota_per_unit":`+quotaPerUnit+`,"usd_to_cny_rate":`+rate+`,"scale":6,"rounding":"half_away_from_zero"}`,
			partnerTenantQuotaCNYJSON(t, config.Catalog(15000000)), name)
		unlimited := config.Catalog(0)
		require.True(t, unlimited.Unlimited, name)
		require.False(t, unlimited.Available, name)
		require.Nil(t, unlimited.Total, name)
		require.Equal(t,
			`{"currency":"CNY","available":false,"reason":"invalid_conversion_config","quota_per_unit":`+quotaPerUnit+`,"usd_to_cny_rate":`+rate+`,"scale":6,"rounding":"half_away_from_zero"}`,
			partnerTenantQuotaCNYJSON(t, config.Metadata()), name)
	}
	for name, value := range invalid {
		// Only the valid factor is kept as metadata; nothing falls back to 1.
		check("quota_per_unit "+name, NewPartnerTenantQuotaCNYConfig(value, 7.3), `null`, `"7.3"`)
		check("rate "+name, NewPartnerTenantQuotaCNYConfig(500000, value), `"500000"`, `null`)
		check("both "+name, NewPartnerTenantQuotaCNYConfig(value, value), `null`, `null`)
	}
	check("zero value", PartnerTenantQuotaCNYConfig{}, `null`, `null`)

	// Extreme but finite positive factors are valid and never use an exponent.
	for _, value := range []float64{math.SmallestNonzeroFloat64, 1e-300, 1e21, math.MaxFloat64} {
		config := NewPartnerTenantQuotaCNYConfig(value, value)
		require.True(t, config.Available(), value)
		metadata := config.Metadata()
		for _, text := range []*string{metadata.QuotaPerUnit, metadata.USDToCNYRate} {
			require.NotNil(t, text, value)
			require.NotContains(t, strings.ToLower(*text), "e", value)
			parsed, err := strconv.ParseFloat(*text, 64)
			require.NoError(t, err, value)
			require.Equal(t, value, parsed, value)
		}
		amount, ok := config.AmountInt64(math.MaxInt64)
		require.True(t, ok, value)
		// The factors cancel exactly: quota × v ÷ v.
		require.Equal(t, "9223372036854775807.000000", amount, value)
	}
}

func TestPartnerTenantQuotaCNYIgnoresSiteDisplayPreference(t *testing.T) {
	holdPartnerTenantQuotaCNYSettings(t)
	common.QuotaPerUnit, operation_setting.USDExchangeRate = 500000, 7.3
	facts := PartnerTenantQuotaCNYSubscriptionFacts{Total: "15000000", Used: "16008", Remaining: "14983992", Active: true, Usable: true}
	const want = `{"currency":"CNY","available":true,"total":"219.000000","used":"0.233717","remaining":"218.766283","unlimited":false,"usable":true,"quota_per_unit":"500000","usd_to_cny_rate":"7.3","scale":6,"rounding":"half_away_from_zero"}`
	general := operation_setting.GetGeneralSetting()
	for _, display := range []string{operation_setting.QuotaDisplayTypeUSD, operation_setting.QuotaDisplayTypeCNY, operation_setting.QuotaDisplayTypeCustom, operation_setting.QuotaDisplayTypeTokens} {
		general.QuotaDisplayType = display
		general.CustomCurrencySymbol = "Z$"
		general.CustomCurrencyExchangeRate = 123.45
		config := CurrentPartnerTenantQuotaCNYConfig()
		require.Equal(t, want, partnerTenantQuotaCNYJSON(t, config.Subscription(facts)), display)
		require.Equal(t,
			`{"currency":"CNY","available":true,"total":"219.000000","unlimited":false,"quota_per_unit":"500000","usd_to_cny_rate":"7.3","scale":6,"rounding":"half_away_from_zero"}`,
			partnerTenantQuotaCNYJSON(t, config.Catalog(15000000)), display)
	}

	// An invalid rate is never replaced by the site custom multiplier or by 1.
	general.QuotaDisplayType = operation_setting.QuotaDisplayTypeCustom
	general.CustomCurrencyExchangeRate = 9
	operation_setting.USDExchangeRate = 0
	unavailable := CurrentPartnerTenantQuotaCNYConfig()
	require.False(t, unavailable.Available())
	require.Equal(t, PartnerTenantQuotaCNYReasonInvalidConfig, unavailable.Subscription(facts).Reason)

	// One snapshot per response: later configuration changes do not affect it.
	operation_setting.USDExchangeRate = 1
	snapshot := CurrentPartnerTenantQuotaCNYConfig()
	common.QuotaPerUnit, operation_setting.USDExchangeRate = 1000, 7.25
	amount, ok := snapshot.AmountInt64(15000000)
	require.True(t, ok)
	require.Equal(t, "30.000000", amount)
	current, ok := CurrentPartnerTenantQuotaCNYConfig().AmountInt64(15000000)
	require.True(t, ok)
	require.Equal(t, "108750.000000", current)
}

func TestPartnerTenantQuotaCNYSubscriptionStates(t *testing.T) {
	config := NewPartnerTenantQuotaCNYConfig(500000, 1)
	text := func(value string) *string { return &value }
	const metadata = `"quota_per_unit":"500000","usd_to_cny_rate":"1","scale":6,"rounding":"half_away_from_zero"}`
	for _, test := range []struct {
		name  string
		facts PartnerTenantQuotaCNYSubscriptionFacts
		want  string
	}{
		{"active finite", PartnerTenantQuotaCNYSubscriptionFacts{Total: "15000000", Used: "16008", Remaining: "14983992", Active: true, Usable: true},
			`{"currency":"CNY","available":true,"total":"30.000000","used":"0.032016","remaining":"29.967984","unlimited":false,"usable":true,`},
		{"active zero use", PartnerTenantQuotaCNYSubscriptionFacts{Total: "15000000", Used: "0", Remaining: "15000000", Active: true, Usable: true},
			`{"currency":"CNY","available":true,"total":"30.000000","used":"0.000000","remaining":"30.000000","unlimited":false,"usable":true,`},
		{"active exhausted", PartnerTenantQuotaCNYSubscriptionFacts{Total: "100", Used: "100", Remaining: "0", Active: true},
			`{"currency":"CNY","available":true,"total":"0.000200","used":"0.000200","remaining":"0.000000","unlimited":false,"usable":false,`},
		{"used above total keeps the true used and no negative remaining", PartnerTenantQuotaCNYSubscriptionFacts{Total: "100", Used: "250", Remaining: "0", Active: true},
			`{"currency":"CNY","available":true,"total":"0.000200","used":"0.000500","remaining":"0.000000","unlimited":false,"usable":false,`},
		{"smallest quota", PartnerTenantQuotaCNYSubscriptionFacts{Total: "1", Used: "0", Remaining: "1", Active: true, Usable: true},
			`{"currency":"CNY","available":true,"total":"0.000002","used":"0.000000","remaining":"0.000002","unlimited":false,"usable":true,`},
		{"int64 max", PartnerTenantQuotaCNYSubscriptionFacts{Total: "9223372036854775807", Used: "1", Remaining: "9223372036854775806", Active: true, Usable: true},
			`{"currency":"CNY","available":true,"total":"18446744073709.551614","used":"0.000002","remaining":"18446744073709.551612","unlimited":false,"usable":true,`},
		{"active unlimited is null, never a zero limit", PartnerTenantQuotaCNYSubscriptionFacts{Total: "0", Used: "16008", Remaining: "0", Unlimited: true, Active: true, Usable: true},
			`{"currency":"CNY","available":true,"total":null,"used":"0.032016","remaining":null,"unlimited":true,"usable":true,`},
		{"expired finite", PartnerTenantQuotaCNYSubscriptionFacts{Total: "15000000", Used: "16008", Remaining: "0", HistoricalRemaining: text("14983992")},
			`{"currency":"CNY","available":true,"total":"30.000000","used":"0.032016","remaining":"0.000000","historical_remaining":"29.967984","unlimited":false,"usable":false,`},
		{"cancelled finite fully used", PartnerTenantQuotaCNYSubscriptionFacts{Total: "100", Used: "100", Remaining: "0", HistoricalRemaining: text("0")},
			`{"currency":"CNY","available":true,"total":"0.000200","used":"0.000200","remaining":"0.000000","historical_remaining":"0.000000","unlimited":false,"usable":false,`},
		{"terminal ignores a stale raw remaining", PartnerTenantQuotaCNYSubscriptionFacts{Total: "15000000", Used: "16008", Remaining: "14983992", HistoricalRemaining: text("14983992")},
			`{"currency":"CNY","available":true,"total":"30.000000","used":"0.032016","remaining":"0.000000","historical_remaining":"29.967984","unlimited":false,"usable":false,`},
		{"terminal finite without a historical quota", PartnerTenantQuotaCNYSubscriptionFacts{Total: "15000000", Used: "16008", Remaining: "0"},
			`{"currency":"CNY","available":true,"total":"30.000000","used":"0.032016","remaining":"0.000000","unlimited":false,"usable":false,`},
		{"terminal unlimited keeps unlimited and invents no history", PartnerTenantQuotaCNYSubscriptionFacts{Total: "0", Used: "16008", Remaining: "0", HistoricalRemaining: text("0"), Unlimited: true},
			`{"currency":"CNY","available":true,"total":null,"used":"0.032016","remaining":"0.000000","unlimited":true,"usable":false,`},
		{"terminal is never usable", PartnerTenantQuotaCNYSubscriptionFacts{Total: "15000000", Used: "0", Remaining: "0", HistoricalRemaining: text("15000000"), Usable: true},
			`{"currency":"CNY","available":true,"total":"30.000000","used":"0.000000","remaining":"0.000000","historical_remaining":"30.000000","unlimited":false,"usable":false,`},
	} {
		require.Equal(t, test.want+metadata, partnerTenantQuotaCNYJSON(t, config.Subscription(test.facts)), test.name)
	}

	// A positive raw quota that rounds to 0.000000 stays usable: usable is the
	// copied entitlement fact, never inferred from the displayed amount.
	tiny := NewPartnerTenantQuotaCNYConfig(500000, 0.1).Subscription(PartnerTenantQuotaCNYSubscriptionFacts{Total: "1", Used: "0", Remaining: "1", Active: true, Usable: true})
	require.True(t, tiny.Available)
	require.True(t, tiny.Usable)
	require.Equal(t, "0.000000", *tiny.Remaining)
	require.Equal(t, "0.000000", *tiny.Total)

	// An invalid raw quota is reported, not repaired; no amount is emitted.
	valid := PartnerTenantQuotaCNYSubscriptionFacts{Total: "15000000", Used: "16008", Remaining: "14983992", HistoricalRemaining: text("14983992"), Unlimited: true, Active: true, Usable: true}
	for _, bad := range []string{"", "-1", "01", "1.5", "1e3", " 1", "abc", strings.Repeat("9", partnerTenantQuotaCNYMaxDigits+1)} {
		for field, mutate := range map[string]func(*PartnerTenantQuotaCNYSubscriptionFacts){
			"total":      func(facts *PartnerTenantQuotaCNYSubscriptionFacts) { facts.Total = bad },
			"used":       func(facts *PartnerTenantQuotaCNYSubscriptionFacts) { facts.Used = bad },
			"remaining":  func(facts *PartnerTenantQuotaCNYSubscriptionFacts) { facts.Remaining = bad },
			"historical": func(facts *PartnerTenantQuotaCNYSubscriptionFacts) { facts.HistoricalRemaining = text(bad) },
		} {
			facts := valid
			mutate(&facts)
			require.Equal(t,
				`{"currency":"CNY","available":false,"reason":"invalid_quota","total":null,"used":null,"remaining":null,"unlimited":true,"usable":true,`+metadata,
				partnerTenantQuotaCNYJSON(t, config.Subscription(facts)), "%s=%q", field, bad)
		}
	}
}

func TestPartnerTenantQuotaCNYCatalogShape(t *testing.T) {
	config := NewPartnerTenantQuotaCNYConfig(500000, 1)
	const metadata = `"quota_per_unit":"500000","usd_to_cny_rate":"1","scale":6,"rounding":"half_away_from_zero"}`
	for _, test := range []struct {
		total int64
		want  string
	}{
		{15000000, `{"currency":"CNY","available":true,"total":"30.000000","unlimited":false,`},
		{1, `{"currency":"CNY","available":true,"total":"0.000002","unlimited":false,`},
		{9007199254740993, `{"currency":"CNY","available":true,"total":"18014398509.481986","unlimited":false,`},
		{math.MaxInt64, `{"currency":"CNY","available":true,"total":"18446744073709.551614","unlimited":false,`},
		{0, `{"currency":"CNY","available":true,"total":null,"unlimited":true,`},
		{-1, `{"currency":"CNY","available":false,"reason":"invalid_quota","total":null,"unlimited":false,`},
		{math.MinInt64, `{"currency":"CNY","available":false,"reason":"invalid_quota","total":null,"unlimited":false,`},
	} {
		encoded := partnerTenantQuotaCNYJSON(t, config.Catalog(test.total))
		require.Equal(t, test.want+metadata, encoded, test.total)
		// A plan has no usage or entitlement: those keys must not exist at all.
		keys := partnerTenantQuotaCNYKeys(t, encoded)
		for _, forbidden := range []string{"used", "remaining", "usable", "historical_remaining"} {
			require.NotContains(t, keys, forbidden, test.total)
		}
	}
	require.Equal(t,
		[]string{"available", "currency", "quota_per_unit", "rounding", "scale", "total", "unlimited", "usd_to_cny_rate"},
		partnerTenantQuotaCNYKeys(t, partnerTenantQuotaCNYJSON(t, config.Catalog(15000000))))
	require.Equal(t,
		[]string{"available", "currency", "quota_per_unit", "remaining", "rounding", "scale", "total", "unlimited", "usable", "usd_to_cny_rate", "used"},
		partnerTenantQuotaCNYKeys(t, partnerTenantQuotaCNYJSON(t, config.Subscription(PartnerTenantQuotaCNYSubscriptionFacts{Total: "1", Used: "0", Remaining: "1", Active: true, Usable: true}))))
	require.Equal(t,
		`{"currency":"CNY","available":true,`+metadata,
		partnerTenantQuotaCNYJSON(t, config.Metadata()))
}

func TestPartnerTenantQuotaCNYNeverUsesScientificNotation(t *testing.T) {
	quotas := []string{"0", "1", "999999", "1000000", "500000", "1000000000000000000", "9223372036854775807", "1" + strings.Repeat("0", 40), "-1", "-9223372036854775808"}
	for _, factors := range [][2]float64{{500000, 1}, {500000, 7.3}, {1, 1e21}, {1e21, 1}, {1e-7, 1}, {1, 1e-7}, {math.MaxFloat64, 1}, {math.SmallestNonzeroFloat64, 1}, {1, math.SmallestNonzeroFloat64}} {
		config := NewPartnerTenantQuotaCNYConfig(factors[0], factors[1])
		require.True(t, config.Available(), factors)
		for _, quota := range quotas {
			amount, ok := config.AmountDecimal(decimal.RequireFromString(quota))
			require.True(t, ok, "%v %s", factors, quota)
			require.Regexp(t, partnerTenantQuotaCNYFixedPoint, amount, "%v %s", factors, quota)
			require.NotEqual(t, "-0.000000", amount, "%v %s", factors, quota)
		}
	}
}
