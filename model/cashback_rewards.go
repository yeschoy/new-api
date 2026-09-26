package model

import (
	"errors"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

type cashbackDirectionConfig struct {
	Direction     CashbackDirection
	BeneficiaryID int
	RateBPS       int
}

func CompleteTopUpCashbackTx(tx *gorm.DB, topUp *TopUp, creditedQuota int, source CashbackCompletionSource, heldFences ...*userQuotaMutationFences) error {
	if tx == nil || topUp == nil || topUp.Id <= 0 {
		return errors.New("invalid cashback completion input")
	}
	if creditedQuota <= 0 || creditedQuota > common.MaxWalletQuota {
		return ErrInvalidTopUpQuota
	}
	if !validCashbackCompletionSource(source) || source == "" {
		return errors.New("invalid cashback completion source")
	}
	var orderContext CashbackOrderContext
	err := lockForUpdate(tx).Where("top_up_id = ?", topUp.Id).First(&orderContext).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		contextRequired, boundaryErr := cashbackOrderContextRequiredTx(tx, topUp)
		if boundaryErr != nil {
			return boundaryErr
		}
		if contextRequired {
			return ErrCashbackOrderContextMissing
		}
		// Historical orders predate order-local eligibility snapshots. They
		// settle normally and are never backfilled.
		return nil
	}
	if err != nil {
		return err
	}
	if orderContext.UserID != topUp.UserId || orderContext.TradeNo != topUp.TradeNo || orderContext.PaymentProvider != topUp.PaymentProvider {
		return ErrPaymentMethodMismatch
	}
	if orderContext.CompletionSource != "" && orderContext.CompletionSource != source {
		return ErrCashbackInvalidState
	}
	if orderContext.CreditedQuota != 0 && orderContext.CreditedQuota != creditedQuota {
		return ErrCashbackInvalidState
	}
	orderContext.CreditedQuota = creditedQuota
	orderContext.CompletionSource = source
	orderContext.CompletionProvider = topUp.PaymentProvider
	if err := tx.Save(&orderContext).Error; err != nil {
		return err
	}
	if !eligibleCashbackCompletionSource(source) || !orderContext.EligibleAfterFirstEnable {
		return nil
	}

	setting, err := loadCashbackSettingTx(tx)
	if err != nil {
		return err
	}
	if err := operation_setting.ValidateCashbackSetting(setting, operation_setting.IsPaymentComplianceConfirmed()); err != nil {
		if setting.AnyDirectionEnabled() {
			return err
		}
		return nil
	}
	if !setting.AnyDirectionEnabled() || !operation_setting.IsPaymentComplianceConfirmed() {
		return nil
	}
	if setting.FirstEnabledAt <= 0 || topUp.CreateTime < setting.FirstEnabledAt {
		return ErrCashbackInvalidState
	}
	if topUp.Status != common.TopUpStatusSuccess || topUp.CompleteTime <= 0 {
		return ErrTopUpStatusInvalid
	}

	var initialInvitee User
	if err := tx.Unscoped().Where("id = ?", topUp.UserId).First(&initialInvitee).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	var campaign CashbackCampaign
	if setting.InviteeEnabled && orderContext.CampaignID > 0 {
		// The payment path already owns this row; direct transaction callers
		// must also lock it before users so early stop cannot race eligibility.
		err := lockForUpdate(tx).Where("id = ?", orderContext.CampaignID).First(&campaign).Error
		if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if err == nil {
			paymentCheckAt, clockErr := getDBTimestampOnStrict(tx)
			if clockErr != nil {
				return clockErr
			}
			if !campaign.activeAt(topUp.CompleteTime) || !campaign.activeAt(paymentCheckAt) {
				campaign = CashbackCampaign{}
			}
		}
	}
	users, err := lockCashbackUsersTx(tx, initialInvitee.Id, initialInvitee.InviterId)
	if err != nil {
		return err
	}
	invitee, inviteeOK := users[initialInvitee.Id]
	inviter, inviterOK := users[initialInvitee.InviterId]
	if !inviteeOK || invitee.DeletedAt.Valid || invitee.Status != common.UserStatusEnabled {
		return nil
	}
	validInviter := inviterOK && inviter.Id != invitee.Id && !inviter.DeletedAt.Valid &&
		inviter.Status == common.UserStatusEnabled && invitee.InviterId == inviter.Id
	if !validInviter {
		inviter = User{}
	}
	if !validInviter && campaign.ID == 0 {
		return nil
	}

	configSnapshot, err := common.Marshal(struct {
		operation_setting.CashbackSetting
		PaymentComplianceConfirmed bool   `json:"payment_compliance_confirmed"`
		ComplianceTermsVersion     string `json:"compliance_terms_version"`
	}{
		CashbackSetting:            setting,
		PaymentComplianceConfirmed: operation_setting.IsPaymentComplianceConfirmed(),
		ComplianceTermsVersion:     operation_setting.CurrentComplianceTermsVersion,
	})
	if err != nil {
		return err
	}
	directions := make([]cashbackDirectionConfig, 0, 2)
	if setting.InviterEnabled && validInviter {
		directions = append(directions, cashbackDirectionConfig{
			Direction: CashbackDirectionInviter, BeneficiaryID: inviter.Id, RateBPS: setting.InviterRateBPS,
		})
	}
	if setting.InviteeEnabled && campaign.ID > 0 {
		directions = append(directions, cashbackDirectionConfig{
			Direction: CashbackDirectionInvitee, BeneficiaryID: invitee.Id, RateBPS: setting.InviteeRateBPS,
		})
	}
	sort.Slice(directions, func(i, j int) bool {
		if directions[i].BeneficiaryID == directions[j].BeneficiaryID {
			return directions[i].Direction < directions[j].Direction
		}
		return directions[i].BeneficiaryID < directions[j].BeneficiaryID
	})

	for _, direction := range directions {
		var existing CashbackReward
		err := tx.Where("top_up_id = ? AND direction = ?", topUp.Id, direction.Direction).First(&existing).Error
		if err == nil {
			continue
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		calculatedQuota, err := calculateCashbackQuota(orderContext.BaseQuota, direction.RateBPS)
		if err != nil {
			return err
		}
		dailyUsed, err := cashbackDailyRewardUsedTx(tx, direction.BeneficiaryID, topUp.CompleteTime-cashbackRiskWindowSeconds)
		if err != nil {
			return err
		}
		rewardQuota, capReason := capCashbackQuota(calculatedQuota, dailyUsed, setting)
		if direction.Direction == CashbackDirectionInvitee && rewardQuota > 0 {
			var used int64
			orders := tx.Model(&CashbackOrderContext{}).Select("top_up_id").Where("campaign_id = ?", campaign.ID)
			if err := tx.Model(&CashbackReward{}).
				Where("top_up_id IN (?) AND direction = ? AND beneficiary_id = ? AND reward_quota > 0", orders, CashbackDirectionInvitee, invitee.Id).
				Count(&used).Error; err != nil {
				return err
			}
			if used >= int64(campaign.MaxRewardsPerUser) {
				continue
			}
		}
		blockedByDebt, err := cashbackHasOpenDebtTx(tx, direction.BeneficiaryID)
		if err != nil {
			return err
		}
		riskSnapshot, riskLevel, err := buildCashbackRiskSnapshotTx(tx, cashbackRiskInput{
			TopUp:           topUp,
			OrderContext:    &orderContext,
			Invitee:         invitee,
			Inviter:         inviter,
			BeneficiaryID:   direction.BeneficiaryID,
			CalculatedQuota: calculatedQuota,
			RewardQuota:     rewardQuota,
			CapReason:       capReason,
			DailyUsedQuota:  dailyUsed,
			Setting:         setting,
		})
		if err != nil {
			return err
		}

		settlementStatus := CashbackSettlementFrozen
		blockingReason := ""
		if blockedByDebt {
			rewardQuota = 0
			capReason = appendCashbackReason(capReason, "open_debt")
			blockingReason = "beneficiary_has_open_cashback_debt"
			settlementStatus = CashbackSettlementCanceled
			riskSnapshot.Flags = appendUniqueSorted(riskSnapshot.Flags, "open_debt")
			riskSnapshot.SignalCount = len(riskSnapshot.Flags)
			riskLevel = CashbackRiskSevere
		} else if rewardQuota == 0 {
			settlementStatus = CashbackSettlementCanceled
			if calculatedQuota == 0 {
				capReason = appendCashbackReason(capReason, "below_minimum")
			} else {
				capReason = appendCashbackReason(capReason, "daily_cap_exhausted")
			}
			blockingReason = "no_payable_cashback_quota"
		}
		riskJSON, err := common.Marshal(riskSnapshot)
		if err != nil {
			return err
		}

		reward := CashbackReward{
			TopUpID:          topUp.Id,
			TradeNo:          topUp.TradeNo,
			Direction:        direction.Direction,
			InviteeID:        invitee.Id,
			InviterID:        inviter.Id,
			BeneficiaryID:    direction.BeneficiaryID,
			BaseQuota:        orderContext.BaseQuota,
			RateBPS:          direction.RateBPS,
			CalculatedQuota:  calculatedQuota,
			RewardQuota:      rewardQuota,
			CapReason:        capReason,
			SettlementDays:   setting.SettlementDays,
			ConfigVersion:    setting.Version,
			PaidAt:           topUp.CompleteTime,
			AvailableAt:      topUp.CompleteTime + int64(setting.SettlementDays)*24*60*60,
			ReviewStatus:     CashbackReviewPending,
			SettlementStatus: settlementStatus,
			RiskLevel:        riskLevel,
			RiskSnapshot:     string(riskJSON),
			ConfigSnapshot:   string(configSnapshot),
			BlockingReason:   blockingReason,
		}
		if direction.Direction == CashbackDirectionInvitee && rewardQuota > 0 && setting.AutoReviewEnabled {
			reviewRequired := true
			switch riskLevel {
			case CashbackRiskLow:
				reviewRequired = setting.LowReviewRequired
			case CashbackRiskMedium:
				reviewRequired = setting.MediumReviewRequired
			case CashbackRiskHigh:
				reviewRequired = setting.HighReviewRequired
			case CashbackRiskSevere:
				reviewRequired = setting.SevereReviewRequired
			}
			if !reviewRequired {
				reward.ReviewStatus = CashbackReviewApproved
				reward.ReviewSource = CashbackReviewAutomatic
				reward.ReviewedAt = topUp.CompleteTime
				if setting.AutoReviewImmediateIssue {
					reward.AvailableAt = topUp.CompleteTime
				}
			}
		}
		if err := tx.Create(&reward).Error; err != nil {
			return err
		}
		if reward.ReviewSource == CashbackReviewAutomatic && reward.AvailableAt == topUp.CompleteTime {
			if common.RedisEnabled && (len(heldFences) == 0 || heldFences[0] == nil || !heldFences[0].owns(invitee.Id)) {
				return ErrUserQuotaMutationFenceLost
			}
			if len(heldFences) > 0 {
				if err := heldFences[0].verify(); err != nil {
					return err
				}
			}
			if err := requireCashbackReconciliationHealthyTx(tx); err != nil {
				return err
			}
			blockingReason, currentUsers, err := cashbackHardBlockReasonTx(tx, topUp, &orderContext, &reward)
			if err != nil {
				return err
			}
			if blockingReason != "" {
				return errors.New("immediate cashback blocked: " + blockingReason)
			}
			if _, err := issueLockedCashbackRewardTx(tx, &reward, currentUsers[reward.BeneficiaryID], topUp.CompleteTime); err != nil {
				return err
			}
			if len(heldFences) > 0 && heldFences[0] != nil {
				heldFences[0].cashbackIssued = true
				heldFences[0].cashbackRewardID = reward.ID
				heldFences[0].cashbackQuota = reward.RewardQuota
			}
		}
	}
	return nil
}

func MarkManualTopUpCashbackCompletionTx(tx *gorm.DB, topUp *TopUp, creditedQuota int) error {
	return CompleteTopUpCashbackTx(tx, topUp, creditedQuota, CashbackCompletionAdminManual)
}

func calculateCashbackQuota(baseQuota, rateBPS int) (int, error) {
	if baseQuota <= 0 || baseQuota > common.MaxWalletQuota || rateBPS < 0 || rateBPS > operation_setting.CashbackRateBasisPoints {
		return 0, errors.New("invalid cashback calculation input")
	}
	value := decimal.NewFromInt(int64(baseQuota)).
		Mul(decimal.NewFromInt(int64(rateBPS))).
		Div(decimal.NewFromInt(operation_setting.CashbackRateBasisPoints)).
		Floor()
	return common.WalletQuotaFromDecimalStrict(value)
}

func cashbackDailyRewardUsedTx(tx *gorm.DB, beneficiaryID int, cutoff int64) (int, error) {
	var used int64
	if err := tx.Model(&CashbackReward{}).
		Where("beneficiary_id = ? AND created_at >= ?", beneficiaryID, cutoff).
		Select("COALESCE(SUM(reward_quota), 0)").
		Scan(&used).Error; err != nil {
		return 0, err
	}
	if used < 0 || used > int64(common.MaxWalletQuota) {
		return 0, errors.New("cashback daily quota aggregate is invalid")
	}
	return int(used), nil
}

func capCashbackQuota(calculatedQuota, dailyUsed int, setting operation_setting.CashbackSetting) (int, string) {
	reward := calculatedQuota
	reasons := make([]string, 0, 2)
	if reward > setting.MaxRewardQuota {
		reward = setting.MaxRewardQuota
		reasons = append(reasons, "single_cap")
	}
	remaining := setting.DailyRewardQuota - dailyUsed
	if remaining < 0 {
		remaining = 0
	}
	if reward > remaining {
		reward = remaining
		reasons = append(reasons, "daily_cap")
	}
	return reward, strings.Join(reasons, ",")
}

func appendCashbackReason(current, reason string) string {
	if current == "" {
		return reason
	}
	for _, existing := range strings.Split(current, ",") {
		if existing == reason {
			return current
		}
	}
	return current + "," + reason
}

func appendUniqueSorted(values []string, value string) []string {
	for _, existing := range values {
		if existing == value {
			return values
		}
	}
	values = append(values, value)
	sort.Strings(values)
	return values
}
