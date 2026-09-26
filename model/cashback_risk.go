package model

import (
	"errors"
	"sort"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"gorm.io/gorm"
)

const cashbackRiskWindowSeconds int64 = 24 * 60 * 60

type CashbackTopUpStatusCounts struct {
	Pending int64 `json:"pending"`
	Success int64 `json:"success"`
	Failed  int64 `json:"failed"`
	Expired int64 `json:"expired"`
}

type CashbackRiskSnapshot struct {
	Flags                        []string                  `json:"flags"`
	SignalCount                  int                       `json:"signal_count"`
	InviteeAccountAgeSeconds     int64                     `json:"invitee_account_age_seconds"`
	InviterAccountAgeSeconds     int64                     `json:"inviter_account_age_seconds"`
	RegistrationToTopUpSeconds   int64                     `json:"registration_to_topup_seconds"`
	RelationshipAgeSeconds       int64                     `json:"relationship_age_seconds"`
	RequestIP                    string                    `json:"request_ip"`
	FirstObservedIP              string                    `json:"first_observed_ip"`
	RecentLoginIPCount           int                       `json:"recent_login_ip_count"`
	RequestIPSeenInRecentLogin   bool                      `json:"request_ip_seen_in_recent_login"`
	IPAssociatedAccountCount     int                       `json:"ip_associated_account_count"`
	DeviceSignalStatus           string                    `json:"device_signal_status"`
	DeviceHashShort              string                    `json:"device_hash_short"`
	DeviceAssociatedAccountCount int                       `json:"device_associated_account_count"`
	RecentDeviceCount            int                       `json:"recent_device_count"`
	UserAgentMatchesRecentLogin  bool                      `json:"user_agent_matches_recent_login"`
	PaymentProviderMatches       bool                      `json:"payment_provider_matches"`
	CompletionSource             CashbackCompletionSource  `json:"completion_source"`
	TopUpStatusCounts            CashbackTopUpStatusCounts `json:"top_up_status_counts"`
	TopUpCount24h                int64                     `json:"top_up_count_24h"`
	TopUpFailureRateBPS          int                       `json:"top_up_failure_rate_bps"`
	RepeatedAmountCount24h       int                       `json:"repeated_amount_count_24h"`
	SmallThenLarge               bool                      `json:"small_then_large"`
	RewardNearSingleLimit        bool                      `json:"reward_near_single_limit"`
	DailyRewardUsedQuota         int                       `json:"daily_reward_used_quota"`
	DailyRewardProjectedQuota    int                       `json:"daily_reward_projected_quota"`
	InviterDistinctInvitees24h   int64                     `json:"inviter_distinct_invitees_24h"`
	InviterRewardQuota24h        int64                     `json:"inviter_reward_quota_24h"`
	PriorIncidentCount           int64                     `json:"prior_incident_count"`
	CapReason                    string                    `json:"cap_reason"`
	GeneratedAt                  int64                     `json:"generated_at"`
}

type cashbackRiskInput struct {
	TopUp           *TopUp
	OrderContext    *CashbackOrderContext
	Invitee         User
	Inviter         User
	BeneficiaryID   int
	CalculatedQuota int
	RewardQuota     int
	CapReason       string
	DailyUsedQuota  int
	Setting         operation_setting.CashbackSetting
}

func buildCashbackRiskSnapshotTx(tx *gorm.DB, input cashbackRiskInput) (CashbackRiskSnapshot, CashbackRiskLevel, error) {
	now := input.TopUp.CompleteTime
	if now <= 0 {
		now = time.Now().Unix()
	}
	cutoff := now - cashbackRiskWindowSeconds
	snapshot := CashbackRiskSnapshot{
		InviteeAccountAgeSeconds:   nonNegativeDuration(now, input.Invitee.CreatedAt),
		RegistrationToTopUpSeconds: nonNegativeDuration(input.TopUp.CreateTime, input.Invitee.CreatedAt),
		RequestIP:                  input.OrderContext.RequestIP,
		DeviceSignalStatus:         input.OrderContext.DeviceSignalStatus,
		DeviceHashShort:            CashbackDeviceHashShort(input.OrderContext.DeviceFingerprintHash),
		PaymentProviderMatches:     input.OrderContext.PaymentProvider == input.TopUp.PaymentProvider && input.OrderContext.CompletionProvider == input.TopUp.PaymentProvider,
		CompletionSource:           input.OrderContext.CompletionSource,
		DailyRewardUsedQuota:       input.DailyUsedQuota,
		DailyRewardProjectedQuota:  input.DailyUsedQuota + input.RewardQuota,
		CapReason:                  input.CapReason,
		GeneratedAt:                now,
	}
	flags := make(map[string]struct{})
	addFlag := func(flag string) {
		if flag != "" {
			flags[flag] = struct{}{}
		}
	}

	if snapshot.InviteeAccountAgeSeconds < 24*60*60 {
		addFlag("new_account")
	}
	if snapshot.RegistrationToTopUpSeconds < 60*60 {
		addFlag("rapid_registration_to_topup")
	}
	if !snapshot.PaymentProviderMatches || !eligibleCashbackCompletionSource(snapshot.CompletionSource) {
		addFlag("payment_channel_mismatch")
	}
	if input.OrderContext.RequestIP == "" {
		addFlag("request_ip_missing")
	}
	if input.OrderContext.RequestUserAgentHash == "" {
		addFlag("user_agent_missing")
	}
	switch snapshot.DeviceSignalStatus {
	case CashbackDeviceSignalMissing:
		addFlag("device_missing")
	case CashbackDeviceSignalInvalid:
		addFlag("device_invalid")
	}

	if err := populateCashbackSessionRiskTx(tx, input.Invitee.Id, cutoff, input.OrderContext, &snapshot); err != nil {
		return CashbackRiskSnapshot{}, "", err
	}
	if snapshot.RequestIP != "" && !snapshot.RequestIPSeenInRecentLogin {
		addFlag("login_ip_mismatch")
	}
	if snapshot.RequestIP != "" && snapshot.FirstObservedIP != "" && snapshot.RequestIP != snapshot.FirstObservedIP {
		addFlag("first_observed_ip_mismatch")
	}
	if snapshot.IPAssociatedAccountCount >= input.Setting.IPAccountThreshold {
		addFlag("shared_ip_accounts")
	}
	if snapshot.DeviceAssociatedAccountCount >= input.Setting.DeviceAccountThreshold {
		addFlag("shared_device_accounts")
	}
	if snapshot.RecentDeviceCount >= input.Setting.DeviceAccountThreshold {
		addFlag("device_rotation")
	}
	if input.OrderContext.RequestUserAgentHash != "" && !snapshot.UserAgentMatchesRecentLogin {
		addFlag("user_agent_changed")
	}

	if err := populateCashbackTopUpRiskTx(tx, input.Invitee.Id, cutoff, input.OrderContext.BaseQuota, &snapshot); err != nil {
		return CashbackRiskSnapshot{}, "", err
	}
	if snapshot.TopUpCount24h >= int64(input.Setting.DailyTopUpCountThreshold) {
		addFlag("high_topup_frequency")
	}
	if snapshot.TopUpFailureRateBPS >= 5_000 && snapshot.TopUpCount24h >= 3 {
		addFlag("high_topup_failure_rate")
	}
	if snapshot.RepeatedAmountCount24h >= 3 {
		addFlag("repeated_amount")
	}
	if snapshot.SmallThenLarge {
		addFlag("small_test_then_large")
	}

	if input.Setting.MaxRewardQuota > 0 {
		threshold := input.Setting.MaxRewardQuota - input.Setting.MaxRewardQuota/10
		snapshot.RewardNearSingleLimit = input.CalculatedQuota >= threshold
		if snapshot.RewardNearSingleLimit {
			addFlag("reward_near_single_limit")
		}
	}
	if input.Setting.DailyRewardQuota > 0 {
		threshold := input.Setting.DailyRewardQuota - input.Setting.DailyRewardQuota/5
		if snapshot.DailyRewardProjectedQuota >= threshold {
			addFlag("high_daily_reward_exposure")
		}
	}
	if input.CapReason != "" {
		addFlag("reward_capped")
	}

	if input.Inviter.Id > 0 {
		snapshot.InviterAccountAgeSeconds = nonNegativeDuration(now, input.Inviter.CreatedAt)
		snapshot.RelationshipAgeSeconds = nonNegativeDuration(input.TopUp.CreateTime, input.Invitee.CreatedAt)
		if err := populateCashbackInviterRiskTx(tx, input.Inviter.Id, input.TopUp.Id, cutoff, &snapshot); err != nil {
			return CashbackRiskSnapshot{}, "", err
		}
		if snapshot.InviterDistinctInvitees24h >= int64(input.Setting.IPAccountThreshold) {
			addFlag("inviter_concentration")
		}
	}
	if err := tx.Model(&CashbackOrderContext{}).
		Where("user_id = ? AND incident_kind <> ''", input.Invitee.Id).
		Count(&snapshot.PriorIncidentCount).Error; err != nil {
		return CashbackRiskSnapshot{}, "", err
	}
	if snapshot.PriorIncidentCount > 0 {
		addFlag("prior_payment_incident")
	}

	snapshot.Flags = make([]string, 0, len(flags))
	for flag := range flags {
		snapshot.Flags = append(snapshot.Flags, flag)
	}
	sort.Strings(snapshot.Flags)
	snapshot.SignalCount = len(snapshot.Flags)

	level := CashbackRiskLow
	switch {
	case snapshot.PriorIncidentCount > 0 || snapshot.SignalCount >= 6:
		level = CashbackRiskSevere
	case snapshot.SignalCount >= 3:
		level = CashbackRiskHigh
	case snapshot.SignalCount > 0:
		level = CashbackRiskMedium
	}
	return snapshot, level, nil
}

func nonNegativeDuration(end, start int64) int64 {
	if end <= start || start <= 0 {
		return 0
	}
	return end - start
}

func populateCashbackSessionRiskTx(tx *gorm.DB, userID int, cutoff int64, context *CashbackOrderContext, snapshot *CashbackRiskSnapshot) error {
	accountIDs := map[int]struct{}{}
	if context.RequestIP != "" {
		var contextUserIDs []int
		if err := tx.Model(&CashbackOrderContext{}).
			Distinct("user_id").
			Where("request_ip = ?", context.RequestIP).
			Pluck("user_id", &contextUserIDs).Error; err != nil {
			return err
		}
		for _, id := range contextUserIDs {
			accountIDs[id] = struct{}{}
		}
	}

	if tx.Migrator().HasTable(&UserSession{}) {
		var sessions []UserSession
		if err := tx.Select("user_id", "ip", "user_agent").
			Where("user_id = ? AND created_at >= ?", userID, cutoff).
			Order("created_at desc").
			Limit(100).
			Find(&sessions).Error; err != nil {
			return err
		}
		loginIPs := map[string]struct{}{}
		for _, session := range sessions {
			if session.IP != "" {
				loginIPs[session.IP] = struct{}{}
			}
			if session.IP == context.RequestIP {
				snapshot.RequestIPSeenInRecentLogin = true
			}
			if HashCashbackUserAgent(session.UserAgent) == context.RequestUserAgentHash && context.RequestUserAgentHash != "" {
				snapshot.UserAgentMatchesRecentLogin = true
			}
		}
		snapshot.RecentLoginIPCount = len(loginIPs)

		if context.RequestIP != "" {
			var sessionUserIDs []int
			if err := tx.Model(&UserSession{}).
				Distinct("user_id").
				Where("ip = ? AND created_at >= ?", context.RequestIP, cutoff-30*24*60*60).
				Pluck("user_id", &sessionUserIDs).Error; err != nil {
				return err
			}
			for _, id := range sessionUserIDs {
				accountIDs[id] = struct{}{}
			}
		}
	}

	if tx.Migrator().HasTable(&CashbackDeviceLink{}) {
		if context.RequestIP != "" {
			var linkedUserIDs []int
			if err := tx.Model(&CashbackDeviceLink{}).
				Distinct("user_id").
				Where("first_ip = ? OR last_ip = ?", context.RequestIP, context.RequestIP).
				Pluck("user_id", &linkedUserIDs).Error; err != nil {
				return err
			}
			for _, id := range linkedUserIDs {
				accountIDs[id] = struct{}{}
			}
		}
		var firstLink CashbackDeviceLink
		if err := tx.Where("user_id = ?", userID).Order("first_seen_at asc").First(&firstLink).Error; err == nil {
			snapshot.FirstObservedIP = firstLink.FirstIP
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}
		if context.DeviceFingerprintHash != "" {
			var associated int64
			if err := tx.Model(&CashbackDeviceLink{}).
				Where("device_fingerprint_hash = ?", context.DeviceFingerprintHash).
				Distinct("user_id").
				Count(&associated).Error; err != nil {
				return err
			}
			snapshot.DeviceAssociatedAccountCount = int(associated)
		}
		var recentDevices int64
		if err := tx.Model(&CashbackDeviceLink{}).
			Where("user_id = ? AND device_signal_status = ? AND last_seen_at >= ?", userID, CashbackDeviceSignalValid, cutoff).
			Count(&recentDevices).Error; err != nil {
			return err
		}
		snapshot.RecentDeviceCount = int(recentDevices)
	}
	snapshot.IPAssociatedAccountCount = len(accountIDs)
	return nil
}

func populateCashbackTopUpRiskTx(tx *gorm.DB, userID int, cutoff int64, currentBaseQuota int, snapshot *CashbackRiskSnapshot) error {
	type statusCount struct {
		Status string
		Count  int64
	}
	var counts []statusCount
	if err := tx.Model(&TopUp{}).
		Select("status, COUNT(*) AS count").
		Where("user_id = ? AND create_time >= ?", userID, cutoff).
		Group("status").
		Scan(&counts).Error; err != nil {
		return err
	}
	for _, count := range counts {
		switch count.Status {
		case common.TopUpStatusPending:
			snapshot.TopUpStatusCounts.Pending = count.Count
		case common.TopUpStatusSuccess:
			snapshot.TopUpStatusCounts.Success = count.Count
		case common.TopUpStatusFailed:
			snapshot.TopUpStatusCounts.Failed = count.Count
		case common.TopUpStatusExpired:
			snapshot.TopUpStatusCounts.Expired = count.Count
		}
	}
	snapshot.TopUpCount24h = snapshot.TopUpStatusCounts.Pending + snapshot.TopUpStatusCounts.Success + snapshot.TopUpStatusCounts.Failed + snapshot.TopUpStatusCounts.Expired
	terminal := snapshot.TopUpStatusCounts.Success + snapshot.TopUpStatusCounts.Failed + snapshot.TopUpStatusCounts.Expired
	if terminal > 0 {
		snapshot.TopUpFailureRateBPS = int((snapshot.TopUpStatusCounts.Failed + snapshot.TopUpStatusCounts.Expired) * 10_000 / terminal)
	}

	var baseQuotas []int
	if err := tx.Model(&CashbackOrderContext{}).
		Where("user_id = ? AND created_at >= ?", userID, cutoff).
		Pluck("base_quota", &baseQuotas).Error; err != nil {
		return err
	}
	minimumPrevious := 0
	for _, quota := range baseQuotas {
		if quota == currentBaseQuota {
			snapshot.RepeatedAmountCount24h++
		}
		if quota < currentBaseQuota && (minimumPrevious == 0 || quota < minimumPrevious) {
			minimumPrevious = quota
		}
	}
	if minimumPrevious > 0 && minimumPrevious <= currentBaseQuota/5 {
		snapshot.SmallThenLarge = true
	}
	return nil
}

func populateCashbackInviterRiskTx(tx *gorm.DB, inviterID, currentTopUpID int, cutoff int64, snapshot *CashbackRiskSnapshot) error {
	if err := tx.Model(&CashbackReward{}).
		Where("inviter_id = ? AND top_up_id <> ? AND created_at >= ?", inviterID, currentTopUpID, cutoff).
		Distinct("invitee_id").
		Count(&snapshot.InviterDistinctInvitees24h).Error; err != nil {
		return err
	}
	return tx.Model(&CashbackReward{}).
		Where("inviter_id = ? AND top_up_id <> ? AND created_at >= ?", inviterID, currentTopUpID, cutoff).
		Select("COALESCE(SUM(reward_quota), 0)").
		Scan(&snapshot.InviterRewardQuota24h).Error
}

func cashbackHasOpenDebtTx(tx *gorm.DB, userID int) (bool, error) {
	var rewardDebtCount int64
	if err := tx.Model(&CashbackReward{}).
		Where("beneficiary_id = ? AND outstanding_debt_quota > 0", userID).
		Limit(1).
		Count(&rewardDebtCount).Error; err != nil {
		return false, err
	}
	if rewardDebtCount > 0 {
		return true, nil
	}
	var principalDebtCount int64
	if err := tx.Model(&CashbackOrderContext{}).
		Where("user_id = ? AND principal_outstanding_debt_quota > 0", userID).
		Limit(1).
		Count(&principalDebtCount).Error; err != nil {
		return false, err
	}
	return principalDebtCount > 0, nil
}
