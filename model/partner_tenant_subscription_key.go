package model

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var (
	ErrPartnerTenantSubscriptionKeyInvalid     = errors.New("invalid subscription key")
	ErrPartnerTenantSubscriptionKeyUnavailable = errors.New("subscription key unavailable")
	ErrPartnerTenantSubscriptionKeyNotFound    = errors.New("subscription key not found")
	ErrPartnerTenantSubscriptionKeyNotReady    = errors.New("subscription key not ready")
	ErrPartnerTenantSubscriptionKeyChanged     = errors.New("subscription key changed")
	ErrPartnerTenantSubscriptionNotFound       = errors.New("subscription not found")
)

// Never serialize persistence models containing derivation material.
type PartnerTenantSubscriptionAccessKey struct {
	Id                 int64  `json:"-" gorm:"primaryKey"`
	TenantId           int64  `json:"-" gorm:"not null;index"`
	AccountId          int64  `json:"-" gorm:"not null;uniqueIndex:idx_pt_subkey_account"`
	UserSubscriptionId int    `json:"-" gorm:"not null;uniqueIndex:idx_pt_subkey_subscription"`
	IssuedOrderId      int64  `json:"-" gorm:"not null"`
	Seed               string `json:"-" gorm:"type:char(64);not null"`
	KeyVersion         int64  `json:"-" gorm:"not null"`
	SecretHash         string `json:"-" gorm:"type:char(64);not null;uniqueIndex:idx_pt_subkey_hash"`
	CreatedAt          int64  `json:"-" gorm:"not null"`
	UpdatedAt          int64  `json:"-" gorm:"not null"`
}

func (PartnerTenantSubscriptionAccessKey) TableName() string {
	return "partner_tenant_subscription_access_keys"
}

type PartnerTenantSubscriptionKeyRotation struct {
	Id                 int64  `json:"-" gorm:"primaryKey"`
	TenantId           int64  `json:"-" gorm:"not null;uniqueIndex:idx_pt_subkey_rotate_request,priority:1"`
	IdempotencyHash    string `json:"-" gorm:"type:char(64);not null;uniqueIndex:idx_pt_subkey_rotate_request,priority:2"`
	RequestHash        string `json:"-" gorm:"type:char(64);not null"`
	UserSubscriptionId int    `json:"-" gorm:"not null"`
	ResultVersion      int64  `json:"-" gorm:"not null"`
	CreatedAt          int64  `json:"-" gorm:"not null"`
}

func (PartnerTenantSubscriptionKeyRotation) TableName() string {
	return "partner_tenant_subscription_key_rotations"
}

// These transactions handle seed/Coding Key material. Never let debug SQL
// interpolation expose it, even when the process enables global DEBUG logging.
func partnerTenantSecretDB(db *gorm.DB) *gorm.DB {
	return db.Session(&gorm.Session{Logger: logger.Default.LogMode(logger.Silent)})
}

// Actual startup and isolated fixtures use this affected-schema migration.
func MigratePartnerTenantSubscriptionKeys(db *gorm.DB) error {
	if err := db.AutoMigrate(&PartnerTenantAccount{}, &PartnerTenantSubscriptionOrder{}, &PartnerTenantSubscriptionAccessKey{}, &PartnerTenantSubscriptionKeyRotation{}); err != nil {
		return err
	}
	if err := db.Model(&PartnerTenantAccount{}).Where("identity_source IS NULL OR identity_source = ?", "").Update("identity_source", PartnerTenantIdentityExternal).Error; err != nil {
		return err
	}
	if err := db.Model(&PartnerTenantSubscriptionOrder{}).Where("entry_mode IS NULL OR entry_mode = ?", "").Update("entry_mode", PartnerTenantIdentityExternal).Error; err != nil {
		return err
	}
	return migratePartnerTenantAccountIdentity(db)
}

func IsValidPartnerTenantSubscriptionKey(key string) bool {
	return strings.HasPrefix(key, "sub_") && validPartnerTenantPurchaseHex(strings.TrimPrefix(key, "sub_"))
}
func derivePartnerTenantSubscriptionKey(k *PartnerTenantSubscriptionAccessKey) (string, error) {
	if common.CryptoSecret == "" || k.KeyVersion < 1 || !validPartnerTenantPurchaseHex(k.Seed) {
		return "", ErrPartnerTenantSubscriptionKeyUnavailable
	}
	mac := hmac.New(sha256.New, []byte(common.CryptoSecret))
	_, _ = fmt.Fprintf(mac, "partner-tenant-subscription-key:v1\x00%d\x00%d\x00%d\x00%s\x00%d", k.TenantId, k.AccountId, k.UserSubscriptionId, k.Seed, k.KeyVersion)
	return "sub_" + hex.EncodeToString(mac.Sum(nil)), nil
}
func currentPartnerTenantSubscriptionKey(k *PartnerTenantSubscriptionAccessKey) (string, error) {
	key, err := derivePartnerTenantSubscriptionKey(k)
	if err != nil {
		return "", err
	}
	if !hmac.Equal([]byte(partnerTenantHash(key)), []byte(k.SecretHash)) {
		return "", ErrPartnerTenantSubscriptionKeyUnavailable
	}
	return key, nil
}
func replacePartnerTenantSubscriptionSeed(k *PartnerTenantSubscriptionAccessKey) (string, error) {
	var seed [32]byte
	if _, err := rand.Read(seed[:]); err != nil {
		return "", err
	}
	k.Seed = hex.EncodeToString(seed[:])
	key, err := derivePartnerTenantSubscriptionKey(k)
	if err != nil {
		return "", err
	}
	k.SecretHash = partnerTenantHash(key)
	return key, nil
}
func findPartnerTenantSubscriptionKey(key string) (*PartnerTenantSubscriptionAccessKey, error) {
	if !IsValidPartnerTenantSubscriptionKey(key) {
		return nil, ErrPartnerTenantSubscriptionKeyInvalid
	}
	var k PartnerTenantSubscriptionAccessKey
	if err := DB.Where("secret_hash = ?", partnerTenantHash(key)).First(&k).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPartnerTenantSubscriptionKeyInvalid
		}
		return nil, err
	}
	return &k, nil // Locator only. All authority is revalidated under locks.
}
func lockPartnerTenantCurrentSecret(tx *gorm.DB, tenantID int64, secretHash string) (*PartnerTenant, error) {
	var t PartnerTenant
	if err := lockForUpdate(tx).First(&t, tenantID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPartnerTenantNotFound
		}
		return nil, err
	}
	if t.Status != PartnerTenantStatusEnabled || !hmac.Equal([]byte(t.SecretHash), []byte(secretHash)) {
		return nil, ErrPartnerTenantNotFound
	}
	return &t, nil
}

type partnerTenantSubscriptionBinding struct {
	account      PartnerTenantAccount
	token        *Token
	subscription UserSubscription
	key          PartnerTenantSubscriptionAccessKey
	plan         SubscriptionPlan
	now          int64
}

// Caller holds Tenant, and Order if needed. Order/Key pre-reads are locators,
// never authority. Lock order: Plan -> Account -> User -> Token -> Subscription -> Key.
// allowUnavailableRoot is ONLY for an explicit merchant-authorized rotation.
func lockPartnerTenantSubscriptionBindingTx(tx *gorm.DB, tenant *PartnerTenant, accountID int64, subscriptionID int, bearer string, allowUnavailableRoot bool, lockedPlan *SubscriptionPlan) (*partnerTenantSubscriptionBinding, error) {
	b := &partnerTenantSubscriptionBinding{}
	var locator UserSubscription
	if err := tx.First(&locator, subscriptionID).Error; err != nil {
		return nil, subscriptionBindingError(err)
	}
	if lockedPlan != nil {
		if locator.PlanId != lockedPlan.Id {
			return nil, ErrPartnerTenantSubscriptionNotFound
		}
		b.plan = *lockedPlan
	} else if err := lockForUpdate(tx).First(&b.plan, locator.PlanId).Error; err != nil {
		return nil, subscriptionBindingError(err)
	}
	if err := lockForUpdate(tx).Where("id = ? AND tenant_id = ? AND identity_source = ?", accountID, tenant.Id, PartnerTenantIdentitySubscriptionKey).First(&b.account).Error; err != nil {
		return nil, subscriptionBindingError(err)
	}
	if b.account.SourceOrderId == nil || b.account.ExternalUserId != "" {
		return nil, ErrPartnerTenantSubscriptionKeyNotFound
	}
	var err error
	b.token, err = validatePartnerTenantAccountClockTx(tx, tenant, &b.account, true)
	if err != nil {
		return nil, err
	}
	if err := lockForUpdate(tx).First(&b.subscription, subscriptionID).Error; err != nil {
		return nil, subscriptionBindingError(err)
	}
	if err := lockForUpdate(tx).Where("user_subscription_id = ?", subscriptionID).First(&b.key).Error; err != nil {
		return nil, subscriptionBindingError(err)
	}
	s, k, a := &b.subscription, &b.key, &b.account
	if s.PlanId != locator.PlanId || s.PlanId != b.plan.Id || s.UserId != a.UserId || s.Source != SubscriptionSourcePartner || s.AllowWalletOverflow ||
		b.plan.PartnerTenantId != tenant.Id || b.plan.ApplicableGroup != tenant.Group || k.AccountId != a.Id || k.TenantId != tenant.Id || k.IssuedOrderId != *a.SourceOrderId {
		return nil, ErrPartnerTenantSubscriptionKeyNotFound
	}
	var anchor PartnerTenantSubscriptionOrder
	if err := tx.First(&anchor, k.IssuedOrderId).Error; err != nil {
		return nil, subscriptionBindingError(err)
	}
	if anchor.EntryMode != PartnerTenantIdentitySubscriptionKey || anchor.ExternalUserId != "" || anchor.PlanId != s.PlanId || anchor.TenantId != tenant.Id || anchor.AccountId != a.Id || anchor.SubscriptionId != s.Id || anchor.RenewalSubscriptionId != 0 || anchor.PaymentStatus != "paid" || anchor.FulfillmentStatus != "fulfilled" || a.ExternalUserIdHash != partnerTenantHash("partner-tenant-subscription-account:v1\x00"+anchor.OrderNo) {
		return nil, ErrPartnerTenantSubscriptionKeyNotFound
	}
	if bearer != "" && !hmac.Equal([]byte(partnerTenantHash(bearer)), []byte(k.SecretHash)) {
		return nil, ErrPartnerTenantSubscriptionKeyInvalid
	}
	if !allowUnavailableRoot {
		current, err := currentPartnerTenantSubscriptionKey(k)
		if err != nil {
			return nil, err
		}
		if bearer != "" && !hmac.Equal([]byte(bearer), []byte(current)) {
			return nil, ErrPartnerTenantSubscriptionKeyInvalid
		}
	}
	b.now, err = getDBTimestampOnStrict(tx) // Fresh AFTER all resource locks, not transaction-start NOW().
	if err != nil {
		return nil, err
	}
	if b.token.ExpiredTime != -1 && b.token.ExpiredTime <= b.now {
		return nil, ErrPartnerTenantCredentialUnavailable
	}
	if s.StartTime > b.now || s.AmountTotal < 0 || s.AmountUsed < 0 || (s.EndTime < s.StartTime || s.EndTime == s.StartTime && s.Status != "cancelled") {
		return nil, ErrPartnerTenantCredentialUnavailable
	}
	return b, nil
}
func subscriptionBindingError(err error) error {
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return ErrPartnerTenantSubscriptionKeyNotFound
	}
	return err
}
func renewablePartnerTenantSubscription(b *partnerTenantSubscriptionBinding) bool {
	return b.subscription.Status == "active" || b.subscription.Status == "expired" && b.subscription.EndTime <= b.now
}

type PartnerTenantSubscriptionKeyResult struct {
	OrderNo         string `json:"order_no,omitempty"`
	SubscriptionId  int    `json:"subscription_id"`
	SubscriptionKey string `json:"subscription_key"`
	KeyVersion      int64  `json:"key_version"`
}

func partnerTenantSubscriptionKeyResult(b *partnerTenantSubscriptionBinding) (*PartnerTenantSubscriptionKeyResult, error) {
	key, err := currentPartnerTenantSubscriptionKey(&b.key)
	if err != nil {
		return nil, err
	}
	return &PartnerTenantSubscriptionKeyResult{SubscriptionId: b.subscription.Id, SubscriptionKey: key, KeyVersion: b.key.KeyVersion}, nil
}

func ClaimPartnerTenantSubscriptionKey(tenantID int64, secretHash, orderNo string) (*PartnerTenantSubscriptionKeyResult, error) {
	var result *PartnerTenantSubscriptionKeyResult
	err := partnerTenantSecretDB(DB).Transaction(func(tx *gorm.DB) error {
		t, err := lockPartnerTenantCurrentSecret(tx, tenantID, secretHash)
		if err != nil {
			return err
		}
		var o PartnerTenantSubscriptionOrder
		if err := lockForUpdate(tx).Where("tenant_id = ? AND order_no = ? AND entry_mode = ?", tenantID, orderNo, PartnerTenantIdentitySubscriptionKey).First(&o).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPartnerTenantOrderNotFound
			}
			return err
		}
		if o.OrderNo != orderNo {
			return ErrPartnerTenantOrderNotFound
		}
		if o.PaymentStatus != "paid" || o.FulfillmentStatus != "fulfilled" {
			return ErrPartnerTenantSubscriptionKeyNotReady
		}
		b, err := lockPartnerTenantSubscriptionBindingTx(tx, t, o.AccountId, o.SubscriptionId, "", false, nil)
		if err != nil {
			return err
		}
		result, err = partnerTenantSubscriptionKeyResult(b)
		if err == nil {
			result.OrderNo = o.OrderNo
		}
		return err
	})
	return result, err
}

func RotatePartnerTenantSubscriptionKey(tenantID int64, secretHash string, subscriptionID int, expectedVersion int64, idempotencyHash string) (*PartnerTenantSubscriptionKeyResult, error) {
	if expectedVersion < 1 || subscriptionID < 1 || !validPartnerTenantPurchaseHex(idempotencyHash) {
		return nil, ErrPartnerTenantSubscriptionKeyChanged
	}
	var result *PartnerTenantSubscriptionKeyResult
	err := partnerTenantSecretDB(DB).Transaction(func(tx *gorm.DB) error {
		t, err := lockPartnerTenantCurrentSecret(tx, tenantID, secretHash)
		if err != nil {
			return err
		}
		var locator PartnerTenantSubscriptionAccessKey
		if err := tx.Where("tenant_id = ? AND user_subscription_id = ?", tenantID, subscriptionID).First(&locator).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPartnerTenantSubscriptionNotFound
			}
			return err
		}
		b, err := lockPartnerTenantSubscriptionBindingTx(tx, t, locator.AccountId, subscriptionID, "", true, nil)
		if err != nil {
			return err
		}
		hash := partnerTenantHash("partner-tenant-subscription-rotation:v1\x00" + idempotencyHash)
		request := partnerTenantHash(fmt.Sprintf("%d\x00%d", subscriptionID, expectedVersion))
		var r PartnerTenantSubscriptionKeyRotation
		found := lockForUpdate(tx).Where("tenant_id = ? AND idempotency_hash = ?", tenantID, hash).Limit(1).Find(&r)
		if found.Error != nil {
			return found.Error
		}
		b.now, err = getDBTimestampOnStrict(tx)
		if err != nil {
			return err
		}
		if b.token.ExpiredTime != -1 && b.token.ExpiredTime <= b.now {
			return ErrPartnerTenantCredentialUnavailable
		}
		if found.RowsAffected > 0 {
			if r.RequestHash != request {
				return ErrPartnerTenantIdempotencyConflict
			}
			if r.ResultVersion != b.key.KeyVersion {
				return ErrPartnerTenantSubscriptionKeyChanged
			}
			result, err = partnerTenantSubscriptionKeyResult(b)
			return err
		}
		if b.key.KeyVersion != expectedVersion || expectedVersion == math.MaxInt64 {
			return ErrPartnerTenantSubscriptionKeyChanged
		}
		b.key.KeyVersion++
		b.key.UpdatedAt = b.now
		if _, err := replacePartnerTenantSubscriptionSeed(&b.key); err != nil {
			return err
		}
		if err := tx.Save(&b.key).Error; err != nil {
			return err
		}
		r = PartnerTenantSubscriptionKeyRotation{TenantId: tenantID, IdempotencyHash: hash, RequestHash: request, UserSubscriptionId: subscriptionID, ResultVersion: b.key.KeyVersion, CreatedAt: b.now}
		if err := tx.Create(&r).Error; err != nil {
			return err
		}
		result, err = partnerTenantSubscriptionKeyResult(b)
		return err
	})
	return result, err
}

type PartnerTenantIndependentSubscription struct {
	Subscription struct {
		Id                int    `json:"id"`
		PlanId            int    `json:"plan_id"`
		PlanTitle         string `json:"plan_title"`
		Status            string `json:"status"`
		StartTime         int64  `json:"start_time"`
		EndTime           int64  `json:"end_time"`
		RequestsPerMinute int    `json:"requests_per_minute"`
	} `json:"subscription"`
	Quota struct {
		Total               string  `json:"quota_total"`
		Used                string  `json:"quota_used"`
		Remaining           string  `json:"quota_remaining"`
		Unlimited           bool    `json:"quota_unlimited"`
		Usable              bool    `json:"quota_usable"`
		NextResetTime       int64   `json:"next_reset_time"`
		HistoricalRemaining *string `json:"historical_quota_remaining,omitempty"`
	} `json:"quota"`
	APIKey string `json:"api_key,omitempty"`
}

func QueryPartnerTenantSubscription(key string) (*PartnerTenantIndependentSubscription, error) {
	locator, err := findPartnerTenantSubscriptionKey(key)
	if err != nil {
		return nil, err
	}
	var result *PartnerTenantIndependentSubscription
	err = partnerTenantSecretDB(DB).Transaction(func(tx *gorm.DB) error {
		var t PartnerTenant
		if err := lockForUpdate(tx).First(&t, locator.TenantId).Error; err != nil {
			return subscriptionBindingError(err)
		}
		if t.Status != PartnerTenantStatusEnabled {
			return ErrPartnerTenantAccountDisabled
		}
		b, err := lockPartnerTenantSubscriptionBindingTx(tx, &t, locator.AccountId, locator.UserSubscriptionId, key, false, nil)
		if err != nil {
			return err
		}
		s := &b.subscription
		if s.Status != "active" && s.Status != "expired" && s.Status != "cancelled" {
			return ErrPartnerTenantCredentialUnavailable
		}
		active := s.Status == "active" && s.EndTime > b.now
		if active {
			if err := maybeResetUserSubscriptionWithPlanTx(tx, s, &b.plan, b.now); err != nil {
				return err
			}
		}
		result = &PartnerTenantIndependentSubscription{}
		result.Subscription.Id, result.Subscription.PlanId, result.Subscription.PlanTitle = s.Id, s.PlanId, b.plan.Title
		result.Subscription.Status = s.Status
		if s.Status == "active" && s.EndTime <= b.now {
			result.Subscription.Status = "expired"
		}
		result.Subscription.StartTime, result.Subscription.EndTime, result.Subscription.RequestsPerMinute = s.StartTime, s.EndTime, b.plan.RequestsPerMinute
		q := &result.Quota
		q.Total, q.Used, q.Unlimited, q.NextResetTime = strconv.FormatInt(s.AmountTotal, 10), strconv.FormatInt(s.AmountUsed, 10), s.AmountTotal == 0, s.NextResetTime
		remaining := int64(0)
		if s.AmountTotal > s.AmountUsed {
			remaining = s.AmountTotal - s.AmountUsed
		}
		q.Remaining = strconv.FormatInt(remaining, 10)
		q.Usable = active && (q.Unlimited || remaining > 0)
		if active {
			result.APIKey = "sk-" + b.token.Key
		} else {
			historical := q.Remaining
			q.HistoricalRemaining = &historical
			q.Remaining = "0"
		}
		return nil
	})
	return result, err
}
