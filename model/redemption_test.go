package model

import (
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestRedemptionMigration(t *testing.T) {
	for _, dialect := range []struct {
		name string
		dsn  string
		open func(string) gorm.Dialector
	}{
		{"sqlite", ":memory:", func(dsn string) gorm.Dialector { return sqlite.Open(dsn) }},
		{"mysql", os.Getenv("TEST_MYSQL_DSN"), func(dsn string) gorm.Dialector { return mysql.Open(dsn) }},
		{"postgres", os.Getenv("TEST_POSTGRES_DSN"), func(dsn string) gorm.Dialector {
			return postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true})
		}},
	} {
		t.Run(dialect.name, func(t *testing.T) {
			if strings.TrimSpace(dialect.dsn) == "" {
				t.Skip("isolated database DSN not configured")
			}
			db, err := gorm.Open(dialect.open(dialect.dsn), &gorm.Config{})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			t.Cleanup(func() { require.NoError(t, sqlDB.Close()) })
			if dialect.name != "sqlite" {
				var databaseName string
				nameSQL := "SELECT DATABASE()"
				if dialect.name == "postgres" {
					nameSQL = "SELECT current_database()"
				}
				require.NoError(t, db.Raw(nameSQL).Scan(&databaseName).Error)
				require.Contains(t, strings.ToLower(databaseName), "test", "refusing to migrate a non-test database")
			}
			var version string
			versionSQL := "SELECT version()"
			if dialect.name == "sqlite" {
				versionSQL = "SELECT sqlite_version()"
			}
			require.NoError(t, db.Raw(versionSQL).Scan(&version).Error)
			t.Logf("%s version: %s", dialect.name, version)
			const fresh = "redemption_fresh_test"
			const table = "redemption_upgrade_test"
			require.False(t, db.Migrator().HasTable(fresh), "test must not overwrite an existing table")
			require.False(t, db.Migrator().HasTable(table), "test must not overwrite an existing table")
			t.Cleanup(func() { require.NoError(t, db.Migrator().DropTable(fresh, table)) })
			for range 2 {
				require.NoError(t, db.Table(fresh).AutoMigrate(&Redemption{}))
			}
			require.NoError(t, db.Table(fresh).Model(&Redemption{}).Create(map[string]any{"key": "fresh", "quota": 0, "plan_id": 1}).Error)
			var freshCode Redemption
			require.NoError(t, db.Table(fresh).Where(map[string]any{"key": "fresh"}).First(&freshCode).Error)
			assert.Zero(t, freshCode.Quota)
			assert.Equal(t, 1, freshCode.PlanId)

			// Match the Redemption schema in v1.0.0-rc.40 rather than a
			// partial fixture: its indexes and quota default must survive.
			type legacy struct {
				Id           int
				UserId       int
				Key          string `gorm:"type:char(32);uniqueIndex"`
				Status       int    `gorm:"default:1"`
				Name         string `gorm:"index"`
				Quota        int    `gorm:"default:100"`
				CreatedTime  int64  `gorm:"bigint"`
				RedeemedTime int64  `gorm:"bigint"`
				UsedUserId   int
				DeletedAt    gorm.DeletedAt `gorm:"index"`
				ExpiredTime  int64          `gorm:"bigint"`
			}
			require.NoError(t, db.Table(table).AutoMigrate(&legacy{}))
			require.NoError(t, db.Table(table).Create(&legacy{Key: "legacy", Quota: 250, Name: "before-upgrade", Status: common.RedemptionCodeStatusEnabled}).Error)
			columnTypes, err := db.Migrator().ColumnTypes(table)
			require.NoError(t, err)
			var quotaDefault string
			for _, column := range columnTypes {
				if column.Name() == "quota" {
					quotaDefault, _ = column.DefaultValue()
				}
			}
			require.NotEmpty(t, quotaDefault)
			originalIndexes, err := db.Migrator().GetIndexes(table)
			require.NoError(t, err)
			indexNames := make(map[string]bool, len(originalIndexes))
			for _, index := range originalIndexes {
				indexNames[index.Name()] = true
			}
			require.NotEmpty(t, indexNames)
			for range 2 {
				require.NoError(t, db.Table(table).AutoMigrate(&Redemption{}))
			}
			columnTypes, err = db.Migrator().ColumnTypes(table)
			require.NoError(t, err)
			for _, column := range columnTypes {
				if column.Name() == "quota" {
					got, _ := column.DefaultValue()
					assert.Equal(t, quotaDefault, got, "upgrade must not alter the legacy quota default")
				}
			}
			upgradedIndexes, err := db.Migrator().GetIndexes(table)
			require.NoError(t, err)
			for _, index := range upgradedIndexes {
				delete(indexNames, index.Name())
			}
			assert.Empty(t, indexNames, "upgrade must retain the original indexes")
			var old Redemption
			require.NoError(t, db.Table(table).Where(map[string]any{"key": "legacy"}).First(&old).Error)
			assert.Zero(t, old.PlanId)
			assert.Equal(t, 250, old.Quota)
			assert.Equal(t, "before-upgrade", old.Name)
			assert.Equal(t, common.RedemptionCodeStatusEnabled, old.Status)
			require.Error(t, db.Table(table).Create(&Redemption{Key: "legacy", Quota: 100}).Error)
			require.NoError(t, db.Table(table).Model(&Redemption{}).Create(map[string]any{"key": "plan", "quota": 0, "plan_id": 1}).Error)
			var planCode Redemption
			require.NoError(t, db.Table(table).Where(map[string]any{"key": "plan"}).First(&planCode).Error)
			assert.Zero(t, planCode.Quota)
		})
	}
}

// Exercise the real redemption transaction on each supported database, not
// just its migration. External DSNs must point to disposable test databases.
func TestRedemptionDatabaseMatrix(t *testing.T) {
	for _, dialect := range []struct {
		name   string
		dsn    string
		dbType common.DatabaseType
		open   func(string) gorm.Dialector
	}{
		{"sqlite", ":memory:", common.DatabaseTypeSQLite, func(dsn string) gorm.Dialector { return sqlite.Open(dsn) }},
		{"mysql", os.Getenv("TEST_MYSQL_DSN"), common.DatabaseTypeMySQL, func(dsn string) gorm.Dialector { return mysql.Open(dsn) }},
		{"postgres", os.Getenv("TEST_POSTGRES_DSN"), common.DatabaseTypePostgreSQL, func(dsn string) gorm.Dialector {
			return postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true})
		}},
	} {
		t.Run(dialect.name, func(t *testing.T) {
			if strings.TrimSpace(dialect.dsn) == "" {
				t.Skip("isolated database DSN not configured")
			}
			db, err := gorm.Open(dialect.open(dialect.dsn), &gorm.Config{})
			require.NoError(t, err)
			sqlDB, err := db.DB()
			require.NoError(t, err)
			t.Cleanup(func() { require.NoError(t, sqlDB.Close()) })
			if dialect.name != "sqlite" {
				var databaseName string
				nameSQL := "SELECT DATABASE()"
				if dialect.name == "postgres" {
					nameSQL = "SELECT current_database()"
				}
				require.NoError(t, db.Raw(nameSQL).Scan(&databaseName).Error)
				require.Contains(t, strings.ToLower(databaseName), "test", "refusing to modify a non-test database")
			}
			if dialect.name == "sqlite" {
				sqlDB.SetMaxOpenConns(1)
			}
			// This test switches package-global DB/LOG_DB and drops its own tables.
			// Refuse a populated database, even one without a redemption table.
			tables, err := db.Migrator().GetTables()
			require.NoError(t, err)
			require.Empty(t, tables, "matrix requires an empty, isolated database")
			require.False(t, common.RedisEnabled, "matrix must not touch a shared Redis cache")
			t.Cleanup(func() {
				require.NoError(t, db.Migrator().DropTable(&UserSubscription{}, &SubscriptionPlan{}, &Redemption{}, &Log{}, &User{}))
			})
			require.NoError(t, db.AutoMigrate(&User{}, &Log{}, &SubscriptionPlan{}, &UserSubscription{}, &Redemption{}))

			originalDB, originalLogDB := DB, LOG_DB
			originalMain, originalLog := common.MainDatabaseType(), common.LogDatabaseType()
			DB, LOG_DB = db, db
			common.SetDatabaseTypes(dialect.dbType, dialect.dbType)
			initCol()
			defer func() {
				DB, LOG_DB = originalDB, originalLogDB
				common.SetDatabaseTypes(originalMain, originalLog)
				initCol()
			}()

			user := &User{Username: "matrix-user", Password: "password", Status: common.UserStatusEnabled}
			require.NoError(t, DB.Create(user).Error)
			quotaCode := &Redemption{Name: "wallet", Key: strings.Repeat("q", 32), Quota: 250}
			require.NoError(t, quotaCode.Insert())
			quotaData, err := Redeem(quotaCode.Key, user.Id)
			require.NoError(t, err)
			assert.Equal(t, 250, quotaData)

			plan := &SubscriptionPlan{Title: "Gift", Enabled: true, DurationUnit: SubscriptionDurationMonth, DurationValue: 1, TotalAmount: 100, MaxPurchasePerUser: 2}
			require.NoError(t, DB.Create(plan).Error)
			giftCode := &Redemption{Name: "gift", Key: strings.Repeat("g", 32), PlanId: plan.Id}
			require.NoError(t, giftCode.Insert())
			require.NoError(t, DB.Model(plan).Update("enabled", false).Error)
			_, err = Redeem(giftCode.Key, user.Id)
			require.ErrorIs(t, err, ErrRedeemFailed)
			require.NoError(t, DB.First(giftCode, giftCode.Id).Error)
			assert.Equal(t, common.RedemptionCodeStatusEnabled, giftCode.Status)
			require.NoError(t, DB.Model(plan).Updates(map[string]any{"enabled": true, "total_amount": 200}).Error)
			giftData, err := Redeem(giftCode.Key, user.Id)
			require.NoError(t, err)
			assert.Equal(t, SubscriptionRedemptionResult{Type: "subscription", PlanId: plan.Id, PlanTitle: "Gift"}, giftData)
			var subscription UserSubscription
			require.NoError(t, DB.Where("user_id = ?", user.Id).First(&subscription).Error)
			assert.Equal(t, int64(200), subscription.AmountTotal)
			var currentUser User
			require.NoError(t, DB.First(&currentUser, user.Id).Error)
			assert.Equal(t, 250, currentUser.Quota)
			_, err = Redeem(giftCode.Key, user.Id)
			require.ErrorIs(t, err, ErrRedeemFailed)

			concurrentCode := &Redemption{Name: "one-grant", Key: strings.Repeat("c", 32), PlanId: plan.Id}
			require.NoError(t, concurrentCode.Insert())
			results := make([]error, 2)
			var wg sync.WaitGroup
			for i := range results {
				wg.Go(func() { _, results[i] = Redeem(concurrentCode.Key, user.Id) })
			}
			wg.Wait()
			successes := 0
			for _, redeemErr := range results {
				if redeemErr == nil {
					successes++
				}
			}
			assert.Equal(t, 1, successes)
			var count int64
			require.NoError(t, DB.Model(&UserSubscription{}).Where("user_id = ?", user.Id).Count(&count).Error)
			assert.Equal(t, int64(2), count)

			limitedCode := &Redemption{Name: "limit", Key: strings.Repeat("l", 32), PlanId: plan.Id}
			require.NoError(t, limitedCode.Insert())
			_, err = Redeem(limitedCode.Key, user.Id)
			require.ErrorIs(t, err, ErrRedeemFailed)
			require.NoError(t, DB.First(limitedCode, limitedCode.Id).Error)
			assert.Equal(t, common.RedemptionCodeStatusEnabled, limitedCode.Status, "failed grant must roll back the code status")
			require.NoError(t, DB.Model(&UserSubscription{}).Where("user_id = ?", user.Id).Count(&count).Error)
			assert.Equal(t, int64(2), count)
		})
	}
}

func TestSearchRedemptionsFiltersAndPaginates(t *testing.T) {
	require.NoError(t, DB.AutoMigrate(&Redemption{}))
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
	})

	now := common.GetTimestamp()
	redemptions := []Redemption{
		{Id: 1, Name: "alpha-active", Key: "00000000000000000000000000000001", Status: common.RedemptionCodeStatusEnabled, ExpiredTime: 0},
		{Id: 2, Name: "alpha-future", Key: "00000000000000000000000000000002", Status: common.RedemptionCodeStatusEnabled, ExpiredTime: now + 3600},
		{Id: 3, Name: "alpha-expired", Key: "00000000000000000000000000000003", Status: common.RedemptionCodeStatusEnabled, ExpiredTime: now - 10},
		{Id: 4, Name: "beta-disabled", Key: "00000000000000000000000000000004", Status: common.RedemptionCodeStatusDisabled, ExpiredTime: 0},
		{Id: 5, Name: "beta-used", Key: "00000000000000000000000000000005", Status: common.RedemptionCodeStatusUsed, ExpiredTime: 0},
	}
	require.NoError(t, DB.Create(&redemptions).Error)

	tests := []struct {
		name      string
		keyword   string
		status    string
		startIdx  int
		num       int
		wantTotal int64
		wantIds   []int
	}{
		{
			name:      "no filters returns all rows",
			num:       10,
			wantTotal: 5,
			wantIds:   []int{5, 4, 3, 2, 1},
		},
		{
			name:      "keyword filters by name prefix",
			keyword:   "alpha",
			num:       10,
			wantTotal: 3,
			wantIds:   []int{3, 2, 1},
		},
		{
			name:      "enabled status excludes expired rows",
			status:    "1",
			num:       10,
			wantTotal: 2,
			wantIds:   []int{2, 1},
		},
		{
			name:      "expired status returns enabled expired rows",
			status:    "expired",
			num:       10,
			wantTotal: 1,
			wantIds:   []int{3},
		},
		{
			name:      "disabled status",
			status:    "2",
			num:       10,
			wantTotal: 1,
			wantIds:   []int{4},
		},
		{
			name:      "used status",
			status:    "3",
			num:       10,
			wantTotal: 1,
			wantIds:   []int{5},
		},
		{
			name:      "pagination keeps unpaged total",
			startIdx:  1,
			num:       2,
			wantTotal: 5,
			wantIds:   []int{4, 3},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rows, total, err := SearchRedemptions(tt.keyword, tt.status, tt.startIdx, tt.num)
			require.NoError(t, err)
			assert.Equal(t, tt.wantTotal, total)
			gotIds := make([]int, 0, len(rows))
			for _, row := range rows {
				gotIds = append(gotIds, row.Id)
			}
			assert.Equal(t, tt.wantIds, gotIds)
		})
	}
}

func setupRedeemFixture(t *testing.T, quota int) (userId int, key string) {
	t.Helper()
	require.NoError(t, DB.AutoMigrate(&Redemption{}))
	require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
	t.Cleanup(func() {
		require.NoError(t, DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&Redemption{}).Error)
		DB.Exec("DELETE FROM users")
		DB.Exec("DELETE FROM logs")
	})

	user := &User{Username: "redeem-user", Password: "password", Status: common.UserStatusEnabled, Quota: 0}
	require.NoError(t, DB.Create(user).Error)

	key = "10000000000000000000000000000001"
	redemption := &Redemption{
		Name:        "redeem-test",
		Key:         key,
		Status:      common.RedemptionCodeStatusEnabled,
		Quota:       quota,
		CreatedTime: common.GetTimestamp(),
	}
	require.NoError(t, DB.Create(redemption).Error)
	return user.Id, key
}

func TestRedeemCreditsQuotaExactlyOnce(t *testing.T) {
	userId, key := setupRedeemFixture(t, 500)

	quota, err := Redeem(key, userId)
	require.NoError(t, err)
	assert.Equal(t, 500, quota)

	var user User
	require.NoError(t, DB.First(&user, "id = ?", userId).Error)
	assert.Equal(t, 500, user.Quota)

	var redemption Redemption
	require.NoError(t, DB.First(&redemption, "name = ?", "redeem-test").Error)
	assert.Equal(t, common.RedemptionCodeStatusUsed, redemption.Status)
	assert.Equal(t, userId, redemption.UsedUserId)

	// Redeeming the same code again must fail and must not credit quota.
	_, err = Redeem(key, userId)
	require.Error(t, err)
	require.NoError(t, DB.First(&user, "id = ?", userId).Error)
	assert.Equal(t, 500, user.Quota)
}

func TestRedeemRejectsWalletOverflow(t *testing.T) {
	userId, key := setupRedeemFixture(t, 11)
	require.NoError(t, DB.Model(&User{}).Where("id = ?", userId).Update("quota", common.MaxWalletQuota-10).Error)

	_, err := Redeem(key, userId)
	require.ErrorIs(t, err, ErrRedeemFailed)

	var user User
	require.NoError(t, DB.First(&user, "id = ?", userId).Error)
	assert.Equal(t, common.MaxWalletQuota-10, user.Quota)

	var redemption Redemption
	require.NoError(t, DB.First(&redemption, "key = ?", key).Error)
	assert.Equal(t, common.RedemptionCodeStatusEnabled, redemption.Status)
}

func TestRedeemAcquiresQuotaFenceBeforeLockingCode(t *testing.T) {
	userId, key := setupRedeemFixture(t, 500)
	server := useUserCacheMiniRedis(t)
	var user User
	require.NoError(t, DB.First(&user, userId).Error)
	require.NoError(t, populateUserCache(user))

	hook := newBlockFirstEvalHook()
	common.RDB.AddHook(hook)
	redeemDone := make(chan error, 1)
	go func() {
		_, err := Redeem(key, userId)
		redeemDone <- err
	}()

	select {
	case <-hook.entered:
	case <-time.After(5 * time.Second):
		t.Fatal("redemption quota fence acquisition did not reach Redis")
	}

	updateDone := make(chan error, 1)
	go func() {
		updateDone <- DB.Model(&Redemption{}).Where("key = ?", key).Update("status", common.RedemptionCodeStatusDisabled).Error
	}()
	select {
	case err := <-updateDone:
		require.NoError(t, err, "the redemption row must not be locked while Redis fence acquisition is waiting")
	case <-time.After(500 * time.Millisecond):
		close(hook.release)
		t.Fatal("redemption update blocked while Redis fence acquisition was delayed")
	}
	close(hook.release)

	assert.ErrorIs(t, <-redeemDone, ErrRedeemFailed)
	assert.Zero(t, getUserQuotaFromDB(t, userId))
	assert.False(t, server.Exists(getUserQuotaMutationFenceKey(userId)), "unused owned fence must be released")
	cached, err := cacheGetUserBase(userId)
	require.NoError(t, err)
	assert.Zero(t, cached.Quota, "unused fence release must preserve the valid balance hash")
	var redemption Redemption
	require.NoError(t, DB.Where("key = ?", key).First(&redemption).Error)
	assert.Equal(t, common.RedemptionCodeStatusDisabled, redemption.Status)
}

func TestSubscriptionRedemptionUsesLivePlanAndSingleUse(t *testing.T) {
	userId, key := setupRedeemFixture(t, 500)
	require.NoError(t, DB.AutoMigrate(&SubscriptionPlan{}, &UserSubscription{}))
	t.Cleanup(func() {
		DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&UserSubscription{})
		DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&SubscriptionPlan{})
	})
	plan := &SubscriptionPlan{Title: "Gift", Enabled: false, DurationUnit: "month", DurationValue: 1, QuotaResetPeriod: "never", TotalAmount: 100, MaxPurchasePerUser: 1, UpgradeGroup: "gift"}
	require.NoError(t, DB.Create(plan).Error)
	require.NoError(t, DB.Model(plan).Update("enabled", false).Error)
	require.NoError(t, DB.Model(&Redemption{}).Where("key = ?", key).Updates(map[string]any{"plan_id": plan.Id, "quota": 0}).Error)
	_, err := Redeem(key, userId)
	require.ErrorIs(t, err, ErrRedeemFailed)
	var code Redemption
	require.NoError(t, DB.Where("key = ?", key).First(&code).Error)
	assert.Equal(t, common.RedemptionCodeStatusEnabled, code.Status)
	code.Name = "updated while plan is paused"
	require.NoError(t, code.Update(false))
	code.Status = common.RedemptionCodeStatusDisabled
	require.NoError(t, code.Update(true))
	code.Status = common.RedemptionCodeStatusEnabled
	require.NoError(t, code.Update(true))

	require.NoError(t, DB.Model(plan).Update("enabled", true).Error)
	require.NoError(t, DB.Model(plan).Update("total_amount", 250).Error)
	data, err := Redeem(key, userId)
	require.NoError(t, err)
	assert.Equal(t, SubscriptionRedemptionResult{Type: "subscription", PlanId: plan.Id, PlanTitle: "Gift"}, data)
	var sub UserSubscription
	require.NoError(t, DB.Where("user_id = ?", userId).First(&sub).Error)
	assert.Equal(t, int64(250), sub.AmountTotal)
	assert.Equal(t, "redemption", sub.Source)
	var user User
	require.NoError(t, DB.First(&user, userId).Error)
	assert.Zero(t, user.Quota)
	assert.Equal(t, "gift", user.Group)
	_, err = Redeem(key, userId)
	require.ErrorIs(t, err, ErrRedeemFailed)
	assert.Error(t, (&Redemption{Id: code.Id, Status: common.RedemptionCodeStatusEnabled, PlanId: plan.Id, Quota: 0}).Update(false))

	second := &Redemption{Name: "limited", Key: "10000000000000000000000000000003", PlanId: plan.Id}
	require.NoError(t, second.Insert())
	assert.Zero(t, second.Quota)
	var storedSecond Redemption
	require.NoError(t, DB.First(&storedSecond, second.Id).Error)
	assert.Zero(t, storedSecond.Quota)
	_, err = Redeem(second.Key, userId)
	require.ErrorIs(t, err, ErrRedeemFailed)
	require.NoError(t, DB.First(second, second.Id).Error)
	assert.Equal(t, common.RedemptionCodeStatusEnabled, second.Status)
	require.NoError(t, DB.Delete(plan).Error)
	_, err = Redeem(second.Key, userId)
	require.ErrorIs(t, err, ErrRedeemFailed)
	require.NoError(t, DB.First(second, second.Id).Error)
	assert.Equal(t, common.RedemptionCodeStatusEnabled, second.Status)
}

func TestSubscriptionRedemptionConcurrentSingleGrant(t *testing.T) {
	userId, key := setupRedeemFixture(t, 100)
	require.NoError(t, DB.AutoMigrate(&SubscriptionPlan{}, &UserSubscription{}))
	t.Cleanup(func() {
		DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&UserSubscription{})
		DB.Session(&gorm.Session{AllowGlobalUpdate: true}).Unscoped().Delete(&SubscriptionPlan{})
	})
	plan := &SubscriptionPlan{Title: "Concurrent", Enabled: true, DurationUnit: "month", DurationValue: 1}
	require.NoError(t, DB.Create(plan).Error)
	require.NoError(t, DB.Model(&Redemption{}).Where("key = ?", key).Updates(map[string]any{"quota": 0, "plan_id": plan.Id}).Error)
	const attempts = 4
	results := make([]error, attempts)
	var wg sync.WaitGroup
	for i := range attempts {
		wg.Go(func() { _, results[i] = Redeem(key, userId) })
	}
	wg.Wait()
	successes := 0
	for _, err := range results {
		if err == nil {
			successes++
		}
	}
	assert.Equal(t, 1, successes)
	var count int64
	require.NoError(t, DB.Model(&UserSubscription{}).Where("user_id = ?", userId).Count(&count).Error)
	assert.Equal(t, int64(1), count)
}

func TestRedemptionEntitlementValidation(t *testing.T) {
	setupRedeemFixture(t, 500)
	for _, code := range []Redemption{
		{PlanId: -1}, {Quota: 0}, {Quota: 1, PlanId: 42},
		{Quota: 1, Type: "invalid"}, {Quota: 1, Type: "subscription"},
		{PlanId: 42, Type: "quota"}, {PlanId: 42},
	} {
		assert.Error(t, code.Insert())
	}
}

func TestRedemptionStatusOnlyPreservesConcurrentEntitlement(t *testing.T) {
	_, key := setupRedeemFixture(t, 500)
	var stale Redemption
	require.NoError(t, DB.Where("key = ?", key).First(&stale).Error)
	plan := &SubscriptionPlan{Title: "Updated", Enabled: true, DurationUnit: "month", DurationValue: 1}
	require.NoError(t, DB.AutoMigrate(&SubscriptionPlan{}))
	require.NoError(t, DB.Create(plan).Error)
	t.Cleanup(func() { DB.Unscoped().Delete(plan) })

	updated := stale
	updated.Type = "subscription"
	updated.PlanId = plan.Id
	updated.Quota = 0
	require.NoError(t, updated.Update(false))

	stale.Status = common.RedemptionCodeStatusDisabled
	require.NoError(t, stale.Update(true))
	var actual Redemption
	require.NoError(t, DB.First(&actual, stale.Id).Error)
	assert.Equal(t, common.RedemptionCodeStatusDisabled, actual.Status)
	assert.Equal(t, plan.Id, actual.PlanId)
	assert.Zero(t, actual.Quota)

	actual.Type = "quota"
	assert.Error(t, actual.Update(false), "type and entitlement must agree")
	actual.Type = ""
	actual.Status = common.RedemptionCodeStatusUsed
	assert.Error(t, actual.Update(true), "only redemption may mark a code used")
	require.NoError(t, DB.Model(&Redemption{}).Where("id = ?", actual.Id).Update("status", common.RedemptionCodeStatusUsed).Error)
	actual.Status = common.RedemptionCodeStatusEnabled
	assert.Error(t, actual.Update(true), "a used code must not be re-enabled")
}

func TestRedemptionQuotaRejectsWalletOverflow(t *testing.T) {
	setupRedeemFixture(t, 500)

	redemption := &Redemption{
		Name:        "overflow-redemption",
		Key:         "10000000000000000000000000000002",
		Status:      common.RedemptionCodeStatusEnabled,
		Quota:       common.MaxWalletQuota + 1,
		CreatedTime: common.GetTimestamp(),
	}
	require.Error(t, redemption.Insert())
}

// Exactly one of several concurrent redeems of the same code may win, and
// quota must be credited exactly once.
func TestRedeemConcurrentSingleSuccess(t *testing.T) {
	userId, key := setupRedeemFixture(t, 300)

	const goroutines = 5
	successes := make([]bool, goroutines)
	var wg sync.WaitGroup
	wg.Add(goroutines)
	for i := range goroutines {
		go func(idx int) {
			defer wg.Done()
			if _, err := Redeem(key, userId); err == nil {
				successes[idx] = true
			}
		}(i)
	}
	wg.Wait()

	successCount := 0
	for _, ok := range successes {
		if ok {
			successCount++
		}
	}
	assert.Equal(t, 1, successCount, "exactly one concurrent redeem should succeed")

	var user User
	require.NoError(t, DB.First(&user, "id = ?", userId).Error)
	assert.Equal(t, 300, user.Quota, "quota must be credited exactly once")
}
