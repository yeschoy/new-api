package service

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/setting/model_setting"
	hosttypes "github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

// Real service call sites of the three usage writers, on one task-owned
// PostgreSQL schema that is both main DB and LOG_DB (shared LOG_DB=DB). No
// upstream, network or payment is involved: every function below is called
// directly with a fake relay context. A missing DSN fails; it never skips.

const (
	partnerTenantUsagePathsWallet       = 1_000_000
	partnerTenantUsagePathsMemberWallet = 1000
	partnerTenantUsagePathsTokenQuota   = 1_000_000
	partnerTenantUsagePathsSubscription = 1_000_000
	partnerTenantUsagePathsGroup        = "paths-tenant"
)

type partnerTenantUsagePathsFixture struct {
	db           *gorm.DB
	tenant       *model.PartnerTenant
	account      *model.PartnerTenantAccount
	member       int
	memberToken  int
	subscription int
	ordinary     int
	ordinaryTok  int
	channel      int
}

func setupPartnerTenantUsagePathsPQ(t *testing.T) partnerTenantUsagePathsFixture {
	t.Helper()
	dsn := os.Getenv("TEST_PARTNER_USAGE_POSTGRES_DSN")
	require.NotEmpty(t, dsn, "BLOCKED: explicit task-owned Docker/pq DSN required; no SQLite/MySQL/production substitute")
	cfg, err := pgx.ParseConfig(dsn)
	require.NoError(t, err)
	cfg.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	base := stdlib.OpenDB(*cfg)
	schema := fmt.Sprintf("pt_usage_paths_%d", time.Now().UnixNano())
	_, err = base.Exec("CREATE SCHEMA " + schema)
	require.NoError(t, err)
	require.NoError(t, base.Close())
	cfg.RuntimeParams["search_path"] = schema
	cfg.RuntimeParams["application_name"] = schema
	conn := stdlib.OpenDB(*cfg)
	db, err := gorm.Open(postgres.New(postgres.Config{Conn: conn, PreferSimpleProtocol: true}), &gorm.Config{Logger: gormlogger.Default.LogMode(gormlogger.Silent)})
	require.NoError(t, err)

	oldDB, oldLogDB := model.DB, model.LOG_DB
	oldMain, oldLog := common.MainDatabaseType(), common.LogDatabaseType()
	oldRedis, oldBatch := common.RedisEnabled, common.BatchUpdateEnabled
	oldConsume, oldExport, oldErrorLog := common.LogConsumeEnabled, common.DataExportEnabled, constant.ErrorLogEnabled
	grok := model_setting.GetGrokSettings()
	oldGrok := *grok
	model.CacheQuotaDataLock.Lock()
	oldCache := model.CacheQuotaData
	model.CacheQuotaData = make(map[string]*model.QuotaData)
	model.CacheQuotaDataLock.Unlock()

	model.DB, model.LOG_DB = db, db
	common.SetDatabaseTypes(common.DatabaseTypePostgreSQL, common.DatabaseTypePostgreSQL)
	common.RedisEnabled, common.BatchUpdateEnabled = false, false
	common.LogConsumeEnabled, common.DataExportEnabled, constant.ErrorLogEnabled = true, true, true
	model.ResetPartnerTenantMembershipCache()
	t.Cleanup(func() {
		model.DB, model.LOG_DB = oldDB, oldLogDB
		common.SetDatabaseTypes(oldMain, oldLog)
		common.RedisEnabled, common.BatchUpdateEnabled = oldRedis, oldBatch
		common.LogConsumeEnabled, common.DataExportEnabled, constant.ErrorLogEnabled = oldConsume, oldExport, oldErrorLog
		*grok = oldGrok
		model.CacheQuotaDataLock.Lock()
		model.CacheQuotaData = oldCache
		model.CacheQuotaDataLock.Unlock()
		model.ResetPartnerTenantMembershipCache()
		_ = conn.Close()
	})
	t.Logf("Retained task-owned schema: %s (no drop)", schema)

	require.NoError(t, model.MigratePartnerTenantIntegrationModes(db))
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}, &model.Channel{}, &model.Log{}, &model.Task{},
		&model.PartnerTenantAccount{}, &model.SubscriptionPlan{}, &model.UserSubscription{}, &model.SubscriptionPreConsumeRecord{}))
	require.NoError(t, model.MigratePartnerTenantUsageLogs())

	fixture := partnerTenantUsagePathsFixture{db: db}
	tenant, _, err := model.CreatePartnerTenantWithIntegrationMode("Paths Tenant", partnerTenantUsagePathsGroup, model.PartnerTenantIntegrationHostedH5)
	require.NoError(t, err)
	fixture.tenant = tenant

	member := &model.User{Username: "paths_member", AffCode: "paths_member", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: partnerTenantUsagePathsGroup, Quota: partnerTenantUsagePathsMemberWallet}
	require.NoError(t, db.Create(member).Error)
	fixture.member = member.Id
	memberToken := &model.Token{UserId: member.Id, Key: "pathsmembertoken", Name: "paths-member-key", Status: common.TokenStatusEnabled, RemainQuota: partnerTenantUsagePathsTokenQuota}
	require.NoError(t, db.Create(memberToken).Error)
	fixture.memberToken = memberToken.Id
	hash := sha256.Sum256([]byte("paths-member-external"))
	account := &model.PartnerTenantAccount{IdentitySource: model.PartnerTenantIdentityExternal, TenantId: tenant.Id, ExternalUserId: "paths-member-external", ExternalUserIdHash: hex.EncodeToString(hash[:]), UserId: member.Id, TokenId: memberToken.Id, Status: model.PartnerTenantStatusEnabled, CreatedAt: 1, UpdatedAt: 1}
	require.NoError(t, db.Create(account).Error)
	fixture.account = account
	now := model.GetDBTimestamp()
	plan := &model.SubscriptionPlan{Title: "Paths Plan", PartnerTenantId: tenant.Id, ApplicableGroup: partnerTenantUsagePathsGroup, Enabled: true, DurationUnit: "month", DurationValue: 1}
	require.NoError(t, db.Create(plan).Error)
	sub := &model.UserSubscription{UserId: member.Id, PlanId: plan.Id, Status: "active", StartTime: now - 10, EndTime: now + 3600, AmountTotal: partnerTenantUsagePathsSubscription}
	require.NoError(t, db.Create(sub).Error)
	fixture.subscription = sub.Id

	ordinary := &model.User{Username: "paths_ordinary", AffCode: "paths_ordinary", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, Group: "default", Quota: partnerTenantUsagePathsWallet}
	require.NoError(t, db.Create(ordinary).Error)
	fixture.ordinary = ordinary.Id
	ordinaryToken := &model.Token{UserId: ordinary.Id, Key: "pathsordinarytoken", Name: "paths-ordinary-key", Status: common.TokenStatusEnabled, RemainQuota: partnerTenantUsagePathsTokenQuota}
	require.NoError(t, db.Create(ordinaryToken).Error)
	fixture.ordinaryTok = ordinaryToken.Id

	channel := &model.Channel{Name: "paths-channel", Key: "unused", Status: common.ChannelStatusEnabled}
	require.NoError(t, db.Create(channel).Error)
	fixture.channel = channel.Id
	return fixture
}

func (f partnerTenantUsagePathsFixture) tokenOf(userID int) int {
	if userID == f.member {
		return f.memberToken
	}
	return f.ordinaryTok
}

func (f partnerTenantUsagePathsFixture) groupOf(userID int) string {
	if userID == f.member {
		return partnerTenantUsagePathsGroup
	}
	return "default"
}

func (f partnerTenantUsagePathsFixture) context(userID int, requestID string) *gin.Context {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	c.Set("id", userID)
	c.Set("token_id", f.tokenOf(userID))
	c.Set("token_name", "paths-key")
	c.Set("original_model", "paths-model")
	c.Set("group", f.groupOf(userID))
	c.Set(common.RequestIdKey, requestID)
	return c
}

func (f partnerTenantUsagePathsFixture) relayInfo(userID int, requestID string) *relaycommon.RelayInfo {
	pref := "wallet_only"
	if userID == f.member {
		pref = "subscription_only"
	}
	info := &relaycommon.RelayInfo{
		UserId:          userID,
		RequestId:       requestID,
		TokenId:         f.tokenOf(userID),
		TokenKey:        map[bool]string{true: "pathsmembertoken", false: "pathsordinarytoken"}[userID == f.member],
		OriginModelName: "paths-model",
		UsingGroup:      f.groupOf(userID),
		UserGroup:       f.groupOf(userID),
		ForcePreConsume: true,
		StartTime:       time.Now(),
		ChannelMeta:     &relaycommon.ChannelMeta{ChannelId: f.channel},
		PriceData:       hosttypes.PriceData{ModelRatio: 1, CompletionRatio: 1, GroupRatioInfo: hosttypes.GroupRatioInfo{GroupRatio: 1}},
	}
	info.UserSetting.BillingPreference = pref
	return info
}

// rows returns this user's rows in logs and in the dedicated table.
func (f partnerTenantUsagePathsFixture) rows(t *testing.T, userID int) ([]model.Log, []model.PartnerTenantUsageLog) {
	t.Helper()
	var legacy []model.Log
	require.NoError(t, f.db.Where("user_id = ?", userID).Order("id").Find(&legacy).Error)
	var dedicated []model.PartnerTenantUsageLog
	require.NoError(t, f.db.Where("user_id = ?", userID).Order("id").Find(&dedicated).Error)
	return legacy, dedicated
}

type partnerTenantUsagePathsBalances struct {
	wallet, used, requests, tokenRemain, tokenUsed int
	subscriptionUsed                               int64
}

func (f partnerTenantUsagePathsFixture) balances(t *testing.T, userID int) partnerTenantUsagePathsBalances {
	t.Helper()
	var user model.User
	require.NoError(t, f.db.First(&user, userID).Error)
	var token model.Token
	require.NoError(t, f.db.First(&token, f.tokenOf(userID)).Error)
	result := partnerTenantUsagePathsBalances{wallet: user.Quota, used: user.UsedQuota, requests: user.RequestCount, tokenRemain: token.RemainQuota, tokenUsed: token.UsedQuota}
	if userID == f.member {
		var sub model.UserSubscription
		require.NoError(t, f.db.First(&sub, f.subscription).Error)
		result.subscriptionUsed = sub.AmountUsed
	}
	return result
}

// The dashboard feed is the in-memory CacheQuotaData; it reaches quota_data
// only through the UpdateQuotaData loop, which this test never starts.
func partnerTenantUsagePathsFeed(userID int) (count int, quota int) {
	model.CacheQuotaDataLock.Lock()
	defer model.CacheQuotaDataLock.Unlock()
	for _, data := range model.CacheQuotaData {
		if data.UserID == userID {
			count += data.Count
			quota += data.Quota
		}
	}
	return count, quota
}

// requireRouted asserts the exact destination of one new event for userID and
// returns its quota, the type and request_id being fixed facts of the call.
func (f partnerTenantUsagePathsFixture) requireRouted(t *testing.T, userID int, logType int, requestID string) int {
	t.Helper()
	legacy, dedicated := f.rows(t, userID)
	if userID == f.member {
		require.Len(t, legacy, 0, "a member event never reaches logs")
		require.Len(t, dedicated, 1, "a member event is written exactly once to the dedicated table")
		row := dedicated[0]
		require.Equal(t, logType, row.Type)
		require.Equal(t, int64(f.member), row.UserId)
		require.Equal(t, f.tenant.Id, row.TenantId)
		require.Equal(t, f.account.Id, row.AccountId)
		require.Equal(t, "Paths Tenant", row.TenantName)
		require.Equal(t, model.PartnerTenantIdentityExternal, row.IdentitySource)
		require.True(t, strings.HasPrefix(row.EventId, "ptu_"), row.EventId)
		if requestID != "" {
			require.Equal(t, requestID, row.RequestId)
		} else {
			require.NotEmpty(t, row.RequestId)
		}
		return int(row.Quota)
	}
	require.Len(t, dedicated, 0, "an ordinary event never reaches the dedicated table")
	require.Len(t, legacy, 1, "an ordinary event is written exactly once to logs")
	row := legacy[0]
	require.Equal(t, logType, row.Type)
	require.Equal(t, userID, row.UserId)
	if requestID != "" {
		require.Equal(t, requestID, row.RequestId)
	} else {
		require.NotEmpty(t, row.RequestId)
	}
	return row.Quota
}

func (f partnerTenantUsagePathsFixture) users() []int { return []int{f.member, f.ordinary} }

// Settled relay consumption (text, audio, realtime): a real billing session
// (member forced to subscription_only, ordinary wallet_only), the real settle
// function, and exact destination, feed and debits.
func TestPartnerTenantUsagePathsRelayConsumption(t *testing.T) {
	cases := []struct {
		name   string
		settle func(c *gin.Context, info *relaycommon.RelayInfo)
	}{
		{"text", func(c *gin.Context, info *relaycommon.RelayInfo) {
			usage := &dto.Usage{PromptTokens: 100, CompletionTokens: 50, TotalTokens: 150}
			PostTextConsumeQuota(c, info, usage, nil)
		}},
		{"audio", func(c *gin.Context, info *relaycommon.RelayInfo) {
			usage := &dto.Usage{PromptTokens: 100, CompletionTokens: 50, TotalTokens: 150}
			usage.PromptTokensDetails.TextTokens = 100
			usage.CompletionTokenDetails.TextTokens = 50
			PostAudioConsumeQuota(c, info, usage, nil)
		}},
		{"realtime", func(c *gin.Context, info *relaycommon.RelayInfo) {
			usage := &dto.RealtimeUsage{InputTokens: 100, OutputTokens: 50, TotalTokens: 150}
			usage.InputTokenDetails.TextTokens = 100
			usage.OutputTokenDetails.TextTokens = 50
			PostWssConsumeQuota(c, info, info.OriginModelName, usage, nil)
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f := setupPartnerTenantUsagePathsPQ(t)
			quotas := map[int]int{}
			for _, userID := range f.users() {
				requestID := fmt.Sprintf("paths-%s-%d", tc.name, userID)
				before := f.balances(t, userID)
				c := f.context(userID, requestID)
				info := f.relayInfo(userID, requestID)
				require.Nil(t, PreConsumeBilling(c, 10, info))
				if userID == f.member {
					require.Equal(t, BillingSourceSubscription, info.BillingSource, "membership forces subscription funding")
				} else {
					require.Equal(t, BillingSourceWallet, info.BillingSource)
				}
				tc.settle(c, info)

				quota := f.requireRouted(t, userID, model.LogTypeConsume, requestID)
				require.Positive(t, quota)
				quotas[userID] = quota
				// Text, audio and realtime all build other through GenerateTextOtherInfo,
				// which records the settled subscription fact.
				if userID == f.member {
					_, dedicated := f.rows(t, userID)
					require.Equal(t, int64(f.subscription), dedicated[0].SubscriptionId, "the settled subscription fact is kept")
				}
				count, fed := partnerTenantUsagePathsFeed(userID)
				require.Equal(t, 1, count, "dashboard feed exactly once")
				require.Equal(t, quota, fed)

				after := f.balances(t, userID)
				require.Equal(t, before.used+quota, after.used)
				require.Equal(t, before.requests+1, after.requests)
				require.Equal(t, before.tokenRemain-quota, after.tokenRemain)
				require.Equal(t, before.tokenUsed+quota, after.tokenUsed)
				if userID == f.member {
					require.Equal(t, before.wallet, after.wallet, "never debit a Tenant wallet")
					require.Equal(t, before.subscriptionUsed+int64(quota), after.subscriptionUsed)
				} else {
					require.Equal(t, before.wallet-quota, after.wallet)
				}
			}
			require.Equal(t, quotas[f.ordinary], quotas[f.member], "routing does not change the charged amount")
		})
	}
}

// Zero-quota text consumption (upstream returned no usage) is still a
// consume event and is routed the same way; nothing is debited.
func TestPartnerTenantUsagePathsZeroQuotaText(t *testing.T) {
	f := setupPartnerTenantUsagePathsPQ(t)
	for _, userID := range f.users() {
		requestID := fmt.Sprintf("paths-zero-%d", userID)
		before := f.balances(t, userID)
		c := f.context(userID, requestID)
		info := f.relayInfo(userID, requestID)
		PostTextConsumeQuota(c, info, &dto.Usage{}, nil)

		require.Zero(t, f.requireRouted(t, userID, model.LogTypeConsume, requestID))
		count, fed := partnerTenantUsagePathsFeed(userID)
		require.Equal(t, 1, count)
		require.Zero(t, fed)
		require.Equal(t, before, f.balances(t, userID), "a zero-quota event debits nothing")
	}
}

// Task submission log (debit already done by the billing session) and
// context-free positive delta consume are routed; refunds stay in logs.
func TestPartnerTenantUsagePathsTaskBilling(t *testing.T) {
	f := setupPartnerTenantUsagePathsPQ(t)
	newTask := func(userID int, quota int) *model.Task {
		source, subscriptionID := BillingSourceWallet, 0
		if userID == f.member {
			source, subscriptionID = BillingSourceSubscription, f.subscription
		}
		task := makeTask(userID, f.channel, quota, f.tokenOf(userID), source, subscriptionID)
		task.TaskID = fmt.Sprintf("paths_task_%d_%d", userID, time.Now().UnixNano())
		task.Group = f.groupOf(userID)
		require.NoError(t, f.db.Create(task).Error)
		return task
	}

	t.Run("submit", func(t *testing.T) {
		for _, userID := range f.users() {
			requestID := fmt.Sprintf("paths-task-submit-%d", userID)
			before := f.balances(t, userID)
			c := f.context(userID, requestID)
			c.Request = httptest.NewRequest(http.MethodPost, "/v1/video/generations", nil)
			info := f.relayInfo(userID, requestID)
			info.TaskRelayInfo = &relaycommon.TaskRelayInfo{Action: "generate"}
			info.PriceData.Quota = 700
			task := newTask(userID, 700)
			LogTaskConsumption(c, info, task)

			require.Equal(t, 700, f.requireRouted(t, userID, model.LogTypeConsume, requestID))
			count, fed := partnerTenantUsagePathsFeed(userID)
			require.Equal(t, 1, count)
			require.Equal(t, 700, fed)
			after := f.balances(t, userID)
			require.Equal(t, before.used+700, after.used)
			require.Equal(t, before.requests+1, after.requests)
			require.Equal(t, before.wallet, after.wallet, "the submit log itself never moves funds")
			require.Equal(t, before.tokenRemain, after.tokenRemain)
			require.Equal(t, before.subscriptionUsed, after.subscriptionUsed)
		}
	})

	t.Run("positive delta and refunds", func(t *testing.T) {
		for _, userID := range f.users() {
			// Clear the submit rows/feed of the previous subtest for exact counts.
			require.NoError(t, f.db.Where("user_id = ?", userID).Delete(&model.Log{}).Error)
			require.NoError(t, f.db.Where("user_id = ?", userID).Delete(&model.PartnerTenantUsageLog{}).Error)
			model.CacheQuotaDataLock.Lock()
			model.CacheQuotaData = make(map[string]*model.QuotaData)
			model.CacheQuotaDataLock.Unlock()

			// The 500 pre-consumed at submit is applied through the same funding
			// helpers the task billing path uses, so refunds have real funds to return.
			task := newTask(userID, 500)
			require.NoError(t, taskAdjustFunding(task, 500))
			taskAdjustTokenQuota(t.Context(), task, 500)
			model.UpdateUserUsedQuota(userID, 500)
			before := f.balances(t, userID)
			RecalculateTaskQuota(t.Context(), task, 800, common.NewMessage("paths positive delta"))
			legacy, dedicated := f.rows(t, userID)
			if userID == f.member {
				require.Len(t, legacy, 0)
				require.Len(t, dedicated, 1)
				require.Equal(t, model.LogTypeConsume, dedicated[0].Type)
				require.Equal(t, int64(300), dedicated[0].Quota)
				require.Equal(t, f.tenant.Id, dedicated[0].TenantId)
				require.NotEmpty(t, dedicated[0].RequestId)
				// taskBillingOther records no subscription_id fact, and the writer
				// never looks one up afterwards: unknown stays 0.
				require.Equal(t, int64(0), dedicated[0].SubscriptionId)
			} else {
				require.Len(t, dedicated, 0)
				require.Len(t, legacy, 1)
				require.Equal(t, model.LogTypeConsume, legacy[0].Type)
				require.Equal(t, 300, legacy[0].Quota)
			}
			count, fed := partnerTenantUsagePathsFeed(userID)
			require.Equal(t, 1, count, "positive delta feeds the dashboard once")
			require.Equal(t, 300, fed)
			after := f.balances(t, userID)
			require.Equal(t, before.used+300, after.used)
			require.Equal(t, before.requests, after.requests, "settlement adds no request")
			require.Equal(t, before.tokenRemain-300, after.tokenRemain)
			if userID == f.member {
				require.Equal(t, before.wallet, after.wallet)
				require.Equal(t, before.subscriptionUsed+300, after.subscriptionUsed)
			} else {
				require.Equal(t, before.wallet-300, after.wallet)
			}

			// Negative delta and a full refund are refund events: never routed.
			RecalculateTaskQuota(t.Context(), task, 600, common.NewMessage("paths negative delta"))
			require.True(t, RefundTaskQuota(t.Context(), task, "paths refund"))
			legacy, dedicated = f.rows(t, userID)
			if userID == f.member {
				require.Len(t, dedicated, 1, "refunds never reach the dedicated table")
				require.Len(t, legacy, 2, "member refunds stay in logs")
			} else {
				require.Len(t, dedicated, 0)
				require.Len(t, legacy, 3)
				legacy = legacy[1:]
			}
			require.Equal(t, model.LogTypeRefund, legacy[0].Type)
			require.Equal(t, 200, legacy[0].Quota)
			require.Equal(t, model.LogTypeRefund, legacy[1].Type)
			require.Equal(t, 600, legacy[1].Quota)
			count, fed = partnerTenantUsagePathsFeed(userID)
			require.Equal(t, 1, count, "refunds do not feed the dashboard")
			require.Equal(t, 300, fed)
			final := f.balances(t, userID)
			require.Equal(t, before.used-500, final.used, "800-200-600 net of the 500 pre-consumed")
			require.Equal(t, before.tokenRemain+500, final.tokenRemain)
			if userID == f.member {
				require.Equal(t, before.wallet, final.wallet)
				require.Equal(t, before.subscriptionUsed-500, final.subscriptionUsed)
			} else {
				require.Equal(t, before.wallet+500, final.wallet)
			}
		}
	})
}

// A charged violation fee is recorded as consume and routed; the fee is
// debited from the funding the session selected.
func TestPartnerTenantUsagePathsViolationFee(t *testing.T) {
	f := setupPartnerTenantUsagePathsPQ(t)
	grok := model_setting.GetGrokSettings()
	grok.ViolationDeductionEnabled, grok.ViolationDeductionAmount = true, 0.05
	fee := calcViolationFeeQuota(0.05, 1)
	require.Positive(t, fee)
	for _, userID := range f.users() {
		requestID := fmt.Sprintf("paths-violation-%d", userID)
		before := f.balances(t, userID)
		c := f.context(userID, requestID)
		info := f.relayInfo(userID, requestID)
		info.UserQuota = partnerTenantUsagePathsWallet
		if userID == f.member {
			info.BillingSource, info.SubscriptionId = BillingSourceSubscription, f.subscription
		} else {
			info.BillingSource = BillingSourceWallet
		}
		apiErr := types.NewErrorWithStatusCode(errors.New(CSAMViolationMarker), types.ErrorCodeViolationFeeGrokCSAM, http.StatusBadRequest)
		require.True(t, ChargeViolationFeeIfNeeded(c, info, apiErr))

		require.Equal(t, fee, f.requireRouted(t, userID, model.LogTypeConsume, requestID))
		count, fed := partnerTenantUsagePathsFeed(userID)
		require.Equal(t, 1, count)
		require.Equal(t, fee, fed)
		after := f.balances(t, userID)
		require.Equal(t, before.used+fee, after.used)
		require.Equal(t, before.tokenRemain-fee, after.tokenRemain)
		if userID == f.member {
			require.Equal(t, before.wallet, after.wallet)
			require.Equal(t, before.subscriptionUsed+int64(fee), after.subscriptionUsed)
		} else {
			require.Equal(t, before.wallet-fee, after.wallet)
		}
	}
}

// A recordable relay error is routed by the authenticated user ID; the
// existing switches are not bypassed for members.
func TestPartnerTenantUsagePathsChannelError(t *testing.T) {
	f := setupPartnerTenantUsagePathsPQ(t)
	channelError := types.ChannelError{ChannelId: f.channel, ChannelName: "paths-channel", AutoBan: false}
	newErr := func(opts ...types.NewAPIErrorOptions) *types.NewAPIError {
		return types.NewErrorWithStatusCode(errors.New("paths upstream failure"), types.ErrorCodeBadResponseStatusCode, http.StatusBadGateway, opts...)
	}

	t.Run("suppressed", func(t *testing.T) {
		constant.ErrorLogEnabled = false
		ProcessChannelError(f.context(f.member, "paths-error-off"), channelError, newErr(), nil)
		constant.ErrorLogEnabled = true
		ProcessChannelError(f.context(f.member, "paths-error-norecord"), channelError, newErr(types.ErrOptionWithNoRecordErrorLog()), nil)
		legacy, dedicated := f.rows(t, f.member)
		require.Len(t, legacy, 0)
		require.Len(t, dedicated, 0, "ErrorLogEnabled=false and no-record errors write nothing for a member")
	})

	t.Run("recorded", func(t *testing.T) {
		for _, userID := range f.users() {
			requestID := fmt.Sprintf("paths-error-%d", userID)
			before := f.balances(t, userID)
			ProcessChannelError(f.context(userID, requestID), channelError, newErr(), nil)
			require.Zero(t, f.requireRouted(t, userID, model.LogTypeError, requestID))
			count, _ := partnerTenantUsagePathsFeed(userID)
			require.Zero(t, count, "an error event never feeds the dashboard")
			require.Equal(t, before, f.balances(t, userID), "an error event debits nothing")
		}
		_, dedicated := f.rows(t, f.member)
		require.Equal(t, int64(f.channel), dedicated[0].ChannelId)
		require.Equal(t, "paths-model", dedicated[0].ModelName)
		require.Equal(t, int64(f.memberToken), dedicated[0].TokenId)
		require.Equal(t, partnerTenantUsagePathsGroup, dedicated[0].Group)
		require.Equal(t, int64(0), dedicated[0].SubscriptionId, "a failure has no settled subscription")
	})
}

// A log-only schema on the existing owned PostgreSQL instance. No user,
// subscription or owner tables: the real settlement must stay on main DB.
func setupPartnerTenantUsagePathsLogDB(t *testing.T) *gorm.DB {
	t.Helper()
	cfg, err := pgx.ParseConfig(os.Getenv("TEST_PARTNER_USAGE_POSTGRES_DSN"))
	require.NoError(t, err)
	cfg.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	base := stdlib.OpenDB(*cfg)
	schema := fmt.Sprintf("pt_usage_paths_split_log_%d", time.Now().UnixNano())
	_, err = base.Exec("CREATE SCHEMA " + schema)
	require.NoError(t, err)
	require.NoError(t, base.Close())
	cfg.RuntimeParams["search_path"] = schema
	conn := stdlib.OpenDB(*cfg)
	db, err := gorm.Open(postgres.New(postgres.Config{Conn: conn, PreferSimpleProtocol: true}), &gorm.Config{Logger: gormlogger.Default.LogMode(gormlogger.Silent)})
	require.NoError(t, err)
	t.Cleanup(func() { _ = conn.Close() })
	t.Logf("Retained task-owned schema: %s (no drop)", schema)
	model.LOG_DB = db // outer fixture restores this global
	require.NoError(t, db.AutoMigrate(&model.Log{}))
	require.NoError(t, model.MigratePartnerTenantUsageLogs())
	return db
}

// Real text preconsume -> settle -> writer, with main and LOG_DB separated.
// PostgreSQL rejects the post-settlement usage insert on the second request;
// the already-charged subscription, token, counters and dashboard feed must
// be identical to the successful request (no fallback, compensation or retry).
func TestPartnerTenantUsagePathsSettledSeparateLogFailure(t *testing.T) {
	f := setupPartnerTenantUsagePathsPQ(t)
	logs := setupPartnerTenantUsagePathsLogDB(t)
	require.NotSame(t, model.DB, model.LOG_DB)
	require.False(t, logs.Migrator().HasTable(&model.UserSubscription{}))
	quotaByUser := map[int]int{}
	rejected := 0
	require.NoError(t, logs.Callback().Create().After("gorm:create").Register("pt_usage_paths:reject", func(tx *gorm.DB) {
		if tx.Statement.Table == "partner_tenant_usage_logs" && tx.Error != nil {
			rejected++
			require.Contains(t, tx.Error.Error(), "23514")
		}
	}))
	for phase := range 2 {
		if phase == 1 {
			require.NoError(t, logs.Exec("ALTER TABLE partner_tenant_usage_logs ADD CONSTRAINT pt_usage_paths_reject CHECK (quota < 0) NOT VALID").Error)
		}
		for _, user := range f.users() {
			before := f.balances(t, user)
			rid := fmt.Sprintf("split-settlement-%d-%d", phase, user)
			c, info := f.context(user, rid), f.relayInfo(user, rid)
			require.Nil(t, PreConsumeBilling(c, 10, info))
			PostTextConsumeQuota(c, info, &dto.Usage{PromptTokens: 100, CompletionTokens: 50, TotalTokens: 150}, nil)
			after := f.balances(t, user)
			charged := after.used - before.used
			require.Positive(t, charged)
			if phase == 0 {
				quotaByUser[user] = charged
			} else {
				require.Equal(t, quotaByUser[user], charged, "logging failure cannot change the charge")
			}
			require.Equal(t, before.requests+1, after.requests)
			require.Equal(t, before.tokenRemain-charged, after.tokenRemain)
			require.Equal(t, before.tokenUsed+charged, after.tokenUsed)
			if user == f.member {
				require.Equal(t, before.wallet, after.wallet)
				require.Equal(t, before.subscriptionUsed+int64(charged), after.subscriptionUsed)
			} else {
				require.Equal(t, before.wallet-charged, after.wallet)
			}
			count, quota := partnerTenantUsagePathsFeed(user)
			require.Equal(t, phase+1, count)
			require.Equal(t, (phase+1)*charged, quota)
		}
	}
	require.Equal(t, 1, rejected, "real PostgreSQL constraint failure reached after settlement")
	require.Equal(t, quotaByUser[f.ordinary], quotaByUser[f.member])
	var memberRows []model.PartnerTenantUsageLog
	require.NoError(t, logs.Find(&memberRows).Error)
	require.Len(t, memberRows, 1, "only the first successful member usage insert exists")
	require.Equal(t, int64(f.member), memberRows[0].UserId)
	require.Equal(t, int64(quotaByUser[f.member]), memberRows[0].Quota)
	var ordinaryRows []model.Log
	require.NoError(t, logs.Find(&ordinaryRows).Error)
	require.Len(t, ordinaryRows, 2, "ordinary logging stays on LOG_DB.logs even during the dedicated-table failure")
	for _, row := range ordinaryRows {
		require.Equal(t, f.ordinary, row.UserId)
	}
	var legacy, dedicated int64
	require.NoError(t, f.db.Model(&model.Log{}).Count(&legacy).Error)
	require.NoError(t, f.db.Model(&model.PartnerTenantUsageLog{}).Count(&dedicated).Error)
	require.Zero(t, legacy, "no fallback to main logs")
	require.Zero(t, dedicated, "no write to main dedicated-table decoy")
}
