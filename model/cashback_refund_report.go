package model

import (
	"errors"
	"fmt"
	"math"
	"math/big"
	"os"
	"time"

	"database/sql"

	"github.com/QuantumNous/new-api/common"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// Cash amounts are CNY cents: Epay requires an administrator's current-query
// confirmation; admin add uses its original declared CNY input. Neither is a payout.
type CashbackRecordedSpendReport struct {
	UserID                 int                             `json:"user_id"`
	StartAt                int64                           `json:"start_at"`
	EndAt                  int64                           `json:"end_at"`
	CalculatedAt           int64                           `json:"calculated_at"`
	Source                 string                          `json:"source"`
	LogStatus              string                          `json:"log_status"`
	RefundStatus           string                          `json:"refund_status"`
	ManualReason           string                          `json:"manual_reason,omitempty"`
	SettlementAssumed      bool                            `json:"settlement_assumed"`
	WalletQuota            *int64                          `json:"wallet_quota,omitempty"`
	NetSpentQuota          *int64                          `json:"net_spent_quota,omitempty"`
	TotalReferenceCNYCents *int64                          `json:"total_reference_cny_cents,omitempty"`
	TopUps                 []CashbackRecordedTopUp         `json:"top_ups"`
	Credits                []CashbackRefundCredit          `json:"credits"`
	Intervals              []CashbackRecordedSpendInterval `json:"intervals"`
}

type CashbackRecordedTopUp struct {
	ID                     int    `json:"id"`
	TradeNo                string `json:"trade_no"`
	CompleteTime           int64  `json:"complete_time"`
	PaymentProvider        string `json:"payment_provider"`
	PurchasedQuota         *int64 `json:"purchased_quota,omitempty"`
	RemainingPurchaseQuota *int64 `json:"remaining_purchase_quota,omitempty"`
	RemainingGiftQuota     *int64 `json:"remaining_gift_quota,omitempty"`
	// A sourced per-order manual reference may be present even when the
	// complete cash total is unavailable. Never sum partial references as a total.
	ReferenceCNYCents *int64 `json:"reference_cny_cents,omitempty"`
}

type CashbackRefundCredit struct {
	EventID               int64  `json:"event_id"`
	Kind                  string `json:"kind"`
	SourceType            string `json:"source_type"`
	SourceID              int64  `json:"source_id"`
	Quota                 int64  `json:"quota"`
	RemainingQuota        int64  `json:"remaining_quota"`
	TradeNo               string `json:"trade_no,omitempty"`
	PaymentProvider       string `json:"payment_provider,omitempty"`
	SignedAmountAvailable bool   `json:"signed_amount_available"` // Epay amount only; its signature does not attest currency.
	// Nil means no supported amount for this batch; a non-nil amount may
	// still be only one part of a manual_reconciliation report.
	ReferenceCNYCents *int64 `json:"reference_cny_cents,omitempty"`
}

type CashbackRecordedSpendInterval struct {
	// [StartAt, EndAt) buckets LOG_DB timestamps, not proven payment order.
	StartAt int64 `json:"start_at"`
	EndAt   int64 `json:"end_at"`
	// Optional logs include subscription-funded usage and can be lost. Never
	// use this observation as a wallet debit or a FIFO input.
	RecordedAllConsumeLogQuota int64 `json:"recorded_all_consume_log_quota"`
	RecordedConsumeCount       int64 `json:"recorded_consume_count"`
}

var ErrCashbackReportRange = errors.New("invalid cashback report range (maximum 90 days, at most 50 completed top-ups)")

// GetCashbackRecordedSpendReport assumes the administrator has stopped usage
// and confirmed the DB wallet balance is final. No request-lifecycle or past
// external cash payouts are certified by this read-only report. The 90-day
// window limits *display* only; FIFO always scans from the first opening.
// All main-DB facts share one repeatable-read snapshot. LOG_DB is independent
// and queried only after that transaction closes (also safe with one SQLite connection).
func GetCashbackRecordedSpendReport(userID int, startAt, endAt int64, confirmedCNYTopUpIDs ...int) (CashbackRecordedSpendReport, error) {
	var report CashbackRecordedSpendReport
	err := DB.Transaction(func(tx *gorm.DB) error {
		var err error
		report, err = cashbackRecordedSpendSnapshot(tx, userID, startAt, endAt, confirmedCNYTopUpIDs...)
		return err
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	if err != nil {
		return report, err
	}
	if LOG_DB == nil {
		report.LogStatus = "unavailable"
		return report, nil
	}
	boundary := startAt
	for i := 0; i <= len(report.TopUps); i++ {
		next := endAt
		if i < len(report.TopUps) {
			next = report.TopUps[i].CompleteTime
		}
		var totals struct {
			RecordedAllConsumeLogQuota int64
			RecordedConsumeCount       int64
		}
		err := LOG_DB.Model(&Log{}).
			Select("COALESCE(SUM(quota), 0) AS recorded_all_consume_log_quota, COUNT(*) AS recorded_consume_count").
			Where("user_id = ? AND type = ? AND created_at >= ? AND created_at < ?", userID, LogTypeConsume, boundary, next).
			Scan(&totals).Error
		if err != nil || totals.RecordedAllConsumeLogQuota > common.MaxWalletQuota || totals.RecordedAllConsumeLogQuota < -common.MaxWalletQuota || totals.RecordedConsumeCount > common.MaxWalletQuota {
			report.LogStatus = "unavailable"
			report.Intervals = nil
			break
		}
		report.Intervals = append(report.Intervals, CashbackRecordedSpendInterval{StartAt: boundary, EndAt: next, RecordedAllConsumeLogQuota: totals.RecordedAllConsumeLogQuota, RecordedConsumeCount: totals.RecordedConsumeCount})
		boundary = next
	}
	return report, nil
}

func cashbackRecordedSpendSnapshot(tx *gorm.DB, userID int, startAt, endAt int64, confirmedCNYTopUpIDs ...int) (CashbackRecordedSpendReport, error) {
	if userID <= 0 || startAt < 0 || endAt <= startAt || endAt-startAt > 90*24*60*60 || endAt > time.Now().Unix()+1 || len(confirmedCNYTopUpIDs) > 50 {
		return CashbackRecordedSpendReport{}, ErrCashbackReportRange
	}
	confirmed := make(map[int]bool, len(confirmedCNYTopUpIDs))
	for _, id := range confirmedCNYTopUpIDs {
		if id <= 0 || confirmed[id] {
			return CashbackRecordedSpendReport{}, ErrCashbackReportRange
		}
		confirmed[id] = true
	}
	var user User
	if err := tx.Select("id", "quota").Where("id = ?", userID).First(&user).Error; err != nil {
		return CashbackRecordedSpendReport{}, err
	}
	var topUps []TopUp
	if err := tx.Select("id", "trade_no", "complete_time", "payment_provider").
		Where("user_id = ? AND status = ? AND amount > 0 AND complete_time >= ? AND complete_time < ?", userID, common.TopUpStatusSuccess, startAt, endAt).
		Order("complete_time asc").Order("id asc").Limit(51).Find(&topUps).Error; err != nil {
		return CashbackRecordedSpendReport{}, err
	}
	if len(topUps) > 50 {
		return CashbackRecordedSpendReport{}, ErrCashbackReportRange
	}
	report := CashbackRecordedSpendReport{
		UserID: userID, StartAt: startAt, EndAt: endAt, CalculatedAt: time.Now().Unix(),
		Source: "optional_log_db_consume", LogStatus: "available", RefundStatus: "manual_reconciliation",
		ManualReason: "wallet_evidence_incomplete", SettlementAssumed: true,
		TopUps: make([]CashbackRecordedTopUp, 0, len(topUps)), Credits: []CashbackRefundCredit{},
		Intervals: make([]CashbackRecordedSpendInterval, 0, len(topUps)+1),
	}
	for _, topUp := range topUps {
		report.TopUps = append(report.TopUps, CashbackRecordedTopUp{ID: topUp.Id, TradeNo: topUp.TradeNo, CompleteTime: topUp.CompleteTime, PaymentProvider: topUp.PaymentProvider})
	}
	for id := range confirmed {
		var topUp TopUp
		if err := tx.Select("id", "user_id", "trade_no", "complete_time", "status", "amount", "payment_provider").Where("id = ?", id).First(&topUp).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return report, err
		}
		if topUp.Id == 0 || topUp.UserId != userID || topUp.Status != common.TopUpStatusSuccess || topUp.Amount <= 0 || topUp.PaymentProvider != PaymentProviderEpay {
			return CashbackRecordedSpendReport{}, ErrCashbackReportRange
		}
		// A manual completion or historical order without signed payment cannot
		// be confirmed as an Epay CNY receipt, regardless of display window.
		var context CashbackOrderContext
		var proof EpayPaymentEvidence
		if err := tx.Where("top_up_id = ?", id).First(&context).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return report, err
		}
		if err := tx.Where("top_up_id = ?", id).First(&proof).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
			return report, err
		}
		if context.ID == 0 || context.UserID != userID || context.CompletionSource != CashbackCompletionProviderCallback && context.CompletionSource != CashbackCompletionVerifiedReturn ||
			proof.TopUpID != id || proof.TradeNo != topUp.TradeNo || proof.PaidCents <= 0 || proof.GatewayTradeNo == "" || proof.MerchantID == "" || proof.Source != context.CompletionSource || proof.VerifiedAt != topUp.CompleteTime {
			return CashbackRecordedSpendReport{}, ErrCashbackReportRange
		}
	}

	// Deployment gate: the table and timestamp reverse checks cannot prove that
	// every writer was upgraded or that an unrecorded credit never occurred.
	// Enable only after all instances and wallet sources are reconciled. Keeping
	// this off still serves the observed intervals and manual-review status.
	if os.Getenv("CASHBACK_REFUND_REFERENCE_ENABLED") != "true" {
		return report, nil
	}

	// Read the entire sequence, not merely the displayed recharge interval.
	// Excessive history cannot be safely truncated to a falsely precise suffix.
	const maxCredits = 1000
	var events []WalletRefundCreditEvent
	if err := tx.Where("user_id = ?", userID).Order("id asc").Limit(maxCredits + 1).Find(&events).Error; err != nil {
		return report, err
	}
	if len(events) > maxCredits {
		report.ManualReason = "credit_history_limit"
		return report, nil
	}
	if len(events) == 0 || events[0].Kind != walletRefundOpening || events[0].SourceID != 0 ||
		(events[0].SourceType != "registration" && (events[0].SourceType != "wallet" || events[0].Quota != 0)) {
		// Historical mixed balance is not automatically a refundable batch.
		report.ManualReason = "missing_or_legacy_opening"
		return report, nil
	}
	if user.Quota < 0 || int64(user.Quota) > common.MaxWalletQuota {
		report.ManualReason = "invalid_wallet_balance"
		return report, nil
	}

	// Validate every event against its original source (not LOG_DB). Failure
	// invalidates the whole numeric projection, including earlier rows.
	var grants int64
	var cashByEvent = make(map[int64]*int64, len(events))
	purchaseByEvent := make(map[int64]CashbackRefundCredit, len(events))
	giftParentByEvent := make(map[int64]int)
	seen := make(map[string]bool, len(events))
	seenSource := make(map[string]bool, len(events))
	for i, event := range events {
		if event.ID <= 0 || event.ID > common.MaxWalletQuota || event.SourceID > common.MaxWalletQuota || event.UserID != int64(userID) || event.Quota < 0 || event.Quota > common.MaxWalletQuota || (i > 0 && (event.ID <= events[i-1].ID || event.Kind == walletRefundOpening)) || seen[event.EventKey] {
			report.ManualReason = "invalid_credit_event"
			return report, nil
		}
		seen[event.EventKey] = true
		if event.Kind == walletRefundException {
			report.ManualReason = "exceptional_wallet_change"
			return report, nil
		}
		if i == 0 {
			continue
		}
		if event.Quota <= 0 || event.SourceID < 0 || grants > math.MaxInt64-event.Quota {
			report.ManualReason = "invalid_credit_event"
			return report, nil
		}
		grants += event.Quota
		if event.SourceType != "affiliate_transfer" {
			sourceType := event.SourceType
			if sourceType == "manual_topup" {
				sourceType = "topup" // Same source cannot be entered twice under different classifications.
			}
			key := sourceType + ":" + fmt.Sprint(event.SourceID)
			if seenSource[key] {
				report.ManualReason = "duplicate_credit_source"
				return report, nil
			}
			seenSource[key] = true
		}
		switch {
		case event.Kind == walletRefundPurchase && (event.SourceType == "topup" || event.SourceType == "manual_topup") && event.SourceID > 0:
			var topUp TopUp
			var context CashbackOrderContext
			if err := tx.First(&topUp, event.SourceID).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return report, err
			}
			if err := tx.Where("top_up_id = ?", event.SourceID).First(&context).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return report, err
			}
			if topUp.Id == 0 || topUp.UserId != userID || topUp.Status != common.TopUpStatusSuccess || topUp.Amount <= 0 || topUp.TradeNo == "" {
				report.ManualReason = "missing_purchase_source"
				return report, nil
			}
			if event.SourceType == "topup" && (context.ID == 0 || context.CompletionSource != CashbackCompletionProviderCallback && context.CompletionSource != CashbackCompletionVerifiedReturn) ||
				context.ID != 0 && (context.UserID != userID || context.TopUpID != topUp.Id || context.TradeNo != topUp.TradeNo || int64(context.CreditedQuota) != event.Quota || context.CompletionProvider != topUp.PaymentProvider ||
					(event.SourceType == "manual_topup" && context.CompletionSource != CashbackCompletionAdminManual)) {
				report.ManualReason = "missing_purchase_source"
				return report, nil
			}
			if context.IncidentKind != "" || context.PrincipalOutstandingDebtQuota > 0 || context.PrincipalRecoveredQuota > 0 {
				report.ManualReason = "source_recovery_or_debt"
				return report, nil
			}
			purchaseByEvent[event.ID] = CashbackRefundCredit{TradeNo: topUp.TradeNo, PaymentProvider: topUp.PaymentProvider}
			if event.SourceType == "manual_topup" {
				// Legacy manual completions may lack a cashback context. Verify the
				// credited quota against the same order formula used at completion;
				// neither it nor TopUp.Money is a signed cash receipt.
				basis := decimal.NewFromInt(topUp.Amount)
				if topUp.PaymentProvider == PaymentProviderStripe {
					basis = decimal.NewFromFloat(topUp.Money)
				}
				credited, err := common.WalletQuotaFromDecimalStrict(basis.Mul(decimal.NewFromFloat(common.QuotaPerUnit)))
				if err != nil || int64(credited) != event.Quota {
					report.ManualReason = "missing_purchase_source"
					return report, nil
				}
				break
			}
			if topUp.PaymentProvider == PaymentProviderEpay {
				var proof EpayPaymentEvidence
				if err := tx.Where("top_up_id = ?", topUp.Id).First(&proof).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
					return report, err
				}
				if proof.TopUpID == 0 || proof.TradeNo != topUp.TradeNo || proof.PaidCents <= 0 || proof.GatewayTradeNo == "" || proof.MerchantID == "" || proof.Source != context.CompletionSource || proof.VerifiedAt != topUp.CompleteTime {
					report.ManualReason = "missing_signed_payment"
					return report, nil
				}
				purchaseByEvent[event.ID] = CashbackRefundCredit{TradeNo: topUp.TradeNo, PaymentProvider: topUp.PaymentProvider, SignedAmountAvailable: true}
				if confirmed[topUp.Id] {
					cashByEvent[event.ID] = &proof.PaidCents
				}
			}
		case event.Kind == walletRefundPurchase && event.SourceType == "admin_add" && event.SourceID > 0:
			var proof AdminQuotaCreditEvidence
			if err := tx.First(&proof, event.SourceID).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return report, err
			}
			if proof.ID == 0 || proof.UserID != int64(userID) || proof.CreditedQuota != event.Quota || proof.OperatorID <= 0 || proof.CreditedAt <= 0 || (proof.CNYCents != nil && (*proof.CNYCents <= 0 || *proof.CNYCents > common.MaxWalletQuota)) {
				report.ManualReason = "missing_admin_credit"
				return report, nil
			}
			cashByEvent[event.ID] = proof.CNYCents
		case event.Kind == walletRefundGift && event.SourceType == "cashback_reward" && event.SourceID > 0:
			var reward CashbackReward
			if err := tx.First(&reward, event.SourceID).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return report, err
			}
			if reward.ID == 0 || reward.BeneficiaryID != userID || int64(reward.RewardQuota) != event.Quota || reward.IssuedAt <= 0 || (reward.SettlementStatus != CashbackSettlementIssued && reward.SettlementStatus != CashbackSettlementReclaimed && reward.SettlementStatus != CashbackSettlementDebt) || reward.RecoveredQuota > 0 || reward.OutstandingDebtQuota > 0 {
				report.ManualReason = "missing_gift_source"
				return report, nil
			}
			var parent TopUp
			if err := tx.First(&parent, reward.TopUpID).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return report, err
			}
			if parent.Id == 0 || parent.Status != common.TopUpStatusSuccess || parent.TradeNo != reward.TradeNo || parent.UserId != reward.InviteeID {
				report.ManualReason = "missing_gift_source"
				return report, nil
			}
			giftParentByEvent[event.ID] = parent.Id
		case event.Kind == walletRefundNonrefundable && event.SourceType == "redemption" && event.SourceID > 0:
			var source Redemption
			if err := tx.Unscoped().First(&source, event.SourceID).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return report, err
			}
			if source.Id == 0 || source.PlanId != 0 || source.UsedUserId != userID || source.Status != common.RedemptionCodeStatusUsed || int64(source.Quota) != event.Quota {
				report.ManualReason = "missing_nonrefundable_source"
				return report, nil
			}
		case event.Kind == walletRefundNonrefundable && event.SourceType == "checkin" && event.SourceID > 0:
			var source Checkin
			if err := tx.First(&source, event.SourceID).Error; err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return report, err
			}
			if source.Id == 0 || source.UserId != userID || int64(source.QuotaAwarded) != event.Quota {
				report.ManualReason = "missing_nonrefundable_source"
				return report, nil
			}
		case event.Kind == walletRefundNonrefundable && event.SourceType == "affiliate_transfer":
			// No durable affiliate transfer source existed before this event.
			// Its atomic wallet/event transaction is itself the only evidence.
			if event.SourceID != 0 {
				report.ManualReason = "invalid_credit_event"
				return report, nil
			}
		default:
			report.ManualReason = "unknown_credit_source"
			return report, nil
		}
	}
	if grants > math.MaxInt64-events[0].Quota {
		report.ManualReason = "credit_overflow"
		return report, nil
	}
	grants += events[0].Quota
	if int64(user.Quota) > grants {
		report.ManualReason = "balance_exceeds_credits"
		return report, nil
	}

	// Reverse checks are conservative anomaly detectors, not completeness proof.
	// Source timestamps are seconds from different clocks; a >= opening-time
	// filter misses credits from skewed instances. Scan all source history and
	// reject unmatched legacy rows rather than guessing a safe time boundary.
	// Deployment reconciliation, not these checks, is the prerequisite for
	// enabling numeric references.
	var sources []TopUp
	if err := tx.Select("id").Where("user_id = ? AND status = ? AND amount > 0", userID, common.TopUpStatusSuccess).Limit(maxCredits + 1).Find(&sources).Error; err != nil {
		return report, err
	}
	if len(sources) > maxCredits {
		report.ManualReason = "credit_history_limit"
		return report, nil
	}
	for _, source := range sources {
		found := false
		for _, event := range events {
			if event.Kind == walletRefundPurchase && (event.SourceType == "topup" || event.SourceType == "manual_topup") && event.SourceID == int64(source.Id) {
				found = true
				break
			}
		}
		if !found {
			report.ManualReason = "missing_purchase_event"
			return report, nil
		}
	}
	var rewards []CashbackReward
	if err := tx.Select("id").Where("beneficiary_id = ? AND issued_at > 0", userID).Limit(maxCredits + 1).Find(&rewards).Error; err != nil {
		return report, err
	}
	if len(rewards) > maxCredits {
		report.ManualReason = "credit_history_limit"
		return report, nil
	}
	for _, source := range rewards {
		found := false
		for _, event := range events {
			if event.Kind == walletRefundGift && event.SourceID == source.ID {
				found = true
				break
			}
		}
		if !found {
			report.ManualReason = "missing_gift_event"
			return report, nil
		}
	}
	var adminCredits []AdminQuotaCreditEvidence
	if err := tx.Select("id").Where("user_id = ?", userID).Limit(maxCredits + 1).Find(&adminCredits).Error; err != nil {
		return report, err
	}
	if len(adminCredits) > maxCredits {
		report.ManualReason = "credit_history_limit"
		return report, nil
	}
	for _, source := range adminCredits {
		found := false
		for _, event := range events {
			if event.Kind == walletRefundPurchase && event.SourceType == "admin_add" && event.SourceID == source.ID {
				found = true
				break
			}
		}
		if !found {
			report.ManualReason = "missing_admin_event"
			return report, nil
		}
	}
	// Historical or newly unrecorded source changes cannot be made into
	// ordinary spending simply because the final wallet arithmetic balances.
	var codes []Redemption
	if err := tx.Unscoped().Select("id").Where("used_user_id = ? AND plan_id = 0 AND status = ?", userID, common.RedemptionCodeStatusUsed).Limit(maxCredits + 1).Find(&codes).Error; err != nil {
		return report, err
	}
	if len(codes) > maxCredits {
		report.ManualReason = "credit_history_limit"
		return report, nil
	}
	for _, code := range codes {
		found := false
		for _, event := range events {
			if event.Kind == walletRefundNonrefundable && event.SourceType == "redemption" && event.SourceID == int64(code.Id) {
				found = true
				break
			}
		}
		if !found {
			report.ManualReason = "missing_nonrefundable_event"
			return report, nil
		}
	}
	var checkins []Checkin
	if err := tx.Select("id").Where("user_id = ? AND quota_awarded > 0", userID).Limit(maxCredits + 1).Find(&checkins).Error; err != nil {
		return report, err
	}
	if len(checkins) > maxCredits {
		report.ManualReason = "credit_history_limit"
		return report, nil
	}
	for _, checkin := range checkins {
		found := false
		for _, event := range events {
			if event.Kind == walletRefundNonrefundable && event.SourceType == "checkin" && event.SourceID == int64(checkin.Id) {
				found = true
				break
			}
		}
		if !found {
			report.ManualReason = "missing_nonrefundable_event"
			return report, nil
		}
	}
	var specialChanges int64
	if err := tx.Model(&CashbackOrderContext{}).Where("user_id = ? AND (incident_kind <> ? OR principal_outstanding_debt_quota > 0 OR principal_recovered_quota > 0)", userID, "").Count(&specialChanges).Error; err != nil {
		return report, err
	}
	if specialChanges > 0 {
		report.ManualReason = "source_recovery_or_debt"
		return report, nil
	}
	if err := tx.Model(&CashbackReward{}).Where("beneficiary_id = ? AND (recovered_quota > 0 OR outstanding_debt_quota > 0)", userID).Count(&specialChanges).Error; err != nil {
		return report, err
	}
	if specialChanges > 0 {
		report.ManualReason = "source_recovery_or_debt"
		return report, nil
	}
	for _, topUp := range topUps {
		found := false
		for _, event := range events {
			if event.Kind == walletRefundPurchase && (event.SourceType == "topup" || event.SourceType == "manual_topup") && event.SourceID == int64(topUp.Id) {
				found = true
				break
			}
		}
		if !found {
			report.ManualReason = "missing_purchase_event"
			return report, nil
		}
	}

	spent := grants - int64(user.Quota)
	if spent > common.MaxWalletQuota {
		report.ManualReason = "javascript_precision_limit"
		return report, nil
	}
	wallet := int64(user.Quota)
	report.WalletQuota, report.NetSpentQuota = &wallet, &spent
	report.RefundStatus, report.ManualReason = "reference", ""
	total := int64(0)
	for _, event := range events {
		remaining := event.Quota - min(event.Quota, spent)
		spent -= event.Quota - remaining
		credit := CashbackRefundCredit{EventID: event.ID, Kind: event.Kind, SourceType: event.SourceType, SourceID: event.SourceID, Quota: event.Quota, RemainingQuota: remaining}
		if source, ok := purchaseByEvent[event.ID]; ok {
			credit.TradeNo, credit.PaymentProvider, credit.SignedAmountAvailable = source.TradeNo, source.PaymentProvider, source.SignedAmountAvailable
		}
		if event.Kind == walletRefundPurchase && remaining > 0 {
			paid := cashByEvent[event.ID]
			if paid == nil {
				if report.RefundStatus == "reference" {
					report.RefundStatus, report.ManualReason = "manual_reconciliation", "cash_amount_or_currency_unconfirmed"
				}
			} else {
				// big.Int prevents int64 multiplication overflow before floor.
				amount := new(big.Int).Mul(big.NewInt(*paid), big.NewInt(remaining))
				amount.Quo(amount, big.NewInt(event.Quota))
				// JSON numbers and Intl currency formatting must preserve every cent.
				const maxDisplayCNYCents = int64(1_000_000_000_000_000)
				if !amount.IsInt64() || amount.Int64() < 0 || amount.Int64() > *paid || amount.Int64() > maxDisplayCNYCents || total > maxDisplayCNYCents-amount.Int64() {
					report.RefundStatus, report.ManualReason = "manual_reconciliation", "cash_amount_overflow"
				} else {
					cents := amount.Int64()
					credit.ReferenceCNYCents = &cents
					total += cents
				}
			}
		}
		report.Credits = append(report.Credits, credit)
		for i := range report.TopUps {
			if (event.SourceType == "topup" || event.SourceType == "manual_topup") && event.SourceID == int64(report.TopUps[i].ID) && event.Kind == walletRefundPurchase {
				report.TopUps[i].PurchasedQuota, report.TopUps[i].RemainingPurchaseQuota, report.TopUps[i].ReferenceCNYCents = &credit.Quota, &credit.RemainingQuota, credit.ReferenceCNYCents
			}
			if event.Kind == walletRefundGift && giftParentByEvent[event.ID] == report.TopUps[i].ID {
				// A gift belongs to its actual beneficiary at issuance time.
				if report.TopUps[i].RemainingGiftQuota == nil {
					zero := int64(0)
					report.TopUps[i].RemainingGiftQuota = &zero
				}
				*report.TopUps[i].RemainingGiftQuota += remaining
			}
		}
	}
	if report.RefundStatus == "reference" {
		report.TotalReferenceCNYCents = &total
	} else if report.ManualReason == "cash_amount_overflow" {
		// Invalid currency arithmetic is not a supported partial reference.
		for i := range report.TopUps {
			report.TopUps[i].ReferenceCNYCents = nil
		}
		for i := range report.Credits {
			report.Credits[i].ReferenceCNYCents = nil
		}
	}
	return report, nil
}
