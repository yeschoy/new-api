package service

import (
	"math"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/shopspring/decimal"
)

// Fixed CNY display projection of merchant (Partner Tenant) subscription quota.
//
// quota is an internal metering unit: not money and not a token count. This
// file turns an ALREADY AUTHORIZED raw quota snapshot into its CNY display
// equivalent under the CURRENT conversion configuration:
//
//	amount = quota × USDExchangeRate ÷ QuotaPerUnit
//
// The result is a display projection only. It is not a wallet balance, not a
// plan price and not a historical cash debit, and nothing here feeds billing.
// The site quota-display preference (USD / CNY / CUSTOM / TOKENS) is never
// read, so the output stays CNY whatever the site displays. There is no
// database, secret or external I/O in this file.

const (
	PartnerTenantQuotaCNYCurrency = "CNY"
	// Amounts are fixed-point strings with exactly this many fractional digits.
	PartnerTenantQuotaCNYScale    = 6
	PartnerTenantQuotaCNYRounding = "half_away_from_zero"

	// Bounded reasons for an unavailable projection. No other value is emitted.
	PartnerTenantQuotaCNYReasonInvalidConfig = "invalid_conversion_config"
	PartnerTenantQuotaCNYReasonInvalidQuota  = "invalid_quota"
)

// Bounds of the raw quota accepted for conversion. A single int64 quota has at
// most 19 digits and a sum of int64 quotas stays far below these limits; they
// only stop a caller-built decimal with an extreme exponent or coefficient
// from allocating an enormous power of ten. 128 decimal digits fit in 512 bits.
const (
	partnerTenantQuotaCNYMaxDigits   = 128
	partnerTenantQuotaCNYMaxBits     = 512
	partnerTenantQuotaCNYMaxExponent = 64
)

// PartnerTenantQuotaCNYConfig is one validated snapshot of the conversion
// configuration. Build it once per response and use that same snapshot for
// every item, so all amounts of one response share one ratio and one rate.
// The zero value is an invalid (unavailable) configuration.
type PartnerTenantQuotaCNYConfig struct {
	quotaPerUnit decimal.Decimal
	usdToCNYRate decimal.Decimal
	// Canonical decimal text of each factor; empty when that factor is invalid.
	quotaPerUnitText string
	usdToCNYRateText string
}

// CurrentPartnerTenantQuotaCNYConfig reads the two process configuration
// values exactly once. Call it after the business operation has succeeded and
// outside any database transaction.
func CurrentPartnerTenantQuotaCNYConfig() PartnerTenantQuotaCNYConfig {
	return NewPartnerTenantQuotaCNYConfig(common.QuotaPerUnit, operation_setting.USDExchangeRate)
}

// NewPartnerTenantQuotaCNYConfig validates the two factors independently.
// Each must be finite and strictly positive; otherwise the configuration is
// unavailable and only the valid factor (if any) is kept as metadata. There is
// no fallback to rate 1 or to any site display multiplier.
func NewPartnerTenantQuotaCNYConfig(quotaPerUnit, usdExchangeRate float64) PartnerTenantQuotaCNYConfig {
	var config PartnerTenantQuotaCNYConfig
	config.quotaPerUnit, config.quotaPerUnitText = partnerTenantQuotaCNYFactor(quotaPerUnit)
	config.usdToCNYRate, config.usdToCNYRateText = partnerTenantQuotaCNYFactor(usdExchangeRate)
	return config
}

// partnerTenantQuotaCNYFactor builds the decimal from the canonical text that
// the option store also uses for these values (strconv 'f', shortest
// round-trip). NaN and ±Inf are rejected before any decimal construction and
// the float is never handed to decimal.NewFromFloat.
func partnerTenantQuotaCNYFactor(value float64) (decimal.Decimal, string) {
	if math.IsNaN(value) || math.IsInf(value, 0) || value <= 0 {
		return decimal.Decimal{}, ""
	}
	text := strconv.FormatFloat(value, 'f', -1, 64)
	factor, err := decimal.NewFromString(text)
	if err != nil || factor.Sign() <= 0 {
		return decimal.Decimal{}, ""
	}
	return factor, text
}

// Available reports whether amounts can be produced. It says nothing about
// whether any subscription is usable.
func (c PartnerTenantQuotaCNYConfig) Available() bool {
	return c.quotaPerUnitText != "" && c.usdToCNYRateText != ""
}

// PartnerTenantQuotaCNYMetadata is the conversion metadata without amounts,
// for a caller that renders its own amounts through AmountDecimal /
// AmountString / AmountInt64 (for example aggregated usage statistics).
type PartnerTenantQuotaCNYMetadata struct {
	Currency     string  `json:"currency"`
	Available    bool    `json:"available"`
	Reason       string  `json:"reason,omitempty"`
	QuotaPerUnit *string `json:"quota_per_unit"`
	USDToCNYRate *string `json:"usd_to_cny_rate"`
	Scale        int     `json:"scale"`
	Rounding     string  `json:"rounding"`
}

func (c PartnerTenantQuotaCNYConfig) Metadata() PartnerTenantQuotaCNYMetadata {
	metadata := PartnerTenantQuotaCNYMetadata{
		Currency:     PartnerTenantQuotaCNYCurrency,
		Available:    c.Available(),
		QuotaPerUnit: partnerTenantQuotaCNYText(c.quotaPerUnitText),
		USDToCNYRate: partnerTenantQuotaCNYText(c.usdToCNYRateText),
		Scale:        PartnerTenantQuotaCNYScale,
		Rounding:     PartnerTenantQuotaCNYRounding,
	}
	if !metadata.Available {
		metadata.Reason = PartnerTenantQuotaCNYReasonInvalidConfig
	}
	return metadata
}

func partnerTenantQuotaCNYText(text string) *string {
	if text == "" {
		return nil
	}
	return &text
}

// AmountDecimal converts an arbitrary-precision raw quota, so a summed quota
// larger than int64 is converted without truncation. Sum the raw quota first
// and convert once; never add up amounts that were already rounded.
//
// The product quota × rate is exact; the single division by quota_per_unit is
// the only rounding step: six places, half away from zero. The result always
// has exactly six fractional digits and never uses scientific notation. The
// second result is false when the configuration is unavailable or the value is
// outside the supported bounds; no amount is fabricated in that case.
func (c PartnerTenantQuotaCNYConfig) AmountDecimal(quota decimal.Decimal) (string, bool) {
	if !c.Available() {
		return "", false
	}
	exponent := quota.Exponent()
	if exponent < -partnerTenantQuotaCNYMaxExponent || exponent > partnerTenantQuotaCNYMaxExponent ||
		quota.Coefficient().BitLen() > partnerTenantQuotaCNYMaxBits {
		return "", false
	}
	amount := quota.Mul(c.usdToCNYRate).DivRound(c.quotaPerUnit, PartnerTenantQuotaCNYScale)
	return amount.StringFixed(PartnerTenantQuotaCNYScale), true
}

// AmountInt64 converts one exact int64 raw quota. No float64 is involved.
func (c PartnerTenantQuotaCNYConfig) AmountInt64(quota int64) (string, bool) {
	return c.AmountDecimal(decimal.NewFromInt(quota))
}

// AmountString converts a canonical nonnegative decimal integer string ("0" or
// digits without a leading zero, sign, space, fraction or exponent), which may
// exceed int64.
func (c PartnerTenantQuotaCNYConfig) AmountString(quota string) (string, bool) {
	value, ok := partnerTenantQuotaCNYCanonical(quota)
	if !ok {
		return "", false
	}
	return c.AmountDecimal(value)
}

func partnerTenantQuotaCNYCanonical(raw string) (decimal.Decimal, bool) {
	if raw == "" || len(raw) > partnerTenantQuotaCNYMaxDigits || (len(raw) > 1 && raw[0] == '0') {
		return decimal.Decimal{}, false
	}
	for i := 0; i < len(raw); i++ {
		if raw[i] < '0' || raw[i] > '9' {
			return decimal.Decimal{}, false
		}
	}
	value, err := decimal.NewFromString(raw)
	if err != nil {
		return decimal.Decimal{}, false
	}
	return value, true
}

// PartnerTenantQuotaCNYSubscriptionFacts is the already authorized raw quota
// snapshot of ONE subscription. It deliberately carries quota and entitlement
// facts only: never the response object, a credential or an identifier.
// Quotas are canonical nonnegative decimal integer strings.
type PartnerTenantQuotaCNYSubscriptionFacts struct {
	Total string
	Used  string
	// Remaining is the existing max(total-used, 0) of the same snapshot.
	Remaining string
	// HistoricalRemaining is set only where the existing response already
	// exposes a nonspendable historical remaining quota.
	HistoricalRemaining *string
	Unlimited           bool
	// Active is false for an expired or cancelled subscription.
	Active bool
	// Usable is the caller's entitlement decision, made from the raw quota
	// facts of this snapshot (the independent query copies quota_usable). It is
	// never derived from a converted amount.
	Usable bool
}

// PartnerTenantSubscriptionQuotaCNY is the additive quota_cny object of one
// subscription. Amounts are fixed-point strings or null.
type PartnerTenantSubscriptionQuotaCNY struct {
	Currency string `json:"currency"`
	// Available means the conversion can be displayed. It is NOT whether the
	// subscription is usable; see Usable.
	Available           bool    `json:"available"`
	Reason              string  `json:"reason,omitempty"`
	Total               *string `json:"total"`
	Used                *string `json:"used"`
	Remaining           *string `json:"remaining"`
	HistoricalRemaining *string `json:"historical_remaining,omitempty"`
	Unlimited           bool    `json:"unlimited"`
	Usable              bool    `json:"usable"`
	QuotaPerUnit        *string `json:"quota_per_unit"`
	USDToCNYRate        *string `json:"usd_to_cny_rate"`
	Scale               int     `json:"scale"`
	Rounding            string  `json:"rounding"`
}

// Subscription projects one subscription snapshot:
//
//   - active finite: total, used and remaining are all amounts;
//   - active unlimited: total and remaining are null (never a zero limit);
//   - expired/cancelled finite: usable remaining is "0.000000" and the
//     nonspendable historical remaining is reported separately when the
//     caller has it;
//   - expired/cancelled unlimited: total stays null, usable remaining is
//     "0.000000" and no historical amount is invented.
//
// An unavailable configuration or an invalid raw quota yields available=false
// with every amount null and a bounded reason. The entitlement facts
// (unlimited, usable) are still reported; nothing is repaired or guessed.
func (c PartnerTenantQuotaCNYConfig) Subscription(facts PartnerTenantQuotaCNYSubscriptionFacts) PartnerTenantSubscriptionQuotaCNY {
	projection := PartnerTenantSubscriptionQuotaCNY{
		Currency:     PartnerTenantQuotaCNYCurrency,
		Unlimited:    facts.Unlimited,
		Usable:       facts.Active && facts.Usable,
		QuotaPerUnit: partnerTenantQuotaCNYText(c.quotaPerUnitText),
		USDToCNYRate: partnerTenantQuotaCNYText(c.usdToCNYRateText),
		Scale:        PartnerTenantQuotaCNYScale,
		Rounding:     PartnerTenantQuotaCNYRounding,
	}
	if !c.Available() {
		projection.Reason = PartnerTenantQuotaCNYReasonInvalidConfig
		return projection
	}
	// Every raw value of the snapshot must be valid, including the ones that
	// are not displayed for this state.
	total, totalOK := c.AmountString(facts.Total)
	used, usedOK := c.AmountString(facts.Used)
	remaining, remainingOK := c.AmountString(facts.Remaining)
	historical, historicalOK := "", true
	if facts.HistoricalRemaining != nil {
		historical, historicalOK = c.AmountString(*facts.HistoricalRemaining)
	}
	zero, zeroOK := c.AmountInt64(0)
	if !totalOK || !usedOK || !remainingOK || !historicalOK || !zeroOK {
		projection.Reason = PartnerTenantQuotaCNYReasonInvalidQuota
		return projection
	}
	projection.Available = true
	projection.Used = &used
	if !facts.Unlimited {
		projection.Total = &total
	}
	switch {
	case !facts.Active:
		projection.Remaining = &zero
		if !facts.Unlimited && facts.HistoricalRemaining != nil {
			projection.HistoricalRemaining = &historical
		}
	case !facts.Unlimited:
		projection.Remaining = &remaining
	}
	return projection
}

// PartnerTenantCatalogQuotaCNY is the additive quota_cny object of one catalog
// plan. A plan has no usage or entitlement, so it carries the total only.
type PartnerTenantCatalogQuotaCNY struct {
	Currency     string  `json:"currency"`
	Available    bool    `json:"available"`
	Reason       string  `json:"reason,omitempty"`
	Total        *string `json:"total"`
	Unlimited    bool    `json:"unlimited"`
	QuotaPerUnit *string `json:"quota_per_unit"`
	USDToCNYRate *string `json:"usd_to_cny_rate"`
	Scale        int     `json:"scale"`
	Rounding     string  `json:"rounding"`
}

// Catalog projects a plan's total quota. total_amount 0 is the existing
// "unlimited" rule and yields a null total, never a zero limit.
func (c PartnerTenantQuotaCNYConfig) Catalog(totalAmount int64) PartnerTenantCatalogQuotaCNY {
	projection := PartnerTenantCatalogQuotaCNY{
		Currency:     PartnerTenantQuotaCNYCurrency,
		Unlimited:    totalAmount == 0,
		QuotaPerUnit: partnerTenantQuotaCNYText(c.quotaPerUnitText),
		USDToCNYRate: partnerTenantQuotaCNYText(c.usdToCNYRateText),
		Scale:        PartnerTenantQuotaCNYScale,
		Rounding:     PartnerTenantQuotaCNYRounding,
	}
	if !c.Available() {
		projection.Reason = PartnerTenantQuotaCNYReasonInvalidConfig
		return projection
	}
	if totalAmount < 0 {
		projection.Reason = PartnerTenantQuotaCNYReasonInvalidQuota
		return projection
	}
	if totalAmount == 0 {
		projection.Available = true
		return projection
	}
	total, ok := c.AmountInt64(totalAmount)
	if !ok {
		projection.Reason = PartnerTenantQuotaCNYReasonInvalidQuota
		return projection
	}
	projection.Available = true
	projection.Total = &total
	return projection
}
