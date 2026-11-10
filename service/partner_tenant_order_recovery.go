package service

import (
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
)

var partnerTenantOrderRecoveryOnce sync.Once

// Delivery is DB-idempotent and safe on every replica. No gateway queries or
// browser activity are needed to resume durable paid-but-undelivered work.
func StartPartnerTenantOrderRecovery() {
	partnerTenantOrderRecoveryOnce.Do(func() {
		go func() {
			ticker := time.NewTicker(30 * time.Second)
			defer ticker.Stop()
			for {
				if err := model.RecoverPartnerTenantSubscriptionOrders(100); err != nil {
					// Do not log underlying DB errors that could contain purchase data.
					common.SysError("partner tenant paid-order recovery scan failed")
				}
				<-ticker.C
			}
		}()
	})
}
