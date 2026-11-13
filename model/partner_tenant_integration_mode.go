package model

import (
	"errors"

	"gorm.io/gorm"
)

const (
	PartnerTenantIntegrationSubscriptionKey = "subscription_key"
	PartnerTenantIntegrationHostedH5        = "hosted_h5"
)

// Admission policy is separate from account IdentitySource and order EntryMode.
// Never default a stored empty/unknown mode at runtime.
type PartnerTenantOperation uint8

const (
	PartnerTenantOperationCatalog PartnerTenantOperation = iota
	PartnerTenantOperationSubscriptionKey
	PartnerTenantOperationHostedH5
	PartnerTenantOperationDirectOrder
)

var ErrPartnerTenantIntegrationMode = errors.New("partner tenant integration mode mismatch")

func IsValidPartnerTenantIntegrationMode(mode string) bool {
	return mode == PartnerTenantIntegrationSubscriptionKey || mode == PartnerTenantIntegrationHostedH5
}

func RequirePartnerTenantIntegrationMode(tenant *PartnerTenant, operation PartnerTenantOperation) error {
	if tenant != nil && IsValidPartnerTenantIntegrationMode(tenant.IntegrationMode) {
		switch operation {
		case PartnerTenantOperationCatalog:
			return nil
		case PartnerTenantOperationSubscriptionKey:
			if tenant.IntegrationMode == PartnerTenantIntegrationSubscriptionKey {
				return nil
			}
		case PartnerTenantOperationHostedH5:
			if tenant.IntegrationMode == PartnerTenantIntegrationHostedH5 {
				return nil
			}
		}
	}
	return ErrPartnerTenantIntegrationMode
}

// Called BEFORE startup's broad AutoMigrate, so nullable historical rows are
// normalized before the NOT NULL constraint. Unknown nonempty modes survive
// migration and fail closed on admission. Never rewrite identity/payment data.
func MigratePartnerTenantIntegrationModes(db *gorm.DB) error {
	if db.Migrator().HasTable(&PartnerTenant{}) && db.Migrator().HasColumn(&PartnerTenant{}, "integration_mode") {
		if err := db.Model(&PartnerTenant{}).Where("integration_mode IS NULL OR integration_mode = ?", "").Update("integration_mode", PartnerTenantIntegrationSubscriptionKey).Error; err != nil {
			return err
		}
	}
	return db.AutoMigrate(&PartnerTenant{})
}

// Current secret and policy under the same Tenant lock as the entry operation.
// Shared fulfillment/binding/cashier helpers deliberately do NOT call this.
func lockPartnerTenantAdmission(tx *gorm.DB, tenantID int64, secretHash string, operation PartnerTenantOperation) (*PartnerTenant, error) {
	tenant, err := lockPartnerTenantCurrentSecret(tx, tenantID, secretHash)
	if err != nil {
		return nil, err
	}
	if err := RequirePartnerTenantIntegrationMode(tenant, operation); err != nil {
		return nil, &PartnerTenantAuditAdmissionError{Receipt: PartnerTenantAuditPrincipal(tenant)}
	}
	return tenant, nil
}

// Reconciliation support has no browser expiry/snapshot gate, but does require
// the CURRENT pt_ and H5 mode. The shared internal order getter remains neutral.
func GetPartnerTenantHostedOrder(tenantID int64, secretHash, orderNo string) (*PartnerTenantSubscriptionOrder, error) {
	var order *PartnerTenantSubscriptionOrder
	err := DB.Transaction(func(tx *gorm.DB) error {
		if _, err := lockPartnerTenantAdmission(tx, tenantID, secretHash, PartnerTenantOperationHostedH5); err != nil {
			return err
		}
		var found PartnerTenantSubscriptionOrder
		if err := tx.Where("tenant_id = ? AND order_no = ? AND entry_mode = ?", tenantID, orderNo, PartnerTenantIdentityExternal).First(&found).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrPartnerTenantOrderNotFound
			}
			return err
		}
		if found.OrderNo != orderNo {
			return ErrPartnerTenantOrderNotFound
		}
		order = &found
		return nil
	})
	return order, err
}

func GetPartnerTenantHostedPurchaseSession(tenantID int64, secretHash, sessionID string) (*PartnerTenantPurchaseSession, error) {
	var session *PartnerTenantPurchaseSession
	err := DB.Transaction(func(tx *gorm.DB) error {
		if _, err := lockPartnerTenantAdmission(tx, tenantID, secretHash, PartnerTenantOperationHostedH5); err != nil {
			return err
		}
		var err error
		session, err = getPartnerTenantPurchaseSessionOn(tx, tenantID, sessionID)
		return err
	})
	return session, err
}

// Tenant authorization and period reset share one transaction. External identity
// lookup never resolves a subscription-key account, including empty IDs.
func GetPartnerTenantHostedQuota(tenantID int64, secretHash, externalID string) ([]SubscriptionSummary, error) {
	subscriptions := make([]UserSubscription, 0)
	err := DB.Transaction(func(tx *gorm.DB) error {
		if _, err := lockPartnerTenantAdmission(tx, tenantID, secretHash, PartnerTenantOperationHostedH5); err != nil {
			return err
		}
		var account PartnerTenantAccount
		if err := partnerTenantAccountQuery(tx, tenantID, externalID).Where("status = ?", PartnerTenantStatusEnabled).First(&account).Error; err != nil {
			return err
		}
		return collectPartnerTenantActiveSubscriptionsTx(tx, tenantID, account.UserId, getDBTimestampOn(tx), &subscriptions)
	})
	if err != nil {
		return nil, err
	}
	return buildSubscriptionSummaries(subscriptions)
}
