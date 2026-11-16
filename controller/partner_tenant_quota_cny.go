package controller

import (
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// Additive quota_cny display wrappers of the three merchant quota entries.
//
// Every wrapper is built only after the original business read has succeeded
// and committed, from the quota snapshot that read already authorized. Nothing
// here queries a credential, another subscription or the database, and the
// existing fields keep their names, values and JSON types. quota_cny is a
// display equivalent of quota under the current configuration; it is not a
// wallet balance, a plan price or a billing fact.

// The embedded model DTO keeps its exact decimal-string quota fields and its
// api_key rule; only quota_cny is appended. The converter receives quota and
// entitlement facts only, never this response or its api_key.
type partnerTenantIndependentSubscriptionView struct {
	*model.PartnerTenantIndependentSubscription
	QuotaCNY service.PartnerTenantSubscriptionQuotaCNY `json:"quota_cny"`
}

func newPartnerTenantIndependentSubscriptionView(c *gin.Context, result *model.PartnerTenantIndependentSubscription) partnerTenantIndependentSubscriptionView {
	quota := &result.Quota
	projection := service.CurrentPartnerTenantQuotaCNYConfig().Subscription(service.PartnerTenantQuotaCNYSubscriptionFacts{
		Total:               quota.Total,
		Used:                quota.Used,
		Remaining:           quota.Remaining,
		HistoricalRemaining: quota.HistoricalRemaining,
		Unlimited:           quota.Unlimited,
		Active:              result.Subscription.Status == "active",
		Usable:              quota.Usable,
	})
	logPartnerTenantQuotaCNYInvalidQuota(c, "subscription", result.Subscription.Id, projection.Reason)
	return partnerTenantIndependentSubscriptionView{PartnerTenantIndependentSubscription: result, QuotaCNY: projection}
}

// Hosted H5 items are active-only and keep their int64 JSON numbers. The legacy
// item has no usable field, so usable applies the independent query's quota
// rule to the same raw integers: active and (unlimited or a positive raw
// remaining quota). It is a subscription-level quota fact only: this entry has
// never validated the account's User or model Key state (the independent query
// fails closed on those instead) and no read is added here to do so.
func partnerTenantHostedQuotaCNY(c *gin.Context, config service.PartnerTenantQuotaCNYConfig, item *partnerTenantSubscriptionQuota) service.PartnerTenantSubscriptionQuotaCNY {
	active := item.Status == "active"
	projection := config.Subscription(service.PartnerTenantQuotaCNYSubscriptionFacts{
		Total:     strconv.FormatInt(item.QuotaTotal, 10),
		Used:      strconv.FormatInt(item.QuotaUsed, 10),
		Remaining: strconv.FormatInt(item.QuotaRemain, 10),
		Unlimited: item.QuotaUnlimited,
		Active:    active,
		Usable:    active && (item.QuotaUnlimited || item.QuotaRemain > 0),
	})
	logPartnerTenantQuotaCNYInvalidQuota(c, "hosted_quota", item.PlanID, projection.Reason)
	return projection
}

// Merchant-only catalog item. The shared SubscriptionPlan JSON shape and GORM
// model are untouched: total_amount stays an int64 JSON number and the real
// price/currency are unchanged. A plan has no usage, so quota_cny carries the
// total only.
type partnerTenantCatalogPlanView struct {
	model.SubscriptionPlan
	QuotaCNY service.PartnerTenantCatalogQuotaCNY `json:"quota_cny"`
}

func newPartnerTenantCatalogPlanViews(c *gin.Context, plans []model.SubscriptionPlan) []partnerTenantCatalogPlanView {
	config := service.CurrentPartnerTenantQuotaCNYConfig()
	views := make([]partnerTenantCatalogPlanView, 0, len(plans))
	for i := range plans {
		projection := config.Catalog(plans[i].TotalAmount)
		logPartnerTenantQuotaCNYInvalidQuota(c, "catalog", plans[i].Id, projection.Reason)
		views = append(views, partnerTenantCatalogPlanView{SubscriptionPlan: plans[i], QuotaCNY: projection})
	}
	return views
}

// An invalid stored quota is reported as unavailable, never repaired. Only a
// fixed entry name, a numeric identifier, the bounded reason and the request
// correlation are logged. An invalid conversion configuration is visible in
// the response itself and is not logged per request.
func logPartnerTenantQuotaCNYInvalidQuota(c *gin.Context, entry string, id int, reason string) {
	if reason != service.PartnerTenantQuotaCNYReasonInvalidQuota {
		return
	}
	logger.LogWarn(c.Request.Context(), common.LogText("partner tenant quota_cny unavailable (request_id=%s): entry=%s id=%d reason=%s", c.GetString(common.RequestIdKey), entry, id, reason))
}
