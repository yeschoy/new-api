package controller

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpdateOptionRejectsInvalidDesktopNoticesBeforeSaving(t *testing.T) {
	common.OptionMapRWMutex.Lock()
	previousOptions := common.OptionMap
	common.OptionMap = map[string]string{setting.DesktopNoticesKey: "[]"}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		common.OptionMapRWMutex.Lock()
		common.OptionMap = previousOptions
		common.OptionMapRWMutex.Unlock()
	})

	tests := map[string]string{
		"not an array":  `{"key":"DesktopNotices","value":"{\"title\":\"x\"}"}`,
		"missing title": `{"key":"DesktopNotices","value":"[{\"id\":\"a\"}]"}`,
		"duplicate id":  `{"key":"DesktopNotices","value":"[{\"id\":\"a\",\"title\":\"x\"},{\"id\":\"a\",\"title\":\"y\"}]"}`,
	}
	for name, body := range tests {
		t.Run(name, func(t *testing.T) {
			response := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(response)
			context.Request = httptest.NewRequest(http.MethodPut, "/api/option/", strings.NewReader(body))

			UpdateOption(context)

			var payload struct {
				Success bool   `json:"success"`
				Message string `json:"message"`
			}
			require.NoError(t, common.Unmarshal(response.Body.Bytes(), &payload))
			assert.False(t, payload.Success)
			assert.Contains(t, payload.Message, "DesktopNotices")
			common.OptionMapRWMutex.RLock()
			assert.Equal(t, "[]", common.OptionMap[setting.DesktopNoticesKey])
			common.OptionMapRWMutex.RUnlock()
		})
	}
}
