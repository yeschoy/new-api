package model

import (
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/glebarez/sqlite"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupCashbackTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	oldDB, oldLogDB := DB, LOG_DB
	oldType := common.MainDatabaseType()
	oldRedis := common.RedisEnabled
	oldPayment := *operation_setting.GetPaymentSetting()
	oldCashback := *operation_setting.GetCashbackSetting()
	common.OptionMapRWMutex.Lock()
	oldOptionMap := common.OptionMap
	common.OptionMap = make(map[string]string)
	common.OptionMapRWMutex.Unlock()

	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(
		&User{}, &UserSession{}, &TopUp{}, &Option{}, &CashbackOrderContext{}, &CashbackReward{}, &CashbackDeviceLink{}, &CashbackQuotaMutation{}, &Log{},
	))
	DB, LOG_DB = db, db
	resetCashbackReconciliationProgress()
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.RedisEnabled = false
	payment := operation_setting.GetPaymentSetting()
	payment.ComplianceConfirmed = true
	payment.ComplianceTermsVersion = operation_setting.CurrentComplianceTermsVersion

	t.Cleanup(func() {
		resetCashbackReconciliationProgress()
		DB, LOG_DB = oldDB, oldLogDB
		common.SetMainDatabaseType(oldType)
		common.RedisEnabled = oldRedis
		*operation_setting.GetPaymentSetting() = oldPayment
		*operation_setting.GetCashbackSetting() = oldCashback
		common.OptionMapRWMutex.Lock()
		common.OptionMap = oldOptionMap
		common.OptionMapRWMutex.Unlock()
		sqlDB, sqlErr := db.DB()
		if sqlErr == nil {
			_ = sqlDB.Close()
		}
	})
	return db
}

func saveCashbackTestSetting(t *testing.T, firstEnabledAt int64) operation_setting.CashbackSetting {
	t.Helper()
	setting := operation_setting.DefaultCashbackSetting()
	setting.InviterEnabled = true
	setting.InviteeEnabled = true
	setting.InviterRateBPS = 1_000
	setting.InviteeRateBPS = 500
	setting.MaxRewardQuota = 1_000_000
	setting.DailyRewardQuota = 2_000_000
	setting.FirstEnabledAt = firstEnabledAt
	setting.Version = 3
	require.NoError(t, operation_setting.ValidateCashbackSetting(setting, true))
	require.NoError(t, SaveCashbackSetting(setting))
	return setting
}

func createCashbackUsers(t *testing.T, createdAt int64) (User, User) {
	t.Helper()
	inviter := User{Username: "cashback-inviter", Password: "password", AffCode: "inviter-code", Status: common.UserStatusEnabled, Role: common.RoleCommonUser, CreatedAt: createdAt}
	require.NoError(t, DB.Create(&inviter).Error)
	invitee := User{Username: "cashback-invitee", Password: "password", AffCode: "invitee-code", InviterId: inviter.Id, Status: common.UserStatusEnabled, Role: common.RoleCommonUser, CreatedAt: createdAt}
	require.NoError(t, DB.Create(&invitee).Error)
	return inviter, invitee
}

func createCompletedCashbackTopUp(t *testing.T, invitee User, createTime, completeTime int64, baseQuota, creditedQuota int) TopUp {
	t.Helper()
	validSignal := "v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	topUp := TopUp{
		UserId: invitee.Id, Amount: int64(baseQuota), Money: 1, TradeNo: "cashback-order-" + time.Unix(createTime, 0).Format("150405"),
		PaymentMethod: PaymentMethodWaffo, PaymentProvider: PaymentProviderWaffo, CreateTime: createTime, Status: common.TopUpStatusPending,
	}
	require.NoError(t, InsertOnlineTopUp(&topUp, baseQuota, CashbackRequestMetadata{
		RequestIP: "203.0.113.10", UserAgent: "cashback-test-agent", DeviceSignal: validSignal,
	}))
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		var locked TopUp
		if err := lockForUpdate(tx).First(&locked, topUp.Id).Error; err != nil {
			return err
		}
		locked.Status = common.TopUpStatusSuccess
		locked.CompleteTime = completeTime
		if err := tx.Save(&locked).Error; err != nil {
			return err
		}
		if err := CompleteTopUpCashbackTx(tx, &locked, creditedQuota, CashbackCompletionProviderCallback); err != nil {
			return err
		}
		return creditTopUpQuota(tx, invitee.Id, creditedQuota, nil)
	}))
	return topUp
}

func TestCashbackMigrationCreatesOnlySideTablesAndUniqueDirection(t *testing.T) {
	db := setupCashbackTestDB(t)
	assert.True(t, db.Migrator().HasTable(&CashbackOrderContext{}))
	assert.True(t, db.Migrator().HasTable(&CashbackReward{}))
	assert.True(t, db.Migrator().HasTable(&CashbackDeviceLink{}))
	assert.True(t, db.Migrator().HasTable(&CashbackQuotaMutation{}))
	assert.True(t, db.Migrator().HasIndex(&CashbackQuotaMutation{}, "idx_cashback_mutation_reward_kind"))
	assert.True(t, db.Migrator().HasIndex(&CashbackQuotaMutation{}, "idx_cashback_mutation_topup_kind"))

	columns, err := db.Migrator().ColumnTypes(&TopUp{})
	require.NoError(t, err)
	for _, column := range columns {
		assert.NotContains(t, column.Name(), "cashback")
	}

	reward := CashbackReward{
		TopUpID: 1, TradeNo: "unique-order", Direction: CashbackDirectionInvitee, InviteeID: 2, InviterID: 1, BeneficiaryID: 2,
		BaseQuota: 100, RateBPS: 100, CalculatedQuota: 1, RewardQuota: 1, SettlementDays: 7,
		PaidAt: 1, AvailableAt: 2, ReviewStatus: CashbackReviewPending, SettlementStatus: CashbackSettlementFrozen,
		RiskLevel: CashbackRiskLow, RiskSnapshot: `{}`, ConfigSnapshot: `{}`,
	}
	require.NoError(t, db.Create(&reward).Error)
	reward.ID = 0
	assert.Error(t, db.Create(&reward).Error)
}

func TestInsertOnlineTopUpHonorsImmutableFirstEnableBoundaryAndHashesDevice(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now)
	_, invitee := createCashbackUsers(t, now-10_000)

	oldOrder := TopUp{UserId: invitee.Id, TradeNo: "before-first-enable", PaymentProvider: PaymentProviderEpay, CreateTime: now - 1, Status: common.TopUpStatusPending}
	require.NoError(t, InsertOnlineTopUp(&oldOrder, 100, CashbackRequestMetadata{}))
	var oldContext CashbackOrderContext
	require.NoError(t, DB.Where("top_up_id = ?", oldOrder.Id).First(&oldContext).Error)
	assert.False(t, oldContext.EligibleAfterFirstEnable)

	newOrder := TopUp{UserId: invitee.Id, TradeNo: "after-first-enable", PaymentProvider: PaymentProviderEpay, CreateTime: now, Status: common.TopUpStatusPending}
	require.NoError(t, InsertOnlineTopUp(&newOrder, 100, CashbackRequestMetadata{
		RequestIP: "203.0.113.11", UserAgent: "agent", DeviceSignal: "v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	}))
	var orderContext CashbackOrderContext
	require.NoError(t, DB.Where("top_up_id = ?", newOrder.Id).First(&orderContext).Error)
	assert.True(t, orderContext.EligibleAfterFirstEnable)
	assert.Equal(t, CashbackDeviceSignalValid, orderContext.DeviceSignalStatus)
	assert.Len(t, orderContext.DeviceFingerprintHash, 64)
	assert.NotContains(t, orderContext.DeviceFingerprintHash, "bbbb")
	var link CashbackDeviceLink
	require.NoError(t, DB.Where("user_id = ? AND device_fingerprint_hash = ?", invitee.Id, orderContext.DeviceFingerprintHash).First(&link).Error)
	assert.Equal(t, orderContext.DeviceFingerprintHash, link.DeviceFingerprintHash)
}

func TestSameSecondFirstEnableUsesOrderLocalEligibilitySnapshot(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	_, invitee := createCashbackUsers(t, now-10_000)

	baseQuota, err := common.WalletQuotaFromDecimalStrict(decimal.NewFromFloat(common.QuotaPerUnit))
	require.NoError(t, err)
	preEnable := TopUp{
		UserId: invitee.Id, Amount: 1, Money: 1, TradeNo: "same-second-before-enable",
		PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay,
		CreateTime: now, Status: common.TopUpStatusPending,
	}
	require.NoError(t, InsertOnlineTopUp(&preEnable, baseQuota, CashbackRequestMetadata{}))
	var preEnableContext CashbackOrderContext
	require.NoError(t, DB.Where("top_up_id = ?", preEnable.Id).First(&preEnableContext).Error)
	assert.False(t, preEnableContext.EligibleAfterFirstEnable)

	saveCashbackTestSetting(t, now)
	alreadyDone, err := RechargeEpay(preEnable.TradeNo, "alipay", "127.0.0.1")
	require.NoError(t, err)
	assert.False(t, alreadyDone)
	var rewardCount int64
	require.NoError(t, DB.Model(&CashbackReward{}).Where("top_up_id = ?", preEnable.Id).Count(&rewardCount).Error)
	assert.Zero(t, rewardCount)

	var creditedUser User
	require.NoError(t, DB.First(&creditedUser, invitee.Id).Error)
	assert.Equal(t, baseQuota, creditedUser.Quota)

	postEnable := TopUp{
		UserId: invitee.Id, Amount: 1, Money: 1, TradeNo: "same-second-after-enable",
		PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay,
		CreateTime: now, Status: common.TopUpStatusPending,
	}
	require.NoError(t, InsertOnlineTopUp(&postEnable, baseQuota, CashbackRequestMetadata{}))
	var postEnableContext CashbackOrderContext
	require.NoError(t, DB.Where("top_up_id = ?", postEnable.Id).First(&postEnableContext).Error)
	assert.True(t, postEnableContext.EligibleAfterFirstEnable)
}

func TestCompleteTopUpCreatesIndependentSnapshotRewardsAndSettlesOnce(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	setting := saveCashbackTestSetting(t, now-4*24*60*60)
	inviter, invitee := createCashbackUsers(t, now-30*24*60*60)
	topUp := createCompletedCashbackTopUp(t, invitee, now-3*24*60*60, now-2*24*60*60, 100_000, 120_000)

	var rewards []CashbackReward
	require.NoError(t, DB.Where("top_up_id = ?", topUp.Id).Order("direction asc").Find(&rewards).Error)
	require.Len(t, rewards, 2)
	byDirection := map[CashbackDirection]CashbackReward{}
	for _, reward := range rewards {
		byDirection[reward.Direction] = reward
		assert.Equal(t, setting.Version, reward.ConfigVersion)
		assert.Equal(t, 100_000, reward.BaseQuota)
		assert.Equal(t, now-2*24*60*60+7*24*60*60, reward.AvailableAt)
		assert.Contains(t, reward.ConfigSnapshot, `"inviter_rate_bps":1000`)
		assert.NotEmpty(t, reward.RiskSnapshot)
	}
	assert.Equal(t, 10_000, byDirection[CashbackDirectionInviter].CalculatedQuota)
	assert.Equal(t, inviter.Id, byDirection[CashbackDirectionInviter].BeneficiaryID)
	assert.Equal(t, 5_000, byDirection[CashbackDirectionInvitee].CalculatedQuota)
	assert.Equal(t, invitee.Id, byDirection[CashbackDirectionInvitee].BeneficiaryID)

	for _, reward := range rewards {
		review, err := ReviewCashbackReward(reward.ID, CashbackReviewActionApprove, "reviewed risk evidence", 999, reward.AvailableAt)
		require.NoError(t, err)
		assert.True(t, review.Issued)
		outcome, err := IssueCashbackReward(reward.ID, reward.AvailableAt+1)
		require.NoError(t, err)
		assert.True(t, outcome.Skipped)
	}

	var updatedInviter, updatedInvitee User
	require.NoError(t, DB.First(&updatedInviter, inviter.Id).Error)
	require.NoError(t, DB.First(&updatedInvitee, invitee.Id).Error)
	assert.Equal(t, 10_000, updatedInviter.Quota)
	assert.Equal(t, 125_000, updatedInvitee.Quota)
	var creditLogCount int64
	require.NoError(t, LOG_DB.Model(&Log{}).
		Where("other LIKE ?", `%"action":"cashback.reward_credited"%`).
		Count(&creditLogCount).Error)
	assert.EqualValues(t, 2, creditLogCount)
	var issueMutationCount int64
	require.NoError(t, DB.Model(&CashbackQuotaMutation{}).Where("kind = ?", CashbackQuotaMutationIssue).Count(&issueMutationCount).Error)
	assert.EqualValues(t, 2, issueMutationCount)
	summary, err := GetCashbackAdminSummary()
	require.NoError(t, err)
	assert.EqualValues(t, 15_000, summary.IssuedQuota)
	assert.Zero(t, summary.ReconciliationIssues)
	assert.NotNil(t, summary.InviterClusters)
	assert.NotNil(t, summary.DeviceClusters)
}

func TestCashbackIssuanceInvalidatesCacheUntilCommittedBalanceCanRehydrate(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-100)
	inviter, invitee := createCashbackUsers(t, now-30*24*60*60)
	order := createCompletedCashbackTopUp(t, invitee, now, now, 100_000, 100_000)
	var reward CashbackReward
	require.NoError(t, DB.Where("top_up_id = ? AND direction = ?", order.Id, CashbackDirectionInviter).First(&reward).Error)
	_, err := ReviewCashbackReward(reward.ID, CashbackReviewActionApprove, "reviewed", 999, now)
	require.NoError(t, err)

	redisServer := useUserCacheMiniRedis(t)
	var inviterRow User
	require.NoError(t, DB.First(&inviterRow, inviter.Id).Error)
	require.NoError(t, writeUserCache(inviterRow.ToBaseUser(), true))
	outcome, err := IssueCashbackReward(reward.ID, reward.AvailableAt)
	require.NoError(t, err)
	assert.True(t, outcome.Issued)
	require.NoError(t, DB.First(&inviterRow, inviter.Id).Error)
	assert.Equal(t, reward.RewardQuota, inviterRow.Quota)
	_, err = cacheGetUserBase(inviter.Id)
	assert.ErrorIs(t, err, ErrUserQuotaMutationPending)
	assert.False(t, redisServer.Exists(getUserCacheKey(inviter.Id)))

	duplicate, err := IssueCashbackReward(reward.ID, reward.AvailableAt+1)
	require.NoError(t, err)
	assert.True(t, duplicate.Skipped)
	redisServer.FastForward(time.Duration(userQuotaMutationCooldownSeconds()+1) * time.Second)
	cached, err := GetUserCache(inviter.Id)
	require.NoError(t, err)
	assert.Equal(t, inviterRow.Quota, cached.Quota)
}

func TestCashbackIssuanceFailsClosedWhenRedisIsUnavailable(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-100)
	inviter, invitee := createCashbackUsers(t, now-30*24*60*60)
	order := createCompletedCashbackTopUp(t, invitee, now, now, 100_000, 100_000)
	var reward CashbackReward
	require.NoError(t, DB.Where("top_up_id = ? AND direction = ?", order.Id, CashbackDirectionInviter).First(&reward).Error)
	_, err := ReviewCashbackReward(reward.ID, CashbackReviewActionApprove, "reviewed", 999, now)
	require.NoError(t, err)

	redisServer := useUserCacheMiniRedis(t)
	redisServer.Close()
	_, err = IssueCashbackReward(reward.ID, reward.AvailableAt)
	assert.Error(t, err)
	var storedReward CashbackReward
	require.NoError(t, DB.First(&storedReward, reward.ID).Error)
	assert.Equal(t, CashbackSettlementFrozen, storedReward.SettlementStatus)
	assert.NotEmpty(t, storedReward.LastSettlementError)
	assert.Equal(t, reward.AvailableAt+cashbackSettlementRetryDelaySeconds, storedReward.NextSettlementAttemptAt)
	var storedInviter User
	require.NoError(t, DB.First(&storedInviter, inviter.Id).Error)
	assert.Zero(t, storedInviter.Quota)
}

func TestCashbackIssuanceRecordsLostFenceAndRollsBackMoney(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-100)
	inviter, invitee := createCashbackUsers(t, now-30*24*60*60)
	order := createCompletedCashbackTopUp(t, invitee, now, now, 100_000, 100_000)
	var reward CashbackReward
	require.NoError(t, DB.Where("top_up_id = ? AND direction = ?", order.Id, CashbackDirectionInviter).First(&reward).Error)
	_, err := ReviewCashbackReward(reward.ID, CashbackReviewActionApprove, "reviewed", 999, now)
	require.NoError(t, err)

	useUserCacheMiniRedis(t)
	callbackName := "test:cashback-fence-lost"
	require.NoError(t, DB.Callback().Update().After("gorm:update").Register(callbackName, func(tx *gorm.DB) {
		if tx.Statement.Table == "cashback_rewards" {
			_ = common.RDB.Del(t.Context(), getUserQuotaMutationFenceKey(inviter.Id)).Err()
		}
	}))
	callbackRegistered := true
	t.Cleanup(func() {
		if callbackRegistered {
			_ = DB.Callback().Update().Remove(callbackName)
		}
	})

	_, err = IssueCashbackReward(reward.ID, reward.AvailableAt)
	assert.ErrorIs(t, err, ErrUserQuotaMutationFenceLost)
	require.NoError(t, DB.Callback().Update().Remove(callbackName))
	callbackRegistered = false

	var storedReward CashbackReward
	require.NoError(t, DB.First(&storedReward, reward.ID).Error)
	assert.Equal(t, CashbackSettlementFrozen, storedReward.SettlementStatus)
	assert.Contains(t, storedReward.LastSettlementError, ErrUserQuotaMutationFenceLost.Error())
	assert.Equal(t, reward.AvailableAt+cashbackSettlementRetryDelaySeconds, storedReward.NextSettlementAttemptAt)
	var storedInviter User
	require.NoError(t, DB.First(&storedInviter, inviter.Id).Error)
	assert.Zero(t, storedInviter.Quota)
	var mutationCount int64
	require.NoError(t, DB.Model(&CashbackQuotaMutation{}).Where("reward_id = ?", reward.ID).Count(&mutationCount).Error)
	assert.Zero(t, mutationCount)
}

func TestCashbackIssuanceSkipsIneligibleWithoutSettlementError(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-100)
	_, invitee := createCashbackUsers(t, now-30*24*60*60)
	order := createCompletedCashbackTopUp(t, invitee, now, now, 100_000, 100_000)
	var reward CashbackReward
	require.NoError(t, DB.Where("top_up_id = ? AND direction = ?", order.Id, CashbackDirectionInviter).First(&reward).Error)

	redisServer := useUserCacheMiniRedis(t)
	redisServer.Close()
	outcome, err := IssueCashbackReward(reward.ID, reward.AvailableAt)
	require.NoError(t, err)
	assert.True(t, outcome.Skipped)
	var stored CashbackReward
	require.NoError(t, DB.First(&stored, reward.ID).Error)
	assert.Empty(t, stored.LastSettlementError)
	assert.Zero(t, stored.NextSettlementAttemptAt)

	_, err = ReviewCashbackReward(reward.ID, CashbackReviewActionApprove, "reviewed", 999, now)
	require.NoError(t, err)
	outcome, err = IssueCashbackReward(reward.ID, now)
	require.NoError(t, err)
	assert.True(t, outcome.Skipped)
	require.NoError(t, DB.First(&stored, reward.ID).Error)
	assert.Empty(t, stored.LastSettlementError)
	assert.Zero(t, stored.NextSettlementAttemptAt)
}

func TestCashbackReviewRecordsFenceFailureForApprovedMatureReward(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-100)
	_, invitee := createCashbackUsers(t, now-30*24*60*60)
	order := createCompletedCashbackTopUp(t, invitee, now, now, 100_000, 100_000)
	var reward CashbackReward
	require.NoError(t, DB.Where("top_up_id = ? AND direction = ?", order.Id, CashbackDirectionInviter).First(&reward).Error)
	_, err := ReviewCashbackReward(reward.ID, CashbackReviewActionApprove, "reviewed", 999, now)
	require.NoError(t, err)

	redisServer := useUserCacheMiniRedis(t)
	redisServer.Close()
	_, err = ReviewCashbackReward(reward.ID, CashbackReviewActionApprove, "retry mature approval", 999, reward.AvailableAt)
	assert.Error(t, err)

	var stored CashbackReward
	require.NoError(t, DB.First(&stored, reward.ID).Error)
	assert.Equal(t, CashbackReviewApproved, stored.ReviewStatus)
	assert.Equal(t, CashbackSettlementFrozen, stored.SettlementStatus)
	assert.NotEmpty(t, stored.LastSettlementError)
	assert.Equal(t, reward.AvailableAt+cashbackSettlementRetryDelaySeconds, stored.NextSettlementAttemptAt)
}

func TestCashbackInvalidReviewDoesNotFabricateSettlementFailure(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-100)
	_, invitee := createCashbackUsers(t, now-30*24*60*60)
	order := createCompletedCashbackTopUp(t, invitee, now, now, 100_000, 100_000)
	var reward CashbackReward
	require.NoError(t, DB.Where("top_up_id = ? AND direction = ?", order.Id, CashbackDirectionInviter).First(&reward).Error)
	_, err := ReviewCashbackReward(reward.ID, CashbackReviewActionApprove, "reviewed", 999, now)
	require.NoError(t, err)

	_, err = ReviewCashbackReward(reward.ID, CashbackReviewActionReject, "invalid rejection", 999, reward.AvailableAt)
	assert.ErrorIs(t, err, ErrCashbackInvalidState)

	var stored CashbackReward
	require.NoError(t, DB.First(&stored, reward.ID).Error)
	assert.Equal(t, CashbackReviewApproved, stored.ReviewStatus)
	assert.Equal(t, CashbackSettlementFrozen, stored.SettlementStatus)
	assert.Empty(t, stored.LastSettlementError)
	assert.Zero(t, stored.NextSettlementAttemptAt)
}

func TestCashbackIssuanceRollsBackWhenMutationEvidenceFails(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-100)
	inviter, invitee := createCashbackUsers(t, now-30*24*60*60)
	order := createCompletedCashbackTopUp(t, invitee, now, now, 100_000, 100_000)
	var reward CashbackReward
	require.NoError(t, DB.Where("top_up_id = ? AND direction = ?", order.Id, CashbackDirectionInviter).First(&reward).Error)
	_, err := ReviewCashbackReward(reward.ID, CashbackReviewActionApprove, "reviewed", 999, now)
	require.NoError(t, err)

	forcedErr := errors.New("forced cashback ledger failure")
	callbackName := "test:cashback-ledger-rollback"
	require.NoError(t, DB.Callback().Create().Before("gorm:create").Register(callbackName, func(tx *gorm.DB) {
		if tx.Statement.Table == "cashback_quota_mutations" {
			tx.AddError(forcedErr)
		}
	}))
	callbackRegistered := true
	t.Cleanup(func() {
		if callbackRegistered {
			_ = DB.Callback().Create().Remove(callbackName)
		}
	})

	_, err = IssueCashbackReward(reward.ID, reward.AvailableAt)
	assert.ErrorIs(t, err, forcedErr)
	require.NoError(t, DB.Callback().Create().Remove(callbackName))
	callbackRegistered = false

	var storedReward CashbackReward
	require.NoError(t, DB.First(&storedReward, reward.ID).Error)
	assert.Equal(t, CashbackSettlementFrozen, storedReward.SettlementStatus)
	assert.Contains(t, storedReward.LastSettlementError, forcedErr.Error())
	var storedInviter User
	require.NoError(t, DB.First(&storedInviter, inviter.Id).Error)
	assert.Zero(t, storedInviter.Quota)
	var mutationCount int64
	require.NoError(t, DB.Model(&CashbackQuotaMutation{}).Where("reward_id = ?", reward.ID).Count(&mutationCount).Error)
	assert.Zero(t, mutationCount)
}

func TestCashbackReconciliationStopsSettlementOnLedgerMismatch(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-100)
	_, invitee := createCashbackUsers(t, now-30*24*60*60)
	order := createCompletedCashbackTopUp(t, invitee, now, now, 100_000, 100_000)
	var reward CashbackReward
	require.NoError(t, DB.Where("top_up_id = ?", order.Id).First(&reward).Error)
	_, err := ReviewCashbackReward(reward.ID, CashbackReviewActionApprove, "reviewed", 999, reward.AvailableAt)
	require.NoError(t, err)

	var mutation CashbackQuotaMutation
	require.NoError(t, DB.Where("reward_id = ? AND kind = ?", reward.ID, CashbackQuotaMutationIssue).First(&mutation).Error)
	require.NoError(t, DB.Session(&gorm.Session{SkipHooks: true}).Model(&CashbackQuotaMutation{}).Where("id = ?", mutation.ID).Update("quota", mutation.Quota+1).Error)
	inconsistencies, err := CashbackReconciliationInconsistencyCount()
	require.NoError(t, err)
	assert.Positive(t, inconsistencies)
	_, err = SettleMaturedCashbackRewards(reward.AvailableAt+1, 100)
	assert.ErrorContains(t, err, "cashback reconciliation found")
}

func TestMatureCashbackApprovalStopsOnReconciliationMismatch(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-100)
	inviter, invitee := createCashbackUsers(t, now-30*24*60*60)
	order := createCompletedCashbackTopUp(t, invitee, now, now, 100_000, 100_000)
	var reward CashbackReward
	require.NoError(t, DB.Where("top_up_id = ? AND direction = ?", order.Id, CashbackDirectionInviter).First(&reward).Error)

	inconsistent := CashbackReward{
		TopUpID: order.Id + 10_000, TradeNo: "reconciliation-blocks-manual-approval", Direction: CashbackDirectionInvitee,
		InviteeID: invitee.Id, InviterID: inviter.Id, BeneficiaryID: invitee.Id, BaseQuota: 100, RateBPS: 100,
		CalculatedQuota: 1, RewardQuota: 1, SettlementDays: 7, PaidAt: now,
		AvailableAt: now, ReviewStatus: CashbackReviewPending, SettlementStatus: CashbackSettlementFrozen,
		RiskLevel: CashbackRiskLow, RiskSnapshot: `{}`, ConfigSnapshot: `{}`, RecoveredQuota: 2,
	}
	require.NoError(t, DB.Session(&gorm.Session{SkipHooks: true}).Create(&inconsistent).Error)

	_, err := ReviewCashbackReward(reward.ID, CashbackReviewActionApprove, "reviewed", 999, reward.AvailableAt)
	require.ErrorContains(t, err, "cashback reconciliation found")
	assert.Zero(t, cashbackReconciliationProgress.RewardID, "the inconsistent page must remain pinned")

	var storedReward CashbackReward
	require.NoError(t, DB.First(&storedReward, reward.ID).Error)
	assert.Equal(t, CashbackReviewPending, storedReward.ReviewStatus)
	assert.Equal(t, CashbackSettlementFrozen, storedReward.SettlementStatus)
	var storedInviter User
	require.NoError(t, DB.First(&storedInviter, inviter.Id).Error)
	assert.Zero(t, storedInviter.Quota)
	var mutationCount int64
	require.NoError(t, DB.Model(&CashbackQuotaMutation{}).Where("reward_id = ?", reward.ID).Count(&mutationCount).Error)
	assert.Zero(t, mutationCount)
}

func TestCashbackReconciliationAdvancesInBoundedBatchesAndPinsMismatch(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	rewards := make([]CashbackReward, 0, cashbackReconciliationBatchSize+1)
	for i := 0; i < cashbackReconciliationBatchSize+1; i++ {
		reward := CashbackReward{
			TopUpID: i + 1, TradeNo: fmt.Sprintf("reconcile-%d", i+1), Direction: CashbackDirectionInvitee,
			InviteeID: 2, InviterID: 1, BeneficiaryID: 2, BaseQuota: 100, RateBPS: 100,
			CalculatedQuota: 1, RewardQuota: 1, SettlementDays: 7, PaidAt: now,
			AvailableAt: now + 7*24*60*60, ReviewStatus: CashbackReviewPending,
			SettlementStatus: CashbackSettlementFrozen, RiskLevel: CashbackRiskLow,
			RiskSnapshot: `{}`, ConfigSnapshot: `{}`,
		}
		if i == cashbackReconciliationBatchSize {
			reward.RecoveredQuota = 2
		}
		rewards = append(rewards, reward)
	}
	require.NoError(t, DB.Session(&gorm.Session{SkipHooks: true}).Create(&rewards).Error)

	issues, err := CashbackReconciliationInconsistencyCount()
	require.NoError(t, err)
	assert.Zero(t, issues)
	assert.Equal(t, rewards[cashbackReconciliationBatchSize-1].ID, cashbackReconciliationProgress.RewardID)

	issues, err = CashbackReconciliationInconsistencyCount()
	require.NoError(t, err)
	assert.EqualValues(t, 1, issues)
	assert.Equal(t, rewards[cashbackReconciliationBatchSize-1].ID, cashbackReconciliationProgress.RewardID, "a mismatched page must remain pinned until repaired")

	issues, err = CashbackReconciliationInconsistencyCount()
	require.NoError(t, err)
	assert.EqualValues(t, 1, issues)
}

func TestConcurrentCashbackSettlementCreditsAtMostOnce(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-100)
	inviter, invitee := createCashbackUsers(t, now-30*24*60*60)
	order := createCompletedCashbackTopUp(t, invitee, now, now, 100_000, 100_000)
	var reward CashbackReward
	require.NoError(t, DB.Where("top_up_id = ? AND direction = ?", order.Id, CashbackDirectionInviter).First(&reward).Error)
	_, err := ReviewCashbackReward(reward.ID, CashbackReviewActionApprove, "reviewed", 999, now)
	require.NoError(t, err)
	due, err := HasMaturedCashbackRewards(reward.AvailableAt)
	require.NoError(t, err)
	assert.True(t, due)

	outcomes := make(chan CashbackSettlementOutcome, 2)
	errorsChannel := make(chan error, 2)
	var waitGroup sync.WaitGroup
	for range 2 {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			outcome, issueErr := IssueCashbackReward(reward.ID, reward.AvailableAt)
			outcomes <- outcome
			errorsChannel <- issueErr
		}()
	}
	waitGroup.Wait()
	close(outcomes)
	close(errorsChannel)

	issuedCount := 0
	for outcome := range outcomes {
		if outcome.Issued {
			issuedCount++
		}
	}
	assert.LessOrEqual(t, issuedCount, 1)
	successfulCalls := 0
	for issueErr := range errorsChannel {
		if issueErr == nil {
			successfulCalls++
		}
	}
	// SQLite can abort both competing writers with SQLITE_LOCKED. The durable
	// frozen state must remain retryable and still issue exactly once.
	if successfulCalls == 0 {
		outcome, retryErr := IssueCashbackReward(reward.ID, reward.AvailableAt)
		require.NoError(t, retryErr)
		if outcome.Issued {
			issuedCount++
		}
	}
	assert.Equal(t, 1, issuedCount)
	var updatedInviter User
	require.NoError(t, DB.First(&updatedInviter, inviter.Id).Error)
	assert.Equal(t, reward.RewardQuota, updatedInviter.Quota)
	var stored CashbackReward
	require.NoError(t, DB.First(&stored, reward.ID).Error)
	assert.Equal(t, CashbackSettlementIssued, stored.SettlementStatus)
	due, err = HasMaturedCashbackRewards(reward.AvailableAt)
	require.NoError(t, err)
	assert.False(t, due)
}

func TestBlockedSettlementDefersAndRetriesAfterRelationshipIsRestored(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-100)
	inviter, invitee := createCashbackUsers(t, now-30*24*60*60)
	order := createCompletedCashbackTopUp(t, invitee, now, now, 100_000, 100_000)
	var reward CashbackReward
	require.NoError(t, DB.Where("top_up_id = ? AND direction = ?", order.Id, CashbackDirectionInviter).First(&reward).Error)
	_, err := ReviewCashbackReward(reward.ID, CashbackReviewActionApprove, "approved", 999, now)
	require.NoError(t, err)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", invitee.Id).Update("inviter_id", 0).Error)

	outcome, err := IssueCashbackReward(reward.ID, reward.AvailableAt)
	require.NoError(t, err)
	assert.True(t, outcome.Blocked)
	require.NoError(t, DB.First(&reward, reward.ID).Error)
	assert.Equal(t, "referral_relationship_changed", reward.BlockingReason)
	assert.Greater(t, reward.NextSettlementAttemptAt, reward.AvailableAt)
	due, err := HasMaturedCashbackRewards(reward.AvailableAt)
	require.NoError(t, err)
	assert.False(t, due)

	require.NoError(t, DB.Model(&User{}).Where("id = ?", invitee.Id).Update("inviter_id", inviter.Id).Error)
	outcome, err = IssueCashbackReward(reward.ID, reward.NextSettlementAttemptAt)
	require.NoError(t, err)
	assert.True(t, outcome.Issued)
	var updatedInviter User
	require.NoError(t, DB.First(&updatedInviter, inviter.Id).Error)
	assert.Equal(t, reward.RewardQuota, updatedInviter.Quota)
}

func TestCashbackReviewCannotOverrideChangedReferralRelationship(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-100)
	_, invitee := createCashbackUsers(t, now-30*24*60*60)
	order := createCompletedCashbackTopUp(t, invitee, now, now, 100_000, 100_000)
	var reward CashbackReward
	require.NoError(t, DB.Where("top_up_id = ?", order.Id).First(&reward).Error)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", invitee.Id).Update("inviter_id", 0).Error)

	_, err := ReviewCashbackReward(reward.ID, CashbackReviewActionApprove, "attempted override", 999, reward.AvailableAt)
	assert.ErrorIs(t, err, ErrCashbackHardBlocked)
	require.NoError(t, DB.First(&reward, reward.ID).Error)
	assert.Equal(t, CashbackReviewPending, reward.ReviewStatus)
	assert.Equal(t, "referral_relationship_changed", reward.BlockingReason)
	assert.Greater(t, reward.NextSettlementAttemptAt, reward.AvailableAt)
}

func TestCashbackIncidentIsMonotonicIdempotentAndCreatesDebt(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-4*24*60*60)
	inviter, invitee := createCashbackUsers(t, now-30*24*60*60)
	topUp := createCompletedCashbackTopUp(t, invitee, now-3*24*60*60, now-2*24*60*60, 100_000, 100_000)

	var rewards []CashbackReward
	require.NoError(t, DB.Where("top_up_id = ?", topUp.Id).Find(&rewards).Error)
	for _, reward := range rewards {
		_, err := ReviewCashbackReward(reward.ID, CashbackReviewActionApprove, "approved", 999, reward.AvailableAt)
		require.NoError(t, err)
	}
	first, err := HandleCashbackIncident(topUp.Id, CashbackIncidentInput{
		Kind: CashbackIncidentRefund, CumulativeRefundRateBPS: 5_000, Reason: "provider refund evidence", OperatorID: 999, Now: now,
	})
	require.NoError(t, err)
	assert.Equal(t, 15_000, first.RewardRecoveredQuota)
	assert.Equal(t, 50_000, first.PrincipalRecoveredNow)
	assert.Zero(t, first.RewardDebtQuota)
	var recoveredLedgerQuota int64
	require.NoError(t, DB.Model(&CashbackQuotaMutation{}).
		Where("kind IN ?", []CashbackQuotaMutationKind{CashbackQuotaMutationRewardRecovery, CashbackQuotaMutationPrincipalRecovery}).
		Select("COALESCE(SUM(quota), 0)").Scan(&recoveredLedgerQuota).Error)
	assert.EqualValues(t, 65_000, recoveredLedgerQuota)
	assert.Zero(t, first.PrincipalDebtQuota)

	var afterFirst User
	require.NoError(t, DB.First(&afterFirst, invitee.Id).Error)
	firstQuota := afterFirst.Quota
	duplicate, err := HandleCashbackIncident(topUp.Id, CashbackIncidentInput{
		Kind: CashbackIncidentRefund, CumulativeRefundRateBPS: 5_000, Reason: "duplicate callback", OperatorID: 999, Now: now + 1,
	})
	require.NoError(t, err)
	assert.True(t, duplicate.Idempotent)
	require.NoError(t, DB.First(&afterFirst, invitee.Id).Error)
	assert.Equal(t, firstQuota, afterFirst.Quota)

	require.NoError(t, DB.Model(&User{}).Where("id = ?", invitee.Id).Update("quota", 25_000).Error)
	full, err := HandleCashbackIncident(topUp.Id, CashbackIncidentInput{
		Kind: CashbackIncidentRefund, CumulativeRefundRateBPS: 10_000, Reason: "refund increased to full", OperatorID: 999, Now: now + 2,
	})
	require.NoError(t, err)
	assert.Equal(t, 25_000, full.PrincipalRecoveredNow)
	assert.Equal(t, 25_000, full.PrincipalDebtQuota)

	_, err = HandleCashbackIncident(topUp.Id, CashbackIncidentInput{
		Kind: CashbackIncidentRefund, CumulativeRefundRateBPS: 9_000, Reason: "invalid rollback", OperatorID: 999, Now: now + 3,
	})
	assert.ErrorIs(t, err, ErrCashbackRefundRate)

	resolved, err := ResolveCashbackPrincipalDebt(topUp.Id, 999, "approved accounting write-off", now+4)
	require.NoError(t, err)
	assert.Zero(t, resolved.PrincipalOutstandingDebtQuota)

	var inviterAfter User
	require.NoError(t, DB.First(&inviterAfter, inviter.Id).Error)
	assert.Zero(t, inviterAfter.Quota)
}

func TestIncreasingRefundReopensResolvedPrincipalDebt(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-100)
	_, invitee := createCashbackUsers(t, now-30*24*60*60)
	topUp := createCompletedCashbackTopUp(t, invitee, now, now, 100_000, 100_000)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", invitee.Id).Update("quota", 0).Error)

	first, err := HandleCashbackIncident(topUp.Id, CashbackIncidentInput{
		Kind: CashbackIncidentRefund, CumulativeRefundRateBPS: 5_000,
		Reason: "first partial refund", OperatorID: 999, Now: now + 1,
	})
	require.NoError(t, err)
	assert.Equal(t, 50_000, first.PrincipalDebtQuota)
	resolved, err := ResolveCashbackPrincipalDebt(topUp.Id, 999, "first debt disposition", now+2)
	require.NoError(t, err)
	assert.NotZero(t, resolved.PrincipalDebtResolvedAt)

	increased, err := HandleCashbackIncident(topUp.Id, CashbackIncidentInput{
		Kind: CashbackIncidentRefund, CumulativeRefundRateBPS: 10_000,
		Reason: "refund increased to full", OperatorID: 999, Now: now + 3,
	})
	require.NoError(t, err)
	assert.Equal(t, 50_000, increased.PrincipalDebtQuota)
	assert.Zero(t, increased.OrderContext.PrincipalDebtResolvedAt)
	assert.Zero(t, increased.OrderContext.PrincipalDebtResolvedBy)
	assert.Empty(t, increased.OrderContext.PrincipalDebtResolutionReason)
}

func TestCashbackIncidentUsesAuthoritativeCachedQuotaAndTracksDebt(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-100)
	inviter, invitee := createCashbackUsers(t, now-30*24*60*60)
	topUp := createCompletedCashbackTopUp(t, invitee, now, now, 100_000, 100_000)
	var rewards []CashbackReward
	require.NoError(t, DB.Where("top_up_id = ?", topUp.Id).Find(&rewards).Error)
	for _, reward := range rewards {
		_, err := ReviewCashbackReward(reward.ID, CashbackReviewActionApprove, "approved", 999, reward.AvailableAt)
		require.NoError(t, err)
	}

	redisServer := useUserCacheMiniRedis(t)
	var inviterRow, inviteeRow User
	require.NoError(t, DB.First(&inviterRow, inviter.Id).Error)
	require.NoError(t, DB.First(&inviteeRow, invitee.Id).Error)
	inviterRow.Quota = 5_000
	inviteeRow.Quota = 20_000
	require.NoError(t, writeUserCache(inviterRow.ToBaseUser(), true))
	require.NoError(t, writeUserCache(inviteeRow.ToBaseUser(), true))

	result, err := HandleCashbackIncident(topUp.Id, CashbackIncidentInput{
		Kind: CashbackIncidentRefund, CumulativeRefundRateBPS: 10_000,
		Reason: "full refund with pending cached consumption", OperatorID: 999, Now: now + 1,
	})
	require.NoError(t, err)
	assert.Equal(t, 10_000, result.RewardRecoveredQuota)
	assert.Equal(t, 5_000, result.RewardDebtQuota)
	assert.Equal(t, 15_000, result.PrincipalRecoveredNow)
	assert.Equal(t, 85_000, result.PrincipalDebtQuota)

	require.NoError(t, DB.First(&inviterRow, inviter.Id).Error)
	require.NoError(t, DB.First(&inviteeRow, invitee.Id).Error)
	assert.Equal(t, 5_000, inviterRow.Quota)
	assert.Equal(t, 85_000, inviteeRow.Quota)
	_, err = cacheGetUserBase(inviter.Id)
	assert.ErrorIs(t, err, ErrUserQuotaMutationPending)
	_, err = cacheGetUserBase(invitee.Id)
	assert.ErrorIs(t, err, ErrUserQuotaMutationPending)
	assert.False(t, redisServer.Exists(getUserCacheKey(inviter.Id)))
	assert.False(t, redisServer.Exists(getUserCacheKey(invitee.Id)))
	redisServer.FastForward(time.Duration(userQuotaMutationCooldownSeconds()+1) * time.Second)
	inviterCache, err := GetUserCache(inviter.Id)
	require.NoError(t, err)
	inviteeCache, err := GetUserCache(invitee.Id)
	require.NoError(t, err)
	assert.Equal(t, 5_000, inviterCache.Quota)
	assert.Equal(t, 85_000, inviteeCache.Quota)
}

func TestCashbackIncidentWaitsForPendingPositiveBatchQuota(t *testing.T) {
	for _, testCase := range []struct {
		name                string
		populateInviteeHash bool
	}{
		{name: "cached", populateInviteeHash: true},
		{name: "cold_cache", populateInviteeHash: false},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			setupCashbackTestDB(t)
			resetBatchUpdateTestState(t)
			now := time.Now().Unix()
			saveCashbackTestSetting(t, now-100)
			inviter, invitee := createCashbackUsers(t, now-30*24*60*60)
			topUp := createCompletedCashbackTopUp(t, invitee, now, now, 100_000, 100_000)
			var rewards []CashbackReward
			require.NoError(t, DB.Where("top_up_id = ?", topUp.Id).Order("id asc").Find(&rewards).Error)
			for _, reward := range rewards {
				_, err := ReviewCashbackReward(reward.ID, CashbackReviewActionApprove, "approved", 999, reward.AvailableAt)
				require.NoError(t, err)
			}

			redisServer := useUserCacheMiniRedis(t)
			var inviterRow, inviteeRow User
			require.NoError(t, DB.First(&inviterRow, inviter.Id).Error)
			require.NoError(t, DB.Model(&User{}).Where("id = ?", invitee.Id).Update("quota", 0).Error)
			require.NoError(t, DB.First(&inviteeRow, invitee.Id).Error)
			require.NoError(t, writeUserCache(inviterRow.ToBaseUser(), true))
			if testCase.populateInviteeHash {
				pendingInvitee := inviteeRow
				pendingInvitee.Quota = 5_000
				require.NoError(t, writeUserCache(pendingInvitee.ToBaseUser(), true))
			}
			common.BatchUpdateEnabled = true
			addNewRecord(BatchUpdateTypeUserQuota, invitee.Id, 5_000)

			_, err := HandleCashbackIncident(topUp.Id, CashbackIncidentInput{
				Kind: CashbackIncidentRefund, CumulativeRefundRateBPS: 10_000,
				Reason: "wait for positive batch quota", OperatorID: 999, Now: now + 1,
			})
			assert.ErrorIs(t, err, ErrUserQuotaMutationPending)

			var orderContext CashbackOrderContext
			require.NoError(t, DB.Where("top_up_id = ?", topUp.Id).First(&orderContext).Error)
			assert.Empty(t, orderContext.IncidentKind)
			assert.Zero(t, orderContext.PrincipalRecoveredQuota)
			assert.Zero(t, orderContext.PrincipalOutstandingDebtQuota)
			var recoveryMutationCount int64
			require.NoError(t, DB.Model(&CashbackQuotaMutation{}).
				Where("kind IN ?", []CashbackQuotaMutationKind{CashbackQuotaMutationRewardRecovery, CashbackQuotaMutationPrincipalRecovery}).
				Count(&recoveryMutationCount).Error)
			assert.Zero(t, recoveryMutationCount)
			for _, reward := range rewards {
				var stored CashbackReward
				require.NoError(t, DB.First(&stored, reward.ID).Error)
				assert.Equal(t, CashbackSettlementIssued, stored.SettlementStatus)
				assert.Zero(t, stored.RecoveredQuota)
				assert.Zero(t, stored.OutstandingDebtQuota)
			}

			batchUpdate()
			assert.Equal(t, 5_000, getUserQuotaFromDB(t, invitee.Id))
			redisServer.FastForward(time.Duration(userQuotaMutationCooldownSeconds()+1) * time.Second)

			result, err := HandleCashbackIncident(topUp.Id, CashbackIncidentInput{
				Kind: CashbackIncidentRefund, CumulativeRefundRateBPS: 10_000,
				Reason: "retry after positive batch quota flush", OperatorID: 999, Now: now + 2,
			})
			require.NoError(t, err)
			assert.Equal(t, 15_000, result.RewardRecoveredQuota)
			assert.Zero(t, result.RewardDebtQuota)
			assert.Zero(t, result.PrincipalRecoveredNow)
			assert.Equal(t, 100_000, result.PrincipalDebtQuota)
			assert.Zero(t, getUserQuotaFromDB(t, inviter.Id))
			assert.Zero(t, getUserQuotaFromDB(t, invitee.Id))
		})
	}
}

func TestCashbackIncidentLostFenceInvalidatesRolledBackCacheDebit(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-100)
	inviter, invitee := createCashbackUsers(t, now-30*24*60*60)
	topUp := createCompletedCashbackTopUp(t, invitee, now, now, 100_000, 100_000)
	var rewards []CashbackReward
	require.NoError(t, DB.Where("top_up_id = ?", topUp.Id).Order("id asc").Find(&rewards).Error)
	for _, reward := range rewards {
		_, err := ReviewCashbackReward(reward.ID, CashbackReviewActionApprove, "approved", 999, reward.AvailableAt)
		require.NoError(t, err)
	}

	redisServer := useUserCacheMiniRedis(t)
	var inviterRow, inviteeRow User
	require.NoError(t, DB.First(&inviterRow, inviter.Id).Error)
	require.NoError(t, DB.First(&inviteeRow, invitee.Id).Error)
	require.NoError(t, writeUserCache(inviterRow.ToBaseUser(), true))
	require.NoError(t, writeUserCache(inviteeRow.ToBaseUser(), true))
	inviterQuotaBefore, inviteeQuotaBefore := inviterRow.Quota, inviteeRow.Quota

	const replacementOwner = "replacement-owner"
	callbackName := "test:cashback-incident-fence-lost"
	replaced := false
	require.NoError(t, DB.Callback().Update().After("gorm:update").Register(callbackName, func(tx *gorm.DB) {
		if !replaced && tx.Statement.Table == "cashback_rewards" {
			replaced = true
			_ = common.RDB.Set(t.Context(), getUserQuotaMutationFenceKey(inviter.Id), replacementOwner, time.Minute).Err()
		}
	}))
	callbackRegistered := true
	t.Cleanup(func() {
		if callbackRegistered {
			_ = DB.Callback().Update().Remove(callbackName)
		}
	})

	_, err := HandleCashbackIncident(topUp.Id, CashbackIncidentInput{
		Kind: CashbackIncidentRefund, CumulativeRefundRateBPS: 10_000,
		Reason: "lose incident fence ownership", OperatorID: 999, Now: now + 1,
	})
	assert.ErrorIs(t, err, ErrUserQuotaMutationFenceLost)
	require.NoError(t, DB.Callback().Update().Remove(callbackName))
	callbackRegistered = false

	require.NoError(t, DB.First(&inviterRow, inviter.Id).Error)
	require.NoError(t, DB.First(&inviteeRow, invitee.Id).Error)
	assert.Equal(t, inviterQuotaBefore, inviterRow.Quota)
	assert.Equal(t, inviteeQuotaBefore, inviteeRow.Quota)
	assert.False(t, redisServer.Exists(getUserCacheKey(inviter.Id)), "rolled-back cache debit must never remain readable")
	owner, ownerErr := common.RDB.Get(t.Context(), getUserQuotaMutationFenceKey(inviter.Id)).Result()
	require.NoError(t, ownerErr)
	assert.Equal(t, replacementOwner, owner, "finalization must not delete a replacement owner's fence")
	_, err = cacheGetUserBase(inviter.Id)
	assert.ErrorIs(t, err, ErrUserQuotaMutationPending)

	var orderContext CashbackOrderContext
	require.NoError(t, DB.Where("top_up_id = ?", topUp.Id).First(&orderContext).Error)
	assert.Empty(t, orderContext.IncidentKind)
	for _, reward := range rewards {
		var stored CashbackReward
		require.NoError(t, DB.First(&stored, reward.ID).Error)
		assert.Equal(t, CashbackSettlementIssued, stored.SettlementStatus)
		assert.Zero(t, stored.RecoveredQuota)
		assert.Zero(t, stored.OutstandingDebtQuota)
	}
	var recoveryMutationCount int64
	require.NoError(t, DB.Model(&CashbackQuotaMutation{}).
		Where("kind IN ?", []CashbackQuotaMutationKind{CashbackQuotaMutationRewardRecovery, CashbackQuotaMutationPrincipalRecovery}).
		Count(&recoveryMutationCount).Error)
	assert.Zero(t, recoveryMutationCount)
}

func TestCashbackIncidentRestoresCacheReservationWhenTransactionRollsBack(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-100)
	inviter, invitee := createCashbackUsers(t, now-30*24*60*60)
	topUp := createCompletedCashbackTopUp(t, invitee, now, now, 100_000, 100_000)
	var rewards []CashbackReward
	require.NoError(t, DB.Where("top_up_id = ?", topUp.Id).Find(&rewards).Error)
	for _, reward := range rewards {
		_, err := ReviewCashbackReward(reward.ID, CashbackReviewActionApprove, "approved", 999, reward.AvailableAt)
		require.NoError(t, err)
	}

	redisServer := useUserCacheMiniRedis(t)
	var inviterRow, inviteeRow User
	require.NoError(t, DB.First(&inviterRow, inviter.Id).Error)
	require.NoError(t, DB.First(&inviteeRow, invitee.Id).Error)
	require.NoError(t, writeUserCache(inviterRow.ToBaseUser(), true))
	require.NoError(t, writeUserCache(inviteeRow.ToBaseUser(), true))
	inviterQuotaBefore, inviteeQuotaBefore := inviterRow.Quota, inviteeRow.Quota

	forcedErr := errors.New("forced cashback reward update failure")
	callbackName := "test:cashback-incident-rollback"
	require.NoError(t, DB.Callback().Update().Before("gorm:update").Register(callbackName, func(tx *gorm.DB) {
		if tx.Statement.Table == "cashback_rewards" {
			tx.AddError(forcedErr)
		}
	}))
	callbackRegistered := true
	t.Cleanup(func() {
		if callbackRegistered {
			_ = DB.Callback().Update().Remove(callbackName)
		}
	})

	_, err := HandleCashbackIncident(topUp.Id, CashbackIncidentInput{
		Kind: CashbackIncidentRefund, CumulativeRefundRateBPS: 10_000,
		Reason: "force rollback", OperatorID: 999, Now: now + 1,
	})
	assert.ErrorIs(t, err, forcedErr)
	require.NoError(t, DB.Callback().Update().Remove(callbackName))
	callbackRegistered = false

	require.NoError(t, DB.First(&inviterRow, inviter.Id).Error)
	require.NoError(t, DB.First(&inviteeRow, invitee.Id).Error)
	assert.Equal(t, inviterQuotaBefore, inviterRow.Quota)
	assert.Equal(t, inviteeQuotaBefore, inviteeRow.Quota)
	_, err = cacheGetUserBase(inviter.Id)
	assert.ErrorIs(t, err, ErrUserQuotaMutationPending)
	_, err = cacheGetUserBase(invitee.Id)
	assert.ErrorIs(t, err, ErrUserQuotaMutationPending)
	redisServer.FastForward(time.Duration(userQuotaMutationCooldownSeconds()+1) * time.Second)
	inviterCache, err := GetUserCache(inviter.Id)
	require.NoError(t, err)
	inviteeCache, err := GetUserCache(invitee.Id)
	require.NoError(t, err)
	assert.Equal(t, inviterQuotaBefore, inviterCache.Quota)
	assert.Equal(t, inviteeQuotaBefore, inviteeCache.Quota)
	var orderContext CashbackOrderContext
	require.NoError(t, DB.Where("top_up_id = ?", topUp.Id).First(&orderContext).Error)
	assert.Empty(t, orderContext.IncidentKind)
}

func TestResolvingOneCashbackDebtKeepsBlockersUntilAllDebtIsClosed(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	inviter, invitee := createCashbackUsers(t, now-30*24*60*60)
	newReward := func(topUpID int, status CashbackSettlementStatus, debt int) CashbackReward {
		return CashbackReward{
			TopUpID: topUpID, TradeNo: fmt.Sprintf("debt-order-%d", topUpID),
			Direction: CashbackDirectionInvitee, InviteeID: invitee.Id, InviterID: inviter.Id, BeneficiaryID: invitee.Id,
			BaseQuota: 1_000, RateBPS: 1_000, CalculatedQuota: 100, RewardQuota: 100,
			SettlementDays: 7, PaidAt: now, AvailableAt: now + 7*24*60*60,
			ReviewStatus: CashbackReviewApproved, SettlementStatus: status, RiskLevel: CashbackRiskLow,
			RiskSnapshot: `{}`, ConfigSnapshot: `{}`, OutstandingDebtQuota: debt,
		}
	}
	firstDebt := newReward(101, CashbackSettlementDebt, 100)
	secondDebt := newReward(102, CashbackSettlementDebt, 100)
	blocked := newReward(103, CashbackSettlementFrozen, 0)
	blocked.BlockingReason = "beneficiary_has_open_cashback_debt"
	blocked.NextSettlementAttemptAt = now + 300
	require.NoError(t, DB.Create(&firstDebt).Error)
	require.NoError(t, DB.Create(&secondDebt).Error)
	require.NoError(t, DB.Create(&blocked).Error)

	_, err := ResolveCashbackRewardDebt(firstDebt.ID, 999, "first disposition", now+1)
	require.NoError(t, err)
	require.NoError(t, DB.First(&blocked, blocked.ID).Error)
	assert.Equal(t, "beneficiary_has_open_cashback_debt", blocked.BlockingReason)
	assert.NotZero(t, blocked.NextSettlementAttemptAt)

	_, err = ResolveCashbackRewardDebt(secondDebt.ID, 999, "second disposition", now+2)
	require.NoError(t, err)
	require.NoError(t, DB.First(&blocked, blocked.ID).Error)
	assert.Empty(t, blocked.BlockingReason)
	assert.Zero(t, blocked.NextSettlementAttemptAt)
}

func TestCashbackIncidentRestoresCacheReservationWhenTransactionPanics(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-100)
	inviter, invitee := createCashbackUsers(t, now-30*24*60*60)
	topUp := createCompletedCashbackTopUp(t, invitee, now, now, 100_000, 100_000)
	var rewards []CashbackReward
	require.NoError(t, DB.Where("top_up_id = ?", topUp.Id).Find(&rewards).Error)
	for _, reward := range rewards {
		_, err := ReviewCashbackReward(reward.ID, CashbackReviewActionApprove, "approved", 999, reward.AvailableAt)
		require.NoError(t, err)
	}

	redisServer := useUserCacheMiniRedis(t)
	var inviterRow, inviteeRow User
	require.NoError(t, DB.First(&inviterRow, inviter.Id).Error)
	require.NoError(t, DB.First(&inviteeRow, invitee.Id).Error)
	require.NoError(t, writeUserCache(inviterRow.ToBaseUser(), true))
	require.NoError(t, writeUserCache(inviteeRow.ToBaseUser(), true))
	inviterQuotaBefore, inviteeQuotaBefore := inviterRow.Quota, inviteeRow.Quota

	callbackName := "test:cashback-incident-panic"
	require.NoError(t, DB.Callback().Update().Before("gorm:update").Register(callbackName, func(tx *gorm.DB) {
		if tx.Statement.Table == "cashback_rewards" {
			panic("forced cashback reward update panic")
		}
	}))
	callbackRegistered := true
	t.Cleanup(func() {
		if callbackRegistered {
			_ = DB.Callback().Update().Remove(callbackName)
		}
	})

	assert.Panics(t, func() {
		_, _ = HandleCashbackIncident(topUp.Id, CashbackIncidentInput{
			Kind: CashbackIncidentRefund, CumulativeRefundRateBPS: 10_000,
			Reason: "force panic rollback", OperatorID: 999, Now: now + 1,
		})
	})
	require.NoError(t, DB.Callback().Update().Remove(callbackName))
	callbackRegistered = false

	require.NoError(t, DB.First(&inviterRow, inviter.Id).Error)
	require.NoError(t, DB.First(&inviteeRow, invitee.Id).Error)
	assert.Equal(t, inviterQuotaBefore, inviterRow.Quota)
	assert.Equal(t, inviteeQuotaBefore, inviteeRow.Quota)
	_, err := cacheGetUserBase(inviter.Id)
	assert.ErrorIs(t, err, ErrUserQuotaMutationPending)
	_, err = cacheGetUserBase(invitee.Id)
	assert.ErrorIs(t, err, ErrUserQuotaMutationPending)
	redisServer.FastForward(time.Duration(userQuotaMutationCooldownSeconds()+1) * time.Second)
	inviterCache, err := GetUserCache(inviter.Id)
	require.NoError(t, err)
	inviteeCache, err := GetUserCache(invitee.Id)
	require.NoError(t, err)
	assert.Equal(t, inviterQuotaBefore, inviterCache.Quota)
	assert.Equal(t, inviteeQuotaBefore, inviteeCache.Quota)
}

func TestCashbackUsesPaymentTimeDirectionAndConfigurationSnapshot(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	initial := saveCashbackTestSetting(t, now-100)
	_, invitee := createCashbackUsers(t, now-30*24*60*60)

	order := TopUp{
		UserId: invitee.Id, Amount: 100, Money: 100, TradeNo: "payment-time-config",
		PaymentMethod: PaymentMethodWaffo, PaymentProvider: PaymentProviderWaffo,
		CreateTime: now, Status: common.TopUpStatusPending,
	}
	require.NoError(t, InsertOnlineTopUp(&order, 100_000, CashbackRequestMetadata{}))

	updated := initial
	updated.InviterEnabled = false
	updated.InviteeEnabled = true
	updated.InviteeRateBPS = 2_000
	updated.Version = 4
	require.NoError(t, SaveCashbackSetting(updated))
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		var locked TopUp
		if err := lockForUpdate(tx).First(&locked, order.Id).Error; err != nil {
			return err
		}
		locked.Status = common.TopUpStatusSuccess
		locked.CompleteTime = now + 1
		if err := tx.Save(&locked).Error; err != nil {
			return err
		}
		return CompleteTopUpCashbackTx(tx, &locked, 100_000, CashbackCompletionProviderCallback)
	}))

	var rewards []CashbackReward
	require.NoError(t, DB.Where("top_up_id = ?", order.Id).Find(&rewards).Error)
	require.Len(t, rewards, 1)
	assert.Equal(t, CashbackDirectionInvitee, rewards[0].Direction)
	assert.Equal(t, 2_000, rewards[0].RateBPS)
	assert.Equal(t, 20_000, rewards[0].CalculatedQuota)
	assert.EqualValues(t, 4, rewards[0].ConfigVersion)

	updated.InviteeRateBPS = 500
	updated.Version = 5
	require.NoError(t, SaveCashbackSetting(updated))
	var unchanged CashbackReward
	require.NoError(t, DB.First(&unchanged, rewards[0].ID).Error)
	assert.Equal(t, 20_000, unchanged.CalculatedQuota)
	assert.EqualValues(t, 4, unchanged.ConfigVersion)
}

func TestCashbackCapsEachBeneficiaryAcrossRollingDay(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	setting := saveCashbackTestSetting(t, now-100)
	setting.MaxRewardQuota = 7_000
	setting.DailyRewardQuota = 10_000
	require.NoError(t, SaveCashbackSetting(setting))
	_, invitee := createCashbackUsers(t, now-30*24*60*60)

	first := createCompletedCashbackTopUp(t, invitee, now, now, 100_000, 100_000)
	second := createCompletedCashbackTopUp(t, invitee, now+1, now+1, 100_000, 100_000)
	var inviterRewards []CashbackReward
	require.NoError(t, DB.Where("top_up_id IN ? AND direction = ?", []int{first.Id, second.Id}, CashbackDirectionInviter).Order("top_up_id asc").Find(&inviterRewards).Error)
	require.Len(t, inviterRewards, 2)
	assert.Equal(t, 7_000, inviterRewards[0].RewardQuota)
	assert.Contains(t, inviterRewards[0].CapReason, "single_cap")
	assert.Equal(t, 3_000, inviterRewards[1].RewardQuota)
	assert.Contains(t, inviterRewards[1].CapReason, "daily_cap")
}

func TestCashbackRiskFlagsSharedSignalsWithoutAutomaticallyRejecting(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	setting := saveCashbackTestSetting(t, now-100)
	setting.IPAccountThreshold = 2
	require.NoError(t, SaveCashbackSetting(setting))
	_, invitee := createCashbackUsers(t, now-30*24*60*60)
	other := User{Username: "cashback-associated", Password: "password", AffCode: "associated-code", Status: common.UserStatusEnabled, Role: common.RoleCommonUser, CreatedAt: now - 30*24*60*60}
	require.NoError(t, DB.Create(&other).Error)
	signal := "v1:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
	associatedOrder := TopUp{UserId: other.Id, TradeNo: "associated-order", PaymentProvider: PaymentProviderEpay, CreateTime: now, Status: common.TopUpStatusPending}
	require.NoError(t, InsertOnlineTopUp(&associatedOrder, 100, CashbackRequestMetadata{RequestIP: "203.0.113.44", DeviceSignal: signal}))

	order := TopUp{
		UserId: invitee.Id, Amount: 100, Money: 100, TradeNo: "shared-signal-order",
		PaymentMethod: PaymentMethodWaffo, PaymentProvider: PaymentProviderWaffo,
		CreateTime: now + 1, Status: common.TopUpStatusPending,
	}
	require.NoError(t, InsertOnlineTopUp(&order, 100_000, CashbackRequestMetadata{RequestIP: "203.0.113.44", DeviceSignal: signal}))
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		var locked TopUp
		if err := lockForUpdate(tx).First(&locked, order.Id).Error; err != nil {
			return err
		}
		locked.Status = common.TopUpStatusSuccess
		locked.CompleteTime = now + 2
		if err := tx.Save(&locked).Error; err != nil {
			return err
		}
		return CompleteTopUpCashbackTx(tx, &locked, 100_000, CashbackCompletionProviderCallback)
	}))

	var reward CashbackReward
	require.NoError(t, DB.Where("top_up_id = ?", order.Id).First(&reward).Error)
	assert.Equal(t, CashbackSettlementFrozen, reward.SettlementStatus)
	var risk CashbackRiskSnapshot
	require.NoError(t, common.UnmarshalJsonStr(reward.RiskSnapshot, &risk))
	assert.Contains(t, risk.Flags, "shared_ip_accounts")
	assert.Contains(t, risk.Flags, "shared_device_accounts")
}

func TestCashbackRiskFlagsMissingRequestSignalsWithoutBlockingTopUp(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-100)
	_, invitee := createCashbackUsers(t, now-30*24*60*60)
	order := TopUp{
		UserId: invitee.Id, Amount: 1, Money: 1, TradeNo: "missing-risk-signals",
		PaymentMethod: PaymentMethodWaffo, PaymentProvider: PaymentProviderWaffo,
		CreateTime: now, Status: common.TopUpStatusPending,
	}
	require.NoError(t, InsertOnlineTopUp(&order, 100_000, CashbackRequestMetadata{}))
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		var locked TopUp
		if err := lockForUpdate(tx).First(&locked, order.Id).Error; err != nil {
			return err
		}
		locked.Status = common.TopUpStatusSuccess
		locked.CompleteTime = now + 1
		if err := tx.Save(&locked).Error; err != nil {
			return err
		}
		return CompleteTopUpCashbackTx(tx, &locked, 100_000, CashbackCompletionProviderCallback)
	}))

	var reward CashbackReward
	require.NoError(t, DB.Where("top_up_id = ?", order.Id).First(&reward).Error)
	assert.Equal(t, CashbackSettlementFrozen, reward.SettlementStatus)
	var risk CashbackRiskSnapshot
	require.NoError(t, common.UnmarshalJsonStr(reward.RiskSnapshot, &risk))
	assert.Contains(t, risk.Flags, "request_ip_missing")
	assert.Contains(t, risk.Flags, "user_agent_missing")
	assert.Contains(t, risk.Flags, "device_missing")
}

func TestCashbackCapturesRegistrationIPWithoutDeviceFingerprint(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-100)
	_, invitee := createCashbackUsers(t, now-30*24*60*60)
	require.NoError(t, RecordCashbackDeviceLink(
		invitee.Id,
		"",
		"198.51.100.10",
		"registration-agent",
		CashbackDeviceSourceRegistration,
	))
	var registrationLink CashbackDeviceLink
	require.NoError(t, DB.Where("user_id = ?", invitee.Id).First(&registrationLink).Error)
	assert.Equal(t, CashbackDeviceSignalMissing, registrationLink.DeviceSignalStatus)
	assert.Equal(t, "198.51.100.10", registrationLink.FirstIP)
	assert.Len(t, registrationLink.DeviceFingerprintHash, 64)
	other := User{
		Username: "registration-ip-associated", Password: "password", AffCode: "registration-ip-associated",
		Status: common.UserStatusEnabled, Role: common.RoleCommonUser, CreatedAt: now - 30*24*60*60,
	}
	require.NoError(t, DB.Create(&other).Error)
	require.NoError(t, RecordCashbackDeviceLink(
		other.Id,
		"",
		"203.0.113.10",
		"other-registration-agent",
		CashbackDeviceSourceRegistration,
	))

	orderTime := time.Now().Unix()
	order := TopUp{
		UserId: invitee.Id, Amount: 1, Money: 1, TradeNo: "registration-ip-risk",
		PaymentMethod: PaymentMethodWaffo, PaymentProvider: PaymentProviderWaffo,
		CreateTime: orderTime, Status: common.TopUpStatusPending,
	}
	require.NoError(t, InsertOnlineTopUp(&order, 100_000, CashbackRequestMetadata{
		RequestIP: "203.0.113.10", UserAgent: "topup-agent",
	}))
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		var locked TopUp
		if err := lockForUpdate(tx).First(&locked, order.Id).Error; err != nil {
			return err
		}
		locked.Status = common.TopUpStatusSuccess
		locked.CompleteTime = orderTime + 1
		if err := tx.Save(&locked).Error; err != nil {
			return err
		}
		return CompleteTopUpCashbackTx(tx, &locked, 100_000, CashbackCompletionProviderCallback)
	}))

	var reward CashbackReward
	require.NoError(t, DB.Where("top_up_id = ?", order.Id).First(&reward).Error)
	var risk CashbackRiskSnapshot
	require.NoError(t, common.UnmarshalJsonStr(reward.RiskSnapshot, &risk))
	assert.Equal(t, "198.51.100.10", risk.FirstObservedIP)
	assert.Contains(t, risk.Flags, "first_observed_ip_mismatch")
	assert.Equal(t, 2, risk.IPAssociatedAccountCount)
	assert.Equal(t, 0, risk.RecentDeviceCount)
}

func TestSelfReferralNeverCreatesCashback(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-100)
	user := User{Username: "self-referral", Password: "password", AffCode: "self-code", Status: common.UserStatusEnabled, Role: common.RoleCommonUser, CreatedAt: now - 1000}
	require.NoError(t, DB.Create(&user).Error)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", user.Id).Update("inviter_id", user.Id).Error)
	user.InviterId = user.Id
	order := createCompletedCashbackTopUp(t, user, now, now, 100_000, 100_000)
	var count int64
	require.NoError(t, DB.Model(&CashbackReward{}).Where("top_up_id = ?", order.Id).Count(&count).Error)
	assert.Zero(t, count)
}

func TestRechargeEpayCreatesCashbackOnceAndManualCompletionStaysIneligible(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-100)
	_, invitee := createCashbackUsers(t, now-30*24*60*60)
	baseQuota, err := common.WalletQuotaFromDecimalStrict(
		decimal.NewFromFloat(common.QuotaPerUnit),
	)
	require.NoError(t, err)

	order := TopUp{
		UserId: invitee.Id, Amount: 1, Money: 1, TradeNo: "epay-cashback-once",
		PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay,
		CreateTime: now, Status: common.TopUpStatusPending,
	}
	require.NoError(t, InsertOnlineTopUp(&order, baseQuota, CashbackRequestMetadata{}))
	alreadyDone, err := RechargeEpay(order.TradeNo, "alipay", "127.0.0.1")
	require.NoError(t, err)
	assert.False(t, alreadyDone)
	alreadyDone, err = RechargeEpay(order.TradeNo, "alipay", "127.0.0.1")
	require.NoError(t, err)
	assert.True(t, alreadyDone)
	var rewardCount int64
	require.NoError(t, DB.Model(&CashbackReward{}).Where("top_up_id = ?", order.Id).Count(&rewardCount).Error)
	assert.EqualValues(t, 2, rewardCount)

	manual := TopUp{
		UserId: invitee.Id, Amount: 1, Money: 1, TradeNo: "manual-cashback-ineligible",
		PaymentMethod: "alipay", PaymentProvider: PaymentProviderEpay,
		CreateTime: now + 1, Status: common.TopUpStatusPending,
	}
	require.NoError(t, InsertOnlineTopUp(&manual, baseQuota, CashbackRequestMetadata{}))
	require.NoError(t, ManualCompleteTopUp(manual.TradeNo, "127.0.0.1"))
	require.NoError(t, DB.Model(&CashbackReward{}).Where("top_up_id = ?", manual.Id).Count(&rewardCount).Error)
	assert.Zero(t, rewardCount)
	var manualContext CashbackOrderContext
	require.NoError(t, DB.Where("top_up_id = ?", manual.Id).First(&manualContext).Error)
	assert.Equal(t, CashbackCompletionAdminManual, manualContext.CompletionSource)
	var logCountBefore int64
	require.NoError(t, LOG_DB.Model(&Log{}).Where("user_id = ? AND type = ?", invitee.Id, LogTypeTopup).Count(&logCountBefore).Error)
	require.NoError(t, ManualCompleteTopUp(manual.TradeNo, "127.0.0.1"))
	var logCountAfter int64
	require.NoError(t, LOG_DB.Model(&Log{}).Where("user_id = ? AND type = ?", invitee.Id, LogTypeTopup).Count(&logCountAfter).Error)
	assert.Equal(t, logCountBefore, logCountAfter)

	wrongChannel := TopUp{
		UserId: invitee.Id, Amount: 1, Money: 1, TradeNo: "wrong-channel-cashback",
		PaymentMethod: PaymentMethodStripe, PaymentProvider: PaymentProviderStripe,
		CreateTime: now + 2, Status: common.TopUpStatusPending,
	}
	require.NoError(t, InsertOnlineTopUp(&wrongChannel, baseQuota, CashbackRequestMetadata{}))
	_, err = RechargeEpay(wrongChannel.TradeNo, "alipay", "127.0.0.1")
	assert.ErrorIs(t, err, ErrPaymentMethodMismatch)
	var unchanged TopUp
	require.NoError(t, DB.First(&unchanged, wrongChannel.Id).Error)
	assert.Equal(t, common.TopUpStatusPending, unchanged.Status)
}

func TestAllOnlineTopUpProvidersCreateCashbackInSettlement(t *testing.T) {
	providers := []struct {
		name     string
		provider string
		method   string
		amount   int64
		settle   func(string) error
	}{
		{
			name: "epay", provider: PaymentProviderEpay, method: "alipay", amount: 1,
			settle: func(tradeNo string) error {
				_, err := RechargeEpay(tradeNo, "alipay", "127.0.0.1")
				return err
			},
		},
		{name: "stripe", provider: PaymentProviderStripe, method: PaymentMethodStripe, amount: 1, settle: func(tradeNo string) error {
			return Recharge(tradeNo, "customer", "127.0.0.1")
		}},
		{name: "creem", provider: PaymentProviderCreem, method: PaymentMethodCreem, amount: 1_000, settle: func(tradeNo string) error {
			return RechargeCreem(tradeNo, "", "", "127.0.0.1")
		}},
		{name: "waffo", provider: PaymentProviderWaffo, method: PaymentMethodWaffo, amount: 1, settle: func(tradeNo string) error {
			return RechargeWaffo(tradeNo, "127.0.0.1")
		}},
		{name: "waffo pancake", provider: PaymentProviderWaffoPancake, method: PaymentMethodWaffoPancake, amount: 1, settle: func(tradeNo string) error {
			return RechargeWaffoPancake(tradeNo)
		}},
	}

	for _, provider := range providers {
		t.Run(provider.name, func(t *testing.T) {
			setupCashbackTestDB(t)
			oldQuotaPerUnit := common.QuotaPerUnit
			common.QuotaPerUnit = 1_000
			t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })
			now := time.Now().Unix()
			saveCashbackTestSetting(t, now-100)
			_, invitee := createCashbackUsers(t, now-30*24*60*60)
			topUp := TopUp{
				UserId: invitee.Id, Amount: provider.amount, Money: 1,
				TradeNo:       "provider-cashback-" + strings.ReplaceAll(provider.name, " ", "-"),
				PaymentMethod: provider.method, PaymentProvider: provider.provider,
				CreateTime: now, Status: common.TopUpStatusPending,
			}
			require.NoError(t, InsertOnlineTopUp(&topUp, 1_000, CashbackRequestMetadata{}))

			require.NoError(t, provider.settle(topUp.TradeNo))
			require.NoError(t, provider.settle(topUp.TradeNo))

			var rewardCount int64
			require.NoError(t, DB.Model(&CashbackReward{}).Where("top_up_id = ?", topUp.Id).Count(&rewardCount).Error)
			assert.EqualValues(t, 2, rewardCount)
			var orderContext CashbackOrderContext
			require.NoError(t, DB.Where("top_up_id = ?", topUp.Id).First(&orderContext).Error)
			assert.Equal(t, CashbackCompletionProviderCallback, orderContext.CompletionSource)
			assert.Equal(t, 1_000, orderContext.CreditedQuota)
			var storedUser User
			require.NoError(t, DB.First(&storedUser, invitee.Id).Error)
			assert.Equal(t, 1_000, storedUser.Quota)
		})
	}
}

func TestCashbackReasonLimitCountsUnicodeCodePoints(t *testing.T) {
	setupCashbackTestDB(t)
	valid := strings.Repeat("理", maxCashbackReasonCharacters)
	tooLong := valid + "理"
	assert.True(t, cashbackTextWithinLimit(valid))
	assert.False(t, cashbackTextWithinLimit(tooLong))

	_, err := ReviewCashbackReward(999, CashbackReviewActionApprove, valid, 1, 1)
	assert.ErrorIs(t, err, ErrCashbackNotFound)
	_, err = ReviewCashbackReward(999, CashbackReviewActionApprove, tooLong, 1, 1)
	assert.ErrorIs(t, err, ErrCashbackInvalidInput)
	_, err = HandleCashbackIncident(999, CashbackIncidentInput{
		Kind: CashbackIncidentDispute, Reason: tooLong, OperatorID: 1, Now: 1,
	})
	assert.ErrorIs(t, err, ErrCashbackInvalidInput)
	_, err = ResolveCashbackRewardDebt(999, 1, tooLong, 1)
	assert.ErrorIs(t, err, ErrCashbackInvalidInput)
	_, err = ResolveCashbackPrincipalDebt(999, 1, tooLong, 1)
	assert.ErrorIs(t, err, ErrCashbackInvalidInput)
}

func TestParseCashbackDeviceSignalRejectsUntrustedValuesWithoutBlockingMissing(t *testing.T) {
	hash, status := ParseCashbackDeviceSignal("")
	assert.Empty(t, hash)
	assert.Equal(t, CashbackDeviceSignalMissing, status)

	hash, status = ParseCashbackDeviceSignal("v1:not-a-hash")
	assert.Empty(t, hash)
	assert.Equal(t, CashbackDeviceSignalInvalid, status)

	hash, status = ParseCashbackDeviceSignal("v1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc")
	assert.Len(t, hash, 64)
	assert.Equal(t, CashbackDeviceSignalValid, status)
}

func TestPostEnableTopUpCannotCompleteWithoutRequiredCashbackContext(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-100)
	_, invitee := createCashbackUsers(t, now-30*24*60*60)
	topUp := TopUp{
		UserId: invitee.Id, Amount: 1, Money: 1, TradeNo: "missing-cashback-context",
		PaymentMethod: PaymentMethodStripe, PaymentProvider: PaymentProviderStripe,
		CreateTime: now, Status: common.TopUpStatusPending,
	}
	require.NoError(t, DB.Create(&topUp).Error)

	err := DB.Transaction(func(tx *gorm.DB) error {
		var locked TopUp
		if err := lockForUpdate(tx).First(&locked, topUp.Id).Error; err != nil {
			return err
		}
		locked.Status = common.TopUpStatusSuccess
		locked.CompleteTime = now
		if err := tx.Save(&locked).Error; err != nil {
			return err
		}
		return CompleteTopUpCashbackTx(tx, &locked, 1_000, CashbackCompletionProviderCallback)
	})
	require.ErrorIs(t, err, ErrCashbackOrderContextMissing)

	var stored TopUp
	require.NoError(t, DB.First(&stored, topUp.Id).Error)
	assert.Equal(t, common.TopUpStatusPending, stored.Status)
	assert.Zero(t, stored.CompleteTime)

	invalidContext := CashbackOrderContext{
		TopUpID: topUp.Id, TradeNo: topUp.TradeNo, UserID: topUp.UserId,
		PaymentProvider: topUp.PaymentProvider, BaseQuota: 1_000,
		DeviceSignalStatus: CashbackDeviceSignalMissing, EligibleAfterFirstEnable: false,
	}
	require.NoError(t, DB.Create(&invalidContext).Error)
	err = DB.Transaction(func(tx *gorm.DB) error {
		var locked TopUp
		if err := lockForUpdate(tx).First(&locked, topUp.Id).Error; err != nil {
			return err
		}
		locked.Status = common.TopUpStatusSuccess
		locked.CompleteTime = now
		if err := tx.Save(&locked).Error; err != nil {
			return err
		}
		return CompleteTopUpCashbackTx(tx, &locked, 1_000, CashbackCompletionProviderCallback)
	})
	require.NoError(t, err)
	require.NoError(t, DB.First(&stored, topUp.Id).Error)
	assert.Equal(t, common.TopUpStatusSuccess, stored.Status)
	require.NoError(t, DB.First(&invalidContext, invalidContext.ID).Error)
	assert.Equal(t, CashbackCompletionProviderCallback, invalidContext.CompletionSource)
	assert.Equal(t, 1_000, invalidContext.CreditedQuota)
	var rewardCount int64
	require.NoError(t, DB.Model(&CashbackReward{}).Where("top_up_id = ?", topUp.Id).Count(&rewardCount).Error)
	assert.Zero(t, rewardCount)
}

func TestContextlessPreEnableTopUpKeepsLegacyCompatibility(t *testing.T) {
	setupCashbackTestDB(t)
	now := time.Now().Unix()
	firstEnabledAt := now - 100
	saveCashbackTestSetting(t, firstEnabledAt)
	_, invitee := createCashbackUsers(t, now-30*24*60*60)
	topUp := TopUp{
		UserId: invitee.Id, Amount: 1, Money: 1, TradeNo: "legacy-pre-enable-contextless",
		PaymentMethod: PaymentMethodStripe, PaymentProvider: PaymentProviderStripe,
		CreateTime: firstEnabledAt - 1, Status: common.TopUpStatusPending,
	}
	require.NoError(t, DB.Create(&topUp).Error)

	err := DB.Transaction(func(tx *gorm.DB) error {
		var locked TopUp
		if err := lockForUpdate(tx).First(&locked, topUp.Id).Error; err != nil {
			return err
		}
		locked.Status = common.TopUpStatusSuccess
		locked.CompleteTime = now
		if err := tx.Save(&locked).Error; err != nil {
			return err
		}
		return CompleteTopUpCashbackTx(tx, &locked, 1_000, CashbackCompletionProviderCallback)
	})
	require.NoError(t, err)

	var stored TopUp
	require.NoError(t, DB.First(&stored, topUp.Id).Error)
	assert.Equal(t, common.TopUpStatusSuccess, stored.Status)
	var contextCount, rewardCount int64
	require.NoError(t, DB.Model(&CashbackOrderContext{}).Where("top_up_id = ?", topUp.Id).Count(&contextCount).Error)
	require.NoError(t, DB.Model(&CashbackReward{}).Where("top_up_id = ?", topUp.Id).Count(&rewardCount).Error)
	assert.Zero(t, contextCount)
	assert.Zero(t, rewardCount)
}

func TestStripeRechargeDuplicateCallbackIsIdempotentWithCashback(t *testing.T) {
	setupCashbackTestDB(t)
	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 1_000
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })

	now := time.Now().Unix()
	saveCashbackTestSetting(t, now-100)
	_, invitee := createCashbackUsers(t, now-30*24*60*60)
	topUp := TopUp{
		UserId: invitee.Id, Amount: 1, Money: 1, TradeNo: "stripe-cashback-idempotent",
		PaymentMethod: PaymentMethodStripe, PaymentProvider: PaymentProviderStripe,
		CreateTime: now, Status: common.TopUpStatusPending,
	}
	require.NoError(t, InsertOnlineTopUp(&topUp, 1_000, CashbackRequestMetadata{}))

	require.NoError(t, Recharge(topUp.TradeNo, "customer-1", "127.0.0.1"))
	require.NoError(t, Recharge(topUp.TradeNo, "customer-1", "127.0.0.1"))

	var storedUser User
	require.NoError(t, DB.First(&storedUser, invitee.Id).Error)
	assert.Equal(t, 1_000, storedUser.Quota)
	var rewardCount int64
	require.NoError(t, DB.Model(&CashbackReward{}).Where("top_up_id = ?", topUp.Id).Count(&rewardCount).Error)
	assert.EqualValues(t, 2, rewardCount)
}
