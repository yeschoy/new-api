package model

import (
	"bytes"
	"encoding/json"
	"errors"
	"log"
	"math"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

func setupAuthorizationAuditPQ(t *testing.T, prefix string) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("TEST_PARTNER_ACCESS_AUDIT_POSTGRES_DSN")
	require.NotEmpty(t, dsn, "BLOCKED: explicit task-owned Docker/pq required; do not run legacy fixtures")
	return setupPartnerTenantIsolatedPQ(t, dsn, prefix)
}

func TestPartnerTenantAuthorizationAuditProjectionMigration(t *testing.T) {
	main := setupAuthorizationAuditPQ(t, "pt_authorization_audit_main_")
	logs := setupAuthorizationAuditPQ(t, "pt_authorization_audit_log_")
	DB = main
	oldLog := LOG_DB
	LOG_DB = logs
	t.Cleanup(func() { LOG_DB = oldLog })
	// Existing pre-column table, without destructive resets.
	require.NoError(t, logs.Exec(`CREATE TABLE partner_oauth_authorization_logs(event_id varchar(64) PRIMARY KEY,created_at bigint,action varchar(64),success boolean,reason varchar(32),actor_user_id bigint,target_user_id bigint,client_id varchar(64),binding_id varchar(64),request_id varchar(64),ip varchar(64),route varchar(128),status bigint)`).Error)
	require.NoError(t, logs.Exec(`INSERT INTO partner_oauth_authorization_logs(event_id,action,status) VALUES ('old','partner_oauth.token.issue',200)`).Error)
	for range 2 {
		require.NoError(t, MigratePartnerOAuthAuthorizationLogs())
	}
	var old PartnerOauthAuthorizationLog
	require.NoError(t, logs.First(&old, "event_id = ?", "old").Error)
	require.Zero(t, old.TenantId)
	require.Empty(t, old.OrderNo)
	require.Zero(t, old.KeyVersion)
	receipt := PartnerTenantAuditReceipt{TenantId: math.MaxInt64, SubscriptionId: 9007199254740993, KeyVersion: math.MaxInt64, TargetUserId: 7, IntegrationMode: PartnerTenantIntegrationSubscriptionKey, OrderNo: "PTO" + strings.Repeat("A", 32)}
	RecordPartnerTenantAudit(nil, PartnerTenantAuditIssue, 0, true, "", receipt)
	items, total, err := GetPartnerOAuthAuthorizationLogs(PartnerOauthAuthorizationLogFilter{TenantId: math.MaxInt64}, 0, 20)
	require.NoError(t, err)
	require.EqualValues(t, 1, total)
	require.Len(t, items, 1)
	raw, err := json.Marshal(PartnerTenantAuthorizationLogViews(items))
	require.NoError(t, err)
	require.Contains(t, string(raw), `"tenant_id":"9223372036854775807"`)
	require.Contains(t, string(raw), `"subscription_id":"9007199254740993"`)
	require.Contains(t, string(raw), `"key_version":"9223372036854775807"`)
	require.Zero(t, items[0].Status)
	require.Empty(t, items[0].Route)
	require.Empty(t, items[0].Ip)
	require.False(t, main.Migrator().HasTable(&PartnerOauthAuthorizationLog{}), "separate LOG_DB must not leak rows/tables into main")
	// Rejected metadata/status/relationships cannot create rows.
	for _, entry := range []PartnerOauthAuthorizationLog{
		{Action: PartnerTenantAuditRead, Status: 0, Success: false, Reason: "invalid_request"},
		{Action: PartnerTenantAuditDenied, Status: 401, Reason: "pt_forbidden"},
		{Action: PartnerTenantAuditDenied, Status: 401, Reason: "invalid_partner_secret", OrderNo: receipt.OrderNo},
		{Action: PartnerTenantAuditDenied, Status: 401, Reason: "invalid_partner_secret", ClientId: "pc_" + strings.Repeat("a", 32)},
		{Action: PartnerTenantAuditDenied, Status: 401, Reason: "invalid_partner_secret", Replayed: true},
	} {
		RecordPartnerOAuthAuthorizationLog(nil, entry)
	}
	var n int64
	require.NoError(t, logs.Model(&PartnerOauthAuthorizationLog{}).Count(&n).Error)
	require.EqualValues(t, 2, n)
	// Default LOG_DB=DB fresh/repeated migration is independently exercised.
	LOG_DB = main
	for range 2 {
		require.NoError(t, MigratePartnerOAuthAuthorizationLogs())
	}
	RecordPartnerOAuthAuthorizationLog(nil, PartnerOauthAuthorizationLog{Action: "partner_oauth.token.issue", Status: 200, Success: true})
	_, total, err = GetPartnerOAuthAuthorizationLogs(PartnerOauthAuthorizationLogFilter{}, 0, 20)
	require.NoError(t, err)
	require.EqualValues(t, 1, total)
	require.Len(t, partnerTenantAuthorizationClickHouseColumns(), 6)
	for _, column := range partnerTenantAuthorizationClickHouseColumns() {
		require.Contains(t, column, "DEFAULT")
	}
}

func TestPartnerTenantAuthorizationAuditPostCommitOutcomes(t *testing.T) {
	db := setupAuthorizationAuditPQ(t, "pt_authorization_audit_business_")
	logs := setupAuthorizationAuditPQ(t, "pt_authorization_audit_events_")
	DB = db
	oldLog := LOG_DB
	LOG_DB = logs
	t.Cleanup(func() { LOG_DB = oldLog })
	require.NoError(t, MigratePartnerOAuthAuthorizationLogs())
	require.NoError(t, MigratePartnerTenantIntegrationModes(db))
	require.NoError(t, db.AutoMigrate(&User{}, &Token{}, &SubscriptionPlan{}, &UserSubscription{}))
	require.NoError(t, MigratePartnerTenantSubscriptionKeys(db))
	tenant, _, err := CreatePartnerTenant("Audit", "audit")
	require.NoError(t, err)
	plan := &SubscriptionPlan{Title: "Audit", PartnerTenantId: tenant.Id, Enabled: true, Currency: "CNY", PriceAmount: 9.99, DurationUnit: SubscriptionDurationMonth, DurationValue: 1, QuotaResetPeriod: SubscriptionResetMonthly, ApplicableGroup: tenant.Group, AllowWalletOverflow: common.GetPointer(false), TotalAmount: 10}
	require.NoError(t, db.Create(plan).Error)
	order, _, err := CreatePartnerTenantSubscriptionKeyOrder(PartnerTenantSubscriptionKeyOrderInput{TenantId: tenant.Id, TenantSecretHash: tenant.SecretHash, IdempotencyHash: partnerTenantHash("audit-order"), PlanId: plan.Id, PaymentMethod: "alipay", MerchantId: "test"}, nil)
	require.NoError(t, err)
	require.NoError(t, RecordPartnerTenantPayment(order.OrderNo, PaymentProviderEpay, "test", "alipay", "audit-paid", order.AmountCents))
	// Rollback after local key creation cannot create an issuance event.
	require.NoError(t, db.Callback().Update().Before("gorm:update").Register("audit_rollback", func(tx *gorm.DB) {
		// Fail the final marker AFTER the issuance receipt has been captured.
		if tx.Statement.Table == "partner_tenant_subscription_orders" {
			tx.AddError(errors.New("test rollback"))
		}
	}))
	require.Error(t, FulfillPartnerTenantSubscriptionOrder(order.OrderNo))
	_, n, err := GetPartnerOAuthAuthorizationLogs(PartnerOauthAuthorizationLogFilter{Action: PartnerTenantAuditIssue}, 0, 20)
	require.NoError(t, err)
	require.Zero(t, n)
	require.NoError(t, db.Callback().Update().Remove("audit_rollback"))
	require.NoError(t, FulfillPartnerTenantSubscriptionOrder(order.OrderNo))
	require.NoError(t, FulfillPartnerTenantSubscriptionOrder(order.OrderNo))
	_, n, err = GetPartnerOAuthAuthorizationLogs(PartnerOauthAuthorizationLogFilter{Action: PartnerTenantAuditIssue}, 0, 20)
	require.NoError(t, err)
	require.EqualValues(t, 1, n)
	var receipt PartnerTenantAuditReceipt
	claim, err := ClaimPartnerTenantSubscriptionKeyWithAudit(tenant.Id, tenant.SecretHash, order.OrderNo, &receipt)
	require.NoError(t, err)
	require.Equal(t, order.OrderNo, receipt.OrderNo)
	require.EqualValues(t, 1, receipt.KeyVersion)
	t.Run("lock-time mode receipt", func(t *testing.T) {
		tx := db.Begin()
		require.NoError(t, tx.Error)
		t.Cleanup(func() { _ = tx.Rollback().Error })
		var locked PartnerTenant
		require.NoError(t, lockForUpdate(tx).First(&locked, tenant.Id).Error)
		require.NoError(t, tx.Model(&locked).Update("integration_mode", PartnerTenantIntegrationHostedH5).Error)
		type outcome struct {
			receipt PartnerTenantAuditReceipt
			err     error
		}
		done := make(chan outcome, 1)
		go func() {
			var r PartnerTenantAuditReceipt
			_, err := ClaimPartnerTenantSubscriptionKeyWithAudit(tenant.Id, tenant.SecretHash, order.OrderNo, &r)
			done <- outcome{r, err}
		}()
		select {
		case <-done:
			t.Fatal("claim did not wait for tenant lock")
		case <-time.After(100 * time.Millisecond):
		}
		require.NoError(t, tx.Commit().Error)
		select {
		case got := <-done:
			require.ErrorIs(t, got.err, ErrPartnerTenantIntegrationMode)
			require.Equal(t, PartnerTenantAuditReceipt{TenantId: tenant.Id, IntegrationMode: PartnerTenantIntegrationHostedH5}, got.receipt)
		case <-time.After(5 * time.Second):
			t.Fatal("claim did not complete")
		}
		require.NoError(t, db.Model(tenant).Update("integration_mode", PartnerTenantIntegrationSubscriptionKey).Error)
	})
	foreign, _, err := CreatePartnerTenant("Foreign", "audit-foreign")
	require.NoError(t, err)
	_, err = ClaimPartnerTenantSubscriptionKeyWithAudit(foreign.Id, foreign.SecretHash, order.OrderNo, &receipt)
	require.ErrorIs(t, err, ErrPartnerTenantOrderNotFound)
	require.Equal(t, foreign.Id, receipt.TenantId)
	require.Empty(t, receipt.OrderNo)
	require.Zero(t, receipt.SubscriptionId)
	_, err = RotatePartnerTenantSubscriptionKeyWithAudit(foreign.Id, foreign.SecretHash, claim.SubscriptionId, 1, partnerTenantHash("foreign-rotation"), &receipt)
	require.ErrorIs(t, err, ErrPartnerTenantSubscriptionNotFound)
	require.Equal(t, foreign.Id, receipt.TenantId)
	require.Zero(t, receipt.SubscriptionId)
	require.Zero(t, receipt.TargetUserId)
	// The locator precedes the transaction: even an Info/DEBUG DB must not
	// interpolate the bearer hash there (query AND renewal use this helper).
	var sqlOutput bytes.Buffer
	DB = db.Session(&gorm.Session{Logger: gormlogger.New(log.New(&sqlOutput, "", 0), gormlogger.Config{LogLevel: gormlogger.Info})})
	_, err = findPartnerTenantSubscriptionKey(claim.SubscriptionKey)
	require.NoError(t, err)
	require.Empty(t, sqlOutput.String())
	DB = db
	rotated, err := RotatePartnerTenantSubscriptionKeyWithAudit(tenant.Id, tenant.SecretHash, claim.SubscriptionId, 1, partnerTenantHash("rotation"), &receipt)
	require.NoError(t, err)
	require.False(t, receipt.Replayed)
	require.EqualValues(t, 2, receipt.KeyVersion)
	replay, err := RotatePartnerTenantSubscriptionKeyWithAudit(tenant.Id, tenant.SecretHash, claim.SubscriptionId, 1, partnerTenantHash("rotation"), &receipt)
	require.NoError(t, err)
	require.True(t, receipt.Replayed)
	require.Equal(t, rotated.SubscriptionKey, replay.SubscriptionKey)
	require.EqualValues(t, 2, receipt.KeyVersion)
	_, err = QueryPartnerTenantSubscriptionWithAudit(claim.SubscriptionKey, &receipt)
	require.ErrorIs(t, err, ErrPartnerTenantSubscriptionKeyInvalid)
	require.Equal(t, PartnerTenantAuditReceipt{}, receipt, "old key must not reuse the prior owned receipt")
	require.NoError(t, db.Model(tenant).Update("integration_mode", PartnerTenantIntegrationHostedH5).Error)
	_, err = QueryPartnerTenantSubscriptionWithAudit(replay.SubscriptionKey, &receipt)
	require.ErrorIs(t, err, ErrPartnerTenantIntegrationMode)
	require.Equal(t, PartnerTenantIntegrationHostedH5, receipt.IntegrationMode)
	require.Equal(t, tenant.Id, receipt.TenantId)
	require.NoError(t, db.Model(tenant).Update("integration_mode", PartnerTenantIntegrationSubscriptionKey).Error)
	require.NoError(t, db.Model(&UserSubscription{}).Where("id = ?", claim.SubscriptionId).Update("source", "admin").Error)
	_, err = QueryPartnerTenantSubscriptionWithAudit(replay.SubscriptionKey, &receipt)
	require.ErrorIs(t, err, ErrPartnerTenantSubscriptionKeyNotFound)
	require.Equal(t, PartnerTenantAuditReceipt{}, receipt, "corrupt source is not a verified binding")
	require.NoError(t, db.Model(&UserSubscription{}).Where("id = ?", claim.SubscriptionId).Update("source", SubscriptionSourcePartner).Error)
	for _, state := range []string{"active", "exhausted", "expired", "cancelled"} {
		status, used := "active", int64(0)
		if state == "exhausted" {
			used = 10
		}
		if state == "expired" || state == "cancelled" {
			status = state
		}
		require.NoError(t, db.Model(&UserSubscription{}).Where("id = ?", claim.SubscriptionId).Updates(map[string]any{"status": status, "amount_used": used}).Error)
		_, err = QueryPartnerTenantSubscriptionWithAudit(replay.SubscriptionKey, &receipt)
		require.NoError(t, err, state)
		require.Equal(t, tenant.Id, receipt.TenantId)
		require.EqualValues(t, claim.SubscriptionId, receipt.SubscriptionId)
	}
	_, err = QueryPartnerTenantSubscriptionWithAudit("sub_"+strings.Repeat("f", 64), &receipt)
	require.Error(t, err)
	require.Zero(t, receipt.TenantId)
	// LOG_DB failure is sanitized and never makes an actual committed rotation fail.
	var captured bytes.Buffer
	previous := gin.DefaultErrorWriter
	gin.DefaultErrorWriter = &captured
	t.Cleanup(func() { gin.DefaultErrorWriter = previous })
	require.NoError(t, logs.Callback().Create().Before("gorm:create").Register("audit_log_fault", func(tx *gorm.DB) { tx.AddError(errors.New("pt_forbidden sub_forbidden sk_forbidden database details")) }))
	_, err = RotatePartnerTenantSubscriptionKeyWithAudit(tenant.Id, tenant.SecretHash, claim.SubscriptionId, 2, partnerTenantHash("rotation-fault"), &receipt)
	require.NoError(t, err)
	RecordPartnerTenantAudit(nil, PartnerTenantAuditRotate, 200, true, "", receipt)
	require.Contains(t, captured.String(), "database error")
	for _, secret := range []string{"pt_forbidden", "sub_forbidden", "sk_forbidden", "database details"} {
		require.NotContains(t, captured.String(), secret)
	}
	require.EqualValues(t, 3, receipt.KeyVersion)
}

func TestPartnerTenantAuthorizationAuditClickHouseAndAllowlist(t *testing.T) {
	statements := partnerTenantAuthorizationClickHouseUpgradeStatements()
	require.Len(t, statements, 6)
	for _, statement := range statements {
		require.Contains(t, statement, "ALTER TABLE partner_oauth_authorization_logs ADD COLUMN IF NOT EXISTS ")
		require.Contains(t, statement, "DEFAULT")
	}
	require.Equal(t, statements, partnerTenantAuthorizationClickHouseUpgradeStatements())
	require.False(t, validPartnerTenantAuditMetadata(PartnerOauthAuthorizationLog{Action: PartnerTenantAuditRead, Status: 401, Reason: "subscription_key_changed"}))
	require.False(t, validPartnerTenantAuditMetadata(PartnerOauthAuthorizationLog{Action: PartnerTenantAuditDenied, Status: 401, Reason: "pt_secret"}))
	require.True(t, validPartnerTenantAuditMetadata(PartnerOauthAuthorizationLog{Action: PartnerTenantAuditDenied, Status: 401, Reason: "invalid_partner_secret"}))
}

// Exercise the actual bounded scan, not just its shared delivery helper. The
// separate log DB may fail without erasing paid/fulfilled facts or reminting.
func TestPartnerTenantAuthorizationAuditRecoveryRenewalAndLogFailure(t *testing.T) {
	db := setupAuthorizationAuditPQ(t, "pt_authorization_audit_recovery_")
	logs := setupAuthorizationAuditPQ(t, "pt_authorization_audit_recovery_log_")
	DB = db
	oldLog := LOG_DB
	LOG_DB = logs
	t.Cleanup(func() { LOG_DB = oldLog })
	require.NoError(t, MigratePartnerOAuthAuthorizationLogs())
	require.NoError(t, MigratePartnerTenantIntegrationModes(db))
	require.NoError(t, db.AutoMigrate(&User{}, &Token{}, &SubscriptionPlan{}, &UserSubscription{}))
	require.NoError(t, MigratePartnerTenantSubscriptionKeys(db))
	tenant, _, err := CreatePartnerTenant("Recovery audit", "audit-recovery")
	require.NoError(t, err)
	plan := &SubscriptionPlan{Title: "Recovery", PartnerTenantId: tenant.Id, Enabled: true, Currency: "CNY", PriceAmount: 9.99, DurationUnit: SubscriptionDurationMonth, DurationValue: 1, QuotaResetPeriod: SubscriptionResetMonthly, ApplicableGroup: tenant.Group, AllowWalletOverflow: common.GetPointer(false), TotalAmount: 10}
	require.NoError(t, db.Create(plan).Error)
	paid := func(intent, bearer string) *PartnerTenantSubscriptionOrder {
		t.Helper()
		o, _, err := CreatePartnerTenantSubscriptionKeyOrder(PartnerTenantSubscriptionKeyOrderInput{TenantId: tenant.Id, TenantSecretHash: tenant.SecretHash, IdempotencyHash: partnerTenantHash(intent), PlanId: plan.Id, PaymentMethod: "alipay", MerchantId: "audit", SubscriptionKey: bearer}, nil)
		require.NoError(t, err)
		require.NoError(t, RecordPartnerTenantPayment(o.OrderNo, PaymentProviderEpay, "audit", "alipay", "tx-"+o.OrderNo, o.AmountCents))
		return o
	}
	first := paid("scan-initial", "")
	require.NoError(t, RecoverPartnerTenantSubscriptionOrders(100))
	rows, n, err := GetPartnerOAuthAuthorizationLogs(PartnerOauthAuthorizationLogFilter{Action: PartnerTenantAuditIssue}, 0, 20)
	require.NoError(t, err)
	require.EqualValues(t, 1, n)
	require.Len(t, rows, 1)
	require.Zero(t, rows[0].Status)
	require.Empty(t, rows[0].Ip)
	require.Empty(t, rows[0].Route)
	require.Equal(t, first.OrderNo, rows[0].OrderNo)
	key, err := ClaimPartnerTenantSubscriptionKey(tenant.Id, tenant.SecretHash, first.OrderNo)
	require.NoError(t, err)
	renewal := paid("scan-renewal", key.SubscriptionKey)
	require.NoError(t, RecoverPartnerTenantSubscriptionOrders(100))
	stored, err := GetPartnerTenantSubscriptionOrder(tenant.Id, renewal.OrderNo)
	require.NoError(t, err)
	require.Equal(t, "fulfilled", stored.FulfillmentStatus)
	require.Equal(t, key.SubscriptionId, stored.SubscriptionId)
	_, n, err = GetPartnerOAuthAuthorizationLogs(PartnerOauthAuthorizationLogFilter{Action: PartnerTenantAuditIssue}, 0, 20)
	require.NoError(t, err)
	require.EqualValues(t, 1, n, "renewal must not claim initial issuance")

	failedLog := paid("log-outage-initial", "")
	var captured bytes.Buffer
	previous := gin.DefaultErrorWriter
	gin.DefaultErrorWriter = &captured
	t.Cleanup(func() { gin.DefaultErrorWriter = previous })
	require.NoError(t, logs.Callback().Create().Before("gorm:create").Register("audit_delivery_log_fault", func(tx *gorm.DB) { tx.AddError(errors.New("pt_forbidden sub_forbidden sk_forbidden")) }))
	require.NoError(t, RecoverPartnerTenantSubscriptionOrders(100))
	stored, err = GetPartnerTenantSubscriptionOrder(tenant.Id, failedLog.OrderNo)
	require.NoError(t, err)
	require.Equal(t, "paid", stored.PaymentStatus)
	require.Equal(t, "fulfilled", stored.FulfillmentStatus)
	_, err = ClaimPartnerTenantSubscriptionKey(tenant.Id, tenant.SecretHash, failedLog.OrderNo)
	require.NoError(t, err, "delivery survives independent LOG_DB failure")
	require.Contains(t, captured.String(), "database error")
	require.NotContains(t, captured.String(), "pt_forbidden")
	require.NotContains(t, captured.String(), "sub_forbidden")
	require.NotContains(t, captured.String(), "sk_forbidden")
	require.NoError(t, logs.Callback().Create().Remove("audit_delivery_log_fault"))
	require.NoError(t, FulfillPartnerTenantSubscriptionOrder(failedLog.OrderNo))
	require.NoError(t, RecoverPartnerTenantSubscriptionOrders(100))
	_, n, err = GetPartnerOAuthAuthorizationLogs(PartnerOauthAuthorizationLogFilter{Action: PartnerTenantAuditIssue}, 0, 20)
	require.NoError(t, err)
	require.EqualValues(t, 1, n, "fulfilled replay must not fabricate replacement for lost best-effort event")
	var keys int64
	require.NoError(t, db.Model(&PartnerTenantSubscriptionAccessKey{}).Count(&keys).Error)
	require.EqualValues(t, 2, keys)
}
