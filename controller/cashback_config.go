package controller

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
)

type cashbackConfigUpdateRequest struct {
	InviterEnabled           *bool           `json:"inviter_enabled"`
	InviteeEnabled           *bool           `json:"invitee_enabled"`
	InviterRateBPS           *int            `json:"inviter_rate_bps"`
	InviteeRateBPS           *int            `json:"invitee_rate_bps"`
	InviterStrategy          *string         `json:"inviter_strategy"`
	InviteeStrategy          *string         `json:"invitee_strategy"`
	InviterFixedPerHundred   *int            `json:"inviter_fixed_per_hundred"`
	InviteeFixedPerHundred   *int            `json:"invitee_fixed_per_hundred"`
	InviterTiers             json.RawMessage `json:"inviter_tiers"`
	InviteeTiers             json.RawMessage `json:"invitee_tiers"`
	SettlementDays           *int            `json:"settlement_days"`
	MaxRewardQuota           *int            `json:"max_reward_quota"`
	DailyRewardQuota         *int            `json:"daily_reward_quota"`
	IPAccountThreshold       *int            `json:"ip_account_threshold"`
	DeviceAccountThreshold   *int            `json:"device_account_threshold"`
	DailyTopUpCountThreshold *int            `json:"daily_topup_count_threshold"`
	AutoReviewEnabled        *bool           `json:"auto_review_enabled"`
	AutoReviewRiskFlags      json.RawMessage `json:"auto_review_risk_flags"`
	AutoReviewImmediateIssue *bool           `json:"auto_review_immediate_issue"`
	inviterTiersParsed       *([]operation_setting.CashbackTier)
	inviteeTiersParsed       *([]operation_setting.CashbackTier)
	autoReviewFlagsParsed    *[]string
}

func decodeCashbackConfigUpdate(reader io.Reader) (cashbackConfigUpdateRequest, error) {
	var request cashbackConfigUpdateRequest
	data, err := io.ReadAll(reader)
	if err != nil {
		return request, err
	}
	err = common.Unmarshal(data, &request)
	if err != nil {
		return request, err
	}
	for _, input := range []struct {
		raw    json.RawMessage
		target **[]operation_setting.CashbackTier
		field  string
	}{
		{request.InviterTiers, &request.inviterTiersParsed, "inviter_tiers"},
		{request.InviteeTiers, &request.inviteeTiersParsed, "invitee_tiers"},
	} {
		if input.raw == nil {
			continue
		}
		if len(input.raw) > operation_setting.CashbackMaxTiersJSONBytes || strings.TrimSpace(string(input.raw)) == "null" {
			return request, &operation_setting.CashbackSettingValidationError{Field: input.field, Message: "invalid cashback tiers"}
		}
		var tiers []operation_setting.CashbackTier
		if err := common.Unmarshal(input.raw, &tiers); err != nil {
			return request, &operation_setting.CashbackSettingValidationError{Field: input.field, Message: "invalid cashback tiers"}
		}
		*input.target = &tiers
	}
	if request.AutoReviewRiskFlags != nil {
		raw := request.AutoReviewRiskFlags
		if len(raw) > operation_setting.CashbackMaxRiskFlagsJSONBytes || strings.TrimSpace(string(raw)) == "null" {
			return request, &operation_setting.CashbackSettingValidationError{Field: "auto_review_risk_flags", Message: "invalid auto-review risk flags"}
		}
		var flags []string
		if err := common.Unmarshal(raw, &flags); err != nil || flags == nil {
			return request, &operation_setting.CashbackSettingValidationError{Field: "auto_review_risk_flags", Message: "invalid auto-review risk flags"}
		}
		if err := operation_setting.ValidateCashbackAutoReviewRiskFlags(flags); err != nil {
			return request, err
		}
		request.autoReviewFlagsParsed = &flags
	}
	return request, nil
}

func (request cashbackConfigUpdateRequest) candidate() (operation_setting.CashbackSetting, string) {
	missing := ""
	switch {
	case request.InviterEnabled == nil:
		missing = "inviter_enabled"
	case request.InviteeEnabled == nil:
		missing = "invitee_enabled"
	case request.InviterRateBPS == nil:
		missing = "inviter_rate_bps"
	case request.InviteeRateBPS == nil:
		missing = "invitee_rate_bps"
	case request.SettlementDays == nil:
		missing = "settlement_days"
	case request.MaxRewardQuota == nil:
		missing = "max_reward_quota"
	case request.DailyRewardQuota == nil:
		missing = "daily_reward_quota"
	case request.IPAccountThreshold == nil:
		missing = "ip_account_threshold"
	case request.DeviceAccountThreshold == nil:
		missing = "device_account_threshold"
	case request.DailyTopUpCountThreshold == nil:
		missing = "daily_topup_count_threshold"
	}
	if missing != "" {
		return operation_setting.CashbackSetting{}, missing
	}
	return operation_setting.CashbackSetting{
		InviterEnabled:           *request.InviterEnabled,
		InviteeEnabled:           *request.InviteeEnabled,
		InviterRateBPS:           *request.InviterRateBPS,
		InviteeRateBPS:           *request.InviteeRateBPS,
		SettlementDays:           *request.SettlementDays,
		MaxRewardQuota:           *request.MaxRewardQuota,
		DailyRewardQuota:         *request.DailyRewardQuota,
		IPAccountThreshold:       *request.IPAccountThreshold,
		DeviceAccountThreshold:   *request.DeviceAccountThreshold,
		DailyTopUpCountThreshold: *request.DailyTopUpCountThreshold,
	}, ""
}

type cashbackConfigResponse struct {
	operation_setting.CashbackSetting
	ComplianceConfirmed          bool     `json:"compliance_confirmed"`
	AvailableAutoReviewRiskFlags []string `json:"available_auto_review_risk_flags"`
}

var cashbackConfigUpdateMu sync.Mutex

// PublicCashbackOffers deliberately returns only active, display-safe rules.
func PublicCashbackOffers(c *gin.Context) {
	offers, err := model.GetCashbackPublicOffers()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "Cashback offers unavailable"})
		return
	}
	common.ApiSuccess(c, offers)
}

func GetCashbackConfig(c *gin.Context) {
	setting, err := model.GetCashbackSettingFromDB()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, cashbackConfigResponse{
		CashbackSetting:              setting,
		ComplianceConfirmed:          operation_setting.IsPaymentComplianceConfirmed(),
		AvailableAutoReviewRiskFlags: operation_setting.CashbackAutoReviewRiskFlags(),
	})
}

func UpdateCashbackConfig(c *gin.Context) {
	request, err := decodeCashbackConfigUpdate(c.Request.Body)
	if err != nil {
		field := "config"
		var typeErr *json.UnmarshalTypeError
		if errors.As(err, &typeErr) {
			switch typeErr.Field {
			case "inviter_strategy", "invitee_strategy", "inviter_fixed_per_hundred", "invitee_fixed_per_hundred", "inviter_tiers", "invitee_tiers":
				field = typeErr.Field
			}
		}
		var validationErr *operation_setting.CashbackSettingValidationError
		if errors.As(err, &validationErr) {
			field = validationErr.Field
		}
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "invalid cashback configuration",
			"field":   field,
		})
		return
	}
	candidate, missingField := request.candidate()
	if missingField != "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "missing cashback configuration field",
			"field":   missingField,
		})
		return
	}

	cashbackConfigUpdateMu.Lock()
	defer cashbackConfigUpdateMu.Unlock()

	current, next, err := model.UpdateCashbackSettingAtomic(
		candidate,
		operation_setting.IsPaymentComplianceConfirmed(),
		time.Now().Unix(),
		operation_setting.CashbackReviewPolicyUpdate{
			AutoReviewEnabled: request.AutoReviewEnabled, AutoReviewRiskFlags: request.autoReviewFlagsParsed,
			AutoReviewImmediateIssue: request.AutoReviewImmediateIssue,
			Strategy: operation_setting.CashbackStrategyUpdate{
				InviterStrategy: request.InviterStrategy, InviteeStrategy: request.InviteeStrategy,
				InviterFixedPerHundred: request.InviterFixedPerHundred, InviteeFixedPerHundred: request.InviteeFixedPerHundred,
				InviterTiers: request.inviterTiersParsed, InviteeTiers: request.inviteeTiersParsed,
			},
		},
	)
	if err != nil {
		var validationErr *operation_setting.CashbackSettingValidationError
		if errors.As(err, &validationErr) {
			c.JSON(http.StatusBadRequest, gin.H{
				"success": false,
				"message": validationErr.Message,
				"field":   validationErr.Field,
			})
			return
		}
		common.ApiError(c, err)
		return
	}

	changedFields := cashbackConfigChangedFields(current, next)
	recordManageAudit(c, "cashback.config_update", map[string]interface{}{
		"fields": strings.Join(changedFields, ","),
	})
	common.ApiSuccess(c, cashbackConfigResponse{
		CashbackSetting:              next,
		ComplianceConfirmed:          operation_setting.IsPaymentComplianceConfirmed(),
		AvailableAutoReviewRiskFlags: operation_setting.CashbackAutoReviewRiskFlags(),
	})
}

func cashbackConfigChangedFields(current, next operation_setting.CashbackSetting) []string {
	fields := make([]string, 0, 12)
	if current.InviterEnabled != next.InviterEnabled {
		fields = append(fields, "inviter_enabled")
	}
	if current.InviteeEnabled != next.InviteeEnabled {
		fields = append(fields, "invitee_enabled")
	}
	if current.InviterRateBPS != next.InviterRateBPS {
		fields = append(fields, "inviter_rate_bps")
	}
	if current.InviteeRateBPS != next.InviteeRateBPS {
		fields = append(fields, "invitee_rate_bps")
	}
	if current.InviterStrategy != next.InviterStrategy {
		fields = append(fields, "inviter_strategy")
	}
	if current.InviteeStrategy != next.InviteeStrategy {
		fields = append(fields, "invitee_strategy")
	}
	if current.InviterFixedPerHundred != next.InviterFixedPerHundred {
		fields = append(fields, "inviter_fixed_per_hundred")
	}
	if current.InviteeFixedPerHundred != next.InviteeFixedPerHundred {
		fields = append(fields, "invitee_fixed_per_hundred")
	}
	if !slices.Equal(current.InviterTiers, next.InviterTiers) {
		fields = append(fields, "inviter_tiers")
	}
	if !slices.Equal(current.InviteeTiers, next.InviteeTiers) {
		fields = append(fields, "invitee_tiers")
	}
	if current.SettlementDays != next.SettlementDays {
		fields = append(fields, "settlement_days")
	}
	if current.MaxRewardQuota != next.MaxRewardQuota {
		fields = append(fields, "max_reward_quota")
	}
	if current.DailyRewardQuota != next.DailyRewardQuota {
		fields = append(fields, "daily_reward_quota")
	}
	if current.IPAccountThreshold != next.IPAccountThreshold {
		fields = append(fields, "ip_account_threshold")
	}
	if current.DeviceAccountThreshold != next.DeviceAccountThreshold {
		fields = append(fields, "device_account_threshold")
	}
	if current.DailyTopUpCountThreshold != next.DailyTopUpCountThreshold {
		fields = append(fields, "daily_topup_count_threshold")
	}
	if current.AutoReviewEnabled != next.AutoReviewEnabled {
		fields = append(fields, "auto_review_enabled")
	}
	if !slices.Equal(current.AutoReviewRiskFlags, next.AutoReviewRiskFlags) || (current.AutoReviewRiskFlags == nil) != (next.AutoReviewRiskFlags == nil) {
		fields = append(fields, "auto_review_risk_flags")
	}
	if current.AutoReviewImmediateIssue != next.AutoReviewImmediateIssue {
		fields = append(fields, "auto_review_immediate_issue")
	}
	if current.FirstEnabledAt != next.FirstEnabledAt {
		fields = append(fields, "first_enabled_at")
	}
	return fields
}
