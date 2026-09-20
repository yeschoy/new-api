package model

import (
	"fmt"
	"strings"
	"sync"
)

const cashbackReconciliationBatchSize = 100

type cashbackReconciliationCursor struct {
	sync.Mutex
	RewardID       int64
	OrderContextID int64
	MutationID     int64
}

var cashbackReconciliationProgress cashbackReconciliationCursor

type cashbackMutationAggregate struct {
	RewardID   int64
	TopUpID    int
	Kind       CashbackQuotaMutationKind
	Quota      int64
	EventCount int64
}

// CashbackReconciliationInconsistencyCount checks one bounded, primary-key
// ordered page from each cashback evidence table. Clean pages advance an
// in-process cursor; a page containing a mismatch is retried and blocks every
// settlement run until repaired. Process restarts safely restart the scan at
// the beginning instead of running an unbounded full-history query.
func CashbackReconciliationInconsistencyCount() (int64, error) {
	cashbackReconciliationProgress.Lock()
	defer cashbackReconciliationProgress.Unlock()

	rewards, nextRewardID, err := nextCashbackRewardReconciliationBatch(cashbackReconciliationProgress.RewardID)
	if err != nil {
		return 0, err
	}
	orders, nextOrderID, err := nextCashbackOrderReconciliationBatch(cashbackReconciliationProgress.OrderContextID)
	if err != nil {
		return 0, err
	}
	mutations, nextMutationID, err := nextCashbackMutationReconciliationBatch(cashbackReconciliationProgress.MutationID)
	if err != nil {
		return 0, err
	}

	rewardIssues, err := cashbackRewardReconciliationIssues(rewards)
	if err != nil {
		return 0, err
	}
	orderIssues, err := cashbackOrderReconciliationIssues(orders)
	if err != nil {
		return 0, err
	}
	mutationIssues, err := cashbackMutationReconciliationIssues(mutations)
	if err != nil {
		return 0, err
	}
	issues := rewardIssues + orderIssues + mutationIssues
	if issues == 0 {
		cashbackReconciliationProgress.RewardID = nextRewardID
		cashbackReconciliationProgress.OrderContextID = nextOrderID
		cashbackReconciliationProgress.MutationID = nextMutationID
	}
	return issues, nil
}

func requireCashbackReconciliationHealthy() error {
	inconsistencies, err := CashbackReconciliationInconsistencyCount()
	if err != nil {
		return err
	}
	if inconsistencies > 0 {
		return fmt.Errorf("cashback reconciliation found %d inconsistent records", inconsistencies)
	}
	return nil
}

func nextCashbackRewardReconciliationBatch(afterID int64) ([]CashbackReward, int64, error) {
	var rewards []CashbackReward
	query := func(cursor int64) error {
		return DB.Where("id > ?", cursor).Order("id asc").Limit(cashbackReconciliationBatchSize).Find(&rewards).Error
	}
	if err := query(afterID); err != nil {
		return nil, afterID, err
	}
	if len(rewards) == 0 && afterID > 0 {
		if err := query(0); err != nil {
			return nil, afterID, err
		}
	}
	if len(rewards) == 0 {
		return rewards, 0, nil
	}
	return rewards, rewards[len(rewards)-1].ID, nil
}

func nextCashbackOrderReconciliationBatch(afterID int64) ([]CashbackOrderContext, int64, error) {
	var orders []CashbackOrderContext
	query := func(cursor int64) error {
		return DB.Where("id > ?", cursor).Order("id asc").Limit(cashbackReconciliationBatchSize).Find(&orders).Error
	}
	if err := query(afterID); err != nil {
		return nil, afterID, err
	}
	if len(orders) == 0 && afterID > 0 {
		if err := query(0); err != nil {
			return nil, afterID, err
		}
	}
	if len(orders) == 0 {
		return orders, 0, nil
	}
	return orders, orders[len(orders)-1].ID, nil
}

func nextCashbackMutationReconciliationBatch(afterID int64) ([]CashbackQuotaMutation, int64, error) {
	var mutations []CashbackQuotaMutation
	query := func(cursor int64) error {
		return DB.Where("id > ?", cursor).Order("id asc").Limit(cashbackReconciliationBatchSize).Find(&mutations).Error
	}
	if err := query(afterID); err != nil {
		return nil, afterID, err
	}
	if len(mutations) == 0 && afterID > 0 {
		if err := query(0); err != nil {
			return nil, afterID, err
		}
	}
	if len(mutations) == 0 {
		return mutations, 0, nil
	}
	return mutations, mutations[len(mutations)-1].ID, nil
}

func cashbackRewardReconciliationIssues(rewards []CashbackReward) (int64, error) {
	if len(rewards) == 0 {
		return 0, nil
	}
	ids := make([]int64, 0, len(rewards))
	for i := range rewards {
		ids = append(ids, rewards[i].ID)
	}
	var aggregates []cashbackMutationAggregate
	if err := DB.Model(&CashbackQuotaMutation{}).
		Select("reward_id, kind, COALESCE(SUM(quota), 0) AS quota, COUNT(*) AS event_count").
		Where("reward_id IN ?", ids).
		Group("reward_id, kind").
		Scan(&aggregates).Error; err != nil {
		return 0, err
	}
	type aggregateKey struct {
		RewardID int64
		Kind     CashbackQuotaMutationKind
	}
	byReward := make(map[aggregateKey]cashbackMutationAggregate, len(aggregates))
	for _, aggregate := range aggregates {
		byReward[aggregateKey{RewardID: aggregate.RewardID, Kind: aggregate.Kind}] = aggregate
	}

	var issues int64
	for i := range rewards {
		reward := &rewards[i]
		structurallyInvalid :=
			(reward.SettlementStatus == CashbackSettlementIssued && (reward.ReviewStatus != CashbackReviewApproved || reward.IssuedAt <= 0 || reward.RewardQuota <= 0)) ||
				reward.RecoveredQuota < 0 || reward.OutstandingDebtQuota < 0 || reward.RecoveredQuota+reward.OutstandingDebtQuota > reward.RewardQuota
		issueAggregate := byReward[aggregateKey{RewardID: reward.ID, Kind: CashbackQuotaMutationIssue}]
		recoveryAggregate := byReward[aggregateKey{RewardID: reward.ID, Kind: CashbackQuotaMutationRewardRecovery}]
		expectedIssueQuota := int64(0)
		expectedIssueEvents := int64(0)
		if reward.IssuedAt > 0 {
			expectedIssueQuota = int64(reward.RewardQuota)
			expectedIssueEvents = 1
		}
		if structurallyInvalid || issueAggregate.Quota != expectedIssueQuota || issueAggregate.EventCount != expectedIssueEvents || recoveryAggregate.Quota != int64(reward.RecoveredQuota) {
			issues++
		}
	}
	return issues, nil
}

func cashbackOrderReconciliationIssues(orders []CashbackOrderContext) (int64, error) {
	if len(orders) == 0 {
		return 0, nil
	}
	topUpIDs := make([]int, 0, len(orders))
	for i := range orders {
		topUpIDs = append(topUpIDs, orders[i].TopUpID)
	}
	var aggregates []cashbackMutationAggregate
	if err := DB.Model(&CashbackQuotaMutation{}).
		Select("top_up_id, kind, COALESCE(SUM(quota), 0) AS quota, COUNT(*) AS event_count").
		Where("top_up_id IN ? AND kind = ?", topUpIDs, CashbackQuotaMutationPrincipalRecovery).
		Group("top_up_id, kind").
		Scan(&aggregates).Error; err != nil {
		return 0, err
	}
	byTopUp := make(map[int]cashbackMutationAggregate, len(aggregates))
	for _, aggregate := range aggregates {
		byTopUp[aggregate.TopUpID] = aggregate
	}

	var issues int64
	for i := range orders {
		order := &orders[i]
		structurallyInvalid := order.PrincipalReversalTargetQuota < 0 || order.PrincipalRecoveredQuota < 0 || order.PrincipalOutstandingDebtQuota < 0 || order.PrincipalRecoveredQuota > order.PrincipalReversalTargetQuota
		if structurallyInvalid || byTopUp[order.TopUpID].Quota != int64(order.PrincipalRecoveredQuota) {
			issues++
		}
	}
	return issues, nil
}

func cashbackMutationReconciliationIssues(mutations []CashbackQuotaMutation) (int64, error) {
	if len(mutations) == 0 {
		return 0, nil
	}
	rewardIDs := make([]int64, 0, len(mutations))
	topUpIDs := make([]int, 0, len(mutations))
	for i := range mutations {
		mutation := &mutations[i]
		if mutation.Kind == CashbackQuotaMutationPrincipalRecovery {
			topUpIDs = append(topUpIDs, mutation.TopUpID)
		} else {
			rewardIDs = append(rewardIDs, mutation.RewardID)
		}
	}
	var rewards []CashbackReward
	if len(rewardIDs) > 0 {
		if err := DB.Select("id", "top_up_id", "beneficiary_id").Where("id IN ?", rewardIDs).Find(&rewards).Error; err != nil {
			return 0, err
		}
	}
	rewardByID := make(map[int64]CashbackReward, len(rewards))
	for _, reward := range rewards {
		rewardByID[reward.ID] = reward
	}
	var orders []CashbackOrderContext
	if len(topUpIDs) > 0 {
		if err := DB.Select("top_up_id", "user_id").Where("top_up_id IN ?", topUpIDs).Find(&orders).Error; err != nil {
			return 0, err
		}
	}
	orderByTopUp := make(map[int]CashbackOrderContext, len(orders))
	for _, order := range orders {
		orderByTopUp[order.TopUpID] = order
	}

	var issues int64
	for i := range mutations {
		mutation := &mutations[i]
		if mutation.Quota <= 0 || strings.TrimSpace(mutation.EventKey) == "" || !validCashbackQuotaMutationKind(mutation.Kind) {
			issues++
			continue
		}
		switch mutation.Kind {
		case CashbackQuotaMutationPrincipalRecovery:
			order, ok := orderByTopUp[mutation.TopUpID]
			if !ok || mutation.RewardID != 0 || order.UserID != mutation.UserID {
				issues++
			}
		case CashbackQuotaMutationIssue, CashbackQuotaMutationRewardRecovery:
			reward, ok := rewardByID[mutation.RewardID]
			if !ok || reward.TopUpID != mutation.TopUpID || reward.BeneficiaryID != mutation.UserID {
				issues++
			}
		}
	}
	return issues, nil
}

func resetCashbackReconciliationProgress() {
	cashbackReconciliationProgress.Lock()
	cashbackReconciliationProgress.RewardID = 0
	cashbackReconciliationProgress.OrderContextID = 0
	cashbackReconciliationProgress.MutationID = 0
	cashbackReconciliationProgress.Unlock()
}
