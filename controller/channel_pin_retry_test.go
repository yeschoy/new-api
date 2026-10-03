package controller

import (
	"errors"
	"fmt"
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestShouldRetryHonorsPinRetryMode(t *testing.T) {
	openaiErr := types.NewOpenAIError(errors.New("upstream"), types.ErrorCodeBadResponseStatusCode, http.StatusInternalServerError)

	c := newPinRetryContext()
	assert.True(t, service.ShouldRetryRelayError(c, openaiErr, 1))

	origin := newPinRetryContext()
	service.GetChannelConstraints(origin).AddPin(dto.ChannelPin{
		ChannelId: 2,
		Source:    dto.PinSourceOriginTask,
		Rank:      dto.PinRankOriginTask,
		RetryMode: dto.PinRetrySameChannel,
	})
	assert.True(t, service.ShouldRetryRelayError(origin, openaiErr, 1), "origin pin retries on the same channel")

	token := newPinRetryContext()
	service.GetChannelConstraints(token).AddPin(dto.ChannelPin{
		ChannelId: 1,
		Source:    dto.PinSourceToken,
		Rank:      dto.PinRankToken,
		RetryMode: dto.PinRetrySingleAttempt,
	})
	assert.Equal(t, service.PolicyDecision{Action: "stop", Reason: "pinned_channel", Source: "channel_constraint"}, service.DecideRelayRetry(token, openaiErr, 1), "token pin suppresses retry")
}

func TestShouldRetryTaskRelayHonorsPinRetryMode(t *testing.T) {
	taskErr := &dto.TaskError{StatusCode: http.StatusInternalServerError}

	c := newPinRetryContext()
	assert.Equal(t, "retry", decideTaskRetry(c, taskErr, 1).Action)

	origin := newPinRetryContext()
	service.GetChannelConstraints(origin).AddPin(dto.ChannelPin{
		ChannelId: 2,
		Source:    dto.PinSourceOriginTask,
		Rank:      dto.PinRankOriginTask,
		RetryMode: dto.PinRetrySameChannel,
	})
	assert.Equal(t, "retry", decideTaskRetry(origin, taskErr, 1).Action)

	token := newPinRetryContext()
	service.GetChannelConstraints(token).AddPin(dto.ChannelPin{
		ChannelId: 1,
		Source:    dto.PinSourceToken,
		Rank:      dto.PinRankToken,
		RetryMode: dto.PinRetrySingleAttempt,
	})
	assert.Equal(t, service.PolicyDecision{Action: "stop", Reason: "pinned_channel", Source: "channel_constraint"}, decideTaskRetry(token, taskErr, 1))
}

func TestSameChannelPinsMergeToStricterRetryMode(t *testing.T) {
	c := newPinRetryContext()
	constraints := service.GetChannelConstraints(c)
	constraints.AddPin(dto.ChannelPin{
		ChannelId: 7,
		Source:    dto.PinSourceOriginTask,
		Rank:      dto.PinRankOriginTask,
		RetryMode: dto.PinRetrySameChannel,
	})
	constraints.AddPin(dto.ChannelPin{
		ChannelId: 7,
		Source:    dto.PinSourceToken,
		Rank:      dto.PinRankToken,
		RetryMode: dto.PinRetrySingleAttempt,
	})
	pin, found, overridden := constraints.ResolvedPin()
	require.True(t, found)
	assert.Equal(t, 7, pin.ChannelId)
	assert.Equal(t, dto.PinRetrySingleAttempt, pin.RetryMode)
	assert.Empty(t, overridden)
	assert.False(t, service.ShouldRetryRelayError(c, types.NewOpenAIError(errors.New("upstream"), types.ErrorCodeBadResponseStatusCode, http.StatusInternalServerError), 1))
}

func newPinRetryContext() *gin.Context {
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	return c
}

// The distributor chooses a real group before pricing. A reserved subscription
// must keep that group on a retry, even when auto can route the same model elsewhere.
func TestAutoGroupSubscriptionFundingAndRetryRouting(t *testing.T) {
	require.NoError(t, i18n.Init())
	db := modelManagementDB(t, "sqlite", "")
	require.NoError(t, db.AutoMigrate(&model.Token{}, &model.SubscriptionPlan{}, &model.UserSubscription{}, &model.SubscriptionPreConsumeRecord{}))
	previousGroups := setting.UserUsableGroups2JSONString()
	previousRatio := ratio_setting.GroupRatio2JSONString()
	previousMax := setting.GetMaxTokenAutoGroups()
	previousRetry := common.RetryTimes
	t.Cleanup(func() {
		require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(previousGroups))
		require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(previousRatio))
		require.NoError(t, setting.UpdateMaxTokenAutoGroups(fmt.Sprint(previousMax)))
		common.RetryTimes = previousRetry
	})
	require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default","deepflash":"Deepflash","other":"Other"}`))
	require.NoError(t, setting.UpdateMaxTokenAutoGroups("2"))
	require.NoError(t, config.GlobalConfig.LoadFromDB(map[string]string{
		"group_ratio_setting.group_ratio": `{"default":1,"deepflash":1,"other":1}`,
	}))
	require.NoError(t, ratio_setting.UpdateModelPriceByJSONString(`{"scope-route":0.001}`))
	common.RetryTimes = 0
	for _, ch := range []model.Channel{
		{Id: 9101, Name: "deepflash-route", Type: constant.ChannelTypeOpenAI, Key: "test-key", Status: common.ChannelStatusEnabled, Models: "scope-route", Group: "deepflash"},
		{Id: 9102, Name: "other-route", Type: constant.ChannelTypeOpenAI, Key: "test-key", Status: common.ChannelStatusEnabled, Models: "scope-route", Group: "other"},
	} {
		require.NoError(t, db.Create(&ch).Error)
		require.NoError(t, ch.AddAbilities(db))
	}
	model.InitChannelCache()

	for i, tc := range []struct {
		name, tokenGroup, firstGroup string
		autoGroups                   []string
		pin                          bool
		wantSource, retryGroup       string
		wantFirst, wantRetry         int
		wantRejected                 bool
	}{
		{"auto selects unrelated group", "auto", "other", []string{"other", "deepflash"}, false, service.BillingSourceWallet, "deepflash", 9102, 9101, false},
		{"pinned real group", "deepflash", "deepflash", nil, true, service.BillingSourceSubscription, "deepflash", 9101, 9101, false},
		{"pinned auto has no resolved group", "auto", "auto", []string{"deepflash", "other"}, true, "", "", 9101, 0, true},
		{"auto retry cannot submit in another group", "auto", "deepflash", []string{"deepflash", "other"}, false, service.BillingSourceSubscription, "other", 9101, 9102, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if tc.name == "auto retry cannot submit in another group" {
				common.RetryTimes = 1
			}
			user := &model.User{Username: "scope-route-" + strings.ReplaceAll(tc.name, " ", "-"), AffCode: fmt.Sprintf("scope-route-aff-%d", i), Group: "default", Quota: 10000, Status: common.UserStatusEnabled}
			require.NoError(t, db.Create(user).Error)
			token := &model.Token{UserId: user.Id, Key: fmt.Sprintf("scope-route-%d", user.Id), RemainQuota: 10000, Status: common.TokenStatusEnabled}
			require.NoError(t, db.Create(token).Error)
			plan := &model.SubscriptionPlan{Title: "deepflash-only", ApplicableGroup: "deepflash", Enabled: true, DurationUnit: "month", DurationValue: 1}
			require.NoError(t, db.Create(plan).Error)
			now := model.GetDBTimestamp()
			sub := &model.UserSubscription{UserId: user.Id, PlanId: plan.Id, Status: "active", StartTime: now - 1, EndTime: now + 3600, AmountTotal: 10000}
			require.NoError(t, db.Create(sub).Error)

			var info *relaycommon.RelayInfo
			var billedQuota int
			router := gin.New()
			router.POST("/v1/chat/completions", func(c *gin.Context) {
				common.SetContextKey(c, constant.ContextKeyUserId, user.Id)
				common.SetContextKey(c, constant.ContextKeyUserGroup, "default")
				common.SetContextKey(c, constant.ContextKeyUsingGroup, tc.tokenGroup)
				common.SetContextKey(c, constant.ContextKeyTokenGroup, tc.tokenGroup)
				common.SetContextKey(c, constant.ContextKeyTokenAutoGroups, tc.autoGroups)
				common.SetContextKey(c, constant.ContextKeyTokenCrossGroupRetry, true)
				common.SetContextKey(c, constant.ContextKeyTokenId, token.Id)
				common.SetContextKey(c, constant.ContextKeyTokenKey, token.Key)
				if tc.pin {
					service.GetChannelConstraints(c).AddPin(dto.ChannelPin{ChannelId: 9101, Source: dto.PinSourceOriginTask, Rank: dto.PinRankOriginTask, RetryMode: dto.PinRetrySameChannel})
				}
				c.Next()
			}, middleware.Distribute(), func(c *gin.Context) {
				assert.Equal(t, tc.wantFirst, c.GetInt("channel_id"))
				var err error
				format := types.RelayFormatOpenAI
				if tc.name == "auto retry cannot submit in another group" {
					format = types.RelayFormatTask
				}
				info, err = relaycommon.GenRelayInfo(c, format, nil, nil)
				require.NoError(t, err)
				assert.Equal(t, tc.tokenGroup, info.TokenGroup, "token routing preference must not become the selected auto group")
				info.UserSetting.BillingPreference = "subscription_first"
				info.ForcePreConsume = true
				price, err := helper.ModelPriceHelperPerCall(c, info)
				require.NoError(t, err)
				info.PriceData = price
				billedQuota = price.Quota
				assert.Positive(t, billedQuota)
				assert.Equal(t, tc.firstGroup, info.UsingGroup)
				apiErr := service.PreConsumeBilling(c, billedQuota, info)
				if tc.tokenGroup == "auto" && tc.pin {
					require.NotNil(t, apiErr, "unresolved pinned auto group must not fall back to the wallet")
					assert.Equal(t, types.ErrorCodeUpdateDataError, apiErr.GetErrorCode())
					c.Status(apiErr.StatusCode)
					return
				}
				require.Nil(t, apiErr)
				assert.Equal(t, tc.wantSource, info.BillingSource)
				if tc.wantSource == service.BillingSourceSubscription {
					assert.Equal(t, sub.Id, info.SubscriptionId)
					assert.Equal(t, "deepflash", info.SubscriptionApplicableGroup)
				}
				if tc.name == "auto retry cannot submit in another group" {
					// A channel going offline after the first upstream failure makes
					// the real auto selector advance to the next group on retry.
					refunded := make(chan struct{}, 1)
					const callback = "scope_route_refund_observed"
					require.NoError(t, db.Callback().Update().After("gorm:commit_or_rollback_transaction").Register(callback, func(tx *gorm.DB) {
						if tx.Statement.Table == "tokens" && tx.Error == nil {
							select {
							case refunded <- struct{}{}:
							default:
							}
						}
					}))
					t.Cleanup(func() { require.NoError(t, db.Callback().Update().Remove(callback)) })
					attempts := 0
					outcome, taskErr := executeTaskSubmissionWith(c, info, func(c *gin.Context, info *relaycommon.RelayInfo) (*relay.TaskSubmitResult, *dto.TaskError) {
						attempts++
						assert.Equal(t, tc.firstGroup, info.UsingGroup)
						info.InitChannelMeta(c) // the real task submitter refreshes channel metadata on entry
						require.NoError(t, db.Model(&model.Channel{}).Where("id = ?", tc.wantFirst).Update("status", common.ChannelStatusManuallyDisabled).Error)
						return nil, &dto.TaskError{StatusCode: http.StatusBadGateway, Message: "upstream unavailable"}
					})
					require.Nil(t, outcome)
					require.NotNil(t, taskErr)
					assert.Equal(t, "get_channel_failed", taskErr.Code)
					assert.Equal(t, 2, attempts, "same-group retries may submit, but the other-group candidate must not")
					assert.Equal(t, tc.wantFirst, c.GetInt("channel_id"))
					assert.Equal(t, tc.firstGroup, info.UsingGroup)
					select {
					case <-refunded:
					case <-time.After(5 * time.Second):
						t.Fatal("subscription refund did not finish")
					}
					c.Status(http.StatusBadGateway)
					return
				}
				// A non-restricted wallet or a pin may still select its next
				// candidate. This check runs at the same pre-submit boundary.
				info.InitChannelMeta(c)
				retry := &service.RetryParam{Ctx: c, TokenGroup: info.TokenGroup, ModelName: info.OriginModelName, RequestPath: c.Request.URL.Path, Retry: common.GetPointer(0)}
				channel, selectErr := getChannel(c, info, retry)
				if tc.wantRejected {
					require.Nil(t, channel)
					require.NotNil(t, selectErr)
					assert.Contains(t, selectErr.Error(), tc.retryGroup)
					assert.Equal(t, tc.wantFirst, c.GetInt("channel_id"))
					assert.Equal(t, tc.firstGroup, info.UsingGroup)
				} else {
					require.Nil(t, selectErr)
					require.NotNil(t, channel)
					assert.Equal(t, tc.wantRetry, channel.Id)
					assert.Equal(t, tc.retryGroup, info.UsingGroup)
				}
				require.NoError(t, info.Billing.Settle(billedQuota))
			})
			recorder := httptest.NewRecorder()
			request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"scope-route"}`))
			request.Header.Set("Content-Type", "application/json")
			router.ServeHTTP(recorder, request)
			if tc.wantRejected {
				assert.NotEqual(t, http.StatusOK, recorder.Code, "restricted or unresolved group must reject before submission")
			} else {
				require.Equal(t, http.StatusOK, recorder.Code, recorder.Body.String())
			}
			require.NotNil(t, info, "the real distributor must select the channel before billing")
			require.NoError(t, db.First(user, user.Id).Error)
			require.NoError(t, db.First(&sub, sub.Id).Error)
			if tc.name == "auto retry cannot submit in another group" {
				require.NoError(t, db.First(token, token.Id).Error)
				assert.Equal(t, 10000, token.RemainQuota, "failed scoped retry restores the token reservation")
			}
			if tc.wantSource == service.BillingSourceWallet {
				assert.Equal(t, 10000-billedQuota, user.Quota)
				assert.Zero(t, sub.AmountUsed)
			} else if tc.wantSource == service.BillingSourceSubscription {
				assert.Equal(t, 10000, user.Quota)
				if tc.name == "auto retry cannot submit in another group" {
					assert.Zero(t, sub.AmountUsed, "failed request refunds only its originally selected subscription")
				} else {
					assert.EqualValues(t, billedQuota, sub.AmountUsed)
				}
			} else {
				assert.Equal(t, 10000, user.Quota)
				assert.Zero(t, sub.AmountUsed)
			}
		})
	}
}

func TestRequestPolicyConfigReturnsSettingsWithoutMigration(t *testing.T) {
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	GetRequestPolicy(ctx)
	assert.Equal(t, http.StatusOK, recorder.Code)
	var response struct {
		Success bool           `json:"success"`
		Data    map[string]any `json:"data"`
	}
	require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
	assert.True(t, response.Success)
	assert.Contains(t, response.Data, "options")
	assert.NotContains(t, response.Data, "migration")
	assert.NotContains(t, response.Data, "differences")
}

func TestRequestPolicyRoutingDatabaseMatrix(t *testing.T) {
	require.NoError(t, i18n.Init())
	for _, dialect := range []struct{ kind, env string }{{"sqlite", ""}, {"mysql", "TEST_MYSQL_DSN"}, {"postgres", "TEST_POSTGRES_DSN"}} {
		t.Run(dialect.kind, func(t *testing.T) {
			dsn := ""
			if dialect.env != "" {
				dsn = os.Getenv(dialect.env)
				if dsn == "" {
					t.Skipf("%s not configured", dialect.env)
				}
			}
			db := modelManagementDB(t, dialect.kind, dsn)
			previousGroups := setting.UserUsableGroups2JSONString()
			previousRatios, err := common.Marshal(ratio_setting.GetGroupRatioCopy())
			require.NoError(t, err)
			require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default"}`))
			require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1}`))
			t.Cleanup(func() {
				require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(previousGroups))
				require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(string(previousRatios)))
			})
			// Channel 1 holds the session binding but is no longer usable.
			channels := []model.Channel{
				{Id: 1, Name: "A", Type: 1, Key: "test-only", Status: common.ChannelStatusAutoDisabled, Models: "policy-test", Group: "default", Priority: common.GetPointer(int64(10))},
				{Id: 2, Name: "B", Type: 1, Key: "test-only", Status: common.ChannelStatusEnabled, Models: "policy-test", Group: "default", Priority: common.GetPointer(int64(5))},
			}
			for i := range channels {
				require.NoError(t, db.Create(&channels[i]).Error)
				require.NoError(t, channels[i].AddAbilities(db))
			}
			affinity := operation_setting.GetChannelAffinitySetting()
			previousAffinity := *affinity
			t.Cleanup(func() { *affinity = previousAffinity })
			for _, cached := range []bool{false, true} {
				for _, keep := range []bool{false, true} {
					for _, tc := range []struct {
						globalMode, ruleMode string
						blocked              bool
					}{
						{"strict", "inherit", true},
						{"prefer", "strict", true},
						{"prefer", "inherit", false},
						{"strict", "prefer", false},
					} {
						t.Run(fmt.Sprintf("cache=%t/keep=%t/global=%s/rule=%s", cached, keep, tc.globalMode, tc.ruleMode), func(t *testing.T) {
							common.MemoryCacheEnabled = cached
							model.InitChannelCache()
							snapshot, err := model.BuildRequestPolicy(map[string]string{
								"channel_affinity_setting.enabled":                  "true",
								"channel_affinity_setting.session_mode":             tc.globalMode,
								"channel_affinity_setting.keep_on_channel_disabled": fmt.Sprint(keep),
								"channel_affinity_setting.rules":                    fmt.Sprintf(`[{"name":"session","model_regex":[".*"],"key_sources":[{"type":"request_header","key":"X-Session"}],"session_mode":%q}]`, tc.ruleMode),
							})
							require.NoError(t, err)
							*affinity = snapshot.Affinity
							seed := newPinRetryContext()
							seed.Request.Header.Set("X-Session", t.Name())
							_, found := service.GetPreferredChannelByAffinity(seed, "policy-test", "default")
							require.False(t, found)
							seed.Set("channel_id", 1)
							service.RecordChannelAffinity(seed, 1)
							t.Cleanup(func() { service.ClearCurrentChannelAffinityCache(seed) })
							bound, found := service.GetPreferredChannelByAffinity(seed, "policy-test", "default")
							require.True(t, found)
							require.Equal(t, 1, bound)

							request := newPinRetryContext()
							request.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"policy-test"}`))
							request.Request.Header.Set("Content-Type", "application/json")
							request.Request.Header.Set("X-Session", t.Name())
							common.SetContextKey(request, constant.ContextKeyUsingGroup, "default")
							middleware.Distribute()(request)
							events := service.RequestPolicy(request).Events()
							assert.True(t, slices.ContainsFunc(events, func(event service.PolicyEvent) bool { return event.Decision.Reason == "session_rule_matched" }), "decision events are recorded for every request")
							bound, found = service.GetPreferredChannelByAffinity(seed, "policy-test", "default")
							if tc.blocked {
								assert.Equal(t, http.StatusServiceUnavailable, request.Writer.Status())
								assert.True(t, request.IsAborted())
								assert.Equal(t, keep, found, "binding retention is independent of strict request handling")
								if found {
									assert.Equal(t, 1, bound)
								}
								return
							}
							assert.False(t, request.IsAborted())
							assert.Equal(t, 2, common.GetContextKeyInt(request, constant.ContextKeyChannelId), "prefer falls back to the next eligible channel")
							require.True(t, found)
							assert.Equal(t, 2, bound, "a successful fallback rebinds the session")
						})
					}
				}
			}
		})
	}
}
