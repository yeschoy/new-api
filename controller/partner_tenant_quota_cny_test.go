package controller

import (
	"bytes"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// A recognisable marker carried by the fixture root secret and the pure
// fixtures' api_key. It may never appear inside quota_cny.
const partnerTenantQuotaCNYSecretMarker = "PTQUOTACNYSECRETMARKER"

// The conversion settings are process globals. Every test that sets them goes
// through this helper, restores them and never runs in parallel.
func holdPartnerTenantQuotaCNYConversion(t *testing.T, quotaPerUnit, rate float64) {
	t.Helper()
	oldQuotaPerUnit, oldRate, oldGeneral := common.QuotaPerUnit, operation_setting.USDExchangeRate, *operation_setting.GetGeneralSetting()
	t.Cleanup(func() {
		common.QuotaPerUnit, operation_setting.USDExchangeRate = oldQuotaPerUnit, oldRate
		*operation_setting.GetGeneralSetting() = oldGeneral
	})
	common.QuotaPerUnit, operation_setting.USDExchangeRate = quotaPerUnit, rate
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
}

// Task-owned PostgreSQL only: a unique retained pt_quota_cny_ schema, no
// SQLite, no drop/truncate. A missing DSN fails the test; it is never a pass.
func setupPartnerTenantQuotaCNYHTTPPQ(t *testing.T, prefix string) (*model.PartnerTenant, string, *model.SubscriptionPlan) {
	t.Helper()
	dsn := os.Getenv("TEST_PARTNER_QUOTA_CNY_POSTGRES_DSN")
	require.NotEmpty(t, dsn, "BLOCKED: explicit task-owned Docker/pq DSN required; no SQLite/MySQL/production substitute")
	require.True(t, strings.HasPrefix(prefix, "pt_quota_cny_"), "quota CNY fixtures own the pt_quota_cny_ schema prefix")
	_, tenant, secret, plan := setupPartnerTenantIsolatedHTTPPQ(t, dsn, prefix)
	// The shared fixture restores the previous root secret in its cleanup.
	common.CryptoSecret = partnerTenantQuotaCNYSecretMarker + "-root-fixture-only"
	holdPartnerTenantQuotaCNYConversion(t, 500000, 1)
	// The hosted quota entry resolves plans through a process-wide cache keyed
	// by numeric ID; a new schema reuses small IDs.
	forgetPartnerTenantQuotaCNYPlan(t, plan.Id)
	return tenant, secret, plan
}

func forgetPartnerTenantQuotaCNYPlan(t *testing.T, planID int) {
	t.Helper()
	model.InvalidateSubscriptionPlanCache(planID)
	t.Cleanup(func() { model.InvalidateSubscriptionPlanCache(planID) })
}

func partnerTenantQuotaCNYObject(t *testing.T, raw []byte) map[string]json.RawMessage {
	t.Helper()
	var object map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(raw, &object), string(raw))
	return object
}

func partnerTenantQuotaCNYSortedKeys[V any](object map[string]V) []string {
	keys := make([]string, 0, len(object))
	for key := range object {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// Exact key set and exact raw JSON tokens, so a type change is a failure:
// `"30.000000"` is a string, `30` a number and `null` a null. The token "*"
// only requires the key (its value is asserted separately).
func requirePartnerTenantQuotaCNYTokens(t *testing.T, raw []byte, want map[string]string, context string) {
	t.Helper()
	object := partnerTenantQuotaCNYObject(t, raw)
	require.Equal(t, partnerTenantQuotaCNYSortedKeys(want), partnerTenantQuotaCNYSortedKeys(object), context)
	for key, token := range want {
		if token != "*" {
			require.Equal(t, token, string(object[key]), "%s: %s", context, key)
		}
	}
}

// Every legacy field of got is byte-identical to the same field of legacy and
// the only additional key is quota_cny.
func requirePartnerTenantQuotaCNYLegacy(t *testing.T, legacy, got map[string]json.RawMessage, context string) {
	t.Helper()
	require.NotContains(t, legacy, "quota_cny", context)
	require.Contains(t, got, "quota_cny", context)
	without := make(map[string]json.RawMessage, len(got))
	for key, token := range got {
		if key != "quota_cny" {
			without[key] = token
		}
	}
	require.Equal(t, partnerTenantQuotaCNYSortedKeys(legacy), partnerTenantQuotaCNYSortedKeys(without), context)
	for key, token := range legacy {
		require.Equal(t, string(token), string(got[key]), "%s: %s", context, key)
	}
}

func partnerTenantQuotaCNYAmount(amount string) string { return `"` + amount + `"` }

func partnerTenantQuotaCNYSubscriptionWant(total, used, remaining string, unlimited, usable bool) map[string]string {
	return map[string]string{
		"currency": `"CNY"`, "available": "true", "total": total, "used": used, "remaining": remaining,
		"unlimited": strconv.FormatBool(unlimited), "usable": strconv.FormatBool(usable),
		"quota_per_unit": `"500000"`, "usd_to_cny_rate": `"1"`, "scale": "6", "rounding": `"half_away_from_zero"`,
	}
}

func partnerTenantQuotaCNYCatalogWant(total string, unlimited bool) map[string]string {
	return map[string]string{
		"currency": `"CNY"`, "available": "true", "total": total, "unlimited": strconv.FormatBool(unlimited),
		"quota_per_unit": `"500000"`, "usd_to_cny_rate": `"1"`, "scale": "6", "rounding": `"half_away_from_zero"`,
	}
}

func partnerTenantQuotaCNYWith(want map[string]string, changes ...string) map[string]string {
	result := make(map[string]string, len(want)+len(changes)/2)
	for key, token := range want {
		result[key] = token
	}
	for i := 0; i+1 < len(changes); i += 2 {
		result[changes[i]] = changes[i+1]
	}
	return result
}

func partnerTenantQuotaCNYUnavailable(want map[string]string, reason, quotaPerUnit, rate string) map[string]string {
	result := partnerTenantQuotaCNYWith(want, "available", "false", "reason", `"`+reason+`"`, "quota_per_unit", quotaPerUnit, "usd_to_cny_rate", rate)
	for _, amount := range []string{"total", "used", "remaining"} {
		if _, ok := result[amount]; ok {
			result[amount] = "null"
		}
	}
	delete(result, "historical_remaining")
	return result
}

func capturePartnerTenantQuotaCNYLog(t *testing.T) *bytes.Buffer {
	t.Helper()
	var serverLog bytes.Buffer
	common.LogWriterMu.Lock()
	previous := gin.DefaultErrorWriter
	gin.DefaultErrorWriter = &serverLog
	common.LogWriterMu.Unlock()
	t.Cleanup(func() {
		common.LogWriterMu.Lock()
		gin.DefaultErrorWriter = previous
		common.LogWriterMu.Unlock()
	})
	return &serverLog
}

func renderPartnerTenantQuotaCNY(t *testing.T, build func(c *gin.Context) any) string {
	t.Helper()
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	c.Set(common.RequestIdKey, "quota-cny-fixture")
	c.JSON(http.StatusOK, build(c))
	require.Equal(t, http.StatusOK, recorder.Code)
	return recorder.Body.String()
}

// No database. The actual gin-rendered body keeps every legacy field byte for
// byte (anonymous embedding promotes no MarshalJSON that could drop the new
// field) and appends quota_cny last.
func TestPartnerTenantQuotaCNYRenderedWrappersKeepLegacyFields(t *testing.T) {
	holdPartnerTenantQuotaCNYConversion(t, 500000, 1)
	serverLog := capturePartnerTenantQuotaCNYLog(t)
	const metadata = `"quota_per_unit":"500000","usd_to_cny_rate":"1","scale":6,"rounding":"half_away_from_zero"}`

	active := &model.PartnerTenantIndependentSubscription{}
	active.Subscription.Id, active.Subscription.PlanId, active.Subscription.PlanTitle = 7, 3, "Monthly"
	active.Subscription.Status, active.Subscription.StartTime, active.Subscription.EndTime = "active", 100, 200
	active.Quota.Total, active.Quota.Used, active.Quota.Remaining = "15000000", "16008", "14983992"
	active.Quota.Usable, active.Quota.NextResetTime = true, 150
	active.APIKey = "sk-" + partnerTenantQuotaCNYSecretMarker
	legacy, err := json.Marshal(active)
	require.NoError(t, err)
	body := renderPartnerTenantQuotaCNY(t, func(c *gin.Context) any { return newPartnerTenantIndependentSubscriptionView(c, active) })
	require.Equal(t,
		string(legacy[:len(legacy)-1])+`,"quota_cny":{"currency":"CNY","available":true,"total":"30.000000","used":"0.032016","remaining":"29.967984","unlimited":false,"usable":true,`+metadata+`}`,
		body)
	require.Contains(t, body, `"quota_total":"15000000"`)
	require.Equal(t, 1, strings.Count(body, partnerTenantQuotaCNYSecretMarker), "api_key is rendered once and never copied into quota_cny")
	require.NotContains(t, string(partnerTenantQuotaCNYObject(t, []byte(body))["quota_cny"]), "sk-")

	terminal := &model.PartnerTenantIndependentSubscription{}
	terminal.Subscription.Id, terminal.Subscription.Status = 7, "cancelled"
	terminal.Quota.Total, terminal.Quota.Used, terminal.Quota.Remaining = "15000000", "16008", "0"
	historical := "14983992"
	terminal.Quota.HistoricalRemaining = &historical
	legacy, err = json.Marshal(terminal)
	require.NoError(t, err)
	body = renderPartnerTenantQuotaCNY(t, func(c *gin.Context) any { return newPartnerTenantIndependentSubscriptionView(c, terminal) })
	require.Equal(t,
		string(legacy[:len(legacy)-1])+`,"quota_cny":{"currency":"CNY","available":true,"total":"30.000000","used":"0.032016","remaining":"0.000000","historical_remaining":"29.967984","unlimited":false,"usable":false,`+metadata+`}`,
		body)
	require.NotContains(t, body, "api_key")

	// Hosted H5 item: int64 JSON numbers stay numbers, including int64 max.
	item := partnerTenantSubscriptionQuota{PlanID: 3, PlanTitle: "Monthly", StartTime: 100, EndTime: 200, Status: "active", QuotaTotal: math.MaxInt64, QuotaUsed: 1, QuotaRemain: math.MaxInt64 - 1, NextReset: 150}
	body = renderPartnerTenantQuotaCNY(t, func(c *gin.Context) any {
		item.QuotaCNY = partnerTenantHostedQuotaCNY(c, service.CurrentPartnerTenantQuotaCNYConfig(), &item)
		return item
	})
	require.Equal(t,
		`{"plan_id":3,"plan_title":"Monthly","start_time":100,"end_time":200,"status":"active","quota_total":9223372036854775807,"quota_used":1,"quota_remaining":9223372036854775806,"quota_unlimited":false,"next_reset_time":150,`+
			`"quota_cny":{"currency":"CNY","available":true,"total":"18446744073709.551614","used":"0.000002","remaining":"18446744073709.551612","unlimited":false,"usable":true,`+metadata+`}`,
		body)
	unlimited := partnerTenantSubscriptionQuota{PlanID: 4, Status: "active", QuotaUsed: 16008, QuotaUnlimited: true}
	body = renderPartnerTenantQuotaCNY(t, func(c *gin.Context) any {
		unlimited.QuotaCNY = partnerTenantHostedQuotaCNY(c, service.CurrentPartnerTenantQuotaCNYConfig(), &unlimited)
		return unlimited
	})
	require.Contains(t, body, `"quota_total":0,"quota_used":16008,"quota_remaining":0,"quota_unlimited":true,`)
	require.Contains(t, body, `"quota_cny":{"currency":"CNY","available":true,"total":null,"used":"0.032016","remaining":null,"unlimited":true,"usable":true,`)

	// Hosted usable is decided from the status and the raw integers, never from
	// an amount: a positive raw remaining that displays as 0.000000 stays usable,
	// exhausted or overused items are not usable, and a status other than active
	// (never returned by this entry) could not be reported usable or spendable.
	reference := service.CurrentPartnerTenantQuotaCNYConfig()
	for name, test := range map[string]struct {
		config service.PartnerTenantQuotaCNYConfig
		item   partnerTenantSubscriptionQuota
		want   string
	}{
		"below the display unit": {service.NewPartnerTenantQuotaCNYConfig(500000, 0.1), partnerTenantSubscriptionQuota{Status: "active", QuotaTotal: 1, QuotaRemain: 1},
			`"total":"0.000000","used":"0.000000","remaining":"0.000000","unlimited":false,"usable":true,"quota_per_unit":"500000","usd_to_cny_rate":"0.1",`},
		"exhausted": {reference, partnerTenantSubscriptionQuota{Status: "active", QuotaTotal: 100, QuotaUsed: 100},
			`"total":"0.000200","used":"0.000200","remaining":"0.000000","unlimited":false,"usable":false,`},
		"overused": {reference, partnerTenantSubscriptionQuota{Status: "active", QuotaTotal: 100, QuotaUsed: 250},
			`"total":"0.000200","used":"0.000500","remaining":"0.000000","unlimited":false,"usable":false,`},
		"not active finite": {reference, partnerTenantSubscriptionQuota{Status: "expired", QuotaTotal: 100, QuotaUsed: 1, QuotaRemain: 99},
			`"total":"0.000200","used":"0.000002","remaining":"0.000000","unlimited":false,"usable":false,`},
		"not active unlimited": {reference, partnerTenantSubscriptionQuota{Status: "cancelled", QuotaUsed: 1, QuotaUnlimited: true},
			`"total":null,"used":"0.000002","remaining":"0.000000","unlimited":true,"usable":false,`},
	} {
		body = renderPartnerTenantQuotaCNY(t, func(c *gin.Context) any { return partnerTenantHostedQuotaCNY(c, test.config, &test.item) })
		require.True(t, strings.HasPrefix(body, `{"currency":"CNY","available":true,`+test.want), "%s: %s", name, body)
	}

	// Catalog: the shared plan JSON is embedded unchanged; the real price
	// currency (USD here) is independent of quota_cny.currency.
	plan := model.SubscriptionPlan{Id: 12, PartnerTenantId: 5, Title: "Monthly", PriceAmount: 9.99, Currency: "USD", DurationUnit: "month", DurationValue: 1, Enabled: true, TotalAmount: 9007199254740993, QuotaResetPeriod: "monthly"}
	plan.NormalizeDefaults()
	legacy, err = json.Marshal(plan)
	require.NoError(t, err)
	body = renderPartnerTenantQuotaCNY(t, func(c *gin.Context) any {
		return gin.H{"plans": newPartnerTenantCatalogPlanViews(c, []model.SubscriptionPlan{plan})}
	})
	require.Equal(t,
		`{"plans":[`+string(legacy[:len(legacy)-1])+`,"quota_cny":{"currency":"CNY","available":true,"total":"18014398509.481986","unlimited":false,`+metadata+`}]}`,
		body)
	require.Contains(t, body, `"total_amount":9007199254740993,`)
	require.Contains(t, body, `"price_amount":9.99,"currency":"USD",`)
	for _, forbidden := range []string{`"used"`, `"remaining"`, `"usable"`, `"historical_remaining"`} {
		require.NotContains(t, body, forbidden)
	}
	require.Equal(t, `{"plans":[]}`, renderPartnerTenantQuotaCNY(t, func(c *gin.Context) any {
		return gin.H{"plans": newPartnerTenantCatalogPlanViews(c, []model.SubscriptionPlan{})}
	}))
	require.NotContains(t, serverLog.String(), "quota_cny", "a valid projection writes no log line")

	// An invalid conversion configuration is visible in the body, not logged.
	common.QuotaPerUnit = math.NaN()
	body = renderPartnerTenantQuotaCNY(t, func(c *gin.Context) any { return newPartnerTenantIndependentSubscriptionView(c, active) })
	legacy, err = json.Marshal(active)
	require.NoError(t, err)
	require.Equal(t,
		string(legacy[:len(legacy)-1])+`,"quota_cny":{"currency":"CNY","available":false,"reason":"invalid_conversion_config","total":null,"used":null,"remaining":null,"unlimited":false,"usable":true,"quota_per_unit":null,"usd_to_cny_rate":"1","scale":6,"rounding":"half_away_from_zero"}}`,
		body)
	require.NotContains(t, body, "NaN")
	require.NotContains(t, serverLog.String(), "quota_cny")
	common.QuotaPerUnit = 500000

	// An invalid stored quota is unavailable with one bounded, secret-free line.
	body = renderPartnerTenantQuotaCNY(t, func(c *gin.Context) any {
		return gin.H{"plans": newPartnerTenantCatalogPlanViews(c, []model.SubscriptionPlan{{Id: 77, Title: partnerTenantQuotaCNYSecretMarker, TotalAmount: -1}})}
	})
	require.Contains(t, body, `"total_amount":-1,`)
	require.Contains(t, body, `"quota_cny":{"currency":"CNY","available":false,"reason":"invalid_quota","total":null,"unlimited":false,`)
	require.Contains(t, serverLog.String(), "partner tenant quota_cny unavailable (request_id=quota-cny-fixture): entry=catalog id=77 reason=invalid_quota")
	require.Equal(t, 1, strings.Count(serverLog.String(), "quota_cny unavailable"))
	require.NotContains(t, serverLog.String(), partnerTenantQuotaCNYSecretMarker)
}

func TestPartnerTenantQuotaCNYIndependentSubscriptionHTTP(t *testing.T) {
	tenant, merchant, plan := setupPartnerTenantQuotaCNYHTTPPQ(t, "pt_quota_cny_independent_")
	db := model.DB
	oldLog := model.LOG_DB
	model.LOG_DB = db
	t.Cleanup(func() { model.LOG_DB = oldLog })
	require.NoError(t, model.MigratePartnerOAuthAuthorizationLogs())
	r := gin.New()
	r.GET("/api/partner/subscription", middleware.RequestId(), middleware.PartnerOAuthNoStore(), middleware.PartnerTenantAuthorizationAudit(), PartnerTenantSubscriptionKeyRequestPolicy(), PartnerTenantIndependentSubscription)

	order, _, err := model.CreatePartnerTenantSubscriptionKeyOrder(model.PartnerTenantSubscriptionKeyOrderInput{TenantId: tenant.Id, TenantSecretHash: tenant.SecretHash, IdempotencyHash: strings.Repeat("c", 64), PlanId: plan.Id, PaymentMethod: "alipay", MerchantId: "quota-cny-test"}, nil)
	require.NoError(t, err)
	require.NoError(t, model.RecordPartnerTenantPayment(order.OrderNo, model.PaymentProviderEpay, "quota-cny-test", "alipay", "quota-cny-transaction", order.AmountCents))
	require.NoError(t, model.FulfillPartnerTenantSubscriptionOrder(order.OrderNo))
	key, err := model.ClaimPartnerTenantSubscriptionKey(tenant.Id, tenant.SecretHash, order.OrderNo)
	require.NoError(t, err)
	var access model.PartnerTenantSubscriptionAccessKey
	require.NoError(t, db.Where("user_subscription_id = ?", key.SubscriptionId).First(&access).Error)
	var account model.PartnerTenantAccount
	require.NoError(t, db.First(&account, access.AccountId).Error)
	var token model.Token
	require.NoError(t, db.First(&token, account.TokenId).Error)
	secrets := []string{merchant, tenant.SecretHash, key.SubscriptionKey, access.Seed, access.SecretHash, token.Key, common.CryptoSecret, partnerTenantQuotaCNYSecretMarker}

	// Reads of the two credential-bearing tables per request. The display
	// projection must not add a second bearer, key or token lookup.
	queries := map[string]int{}
	require.NoError(t, db.Callback().Query().Before("gorm:query").Register("pt_quota_cny_probe", func(tx *gorm.DB) { queries[tx.Statement.Table]++ }))
	t.Cleanup(func() { _ = db.Callback().Query().Remove("pt_quota_cny_probe") })
	audits := func() int64 {
		t.Helper()
		_, total, err := model.GetPartnerOAuthAuthorizationLogs(model.PartnerOauthAuthorizationLogFilter{Action: model.PartnerTenantAuditRead}, 0, 1)
		require.NoError(t, err)
		return total
	}
	now := time.Now().Unix()
	nextReset := now + 20*86400
	set := func(status string, total, used int64, lapsed bool) {
		t.Helper()
		end := now + 30*86400
		if lapsed {
			end = now - 3600
		}
		require.NoError(t, db.Model(&model.UserSubscription{}).Where("id = ?", key.SubscriptionId).Updates(map[string]any{
			"status": status, "amount_total": total, "amount_used": used,
			"start_time": now - 7200, "end_time": end, "last_reset_time": now - 7200, "next_reset_time": nextReset,
		}).Error)
	}
	type legacyQuota struct {
		total, used, remaining, historical string
		unlimited, usable                  bool
	}
	// At most 120 reads per key and minute are allowed; this test stays far below.
	check := func(name, status string, legacy legacyQuota, cny map[string]string) {
		t.Helper()
		before := audits()
		clear(queries)
		response := subscriptionKeyHTTPRequest(r, "GET", "/api/partner/subscription", key.SubscriptionKey, "", "", "")
		accessReads, tokenReads := queries["partner_tenant_subscription_access_keys"], queries["tokens"]
		require.Equal(t, 200, response.Code, "%s: %s", name, response.Body.String())
		require.Equal(t, "no-store", response.Header().Get("Cache-Control"), name)
		body := response.Body.Bytes()
		require.Equal(t, 2, accessReads, "%s: locator plus locked row only", name)
		require.Equal(t, 1, tokenReads, "%s: one locked token read only", name)
		require.EqualValues(t, before+1, audits(), "%s: exactly one audit event per query", name)

		top := partnerTenantQuotaCNYObject(t, body)
		active := status == "active"
		wantQuota := map[string]string{
			"quota_total": partnerTenantQuotaCNYAmount(legacy.total), "quota_used": partnerTenantQuotaCNYAmount(legacy.used), "quota_remaining": partnerTenantQuotaCNYAmount(legacy.remaining),
			"quota_unlimited": strconv.FormatBool(legacy.unlimited), "quota_usable": strconv.FormatBool(legacy.usable), "next_reset_time": strconv.FormatInt(nextReset, 10),
		}
		if !active {
			wantQuota["historical_quota_remaining"] = partnerTenantQuotaCNYAmount(legacy.historical)
		}
		requirePartnerTenantQuotaCNYTokens(t, top["quota"], wantQuota, name+" quota")
		subscription := partnerTenantQuotaCNYObject(t, top["subscription"])
		require.Equal(t, `"`+status+`"`, string(subscription["status"]), name)
		require.Equal(t, strconv.Itoa(key.SubscriptionId), string(subscription["id"]), name)
		// Key visibility is unchanged: active (even exhausted) returns it, terminal never.
		if active {
			require.Equal(t, `"sk-`+token.Key+`"`, string(top["api_key"]), name)
		} else {
			require.NotContains(t, top, "api_key", name)
			require.NotContains(t, string(body), token.Key, name)
		}
		requirePartnerTenantQuotaCNYTokens(t, top["quota_cny"], cny, name+" quota_cny")
		for _, secret := range secrets {
			require.NotContains(t, string(top["quota_cny"]), secret, name)
		}
		for _, secret := range []string{merchant, tenant.SecretHash, key.SubscriptionKey, access.Seed, access.SecretHash, common.CryptoSecret} {
			require.NotContains(t, string(body), secret, name)
		}
		for _, forbidden := range []string{"NaN", "Inf", "e+", "E+"} {
			require.NotContains(t, string(top["quota_cny"]), forbidden, name)
		}

		// The legacy part equals the model DTO of the same snapshot byte for byte.
		direct, err := model.QueryPartnerTenantSubscription(key.SubscriptionKey)
		require.NoError(t, err, name)
		encoded, err := json.Marshal(direct)
		require.NoError(t, err, name)
		requirePartnerTenantQuotaCNYLegacy(t, partnerTenantQuotaCNYObject(t, encoded), top, name)
		require.True(t, strings.HasPrefix(string(body), string(encoded[:len(encoded)-1])+`,"quota_cny":{`), "%s: %s", name, body)
	}
	amount := partnerTenantQuotaCNYAmount
	want := partnerTenantQuotaCNYSubscriptionWant
	terminalFinite := partnerTenantQuotaCNYWith(want(amount("30.000000"), amount("0.032016"), amount("0.000000"), false, false), "historical_remaining", amount("29.967984"))
	terminalLegacy := legacyQuota{total: "15000000", used: "16008", remaining: "0", historical: "14983992"}

	set("active", 15000000, 16008, false)
	check("active reference", "active", legacyQuota{total: "15000000", used: "16008", remaining: "14983992", usable: true},
		want(amount("30.000000"), amount("0.032016"), amount("29.967984"), false, true))
	set("active", 15000000, 0, false)
	check("zero use", "active", legacyQuota{total: "15000000", used: "0", remaining: "15000000", usable: true},
		want(amount("30.000000"), amount("0.000000"), amount("30.000000"), false, true))
	set("active", 9007199254740993, 1, false)
	check("above 2^53", "active", legacyQuota{total: "9007199254740993", used: "1", remaining: "9007199254740992", usable: true},
		want(amount("18014398509.481986"), amount("0.000002"), amount("18014398509.481984"), false, true))
	set("active", math.MaxInt64, 0, false)
	check("int64 max", "active", legacyQuota{total: "9223372036854775807", used: "0", remaining: "9223372036854775807", usable: true},
		want(amount("18446744073709.551614"), amount("0.000000"), amount("18446744073709.551614"), false, true))
	set("active", 1, 0, false)
	check("smallest quota", "active", legacyQuota{total: "1", used: "0", remaining: "1", usable: true},
		want(amount("0.000002"), amount("0.000000"), amount("0.000002"), false, true))
	set("active", 100, 100, false)
	check("exhausted", "active", legacyQuota{total: "100", used: "100", remaining: "0"},
		want(amount("0.000200"), amount("0.000200"), amount("0.000000"), false, false))
	set("active", 100, 250, false)
	check("used above total", "active", legacyQuota{total: "100", used: "250", remaining: "0"},
		want(amount("0.000200"), amount("0.000500"), amount("0.000000"), false, false))
	set("active", 0, 16008, false)
	check("unlimited active", "active", legacyQuota{total: "0", used: "16008", remaining: "0", unlimited: true, usable: true},
		want("null", amount("0.032016"), "null", true, true))
	set("expired", 15000000, 16008, false)
	check("expired", "expired", terminalLegacy, terminalFinite)
	set("cancelled", 15000000, 16008, false)
	check("cancelled", "cancelled", terminalLegacy, terminalFinite)
	set("active", 15000000, 16008, true)
	check("naturally expired", "expired", terminalLegacy, terminalFinite)
	set("expired", 0, 16008, false)
	check("unlimited expired", "expired", legacyQuota{total: "0", used: "16008", remaining: "0", historical: "0", unlimited: true},
		want("null", amount("0.032016"), amount("0.000000"), true, false))

	// A different rate; the site display preference never changes the result.
	set("active", 15000000, 16008, false)
	reference := legacyQuota{total: "15000000", used: "16008", remaining: "14983992", usable: true}
	operation_setting.USDExchangeRate = 7.3
	converted := partnerTenantQuotaCNYWith(want(amount("219.000000"), amount("0.233717"), amount("218.766283"), false, true), "usd_to_cny_rate", `"7.3"`)
	for _, display := range []string{operation_setting.QuotaDisplayTypeUSD, operation_setting.QuotaDisplayTypeCNY, operation_setting.QuotaDisplayTypeCustom, operation_setting.QuotaDisplayTypeTokens} {
		operation_setting.GetGeneralSetting().QuotaDisplayType = display
		operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate = 123.45
		check("display "+display, "active", reference, converted)
	}
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD

	// A positive raw quota may round to 0.000000; the raw fields still show it
	// and usable stays the entitlement fact.
	set("active", 1, 0, false)
	operation_setting.USDExchangeRate = 0.1
	check("positive quota below the display unit", "active", legacyQuota{total: "1", used: "0", remaining: "1", usable: true},
		partnerTenantQuotaCNYWith(want(amount("0.000000"), amount("0.000000"), amount("0.000000"), false, true), "usd_to_cny_rate", `"0.1"`))

	// Invalid configuration: the business response still succeeds unchanged.
	set("active", 15000000, 16008, false)
	base := want("null", "null", "null", false, true)
	for name, value := range map[string]float64{"zero": 0, "negative": -1, "NaN": math.NaN(), "+Inf": math.Inf(1), "-Inf": math.Inf(-1)} {
		common.QuotaPerUnit, operation_setting.USDExchangeRate = value, 7.3
		check("quota_per_unit "+name, "active", reference, partnerTenantQuotaCNYUnavailable(base, service.PartnerTenantQuotaCNYReasonInvalidConfig, "null", `"7.3"`))
		common.QuotaPerUnit, operation_setting.USDExchangeRate = 500000, value
		check("rate "+name, "active", reference, partnerTenantQuotaCNYUnavailable(base, service.PartnerTenantQuotaCNYReasonInvalidConfig, `"500000"`, "null"))
	}
	common.QuotaPerUnit, operation_setting.USDExchangeRate = 500000, 1

	// Failures are unchanged and carry no projection.
	clear(queries)
	denied := subscriptionKeyHTTPRequest(r, "GET", "/api/partner/subscription", "sub_"+strings.Repeat("f", 64), "", "", "")
	require.Equal(t, 401, denied.Code, denied.Body.String())
	require.NotContains(t, denied.Body.String(), "quota_cny")

	// No entitlement, credential or account side effect.
	for _, table := range []any{&model.User{}, &model.Token{}, &model.PartnerTenantAccount{}, &model.UserSubscription{}, &model.PartnerTenantSubscriptionAccessKey{}, &model.PartnerTenantSubscriptionOrder{}} {
		var count int64
		require.NoError(t, db.Model(table).Count(&count).Error)
		require.EqualValues(t, 1, count)
	}
	var after model.PartnerTenantSubscriptionAccessKey
	require.NoError(t, db.First(&after, access.Id).Error)
	require.Equal(t, access, after)
	var stored model.UserSubscription
	require.NoError(t, db.First(&stored, key.SubscriptionId).Error)
	require.EqualValues(t, 15000000, stored.AmountTotal)
	require.EqualValues(t, 16008, stored.AmountUsed)
	require.Equal(t, "active", stored.Status)
}

func TestPartnerTenantQuotaCNYHostedQuotaHTTP(t *testing.T) {
	foreign, foreignSecret, foreignPlan := setupPartnerTenantQuotaCNYHTTPPQ(t, "pt_quota_cny_hosted_")
	db := model.DB
	serverLog := capturePartnerTenantQuotaCNYLog(t)
	tenant, secret, err := model.CreatePartnerTenantWithIntegrationMode("Quota CNY H5", foreign.Group+"_h5", model.PartnerTenantIntegrationHostedH5)
	require.NoError(t, err)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set(common.RequestIdKey, "quota-cny-hosted-fixture"); c.Next() })
	partner := r.Group("/api/partner/v1", PartnerTenantSubscriptionKeyRequestPolicy(), middleware.PartnerOAuthNoStore(), middleware.PartnerTenantBearer())
	partner.GET("/accounts/:external_user_id/subscription/quota", middleware.PartnerTenantAdmission(model.PartnerTenantOperationHostedH5), PartnerTenantSubscriptionQuota)
	const path = "/api/partner/v1/accounts/quota-cny-buyer/subscription/quota"

	provisioned, err := model.ProvisionPartnerTenantHostedAccount(tenant.Id, tenant.SecretHash, "quota-cny-buyer", "")
	require.NoError(t, err)
	account, err := model.GetPartnerTenantAccount(tenant.Id, "quota-cny-buyer")
	require.NoError(t, err)
	now := time.Now().Unix()
	nextReset := now + 20*86400
	type fixture struct {
		plan         *model.SubscriptionPlan
		subscription *model.UserSubscription
	}
	fixtures := map[string]fixture{}
	grant := func(title, status string, total, used, endOffset int64, plan *model.SubscriptionPlan) {
		t.Helper()
		if plan == nil {
			plan = &model.SubscriptionPlan{Title: title, PartnerTenantId: tenant.Id, Enabled: true, Currency: "CNY", PriceAmount: 9.99, DurationUnit: "month", DurationValue: 1, QuotaResetPeriod: "monthly", ApplicableGroup: tenant.Group, TotalAmount: total, AllowWalletOverflow: common.GetPointer(false)}
			require.NoError(t, db.Create(plan).Error)
			forgetPartnerTenantQuotaCNYPlan(t, plan.Id)
		}
		subscription := &model.UserSubscription{UserId: account.UserId, PlanId: plan.Id, AmountTotal: total, AmountUsed: used, StartTime: now - 7200, EndTime: now + endOffset, Status: status, Source: model.SubscriptionSourcePartner, LastResetTime: now - 7200, NextResetTime: nextReset}
		require.NoError(t, db.Create(subscription).Error)
		fixtures[title] = fixture{plan: plan, subscription: subscription}
	}
	const day = int64(86400)
	grant("finite", "active", 15000000, 16008, 30*day, nil)
	grant("unlimited", "active", 0, 16008, 29*day, nil)
	grant("int64max", "active", math.MaxInt64, 1, 28*day, nil)
	grant("exhausted-large", "active", 9007199254740993, 9007199254740993, 27*day, nil)
	grant("overused", "active", 100, 250, 26*day, nil)
	grant("smallest", "active", 1, 0, 25*day, nil)
	// Never returned: the entry stays active-only and tenant-scoped.
	grant("terminal-expired", "expired", 15000000, 16008, 24*day, nil)
	grant("terminal-cancelled", "cancelled", 15000000, 16008, 23*day, nil)
	grant("terminal-lapsed", "active", 15000000, 16008, -3600, nil)
	grant("foreign-tenant-plan", "active", 15000000, 16008, 22*day, foreignPlan)
	returned := []string{"finite", "unlimited", "int64max", "exhausted-large", "overused", "smallest"}

	read := func(name string) map[string]map[string]json.RawMessage {
		t.Helper()
		response := partnerIntegrationRequest(r, "GET", path, secret, "", "")
		require.Equal(t, 200, response.Code, "%s: %s", name, response.Body.String())
		require.Equal(t, "no-store", response.Header().Get("Cache-Control"), name)
		body := response.Body.String()
		for _, hidden := range []string{secret, tenant.SecretHash, provisioned.APIKey, strings.TrimPrefix(provisioned.APIKey, "sk-"), foreignSecret, common.CryptoSecret, partnerTenantQuotaCNYSecretMarker, "terminal-", "foreign-tenant-plan", foreignPlan.Title, "NaN", "Inf", "api_key"} {
			require.NotContains(t, body, hidden, name)
		}
		top := partnerTenantQuotaCNYObject(t, response.Body.Bytes())
		require.Equal(t, []string{"external_user_id", "subscriptions"}, partnerTenantQuotaCNYSortedKeys(top), name)
		require.Equal(t, `"quota-cny-buyer"`, string(top["external_user_id"]), name)
		var items []json.RawMessage
		require.NoError(t, json.Unmarshal(top["subscriptions"], &items), name)
		require.Len(t, items, len(returned), name)
		result := map[string]map[string]json.RawMessage{}
		for i, raw := range items {
			item := partnerTenantQuotaCNYObject(t, raw)
			var title string
			require.NoError(t, json.Unmarshal(item["plan_title"], &title), name)
			// The existing order (end_time desc) is unchanged.
			require.Equal(t, returned[i], title, name)
			result[title] = item
		}
		return result
	}
	legacyOf := func(title, total, used, remaining string, unlimited bool) map[string]string {
		f := fixtures[title]
		return map[string]string{
			"plan_id": strconv.Itoa(f.plan.Id), "plan_title": `"` + title + `"`,
			"start_time": strconv.FormatInt(f.subscription.StartTime, 10), "end_time": strconv.FormatInt(f.subscription.EndTime, 10), "status": `"active"`,
			"quota_total": total, "quota_used": used, "quota_remaining": remaining, "quota_unlimited": strconv.FormatBool(unlimited),
			"next_reset_time": strconv.FormatInt(nextReset, 10), "quota_cny": "*",
		}
	}
	encode := func(item map[string]json.RawMessage) []byte {
		t.Helper()
		encoded, err := json.Marshal(item)
		require.NoError(t, err)
		return encoded
	}
	amount := partnerTenantQuotaCNYAmount
	want := partnerTenantQuotaCNYSubscriptionWant
	// Legacy int64 fields are bare JSON numbers; quota_cny amounts are strings.
	legacy := map[string]map[string]string{
		"finite":          legacyOf("finite", "15000000", "16008", "14983992", false),
		"unlimited":       legacyOf("unlimited", "0", "16008", "0", true),
		"int64max":        legacyOf("int64max", "9223372036854775807", "1", "9223372036854775806", false),
		"exhausted-large": legacyOf("exhausted-large", "9007199254740993", "9007199254740993", "0", false),
		"overused":        legacyOf("overused", "100", "250", "0", false),
		"smallest":        legacyOf("smallest", "1", "0", "1", false),
	}
	projection := map[string]map[string]string{
		"finite":          want(amount("30.000000"), amount("0.032016"), amount("29.967984"), false, true),
		"unlimited":       want("null", amount("0.032016"), "null", true, true),
		"int64max":        want(amount("18446744073709.551614"), amount("0.000002"), amount("18446744073709.551612"), false, true),
		"exhausted-large": want(amount("18014398509.481986"), amount("18014398509.481986"), amount("0.000000"), false, false),
		"overused":        want(amount("0.000200"), amount("0.000500"), amount("0.000000"), false, false),
		"smallest":        want(amount("0.000002"), amount("0.000000"), amount("0.000002"), false, true),
	}
	verify := func(name string, items map[string]map[string]json.RawMessage, projection map[string]map[string]string) {
		t.Helper()
		for _, title := range returned {
			requirePartnerTenantQuotaCNYTokens(t, encode(items[title]), legacy[title], name+" "+title)
			requirePartnerTenantQuotaCNYTokens(t, items[title]["quota_cny"], projection[title], name+" "+title+" quota_cny")
		}
	}
	verify("valid", read("valid"), projection)
	require.NotContains(t, serverLog.String(), "quota_cny")

	// One configuration snapshot for every item; display preference is ignored.
	operation_setting.USDExchangeRate = 7.3
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeTokens
	rated := read("rate 7.3 with TOKENS display")
	for _, title := range returned {
		requirePartnerTenantQuotaCNYTokens(t, encode(rated[title]), legacy[title], "rated "+title)
		require.Equal(t, `"7.3"`, string(partnerTenantQuotaCNYObject(t, rated[title]["quota_cny"])["usd_to_cny_rate"]), title)
	}
	requirePartnerTenantQuotaCNYTokens(t, rated["finite"]["quota_cny"],
		partnerTenantQuotaCNYWith(want(amount("219.000000"), amount("0.233717"), amount("218.766283"), false, true), "usd_to_cny_rate", `"7.3"`), "rated finite quota_cny")
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	operation_setting.USDExchangeRate = 1

	// Invalid configuration: 200, legacy numbers intact, facts still reported.
	for name, value := range map[string]float64{"zero": 0, "negative": -1, "NaN": math.NaN(), "+Inf": math.Inf(1), "-Inf": math.Inf(-1)} {
		common.QuotaPerUnit = value
		unavailable := map[string]map[string]string{}
		for _, title := range returned {
			unavailable[title] = partnerTenantQuotaCNYUnavailable(projection[title], service.PartnerTenantQuotaCNYReasonInvalidConfig, "null", `"1"`)
		}
		verify("quota_per_unit "+name, read("quota_per_unit "+name), unavailable)
	}
	common.QuotaPerUnit = 500000
	require.NotContains(t, serverLog.String(), "quota_cny", "an invalid configuration is reported in the body, not logged per request")

	// An invalid stored quota makes only that item unavailable. The legacy
	// numbers are returned exactly as before; nothing is repaired.
	require.NoError(t, db.Model(&model.UserSubscription{}).Where("id = ?", fixtures["overused"].subscription.Id).Update("amount_used", -5).Error)
	legacy["overused"] = legacyOf("overused", "100", "-5", "105", false)
	corrupt := map[string]map[string]string{}
	for _, title := range returned {
		corrupt[title] = projection[title]
	}
	corrupt["overused"] = partnerTenantQuotaCNYWith(partnerTenantQuotaCNYUnavailable(projection["overused"], service.PartnerTenantQuotaCNYReasonInvalidQuota, `"500000"`, `"1"`), "usable", "true")
	verify("invalid stored quota", read("invalid stored quota"), corrupt)
	require.Contains(t, serverLog.String(), "partner tenant quota_cny unavailable (request_id=quota-cny-hosted-fixture): entry=hosted_quota id="+strconv.Itoa(fixtures["overused"].plan.Id)+" reason=invalid_quota")
	require.Equal(t, 1, strings.Count(serverLog.String(), "quota_cny unavailable"))
	for _, hidden := range []string{secret, tenant.SecretHash, strings.TrimPrefix(provisioned.APIKey, "sk-"), partnerTenantQuotaCNYSecretMarker} {
		require.NotContains(t, serverLog.String(), hidden)
	}

	// Scope and admission are unchanged; failures carry no projection.
	missing := partnerIntegrationRequest(r, "GET", "/api/partner/v1/accounts/unknown-buyer/subscription/quota", secret, "", "")
	require.Equal(t, 404, missing.Code, missing.Body.String())
	require.NotContains(t, missing.Body.String(), "quota_cny")
	wrongMode := partnerIntegrationRequest(r, "GET", path, foreignSecret, "", "")
	require.Equal(t, 403, wrongMode.Code, wrongMode.Body.String())
	require.Equal(t, "integration_mode_mismatch", partnerIntegrationErrorCode(t, wrongMode))
	require.NotContains(t, wrongMode.Body.String(), "quota_cny")

	// Stored entitlement facts are untouched, including terminal rows.
	for title, f := range fixtures {
		var stored model.UserSubscription
		require.NoError(t, db.First(&stored, f.subscription.Id).Error)
		wantUsed := f.subscription.AmountUsed
		if title == "overused" {
			wantUsed = -5
		}
		require.Equal(t, f.subscription.AmountTotal, stored.AmountTotal, title)
		require.Equal(t, wantUsed, stored.AmountUsed, title)
		require.Equal(t, f.subscription.Status, stored.Status, title)
		require.Equal(t, f.subscription.EndTime, stored.EndTime, title)
	}
}

func TestPartnerTenantQuotaCNYCatalogHTTP(t *testing.T) {
	tenant, secret, basePlan := setupPartnerTenantQuotaCNYHTTPPQ(t, "pt_quota_cny_catalog_")
	db := model.DB
	serverLog := capturePartnerTenantQuotaCNYLog(t)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set(common.RequestIdKey, "quota-cny-catalog-fixture"); c.Next() })
	partner := r.Group("/api/partner/v1", PartnerTenantSubscriptionKeyRequestPolicy(), middleware.PartnerOAuthNoStore(), middleware.PartnerTenantBearer())
	partner.GET("/plans", middleware.PartnerTenantAdmission(model.PartnerTenantOperationCatalog), PartnerTenantListPlans)
	const path = "/api/partner/v1/plans"

	plans := map[string]*model.SubscriptionPlan{basePlan.Title: basePlan}
	add := func(title, currency string, price float64, total int64, tenantID int64) *model.SubscriptionPlan {
		t.Helper()
		plan := &model.SubscriptionPlan{Title: title, PartnerTenantId: tenantID, Enabled: true, Currency: currency, PriceAmount: price, DurationUnit: "month", DurationValue: 1, QuotaResetPeriod: "monthly", ApplicableGroup: tenant.Group, TotalAmount: total, AllowWalletOverflow: common.GetPointer(false)}
		require.NoError(t, db.Create(plan).Error)
		plans[title] = plan
		return plan
	}
	add("reference", "CNY", 30, 15000000, tenant.Id)
	add("unlimited", "CNY", 99, 0, tenant.Id)
	add("int64max", "CNY", 19.9, math.MaxInt64, tenant.Id)
	add("smallest", "CNY", 0.01, 1, tenant.Id)
	// A historical non-CNY price stays truthful; quota_cny is not a price.
	add("historical-usd", "USD", 5, 500000, tenant.Id)
	require.NoError(t, db.Model(add("disabled-plan", "CNY", 1, 15000000, tenant.Id)).Update("enabled", false).Error)
	add("foreign-tenant-plan", "CNY", 1, 15000000, tenant.Id+100)
	// Existing order: sort_order desc, id desc.
	returned := []string{"historical-usd", "smallest", "int64max", "unlimited", "reference", basePlan.Title}

	read := func(name string) map[string]map[string]json.RawMessage {
		t.Helper()
		response := partnerIntegrationRequest(r, "GET", path, secret, "", "")
		require.Equal(t, 200, response.Code, "%s: %s", name, response.Body.String())
		require.Equal(t, "no-store", response.Header().Get("Cache-Control"), name)
		body := response.Body.String()
		for _, hidden := range []string{secret, tenant.SecretHash, common.CryptoSecret, partnerTenantQuotaCNYSecretMarker, "disabled-plan", "foreign-tenant-plan", "NaN", "Inf"} {
			require.NotContains(t, body, hidden, name)
		}
		top := partnerTenantQuotaCNYObject(t, response.Body.Bytes())
		require.Equal(t, []string{"plans"}, partnerTenantQuotaCNYSortedKeys(top), name)
		var items []json.RawMessage
		require.NoError(t, json.Unmarshal(top["plans"], &items), name)
		require.Len(t, items, len(returned), name)
		result := map[string]map[string]json.RawMessage{}
		for i, raw := range items {
			item := partnerTenantQuotaCNYObject(t, raw)
			var title string
			require.NoError(t, json.Unmarshal(item["title"], &title), name)
			require.Equal(t, returned[i], title, name)
			// Each legacy field is byte-identical to the shared plan JSON of
			// the stored row; quota_cny is the only additional key.
			var stored model.SubscriptionPlan
			require.NoError(t, db.First(&stored, plans[title].Id).Error, name)
			stored.NormalizeDefaults()
			encoded, err := json.Marshal(stored)
			require.NoError(t, err, name)
			requirePartnerTenantQuotaCNYLegacy(t, partnerTenantQuotaCNYObject(t, encoded), item, name+" "+title)
			require.Equal(t, strconv.FormatInt(stored.TotalAmount, 10), string(item["total_amount"]), "%s %s: total_amount stays a bare int64 number", name, title)
			result[title] = item
		}
		return result
	}
	amount := partnerTenantQuotaCNYAmount
	want := partnerTenantQuotaCNYCatalogWant
	projection := map[string]map[string]string{
		"historical-usd": want(amount("1.000000"), false),
		"smallest":       want(amount("0.000002"), false),
		"int64max":       want(amount("18446744073709.551614"), false),
		"unlimited":      want("null", true),
		"reference":      want(amount("30.000000"), false),
		basePlan.Title:   want(amount("18014398509.481986"), false),
	}
	verify := func(name string, items map[string]map[string]json.RawMessage, projection map[string]map[string]string) {
		t.Helper()
		for _, title := range returned {
			// The exact key set excludes used, remaining, usable and historical_remaining.
			requirePartnerTenantQuotaCNYTokens(t, items[title]["quota_cny"], projection[title], name+" "+title)
		}
	}
	valid := read("valid")
	verify("valid", valid, projection)
	require.Equal(t, `"USD"`, string(valid["historical-usd"]["currency"]))
	require.Equal(t, "5", string(valid["historical-usd"]["price_amount"]))
	require.Equal(t, `"CNY"`, string(valid["reference"]["currency"]))
	require.Equal(t, "30", string(valid["reference"]["price_amount"]))
	require.Equal(t, "9223372036854775807", string(valid["int64max"]["total_amount"]))
	require.Equal(t, "9007199254740993", string(valid[basePlan.Title]["total_amount"]))

	// A different rate with a CUSTOM site display: still the configured CNY.
	operation_setting.USDExchangeRate = 7.3
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeCustom
	operation_setting.GetGeneralSetting().CustomCurrencyExchangeRate = 123.45
	rated := read("rate 7.3 with CUSTOM display")
	requirePartnerTenantQuotaCNYTokens(t, rated["reference"]["quota_cny"], partnerTenantQuotaCNYWith(want(amount("219.000000"), false), "usd_to_cny_rate", `"7.3"`), "rated reference")
	requirePartnerTenantQuotaCNYTokens(t, rated["int64max"]["quota_cny"], partnerTenantQuotaCNYWith(want(amount("134661231738079.726782"), false), "usd_to_cny_rate", `"7.3"`), "rated int64max")
	operation_setting.GetGeneralSetting().QuotaDisplayType = operation_setting.QuotaDisplayTypeUSD
	operation_setting.USDExchangeRate = 1

	// Invalid configuration: the catalog still succeeds with its legacy plans.
	for name, value := range map[string]float64{"zero": 0, "negative": -1, "NaN": math.NaN(), "+Inf": math.Inf(1), "-Inf": math.Inf(-1)} {
		operation_setting.USDExchangeRate = value
		unavailable := map[string]map[string]string{}
		for _, title := range returned {
			unavailable[title] = partnerTenantQuotaCNYUnavailable(projection[title], service.PartnerTenantQuotaCNYReasonInvalidConfig, `"500000"`, "null")
		}
		verify("rate "+name, read("rate "+name), unavailable)
	}
	operation_setting.USDExchangeRate = 1
	require.NotContains(t, serverLog.String(), "quota_cny")

	// A corrupt stored total is reported as unavailable, never repaired.
	require.NoError(t, db.Model(plans["smallest"]).Update("total_amount", -7).Error)
	corrupt := map[string]map[string]string{}
	for _, title := range returned {
		corrupt[title] = projection[title]
	}
	corrupt["smallest"] = partnerTenantQuotaCNYUnavailable(projection["smallest"], service.PartnerTenantQuotaCNYReasonInvalidQuota, `"500000"`, `"1"`)
	broken := read("invalid stored total")
	verify("invalid stored total", broken, corrupt)
	require.Equal(t, "-7", string(broken["smallest"]["total_amount"]))
	require.Contains(t, serverLog.String(), "partner tenant quota_cny unavailable (request_id=quota-cny-catalog-fixture): entry=catalog id="+strconv.Itoa(plans["smallest"].Id)+" reason=invalid_quota")
	require.Equal(t, 1, strings.Count(serverLog.String(), "quota_cny unavailable"))

	// An empty catalog keeps its exact legacy body.
	_, emptySecret, err := model.CreatePartnerTenantWithIntegrationMode("Quota CNY Empty", tenant.Group+"_empty", model.PartnerTenantIntegrationHostedH5)
	require.NoError(t, err)
	empty := partnerIntegrationRequest(r, "GET", path, emptySecret, "", "")
	require.Equal(t, 200, empty.Code, empty.Body.String())
	require.Equal(t, `{"plans":[]}`, empty.Body.String())
	unauthorized := partnerIntegrationRequest(r, "GET", path, "pt_"+strings.Repeat("x", 48), "", "")
	require.Equal(t, 401, unauthorized.Code, unauthorized.Body.String())
	require.NotContains(t, unauthorized.Body.String(), "quota_cny")
}
