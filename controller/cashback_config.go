package controller

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/gin-gonic/gin"
)

type cashbackConfigUpdateRequest struct {
	InviterEnabled           *bool `json:"inviter_enabled"`
	InviteeEnabled           *bool `json:"invitee_enabled"`
	InviterRateBPS           *int  `json:"inviter_rate_bps"`
	InviteeRateBPS           *int  `json:"invitee_rate_bps"`
	SettlementDays           *int  `json:"settlement_days"`
	MaxRewardQuota           *int  `json:"max_reward_quota"`
	DailyRewardQuota         *int  `json:"daily_reward_quota"`
	IPAccountThreshold       *int  `json:"ip_account_threshold"`
	DeviceAccountThreshold   *int  `json:"device_account_threshold"`
	DailyTopUpCountThreshold *int  `json:"daily_topup_count_threshold"`
	AutoReviewEnabled        *bool `json:"auto_review_enabled"`
	LowReviewRequired        *bool `json:"low_review_required"`
	MediumReviewRequired     *bool `json:"medium_review_required"`
	HighReviewRequired       *bool `json:"high_review_required"`
	SevereReviewRequired     *bool `json:"severe_review_required"`
	AutoReviewImmediateIssue *bool `json:"auto_review_immediate_issue"`
}

func decodeCashbackConfigUpdate(reader io.Reader) (cashbackConfigUpdateRequest, error) {
	var request cashbackConfigUpdateRequest
	decoder := json.NewDecoder(reader)
	if err := decoder.Decode(&request); err != nil {
		return request, err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		if err == nil {
			return request, errors.New("multiple cashback configuration documents")
		}
		return request, err
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
	ComplianceConfirmed bool `json:"compliance_confirmed"`
}

var cashbackConfigUpdateMu sync.Mutex

func GetCashbackConfig(c *gin.Context) {
	setting, err := model.GetCashbackSettingFromDB()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, cashbackConfigResponse{
		CashbackSetting:     setting,
		ComplianceConfirmed: operation_setting.IsPaymentComplianceConfirmed(),
	})
}

func UpdateCashbackConfig(c *gin.Context) {
	request, err := decodeCashbackConfigUpdate(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "invalid cashback configuration",
			"field":   "config",
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
			AutoReviewEnabled: request.AutoReviewEnabled, LowReviewRequired: request.LowReviewRequired,
			MediumReviewRequired: request.MediumReviewRequired, HighReviewRequired: request.HighReviewRequired,
			SevereReviewRequired: request.SevereReviewRequired, AutoReviewImmediateIssue: request.AutoReviewImmediateIssue,
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
		CashbackSetting:     next,
		ComplianceConfirmed: operation_setting.IsPaymentComplianceConfirmed(),
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
	if current.LowReviewRequired != next.LowReviewRequired {
		fields = append(fields, "low_review_required")
	}
	if current.MediumReviewRequired != next.MediumReviewRequired {
		fields = append(fields, "medium_review_required")
	}
	if current.HighReviewRequired != next.HighReviewRequired {
		fields = append(fields, "high_review_required")
	}
	if current.SevereReviewRequired != next.SevereReviewRequired {
		fields = append(fields, "severe_review_required")
	}
	if current.AutoReviewImmediateIssue != next.AutoReviewImmediateIssue {
		fields = append(fields, "auto_review_immediate_issue")
	}
	if current.FirstEnabledAt != next.FirstEnabledAt {
		fields = append(fields, "first_enabled_at")
	}
	return fields
}
