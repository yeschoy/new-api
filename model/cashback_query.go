package model

import (
	"errors"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

const cashbackListCountLimit = 10_001

type CashbackRewardFilter struct {
	TradeNo          string
	UserID           int
	CampaignID       int64
	Direction        CashbackDirection
	ReviewStatus     CashbackReviewStatus
	SettlementStatus CashbackSettlementStatus
	RiskLevel        CashbackRiskLevel
}

type CashbackRewardWithContext struct {
	Reward       CashbackReward
	OrderContext CashbackOrderContext
}

type CashbackInviterCluster struct {
	InviterID        int   `json:"inviter_id"`
	DistinctInvitees int64 `json:"distinct_invitees"`
	RewardCount      int64 `json:"reward_count"`
	RewardQuota      int64 `json:"reward_quota"`
}

type CashbackDeviceCluster struct {
	DeviceHashShort string `json:"device_hash_short"`
	AccountCount    int64  `json:"account_count"`
}

type CashbackAdminSummary struct {
	PendingReviewQuota       int64                       `json:"pending_review_quota"`
	AwaitingMaturityQuota    int64                       `json:"awaiting_maturity_quota"`
	IssuedQuota              int64                       `json:"issued_quota"`
	RecoveredQuota           int64                       `json:"recovered_quota"`
	OutstandingRewardDebt    int64                       `json:"outstanding_reward_debt"`
	OutstandingPrincipalDebt int64                       `json:"outstanding_principal_debt"`
	RejectedOrCanceledCount  int64                       `json:"rejected_or_canceled_count"`
	IncidentCount            int64                       `json:"incident_count"`
	SettlementFailureCount   int64                       `json:"settlement_failure_count"`
	ReconciliationIssues     int64                       `json:"reconciliation_issues"`
	RiskCounts               map[CashbackRiskLevel]int64 `json:"risk_counts"`
	InviterClusters          []CashbackInviterCluster    `json:"inviter_clusters"`
	DeviceClusters           []CashbackDeviceCluster     `json:"device_clusters"`
}

func ListCashbackRewards(filter CashbackRewardFilter, pageInfo *common.PageInfo) ([]CashbackReward, int64, error) {
	if pageInfo == nil {
		pageInfo = &common.PageInfo{Page: 1, PageSize: common.ItemsPerPage}
	}
	if pageInfo.Page < 1 {
		pageInfo.Page = 1
	}
	if pageInfo.PageSize <= 0 || pageInfo.PageSize > 100 {
		pageInfo.PageSize = common.ItemsPerPage
	}

	buildQuery := func(db *gorm.DB) (*gorm.DB, error) {
		query := db.Model(&CashbackReward{})
		tradeNo := strings.TrimSpace(filter.TradeNo)
		if tradeNo != "" {
			if len(tradeNo) > 255 {
				return nil, errors.New("trade number is too long")
			}
			pattern, err := sanitizeLikePattern(tradeNo)
			if err != nil {
				return nil, err
			}
			query = query.Where("trade_no LIKE ? ESCAPE '!'", pattern)
		}
		if filter.UserID > 0 {
			query = query.Where("(beneficiary_id = ? OR invitee_id = ? OR inviter_id = ?)", filter.UserID, filter.UserID, filter.UserID)
		}
		if filter.CampaignID > 0 {
			orders := db.Model(&CashbackOrderContext{}).Select("top_up_id").Where("campaign_id = ?", filter.CampaignID)
			query = query.Where("top_up_id IN (?)", orders)
		}
		if filter.Direction != "" {
			if !validCashbackDirection(filter.Direction) {
				return nil, errors.New("invalid cashback direction filter")
			}
			query = query.Where("direction = ?", filter.Direction)
		}
		if filter.ReviewStatus != "" {
			if !validCashbackReviewStatus(filter.ReviewStatus) {
				return nil, errors.New("invalid cashback review status filter")
			}
			query = query.Where("review_status = ?", filter.ReviewStatus)
		}
		if filter.SettlementStatus != "" {
			if !validCashbackSettlementStatus(filter.SettlementStatus) {
				return nil, errors.New("invalid cashback settlement status filter")
			}
			query = query.Where("settlement_status = ?", filter.SettlementStatus)
		}
		if filter.RiskLevel != "" {
			if !validCashbackRiskLevel(filter.RiskLevel) {
				return nil, errors.New("invalid cashback risk level filter")
			}
			query = query.Where("risk_level = ?", filter.RiskLevel)
		}
		return query, nil
	}

	countBase, err := buildQuery(DB)
	if err != nil {
		return nil, 0, err
	}
	limitedIDs := countBase.Select("cashback_rewards.id").Limit(cashbackListCountLimit)
	var total int64
	if err := DB.Table("(?) AS cashback_reward_count", limitedIDs).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	query, err := buildQuery(DB)
	if err != nil {
		return nil, 0, err
	}
	var rewards []CashbackReward
	if err := query.Order("id desc").Limit(pageInfo.PageSize).Offset(pageInfo.GetStartIdx()).Find(&rewards).Error; err != nil {
		return nil, 0, err
	}
	return rewards, total, nil
}

func GetCashbackRewardWithContext(rewardID int64) (*CashbackRewardWithContext, error) {
	if rewardID <= 0 {
		return nil, ErrCashbackNotFound
	}
	var reward CashbackReward
	if err := DB.First(&reward, rewardID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrCashbackNotFound
		}
		return nil, err
	}
	var orderContext CashbackOrderContext
	if err := DB.Where("top_up_id = ?", reward.TopUpID).First(&orderContext).Error; err != nil {
		return nil, err
	}
	return &CashbackRewardWithContext{Reward: reward, OrderContext: orderContext}, nil
}

func GetCashbackAdminSummary() (CashbackAdminSummary, error) {
	summary := CashbackAdminSummary{
		RiskCounts:      map[CashbackRiskLevel]int64{},
		InviterClusters: []CashbackInviterCluster{},
		DeviceClusters:  []CashbackDeviceCluster{},
	}
	if err := sumCashbackRewardColumn("reward_quota", "review_status = ? AND settlement_status = ?", &summary.PendingReviewQuota, CashbackReviewPending, CashbackSettlementFrozen); err != nil {
		return CashbackAdminSummary{}, err
	}
	if err := sumCashbackRewardColumn("reward_quota", "review_status = ? AND settlement_status = ?", &summary.AwaitingMaturityQuota, CashbackReviewApproved, CashbackSettlementFrozen); err != nil {
		return CashbackAdminSummary{}, err
	}
	if err := sumCashbackRewardColumn("reward_quota", "issued_at > 0", &summary.IssuedQuota); err != nil {
		return CashbackAdminSummary{}, err
	}
	if err := sumCashbackRewardColumn("recovered_quota", "recovered_quota > 0", &summary.RecoveredQuota); err != nil {
		return CashbackAdminSummary{}, err
	}
	if err := sumCashbackRewardColumn("outstanding_debt_quota", "outstanding_debt_quota > 0", &summary.OutstandingRewardDebt); err != nil {
		return CashbackAdminSummary{}, err
	}
	if err := DB.Model(&CashbackOrderContext{}).
		Select("COALESCE(SUM(principal_outstanding_debt_quota), 0)").
		Scan(&summary.OutstandingPrincipalDebt).Error; err != nil {
		return CashbackAdminSummary{}, err
	}
	if err := DB.Model(&CashbackReward{}).
		Where("review_status = ? OR settlement_status = ?", CashbackReviewRejected, CashbackSettlementCanceled).
		Count(&summary.RejectedOrCanceledCount).Error; err != nil {
		return CashbackAdminSummary{}, err
	}
	if err := DB.Model(&CashbackOrderContext{}).Where("incident_kind <> ''").Count(&summary.IncidentCount).Error; err != nil {
		return CashbackAdminSummary{}, err
	}
	if err := DB.Model(&CashbackReward{}).Where("last_settlement_error <> ''").Count(&summary.SettlementFailureCount).Error; err != nil {
		return CashbackAdminSummary{}, err
	}
	if DB.Migrator().HasTable(&SystemTask{}) {
		var failedTasks int64
		if err := DB.Model(&SystemTask{}).
			Where("type = ? AND status = ?", SystemTaskTypeCashbackSettlement, SystemTaskStatusFailed).
			Count(&failedTasks).Error; err != nil {
			return CashbackAdminSummary{}, err
		}
		summary.SettlementFailureCount += failedTasks
	}
	reconciliationIssues, err := CashbackReconciliationInconsistencyCount()
	if err != nil {
		return CashbackAdminSummary{}, err
	}
	summary.ReconciliationIssues = reconciliationIssues

	type riskCount struct {
		RiskLevel CashbackRiskLevel
		Count     int64
	}
	var riskCounts []riskCount
	if err := DB.Model(&CashbackReward{}).Select("risk_level, COUNT(*) AS count").Group("risk_level").Scan(&riskCounts).Error; err != nil {
		return CashbackAdminSummary{}, err
	}
	for _, row := range riskCounts {
		summary.RiskCounts[row.RiskLevel] = row.Count
	}

	clusterCutoff := time.Now().Unix() - cashbackRiskWindowSeconds
	if err := DB.Model(&CashbackReward{}).
		Select("inviter_id, COUNT(DISTINCT invitee_id) AS distinct_invitees, COUNT(*) AS reward_count, COALESCE(SUM(reward_quota), 0) AS reward_quota").
		Where("created_at >= ? AND inviter_id > 0", clusterCutoff).
		Group("inviter_id").
		Having("COUNT(DISTINCT invitee_id) >= ?", 2).
		Order("distinct_invitees desc").
		Limit(10).
		Scan(&summary.InviterClusters).Error; err != nil {
		return CashbackAdminSummary{}, err
	}
	type deviceClusterRow struct {
		DeviceFingerprintHash string
		AccountCount          int64
	}
	var deviceRows []deviceClusterRow
	if err := DB.Model(&CashbackDeviceLink{}).
		Select("device_fingerprint_hash, COUNT(DISTINCT user_id) AS account_count").
		Where("device_signal_status = ? AND last_seen_at >= ?", CashbackDeviceSignalValid, clusterCutoff).
		Group("device_fingerprint_hash").
		Having("COUNT(DISTINCT user_id) >= ?", 2).
		Order("account_count desc").
		Limit(10).
		Scan(&deviceRows).Error; err != nil {
		return CashbackAdminSummary{}, err
	}
	for _, row := range deviceRows {
		summary.DeviceClusters = append(summary.DeviceClusters, CashbackDeviceCluster{
			DeviceHashShort: CashbackDeviceHashShort(row.DeviceFingerprintHash),
			AccountCount:    row.AccountCount,
		})
	}
	return summary, nil
}

func sumCashbackRewardColumn(column, predicate string, target *int64, args ...interface{}) error {
	return DB.Model(&CashbackReward{}).
		Where(predicate, args...).
		Select("COALESCE(SUM(" + column + "), 0)").
		Scan(target).Error
}
