package model

// EpayPaymentEvidence records the amount and merchant/provider identifiers from
// the first verified successful Epay callback. Epay signatures do not attest a
// currency; this row alone must never be used as a CNY refund authorization.
// Historical successful orders without a row are not backfilled.
type EpayPaymentEvidence struct {
	TopUpID        int                      `gorm:"primaryKey;autoIncrement:false"`
	TradeNo        string                   `gorm:"type:varchar(255);not null"` // Merchant order number (out_trade_no).
	GatewayTradeNo string                   `gorm:"type:varchar(255);not null"` // Epay order number (trade_no).
	MerchantID     string                   `gorm:"type:varchar(255);not null"` // Signed pid, never the signing key.
	PaidCents      int64                    `gorm:"type:bigint;not null"`       // Signed money, in hundredths of the unspecified payment unit.
	Source         CashbackCompletionSource `gorm:"type:varchar(32);not null"`
	VerifiedAt     int64                    `gorm:"type:bigint;not null"`
}

// EpayVerifiedDetails is supplied only by a controller after successful
// signature and trade-status verification using the same client configuration.
type EpayVerifiedDetails struct {
	GatewayTradeNo string
	MerchantID     string
}
