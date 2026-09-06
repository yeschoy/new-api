package router

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/alicebob/miniredis/v2"
	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newDesktopV2TestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	registerDesktopRoutes(router.Group("/api"))
	return router
}

func TestDesktopV2BootstrapAdvertisesExistingOwnersWithoutChangingV1(t *testing.T) {
	previousAddress := system_setting.ServerAddress
	previousRedis := common.RedisEnabled
	previousClient := common.RDB
	system_setting.ServerAddress = "https://yeschoy.com/"
	common.RedisEnabled = false
	common.RDB = nil
	t.Cleanup(func() {
		system_setting.ServerAddress = previousAddress
		common.RedisEnabled = previousRedis
		common.RDB = previousClient
	})

	router := newDesktopV2TestRouter()
	v1 := httptest.NewRecorder()
	router.ServeHTTP(v1, httptest.NewRequest(http.MethodGet, desktopBootstrapPath, nil))
	require.Equal(t, http.StatusOK, v1.Code)
	assert.JSONEq(t, string(desktopBootstrapFixture(t)), v1.Body.String())

	v2 := httptest.NewRecorder()
	router.ServeHTTP(v2, httptest.NewRequest(http.MethodGet, "/api/desktop/v2/bootstrap", nil))
	require.Equal(t, http.StatusOK, v2.Code)
	assert.Contains(t, v2.Body.String(), `"contract_id":"desktop-integration-v2"`)
	assert.Contains(t, v2.Body.String(), `"minimum_client_version":"0.2.0"`)
	assert.Contains(t, v2.Body.String(), `"device_authorization_available":false`)
	assert.Contains(t, v2.Body.String(), `"official_usd_cny_rate":6.75`)
	assert.Contains(t, v2.Body.String(), `"wallet_url":"https://yeschoy.com/wallet/"`)
}

func TestDesktopV2SensitiveRoutesRequireExpectedAuthority(t *testing.T) {
	previousRedis := common.RedisEnabled
	previousClient := common.RDB
	common.RedisEnabled = false
	common.RDB = nil
	t.Cleanup(func() {
		common.RedisEnabled = previousRedis
		common.RDB = previousClient
	})
	router := newDesktopV2TestRouter()

	start := httptest.NewRecorder()
	startRequest := httptest.NewRequest(http.MethodPost, "/api/desktop/v2/device-authorizations", strings.NewReader(`{}`))
	startRequest.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(start, startRequest)
	assert.Equal(t, http.StatusServiceUnavailable, start.Code)
	assert.Contains(t, start.Body.String(), "temporarily_unavailable")

	decision := httptest.NewRecorder()
	decisionRequest := httptest.NewRequest(http.MethodPost, "/api/desktop/v2/device-authorizations/decision", strings.NewReader(`{"user_code":"ABCD-EFGH","decision":"approve"}`))
	decisionRequest.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(decision, decisionRequest)
	assert.Equal(t, http.StatusUnauthorized, decision.Code)

	revoke := httptest.NewRecorder()
	router.ServeHTTP(revoke, httptest.NewRequest(http.MethodDelete, "/api/desktop/v2/sessions/current", nil))
	assert.Equal(t, http.StatusUnauthorized, revoke.Code)
}

func TestDesktopV2UnsupportedMethodsDoNotFallThroughToCapabilities(t *testing.T) {
	router := newDesktopV2TestRouter()
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPut, "/api/desktop/v2/bootstrap", nil))

	assert.Equal(t, http.StatusNotFound, recorder.Code)
	assert.NotContains(t, recorder.Body.String(), "desktop-integration-v2")
}

func TestDesktopV2PollingRateLimitCoversAdvertisedLifetime(t *testing.T) {
	previousRedisEnabled, previousRedisClient := common.RedisEnabled, common.RDB
	previousCriticalEnabled := common.CriticalRateLimitEnable
	previousCriticalLimit, previousCriticalDuration := common.CriticalRateLimitNum, common.CriticalRateLimitDuration
	previousAddress := system_setting.ServerAddress
	server := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: server.Addr()})
	common.RedisEnabled = true
	common.RDB = client
	common.CriticalRateLimitEnable = true
	common.CriticalRateLimitNum = 20
	common.CriticalRateLimitDuration = 20 * 60
	system_setting.ServerAddress = "https://yeschoy.com"
	t.Cleanup(func() {
		_ = client.Close()
		common.RedisEnabled = previousRedisEnabled
		common.RDB = previousRedisClient
		common.CriticalRateLimitEnable = previousCriticalEnabled
		common.CriticalRateLimitNum = previousCriticalLimit
		common.CriticalRateLimitDuration = previousCriticalDuration
		system_setting.ServerAddress = previousAddress
	})

	router := newDesktopV2TestRouter()
	start := httptest.NewRecorder()
	router.ServeHTTP(start, httptest.NewRequest(http.MethodPost, "/api/desktop/v2/device-authorizations", strings.NewReader(`{}`)))
	require.Equal(t, http.StatusOK, start.Code)
	var started struct {
		Data struct {
			DeviceCode string `json:"device_code"`
		} `json:"data"`
	}
	require.NoError(t, common.Unmarshal(start.Body.Bytes(), &started))

	for poll := 1; poll <= 60; poll++ {
		keys, err := client.Keys(context.Background(), "desktop:v2:device:*").Result()
		require.NoError(t, err)
		require.Len(t, keys, 1)
		raw, err := client.Get(context.Background(), keys[0]).Result()
		require.NoError(t, err)
		var record map[string]any
		require.NoError(t, common.UnmarshalJsonStr(raw, &record))
		record["next_poll_at"] = 0
		payload, err := common.Marshal(record)
		require.NoError(t, err)
		require.NoError(t, client.Set(context.Background(), keys[0], string(payload), redis.KeepTTL).Err())

		body, err := common.Marshal(map[string]string{"device_code": started.Data.DeviceCode})
		require.NoError(t, err)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/desktop/v2/device-authorizations/token", strings.NewReader(string(body))))
		assert.Equal(t, http.StatusBadRequest, response.Code, "poll %d should remain inside the advertised five-minute window", poll)
		assert.Contains(t, response.Body.String(), "authorization_pending")
		server.FastForward(time.Second)
	}

	decision := httptest.NewRecorder()
	router.ServeHTTP(decision, httptest.NewRequest(http.MethodPost, "/api/desktop/v2/device-authorizations/decision", strings.NewReader(`{}`)))
	assert.Equal(t, http.StatusUnauthorized, decision.Code)
}
