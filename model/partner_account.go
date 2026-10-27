package model

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"slices"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/dto"

	"gorm.io/gorm"
)

const (
	PartnerAccountStatusActive        = "active"
	PartnerAccountStatusDisabled      = "disabled"
	PartnerAccountStatusAdminDisabled = "admin_disabled"

	// PartnerAccountKeyGraceSeconds keeps the replaced key usable after a
	// planned rotation, so long-running partner jobs can switch over.
	PartnerAccountKeyGraceSeconds = 24 * 60 * 60

	partnerAccountUsernamePrefix = "pa_"
)

var (
	ErrPartnerAccountNotFound            = errors.New("partner account not found")
	ErrPartnerAccountLimit               = errors.New("partner account limit reached")
	ErrPartnerAccountRateLimited         = errors.New("partner account creation rate limited")
	ErrPartnerAccountInactive            = errors.New("partner account is disabled")
	ErrPartnerAccountAdminDisabled       = errors.New("partner account was disabled by an administrator")
	ErrPartnerAccountCredentialDisabled  = errors.New("partner account credential is disabled")
	ErrPartnerAccountIdempotencyConflict = errors.New("partner account idempotency key reused with a different request")
	ErrPartnerOAuthClientHasAccounts     = errors.New("partner oauth client still owns partner accounts")

	ErrPartnerAccountPaymentOrderNotFound   = errors.New("partner account payment order not found")
	ErrPartnerAccountPaymentIdempotencyRace = errors.New("partner account payment idempotency key already used")
	ErrPartnerAccountPaymentRateLimited     = errors.New("partner account payment order limit reached")
)

// PartnerAccount maps one end user of a partner to the YesChoy sub-account
// that holds the user's wallet. The mapping never changes once created. The
// unique key uses a hash of the external ID so that case-sensitive matching is
// identical on SQLite, MySQL and PostgreSQL.
type PartnerAccount struct {
	Id                 int64  `json:"id" gorm:"primaryKey"`
	ClientId           string `json:"client_id" gorm:"type:varchar(64);not null;uniqueIndex:ux_partner_account_external,priority:1;index:idx_partner_account_client_created,priority:1"`
	ExternalUserId     string `json:"external_user_id" gorm:"type:varchar(64);not null"`
	ExternalUserIdHash string `json:"-" gorm:"type:char(64);not null;uniqueIndex:ux_partner_account_external,priority:2"`
	UserId             int    `json:"user_id" gorm:"not null;uniqueIndex"`
	Status             string `json:"status" gorm:"type:varchar(16);not null"`
	// SuspendedByPartner marks accounts whose user this system disabled when
	// the partner was suspended; resuming the partner re-enables only these.
	SuspendedByPartner bool `json:"suspended_by_partner"`
	TokenId            int  `json:"token_id" gorm:"default:0"`
	// PreviousTokenId is the key replaced by the last rotation while it may
	// still be inside its grace period.
	PreviousTokenId   int    `json:"previous_token_id" gorm:"default:0"`
	RotateKeyHash     string `json:"-" gorm:"type:char(64)"`
	RotateRequestHash string `json:"-" gorm:"type:char(64)"`
	CreatedAt         int64  `json:"created_at" gorm:"type:bigint;not null;index:idx_partner_account_client_created,priority:2"`
	UpdatedAt         int64  `json:"updated_at" gorm:"type:bigint"`
}

func (PartnerAccount) TableName() string {
	return "partner_accounts"
}

// PartnerAccountPaymentOrder links a top-up to the partner sub-account it was
// placed for. The order itself is a normal top_ups row settled by the Epay
// callbacks; this row scopes lookups and idempotency to the partner and keeps
// the checkout the payment gateway returned for replays.
type PartnerAccountPaymentOrder struct {
	Id                 int64  `json:"id" gorm:"primaryKey"`
	ClientId           string `json:"client_id" gorm:"type:varchar(64);not null;uniqueIndex:ux_partner_account_payment_idempotency,priority:1;index:idx_partner_account_payment_client_created,priority:1"`
	IdempotencyKeyHash string `json:"-" gorm:"type:char(64);not null;uniqueIndex:ux_partner_account_payment_idempotency,priority:2"`
	RequestHash        string `json:"-" gorm:"type:char(64);not null"`
	PartnerAccountId   int64  `json:"partner_account_id" gorm:"not null;index:idx_partner_account_payment_account_created,priority:1"`
	UserId             int    `json:"user_id" gorm:"not null;index"`
	TopUpId            int    `json:"top_up_id" gorm:"not null;uniqueIndex"`
	RequestedAmount    int64  `json:"requested_amount" gorm:"type:bigint;not null"`
	QRCode             string `json:"-" gorm:"column:qr_code;type:text"`
	PayURL             string `json:"-" gorm:"column:pay_url;type:text"`
	CreatedAt          int64  `json:"created_at" gorm:"type:bigint;not null;index:idx_partner_account_payment_account_created,priority:2;index:idx_partner_account_payment_client_created,priority:2"`
}

func (PartnerAccountPaymentOrder) TableName() string {
	return "partner_account_payment_orders"
}

func HashPartnerExternalUserID(externalUserID string) string {
	sum := sha256.Sum256([]byte(externalUserID))
	return hex.EncodeToString(sum[:])
}

// PartnerAccountOwner identifies the partner end user an operation targets.
// DisplayName is used only when the operation has to create the sub-account.
type PartnerAccountOwner struct {
	ClientId       string
	ExternalUserId string
	DisplayName    string
}

func GetPartnerAccount(clientID, externalUserID string) (*PartnerAccount, error) {
	var account PartnerAccount
	err := DB.Where("client_id = ? AND external_user_id_hash = ?", clientID, HashPartnerExternalUserID(externalUserID)).First(&account).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrPartnerAccountNotFound
	}
	if err != nil {
		return nil, err
	}
	return &account, nil
}

func GetPartnerAccountByUserID(userID int) (*PartnerAccount, error) {
	var account PartnerAccount
	err := DB.Where("user_id = ?", userID).First(&account).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrPartnerAccountNotFound
	}
	if err != nil {
		return nil, err
	}
	return &account, nil
}

func IsPartnerSubAccount(userID int) (bool, error) {
	var count int64
	err := DB.Model(&PartnerAccount{}).Where("user_id = ?", userID).Count(&count).Error
	return count > 0, err
}

func CountPartnerAccounts(clientID string) (int64, error) {
	var count int64
	err := DB.Model(&PartnerAccount{}).Where("client_id = ?", clientID).Count(&count).Error
	return count, err
}

func ListPartnerAccounts(clientID string, offset, limit int) ([]PartnerAccount, int64, error) {
	var accounts []PartnerAccount
	var total int64
	query := DB.Model(&PartnerAccount{}).Where("client_id = ?", clientID)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.Order("id desc").Offset(offset).Limit(limit).Find(&accounts).Error
	return accounts, total, err
}

// ensurePartnerAccountTx returns the owner's sub-account, creating it first
// when the partner has none for this external ID. Creation locks the
// partner's server config row, so the account cap and creation rate are
// checked one creation at a time and two concurrent first requests for the
// same ID cannot both insert.
func ensurePartnerAccountTx(tx *gorm.DB, owner PartnerAccountOwner) (*PartnerAccount, error) {
	if owner.ClientId == "" || owner.ExternalUserId == "" {
		return nil, errors.New("invalid partner account owner")
	}
	hash := HashPartnerExternalUserID(owner.ExternalUserId)
	var account PartnerAccount
	err := tx.Where("client_id = ? AND external_user_id_hash = ?", owner.ClientId, hash).First(&account).Error
	if err == nil {
		return &account, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	var config PartnerServerConfig
	if err := lockForUpdate(tx).Where("client_id = ?", owner.ClientId).First(&config).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPartnerServerUnavailable
		}
		return nil, err
	}
	if !config.Enabled || config.SuspendedAt != 0 {
		return nil, ErrPartnerServerUnavailable
	}
	err = tx.Where("client_id = ? AND external_user_id_hash = ?", owner.ClientId, hash).First(&account).Error
	if err == nil {
		return &account, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	now := common.GetTimestamp()
	var total int64
	if err := tx.Model(&PartnerAccount{}).Where("client_id = ?", owner.ClientId).Count(&total).Error; err != nil {
		return nil, err
	}
	if total >= int64(config.MaxAccounts) {
		return nil, ErrPartnerAccountLimit
	}
	var recent int64
	if err := tx.Model(&PartnerAccount{}).Where("client_id = ? AND created_at > ?", owner.ClientId, now-60).Count(&recent).Error; err != nil {
		return nil, err
	}
	if recent >= int64(config.AccountsPerMinute) {
		return nil, ErrPartnerAccountRateLimited
	}

	user, err := createPartnerSubAccountUserTx(tx, owner.DisplayName, config.AccountGroup)
	if err != nil {
		return nil, err
	}
	account = PartnerAccount{
		ClientId:           owner.ClientId,
		ExternalUserId:     owner.ExternalUserId,
		ExternalUserIdHash: hash,
		UserId:             user.Id,
		Status:             PartnerAccountStatusActive,
		CreatedAt:          now,
		UpdatedAt:          now,
	}
	if err := tx.Create(&account).Error; err != nil {
		return nil, err
	}
	return &account, nil
}

// createPartnerSubAccountUserTx creates the wallet user behind a partner
// account. It deliberately bypasses User.Insert: a sub-account gets no sign-up
// bonus, no inviter and no registration log. It has no password or email, so
// no sign-in path can reach it. The wallet ledger still gets the same
// non-refundable zero opening a bonus-free registration writes.
func createPartnerSubAccountUserTx(tx *gorm.DB, displayName, group string) (*User, error) {
	username, err := common.GenerateRandomCharsKey(16)
	if err != nil {
		return nil, err
	}
	// Registration's 4-character codes would collide across 100k accounts.
	affCode, err := common.GenerateRandomCharsKey(16)
	if err != nil {
		return nil, err
	}
	user := &User{
		Username:    partnerAccountUsernamePrefix + username,
		DisplayName: truncatePartnerAccountRunes(displayName, 20),
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
		Group:       group,
		AffCode:     affCode,
		AuthVersion: 1,
	}
	user.SetSetting(dto.UserSetting{})
	if err := user.prepareForInsert(tx); err != nil {
		return nil, err
	}
	if err := tx.Create(user).Error; err != nil {
		return nil, err
	}
	if err := recordWalletRefundCreditTx(tx, *user, walletRefundOpening, "registration", 0, 0, ""); err != nil {
		return nil, err
	}
	return user, nil
}

func truncatePartnerAccountRunes(value string, limit int) string {
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit])
}

func lockPartnerAccountTx(tx *gorm.DB, id int64) (*PartnerAccount, error) {
	var account PartnerAccount
	if err := lockForUpdate(tx).Where("id = ?", id).First(&account).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrPartnerAccountNotFound
		}
		return nil, err
	}
	return &account, nil
}

// PartnerAccountKey describes the model API key to create for a sub-account.
// The key string is generated by the caller and used only if a key is created.
type PartnerAccountKey struct {
	Key        string
	Name       string
	AutoGroups []string
}

func newPartnerAccountToken(userID int, spec PartnerAccountKey, now int64) (*Token, error) {
	token := &Token{
		UserId:         userID,
		Name:           spec.Name,
		Key:            spec.Key,
		CreatedTime:    now,
		AccessedTime:   now,
		ExpiredTime:    -1,
		UnlimitedQuota: true,
		Status:         common.TokenStatusEnabled,
		Group:          "auto",
	}
	if err := token.SetAutoGroups(spec.AutoGroups); err != nil {
		return nil, err
	}
	return token, nil
}

// partnerAccountTokenUsable reports whether a key can still serve requests:
// enabled and not past its expiry.
func partnerAccountTokenUsable(token *Token, now int64) bool {
	return token.Status == common.TokenStatusEnabled && (token.ExpiredTime == -1 || token.ExpiredTime > now)
}

// IssuePartnerAccountCredential returns the sub-account's current key,
// creating the account and the key on first use. A key that was disabled or
// has expired is reported, never silently replaced; rotation issues a new one.
func IssuePartnerAccountCredential(owner PartnerAccountOwner, spec PartnerAccountKey) (*PartnerAccount, *Token, bool, error) {
	var account *PartnerAccount
	var issued *Token
	created := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		ensured, err := ensurePartnerAccountTx(tx, owner)
		if err != nil {
			return err
		}
		account, err = lockPartnerAccountTx(tx, ensured.Id)
		if err != nil {
			return err
		}
		if account.Status != PartnerAccountStatusActive {
			return ErrPartnerAccountInactive
		}
		now := common.GetTimestamp()
		if account.TokenId > 0 {
			var existing Token
			if err := tx.Unscoped().Where("id = ? AND user_id = ?", account.TokenId, account.UserId).First(&existing).Error; err != nil {
				return err
			}
			if !partnerAccountTokenUsable(&existing, now) || existing.DeletedAt.Valid {
				return ErrPartnerAccountCredentialDisabled
			}
			issued = &existing
			return nil
		}
		token, err := newPartnerAccountToken(account.UserId, spec, now)
		if err != nil {
			return err
		}
		if err := tx.Create(token).Error; err != nil {
			return err
		}
		if err := tx.Model(account).Updates(map[string]any{"token_id": token.Id, "updated_at": now}).Error; err != nil {
			return err
		}
		account.TokenId = token.Id
		issued = token
		created = true
		return nil
	})
	if err != nil {
		return nil, nil, false, err
	}
	return account, issued, created, nil
}

// PartnerAccountRotation is one key rotation request. KeyHash and RequestHash
// make a retried rotation return the key it already issued.
type PartnerAccountRotation struct {
	KeyHash     string
	RequestHash string
	Immediately bool
	Key         PartnerAccountKey
}

// PartnerAccountRotationResult is the key a rotation issued and when the key
// it replaced stops working (0 when that key was revoked at once or there was
// no usable key to replace).
type PartnerAccountRotationResult struct {
	Account           *PartnerAccount
	Token             *Token
	OldKeyExpiresAt   int64
	Replayed          bool
	invalidatedTokens []string
}

// RotatePartnerAccountCredential issues a new key for an existing
// sub-account. The replaced key is disabled at once or expires after the
// grace period; a key still in grace from an earlier rotation is disabled, so
// at most two keys work at any time. It also works when the current key was
// disabled by an administrator's revoke-all, which is how the partner gets a
// working key again.
func RotatePartnerAccountCredential(clientID, externalUserID string, rotation PartnerAccountRotation) (*PartnerAccountRotationResult, error) {
	if len(rotation.KeyHash) != 64 || len(rotation.RequestHash) != 64 {
		return nil, errors.New("invalid partner account rotation")
	}
	current, err := GetPartnerAccount(clientID, externalUserID)
	if err != nil {
		return nil, err
	}
	result := &PartnerAccountRotationResult{}
	err = DB.Transaction(func(tx *gorm.DB) error {
		account, err := lockPartnerAccountTx(tx, current.Id)
		if err != nil {
			return err
		}
		result.Account = account
		if account.RotateKeyHash == rotation.KeyHash {
			if account.RotateRequestHash != rotation.RequestHash {
				return ErrPartnerAccountIdempotencyConflict
			}
			var token Token
			if err := tx.Unscoped().Where("id = ? AND user_id = ?", account.TokenId, account.UserId).First(&token).Error; err != nil {
				return err
			}
			result.Token = &token
			result.Replayed = true
			if account.PreviousTokenId > 0 {
				var previous Token
				if err := tx.Unscoped().Where("id = ? AND user_id = ?", account.PreviousTokenId, account.UserId).First(&previous).Error; err == nil && previous.Status == common.TokenStatusEnabled {
					result.OldKeyExpiresAt = previous.ExpiredTime
				}
			}
			return nil
		}
		if account.Status != PartnerAccountStatusActive {
			return ErrPartnerAccountInactive
		}
		now := common.GetTimestamp()
		if account.PreviousTokenId > 0 {
			if err := disablePartnerAccountTokenTx(tx, account.UserId, account.PreviousTokenId, &result.invalidatedTokens); err != nil {
				return err
			}
		}
		previousID := 0
		if account.TokenId > 0 {
			var old Token
			if err := tx.Unscoped().Where("id = ? AND user_id = ?", account.TokenId, account.UserId).First(&old).Error; err != nil {
				return err
			}
			switch {
			case !partnerAccountTokenUsable(&old, now) || old.DeletedAt.Valid:
				// Nothing usable to keep alive.
			case rotation.Immediately:
				if err := disablePartnerAccountTokenTx(tx, account.UserId, old.Id, &result.invalidatedTokens); err != nil {
					return err
				}
			default:
				expiresAt := now + PartnerAccountKeyGraceSeconds
				if old.ExpiredTime != -1 && old.ExpiredTime < expiresAt {
					expiresAt = old.ExpiredTime
				}
				if err := invalidateTokenCacheForMutation(old.Key); err != nil {
					return err
				}
				result.invalidatedTokens = append(result.invalidatedTokens, old.Key)
				if err := tx.Model(&old).Update("expired_time", expiresAt).Error; err != nil {
					return err
				}
				previousID = old.Id
				result.OldKeyExpiresAt = expiresAt
			}
		}
		token, err := newPartnerAccountToken(account.UserId, rotation.Key, now)
		if err != nil {
			return err
		}
		if err := tx.Create(token).Error; err != nil {
			return err
		}
		updates := map[string]any{
			"token_id":            token.Id,
			"previous_token_id":   previousID,
			"rotate_key_hash":     rotation.KeyHash,
			"rotate_request_hash": rotation.RequestHash,
			"updated_at":          now,
		}
		if err := tx.Model(account).Updates(updates).Error; err != nil {
			return err
		}
		account.TokenId = token.Id
		account.PreviousTokenId = previousID
		result.Token = token
		return nil
	})
	if err != nil {
		return nil, err
	}
	return result, nil
}

// disablePartnerAccountTokenTx disables one of a sub-account's keys, raising
// the key cache fence before the write as every token mutation must.
func disablePartnerAccountTokenTx(tx *gorm.DB, userID, tokenID int, invalidated *[]string) error {
	var token Token
	err := tx.Unscoped().Where("id = ? AND user_id = ?", tokenID, userID).First(&token).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	}
	if err != nil {
		return err
	}
	if token.Status == common.TokenStatusDisabled {
		return nil
	}
	if err := invalidateTokenCacheForMutation(token.Key); err != nil {
		return err
	}
	*invalidated = append(*invalidated, token.Key)
	return tx.Unscoped().Model(&token).Update("status", common.TokenStatusDisabled).Error
}

// setPartnerSubAccountUserStatusTx changes a sub-account user's status and
// bumps its auth version, as an administrator status change does. The caller
// must run FinalizePartnerAccountUserStatusChanges after commit.
func setPartnerSubAccountUserStatusTx(tx *gorm.DB, userID int, status int) (bool, error) {
	var user User
	if err := lockForUpdate(tx.Unscoped()).Select("id", "status").Where("id = ?", userID).First(&user).Error; err != nil {
		return false, err
	}
	if user.Status == status {
		return false, nil
	}
	if _, err := IncrementUserAuthVersionWithTx(tx, userID); err != nil {
		return false, err
	}
	if err := tx.Unscoped().Model(&User{}).Where("id = ?", userID).Update("status", status).Error; err != nil {
		return false, err
	}
	return true, nil
}

// FinalizePartnerAccountUserStatusChanges publishes committed status changes:
// it refreshes each user's auth cache, revokes browser sessions and drops the
// cached keys so the next model request reloads the user's status.
func FinalizePartnerAccountUserStatusChanges(userIDs []int) {
	for _, userID := range userIDs {
		if err := finalizeCommittedUserAuthMutation(userID, "partner_account_status"); err != nil {
			common.SysError(fmt.Sprintf("failed to finalize partner account status for user %d: %v", userID, err))
		}
		if err := InvalidateUserTokensCache(userID); err != nil {
			common.SysError(fmt.Sprintf("failed to invalidate tokens cache for user %d: %v", userID, err))
		}
	}
}

// SetPartnerAccountEnabledByPartner disables or re-enables a sub-account on the
// partner's request. An account an administrator disabled cannot be enabled
// by the partner. It returns the user IDs whose status changed.
func SetPartnerAccountEnabledByPartner(clientID, externalUserID string, enabled bool) (*PartnerAccount, []int, error) {
	current, err := GetPartnerAccount(clientID, externalUserID)
	if err != nil {
		return nil, nil, err
	}
	var account *PartnerAccount
	var changed []int
	err = DB.Transaction(func(tx *gorm.DB) error {
		account, err = lockPartnerAccountTx(tx, current.Id)
		if err != nil {
			return err
		}
		if account.Status == PartnerAccountStatusAdminDisabled {
			if enabled {
				return ErrPartnerAccountAdminDisabled
			}
			return nil
		}
		target := PartnerAccountStatusDisabled
		userStatus := common.UserStatusDisabled
		if enabled {
			target = PartnerAccountStatusActive
			userStatus = common.UserStatusEnabled
		}
		if account.Status == target {
			return nil
		}
		updates := map[string]any{"status": target, "updated_at": common.GetTimestamp()}
		// While the partner is suspended an enabled account keeps its user
		// disabled; the resume reconciliation re-enables it.
		suspended := false
		if enabled {
			var config PartnerServerConfig
			if err := tx.Select("suspended_at").Where("client_id = ?", clientID).First(&config).Error; err != nil {
				return err
			}
			suspended = config.SuspendedAt != 0
		}
		if suspended {
			updates["suspended_by_partner"] = true
		} else {
			updates["suspended_by_partner"] = false
			userChanged, err := setPartnerSubAccountUserStatusTx(tx, account.UserId, userStatus)
			if err != nil {
				return err
			}
			if userChanged {
				changed = append(changed, account.UserId)
			}
		}
		if err := tx.Model(account).Updates(updates).Error; err != nil {
			return err
		}
		account.Status = target
		return nil
	})
	if err != nil {
		return nil, nil, err
	}
	return account, changed, nil
}

// SyncPartnerAccountAdminStatus records an administrator's status change of a
// sub-account user, so the partner cannot re-enable an account an
// administrator disabled and a partner resume skips it. It is a no-op for
// users that are not sub-accounts.
func SyncPartnerAccountAdminStatus(userID int, enabled bool) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var account PartnerAccount
		err := lockForUpdate(tx).Where("user_id = ?", userID).First(&account).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		if err != nil {
			return err
		}
		status := PartnerAccountStatusAdminDisabled
		if enabled {
			status = PartnerAccountStatusActive
		}
		return tx.Model(&account).Updates(map[string]any{"status": status, "suspended_by_partner": false, "updated_at": common.GetTimestamp()}).Error
	})
}

// PartnerAccountBatch is one page of a per-partner batch job over its
// sub-accounts, ordered by ID.
type PartnerAccountBatch struct {
	LastId         int64
	Done           bool
	Processed      int
	ChangedUserIds []int
}

// ReconcilePartnerAccountSuspensionBatch moves one page of the partner's
// sub-accounts toward the partner's current suspension state. Suspending
// disables enabled users of active accounts and marks them; resuming
// re-enables only marked active accounts. Each account commits on its own, so
// a crash leaves a consistent prefix and the job can simply run again.
func ReconcilePartnerAccountSuspensionBatch(clientID string, afterID int64, limit int) (*PartnerAccountBatch, error) {
	config, err := GetPartnerServerConfig(clientID)
	if err != nil {
		return nil, err
	}
	suspend := config.SuspendedAt != 0
	var ids []int64
	if err := DB.Model(&PartnerAccount{}).Where("client_id = ? AND id > ?", clientID, afterID).Order("id").Limit(limit).Pluck("id", &ids).Error; err != nil {
		return nil, err
	}
	batch := &PartnerAccountBatch{LastId: afterID, Done: len(ids) < limit}
	for _, id := range ids {
		err := DB.Transaction(func(tx *gorm.DB) error {
			account, err := lockPartnerAccountTx(tx, id)
			if err != nil {
				return err
			}
			updates := map[string]any{}
			userStatus := 0
			switch {
			case suspend && account.Status == PartnerAccountStatusActive && !account.SuspendedByPartner:
				var user User
				if err := tx.Unscoped().Select("status").Where("id = ?", account.UserId).First(&user).Error; err != nil {
					return err
				}
				if user.Status != common.UserStatusEnabled {
					return nil
				}
				updates["suspended_by_partner"] = true
				userStatus = common.UserStatusDisabled
			case !suspend && account.SuspendedByPartner:
				updates["suspended_by_partner"] = false
				if account.Status == PartnerAccountStatusActive {
					userStatus = common.UserStatusEnabled
				}
			default:
				return nil
			}
			if userStatus != 0 {
				userChanged, err := setPartnerSubAccountUserStatusTx(tx, account.UserId, userStatus)
				if err != nil {
					return err
				}
				if userChanged {
					batch.ChangedUserIds = append(batch.ChangedUserIds, account.UserId)
				}
			}
			updates["updated_at"] = common.GetTimestamp()
			return tx.Model(account).Updates(updates).Error
		})
		if err != nil {
			return batch, err
		}
		batch.LastId = id
		batch.Processed++
	}
	return batch, nil
}

// RevokePartnerAccountKeysBatch disables the current key and any key still in
// grace for one page of the partner's sub-accounts. Accounts and balances are
// untouched; the partner obtains new keys through rotation.
func RevokePartnerAccountKeysBatch(clientID string, afterID int64, limit int) (*PartnerAccountBatch, error) {
	var accounts []PartnerAccount
	if err := DB.Where("client_id = ? AND id > ?", clientID, afterID).Order("id").Limit(limit).Find(&accounts).Error; err != nil {
		return nil, err
	}
	batch := &PartnerAccountBatch{LastId: afterID, Done: len(accounts) < limit}
	for _, account := range accounts {
		err := DB.Transaction(func(tx *gorm.DB) error {
			var invalidated []string
			for _, tokenID := range []int{account.TokenId, account.PreviousTokenId} {
				if tokenID <= 0 {
					continue
				}
				if err := disablePartnerAccountTokenTx(tx, account.UserId, tokenID, &invalidated); err != nil {
					return err
				}
			}
			return nil
		})
		if err != nil {
			return batch, err
		}
		batch.LastId = account.Id
		batch.Processed++
	}
	return batch, nil
}

// PartnerAccountPaymentOrderInput is a top-up a partner places for its user.
// Amounts are validated and priced by the caller; the sub-account is created
// on first use inside the same transaction as the order.
type PartnerAccountPaymentOrderInput struct {
	Owner              PartnerAccountOwner
	IdempotencyKeyHash string
	RequestHash        string
	RequestedAmount    int64
	StoredAmount       int64
	Money              float64
	PaymentMethod      string
	PaymentProvider    string
	CreditedQuota      int
	BaseQuota          int
	Metadata           CashbackRequestMetadata
}

// PartnerAccountPaymentLimits caps orders per sub-account (recent and still
// pending) and per partner. The per-partner count is not serialized across
// sub-accounts, so concurrent orders may exceed it slightly.
type PartnerAccountPaymentLimits struct {
	AccountRecentSince  int64
	AccountMaxRecent    int64
	AccountPendingSince int64
	AccountMaxPending   int64
	ClientRecentSince   int64
	ClientMaxRecent     int64
}

// CreatePartnerAccountPaymentOrder commits the sub-account (on first use), the
// top-up, its cashback context and the partner link together. The account row
// is locked so its limits are checked one order at a time.
func CreatePartnerAccountPaymentOrder(input PartnerAccountPaymentOrderInput, limits PartnerAccountPaymentLimits) (*PartnerAccountPaymentOrder, *TopUp, error) {
	if input.IdempotencyKeyHash == "" || input.RequestHash == "" {
		return nil, nil, errors.New("invalid partner account payment order")
	}
	metadata := input.Metadata
	metadata.IneligibleReason = CashbackIneligiblePartnerOAuth
	order := &PartnerAccountPaymentOrder{
		ClientId:           input.Owner.ClientId,
		IdempotencyKeyHash: input.IdempotencyKeyHash,
		RequestHash:        input.RequestHash,
		RequestedAmount:    input.RequestedAmount,
	}
	var topUp *TopUp
	err := DB.Transaction(func(tx *gorm.DB) error {
		ensured, err := ensurePartnerAccountTx(tx, input.Owner)
		if err != nil {
			return err
		}
		account, err := lockPartnerAccountTx(tx, ensured.Id)
		if err != nil {
			return err
		}
		if account.Status != PartnerAccountStatusActive {
			return ErrPartnerAccountInactive
		}
		var used int64
		if err := tx.Model(&PartnerAccountPaymentOrder{}).
			Where("client_id = ? AND idempotency_key_hash = ?", input.Owner.ClientId, input.IdempotencyKeyHash).
			Count(&used).Error; err != nil {
			return err
		}
		if used > 0 {
			return ErrPartnerAccountPaymentIdempotencyRace
		}
		recent, err := countPartnerAccountPaymentOrdersTx(tx, "partner_account_id = ?", account.Id, limits.AccountRecentSince, false)
		if err != nil {
			return err
		}
		pending, err := countPartnerAccountPaymentOrdersTx(tx, "partner_account_id = ?", account.Id, limits.AccountPendingSince, true)
		if err != nil {
			return err
		}
		clientRecent, err := countPartnerAccountPaymentOrdersTx(tx, "client_id = ?", input.Owner.ClientId, limits.ClientRecentSince, false)
		if err != nil {
			return err
		}
		if recent >= limits.AccountMaxRecent || pending >= limits.AccountMaxPending || clientRecent >= limits.ClientMaxRecent {
			return ErrPartnerAccountPaymentRateLimited
		}
		maxCurrentQuota, err := topUpQuotaMaxCurrent(input.CreditedQuota)
		if err != nil {
			return err
		}
		var user User
		if err := tx.Select("quota").Where("id = ?", account.UserId).First(&user).Error; err != nil {
			return err
		}
		if user.Quota > maxCurrentQuota {
			return ErrTopUpQuotaLimitExceeded
		}
		now := common.GetTimestamp()
		topUp = &TopUp{
			UserId:          account.UserId,
			Amount:          input.StoredAmount,
			Money:           input.Money,
			TradeNo:         fmt.Sprintf("USR%dNO%s%d", account.UserId, common.GetRandomString(6), now),
			PaymentMethod:   input.PaymentMethod,
			PaymentProvider: input.PaymentProvider,
			CreateTime:      now,
			Status:          common.TopUpStatusPending,
		}
		if err := InsertOnlineTopUpTx(tx, topUp, input.BaseQuota, metadata); err != nil {
			return err
		}
		order.PartnerAccountId = account.Id
		order.UserId = account.UserId
		order.TopUpId = topUp.Id
		order.CreatedAt = now
		return tx.Create(order).Error
	})
	if isDatabaseDuplicatedKey(DB, err) {
		// Only a stored order with this key is an idempotency race; any other
		// duplicate (for example a trade number collision) stays an error the
		// partner can retry with the same key.
		var used int64
		if countErr := DB.Model(&PartnerAccountPaymentOrder{}).
			Where("client_id = ? AND idempotency_key_hash = ?", input.Owner.ClientId, input.IdempotencyKeyHash).
			Count(&used).Error; countErr == nil && used > 0 {
			return nil, nil, ErrPartnerAccountPaymentIdempotencyRace
		}
	}
	if err != nil {
		return nil, nil, err
	}
	return order, topUp, nil
}

// countPartnerAccountPaymentOrdersTx counts orders matching scope created at
// or after since; pendingOnly restricts the count to orders awaiting payment.
func countPartnerAccountPaymentOrdersTx(tx *gorm.DB, scope string, value any, since int64, pendingOnly bool) (int64, error) {
	query := tx.Model(&PartnerAccountPaymentOrder{}).Where(scope, value).Where("created_at >= ?", since)
	if pendingOnly {
		pending := tx.Model(&TopUp{}).Select("id").Where("status = ?", common.TopUpStatusPending)
		query = query.Where("top_up_id IN (?)", pending)
	}
	var count int64
	err := query.Count(&count).Error
	return count, err
}

// SetPartnerAccountPaymentCheckout stores the checkout the gateway returned so
// idempotent replays return it without placing the order again.
func SetPartnerAccountPaymentCheckout(orderID int64, qrCode, payURL string) error {
	return DB.Model(&PartnerAccountPaymentOrder{}).Where("id = ?", orderID).
		Updates(map[string]any{"qr_code": qrCode, "pay_url": payURL}).Error
}

func FindPartnerAccountPaymentOrderByIdempotency(clientID, keyHash string) (*PartnerAccountPaymentOrder, *TopUp, error) {
	var order PartnerAccountPaymentOrder
	err := DB.Where("client_id = ? AND idempotency_key_hash = ?", clientID, keyHash).First(&order).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil, ErrPartnerAccountPaymentOrderNotFound
	}
	if err != nil {
		return nil, nil, err
	}
	var topUp TopUp
	if err := DB.Where("id = ?", order.TopUpId).First(&topUp).Error; err != nil {
		return nil, nil, err
	}
	return &order, &topUp, nil
}

// GetPartnerAccountPaymentOrder returns the order only when this partner
// placed it; any other order is reported as missing.
func GetPartnerAccountPaymentOrder(clientID, tradeNo string) (*PartnerAccountPaymentOrder, *TopUp, error) {
	var topUp TopUp
	err := DB.Where("trade_no = ?", tradeNo).First(&topUp).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil, ErrPartnerAccountPaymentOrderNotFound
	}
	if err != nil {
		return nil, nil, err
	}
	var order PartnerAccountPaymentOrder
	err = DB.Where("top_up_id = ? AND client_id = ?", topUp.Id, clientID).First(&order).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil, ErrPartnerAccountPaymentOrderNotFound
	}
	if err != nil {
		return nil, nil, err
	}
	return &order, &topUp, nil
}

// ListPartnerServerClientsToReconcile returns partners whose sub-accounts may
// not match their suspension state yet: suspended partners, and partners with
// accounts still marked as suspended. It lets a restart finish interrupted
// suspension and resume jobs.
func ListPartnerServerClientsToReconcile() ([]string, error) {
	var suspended []string
	if err := DB.Model(&PartnerServerConfig{}).Where("suspended_at <> ?", 0).Pluck("client_id", &suspended).Error; err != nil {
		return nil, err
	}
	var marked []string
	if err := DB.Model(&PartnerAccount{}).Where("suspended_by_partner = ?", true).Distinct("client_id").Pluck("client_id", &marked).Error; err != nil {
		return nil, err
	}
	for _, clientID := range marked {
		if !slices.Contains(suspended, clientID) {
			suspended = append(suspended, clientID)
		}
	}
	return suspended, nil
}

// PartnerAccountUsage is one consume-log entry as a partner may see it. It
// carries no request content, IP, channel or internal billing detail.
type PartnerAccountUsage struct {
	CreatedAt        int64  `json:"created_at"`
	ModelName        string `json:"model_name"`
	PromptTokens     int    `json:"prompt_tokens"`
	CompletionTokens int    `json:"completion_tokens"`
	Quota            int    `json:"quota"`
	UseTime          int    `json:"use_time"`
	IsStream         bool   `json:"is_stream"`
	RequestId        string `json:"request_id"`
}

// ListPartnerAccountUsage pages a sub-account's consume logs in
// [startTime, endTime], newest first. It fetches one extra row to report
// whether more follow instead of counting the whole range.
func ListPartnerAccountUsage(userID int, startTime, endTime int64, offset, limit int) ([]PartnerAccountUsage, bool, error) {
	var rows []PartnerAccountUsage
	err := LOG_DB.Model(&Log{}).
		Select("created_at", "model_name", "prompt_tokens", "completion_tokens", "quota", "use_time", "is_stream", "request_id").
		Where("user_id = ? AND type = ? AND created_at >= ? AND created_at <= ?", userID, LogTypeConsume, startTime, endTime).
		Order("id desc").Offset(offset).Limit(limit + 1).
		Scan(&rows).Error
	if err != nil {
		return nil, false, err
	}
	if len(rows) > limit {
		return rows[:limit], true, nil
	}
	return rows, false, nil
}
