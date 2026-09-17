package controller

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCashbackQuotaMutationErrorsUseStableSafeContract(t *testing.T) {
	gin.SetMode(gin.TestMode)
	testCases := []struct {
		name    string
		err     error
		status  int
		code    string
		message string
	}{
		{
			name:    "pending mutation",
			err:     model.ErrUserQuotaMutationPending,
			status:  http.StatusConflict,
			code:    "CASHBACK_QUOTA_MUTATION_PENDING",
			message: cashbackQuotaMutationPendingMessage,
		},
		{
			name:    "lost fence",
			err:     model.ErrUserQuotaMutationFenceLost,
			status:  http.StatusServiceUnavailable,
			code:    "CASHBACK_QUOTA_FENCE_LOST",
			message: cashbackQuotaFenceLostMessage,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			wrapped := fmt.Errorf("private redis diagnostics: %w", testCase.err)
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)

			status := cashbackErrorStatus(wrapped)
			cashbackAPIError(context, status, wrapped)

			assert.Equal(t, testCase.status, recorder.Code)
			var response struct {
				Success bool   `json:"success"`
				Code    string `json:"code"`
				Message string `json:"message"`
			}
			require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
			assert.False(t, response.Success)
			assert.Equal(t, testCase.code, response.Code)
			assert.Equal(t, testCase.message, response.Message)
			assert.NotContains(t, response.Message, testCase.err.Error())
			assert.NotContains(t, recorder.Body.String(), "private redis diagnostics")
		})
	}
}

func TestCashbackStateErrorsUseConflictCode(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, testCase := range []struct {
		name string
		err  error
	}{
		{name: "missing debt", err: model.ErrCashbackDebtNotFound},
		{name: "invalid top-up state", err: model.ErrTopUpStatusInvalid},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)

			status := cashbackErrorStatus(testCase.err)
			cashbackAPIError(context, status, testCase.err)

			assert.Equal(t, http.StatusConflict, recorder.Code)
			var response struct {
				Code string `json:"code"`
			}
			require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
			assert.Equal(t, "CASHBACK_STATE_CONFLICT", response.Code)
		})
	}
}
