package controller

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/stretchr/testify/require"
)

// testAccountBindAuthorization builds the session identity and the consumed
// security-proof authorization that account-binding OAuth flows require. The
// user gets a password so password is the policy's verification method.
func testAccountBindAuthorization(t *testing.T, identity service.AuthIdentity, provider string) (*service.AuthIdentity, *model.AuthFlowAuthorization) {
	t.Helper()
	require.NoError(t, model.DB.AutoMigrate(&model.TwoFA{}, &model.PasskeyCredential{}))
	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", identity.UserID).UpdateColumn("password", "test-password-hash").Error)
	context, err := common.Marshal(service.AccountBindingContext{Provider: provider})
	require.NoError(t, err)
	binding, err := service.BindVerificationOperation(service.VerificationOperation{Scope: service.VerificationScopeAccountBind, Context: context})
	require.NoError(t, err)
	return &identity, &model.AuthFlowAuthorization{
		AuthSessionIdentity: identity.SessionIdentity(),
		ProofID:             1,
		Scope:               binding.Scope,
		ContextHash:         binding.ContextHash,
		Method:              service.VerificationMethodPassword,
	}
}

// Login events are written to the independent audit table, not usage logs.
func requireLoginAuditLog(t *testing.T, userID int) model.AuditLog {
	t.Helper()
	var entry model.AuditLog
	require.NoError(t, model.LOG_DB.Where("user_id = ? AND category = ?", userID, model.AuditCategoryLogin).First(&entry).Error)
	return entry
}

// countLoginAuditLogs counts login audit events; userID 0 counts every user.
func countLoginAuditLogs(t *testing.T, userID int) int64 {
	t.Helper()
	query := model.LOG_DB.Model(&model.AuditLog{}).Where("category = ?", model.AuditCategoryLogin)
	if userID > 0 {
		query = query.Where("user_id = ?", userID)
	}
	var count int64
	require.NoError(t, query.Count(&count).Error)
	return count
}

// requireRefreshCookie returns the refresh cookie. Login responses may also
// carry the script-readable session hint cookie, and nothing else.
func requireRefreshCookie(t *testing.T, cookies []*http.Cookie) *http.Cookie {
	t.Helper()
	var refresh *http.Cookie
	for _, cookie := range cookies {
		switch cookie.Name {
		case service.RefreshCookieName:
			refresh = cookie
		case service.SessionHintCookieName:
			require.Equal(t, service.SessionHintCookieValue, cookie.Value)
			require.False(t, cookie.HttpOnly, "the session hint must stay script-readable")
		default:
			require.Failf(t, "unexpected cookie", "cookie %q", cookie.Name)
		}
	}
	require.NotNil(t, refresh, "refresh cookie is required")
	return refresh
}
