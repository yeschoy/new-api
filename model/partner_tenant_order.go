package model

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

const PartnerTenantOrderLifetime = int64(30 * 60)
const PartnerTenantCheckoutClaimSeconds = int64(15)

var (
	ErrPartnerTenantOrderNotFound       = errors.New("partner tenant order not found")
	ErrPartnerTenantOrderLimited        = errors.New("partner tenant order limit reached")
	ErrPartnerTenantOrderUnavailable    = errors.New("partner tenant payment unavailable")
	ErrPartnerTenantUnsupportedCurrency = errors.New("partner tenant payment requires CNY")
	ErrPartnerTenantPaymentEvidence     = errors.New("partner tenant payment evidence mismatch")
	ErrPartnerTenantPurchaseLimit       = errors.New("partner tenant plan purchase limit reached")
)

// This is deliberately separate from TopUp and ordinary SubscriptionOrder: no
// wallet credit, cashback or ordinary-account settlement can run for this row.
type PartnerTenantSubscriptionOrder struct {
	Id                int64  `gorm:"primaryKey"`
	TenantId          int64  `gorm:"not null;uniqueIndex:idx_pt_order_request,priority:1;index:idx_pt_order_budget,priority:1"`
	IdempotencyHash   string `gorm:"type:char(64);not null;uniqueIndex:idx_pt_order_request,priority:2"`
	RequestHash       string `gorm:"type:char(64);not null"`
	OrderNo           string `gorm:"type:varchar(64);not null;uniqueIndex"`
	ExternalUserId    string `gorm:"type:varchar(128);not null"`
	ExternalUserHash  string `gorm:"type:char(64);not null;index"`
	PlanId            int    `gorm:"not null"`
	PlanTitle         string `gorm:"type:varchar(128);not null"`
	PlanSnapshot      string `gorm:"type:text;not null"`
	AmountCents       int64  `gorm:"not null"`
	Currency          string `gorm:"type:varchar(8);not null"`
	PaymentProvider   string `gorm:"type:varchar(16);not null"`
	PaymentMethod     string `gorm:"type:varchar(16);not null"`
	MerchantId        string `gorm:"type:varchar(64);not null"`
	PaymentStatus     string `gorm:"type:varchar(16);not null;index:idx_pt_order_delivery,priority:1"`
	FulfillmentStatus string `gorm:"type:varchar(24);not null;index:idx_pt_order_delivery,priority:2"`
	// NULL while unpaid; globally unique evidence prevents transaction reuse.
	TransactionHash *string `gorm:"type:char(64);uniqueIndex"`
	CreatedAt       int64   `gorm:"not null;index:idx_pt_order_budget,priority:2"`
	ExpiresAt       int64   `gorm:"not null"`
	PaidAt          int64
	FulfilledAt     int64
	SubscriptionId  int
	// A renewal accepted while active keeps its target even if it expires
	// before the signed payment arrives. Zero reserves a new-purchase slot.
	RenewalSubscriptionId int `gorm:"not null;default:0"`
	CheckoutClaimedAt     int64
	QRCode                string `gorm:"type:text"`
	PayURL                string `gorm:"type:text"`
	DeliveryAttempts      int
	NextDeliveryAt        int64  `gorm:"index:idx_pt_order_delivery,priority:3"`
	DeliveryError         string `gorm:"type:varchar(48)"`
}

func (PartnerTenantSubscriptionOrder) TableName() string { return "partner_tenant_subscription_orders" }

func partnerTenantHash(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}
func PartnerTenantOrderRequestHash(externalID string, planID int, method string) string {
	body, _ := json.Marshal([]any{externalID, planID, method})
	return partnerTenantHash(string(body))
}

// Convert only finite, positive, exactly-cent-denominated prices. Decimal is
// constructed from the float's shortest representation, not its binary tail.
func PartnerTenantPlanCents(price float64) (int64, error) {
	if math.IsNaN(price) || math.IsInf(price, 0) || price <= 0 || price > 99999999 {
		return 0, ErrPartnerTenantOrderUnavailable
	}
	cents := decimal.NewFromFloat(price).Mul(decimal.NewFromInt(100))
	if !cents.Equal(cents.Truncate(0)) {
		return 0, ErrPartnerTenantOrderUnavailable
	}
	return cents.IntPart(), nil
}

var tenantMoneyPattern = regexp.MustCompile(`^[0-9]{1,10}(\.[0-9]{1,2})?$`)

func ParsePartnerTenantPaymentCents(money string) (int64, error) {
	if !tenantMoneyPattern.MatchString(money) {
		return 0, ErrPartnerTenantPaymentEvidence
	}
	d, err := decimal.NewFromString(money)
	if err != nil || !d.IsPositive() {
		return 0, ErrPartnerTenantPaymentEvidence
	}
	return d.Mul(decimal.NewFromInt(100)).IntPart(), nil
}
func (o *PartnerTenantSubscriptionOrder) Amount() string {
	return fmt.Sprintf("%d.%02d", o.AmountCents/100, o.AmountCents%100)
}
func (o *PartnerTenantSubscriptionOrder) VisiblePaymentStatus(now int64) string {
	if o.PaymentStatus == "pending" && o.ExpiresAt <= now {
		return "expired"
	}
	return o.PaymentStatus
}

func validPartnerTenantPlan(p *SubscriptionPlan, t *PartnerTenant) bool {
	return p.Enabled && p.PartnerTenantId == t.Id && p.DurationUnit == SubscriptionDurationMonth && p.DurationValue == 1 &&
		p.QuotaResetPeriod == SubscriptionResetMonthly && p.TotalAmount >= 0 && p.ApplicableGroup == t.Group &&
		(p.UpgradeGroup == "" || p.UpgradeGroup == t.Group) && p.DowngradeGroup == "" && p.AllowWalletOverflow != nil && !*p.AllowWalletOverflow
}

type PartnerTenantOrderInput struct {
	TenantId        int64
	ExternalUserId  string
	PlanId          int
	PaymentMethod   string
	MerchantId      string
	IdempotencyHash string
}

func CreatePartnerTenantSubscriptionOrder(in PartnerTenantOrderInput) (*PartnerTenantSubscriptionOrder, bool, error) {
	if in.TenantId <= 0 || !IsValidPartnerTenantExternalUserID(in.ExternalUserId) || in.PlanId <= 0 || len(in.IdempotencyHash) != 64 || in.MerchantId == "" || len(in.MerchantId) > 64 || len(in.PaymentMethod) > 16 || in.PaymentMethod == "" {
		return nil, false, ErrPartnerTenantOrderUnavailable
	}
	requestHash := PartnerTenantOrderRequestHash(in.ExternalUserId, in.PlanId, in.PaymentMethod)
	var order PartnerTenantSubscriptionOrder
	created := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		var tenant PartnerTenant
		if err := lockForUpdate(tx).Where("id = ? AND status = ?", in.TenantId, PartnerTenantStatusEnabled).First(&tenant).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPartnerTenantNotFound
			}
			return err
		}
		prior := lockForUpdate(tx).Where("tenant_id = ? AND idempotency_hash = ?", in.TenantId, in.IdempotencyHash).Limit(1).Find(&order)
		if prior.Error != nil {
			return prior.Error
		}
		if prior.RowsAffected > 0 {
			if order.RequestHash != requestHash {
				return ErrPartnerTenantIdempotencyConflict
			}
			return nil
		}
		var plan SubscriptionPlan
		if err := lockForUpdate(tx).Where("id = ?", in.PlanId).First(&plan).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPartnerTenantPlanNotFound
			}
			return err
		}
		if !validPartnerTenantPlan(&plan, &tenant) {
			return ErrPartnerTenantPlanNotFound
		}
		if plan.Currency != "CNY" {
			return ErrPartnerTenantUnsupportedCurrency
		}
		cents, err := PartnerTenantPlanCents(plan.PriceAmount)
		if err != nil {
			return err
		}
		var account PartnerTenantAccount
		found := partnerTenantAccountQuery(lockForUpdate(tx), tenant.Id, in.ExternalUserId).Limit(1).Find(&account)
		if found.Error != nil {
			return found.Error
		}
		if found.RowsAffected > 0 {
			if _, err := validatePartnerTenantAccountTx(tx, &tenant, &account); err != nil {
				return err
			}
		}
		now := getDBTimestampOn(tx)
		renewalID, err := partnerTenantPurchaseIntentTx(tx, &tenant, &account, in.ExternalUserId, &plan, now)
		if err != nil {
			return err
		}
		var recent, pending, tenantRecent int64
		base := tx.Model(&PartnerTenantSubscriptionOrder{}).Where("tenant_id = ?", tenant.Id)
		if err := base.Session(&gorm.Session{}).Where("created_at > ?", now-3600).Count(&tenantRecent).Error; err != nil {
			return err
		}
		own := tx.Model(&PartnerTenantSubscriptionOrder{}).Where("tenant_id = ? AND external_user_hash = ?", tenant.Id, partnerTenantHash(in.ExternalUserId))
		if err := own.Session(&gorm.Session{}).Where("created_at > ?", now-3600).Count(&recent).Error; err != nil {
			return err
		}
		if err := own.Session(&gorm.Session{}).Where("payment_status = ? AND expires_at > ?", "pending", now).Count(&pending).Error; err != nil {
			return err
		}
		if tenantRecent >= 2000 || recent >= 20 || pending >= 5 {
			return ErrPartnerTenantOrderLimited
		}
		suffix, err := common.GenerateRandomCharsKey(32)
		if err != nil {
			return err
		}
		snapshot, err := json.Marshal(plan)
		if err != nil {
			return err
		}
		order = PartnerTenantSubscriptionOrder{TenantId: tenant.Id, ExternalUserId: in.ExternalUserId, ExternalUserHash: partnerTenantHash(in.ExternalUserId),
			IdempotencyHash: in.IdempotencyHash, RequestHash: requestHash, OrderNo: "PTO" + suffix, PlanId: plan.Id, PlanTitle: plan.Title, PlanSnapshot: string(snapshot),
			AmountCents: cents, Currency: "CNY", PaymentProvider: PaymentProviderEpay, PaymentMethod: in.PaymentMethod, MerchantId: in.MerchantId,
			PaymentStatus: "pending", FulfillmentStatus: "not_ready", CreatedAt: now, ExpiresAt: now + PartnerTenantOrderLifetime, RenewalSubscriptionId: renewalID}
		if err := tx.Create(&order).Error; err != nil {
			return err
		}
		created = true
		return nil
	})
	return &order, created, err
}

// The tenant lock serializes this eligibility check with order creation and
// delivery. Locking/current reads precede counts (important on MySQL RR).
func partnerTenantPurchaseIntentTx(tx *gorm.DB, tenant *PartnerTenant, account *PartnerTenantAccount, externalID string, plan *SubscriptionPlan, now int64) (int, error) {
	if account.UserId > 0 {
		var active UserSubscription
		found := lockForUpdate(tx).Where("user_id = ? AND plan_id = ? AND status = ? AND start_time <= ? AND end_time > ?", account.UserId, plan.Id, "active", now, now).
			Order("end_time desc, id desc").Limit(1).Find(&active)
		if found.Error != nil {
			return 0, found.Error
		}
		if found.RowsAffected > 0 {
			if active.Source != SubscriptionSourcePartner {
				return 0, ErrPartnerTenantPlanNotFound
			}
			return active.Id, nil
		}
	}
	if plan.MaxPurchasePerUser <= 0 {
		return 0, nil
	}
	var purchased, reserved int64
	if account.UserId > 0 {
		if err := tx.Model(&UserSubscription{}).Where("user_id = ? AND plan_id = ?", account.UserId, plan.Id).Count(&purchased).Error; err != nil {
			return 0, err
		}
	}
	// Pending orders can still receive a genuine late callback, even after
	// cashier expiry. Do not sell the same limited slot twice. Replays reuse
	// the original order; expiry alone cannot safely release a paid intent.
	if err := tx.Model(&PartnerTenantSubscriptionOrder{}).
		Where("tenant_id = ? AND external_user_hash = ? AND plan_id = ? AND renewal_subscription_id = 0", tenant.Id, partnerTenantHash(externalID), plan.Id).
		Where("payment_status IN ? AND fulfillment_status <> ?", []string{"pending", "paid"}, "fulfilled").Count(&reserved).Error; err != nil {
		return 0, err
	}
	if purchased+reserved >= int64(plan.MaxPurchasePerUser) {
		return 0, ErrPartnerTenantPurchaseLimit
	}
	return 0, nil
}

func FindPartnerTenantOrderByIdempotency(tenantID int64, keyHash string) (*PartnerTenantSubscriptionOrder, error) {
	var order PartnerTenantSubscriptionOrder
	if err := DB.Where("tenant_id = ? AND idempotency_hash = ?", tenantID, keyHash).First(&order).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPartnerTenantOrderNotFound
		}
		return nil, err
	}
	return &order, nil
}

func GetPartnerTenantSubscriptionOrder(tenantID int64, orderNo string) (*PartnerTenantSubscriptionOrder, error) {
	var order PartnerTenantSubscriptionOrder
	q := DB.Where("order_no = ?", orderNo)
	if tenantID > 0 {
		q = q.Where("tenant_id = ?", tenantID)
	}
	if err := q.First(&order).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPartnerTenantOrderNotFound
		}
		return nil, err
	}
	// Avoid case-insensitive MySQL order-number aliases.
	if order.OrderNo != orderNo {
		return nil, ErrPartnerTenantOrderNotFound
	}
	return &order, nil
}

// Claim outlasts the transport timeout. Compare the claim on completion/release
// so an old process cannot overwrite a successor's preparation.
func ClaimPartnerTenantCheckout(id int64) (int64, error) {
	var claim int64
	err := DB.Transaction(func(tx *gorm.DB) error {
		var order PartnerTenantSubscriptionOrder
		if err := lockForUpdate(tx).First(&order, id).Error; err != nil {
			return err
		}
		now := getDBTimestampOn(tx)
		if order.PaymentStatus != "pending" || order.ExpiresAt <= now || order.QRCode != "" || order.PayURL != "" {
			return nil
		}
		if order.CheckoutClaimedAt > now-PartnerTenantCheckoutClaimSeconds {
			return ErrPartnerTenantOrderUnavailable
		}
		claim = now
		return tx.Model(&order).Update("checkout_claimed_at", now).Error
	})
	return claim, err
}
func SavePartnerTenantCheckout(id, claim int64, qr, payURL string) error {
	return DB.Model(&PartnerTenantSubscriptionOrder{}).Where("id = ? AND checkout_claimed_at = ? AND payment_status = ?", id, claim, "pending").Updates(map[string]any{"qr_code": qr, "pay_url": payURL, "checkout_claimed_at": 0}).Error
}

// Called only after provider signature/merchant verification. Payment is its
// own durable transaction and never rolls back because provisioning failed.
func RecordPartnerTenantPayment(orderNo, provider, merchant, method, transaction string, cents int64) error {
	if transaction == "" || len(transaction) > 128 || merchant == "" {
		return ErrPartnerTenantPaymentEvidence
	}
	evidence := partnerTenantHash(provider + "\x00" + merchant + "\x00" + transaction)
	return DB.Transaction(func(tx *gorm.DB) error {
		var order PartnerTenantSubscriptionOrder
		if err := lockForUpdate(tx).Where("order_no = ?", orderNo).First(&order).Error; err != nil {
			return err
		}
		if order.OrderNo != orderNo || order.PaymentProvider != provider || order.MerchantId != merchant || order.PaymentMethod != method || order.AmountCents != cents || order.Currency != "CNY" {
			return ErrPartnerTenantPaymentEvidence
		}
		if order.TransactionHash != nil {
			if *order.TransactionHash != evidence || order.PaymentStatus != "paid" {
				return ErrPartnerTenantPaymentEvidence
			}
			return nil
		}
		// Includes a late real payment: expiry restricts checkout, not payment truth.
		return tx.Model(&order).Updates(map[string]any{"payment_status": "paid", "fulfillment_status": "pending", "transaction_hash": evidence,
			"paid_at": getDBTimestampOn(tx), "next_delivery_at": 0, "qr_code": "", "pay_url": ""}).Error
	})
}

func FulfillPartnerTenantSubscriptionOrder(orderNo string) error {
	initial, err := GetPartnerTenantSubscriptionOrder(0, orderNo)
	if err != nil {
		return err
	}
	var userID int
	err = DB.Transaction(func(tx *gorm.DB) error {
		// Every operation that needs both locks uses tenant -> order -> account.
		var tenant PartnerTenant
		if err := lockForUpdate(tx).Where("id = ? AND status = ?", initial.TenantId, PartnerTenantStatusEnabled).First(&tenant).Error; err != nil {
			return err
		}
		var order PartnerTenantSubscriptionOrder
		if err := lockForUpdate(tx).First(&order, initial.Id).Error; err != nil {
			return err
		}
		if order.PaymentStatus != "paid" {
			return ErrPartnerTenantPaymentEvidence
		}
		if order.FulfillmentStatus == "fulfilled" {
			return nil
		}
		var plan, frozen SubscriptionPlan
		if err := lockForUpdate(tx).First(&plan, order.PlanId).Error; err != nil {
			return err
		}
		if json.Unmarshal([]byte(order.PlanSnapshot), &frozen) != nil || !validPartnerTenantPlan(&plan, &tenant) || !validPartnerTenantPlan(&frozen, &tenant) || frozen.Id != order.PlanId ||
			plan.TotalAmount != frozen.TotalAmount || plan.UpgradeGroup != frozen.UpgradeGroup || plan.MaxPurchasePerUser != frozen.MaxPurchasePerUser {
			return ErrPartnerTenantPlanNotFound
		}
		_, id, err := provisionPartnerTenantAccountTx(tx, &tenant, order.ExternalUserId, "")
		if err != nil {
			return err
		}
		subscription, _, err := grantPartnerTenantSubscriptionTx(tx, id, &frozen, order.RenewalSubscriptionId)
		if err != nil {
			return err
		}
		if err := tx.Model(&order).Updates(map[string]any{"fulfillment_status": "fulfilled", "subscription_id": subscription.Id, "fulfilled_at": getDBTimestampOn(tx), "delivery_error": "", "next_delivery_at": 0}).Error; err != nil {
			return err
		}
		userID = id
		return nil
	})
	if err != nil {
		// Safe bounded classification only; never store DB/provider errors or bodies.
		_ = DB.Model(&PartnerTenantSubscriptionOrder{}).Where("id = ? AND payment_status = ? AND fulfillment_status <> ?", initial.Id, "paid", "fulfilled").Updates(map[string]any{
			"fulfillment_status": "failed_retryable", "delivery_error": "delivery_unavailable", "delivery_attempts": gorm.Expr("delivery_attempts + 1"), "next_delivery_at": common.GetTimestamp() + 60,
		}).Error
		return err
	}
	if userID > 0 {
		partnerTenantMembershipCache.Set(userID, true)
	}
	return nil
}

// Bounded DB-backed recovery works without a browser and across restarts.
// Concurrent replicas are safe because fulfillment is serialized in the DB.
func RecoverPartnerTenantSubscriptionOrders(limit int) error {
	if limit <= 0 || limit > 100 {
		limit = 100
	}
	var orders []PartnerTenantSubscriptionOrder
	if err := DB.Select("order_no").Where("payment_status = ? AND fulfillment_status IN ? AND next_delivery_at <= ?", "paid", []string{"pending", "failed_retryable"}, common.GetTimestamp()).Order("next_delivery_at, id").Limit(limit).Find(&orders).Error; err != nil {
		return err
	}
	for _, order := range orders {
		_ = FulfillPartnerTenantSubscriptionOrder(order.OrderNo)
	}
	return nil
}

// Hash equality is portable across case-insensitive SQL collations. The exact
// fallback supports legacy rows during the non-destructive hash backfill.
func partnerTenantAccountQuery(tx *gorm.DB, tenantID int64, externalID string) *gorm.DB {
	exact := "external_user_id = ?"
	switch tx.Dialector.Name() {
	case "mysql":
		exact = "BINARY external_user_id = BINARY ?"
	case "sqlite":
		exact = "external_user_id = ? COLLATE BINARY"
	}
	return tx.Where("tenant_id = ?", tenantID).Where("(external_user_id_hash = ? OR (external_user_id_hash IS NULL AND "+exact+"))", partnerTenantHash(externalID), externalID)
}

// Preserve every legacy mapping while replacing collation-dependent uniqueness.
func migratePartnerTenantAccountIdentity(db *gorm.DB) error {
	for {
		var accounts []PartnerTenantAccount
		if err := db.Where("external_user_id_hash IS NULL").Order("id").Limit(200).Find(&accounts).Error; err != nil {
			return err
		}
		if len(accounts) == 0 {
			break
		}
		for _, a := range accounts {
			if err := db.Model(&PartnerTenantAccount{}).Where("id = ? AND external_user_id_hash IS NULL", a.Id).Update("external_user_id_hash", partnerTenantHash(a.ExternalUserId)).Error; err != nil {
				return err
			}
		}
	}
	if db.Migrator().HasIndex(&PartnerTenantAccount{}, "idx_partner_tenant_external_user") {
		return db.Migrator().DropIndex(&PartnerTenantAccount{}, "idx_partner_tenant_external_user")
	}
	return nil
}
