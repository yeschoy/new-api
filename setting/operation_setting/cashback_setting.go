package operation_setting

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
)

const (
	CashbackSettingName        = "cashback_setting"
	CashbackStrategyRate       = "rate"
	CashbackStrategyPerHundred = "per_hundred"
	CashbackRateBasisPoints    = 10_000
	CashbackMinSettlementDays  = 1
	CashbackMaxSettlementDays  = 90
	CashbackMaxRiskThreshold   = 100_000
	CashbackDefaultSettlement  = 7
	CashbackDefaultIPThreshold = 3
	CashbackDefaultDeviceLimit = 2
	CashbackDefaultTopUpCount  = 5
)

type CashbackSetting struct {
	InviterEnabled           bool   `json:"inviter_enabled"`
	InviteeEnabled           bool   `json:"invitee_enabled"`
	InviterRateBPS           int    `json:"inviter_rate_bps"`
	InviteeRateBPS           int    `json:"invitee_rate_bps"`
	InviterStrategy          string `json:"inviter_strategy"`
	InviteeStrategy          string `json:"invitee_strategy"`
	InviterFixedPerHundred   int    `json:"inviter_fixed_per_hundred"`
	InviteeFixedPerHundred   int    `json:"invitee_fixed_per_hundred"`
	SettlementDays           int    `json:"settlement_days"`
	MaxRewardQuota           int    `json:"max_reward_quota"`
	DailyRewardQuota         int    `json:"daily_reward_quota"`
	IPAccountThreshold       int    `json:"ip_account_threshold"`
	DeviceAccountThreshold   int    `json:"device_account_threshold"`
	DailyTopUpCountThreshold int    `json:"daily_topup_count_threshold"`
	FirstEnabledAt           int64  `json:"first_enabled_at"`
	Version                  int64  `json:"version"`
	AutoReviewEnabled        bool   `json:"auto_review_enabled"`
	LowReviewRequired        bool   `json:"low_review_required"`
	MediumReviewRequired     bool   `json:"medium_review_required"`
	HighReviewRequired       bool   `json:"high_review_required"`
	SevereReviewRequired     bool   `json:"severe_review_required"`
	AutoReviewImmediateIssue bool   `json:"auto_review_immediate_issue"`
}

// Nil fields preserve the stored policy when an older client replaces the configuration.
type CashbackReviewPolicyUpdate struct {
	AutoReviewEnabled        *bool
	LowReviewRequired        *bool
	MediumReviewRequired     *bool
	HighReviewRequired       *bool
	SevereReviewRequired     *bool
	AutoReviewImmediateIssue *bool
	Strategy                 CashbackStrategyUpdate
}

func (u CashbackReviewPolicyUpdate) Apply(current *CashbackSetting) {
	u.Strategy.Apply(current)
	if u.AutoReviewEnabled != nil {
		current.AutoReviewEnabled = *u.AutoReviewEnabled
	}
	if u.LowReviewRequired != nil {
		current.LowReviewRequired = *u.LowReviewRequired
	}
	if u.MediumReviewRequired != nil {
		current.MediumReviewRequired = *u.MediumReviewRequired
	}
	if u.HighReviewRequired != nil {
		current.HighReviewRequired = *u.HighReviewRequired
	}
	if u.SevereReviewRequired != nil {
		current.SevereReviewRequired = *u.SevereReviewRequired
	}
	if u.AutoReviewImmediateIssue != nil {
		current.AutoReviewImmediateIssue = *u.AutoReviewImmediateIssue
	}
}

// Nil fields preserve the selected strategy and amount for older PUT clients.
type CashbackStrategyUpdate struct {
	InviterStrategy        *string
	InviteeStrategy        *string
	InviterFixedPerHundred *int
	InviteeFixedPerHundred *int
}

func (u CashbackStrategyUpdate) Apply(s *CashbackSetting) {
	if u.InviterStrategy != nil {
		s.InviterStrategy = *u.InviterStrategy
	}
	if u.InviteeStrategy != nil {
		s.InviteeStrategy = *u.InviteeStrategy
	}
	if u.InviterFixedPerHundred != nil {
		s.InviterFixedPerHundred = *u.InviterFixedPerHundred
	}
	if u.InviteeFixedPerHundred != nil {
		s.InviteeFixedPerHundred = *u.InviteeFixedPerHundred
	}
}

type CashbackSettingValidationError struct {
	Field   string
	Message string
}

func (e *CashbackSettingValidationError) Error() string {
	return e.Message
}

var cashbackSetting = DefaultCashbackSetting()

func init() {
	config.GlobalConfig.Register(CashbackSettingName, &cashbackSetting)
}

func DefaultCashbackSetting() CashbackSetting {
	return CashbackSetting{
		InviterStrategy:          CashbackStrategyRate,
		InviteeStrategy:          CashbackStrategyRate,
		SettlementDays:           CashbackDefaultSettlement,
		IPAccountThreshold:       CashbackDefaultIPThreshold,
		DeviceAccountThreshold:   CashbackDefaultDeviceLimit,
		DailyTopUpCountThreshold: CashbackDefaultTopUpCount,
		HighReviewRequired:       true,
		SevereReviewRequired:     true,
		AutoReviewImmediateIssue: true,
	}
}

func GetCashbackSetting() *CashbackSetting {
	return &cashbackSetting
}

func (s CashbackSetting) AnyDirectionEnabled() bool {
	return s.InviterEnabled || s.InviteeEnabled
}

func cashbackValidationError(field, message string) error {
	return &CashbackSettingValidationError{Field: field, Message: message}
}

func ValidateCashbackSetting(s CashbackSetting, complianceConfirmed bool) error {
	if s.InviterRateBPS < 0 || s.InviterRateBPS > CashbackRateBasisPoints {
		return cashbackValidationError("inviter_rate_bps", "inviter cashback rate must be between 0 and 10000 basis points")
	}
	if s.InviteeRateBPS < 0 || s.InviteeRateBPS > CashbackRateBasisPoints {
		return cashbackValidationError("invitee_rate_bps", "invitee cashback rate must be between 0 and 10000 basis points")
	}
	if s.InviterStrategy != CashbackStrategyRate && s.InviterStrategy != CashbackStrategyPerHundred {
		return cashbackValidationError("inviter_strategy", "invalid inviter cashback strategy")
	}
	if s.InviteeStrategy != CashbackStrategyRate && s.InviteeStrategy != CashbackStrategyPerHundred {
		return cashbackValidationError("invitee_strategy", "invalid payer cashback strategy")
	}
	if s.InviterFixedPerHundred < 0 || s.InviterFixedPerHundred > 100 {
		return cashbackValidationError("inviter_fixed_per_hundred", "inviter fixed cashback must be between 0 and 100")
	}
	if s.InviteeFixedPerHundred < 0 || s.InviteeFixedPerHundred > 100 {
		return cashbackValidationError("invitee_fixed_per_hundred", "payer fixed cashback must be between 0 and 100")
	}
	inviterNominal, inviteeNominal := s.InviterRateBPS, s.InviteeRateBPS
	inviterField, inviteeField := "inviter_rate_bps", "invitee_rate_bps"
	if s.InviterStrategy == CashbackStrategyPerHundred {
		inviterNominal, inviterField = s.InviterFixedPerHundred*100, "inviter_fixed_per_hundred"
	}
	if s.InviteeStrategy == CashbackStrategyPerHundred {
		inviteeNominal, inviteeField = s.InviteeFixedPerHundred*100, "invitee_fixed_per_hundred"
	}
	if s.InviterEnabled && inviterNominal == 0 {
		return cashbackValidationError(inviterField, "inviter cashback must be positive when enabled")
	}
	if s.InviteeEnabled && inviteeNominal == 0 {
		return cashbackValidationError(inviteeField, "payer cashback must be positive when enabled")
	}
	if inviterNominal+inviteeNominal > CashbackRateBasisPoints {
		return cashbackValidationError(inviteeField, "combined cashback nominal return must not exceed 100 percent")
	}
	if s.SettlementDays < CashbackMinSettlementDays || s.SettlementDays > CashbackMaxSettlementDays {
		return cashbackValidationError("settlement_days", "cashback settlement days must be between 1 and 90")
	}
	if s.MaxRewardQuota < 0 || s.MaxRewardQuota > common.MaxWalletQuota {
		return cashbackValidationError("max_reward_quota", fmt.Sprintf("single cashback limit must be between 0 and %d", common.MaxWalletQuota))
	}
	if s.DailyRewardQuota < 0 || s.DailyRewardQuota > common.MaxWalletQuota {
		return cashbackValidationError("daily_reward_quota", fmt.Sprintf("daily cashback limit must be between 0 and %d", common.MaxWalletQuota))
	}
	if s.IPAccountThreshold < 2 || s.IPAccountThreshold > CashbackMaxRiskThreshold {
		return cashbackValidationError("ip_account_threshold", fmt.Sprintf("IP account threshold must be between 2 and %d", CashbackMaxRiskThreshold))
	}
	if s.DeviceAccountThreshold < 2 || s.DeviceAccountThreshold > CashbackMaxRiskThreshold {
		return cashbackValidationError("device_account_threshold", fmt.Sprintf("device account threshold must be between 2 and %d", CashbackMaxRiskThreshold))
	}
	if s.DailyTopUpCountThreshold < 1 || s.DailyTopUpCountThreshold > CashbackMaxRiskThreshold {
		return cashbackValidationError("daily_topup_count_threshold", fmt.Sprintf("daily top-up count threshold must be between 1 and %d", CashbackMaxRiskThreshold))
	}
	if s.FirstEnabledAt < 0 {
		return cashbackValidationError("first_enabled_at", "first enabled time cannot be negative")
	}
	if s.Version < 0 {
		return cashbackValidationError("version", "cashback configuration version cannot be negative")
	}
	if s.AnyDirectionEnabled() {
		if s.FirstEnabledAt <= 0 {
			return cashbackValidationError("first_enabled_at", "first enabled time is required when cashback is enabled")
		}
		if !complianceConfirmed {
			return cashbackValidationError("compliance_confirmed", "payment compliance must be confirmed before cashback is enabled")
		}
		if s.MaxRewardQuota <= 0 {
			return cashbackValidationError("max_reward_quota", "single cashback limit must be positive before cashback is enabled")
		}
		if s.DailyRewardQuota <= 0 {
			return cashbackValidationError("daily_reward_quota", "daily cashback limit must be positive before cashback is enabled")
		}
	}
	return nil
}

func CashbackSettingOptionValues(s CashbackSetting) map[string]string {
	prefix := CashbackSettingName + "."
	return map[string]string{
		prefix + "inviter_enabled":             strconv.FormatBool(s.InviterEnabled),
		prefix + "invitee_enabled":             strconv.FormatBool(s.InviteeEnabled),
		prefix + "inviter_rate_bps":            strconv.Itoa(s.InviterRateBPS),
		prefix + "invitee_rate_bps":            strconv.Itoa(s.InviteeRateBPS),
		prefix + "inviter_strategy":            s.InviterStrategy,
		prefix + "invitee_strategy":            s.InviteeStrategy,
		prefix + "inviter_fixed_per_hundred":   strconv.Itoa(s.InviterFixedPerHundred),
		prefix + "invitee_fixed_per_hundred":   strconv.Itoa(s.InviteeFixedPerHundred),
		prefix + "settlement_days":             strconv.Itoa(s.SettlementDays),
		prefix + "max_reward_quota":            strconv.Itoa(s.MaxRewardQuota),
		prefix + "daily_reward_quota":          strconv.Itoa(s.DailyRewardQuota),
		prefix + "ip_account_threshold":        strconv.Itoa(s.IPAccountThreshold),
		prefix + "device_account_threshold":    strconv.Itoa(s.DeviceAccountThreshold),
		prefix + "daily_topup_count_threshold": strconv.Itoa(s.DailyTopUpCountThreshold),
		prefix + "first_enabled_at":            strconv.FormatInt(s.FirstEnabledAt, 10),
		prefix + "version":                     strconv.FormatInt(s.Version, 10),
		prefix + "auto_review_enabled":         strconv.FormatBool(s.AutoReviewEnabled),
		prefix + "low_review_required":         strconv.FormatBool(s.LowReviewRequired),
		prefix + "medium_review_required":      strconv.FormatBool(s.MediumReviewRequired),
		prefix + "high_review_required":        strconv.FormatBool(s.HighReviewRequired),
		prefix + "severe_review_required":      strconv.FormatBool(s.SevereReviewRequired),
		prefix + "auto_review_immediate_issue": strconv.FormatBool(s.AutoReviewImmediateIssue),
	}
}

func CashbackSettingOptionKeys() []string {
	values := CashbackSettingOptionValues(DefaultCashbackSetting())
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	return keys
}

func ParseCashbackSettingOptions(values map[string]string) (CashbackSetting, error) {
	setting := DefaultCashbackSetting()
	prefix := CashbackSettingName + "."
	lookup := func(name string) (string, bool) {
		value, ok := values[prefix+name]
		if ok {
			return strings.TrimSpace(value), true
		}
		value, ok = values[name]
		return strings.TrimSpace(value), ok
	}
	parseBool := func(name string, target *bool) error {
		value, ok := lookup(name)
		if !ok {
			return nil
		}
		parsed, err := strconv.ParseBool(value)
		if err != nil {
			return fmt.Errorf("invalid %s: %w", name, err)
		}
		*target = parsed
		return nil
	}
	parseInt := func(name string, target *int) error {
		value, ok := lookup(name)
		if !ok {
			return nil
		}
		parsed, err := strconv.ParseInt(value, 10, 64)
		if err != nil || int64(int(parsed)) != parsed {
			if err == nil {
				err = errors.New("integer overflow")
			}
			return fmt.Errorf("invalid %s: %w", name, err)
		}
		*target = int(parsed)
		return nil
	}
	parseInt64 := func(name string, target *int64) error {
		value, ok := lookup(name)
		if !ok {
			return nil
		}
		parsed, err := strconv.ParseInt(value, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid %s: %w", name, err)
		}
		*target = parsed
		return nil
	}

	parsers := []func() error{
		func() error { return parseBool("inviter_enabled", &setting.InviterEnabled) },
		func() error { return parseBool("invitee_enabled", &setting.InviteeEnabled) },
		func() error { return parseInt("inviter_rate_bps", &setting.InviterRateBPS) },
		func() error { return parseInt("invitee_rate_bps", &setting.InviteeRateBPS) },
		func() error {
			if value, ok := lookup("inviter_strategy"); ok {
				setting.InviterStrategy = value
			}
			return nil
		},
		func() error {
			if value, ok := lookup("invitee_strategy"); ok {
				setting.InviteeStrategy = value
			}
			return nil
		},
		func() error { return parseInt("inviter_fixed_per_hundred", &setting.InviterFixedPerHundred) },
		func() error { return parseInt("invitee_fixed_per_hundred", &setting.InviteeFixedPerHundred) },
		func() error { return parseInt("settlement_days", &setting.SettlementDays) },
		func() error { return parseInt("max_reward_quota", &setting.MaxRewardQuota) },
		func() error { return parseInt("daily_reward_quota", &setting.DailyRewardQuota) },
		func() error { return parseInt("ip_account_threshold", &setting.IPAccountThreshold) },
		func() error { return parseInt("device_account_threshold", &setting.DeviceAccountThreshold) },
		func() error { return parseInt("daily_topup_count_threshold", &setting.DailyTopUpCountThreshold) },
		func() error { return parseInt64("first_enabled_at", &setting.FirstEnabledAt) },
		func() error { return parseInt64("version", &setting.Version) },
		func() error { return parseBool("auto_review_enabled", &setting.AutoReviewEnabled) },
		func() error { return parseBool("low_review_required", &setting.LowReviewRequired) },
		func() error { return parseBool("medium_review_required", &setting.MediumReviewRequired) },
		func() error { return parseBool("high_review_required", &setting.HighReviewRequired) },
		func() error { return parseBool("severe_review_required", &setting.SevereReviewRequired) },
		func() error { return parseBool("auto_review_immediate_issue", &setting.AutoReviewImmediateIssue) },
	}
	for _, parse := range parsers {
		if err := parse(); err != nil {
			return CashbackSetting{}, err
		}
	}
	return setting, nil
}
