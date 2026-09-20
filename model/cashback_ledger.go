package model

import (
	"errors"
	"fmt"
	"strings"

	"gorm.io/gorm"
)

type CashbackQuotaMutationKind string

const (
	CashbackQuotaMutationIssue             CashbackQuotaMutationKind = "issue"
	CashbackQuotaMutationRewardRecovery    CashbackQuotaMutationKind = "reward_recovery"
	CashbackQuotaMutationPrincipalRecovery CashbackQuotaMutationKind = "principal_recovery"
)

// CashbackQuotaMutation is the main-database money evidence for cashback.
// Human-facing LOG_DB entries remain best effort and are never reconciliation
// authority. EventKey makes transaction retries idempotent.
type CashbackQuotaMutation struct {
	ID        int64                     `json:"id" gorm:"primaryKey"`
	EventKey  string                    `json:"event_key" gorm:"type:varchar(191);not null;uniqueIndex"`
	TopUpID   int                       `json:"top_up_id" gorm:"not null;index;index:idx_cashback_mutation_topup_kind,priority:1"`
	RewardID  int64                     `json:"reward_id" gorm:"not null;default:0;index;index:idx_cashback_mutation_reward_kind,priority:1"`
	UserID    int                       `json:"user_id" gorm:"not null;index"`
	Kind      CashbackQuotaMutationKind `json:"kind" gorm:"type:varchar(32);not null;index;index:idx_cashback_mutation_reward_kind,priority:2;index:idx_cashback_mutation_topup_kind,priority:2"`
	Quota     int                       `json:"quota" gorm:"type:bigint;not null"`
	CreatedAt int64                     `json:"created_at" gorm:"autoCreateTime;type:bigint;index"`
}

func validCashbackQuotaMutationKind(kind CashbackQuotaMutationKind) bool {
	switch kind {
	case CashbackQuotaMutationIssue, CashbackQuotaMutationRewardRecovery, CashbackQuotaMutationPrincipalRecovery:
		return true
	default:
		return false
	}
}

func (mutation *CashbackQuotaMutation) BeforeSave(_ *gorm.DB) error {
	if mutation.TopUpID <= 0 || mutation.UserID <= 0 || mutation.Quota <= 0 || strings.TrimSpace(mutation.EventKey) == "" || !validCashbackQuotaMutationKind(mutation.Kind) {
		return errors.New("invalid cashback quota mutation")
	}
	if mutation.Kind == CashbackQuotaMutationPrincipalRecovery {
		if mutation.RewardID != 0 {
			return errors.New("principal recovery cannot reference a reward")
		}
	} else if mutation.RewardID <= 0 {
		return errors.New("reward quota mutation requires a reward")
	}
	return nil
}

func recordCashbackQuotaMutationTx(tx *gorm.DB, mutation CashbackQuotaMutation) error {
	if tx == nil {
		return errors.New("database transaction is required")
	}
	return tx.Create(&mutation).Error
}

func cashbackIssueMutation(reward *CashbackReward) CashbackQuotaMutation {
	return CashbackQuotaMutation{
		EventKey: fmt.Sprintf("cashback:reward:%d:issue", reward.ID),
		TopUpID:  reward.TopUpID,
		RewardID: reward.ID,
		UserID:   reward.BeneficiaryID,
		Kind:     CashbackQuotaMutationIssue,
		Quota:    reward.RewardQuota,
	}
}

func cashbackRewardRecoveryMutation(reward *CashbackReward, recoveredNow int) CashbackQuotaMutation {
	return CashbackQuotaMutation{
		EventKey: fmt.Sprintf("cashback:reward:%d:recovery:%d", reward.ID, reward.RecoveredQuota+recoveredNow),
		TopUpID:  reward.TopUpID,
		RewardID: reward.ID,
		UserID:   reward.BeneficiaryID,
		Kind:     CashbackQuotaMutationRewardRecovery,
		Quota:    recoveredNow,
	}
}

func cashbackPrincipalRecoveryMutation(orderContext *CashbackOrderContext, recoveredNow int) CashbackQuotaMutation {
	return CashbackQuotaMutation{
		EventKey: fmt.Sprintf("cashback:topup:%d:principal:%d", orderContext.TopUpID, orderContext.PrincipalRecoveredQuota+recoveredNow),
		TopUpID:  orderContext.TopUpID,
		UserID:   orderContext.UserID,
		Kind:     CashbackQuotaMutationPrincipalRecovery,
		Quota:    recoveredNow,
	}
}
