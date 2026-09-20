package model

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

func TestCashbackProductionDatabaseIntegration(t *testing.T) {
	tests := []struct {
		name      string
		env       string
		database  common.DatabaseType
		dialector func(string) gorm.Dialector
		useSchema bool
	}{
		{
			name:      "mysql",
			env:       "TEST_MYSQL_DSN",
			database:  common.DatabaseTypeMySQL,
			dialector: func(dsn string) gorm.Dialector { return mysql.Open(dsn) },
		},
		{
			name:     "postgres",
			env:      "TEST_POSTGRES_DSN",
			database: common.DatabaseTypePostgreSQL,
			dialector: func(dsn string) gorm.Dialector {
				return postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true})
			},
			useSchema: true,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			dsn := strings.TrimSpace(os.Getenv(test.env))
			if dsn == "" {
				t.Skip("set " + test.env + " to run cashback production database integration test")
			}
			testCashbackProductionDatabase(t, test.database, test.dialector(dsn), test.useSchema)
		})
	}
}

func testCashbackProductionDatabase(t *testing.T, databaseType common.DatabaseType, dialector gorm.Dialector, useSchema bool) {
	t.Helper()
	namespace := newCashbackIntegrationNamespace(t)
	tablePrefix := namespace + "_"
	if useSchema {
		tablePrefix = namespace + "."
	}
	db, err := gorm.Open(dialector, &gorm.Config{
		NamingStrategy: schema.NamingStrategy{TablePrefix: tablePrefix},
	})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(4)
	t.Cleanup(func() {
		if closeErr := sqlDB.Close(); closeErr != nil {
			t.Errorf("close cashback integration database: %v", closeErr)
		}
	})

	models := []interface{}{
		&User{},
		&TopUp{},
		&CashbackOrderContext{},
		&CashbackReward{},
		&CashbackDeviceLink{},
		&CashbackQuotaMutation{},
		&Log{},
	}
	if useSchema {
		require.NoError(t, db.Exec(fmt.Sprintf(`CREATE SCHEMA "%s"`, namespace)).Error)
		t.Cleanup(func() {
			if dropErr := db.Exec(fmt.Sprintf(`DROP SCHEMA IF EXISTS "%s" CASCADE`, namespace)).Error; dropErr != nil {
				t.Errorf("drop cashback integration schema %s: %v", namespace, dropErr)
			}
		})
	} else {
		t.Cleanup(func() {
			for index := len(models) - 1; index >= 0; index-- {
				if dropErr := db.Migrator().DropTable(models[index]); dropErr != nil {
					t.Errorf("drop cashback integration table for %T: %v", models[index], dropErr)
				}
			}
		})
	}

	oldDB, oldLogDB := DB, LOG_DB
	oldMainType, oldLogType := common.MainDatabaseType(), common.LogDatabaseType()
	oldRedisEnabled := common.RedisEnabled
	DB, LOG_DB = db, db
	common.SetDatabaseTypes(databaseType, databaseType)
	common.RedisEnabled = false
	resetCashbackReconciliationProgress()
	t.Cleanup(func() {
		resetCashbackReconciliationProgress()
		DB, LOG_DB = oldDB, oldLogDB
		common.SetDatabaseTypes(oldMainType, oldLogType)
		common.RedisEnabled = oldRedisEnabled
	})

	require.NoError(t, db.AutoMigrate(models...))
	for _, cashbackModel := range []interface{}{
		&CashbackOrderContext{},
		&CashbackReward{},
		&CashbackDeviceLink{},
		&CashbackQuotaMutation{},
	} {
		require.True(t, db.Migrator().HasTable(cashbackModel))
	}
	require.True(t, db.Migrator().HasIndex(&CashbackReward{}, "idx_cashback_settlement_scan"))
	require.True(t, db.Migrator().HasIndex(&CashbackQuotaMutation{}, "idx_cashback_mutation_reward_kind"))
	require.True(t, db.Migrator().HasIndex(&CashbackQuotaMutation{}, "idx_cashback_mutation_topup_kind"))

	now := time.Now().Unix()
	inviter := User{
		Username:  "cashback-integration-inviter",
		Password:  "password",
		AffCode:   "cashback-integration-inviter",
		Status:    common.UserStatusEnabled,
		Role:      common.RoleCommonUser,
		CreatedAt: now - 30*24*60*60,
	}
	require.NoError(t, db.Create(&inviter).Error)
	invitee := User{
		Username:  "cashback-integration-invitee",
		Password:  "password",
		AffCode:   "cashback-integration-invitee",
		InviterId: inviter.Id,
		Status:    common.UserStatusEnabled,
		Role:      common.RoleCommonUser,
		CreatedAt: now - 30*24*60*60,
	}
	require.NoError(t, db.Create(&invitee).Error)
	topUp := TopUp{
		UserId:          invitee.Id,
		Amount:          1_000,
		Money:           1,
		TradeNo:         "cashback-integration-order-" + namespace,
		PaymentMethod:   PaymentMethodStripe,
		PaymentProvider: PaymentProviderStripe,
		CreateTime:      now - 10,
		CompleteTime:    now - 5,
		Status:          common.TopUpStatusSuccess,
	}
	require.NoError(t, db.Create(&topUp).Error)
	orderContext := CashbackOrderContext{
		TopUpID:                  topUp.Id,
		TradeNo:                  topUp.TradeNo,
		UserID:                   invitee.Id,
		PaymentProvider:          topUp.PaymentProvider,
		BaseQuota:                1_000,
		CreditedQuota:            1_000,
		DeviceSignalStatus:       CashbackDeviceSignalMissing,
		EligibleAfterFirstEnable: true,
		CompletionSource:         CashbackCompletionProviderCallback,
		CompletionProvider:       topUp.PaymentProvider,
	}
	require.NoError(t, db.Create(&orderContext).Error)
	reward := CashbackReward{
		TopUpID:          topUp.Id,
		TradeNo:          topUp.TradeNo,
		Direction:        CashbackDirectionInviter,
		InviteeID:        invitee.Id,
		InviterID:        inviter.Id,
		BeneficiaryID:    inviter.Id,
		BaseQuota:        1_000,
		RateBPS:          1_000,
		CalculatedQuota:  100,
		RewardQuota:      100,
		SettlementDays:   1,
		ConfigVersion:    1,
		PaidAt:           now - 5,
		AvailableAt:      now - 1,
		ReviewStatus:     CashbackReviewApproved,
		ReviewedBy:       1,
		ReviewedAt:       now - 2,
		ReviewReason:     "production database integration test",
		SettlementStatus: CashbackSettlementFrozen,
		RiskLevel:        CashbackRiskLow,
		RiskSnapshot:     `{}`,
		ConfigSnapshot:   `{}`,
	}
	require.NoError(t, db.Create(&reward).Error)

	type issueResult struct {
		outcome CashbackSettlementOutcome
		err     error
	}
	start := make(chan struct{})
	results := make(chan issueResult, 2)
	var waitGroup sync.WaitGroup
	for range 2 {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			<-start
			outcome, issueErr := IssueCashbackReward(reward.ID, now)
			results <- issueResult{outcome: outcome, err: issueErr}
		}()
	}
	close(start)
	waitGroup.Wait()
	close(results)

	issuedCount := 0
	for result := range results {
		require.NoError(t, result.err)
		if result.outcome.Issued {
			issuedCount++
		}
	}
	require.Equal(t, 1, issuedCount)

	var storedInviter User
	require.NoError(t, db.First(&storedInviter, inviter.Id).Error)
	require.Equal(t, reward.RewardQuota, storedInviter.Quota)
	var storedReward CashbackReward
	require.NoError(t, db.First(&storedReward, reward.ID).Error)
	require.Equal(t, CashbackSettlementIssued, storedReward.SettlementStatus)
	require.Equal(t, now, storedReward.IssuedAt)
	var issueMutations []CashbackQuotaMutation
	require.NoError(t, db.Where("reward_id = ? AND kind = ?", reward.ID, CashbackQuotaMutationIssue).Find(&issueMutations).Error)
	require.Len(t, issueMutations, 1)
	require.Equal(t, fmt.Sprintf("cashback:reward:%d:issue", reward.ID), issueMutations[0].EventKey)
	require.Equal(t, reward.RewardQuota, issueMutations[0].Quota)
}

func newCashbackIntegrationNamespace(t *testing.T) string {
	t.Helper()
	bytes := make([]byte, 8)
	_, err := rand.Read(bytes)
	require.NoError(t, err)
	return "cashback_it_" + hex.EncodeToString(bytes)
}
