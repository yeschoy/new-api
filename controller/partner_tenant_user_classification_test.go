package controller

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
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

// A recognisable credential marker seeded into the tenant secret hash, the
// external buyer ID and a model token key. No response body may contain it.
const partnerTenantUserClassificationSecretMarker = "PTUSERCLASSSECRETMARKER"

const (
	partnerTenantUserClassificationListPath   = "/api/user/"
	partnerTenantUserClassificationSearchPath = "/api/user/search"
)

// The two administrator handlers without the auth chain (the production gate
// is covered in package router).
func newPartnerTenantUserClassificationEngine() *gin.Engine {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.GET(partnerTenantUserClassificationListPath, GetAllUsers)
	engine.GET(partnerTenantUserClassificationSearchPath, SearchUsers)
	return engine
}

func swapPartnerTenantUserClassificationOwners(t *testing.T, lookup func([]int) (map[int]model.PartnerTenantOwner, error)) {
	t.Helper()
	previous := partnerTenantOwnersForUserList
	partnerTenantOwnersForUserList = lookup
	t.Cleanup(func() { partnerTenantOwnersForUserList = previous })
}

// No database: every rejected request answers 400 before any query. model.DB
// is nil here, so a handler that reached the model would panic the test.
func TestPartnerTenantUserClassificationParameterValidation(t *testing.T) {
	previous := model.DB
	model.DB = nil
	t.Cleanup(func() { model.DB = previous })
	swapPartnerTenantUserClassificationOwners(t, func([]int) (map[int]model.PartnerTenantOwner, error) {
		t.Fatal("a rejected request must not look up owners")
		return nil, nil
	})
	engine := newPartnerTenantUserClassificationEngine()
	cases := []struct{ query, message string }{
		{"user_category=", userTenantCategoryInvalidMessage},
		{"user_category=Merchant", userTenantCategoryInvalidMessage},
		{"user_category=vip", userTenantCategoryInvalidMessage},
		{"user_category=p_", userTenantCategoryInvalidMessage},
		{"user_category=%20merchant", userTenantCategoryInvalidMessage},
		{"user_category=all&user_category=all", userTenantCategoryInvalidMessage},
		{"user_category=merchant&user_category=ordinary", userTenantCategoryInvalidMessage},
		{"tenant_id=", userTenantIDInvalidMessage},
		{"tenant_id=0", userTenantIDInvalidMessage},
		{"tenant_id=-1", userTenantIDInvalidMessage},
		{"tenant_id=%2B1", userTenantIDInvalidMessage},
		{"tenant_id=01", userTenantIDInvalidMessage},
		{"tenant_id=1.0", userTenantIDInvalidMessage},
		{"tenant_id=1e3", userTenantIDInvalidMessage},
		{"tenant_id=%201", userTenantIDInvalidMessage},
		{"tenant_id=9223372036854775808", userTenantIDInvalidMessage},
		{"tenant_id=9007199254740993x", userTenantIDInvalidMessage},
		{"tenant_id=pc_usage_fixture", userTenantIDInvalidMessage},
		{"tenant_id=1&tenant_id=1", userTenantIDInvalidMessage},
		{"user_category=merchant&tenant_id=1&tenant_id=2", userTenantIDInvalidMessage},
		{"user_category=ordinary&tenant_id=1", userTenantContradictionMessage},
		{"tenant_id=9223372036854775807&user_category=ordinary&keyword=a&status=1", userTenantContradictionMessage},
	}
	for _, path := range []string{partnerTenantUserClassificationListPath, partnerTenantUserClassificationSearchPath} {
		for _, test := range cases {
			response := httptest.NewRecorder()
			engine.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path+"?"+test.query, nil))
			require.Equal(t, http.StatusBadRequest, response.Code, "%s?%s", path, test.query)
			var body struct {
				Success    bool            `json:"success"`
				Message    string          `json:"message"`
				MessageKey string          `json:"message_key"`
				Data       json.RawMessage `json:"data"`
			}
			require.NoError(t, json.Unmarshal(response.Body.Bytes(), &body))
			require.False(t, body.Success)
			require.Equal(t, test.message, body.Message, "%s?%s", path, test.query)
			require.Equal(t, test.message, body.MessageKey)
			require.Empty(t, body.Data)
		}
	}
}

// No database: the page enrichment contract around the shared batch lookup.
func TestPartnerTenantUserClassificationEnrichment(t *testing.T) {
	calls := [][]int{}
	owners := map[int]model.PartnerTenantOwner{
		11: {TenantId: 9007199254740993, TenantName: "Big Merchant", AccountId: 424242, UserId: 11, IdentitySource: model.PartnerTenantIdentitySubscriptionKey},
		13: {TenantId: 7, TenantName: "", AccountId: 434343, UserId: 13, IdentitySource: model.PartnerTenantIdentityExternal},
	}
	swapPartnerTenantUserClassificationOwners(t, func(ids []int) (map[int]model.PartnerTenantOwner, error) {
		calls = append(calls, append([]int{}, ids...))
		return owners, nil
	})

	require.NoError(t, withPartnerTenantOwners(nil))
	require.NoError(t, withPartnerTenantOwners([]adminUserListItem{}))
	require.Empty(t, calls, "an empty page issues no owner lookup")

	users := []*model.User{
		{Id: 11, Username: "p_member", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "merchant-group", Quota: 5},
		{Id: 12, Username: "p_lookalike", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "merchant-group"},
		{Id: 13, Username: "orphaned", Role: common.RoleAdminUser, Status: common.UserStatusDisabled, Group: "default"},
	}
	items := []adminUserListItem{
		{User: users[0], PartnerClientId: "pc_both", PartnerClientName: "OAuth Partner"},
		{User: users[1]},
		{User: users[2]},
	}
	require.NoError(t, withPartnerTenantOwners(items))
	require.Equal(t, [][]int{{11, 12, 13}}, calls, "one batch lookup for the whole page")

	decode := func(value any) map[string]json.RawMessage {
		raw, err := json.Marshal(value)
		require.NoError(t, err)
		for _, forbidden := range []string{"424242", "434343", "account_id", "identity_source", "subscription_key", "external"} {
			require.NotContains(t, string(raw), forbidden)
		}
		object := map[string]json.RawMessage{}
		require.NoError(t, json.Unmarshal(raw, &object))
		return object
	}
	want := []struct{ category, tenantID, tenantName string }{
		{model.UserTenantCategoryMerchant, "9007199254740993", "Big Merchant"},
		{model.UserTenantCategoryOrdinary, "", ""},
		{model.UserTenantCategoryMerchant, "7", ""}, // tenant row missing: still a merchant
	}
	for i, item := range items {
		object := decode(item)
		for key, expected := range map[string]string{"user_category": want[i].category, "partner_tenant_id": want[i].tenantID, "partner_tenant_name": want[i].tenantName} {
			raw, present := object[key]
			require.True(t, present, "%s is always present", key)
			var text string
			require.NoError(t, json.Unmarshal(raw, &text), "%s is a JSON string", key)
			require.Equal(t, expected, text, key)
		}
		// Every pre-existing field keeps its name, value and JSON type.
		legacy := decode(struct {
			*model.User
			PartnerClientId   string `json:"partner_client_id,omitempty"`
			PartnerClientName string `json:"partner_client_name,omitempty"`
		}{item.User, item.PartnerClientId, item.PartnerClientName})
		require.Len(t, object, len(legacy)+3)
		for key, raw := range legacy {
			require.JSONEq(t, string(raw), string(object[key]), key)
		}
	}
	require.JSONEq(t, `"pc_both"`, string(decode(items[0])["partner_client_id"]))
	require.NotContains(t, decode(items[1]), "partner_client_id", "the OAuth fields stay omitempty")

	// A failed lookup fills nothing: nobody becomes ordinary by accident.
	swapPartnerTenantUserClassificationOwners(t, func([]int) (map[int]model.PartnerTenantOwner, error) {
		return nil, errors.New("driver detail " + partnerTenantUserClassificationSecretMarker)
	})
	failed := []adminUserListItem{{User: users[0]}, {User: users[1]}}
	require.Error(t, withPartnerTenantOwners(failed))
	for _, item := range failed {
		require.Empty(t, item.UserCategory)
		require.Empty(t, item.PartnerTenantId)
	}
}

// Task-owned PostgreSQL only: a unique retained pt_user_class_ schema, no
// SQLite, no drop/truncate. A missing DSN fails the test; it is never a pass.
func setupPartnerTenantUserClassificationHTTPPQ(t *testing.T, prefix string) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("TEST_PARTNER_USER_CLASSIFICATION_POSTGRES_DSN")
	require.NotEmpty(t, dsn, "BLOCKED: explicit task-owned Docker/pq DSN required; no SQLite/MySQL/production substitute")
	require.True(t, strings.HasPrefix(prefix, "pt_user_class_"), "classification fixtures own the pt_user_class_ schema prefix")
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
	model.ResetPartnerTenantMembershipCache()
	t.Cleanup(func() {
		model.DB = oldDB
		common.SetDatabaseTypes(mainType, logType)
		common.RedisEnabled = redis
		model.ResetPartnerTenantMembershipCache()
		_ = conn.Close()
	})
	t.Logf("Retained task-owned schema: %s (no drop)", schema)
	require.NoError(t, model.MigratePartnerTenantIntegrationModes(db))
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}, &model.SubscriptionPlan{}, &model.UserSubscription{}))
	require.NoError(t, model.MigratePartnerTenantSubscriptionKeys(db))
	require.NoError(t, db.AutoMigrate(&model.PartnerOAuthClient{}, &model.PartnerAccount{}, &model.PartnerOAuthBinding{}))
	return db
}

type partnerTenantUserClassificationListed struct {
	total int
	items []map[string]json.RawMessage
}

func (l partnerTenantUserClassificationListed) text(t *testing.T, index int, key string) string {
	t.Helper()
	raw, present := l.items[index][key]
	if !present {
		return ""
	}
	var value string
	require.NoError(t, json.Unmarshal(raw, &value), "%s is a JSON string", key)
	return value
}

func TestPartnerTenantUserClassificationHTTPPostgres(t *testing.T) {
	db := setupPartnerTenantUserClassificationHTTPPQ(t, "pt_user_class_http_")
	const marker = partnerTenantUserClassificationSecretMarker
	hash := func(index int) string { return fmt.Sprintf("%s%0*d", marker, 64-len(marker), index) }
	tenant := func(name, group, mode string, index int) *model.PartnerTenant {
		created, _, err := model.CreatePartnerTenantWithIntegrationMode(name, group, mode)
		require.NoError(t, err)
		require.NoError(t, db.Model(&model.PartnerTenant{}).Where("id = ?", created.Id).Update("secret_hash", hash(index)).Error)
		return created
	}
	enabled := tenant("Class Enabled", "class-enabled-group", model.PartnerTenantIntegrationHostedH5, 1)
	disabled := tenant("Class Disabled", "class-disabled-group", model.PartnerTenantIntegrationSubscriptionKey, 2)
	require.NoError(t, model.UpdatePartnerTenantStatus(disabled.Id, model.PartnerTenantStatusDisabled))
	const orphanTenantID = int64(9007199254740993) // above 2^53, no tenant row

	user := func(name, group string) *model.User {
		row := &model.User{Username: name, AffCode: name, Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: group, AuthVersion: 1}
		require.NoError(t, db.Create(row).Error)
		return row
	}
	account := func(tenantID int64, userID int, source string, status int) {
		token := &model.Token{UserId: userID, Key: marker + "key" + strconv.Itoa(userID), Status: common.TokenStatusEnabled, Name: "class", ExpiredTime: -1, UnlimitedQuota: true}
		require.NoError(t, db.Create(token).Error)
		row := &model.PartnerTenantAccount{IdentitySource: source, TenantId: tenantID, UserId: userID, TokenId: token.Id, Status: status, ExternalUserIdHash: model.HashPartnerOAuthSecret(marker + strconv.Itoa(userID))}
		if source == model.PartnerTenantIdentityExternal {
			row.ExternalUserId = marker + "-external-" + strconv.Itoa(userID)
		} else {
			row.SourceOrderId = common.GetPointer(int64(800000 + userID))
		}
		require.NoError(t, db.Create(row).Error)
	}
	now := common.GetTimestamp()
	require.NoError(t, db.Create(&model.PartnerOAuthClient{ClientId: "pc_class_fixture", Name: "Class OAuth Partner", TokenAuthMethod: model.PartnerOAuthTokenAuthMethodBasic, RedirectURIs: "[]", Scopes: "profile", Status: model.PartnerOAuthClientStatusEnabled, CreatedAt: now, UpdatedAt: now}).Error)
	oauth := func(userID int) {
		external := "class-oauth-" + strconv.Itoa(userID)
		require.NoError(t, db.Create(&model.PartnerAccount{ClientId: "pc_class_fixture", ExternalUserId: external, ExternalUserIdHash: model.HashPartnerOAuthSecret(external), UserId: userID, Status: model.PartnerAccountStatusActive, CreatedAt: now, UpdatedAt: now}).Error)
	}

	ordinary := user("class_ordinary", "default")
	lookalike := user("p_class_lookalike", enabled.Group)
	oauthOnly := user("class_oauth_only", "default")
	oauth(oauthOnly.Id)
	external := user("p_class_external", enabled.Group)
	account(enabled.Id, external.Id, model.PartnerTenantIdentityExternal, model.PartnerTenantStatusEnabled)
	subkey := user("p_class_subkey", enabled.Group)
	account(enabled.Id, subkey.Id, model.PartnerTenantIdentitySubscriptionKey, model.PartnerTenantStatusEnabled)
	offTenant := user("p_class_offtenant", disabled.Group)
	account(disabled.Id, offTenant.Id, model.PartnerTenantIdentitySubscriptionKey, model.PartnerTenantStatusEnabled)
	offAccount := user("p_class_offaccount", enabled.Group)
	account(enabled.Id, offAccount.Id, model.PartnerTenantIdentityExternal, model.PartnerTenantStatusDisabled)
	orphan := user("p_class_orphan", "class-orphan-group")
	account(orphanTenantID, orphan.Id, model.PartnerTenantIdentityExternal, model.PartnerTenantStatusEnabled)
	both := user("p_class_both", enabled.Group)
	account(enabled.Id, both.Id, model.PartnerTenantIdentityExternal, model.PartnerTenantStatusEnabled)
	oauth(both.Id)
	deleted := user("p_class_deleted", enabled.Group)
	account(enabled.Id, deleted.Id, model.PartnerTenantIdentityExternal, model.PartnerTenantStatusEnabled)
	require.NoError(t, db.Delete(&model.User{}, deleted.Id).Error) // soft delete of this fixture's own row
	// A plain subscription does not make a user a merchant, and a lapsed
	// merchant entitlement does not make its owner ordinary.
	subscribed := user("class_subscribed", "default")
	ordinaryPlan := &model.SubscriptionPlan{Title: "Class Ordinary", Enabled: true, Currency: "USD", PriceAmount: 1, DurationUnit: model.SubscriptionDurationMonth, DurationValue: 1, QuotaResetPeriod: model.SubscriptionResetMonthly, ApplicableGroup: "default", AllowWalletOverflow: common.GetPointer(true), TotalAmount: 10}
	require.NoError(t, db.Create(ordinaryPlan).Error)
	require.NoError(t, db.Create(&model.UserSubscription{UserId: subscribed.Id, PlanId: ordinaryPlan.Id, AmountTotal: 10, StartTime: now - 60, EndTime: now + 3600, Status: "active", Source: "order"}).Error)
	expired := user("p_class_expired", enabled.Group)
	account(enabled.Id, expired.Id, model.PartnerTenantIdentitySubscriptionKey, model.PartnerTenantStatusEnabled)
	tenantPlan := &model.SubscriptionPlan{Title: "Class Tenant", PartnerTenantId: enabled.Id, Enabled: true, Currency: "CNY", PriceAmount: 9.99, DurationUnit: model.SubscriptionDurationMonth, DurationValue: 1, QuotaResetPeriod: model.SubscriptionResetMonthly, ApplicableGroup: enabled.Group, AllowWalletOverflow: common.GetPointer(false), TotalAmount: 10}
	require.NoError(t, db.Create(tenantPlan).Error)
	require.NoError(t, db.Create(&model.UserSubscription{UserId: expired.Id, PlanId: tenantPlan.Id, AmountTotal: 10, AmountUsed: 10, StartTime: now - 7200, EndTime: now - 3600, Status: "expired", Source: model.SubscriptionSourcePartner}).Error)

	type owner struct{ category, tenantID, tenantName, clientID string }
	enabledID, disabledID := strconv.FormatInt(enabled.Id, 10), strconv.FormatInt(disabled.Id, 10)
	wantOwner := map[int]owner{
		ordinary.Id:   {category: "ordinary"},
		lookalike.Id:  {category: "ordinary"},
		oauthOnly.Id:  {category: "ordinary", clientID: "pc_class_fixture"},
		external.Id:   {category: "merchant", tenantID: enabledID, tenantName: enabled.Name},
		subkey.Id:     {category: "merchant", tenantID: enabledID, tenantName: enabled.Name},
		offTenant.Id:  {category: "merchant", tenantID: disabledID, tenantName: disabled.Name},
		offAccount.Id: {category: "merchant", tenantID: enabledID, tenantName: enabled.Name},
		orphan.Id:     {category: "merchant", tenantID: "9007199254740993"},
		both.Id:       {category: "merchant", tenantID: enabledID, tenantName: enabled.Name, clientID: "pc_class_fixture"},
		deleted.Id:    {category: "merchant", tenantID: enabledID, tenantName: enabled.Name},
		subscribed.Id: {category: "ordinary"},
		expired.Id:    {category: "merchant", tenantID: enabledID, tenantName: enabled.Name},
	}

	// Counts only the shared batch owner statement.
	ownerQueries := 0
	callback := "pt_user_class_owner_count_" + strconv.FormatInt(time.Now().UnixNano(), 10)
	require.NoError(t, db.Callback().Query().After("gorm:query").Register(callback, func(tx *gorm.DB) {
		if strings.Contains(tx.Statement.SQL.String(), "partner_tenant_accounts AS a") {
			ownerQueries++
		}
	}))
	t.Cleanup(func() { _ = db.Callback().Query().Remove(callback) })

	engine := newPartnerTenantUserClassificationEngine()
	get := func(target string) *httptest.ResponseRecorder {
		t.Helper()
		response := httptest.NewRecorder()
		engine.ServeHTTP(response, httptest.NewRequest(http.MethodGet, target, nil))
		require.NotContains(t, response.Body.String(), marker)
		for _, forbidden := range []string{"secret_hash", "external_user_id", "identity_source", "account_id", "token_id"} {
			require.NotContains(t, response.Body.String(), forbidden)
		}
		return response
	}
	page := func(target string) partnerTenantUserClassificationListed {
		t.Helper()
		before := ownerQueries
		response := get(target)
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
		var envelope struct {
			Success bool `json:"success"`
			Data    struct {
				Total int                          `json:"total"`
				Items []map[string]json.RawMessage `json:"items"`
			} `json:"data"`
		}
		require.NoError(t, json.Unmarshal(response.Body.Bytes(), &envelope))
		require.True(t, envelope.Success, response.Body.String())
		listed := partnerTenantUserClassificationListed{total: envelope.Data.Total, items: envelope.Data.Items}
		if len(listed.items) == 0 {
			require.Equal(t, before, ownerQueries, "an empty page issues no owner query: %s", target)
		} else {
			require.Equal(t, before+1, ownerQueries, "exactly one owner query per page: %s", target)
		}
		for i, item := range listed.items {
			var id int
			require.NoError(t, json.Unmarshal(item["id"], &id))
			want, known := wantOwner[id]
			require.True(t, known, "unexpected user %d", id)
			require.Equal(t, want.category, listed.text(t, i, "user_category"))
			require.Contains(t, item, "partner_tenant_id")
			require.Contains(t, item, "partner_tenant_name")
			require.Equal(t, want.tenantID, listed.text(t, i, "partner_tenant_id"))
			require.Equal(t, want.tenantName, listed.text(t, i, "partner_tenant_name"))
			require.Equal(t, want.clientID, listed.text(t, i, "partner_client_id"))
			if want.clientID == "" {
				require.NotContains(t, item, "partner_client_name")
			} else {
				require.Equal(t, "Class OAuth Partner", listed.text(t, i, "partner_client_name"))
			}
			// Pre-existing user fields keep their JSON types.
			var username string
			require.NoError(t, json.Unmarshal(item["username"], &username))
			var role, status int
			require.NoError(t, json.Unmarshal(item["role"], &role))
			require.NoError(t, json.Unmarshal(item["status"], &status))
		}
		return listed
	}
	// Walks every page of one filter on one entry: total == rows, no duplicate.
	walk := func(path, query string) []int {
		t.Helper()
		ids := []int{}
		seen := map[int]bool{}
		total := -1
		for number := 1; ; number++ {
			require.Less(t, number, 100)
			listed := page(path + "?" + query + "&page_size=2&p=" + strconv.Itoa(number))
			if total < 0 {
				total = listed.total
			}
			require.Equal(t, total, listed.total)
			for _, item := range listed.items {
				var id int
				require.NoError(t, json.Unmarshal(item["id"], &id))
				require.False(t, seen[id], "user %d repeated across pages", id)
				seen[id] = true
				ids = append(ids, id)
			}
			if len(listed.items) < 2 {
				break
			}
		}
		require.Len(t, ids, total, "total equals the rows returned across all pages")
		return ids
	}
	merchants := []int{external.Id, subkey.Id, offTenant.Id, offAccount.Id, orphan.Id, both.Id, deleted.Id, expired.Id}
	ordinaries := []int{ordinary.Id, lookalike.Id, oauthOnly.Id, subscribed.Id}
	enabledMembers := []int{external.Id, subkey.Id, offAccount.Id, both.Id, deleted.Id, expired.Id}
	everyone := append(append([]int{}, ordinaries...), merchants...)

	t.Run("both entries return the same classified set", func(t *testing.T) {
		for query, want := range map[string][]int{
			"sort_by=id&sort_order=asc":                                          everyone,
			"user_category=all&sort_by=id&sort_order=asc":                        everyone,
			"user_category=ordinary&sort_by=id&sort_order=asc":                   ordinaries,
			"user_category=merchant&sort_by=id&sort_order=asc":                   merchants,
			"tenant_id=" + enabledID + "&sort_by=id&sort_order=asc":              enabledMembers,
			"user_category=all&tenant_id=" + enabledID + "&sort_by=id":           nil,
			"user_category=merchant&tenant_id=" + enabledID + "&sort_by=id":      nil,
			"tenant_id=" + disabledID + "&sort_by=username&sort_order=desc":      {offTenant.Id},
			"tenant_id=9007199254740993&sort_by=id&sort_order=asc":               {orphan.Id},
			"tenant_id=9007199254740992&sort_by=id&sort_order=asc":               {},
			"user_category=merchant&tenant_id=9223372036854775807&sort_by=quota": {},
		} {
			listed := walk(partnerTenantUserClassificationListPath, query)
			searched := walk(partnerTenantUserClassificationSearchPath, query)
			require.Equal(t, listed, searched, query)
			if want == nil {
				want = enabledMembers
			}
			require.ElementsMatch(t, want, listed, query)
		}
	})

	t.Run("composes with the existing search filters and the OAuth dimension", func(t *testing.T) {
		search := partnerTenantUserClassificationSearchPath
		require.ElementsMatch(t, []int{deleted.Id}, walk(search, "user_category=merchant&status=-1"), "soft-deleted mapping stays a merchant")
		require.Empty(t, walk(search, "user_category=ordinary&status=-1"))
		require.ElementsMatch(t, []int{lookalike.Id}, walk(search, "user_category=ordinary&keyword=p_class"))
		require.ElementsMatch(t, []int{oauthOnly.Id, both.Id}, walk(search, "partner_client_id=pc_class_fixture"))
		require.ElementsMatch(t, []int{both.Id}, walk(search, "partner_client_id=pc_class_fixture&user_category=merchant"))
		require.ElementsMatch(t, []int{both.Id}, walk(search, "partner_client_id=pc_class_fixture&tenant_id="+enabledID))
		require.ElementsMatch(t, []int{oauthOnly.Id}, walk(search, "partner_client_id=pc_class_fixture&user_category=ordinary"))
		require.Empty(t, walk(search, "partner_client_id=pc_class_fixture&tenant_id="+disabledID))
		require.Empty(t, walk(search, "partner_client_id="+enabledID), "a tenant ID is not an OAuth client_id")
		activeEnabledMembers := []int{external.Id, subkey.Id, offAccount.Id, both.Id, expired.Id}
		require.ElementsMatch(t, activeEnabledMembers, walk(search, "tenant_id="+enabledID+"&role=1&status=1&keyword=class"))
		require.Empty(t, walk(search, "user_category=merchant&role=10"))
		// The group filter is not combined at this layer: its column name is
		// initialised only inside the model package, whose PostgreSQL suite owns
		// the group matrix.
		// Every sort option under the other filters at once: total equals the
		// rows of all pages and no user repeats (asserted by walk).
		for _, sortBy := range []string{"id", "username", "quota", "group", "created_at", "last_login_at"} {
			for _, direction := range []string{"asc", "desc"} {
				query := "user_category=merchant&tenant_id=" + enabledID + "&status=1&role=1&keyword=class&sort_by=" + sortBy + "&sort_order=" + direction
				require.ElementsMatch(t, activeEnabledMembers, walk(search, query), query)
			}
		}
		// A subscription is not a classification signal in either direction.
		require.ElementsMatch(t, []int{subscribed.Id}, walk(search, "user_category=ordinary&keyword=class_subscribed"))
		require.Empty(t, walk(search, "user_category=merchant&keyword=class_subscribed"))
		require.ElementsMatch(t, []int{expired.Id}, walk(search, "user_category=merchant&keyword=p_class_expired"))
		require.Empty(t, walk(search, "user_category=ordinary&keyword=p_class_expired"))
	})

	t.Run("an owner lookup failure fails the request instead of showing ordinary users", func(t *testing.T) {
		swapPartnerTenantUserClassificationOwners(t, func([]int) (map[int]model.PartnerTenantOwner, error) {
			return nil, errors.New("pq: driver detail " + marker + " SELECT secret_hash")
		})
		for _, target := range []string{
			partnerTenantUserClassificationListPath + "?page_size=5",
			partnerTenantUserClassificationSearchPath + "?user_category=merchant&page_size=5",
		} {
			response := get(target)
			require.Equal(t, http.StatusServiceUnavailable, response.Code, target)
			for _, forbidden := range []string{"ordinary", "merchant", "items", "p_class", "SELECT", "pq:", "driver"} {
				require.NotContains(t, response.Body.String(), forbidden, target)
			}
			require.Contains(t, response.Body.String(), `"success":false`)
		}
		// An empty page needs no owner lookup, so it still succeeds.
		response := get(partnerTenantUserClassificationSearchPath + "?tenant_id=9007199254740992")
		require.Equal(t, http.StatusOK, response.Code, response.Body.String())
	})
}
