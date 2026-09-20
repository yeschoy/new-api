package operation_setting

import (
	"errors"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDefaultCashbackSettingIsSafelyDisabled(t *testing.T) {
	setting := DefaultCashbackSetting()

	assert.False(t, setting.InviterEnabled)
	assert.False(t, setting.InviteeEnabled)
	assert.Zero(t, setting.InviterRateBPS)
	assert.Zero(t, setting.InviteeRateBPS)
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
		SettlementDays:           14,
		MaxRewardQuota:           90_000,
		DailyRewardQuota:         180_000,
		IPAccountThreshold:       4,
		DeviceAccountThreshold:   3,
		DailyTopUpCountThreshold: 8,
		FirstEnabledAt:           1_700_000_000,
		Version:                  9,
	}

	parsed, err := ParseCashbackSettingOptions(CashbackSettingOptionValues(original))
	require.NoError(t, err)
	assert.Equal(t, original, parsed)
}

func TestParseCashbackSettingOptionsRejectsMalformedValues(t *testing.T) {
	_, err := ParseCashbackSettingOptions(map[string]string{
		"cashback_setting.inviter_rate_bps": "1.5",
	})
	require.Error(t, err)
}
