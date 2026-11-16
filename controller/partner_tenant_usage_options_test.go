package controller

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

// A recognisable credential marker seeded into every secret-bearing or
// non-public tenant column. No response body or server log may contain it.
const partnerTenantUsageHTTPSecretMarker = "PTUSAGEHTTPSECRETMARKER"

func partnerTenantUsageHTTPMarkerHash(index int) string {
	return fmt.Sprintf("%s%0*d", partnerTenantUsageHTTPSecretMarker, 64-len(partnerTenantUsageHTTPSecretMarker), index)
}

// Task-owned PostgreSQL only: a unique retained pt_usage_ schema, no SQLite,
// no drop/truncate. A missing DSN fails the test; it is never a pass.
func setupPartnerTenantUsageHTTPPQ(t *testing.T, prefix string) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("TEST_PARTNER_USAGE_POSTGRES_DSN")
	require.NotEmpty(t, dsn, "BLOCKED: explicit task-owned Docker/pq DSN required; no SQLite/MySQL/production substitute")
	require.True(t, strings.HasPrefix(prefix, "pt_usage_"), "usage fixtures own the pt_usage_ schema prefix")
	cfg, err := pgx.ParseConfig(dsn)
	require.NoError(t, err)
	cfg.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	base := stdlib.OpenDB(*cfg)
	schema := fmt.Sprintf("%s%d", prefix, time.Now().UnixNano())
	_, err = base.Exec("CREATE SCHEMA " + schema)
	require.NoError(t, err)
	require.NoError(t, base.Close())
	cfg.RuntimeParams["search_path"] = schema
	cfg.RuntimeParams["application_name"] = schema
	conn := stdlib.OpenDB(*cfg)
	db, err := gorm.Open(postgres.New(postgres.Config{Conn: conn, PreferSimpleProtocol: true}), &gorm.Config{Logger: gormlogger.Default.LogMode(gormlogger.Silent)})
	require.NoError(t, err)
	oldDB, mainType, logType, redis := model.DB, common.MainDatabaseType(), common.LogDatabaseType(), common.RedisEnabled
	model.DB = db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	common.RedisEnabled = false
	t.Cleanup(func() {
		model.DB = oldDB
		common.SetDatabaseTypes(mainType, logType)
		common.RedisEnabled = redis
		_ = conn.Close()
	})
	t.Logf("Retained task-owned schema: %s (no drop)", schema)
	// Only partner_tenants exists in this schema: the options projection cannot
	// depend on accounts, users, tokens or any credential table.
	require.NoError(t, model.MigratePartnerTenantIntegrationModes(db))
	return db
}

// Pure parser contract (no database). The authorization-log tenant filter and
// the options endpoint share this single implementation.
func TestPartnerTenantUsageCanonicalIDParser(t *testing.T) {
	for raw, want := range map[string]int64{
		"1":                   1,
		"42":                  42,
		"9007199254740993":    9007199254740993,
		"9223372036854775807": 9223372036854775807,
	} {
		got, ok := parseCanonicalPositiveInt64(raw)
		require.True(t, ok, raw)
		require.Equal(t, want, got, raw)
	}
	for _, raw := range []string{"", "0", "-1", "+1", "01", "1.0", "1e3", "0x10", " 1", "1 ", "１", "9223372036854775808", "99999999999999999999", "abc", "1,2"} {
		got, ok := parseCanonicalPositiveInt64(raw)
		require.False(t, ok, "%q", raw)
		require.Zero(t, got, "%q", raw)
	}
}

func TestPartnerTenantUsageOptionsHTTPProjection(t *testing.T) {
	db := setupPartnerTenantUsageHTTPPQ(t, "pt_usage_options_http_")
	gin.SetMode(gin.TestMode)

	const ordinaryCount = 23
	tenants := make([]*model.PartnerTenant, 0, ordinaryCount)
	for i := range ordinaryCount {
		mode := model.PartnerTenantIntegrationSubscriptionKey
		if i%2 == 0 {
			mode = model.PartnerTenantIntegrationHostedH5
		}
		tenant, _, err := model.CreatePartnerTenantWithIntegrationMode(fmt.Sprintf("Usage Merchant %02d", i), fmt.Sprintf("%s-group-%02d", partnerTenantUsageHTTPSecretMarker, i), mode)
		require.NoError(t, err)
		require.NoError(t, db.Model(&model.PartnerTenant{}).Where("id = ?", tenant.Id).Update("secret_hash", partnerTenantUsageHTTPMarkerHash(i)).Error)
		tenants = append(tenants, tenant)
	}
	require.NoError(t, model.UpdatePartnerTenantStatus(tenants[0].Id, model.PartnerTenantStatusDisabled))
	// Larger than 2^53 and disabled: must stay exact and visible.
	large := &model.PartnerTenant{Id: 9007199254740993, IntegrationMode: model.PartnerTenantIntegrationSubscriptionKey, Name: "Usage Large", Group: partnerTenantUsageHTTPSecretMarker + "-group-large", SecretHash: partnerTenantUsageHTTPMarkerHash(999), Status: model.PartnerTenantStatusDisabled}
	require.NoError(t, db.Create(large).Error)
	const total = ordinaryCount + 1

	queries := 0
	failFrom := -1 // fail every query whose zero-based index within one request is >= failFrom
	cause := errors.New("forced options failure " + partnerTenantUsageHTTPSecretMarker)
	require.NoError(t, db.Callback().Query().Before("gorm:query").Register("pt_usage_http_probe", func(tx *gorm.DB) {
		if failFrom >= 0 && queries >= failFrom {
			_ = tx.AddError(cause)
		}
		queries++
	}))
	t.Cleanup(func() { _ = db.Callback().Query().Remove("pt_usage_http_probe") })

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

	engine := gin.New()
	engine.Use(func(c *gin.Context) { c.Set(common.RequestIdKey, "usage-options-fixture"); c.Next() })
	// Projection and validation only. The production gates (AdminAuth and the
	// explicit PAT scopes) are asserted on the real SetApiRouter registration
	// in package router; these test-only mounts do not replace them.
	engine.GET("/log-options", GetPartnerTenantOptions)
	engine.GET("/user-options", GetPartnerTenantOptions)
	get := func(target string) *httptest.ResponseRecorder {
		t.Helper()
		queries = 0
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, httptest.NewRequest(http.MethodGet, target, nil))
		require.NotContains(t, response.Body.String(), partnerTenantUsageHTTPSecretMarker)
		return response
	}

	type option struct {
		ID   string
		Name string
	}
	type page struct {
		Page, PageSize int
		Total          int64
		Items          []option
		Selected       *option
	}
	keys := func(object map[string]json.RawMessage) []string {
		names := make([]string, 0, len(object))
		for name := range object {
			names = append(names, name)
		}
		sort.Strings(names)
		return names
	}
	decodeOption := func(raw json.RawMessage) option {
		t.Helper()
		var object map[string]json.RawMessage
		require.NoError(t, json.Unmarshal(raw, &object))
		require.Equal(t, []string{"id", "name"}, keys(object), "an option is exactly id and name")
		var result option
		// Both fields must be JSON strings; a numeric id fails here.
		require.NoError(t, json.Unmarshal(object["id"], &result.ID))
		require.NoError(t, json.Unmarshal(object["name"], &result.Name))
		id, err := strconv.ParseInt(result.ID, 10, 64)
		require.NoError(t, err)
		require.Positive(t, id)
		require.Equal(t, result.ID, strconv.FormatInt(id, 10), "canonical decimal text")
		return result
	}
	decode := func(response *httptest.ResponseRecorder) page {
		t.Helper()
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
		require.Equal(t, "no-store", response.Header().Get("Cache-Control"))
		var envelope map[string]json.RawMessage
		require.NoError(t, json.Unmarshal(response.Body.Bytes(), &envelope))
		require.Equal(t, []string{"data", "message", "success"}, keys(envelope))
		require.JSONEq(t, `true`, string(envelope["success"]))
		require.JSONEq(t, `""`, string(envelope["message"]))
		var data map[string]json.RawMessage
		require.NoError(t, json.Unmarshal(envelope["data"], &data))
		require.Equal(t, []string{"items", "page", "page_size", "selected", "total"}, keys(data))
		var result page
		require.NoError(t, json.Unmarshal(data["page"], &result.Page))
		require.NoError(t, json.Unmarshal(data["page_size"], &result.PageSize))
		require.NoError(t, json.Unmarshal(data["total"], &result.Total))
		var items []json.RawMessage
		require.NoError(t, json.Unmarshal(data["items"], &items))
		require.NotNil(t, items, "items is always an array")
		result.Items = make([]option, 0, len(items))
		for _, item := range items {
			result.Items = append(result.Items, decodeOption(item))
		}
		if string(data["selected"]) != "null" {
			selected := decodeOption(data["selected"])
			result.Selected = &selected
		}
		return result
	}
	optionOf := func(tenant *model.PartnerTenant) option {
		return option{ID: strconv.FormatInt(tenant.Id, 10), Name: tenant.Name}
	}

	t.Run("default page is bounded and id/name only", func(t *testing.T) {
		response := get("/log-options")
		result := decode(response)
		require.Equal(t, 1, result.Page)
		require.Equal(t, partnerTenantOptionsDefaultPageSize, result.PageSize)
		require.EqualValues(t, total, result.Total)
		require.Len(t, result.Items, partnerTenantOptionsDefaultPageSize)
		require.Nil(t, result.Selected)
		require.Equal(t, optionOf(large), result.Items[0], "newest (largest id) first")
		require.Equal(t, optionOf(tenants[ordinaryCount-1]), result.Items[1])
		require.Contains(t, response.Body.String(), `"id":"9007199254740993"`)
		require.NotContains(t, response.Body.String(), `"id":9007199254740993`)
		for _, forbidden := range []string{"secret", "group", "integration_mode", "status", "created_at", "updated_at", "hosted_h5", "subscription_key", "external_user_id"} {
			require.NotContains(t, response.Body.String(), forbidden)
		}
	})

	t.Run("both entries share one projection", func(t *testing.T) {
		for _, query := range []string{"", "?p=2&page_size=5", "?q=merchant+1&selected_id=" + strconv.FormatInt(tenants[3].Id, 10)} {
			logEntry, userEntry := get("/log-options"+query), get("/user-options"+query)
			// Both must succeed: two identical rejections would prove nothing.
			require.Equal(t, http.StatusOK, logEntry.Code, query)
			require.Equal(t, http.StatusOK, userEntry.Code, query)
			require.Equal(t, logEntry.Body.String(), userEntry.Body.String(), query)
		}
	})

	t.Run("page size is capped and pages are stable", func(t *testing.T) {
		all := decode(get("/log-options?page_size=" + strconv.Itoa(model.PartnerTenantOptionMaxPageSize)))
		require.Len(t, all.Items, total)
		require.Equal(t, http.StatusBadRequest, get("/log-options?page_size="+strconv.Itoa(model.PartnerTenantOptionMaxPageSize+1)).Code)
		second := decode(get("/log-options?p=2&page_size=5"))
		require.Equal(t, 2, second.Page)
		require.Equal(t, 5, second.PageSize)
		require.EqualValues(t, total, second.Total)
		require.Equal(t, all.Items[5:10], second.Items)
		last := decode(get("/log-options?p=3&page_size=10"))
		require.Equal(t, all.Items[20:], last.Items)
		beyond := decode(get("/log-options?p=" + strconv.Itoa(partnerTenantOptionsMaxPage) + "&page_size=1"))
		require.Empty(t, beyond.Items)
		require.EqualValues(t, total, beyond.Total)
	})

	t.Run("disabled merchants are listed and searchable", func(t *testing.T) {
		found := decode(get("/log-options?q=" + url.QueryEscape("usage MERCHANT 00")))
		require.EqualValues(t, 1, found.Total)
		require.Equal(t, []option{optionOf(tenants[0])}, found.Items)
		require.Equal(t, []option{optionOf(large)}, decode(get("/log-options?q=Large")).Items)
		// Wildcards are literal and non-public columns are not searchable.
		for _, keyword := range []string{"%", "_", "Usage_Merchant", partnerTenantUsageHTTPSecretMarker, "hosted_h5", "group"} {
			empty := decode(get("/log-options?q=" + url.QueryEscape(keyword)))
			require.Zero(t, empty.Total, keyword)
			require.Empty(t, empty.Items, keyword)
		}
		require.EqualValues(t, total, decode(get("/log-options?q=")).Total, "an empty keyword is no filter")
		require.EqualValues(t, total, decode(get("/log-options?q="+url.QueryEscape("  usage  "))).Total, "surrounding space is trimmed")
	})

	t.Run("selected merchant resolves outside the returned page", func(t *testing.T) {
		oldest := tenants[0] // disabled and on the last page
		result := decode(get("/log-options?p=1&page_size=2&selected_id=" + strconv.FormatInt(oldest.Id, 10)))
		require.Len(t, result.Items, 2)
		require.NotContains(t, result.Items, optionOf(oldest))
		require.NotNil(t, result.Selected)
		require.Equal(t, optionOf(oldest), *result.Selected)

		filtered := decode(get("/log-options?q=Large&selected_id=" + strconv.FormatInt(tenants[5].Id, 10)))
		require.Equal(t, []option{optionOf(large)}, filtered.Items)
		require.Equal(t, optionOf(tenants[5]), *filtered.Selected, "resolved by ID, independent of the keyword")

		exact := decode(get("/log-options?page_size=1&p=2&selected_id=9007199254740993"))
		require.Equal(t, optionOf(large), *exact.Selected)

		for _, missing := range []string{"424242424242", "9223372036854775807"} {
			absent := decode(get("/log-options?selected_id=" + missing))
			require.Nil(t, absent.Selected, "an unknown selected ID is null, not an error")
			require.Len(t, absent.Items, partnerTenantOptionsDefaultPageSize)
		}
	})

	t.Run("invalid parameters are rejected before any query", func(t *testing.T) {
		for _, query := range []string{
			"selected_id=0", "selected_id=-1", "selected_id=01", "selected_id=%2B1", "selected_id=1.0", "selected_id=1e3",
			"selected_id=0x10", "selected_id=%201", "selected_id=", "selected_id=abc", "selected_id=9223372036854775808",
			"selected_id=99999999999999999999", "selected_id=1&selected_id=2", "selected_id=1&selected_id=1",
			"p=0", "p=-1", "p=01", "p=", "p=abc", "p=1.5", "p=" + strconv.Itoa(partnerTenantOptionsMaxPage+1), "p=1&p=2",
			"page_size=0", "page_size=-5", "page_size=020", "page_size=", "page_size=abc", "page_size=101", "page_size=10&page_size=10",
			"q=a&q=b", "q=" + strings.Repeat("a", model.PartnerTenantOptionMaxKeywordRunes+1), "q=line%0Abreak", "q=tab%09", "q=%FF%FE", "q=%zz",
			"tenant_id=1", "id=1", "page=1", "ps=10", "size=10", "keyword=usage", "status=1", "group=default", "sort_by=id",
		} {
			response := get("/log-options?" + query)
			require.Equal(t, http.StatusBadRequest, response.Code, query)
			require.Zero(t, queries, "%s must not reach the database", query)
			var body map[string]json.RawMessage
			require.NoError(t, json.Unmarshal(response.Body.Bytes(), &body), query)
			require.JSONEq(t, `false`, string(body["success"]), query)
			require.NotContains(t, body, "data", query)
			require.NotContains(t, response.Body.String(), "Usage Merchant", query)
			require.Empty(t, response.Header().Get("Cache-Control"), query)
		}
		// The longest allowed keyword is accepted.
		longest := decode(get("/log-options?q=" + strings.Repeat("z", model.PartnerTenantOptionMaxKeywordRunes)))
		require.Zero(t, longest.Total)
	})

	t.Run("database failure is a bounded 503 without leaked detail", func(t *testing.T) {
		t.Cleanup(func() { failFrom = -1 })
		for _, test := range []struct {
			name, query string
			failFrom    int
		}{
			{"count", "", 0},
			{"page", "", 1},
			{"selected", "?selected_id=" + strconv.FormatInt(tenants[0].Id, 10), 2},
		} {
			serverLog.Reset()
			failFrom = test.failFrom
			response := get("/log-options" + test.query)
			failFrom = -1
			require.Equal(t, http.StatusServiceUnavailable, response.Code, test.name)
			var body map[string]json.RawMessage
			require.NoError(t, json.Unmarshal(response.Body.Bytes(), &body), test.name)
			require.JSONEq(t, `false`, string(body["success"]), test.name)
			require.NotContains(t, body, "data", test.name)
			for _, leaked := range []string{"forced options failure", "Usage Merchant", "partner_tenants", "SELECT"} {
				require.NotContains(t, response.Body.String(), leaked, test.name)
			}
			require.Contains(t, serverLog.String(), "partner tenant options read failed (request_id=usage-options-fixture)", test.name)
			for _, leaked := range []string{"forced options failure", partnerTenantUsageHTTPSecretMarker, "SELECT", "Usage Merchant"} {
				require.NotContains(t, serverLog.String(), leaked, test.name)
			}
		}
		require.EqualValues(t, total, decode(get("/log-options")).Total, "the endpoint recovers; nothing was cached")
	})
}
