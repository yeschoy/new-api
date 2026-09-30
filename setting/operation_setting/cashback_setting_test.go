package operation_setting

import (
	"errors"
	"math"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDefaultCashbackSettingIsSafelyDisabled(t *testing.T) {
	setting := DefaultCashbackSetting()

	assert.False(t, setting.InviterEnabled)
	assert.False(t, setting.InviteeEnabled)
	assert.Zero(t, setting.InviterRateBPS)
	assert.Zero(t, setting.InviteeRateBPS)
	assert.Equal(t, CashbackStrategyRate, setting.InviterStrategy)
	assert.Equal(t, CashbackStrategyRate, setting.InviteeStrategy)
	assert.Equal(t, 7, setting.SettlementDays)
	assert.Zero(t, setting.MaxRewardQuota)
	assert.Zero(t, setting.DailyRewardQuota)
	assert.Equal(t, 3, setting.IPAccountThreshold)
	assert.Equal(t, 2, setting.DeviceAccountThreshold)
	assert.Equal(t, 5, setting.DailyTopUpCountThreshold)
	require.NoError(t, ValidateCashbackSetting(setting, false))
}

func TestValidateCashbackSettingRejectsInvalidCrossFieldValues(t *testing.T) {
	valid := DefaultCashbackSetting()
	valid.InviterEnabled = true
	valid.InviterRateBPS = 1_000
	valid.MaxRewardQuota = 10_000
	valid.DailyRewardQuota = 50_000
	valid.FirstEnabledAt = 1

	tests := []struct {
		name       string
		mutate     func(*CashbackSetting)
		compliance bool
		field      string
	}{
		{name: "enabled zero rate", mutate: func(s *CashbackSetting) { s.InviterRateBPS = 0 }, compliance: true, field: "inviter_rate_bps"},
		{name: "combined rate", mutate: func(s *CashbackSetting) { s.InviteeRateBPS = 9_001 }, compliance: true, field: "invitee_rate_bps"},
		{name: "unknown strategy", mutate: func(s *CashbackSetting) { s.InviterStrategy = "unknown" }, compliance: true, field: "inviter_strategy"},
		{name: "fixed zero enabled", mutate: func(s *CashbackSetting) { s.InviterStrategy = CashbackStrategyPerHundred }, compliance: true, field: "inviter_fixed_per_hundred"},
		{name: "fixed negative", mutate: func(s *CashbackSetting) { s.InviterFixedPerHundred = -1 }, compliance: true, field: "inviter_fixed_per_hundred"},
		{name: "fixed above 100", mutate: func(s *CashbackSetting) { s.InviterFixedPerHundred = 101 }, compliance: true, field: "inviter_fixed_per_hundred"},
		{name: "mixed nominal above 100", mutate: func(s *CashbackSetting) {
			s.InviteeStrategy = CashbackStrategyPerHundred
			s.InviteeFixedPerHundred = 91
		}, compliance: true, field: "invitee_fixed_per_hundred"},
		{name: "settlement below range", mutate: func(s *CashbackSetting) { s.SettlementDays = 0 }, compliance: true, field: "settlement_days"},
		{name: "settlement above range", mutate: func(s *CashbackSetting) { s.SettlementDays = 91 }, compliance: true, field: "settlement_days"},
		{name: "missing single cap", mutate: func(s *CashbackSetting) { s.MaxRewardQuota = 0 }, compliance: true, field: "max_reward_quota"},
		{name: "missing daily cap", mutate: func(s *CashbackSetting) { s.DailyRewardQuota = 0 }, compliance: true, field: "daily_reward_quota"},
		{name: "missing first enable boundary", mutate: func(s *CashbackSetting) { s.FirstEnabledAt = 0 }, compliance: true, field: "first_enabled_at"},
		{name: "wallet cap overflow", mutate: func(s *CashbackSetting) { s.MaxRewardQuota = common.MaxWalletQuota + 1 }, compliance: true, field: "max_reward_quota"},
		{name: "IP threshold", mutate: func(s *CashbackSetting) { s.IPAccountThreshold = 1 }, compliance: true, field: "ip_account_threshold"},
		{name: "device threshold", mutate: func(s *CashbackSetting) { s.DeviceAccountThreshold = 1 }, compliance: true, field: "device_account_threshold"},
		{name: "top-up threshold", mutate: func(s *CashbackSetting) { s.DailyTopUpCountThreshold = 0 }, compliance: true, field: "daily_topup_count_threshold"},
		{name: "compliance", mutate: func(_ *CashbackSetting) {}, compliance: false, field: "compliance_confirmed"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			setting := valid
			test.mutate(&setting)
			err := ValidateCashbackSetting(setting, test.compliance)
			require.Error(t, err)
			var validationErr *CashbackSettingValidationError
			require.True(t, errors.As(err, &validationErr))
			assert.Equal(t, test.field, validationErr.Field)
		})
	}
}

func TestCashbackSettingOptionsRoundTrip(t *testing.T) {
	original := CashbackSetting{
		InviterEnabled:           true,
		InviteeEnabled:           true,
		InviterRateBPS:           1_250,
		InviteeRateBPS:           750,
		InviterStrategy:          CashbackStrategyPerHundred,
		InviteeStrategy:          CashbackStrategyRate,
		InviterFixedPerHundred:   15,
		InviterTiers:             []CashbackTier{},
		InviteeTiers:             []CashbackTier{},
		SettlementDays:           14,
		MaxRewardQuota:           90_000,
		DailyRewardQuota:         180_000,
		IPAccountThreshold:       4,
		DeviceAccountThreshold:   3,
		DailyTopUpCountThreshold: 8,
		FirstEnabledAt:           1_700_000_000,
		Version:                  9,
	}

	values, err := CashbackSettingOptionValues(original)
	require.NoError(t, err)
	parsed, err := ParseCashbackSettingOptions(values)
	require.NoError(t, err)
	assert.Equal(t, original, parsed)

	legacy := values
	delete(legacy, CashbackSettingName+".inviter_strategy")
	delete(legacy, CashbackSettingName+".invitee_strategy")
	delete(legacy, CashbackSettingName+".inviter_fixed_per_hundred")
	delete(legacy, CashbackSettingName+".invitee_fixed_per_hundred")
	parsed, err = ParseCashbackSettingOptions(legacy)
	require.NoError(t, err)
	assert.Equal(t, CashbackStrategyRate, parsed.InviterStrategy)
	assert.Equal(t, CashbackStrategyRate, parsed.InviteeStrategy)
	assert.Zero(t, parsed.InviterFixedPerHundred)
}

func TestCashbackTierValidationAndOptionRoundTrip(t *testing.T) {
	valid := DefaultCashbackSetting()
	valid.InviterEnabled = true
	valid.InviterStrategy = CashbackStrategyTiered
	valid.InviterTiers = []CashbackTier{{ThresholdCents: 10050, RewardCents: 250}, {ThresholdCents: 20000, RewardCents: 1500}}
	valid.InviteeStrategy = CashbackStrategyPerHundred
	valid.InviteeFixedPerHundred = 10
	valid.FirstEnabledAt = 1
	valid.MaxRewardQuota = 100000
	valid.DailyRewardQuota = 100000
	require.NoError(t, ValidateCashbackSetting(valid, true))
	values, err := CashbackSettingOptionValues(valid)
	require.NoError(t, err)
	parsed, err := ParseCashbackSettingOptions(values)
	require.NoError(t, err)
	assert.Equal(t, valid, parsed)
	delete(values, CashbackSettingName+".inviter_tiers")
	parsed, err = ParseCashbackSettingOptions(values)
	require.NoError(t, err)
	assert.Empty(t, parsed.InviterTiers)

	for _, tc := range []struct {
		name  string
		tiers []CashbackTier
	}{
		{"missing", nil},
		{"duplicate", []CashbackTier{{100, 1}, {100, 2}}},
		{"unordered", []CashbackTier{{200, 1}, {100, 2}}},
		{"zero threshold", []CashbackTier{{0, 1}}},
		{"negative reward", []CashbackTier{{100, -1}}},
		{"overpaid", []CashbackTier{{100, 101}}},
		{"overflow", []CashbackTier{{math.MaxInt64, 1}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s := valid
			s.InviterTiers = tc.tiers
			var validation *CashbackSettingValidationError
			require.ErrorAs(t, ValidateCashbackSetting(s, true), &validation)
			assert.Equal(t, "inviter_tiers", validation.Field)
		})
	}
	tooMany := valid
	tooMany.InviterTiers = make([]CashbackTier, CashbackMaxTiers+1)
	var validation *CashbackSettingValidationError
	require.ErrorAs(t, ValidateCashbackSetting(tooMany, true), &validation)
	assert.Equal(t, "inviter_tiers", validation.Field)

	combined := valid
	combined.InviteeFixedPerHundred = 95
	require.ErrorAs(t, ValidateCashbackSetting(combined, true), &validation)
	assert.Equal(t, "invitee_fixed_per_hundred", validation.Field)
}

func TestCashbackTierCacheReplacesEntireSchedule(t *testing.T) {
	cached := DefaultCashbackSetting()
	manager := config.NewConfigManager()
	manager.Register(CashbackSettingName, &cached)
	require.NoError(t, manager.UpdateFromMap(CashbackSettingName, map[string]string{
		"inviter_tiers": `[{"threshold_cents":10050,"reward_cents":250},{"threshold_cents":20000,"reward_cents":1500}]`,
	}))
	require.Len(t, cached.InviterTiers, 2)
	require.NoError(t, manager.UpdateFromMap(CashbackSettingName, map[string]string{
		"inviter_tiers": `[{"threshold_cents":50000,"reward_cents":4000}]`,
	}))
	assert.Equal(t, []CashbackTier{{50000, 4000}}, cached.InviterTiers)
	require.NoError(t, manager.UpdateFromMap(CashbackSettingName, map[string]string{"inviter_tiers": `[]`}))
	assert.Empty(t, cached.InviterTiers)
}

func TestParseCashbackSettingOptionsRejectsMalformedValues(t *testing.T) {
	_, err := ParseCashbackSettingOptions(map[string]string{
		"cashback_setting.inviter_rate_bps": "1.5",
	})
	require.Error(t, err)
}
