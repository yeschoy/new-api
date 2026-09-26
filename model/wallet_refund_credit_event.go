package model

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"

	"gorm.io/gorm"
)

// WalletRefundCreditEvent orders committed, low-frequency wallet grants under
// the user's database row lock. It is not a spend ledger or a refund receipt.
// An opening is nonrefundable: registration is a new-user grant, while
// a wallet opening may contain historical mixed funds and needs manual review.
type WalletRefundCreditEvent struct {
	ID         int64  `gorm:"primaryKey;index:idx_wallet_refund_credit_user_id,priority:2"`
	UserID     int64  `gorm:"type:bigint;not null;index:idx_wallet_refund_credit_user_id,priority:1"`
	EventKey   string `gorm:"type:char(64);not null;uniqueIndex:ux_wallet_refund_credit_event_key"`
	Kind       string `gorm:"type:varchar(24);not null"`
	SourceType string `gorm:"type:varchar(24);not null"`
	SourceID   int64  `gorm:"type:bigint;not null;default:0"`
	Quota      int64  `gorm:"type:bigint;not null"`
	CreatedAt  int64  `gorm:"type:bigint;not null"`
}

const (
	walletRefundOpening       = "opening"
	walletRefundPurchase      = "purchase"
	walletRefundGift          = "gift"
	walletRefundNonrefundable = "nonrefundable"
	walletRefundException     = "exception"
)

func (event *WalletRefundCreditEvent) BeforeSave(_ *gorm.DB) error {
	if len(event.EventKey) != 64 || event.UserID <= 0 || event.SourceID < 0 || event.CreatedAt <= 0 || len(event.SourceType) == 0 || len(event.SourceType) > 24 {
		return errors.New("invalid wallet credit event")
	}
	switch event.Kind {
	case walletRefundOpening:
		if event.Quota < 0 {
			return errors.New("negative opening quota")
		}
	case walletRefundException:
		if event.Quota != 0 {
			return errors.New("exception must not represent a wallet grant")
		}
	case walletRefundPurchase, walletRefundGift, walletRefundNonrefundable:
		if event.Quota <= 0 {
			return errors.New("wallet grant must be positive")
		}
	default:
		return errors.New("invalid wallet credit kind")
	}
	return nil
}

// Call only with the user's row already locked in tx and the pre-mutation
// balance. Each account's first event is its nonrefundable opening; never
// backfill a historical payment as a new purchase. No normal spending calls
// this function (including settlement refunds of temporary reservations).
func recordWalletRefundCreditTx(tx *gorm.DB, user User, kind, sourceType string, sourceID int64, quota int64, discriminator string) error {
	if user.Id <= 0 || sourceID < 0 || (kind != walletRefundOpening && kind != walletRefundException && quota <= 0) || (kind == walletRefundException && quota != 0) {
		return errors.New("invalid wallet credit input")
	}
	var first WalletRefundCreditEvent
	if err := tx.Select("id").Where("user_id = ?", user.Id).Order("id").Limit(1).Find(&first).Error; err != nil {
		return err
	}
	stamp, err := getDBTimestampOnStrict(tx)
	if err != nil {
		return err
	}
	if first.ID == 0 {
		openingKey := sha256.Sum256([]byte(fmt.Sprintf("opening:%d", user.Id)))
		openingSource := "wallet"
		if kind == walletRefundOpening && sourceType == "registration" {
			openingSource = "registration"
		}
		opening := WalletRefundCreditEvent{UserID: int64(user.Id), EventKey: hex.EncodeToString(openingKey[:]), Kind: walletRefundOpening, SourceType: openingSource, Quota: int64(max(0, user.Quota)), CreatedAt: stamp}
		if err := tx.Create(&opening).Error; err != nil {
			return err
		}
		if user.Quota < 0 {
			// Existing debt is not a grant or ordinary FIFO consumption. Do not
			// block the wallet mutation; mark this history for manual review.
			key := sha256.Sum256([]byte(fmt.Sprintf("negative_opening:%d", user.Id)))
			anomaly := WalletRefundCreditEvent{UserID: int64(user.Id), EventKey: hex.EncodeToString(key[:]), Kind: walletRefundException, SourceType: "negative_opening", Quota: 0, CreatedAt: stamp}
			if err := tx.Create(&anomaly).Error; err != nil {
				return err
			}
		}
	}
	if kind == walletRefundOpening {
		return nil
	}
	key := sha256.Sum256([]byte(fmt.Sprintf("%s:%s:%d:%d:%s", kind, sourceType, sourceID, user.Id, discriminator)))
	event := WalletRefundCreditEvent{UserID: int64(user.Id), EventKey: hex.EncodeToString(key[:]), Kind: kind, SourceType: sourceType, SourceID: sourceID, Quota: quota, CreatedAt: stamp}
	return tx.Create(&event).Error
}
