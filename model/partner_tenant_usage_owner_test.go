package model

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http/httptest"
	"os"
	"reflect"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

// A recognisable credential marker seeded into secret-bearing columns. No safe
// projection, SQL diagnostic or error text may ever contain it.
const partnerTenantUsageSecretMarker = "PTUSAGESECRETMARKER"

func partnerTenantUsageMarkerHash(index int) string {
	return fmt.Sprintf("%s%0*d", partnerTenantUsageSecretMarker, 64-len(partnerTenantUsageSecretMarker), index)
}

// Task-owned PostgreSQL only. The schema is unique per call and retained: this
// fixture never drops a schema or table and never truncates foreign data. A
// missing DSN fails the test; it is never a pass.
func setupPartnerTenantUsagePQ(t *testing.T, prefix string) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("TEST_PARTNER_USAGE_POSTGRES_DSN")
	require.NotEmpty(t, dsn, "BLOCKED: explicit task-owned Docker/pq DSN required; no SQLite/MySQL/production substitute")
	require.True(t, strings.HasPrefix(prefix, "pt_usage_"), "usage fixtures own the pt_usage_ schema prefix")
	db := setupPartnerTenantIsolatedPQ(t, dsn, prefix)
	require.NoError(t, MigratePartnerTenantIntegrationModes(db))
	require.NoError(t, db.AutoMigrate(&User{}, &Token{}, &SubscriptionPlan{}, &UserSubscription{}))
	require.NoError(t, MigratePartnerTenantSubscriptionKeys(db))
	require.NoError(t, db.AutoMigrate(&PartnerOAuthClient{}, &PartnerAccount{}, &PartnerOAuthBinding{}))
	return db
}

type partnerTenantUsageFixture struct {
	enabledTenant  *PartnerTenant
	disabledTenant *PartnerTenant
	orphanTenantID int64

	// Members: an account mapping exists, whatever its state.
	externalMember        int
	subscriptionKeyMember int
	disabledTenantMember  int
	disabledAccountMember int
	orphanTenantMember    int
	deletedUserMember     int

	// Confirmed non-members: no account mapping.
	ordinary           int
	subscribedOrdinary int
	prefixedOrdinary   int
	oauthOnly          int

	accounts map[int]*PartnerTenantAccount
}

func (f partnerTenantUsageFixture) members() []int {
	return []int{f.externalMember, f.subscriptionKeyMember, f.disabledTenantMember, f.disabledAccountMember, f.orphanTenantMember, f.deletedUserMember}
}

func (f partnerTenantUsageFixture) nonMembers() []int {
	return []int{f.ordinary, f.subscribedOrdinary, f.prefixedOrdinary, f.oauthOnly}
}

func seedPartnerTenantUsageFixture(t *testing.T, db *gorm.DB) partnerTenantUsageFixture {
	t.Helper()
	fixture := partnerTenantUsageFixture{orphanTenantID: 987654321, accounts: map[int]*PartnerTenantAccount{}}
	tenant := func(name, group, mode string, index int) *PartnerTenant {
		created, _, err := CreatePartnerTenantWithIntegrationMode(name, group, mode)
		require.NoError(t, err)
		marker := partnerTenantUsageMarkerHash(index)
		require.NoError(t, db.Model(&PartnerTenant{}).Where("id = ?", created.Id).Update("secret_hash", marker).Error)
		created.SecretHash = marker
		return created
	}
	fixture.enabledTenant = tenant("Usage Enabled", "usage-enabled-group", PartnerTenantIntegrationHostedH5, 1)
	fixture.disabledTenant = tenant("Usage Disabled", "usage-disabled-group", PartnerTenantIntegrationSubscriptionKey, 2)
	require.NoError(t, UpdatePartnerTenantStatus(fixture.disabledTenant.Id, PartnerTenantStatusDisabled))

	user := func(name, group string) int {
		row := &User{Username: name, AffCode: name, Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: group, AuthVersion: 1}
		require.NoError(t, db.Create(row).Error)
		return row.Id
	}
	account := func(tenantID int64, userID int, source, external string, status int) {
		row := &PartnerTenantAccount{
			IdentitySource:     source,
			TenantId:           tenantID,
			ExternalUserId:     external,
			ExternalUserIdHash: partnerTenantHash(partnerTenantUsageSecretMarker + ":" + strconv.Itoa(userID)),
			UserId:             userID,
			TokenId:            700000 + userID,
			Status:             status,
			CreatedAt:          1,
			UpdatedAt:          1,
		}
		if source == PartnerTenantIdentitySubscriptionKey {
			row.SourceOrderId = common.GetPointer(int64(800000 + userID))
		}
		require.NoError(t, db.Create(row).Error)
		fixture.accounts[userID] = row
	}
	externalID := func(suffix string) string { return partnerTenantUsageSecretMarker + "-external-" + suffix }

	fixture.externalMember = user("p_usage_external", fixture.enabledTenant.Group)
	account(fixture.enabledTenant.Id, fixture.externalMember, PartnerTenantIdentityExternal, externalID("h5"), PartnerTenantStatusEnabled)

	fixture.subscriptionKeyMember = user("p_usage_subkey", fixture.enabledTenant.Group)
	account(fixture.enabledTenant.Id, fixture.subscriptionKeyMember, PartnerTenantIdentitySubscriptionKey, "", PartnerTenantStatusEnabled)

	fixture.disabledTenantMember = user("p_usage_offtenant", fixture.disabledTenant.Group)
	account(fixture.disabledTenant.Id, fixture.disabledTenantMember, PartnerTenantIdentitySubscriptionKey, "", PartnerTenantStatusEnabled)

	fixture.disabledAccountMember = user("p_usage_offaccount", fixture.enabledTenant.Group)
	account(fixture.enabledTenant.Id, fixture.disabledAccountMember, PartnerTenantIdentityExternal, externalID("disabled"), PartnerTenantStatusDisabled)
	require.NoError(t, db.Model(&User{}).Where("id = ?", fixture.disabledAccountMember).Update("status", common.UserStatusDisabled).Error)

	fixture.orphanTenantMember = user("p_usage_orphan", "usage-orphan-group")
	account(fixture.orphanTenantID, fixture.orphanTenantMember, PartnerTenantIdentityExternal, externalID("orphan"), PartnerTenantStatusEnabled)

	fixture.deletedUserMember = user("p_usage_deleted", fixture.enabledTenant.Group)
	account(fixture.enabledTenant.Id, fixture.deletedUserMember, PartnerTenantIdentityExternal, externalID("deleted"), PartnerTenantStatusEnabled)
	require.NoError(t, db.Delete(&User{}, fixture.deletedUserMember).Error) // soft delete of this fixture's own row

	now := common.GetTimestamp()
	tenantPlan := &SubscriptionPlan{Title: "Usage Tenant", PartnerTenantId: fixture.enabledTenant.Id, Enabled: true, Currency: "CNY", PriceAmount: 9.99, DurationUnit: SubscriptionDurationMonth, DurationValue: 1, QuotaResetPeriod: SubscriptionResetMonthly, ApplicableGroup: fixture.enabledTenant.Group, AllowWalletOverflow: common.GetPointer(false), TotalAmount: 10}
	require.NoError(t, db.Create(tenantPlan).Error)
	// A lapsed merchant entitlement does not make its owner ordinary.
	require.NoError(t, db.Create(&UserSubscription{UserId: fixture.disabledAccountMember, PlanId: tenantPlan.Id, AmountTotal: 10, AmountUsed: 10, StartTime: now - 7200, EndTime: now - 3600, Status: "expired", Source: SubscriptionSourcePartner}).Error)

	fixture.ordinary = user("usage_ordinary", "default")

	fixture.subscribedOrdinary = user("usage_subscribed", "default")
	ordinaryPlan := &SubscriptionPlan{Title: "Usage Ordinary", Enabled: true, Currency: "USD", PriceAmount: 1, DurationUnit: SubscriptionDurationMonth, DurationValue: 1, QuotaResetPeriod: SubscriptionResetMonthly, ApplicableGroup: "default", AllowWalletOverflow: common.GetPointer(true), TotalAmount: 10}
	require.NoError(t, db.Create(ordinaryPlan).Error)
	require.NoError(t, db.Create(&UserSubscription{UserId: fixture.subscribedOrdinary, PlanId: ordinaryPlan.Id, AmountTotal: 10, StartTime: now - 60, EndTime: now + 3600, Status: "active", Source: "order"}).Error)

	// Same username prefix and even the merchant's dedicated group, but no mapping.
	fixture.prefixedOrdinary = user("p_usage_lookalike", fixture.enabledTenant.Group)

	fixture.oauthOnly = user("usage_oauth_only", "default")
	require.NoError(t, db.Create(&PartnerOAuthClient{ClientId: "pc_usage_fixture", Name: "Usage OAuth Partner", TokenAuthMethod: PartnerOAuthTokenAuthMethodBasic, RedirectURIs: "[]", Scopes: "profile", Status: PartnerOAuthClientStatusEnabled, CreatedAt: now, UpdatedAt: now}).Error)
	require.NoError(t, db.Create(&PartnerAccount{ClientId: "pc_usage_fixture", ExternalUserId: "usage-oauth-external", ExternalUserIdHash: partnerTenantHash("usage-oauth-external"), UserId: fixture.oauthOnly, Status: PartnerAccountStatusActive, CreatedAt: now, UpdatedAt: now}).Error)
	require.NoError(t, db.Create(&PartnerOAuthBinding{BindingId: "pb_usage_fixture", ClientId: "pc_usage_fixture", UserId: fixture.oauthOnly, Status: PartnerOAuthBindingStatusActive, CreatedAt: now}).Error)
	return fixture
}

func countPartnerTenantUsageQueries(t *testing.T, db *gorm.DB) *int {
	t.Helper()
	count := new(int)
	name := "pt_usage_count_" + strconv.FormatInt(time.Now().UnixNano(), 10)
	require.NoError(t, db.Callback().Query().Before("gorm:query").Register(name, func(*gorm.DB) { *count++ }))
	t.Cleanup(func() { _ = db.Callback().Query().Remove(name) })
	return count
}

func failPartnerTenantUsageQueries(t *testing.T, db *gorm.DB, cause error) *bool {
	t.Helper()
	enabled := new(bool)
	name := "pt_usage_fail_" + strconv.FormatInt(time.Now().UnixNano(), 10)
	require.NoError(t, db.Callback().Query().Before("gorm:query").Register(name, func(tx *gorm.DB) {
		if *enabled {
			_ = tx.AddError(cause)
		}
	}))
	t.Cleanup(func() { _ = db.Callback().Query().Remove(name) })
	return enabled
}

// Pure structural guard (no database): the shared projections can never grow a
// credential-bearing field or become directly serializable unnoticed.
func TestPartnerTenantUsageOwnerProjectionShape(t *testing.T) {
	fields := func(value any) []string {
		kind := reflect.TypeOf(value)
		names := make([]string, 0, kind.NumField())
		for i := range kind.NumField() {
			require.Equal(t, "-", kind.Field(i).Tag.Get("json"), "%s.%s must not serialize directly", kind.Name(), kind.Field(i).Name)
			names = append(names, kind.Field(i).Name)
		}
		return names
	}
	require.Equal(t, []string{"TenantId", "TenantName", "AccountId", "UserId", "IdentitySource"}, fields(PartnerTenantOwner{}))
	require.Equal(t, []string{"Id", "Name"}, fields(PartnerTenantOption{}))
	raw, err := json.Marshal(PartnerTenantOwner{TenantId: 9007199254740993, TenantName: "n", AccountId: 2, UserId: 3, IdentitySource: PartnerTenantIdentityExternal})
	require.NoError(t, err)
	require.JSONEq(t, `{}`, string(raw))

	cause := errors.New("driver detail " + partnerTenantUsageSecretMarker)
	failure := partnerTenantOwnerLookupFailed(cause)
	require.ErrorIs(t, failure, ErrPartnerTenantOwnerLookup)
	require.ErrorIs(t, failure, cause)
	require.Equal(t, ErrPartnerTenantOwnerLookup.Error(), failure.Error())
	require.NotContains(t, failure.Error(), partnerTenantUsageSecretMarker)
}

// No database needed: an uninitialized main database is a lookup failure on
// every path, never a "non-member" answer or an empty option page.
func TestPartnerTenantUsageOwnerNilDatabase(t *testing.T) {
	previous := DB
	DB = nil
	t.Cleanup(func() { DB = previous })

	owner, member, err := GetPartnerTenantOwner(1)
	require.ErrorIs(t, err, ErrPartnerTenantOwnerLookup)
	require.False(t, member)
	require.Equal(t, PartnerTenantOwner{}, owner)

	owners, err := GetPartnerTenantOwners([]int{1, 2})
	require.ErrorIs(t, err, ErrPartnerTenantOwnerLookup)
	require.Nil(t, owners)
	owners, err = GetPartnerTenantOwners(nil)
	require.NoError(t, err, "an empty batch needs no database")
	require.Empty(t, owners)

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	for _, requestContext := range []*gin.Context{nil, c} {
		owner, member, err = PartnerTenantOwnerForRequest(requestContext, 1)
		require.ErrorIs(t, err, ErrPartnerTenantOwnerLookup)
		require.False(t, member)
		require.Equal(t, PartnerTenantOwner{}, owner)
	}
	_, memoized := c.Get(partnerTenantOwnerContextKeyPrefix + "1")
	require.False(t, memoized, "a failure is never memoized")

	options, total, err := ListPartnerTenantOptions("", 0, 10)
	require.ErrorIs(t, err, ErrPartnerTenantOwnerLookup)
	require.Nil(t, options)
	require.Zero(t, total)
	_, found, err := GetPartnerTenantOption(1)
	require.ErrorIs(t, err, ErrPartnerTenantOwnerLookup)
	require.False(t, found)
	// Bounds are still rejected first, as a query error rather than a failure.
	_, _, err = ListPartnerTenantOptions("", 0, 0)
	require.ErrorIs(t, err, ErrPartnerTenantOptionQuery)
	require.NotErrorIs(t, err, ErrPartnerTenantOwnerLookup)
}

func TestPartnerTenantUsageOwnerSingleLookup(t *testing.T) {
	db := setupPartnerTenantUsagePQ(t, "pt_usage_owner_single_")
	fixture := seedPartnerTenantUsageFixture(t, db)

	for _, test := range []struct {
		name, tenantName, source string
		userID                   int
		tenantID                 int64
	}{
		{"external identity", fixture.enabledTenant.Name, PartnerTenantIdentityExternal, fixture.externalMember, fixture.enabledTenant.Id},
		{"subscription_key identity", fixture.enabledTenant.Name, PartnerTenantIdentitySubscriptionKey, fixture.subscriptionKeyMember, fixture.enabledTenant.Id},
		{"disabled tenant", fixture.disabledTenant.Name, PartnerTenantIdentitySubscriptionKey, fixture.disabledTenantMember, fixture.disabledTenant.Id},
		{"disabled account, disabled user, expired entitlement", fixture.enabledTenant.Name, PartnerTenantIdentityExternal, fixture.disabledAccountMember, fixture.enabledTenant.Id},
		{"missing tenant row", "", PartnerTenantIdentityExternal, fixture.orphanTenantMember, fixture.orphanTenantID},
		{"soft-deleted user", fixture.enabledTenant.Name, PartnerTenantIdentityExternal, fixture.deletedUserMember, fixture.enabledTenant.Id},
	} {
		t.Run("member: "+test.name, func(t *testing.T) {
			owner, member, err := GetPartnerTenantOwner(test.userID)
			require.NoError(t, err)
			require.True(t, member)
			require.Equal(t, PartnerTenantOwner{
				TenantId:       test.tenantID,
				TenantName:     test.tenantName,
				AccountId:      fixture.accounts[test.userID].Id,
				UserId:         test.userID,
				IdentitySource: test.source,
			}, owner)
		})
	}
	for name, userID := range map[string]int{
		"ordinary user":                        fixture.ordinary,
		"ordinary user with a subscription":    fixture.subscribedOrdinary,
		"p_ username in the merchant's group":  fixture.prefixedOrdinary,
		"Partner OAuth or Server account only": fixture.oauthOnly,
		"unknown user ID":                      2000000000,
		"zero user ID":                         0,
	} {
		t.Run("non-member: "+name, func(t *testing.T) {
			owner, member, err := GetPartnerTenantOwner(userID)
			require.NoError(t, err)
			require.False(t, member)
			require.Equal(t, PartnerTenantOwner{}, owner)
		})
	}

	t.Run("lookup failure is an error, never non-member", func(t *testing.T) {
		cause := errors.New("forced owner query failure " + partnerTenantUsageSecretMarker)
		failing := failPartnerTenantUsageQueries(t, db, cause)
		*failing = true
		for _, userID := range []int{fixture.externalMember, fixture.ordinary} {
			owner, member, err := GetPartnerTenantOwner(userID)
			require.Error(t, err)
			require.ErrorIs(t, err, ErrPartnerTenantOwnerLookup)
			require.ErrorIs(t, err, cause)
			require.NotContains(t, err.Error(), partnerTenantUsageSecretMarker, "bounded text only")
			require.False(t, member)
			require.Equal(t, PartnerTenantOwner{}, owner)
		}
		*failing = false
		_, member, err := GetPartnerTenantOwner(fixture.externalMember)
		require.NoError(t, err)
		require.True(t, member, "a failure leaves no cached negative answer behind")
	})

	t.Run("membership bool cache is neither read nor written", func(t *testing.T) {
		ResetPartnerTenantMembershipCache()
		_, member, err := GetPartnerTenantOwner(fixture.externalMember)
		require.NoError(t, err)
		require.True(t, member)
		_, member, err = GetPartnerTenantOwner(fixture.ordinary)
		require.NoError(t, err)
		require.False(t, member)
		for _, userID := range []int{fixture.externalMember, fixture.ordinary} {
			_, found, _ := partnerTenantMembershipCache.Get(userID)
			require.False(t, found, "owner lookup must not populate the bool cache")
		}
		// A stale or poisoned bool entry cannot change the owner answer.
		partnerTenantMembershipCache.Set(fixture.externalMember, false)
		partnerTenantMembershipCache.Set(fixture.ordinary, true)
		_, member, err = GetPartnerTenantOwner(fixture.externalMember)
		require.NoError(t, err)
		require.True(t, member)
		_, member, err = GetPartnerTenantOwner(fixture.ordinary)
		require.NoError(t, err)
		require.False(t, member)
		ResetPartnerTenantMembershipCache()
	})

	t.Run("no shared negative cache for a mapping created later", func(t *testing.T) {
		row := &User{Username: "p_usage_late", AffCode: "p_usage_late", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: fixture.enabledTenant.Group, AuthVersion: 1}
		require.NoError(t, db.Create(row).Error)
		_, member, err := GetPartnerTenantOwner(row.Id)
		require.NoError(t, err)
		require.False(t, member)
		late := &PartnerTenantAccount{IdentitySource: PartnerTenantIdentitySubscriptionKey, TenantId: fixture.enabledTenant.Id, ExternalUserIdHash: partnerTenantHash("usage-late"), UserId: row.Id, TokenId: 700000 + row.Id, Status: PartnerTenantStatusEnabled, SourceOrderId: common.GetPointer(int64(800000 + row.Id))}
		require.NoError(t, db.Create(late).Error)
		owner, member, err := GetPartnerTenantOwner(row.Id)
		require.NoError(t, err)
		require.True(t, member)
		require.Equal(t, late.Id, owner.AccountId)
	})

	t.Run("empty identity source reads as external", func(t *testing.T) {
		row := &User{Username: "p_usage_legacy", AffCode: "p_usage_legacy", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: fixture.enabledTenant.Group, AuthVersion: 1}
		require.NoError(t, db.Create(row).Error)
		legacy := &PartnerTenantAccount{IdentitySource: PartnerTenantIdentityExternal, TenantId: fixture.enabledTenant.Id, ExternalUserId: "usage-legacy", ExternalUserIdHash: partnerTenantHash("usage-legacy"), UserId: row.Id, TokenId: 700000 + row.Id, Status: PartnerTenantStatusEnabled}
		require.NoError(t, db.Create(legacy).Error)
		// A pre-column row that MigratePartnerTenantSubscriptionKeys has not
		// backfilled yet; the read applies the same rule as that migration.
		require.NoError(t, db.Model(&PartnerTenantAccount{}).Where("id = ?", legacy.Id).Update("identity_source", "").Error)
		owner, member, err := GetPartnerTenantOwner(row.Id)
		require.NoError(t, err)
		require.True(t, member)
		require.Equal(t, legacy.Id, owner.AccountId)
		require.Equal(t, PartnerTenantIdentityExternal, owner.IdentitySource)
		batch, err := GetPartnerTenantOwners([]int{row.Id})
		require.NoError(t, err)
		require.Equal(t, owner, batch[row.Id])
	})

	t.Run("diagnostic SQL reads no credential column", func(t *testing.T) {
		var statements bytes.Buffer
		DB = db.Session(&gorm.Session{Logger: gormlogger.New(log.New(&statements, "", 0), gormlogger.Config{LogLevel: gormlogger.Info})})
		t.Cleanup(func() { DB = db })
		_, _, err := GetPartnerTenantOwner(fixture.externalMember)
		require.NoError(t, err)
		_, err = GetPartnerTenantOwners(append(fixture.members(), fixture.nonMembers()...))
		require.NoError(t, err)
		DB = db
		require.Contains(t, statements.String(), "partner_tenant_accounts")
		for _, forbidden := range []string{"secret_hash", "external_user_id", "token_id", "source_order_id", partnerTenantUsageSecretMarker} {
			require.NotContains(t, statements.String(), forbidden)
		}
	})
}

func TestPartnerTenantUsageOwnerBatchLookup(t *testing.T) {
	db := setupPartnerTenantUsagePQ(t, "pt_usage_owner_batch_")
	fixture := seedPartnerTenantUsageFixture(t, db)
	queries := countPartnerTenantUsageQueries(t, db)

	t.Run("empty input issues no query", func(t *testing.T) {
		for _, input := range [][]int{nil, {}} {
			before := *queries
			owners, err := GetPartnerTenantOwners(input)
			require.NoError(t, err)
			require.NotNil(t, owners)
			require.Empty(t, owners)
			require.Equal(t, before, *queries)
		}
	})

	t.Run("mixed page equals single lookups in one query", func(t *testing.T) {
		page := append(fixture.members(), fixture.nonMembers()...)
		page = append(page, fixture.externalMember, 0, 2000000000) // duplicate, zero and unknown IDs
		before := *queries
		owners, err := GetPartnerTenantOwners(page)
		require.NoError(t, err)
		require.Equal(t, before+1, *queries, "one query for the whole page, never one per row")
		require.Len(t, owners, len(fixture.members()))
		for _, userID := range page {
			single, member, err := GetPartnerTenantOwner(userID)
			require.NoError(t, err)
			batch, present := owners[userID]
			require.Equal(t, member, present, "user %d", userID)
			require.Equal(t, single, batch, "user %d", userID)
		}
		for _, userID := range fixture.nonMembers() {
			require.NotContains(t, owners, userID)
		}
	})

	t.Run("large input uses bounded chunks", func(t *testing.T) {
		ids := make([]int, 0, 2*partnerTenantOwnerBatchSize+len(fixture.members())+1)
		for i := range 2*partnerTenantOwnerBatchSize + 1 {
			ids = append(ids, 1000000000+i)
		}
		ids = append(ids, fixture.members()...)
		before := *queries
		owners, err := GetPartnerTenantOwners(ids)
		require.NoError(t, err)
		require.Equal(t, before+3, *queries)
		require.Len(t, owners, len(fixture.members()))
	})

	t.Run("failure returns an error and no partial result", func(t *testing.T) {
		cause := errors.New("forced batch failure " + partnerTenantUsageSecretMarker)
		failing := failPartnerTenantUsageQueries(t, db, cause)
		*failing = true
		owners, err := GetPartnerTenantOwners(fixture.members())
		*failing = false
		require.ErrorIs(t, err, ErrPartnerTenantOwnerLookup)
		require.ErrorIs(t, err, cause)
		require.NotContains(t, err.Error(), partnerTenantUsageSecretMarker)
		require.Nil(t, owners)
	})

	t.Run("failure in a later chunk returns no partial result", func(t *testing.T) {
		cause := errors.New("forced later chunk failure " + partnerTenantUsageSecretMarker)
		issued := 0
		name := "pt_usage_fail_later_" + strconv.FormatInt(time.Now().UnixNano(), 10)
		require.NoError(t, db.Callback().Query().Before("gorm:query").Register(name, func(tx *gorm.DB) {
			issued++
			if issued > 1 {
				_ = tx.AddError(cause)
			}
		}))
		t.Cleanup(func() { _ = db.Callback().Query().Remove(name) })
		// Every member is resolved by the first chunk; the second chunk fails.
		ids := append([]int{}, fixture.members()...)
		for i := range partnerTenantOwnerBatchSize {
			ids = append(ids, 1500000000+i)
		}
		owners, err := GetPartnerTenantOwners(ids)
		require.ErrorIs(t, err, ErrPartnerTenantOwnerLookup)
		require.ErrorIs(t, err, cause)
		require.Nil(t, owners, "members found before the failure are not returned")
		require.Equal(t, 2, issued, "the first chunk succeeded and the second failed")
	})
}

func TestPartnerTenantUsageOwnerRequestSnapshot(t *testing.T) {
	db := setupPartnerTenantUsagePQ(t, "pt_usage_owner_request_")
	fixture := seedPartnerTenantUsageFixture(t, db)
	queries := countPartnerTenantUsageQueries(t, db)
	gin.SetMode(gin.TestMode)
	newContext := func() *gin.Context {
		c, _ := gin.CreateTestContext(httptest.NewRecorder())
		return c
	}

	t.Run("memoized once per request and per user ID", func(t *testing.T) {
		c := newContext()
		// The authenticated context user differs from the ID being resolved,
		// as in channel tests: the memo follows the ID actually passed.
		c.Set("id", fixture.ordinary)
		before := *queries
		first, member, err := PartnerTenantOwnerForRequest(c, fixture.externalMember)
		require.NoError(t, err)
		require.True(t, member)
		require.Equal(t, fixture.externalMember, first.UserId)
		again, member, err := PartnerTenantOwnerForRequest(c, fixture.externalMember)
		require.NoError(t, err)
		require.True(t, member)
		require.Equal(t, first, again)
		require.Equal(t, before+1, *queries)

		other, member, err := PartnerTenantOwnerForRequest(c, fixture.disabledTenantMember)
		require.NoError(t, err)
		require.True(t, member)
		require.Equal(t, fixture.disabledTenantMember, other.UserId)
		require.Equal(t, fixture.disabledTenant.Id, other.TenantId)
		require.NotEqual(t, first, other)

		none, member, err := PartnerTenantOwnerForRequest(c, fixture.ordinary)
		require.NoError(t, err)
		require.False(t, member, "a non-member must not inherit the member resolved earlier in this context")
		require.Equal(t, PartnerTenantOwner{}, none)
		require.Equal(t, before+3, *queries)

		_, member, err = PartnerTenantOwnerForRequest(c, fixture.ordinary)
		require.NoError(t, err)
		require.False(t, member)
		still, member, err := PartnerTenantOwnerForRequest(c, fixture.externalMember)
		require.NoError(t, err)
		require.True(t, member)
		require.Equal(t, first, still)
		require.Equal(t, before+3, *queries, "all three answers are served from the request memo")
	})

	t.Run("nil context performs a direct lookup", func(t *testing.T) {
		before := *queries
		for range 2 {
			owner, member, err := PartnerTenantOwnerForRequest(nil, fixture.subscriptionKeyMember)
			require.NoError(t, err)
			require.True(t, member)
			require.Equal(t, PartnerTenantIdentitySubscriptionKey, owner.IdentitySource)
		}
		require.Equal(t, before+2, *queries)
	})

	t.Run("requests do not share a memo", func(t *testing.T) {
		row := &User{Username: "p_usage_request", AffCode: "p_usage_request", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: fixture.enabledTenant.Group, AuthVersion: 1}
		require.NoError(t, db.Create(row).Error)
		earlier := newContext()
		_, member, err := PartnerTenantOwnerForRequest(earlier, row.Id)
		require.NoError(t, err)
		require.False(t, member)
		require.NoError(t, db.Create(&PartnerTenantAccount{IdentitySource: PartnerTenantIdentitySubscriptionKey, TenantId: fixture.enabledTenant.Id, ExternalUserIdHash: partnerTenantHash("usage-request"), UserId: row.Id, TokenId: 700000 + row.Id, Status: PartnerTenantStatusEnabled, SourceOrderId: common.GetPointer(int64(800000 + row.Id))}).Error)
		_, member, err = PartnerTenantOwnerForRequest(newContext(), row.Id)
		require.NoError(t, err)
		require.True(t, member, "a new request sees the committed mapping; nothing negative is shared")
		_, member, err = PartnerTenantOwnerForRequest(earlier, row.Id)
		require.NoError(t, err)
		require.False(t, member, "the earlier request keeps its own snapshot")
	})

	t.Run("a mismatched or malformed memo entry is never served", func(t *testing.T) {
		c := newContext()
		// Even when another user's snapshot or a foreign value sits under this
		// user's key, the answer comes from this user's own lookup.
		c.Set(partnerTenantOwnerContextKeyPrefix+strconv.Itoa(fixture.ordinary), partnerTenantOwnerSnapshot{
			userID: fixture.externalMember,
			owner:  PartnerTenantOwner{TenantId: fixture.enabledTenant.Id, UserId: fixture.externalMember},
			member: true,
		})
		c.Set(partnerTenantOwnerContextKeyPrefix+strconv.Itoa(fixture.externalMember), "not a snapshot")
		owner, member, err := PartnerTenantOwnerForRequest(c, fixture.ordinary)
		require.NoError(t, err)
		require.False(t, member)
		require.Equal(t, PartnerTenantOwner{}, owner)
		owner, member, err = PartnerTenantOwnerForRequest(c, fixture.externalMember)
		require.NoError(t, err)
		require.True(t, member)
		require.Equal(t, fixture.externalMember, owner.UserId)
		require.Equal(t, fixture.accounts[fixture.externalMember].Id, owner.AccountId)
	})

	t.Run("a failure stays a failure and is not memoized", func(t *testing.T) {
		cause := errors.New("forced request failure " + partnerTenantUsageSecretMarker)
		failing := failPartnerTenantUsageQueries(t, db, cause)
		c := newContext()
		*failing = true
		for range 2 {
			owner, member, err := PartnerTenantOwnerForRequest(c, fixture.externalMember)
			require.ErrorIs(t, err, ErrPartnerTenantOwnerLookup)
			require.False(t, member)
			require.Equal(t, PartnerTenantOwner{}, owner)
		}
		_, _, err := PartnerTenantOwnerForRequest(nil, fixture.externalMember)
		require.ErrorIs(t, err, ErrPartnerTenantOwnerLookup)
		*failing = false
		owner, member, err := PartnerTenantOwnerForRequest(c, fixture.externalMember)
		require.NoError(t, err)
		require.True(t, member)
		require.Equal(t, fixture.externalMember, owner.UserId)
	})
}

func TestPartnerTenantUsageOptionsQuery(t *testing.T) {
	db := setupPartnerTenantUsagePQ(t, "pt_usage_options_model_")
	fixture := seedPartnerTenantUsageFixture(t, db)
	wildcard, _, err := CreatePartnerTenantWithIntegrationMode("Rate 100%_Off!", "usage-wildcard-group", PartnerTenantIntegrationSubscriptionKey)
	require.NoError(t, err)
	plain, _, err := CreatePartnerTenantWithIntegrationMode("Rate 100 percent", "usage-plain-group", PartnerTenantIntegrationSubscriptionKey)
	require.NoError(t, err)
	// Larger than 2^53: the ID must stay exact through every projection.
	large := &PartnerTenant{Id: 9007199254740993, IntegrationMode: PartnerTenantIntegrationSubscriptionKey, Name: "Usage Large", Group: "usage-large-group", SecretHash: partnerTenantUsageMarkerHash(3), Status: PartnerTenantStatusEnabled}
	require.NoError(t, db.Create(large).Error)

	t.Run("bounded pages, newest first, disabled included", func(t *testing.T) {
		all, total, err := ListPartnerTenantOptions("", 0, PartnerTenantOptionMaxPageSize)
		require.NoError(t, err)
		require.EqualValues(t, 5, total)
		require.Equal(t, []PartnerTenantOption{
			{Id: large.Id, Name: large.Name},
			{Id: plain.Id, Name: plain.Name},
			{Id: wildcard.Id, Name: wildcard.Name},
			{Id: fixture.disabledTenant.Id, Name: fixture.disabledTenant.Name},
			{Id: fixture.enabledTenant.Id, Name: fixture.enabledTenant.Name},
		}, all)

		first, total, err := ListPartnerTenantOptions("", 0, 2)
		require.NoError(t, err)
		require.EqualValues(t, 5, total)
		require.Equal(t, all[:2], first)
		last, total, err := ListPartnerTenantOptions("", 4, 2)
		require.NoError(t, err)
		require.EqualValues(t, 5, total)
		require.Equal(t, all[4:], last)
		beyond, total, err := ListPartnerTenantOptions("", 50, 2)
		require.NoError(t, err)
		require.EqualValues(t, 5, total)
		require.Empty(t, beyond)
	})

	t.Run("out-of-bounds queries never reach the database", func(t *testing.T) {
		queries := countPartnerTenantUsageQueries(t, db)
		for _, test := range []struct {
			keyword       string
			offset, limit int
		}{
			{"", 0, 0},
			{"", 0, -1},
			{"", 0, PartnerTenantOptionMaxPageSize + 1},
			{"", -1, 10},
			{strings.Repeat("a", PartnerTenantOptionMaxKeywordRunes+1), 0, 10},
			{"line\nbreak", 0, 10},
			{string([]byte{0xff, 0xfe}), 0, 10},
		} {
			options, total, err := ListPartnerTenantOptions(test.keyword, test.offset, test.limit)
			require.ErrorIs(t, err, ErrPartnerTenantOptionQuery)
			require.Nil(t, options)
			require.Zero(t, total)
		}
		for _, id := range []int64{0, -1} {
			_, found, err := GetPartnerTenantOption(id)
			require.ErrorIs(t, err, ErrPartnerTenantOptionQuery)
			require.False(t, found)
		}
		require.Zero(t, *queries)
		// Positive control: the same counter does observe a valid query.
		_, _, err := ListPartnerTenantOptions("", 0, 1)
		require.NoError(t, err)
		require.Equal(t, 2, *queries, "count and page")
	})

	t.Run("keyword is a case-insensitive literal substring", func(t *testing.T) {
		names := func(keyword string) []string {
			options, total, err := ListPartnerTenantOptions(keyword, 0, PartnerTenantOptionMaxPageSize)
			require.NoError(t, err)
			require.EqualValues(t, len(options), total)
			result := make([]string, 0, len(options))
			for _, option := range options {
				result = append(result, option.Name)
			}
			return result
		}
		require.Equal(t, []string{plain.Name, wildcard.Name}, names("rate 100"))
		// Live wildcards would also match "Rate 100 percent" in the next three.
		require.Equal(t, []string{wildcard.Name}, names("100%"), "percent sign is literal")
		require.Equal(t, []string{wildcard.Name}, names("0%_"), "percent sign and underscore are literal")
		require.Empty(t, names("100_p"), "underscore is literal")
		require.Equal(t, []string{wildcard.Name}, names("off!"), "the escape character itself is literal")
		require.Equal(t, []string{fixture.disabledTenant.Name}, names("USAGE DISABLED"))
		require.Empty(t, names("no such merchant"))
		// Group names, modes and credentials are not searchable.
		require.Empty(t, names("usage-wildcard-group"))
		require.Empty(t, names(partnerTenantUsageSecretMarker))
		require.Empty(t, names(PartnerTenantIntegrationHostedH5))
	})

	t.Run("selected option resolves outside the page", func(t *testing.T) {
		first, _, err := ListPartnerTenantOptions("", 0, 1)
		require.NoError(t, err)
		require.Equal(t, []PartnerTenantOption{{Id: large.Id, Name: large.Name}}, first)
		for _, tenant := range []*PartnerTenant{fixture.enabledTenant, fixture.disabledTenant, large} {
			option, found, err := GetPartnerTenantOption(tenant.Id)
			require.NoError(t, err)
			require.True(t, found)
			require.Equal(t, PartnerTenantOption{Id: tenant.Id, Name: tenant.Name}, option)
		}
		option, found, err := GetPartnerTenantOption(fixture.orphanTenantID)
		require.NoError(t, err)
		require.False(t, found)
		require.Equal(t, PartnerTenantOption{}, option)
	})

	t.Run("diagnostic SQL reads only id and name", func(t *testing.T) {
		var statements bytes.Buffer
		DB = db.Session(&gorm.Session{Logger: gormlogger.New(log.New(&statements, "", 0), gormlogger.Config{LogLevel: gormlogger.Info})})
		t.Cleanup(func() { DB = db })
		_, _, err := ListPartnerTenantOptions("usage", 0, 10)
		require.NoError(t, err)
		_, _, err = GetPartnerTenantOption(fixture.enabledTenant.Id)
		require.NoError(t, err)
		DB = db
		require.Contains(t, statements.String(), "partner_tenants")
		for _, forbidden := range []string{"secret_hash", "integration_mode", "SELECT *", partnerTenantUsageSecretMarker} {
			require.NotContains(t, statements.String(), forbidden)
		}
	})

	t.Run("failure is bounded and distinguishable from an empty result", func(t *testing.T) {
		cause := errors.New("forced option failure " + partnerTenantUsageSecretMarker)
		failing := failPartnerTenantUsageQueries(t, db, cause)
		*failing = true
		options, total, err := ListPartnerTenantOptions("", 0, 10)
		require.ErrorIs(t, err, ErrPartnerTenantOwnerLookup)
		require.NotContains(t, err.Error(), partnerTenantUsageSecretMarker)
		require.Nil(t, options)
		require.Zero(t, total)
		_, found, err := GetPartnerTenantOption(fixture.enabledTenant.Id)
		require.ErrorIs(t, err, ErrPartnerTenantOwnerLookup)
		require.False(t, found)
		*failing = false
	})
}
