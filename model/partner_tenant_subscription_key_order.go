package model

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

type PartnerTenantSubscriptionKeyOrderInput struct {
	TenantId         int64
	TenantSecretHash string
	IdempotencyHash  string
	PlanId           int
	PaymentMethod    string
	MerchantId       string
	// Empty means independent new purchase. HTTP layer rejects present-but-empty.
	SubscriptionKey string
}

func CreatePartnerTenantSubscriptionKeyOrder(in PartnerTenantSubscriptionKeyOrderInput, validateNew func() error) (*PartnerTenantSubscriptionOrder, bool, error) {
	if in.TenantId < 1 || in.PlanId < 1 || !validPartnerTenantPurchaseHex(in.IdempotencyHash) || in.PaymentMethod == "" || len(in.PaymentMethod) > 16 {
		return nil, false, ErrPartnerTenantOrderUnavailable
	}
	var locator *PartnerTenantSubscriptionAccessKey
	var err error
	if in.SubscriptionKey != "" {
		locator, err = findPartnerTenantSubscriptionKey(in.SubscriptionKey)
		if err != nil {
			return nil, false, err
		}
		if locator.TenantId != in.TenantId {
			return nil, false, ErrPartnerTenantSubscriptionKeyInvalid
		}
	}
	var order PartnerTenantSubscriptionOrder
	created := false
	err = partnerTenantSecretDB(DB).Transaction(func(tx *gorm.DB) error {
		tenant, err := lockPartnerTenantAdmission(tx, in.TenantId, in.TenantSecretHash, PartnerTenantOperationSubscriptionKey)
		if err != nil {
			return err
		}
		hash := partnerTenantHash("partner-tenant-subscription-order:v1\x00" + in.IdempotencyHash)
		renewalID := 0
		if locator != nil {
			renewalID = locator.UserSubscriptionId
		}
		canonical, _ := json.Marshal([]any{"subscription_key:v1", in.PlanId, in.PaymentMethod, renewalID})
		request := partnerTenantHash(string(canonical))
		prior := lockForUpdate(tx).Where("tenant_id = ? AND idempotency_hash = ?", tenant.Id, hash).Limit(1).Find(&order)
		if prior.Error != nil {
			return prior.Error
		}
		if prior.RowsAffected > 0 && (order.EntryMode != PartnerTenantIdentitySubscriptionKey || order.RequestHash != request) {
			return ErrPartnerTenantIdempotencyConflict
		}
		var binding *partnerTenantSubscriptionBinding
		var plan SubscriptionPlan
		if locator != nil {
			binding, err = lockPartnerTenantSubscriptionBindingTx(tx, tenant, locator.AccountId, locator.UserSubscriptionId, in.SubscriptionKey, false, nil)
			if err != nil {
				return err
			}
			if binding.subscription.PlanId != in.PlanId || !renewablePartnerTenantSubscription(binding) {
				return ErrPartnerTenantSubscriptionNotFound
			}
			plan = binding.plan
		} else if prior.RowsAffected == 0 {
			if err := lockForUpdate(tx).First(&plan, in.PlanId).Error; err != nil {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					return ErrPartnerTenantPlanNotFound
				}
				return err
			}
		}
		if prior.RowsAffected > 0 {
			if binding != nil && (order.AccountId != binding.account.Id || order.RenewalSubscriptionId != binding.subscription.Id) {
				return ErrPartnerTenantSubscriptionNotFound
			}
			return nil
		}
		if !validPartnerTenantPlan(&plan, tenant) {
			return ErrPartnerTenantPlanNotFound
		}
		if plan.Currency != "CNY" {
			return ErrPartnerTenantUnsupportedCurrency
		}
		cents, err := PartnerTenantPlanCents(plan.PriceAmount)
		if err != nil {
			return err
		}
		if in.MerchantId == "" || len(in.MerchantId) > 64 {
			return ErrPartnerTenantOrderUnavailable
		}
		if validateNew != nil {
			if err := validateNew(); err != nil {
				return err
			}
		}
		now, err := getDBTimestampOnStrict(tx)
		if err != nil {
			return err
		}
		var tenantRecent int64
		if err := tx.Model(&PartnerTenantSubscriptionOrder{}).Where("tenant_id = ? AND created_at > ?", tenant.Id, now-3600).Count(&tenantRecent).Error; err != nil {
			return err
		}
		if tenantRecent >= 2000 {
			return ErrPartnerTenantOrderLimited
		}
		accountID := int64(0)
		if binding != nil {
			accountID = binding.account.Id
			var recent, pending int64
			own := tx.Model(&PartnerTenantSubscriptionOrder{}).Where("tenant_id = ? AND entry_mode = ? AND account_id = ?", tenant.Id, PartnerTenantIdentitySubscriptionKey, accountID)
			if err := own.Session(&gorm.Session{}).Where("created_at > ?", now-3600).Count(&recent).Error; err != nil {
				return err
			}
			if err := own.Session(&gorm.Session{}).Where("payment_status = ? AND expires_at > ?", "pending", now).Count(&pending).Error; err != nil {
				return err
			}
			if recent >= 20 || pending >= 5 {
				return ErrPartnerTenantOrderLimited
			}
		}
		suffix, err := common.GenerateRandomCharsKey(32)
		if err != nil {
			return err
		}
		snapshot, err := json.Marshal(plan)
		if err != nil {
			return err
		}
		budgetHash := partnerTenantHash("partner-tenant-subscription-intent:v1\x00" + hash)
		if accountID > 0 {
			budgetHash = partnerTenantHash(fmt.Sprintf("partner-tenant-subscription-budget:v1\x00%d", accountID))
		}
		order = PartnerTenantSubscriptionOrder{EntryMode: PartnerTenantIdentitySubscriptionKey, TenantId: tenant.Id, AccountId: accountID, ExternalUserId: "", ExternalUserHash: budgetHash,
			IdempotencyHash: hash, RequestHash: request, OrderNo: "PTO" + suffix, PlanId: plan.Id, PlanTitle: plan.Title, PlanSnapshot: string(snapshot), AmountCents: cents, Currency: "CNY",
			PaymentProvider: PaymentProviderEpay, PaymentMethod: in.PaymentMethod, MerchantId: in.MerchantId, PaymentStatus: "pending", FulfillmentStatus: "not_ready", CreatedAt: now, ExpiresAt: now + PartnerTenantOrderLifetime, RenewalSubscriptionId: renewalID}
		if err := tx.Create(&order).Error; err != nil {
			return err
		}
		created = true
		return nil
	})
	return &order, created, err
}

// Current pt_ revalidated under Tenant lock even for read-only reconciliation.
func GetPartnerTenantSubscriptionKeyOrder(tenantID int64, secretHash, orderNo string) (*PartnerTenantSubscriptionOrder, error) {
	var order PartnerTenantSubscriptionOrder
	err := partnerTenantSecretDB(DB).Transaction(func(tx *gorm.DB) error {
		if _, err := lockPartnerTenantAdmission(tx, tenantID, secretHash, PartnerTenantOperationSubscriptionKey); err != nil {
			return err
		}
		if err := lockForUpdate(tx).Where("tenant_id = ? AND entry_mode = ? AND order_no = ?", tenantID, PartnerTenantIdentitySubscriptionKey, orderNo).First(&order).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPartnerTenantOrderNotFound
			}
			return err
		}
		if order.OrderNo != orderNo {
			return ErrPartnerTenantOrderNotFound
		}
		return nil
	})
	return &order, err
}

// Caller holds Tenant -> Order. Verified payment was committed separately.
func fulfillPartnerTenantSubscriptionKeyOrderTx(tx *gorm.DB, tenant *PartnerTenant, order *PartnerTenantSubscriptionOrder, audit *PartnerTenantAuditReceipt) (int, error) {
	tx = partnerTenantSecretDB(tx)
	if order.PaymentStatus != "paid" || order.ExternalUserId != "" {
		return 0, ErrPartnerTenantPaymentEvidence
	}
	var plan, frozen SubscriptionPlan
	if err := lockForUpdate(tx).First(&plan, order.PlanId).Error; err != nil {
		return 0, err
	}
	if json.Unmarshal([]byte(order.PlanSnapshot), &frozen) != nil || !validPartnerTenantPlan(&plan, tenant) || !validPartnerTenantPlan(&frozen, tenant) || frozen.Id != order.PlanId || frozen.Currency != "CNY" ||
		plan.TotalAmount != frozen.TotalAmount || plan.UpgradeGroup != frozen.UpgradeGroup || plan.MaxPurchasePerUser != frozen.MaxPurchasePerUser {
		return 0, ErrPartnerTenantPlanNotFound
	}
	var account *PartnerTenantAccount
	var subscription *UserSubscription
	if order.RenewalSubscriptionId > 0 {
		if order.AccountId < 1 {
			return 0, ErrPartnerTenantSubscriptionNotFound
		}
		// Same Plan already locked; helper reacquires only the same row, never a different plan.
		b, err := lockPartnerTenantSubscriptionBindingTx(tx, tenant, order.AccountId, order.RenewalSubscriptionId, "", false, &plan)
		if err != nil {
			return 0, err
		}
		if b.subscription.PlanId != order.PlanId || !renewablePartnerTenantSubscription(b) {
			return 0, ErrPartnerTenantSubscriptionNotFound
		}
		account = &b.account
		// Subscription is already locked. Tenant serializes key operations; extension
		// uses the shared calendar/reset algorithm, not a second grant implementation.
		subscription, _, err = grantPartnerTenantSubscriptionAtTx(tx, account.UserId, &frozen, order.RenewalSubscriptionId, b.now)
		if err != nil {
			return 0, err
		}
	} else {
		if order.AccountId != 0 || order.SubscriptionId != 0 {
			return 0, ErrPartnerTenantSubscriptionKeyNotFound
		}
		var existing PartnerTenantAccount
		found := lockForUpdate(tx).Where("source_order_id = ?", order.Id).Limit(1).Find(&existing)
		if found.Error != nil {
			return 0, found.Error
		}
		// Local effects and fulfilled are atomic: a pre-existing partial mapping is
		// corruption, not permission to attach a different identity or mint again.
		if found.RowsAffected > 0 {
			return 0, ErrPartnerTenantSubscriptionKeyNotFound
		}
		user, token, err := createPartnerTenantUserTokenTx(tx, tenant, "Subscription account")
		if err != nil {
			return 0, err
		}
		now, err := getDBTimestampOnStrict(tx)
		if err != nil {
			return 0, err
		}
		sourceOrder := order.Id
		account = &PartnerTenantAccount{IdentitySource: PartnerTenantIdentitySubscriptionKey, SourceOrderId: &sourceOrder, TenantId: tenant.Id, ExternalUserId: "",
			ExternalUserIdHash: partnerTenantHash("partner-tenant-subscription-account:v1\x00" + order.OrderNo), UserId: user.Id, TokenId: token.Id, Status: PartnerTenantStatusEnabled, CreatedAt: now, UpdatedAt: now}
		if err := tx.Create(account).Error; err != nil {
			return 0, err
		}
		subscription, err = createUserSubscriptionFromPlanAtTx(tx, user.Id, &frozen, SubscriptionSourcePartner, now)
		if err != nil {
			return 0, err
		}
		k := &PartnerTenantSubscriptionAccessKey{TenantId: tenant.Id, AccountId: account.Id, UserSubscriptionId: subscription.Id, IssuedOrderId: order.Id, KeyVersion: 1, CreatedAt: now, UpdatedAt: now}
		if _, err := replacePartnerTenantSubscriptionSeed(k); err != nil {
			return 0, err
		}
		if err := tx.Create(k).Error; err != nil {
			return 0, err
		}
		if audit != nil {
			*audit = PartnerTenantAuditPrincipal(tenant)
			audit.OrderNo = order.OrderNo
			audit.SubscriptionId = int64(subscription.Id)
			audit.TargetUserId = account.UserId
			audit.KeyVersion = k.KeyVersion
		}
	}
	now, err := getDBTimestampOnStrict(tx)
	if err != nil {
		return 0, err
	}
	if err := tx.Model(order).Updates(map[string]any{"account_id": account.Id, "subscription_id": subscription.Id, "fulfillment_status": "fulfilled", "fulfilled_at": now, "delivery_error": "", "next_delivery_at": 0}).Error; err != nil {
		return 0, err
	}
	return account.UserId, nil
}
