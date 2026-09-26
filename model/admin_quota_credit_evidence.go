package model

import (
	"errors"

	"gorm.io/gorm"
)

// AdminQuotaCreditEvidence records one committed administrator add operation.
// IDs order credits for this user only when all writes use the locked user row;
// this table cannot order credits from other sources or prove payment. A non-nil
// CNYCents is the administrator's declared CNY input, not a payment receipt.
// Historical adds are not backfilled. A nil CNYCents requires manual pricing.
type AdminQuotaCreditEvidence struct {
	ID            int64  `gorm:"primaryKey;index:idx_admin_quota_credit_user_id,priority:2"`
	EventKey      string `gorm:"type:char(64);not null;uniqueIndex:ux_admin_quota_credit_event_key"`
	UserID        int64  `gorm:"type:bigint;not null;index:idx_admin_quota_credit_user_id,priority:1"`
	OperatorID    int64  `gorm:"type:bigint;not null"`
	CreditedQuota int64  `gorm:"type:bigint;not null"`
	CNYCents      *int64 `gorm:"type:bigint"`
	CreditedAt    int64  `gorm:"type:bigint;not null"`
}

func (e *AdminQuotaCreditEvidence) BeforeSave(_ *gorm.DB) error {
	if len(e.EventKey) != 64 || e.UserID <= 0 || e.OperatorID <= 0 || e.CreditedQuota <= 0 || e.CreditedAt <= 0 || (e.CNYCents != nil && *e.CNYCents <= 0) {
		return errors.New("invalid admin quota credit evidence")
	}
	return nil
}
