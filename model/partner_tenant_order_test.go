package model

import (
	"errors"
	"fmt"
	"math"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func TestPartnerTenantMoneyBoundary(t *testing.T) {
	for _, p := range []float64{0, -1, math.NaN(), math.Inf(1), 1.001, 100000000} {
		_, err := PartnerTenantPlanCents(p)
		require.Error(t, err)
	}
	cents, err := PartnerTenantPlanCents(9.99)
	require.NoError(t, err)
	require.EqualValues(t, 999, cents)
	for _, s := range []string{"", "-1", "+1", "1e2", "1.001", "NaN", " 1.00", "1.00 ", "99999999999"} {
		_, err := ParsePartnerTenantPaymentCents(s)
		require.Error(t, err, s)
	}
	cents, err = ParsePartnerTenantPaymentCents("9.99")
	require.NoError(t, err)
	require.EqualValues(t, 999, cents)
}

// All engines and the Go runner belong in disposable task-owned Docker. DSNs
// are separate from other test matrices; no host/production DB is permitted.
func TestPartnerTenantPaidOrderDatabaseMatrix(t *testing.T) {
	for _, d := range []struct {
		name, dsn string
		kind      common.DatabaseType
		open      func(string) gorm.Dialector
	}{
		{"sqlite", ":memory:", common.DatabaseTypeSQLite, func(s string) gorm.Dialector { return sqlite.Open(s) }},
		{"mysql", os.Getenv("TEST_TENANT_ORDER_MYSQL_DSN"), common.DatabaseTypeMySQL, func(s string) gorm.Dialector { return mysql.Open(s) }},
		{"mysql_found_rows", os.Getenv("TEST_TENANT_ORDER_MYSQL_FOUND_ROWS_DSN"), common.DatabaseTypeMySQL, func(s string) gorm.Dialector { return mysql.Open(s) }},
		{"postgres", os.Getenv("TEST_TENANT_ORDER_POSTGRES_DSN"), common.DatabaseTypePostgreSQL, func(s string) gorm.Dialector {
			return postgres.New(postgres.Config{DSN: s, PreferSimpleProtocol: true})
		}},
	} {
		t.Run(d.name, func(t *testing.T) {
			if d.dsn == "" {
				t.Skip("task-owned disposable DSN not configured")
			}
			if d.name == "mysql_found_rows" {
				require.Contains(t, d.dsn, "clientFoundRows=true")
			}
			db, err := gorm.Open(d.open(d.dsn), &gorm.Config{})
			require.NoError(t, err)
			conn, err := db.DB()
			require.NoError(t, err)
			t.Cleanup(func() { _ = conn.Close() })
			if d.name == "sqlite" {
				conn.SetMaxOpenConns(1)
			}
			tables, err := db.Migrator().GetTables()
			require.NoError(t, err)
			require.Empty(t, tables, "requires empty task-owned database")
			query := "SELECT version()"
			if d.name == "sqlite" {
				query = "SELECT sqlite_version()"
			}
			var version string
			require.NoError(t, db.Raw(query).Scan(&version).Error)
			t.Logf("engine %s: %s", d.name, version)
			oldDB, oldMain, oldLog := DB, common.MainDatabaseType(), common.LogDatabaseType()
			DB = db
			common.SetDatabaseTypes(d.kind, d.kind)
			initCol()
			partnerTenantMembershipCache.Purge()
			t.Cleanup(func() {
				DB = oldDB
				common.SetDatabaseTypes(oldMain, oldLog)
				initCol()
				partnerTenantMembershipCache.Purge()
			})

			t.Run("legacy identity upgrade repeat and fresh order migration", func(t *testing.T) {
				type legacyAccount struct {
					Id             int64  `gorm:"primaryKey"`
					TenantId       int64  `gorm:"uniqueIndex:idx_partner_tenant_external_user,priority:1"`
					ExternalUserId string `gorm:"type:varchar(128);uniqueIndex:idx_partner_tenant_external_user,priority:2"`
					UserId         int    `gorm:"uniqueIndex"`
					TokenId        int    `gorm:"uniqueIndex"`
					Status         int
					CreatedAt      int64
					UpdatedAt      int64
				}
				require.NoError(t, db.Table("partner_tenant_accounts").AutoMigrate(&legacyAccount{}))
				require.NoError(t, db.Table("partner_tenant_accounts").Create(&legacyAccount{TenantId: 99999, ExternalUserId: "Legacy-Customer", UserId: 900001, TokenId: 900001, Status: 1}).Error)
				for pass := range 2 {
					require.NoError(t, db.AutoMigrate(&PartnerTenant{}, &PartnerTenantAccount{}, &PartnerTenantSubscriptionGrant{}, &PartnerTenantSubscriptionOrder{}, &User{}, &Token{}, &SubscriptionPlan{}, &UserSubscription{}))
					require.NoError(t, migratePartnerTenantAccountIdentity(db))
					if pass == 0 {
						// Simulate the pre-review order schema, preserving an order
						// while adding the default-zero renewal intent on upgrade.
						require.NoError(t, db.Create(&PartnerTenantSubscriptionOrder{TenantId: 99999, IdempotencyHash: partnerTenantHash("legacy-order"), RequestHash: partnerTenantHash("legacy-request"), OrderNo: "legacy-order", ExternalUserId: "Legacy-Customer", ExternalUserHash: partnerTenantHash("Legacy-Customer"), PlanId: 99999, PlanTitle: "Legacy", PlanSnapshot: "{}", AmountCents: 999, Currency: "CNY", PaymentProvider: PaymentProviderEpay, PaymentMethod: "alipay", MerchantId: "test-merchant", PaymentStatus: "pending", FulfillmentStatus: "not_ready"}).Error)
						require.NoError(t, db.Migrator().DropColumn(&PartnerTenantSubscriptionOrder{}, "RenewalSubscriptionId"))
					}
				}
				require.NoError(t, db.AutoMigrate(&PartnerTenantSubscriptionOrder{})) // repeat the upgraded schema
				var legacyOrder PartnerTenantSubscriptionOrder
				require.NoError(t, db.Where("order_no = ?", "legacy-order").First(&legacyOrder).Error)
				require.EqualValues(t, 999, legacyOrder.AmountCents)
				require.Equal(t, "pending", legacyOrder.PaymentStatus)
				require.Zero(t, legacyOrder.RenewalSubscriptionId)
				require.True(t, db.Migrator().HasColumn(&PartnerTenantSubscriptionOrder{}, "RenewalSubscriptionId"))
				require.True(t, db.Migrator().HasIndex(&PartnerTenantSubscriptionOrder{}, "idx_pt_order_request"))
				var legacy PartnerTenantAccount
				require.NoError(t, db.First(&legacy, 1).Error)
				require.Equal(t, "Legacy-Customer", legacy.ExternalUserId)
				require.Equal(t, partnerTenantHash("Legacy-Customer"), legacy.ExternalUserIdHash)
				require.Equal(t, 900001, legacy.UserId)
				require.False(t, db.Migrator().HasIndex(&PartnerTenantAccount{}, "idx_partner_tenant_external_user"))
				require.True(t, db.Migrator().HasIndex(&PartnerTenantAccount{}, "idx_pt_account_external_hash"))
			})
			fixture := func(t *testing.T) (*PartnerTenant, *SubscriptionPlan) {
				t.Helper()
				tenant, _, err := CreatePartnerTenant("test", fmt.Sprintf("tenant-%d", time.Now().UnixNano()))
				require.NoError(t, err)
				plan := &SubscriptionPlan{Title: "Monthly", PartnerTenantId: tenant.Id, PriceAmount: 9.99, Currency: "CNY", Enabled: true,
					DurationUnit: SubscriptionDurationMonth, DurationValue: 1, ApplicableGroup: tenant.Group, QuotaResetPeriod: SubscriptionResetMonthly,
					TotalAmount: 1000, AllowWalletOverflow: common.GetPointer(false)}
				require.NoError(t, db.Create(plan).Error)
				return tenant, plan
			}
			input := func(tenant *PartnerTenant, p *SubscriptionPlan, eid, key string) PartnerTenantOrderInput {
				return PartnerTenantOrderInput{TenantId: tenant.Id, ExternalUserId: eid, PlanId: p.Id, PaymentMethod: "alipay", MerchantId: "test-merchant", IdempotencyHash: partnerTenantHash(key)}
			}
			pay := func(t *testing.T, o *PartnerTenantSubscriptionOrder) {
				t.Helper()
				require.NoError(t, RecordPartnerTenantPayment(o.OrderNo, PaymentProviderEpay, o.MerchantId, o.PaymentMethod, "tx-"+o.OrderNo, o.AmountCents))
			}

			t.Run("unpaid replay conflict isolation and stable key", func(t *testing.T) {
				tenant, p := fixture(t)
				in := input(tenant, p, "customer-7", "first")
				o, created, err := CreatePartnerTenantSubscriptionOrder(in)
				require.NoError(t, err)
				require.True(t, created)
				require.Equal(t, "9.99", o.Amount())
				require.NotEqual(t, in.IdempotencyHash, o.OrderNo)
				_, err = GetPartnerTenantAccount(tenant.Id, in.ExternalUserId)
				require.ErrorIs(t, err, gorm.ErrRecordNotFound)
				require.Error(t, FulfillPartnerTenantSubscriptionOrder(o.OrderNo))
				replay, created, err := CreatePartnerTenantSubscriptionOrder(in)
				require.NoError(t, err)
				require.False(t, created)
				require.Equal(t, o.OrderNo, replay.OrderNo)
				changed := in
				changed.ExternalUserId = "other"
				_, _, err = CreatePartnerTenantSubscriptionOrder(changed)
				require.ErrorIs(t, err, ErrPartnerTenantIdempotencyConflict)
				_, err = GetPartnerTenantSubscriptionOrder(tenant.Id+100000, o.OrderNo)
				require.ErrorIs(t, err, ErrPartnerTenantOrderNotFound)
				key, err := ProvisionPartnerTenantAccount(tenant.Id, in.ExternalUserId, "")
				require.NoError(t, err)
				var count int64
				require.NoError(t, db.Model(&UserSubscription{}).Where("plan_id = ?", p.Id).Count(&count).Error)
				require.Zero(t, count)
				pay(t, o)
				require.NoError(t, FulfillPartnerTenantSubscriptionOrder(o.OrderNo))
				require.NoError(t, FulfillPartnerTenantSubscriptionOrder(o.OrderNo))
				again, err := ProvisionPartnerTenantAccount(tenant.Id, in.ExternalUserId, "")
				require.NoError(t, err)
				require.Equal(t, key.APIKey, again.APIKey)
				require.NoError(t, db.Model(&UserSubscription{}).Where("plan_id = ?", p.Id).Count(&count).Error)
				require.EqualValues(t, 1, count)
			})

			t.Run("payment provisions missing account and renewal exactly once", func(t *testing.T) {
				tenant, p := fixture(t)
				first, _, err := CreatePartnerTenantSubscriptionOrder(input(tenant, p, "new-user", "one"))
				require.NoError(t, err)
				pay(t, first)
				require.NoError(t, FulfillPartnerTenantSubscriptionOrder(first.OrderNo))
				stored, err := GetPartnerTenantSubscriptionOrder(tenant.Id, first.OrderNo)
				require.NoError(t, err)
				require.Equal(t, "fulfilled", stored.FulfillmentStatus)
				require.Positive(t, stored.SubscriptionId)
				var sub UserSubscription
				require.NoError(t, db.First(&sub, stored.SubscriptionId).Error)
				require.NoError(t, db.Model(&sub).Update("amount_used", 80).Error)
				end := sub.EndTime
				renewal, _, err := CreatePartnerTenantSubscriptionOrder(input(tenant, p, "new-user", "two"))
				require.NoError(t, err)
				pay(t, renewal)
				for range 3 {
					require.NoError(t, FulfillPartnerTenantSubscriptionOrder(renewal.OrderNo))
				}
				require.NoError(t, db.First(&sub, stored.SubscriptionId).Error)
				expected, err := calcPlanEndTime(time.Unix(end, 0), p)
				require.NoError(t, err)
				require.Equal(t, expected, sub.EndTime)
				require.EqualValues(t, 80, sub.AmountUsed)
				require.EqualValues(t, 1000, sub.AmountTotal)
				account, err := GetPartnerTenantAccount(tenant.Id, "new-user")
				require.NoError(t, err)
				member, err := IsPartnerTenantUser(account.UserId)
				require.NoError(t, err)
				require.True(t, member)
			})

			t.Run("expired purchase limit rejects checkout before payment", func(t *testing.T) {
				tenant, p := fixture(t)
				require.NoError(t, db.Model(p).Update("max_purchase_per_user", 1).Error)
				p.MaxPurchasePerUser = 1
				first, _, err := CreatePartnerTenantSubscriptionOrder(input(tenant, p, "limited", "initial"))
				require.NoError(t, err)
				pay(t, first)
				require.NoError(t, FulfillPartnerTenantSubscriptionOrder(first.OrderNo))
				stored, err := GetPartnerTenantSubscriptionOrder(tenant.Id, first.OrderNo)
				require.NoError(t, err)
				require.NoError(t, db.Model(&UserSubscription{}).Where("id = ?", stored.SubscriptionId).Updates(map[string]any{"end_time": common.GetTimestamp() - 1, "status": "expired"}).Error)
				_, _, err = CreatePartnerTenantSubscriptionOrder(input(tenant, p, "limited", "over-limit"))
				require.ErrorIs(t, err, ErrPartnerTenantPurchaseLimit)
				var count int64
				require.NoError(t, db.Model(&PartnerTenantSubscriptionOrder{}).Where("tenant_id = ?", tenant.Id).Count(&count).Error)
				require.EqualValues(t, 1, count, "no payable order for an already ineligible buyer")
			})

			t.Run("accepted renewal survives expiry without bypassing purchase limit", func(t *testing.T) {
				tenant, p := fixture(t)
				require.NoError(t, db.Model(p).Update("max_purchase_per_user", 1).Error)
				p.MaxPurchasePerUser = 1
				first, _, err := CreatePartnerTenantSubscriptionOrder(input(tenant, p, "renew-before-expiry", "initial"))
				require.NoError(t, err)
				pay(t, first)
				require.NoError(t, FulfillPartnerTenantSubscriptionOrder(first.OrderNo))
				stored, err := GetPartnerTenantSubscriptionOrder(tenant.Id, first.OrderNo)
				require.NoError(t, err)
				renewal, _, err := CreatePartnerTenantSubscriptionOrder(input(tenant, p, "renew-before-expiry", "renewal"))
				require.NoError(t, err)
				require.Equal(t, stored.SubscriptionId, renewal.RenewalSubscriptionId)
				// Simulate natural expiry (including the expiry worker's status)
				// between order acceptance and a late verified notification.
				expiredAt := getDBTimestampOn(db) - 10
				require.NoError(t, db.Model(&UserSubscription{}).Where("id = ?", stored.SubscriptionId).Updates(map[string]any{"end_time": expiredAt, "status": "expired", "amount_used": 1000}).Error)
				require.NoError(t, db.Model(renewal).Update("expires_at", expiredAt).Error)
				replay, created, err := CreatePartnerTenantSubscriptionOrder(input(tenant, p, "renew-before-expiry", "renewal"))
				require.NoError(t, err)
				require.False(t, created)
				require.Equal(t, stored.SubscriptionId, replay.RenewalSubscriptionId)
				// A different order is NOT allowed to reclassify that history.
				_, _, err = CreatePartnerTenantSubscriptionOrder(input(tenant, p, "renew-before-expiry", "unrelated-new"))
				require.ErrorIs(t, err, ErrPartnerTenantPurchaseLimit)
				pay(t, renewal)
				require.NoError(t, FulfillPartnerTenantSubscriptionOrder(renewal.OrderNo))
				var sub UserSubscription
				require.NoError(t, db.First(&sub, stored.SubscriptionId).Error)
				require.Equal(t, "active", sub.Status)
				require.Greater(t, sub.StartTime, expiredAt)
				expected, err := calcPlanEndTime(time.Unix(sub.StartTime, 0), p)
				require.NoError(t, err)
				require.Equal(t, expected, sub.EndTime)
				require.Zero(t, sub.AmountUsed)
				require.EqualValues(t, 1000, sub.AmountTotal)
				require.NoError(t, FulfillPartnerTenantSubscriptionOrder(renewal.OrderNo))
				var repeated UserSubscription
				require.NoError(t, db.First(&repeated, stored.SubscriptionId).Error)
				require.Equal(t, sub.EndTime, repeated.EndTime)
				var count int64
				require.NoError(t, db.Model(&UserSubscription{}).Where("plan_id = ?", p.Id).Count(&count).Error)
				require.EqualValues(t, 1, count)
				// Explicit cancellation is not natural expiry and must not be undone.
				cancelled, _, err := CreatePartnerTenantSubscriptionOrder(input(tenant, p, "renew-before-expiry", "cancelled"))
				require.NoError(t, err)
				require.NoError(t, db.Model(&sub).Update("status", "cancelled").Error)
				pay(t, cancelled)
				require.Error(t, FulfillPartnerTenantSubscriptionOrder(cancelled.OrderNo))
				require.NoError(t, db.First(&sub, sub.Id).Error)
				require.Equal(t, "cancelled", sub.Status)
			})

			t.Run("concurrent new orders reserve purchase slots without accounts", func(t *testing.T) {
				tenant, p := fixture(t)
				require.NoError(t, db.Model(p).Update("max_purchase_per_user", 1).Error)
				var wg sync.WaitGroup
				errs := make(chan error, 8)
				for i := range 8 {
					wg.Add(1)
					go func(i int) {
						defer wg.Done()
						_, _, err := CreatePartnerTenantSubscriptionOrder(input(tenant, p, "unprovisioned", fmt.Sprintf("slot-%d", i)))
						errs <- err
					}(i)
				}
				wg.Wait()
				close(errs)
				accepted := 0
				for err := range errs {
					if err == nil {
						accepted++
					} else {
						require.ErrorIs(t, err, ErrPartnerTenantPurchaseLimit)
					}
				}
				require.Equal(t, 1, accepted)
				_, err := GetPartnerTenantAccount(tenant.Id, "unprovisioned")
				require.ErrorIs(t, err, gorm.ErrRecordNotFound)
				// Cashier expiry cannot release a slot still payable via late callback.
				require.NoError(t, db.Model(&PartnerTenantSubscriptionOrder{}).Where("tenant_id = ?", tenant.Id).Update("expires_at", common.GetTimestamp()-1).Error)
				_, _, err = CreatePartnerTenantSubscriptionOrder(input(tenant, p, "unprovisioned", "new-after-expiry"))
				require.ErrorIs(t, err, ErrPartnerTenantPurchaseLimit)
			})

			t.Run("duplicate concurrent requests and notifications", func(t *testing.T) {
				tenant, p := fixture(t)
				in := input(tenant, p, "concurrent", "same")
				var wg sync.WaitGroup
				orders := make(chan string, 8)
				errs := make(chan error, 8)
				for range 8 {
					wg.Add(1)
					go func() {
						defer wg.Done()
						o, _, err := CreatePartnerTenantSubscriptionOrder(in)
						errs <- err
						if err == nil {
							orders <- o.OrderNo
						}
					}()
				}
				wg.Wait()
				close(errs)
				close(orders)
				for err := range errs {
					require.NoError(t, err)
				}
				orderNo := ""
				for no := range orders {
					if orderNo == "" {
						orderNo = no
					}
					require.Equal(t, orderNo, no)
				}
				errs = make(chan error, 8)
				for range 8 {
					wg.Add(1)
					go func() {
						defer wg.Done()
						err := RecordPartnerTenantPayment(orderNo, PaymentProviderEpay, "test-merchant", "alipay", "concurrent-tx-"+orderNo, 999)
						if err == nil {
							err = FulfillPartnerTenantSubscriptionOrder(orderNo)
						}
						errs <- err
					}()
				}
				wg.Wait()
				close(errs)
				for err := range errs {
					require.NoError(t, err)
				}
				var count int64
				require.NoError(t, db.Model(&UserSubscription{}).Where("plan_id = ?", p.Id).Count(&count).Error)
				require.EqualValues(t, 1, count)
			})

			t.Run("concurrent independent first key has no purchase side effects", func(t *testing.T) {
				tenant, p := fixture(t)
				var wg sync.WaitGroup
				errs, keys := make(chan error, 8), make(chan string, 8)
				for range 8 {
					wg.Add(1)
					go func() {
						defer wg.Done()
						account, err := ProvisionPartnerTenantAccount(tenant.Id, "independent", "")
						errs <- err
						if err == nil {
							keys <- account.APIKey
						}
					}()
				}
				wg.Wait()
				close(errs)
				close(keys)
				for err := range errs {
					require.NoError(t, err)
				}
				key := ""
				for actual := range keys {
					if key == "" {
						key = actual
					}
					require.Equal(t, key, actual)
				}
				var count int64
				require.NoError(t, db.Model(&PartnerTenantSubscriptionOrder{}).Where("tenant_id = ?", tenant.Id).Count(&count).Error)
				require.Zero(t, count)
				require.NoError(t, db.Model(&UserSubscription{}).Where("plan_id = ?", p.Id).Count(&count).Error)
				require.Zero(t, count)
			})

			t.Run("payment evidence and transaction reuse", func(t *testing.T) {
				tenant, p := fixture(t)
				order, _, err := CreatePartnerTenantSubscriptionOrder(input(tenant, p, "one", "one"))
				require.NoError(t, err)
				for _, tc := range []struct {
					provider, pid, method, tx string
					cents                     int64
				}{
					{"stripe", "test-merchant", "alipay", "tx", 999}, {PaymentProviderEpay, "foreign", "alipay", "tx", 999},
					{PaymentProviderEpay, "test-merchant", "wxpay", "tx", 999}, {PaymentProviderEpay, "test-merchant", "alipay", "", 999},
					{PaymentProviderEpay, "test-merchant", "alipay", "tx", 1000},
				} {
					require.Error(t, RecordPartnerTenantPayment(order.OrderNo, tc.provider, tc.pid, tc.method, tc.tx, tc.cents))
				}
				pay(t, order)
				require.Error(t, RecordPartnerTenantPayment(order.OrderNo, PaymentProviderEpay, order.MerchantId, order.PaymentMethod, "different", 999))
				other, _, err := CreatePartnerTenantSubscriptionOrder(input(tenant, p, "two", "two"))
				require.NoError(t, err)
				require.Error(t, RecordPartnerTenantPayment(other.OrderNo, PaymentProviderEpay, other.MerchantId, other.PaymentMethod, "tx-"+order.OrderNo, 999))
				fresh, err := GetPartnerTenantSubscriptionOrder(tenant.Id, other.OrderNo)
				require.NoError(t, err)
				require.Equal(t, "pending", fresh.PaymentStatus)
			})

			t.Run("atomic rollback preserves paid truth and restart recovery", func(t *testing.T) {
				tenant, p := fixture(t)
				order, _, err := CreatePartnerTenantSubscriptionOrder(input(tenant, p, "rollback", "one"))
				require.NoError(t, err)
				pay(t, order)
				require.NoError(t, db.Callback().Update().Before("gorm:update").Register("tenant_test_delivery_failure", func(tx *gorm.DB) {
					if tx.Statement.Table == "partner_tenant_subscription_orders" {
						if values, ok := tx.Statement.Dest.(map[string]any); ok && values["fulfillment_status"] == "fulfilled" {
							tx.AddError(errors.New("injected local delivery failure"))
						}
					}
				}))
				err = FulfillPartnerTenantSubscriptionOrder(order.OrderNo)
				require.NoError(t, db.Callback().Update().Remove("tenant_test_delivery_failure"))
				require.Error(t, err)
				fresh, err := GetPartnerTenantSubscriptionOrder(tenant.Id, order.OrderNo)
				require.NoError(t, err)
				require.Equal(t, "paid", fresh.PaymentStatus)
				require.Equal(t, "failed_retryable", fresh.FulfillmentStatus)
				_, err = GetPartnerTenantAccount(tenant.Id, "rollback")
				require.ErrorIs(t, err, gorm.ErrRecordNotFound)
				var count int64
				require.NoError(t, db.Model(&UserSubscription{}).Where("plan_id = ?", p.Id).Count(&count).Error)
				require.Zero(t, count)
				require.NoError(t, db.Model(fresh).Update("next_delivery_at", 0).Error)
				partnerTenantMembershipCache.Purge() // simulate a restarted worker's cold cache
				require.NoError(t, RecoverPartnerTenantSubscriptionOrders(100))
				fresh, err = GetPartnerTenantSubscriptionOrder(tenant.Id, order.OrderNo)
				require.NoError(t, err)
				require.Equal(t, "fulfilled", fresh.FulfillmentStatus)
			})

			t.Run("late paid and frozen plan edits fail closed", func(t *testing.T) {
				tenant, p := fixture(t)
				order, _, err := CreatePartnerTenantSubscriptionOrder(input(tenant, p, "late", "one"))
				require.NoError(t, err)
				require.NoError(t, db.Model(order).Update("expires_at", common.GetTimestamp()-10).Error)
				require.NoError(t, db.Model(p).Update("total_amount", 2000).Error)
				pay(t, order)
				require.Error(t, FulfillPartnerTenantSubscriptionOrder(order.OrderNo))
				fresh, err := GetPartnerTenantSubscriptionOrder(tenant.Id, order.OrderNo)
				require.NoError(t, err)
				require.Equal(t, "paid", fresh.PaymentStatus)
				require.NoError(t, db.Model(p).Update("total_amount", 1000).Error)
				require.NoError(t, FulfillPartnerTenantSubscriptionOrder(order.OrderNo))
			})

			for _, state := range []string{"tenant_disabled", "membership_disabled", "user_disabled", "user_deleted", "user_group", "token_disabled", "token_expired", "token_deleted"} {
				t.Run(state+" never replaces resource", func(t *testing.T) {
					tenant, p := fixture(t)
					_, err := ProvisionPartnerTenantAccount(tenant.Id, "blocked", "")
					require.NoError(t, err)
					account, err := GetPartnerTenantAccount(tenant.Id, "blocked")
					require.NoError(t, err)
					order, _, err := CreatePartnerTenantSubscriptionOrder(input(tenant, p, "blocked", "one"))
					require.NoError(t, err)
					switch state {
					case "tenant_disabled":
						require.NoError(t, db.Model(tenant).Update("status", PartnerTenantStatusDisabled).Error)
					case "membership_disabled":
						require.NoError(t, db.Model(account).Update("status", PartnerTenantStatusDisabled).Error)
					case "user_disabled":
						require.NoError(t, db.Model(&User{}).Where("id = ?", account.UserId).Update("status", common.UserStatusDisabled).Error)
					case "user_deleted":
						require.NoError(t, db.Delete(&User{}, account.UserId).Error)
					case "user_group":
						require.NoError(t, db.Model(&User{}).Where("id = ?", account.UserId).Update("group", "default").Error)
					case "token_disabled":
						require.NoError(t, db.Model(&Token{}).Where("id = ?", account.TokenId).Update("status", common.TokenStatusDisabled).Error)
					case "token_expired":
						require.NoError(t, db.Model(&Token{}).Where("id = ?", account.TokenId).Update("expired_time", common.GetTimestamp()-1).Error)
					case "token_deleted":
						require.NoError(t, db.Delete(&Token{}, account.TokenId).Error)
					}
					_, err = ProvisionPartnerTenantAccount(tenant.Id, "blocked", "")
					require.Error(t, err)
					pay(t, order)
					require.Error(t, FulfillPartnerTenantSubscriptionOrder(order.OrderNo))
					fresh, err := GetPartnerTenantSubscriptionOrder(tenant.Id, order.OrderNo)
					require.NoError(t, err)
					require.Equal(t, "paid", fresh.PaymentStatus)
					var count int64
					require.NoError(t, db.Model(&PartnerTenantAccount{}).Where("tenant_id = ?", tenant.Id).Count(&count).Error)
					require.EqualValues(t, 1, count)
				})
			}

			t.Run("cent currency foreign plan budgets claim and case identity", func(t *testing.T) {
				tenant, p := fixture(t)
				for _, currency := range []string{"USD", "EUR"} {
					require.NoError(t, db.Model(p).Update("currency", currency).Error)
					_, _, err := CreatePartnerTenantSubscriptionOrder(input(tenant, p, "currency", currency))
					require.ErrorIs(t, err, ErrPartnerTenantUnsupportedCurrency)
				}
				require.NoError(t, db.Model(p).Updates(map[string]any{"currency": "CNY", "price_amount": 1.001}).Error)
				_, _, err := CreatePartnerTenantSubscriptionOrder(input(tenant, p, "cent", "cent"))
				require.Error(t, err)
				require.NoError(t, db.Model(p).Update("price_amount", 9.99).Error)
				foreign, _ := fixture(t)
				_, _, err = CreatePartnerTenantSubscriptionOrder(input(foreign, p, "foreign", "foreign"))
				require.ErrorIs(t, err, ErrPartnerTenantPlanNotFound)
				a, err := ProvisionPartnerTenantAccount(tenant.Id, "Case", "")
				require.NoError(t, err)
				b, err := ProvisionPartnerTenantAccount(tenant.Id, "case", "")
				require.NoError(t, err)
				require.NotEqual(t, a.APIKey, b.APIKey)
				for i := 0; i < 5; i++ {
					_, _, err := CreatePartnerTenantSubscriptionOrder(input(tenant, p, "budget", fmt.Sprint(i)))
					require.NoError(t, err)
				}
				_, _, err = CreatePartnerTenantSubscriptionOrder(input(tenant, p, "budget", "overflow"))
				require.ErrorIs(t, err, ErrPartnerTenantOrderLimited)
				order, _, err := CreatePartnerTenantSubscriptionOrder(input(tenant, p, "claim", "claim"))
				require.NoError(t, err)
				claim, err := ClaimPartnerTenantCheckout(order.Id)
				require.NoError(t, err)
				require.Positive(t, claim)
				_, err = ClaimPartnerTenantCheckout(order.Id)
				require.ErrorIs(t, err, ErrPartnerTenantOrderUnavailable)
				require.NoError(t, SavePartnerTenantCheckout(order.Id, claim-1, "wrong", ""))
				fresh, err := GetPartnerTenantSubscriptionOrder(tenant.Id, order.OrderNo)
				require.NoError(t, err)
				require.Empty(t, fresh.QRCode)
				require.NoError(t, SavePartnerTenantCheckout(order.Id, claim, "correct", ""))
				fresh, err = GetPartnerTenantSubscriptionOrder(tenant.Id, order.OrderNo)
				require.NoError(t, err)
				require.Equal(t, "correct", fresh.QRCode)
			})
		})
	}
}
