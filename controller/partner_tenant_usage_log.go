package controller

import (
	"errors"
	"math/big"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

const (
	partnerTenantUsageLogMaxPageSize = 100
	partnerTenantUsageLogMaxPage     = 1000000
	// Byte bounds of the exact-match text filters.
	partnerTenantUsageLogMaxUsernameBytes  = 191
	partnerTenantUsageLogMaxModelNameBytes = 255
	partnerTenantUsageLogMaxRequestIdBytes = 64
)

// partnerTenantUsageLogView is the complete administrator shape of one stored
// usage event. Identifiers, quota and token counts are decimal text so 64-bit
// values survive JavaScript clients. It is never the persisted model.
type partnerTenantUsageLogView struct {
	ID                string  `json:"id"`
	EventID           string  `json:"event_id"`
	CreatedAt         int64   `json:"created_at"`
	Type              int     `json:"type"`
	TenantID          string  `json:"tenant_id"`
	TenantName        string  `json:"tenant_name"`
	AccountID         string  `json:"account_id"`
	IdentitySource    string  `json:"identity_source"`
	UserID            string  `json:"user_id"`
	Username          string  `json:"username"`
	TokenID           string  `json:"token_id"`
	TokenName         string  `json:"token_name"`
	ModelName         string  `json:"model_name"`
	ChannelID         string  `json:"channel_id"`
	ChannelName       string  `json:"channel_name"`
	Group             string  `json:"group"`
	Ip                string  `json:"ip"`
	RequestID         string  `json:"request_id"`
	UpstreamRequestID string  `json:"upstream_request_id"`
	SubscriptionID    string  `json:"subscription_id"`
	Quota             string  `json:"quota"`
	QuotaCNY          *string `json:"quota_cny"`
	PromptTokens      string  `json:"prompt_tokens"`
	CompletionTokens  string  `json:"completion_tokens"`
	UseTime           int64   `json:"use_time"`
	IsStream          bool    `json:"is_stream"`
	Content           string  `json:"content"`
	Other             string  `json:"other"`
}

type partnerTenantUsageLogPage struct {
	Page     int                         `json:"page"`
	PageSize int                         `json:"page_size"`
	Total    int64                       `json:"total"`
	Items    []partnerTenantUsageLogView `json:"items"`
	// The effective inclusive window the page was read from.
	StartTimestamp int64 `json:"start_timestamp"`
	EndTimestamp   int64 `json:"end_timestamp"`
}

// partnerTenantUsageStatCNY is the converter metadata plus the amount of the
// summed raw quota. Amount is null whenever the conversion is unavailable.
type partnerTenantUsageStatCNY struct {
	Currency     string  `json:"currency"`
	Available    bool    `json:"available"`
	Reason       string  `json:"reason,omitempty"`
	QuotaPerUnit *string `json:"quota_per_unit"`
	USDToCNYRate *string `json:"usd_to_cny_rate"`
	Scale        int     `json:"scale"`
	Rounding     string  `json:"rounding"`
	Amount       *string `json:"amount"`
}

type partnerTenantUsageStatView struct {
	RecordCount      string                    `json:"record_count"`
	RequestCount     string                    `json:"request_count"`
	SucceededCount   string                    `json:"succeeded_count"`
	FailedCount      string                    `json:"failed_count"`
	Quota            string                    `json:"quota"`
	PromptTokens     string                    `json:"prompt_tokens"`
	CompletionTokens string                    `json:"completion_tokens"`
	Tokens           string                    `json:"tokens"`
	QuotaCNY         partnerTenantUsageStatCNY `json:"quota_cny"`
	StartTimestamp   int64                     `json:"start_timestamp"`
	EndTimestamp     int64                     `json:"end_timestamp"`
}

// parseCanonicalNonNegativeInt64 accepts only the canonical decimal text of a
// non-negative signed 64-bit integer.
func parseCanonicalNonNegativeInt64(raw string) (int64, bool) {
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value < 0 || strconv.FormatInt(value, 10) != raw {
		return 0, false
	}
	return value, true
}

func validPartnerTenantUsageLogText(value string, maxBytes int) bool {
	return len(value) <= maxBytes && utf8.ValidString(value) && !strings.ContainsFunc(value, unicode.IsControl)
}

// parsePartnerTenantUsageLogQuery is the strict parser shared by the list and
// the statistics endpoint: every parameter is optional and may appear at most
// once; anything unknown, repeated, malformed, non-canonical or out of range
// is rejected before any query runs. Paging parameters are known only to the
// list. The returned filter carries the effective bounded window.
func parsePartnerTenantUsageLogQuery(c *gin.Context, paging bool) (filter model.PartnerTenantUsageFilter, page int, pageSize int, ok bool) {
	query, err := url.ParseQuery(c.Request.URL.RawQuery)
	if err != nil {
		return filter, 0, 0, false
	}
	for key, values := range query {
		switch key {
		case "tenant_id", "user_id", "username", "model_name", "request_id", "type", "start_timestamp", "end_timestamp":
		case "p", "page_size":
			if !paging {
				return filter, 0, 0, false
			}
		default:
			return filter, 0, 0, false
		}
		if len(values) != 1 {
			return filter, 0, 0, false
		}
	}
	page, pageSize = 1, common.ItemsPerPage
	if pageSize < 1 || pageSize > partnerTenantUsageLogMaxPageSize {
		pageSize = partnerTenantUsageLogMaxPageSize
	}
	if query.Has("p") {
		value, valid := parseCanonicalPositiveInt64(query.Get("p"))
		if !valid || value > partnerTenantUsageLogMaxPage {
			return filter, 0, 0, false
		}
		page = int(value)
	}
	if query.Has("page_size") {
		value, valid := parseCanonicalPositiveInt64(query.Get("page_size"))
		if !valid || value > partnerTenantUsageLogMaxPageSize {
			return filter, 0, 0, false
		}
		pageSize = int(value)
	}
	if query.Has("tenant_id") {
		if filter.TenantId, ok = parseCanonicalPositiveInt64(query.Get("tenant_id")); !ok {
			return filter, 0, 0, false
		}
	}
	if query.Has("user_id") {
		if filter.UserId, ok = parseCanonicalPositiveInt64(query.Get("user_id")); !ok {
			return filter, 0, 0, false
		}
	}
	filter.Username = query.Get("username")
	filter.ModelName = query.Get("model_name")
	filter.RequestId = query.Get("request_id")
	if !validPartnerTenantUsageLogText(filter.Username, partnerTenantUsageLogMaxUsernameBytes) ||
		!validPartnerTenantUsageLogText(filter.ModelName, partnerTenantUsageLogMaxModelNameBytes) ||
		!validPartnerTenantUsageLogText(filter.RequestId, partnerTenantUsageLogMaxRequestIdBytes) {
		return filter, 0, 0, false
	}
	if query.Has("type") {
		switch query.Get("type") {
		case "consume":
			filter.Type = model.LogTypeConsume
		case "error":
			filter.Type = model.LogTypeError
		default:
			return filter, 0, 0, false
		}
	}
	// Zero is the same as an omitted bound, as for the default log search.
	var start, end int64
	if query.Has("start_timestamp") {
		if start, ok = parseCanonicalNonNegativeInt64(query.Get("start_timestamp")); !ok {
			return filter, 0, 0, false
		}
	}
	if query.Has("end_timestamp") {
		if end, ok = parseCanonicalNonNegativeInt64(query.Get("end_timestamp")); !ok {
			return filter, 0, 0, false
		}
	}
	if start != 0 && end != 0 && start > end {
		return filter, 0, 0, false
	}
	// The statistics scan the window, so it is bounded for every caller.
	effectiveStart, err := limitLogTimeRange(start, end)
	if err != nil {
		// Still a 400, but with the existing bounded-range message: it carries the
		// configured day limit, which a generic "Invalid parameters" would hide.
		c.Set(partnerTenantUsageLogRangeErrorKey, err)
		return filter, 0, 0, false
	}
	effectiveEnd := end
	if effectiveEnd == 0 {
		effectiveEnd = common.GetTimestamp()
	}
	effectiveStart = max(effectiveStart, 0)
	if effectiveStart > effectiveEnd {
		return filter, 0, 0, false
	}
	filter.StartTimestamp, filter.EndTimestamp = effectiveStart, effectiveEnd
	return filter, page, pageSize, true
}

// partnerTenantUsageLogRangeErrorKey carries the over-long window message from
// the strict parser to the 400 response of the same request.
const partnerTenantUsageLogRangeErrorKey = "partner_tenant_usage_log_range_error"

func partnerTenantUsageLogInvalid(c *gin.Context) {
	if value, ok := c.Get(partnerTenantUsageLogRangeErrorKey); ok {
		if rangeErr, ok := value.(error); ok {
			common.ApiErrorStatus(c, http.StatusBadRequest, rangeErr)
			return
		}
	}
	common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
}

// partnerTenantUsageLogUnavailable answers a failed read. Only a fixed text and
// the request correlation are logged: never the driver error, SQL or row data.
func partnerTenantUsageLogUnavailable(c *gin.Context, operation string, err error) {
	if errors.Is(err, model.ErrPartnerTenantUsageLogFilter) {
		partnerTenantUsageLogInvalid(c)
		return
	}
	// A caller that went away (the statistics scan can be long) is not a
	// database failure: answer, but do not raise an error line for it.
	if c.Request.Context().Err() == nil {
		logger.LogError(c.Request.Context(), common.LogText("partner tenant usage %s read failed (request_id=%s): database error", operation, c.GetString(common.RequestIdKey)))
	}
	common.ApiErrorStatus(c, http.StatusServiceUnavailable, common.NewMessage("Database error, please contact the administrator"))
}

func partnerTenantUsageLogID(value int64) string {
	return strconv.FormatInt(value, 10)
}

// GetPartnerTenantUsageLogs serves GET /api/log/partner-tenants: one page of
// the dedicated merchant usage table. It never reads the default logs table.
func GetPartnerTenantUsageLogs(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	filter, page, pageSize, ok := parsePartnerTenantUsageLogQuery(c, true)
	if !ok {
		partnerTenantUsageLogInvalid(c)
		return
	}
	root := c.GetInt("role") >= common.RoleRootUser
	records, total, err := model.ListPartnerTenantUsageLogs(c.Request.Context(), filter, (page-1)*pageSize, pageSize, root)
	if err != nil {
		partnerTenantUsageLogUnavailable(c, "list", err)
		return
	}
	// One conversion snapshot for the whole response.
	cny := service.CurrentPartnerTenantQuotaCNYConfig()
	result := partnerTenantUsageLogPage{
		Page: page, PageSize: pageSize, Total: total,
		Items:          make([]partnerTenantUsageLogView, 0, len(records)),
		StartTimestamp: filter.StartTimestamp, EndTimestamp: filter.EndTimestamp,
	}
	for i := range records {
		record := &records[i]
		view := partnerTenantUsageLogView{
			ID:                partnerTenantUsageLogID(record.Id),
			EventID:           record.EventId,
			CreatedAt:         record.CreatedAt,
			Type:              record.Type,
			TenantID:          partnerTenantUsageLogID(record.TenantId),
			TenantName:        record.TenantName,
			AccountID:         partnerTenantUsageLogID(record.AccountId),
			IdentitySource:    record.IdentitySource,
			UserID:            partnerTenantUsageLogID(record.UserId),
			Username:          record.Username,
			TokenID:           partnerTenantUsageLogID(record.TokenId),
			TokenName:         record.TokenName,
			ModelName:         record.ModelName,
			ChannelID:         partnerTenantUsageLogID(record.ChannelId),
			ChannelName:       record.ChannelName,
			Group:             record.Group,
			Ip:                record.Ip,
			RequestID:         record.RequestId,
			UpstreamRequestID: record.UpstreamRequestId,
			Quota:             partnerTenantUsageLogID(record.Quota),
			PromptTokens:      partnerTenantUsageLogID(record.PromptTokens),
			CompletionTokens:  partnerTenantUsageLogID(record.CompletionTokens),
			UseTime:           record.UseTime,
			IsStream:          record.IsStream,
			Content:           record.Content,
			Other:             record.Other,
		}
		if record.SubscriptionId > 0 {
			view.SubscriptionID = partnerTenantUsageLogID(record.SubscriptionId)
		}
		if amount, available := cny.AmountInt64(record.Quota); available {
			view.QuotaCNY = &amount
		}
		result.Items = append(result.Items, view)
	}
	common.ApiSuccess(c, result)
}

// GetPartnerTenantUsageLogStat serves GET /api/log/partner-tenants/stat: the
// aggregates of exactly the rows the same filter selects in the list.
func GetPartnerTenantUsageLogStat(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	filter, _, _, ok := parsePartnerTenantUsageLogQuery(c, false)
	if !ok {
		partnerTenantUsageLogInvalid(c)
		return
	}
	stat, err := model.GetPartnerTenantUsageStat(c.Request.Context(), filter)
	if err != nil {
		partnerTenantUsageLogUnavailable(c, "stat", err)
		return
	}
	cny := service.CurrentPartnerTenantQuotaCNYConfig()
	metadata := cny.Metadata()
	result := partnerTenantUsageStatView{
		RecordCount:      strconv.FormatInt(stat.RecordCount, 10),
		RequestCount:     strconv.FormatInt(stat.RequestCount, 10),
		SucceededCount:   strconv.FormatInt(stat.SucceededCount, 10),
		FailedCount:      strconv.FormatInt(stat.FailedCount, 10),
		Quota:            stat.Quota.String(),
		PromptTokens:     stat.PromptTokens.String(),
		CompletionTokens: stat.CompletionTokens.String(),
		Tokens:           new(big.Int).Add(stat.PromptTokens, stat.CompletionTokens).String(),
		QuotaCNY: partnerTenantUsageStatCNY{
			Currency:     metadata.Currency,
			Available:    metadata.Available,
			Reason:       metadata.Reason,
			QuotaPerUnit: metadata.QuotaPerUnit,
			USDToCNYRate: metadata.USDToCNYRate,
			Scale:        metadata.Scale,
			Rounding:     metadata.Rounding,
		},
		StartTimestamp: filter.StartTimestamp,
		EndTimestamp:   filter.EndTimestamp,
	}
	// The raw quota is summed first and converted once; rounded per-row
	// amounts are never added up.
	if amount, available := cny.AmountDecimal(decimal.NewFromBigInt(stat.Quota, 0)); available {
		result.QuotaCNY.Amount = &amount
	} else if result.QuotaCNY.Available {
		// A valid configuration that still cannot render this sum: say so
		// instead of leaving an available projection without an amount.
		result.QuotaCNY.Available = false
		result.QuotaCNY.Reason = service.PartnerTenantQuotaCNYReasonInvalidQuota
	}
	common.ApiSuccess(c, result)
}
