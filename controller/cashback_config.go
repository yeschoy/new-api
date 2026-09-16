package controller

import (
	"errors"
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
	InviterEnabled           bool `json:"inviter_enabled"`
	InviteeEnabled           bool `json:"invitee_enabled"`
	InviterRateBPS           int  `json:"inviter_rate_bps"`
	InviteeRateBPS           int  `json:"invitee_rate_bps"`
	SettlementDays           int  `json:"settlement_days"`
	MaxRewardQuota           int  `json:"max_reward_quota"`
	DailyRewardQuota         int  `json:"daily_reward_quota"`
	IPAccountThreshold       int  `json:"ip_account_threshold"`
	DeviceAccountThreshold   int  `json:"device_account_threshold"`
	DailyTopUpCountThreshold int  `json:"daily_topup_count_threshold"`
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
	var request cashbackConfigUpdateRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid cashback configuration"})
		return
	}

	cashbackConfigUpdateMu.Lock()
	defer cashbackConfigUpdateMu.Unlock()

	candidate := operation_setting.CashbackSetting{
		InviterEnabled:           request.InviterEnabled,
		InviteeEnabled:           request.InviteeEnabled,
		InviterRateBPS:           request.InviterRateBPS,
		InviteeRateBPS:           request.InviteeRateBPS,
		SettlementDays:           request.SettlementDays,
		MaxRewardQuota:           request.MaxRewardQuota,
		DailyRewardQuota:         request.DailyRewardQuota,
		IPAccountThreshold:       request.IPAccountThreshold,
		DeviceAccountThreshold:   request.DeviceAccountThreshold,
		DailyTopUpCountThreshold: request.DailyTopUpCountThreshold,
	}
	current, next, err := model.UpdateCashbackSettingAtomic(
		candidate,
		operation_setting.IsPaymentComplianceConfirmed(),
		time.Now().Unix(),
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
	if current.FirstEnabledAt != next.FirstEnabledAt {
		fields = append(fields, "first_enabled_at")
	}
	return fields
}
