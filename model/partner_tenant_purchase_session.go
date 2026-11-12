package model

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	PartnerTenantPurchaseLaunchLifetime  = int64(5 * 60)
	PartnerTenantPurchaseSessionLifetime = int64(30 * 60)
)

var (
	ErrPartnerTenantPurchaseSessionNotFound = errors.New("partner tenant purchase session not found")
	ErrPartnerTenantPurchaseAccess          = errors.New("partner tenant purchase access invalid")
)

// A purchase session binds a trusted merchant buyer, not a platform login.
// Orders are related by a purpose-separated idempotency hash, never a second
// order pointer whose write could fail after the order transaction commits.
type PartnerTenantPurchaseSession struct {
	Id               int64   `gorm:"primaryKey"`
	SessionId        string  `gorm:"type:varchar(35);not null;uniqueIndex"`
	TenantId         int64   `json:"-" gorm:"not null;uniqueIndex:idx_pt_purchase_request,priority:1;index:idx_pt_purchase_budget,priority:1;index:idx_pt_purchase_buyer,priority:1"`
	ExternalUserId   string  `json:"-" gorm:"type:varchar(128);not null"`
	ExternalUserHash string  `json:"-" gorm:"type:char(64);not null;index:idx_pt_purchase_buyer,priority:2"`
	TenantSecretHash string  `json:"-" gorm:"type:char(64);not null"`
	IdempotencyHash  string  `json:"-" gorm:"type:char(64);not null;uniqueIndex:idx_pt_purchase_request,priority:2"`
	RequestHash      string  `json:"-" gorm:"type:char(64);not null"`
	CreatedAt        int64   `gorm:"not null;index:idx_pt_purchase_budget,priority:2;index:idx_pt_purchase_buyer,priority:3"`
	LaunchExpiresAt  int64   `gorm:"not null"`
	ExpiresAt        int64   `gorm:"not null"`
	RedeemedAt       int64   `gorm:"not null;default:0"`
	ClientNonceHash  *string `json:"-" gorm:"type:char(64)"`
}

func (PartnerTenantPurchaseSession) TableName() string { return "partner_tenant_purchase_sessions" }

func IsValidPartnerTenantPurchaseSessionID(s string) bool {
	if len(s) != 35 || !strings.HasPrefix(s, "PPS") {
		return false
	}
	for _, c := range s[3:] {
		if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9') {
			return false
		}
	}
	return true
}

func validPartnerTenantPurchaseHex(s string) bool {
	if len(s) != 64 {
		return false
	}
	for _, c := range s {
		if !(c >= 'a' && c <= 'f' || c >= '0' && c <= '9') {
			return false
		}
	}
	return true
}

// This preimage cannot be supplied as a merchant's URL-safe Idempotency-Key.
func PartnerTenantPurchaseOrderIdempotencyHash(sessionID string) string {
	return partnerTenantHash("partner-tenant-h5-order:v1\x00" + sessionID)
}

func CreatePartnerTenantPurchaseSession(tenantID int64, secretHash, externalID, keyHash string) (*PartnerTenantPurchaseSession, bool, error) {
	if tenantID <= 0 || !IsValidPartnerTenantExternalUserID(externalID) || !validPartnerTenantPurchaseHex(keyHash) {
		return nil, false, ErrPartnerTenantPurchaseAccess
	}
	var session PartnerTenantPurchaseSession
	created := false
	requestHash := partnerTenantHash("partner-tenant-purchase-request:v1\x00" + externalID)
	err := DB.Transaction(func(tx *gorm.DB) error {
		var tenant PartnerTenant
		if err := lockForUpdate(tx).Where("id = ? AND status = ?", tenantID, PartnerTenantStatusEnabled).First(&tenant).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPartnerTenantNotFound
			}
			return err
		}
		if !hmac.Equal([]byte(secretHash), []byte(tenant.SecretHash)) {
			return ErrPartnerTenantNotFound
		}
		prior := lockForUpdate(tx).Where("tenant_id = ? AND idempotency_hash = ?", tenantID, keyHash).Limit(1).Find(&session)
		if prior.Error != nil {
			return prior.Error
		}
		if prior.RowsAffected > 0 {
			if session.RequestHash != requestHash {
				return ErrPartnerTenantIdempotencyConflict
			}
			return nil
		}
		now := getDBTimestampOn(tx)
		var tenantRecent, buyerRecent int64
		if err := tx.Model(&PartnerTenantPurchaseSession{}).Where("tenant_id = ? AND created_at > ?", tenantID, now-3600).Count(&tenantRecent).Error; err != nil {
			return err
		}
		if err := tx.Model(&PartnerTenantPurchaseSession{}).Where("tenant_id = ? AND external_user_hash = ? AND created_at > ?", tenantID, partnerTenantHash(externalID), now-3600).Count(&buyerRecent).Error; err != nil {
			return err
		}
		if tenantRecent >= 2000 || buyerRecent >= 20 {
			return ErrPartnerTenantOrderLimited
		}
		suffix, err := common.GenerateRandomCharsKey(32)
		if err != nil {
			return err
		}
		session = PartnerTenantPurchaseSession{SessionId: "PPS" + suffix, TenantId: tenantID, ExternalUserId: externalID, ExternalUserHash: partnerTenantHash(externalID), TenantSecretHash: tenant.SecretHash,
			IdempotencyHash: keyHash, RequestHash: requestHash, CreatedAt: now, LaunchExpiresAt: now + PartnerTenantPurchaseLaunchLifetime, ExpiresAt: now + PartnerTenantPurchaseSessionLifetime}
		if err := tx.Create(&session).Error; err != nil {
			return err
		}
		created = true
		return nil
	})
	return &session, created, err
}

func getPartnerTenantPurchaseSessionOn(tx *gorm.DB, tenantID int64, sessionID string) (*PartnerTenantPurchaseSession, error) {
	if !IsValidPartnerTenantPurchaseSessionID(sessionID) {
		return nil, ErrPartnerTenantPurchaseSessionNotFound
	}
	q := tx.Where("session_id = ?", sessionID)
	if tenantID > 0 {
		q = q.Where("tenant_id = ?", tenantID)
	}
	var session PartnerTenantPurchaseSession
	if err := q.First(&session).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPartnerTenantPurchaseSessionNotFound
		}
		return nil, err
	}
	// MySQL's default collation must not introduce case-insensitive aliases.
	if session.SessionId != sessionID {
		return nil, ErrPartnerTenantPurchaseSessionNotFound
	}
	return &session, nil
}

// Merchant reconciliation deliberately has no browser lifetime/secret snapshot
// gate. Its caller authenticates the CURRENT merchant credential and scopes ID.
func GetPartnerTenantPurchaseSession(tenantID int64, sessionID string) (*PartnerTenantPurchaseSession, error) {
	return getPartnerTenantPurchaseSessionOn(DB, tenantID, sessionID)
}

func PartnerTenantPurchaseLaunchCode(s *PartnerTenantPurchaseSession) string {
	mac := hmac.New(sha256.New, []byte(common.CryptoSecret))
	_, _ = fmt.Fprintf(mac, "partner-tenant-purchase-launch:v1\x00%s\x00%d\x00%s", s.SessionId, s.LaunchExpiresAt, s.TenantSecretHash)
	return "pl_" + hex.EncodeToString(mac.Sum(nil))
}

func PartnerTenantPurchaseAccessToken(s *PartnerTenantPurchaseSession) string {
	if s.ClientNonceHash == nil || s.RedeemedAt == 0 {
		return ""
	}
	mac := hmac.New(sha256.New, []byte(common.CryptoSecret))
	_, _ = fmt.Fprintf(mac, "partner-tenant-purchase-access:v1\x00%s\x00%s\x00%d\x00%s", s.SessionId, *s.ClientNonceHash, s.ExpiresAt, s.TenantSecretHash)
	return "ps_" + hex.EncodeToString(mac.Sum(nil))
}

func validPartnerTenantPurchaseTenant(s *PartnerTenantPurchaseSession, tenant *PartnerTenant, now int64) bool {
	return tenant.Id == s.TenantId && tenant.Status == PartnerTenantStatusEnabled && now < s.ExpiresAt &&
		hmac.Equal([]byte(tenant.SecretHash), []byte(s.TenantSecretHash))
}

// Serialize tenant -> session in the DB, not in process memory. Identical
// nonce retries recover a lost response; another browser can never redeem it.
func ExchangePartnerTenantPurchaseSession(sessionID, launchCode, nonce string, now int64) (*PartnerTenantPurchaseSession, error) {
	if !validPartnerTenantPurchaseHex(nonce) {
		return nil, ErrPartnerTenantPurchaseAccess
	}
	initial, err := GetPartnerTenantPurchaseSession(0, sessionID)
	if err != nil {
		if errors.Is(err, ErrPartnerTenantPurchaseSessionNotFound) {
			return nil, ErrPartnerTenantPurchaseAccess
		}
		return nil, err
	}
	var session *PartnerTenantPurchaseSession
	err = DB.Transaction(func(tx *gorm.DB) error {
		var tenant PartnerTenant
		if err := lockForUpdate(tx).First(&tenant, initial.TenantId).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPartnerTenantPurchaseAccess
			}
			return err
		}
		var err error
		session, err = getPartnerTenantPurchaseSessionOn(lockForUpdate(tx), tenant.Id, sessionID)
		if err != nil {
			if errors.Is(err, ErrPartnerTenantPurchaseSessionNotFound) {
				return ErrPartnerTenantPurchaseAccess
			}
			return err
		}
		// A request waiting for the row lock must not redeem after its deadline
		// merely because it arrived before it. Never move the fixed clock back.
		now = max(now, getDBTimestampOn(tx))
		if !validPartnerTenantPurchaseTenant(session, &tenant, now) || now >= session.LaunchExpiresAt ||
			!hmac.Equal([]byte(launchCode), []byte(PartnerTenantPurchaseLaunchCode(session))) {
			return ErrPartnerTenantPurchaseAccess
		}
		nonceHash := partnerTenantHash(nonce)
		if session.ClientNonceHash != nil {
			if !hmac.Equal([]byte(*session.ClientNonceHash), []byte(nonceHash)) {
				return ErrPartnerTenantPurchaseAccess
			}
			return nil
		}
		if err := tx.Model(session).Updates(map[string]any{"client_nonce_hash": nonceHash, "redeemed_at": now}).Error; err != nil {
			return err
		}
		session.ClientNonceHash, session.RedeemedAt = &nonceHash, now
		return nil
	})
	return session, err
}

func AuthorizePartnerTenantPurchaseSession(sessionID, token string, now int64) (*PartnerTenantPurchaseSession, *PartnerTenant, error) {
	session, err := GetPartnerTenantPurchaseSession(0, sessionID)
	if err != nil {
		if errors.Is(err, ErrPartnerTenantPurchaseSessionNotFound) {
			return nil, nil, ErrPartnerTenantPurchaseAccess
		}
		return nil, nil, err
	}
	tenant, err := GetPartnerTenantById(session.TenantId)
	if err != nil {
		if errors.Is(err, ErrPartnerTenantNotFound) {
			return nil, nil, ErrPartnerTenantPurchaseAccess
		}
		return nil, nil, err
	}
	now = max(now, common.GetTimestamp())
	expected := PartnerTenantPurchaseAccessToken(session)
	if expected == "" || !validPartnerTenantPurchaseTenant(session, tenant, now) || !hmac.Equal([]byte(token), []byte(expected)) {
		return nil, nil, ErrPartnerTenantPurchaseAccess
	}
	return session, tenant, nil
}

// CreatePartnerTenantPurchaseOrder guards BOTH insertion and exact replay in
// the shared order transaction. The initial read only locates the tenant lock;
// authority comes from a current session read and clock AFTER acquiring it.
// validateNew may inspect local checkout configuration only, never do I/O.
func CreatePartnerTenantPurchaseOrder(sessionID, token string, planID int, method, merchantID string, validateNew func() error) (*PartnerTenantSubscriptionOrder, bool, error) {
	initial, err := GetPartnerTenantPurchaseSession(0, sessionID)
	if err != nil {
		if errors.Is(err, ErrPartnerTenantPurchaseSessionNotFound) {
			return nil, false, ErrPartnerTenantPurchaseAccess
		}
		return nil, false, err
	}
	var order *PartnerTenantSubscriptionOrder
	created := false
	err = DB.Transaction(func(tx *gorm.DB) error {
		var tenant PartnerTenant
		if err := lockForUpdate(tx).First(&tenant, initial.TenantId).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPartnerTenantPurchaseAccess
			}
			return err
		}
		session, err := getPartnerTenantPurchaseSessionOn(lockForUpdate(tx), tenant.Id, sessionID)
		if err != nil {
			if errors.Is(err, ErrPartnerTenantPurchaseSessionNotFound) {
				return ErrPartnerTenantPurchaseAccess
			}
			return err
		}
		now, err := getDBTimestampOnStrict(tx)
		if err != nil {
			return err
		}
		expected := PartnerTenantPurchaseAccessToken(session)
		if expected == "" || !validPartnerTenantPurchaseTenant(session, &tenant, max(now, common.GetTimestamp())) ||
			!hmac.Equal([]byte(token), []byte(expected)) {
			return ErrPartnerTenantPurchaseAccess
		}
		in := PartnerTenantOrderInput{TenantId: tenant.Id, ExternalUserId: session.ExternalUserId, PlanId: planID, PaymentMethod: method,
			MerchantId: merchantID, IdempotencyHash: PartnerTenantPurchaseOrderIdempotencyHash(session.SessionId)}
		order, created, err = createPartnerTenantSubscriptionOrderTx(tx, &tenant, in, func() error {
			if validateNew != nil {
				if err := validateNew(); err != nil {
					return err
				}
			}
			if !validPartnerTenantOrderInput(in) {
				return ErrPartnerTenantOrderUnavailable
			}
			return nil
		})
		return err
	})
	return order, created, err
}

// Use the very same plan predicate as paid order creation, without changing the
// older merchant catalog contract or normalizing historical currencies.
func ListPartnerTenantPurchasePlans(tenant *PartnerTenant) ([]SubscriptionPlan, error) {
	var plans []SubscriptionPlan
	if err := DB.Where("enabled = ? AND partner_tenant_id = ?", true, tenant.Id).Order("sort_order desc, id desc").Find(&plans).Error; err != nil {
		return nil, err
	}
	available := make([]SubscriptionPlan, 0, len(plans))
	for _, plan := range plans {
		if !validPartnerTenantPlan(&plan, tenant) || plan.Currency != "CNY" {
			continue
		}
		if _, err := PartnerTenantPlanCents(plan.PriceAmount); err != nil {
			continue
		}
		available = append(available, plan)
	}
	return available, nil
}
