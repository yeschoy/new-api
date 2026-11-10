package service

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// Run only in the task-owned Docker Go runner, like every DB test.
func TestPartnerTenantMembershipQueryFailureDoesNotFallBackToWallet(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	conn, err := db.DB()
	require.NoError(t, err)
	conn.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = conn.Close() })
	previous := model.DB
	model.DB = db
	model.ResetPartnerTenantMembershipCache()
	t.Cleanup(func() {
		model.DB = previous
		model.ResetPartnerTenantMembershipCache()
	})
	require.NoError(t, db.AutoMigrate(&model.User{})) // membership table intentionally absent
	user := &model.User{Id: 8912321, Username: "membership-db-failure", AffCode: "db-fail", Quota: 1000, Status: common.UserStatusEnabled}
	require.NoError(t, db.Create(user).Error)
	for _, pref := range []string{"wallet_only", "wallet_first", "subscription_first", "subscription_only"} {
		ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
		info := &relaycommon.RelayInfo{UserId: user.Id, UsingGroup: "default"}
		info.UserSetting.BillingPreference = pref
		session, apiErr := NewBillingSession(ctx, info, 20)
		require.Nil(t, session)
		require.NotNil(t, apiErr)
		require.Equal(t, types.ErrorCodeQueryDataError, apiErr.GetErrorCode())
	}
	require.NoError(t, db.First(user, user.Id).Error)
	require.Equal(t, 1000, user.Quota)
}
