package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
)

func cashbackBaseQuotaFromTopUpAmount(amount int64) (int, error) {
	return getTopUpQuota(amount)
}

func cashbackBaseQuotaFromWalletQuota(quota int64) (int, error) {
	return validateCreditedQuota(decimal.NewFromInt(quota))
}

func insertOnlineTopUpWithCashbackContext(c *gin.Context, topUp *model.TopUp, baseQuota int) error {
	return model.InsertOnlineTopUp(topUp, baseQuota, model.CashbackRequestMetadata{
		RequestIP:    c.ClientIP(),
		UserAgent:    c.Request.UserAgent(),
		DeviceSignal: c.GetHeader(model.CashbackDeviceSignalHeader),
	})
}

func captureCashbackDeviceLink(c *gin.Context, userID int, source model.CashbackDeviceSource) {
	if err := model.RecordCashbackDeviceLink(
		userID,
		c.GetHeader(model.CashbackDeviceSignalHeader),
		c.ClientIP(),
		c.Request.UserAgent(),
		source,
	); err != nil {
		common.SysError("failed to capture cashback device signal: " + err.Error())
	}
}
