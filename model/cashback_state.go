package model

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"gorm.io/gorm"
)

type CashbackReviewAction string

const cashbackSettlementRetryDelaySeconds int64 = 5 * 60

const (
	CashbackReviewActionApprove CashbackReviewAction = "approve"
	CashbackReviewActionReject  CashbackReviewAction = "reject"
)

type CashbackReviewResult struct {
	Reward     CashbackReward `json:"reward"`
	Issued     bool           `json:"issued"`
	IssueError string         `json:"issue_error,omitempty"`
}

type CashbackSettlementOutcome struct {
	RewardID     int64  `json:"reward_id"`
	Issued       bool   `json:"issued"`
	Blocked      bool   `json:"blocked"`
	Skipped      bool   `json:"skipped"`
	ErrorMessage string `json:"error,omitempty"`
}

type CashbackSettlementRunResult struct {
	Scanned int `json:"scanned"`
	Issued  int `json:"issued"`
	Blocked int `json:"blocked"`
	Skipped int `json:"skipped"`
	Failed  int `json:"failed"`
}

type CashbackIncidentInput struct {
	Kind                    CashbackIncidentKind
	CumulativeRefundRateBPS int
	Reason                  string
	EvidenceRef             string
	OperatorID              int
	Now                     int64
}

type CashbackIncidentResult struct {
	OrderContext          CashbackOrderContext `json:"order_context"`
	RewardRecoveredQuota  int                  `json:"reward_recovered_quota"`
	RewardDebtQuota       int                  `json:"reward_debt_quota"`
	PrincipalRecoveredNow int                  `json:"principal_recovered_now"`
	PrincipalDebtQuota    int                  `json:"principal_debt_quota"`
	Idempotent            bool                 `json:"idempotent"`
}

func ReviewCashbackReward(rewardID int64, action CashbackReviewAction, reason string, reviewerID int, now int64) (CashbackReviewResult, error) {
	if rewardID <= 0 || reviewerID <= 0 {
		return CashbackReviewResult{}, ErrCashbackNotFound
	}
	if action != CashbackReviewActionApprove && action != CashbackReviewActionReject {
		return CashbackReviewResult{}, fmt.Errorf("%w: unsupported review action", ErrCashbackInvalidInput)
	}
	reason = strings.TrimSpace(reason)
	if len(reason) > 1_000 {
		return CashbackReviewResult{}, fmt.Errorf("%w: cashback review reason is too long", ErrCashbackInvalidInput)
	}
	if now <= 0 {
		now = time.Now().Unix()
	}

	var initial CashbackReward
	if err := DB.First(&initial, rewardID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return CashbackReviewResult{}, ErrCashbackNotFound
		}
		return CashbackReviewResult{}, err
	}

	result := CashbackReviewResult{}
	var creditedUserID, creditedQuota int
	var finalErr error
	err := DB.Transaction(func(tx *gorm.DB) error {
		topUp, orderContext, reward, err := lockCashbackCoreTx(tx, initial.TopUpID, rewardID)
		if err != nil {
			return err
		}

		switch action {
		case CashbackReviewActionReject:
			if reason == "" {
				return ErrCashbackReviewReason
			}
			if reward.ReviewStatus == CashbackReviewRejected && reward.SettlementStatus == CashbackSettlementCanceled {
				result.Reward = *reward
				return nil
			}
			if reward.ReviewStatus != CashbackReviewPending || reward.SettlementStatus != CashbackSettlementFrozen {
				return ErrCashbackInvalidState
			}
			reward.ReviewStatus = CashbackReviewRejected
			reward.SettlementStatus = CashbackSettlementCanceled
			reward.ReviewedBy = reviewerID
			reward.ReviewedAt = now
			reward.ReviewReason = reason
			if err := tx.Save(reward).Error; err != nil {
				return err
			}
			result.Reward = *reward
			return nil

		case CashbackReviewActionApprove:
			if (reward.RiskLevel == CashbackRiskHigh || reward.RiskLevel == CashbackRiskSevere) && reason == "" {
				return ErrCashbackReviewReason
			}
			if reward.ReviewStatus == CashbackReviewRejected || reward.SettlementStatus == CashbackSettlementCanceled || reward.SettlementStatus == CashbackSettlementReclaimed || reward.SettlementStatus == CashbackSettlementDebt {
				return ErrCashbackInvalidState
			}
			if reward.SettlementStatus == CashbackSettlementIssued {
				result.Reward = *reward
				result.Issued = true
				return nil
			}

			blockingReason, users, err := cashbackHardBlockReasonTx(tx, topUp, orderContext, reward)
			if err != nil {
				return err
			}
			if blockingReason != "" {
				reward.BlockingReason = blockingReason
				reward.NextSettlementAttemptAt = now + cashbackSettlementRetryDelaySeconds
				if err := tx.Save(reward).Error; err != nil {
					return err
				}
				result.Reward = *reward
				finalErr = fmt.Errorf("%w: %s", ErrCashbackHardBlocked, blockingReason)
				return nil
			}
			if reward.ReviewStatus == CashbackReviewPending {
				reward.ReviewStatus = CashbackReviewApproved
				reward.ReviewedBy = reviewerID
				reward.ReviewedAt = now
				reward.ReviewReason = reason
				reward.BlockingReason = ""
				reward.NextSettlementAttemptAt = 0
				if err := tx.Save(reward).Error; err != nil {
					return err
				}
			} else if reward.ReviewStatus != CashbackReviewApproved {
				return ErrCashbackInvalidState
			} else if reward.BlockingReason != "" || reward.NextSettlementAttemptAt != 0 {
				reward.BlockingReason = ""
				reward.NextSettlementAttemptAt = 0
				if err := tx.Save(reward).Error; err != nil {
					return err
				}
			}

			if now >= reward.AvailableAt {
				issued, issueErr := issueLockedCashbackRewardTx(tx, reward, users[reward.BeneficiaryID], now)
				if issueErr != nil {
					reward.LastSettlementError = issueErr.Error()
					reward.NextSettlementAttemptAt = now + cashbackSettlementRetryDelaySeconds
					if saveErr := tx.Save(reward).Error; saveErr != nil {
						return saveErr
					}
					result.IssueError = issueErr.Error()
				} else if issued {
					result.Issued = true
					creditedUserID = reward.BeneficiaryID
					creditedQuota = reward.RewardQuota
				}
			}
			result.Reward = *reward
			return nil
		}
		return ErrCashbackInvalidState
	})
	if err != nil {
		return CashbackReviewResult{}, err
	}
	if creditedQuota > 0 {
		syncCreditUserQuotaCache(creditedUserID, creditedQuota, "cashback settlement")
		recordCashbackCreditLog(creditedUserID, rewardID, creditedQuota)
	}
	if finalErr != nil {
		return result, finalErr
	}
	return result, nil
}

func IssueCashbackReward(rewardID int64, now int64) (CashbackSettlementOutcome, error) {
	if rewardID <= 0 {
		return CashbackSettlementOutcome{}, ErrCashbackNotFound
	}
	if now <= 0 {
		now = time.Now().Unix()
	}
	var initial CashbackReward
	if err := DB.First(&initial, rewardID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return CashbackSettlementOutcome{}, ErrCashbackNotFound
		}
		return CashbackSettlementOutcome{}, err
	}

	outcome := CashbackSettlementOutcome{RewardID: rewardID}
	var creditedUserID, creditedQuota int
	err := DB.Transaction(func(tx *gorm.DB) error {
		topUp, orderContext, reward, err := lockCashbackCoreTx(tx, initial.TopUpID, rewardID)
		if err != nil {
			return err
		}
		if reward.SettlementStatus == CashbackSettlementIssued {
			outcome.Skipped = true
			return nil
		}
		if reward.ReviewStatus != CashbackReviewApproved || reward.SettlementStatus != CashbackSettlementFrozen {
			outcome.Skipped = true
			return nil
		}
		if now < reward.AvailableAt {
			outcome.Skipped = true
			return nil
		}
		blockingReason, users, err := cashbackHardBlockReasonTx(tx, topUp, orderContext, reward)
		if err != nil {
			return err
		}
		if blockingReason != "" {
			reward.BlockingReason = blockingReason
			reward.NextSettlementAttemptAt = now + cashbackSettlementRetryDelaySeconds
			if err := tx.Save(reward).Error; err != nil {
				return err
			}
			outcome.Blocked = true
			return nil
		}
		issued, issueErr := issueLockedCashbackRewardTx(tx, reward, users[reward.BeneficiaryID], now)
		if issueErr != nil {
			reward.LastSettlementError = issueErr.Error()
			reward.NextSettlementAttemptAt = now + cashbackSettlementRetryDelaySeconds
			if err := tx.Save(reward).Error; err != nil {
				return err
			}
			outcome.ErrorMessage = issueErr.Error()
			return nil
		}
		if issued {
			outcome.Issued = true
			creditedUserID = reward.BeneficiaryID
			creditedQuota = reward.RewardQuota
		}
		return nil
	})
	if err != nil {
		return CashbackSettlementOutcome{}, err
	}
	if creditedQuota > 0 {
		syncCreditUserQuotaCache(creditedUserID, creditedQuota, "cashback settlement")
		recordCashbackCreditLog(creditedUserID, rewardID, creditedQuota)
	}
	return outcome, nil
}

func HasMaturedCashbackRewards(now int64) (bool, error) {
	if now <= 0 {
		now = time.Now().Unix()
	}
	var rewards []CashbackReward
	result := DB.Select("id").
		Where("review_status = ? AND settlement_status = ? AND available_at <= ? AND (next_settlement_attempt_at = 0 OR next_settlement_attempt_at <= ?)", CashbackReviewApproved, CashbackSettlementFrozen, now, now).
		Order("id asc").
		Limit(1).
		Find(&rewards)
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected > 0, nil
}

func SettleMaturedCashbackRewards(now int64, batchSize int) (CashbackSettlementRunResult, error) {
	if now <= 0 {
		now = time.Now().Unix()
	}
	if batchSize <= 0 || batchSize > 500 {
		batchSize = 100
	}
	inconsistencies, err := CashbackReconciliationInconsistencyCount()
	if err != nil {
		return CashbackSettlementRunResult{}, err
	}
	if inconsistencies > 0 {
		return CashbackSettlementRunResult{}, fmt.Errorf("cashback reconciliation found %d inconsistent records", inconsistencies)
	}
	var ids []int64
	if err := DB.Model(&CashbackReward{}).
		Where("review_status = ? AND settlement_status = ? AND available_at <= ? AND (next_settlement_attempt_at = 0 OR next_settlement_attempt_at <= ?)", CashbackReviewApproved, CashbackSettlementFrozen, now, now).
		Order("id asc").
		Limit(batchSize).
		Pluck("id", &ids).Error; err != nil {
		return CashbackSettlementRunResult{}, err
	}
	result := CashbackSettlementRunResult{Scanned: len(ids)}
	for _, id := range ids {
		outcome, err := IssueCashbackReward(id, now)
		if err != nil {
			result.Failed++
			continue
		}
		switch {
		case outcome.Issued:
			result.Issued++
		case outcome.Blocked:
			result.Blocked++
		case outcome.ErrorMessage != "":
			result.Failed++
		default:
			result.Skipped++
		}
	}
	if result.Failed > 0 {
		return result, fmt.Errorf("%d cashback settlements failed", result.Failed)
	}
	return result, nil
}

func lockCashbackCoreTx(tx *gorm.DB, topUpID int, rewardID int64) (*TopUp, *CashbackOrderContext, *CashbackReward, error) {
	var topUp TopUp
	if err := lockForUpdate(tx).Where("id = ?", topUpID).First(&topUp).Error; err != nil {
		return nil, nil, nil, err
	}
	var orderContext CashbackOrderContext
	if err := lockForUpdate(tx).Where("top_up_id = ?", topUpID).First(&orderContext).Error; err != nil {
		return nil, nil, nil, err
	}
	var reward CashbackReward
	if err := lockForUpdate(tx).Where("id = ? AND top_up_id = ?", rewardID, topUpID).First(&reward).Error; err != nil {
		return nil, nil, nil, err
	}
	return &topUp, &orderContext, &reward, nil
}

func cashbackHardBlockReasonTx(tx *gorm.DB, topUp *TopUp, orderContext *CashbackOrderContext, reward *CashbackReward) (string, map[int]User, error) {
	if topUp == nil || orderContext == nil || reward == nil {
		return "cashback_record_incomplete", nil, nil
	}
	if topUp.Status != common.TopUpStatusSuccess {
		return "topup_not_successful", nil, nil
	}
	if orderContext.TopUpID != topUp.Id || orderContext.UserID != reward.InviteeID || orderContext.TradeNo != topUp.TradeNo {
		return "order_relationship_mismatch", nil, nil
	}
	if orderContext.PaymentProvider != topUp.PaymentProvider || orderContext.CompletionProvider != topUp.PaymentProvider {
		return "payment_channel_mismatch", nil, nil
	}
	if !eligibleCashbackCompletionSource(orderContext.CompletionSource) {
		return "ineligible_completion_source", nil, nil
	}
	if orderContext.IncidentKind != "" {
		return "payment_incident_recorded", nil, nil
	}
	if reward.InviteeID == reward.InviterID {
		return "self_referral", nil, nil
	}
	users, err := lockCashbackUsersTx(tx, reward.InviteeID, reward.InviterID, reward.BeneficiaryID)
	if err != nil {
		return "", nil, err
	}
	invitee, inviteeOK := users[reward.InviteeID]
	inviter, inviterOK := users[reward.InviterID]
	beneficiary, beneficiaryOK := users[reward.BeneficiaryID]
	if !inviteeOK || !inviterOK || !beneficiaryOK || invitee.DeletedAt.Valid || inviter.DeletedAt.Valid || beneficiary.DeletedAt.Valid {
		return "referral_account_missing", users, nil
	}
	if invitee.Status != common.UserStatusEnabled || inviter.Status != common.UserStatusEnabled || beneficiary.Status != common.UserStatusEnabled {
		return "referral_account_disabled", users, nil
	}
	if invitee.InviterId != inviter.Id {
		return "referral_relationship_changed", users, nil
	}
	hasDebt, err := cashbackHasOpenDebtTx(tx, reward.BeneficiaryID)
	if err != nil {
		return "", nil, err
	}
	if hasDebt {
		return "beneficiary_has_open_cashback_debt", users, nil
	}
	return "", users, nil
}

func issueLockedCashbackRewardTx(tx *gorm.DB, reward *CashbackReward, beneficiary User, now int64) (bool, error) {
	if reward.ReviewStatus != CashbackReviewApproved || reward.SettlementStatus != CashbackSettlementFrozen {
		return false, ErrCashbackInvalidState
	}
	if now < reward.AvailableAt {
		return false, ErrCashbackNotMature
	}
	if reward.RewardQuota <= 0 {
		return false, ErrCashbackInvalidState
	}
	if beneficiary.Id != reward.BeneficiaryID {
		return false, ErrCashbackHardBlocked
	}
	if err := creditTopUpQuota(tx, reward.BeneficiaryID, reward.RewardQuota, nil); err != nil {
		return false, err
	}
	reward.SettlementStatus = CashbackSettlementIssued
	reward.IssuedAt = now
	reward.LastSettlementError = ""
	reward.BlockingReason = ""
	reward.NextSettlementAttemptAt = 0
	if err := tx.Save(reward).Error; err != nil {
		return false, err
	}
	return true, nil
}

func HandleCashbackIncident(topUpID int, input CashbackIncidentInput) (CashbackIncidentResult, error) {
	if topUpID <= 0 || input.OperatorID <= 0 || !validCashbackIncidentKind(input.Kind) || input.Kind == "" {
		return CashbackIncidentResult{}, fmt.Errorf("%w: invalid cashback incident", ErrCashbackInvalidInput)
	}
	input.Reason = strings.TrimSpace(input.Reason)
	input.EvidenceRef = strings.TrimSpace(input.EvidenceRef)
	if input.Reason == "" || len(input.Reason) > 1_000 || len(input.EvidenceRef) > 1_000 {
		return CashbackIncidentResult{}, fmt.Errorf("%w: a valid incident reason is required", ErrCashbackInvalidInput)
	}
	if input.CumulativeRefundRateBPS < 0 || input.CumulativeRefundRateBPS > 10_000 {
		return CashbackIncidentResult{}, ErrCashbackRefundRate
	}
	if input.Kind == CashbackIncidentChargeback {
		input.CumulativeRefundRateBPS = 10_000
	}
	if input.Kind == CashbackIncidentRefund && input.CumulativeRefundRateBPS == 0 {
		return CashbackIncidentResult{}, ErrCashbackRefundRate
	}
	if input.Now <= 0 {
		input.Now = time.Now().Unix()
	}

	result := CashbackIncidentResult{}
	cacheReservations := map[int]int{}
	transactionCommitted := false
	defer func() {
		if !transactionCommitted {
			compensateCashbackCacheReservations(cacheReservations)
		}
	}()
	err := DB.Transaction(func(tx *gorm.DB) error {
		var topUp TopUp
		if err := lockForUpdate(tx).Where("id = ?", topUpID).First(&topUp).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrTopUpNotFound
			}
			return err
		}
		var orderContext CashbackOrderContext
		if err := lockForUpdate(tx).Where("top_up_id = ?", topUpID).First(&orderContext).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrCashbackNotFound
			}
			return err
		}
		if topUp.Status != common.TopUpStatusSuccess || orderContext.CreditedQuota <= 0 {
			return ErrTopUpStatusInvalid
		}
		if input.CumulativeRefundRateBPS < orderContext.CumulativeRefundRateBPS {
			return ErrCashbackRefundRate
		}
		if orderContext.IncidentKind == input.Kind && input.CumulativeRefundRateBPS == orderContext.CumulativeRefundRateBPS {
			var rewardDebt int64
			if err := tx.Model(&CashbackReward{}).
				Where("top_up_id = ?", topUpID).
				Select("COALESCE(SUM(outstanding_debt_quota), 0)").
				Scan(&rewardDebt).Error; err != nil {
				return err
			}
			if rewardDebt < 0 || rewardDebt > int64(common.MaxWalletQuota) {
				return errors.New("cashback reward debt aggregate is invalid")
			}
			result.OrderContext = orderContext
			result.RewardDebtQuota = int(rewardDebt)
			result.PrincipalDebtQuota = orderContext.PrincipalOutstandingDebtQuota
			result.Idempotent = true
			return nil
		}

		var rewards []CashbackReward
		if err := lockForUpdate(tx).Where("top_up_id = ?", topUpID).Order("id asc").Find(&rewards).Error; err != nil {
			return err
		}
		userIDs := []int{orderContext.UserID}
		for _, reward := range rewards {
			userIDs = append(userIDs, reward.BeneficiaryID)
		}
		users, err := lockCashbackUsersTx(tx, userIDs...)
		if err != nil {
			return err
		}
		for i := range rewards {
			reward := &rewards[i]
			switch reward.SettlementStatus {
			case CashbackSettlementFrozen:
				reward.SettlementStatus = CashbackSettlementCanceled
				reward.BlockingReason = "payment_incident:" + string(input.Kind)
			case CashbackSettlementIssued:
				remaining := reward.RewardQuota - reward.RecoveredQuota
				if remaining < 0 {
					return errors.New("cashback reward recovery exceeds issued quota")
				}
				user := users[reward.BeneficiaryID]
				recovered, cacheReserved, err := reserveCashbackRecoveryQuota(user, remaining)
				if err != nil {
					return err
				}
				if recovered > 0 {
					if err := debitLockedCashbackUserTx(tx, reward.BeneficiaryID, recovered); err != nil {
						return err
					}
					user.Quota -= recovered
					users[reward.BeneficiaryID] = user
					if cacheReserved {
						cacheReservations[reward.BeneficiaryID] += recovered
					}
				}
				reward.RecoveredQuota += recovered
				reward.OutstandingDebtQuota = reward.RewardQuota - reward.RecoveredQuota
				result.RewardRecoveredQuota += recovered
				result.RewardDebtQuota += reward.OutstandingDebtQuota
				if reward.OutstandingDebtQuota > 0 {
					reward.SettlementStatus = CashbackSettlementDebt
				} else {
					reward.SettlementStatus = CashbackSettlementReclaimed
				}
				reward.BlockingReason = "payment_incident:" + string(input.Kind)
			case CashbackSettlementDebt:
				result.RewardDebtQuota += reward.OutstandingDebtQuota
			}
			if err := tx.Save(reward).Error; err != nil {
				return err
			}
		}

		newTarget, err := calculateCashbackQuota(orderContext.CreditedQuota, input.CumulativeRefundRateBPS)
		if err != nil {
			return err
		}
		deltaTarget := newTarget - orderContext.PrincipalReversalTargetQuota
		if deltaTarget < 0 {
			return ErrCashbackRefundRate
		}
		if deltaTarget > 0 {
			user := users[orderContext.UserID]
			recovered, cacheReserved, err := reserveCashbackRecoveryQuota(user, deltaTarget)
			if err != nil {
				return err
			}
			if recovered > 0 {
				if err := debitLockedCashbackUserTx(tx, orderContext.UserID, recovered); err != nil {
					return err
				}
				user.Quota -= recovered
				users[orderContext.UserID] = user
				if cacheReserved {
					cacheReservations[orderContext.UserID] += recovered
				}
			}
			orderContext.PrincipalRecoveredQuota += recovered
			newDebt := deltaTarget - recovered
			orderContext.PrincipalOutstandingDebtQuota += newDebt
			if newDebt > 0 {
				orderContext.PrincipalDebtResolvedAt = 0
				orderContext.PrincipalDebtResolvedBy = 0
				orderContext.PrincipalDebtResolutionReason = ""
			}
			result.PrincipalRecoveredNow = recovered
		}
		orderContext.PrincipalReversalTargetQuota = newTarget
		orderContext.CumulativeRefundRateBPS = input.CumulativeRefundRateBPS
		orderContext.IncidentKind = input.Kind
		orderContext.IncidentReason = input.Reason
		orderContext.IncidentEvidenceRef = input.EvidenceRef
		orderContext.IncidentReportedBy = input.OperatorID
		orderContext.IncidentReportedAt = input.Now
		if err := tx.Save(&orderContext).Error; err != nil {
			return err
		}
		result.OrderContext = orderContext
		result.PrincipalDebtQuota = orderContext.PrincipalOutstandingDebtQuota
		return nil
	})
	if err != nil {
		return CashbackIncidentResult{}, err
	}
	transactionCommitted = true
	return result, nil
}

func ResolveCashbackRewardDebt(rewardID int64, operatorID int, reason string, now int64) (*CashbackReward, error) {
	reason = strings.TrimSpace(reason)
	if rewardID <= 0 || operatorID <= 0 || reason == "" || len(reason) > 1_000 {
		return nil, fmt.Errorf("%w: a valid debt resolution reason is required", ErrCashbackInvalidInput)
	}
	if now <= 0 {
		now = time.Now().Unix()
	}
	var reward CashbackReward
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Where("id = ?", rewardID).First(&reward).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrCashbackNotFound
			}
			return err
		}
		if reward.OutstandingDebtQuota <= 0 {
			if reward.DebtResolvedAt > 0 {
				return nil
			}
			return ErrCashbackDebtNotFound
		}
		reward.OutstandingDebtQuota = 0
		reward.DebtResolvedAt = now
		reward.DebtResolvedBy = operatorID
		reward.DebtResolutionReason = reason
		if reward.SettlementStatus == CashbackSettlementDebt {
			reward.SettlementStatus = CashbackSettlementReclaimed
		}
		if err := tx.Save(&reward).Error; err != nil {
			return err
		}
		hasDebt, err := cashbackHasOpenDebtTx(tx, reward.BeneficiaryID)
		if err != nil {
			return err
		}
		if hasDebt {
			return nil
		}
		return tx.Session(&gorm.Session{SkipHooks: true}).Model(&CashbackReward{}).
			Where("beneficiary_id = ? AND review_status = ? AND settlement_status = ? AND blocking_reason = ?", reward.BeneficiaryID, CashbackReviewApproved, CashbackSettlementFrozen, "beneficiary_has_open_cashback_debt").
			Updates(map[string]interface{}{"blocking_reason": "", "next_settlement_attempt_at": 0}).Error
	})
	if err != nil {
		return nil, err
	}
	return &reward, nil
}

func ResolveCashbackPrincipalDebt(topUpID int, operatorID int, reason string, now int64) (*CashbackOrderContext, error) {
	reason = strings.TrimSpace(reason)
	if topUpID <= 0 || operatorID <= 0 || reason == "" || len(reason) > 1_000 {
		return nil, fmt.Errorf("%w: a valid debt resolution reason is required", ErrCashbackInvalidInput)
	}
	if now <= 0 {
		now = time.Now().Unix()
	}
	var orderContext CashbackOrderContext
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := lockForUpdate(tx).Where("top_up_id = ?", topUpID).First(&orderContext).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrCashbackNotFound
			}
			return err
		}
		if orderContext.PrincipalOutstandingDebtQuota <= 0 {
			if orderContext.PrincipalDebtResolvedAt > 0 {
				return nil
			}
			return ErrCashbackDebtNotFound
		}
		orderContext.PrincipalOutstandingDebtQuota = 0
		orderContext.PrincipalDebtResolvedAt = now
		orderContext.PrincipalDebtResolvedBy = operatorID
		orderContext.PrincipalDebtResolutionReason = reason
		if err := tx.Save(&orderContext).Error; err != nil {
			return err
		}
		hasDebt, err := cashbackHasOpenDebtTx(tx, orderContext.UserID)
		if err != nil {
			return err
		}
		if hasDebt {
			return nil
		}
		return tx.Session(&gorm.Session{SkipHooks: true}).Model(&CashbackReward{}).
			Where("beneficiary_id = ? AND review_status = ? AND settlement_status = ? AND blocking_reason = ?", orderContext.UserID, CashbackReviewApproved, CashbackSettlementFrozen, "beneficiary_has_open_cashback_debt").
			Updates(map[string]interface{}{"blocking_reason": "", "next_settlement_attempt_at": 0}).Error
	})
	if err != nil {
		return nil, err
	}
	return &orderContext, nil
}

func debitLockedCashbackUserTx(tx *gorm.DB, userID, quota int) error {
	if quota <= 0 {
		return nil
	}
	result := tx.Unscoped().Model(&User{}).
		Where("id = ? AND quota >= ?", userID, quota).
		Update("quota", gorm.Expr("quota - ?", quota))
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return errors.New("cashback quota debit lost its balance predicate")
	}
	return nil
}

func minPositiveQuota(current, requested int) int {
	if current <= 0 || requested <= 0 {
		return 0
	}
	if current < requested {
		return current
	}
	return requested
}

func reserveCashbackRecoveryQuota(user User, requested int) (int, bool, error) {
	amount := minPositiveQuota(user.Quota, requested)
	if amount == 0 || user.Id <= 0 {
		return 0, false, nil
	}
	if !common.RedisEnabled || user.DeletedAt.Valid {
		return amount, false, nil
	}

	for attempt := 0; attempt < 2; attempt++ {
		cached, err := cacheGetUserBase(user.Id)
		if err != nil {
			if attempt > 0 {
				return 0, false, err
			}
			if err := populateUserCache(user); err != nil {
				return 0, false, err
			}
			continue
		}
		amount = minPositiveQuota(cached.Quota, minPositiveQuota(user.Quota, requested))
		if amount == 0 {
			return 0, false, nil
		}
		result, err := cacheTryReserveUserQuota(user.Id, int64(amount))
		if err != nil {
			return 0, false, err
		}
		switch result {
		case cacheQuotaOK:
			return amount, true, nil
		case cacheQuotaMiss:
			if err := populateUserCache(user); err != nil {
				return 0, false, err
			}
		case cacheQuotaInsufficient:
			continue
		}
	}
	return 0, false, nil
}

func compensateCashbackCacheReservations(reservations map[int]int) {
	for userID, quota := range reservations {
		if quota <= 0 {
			continue
		}
		result, err := cacheApplyUserQuotaDelta(userID, int64(quota))
		if err != nil {
			common.SysError(fmt.Sprintf("failed to compensate cashback cache reservation for user %d: %v", userID, err))
			continue
		}
		if result != cacheQuotaOK && result != cacheQuotaMiss {
			common.SysError(fmt.Sprintf("failed to compensate cashback cache reservation for user %d: result=%d", userID, result))
		}
	}
}

func recordCashbackCreditLog(userID int, rewardID int64, quota int) {
	username, _ := GetUsernameById(userID, false)
	params := map[string]interface{}{
		"reward_id": rewardID,
		"quota":     logger.LogQuota(quota),
	}
	log := &Log{
		UserId:    userID,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      LogTypeSystem,
		Content:   fmt.Sprintf("Referral cashback reward %d credited %s", rewardID, logger.LogQuota(quota)),
		Other:     common.MapToJsonStr(map[string]interface{}{"op": buildOpField("cashback.reward_credited", params)}),
	}
	if err := createLog(log); err != nil {
		common.SysLog("failed to record cashback credit log: " + err.Error())
	}
}

func CashbackReconciliationInconsistencyCount() (int64, error) {
	var count int64
	if err := DB.Model(&CashbackReward{}).
		Where("(settlement_status = ? AND (review_status <> ? OR issued_at <= 0 OR reward_quota <= 0)) OR recovered_quota < 0 OR outstanding_debt_quota < 0 OR recovered_quota + outstanding_debt_quota > reward_quota", CashbackSettlementIssued, CashbackReviewApproved).
		Count(&count).Error; err != nil {
		return 0, err
	}
	var principalCount int64
	if err := DB.Model(&CashbackOrderContext{}).
		Where("principal_reversal_target_quota < 0 OR principal_recovered_quota < 0 OR principal_outstanding_debt_quota < 0 OR principal_recovered_quota > principal_reversal_target_quota").
		Count(&principalCount).Error; err != nil {
		return 0, err
	}
	return count + principalCount, nil
}
