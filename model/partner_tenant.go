package model

import (
	"crypto/hmac"
	"errors"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/samber/hot"
	"gorm.io/gorm"
)

const (
	PartnerTenantStatusEnabled           = 1
	PartnerTenantStatusDisabled          = 2
	PartnerTenantIdentityExternal        = "external"
	PartnerTenantIdentitySubscriptionKey = "subscription_key"
)

var ErrPartnerTenantNotFound = errors.New("partner tenant not found")
var ErrPartnerTenantAccountDisabled = errors.New("partner tenant account disabled")
var ErrPartnerTenantCredentialUnavailable = errors.New("partner tenant credential unavailable")
var ErrPartnerTenantPlanNotFound = errors.New("partner tenant plan not found")
var ErrPartnerTenantIdempotencyConflict = errors.New("partner tenant idempotency key conflict")

// Account membership is immutable through the partner API. Cache both members
// and non-members, but always read plan rates and validity from the database.
var partnerTenantMembershipCache = hot.NewHotCache[int, bool](hot.LRU, 10000).
	WithTTL(time.Minute).
	Build()

type PartnerTenant struct {
	IntegrationMode string `json:"integration_mode" gorm:"type:varchar(24);not null;default:subscription_key"`
	Id              int64  `json:"id" gorm:"primaryKey"`
	Name            string `json:"name" gorm:"type:varchar(64);not null"`
	Group           string `json:"group" gorm:"type:varchar(64);not null;uniqueIndex"`
	SecretHash      string `json:"-" gorm:"type:char(64);not null;uniqueIndex"`
	Status          int    `json:"status" gorm:"not null;default:1"`
	CreatedAt       int64  `json:"created_at" gorm:"type:bigint"`
	UpdatedAt       int64  `json:"updated_at" gorm:"type:bigint"`
}

func (PartnerTenant) TableName() string { return "partner_tenants" }

type PartnerTenantAccount struct {
	IdentitySource     string `json:"-" gorm:"type:varchar(24);not null;default:external"`
	SourceOrderId      *int64 `json:"-" gorm:"uniqueIndex:idx_pt_account_source_order"`
	Id                 int64  `json:"id" gorm:"primaryKey"`
	TenantId           int64  `json:"tenant_id" gorm:"not null;uniqueIndex:idx_pt_account_external_hash,priority:1"`
	ExternalUserId     string `json:"external_user_id" gorm:"type:varchar(128);not null"`
	ExternalUserIdHash string `json:"-" gorm:"type:char(64);default:null;uniqueIndex:idx_pt_account_external_hash,priority:2"`
	UserId             int    `json:"user_id" gorm:"not null;uniqueIndex"`
	TokenId            int    `json:"token_id" gorm:"not null;uniqueIndex"`
	Status             int    `json:"status" gorm:"not null;default:1"`
	CreatedAt          int64  `json:"created_at" gorm:"type:bigint"`
	UpdatedAt          int64  `json:"updated_at" gorm:"type:bigint"`
}

func (PartnerTenantAccount) TableName() string { return "partner_tenant_accounts" }

type PartnerTenantSubscriptionGrant struct {
	Id                 int64  `json:"id" gorm:"primaryKey"`
	TenantId           int64  `json:"tenant_id" gorm:"not null;uniqueIndex:idx_partner_tenant_idempotency,priority:1"`
	IdempotencyHash    string `json:"-" gorm:"type:char(64);not null;uniqueIndex:idx_partner_tenant_idempotency,priority:2"`
	RequestHash        string `json:"-" gorm:"type:char(64);not null"`
	ExternalUserId     string `json:"external_user_id" gorm:"type:varchar(128);not null"`
	PlanId             int    `json:"plan_id" gorm:"not null"`
	UserSubscriptionId int    `json:"user_subscription_id" gorm:"not null;index"`
	CreatedAt          int64  `json:"created_at" gorm:"type:bigint"`
}

func (PartnerTenantSubscriptionGrant) TableName() string { return "partner_tenant_subscription_grants" }

// ResetPartnerTenantMembershipCache isolates membership when the database
// lifecycle changes, including test fixtures that reuse numeric user IDs.
// It never changes stored account membership or any model credential.
func ResetPartnerTenantMembershipCache() { partnerTenantMembershipCache.Purge() }

// IsPartnerTenantUser is an immutable-membership predicate, independent of plan
// validity and account status. In particular disabled members cannot use wallets.
func IsPartnerTenantUser(userID int) (bool, error) {
	if DB == nil {
		return false, errors.New("database is not initialized")
	}
	if member, found, err := partnerTenantMembershipCache.Get(userID); err == nil && found {
		return member, nil
	}
	var account PartnerTenantAccount
	result := DB.Select("user_id").Where("user_id = ?", userID).Limit(1).Find(&account)
	if result.Error != nil {
		return false, result.Error
	}
	member := result.RowsAffected > 0
	partnerTenantMembershipCache.Set(userID, member)
	return member, nil
}

// GetPartnerUserPlanRateLimit returns the highest configured limit for an active plan.
func GetPartnerUserPlanRateLimit(userID int, group string) (int, error) {
	if DB == nil {
		return 0, errors.New("database is not initialized")
	}
	member, err := IsPartnerTenantUser(userID)
	if err != nil || !member {
		return 0, err
	}
	var limit int
	now := GetDBTimestamp()
	err = DB.Table("user_subscriptions AS s").
		Select("COALESCE(MAX(p.requests_per_minute), 0)").
		Joins("JOIN subscription_plans AS p ON p.id = s.plan_id").
		Where("s.user_id = ? AND s.status = ? AND s.start_time <= ? AND s.end_time > ?", userID, "active", now, now).
		Where("p.partner_tenant_id > 0 AND p.applicable_group = ?", group).
		Scan(&limit).Error
	return limit, err
}

func CreatePartnerTenant(name, group string) (*PartnerTenant, string, error) {
	return CreatePartnerTenantWithIntegrationMode(name, group, PartnerTenantIntegrationSubscriptionKey)
}

func CreatePartnerTenantWithIntegrationMode(name, group, mode string) (*PartnerTenant, string, error) {
	if !IsValidPartnerTenantIntegrationMode(mode) {
		return nil, "", ErrPartnerTenantIntegrationMode
	}
	secretPart, err := common.GenerateRandomCharsKey(48)
	if err != nil {
		return nil, "", err
	}
	secret := "pt_" + secretPart
	now := common.GetTimestamp()
	tenant := &PartnerTenant{
		IntegrationMode: mode,
		Name:            name,
		Group:           group,
		SecretHash:      HashPartnerOAuthSecret(secret),
		Status:          PartnerTenantStatusEnabled,
		CreatedAt:       now,
		UpdatedAt:       now,
	}
	if err := DB.Create(tenant).Error; err != nil {
		return nil, "", err
	}
	return tenant, secret, nil
}

func FindPartnerTenantBySecret(secret string) (*PartnerTenant, error) {
	hash := HashPartnerOAuthSecret(secret)
	var tenant PartnerTenant
	// Authentication diagnostics must not interpolate the credential hash.
	if err := partnerTenantSecretDB(DB).Where("secret_hash = ?", hash).First(&tenant).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPartnerTenantNotFound
		}
		return nil, err
	}
	if !hmac.Equal([]byte(tenant.SecretHash), []byte(hash)) {
		return nil, ErrPartnerTenantNotFound
	}
	return &tenant, nil
}

func GetPartnerTenantById(id int64) (*PartnerTenant, error) {
	var tenant PartnerTenant
	if err := DB.First(&tenant, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPartnerTenantNotFound
		}
		return nil, err
	}
	return &tenant, nil
}

func ListPartnerTenants() ([]PartnerTenant, error) {
	tenants := make([]PartnerTenant, 0)
	err := DB.Order("id desc").Find(&tenants).Error
	return tenants, err
}

func RotatePartnerTenantSecret(id int64) (string, error) {
	secretPart, err := common.GenerateRandomCharsKey(48)
	if err != nil {
		return "", err
	}
	secret := "pt_" + secretPart
	result := DB.Model(&PartnerTenant{}).Where("id = ?", id).Updates(map[string]any{
		"secret_hash": HashPartnerOAuthSecret(secret),
		"updated_at":  common.GetTimestamp(),
	})
	if result.Error != nil {
		return "", result.Error
	}
	if result.RowsAffected == 0 {
		return "", ErrPartnerTenantNotFound
	}
	return secret, nil
}

func UpdatePartnerTenantStatus(id int64, status int) error {
	result := DB.Model(&PartnerTenant{}).Where("id = ?", id).Updates(map[string]any{
		"status":     status,
		"updated_at": common.GetTimestamp(),
	})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrPartnerTenantNotFound
	}
	return nil
}

func GetPartnerTenantAccount(tenantId int64, externalUserId string) (*PartnerTenantAccount, error) {
	var account PartnerTenantAccount
	result := partnerTenantAccountQuery(DB, tenantId, externalUserId).Where("status = ?", PartnerTenantStatusEnabled).Limit(1).Find(&account)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return &account, nil
}

type PartnerTenantProvisionedAccount struct {
	ExternalUserId string
	APIKey         string
	Created        bool
}

func IsValidPartnerTenantExternalUserID(externalUserID string) bool {
	return externalUserID != "" && utf8.ValidString(externalUserID) &&
		utf8.RuneCountInString(externalUserID) <= 128 &&
		!strings.ContainsFunc(externalUserID, unicode.IsControl)
}

func ProvisionPartnerTenantAccount(tenantId int64, externalUserId, displayName string) (*PartnerTenantProvisionedAccount, error) {
	return provisionPartnerTenantHostedAccount(tenantId, "", externalUserId, displayName)
}

func ProvisionPartnerTenantHostedAccount(tenantId int64, secretHash, externalUserId, displayName string) (*PartnerTenantProvisionedAccount, error) {
	if secretHash == "" {
		return nil, ErrPartnerTenantNotFound
	}
	return provisionPartnerTenantHostedAccount(tenantId, secretHash, externalUserId, displayName)
}

func provisionPartnerTenantHostedAccount(tenantId int64, secretHash, externalUserId, displayName string) (*PartnerTenantProvisionedAccount, error) {
	externalUserId = strings.TrimSpace(externalUserId)
	if tenantId <= 0 || !IsValidPartnerTenantExternalUserID(externalUserId) {
		return nil, errors.New("invalid partner tenant account")
	}
	var result *PartnerTenantProvisionedAccount
	var accountUserID int
	err := DB.Transaction(func(tx *gorm.DB) error {
		var tenant PartnerTenant
		if err := lockForUpdate(tx).Where("id = ? AND status = ?", tenantId, PartnerTenantStatusEnabled).First(&tenant).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPartnerTenantNotFound
			}
			return err
		}
		if secretHash != "" && !hmac.Equal([]byte(secretHash), []byte(tenant.SecretHash)) {
			return ErrPartnerTenantNotFound
		}
		if err := RequirePartnerTenantIntegrationMode(&tenant, PartnerTenantOperationHostedH5); err != nil {
			return &PartnerTenantAuditAdmissionError{Receipt: PartnerTenantAuditPrincipal(&tenant)}
		}
		var err error
		result, accountUserID, err = provisionPartnerTenantAccountTx(tx, &tenant, externalUserId, displayName)
		return err
	})
	if err != nil {
		return nil, err
	}
	// Publish membership only after the user and account transaction commits.
	partnerTenantMembershipCache.Set(accountUserID, true)
	return result, nil
}

// Caller holds the enabled tenant lock. This helper never opens a nested
// transaction or publishes cache entries before the caller's commit.
func provisionPartnerTenantAccountTx(tx *gorm.DB, tenant *PartnerTenant, externalUserId, displayName string) (*PartnerTenantProvisionedAccount, int, error) {
	result := &PartnerTenantProvisionedAccount{ExternalUserId: externalUserId}
	var accountUserID int
	err := func() error {
		var account PartnerTenantAccount
		accountQuery := partnerTenantAccountQuery(lockForUpdate(tx), tenant.Id, externalUserId).Limit(1).Find(&account)
		if accountQuery.Error != nil {
			return accountQuery.Error
		}
		if accountQuery.RowsAffected > 0 {
			token, err := validatePartnerTenantAccountTx(tx, tenant, &account)
			if err != nil {
				return err
			}
			result.APIKey = "sk-" + token.Key
			accountUserID = account.UserId
			return nil
		}

		if displayName == "" {
			displayName = externalUserId
		}
		user, token, err := createPartnerTenantUserTokenTx(tx, tenant, displayName)
		if err != nil {
			return err
		}
		account = PartnerTenantAccount{
			TenantId:       tenant.Id,
			ExternalUserId: externalUserId,
			UserId:         user.Id,
			TokenId:        token.Id,
			Status:         PartnerTenantStatusEnabled,
		}
		if err := CreatePartnerTenantAccountWithTx(tx, &account); err != nil {
			return err
		}
		result.APIKey = "sk-" + token.Key
		result.Created = true
		accountUserID = user.Id
		return nil
	}()
	return result, accountUserID, err
}

// A broken mapping is never repaired by issuing a new credential.
func validatePartnerTenantAccountTx(tx *gorm.DB, tenant *PartnerTenant, account *PartnerTenantAccount) (*Token, error) {
	return validatePartnerTenantAccountClockTx(tx, tenant, account, false)
}

func validatePartnerTenantAccountClockTx(tx *gorm.DB, tenant *PartnerTenant, account *PartnerTenantAccount, strict bool) (*Token, error) {
	if account.Status != PartnerTenantStatusEnabled {
		return nil, ErrPartnerTenantAccountDisabled
	}
	var user User
	if err := lockForUpdate(tx).Where("id = ?", account.UserId).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPartnerTenantAccountDisabled
		}
		return nil, err
	}
	if user.Status != common.UserStatusEnabled || user.Group != tenant.Group {
		return nil, ErrPartnerTenantAccountDisabled
	}
	var token Token
	if err := lockForUpdate(tx).Where("id = ? AND user_id = ?", account.TokenId, account.UserId).First(&token).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPartnerTenantCredentialUnavailable
		}
		return nil, err
	}
	now := int64(0)
	if strict {
		var err error
		now, err = getDBTimestampOnStrict(tx)
		if err != nil {
			return nil, err
		}
	} else {
		now = getDBTimestampOn(tx)
	}
	if token.Status != common.TokenStatusEnabled || token.Key == "" || token.Group != tenant.Group || (token.ExpiredTime != -1 && token.ExpiredTime <= now) {
		return nil, ErrPartnerTenantCredentialUnavailable
	}
	return &token, nil
}

// Retained for internal callers and existing tests.
func isPartnerTenantUser(userID int) (bool, error) { return IsPartnerTenantUser(userID) }

func CreatePartnerTenantAccountWithTx(tx *gorm.DB, account *PartnerTenantAccount) error {
	if tx == nil || account == nil || account.TenantId <= 0 || account.UserId <= 0 || account.TokenId <= 0 || account.ExternalUserId == "" {
		return errors.New("invalid partner tenant account")
	}
	now := common.GetTimestamp()
	account.CreatedAt = now
	account.UpdatedAt = now
	account.IdentitySource = PartnerTenantIdentityExternal
	account.ExternalUserIdHash = partnerTenantHash(account.ExternalUserId)
	return tx.Create(account).Error
}

// Tenant and account locks serialize delivery of different orders for the same
// account. Extending the term does not add quota to its current reset period.
func grantPartnerTenantSubscriptionTx(tx *gorm.DB, userID int, plan *SubscriptionPlan, renewalID int) (*UserSubscription, bool, error) {
	return grantPartnerTenantSubscriptionAtTx(tx, userID, plan, renewalID, getDBTimestampOn(tx))
}

func grantPartnerTenantSubscriptionAtTx(tx *gorm.DB, userID int, plan *SubscriptionPlan, renewalID int, now int64) (*UserSubscription, bool, error) {
	var subscription *UserSubscription
	var created bool
	err := func() error {
		var activeSubscription UserSubscription
		query := lockForUpdate(tx).Where("user_id = ? AND plan_id = ?", userID, plan.Id)
		if renewalID > 0 {
			// Order creation accepted this specific renewal. Natural expiry is
			// not a new purchase; cancellation/deletion still fail closed.
			query = query.Where("id = ? AND start_time <= ? AND (status = ? OR (status = ? AND end_time <= ?))", renewalID, now, "active", "expired", now)
		} else {
			query = query.Where("status = ? AND start_time <= ? AND end_time > ?", "active", now, now)
		}
		activeQuery := query.Order("end_time desc, id desc").Limit(1).Find(&activeSubscription)
		if activeQuery.Error != nil {
			return activeQuery.Error
		}
		if renewalID > 0 && activeQuery.RowsAffected == 0 {
			return ErrPartnerTenantPlanNotFound
		}
		createdSubscription := &activeSubscription
		if activeQuery.RowsAffected > 0 {
			if createdSubscription.Source != SubscriptionSourcePartner {
				return ErrPartnerTenantPlanNotFound
			}
			base := createdSubscription.EndTime
			if base <= now {
				// A lapsed accepted renewal starts a fresh calendar month at
				// delivery, on the same entitlement row (no purchase-limit bypass
				// for unrelated orders and no quota carried from the old period).
				base = now
				createdSubscription.Status = "active"
				createdSubscription.StartTime = now
				createdSubscription.AmountUsed = 0
				createdSubscription.LastResetTime = now
				createdSubscription.NextResetTime = 0
			} else if err := maybeResetUserSubscriptionWithPlanTx(tx, createdSubscription, plan, now); err != nil {
				return err
			}
			newEndTime, err := calcPlanEndTime(time.Unix(base, 0), plan)
			if err != nil {
				return err
			}
			createdSubscription.EndTime = newEndTime
			if createdSubscription.NextResetTime == 0 {
				base := time.Unix(now, 0)
				createdSubscription.LastResetTime = now
				createdSubscription.NextResetTime = calcNextResetTime(base, plan, newEndTime)
			}
			createdSubscription.UpdatedAt = common.GetTimestamp()
			if err := tx.Save(createdSubscription).Error; err != nil {
				return err
			}
		} else {
			newSubscription, createErr := createUserSubscriptionFromPlanAtTx(tx, userID, plan, SubscriptionSourcePartner, now)
			if createErr != nil {
				return createErr
			}
			createdSubscription = newSubscription
		}
		subscription = createdSubscription
		created = activeQuery.RowsAffected == 0
		return nil
	}()
	if err != nil {
		return nil, false, err
	}
	return subscription, created, nil
}

// Shared creation primitive: caller owns transaction and publishes membership only after commit.
func createPartnerTenantUserTokenTx(tx *gorm.DB, tenant *PartnerTenant, displayName string) (*User, *Token, error) {
	tx = partnerTenantSecretDB(tx)
	usernameSuffix, err := common.GenerateRandomCharsKey(12)
	if err != nil {
		return nil, nil, err
	}
	rawPassword, err := common.GenerateRandomCharsKey(48)
	if err != nil {
		return nil, nil, err
	}
	password, err := common.HashAccountPassword(rawPassword)
	if err != nil {
		return nil, nil, err
	}
	affCode, err := common.GenerateRandomCharsKey(12)
	if err != nil {
		return nil, nil, err
	}
	if runes := []rune(displayName); len(runes) > 20 {
		displayName = string(runes[:20])
	}
	user := &User{
		Username:    "p_" + usernameSuffix,
		Password:    password,
		DisplayName: displayName,
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
		Group:       tenant.Group,
		Quota:       0,
		UsedQuota:   0,
		AffCode:     affCode,
		AuthVersion: 1,
	}
	if err := tx.Create(user).Error; err != nil {
		return nil, nil, err
	}
	apiKey, err := common.GenerateKey()
	if err != nil {
		return nil, nil, err
	}
	now := common.GetTimestamp()
	token := &Token{
		UserId:         user.Id,
		Key:            apiKey,
		Status:         common.TokenStatusEnabled,
		Name:           tenant.Name + " subscription account",
		CreatedTime:    now,
		AccessedTime:   now,
		ExpiredTime:    -1,
		UnlimitedQuota: true,
		Group:          tenant.Group,
	}
	if err := tx.Create(token).Error; err != nil {
		return nil, nil, err
	}
	return user, token, nil
}
