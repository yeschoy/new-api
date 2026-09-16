package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/gin-gonic/gin"
)

type cashbackRewardListItem struct {
	ID                      int64                          `json:"id"`
	TopUpID                 int                            `json:"top_up_id"`
	TradeNo                 string                         `json:"trade_no"`
	Direction               model.CashbackDirection        `json:"direction"`
	InviteeID               int                            `json:"invitee_id"`
	InviterID               int                            `json:"inviter_id"`
	BeneficiaryID           int                            `json:"beneficiary_id"`
	BaseQuota               int                            `json:"base_quota"`
	RateBPS                 int                            `json:"rate_bps"`
	CalculatedQuota         int                            `json:"calculated_quota"`
	RewardQuota             int                            `json:"reward_quota"`
	CapReason               string                         `json:"cap_reason"`
	SettlementDays          int                            `json:"settlement_days"`
	ConfigVersion           int64                          `json:"config_version"`
	PaidAt                  int64                          `json:"paid_at"`
	AvailableAt             int64                          `json:"available_at"`
	ReviewStatus            model.CashbackReviewStatus     `json:"review_status"`
	ReviewedBy              int                            `json:"reviewed_by"`
	ReviewedAt              int64                          `json:"reviewed_at"`
	ReviewReason            string                         `json:"review_reason"`
	SettlementStatus        model.CashbackSettlementStatus `json:"settlement_status"`
	IssuedAt                int64                          `json:"issued_at"`
	RiskLevel               model.CashbackRiskLevel        `json:"risk_level"`
	RiskFlags               []string                       `json:"risk_flags"`
	BlockingReason          string                         `json:"blocking_reason"`
	RecoveredQuota          int                            `json:"recovered_quota"`
	OutstandingDebtQuota    int                            `json:"outstanding_debt_quota"`
	DebtResolvedAt          int64                          `json:"debt_resolved_at"`
	DebtResolvedBy          int                            `json:"debt_resolved_by"`
	DebtResolutionReason    string                         `json:"debt_resolution_reason"`
	LastSettlementError     string                         `json:"last_settlement_error"`
	NextSettlementAttemptAt int64                          `json:"next_settlement_attempt_at"`
	CreatedAt               int64                          `json:"created_at"`
	UpdatedAt               int64                          `json:"updated_at"`
}

type cashbackOrderContextDTO struct {
	ID                            int64                          `json:"id"`
	TopUpID                       int                            `json:"top_up_id"`
	TradeNo                       string                         `json:"trade_no"`
	UserID                        int                            `json:"user_id"`
	PaymentProvider               string                         `json:"payment_provider"`
	BaseQuota                     int                            `json:"base_quota"`
	CreditedQuota                 int                            `json:"credited_quota"`
	RequestIP                     string                         `json:"request_ip"`
	RequestUserAgentHash          string                         `json:"request_user_agent_hash"`
	DeviceFingerprintHash         string                         `json:"device_fingerprint_hash"`
	DeviceHashShort               string                         `json:"device_hash_short"`
	DeviceSignalStatus            string                         `json:"device_signal_status"`
	EligibleAfterFirstEnable      bool                           `json:"eligible_after_first_enable"`
	CompletionSource              model.CashbackCompletionSource `json:"completion_source"`
	CompletionProvider            string                         `json:"completion_provider"`
	IncidentKind                  model.CashbackIncidentKind     `json:"incident_kind"`
	IncidentReason                string                         `json:"incident_reason"`
	IncidentEvidenceRef           string                         `json:"incident_evidence_ref"`
	IncidentReportedBy            int                            `json:"incident_reported_by"`
	IncidentReportedAt            int64                          `json:"incident_reported_at"`
	CumulativeRefundRateBPS       int                            `json:"cumulative_refund_rate_bps"`
	PrincipalReversalTargetQuota  int                            `json:"principal_reversal_target_quota"`
	PrincipalRecoveredQuota       int                            `json:"principal_recovered_quota"`
	PrincipalOutstandingDebtQuota int                            `json:"principal_outstanding_debt_quota"`
	PrincipalDebtResolvedAt       int64                          `json:"principal_debt_resolved_at"`
	PrincipalDebtResolvedBy       int                            `json:"principal_debt_resolved_by"`
	PrincipalDebtResolutionReason string                         `json:"principal_debt_resolution_reason"`
	CreatedAt                     int64                          `json:"created_at"`
	UpdatedAt                     int64                          `json:"updated_at"`
}

type cashbackRewardDetail struct {
	Reward              cashbackRewardListItem  `json:"reward"`
	Order               cashbackOrderContextDTO `json:"order"`
	RiskSnapshot        map[string]interface{}  `json:"risk_snapshot"`
	ConfigSnapshot      map[string]interface{}  `json:"config_snapshot"`
	InviteeUsername     string                  `json:"invitee_username"`
	InviterUsername     string                  `json:"inviter_username"`
	BeneficiaryUsername string                  `json:"beneficiary_username"`
}

type cashbackReviewRequest struct {
	Action string `json:"action"`
	Reason string `json:"reason"`
}

type cashbackIncidentRequest struct {
	Kind                    string `json:"kind"`
	CumulativeRefundRateBPS int    `json:"cumulative_refund_rate_bps"`
	Reason                  string `json:"reason"`
	EvidenceRef             string `json:"evidence_ref"`
}

type cashbackDebtResolutionRequest struct {
	Reason string `json:"reason"`
}

func ListCashbackRewards(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	userID, err := parseOptionalPositiveInt(c.Query("user_id"))
	if err != nil {
		cashbackAPIError(c, http.StatusBadRequest, err)
		return
	}
	filter := model.CashbackRewardFilter{
		TradeNo:          c.Query("trade_no"),
		UserID:           userID,
		Direction:        model.CashbackDirection(c.Query("direction")),
		ReviewStatus:     model.CashbackReviewStatus(c.Query("review_status")),
		SettlementStatus: model.CashbackSettlementStatus(c.Query("settlement_status")),
		RiskLevel:        model.CashbackRiskLevel(c.Query("risk_level")),
	}
	rewards, total, err := model.ListCashbackRewards(filter, pageInfo)
	if err != nil {
		cashbackAPIError(c, http.StatusBadRequest, err)
		return
	}
	items := make([]cashbackRewardListItem, 0, len(rewards))
	for i := range rewards {
		items = append(items, cashbackRewardToListItem(&rewards[i]))
	}
	pageInfo.Total = int(total)
	pageInfo.Items = items
	common.ApiSuccess(c, pageInfo)
}

func GetCashbackReward(c *gin.Context) {
	rewardID, err := parseCashbackPathID(c.Param("id"))
	if err != nil {
		cashbackAPIError(c, http.StatusBadRequest, err)
		return
	}
	detail, err := model.GetCashbackRewardWithContext(rewardID)
	if err != nil {
		cashbackAPIError(c, cashbackErrorStatus(err), err)
		return
	}

	riskSnapshot := map[string]interface{}{}
	if err := common.UnmarshalJsonStr(detail.Reward.RiskSnapshot, &riskSnapshot); err != nil {
		cashbackAPIError(c, http.StatusInternalServerError, err)
		return
	}
	configSnapshot := map[string]interface{}{}
	if err := common.UnmarshalJsonStr(detail.Reward.ConfigSnapshot, &configSnapshot); err != nil {
		cashbackAPIError(c, http.StatusInternalServerError, err)
		return
	}
	inviteeUsername, _ := model.GetUsernameById(detail.Reward.InviteeID, false)
	inviterUsername, _ := model.GetUsernameById(detail.Reward.InviterID, false)
	beneficiaryUsername, _ := model.GetUsernameById(detail.Reward.BeneficiaryID, false)

	recordManageAudit(c, "cashback.sensitive_view", map[string]interface{}{
		"reward_id": rewardID,
		"top_up_id": detail.Reward.TopUpID,
	})
	common.ApiSuccess(c, cashbackRewardDetail{
		Reward:              cashbackRewardToListItem(&detail.Reward),
		Order:               cashbackOrderContextToDTO(&detail.OrderContext),
		RiskSnapshot:        riskSnapshot,
		ConfigSnapshot:      configSnapshot,
		InviteeUsername:     inviteeUsername,
		InviterUsername:     inviterUsername,
		BeneficiaryUsername: beneficiaryUsername,
	})
}

func ReviewCashbackReward(c *gin.Context) {
	rewardID, err := parseCashbackPathID(c.Param("id"))
	if err != nil {
		cashbackAPIError(c, http.StatusBadRequest, err)
		return
	}
	var request cashbackReviewRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		cashbackAPIError(c, http.StatusBadRequest, err)
		return
	}
	action := model.CashbackReviewAction(strings.TrimSpace(request.Action))
	result, err := model.ReviewCashbackReward(rewardID, action, request.Reason, c.GetInt("id"), time.Now().Unix())
	if err != nil {
		cashbackAPIError(c, cashbackErrorStatus(err), err)
		return
	}
	auditAction := "cashback.review_approve"
	if action == model.CashbackReviewActionReject {
		auditAction = "cashback.review_reject"
	}
	recordManageAudit(c, auditAction, map[string]interface{}{
		"reward_id": rewardID,
		"reason":    strings.TrimSpace(request.Reason),
	})
	common.ApiSuccess(c, gin.H{
		"reward":      cashbackRewardToListItem(&result.Reward),
		"issued":      result.Issued,
		"issue_error": result.IssueError,
	})
}

func RecordCashbackIncident(c *gin.Context) {
	topUpID, err := parseCashbackIntPathID(c.Param("id"))
	if err != nil {
		cashbackAPIError(c, http.StatusBadRequest, err)
		return
	}
	var request cashbackIncidentRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		cashbackAPIError(c, http.StatusBadRequest, err)
		return
	}
	result, err := model.HandleCashbackIncident(topUpID, model.CashbackIncidentInput{
		Kind:                    model.CashbackIncidentKind(strings.TrimSpace(request.Kind)),
		CumulativeRefundRateBPS: request.CumulativeRefundRateBPS,
		Reason:                  request.Reason,
		EvidenceRef:             request.EvidenceRef,
		OperatorID:              c.GetInt("id"),
		Now:                     time.Now().Unix(),
	})
	if err != nil {
		cashbackAPIError(c, cashbackErrorStatus(err), err)
		return
	}
	recordManageAudit(c, "cashback.incident", map[string]interface{}{
		"top_up_id":                  topUpID,
		"kind":                       strings.TrimSpace(request.Kind),
		"cumulative_refund_rate_bps": result.OrderContext.CumulativeRefundRateBPS,
		"reward_recovered_quota":     result.RewardRecoveredQuota,
		"reward_debt_quota":          result.RewardDebtQuota,
		"principal_recovered_quota":  result.PrincipalRecoveredNow,
		"principal_debt_quota":       result.PrincipalDebtQuota,
		"reason":                     strings.TrimSpace(request.Reason),
		"evidence_ref":               strings.TrimSpace(request.EvidenceRef),
	})
	common.ApiSuccess(c, gin.H{
		"order":                   cashbackOrderContextToDTO(&result.OrderContext),
		"reward_recovered_quota":  result.RewardRecoveredQuota,
		"reward_debt_quota":       result.RewardDebtQuota,
		"principal_recovered_now": result.PrincipalRecoveredNow,
		"principal_debt_quota":    result.PrincipalDebtQuota,
		"idempotent":              result.Idempotent,
	})
}

func ResolveCashbackRewardDebt(c *gin.Context) {
	rewardID, err := parseCashbackPathID(c.Param("id"))
	if err != nil {
		cashbackAPIError(c, http.StatusBadRequest, err)
		return
	}
	var request cashbackDebtResolutionRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		cashbackAPIError(c, http.StatusBadRequest, err)
		return
	}
	reward, err := model.ResolveCashbackRewardDebt(rewardID, c.GetInt("id"), request.Reason, time.Now().Unix())
	if err != nil {
		cashbackAPIError(c, cashbackErrorStatus(err), err)
		return
	}
	recordManageAudit(c, "cashback.reward_debt_resolve", map[string]interface{}{
		"reward_id": rewardID,
		"reason":    strings.TrimSpace(request.Reason),
	})
	common.ApiSuccess(c, cashbackRewardToListItem(reward))
}

func ResolveCashbackPrincipalDebt(c *gin.Context) {
	topUpID, err := parseCashbackIntPathID(c.Param("id"))
	if err != nil {
		cashbackAPIError(c, http.StatusBadRequest, err)
		return
	}
	var request cashbackDebtResolutionRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		cashbackAPIError(c, http.StatusBadRequest, err)
		return
	}
	orderContext, err := model.ResolveCashbackPrincipalDebt(topUpID, c.GetInt("id"), request.Reason, time.Now().Unix())
	if err != nil {
		cashbackAPIError(c, cashbackErrorStatus(err), err)
		return
	}
	recordManageAudit(c, "cashback.principal_debt_resolve", map[string]interface{}{
		"top_up_id": topUpID,
		"reason":    strings.TrimSpace(request.Reason),
	})
	common.ApiSuccess(c, cashbackOrderContextToDTO(orderContext))
}

func GetCashbackSummary(c *gin.Context) {
	summary, err := model.GetCashbackAdminSummary()
	if err != nil {
		cashbackAPIError(c, http.StatusInternalServerError, err)
		return
	}
	common.ApiSuccess(c, summary)
}

func cashbackRewardToListItem(reward *model.CashbackReward) cashbackRewardListItem {
	flags := []string{}
	var riskSnapshot struct {
		Flags []string `json:"flags"`
	}
	if reward.RiskSnapshot != "" && common.UnmarshalJsonStr(reward.RiskSnapshot, &riskSnapshot) == nil {
		flags = riskSnapshot.Flags
	}
	return cashbackRewardListItem{
		ID: reward.ID, TopUpID: reward.TopUpID, TradeNo: reward.TradeNo, Direction: reward.Direction,
		InviteeID: reward.InviteeID, InviterID: reward.InviterID, BeneficiaryID: reward.BeneficiaryID,
		BaseQuota: reward.BaseQuota, RateBPS: reward.RateBPS, CalculatedQuota: reward.CalculatedQuota,
		RewardQuota: reward.RewardQuota, CapReason: reward.CapReason, SettlementDays: reward.SettlementDays,
		ConfigVersion: reward.ConfigVersion, PaidAt: reward.PaidAt, AvailableAt: reward.AvailableAt,
		ReviewStatus: reward.ReviewStatus, ReviewedBy: reward.ReviewedBy, ReviewedAt: reward.ReviewedAt,
		ReviewReason: reward.ReviewReason, SettlementStatus: reward.SettlementStatus, IssuedAt: reward.IssuedAt,
		RiskLevel: reward.RiskLevel, RiskFlags: flags, BlockingReason: reward.BlockingReason,
		RecoveredQuota: reward.RecoveredQuota, OutstandingDebtQuota: reward.OutstandingDebtQuota,
		DebtResolvedAt: reward.DebtResolvedAt, DebtResolvedBy: reward.DebtResolvedBy,
		DebtResolutionReason: reward.DebtResolutionReason,
		LastSettlementError:  reward.LastSettlementError, NextSettlementAttemptAt: reward.NextSettlementAttemptAt,
		CreatedAt: reward.CreatedAt, UpdatedAt: reward.UpdatedAt,
	}
}

func cashbackOrderContextToDTO(order *model.CashbackOrderContext) cashbackOrderContextDTO {
	return cashbackOrderContextDTO{
		ID: order.ID, TopUpID: order.TopUpID, TradeNo: order.TradeNo, UserID: order.UserID,
		PaymentProvider: order.PaymentProvider, BaseQuota: order.BaseQuota, CreditedQuota: order.CreditedQuota,
		RequestIP: order.RequestIP, RequestUserAgentHash: order.RequestUserAgentHash,
		DeviceFingerprintHash: order.DeviceFingerprintHash, DeviceHashShort: model.CashbackDeviceHashShort(order.DeviceFingerprintHash),
		DeviceSignalStatus: order.DeviceSignalStatus, EligibleAfterFirstEnable: order.EligibleAfterFirstEnable,
		CompletionSource: order.CompletionSource, CompletionProvider: order.CompletionProvider,
		IncidentKind: order.IncidentKind, IncidentReason: order.IncidentReason, IncidentEvidenceRef: order.IncidentEvidenceRef,
		IncidentReportedBy: order.IncidentReportedBy, IncidentReportedAt: order.IncidentReportedAt,
		CumulativeRefundRateBPS:       order.CumulativeRefundRateBPS,
		PrincipalReversalTargetQuota:  order.PrincipalReversalTargetQuota,
		PrincipalRecoveredQuota:       order.PrincipalRecoveredQuota,
		PrincipalOutstandingDebtQuota: order.PrincipalOutstandingDebtQuota,
		PrincipalDebtResolvedAt:       order.PrincipalDebtResolvedAt, PrincipalDebtResolvedBy: order.PrincipalDebtResolvedBy,
		PrincipalDebtResolutionReason: order.PrincipalDebtResolutionReason, CreatedAt: order.CreatedAt, UpdatedAt: order.UpdatedAt,
	}
}

func parseCashbackPathID(value string) (int64, error) {
	id, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
	if err != nil || id <= 0 {
		return 0, errors.New("invalid cashback reward id")
	}
	return id, nil
}

func parseCashbackIntPathID(value string) (int, error) {
	id, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || id <= 0 {
		return 0, errors.New("invalid top-up id")
	}
	return id, nil
}

func parseOptionalPositiveInt(value string) (int, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, nil
	}
	id, err := strconv.Atoi(value)
	if err != nil || id <= 0 {
		return 0, errors.New("invalid user id")
	}
	return id, nil
}

func cashbackErrorStatus(err error) int {
	switch {
	case errors.Is(err, model.ErrCashbackNotFound), errors.Is(err, model.ErrTopUpNotFound):
		return http.StatusNotFound
	case errors.Is(err, model.ErrCashbackInvalidState), errors.Is(err, model.ErrCashbackHardBlocked), errors.Is(err, model.ErrCashbackDebtNotFound), errors.Is(err, model.ErrTopUpStatusInvalid):
		return http.StatusConflict
	case errors.Is(err, model.ErrCashbackInvalidInput), errors.Is(err, model.ErrCashbackReviewReason), errors.Is(err, model.ErrCashbackRefundRate):
		return http.StatusBadRequest
	default:
		return http.StatusInternalServerError
	}
}

func cashbackAPIError(c *gin.Context, status int, err error) {
	code := "CASHBACK_ERROR"
	response := gin.H{
		"success": false,
		"message": err.Error(),
	}
	switch {
	case errors.Is(err, model.ErrCashbackHardBlocked):
		code = "CASHBACK_HARD_BLOCKED"
		if _, reason, found := strings.Cut(err.Error(), ": "); found {
			response["blocking_reason"] = reason
		}
	case errors.Is(err, model.ErrCashbackInvalidInput):
		code = "CASHBACK_INVALID_INPUT"
	case errors.Is(err, model.ErrCashbackReviewReason):
		code = "CASHBACK_REASON_REQUIRED"
	case errors.Is(err, model.ErrCashbackRefundRate):
		code = "CASHBACK_REFUND_RATE_INVALID"
	case errors.Is(err, model.ErrCashbackInvalidState):
		code = "CASHBACK_STATE_CONFLICT"
	case errors.Is(err, model.ErrCashbackNotFound):
		code = "CASHBACK_NOT_FOUND"
	}
	response["code"] = code
	c.JSON(status, response)
}
