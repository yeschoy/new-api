package model

import (
	"errors"

	"gorm.io/gorm"
)

// Administrator user list categories. The category is derived only from the
// existence of a PartnerTenantAccount mapping for the user.
const (
	UserTenantCategoryAll      = "all"
	UserTenantCategoryOrdinary = "ordinary"
	UserTenantCategoryMerchant = "merchant"
)

// ErrUserTenantFilter rejects an unknown category, a non-positive tenant ID or
// the contradictory "ordinary + tenant" combination before any query runs.
var ErrUserTenantFilter = errors.New("invalid user tenant filter")

// UserTenantFilter is the typed Tenant dimension of the administrator user
// list. The zero value means "all users, no tenant" and adds no predicate, so
// callers that do not pass a filter keep their previous SQL.
//
// It is independent of the Partner OAuth/Server dimension (PartnerAccount):
// an OAuth client_id is never a tenant ID and a user may carry both.
type UserTenantFilter struct {
	// Category is "", "all", "ordinary" or "merchant"; "" equals "all".
	Category string
	// TenantId narrows to users mapped to this tenant; 0 means no tenant filter.
	TenantId int64
}

// Validate reports ErrUserTenantFilter for a filter that must not reach SQL.
func (f UserTenantFilter) Validate() error {
	switch f.Category {
	case "", UserTenantCategoryAll, UserTenantCategoryMerchant:
	case UserTenantCategoryOrdinary:
		// An ordinary user has no mapping, so it cannot belong to a tenant.
		if f.TenantId != 0 {
			return ErrUserTenantFilter
		}
	default:
		return ErrUserTenantFilter
	}
	if f.TenantId < 0 {
		return ErrUserTenantFilter
	}
	return nil
}

// IsZero reports whether the filter adds no predicate.
func (f UserTenantFilter) IsZero() bool {
	return (f.Category == "" || f.Category == UserTenantCategoryAll) && f.TenantId == 0
}

const (
	// Correlated on the outer users row; partner_tenant_accounts.user_id is
	// unique, and EXISTS can never duplicate a user the way a join could.
	userTenantAnyAccountExists  = "EXISTS (SELECT 1 FROM partner_tenant_accounts WHERE partner_tenant_accounts.user_id = users.id)"
	userTenantNoAccountExists   = "NOT " + userTenantAnyAccountExists
	userTenantThisAccountExists = "EXISTS (SELECT 1 FROM partner_tenant_accounts WHERE partner_tenant_accounts.user_id = users.id AND partner_tenant_accounts.tenant_id = ?)"
)

// apply adds the Tenant predicate to a users query. The count query and the
// page query must both go through it so they filter before pagination with
// the same condition. There is deliberately no account, tenant, subscription,
// role, group or username predicate: a disabled or expired merchant account
// is still a merchant account, matching partnerTenantOwnerQuery.
//
// The caller must have validated the filter.
func (f UserTenantFilter) apply(query *gorm.DB) *gorm.DB {
	switch {
	case f.TenantId > 0:
		// "all" and "merchant" intersect to the same set for a specific tenant.
		return query.Where(userTenantThisAccountExists, f.TenantId)
	case f.Category == UserTenantCategoryMerchant:
		return query.Where(userTenantAnyAccountExists)
	case f.Category == UserTenantCategoryOrdinary:
		return query.Where(userTenantNoAccountExists)
	default:
		return query
	}
}
