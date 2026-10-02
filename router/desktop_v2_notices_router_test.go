package router

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type desktopNoticesResponse struct {
	Success bool `json:"success"`
	Data    struct {
		Notices []map[string]any `json:"notices"`
	} `json:"data"`
}

// setupDesktopNoticesTest returns a desktop-device session access token and
// restores global state after the test.
func setupDesktopNoticesTest(t *testing.T) string {
	t.Helper()
	previousDB := model.DB
	previousType := common.MainDatabaseType()
	previousRedis, previousClient := common.RedisEnabled, common.RDB
	previousSecret := common.SessionSecret
	common.OptionMapRWMutex.Lock()
	previousOptions := common.OptionMap
	common.OptionMap = map[string]string{}
	common.OptionMapRWMutex.Unlock()

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.UserSession{}))
	model.DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.RedisEnabled = false
	common.RDB = nil
	common.SessionSecret = "desktop-notices-router-test-secret"
	t.Cleanup(func() {
		model.DB = previousDB
		common.SetMainDatabaseType(previousType)
		common.RedisEnabled, common.RDB = previousRedis, previousClient
		common.SessionSecret = previousSecret
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptions
		common.OptionMapRWMutex.Unlock()
	})

	user := &model.User{
		Username: "desktop-notices-user", Password: "password-placeholder", Role: common.RoleCommonUser,
		Status: common.UserStatusEnabled, Group: "default", AuthVersion: 1, AffCode: "desktop-notices-aff",
	}
	require.NoError(t, db.Create(user).Error)
	bundle, err := service.CreateLoginSession(user.Id, service.DesktopLoginMethod, "127.0.0.1", "desktop-notices-test")
	require.NoError(t, err)
	return bundle.AccessToken
}

func setDesktopNoticesOption(value string) {
	common.OptionMapRWMutex.Lock()
	common.OptionMap[setting.DesktopNoticesKey] = value
	common.OptionMapRWMutex.Unlock()
}

func getDesktopNotices(t *testing.T, token string) (*httptest.ResponseRecorder, desktopNoticesResponse) {
	t.Helper()
	request := httptest.NewRequest(http.MethodGet, "/api/desktop/v2/notices", nil)
	request.Header.Set("Authorization", "Bearer "+token)
	response := httptest.NewRecorder()
	newDesktopV2TestRouter().ServeHTTP(response, request)
	var body desktopNoticesResponse
	if response.Code == http.StatusOK {
		require.NoError(t, common.Unmarshal(response.Body.Bytes(), &body))
	}
	return response, body
}

func TestDesktopV2NoticesDropsExpiredEntriesForDesktopSession(t *testing.T) {
	token := setupDesktopNoticesTest(t)
	nowMs := time.Now().UnixMilli()
	setDesktopNoticesOption(fmt.Sprintf(`[
		{"id":"expired","title":"已过期","expiresAtEpochMs":%d},
		{"id":"forever","title":"长期有效","severity":"info","expiresAtEpochMs":0,"action":{"kind":"wallet","label":"去充值"}},
		{"id":"future","title":"未过期","severity":"warning","banner":true,"expiresAtEpochMs":%d}
	]`, nowMs-60_000, nowMs+3_600_000))

	response, body := getDesktopNotices(t, token)

	require.Equal(t, http.StatusOK, response.Code)
	assert.Contains(t, response.Header().Get("Content-Type"), "application/json")
	assert.True(t, body.Success)
	require.Len(t, body.Data.Notices, 2)
	assert.Equal(t, "forever", body.Data.Notices[0]["id"])
	assert.Equal(t, map[string]any{"kind": "wallet", "label": "去充值"}, body.Data.Notices[0]["action"])
	assert.Equal(t, "future", body.Data.Notices[1]["id"])
	assert.Equal(t, true, body.Data.Notices[1]["banner"])
}

func TestDesktopV2NoticesDegradesToEmptyListOnBadConfig(t *testing.T) {
	token := setupDesktopNoticesTest(t)
	for _, value := range []string{"", "not json", `{"title":"object, not array"}`, "null"} {
		t.Run(value, func(t *testing.T) {
			setDesktopNoticesOption(value)

			response, body := getDesktopNotices(t, token)

			require.Equal(t, http.StatusOK, response.Code)
			assert.Contains(t, response.Header().Get("Content-Type"), "application/json")
			assert.JSONEq(t, `{"success":true,"data":{"notices":[]}}`, response.Body.String())
			assert.True(t, body.Success)
		})
	}
}

func TestDesktopV2NoticesServesAtMostThirtyEntries(t *testing.T) {
	token := setupDesktopNoticesTest(t)
	raw := "["
	for index := 0; index < setting.DesktopNoticesMaxServed+5; index++ {
		if index > 0 {
			raw += ","
		}
		raw += fmt.Sprintf(`{"id":"n%d","title":"公告 %d"}`, index, index)
	}
	setDesktopNoticesOption(raw + "]")

	response, body := getDesktopNotices(t, token)

	require.Equal(t, http.StatusOK, response.Code)
	require.Len(t, body.Data.Notices, setting.DesktopNoticesMaxServed)
	assert.Equal(t, "n0", body.Data.Notices[0]["id"])
}
