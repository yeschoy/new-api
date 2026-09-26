package model

import (
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"

	"gorm.io/gorm"
)

type CashbackReviewAction string

const cashbackSettlementRetryDelaySeconds int64 = 5 * 60
const maxCashbackReasonCharacters = 1_000

func cashbackTextWithinLimit(value string) bool {
	return utf8.RuneCountInString(value) <= maxCashbackReasonCharacters
}

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
	if !cashbackTextWithinLimit(reason) {
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

	settlementEligibleAtStart := initial.ReviewStatus == CashbackReviewApproved && initial.SettlementStatus == CashbackSettlementFrozen && now >= initial.AvailableAt
	manualSettlementCandidate := action == CashbackReviewActionApprove &&
		(initial.ReviewStatus == CashbackReviewPending || initial.ReviewStatus == CashbackReviewApproved) &&
		initial.SettlementStatus == CashbackSettlementFrozen && now >= initial.AvailableAt &&
		((initial.RiskLevel != CashbackRiskHigh && initial.RiskLevel != CashbackRiskSevere) || reason != "")
	if manualSettlementCandidate {
		if err := requireCashbackReconciliationHealthy(); err != nil {
			return CashbackReviewResult{}, err
		}
	}

	fences := &userQuotaMutationFences{tokens: map[int]string{}}
	if manualSettlementCandidate {
		var err error
		fences, err = acquireUserQuotaMutationFences(initial.BeneficiaryID)
		if err != nil {
			if settlementEligibleAtStart {
				recordCashbackSettlementFailure(rewardID, err, now)
			}
			return CashbackReviewResult{}, err
		}
		defer fences.finalize()
	}

	result := CashbackReviewResult{}
	var creditedUserID, creditedQuota int
	var finalErr error
	var settlementErr error
	err := DB.Transaction(func(tx *gorm.DB) (txErr error) {
		defer func() {
			if txErr == nil {
				if verifyErr := fences.verify(); verifyErr != nil {
					settlementErr = verifyErr
					txErr = verifyErr
				}
			}
		}()
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
			reward.ReviewSource = CashbackReviewManual
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
				reward.ReviewSource = CashbackReviewManual
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
					settlementErr = issueErr
					return issueErr
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
		if settlementErr != nil {
			recordCashbackSettlementFailure(rewardID, settlementErr, now)
		}
		return CashbackReviewResult{}, err
	}
	if creditedQuota > 0 {
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

	if initial.SettlementStatus == CashbackSettlementIssued {
		return CashbackSettlementOutcome{RewardID: rewardID, Skipped: true}, nil
	}
	if initial.ReviewStatus != CashbackReviewApproved || initial.SettlementStatus != CashbackSettlementFrozen || now < initial.AvailableAt {
		return CashbackSettlementOutcome{RewardID: rewardID, Skipped: true}, nil
	}
	fences, err := acquireUserQuotaMutationFences(initial.BeneficiaryID)
	if err != nil {
		recordCashbackSettlementFailure(rewardID, err, now)
		return CashbackSettlementOutcome{}, err
	}
	defer fences.finalize()

	outcome := CashbackSettlementOutcome{RewardID: rewardID}
	var creditedUserID, creditedQuota int
	err = DB.Transaction(func(tx *gorm.DB) (txErr error) {
		defer func() {
			if txErr == nil {
				txErr = fences.verify()
			}
		}()
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
			return issueErr
		}
		if issued {
			outcome.Issued = true
			creditedUserID = reward.BeneficiaryID
			creditedQuota = reward.RewardQuota
		}
		return nil
	})
	if err != nil {
		recordCashbackSettlementFailure(rewardID, err, now)
		return CashbackSettlementOutcome{}, err
	}
	if creditedQuota > 0 {
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
	if err := requireCashbackReconciliationHealthy(); err != nil {
		return CashbackSettlementRunResult{}, err
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
	if reward.Direction == CashbackDirectionInvitee && reward.BeneficiaryID != reward.InviteeID ||
		reward.Direction == CashbackDirectionInviter && (reward.InviterID <= 0 || reward.BeneficiaryID != reward.InviterID) {
		return "order_relationship_mismatch", nil, nil
	}
	ids := []int{reward.InviteeID, reward.BeneficiaryID}
	if reward.Direction == CashbackDirectionInviter {
		ids = append(ids, reward.InviterID)
	}
	users, err := lockCashbackUsersTx(tx, ids...)
	if err != nil {
		return "", nil, err
	}
	invitee, inviteeOK := users[reward.InviteeID]
	beneficiary, beneficiaryOK := users[reward.BeneficiaryID]
	if !inviteeOK || !beneficiaryOK || invitee.DeletedAt.Valid || beneficiary.DeletedAt.Valid {
		return "referral_account_missing", users, nil
	}
	if invitee.Status != common.UserStatusEnabled || beneficiary.Status != common.UserStatusEnabled {
		return "referral_account_disabled", users, nil
	}
	if reward.Direction == CashbackDirectionInviter {
		inviter, inviterOK := users[reward.InviterID]
		if !inviterOK || inviter.DeletedAt.Valid {
			return "referral_account_missing", users, nil
		}
		if inviter.Status != common.UserStatusEnabled {
			return "referral_account_disabled", users, nil
		}
		if invitee.InviterId != inviter.Id {
			return "referral_relationship_changed", users, nil
		}
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
	if err := recordWalletRefundCreditTx(tx, beneficiary, walletRefundGift, "cashback_reward", reward.ID, int64(reward.RewardQuota), ""); err != nil {
		return false, err
	}
	if err := creditTopUpQuota(tx, reward.BeneficiaryID, reward.RewardQuota, nil); err != nil {
		return false, err
	}
	if err := recordCashbackQuotaMutationTx(tx, cashbackIssueMutation(reward)); err != nil {
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
	if input.Reason == "" || !cashbackTextWithinLimit(input.Reason) || !cashbackTextWithinLimit(input.EvidenceRef) {
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

	var fenceContext CashbackOrderContext
	if err := DB.Select("user_id").Where("top_up_id = ?", topUpID).First(&fenceContext).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return CashbackIncidentResult{}, ErrCashbackNotFound
		}
		return CashbackIncidentResult{}, err
	}
	var fenceRewards []CashbackReward
	if err := DB.Select("beneficiary_id").Where("top_up_id = ?", topUpID).Find(&fenceRewards).Error; err != nil {
		return CashbackIncidentResult{}, err
	}
	fenceUserIDs := []int{fenceContext.UserID}
	for _, reward := range fenceRewards {
		fenceUserIDs = append(fenceUserIDs, reward.BeneficiaryID)
	}
	fences, err := acquireUserQuotaMutationFences(fenceUserIDs...)
	if err != nil {
		return CashbackIncidentResult{}, err
	}
	defer fences.finalize()

	result := CashbackIncidentResult{}
	err = DB.Transaction(func(tx *gorm.DB) (txErr error) {
		defer func() {
			if txErr == nil {
				txErr = fences.verify()
			}
		}()
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
		// Even an incident that only creates debt or cancels frozen rewards
		// invalidates automatic FIFO pricing for every affected wallet.
		for _, user := range users {
			if err := recordWalletRefundCreditTx(tx, user, walletRefundException, "cashback_incident", int64(topUpID), 0, fmt.Sprintf("%s:%d", input.Kind, input.CumulativeRefundRateBPS)); err != nil {
				return err
			}
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
				recovered, err := reserveCashbackRecoveryQuota(user, remaining, fences)
				if err != nil {
					return err
				}
				if recovered > 0 {
					if err := debitLockedCashbackUserTx(tx, reward.BeneficiaryID, recovered); err != nil {
						return err
					}
					if err := recordCashbackQuotaMutationTx(tx, cashbackRewardRecoveryMutation(reward, recovered)); err != nil {
						return err
					}
					user.Quota -= recovered
					users[reward.BeneficiaryID] = user
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
			recovered, err := reserveCashbackRecoveryQuota(user, deltaTarget, fences)
			if err != nil {
				return err
			}
			if recovered > 0 {
				if err := debitLockedCashbackUserTx(tx, orderContext.UserID, recovered); err != nil {
					return err
				}
				if err := recordCashbackQuotaMutationTx(tx, cashbackPrincipalRecoveryMutation(&orderContext, recovered)); err != nil {
					return err
				}
				user.Quota -= recovered
				users[orderContext.UserID] = user
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
	return result, nil
}

func ResolveCashbackRewardDebt(rewardID int64, operatorID int, reason string, now int64) (*CashbackReward, error) {
	reason = strings.TrimSpace(reason)
	if rewardID <= 0 || operatorID <= 0 || reason == "" || !cashbackTextWithinLimit(reason) {
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
	if topUpID <= 0 || operatorID <= 0 || reason == "" || !cashbackTextWithinLimit(reason) {
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

func reserveCashbackRecoveryQuota(user User, requested int, fences *userQuotaMutationFences) (int, error) {
	if requested <= 0 || user.Id <= 0 || user.DeletedAt.Valid {
		return 0, nil
	}
	return fences.takeAvailable(user, requested)
}

func recordCashbackSettlementFailure(rewardID int64, settlementErr error, now int64) {
	if rewardID <= 0 || settlementErr == nil {
		return
	}
	result := DB.Session(&gorm.Session{SkipHooks: true}).Model(&CashbackReward{}).
		Where("id = ? AND review_status = ? AND settlement_status = ? AND available_at <= ?", rewardID, CashbackReviewApproved, CashbackSettlementFrozen, now).
		Updates(map[string]interface{}{
			"last_settlement_error":      settlementErr.Error(),
			"next_settlement_attempt_at": now + cashbackSettlementRetryDelaySeconds,
		})
	if result.Error != nil {
		common.SysError(fmt.Sprintf("failed to record cashback settlement error for reward %d: %v", rewardID, result.Error))
	}
}

func recordCashbackCreditLog(userID int, rewardID int64, quota int) {
	username, _ := GetUsernameById(userID, true)
	params := map[string]interface{}{
		"reward_id": rewardID,
		"quota":     logger.LogQuota(quota),
	}
	other := NewLogOther()
	other.SetPublic("op", map[string]any{"action": "cashback.reward_credited", "params": params})
	log := &Log{
		UserId:    userID,
		Username:  username,
		CreatedAt: common.GetTimestamp(),
		Type:      LogTypeSystem,
		Content:   fmt.Sprintf("Referral cashback reward %d credited %s", rewardID, logger.LogQuota(quota)),
		Other:     other.JSONString(),
	}
	if err := createLog(log); err != nil {
		common.SysLog("failed to record cashback credit log: " + err.Error())
	}
}
