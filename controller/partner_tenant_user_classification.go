package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

// English source texts; the web console translates them by key.
const (
	userTenantCategoryInvalidMessage = "user_category must be exactly one of all, ordinary or merchant"
	userTenantIDInvalidMessage       = "tenant_id must be exactly one positive integer in canonical decimal form"
	userTenantContradictionMessage   = "user_category=ordinary cannot be combined with tenant_id"
)

// Batch owner lookup for one page of listed users. A variable only so a test
// can force the failure path; production always uses the shared primitive.
var partnerTenantOwnersForUserList = model.GetPartnerTenantOwners

// parseUserTenantFilter reads the Tenant dimension of the administrator user
// list: user_category (all | ordinary | merchant, omitted = all) and tenant_id
// (canonical positive int64 decimal text). Each may appear at most once; an
// unknown, empty, repeated, non-canonical or contradictory value is answered
// with 400 here, before any query, and is never ignored or rounded.
//
// Only these two keys are inspected, so the pre-existing parameters of the two
// list endpoints keep their lenient parsing.
func parseUserTenantFilter(c *gin.Context) (model.UserTenantFilter, bool) {
	reject := func(message string) (model.UserTenantFilter, bool) {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage(message))
		return model.UserTenantFilter{}, false
	}
	filter := model.UserTenantFilter{Category: model.UserTenantCategoryAll}
	if values, present := c.GetQueryArray("user_category"); present {
		if len(values) != 1 {
			return reject(userTenantCategoryInvalidMessage)
		}
		switch values[0] {
		case model.UserTenantCategoryAll, model.UserTenantCategoryOrdinary, model.UserTenantCategoryMerchant:
			filter.Category = values[0]
		default:
			return reject(userTenantCategoryInvalidMessage)
		}
	}
	if values, present := c.GetQueryArray("tenant_id"); present {
		if len(values) != 1 {
			return reject(userTenantIDInvalidMessage)
		}
		tenantID, ok := parseCanonicalPositiveInt64(values[0])
		if !ok {
			return reject(userTenantIDInvalidMessage)
		}
		filter.TenantId = tenantID
	}
	if filter.Validate() != nil {
		// The only combination left invalid here: ordinary users have no tenant.
		return reject(userTenantContradictionMessage)
	}
	return filter, true
}

// withPartnerTenantOwners fills the Tenant classification of one page with a
// single batch lookup; an empty page issues no query. Only the tenant ID and
// name leave the owner projection. On failure nothing is filled and the error
// is returned: a failed lookup must never present users as ordinary.
func withPartnerTenantOwners(items []adminUserListItem) error {
	if len(items) == 0 {
		return nil
	}
	ids := make([]int, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.User.Id)
	}
	owners, err := partnerTenantOwnersForUserList(ids)
	if err != nil {
		return err
	}
	for i := range items {
		owner, member := owners[items[i].User.Id]
		if !member {
			items[i].UserCategory = model.UserTenantCategoryOrdinary
			continue
		}
		items[i].UserCategory = model.UserTenantCategoryMerchant
		items[i].PartnerTenantId = strconv.FormatInt(owner.TenantId, 10)
		items[i].PartnerTenantName = owner.TenantName
	}
	return nil
}

// respondUserTenantOwnerUnavailable fails the list request without exposing
// the driver error. Only the request correlation is logged.
func respondUserTenantOwnerUnavailable(c *gin.Context) {
	logger.LogError(c.Request.Context(), common.LogText("user list tenant owner read failed (request_id=%s): database error", c.GetString(common.RequestIdKey)))
	common.ApiErrorStatus(c, http.StatusServiceUnavailable, common.NewMessage("Database error, please contact the administrator"))
}
