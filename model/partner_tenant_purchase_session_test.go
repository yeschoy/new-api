package model

import (
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// Runs inside the existing paid-order database matrix so its isolated empty DB
// requirement, PostgreSQL target and MySQL clientFoundRows variant stay intact.
// Like every Go test in this area this MUST only execute in task-owned Docker.
func runPartnerTenantPurchaseSessionDatabaseTests(t *testing.T, db *gorm.DB) {
	t.Helper()
	t.Run("purchase session additive fresh and repeat migration", func(t *testing.T) {
		require.False(t, db.Migrator().HasTable(&PartnerTenantPurchaseSession{}))
		var beforeAccounts, beforeOrders int64
		require.NoError(t, db.Model(&PartnerTenantAccount{}).Count(&beforeAccounts).Error)
		require.NoError(t, db.Model(&PartnerTenantSubscriptionOrder{}).Count(&beforeOrders).Error)
		for range 2 {
			require.NoError(t, db.AutoMigrate(&PartnerTenantPurchaseSession{}))
		}
		require.True(t, db.Migrator().HasIndex(&PartnerTenantPurchaseSession{}, "idx_pt_purchase_request"))
		require.True(t, db.Migrator().HasColumn(&PartnerTenantPurchaseSession{}, "ClientNonceHash"))
		require.False(t, db.Migrator().HasColumn(&PartnerTenantPurchaseSession{}, "order_id"))
		var afterAccounts, afterOrders int64
		require.NoError(t, db.Model(&PartnerTenantAccount{}).Count(&afterAccounts).Error)
		require.NoError(t, db.Model(&PartnerTenantSubscriptionOrder{}).Count(&afterOrders).Error)
		require.Equal(t, beforeAccounts, afterAccounts)
		require.Equal(t, beforeOrders, afterOrders)
		var legacy PartnerTenantAccount
		require.NoError(t, db.Where("tenant_id = ?", 99999).First(&legacy).Error)
		require.Equal(t, "Legacy-Customer", legacy.ExternalUserId)
	})
	var fixtureSequence int64
	fixture := func(t *testing.T) *PartnerTenant {
		t.Helper()
		tenant, _, err := CreatePartnerTenant("Purchase", fmt.Sprintf("purchase-%s-%d", db.Dialector.Name(), common.GetTimestamp()+fixtureSequence))
		fixtureSequence++
		require.NoError(t, err)
		return tenant
	}
	create := func(t *testing.T, tenant *PartnerTenant, buyer, key string) *PartnerTenantPurchaseSession {
		t.Helper()
		s, created, err := CreatePartnerTenantPurchaseSession(tenant.Id, tenant.SecretHash, buyer, partnerTenantHash(key))
		require.NoError(t, err)
		require.True(t, created)
		return s
	}
	t.Run("purchase creation replay buyer case conflict and no provisioning", func(t *testing.T) {
		tenant := fixture(t)
		s := create(t, tenant, "Buyer", "intent")
		require.True(t, IsValidPartnerTenantPurchaseSessionID(s.SessionId))
		require.Equal(t, s.CreatedAt+300, s.LaunchExpiresAt)
		require.Equal(t, s.CreatedAt+1800, s.ExpiresAt)
		replay, created, err := CreatePartnerTenantPurchaseSession(tenant.Id, tenant.SecretHash, "Buyer", partnerTenantHash("intent"))
		require.NoError(t, err)
		require.False(t, created)
		require.Equal(t, s, replay)
		_, _, err = CreatePartnerTenantPurchaseSession(tenant.Id, tenant.SecretHash, "buyer", partnerTenantHash("intent"))
		require.ErrorIs(t, err, ErrPartnerTenantIdempotencyConflict)
		other := fixture(t)
		_, err = GetPartnerTenantPurchaseSession(other.Id, s.SessionId)
		require.ErrorIs(t, err, ErrPartnerTenantPurchaseSessionNotFound)
		alias := s.SessionId[:3] + strings.ToLower(s.SessionId[3:])
		if alias == s.SessionId {
			alias = s.SessionId[:3] + strings.ToUpper(s.SessionId[3:])
		}
		if alias != s.SessionId {
			_, err = GetPartnerTenantPurchaseSession(tenant.Id, alias)
			require.ErrorIs(t, err, ErrPartnerTenantPurchaseSessionNotFound)
		}
		var accounts, orders int64
		require.NoError(t, db.Model(&PartnerTenantAccount{}).Where("tenant_id = ?", tenant.Id).Count(&accounts).Error)
		require.NoError(t, db.Model(&PartnerTenantSubscriptionOrder{}).Where("tenant_id = ?", tenant.Id).Count(&orders).Error)
		require.Zero(t, accounts)
		require.Zero(t, orders)
		// Browser expiry never prevents current merchant reconciliation or makes
		// an exact create retry silently extend either absolute deadline.
		require.NoError(t, db.Model(s).Updates(map[string]any{"launch_expires_at": 1, "expires_at": 2}).Error)
		replay, created, err = CreatePartnerTenantPurchaseSession(tenant.Id, tenant.SecretHash, "Buyer", partnerTenantHash("intent"))
		require.NoError(t, err)
		require.False(t, created)
		require.EqualValues(t, 2, replay.ExpiresAt)
		_, err = GetPartnerTenantPurchaseSession(tenant.Id, s.SessionId)
		require.NoError(t, err)
	})
	t.Run("purchase session concurrent same-key creation", func(t *testing.T) {
		tenant := fixture(t)
		var wg sync.WaitGroup
		type result struct {
			session *PartnerTenantPurchaseSession
			created bool
			err     error
		}
		results := make(chan result, 8)
		for range 8 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				s, c, e := CreatePartnerTenantPurchaseSession(tenant.Id, tenant.SecretHash, "buyer", partnerTenantHash("shared-intent"))
				results <- result{s, c, e}
			}()
		}
		wg.Wait()
		close(results)
		id, inserted := "", 0
		for r := range results {
			require.NoError(t, r.err)
			if id == "" {
				id = r.session.SessionId
			}
			require.Equal(t, id, r.session.SessionId)
			if r.created {
				inserted++
			}
		}
		require.Equal(t, 1, inserted)
	})
	t.Run("purchase nonce exchange retry concurrency purpose expiry and revocation", func(t *testing.T) {
		tenant := fixture(t)
		s := create(t, tenant, "buyer", "launch")
		launch, now := PartnerTenantPurchaseLaunchCode(s), s.CreatedAt+1
		nonce := strings.Repeat("a", 64)
		redeemed, err := ExchangePartnerTenantPurchaseSession(s.SessionId, launch, nonce, now)
		require.NoError(t, err)
		token := PartnerTenantPurchaseAccessToken(redeemed)
		// Repeated migrations preserve issued capability state, not only rows
		// in the older account/order tables.
		require.NoError(t, db.AutoMigrate(&PartnerTenantPurchaseSession{}))
		persisted, err := GetPartnerTenantPurchaseSession(tenant.Id, s.SessionId)
		require.NoError(t, err)
		require.Equal(t, token, PartnerTenantPurchaseAccessToken(persisted))
		retry, err := ExchangePartnerTenantPurchaseSession(s.SessionId, launch, nonce, now+1)
		require.NoError(t, err)
		require.Equal(t, redeemed.RedeemedAt, retry.RedeemedAt)
		require.Equal(t, token, PartnerTenantPurchaseAccessToken(retry))
		previousCryptoSecret := common.CryptoSecret
		t.Cleanup(func() { common.CryptoSecret = previousCryptoSecret })
		common.CryptoSecret = previousCryptoSecret + "-rotated"
		_, _, err = AuthorizePartnerTenantPurchaseSession(s.SessionId, token, now)
		require.ErrorIs(t, err, ErrPartnerTenantPurchaseAccess)
		_, err = ExchangePartnerTenantPurchaseSession(s.SessionId, launch, nonce, now)
		require.ErrorIs(t, err, ErrPartnerTenantPurchaseAccess)
		common.CryptoSecret = previousCryptoSecret
		require.Equal(t, token, PartnerTenantPurchaseAccessToken(retry), "same stable signing secret across replicas/restarts")
		_, err = ExchangePartnerTenantPurchaseSession(s.SessionId, launch, strings.Repeat("b", 64), now)
		require.ErrorIs(t, err, ErrPartnerTenantPurchaseAccess)
		_, err = ExchangePartnerTenantPurchaseSession(s.SessionId, token, nonce, now)
		require.ErrorIs(t, err, ErrPartnerTenantPurchaseAccess)
		_, err = ExchangePartnerTenantPurchaseSession(s.SessionId, launch, nonce, s.LaunchExpiresAt)
		require.ErrorIs(t, err, ErrPartnerTenantPurchaseAccess)
		_, _, err = AuthorizePartnerTenantPurchaseSession(s.SessionId, token, s.LaunchExpiresAt+1)
		require.NoError(t, err, "session survives launch deadline")
		for _, wrong := range []string{launch, "pc_" + token[3:], "ps_" + strings.Repeat("0", 64)} {
			_, _, err = AuthorizePartnerTenantPurchaseSession(s.SessionId, wrong, now)
			require.ErrorIs(t, err, ErrPartnerTenantPurchaseAccess)
		}
		_, _, err = AuthorizePartnerTenantPurchaseSession(s.SessionId, token, s.ExpiresAt)
		require.ErrorIs(t, err, ErrPartnerTenantPurchaseAccess)
		other := create(t, tenant, "other-buyer", "other")
		_, _, err = AuthorizePartnerTenantPurchaseSession(other.SessionId, token, now)
		require.ErrorIs(t, err, ErrPartnerTenantPurchaseAccess)
		require.NoError(t, UpdatePartnerTenantStatus(tenant.Id, PartnerTenantStatusDisabled))
		_, _, err = AuthorizePartnerTenantPurchaseSession(s.SessionId, token, now)
		require.ErrorIs(t, err, ErrPartnerTenantPurchaseAccess)
		_, err = ExchangePartnerTenantPurchaseSession(s.SessionId, launch, nonce, now)
		require.ErrorIs(t, err, ErrPartnerTenantPurchaseAccess)
		require.NoError(t, UpdatePartnerTenantStatus(tenant.Id, PartnerTenantStatusEnabled))
		_, err = RotatePartnerTenantSecret(tenant.Id)
		require.NoError(t, err)
		_, _, err = AuthorizePartnerTenantPurchaseSession(s.SessionId, token, now)
		require.ErrorIs(t, err, ErrPartnerTenantPurchaseAccess)
		_, err = ExchangePartnerTenantPurchaseSession(s.SessionId, launch, nonce, now)
		require.ErrorIs(t, err, ErrPartnerTenantPurchaseAccess)
		_, err = GetPartnerTenantPurchaseSession(tenant.Id, s.SessionId)
		require.NoError(t, err)

		concurrent := create(t, fixture(t), "concurrent", "race")
		var wg sync.WaitGroup
		type result struct {
			nonce   string
			session *PartnerTenantPurchaseSession
			err     error
		}
		results := make(chan result, 8)
		for i := range 8 {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				n := strings.Repeat(fmt.Sprintf("%x", i%2), 64)
				r, err := ExchangePartnerTenantPurchaseSession(concurrent.SessionId, PartnerTenantPurchaseLaunchCode(concurrent), n, concurrent.CreatedAt+1)
				results <- result{n, r, err}
			}(i)
		}
		wg.Wait()
		close(results)
		winner, successes := "", 0
		for result := range results {
			if result.err != nil {
				require.ErrorIs(t, result.err, ErrPartnerTenantPurchaseAccess)
				continue
			}
			if winner == "" {
				winner = result.nonce
			}
			require.Equal(t, winner, result.nonce)
			require.NotEmpty(t, PartnerTenantPurchaseAccessToken(result.session))
			successes++
		}
		require.Equal(t, 4, successes, "all retries of only the winning nonce succeed")
	})
	t.Run("purchase creation serialized budget and exact retry", func(t *testing.T) {
		tenant := fixture(t)
		var first *PartnerTenantPurchaseSession
		for i := range 20 {
			s := create(t, tenant, "budget-buyer", fmt.Sprintf("budget-%d", i))
			if i == 0 {
				first = s
			}
		}
		_, _, err := CreatePartnerTenantPurchaseSession(tenant.Id, tenant.SecretHash, "budget-buyer", partnerTenantHash("over"))
		require.ErrorIs(t, err, ErrPartnerTenantOrderLimited)
		retry, created, err := CreatePartnerTenantPurchaseSession(tenant.Id, tenant.SecretHash, "budget-buyer", first.IdempotencyHash)
		require.NoError(t, err)
		require.False(t, created)
		require.Equal(t, first.SessionId, retry.SessionId)
		// Tenant-wide budget includes all buyers; bulk fixtures don't create any
		// account, key or order and cannot affect another tenant's budget.
		rows := make([]PartnerTenantPurchaseSession, 1980)
		for i := range rows {
			rows[i] = PartnerTenantPurchaseSession{SessionId: fmt.Sprintf("PPS%032d", i), TenantId: tenant.Id, ExternalUserId: "another", ExternalUserHash: partnerTenantHash("another"), TenantSecretHash: tenant.SecretHash, IdempotencyHash: partnerTenantHash(fmt.Sprintf("bulk-%d", i)), RequestHash: partnerTenantHash("another"), CreatedAt: first.CreatedAt, LaunchExpiresAt: first.LaunchExpiresAt, ExpiresAt: first.ExpiresAt}
		}
		require.NoError(t, db.CreateInBatches(rows, 100).Error)
		_, _, err = CreatePartnerTenantPurchaseSession(tenant.Id, tenant.SecretHash, "new-buyer", partnerTenantHash("tenant-over"))
		require.ErrorIs(t, err, ErrPartnerTenantOrderLimited)
	})
	t.Run("purchase order authority uses current clock after tenant lock wait", func(t *testing.T) {
		if db.Dialector.Name() == "sqlite" {
			t.Skip("single-connection SQLite harness cannot hold a row lock on a second connection")
		}
		for _, replay := range []bool{false, true} {
			t.Run(fmt.Sprintf("replay=%t", replay), func(t *testing.T) {
				tenant := fixture(t)
				s := create(t, tenant, "lock-buyer", "lock-intent")
				var err error
				s, err = ExchangePartnerTenantPurchaseSession(s.SessionId, PartnerTenantPurchaseLaunchCode(s), strings.Repeat("a", 64), common.GetTimestamp())
				require.NoError(t, err)
				plan := &SubscriptionPlan{Title: "Lock wait", PartnerTenantId: tenant.Id, PriceAmount: 9.99, Currency: "CNY", Enabled: true, DurationUnit: SubscriptionDurationMonth, DurationValue: 1, ApplicableGroup: tenant.Group, QuotaResetPeriod: SubscriptionResetMonthly, TotalAmount: 100, AllowWalletOverflow: common.GetPointer(false)}
				require.NoError(t, db.Create(plan).Error)
				if replay {
					_, created, err := CreatePartnerTenantPurchaseOrder(s.SessionId, PartnerTenantPurchaseAccessToken(s), plan.Id, "alipay", "merchant", nil)
					require.NoError(t, err)
					require.True(t, created)
				}
				s.ExpiresAt = getDBTimestampOn(db) + 3
				require.NoError(t, db.Model(s).Update("expires_at", s.ExpiresAt).Error)
				token := PartnerTenantPurchaseAccessToken(s)
				// Hold the actual tenant row in a separate transaction. The gate
				// signals the guarded transaction's lock query before expiry.
				holder := db.Begin()
				require.NoError(t, holder.Error)
				t.Cleanup(func() { _ = holder.Rollback().Error })
				var locked PartnerTenant
				require.NoError(t, lockForUpdate(holder).First(&locked, tenant.Id).Error)
				attempted := make(chan struct{})
				var once sync.Once
				callbackName := "test:purchase_order_tenant_lock"
				require.NoError(t, db.Callback().Query().Before("gorm:query").Register(callbackName, func(query *gorm.DB) {
					if _, ok := query.Statement.Dest.(*PartnerTenant); ok {
						once.Do(func() { close(attempted) })
					}
				}))
				t.Cleanup(func() { _ = db.Callback().Query().Remove(callbackName) })
				type result struct {
					order *PartnerTenantSubscriptionOrder
					err   error
				}
				done := make(chan result, 1)
				go func() {
					o, _, e := CreatePartnerTenantPurchaseOrder(s.SessionId, token, plan.Id, "alipay", "merchant", nil)
					done <- result{o, e}
				}()
				select {
				case <-attempted:
				case <-time.After(5 * time.Second):
					t.Fatal("guarded order did not reach tenant lock")
				}
				require.Less(t, common.GetTimestamp(), s.ExpiresAt, "lock was requested before expiry")
				select {
				case r := <-done:
					t.Fatalf("order bypassed held tenant lock: %+v", r)
				default:
				}
				time.Sleep(time.Until(time.Unix(s.ExpiresAt, 0).Add(100 * time.Millisecond)))
				require.NoError(t, holder.Rollback().Error)
				select {
				case r := <-done:
					require.ErrorIs(t, r.err, ErrPartnerTenantPurchaseAccess)
					require.Nil(t, r.order, "even a prior order cannot escape expired authority")
				case <-time.After(5 * time.Second):
					t.Fatal("guarded order did not finish after releasing tenant lock")
				}
				var count int64
				require.NoError(t, db.Model(&PartnerTenantSubscriptionOrder{}).Where("tenant_id = ?", tenant.Id).Count(&count).Error)
				if replay {
					require.EqualValues(t, 1, count)
				} else {
					require.Zero(t, count)
				}
			})
		}
	})
	t.Run("purchase fixed order identity concurrent creation and conflict", func(t *testing.T) {
		tenant := fixture(t)
		s := create(t, tenant, "order-buyer", "purchase")
		s, err := ExchangePartnerTenantPurchaseSession(s.SessionId, PartnerTenantPurchaseLaunchCode(s), strings.Repeat("a", 64), common.GetTimestamp())
		require.NoError(t, err)
		token := PartnerTenantPurchaseAccessToken(s)
		plan := &SubscriptionPlan{Title: "H5", PartnerTenantId: tenant.Id, PriceAmount: 9.99, Currency: "CNY", Enabled: true, DurationUnit: SubscriptionDurationMonth, DurationValue: 1, ApplicableGroup: tenant.Group, QuotaResetPeriod: SubscriptionResetMonthly, TotalAmount: 100, AllowWalletOverflow: common.GetPointer(false)}
		require.NoError(t, db.Create(plan).Error)
		hash := PartnerTenantPurchaseOrderIdempotencyHash(s.SessionId)
		require.NotEqual(t, partnerTenantHash(s.SessionId), hash)
		in := PartnerTenantOrderInput{TenantId: tenant.Id, ExternalUserId: s.ExternalUserId, PlanId: plan.Id, PaymentMethod: "alipay", MerchantId: "merchant", IdempotencyHash: hash}
		var wg sync.WaitGroup
		type result struct {
			order   *PartnerTenantSubscriptionOrder
			created bool
			err     error
		}
		results := make(chan result, 6)
		for range 6 {
			wg.Add(1)
			go func() {
				defer wg.Done()
				o, c, e := CreatePartnerTenantPurchaseOrder(s.SessionId, token, in.PlanId, in.PaymentMethod, in.MerchantId, nil)
				results <- result{o, c, e}
			}()
		}
		wg.Wait()
		close(results)
		orderNo, inserted := "", 0
		for r := range results {
			require.NoError(t, r.err)
			if orderNo == "" {
				orderNo = r.order.OrderNo
			}
			require.Equal(t, orderNo, r.order.OrderNo)
			if r.created {
				inserted++
			}
		}
		require.Equal(t, 1, inserted)
		// A race between different choices still accepts only one immutable
		// request under the session-derived key, not one order per choice.
		second := create(t, tenant, "order-buyer", "second-purchase")
		second, err = ExchangePartnerTenantPurchaseSession(second.SessionId, PartnerTenantPurchaseLaunchCode(second), strings.Repeat("b", 64), common.GetTimestamp())
		require.NoError(t, err)
		secondToken := PartnerTenantPurchaseAccessToken(second)
		secondInput := in
		secondInput.IdempotencyHash = PartnerTenantPurchaseOrderIdempotencyHash(second.SessionId)
		mixed := make(chan result, 8)
		for i := range 8 {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				choice := secondInput
				if i%2 == 0 {
					choice.PaymentMethod = "wxpay"
				}
				o, c, e := CreatePartnerTenantPurchaseOrder(second.SessionId, secondToken, choice.PlanId, choice.PaymentMethod, choice.MerchantId, nil)
				mixed <- result{o, c, e}
			}(i)
		}
		wg.Wait()
		close(mixed)
		inserted, accepted := 0, 0
		secondOrderNo := ""
		for r := range mixed {
			if r.err != nil {
				require.ErrorIs(t, r.err, ErrPartnerTenantIdempotencyConflict)
				continue
			}
			if secondOrderNo == "" {
				secondOrderNo = r.order.OrderNo
			}
			require.Equal(t, secondOrderNo, r.order.OrderNo)
			accepted++
			if r.created {
				inserted++
			}
		}
		require.Equal(t, 1, inserted)
		require.Equal(t, 4, accepted)
		in.PaymentMethod = "wxpay"
		_, _, err = CreatePartnerTenantPurchaseOrder(s.SessionId, token, in.PlanId, in.PaymentMethod, in.MerchantId, nil)
		require.ErrorIs(t, err, ErrPartnerTenantIdempotencyConflict)
		o, err := FindPartnerTenantOrderByIdempotency(tenant.Id, hash)
		require.NoError(t, err)
		require.Equal(t, orderNo, o.OrderNo)
		var accounts int64
		require.NoError(t, db.Model(&PartnerTenantAccount{}).Where("tenant_id = ?", tenant.Id).Count(&accounts).Error)
		require.Zero(t, accounts)
	})
}
