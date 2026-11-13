package service

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestPartnerTenantAccessModeProofBinding(t *testing.T) {
	bind := func(body string) (VerificationBinding, error) {
		return BindVerificationOperation(VerificationOperation{Scope: VerificationScopePartnerTenantSensitiveWrite, Context: []byte(body)})
	}
	sub, err := bind(`{"action":"create","group":"partner","integration_mode":"subscription_key"}`)
	require.NoError(t, err)
	h5, err := bind(`{"action":"create","group":"partner","integration_mode":"hosted_h5"}`)
	require.NoError(t, err)
	require.NotEqual(t, sub.ContextHash, h5.ContextHash)
	for _, body := range []string{
		`{"action":"create","group":"partner"}`,
		`{"action":"create","group":"partner","integration_mode":""}`,
		`{"action":"create","group":"partner","integration_mode":null}`,
		`{"action":"create","group":"partner","integration_mode":"external"}`,
		`{"action":"create","group":"partner","integration_mode":"unknown"}`,
		`{"action":"rotate_secret","tenant_id":1,"integration_mode":"hosted_h5"}`,
	} {
		_, err = bind(body)
		require.ErrorIs(t, err, ErrVerificationContextInvalid, body)
	}
	_, err = bind(`{"action":"rotate_secret","tenant_id":1}`)
	require.NoError(t, err)
}
