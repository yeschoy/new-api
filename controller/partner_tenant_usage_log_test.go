package controller

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"sort"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func partnerTenantUsageLogJSONKeys(object map[string]json.RawMessage) []string {
	names := make([]string, 0, len(object))
	for name := range object {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func partnerTenantUsageLogParse(t *testing.T, rawQuery string, paging bool) (model.PartnerTenantUsageFilter, int, int, bool) {
	t.Helper()
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodGet, "/fixture?"+rawQuery, nil)
	return parsePartnerTenantUsageLogQuery(c, paging)
}

// Pure strict-parser contract shared by the list and the statistics endpoint
// (no database): rejection happens before any query can run.
func TestPartnerTenantUsageLogQueryParser(t *testing.T) {
	gin.SetMode(gin.TestMode)
	maxRange := operation_setting.GetLogSetting().MaxRangeSeconds()
	now := common.GetTimestamp()
	start, end := now-3600, now-60

	filter, page, pageSize, ok := partnerTenantUsageLogParse(t, "", true)
	require.True(t, ok)
	require.Equal(t, 1, page)
	wantPageSize := common.ItemsPerPage
	if wantPageSize < 1 || wantPageSize > 100 {
		wantPageSize = 100
	}
	require.Equal(t, wantPageSize, pageSize)
	require.Equal(t, model.LogTypeUnknown, filter.Type)
	require.InDelta(t, now, filter.EndTimestamp, 5, "an omitted end is the current time")
	require.InDelta(t, filter.EndTimestamp-maxRange, filter.StartTimestamp, 2, "an omitted start reaches back the maximum range")
	require.Zero(t, filter.TenantId)

	full := fmt.Sprintf("tenant_id=9007199254740993&user_id=9223372036854775807&username=member&model_name=model-a&request_id=req-1&type=consume&start_timestamp=%d&end_timestamp=%d&p=2&page_size=100", start, end)
	filter, page, pageSize, ok = partnerTenantUsageLogParse(t, full, true)
	require.True(t, ok)
	require.Equal(t, model.PartnerTenantUsageFilter{
		TenantId: 9007199254740993, UserId: 9223372036854775807, Username: "member", ModelName: "model-a", RequestId: "req-1",
		Type: model.LogTypeConsume, StartTimestamp: start, EndTimestamp: end,
	}, filter)
	require.Equal(t, 2, page)
	require.Equal(t, 100, pageSize)

	filter, _, _, ok = partnerTenantUsageLogParse(t, "type=error&username=&start_timestamp=0&end_timestamp=0", false)
	require.True(t, ok, "empty text and zero bounds are the same as omitted")
	require.Equal(t, model.LogTypeError, filter.Type)
	require.Empty(t, filter.Username)
	require.Positive(t, filter.EndTimestamp)

	// The effective window is reported even when only the end is given.
	filter, _, _, ok = partnerTenantUsageLogParse(t, fmt.Sprintf("end_timestamp=%d", end), false)
	require.True(t, ok)
	require.Equal(t, end, filter.EndTimestamp)
	require.Equal(t, max(end-maxRange, 0), filter.StartTimestamp)

	invalid := []string{
		"unknown=1", "group=x", "token_name=x", "channel=1", "upstream_request_id=x", "types=2", "selected_id=1", "q=x",
		"tenant_id=1&tenant_id=2", "type=consume&type=error", "username=a&username=a",
		"tenant_id=", "tenant_id=0", "tenant_id=01", "tenant_id=%2B1", "tenant_id=-1", "tenant_id=9223372036854775808", "tenant_id=1.0", "tenant_id=abc", "tenant_id=%201",
		"user_id=", "user_id=0", "user_id=1e3", "user_id=0x10", "user_id=99999999999999999999",
		"type=", "type=2", "type=Consume", "type=consume,error", "type=refund",
		"start_timestamp=", "start_timestamp=-1", "start_timestamp=01", "start_timestamp=1e3", "start_timestamp=1.5", "end_timestamp=", "end_timestamp=%205", "end_timestamp=9223372036854775808",
		fmt.Sprintf("start_timestamp=%d&end_timestamp=%d", end+1, end),
		fmt.Sprintf("start_timestamp=%d&end_timestamp=%d", now-maxRange-3600, now),
		fmt.Sprintf("start_timestamp=%d", now-maxRange-3600),
		fmt.Sprintf("start_timestamp=%d", now+3600),
		"p=0", "p=01", "p=-1", "p=1000001", "p=", "page_size=0", "page_size=101", "page_size=", "page_size=1.0",
		"username=%00", "username=a%0Ab", "username=%FF", "model_name=%7F", "request_id=%1B",
		"username=" + strings.Repeat("a", 192), "model_name=" + strings.Repeat("a", 256), "request_id=" + strings.Repeat("a", 65),
		"tenant_id=%zz", "a=1;b=2",
	}
	for _, rawQuery := range invalid {
		_, _, _, ok := partnerTenantUsageLogParse(t, rawQuery, true)
		require.False(t, ok, "%q must be rejected", rawQuery)
	}
	for _, rawQuery := range []string{"p=1", "page_size=10", "p=1&page_size=10", "tenant_id=1&p=1"} {
		_, _, _, ok := partnerTenantUsageLogParse(t, rawQuery, false)
		require.False(t, ok, "paging is unknown to the statistics: %q", rawQuery)
		_, _, _, ok = partnerTenantUsageLogParse(t, rawQuery, true)
		require.True(t, ok, "paging is known to the list: %q", rawQuery)
	}
	for _, rawQuery := range []string{
		"username=" + strings.Repeat("a", 191), "model_name=" + strings.Repeat("a", 255), "request_id=" + strings.Repeat("a", 64),
		"tenant_id=9223372036854775807", "page_size=1", "p=1000000",
	} {
		_, _, _, ok := partnerTenantUsageLogParse(t, rawQuery, true)
		require.True(t, ok, "%q is within bounds", rawQuery)
	}
}

func TestPartnerTenantUsageLogHTTPContract(t *testing.T) {
	db := setupPartnerTenantUsageHTTPPQ(t, "pt_usage_log_http_")
	gin.SetMode(gin.TestMode)
	oldLog, oldCache, oldUnit, oldRate := model.LOG_DB, common.MemoryCacheEnabled, common.QuotaPerUnit, operation_setting.USDExchangeRate
	model.LOG_DB = db
	common.MemoryCacheEnabled = false
	t.Cleanup(func() {
		model.LOG_DB, common.MemoryCacheEnabled = oldLog, oldCache
		common.QuotaPerUnit, operation_setting.USDExchangeRate = oldUnit, oldRate
	})
	require.NoError(t, model.MigratePartnerTenantUsageLogs())
	require.NoError(t, db.AutoMigrate(&model.Log{}))
	// Three raw units per CNY: one unit is 0.333333, three units are 1.000000.
	common.QuotaPerUnit, operation_setting.USDExchangeRate = 3, 1

	const beyondFloat = int64(1)<<53 + 1
	now := common.GetTimestamp()
	other := `{"billing_source":"subscription","admin_info":{"note":"admin-only"},"root_info":{"note":"root-only"}}`
	seed := func(row model.PartnerTenantUsageLog) {
		t.Helper()
		require.NoError(t, db.Create(&row).Error)
	}
	seed(model.PartnerTenantUsageLog{Id: beyondFloat, EventId: "ptu_http_1", CreatedAt: now - 300, Type: model.LogTypeConsume, TenantId: beyondFloat + 2, AccountId: beyondFloat + 4, TenantName: "Frozen Name", IdentitySource: model.PartnerTenantIdentitySubscriptionKey,
		UserId: beyondFloat + 6, Username: "member", ModelName: "model-a", Quota: 1, PromptTokens: beyondFloat + 8, CompletionTokens: beyondFloat + 10, UseTime: 4, IsStream: true, TokenId: beyondFloat + 12, TokenName: "key", Group: "g", Ip: "203.0.113.9",
		RequestId: "http-1", UpstreamRequestId: "up-1", SubscriptionId: beyondFloat + 14, Content: "recorded", Other: other})
	seed(model.PartnerTenantUsageLog{EventId: "ptu_http_2", CreatedAt: now - 200, Type: model.LogTypeConsume, TenantId: beyondFloat + 2, AccountId: 1, UserId: 2, Quota: 1, RequestId: "http-2"})
	seed(model.PartnerTenantUsageLog{EventId: "ptu_http_3", CreatedAt: now - 100, Type: model.LogTypeConsume, TenantId: beyondFloat + 2, AccountId: 1, UserId: 2, Quota: 1, RequestId: "http-3"})
	seed(model.PartnerTenantUsageLog{EventId: "ptu_http_4", CreatedAt: now - 90, Type: model.LogTypeError, TenantId: beyondFloat + 2, AccountId: 1, UserId: 2, RequestId: "http-3", Content: "failed"})
	// The default table must never be read.
	require.NoError(t, db.Create(&model.Log{UserId: 2, CreatedAt: now - 100, Type: model.LogTypeConsume, Quota: 999, RequestId: "http-default"}).Error)

	failing := false
	cause := errors.New("forced usage failure " + partnerTenantUsageHTTPSecretMarker)
	require.NoError(t, db.Callback().Query().Before("gorm:query").Register("pt_usage_log_http_probe", func(tx *gorm.DB) {
		if failing {
			_ = tx.AddError(cause)
		}
	}))
	require.NoError(t, db.Callback().Row().Before("gorm:row").Register("pt_usage_log_http_row_probe", func(tx *gorm.DB) {
		if failing {
			_ = tx.AddError(cause)
		}
	}))
	t.Cleanup(func() {
		_ = db.Callback().Query().Remove("pt_usage_log_http_probe")
		_ = db.Callback().Row().Remove("pt_usage_log_http_row_probe")
	})
	var serverLog bytes.Buffer
	common.LogWriterMu.Lock()
	previousWriter := gin.DefaultErrorWriter
	gin.DefaultErrorWriter = &serverLog
	common.LogWriterMu.Unlock()
	t.Cleanup(func() {
		common.LogWriterMu.Lock()
		gin.DefaultErrorWriter = previousWriter
		common.LogWriterMu.Unlock()
	})

	role := common.RoleAdminUser
	engine := gin.New()
	// Projection and validation only; the production gates are asserted on the
	// real SetApiRouter registration in package router.
	engine.Use(func(c *gin.Context) {
		c.Set(common.RequestIdKey, "usage-log-fixture")
		c.Set("role", role)
		c.Next()
	})
	engine.GET("/list", GetPartnerTenantUsageLogs)
	engine.GET("/stat", GetPartnerTenantUsageLogStat)
	window := fmt.Sprintf("start_timestamp=%d&end_timestamp=%d&tenant_id=%d", now-3600, now, beyondFloat+2)
	get := func(target string) *httptest.ResponseRecorder {
		t.Helper()
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, httptest.NewRequest(http.MethodGet, target, nil))
		require.Contains(t, response.Header().Get("Cache-Control"), "no-store", target)
		require.NotContains(t, response.Body.String(), partnerTenantUsageHTTPSecretMarker)
		return response
	}
	data := func(response *httptest.ResponseRecorder) map[string]json.RawMessage {
		t.Helper()
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
		var envelope struct {
			Success bool                       `json:"success"`
			Data    map[string]json.RawMessage `json:"data"`
		}
		require.NoError(t, json.Unmarshal(response.Body.Bytes(), &envelope))
		require.True(t, envelope.Success)
		return envelope.Data
	}
	items := func(page map[string]json.RawMessage) []map[string]json.RawMessage {
		t.Helper()
		var list []map[string]json.RawMessage
		require.NoError(t, json.Unmarshal(page["items"], &list))
		return list
	}
	text := func(raw json.RawMessage) string {
		t.Helper()
		var value string
		require.NoError(t, json.Unmarshal(raw, &value), "expected a JSON string, got %s", raw)
		return value
	}

	stringFields := []string{"id", "tenant_id", "account_id", "user_id", "token_id", "channel_id", "subscription_id", "quota", "prompt_tokens", "completion_tokens",
		"event_id", "tenant_name", "identity_source", "username", "token_name", "model_name", "channel_name", "group", "ip", "request_id", "upstream_request_id", "content", "other"}
	allFields := append([]string{"created_at", "type", "use_time", "is_stream", "quota_cny"}, stringFields...)
	sort.Strings(allFields)

	page := data(get("/list?" + window))
	require.Equal(t, []string{"end_timestamp", "items", "page", "page_size", "start_timestamp", "total"}, partnerTenantUsageLogJSONKeys(page))
	require.Equal(t, "4", string(page["total"]), "total is a JSON number of rows")
	require.Equal(t, strconv.FormatInt(now-3600, 10), string(page["start_timestamp"]))
	require.Equal(t, strconv.FormatInt(now, 10), string(page["end_timestamp"]))
	list := items(page)
	require.Len(t, list, 4)
	for _, item := range list {
		require.Equal(t, allFields, partnerTenantUsageLogJSONKeys(item), "an item is exactly the frozen field set")
		for _, field := range stringFields {
			text(item[field])
		}
		for _, field := range []string{"created_at", "type", "use_time"} {
			var number int64
			require.NoError(t, json.Unmarshal(item[field], &number), field)
			require.NotContains(t, string(item[field]), `"`, field)
		}
		require.Contains(t, []string{"true", "false"}, string(item["is_stream"]))
	}
	require.Equal(t, "ptu_http_4", text(list[0]["event_id"]), "newest first")
	require.Equal(t, "5", string(list[0]["type"]))
	require.Equal(t, "0", text(list[0]["quota"]))
	require.Equal(t, "0.000000", text(list[0]["quota_cny"]))
	require.Empty(t, text(list[0]["subscription_id"]), "an unknown subscription is the empty string")
	first := list[3]
	require.Equal(t, "ptu_http_1", text(first["event_id"]))
	for field, want := range map[string]int64{"id": beyondFloat, "tenant_id": beyondFloat + 2, "account_id": beyondFloat + 4, "user_id": beyondFloat + 6,
		"prompt_tokens": beyondFloat + 8, "completion_tokens": beyondFloat + 10, "token_id": beyondFloat + 12, "subscription_id": beyondFloat + 14} {
		require.Equal(t, strconv.FormatInt(want, 10), text(first[field]), field)
	}
	require.Equal(t, "Frozen Name", text(first["tenant_name"]))
	require.Equal(t, "0", text(first["channel_id"]))
	require.Equal(t, "2", string(first["type"]))
	require.Equal(t, "true", string(first["is_stream"]))
	require.Equal(t, "0.333333", text(first["quota_cny"]))
	adminOther := text(first["other"])
	require.Contains(t, adminOther, "admin-only")
	require.NotContains(t, adminOther, "root-only")

	role = common.RoleRootUser
	rootOther := text(items(data(get("/list?" + window)))[3]["other"])
	require.Contains(t, rootOther, "root-only", "root keeps the root projection, as on the default logs")
	role = common.RoleAdminUser

	// Paging uses the same filter: two pages of two, no overlap.
	seen := map[string]bool{}
	for p := 1; p <= 2; p++ {
		pageItems := items(data(get(fmt.Sprintf("/list?%s&p=%d&page_size=2", window, p))))
		require.Len(t, pageItems, 2)
		for _, item := range pageItems {
			seen[text(item["event_id"])] = true
		}
	}
	require.Len(t, seen, 4)

	stat := data(get("/stat?" + window))
	require.Equal(t, []string{"completion_tokens", "end_timestamp", "failed_count", "prompt_tokens", "quota", "quota_cny", "record_count", "request_count", "start_timestamp", "succeeded_count", "tokens"}, partnerTenantUsageLogJSONKeys(stat))
	require.Equal(t, "4", text(stat["record_count"]), "record_count equals the list total")
	require.Equal(t, "3", text(stat["request_count"]), "the failed attempt and its consume row fold")
	require.Equal(t, "3", text(stat["succeeded_count"]))
	require.Equal(t, "0", text(stat["failed_count"]))
	require.Equal(t, "3", text(stat["quota"]))
	require.Equal(t, strconv.FormatInt(beyondFloat+8, 10), text(stat["prompt_tokens"]))
	require.Equal(t, strconv.FormatInt(beyondFloat+10, 10), text(stat["completion_tokens"]))
	require.Equal(t, strconv.FormatInt(2*beyondFloat+18, 10), text(stat["tokens"]))
	var cny map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(stat["quota_cny"], &cny))
	require.Equal(t, []string{"amount", "available", "currency", "quota_per_unit", "rounding", "scale", "usd_to_cny_rate"}, partnerTenantUsageLogJSONKeys(cny))
	require.Equal(t, "1.000000", text(cny["amount"]), "summed first, converted once: not 3 x 0.333333 = 0.999999")
	require.Equal(t, "true", string(cny["available"]))
	require.Equal(t, "CNY", text(cny["currency"]))
	require.Equal(t, "3", text(cny["quota_per_unit"]))
	require.Equal(t, "1", text(cny["usd_to_cny_rate"]))
	require.Equal(t, "6", string(cny["scale"]))

	// An invalid conversion configuration: amounts are null, never zero, while
	// the raw facts and HTTP 200 remain.
	common.QuotaPerUnit = 0
	require.Equal(t, "null", string(items(data(get("/list?" + window)))[3]["quota_cny"]))
	stat = data(get("/stat?" + window))
	require.Equal(t, "3", text(stat["quota"]))
	require.NoError(t, json.Unmarshal(stat["quota_cny"], &cny))
	require.Equal(t, "null", string(cny["amount"]))
	require.Equal(t, "false", string(cny["available"]))
	require.Equal(t, "invalid_conversion_config", text(cny["reason"]))
	require.Equal(t, "null", string(cny["quota_per_unit"]))
	common.QuotaPerUnit = 3

	// A summed quota above the signed 64-bit range stays exact through the HTTP
	// layer, and its amount is converted once from that exact sum.
	for i := range 2 {
		seed(model.PartnerTenantUsageLog{EventId: fmt.Sprintf("ptu_http_big_%d", i), CreatedAt: now - 50, Type: model.LogTypeConsume, TenantId: 77, AccountId: 1, UserId: 2, Quota: math.MaxInt64, RequestId: fmt.Sprintf("http-big-%d", i)})
	}
	stat = data(get(fmt.Sprintf("/stat?start_timestamp=%d&end_timestamp=%d&tenant_id=77", now-3600, now)))
	require.Equal(t, "2", text(stat["record_count"]))
	require.Equal(t, "18446744073709551614", text(stat["quota"]), "2 x MaxInt64 is above the int64 range")
	cny = map[string]json.RawMessage{}
	require.NoError(t, json.Unmarshal(stat["quota_cny"], &cny))
	require.Equal(t, "6148914691236517204.666667", text(cny["amount"]), "the exact sum divided by 3, rounded once")

	// Strict rejection through the handlers, before any query.
	for _, target := range []string{"/stat?p=1", "/stat?page_size=10", "/list?unknown=1", "/list?tenant_id=01", "/list?tenant_id=1&tenant_id=1", "/stat?type=2",
		fmt.Sprintf("/list?start_timestamp=%d&end_timestamp=%d", now, now-1)} {
		response := get(target)
		require.Equal(t, http.StatusBadRequest, response.Code, target)
		require.NotContains(t, response.Body.String(), `"items"`)
	}

	// A database failure is a bounded 503: no driver text in the body or log.
	failing = true
	for _, target := range []string{"/list?" + window, "/stat?" + window} {
		response := get(target)
		require.Equal(t, http.StatusServiceUnavailable, response.Code, target)
		require.NotContains(t, response.Body.String(), "forced usage failure")
	}
	failing = false
	require.Contains(t, serverLog.String(), "usage-log-fixture", "the failure is logged with the request correlation")
	require.NotContains(t, serverLog.String(), partnerTenantUsageHTTPSecretMarker)
	require.NotContains(t, serverLog.String(), "forced usage failure")
	require.NotContains(t, serverLog.String(), "recorded")
}
