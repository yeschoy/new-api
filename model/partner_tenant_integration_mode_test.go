package model

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupPartnerTenantAccessModePQ(t *testing.T) *gorm.DB {
	return setupPartnerTenantIsolatedPQ(t, os.Getenv("TEST_PARTNER_ACCESS_AUDIT_POSTGRES_DSN"), "pt_access_mode_model_")
}

func TestPartnerTenantAccessModeMigration(t *testing.T) {
	t.Run("fresh", func(t *testing.T) {
		db := setupPartnerTenantAccessModePQ(t)
		require.NoError(t, MigratePartnerTenantIntegrationModes(db))
		tenant, _, err := CreatePartnerTenant("default", "fresh")
		require.NoError(t, err)
		require.Equal(t, PartnerTenantIntegrationSubscriptionKey, tenant.IntegrationMode)
		// SQL insertion, not GORM's zero-value default substitution.
		require.NoError(t, db.Exec(`INSERT INTO partner_tenants(name,"group",secret_hash) VALUES ('sql','sql',?)`, strings.Repeat("a", 64)).Error)
		var stored PartnerTenant
		require.NoError(t, db.Where("name = ?", "sql").First(&stored).Error)
		require.Equal(t, PartnerTenantIntegrationSubscriptionKey, stored.IntegrationMode)
		require.Error(t, db.Exec(`INSERT INTO partner_tenants(name,"group",secret_hash,integration_mode) VALUES ('null','null',?,NULL)`, strings.Repeat("b", 64)).Error)
		for _, bad := range []string{"", "legacy", "external", "unknown"} {
			_, _, err = CreatePartnerTenantWithIntegrationMode("invalid", bad, bad)
			require.ErrorIs(t, err, ErrPartnerTenantIntegrationMode)
		}
	})
	t.Run("pre-column upgrade nullable empty repeat preserve payment identity", func(t *testing.T) {
		db := setupPartnerTenantAccessModePQ(t)
		require.NoError(t, db.Exec(`CREATE TABLE partner_tenants(id bigserial PRIMARY KEY,name varchar(64) NOT NULL,"group" varchar(64) NOT NULL UNIQUE,secret_hash char(64) NOT NULL UNIQUE,status bigint DEFAULT 1,created_at bigint,updated_at bigint)`).Error)
		require.NoError(t, db.Exec(`INSERT INTO partner_tenants(name,"group",secret_hash) VALUES ('legacy','legacy',?)`, strings.Repeat("c", 64)).Error)
		require.NoError(t, db.AutoMigrate(&User{}, &Token{}, &SubscriptionPlan{}, &UserSubscription{}, &PartnerTenantPurchaseSession{}))
		require.NoError(t, MigratePartnerTenantSubscriptionKeys(db))
		order := &PartnerTenantSubscriptionOrder{TenantId: 1, OrderNo: "preserved", IdempotencyHash: partnerTenantHash("preserved"), RequestHash: partnerTenantHash("request"), ExternalUserId: "buyer", ExternalUserHash: partnerTenantHash("buyer"), EntryMode: PartnerTenantIdentityExternal, PlanId: 7, PlanTitle: "paid", PlanSnapshot: "{}", AmountCents: 999, Currency: "CNY", PaymentStatus: "paid", FulfillmentStatus: "failed_retryable", PaymentProvider: PaymentProviderEpay, PaymentMethod: "alipay", MerchantId: "fixture"}
		require.NoError(t, db.Create(order).Error)
		legacyAccount := &PartnerTenantAccount{TenantId: 1, ExternalUserId: "buyer", ExternalUserIdHash: partnerTenantHash("buyer"), IdentitySource: PartnerTenantIdentityExternal, UserId: 7, TokenId: 7, Status: 1}
		require.NoError(t, db.Create(legacyAccount).Error)
		require.NoError(t, MigratePartnerTenantIntegrationModes(db))
		h5, _, err := CreatePartnerTenantWithIntegrationMode("H5", "h5", PartnerTenantIntegrationHostedH5)
		require.NoError(t, err)
		require.NoError(t, db.Exec(`ALTER TABLE partner_tenants ALTER COLUMN integration_mode DROP NOT NULL`).Error)
		require.NoError(t, db.Exec(`UPDATE partner_tenants SET integration_mode=NULL WHERE id=1`).Error)
		require.NoError(t, MigratePartnerTenantIntegrationModes(db))
		require.NoError(t, db.Model(&PartnerTenant{}).Where("id = ?", 1).Update("integration_mode", "").Error)
		for range 2 {
			require.NoError(t, MigratePartnerTenantIntegrationModes(db))
		}
		legacy, err := GetPartnerTenantById(1)
		require.NoError(t, err)
		require.Equal(t, PartnerTenantIntegrationSubscriptionKey, legacy.IntegrationMode)
		explicit, err := GetPartnerTenantById(h5.Id)
		require.NoError(t, err)
		require.Equal(t, PartnerTenantIntegrationHostedH5, explicit.IntegrationMode)
		preserved, err := GetPartnerTenantSubscriptionOrder(1, order.OrderNo)
		require.NoError(t, err)
		require.Equal(t, order.EntryMode, preserved.EntryMode)
		require.Equal(t, "buyer", preserved.ExternalUserId)
		require.Equal(t, "paid", preserved.PaymentStatus)
		require.EqualValues(t, 999, preserved.AmountCents)
		var preservedAccount PartnerTenantAccount
		require.NoError(t, db.First(&preservedAccount, legacyAccount.Id).Error)
		require.Equal(t, legacyAccount.IdentitySource, preservedAccount.IdentitySource)
		require.Equal(t, legacyAccount.ExternalUserIdHash, preservedAccount.ExternalUserIdHash)
		require.Equal(t, legacyAccount.UserId, preservedAccount.UserId)
		require.Equal(t, legacyAccount.TokenId, preservedAccount.TokenId)
		require.NoError(t, db.Model(h5).Update("integration_mode", "unexpected").Error)
		require.NoError(t, MigratePartnerTenantIntegrationModes(db))
		unexpected, err := GetPartnerTenantById(h5.Id)
		require.NoError(t, err)
		require.Equal(t, "unexpected", unexpected.IntegrationMode)
		require.ErrorIs(t, RequirePartnerTenantIntegrationMode(unexpected, PartnerTenantOperationHostedH5), ErrPartnerTenantIntegrationMode)
		require.True(t, db.Migrator().HasIndex(&PartnerTenant{}, "idx_partner_tenants_group"))
	})
}

func TestPartnerTenantAccessModeEntryAndPaidRecovery(t *testing.T) {
	db := setupPartnerTenantAccessModePQ(t)
	require.NoError(t, MigratePartnerTenantIntegrationModes(db))
	require.NoError(t, db.AutoMigrate(&User{}, &Token{}, &SubscriptionPlan{}, &UserSubscription{}, &PartnerTenantPurchaseSession{}))
	require.NoError(t, MigratePartnerTenantSubscriptionKeys(db))
	fixture := func(mode string) (*PartnerTenant, *SubscriptionPlan) {
		tenant, _, err := CreatePartnerTenantWithIntegrationMode("fixture", fmt.Sprint(time.Now().UnixNano()), mode)
		require.NoError(t, err)
		plan := &SubscriptionPlan{Title: "Monthly", PartnerTenantId: tenant.Id, Enabled: true, Currency: "CNY", PriceAmount: 9.99, DurationUnit: "month", DurationValue: 1, QuotaResetPeriod: "monthly", ApplicableGroup: tenant.Group, AllowWalletOverflow: common.GetPointer(false), TotalAmount: 9007199254740993}
		require.NoError(t, db.Create(plan).Error)
		return tenant, plan
	}
	sub, sp := fixture(PartnerTenantIntegrationSubscriptionKey)
	h5, hp := fixture(PartnerTenantIntegrationHostedH5)
	input := func(tenant *PartnerTenant, plan *SubscriptionPlan, key string) PartnerTenantSubscriptionKeyOrderInput {
		return PartnerTenantSubscriptionKeyOrderInput{TenantId: tenant.Id, TenantSecretHash: tenant.SecretHash, PlanId: plan.Id, PaymentMethod: "alipay", MerchantId: "fixture", IdempotencyHash: partnerTenantHash(key)}
	}
	calls := 0
	_, _, err := CreatePartnerTenantSubscriptionKeyOrder(input(h5, hp, "wrong"), func() error { calls++; return nil })
	require.ErrorIs(t, err, ErrPartnerTenantIntegrationMode)
	_, err = GetPartnerTenantSubscriptionKeyOrder(h5.Id, h5.SecretHash, "unknown")
	require.ErrorIs(t, err, ErrPartnerTenantIntegrationMode)
	_, err = ClaimPartnerTenantSubscriptionKey(h5.Id, h5.SecretHash, "unknown")
	require.ErrorIs(t, err, ErrPartnerTenantIntegrationMode)
	_, err = RotatePartnerTenantSubscriptionKey(h5.Id, h5.SecretHash, 1, 1, partnerTenantHash("rotate"))
	require.ErrorIs(t, err, ErrPartnerTenantIntegrationMode)
	_, _, err = CreatePartnerTenantPurchaseSession(sub.Id, sub.SecretHash, "buyer", partnerTenantHash("wrong"))
	require.ErrorIs(t, err, ErrPartnerTenantIntegrationMode)
	_, err = ProvisionPartnerTenantHostedAccount(sub.Id, sub.SecretHash, "buyer", "")
	require.ErrorIs(t, err, ErrPartnerTenantIntegrationMode)
	_, err = GetPartnerTenantHostedQuota(sub.Id, sub.SecretHash, "buyer")
	require.ErrorIs(t, err, ErrPartnerTenantIntegrationMode)
	_, err = GetPartnerTenantHostedOrder(sub.Id, sub.SecretHash, "unknown")
	require.ErrorIs(t, err, ErrPartnerTenantIntegrationMode)
	for _, tenant := range []*PartnerTenant{sub, h5} {
		_, _, err = CreatePartnerTenantSubscriptionOrder(PartnerTenantOrderInput{TenantId: tenant.Id})
		require.ErrorIs(t, err, ErrPartnerTenantIntegrationMode)
	}
	require.Zero(t, calls)
	for _, table := range []any{&User{}, &PartnerTenantSubscriptionOrder{}, &PartnerTenantPurchaseSession{}, &PartnerTenantSubscriptionAccessKey{}} {
		var n int64
		require.NoError(t, db.Model(table).Count(&n).Error)
		require.Zero(t, n)
	}
	// Buyer-ID-free paid purchase and same-subscription renewal.
	o, _, err := CreatePartnerTenantSubscriptionKeyOrder(input(sub, sp, "allowed"), nil)
	require.NoError(t, err)
	require.Empty(t, o.ExternalUserId)
	require.Zero(t, o.AccountId)
	pay := func(o *PartnerTenantSubscriptionOrder) {
		require.NoError(t, RecordPartnerTenantPayment(o.OrderNo, PaymentProviderEpay, o.MerchantId, o.PaymentMethod, "tx-"+o.OrderNo, o.AmountCents))
		require.NoError(t, FulfillPartnerTenantSubscriptionOrder(o.OrderNo))
	}
	pay(o)
	key, err := ClaimPartnerTenantSubscriptionKey(sub.Id, sub.SecretHash, o.OrderNo)
	require.NoError(t, err)
	query, err := QueryPartnerTenantSubscription(key.SubscriptionKey)
	require.NoError(t, err)
	require.NotNil(t, query)
	require.Equal(t, "9007199254740993", query.Quota.Total)
	require.NotEmpty(t, query.APIKey)
	renewal := input(sub, sp, "renewal")
	renewal.SubscriptionKey = key.SubscriptionKey
	r, _, err := CreatePartnerTenantSubscriptionKeyOrder(renewal, nil)
	require.NoError(t, err)
	pay(r)
	stored, err := GetPartnerTenantSubscriptionOrder(sub.Id, r.OrderNo)
	require.NoError(t, err)
	require.Equal(t, key.SubscriptionId, stored.SubscriptionId)
	accepted, _, err := CreatePartnerTenantSubscriptionKeyOrder(input(sub, sp, "accepted-before-policy-drift"), nil)
	require.NoError(t, err)
	// Only corrupt test DB directly to simulate a stale precheck; admin cannot switch.
	require.NoError(t, db.Model(sub).Update("integration_mode", PartnerTenantIntegrationHostedH5).Error)
	pay(accepted) // new paid identity delivery is not an admission operation.
	_, err = QueryPartnerTenantSubscription(key.SubscriptionKey)
	require.ErrorIs(t, err, ErrPartnerTenantIntegrationMode)
	_, _, err = CreatePartnerTenantSubscriptionKeyOrder(input(sub, sp, "allowed"), nil)
	require.ErrorIs(t, err, ErrPartnerTenantIntegrationMode)
	require.NoError(t, db.Model(sub).Update("integration_mode", PartnerTenantIntegrationSubscriptionKey).Error)
	// H5 identity + one original order, support, cashier-neutral late delivery.
	s, _, err := CreatePartnerTenantPurchaseSession(h5.Id, h5.SecretHash, "外部买家", partnerTenantHash("session"))
	require.NoError(t, err)
	s, err = ExchangePartnerTenantPurchaseSession(s.SessionId, PartnerTenantPurchaseLaunchCode(s), strings.Repeat("a", 64), GetDBTimestamp())
	require.NoError(t, err)
	token := PartnerTenantPurchaseAccessToken(s)
	ho, _, err := CreatePartnerTenantPurchaseOrder(s.SessionId, token, hp.Id, "alipay", "fixture", nil)
	require.NoError(t, err)
	require.NoError(t, db.Model(h5).Update("integration_mode", PartnerTenantIntegrationSubscriptionKey).Error)
	_, err = ExchangePartnerTenantPurchaseSession(s.SessionId, PartnerTenantPurchaseLaunchCode(s), strings.Repeat("a", 64), GetDBTimestamp())
	require.ErrorIs(t, err, ErrPartnerTenantPurchaseAccess)
	_, _, err = AuthorizePartnerTenantPurchaseSession(s.SessionId, token, GetDBTimestamp())
	require.ErrorIs(t, err, ErrPartnerTenantPurchaseAccess)
	_, _, err = CreatePartnerTenantPurchaseOrder(s.SessionId, token, hp.Id, "alipay", "fixture", func() error { calls++; return nil })
	require.ErrorIs(t, err, ErrPartnerTenantPurchaseAccess)
	require.Zero(t, calls)
	require.NoError(t, db.Model(ho).Update("expires_at", GetDBTimestamp()-1).Error)
	pay(ho) // Already accepted payment must not be stranded by admission.
	require.NoError(t, FulfillPartnerTenantSubscriptionOrder(ho.OrderNo))
	require.NoError(t, db.Model(h5).Update("integration_mode", PartnerTenantIntegrationHostedH5).Error)
	_, err = ProvisionPartnerTenantHostedAccount(h5.Id, h5.SecretHash, "外部买家", "")
	require.NoError(t, err)
	quota, err := GetPartnerTenantHostedQuota(h5.Id, h5.SecretHash, "外部买家")
	require.NoError(t, err)
	require.Len(t, quota, 1)
	_, err = GetPartnerTenantHostedPurchaseSession(h5.Id, h5.SecretHash, s.SessionId)
	require.NoError(t, err)
	_, err = GetPartnerTenantHostedOrder(h5.Id, h5.SecretHash, ho.OrderNo)
	require.NoError(t, err)
	// Status/rotation never modify mode, and bad persisted values fail closed.
	require.NoError(t, UpdatePartnerTenantStatus(h5.Id, PartnerTenantStatusDisabled))
	_, err = RotatePartnerTenantSecret(h5.Id)
	require.NoError(t, err)
	current, err := GetPartnerTenantById(h5.Id)
	require.NoError(t, err)
	require.Equal(t, PartnerTenantIntegrationHostedH5, current.IntegrationMode)
	for _, bad := range []string{"", "unknown"} {
		current.IntegrationMode = bad
		require.ErrorIs(t, RequirePartnerTenantIntegrationMode(current, PartnerTenantOperationCatalog), ErrPartnerTenantIntegrationMode)
	}
}

func TestPartnerTenantAccessModeTenantLock(t *testing.T) {
	db := setupPartnerTenantAccessModePQ(t)
	require.NoError(t, MigratePartnerTenantIntegrationModes(db))
	tenant, _, err := CreatePartnerTenant("lock", "lock")
	require.NoError(t, err)
	// Force the request to wait for a Tenant lock; changing the DB behind the
	// stale request snapshot must be observed before any missing-table lookup.
	tx := db.Begin()
	require.NoError(t, tx.Error)
	t.Cleanup(func() { _ = tx.Rollback().Error })
	var locked PartnerTenant
	require.NoError(t, lockForUpdate(tx).First(&locked, tenant.Id).Error)
	require.NoError(t, tx.Model(&locked).Update("integration_mode", PartnerTenantIntegrationHostedH5).Error)
	result := make(chan error, 1)
	go func() {
		_, _, err := CreatePartnerTenantSubscriptionKeyOrder(PartnerTenantSubscriptionKeyOrderInput{TenantId: tenant.Id, TenantSecretHash: tenant.SecretHash, PlanId: 1, PaymentMethod: "alipay", MerchantId: "fixture", IdempotencyHash: strings.Repeat("a", 64)}, nil)
		result <- err
	}()
	select {
	case err := <-result:
		require.FailNow(t, "request did not wait for tenant lock", fmt.Sprint(err))
	case <-time.After(100 * time.Millisecond):
	}
	require.NoError(t, tx.Commit().Error)
	select {
	case err := <-result:
		require.True(t, errors.Is(err, ErrPartnerTenantIntegrationMode), fmt.Sprint(err))
	case <-time.After(5 * time.Second):
		t.Fatal("tenant lock waiter did not complete")
	}
}

func TestPartnerTenantAccessModeH5TenantLock(t *testing.T) {
	db := setupPartnerTenantAccessModePQ(t)
	require.NoError(t, MigratePartnerTenantIntegrationModes(db))
	require.NoError(t, db.AutoMigrate(&PartnerTenantPurchaseSession{}))
	tenant, _, err := CreatePartnerTenantWithIntegrationMode("h5-lock", "h5-lock", PartnerTenantIntegrationHostedH5)
	require.NoError(t, err)
	session, _, err := CreatePartnerTenantPurchaseSession(tenant.Id, tenant.SecretHash, "buyer", strings.Repeat("a", 64))
	require.NoError(t, err)
	session, err = ExchangePartnerTenantPurchaseSession(session.SessionId, PartnerTenantPurchaseLaunchCode(session), strings.Repeat("a", 64), GetDBTimestamp())
	require.NoError(t, err)
	token := PartnerTenantPurchaseAccessToken(session)
	// Stale public precheck is valid before waiting for the actual order lock.
	_, _, err = AuthorizePartnerTenantPurchaseSession(session.SessionId, token, GetDBTimestamp())
	require.NoError(t, err)
	tx := db.Begin()
	require.NoError(t, tx.Error)
	t.Cleanup(func() { _ = tx.Rollback().Error })
	var locked PartnerTenant
	require.NoError(t, lockForUpdate(tx).First(&locked, tenant.Id).Error)
	require.NoError(t, tx.Model(&locked).Update("integration_mode", PartnerTenantIntegrationSubscriptionKey).Error)
	result := make(chan error, 1)
	go func() {
		_, _, err := CreatePartnerTenantPurchaseOrder(session.SessionId, token, 1, "alipay", "fixture", nil)
		result <- err
	}()
	select {
	case err := <-result:
		require.FailNow(t, "H5 request did not wait for tenant lock", fmt.Sprint(err))
	case <-time.After(100 * time.Millisecond):
	}
	require.NoError(t, tx.Commit().Error)
	select {
	case err := <-result:
		require.ErrorIs(t, err, ErrPartnerTenantPurchaseAccess)
	case <-time.After(5 * time.Second):
		t.Fatal("H5 lock waiter did not complete")
	}
}
