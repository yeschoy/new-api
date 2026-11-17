package model

import (
	"os"
	"sort"
	"strconv"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// Task-owned PostgreSQL only. The schema is unique per call and retained: this
// fixture never drops a schema or table and never truncates foreign data. A
// missing DSN fails the test; it is never a pass.
func setupPartnerTenantUserClassificationPQ(t *testing.T, prefix string) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("TEST_PARTNER_USER_CLASSIFICATION_POSTGRES_DSN")
	require.NotEmpty(t, dsn, "BLOCKED: explicit task-owned Docker/pq DSN required; no SQLite/MySQL/production substitute")
	require.True(t, strings.HasPrefix(prefix, "pt_user_class_"), "classification fixtures own the pt_user_class_ schema prefix")
	db := setupPartnerTenantIsolatedPQ(t, dsn, prefix)
	require.NoError(t, MigratePartnerTenantIntegrationModes(db))
	require.NoError(t, db.AutoMigrate(&User{}, &Token{}, &SubscriptionPlan{}, &UserSubscription{}))
	require.NoError(t, MigratePartnerTenantSubscriptionKeys(db))
	require.NoError(t, db.AutoMigrate(&PartnerOAuthClient{}, &PartnerAccount{}, &PartnerOAuthBinding{}))
	return db
}

// Pure contract (no database): what may and may not reach SQL.
func TestPartnerTenantUserClassificationFilterValidation(t *testing.T) {
	valid := []UserTenantFilter{
		{},
		{Category: UserTenantCategoryAll},
		{Category: UserTenantCategoryOrdinary},
		{Category: UserTenantCategoryMerchant},
		{TenantId: 1},
		{Category: UserTenantCategoryAll, TenantId: 9007199254740993},
		{Category: UserTenantCategoryMerchant, TenantId: 9223372036854775807},
	}
	for _, filter := range valid {
		require.NoError(t, filter.Validate(), "%+v", filter)
	}
	invalid := []UserTenantFilter{
		{Category: UserTenantCategoryOrdinary, TenantId: 1}, // contradictory
		{Category: "Merchant"},
		{Category: "tenant"},
		{Category: " "},
		{TenantId: -1},
		{Category: UserTenantCategoryMerchant, TenantId: -9},
	}
	for _, filter := range invalid {
		require.ErrorIs(t, filter.Validate(), ErrUserTenantFilter, "%+v", filter)
	}
	require.True(t, UserTenantFilter{}.IsZero())
	require.True(t, UserTenantFilter{Category: UserTenantCategoryAll}.IsZero())
	require.False(t, UserTenantFilter{Category: UserTenantCategoryMerchant}.IsZero())
	require.False(t, UserTenantFilter{Category: UserTenantCategoryOrdinary}.IsZero())
	require.False(t, UserTenantFilter{TenantId: 7}.IsZero())

	// The predicate is the account relation only: no status, plan, role, group,
	// username or OAuth partner table can decide the category.
	for _, predicate := range []string{userTenantAnyAccountExists, userTenantNoAccountExists, userTenantThisAccountExists} {
		require.Contains(t, predicate, "partner_tenant_accounts.user_id = users.id")
		for _, forbidden := range []string{"status", "username", "LIKE", "group", "role", "partner_accounts", "partner_tenants ", "subscription", "JOIN", "quota", "expire"} {
			require.NotContains(t, predicate, forbidden)
		}
	}
	require.Equal(t, 1, strings.Count(userTenantThisAccountExists, "?"), "tenant ID is a bound parameter")
	require.NotContains(t, userTenantAnyAccountExists, "?")

	// An invalid filter is rejected before a transaction is opened: with no
	// database at all the call still returns the typed error instead of panicking.
	previous := DB
	DB = nil
	t.Cleanup(func() { DB = previous })
	_, _, err := GetAllUsersWithTenantFilter(&common.PageInfo{Page: 1, PageSize: 10}, UserTenantFilter{Category: UserTenantCategoryOrdinary, TenantId: 3})
	require.ErrorIs(t, err, ErrUserTenantFilter)
	_, _, err = SearchUsersWithTenantFilter("", "", nil, nil, "", UserTenantFilter{Category: "unknown"}, 0, 10)
	require.ErrorIs(t, err, ErrUserTenantFilter)
}

type partnerTenantUserClassificationRow struct {
	id       int
	username string
	group    string
	role     int
	status   int
	deleted  bool
	tenantID int64 // 0 = no account mapping
	clientID string
}

type partnerTenantUserClassificationQuery struct {
	filter   UserTenantFilter
	keyword  string
	group    string
	role     *int
	status   *int
	clientID string
}

// The oracle is computed in Go from the seeded facts, never from the SQL under
// test.
func (q partnerTenantUserClassificationQuery) matches(row partnerTenantUserClassificationRow) bool {
	if q.keyword != "" && !strings.Contains(row.username, q.keyword) && strconv.Itoa(row.id) != q.keyword {
		return false
	}
	if q.group != "" && row.group != q.group {
		return false
	}
	if q.role != nil && row.role != *q.role {
		return false
	}
	if q.status != nil {
		if *q.status == -1 {
			if !row.deleted {
				return false
			}
		} else if row.deleted || row.status != *q.status {
			return false
		}
	}
	if q.clientID != "" && row.clientID != q.clientID {
		return false
	}
	if q.filter.TenantId != 0 && row.tenantID != q.filter.TenantId {
		return false
	}
	switch q.filter.Category {
	case UserTenantCategoryMerchant:
		return row.tenantID != 0
	case UserTenantCategoryOrdinary:
		return row.tenantID == 0
	}
	return true
}

// Walks every page and proves total == rows across pages with no duplicate.
func partnerTenantUserClassificationPages(t *testing.T, pageSize int, fetch func(page, size int) ([]*User, int64, error)) []int {
	t.Helper()
	ids := []int{}
	seen := map[int]struct{}{}
	total := int64(-1)
	for page := 1; ; page++ {
		require.Less(t, page, 500, "pagination must terminate")
		rows, count, err := fetch(page, pageSize)
		require.NoError(t, err)
		if total < 0 {
			total = count
		}
		require.Equal(t, total, count, "total is stable across pages")
		require.LessOrEqual(t, len(rows), pageSize)
		for _, row := range rows {
			_, duplicate := seen[row.Id]
			require.False(t, duplicate, "user %d repeated across pages", row.Id)
			seen[row.Id] = struct{}{}
			ids = append(ids, row.Id)
			require.Empty(t, row.Password)
		}
		if len(rows) < pageSize {
			break
		}
	}
	require.EqualValues(t, total, len(ids), "total equals the rows returned across all pages")
	return ids
}

func TestPartnerTenantUserClassificationPostgres(t *testing.T) {
	db := setupPartnerTenantUserClassificationPQ(t, "pt_user_class_model_")
	fixture := seedPartnerTenantUsageFixture(t, db)

	// A member that also has a Partner OAuth/Server relation: two dimensions.
	both := &User{Username: "p_class_both", AffCode: "p_class_both", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: fixture.enabledTenant.Group, AuthVersion: 1}
	require.NoError(t, db.Create(both).Error)
	bothAccount := &PartnerTenantAccount{IdentitySource: PartnerTenantIdentityExternal, TenantId: fixture.enabledTenant.Id, ExternalUserId: partnerTenantUsageSecretMarker + "-external-both", ExternalUserIdHash: partnerTenantHash(partnerTenantUsageSecretMarker + ":both"), UserId: both.Id, TokenId: 700000 + both.Id, Status: PartnerTenantStatusEnabled, CreatedAt: 1, UpdatedAt: 1}
	require.NoError(t, db.Create(bothAccount).Error)
	fixture.accounts[both.Id] = bothAccount
	require.NoError(t, db.Create(&PartnerAccount{ClientId: "pc_usage_fixture", ExternalUserId: "class-oauth-both", ExternalUserIdHash: partnerTenantHash("class-oauth-both"), UserId: both.Id, Status: PartnerAccountStatusActive, CreatedAt: 1, UpdatedAt: 1}).Error)
	// An administrator without a mapping, for the role dimension.
	admin := &User{Username: "class_admin", AffCode: "class_admin", Role: common.RoleAdminUser, Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1}
	require.NoError(t, db.Create(admin).Error)

	var stored []User
	require.NoError(t, db.Unscoped().Order("id ASC").Find(&stored).Error)
	oauth := map[int]string{fixture.oauthOnly: "pc_usage_fixture", both.Id: "pc_usage_fixture"}
	rows := make([]partnerTenantUserClassificationRow, 0, len(stored))
	for _, user := range stored {
		row := partnerTenantUserClassificationRow{id: user.Id, username: user.Username, group: user.Group, role: user.Role, status: user.Status, deleted: user.DeletedAt.Valid, clientID: oauth[user.Id]}
		if account, member := fixture.accounts[user.Id]; member {
			row.tenantID = account.TenantId
		}
		rows = append(rows, row)
	}
	require.Len(t, rows, len(fixture.members())+len(fixture.nonMembers())+2)
	expected := func(query partnerTenantUserClassificationQuery) []int {
		ids := []int{}
		for _, row := range rows {
			if query.matches(row) {
				ids = append(ids, row.id)
			}
		}
		return ids
	}
	sorted := func(ids []int) []int {
		out := append([]int{}, ids...)
		sort.Ints(out)
		return out
	}
	search := func(query partnerTenantUserClassificationQuery, pageSize int, order UserSortOptions) []int {
		t.Helper()
		return partnerTenantUserClassificationPages(t, pageSize, func(page, size int) ([]*User, int64, error) {
			return SearchUsersWithTenantFilter(query.keyword, query.group, query.role, query.status, query.clientID, query.filter, (page-1)*size, size, order)
		})
	}
	list := func(filter UserTenantFilter, pageSize int, order UserSortOptions) []int {
		t.Helper()
		return partnerTenantUserClassificationPages(t, pageSize, func(page, size int) ([]*User, int64, error) {
			return GetAllUsersWithTenantFilter(&common.PageInfo{Page: page, PageSize: size}, filter, order)
		})
	}

	filters := map[string]UserTenantFilter{
		"omitted":                {},
		"all":                    {Category: UserTenantCategoryAll},
		"ordinary":               {Category: UserTenantCategoryOrdinary},
		"merchant":               {Category: UserTenantCategoryMerchant},
		"tenant":                 {TenantId: fixture.enabledTenant.Id},
		"all+tenant":             {Category: UserTenantCategoryAll, TenantId: fixture.enabledTenant.Id},
		"merchant+tenant":        {Category: UserTenantCategoryMerchant, TenantId: fixture.enabledTenant.Id},
		"merchant+disabled":      {Category: UserTenantCategoryMerchant, TenantId: fixture.disabledTenant.Id},
		"tenant row missing":     {TenantId: fixture.orphanTenantID},
		"tenant without members": {TenantId: 9007199254740993},
	}

	t.Run("classification is the account relation only", func(t *testing.T) {
		merchants := sorted(append(fixture.members(), both.Id))
		ordinary := sorted(append(fixture.nonMembers(), admin.Id))
		require.Equal(t, merchants, sorted(list(filters["merchant"], 3, NewUserSortOptions("id", "asc"))))
		require.Equal(t, ordinary, sorted(list(filters["ordinary"], 3, NewUserSortOptions("id", "asc"))))
		require.Equal(t, sorted(append(merchants, ordinary...)), sorted(list(filters["all"], 3, NewUserSortOptions("id", "asc"))))
		// Lookalike prefix / dedicated group, plain subscription and OAuth-only
		// users are ordinary; disabled, expired, orphaned and soft-deleted
		// mappings stay merchants.
		for _, id := range []int{fixture.prefixedOrdinary, fixture.subscribedOrdinary, fixture.oauthOnly, fixture.ordinary} {
			require.Contains(t, ordinary, id)
		}
		for _, id := range []int{fixture.externalMember, fixture.subscriptionKeyMember, fixture.disabledTenantMember, fixture.disabledAccountMember, fixture.orphanTenantMember, fixture.deletedUserMember} {
			require.Contains(t, merchants, id)
		}
		// Another tenant's user never appears under a tenant filter.
		enabledOnly := sorted(list(filters["tenant"], 2, NewUserSortOptions("id", "asc")))
		require.Equal(t, sorted([]int{fixture.externalMember, fixture.subscriptionKeyMember, fixture.disabledAccountMember, fixture.deletedUserMember, both.Id}), enabledOnly)
		require.NotContains(t, enabledOnly, fixture.disabledTenantMember)
		require.NotContains(t, enabledOnly, fixture.orphanTenantMember)
		require.Equal(t, []int{fixture.disabledTenantMember}, list(filters["merchant+disabled"], 2, NewUserSortOptions("id", "asc")))
		require.Equal(t, []int{fixture.orphanTenantMember}, list(filters["tenant row missing"], 2, NewUserSortOptions("id", "asc")))
		require.Empty(t, list(filters["tenant without members"], 2, NewUserSortOptions("id", "asc")))
	})

	t.Run("count and rows agree for every filter, sort and page size on both entries", func(t *testing.T) {
		for name, filter := range filters {
			want := sorted(expected(partnerTenantUserClassificationQuery{filter: filter}))
			for sortBy := range userSortColumns {
				for _, direction := range []string{"asc", "desc"} {
					order := NewUserSortOptions(sortBy, direction)
					for _, pageSize := range []int{1, 2, 5, 50} {
						label := name + "/" + sortBy + "/" + direction + "/" + strconv.Itoa(pageSize)
						listed := list(filter, pageSize, order)
						require.Equal(t, want, sorted(listed), "list %s", label)
						searched := search(partnerTenantUserClassificationQuery{filter: filter}, pageSize, order)
						require.Equal(t, want, sorted(searched), "search %s", label)
						// Same filter, same order on both entries.
						require.Equal(t, listed, searched, "entries agree %s", label)
						if sortBy == "id" && len(listed) > 1 {
							require.Equal(t, direction == "asc", sort.IntsAreSorted(listed), "id order %s", label)
						}
					}
				}
			}
		}
	})

	t.Run("composes with keyword, group, role, status and the OAuth partner filter", func(t *testing.T) {
		commonRole, adminRole := common.RoleCommonUser, common.RoleAdminUser
		enabled, disabled, deleted := common.UserStatusEnabled, common.UserStatusDisabled, -1
		// "_" is a LIKE wildcard in the pre-existing keyword search; in this
		// fixture every username containing "p" starts with "p_", so the literal
		// oracle and the SQL agree.
		keywords := []string{"", "p_", "usage", "class", strconv.Itoa(fixture.externalMember), "no-such-user"}
		groups := []string{"", "default", fixture.enabledTenant.Group, fixture.disabledTenant.Group}
		roles := []*int{nil, &commonRole, &adminRole}
		statuses := []*int{nil, &enabled, &disabled, &deleted}
		clients := []string{"", "pc_usage_fixture", "pc_absent"}
		nonEmpty := 0
		for name, filter := range filters {
			for _, keyword := range keywords {
				for _, group := range groups {
					for _, role := range roles {
						for _, status := range statuses {
							for _, clientID := range clients {
								query := partnerTenantUserClassificationQuery{filter: filter, keyword: keyword, group: group, role: role, status: status, clientID: clientID}
								want := sorted(expected(query))
								got := sorted(search(query, 2, NewUserSortOptions("username", "asc")))
								require.Equal(t, want, got, "%s %+v", name, query)
								if len(want) > 0 {
									nonEmpty++
								}
							}
						}
					}
				}
			}
		}
		require.Greater(t, nonEmpty, 50, "the matrix is not vacuous")

		// Named anchors of the matrix above.
		require.Equal(t, []int{fixture.deletedUserMember}, search(partnerTenantUserClassificationQuery{filter: filters["merchant"], status: &deleted}, 5, NewUserSortOptions("id", "asc")), "a soft-deleted user keeps its attribution")
		require.Empty(t, search(partnerTenantUserClassificationQuery{filter: filters["ordinary"], status: &deleted}, 5, NewUserSortOptions("id", "asc")))
		require.Equal(t, []int{fixture.prefixedOrdinary}, search(partnerTenantUserClassificationQuery{filter: filters["ordinary"], keyword: "p_"}, 5, NewUserSortOptions("id", "asc")), "a p_ username without a mapping is ordinary")
		require.Equal(t, []int{fixture.disabledAccountMember}, search(partnerTenantUserClassificationQuery{filter: filters["merchant"], status: &disabled}, 5, NewUserSortOptions("id", "asc")))
		// Two independent dimensions: OAuth partner and Tenant.
		require.Equal(t, sorted([]int{fixture.oauthOnly, both.Id}), sorted(search(partnerTenantUserClassificationQuery{clientID: "pc_usage_fixture"}, 5, NewUserSortOptions("id", "asc"))))
		require.Equal(t, []int{both.Id}, search(partnerTenantUserClassificationQuery{filter: filters["merchant"], clientID: "pc_usage_fixture"}, 5, NewUserSortOptions("id", "asc")))
		require.Equal(t, []int{fixture.oauthOnly}, search(partnerTenantUserClassificationQuery{filter: filters["ordinary"], clientID: "pc_usage_fixture"}, 5, NewUserSortOptions("id", "asc")))
		require.Equal(t, []int{both.Id}, search(partnerTenantUserClassificationQuery{filter: filters["tenant"], clientID: "pc_usage_fixture"}, 5, NewUserSortOptions("id", "asc")))
		// A client_id never acts as a tenant ID and vice versa.
		require.Empty(t, search(partnerTenantUserClassificationQuery{clientID: strconv.FormatInt(fixture.enabledTenant.Id, 10)}, 5, NewUserSortOptions("id", "asc")))
	})

	t.Run("callers without a tenant filter are unchanged", func(t *testing.T) {
		order := NewUserSortOptions("id", "asc")
		legacyList := partnerTenantUserClassificationPages(t, 4, func(page, size int) ([]*User, int64, error) {
			return GetAllUsers(&common.PageInfo{Page: page, PageSize: size}, order)
		})
		require.Equal(t, list(UserTenantFilter{}, 4, order), legacyList)
		require.Len(t, legacyList, len(rows))
		legacySearch := partnerTenantUserClassificationPages(t, 4, func(page, size int) ([]*User, int64, error) {
			return SearchUsers("usage", "", nil, nil, "", (page-1)*size, size, order)
		})
		require.Equal(t, search(partnerTenantUserClassificationQuery{keyword: "usage"}, 4, order), legacySearch)
		users, total, err := SearchUsers("", "", nil, nil, "pc_usage_fixture", 0, 10)
		require.NoError(t, err)
		require.EqualValues(t, 2, total)
		require.Len(t, users, 2)
	})

	t.Run("an invalid filter issues no query", func(t *testing.T) {
		queries := countPartnerTenantUsageQueries(t, db)
		_, _, err := GetAllUsersWithTenantFilter(&common.PageInfo{Page: 1, PageSize: 10}, UserTenantFilter{Category: UserTenantCategoryOrdinary, TenantId: fixture.enabledTenant.Id})
		require.ErrorIs(t, err, ErrUserTenantFilter)
		_, _, err = SearchUsersWithTenantFilter("usage", "", nil, nil, "", UserTenantFilter{Category: "p_"}, 0, 10)
		require.ErrorIs(t, err, ErrUserTenantFilter)
		require.Zero(t, *queries)
	})

	t.Run("the filter never writes", func(t *testing.T) {
		var accounts, users int64
		require.NoError(t, db.Model(&PartnerTenantAccount{}).Count(&accounts).Error)
		require.NoError(t, db.Unscoped().Model(&User{}).Count(&users).Error)
		require.EqualValues(t, len(fixture.accounts), accounts)
		require.EqualValues(t, len(rows), users)
		var after []User
		require.NoError(t, db.Unscoped().Order("id ASC").Find(&after).Error)
		for i := range stored {
			require.Equal(t, stored[i].Role, after[i].Role)
			require.Equal(t, stored[i].Status, after[i].Status)
			require.Equal(t, stored[i].Group, after[i].Group)
			require.Equal(t, stored[i].DeletedAt, after[i].DeletedAt)
		}
	})
}
