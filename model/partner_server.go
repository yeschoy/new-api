package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"

	"gorm.io/gorm"
)

const (
	PartnerServerSecretStatusActive  = "active"
	PartnerServerSecretStatusRevoked = "revoked"

	// PartnerServerMaxActiveSecrets lets a partner hold a new secret and the
	// one it replaces while it switches over, and no more.
	PartnerServerMaxActiveSecrets = 2

	PartnerServerDefaultMaxAccounts       = 100000
	PartnerServerDefaultAccountsPerMinute = 60
)

var (
	ErrPartnerServerConfigNotFound = errors.New("partner server config not found")
	ErrPartnerServerSecretNotFound = errors.New("partner server secret not found")
	ErrPartnerServerSecretLimit    = errors.New("partner server secret limit reached")
	ErrPartnerServerTokenNotFound  = errors.New("partner server token not found")
	// ErrPartnerServerUnavailable means server access is switched off or the
	// partner is suspended, so nothing may be created on its behalf.
	ErrPartnerServerUnavailable = errors.New("partner server access is unavailable")
)

// PartnerServerConfig holds a partner's server-to-server access settings. It
// lives beside partner_oauth_clients instead of adding columns there, so the
// released table needs no migration. Account creation locks this row to
// serialize the per-partner account cap and creation rate.
type PartnerServerConfig struct {
	Id                int64  `json:"id" gorm:"primaryKey"`
	ClientId          string `json:"client_id" gorm:"type:varchar(64);not null;uniqueIndex"`
	Enabled           bool   `json:"enabled"`
	AccountGroup      string `json:"account_group" gorm:"type:varchar(64);not null"`
	IPAllowlist       string `json:"ip_allowlist" gorm:"type:text"`
	MaxAccounts       int    `json:"max_accounts" gorm:"not null"`
	AccountsPerMinute int    `json:"accounts_per_minute" gorm:"not null"`
	SuspendedAt       int64  `json:"suspended_at" gorm:"type:bigint;default:0"`
	CreatedAt         int64  `json:"created_at" gorm:"type:bigint"`
	UpdatedAt         int64  `json:"updated_at" gorm:"type:bigint"`
}

func (PartnerServerConfig) TableName() string {
	return "partner_server_configs"
}

// PartnerServerSecret is a server credential. Only its SHA-256 is stored; the
// secret is 32 random bytes, so a fast hash is enough.
type PartnerServerSecret struct {
	Id         int64  `json:"id" gorm:"primaryKey"`
	ClientId   string `json:"client_id" gorm:"type:varchar(64);not null;index"`
	SecretHash string `json:"-" gorm:"type:char(64);not null;uniqueIndex"`
	Status     string `json:"status" gorm:"type:varchar(16);not null"`
	CreatedAt  int64  `json:"created_at" gorm:"type:bigint"`
	RevokedAt  int64  `json:"revoked_at" gorm:"type:bigint;default:0"`
}

func (PartnerServerSecret) TableName() string {
	return "partner_server_secrets"
}

// PartnerServerToken is a short-lived access token issued for one secret.
// Revoking the secret deletes its tokens.
type PartnerServerToken struct {
	Id        int64  `json:"id" gorm:"primaryKey"`
	TokenHash string `json:"-" gorm:"type:char(64);not null;uniqueIndex"`
	ClientId  string `json:"client_id" gorm:"type:varchar(64);not null;index"`
	SecretId  int64  `json:"secret_id" gorm:"not null;index"`
	ExpiresAt int64  `json:"expires_at" gorm:"type:bigint;not null;index"`
	CreatedAt int64  `json:"created_at" gorm:"type:bigint"`
}

func (PartnerServerToken) TableName() string {
	return "partner_server_tokens"
}

func GetPartnerServerConfig(clientID string) (*PartnerServerConfig, error) {
	var config PartnerServerConfig
	err := DB.Where("client_id = ?", clientID).First(&config).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrPartnerServerConfigNotFound
	}
	if err != nil {
		return nil, err
	}
	return &config, nil
}

// SavePartnerServerConfig creates the partner's config or replaces its
// administrator-editable fields. Suspension is owned by
// SetPartnerServerSuspended and is never changed here.
func SavePartnerServerConfig(config *PartnerServerConfig) error {
	if config == nil || config.ClientId == "" {
		return errors.New("invalid partner server config")
	}
	now := common.GetTimestamp()
	return DB.Transaction(func(tx *gorm.DB) error {
		var client PartnerOAuthClient
		if err := tx.Select("id").Where("client_id = ?", config.ClientId).First(&client).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPartnerOAuthClientNotFound
			}
			return err
		}
		var current PartnerServerConfig
		err := lockForUpdate(tx).Where("client_id = ?", config.ClientId).First(&current).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			config.Id = 0
			config.SuspendedAt = 0
			config.CreatedAt = now
			config.UpdatedAt = now
			return tx.Create(config).Error
		}
		if err != nil {
			return err
		}
		config.Id = current.Id
		config.SuspendedAt = current.SuspendedAt
		config.CreatedAt = current.CreatedAt
		config.UpdatedAt = now
		return tx.Model(&current).Select("enabled", "account_group", "ip_allowlist", "max_accounts", "accounts_per_minute", "updated_at").Updates(config).Error
	})
}

// SetPartnerServerSuspended records whether the partner is suspended and
// reports whether the state changed. Callers reconcile sub-accounts afterwards.
func SetPartnerServerSuspended(clientID string, suspended bool) (bool, error) {
	changed := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		var config PartnerServerConfig
		if err := lockForUpdate(tx).Where("client_id = ?", clientID).First(&config).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPartnerServerConfigNotFound
			}
			return err
		}
		if (config.SuspendedAt != 0) == suspended {
			return nil
		}
		suspendedAt := int64(0)
		if suspended {
			suspendedAt = common.GetTimestamp()
		}
		changed = true
		return tx.Model(&config).Updates(map[string]any{"suspended_at": suspendedAt, "updated_at": common.GetTimestamp()}).Error
	})
	return changed, err
}

// CreatePartnerServerSecret stores a new active secret unless the partner
// already holds PartnerServerMaxActiveSecrets of them.
func CreatePartnerServerSecret(clientID, secretHash string) (*PartnerServerSecret, error) {
	if clientID == "" || len(secretHash) != 64 {
		return nil, errors.New("invalid partner server secret")
	}
	secret := &PartnerServerSecret{ClientId: clientID, SecretHash: secretHash, Status: PartnerServerSecretStatusActive, CreatedAt: common.GetTimestamp()}
	err := DB.Transaction(func(tx *gorm.DB) error {
		var config PartnerServerConfig
		if err := lockForUpdate(tx).Select("id").Where("client_id = ?", clientID).First(&config).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPartnerServerConfigNotFound
			}
			return err
		}
		var active int64
		if err := tx.Model(&PartnerServerSecret{}).Where("client_id = ? AND status = ?", clientID, PartnerServerSecretStatusActive).Count(&active).Error; err != nil {
			return err
		}
		if active >= PartnerServerMaxActiveSecrets {
			return ErrPartnerServerSecretLimit
		}
		return tx.Create(secret).Error
	})
	if err != nil {
		return nil, err
	}
	return secret, nil
}

// RevokePartnerServerSecret revokes the secret and deletes every access token
// it issued in the same transaction. Revoking an already revoked secret is a
// no-op.
func RevokePartnerServerSecret(clientID string, secretID int64) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var secret PartnerServerSecret
		if err := lockForUpdate(tx).Where("id = ? AND client_id = ?", secretID, clientID).First(&secret).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPartnerServerSecretNotFound
			}
			return err
		}
		if secret.Status != PartnerServerSecretStatusActive {
			return nil
		}
		if err := tx.Model(&secret).Updates(map[string]any{"status": PartnerServerSecretStatusRevoked, "revoked_at": common.GetTimestamp()}).Error; err != nil {
			return err
		}
		return tx.Where("secret_id = ?", secret.Id).Delete(&PartnerServerToken{}).Error
	})
}

func ListPartnerServerSecrets(clientID string) ([]PartnerServerSecret, error) {
	var secrets []PartnerServerSecret
	err := DB.Where("client_id = ?", clientID).Order("id desc").Find(&secrets).Error
	return secrets, err
}

func ListActivePartnerServerSecrets(clientID string) ([]PartnerServerSecret, error) {
	var secrets []PartnerServerSecret
	err := DB.Where("client_id = ? AND status = ?", clientID, PartnerServerSecretStatusActive).Order("id").Find(&secrets).Error
	return secrets, err
}

// CreatePartnerServerToken stores an access token only while the secret that
// authenticated the request is still active, so a revocation that committed
// in between leaves no live token behind.
func CreatePartnerServerToken(token *PartnerServerToken) error {
	if token == nil || len(token.TokenHash) != 64 || token.ClientId == "" || token.SecretId <= 0 {
		return errors.New("invalid partner server token")
	}
	if token.CreatedAt == 0 {
		token.CreatedAt = common.GetTimestamp()
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		var secret PartnerServerSecret
		if err := lockForUpdate(tx).Where("id = ? AND client_id = ?", token.SecretId, token.ClientId).First(&secret).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPartnerServerSecretNotFound
			}
			return err
		}
		if secret.Status != PartnerServerSecretStatusActive {
			return ErrPartnerServerSecretNotFound
		}
		return tx.Create(token).Error
	})
}

func FindPartnerServerToken(tokenHash string) (*PartnerServerToken, error) {
	var token PartnerServerToken
	err := DB.Where("token_hash = ?", tokenHash).First(&token).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrPartnerServerTokenNotFound
	}
	if err != nil {
		return nil, err
	}
	return &token, nil
}

// DeleteExpiredPartnerServerTokens keeps a day of expired tokens, like the
// OAuth token cleanup, before deleting them.
func DeleteExpiredPartnerServerTokens(now int64) error {
	cutoff := now - 24*60*60
	return DB.Where("expires_at < ?", cutoff).Delete(&PartnerServerToken{}).Error
}
