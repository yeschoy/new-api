package model

import (
	"errors"
	"fmt"
	"math"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Only a task-owned PostgreSQL DSN is accepted. A unique retained schema keeps
// package suites isolated without destructive resets or a SQLite fallback.
func setupPartnerTenantSubscriptionKeyPQ(t *testing.T) *gorm.DB {
	t.Helper()
	return setupPartnerTenantIsolatedPQ(t, os.Getenv("TEST_PARTNER_SUBSCRIPTION_KEY_POSTGRES_DSN"), "pt_subkey_model_")
}

func setupPartnerTenantIsolatedPQ(t *testing.T, dsn, prefix string) *gorm.DB {
	t.Helper()
	if dsn == "" {
		t.Skip("BLOCKED: explicit task-owned PostgreSQL DSN required; no runtime evidence")
	}
	cfg, err := pgx.ParseConfig(dsn)
	require.NoError(t, err)
	base, err := gorm.Open(postgres.New(postgres.Config{DSN: dsn, PreferSimpleProtocol: true}), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	schema := fmt.Sprintf("%s%d", prefix, time.Now().UnixNano())
	require.NoError(t, base.Exec("CREATE SCHEMA "+schema).Error)
	sqlBase, err := base.DB()
	require.NoError(t, err)
	require.NoError(t, sqlBase.Close())
	cfg.RuntimeParams["search_path"] = schema
	cfg.RuntimeParams["application_name"] = schema
	cfg.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	isolated := stdlib.OpenDB(*cfg)
	db, err := gorm.Open(postgresMigrationDialector{postgres.Dialector{Config: &postgres.Config{Conn: isolated, PreferSimpleProtocol: true}}}, &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(12)
	oldDB, oldMain, oldLog, oldSecret, oldRedis := DB, common.MainDatabaseType(), common.LogDatabaseType(), common.CryptoSecret, common.RedisEnabled
	DB = db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	common.CryptoSecret = "subscription-key-test-root-only"
	common.RedisEnabled = false
	initCol()
	ResetPartnerTenantMembershipCache()
	t.Cleanup(func() {
		DB = oldDB
		common.SetDatabaseTypes(oldMain, oldLog)
		common.CryptoSecret = oldSecret
		common.RedisEnabled = oldRedis
		initCol()
		ResetPartnerTenantMembershipCache()
		_ = sqlDB.Close()
	})
	t.Logf("Retained task-owned PostgreSQL schema: %s (no drop/cleanup)", schema)
	return db
}

func TestPartnerTenantSubscriptionKeyPostgres(t *testing.T) {
	db := setupPartnerTenantSubscriptionKeyPQ(t)
	t.Run("actual affected migration fresh legacy repeat", func(t *testing.T) {
		// Seed the pre-source/hash schema, then exercise the same additive migration
		// helper invoked by startup, not a separately simulated new-table definition.
		require.NoError(t, db.Exec(`CREATE TABLE partner_tenant_accounts (id bigserial PRIMARY KEY, tenant_id bigint NOT NULL, external_user_id varchar(128) NOT NULL, user_id bigint NOT NULL, token_id bigint NOT NULL, status bigint DEFAULT 1, created_at bigint, updated_at bigint)`).Error)
		require.NoError(t, db.Exec(`INSERT INTO partner_tenant_accounts(tenant_id,external_user_id,user_id,token_id) VALUES (99999,'LegacyCase',99999,99999)`).Error)
		require.NoError(t, db.AutoMigrate(&PartnerTenant{}, &User{}, &Token{}, &SubscriptionPlan{}, &UserSubscription{}, &PartnerTenantPurchaseSession{}))
		require.NoError(t, MigratePartnerTenantSubscriptionKeys(db))
		legacyOrder := &PartnerTenantSubscriptionOrder{TenantId: 99999, IdempotencyHash: partnerTenantHash("legacy-intent"), RequestHash: partnerTenantHash("legacy-request"), OrderNo: "legacy-pq-order", ExternalUserId: "LegacyCase", ExternalUserHash: partnerTenantHash("LegacyCase"), PlanId: 99999, PlanTitle: "Legacy", PlanSnapshot: "{}", AmountCents: 999, Currency: "CNY", PaymentProvider: PaymentProviderEpay, PaymentMethod: "alipay", MerchantId: "test", PaymentStatus: "pending", FulfillmentStatus: "not_ready"}
		require.NoError(t, db.Create(legacyOrder).Error)
		require.NoError(t, db.Migrator().DropColumn(&PartnerTenantSubscriptionOrder{}, "EntryMode"))
		require.NoError(t, db.Migrator().DropColumn(&PartnerTenantSubscriptionOrder{}, "AccountId"))
		for range 2 {
			require.NoError(t, MigratePartnerTenantSubscriptionKeys(db))
		}
		var preserved PartnerTenantSubscriptionOrder
		require.NoError(t, db.First(&preserved, legacyOrder.Id).Error)
		require.Equal(t, PartnerTenantIdentityExternal, preserved.EntryMode)
		require.Zero(t, preserved.AccountId)
		require.Equal(t, legacyOrder.IdempotencyHash, preserved.IdempotencyHash)
		require.EqualValues(t, 999, preserved.AmountCents)

		var legacy PartnerTenantAccount
		require.NoError(t, db.Where("tenant_id = ?", 99999).First(&legacy).Error)
		require.Equal(t, PartnerTenantIdentityExternal, legacy.IdentitySource)
		require.Nil(t, legacy.SourceOrderId)
		require.Equal(t, partnerTenantHash("LegacyCase"), legacy.ExternalUserIdHash)
		for _, idx := range []string{"idx_pt_subkey_account", "idx_pt_subkey_subscription", "idx_pt_subkey_hash"} {
			require.True(t, db.Migrator().HasIndex(&PartnerTenantSubscriptionAccessKey{}, idx))
		}
		require.True(t, db.Migrator().HasIndex(&PartnerTenantAccount{}, "idx_pt_account_source_order"))
	})
	fixture := func(t *testing.T) (*PartnerTenant, *SubscriptionPlan) {
		t.Helper()
		tenant, _, err := CreatePartnerTenant("Key Merchant", fmt.Sprintf("key-%d", time.Now().UnixNano()))
		require.NoError(t, err)
		plan := &SubscriptionPlan{Title: "Monthly key", PartnerTenantId: tenant.Id, Enabled: true, Currency: "CNY", PriceAmount: 9.99, DurationUnit: SubscriptionDurationMonth, DurationValue: 1, QuotaResetPeriod: SubscriptionResetMonthly, ApplicableGroup: tenant.Group, AllowWalletOverflow: common.GetPointer(false), TotalAmount: math.MaxInt64, RequestsPerMinute: 60}
		require.NoError(t, db.Create(plan).Error)
		return tenant, plan
	}
	input := func(tenant *PartnerTenant, p *SubscriptionPlan, intent string) PartnerTenantSubscriptionKeyOrderInput {
		return PartnerTenantSubscriptionKeyOrderInput{TenantId: tenant.Id, TenantSecretHash: tenant.SecretHash, IdempotencyHash: partnerTenantHash(intent), PlanId: p.Id, PaymentMethod: "alipay", MerchantId: "test-merchant"}
	}
	count := func(t *testing.T, model any) int64 {
		t.Helper()
		var n int64
		require.NoError(t, db.Model(model).Count(&n).Error)
		return n
	}
	pay := func(t *testing.T, o *PartnerTenantSubscriptionOrder) {
		t.Helper()
		require.NoError(t, RecordPartnerTenantPayment(o.OrderNo, PaymentProviderEpay, o.MerchantId, o.PaymentMethod, "tx-"+o.OrderNo, o.AmountCents))
	}
	deliver := func(t *testing.T, in PartnerTenantSubscriptionKeyOrderInput) (*PartnerTenantSubscriptionOrder, *PartnerTenantSubscriptionKeyResult) {
		t.Helper()
		o, _, err := CreatePartnerTenantSubscriptionKeyOrder(in, nil)
		require.NoError(t, err)
		pay(t, o)
		require.NoError(t, FulfillPartnerTenantSubscriptionOrder(o.OrderNo))
		o, err = GetPartnerTenantSubscriptionOrder(in.TenantId, o.OrderNo)
		require.NoError(t, err)
		k, err := ClaimPartnerTenantSubscriptionKey(in.TenantId, in.TenantSecretHash, o.OrderNo)
		require.NoError(t, err)
		return o, k
	}
	t.Run("paid-only atomic rollback recovery independent identities and external isolation", func(t *testing.T) {
		tenant, p := fixture(t)
		in := input(tenant, p, "atomic")
		before := count(t, &User{})
		o, created, err := CreatePartnerTenantSubscriptionKeyOrder(in, nil)
		require.NoError(t, err)
		require.True(t, created)
		require.Empty(t, o.ExternalUserId)
		require.Zero(t, o.AccountId)
		require.Equal(t, before, count(t, &User{}))
		_, err = ClaimPartnerTenantSubscriptionKey(tenant.Id, tenant.SecretHash, o.OrderNo)
		require.ErrorIs(t, err, ErrPartnerTenantSubscriptionKeyNotReady)
		require.Error(t, FulfillPartnerTenantSubscriptionOrder(o.OrderNo))
		require.Equal(t, before, count(t, &User{}))
		// Browser expiry and invalid evidence cannot provision; genuine late paid can.
		require.NoError(t, db.Model(o).Update("expires_at", GetDBTimestamp()-10).Error)
		require.Error(t, RecordPartnerTenantPayment(o.OrderNo, PaymentProviderEpay, o.MerchantId, o.PaymentMethod, "bad", o.AmountCents+1))
		require.Equal(t, before, count(t, &User{}))
		pay(t, o)
		require.NoError(t, db.Callback().Create().Before("gorm:create").Register("subkey_atomic_failure", func(tx *gorm.DB) {
			if tx.Statement.Table == "partner_tenant_subscription_access_keys" {
				tx.AddError(errors.New("injected delivery failure"))
			}
		}))
		err = FulfillPartnerTenantSubscriptionOrder(o.OrderNo)
		require.NoError(t, db.Callback().Create().Remove("subkey_atomic_failure"))
		require.Error(t, err)
		require.Equal(t, before, count(t, &User{}))
		stored, err := GetPartnerTenantSubscriptionOrder(tenant.Id, o.OrderNo)
		require.NoError(t, err)
		require.Equal(t, "paid", stored.PaymentStatus)
		require.Equal(t, "failed_retryable", stored.FulfillmentStatus)
		var wg sync.WaitGroup
		results := make(chan error, 4)
		for range 4 {
			wg.Add(1)
			go func() { defer wg.Done(); results <- FulfillPartnerTenantSubscriptionOrder(o.OrderNo) }()
		}
		wg.Wait()
		close(results)
		for err := range results {
			require.NoError(t, err)
		}
		require.Equal(t, before+1, count(t, &User{}))
		k, err := ClaimPartnerTenantSubscriptionKey(tenant.Id, tenant.SecretHash, o.OrderNo)
		require.NoError(t, err)
		stored, err = GetPartnerTenantSubscriptionOrder(tenant.Id, o.OrderNo)
		require.NoError(t, err)
		var a PartnerTenantAccount
		require.NoError(t, db.First(&a, stored.AccountId).Error)
		require.Equal(t, PartnerTenantIdentitySubscriptionKey, a.IdentitySource)
		require.NotNil(t, a.SourceOrderId)
		require.Equal(t, o.Id, *a.SourceOrderId)
		require.NotEqual(t, partnerTenantHash(""), a.ExternalUserIdHash)
		require.NoError(t, migratePartnerTenantAccountIdentity(db))
		for _, external := range []string{"", o.OrderNo, a.ExternalUserIdHash} {
			var found PartnerTenantAccount
			require.Zero(t, partnerTenantAccountQuery(db, tenant.Id, external).Find(&found).RowsAffected)
		}
		require.Error(t, db.Transaction(func(tx *gorm.DB) error {
			clone := a
			clone.Id = 0
			clone.UserId += 100000
			clone.TokenId += 100000
			clone.ExternalUserIdHash = partnerTenantHash("other-internal")
			return tx.Create(&clone).Error
		})) // Unique initial paid-order anchor.
		_ = k
	})
	t.Run("single subscription precise quota renewal rotation and terminal history", func(t *testing.T) {
		tenant, p := fixture(t)
		in := input(tenant, p, "lifecycle")
		o, k := deliver(t, in)
		users := count(t, &User{})
		tokens := count(t, &Token{})
		subs := count(t, &UserSubscription{})
		view, err := QueryPartnerTenantSubscription(k.SubscriptionKey)
		require.NoError(t, err)
		require.Equal(t, "9223372036854775807", view.Quota.Total)
		require.NotEmpty(t, view.APIKey)
		coding := view.APIKey
		require.NoError(t, db.Model(&UserSubscription{}).Where("id = ?", k.SubscriptionId).Update("amount_used", int64(9007199254740993)).Error)
		view, err = QueryPartnerTenantSubscription(k.SubscriptionKey)
		require.NoError(t, err)
		require.Equal(t, "9007199254740993", view.Quota.Used)
		require.Equal(t, "9214364837600034814", view.Quota.Remaining)
		renew := input(tenant, p, "renew")
		renew.SubscriptionKey = k.SubscriptionKey
		renewal, _, err := CreatePartnerTenantSubscriptionKeyOrder(renew, nil)
		require.NoError(t, err)
		require.Equal(t, k.SubscriptionId, renewal.RenewalSubscriptionId)
		require.Equal(t, o.AccountId, renewal.AccountId)
		var before UserSubscription
		require.NoError(t, db.First(&before, k.SubscriptionId).Error)
		rotated, err := RotatePartnerTenantSubscriptionKey(tenant.Id, tenant.SecretHash, k.SubscriptionId, 1, partnerTenantHash("rotate-1"))
		require.NoError(t, err)
		require.EqualValues(t, 2, rotated.KeyVersion)
		require.NotEqual(t, k.SubscriptionKey, rotated.SubscriptionKey)
		_, err = QueryPartnerTenantSubscription(k.SubscriptionKey)
		require.ErrorIs(t, err, ErrPartnerTenantSubscriptionKeyInvalid)
		_, _, err = CreatePartnerTenantSubscriptionKeyOrder(renew, nil)
		require.ErrorIs(t, err, ErrPartnerTenantSubscriptionKeyInvalid)
		renew.SubscriptionKey = rotated.SubscriptionKey
		replay, created, err := CreatePartnerTenantSubscriptionKeyOrder(renew, func() error { return errors.New("must not validate new") })
		require.NoError(t, err)
		require.False(t, created)
		require.Equal(t, renewal.Id, replay.Id)
		pay(t, renewal)
		require.NoError(t, FulfillPartnerTenantSubscriptionOrder(renewal.OrderNo))
		require.NoError(t, FulfillPartnerTenantSubscriptionOrder(renewal.OrderNo))
		var after UserSubscription
		require.NoError(t, db.First(&after, k.SubscriptionId).Error)
		require.Greater(t, after.EndTime, before.EndTime)
		require.Equal(t, before.AmountUsed, after.AmountUsed)
		same, err := ClaimPartnerTenantSubscriptionKey(tenant.Id, tenant.SecretHash, o.OrderNo)
		require.NoError(t, err)
		require.Equal(t, rotated.SubscriptionKey, same.SubscriptionKey)
		same, err = RotatePartnerTenantSubscriptionKey(tenant.Id, tenant.SecretHash, k.SubscriptionId, 1, partnerTenantHash("rotate-1"))
		require.NoError(t, err)
		require.Equal(t, rotated.SubscriptionKey, same.SubscriptionKey)
		second, err := RotatePartnerTenantSubscriptionKey(tenant.Id, tenant.SecretHash, k.SubscriptionId, 2, partnerTenantHash("rotate-2"))
		require.NoError(t, err)
		_, err = RotatePartnerTenantSubscriptionKey(tenant.Id, tenant.SecretHash, k.SubscriptionId, 1, partnerTenantHash("rotate-1"))
		require.ErrorIs(t, err, ErrPartnerTenantSubscriptionKeyChanged)
		view, err = QueryPartnerTenantSubscription(second.SubscriptionKey)
		require.NoError(t, err)
		require.Equal(t, coding, view.APIKey)
		// Root drift fails closed, but an explicit current merchant rotation repairs it.
		root := common.CryptoSecret
		t.Cleanup(func() { common.CryptoSecret = root })
		common.CryptoSecret = "different-test-root"
		_, err = QueryPartnerTenantSubscription(second.SubscriptionKey)
		require.ErrorIs(t, err, ErrPartnerTenantSubscriptionKeyUnavailable)
		repaired, err := RotatePartnerTenantSubscriptionKey(tenant.Id, tenant.SecretHash, k.SubscriptionId, 3, partnerTenantHash("rotate-root"))
		require.NoError(t, err)
		common.CryptoSecret = root
		_, err = QueryPartnerTenantSubscription(repaired.SubscriptionKey)
		require.ErrorIs(t, err, ErrPartnerTenantSubscriptionKeyUnavailable)
		fixed, err := RotatePartnerTenantSubscriptionKey(tenant.Id, tenant.SecretHash, k.SubscriptionId, 4, partnerTenantHash("rotate-root-back"))
		require.NoError(t, err)
		now := GetDBTimestamp()
		require.NoError(t, db.Model(&UserSubscription{}).Where("id = ?", k.SubscriptionId).Updates(map[string]any{"start_time": now - 3600, "end_time": now - 1, "status": "active"}).Error)
		view, err = QueryPartnerTenantSubscription(fixed.SubscriptionKey)
		require.NoError(t, err)
		require.Equal(t, "expired", view.Subscription.Status)
		require.Empty(t, view.APIKey)
		require.False(t, view.Quota.Usable)
		require.Equal(t, "0", view.Quota.Remaining)
		require.NotNil(t, view.Quota.HistoricalRemaining)
		lapsed := input(tenant, p, "lapsed-renew")
		lapsed.SubscriptionKey = fixed.SubscriptionKey
		lapsedOrder, _, err := CreatePartnerTenantSubscriptionKeyOrder(lapsed, nil)
		require.NoError(t, err)
		pay(t, lapsedOrder)
		require.NoError(t, FulfillPartnerTenantSubscriptionOrder(lapsedOrder.OrderNo))
		view, err = QueryPartnerTenantSubscription(fixed.SubscriptionKey)
		require.NoError(t, err)
		require.Equal(t, "0", view.Quota.Used)
		require.Equal(t, coding, view.APIKey)
		require.Equal(t, users, count(t, &User{}))
		require.Equal(t, tokens, count(t, &Token{}))
		require.Equal(t, subs, count(t, &UserSubscription{}))
		// Cancellation of an already accepted renewal must never create a replacement.
		cancelled := input(tenant, p, "cancel-before-delivery")
		cancelled.SubscriptionKey = fixed.SubscriptionKey
		cancelOrder, _, err := CreatePartnerTenantSubscriptionKeyOrder(cancelled, nil)
		require.NoError(t, err)
		require.NoError(t, db.Model(&UserSubscription{}).Where("id = ?", k.SubscriptionId).Update("status", "cancelled").Error)
		pay(t, cancelOrder)
		require.Error(t, FulfillPartnerTenantSubscriptionOrder(cancelOrder.OrderNo))
		require.Equal(t, subs, count(t, &UserSubscription{}))
		_, _, err = CreatePartnerTenantSubscriptionKeyOrder(cancelled, nil)
		require.ErrorIs(t, err, ErrPartnerTenantSubscriptionNotFound)
		view, err = QueryPartnerTenantSubscription(fixed.SubscriptionKey)
		require.NoError(t, err)
		require.Empty(t, view.APIKey)
		_, other := deliver(t, input(tenant, p, "independent-new"))
		require.NotEqual(t, k.SubscriptionId, other.SubscriptionId)
		require.Equal(t, users+1, count(t, &User{}))
	})
	t.Run("concurrent rotation and idempotent current version", func(t *testing.T) {
		tenant, p := fixture(t)
		_, k := deliver(t, input(tenant, p, "rotation-race"))
		type result struct {
			key *PartnerTenantSubscriptionKeyResult
			err error
		}
		results := make(chan result, 2)
		for range 2 {
			go func() {
				key, err := RotatePartnerTenantSubscriptionKey(tenant.Id, tenant.SecretHash, k.SubscriptionId, 1, partnerTenantHash("same-rotation"))
				results <- result{key, err}
			}()
		}
		first, second := <-results, <-results
		require.NoError(t, first.err)
		require.NoError(t, second.err)
		require.Equal(t, first.key, second.key)
		require.EqualValues(t, 2, first.key.KeyVersion)
		_, err := RotatePartnerTenantSubscriptionKey(tenant.Id, tenant.SecretHash, k.SubscriptionId, 1, partnerTenantHash("stale-version-new-intent"))
		require.ErrorIs(t, err, ErrPartnerTenantSubscriptionKeyChanged)
		_, err = RotatePartnerTenantSubscriptionKey(tenant.Id, tenant.SecretHash, k.SubscriptionId, 2, partnerTenantHash("same-rotation"))
		require.ErrorIs(t, err, ErrPartnerTenantIdempotencyConflict)
	})
	t.Run("reset unlimited exhaustion and absent binding never repaired", func(t *testing.T) {
		tenant, p := fixture(t)
		o, k := deliver(t, input(tenant, p, "cycle"))
		now := GetDBTimestamp()
		require.NoError(t, db.Model(&UserSubscription{}).Where("id = ?", k.SubscriptionId).Updates(map[string]any{"start_time": now - 70*86400, "last_reset_time": now - 40*86400, "next_reset_time": now - 5, "end_time": now + 40*86400, "amount_used": 123}).Error)
		view, err := QueryPartnerTenantSubscription(k.SubscriptionKey)
		require.NoError(t, err)
		require.Equal(t, "0", view.Quota.Used)
		require.Greater(t, view.Quota.NextResetTime, now)
		require.NoError(t, db.Model(&UserSubscription{}).Where("id = ?", k.SubscriptionId).Updates(map[string]any{"amount_total": 0, "amount_used": math.MaxInt64}).Error)
		view, err = QueryPartnerTenantSubscription(k.SubscriptionKey)
		require.NoError(t, err)
		require.True(t, view.Quota.Unlimited)
		require.True(t, view.Quota.Usable)
		require.Equal(t, "0", view.Quota.Remaining)
		require.NoError(t, db.Model(&UserSubscription{}).Where("id = ?", k.SubscriptionId).Updates(map[string]any{"amount_total": 1, "amount_used": 2}).Error)
		view, err = QueryPartnerTenantSubscription(k.SubscriptionKey)
		require.NoError(t, err)
		require.False(t, view.Quota.Usable)
		require.NotEmpty(t, view.APIKey)
		require.Equal(t, "0", view.Quota.Remaining)
		require.NoError(t, db.Model(&PartnerTenantSubscriptionAccessKey{}).Where("user_subscription_id = ?", k.SubscriptionId).Update("issued_order_id", o.Id+100000).Error)
		keys := count(t, &PartnerTenantSubscriptionAccessKey{})
		users := count(t, &User{})
		_, err = ClaimPartnerTenantSubscriptionKey(tenant.Id, tenant.SecretHash, o.OrderNo)
		require.ErrorIs(t, err, ErrPartnerTenantSubscriptionKeyNotFound)
		require.Error(t, FulfillPartnerTenantSubscriptionOrder(o.OrderNo))
		require.Equal(t, keys, count(t, &PartnerTenantSubscriptionAccessKey{}))
		require.Equal(t, users, count(t, &User{}))
	})
	t.Run("forbidden credentials plan scope membership and legacy contract", func(t *testing.T) {
		tenant, p := fixture(t)
		o, k := deliver(t, input(tenant, p, "disabled"))
		var a PartnerTenantAccount
		require.NoError(t, db.First(&a, o.AccountId).Error)
		member, err := IsPartnerTenantUser(a.UserId)
		require.NoError(t, err)
		require.True(t, member)
		_, err = GetTokenByKey(k.SubscriptionKey, false)
		require.ErrorIs(t, err, gorm.ErrRecordNotFound)
		foreign, fp := fixture(t)
		bad := input(foreign, fp, "cross-key")
		bad.SubscriptionKey = k.SubscriptionKey
		_, _, err = CreatePartnerTenantSubscriptionKeyOrder(bad, nil)
		require.ErrorIs(t, err, ErrPartnerTenantSubscriptionKeyInvalid)
		_, err = ClaimPartnerTenantSubscriptionKey(foreign.Id, foreign.SecretHash, o.OrderNo)
		require.ErrorIs(t, err, ErrPartnerTenantOrderNotFound)
		_, err = RotatePartnerTenantSubscriptionKey(foreign.Id, foreign.SecretHash, k.SubscriptionId, 1, partnerTenantHash("foreign"))
		require.ErrorIs(t, err, ErrPartnerTenantSubscriptionNotFound)
		for _, mutate := range []func() error{
			func() error { return db.Model(&PartnerTenantAccount{}).Where("id = ?", a.Id).Update("status", 2).Error },
			func() error { return db.Model(&User{}).Where("id = ?", a.UserId).Update("group", "wrong").Error },
			func() error {
				return db.Model(&Token{}).Where("id = ?", a.TokenId).Update("status", common.TokenStatusDisabled).Error
			},
			func() error {
				return db.Model(&Token{}).Where("id = ?", a.TokenId).Update("expired_time", GetDBTimestamp()-1).Error
			},
		} {
			require.NoError(t, mutate())
			_, err = QueryPartnerTenantSubscription(k.SubscriptionKey)
			require.Error(t, err)
			require.NoError(t, db.Model(&PartnerTenantAccount{}).Where("id = ?", a.Id).Update("status", 1).Error)
			require.NoError(t, db.Model(&User{}).Where("id = ?", a.UserId).Update("group", tenant.Group).Error)
			require.NoError(t, db.Model(&Token{}).Where("id = ?", a.TokenId).Updates(map[string]any{"status": common.TokenStatusEnabled, "expired_time": -1}).Error)
		}
		wrongPlan := input(tenant, fp, "foreign-plan")
		_, _, err = CreatePartnerTenantSubscriptionKeyOrder(wrongPlan, nil)
		require.ErrorIs(t, err, ErrPartnerTenantPlanNotFound)
		require.NoError(t, db.Model(p).Update("enabled", false).Error)
		_, _, err = CreatePartnerTenantSubscriptionKeyOrder(input(tenant, p, "disabled-plan"), nil)
		require.ErrorIs(t, err, ErrPartnerTenantPlanNotFound)
		require.NoError(t, db.Model(p).Update("enabled", true).Error)
		ext := PartnerTenantOrderInput{TenantId: tenant.Id, ExternalUserId: "legacy-buyer", PlanId: p.Id, PaymentMethod: "alipay", MerchantId: "test-merchant", IdempotencyHash: partnerTenantHash("external")}
		old, _, err := createPartnerTenantAcceptedOrderFixture(ext)
		require.NoError(t, err)
		pay(t, old)
		require.NoError(t, FulfillPartnerTenantSubscriptionOrder(old.OrderNo))
		_, err = ClaimPartnerTenantSubscriptionKey(tenant.Id, tenant.SecretHash, old.OrderNo)
		require.ErrorIs(t, err, ErrPartnerTenantOrderNotFound)
		_, err = ProvisionPartnerTenantAccount(tenant.Id, "legacy-buyer", "")
		require.ErrorIs(t, err, ErrPartnerTenantIntegrationMode)
		_, err = FindPartnerTenantOrderByIdempotency(tenant.Id, o.IdempotencyHash)
		require.ErrorIs(t, err, ErrPartnerTenantOrderNotFound)
		h5Tenant, _, err := CreatePartnerTenantWithIntegrationMode("H5", fmt.Sprintf("h5-%d", time.Now().UnixNano()), PartnerTenantIntegrationHostedH5)
		require.NoError(t, err)
		h5Plan := *p
		h5Plan.Id = 0
		h5Plan.PartnerTenantId = h5Tenant.Id
		h5Plan.ApplicableGroup = h5Tenant.Group
		require.NoError(t, db.Create(&h5Plan).Error)
		session, _, err := CreatePartnerTenantPurchaseSession(h5Tenant.Id, h5Tenant.SecretHash, "legacy-buyer", partnerTenantHash("h5-session"))
		require.NoError(t, err)
		redeemed, err := ExchangePartnerTenantPurchaseSession(session.SessionId, PartnerTenantPurchaseLaunchCode(session), strings.Repeat("a", 64), GetDBTimestamp())
		require.NoError(t, err)
		h5, _, err := CreatePartnerTenantPurchaseOrder(session.SessionId, PartnerTenantPurchaseAccessToken(redeemed), h5Plan.Id, "alipay", "test-merchant", nil)
		require.NoError(t, err)
		require.Equal(t, PartnerTenantIdentityExternal, h5.EntryMode)
		keysBefore := count(t, &PartnerTenantSubscriptionAccessKey{})
		pay(t, h5)
		require.NoError(t, FulfillPartnerTenantSubscriptionOrder(h5.OrderNo))
		require.Equal(t, keysBefore, count(t, &PartnerTenantSubscriptionAccessKey{}))
	})
	t.Run("lock wait revalidates current merchant and strict token clock", func(t *testing.T) {
		tenant, p := fixture(t)
		o, k := deliver(t, input(tenant, p, "locks"))
		waitForLock := func() {
			require.Eventually(t, func() bool {
				var n int64
				err := db.Raw("SELECT count(*) FROM pg_stat_activity WHERE application_name = current_setting('application_name') AND wait_event_type = 'Lock'").Scan(&n).Error
				return err == nil && n > 0
			}, 5*time.Second, 10*time.Millisecond)
		}
		held := db.Begin()
		require.NoError(t, held.Error)
		defer held.Rollback()
		var row PartnerTenant
		require.NoError(t, lockForUpdate(held).First(&row, tenant.Id).Error)
		done := make(chan error, 1)
		go func() {
			_, _, err := CreatePartnerTenantSubscriptionKeyOrder(input(tenant, p, "stale-pt"), nil)
			done <- err
		}()
		waitForLock()
		newHash := partnerTenantHash("rotated-merchant")
		require.NoError(t, held.Model(&row).Update("secret_hash", newHash).Error)
		require.NoError(t, held.Commit().Error)
		require.ErrorIs(t, <-done, ErrPartnerTenantNotFound)
		tenant.SecretHash = newHash
		// A query located by an old hash before waiting must re-check the current
		// row after a committed rotation rather than trusting the pre-read.
		held = db.Begin()
		defer held.Rollback()
		require.NoError(t, lockForUpdate(held).First(&row, tenant.Id).Error)
		go func() { _, err := QueryPartnerTenantSubscription(k.SubscriptionKey); done <- err }()
		waitForLock()
		var keyRow PartnerTenantSubscriptionAccessKey
		require.NoError(t, lockForUpdate(held).Where("user_subscription_id = ?", k.SubscriptionId).First(&keyRow).Error)
		keyRow.KeyVersion++
		current, err := replacePartnerTenantSubscriptionSeed(&keyRow)
		require.NoError(t, err)
		require.NoError(t, held.Save(&keyRow).Error)
		require.NoError(t, held.Commit().Error)
		require.ErrorIs(t, <-done, ErrPartnerTenantSubscriptionKeyInvalid)
		k.SubscriptionKey = current
		var a PartnerTenantAccount
		require.NoError(t, db.First(&a, o.AccountId).Error)
		held = db.Begin()
		defer held.Rollback()
		var token Token
		require.NoError(t, lockForUpdate(held).First(&token, a.TokenId).Error)
		go func() { _, err := QueryPartnerTenantSubscription(k.SubscriptionKey); done <- err }()
		waitForLock()
		require.NoError(t, held.Model(&token).Update("expired_time", GetDBTimestamp()-1).Error)
		require.NoError(t, held.Commit().Error)
		require.ErrorIs(t, <-done, ErrPartnerTenantCredentialUnavailable)
	})
}
