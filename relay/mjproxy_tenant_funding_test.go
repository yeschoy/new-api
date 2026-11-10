package relay

import (
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// Every DB test, including this SQLite regression, runs only in the
// supervisor-coordinated disposable Docker Go runner.
func legacyTenantFundingDB(t *testing.T, membershipTable bool) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	conn, err := db.DB()
	require.NoError(t, err)
	conn.SetMaxOpenConns(1)
	previousDB, previousLog := model.DB, model.LOG_DB
	previousMainType, previousLogType := common.MainDatabaseType(), common.LogDatabaseType()
	previousRedis, previousMemory := common.RedisEnabled, common.MemoryCacheEnabled
	previousBatch, previousLogging := common.BatchUpdateEnabled, common.LogConsumeEnabled
	previousUnit := common.QuotaPerUnit
	previousPrices, previousGroups := ratio_setting.ModelPrice2JSONString(), ratio_setting.GroupRatio2JSONString()
	model.DB, model.LOG_DB = db, db
	model.ResetPartnerTenantMembershipCache()
	common.SetDatabaseTypes(common.DatabaseTypeSQLite, common.DatabaseTypeSQLite)
	common.RedisEnabled, common.MemoryCacheEnabled = false, false
	common.BatchUpdateEnabled, common.LogConsumeEnabled = false, false
	common.QuotaPerUnit = 100
	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{"mj_imagine":0.5,"swap_face":0.5}`))
	require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1}`))
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLog
		model.ResetPartnerTenantMembershipCache()
		common.SetDatabaseTypes(previousMainType, previousLogType)
		common.RedisEnabled, common.MemoryCacheEnabled = previousRedis, previousMemory
		common.BatchUpdateEnabled, common.LogConsumeEnabled = previousBatch, previousLogging
		common.QuotaPerUnit = previousUnit
		require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(previousPrices))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(previousGroups))
		require.NoError(t, conn.Close())
	})
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}, &model.UserSubscription{}, &model.Midjourney{}, &model.Channel{}))
	if membershipTable {
		require.NoError(t, db.AutoMigrate(&model.PartnerTenantAccount{}))
	}
	return db
}

func TestLegacyMidjourneyTenantFundingGuardBeforeUpstream(t *testing.T) {
	db := legacyTenantFundingDB(t, true)
	service.InitHttpClient()
	for i, state := range []string{"no_plan", "expired_plan", "active_plan", "ordinary_wallet"} {
		for j, endpoint := range []struct {
			name, path, body, model string
			mode                    int
		}{
			{"midjourney", "/mj/submit/imagine", `{"prompt":"a test image"}`, "mj_imagine", relayconstant.RelayModeMidjourneyImagine},
			{"swapface", "/mj/insight-face/swap", `{"sourceBase64":"source","targetBase64":"target"}`, "swap_face", relayconstant.RelayModeSwapFace},
		} {
			t.Run(state+"/"+endpoint.name, func(t *testing.T) {
				userID := 7912000 + i*10 + j
				user := &model.User{Id: userID, Username: fmt.Sprintf("legacy-%d", userID), AffCode: fmt.Sprintf("aff-%d", userID), Quota: 1000, Status: common.UserStatusEnabled, Group: "default"}
				require.NoError(t, db.Create(user).Error)
				token := &model.Token{UserId: user.Id, Key: fmt.Sprintf("legacy-token-%d", userID), UnlimitedQuota: true, ExpiredTime: -1, Status: common.TokenStatusEnabled}
				require.NoError(t, db.Create(token).Error)
				if state != "ordinary_wallet" {
					require.NoError(t, db.Create(&model.PartnerTenantAccount{TenantId: 1, ExternalUserId: user.Username, ExternalUserIdHash: user.Username, UserId: user.Id, TokenId: token.Id, Status: model.PartnerTenantStatusEnabled}).Error)
				}
				if state == "expired_plan" || state == "active_plan" {
					end, status := time.Now().Unix()-1, "expired"
					if state == "active_plan" {
						end, status = time.Now().Unix()+3600, "active"
					}
					require.NoError(t, db.Create(&model.UserSubscription{UserId: user.Id, PlanId: 1, StartTime: time.Now().Unix() - 60, EndTime: end, Status: status, AmountTotal: 1000, Source: model.SubscriptionSourcePartner}).Error)
				}
				var calls atomic.Int32
				upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					calls.Add(1)
					w.Header().Set("Content-Type", "application/json")
					_, _ = io.WriteString(w, `{"code":1,"result":"legacy-local-test"}`)
				}))
				t.Cleanup(upstream.Close)
				recorder := httptest.NewRecorder()
				c, _ := gin.CreateTestContext(recorder)
				c.Request = httptest.NewRequest(http.MethodPost, endpoint.path, strings.NewReader(endpoint.body))
				c.Request.Header.Set("Content-Type", "application/json")
				c.Set("base_url", upstream.URL)
				c.Set("channel_id", 1)
				common.SetContextKey(c, constant.ContextKeyChannelType, constant.ChannelTypeMidjourney)
				common.SetContextKey(c, constant.ContextKeyChannelId, 1)
				common.SetContextKey(c, constant.ContextKeyChannelBaseUrl, upstream.URL)
				common.SetContextKey(c, constant.ContextKeyOriginalModel, endpoint.model)
				info := &relaycommon.RelayInfo{UserId: user.Id, UserQuota: 1000, UserGroup: "default", UsingGroup: "default", TokenId: token.Id, TokenKey: token.Key, TokenUnlimited: true, OriginModelName: endpoint.model, StartTime: time.Now(), RelayMode: endpoint.mode}
				info.UserSetting.BillingPreference = "wallet_only"
				var rejected bool
				if endpoint.name == "swapface" {
					response := RelaySwapFace(c, info)
					rejected = response != nil
					if rejected {
						require.Equal(t, "legacy_midjourney_subscription_unsupported", response.Description)
					}
				} else {
					response := RelayMidjourneySubmit(c, info)
					rejected = response != nil
					if rejected {
						require.Equal(t, "legacy_midjourney_subscription_unsupported", response.Description)
					}
				}
				require.NoError(t, db.First(user, user.Id).Error)
				if state == "ordinary_wallet" {
					require.False(t, rejected, recorder.Body.String())
					require.EqualValues(t, 1, calls.Load())
					require.Equal(t, 950, user.Quota, "ordinary legacy requests still debit the wallet")
				} else {
					require.True(t, rejected)
					require.Zero(t, calls.Load(), "Tenant requests must be rejected before upstream")
					require.Equal(t, 1000, user.Quota)
					require.NoError(t, db.First(token, token.Id).Error)
					require.Zero(t, token.UsedQuota)
					var count int64
					require.NoError(t, db.Model(&model.Midjourney{}).Where("user_id = ?", user.Id).Count(&count).Error)
					require.Zero(t, count)
				}
			})
		}
	}
}

func TestLegacyMidjourneyTenantMembershipDBFailureFailsClosed(t *testing.T) {
	db := legacyTenantFundingDB(t, false) // intentionally absent membership table
	user := &model.User{Id: 7912999, Username: "legacy-db-failure", AffCode: "legacy-db-failure", Quota: 1000, Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(user).Error)
	var calls atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		_, _ = io.WriteString(w, `{"code":1,"result":"must-not-submit"}`)
	}))
	t.Cleanup(upstream.Close)
	for _, name := range []string{"midjourney", "swapface"} {
		t.Run(name, func(t *testing.T) {
			c, _ := gin.CreateTestContext(httptest.NewRecorder())
			c.Request = httptest.NewRequest(http.MethodPost, "/mj/submit/imagine", strings.NewReader(`{"prompt":"test"}`))
			c.Set("base_url", upstream.URL)
			info := &relaycommon.RelayInfo{UserId: user.Id, UserQuota: 1000}
			if name == "midjourney" {
				response := RelayMidjourneySubmit(c, info)
				require.NotNil(t, response)
				require.Equal(t, "legacy_midjourney_billing_unavailable", response.Description)
			} else {
				response := RelaySwapFace(c, info)
				require.NotNil(t, response)
				require.Equal(t, "legacy_midjourney_billing_unavailable", response.Description)
			}
		})
	}
	require.Zero(t, calls.Load())
	require.NoError(t, db.First(user, user.Id).Error)
	require.Equal(t, 1000, user.Quota)
}
