package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
)

// CashbackPayerPreview is display-only. It is never accepted by checkout or settlement.
type CashbackPayerPreview struct {
	Status          string `json:"status"`
	Strategy        string `json:"strategy,omitempty"`
	RateBPS         int    `json:"rate_bps,omitempty"`
	FixedPerHundred int    `json:"fixed_per_hundred,omitempty"`
	RewardQuota     int    `json:"reward_quota"`
	AsOf            int64  `json:"as_of"`
}

// PreviewPayerCashback reads the same face-value and cap logic as payment
// completion, without reserving a campaign slot or writing a reward.
func PreviewPayerCashback(userID, baseQuota int, faceAmount int64, factor string) (CashbackPayerPreview, error) {
	if userID <= 0 || baseQuota < 0 || baseQuota > common.MaxWalletQuota || faceAmount < 0 {
		return CashbackPayerPreview{}, ErrCashbackInvalidInput
	}
	preview := CashbackPayerPreview{Status: "inactive"}
	err := DB.Transaction(func(tx *gorm.DB) error {
		var err error
		preview.AsOf, err = getDBTimestampOnStrict(tx)
		if err != nil {
			return err
		}
		setting, err := loadCashbackSettingTx(tx)
		if err != nil {
			return err
		}
		if !setting.InviteeEnabled || !operation_setting.IsPaymentComplianceConfirmed() || setting.FirstEnabledAt <= 0 || preview.AsOf < setting.FirstEnabledAt {
			return nil
		}
		if err := operation_setting.ValidateCashbackSetting(setting, true); err != nil {
			return err
		}
		if baseQuota == 0 {
			preview.Status = "select_amount"
			return nil
		}
		var campaign CashbackCampaign
		err = tx.Where("start_at <= ? AND end_at > ? AND (stopped_at = 0 OR stopped_at > ?)", preview.AsOf, preview.AsOf, preview.AsOf).
			Order("id desc").First(&campaign).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			preview.Status = "no_campaign"
			return nil
		}
		if err != nil {
			return err
		}
		preview.Strategy = setting.InviteeStrategy
		if preview.Strategy == operation_setting.CashbackStrategyPerHundred {
			preview.FixedPerHundred = setting.InviteeFixedPerHundred
		} else {
			preview.RateBPS = setting.InviteeRateBPS
		}
		var user User
		if err := tx.Select("id", "status", "deleted_at").Where("id = ?", userID).First(&user).Error; err != nil {
			return err
		}
		if user.Status != common.UserStatusEnabled {
			preview.Status = "ineligible"
			return nil
		}
		blocked, err := cashbackHasOpenDebtTx(tx, userID)
		if err != nil {
			return err
		}
		if blocked {
			preview.Status = "ineligible"
			return nil
		}
		used, err := cashbackCampaignPayerRewardsUsedTx(tx, campaign.ID, userID)
		if err != nil {
			return err
		}
		if used >= int64(campaign.MaxRewardsPerUser) {
			preview.Status = "limit_reached"
			return nil
		}
		context := CashbackOrderContext{BaseQuota: baseQuota, FaceAmount: faceAmount, QuotaPerFaceUnit: factor}
		var calculated int
		if preview.Strategy == operation_setting.CashbackStrategyPerHundred {
			calculated, err = calculateCashbackFixedQuota(&context, preview.FixedPerHundred)
		} else {
			calculated, err = calculateCashbackQuota(baseQuota, preview.RateBPS)
		}
		if err != nil {
			return err
		}
		if calculated == 0 {
			preview.Status = "below_minimum"
			return nil
		}
		dailyUsed, err := cashbackDailyRewardUsedTx(tx, userID, preview.AsOf-cashbackRiskWindowSeconds)
		if err != nil {
			return err
		}
		preview.RewardQuota, _ = capCashbackQuota(calculated, dailyUsed, setting)
		if preview.RewardQuota == 0 {
			preview.Status = "cap_exhausted"
		} else {
			preview.Status = "estimated"
		}
		return nil
	})
	return preview, err
}
