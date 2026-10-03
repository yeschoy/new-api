package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestCashbackPublicOffersAnonymousAndConfigRootOnly(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousType := common.MainDatabaseType()
	previousRedis := common.RedisEnabled
	previousRateEnabled := common.GlobalApiRateLimitEnable
	previousRateNum := common.GlobalApiRateLimitNum
	previousRateDuration := common.GlobalApiRateLimitDuration
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.Option{}, &model.User{}, &model.AuditLog{}))
	model.DB, model.LOG_DB = db, db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.RedisEnabled = false
	common.GlobalApiRateLimitEnable = false
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.SetMainDatabaseType(previousType)
		common.RedisEnabled = previousRedis
		common.GlobalApiRateLimitEnable = previousRateEnabled
		common.GlobalApiRateLimitNum = previousRateNum
		common.GlobalApiRateLimitDuration = previousRateDuration
		_ = sqlDB.Close()
	})

	adminToken := "cashback-offers-admin-pat"
	rootToken := "cashback-offers-root-pat"
	require.NoError(t, db.Create(&model.User{Username: "offers-admin", Password: "placeholder", Role: common.RoleAdminUser, Status: common.UserStatusEnabled, AccessToken: &adminToken, AffCode: "offers-admin"}).Error)
	require.NoError(t, db.Create(&model.User{Username: "offers-root", Password: "placeholder", Role: common.RoleRootUser, Status: common.UserStatusEnabled, AccessToken: &rootToken, AffCode: "offers-root"}).Error)

	engine := gin.New()
	SetApiRouter(engine)
	request := func(path, token, remoteAddr string) *httptest.ResponseRecorder {
		t.Helper()
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.RemoteAddr = remoteAddr
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
		engine.ServeHTTP(recorder, req)
		return recorder
	}

	public := request("/api/cashback/public-offers", "", "192.0.2.181:1234")
	require.Equal(t, http.StatusOK, public.Code, public.Body.String())
	assert.Contains(t, public.Body.String(), `"active":false`)
	assert.NotContains(t, public.Body.String(), "max_reward_quota")
	assert.Equal(t, http.StatusUnauthorized, request("/api/cashback/config", "", "192.0.2.182:1234").Code)
	admin := request("/api/cashback/config", adminToken, "192.0.2.183:1234")
	assert.Equal(t, http.StatusForbidden, admin.Code, admin.Body.String())
	root := request("/api/cashback/config", rootToken, "192.0.2.184:1234")
	assert.Equal(t, http.StatusOK, root.Code, root.Body.String())
	assert.Contains(t, root.Body.String(), "max_reward_quota")

	// Register a fresh router with the global API limiter enabled. A public
	// cashback read must traverse it just like the other anonymous API routes.
	common.GlobalApiRateLimitEnable = true
	common.GlobalApiRateLimitNum = 1
	common.GlobalApiRateLimitDuration = 3600
	limited := gin.New()
	SetApiRouter(limited)
	for index, status := range []int{http.StatusOK, http.StatusTooManyRequests} {
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/api/cashback/public-offers", nil)
		req.RemoteAddr = "192.0.2.185:1234"
		limited.ServeHTTP(recorder, req)
		assert.Equal(t, status, recorder.Code, "request %d: %s", index+1, recorder.Body.String())
	}
}
