package model

import (
	"bytes"
	"context"
	"errors"
	"log"
	"net/http"
	"net/http/httptest"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

// Writer routing fixtures: one task-owned PostgreSQL schema serving as main DB
// and LOG_DB (logs + dedicated table migrated), the shared owner fixture, the
// log database type pinned to PostgreSQL and a private dashboard cache. Every
// process-global switch is restored on cleanup.
func setupPartnerTenantUsageWriterPQ(t *testing.T, prefix string) (*gorm.DB, partnerTenantUsageFixture) {
	t.Helper()
	require.True(t, strings.HasPrefix(prefix, "pt_usage_writer_"), "writer fixtures own the pt_usage_writer_ schema prefix")
	db := setupPartnerTenantUsageUnionPQ(t, prefix)
	fixture := seedPartnerTenantUsageFixture(t, db)
	oldConsume, oldExport, oldErrorWriter, oldWriter := common.LogConsumeEnabled, common.DataExportEnabled, gin.DefaultErrorWriter, gin.DefaultWriter
	common.LogConsumeEnabled = true
	common.DataExportEnabled = true
	CacheQuotaDataLock.Lock()
	oldCache := CacheQuotaData
	CacheQuotaData = make(map[string]*QuotaData)
	CacheQuotaDataLock.Unlock()
	t.Cleanup(func() {
		common.LogConsumeEnabled, common.DataExportEnabled = oldConsume, oldExport
		common.LogWriterMu.Lock()
		gin.DefaultErrorWriter, gin.DefaultWriter = oldErrorWriter, oldWriter
		common.LogWriterMu.Unlock()
		CacheQuotaDataLock.Lock()
		CacheQuotaData = oldCache
		CacheQuotaDataLock.Unlock()
	})
	return db, fixture
}

// Captures both application log writers (logger.LogInfo -> DefaultWriter,
// warnings/errors and SysError -> DefaultErrorWriter).
func capturePartnerTenantUsageWriterOutput(t *testing.T) *bytes.Buffer {
	t.Helper()
	var output bytes.Buffer
	common.LogWriterMu.Lock()
	gin.DefaultWriter, gin.DefaultErrorWriter = &output, &output
	common.LogWriterMu.Unlock()
	return &output
}

func partnerTenantUsageWriterContext(userID int, requestID string) *gin.Context {
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	c.Set("id", userID)
	c.Set("username", "writer-user-"+strconv.Itoa(userID))
	c.Set(common.RequestIdKey, requestID)
	c.Set(common.UpstreamRequestIdKey, "up-"+requestID)
	return c
}

// The dashboard feed is an in-memory cache (CacheQuotaData); it is flushed to
// quota_data only by the UpdateQuotaData loop, which tests never start.
func partnerTenantUsageWriterQuotaFeed(userID int) (count int, quota int) {
	CacheQuotaDataLock.Lock()
	defer CacheQuotaDataLock.Unlock()
	for _, data := range CacheQuotaData {
		if data.UserID == userID {
			count += data.Count
			quota += data.Quota
		}
	}
	return count, quota
}

func partnerTenantUsageWriterRows(t *testing.T, db *gorm.DB, userID int) ([]Log, []PartnerTenantUsageLog) {
	t.Helper()
	var legacy []Log
	require.NoError(t, db.Where("user_id = ?", userID).Order("id").Find(&legacy).Error)
	var dedicated []PartnerTenantUsageLog
	require.NoError(t, db.Where("user_id = ?", userID).Order("id").Find(&dedicated).Error)
	return legacy, dedicated
}

func partnerTenantUsageWriterTotals(t *testing.T, db *gorm.DB) (int64, int64) {
	t.Helper()
	var legacy, dedicated int64
	require.NoError(t, db.Model(&Log{}).Count(&legacy).Error)
	require.NoError(t, db.Model(&PartnerTenantUsageLog{}).Count(&dedicated).Error)
	return legacy, dedicated
}

func partnerTenantUsageWriterConsume(model string, quota int, other *LogOther) RecordConsumeLogParams {
	return RecordConsumeLogParams{
		ChannelId: 7, PromptTokens: 10, CompletionTokens: 20, ModelName: model, TokenName: "writer-key",
		Quota: quota, TokenId: 41, UseTimeSeconds: 3, IsStream: true, Group: "writer-group", Other: other,
	}
}

// Registers a failure on the given chain for statements against table only and
// returns how often it fired.
func failPartnerTenantUsageWriterStatements(t *testing.T, register func(name string, fn func(*gorm.DB)) error, remove func(name string), table string, cause error) *int {
	t.Helper()
	fired := new(int)
	name := "pt_usage_writer_fail_" + strconv.FormatInt(time.Now().UnixNano(), 10)
	require.NoError(t, register(name, func(tx *gorm.DB) {
		// Table("x AS a") leaves only the alias in Statement.Table; the full
		// expression is in TableExpr.
		target := tx.Statement.Table
		if tx.Statement.TableExpr != nil {
			target += " " + tx.Statement.TableExpr.SQL
		}
		if strings.Contains(target, table) {
			*fired++
			_ = tx.AddError(cause)
		}
	}))
	t.Cleanup(func() { remove(name) })
	return fired
}

// Pure: only a settled positive int/int64 fact becomes subscription_id.
func TestPartnerTenantUsageWriterSubscriptionFact(t *testing.T) {
	require.Zero(t, partnerTenantUsageSubscriptionId(nil))
	cases := []struct {
		value any
		want  int64
	}{
		{555, 555}, {int64(9007199254740993), 9007199254740993}, {0, 0}, {-3, 0}, {int64(-1), 0},
		{"12", 0}, {float64(12), 0}, {nil, 0},
	}
	for _, tc := range cases {
		other := NewLogOther()
		other.SetPublic("subscription_id", tc.value)
		require.Equal(t, tc.want, partnerTenantUsageSubscriptionId(other), "%#v", tc.value)
	}
	require.Zero(t, partnerTenantUsageSubscriptionId(NewLogOther()), "absent fact")
}

func TestPartnerTenantUsageWriterConsumeRoutesByOwner(t *testing.T) {
	db, fixture := setupPartnerTenantUsageWriterPQ(t, "pt_usage_writer_consume_")
	member := fixture.externalMember
	other := NewLogOther()
	other.SetPublic("subscription_id", 555)
	RecordConsumeLog(partnerTenantUsageWriterContext(member, "req-writer-member"), member, partnerTenantUsageWriterConsume("writer-model", 1234, other))

	legacy, dedicated := partnerTenantUsageWriterRows(t, db, member)
	require.Empty(t, legacy, "a member event never reaches logs")
	require.Len(t, dedicated, 1, "exactly one dedicated row")
	row := dedicated[0]
	account := fixture.accounts[member]
	require.Equal(t, fixture.enabledTenant.Id, row.TenantId)
	require.Equal(t, int64(account.Id), row.AccountId)
	require.Equal(t, "Usage Enabled", row.TenantName)
	require.Equal(t, PartnerTenantIdentityExternal, row.IdentitySource)
	require.Equal(t, int64(member), row.UserId)
	require.Equal(t, "writer-user-"+strconv.Itoa(member), row.Username)
	require.Equal(t, LogTypeConsume, row.Type)
	require.Equal(t, int64(1234), row.Quota)
	require.Equal(t, int64(10), row.PromptTokens)
	require.Equal(t, int64(20), row.CompletionTokens)
	require.Equal(t, int64(3), row.UseTime)
	require.True(t, row.IsStream)
	require.Equal(t, int64(7), row.ChannelId)
	require.Equal(t, int64(41), row.TokenId)
	require.Equal(t, "writer-key", row.TokenName)
	require.Equal(t, "writer-model", row.ModelName)
	require.Equal(t, "writer-group", row.Group)
	require.Equal(t, "req-writer-member", row.RequestId, "request id from the request context")
	require.Equal(t, "up-req-writer-member", row.UpstreamRequestId)
	require.Equal(t, int64(555), row.SubscriptionId, "settled subscription fact")
	require.Empty(t, row.Ip, "record_ip_log is off for this user")
	require.True(t, strings.HasPrefix(row.EventId, "ptu_"))
	require.NotZero(t, row.CreatedAt)
	count, quota := partnerTenantUsageWriterQuotaFeed(member)
	require.Equal(t, 1, count, "dashboard feed exactly once")
	require.Equal(t, 1234, quota)

	// Zero consumption of a subscription_key member is still one dedicated row.
	keyMember := fixture.subscriptionKeyMember
	RecordConsumeLog(partnerTenantUsageWriterContext(keyMember, "req-writer-zero"), keyMember, partnerTenantUsageWriterConsume("writer-model", 0, NewLogOther()))
	legacy, dedicated = partnerTenantUsageWriterRows(t, db, keyMember)
	require.Empty(t, legacy)
	require.Len(t, dedicated, 1)
	require.Equal(t, int64(0), dedicated[0].Quota)
	require.Equal(t, int64(0), dedicated[0].SubscriptionId, "no settled fact, no guessed subscription")
	require.Equal(t, PartnerTenantIdentitySubscriptionKey, dedicated[0].IdentitySource)
	count, quota = partnerTenantUsageWriterQuotaFeed(keyMember)
	require.Equal(t, 1, count)
	require.Zero(t, quota)

	// Ordinary, ordinary-with-subscription, p_-prefixed lookalike and OAuth-only
	// users are confirmed non-members: original logs path, nothing dedicated.
	for _, user := range fixture.nonMembers() {
		requestID := "req-writer-ordinary-" + strconv.Itoa(user)
		RecordConsumeLog(partnerTenantUsageWriterContext(user, requestID), user, partnerTenantUsageWriterConsume("writer-model", 77, other))
		legacy, dedicated = partnerTenantUsageWriterRows(t, db, user)
		require.Len(t, legacy, 1, "user %d", user)
		require.Empty(t, dedicated, "user %d", user)
		require.Equal(t, LogTypeConsume, legacy[0].Type)
		require.Equal(t, 77, legacy[0].Quota)
		require.Equal(t, requestID, legacy[0].RequestId)
		count, quota = partnerTenantUsageWriterQuotaFeed(user)
		require.Equal(t, 1, count, "user %d", user)
		require.Equal(t, 77, quota)
	}

	// Consume logging disabled: nothing anywhere, no owner lookup, no feed.
	beforeLegacy, beforeDedicated := partnerTenantUsageWriterTotals(t, db)
	lookups := countPartnerTenantUsageQueries(t, db)
	common.LogConsumeEnabled = false
	RecordConsumeLog(partnerTenantUsageWriterContext(member, "req-writer-disabled"), member, partnerTenantUsageWriterConsume("writer-model", 5, nil))
	RecordConsumeLog(partnerTenantUsageWriterContext(fixture.ordinary, "req-writer-disabled-o"), fixture.ordinary, partnerTenantUsageWriterConsume("writer-model", 5, nil))
	RecordTaskBillingLog(RecordTaskBillingLogParams{UserId: member, LogType: LogTypeConsume, ModelName: "task-model", Quota: 5})
	common.LogConsumeEnabled = true
	require.Zero(t, *lookups, "the switch returns before any owner lookup")
	afterLegacy, afterDedicated := partnerTenantUsageWriterTotals(t, db)
	require.Equal(t, beforeLegacy, afterLegacy)
	require.Equal(t, beforeDedicated, afterDedicated)
	count, _ = partnerTenantUsageWriterQuotaFeed(member)
	require.Equal(t, 1, count)
	count, _ = partnerTenantUsageWriterQuotaFeed(fixture.ordinary)
	require.Equal(t, 1, count)
}

func TestPartnerTenantUsageWriterErrorRoutesByOwner(t *testing.T) {
	db, fixture := setupPartnerTenantUsageWriterPQ(t, "pt_usage_writer_error_")
	member := fixture.externalMember
	RecordErrorLog(partnerTenantUsageWriterContext(member, "req-writer-error"), member, 9, "err-model", "writer-key", "upstream failed", 41, 4, true, "writer-group", NewLogOther())
	legacy, dedicated := partnerTenantUsageWriterRows(t, db, member)
	require.Empty(t, legacy)
	require.Len(t, dedicated, 1)
	row := dedicated[0]
	require.Equal(t, LogTypeError, row.Type)
	require.Zero(t, row.Quota)
	require.Equal(t, "upstream failed", row.Content)
	require.Equal(t, int64(9), row.ChannelId)
	require.Equal(t, int64(41), row.TokenId)
	require.Equal(t, int64(4), row.UseTime)
	require.True(t, row.IsStream)
	require.Equal(t, "req-writer-error", row.RequestId)
	require.Equal(t, "up-req-writer-error", row.UpstreamRequestId)
	require.Equal(t, fixture.enabledTenant.Id, row.TenantId)
	require.Zero(t, row.SubscriptionId, "an error never invents a subscription")
	count, _ := partnerTenantUsageWriterQuotaFeed(member)
	require.Zero(t, count, "error events add nothing to the dashboard feed")

	ordinary := fixture.ordinary
	RecordErrorLog(partnerTenantUsageWriterContext(ordinary, "req-writer-error-o"), ordinary, 9, "err-model", "writer-key", "upstream failed", 41, 4, false, "default", NewLogOther())
	legacy, dedicated = partnerTenantUsageWriterRows(t, db, ordinary)
	require.Len(t, legacy, 1)
	require.Empty(t, dedicated)
	require.Equal(t, LogTypeError, legacy[0].Type)
	require.Equal(t, "req-writer-error-o", legacy[0].RequestId)
	count, _ = partnerTenantUsageWriterQuotaFeed(ordinary)
	require.Zero(t, count)
}

// Every member state of the shared owner fixture routes by the account mapping
// alone (disabled tenant/account, expired entitlement, missing tenant row,
// soft-deleted user), and the per-user IP setting is honoured on both tables.
func TestPartnerTenantUsageWriterEveryMemberStateAndIp(t *testing.T) {
	db, fixture := setupPartnerTenantUsageWriterPQ(t, "pt_usage_writer_states_")
	for _, member := range fixture.members() {
		RecordConsumeLog(partnerTenantUsageWriterContext(member, "req-states-"+strconv.Itoa(member)), member, partnerTenantUsageWriterConsume("states-model", 9, nil))
		legacy, dedicated := partnerTenantUsageWriterRows(t, db, member)
		require.Empty(t, legacy, "user %d", member)
		require.Len(t, dedicated, 1, "user %d", member)
		account := fixture.accounts[member]
		require.Equal(t, account.TenantId, dedicated[0].TenantId, "user %d", member)
		require.Equal(t, int64(account.Id), dedicated[0].AccountId, "user %d", member)
		require.Equal(t, int64(9), dedicated[0].Quota, "user %d", member)
	}
	_, orphan := partnerTenantUsageWriterRows(t, db, fixture.orphanTenantMember)
	require.Equal(t, fixture.orphanTenantID, orphan[0].TenantId)
	require.Empty(t, orphan[0].TenantName, "a missing tenant row keeps the mapping with an empty name")
	_, disabled := partnerTenantUsageWriterRows(t, db, fixture.disabledTenantMember)
	require.Equal(t, fixture.disabledTenant.Id, disabled[0].TenantId)
	require.Equal(t, "Usage Disabled", disabled[0].TenantName)

	// record_ip_log on: the client IP is copied exactly like the default table.
	member, ordinary := fixture.externalMember, fixture.ordinary
	for _, user := range []int{member, ordinary} {
		require.NoError(t, db.Model(&User{}).Where("id = ?", user).Update("setting", `{"record_ip_log":true}`).Error)
	}
	consumeCtx := partnerTenantUsageWriterContext(member, "req-states-ip")
	wantIp := consumeCtx.ClientIP()
	require.NotEmpty(t, wantIp)
	RecordConsumeLog(consumeCtx, member, partnerTenantUsageWriterConsume("states-model", 1, nil))
	RecordErrorLog(partnerTenantUsageWriterContext(member, "req-states-ip-e"), member, 9, "err-model", "writer-key", "failed", 41, 1, false, "g", NewLogOther())
	RecordConsumeLog(partnerTenantUsageWriterContext(ordinary, "req-states-ip-o"), ordinary, partnerTenantUsageWriterConsume("states-model", 1, nil))
	_, dedicated := partnerTenantUsageWriterRows(t, db, member)
	require.Len(t, dedicated, 3)
	require.Empty(t, dedicated[0].Ip, "written before the setting changed")
	require.Equal(t, wantIp, dedicated[1].Ip)
	require.Equal(t, LogTypeError, dedicated[2].Type)
	require.Equal(t, wantIp, dedicated[2].Ip)
	legacy, _ := partnerTenantUsageWriterRows(t, db, ordinary)
	require.Len(t, legacy, 1)
	require.Equal(t, wantIp, legacy[0].Ip)
}

func TestPartnerTenantUsageWriterTaskBillingRoutesUsageOnly(t *testing.T) {
	db, fixture := setupPartnerTenantUsageWriterPQ(t, "pt_usage_writer_task_")
	member := fixture.externalMember
	other := NewLogOther()
	other.SetPublic("subscription_id", int64(808))
	RecordTaskBillingLog(RecordTaskBillingLogParams{UserId: member, LogType: LogTypeConsume, ChannelId: 3, ModelName: "task-model", Quota: 300, Group: "task-group", Other: other})
	legacy, dedicated := partnerTenantUsageWriterRows(t, db, member)
	require.Empty(t, legacy)
	require.Len(t, dedicated, 1)
	require.Equal(t, LogTypeConsume, dedicated[0].Type)
	require.Equal(t, int64(300), dedicated[0].Quota)
	require.Equal(t, int64(808), dedicated[0].SubscriptionId)
	require.Equal(t, "p_usage_external", dedicated[0].Username, "persisted user name")
	require.NotEmpty(t, dedicated[0].RequestId, "generated like createLog does")
	require.Equal(t, fixture.enabledTenant.Id, dedicated[0].TenantId)
	count, quota := partnerTenantUsageWriterQuotaFeed(member)
	require.Equal(t, 1, count)
	require.Equal(t, 300, quota)

	// Refunds keep their original storage and add no feed.
	RecordTaskBillingLog(RecordTaskBillingLogParams{UserId: member, LogType: LogTypeRefund, ModelName: "task-model", Quota: 100, Other: NewLogOther()})
	legacy, dedicated = partnerTenantUsageWriterRows(t, db, member)
	require.Len(t, legacy, 1)
	require.Equal(t, LogTypeRefund, legacy[0].Type)
	require.Equal(t, 100, legacy[0].Quota)
	require.Len(t, dedicated, 1)
	count, _ = partnerTenantUsageWriterQuotaFeed(member)
	require.Equal(t, 1, count)

	// An error through the task writer is routed like any usage error.
	RecordTaskBillingLog(RecordTaskBillingLogParams{UserId: member, LogType: LogTypeError, ModelName: "task-model", Other: NewLogOther()})
	legacy, dedicated = partnerTenantUsageWriterRows(t, db, member)
	require.Len(t, legacy, 1)
	require.Len(t, dedicated, 2)
	require.Equal(t, LogTypeError, dedicated[1].Type)
	count, _ = partnerTenantUsageWriterQuotaFeed(member)
	require.Equal(t, 1, count)

	ordinary := fixture.ordinary
	RecordTaskBillingLog(RecordTaskBillingLogParams{UserId: ordinary, LogType: LogTypeConsume, ModelName: "task-model", Quota: 50, Other: NewLogOther()})
	legacy, dedicated = partnerTenantUsageWriterRows(t, db, ordinary)
	require.Len(t, legacy, 1)
	require.Empty(t, dedicated)
	require.Equal(t, LogTypeConsume, legacy[0].Type)
	count, _ = partnerTenantUsageWriterQuotaFeed(ordinary)
	require.Equal(t, 1, count)
}

func partnerTenantUsageWriterSecretOther() *LogOther {
	other := NewLogOther()
	other.SetPublic("note", partnerTenantUsageSecretMarker+"-public")
	other.SetAdmin("diag", partnerTenantUsageSecretMarker+"-admin")
	return other
}

func partnerTenantUsageWriterSecretConsume() RecordConsumeLogParams {
	params := partnerTenantUsageWriterConsume("writer-model", 11, partnerTenantUsageWriterSecretOther())
	params.Content = []*common.Message{common.NewMessage("content "+partnerTenantUsageSecretMarker, map[string]any{"marker": partnerTenantUsageSecretMarker})}
	return params
}

const partnerTenantUsageWriterSecretError = "raw upstream error " + partnerTenantUsageSecretMarker

func TestPartnerTenantUsageWriterOwnerLookupFailureWritesNothing(t *testing.T) {
	db, fixture := setupPartnerTenantUsageWriterPQ(t, "pt_usage_writer_lookup_")
	output := capturePartnerTenantUsageWriterOutput(t)
	var statements bytes.Buffer
	DB = db.Session(&gorm.Session{Logger: gormlogger.New(log.New(&statements, "", 0), gormlogger.Config{LogLevel: gormlogger.Info})})
	LOG_DB = DB
	// Find on partner_tenant_accounts uses the GORM Query chain.
	fired := failPartnerTenantUsageWriterStatements(t,
		func(name string, fn func(*gorm.DB)) error {
			return db.Callback().Query().Before("gorm:query").Register(name, fn)
		},
		func(name string) { _ = db.Callback().Query().Remove(name) },
		"partner_tenant_accounts", errors.New("injected owner failure "+partnerTenantUsageSecretMarker))

	member, ordinary := fixture.externalMember, fixture.ordinary
	RecordConsumeLog(partnerTenantUsageWriterContext(member, "req-lookup-consume"), member, partnerTenantUsageWriterSecretConsume())
	require.Equal(t, 1, *fired, "the injection hit the owner lookup")
	RecordErrorLog(partnerTenantUsageWriterContext(member, "req-lookup-error"), member, 9, "err-model", "writer-key", partnerTenantUsageWriterSecretError, 41, 1, false, "g", partnerTenantUsageWriterSecretOther())
	require.Equal(t, 2, *fired)
	RecordTaskBillingLog(RecordTaskBillingLogParams{UserId: member, LogType: LogTypeConsume, ModelName: "task-model", Quota: 9, Other: partnerTenantUsageWriterSecretOther()})
	require.Equal(t, 3, *fired)
	// Unknown ownership is never guessed as ordinary either.
	RecordConsumeLog(partnerTenantUsageWriterContext(ordinary, "req-lookup-ordinary"), ordinary, partnerTenantUsageWriterSecretConsume())
	require.Equal(t, 4, *fired)

	for _, user := range []int{member, ordinary} {
		legacy, dedicated := partnerTenantUsageWriterRows(t, db, user)
		require.Empty(t, legacy, "user %d", user)
		require.Empty(t, dedicated, "user %d", user)
	}
	count, quota := partnerTenantUsageWriterQuotaFeed(member)
	require.Equal(t, 2, count, "the dashboard feed still counts each settled consume once")
	require.Equal(t, 20, quota)
	count, _ = partnerTenantUsageWriterQuotaFeed(ordinary)
	require.Equal(t, 1, count)

	text := output.String()
	require.NotContains(t, text, partnerTenantUsageSecretMarker, "no params/content/other/raw error in the application log")
	require.NotContains(t, text, "record consume log:")
	require.NotContains(t, text, "record error log:")
	require.Equal(t, 4, strings.Count(text, "usage log skipped: partner tenant owner lookup failed"), text)
	require.Contains(t, text, "request_id=req-lookup-consume")
	require.NotContains(t, statements.String(), partnerTenantUsageSecretMarker, "no marker in GORM DEBUG output")
	// The injected failure fires before gorm:query builds SQL, so the lookup
	// itself is never traced; the capture still recorded the other statements.
	require.Contains(t, statements.String(), `FROM "users"`, "the DEBUG logger captured this test's statements")
}

func TestPartnerTenantUsageWriterDedicatedInsertFailureHasNoFallback(t *testing.T) {
	db, fixture := setupPartnerTenantUsageWriterPQ(t, "pt_usage_writer_insert_")
	output := capturePartnerTenantUsageWriterOutput(t)
	fired := failPartnerTenantUsageWriterStatements(t,
		func(name string, fn func(*gorm.DB)) error {
			return db.Callback().Create().Before("gorm:create").Register(name, fn)
		},
		func(name string) { _ = db.Callback().Create().Remove(name) },
		partnerTenantUsageLogTable, errors.New("injected insert failure "+partnerTenantUsageSecretMarker))

	member := fixture.externalMember
	RecordConsumeLog(partnerTenantUsageWriterContext(member, "req-insert-consume"), member, partnerTenantUsageWriterSecretConsume())
	require.Equal(t, 1, *fired, "the injection hit the dedicated insert")
	RecordErrorLog(partnerTenantUsageWriterContext(member, "req-insert-error"), member, 9, "err-model", "writer-key", partnerTenantUsageWriterSecretError, 41, 1, false, "g", NewLogOther())
	require.Equal(t, 2, *fired)
	RecordTaskBillingLog(RecordTaskBillingLogParams{UserId: member, LogType: LogTypeConsume, ModelName: "task-model", Quota: 9, Other: NewLogOther()})
	require.Equal(t, 3, *fired)

	legacy, dedicated := partnerTenantUsageWriterRows(t, db, member)
	require.Empty(t, legacy, "no fallback into logs")
	require.Empty(t, dedicated)
	count, quota := partnerTenantUsageWriterQuotaFeed(member)
	require.Equal(t, 2, count, "feed still exactly once per consume")
	require.Equal(t, 20, quota)

	// The default table is untouched by the injection: ordinary writes still land.
	RecordConsumeLog(partnerTenantUsageWriterContext(fixture.ordinary, "req-insert-ordinary"), fixture.ordinary, partnerTenantUsageWriterConsume("writer-model", 1, nil))
	legacy, _ = partnerTenantUsageWriterRows(t, db, fixture.ordinary)
	require.Len(t, legacy, 1)
	require.Equal(t, 3, *fired, "the default insert is not the injected statement")

	text := output.String()
	require.Equal(t, 3, strings.Count(text, "usage log not recorded: "+ErrPartnerTenantUsageLogWrite.Error()), text)
	memberText := text[:strings.Index(text, "req-insert-ordinary")]
	require.NotContains(t, memberText, partnerTenantUsageSecretMarker)
	require.NotContains(t, memberText, "record consume log:")
	require.NotContains(t, memberText, "record error log:")
	require.NotContains(t, memberText, "failed to record")
}

func TestPartnerTenantUsageWriterDiagnosticsStaySafe(t *testing.T) {
	db, fixture := setupPartnerTenantUsageWriterPQ(t, "pt_usage_writer_secret_")
	output := capturePartnerTenantUsageWriterOutput(t)
	var statements bytes.Buffer
	DB = db.Session(&gorm.Session{Logger: gormlogger.New(log.New(&statements, "", 0), gormlogger.Config{LogLevel: gormlogger.Info})})
	LOG_DB = DB

	member := fixture.externalMember
	RecordConsumeLog(partnerTenantUsageWriterContext(member, "req-secret-consume"), member, partnerTenantUsageWriterSecretConsume())
	RecordErrorLog(partnerTenantUsageWriterContext(member, "req-secret-error"), member, 9, "err-model", "writer-key", partnerTenantUsageWriterSecretError, 41, 1, false, "g", partnerTenantUsageWriterSecretOther())
	RecordTaskBillingLog(RecordTaskBillingLogParams{UserId: member, LogType: LogTypeConsume, ModelName: "task-model", Quota: 9, Other: partnerTenantUsageWriterSecretOther()})
	_, dedicated := partnerTenantUsageWriterRows(t, db, member)
	require.Len(t, dedicated, 3, "the stored facts keep content/other")
	require.Contains(t, dedicated[0].Other, partnerTenantUsageSecretMarker)
	require.Contains(t, dedicated[1].Content, partnerTenantUsageSecretMarker)

	text := output.String()
	require.NotContains(t, text, partnerTenantUsageSecretMarker)
	require.NotContains(t, text, "record consume log:")
	require.NotContains(t, text, "record error log:")
	require.Contains(t, text, "record partner tenant usage consume log: user_id="+strconv.Itoa(member)+", tenant_id="+strconv.FormatInt(fixture.enabledTenant.Id, 10)+", request_id=req-secret-consume, quota=11")
	require.Contains(t, text, "record partner tenant usage error log: user_id="+strconv.Itoa(member))
	require.NotContains(t, statements.String(), partnerTenantUsageSecretMarker, "dedicated insert is silent even in DEBUG")
	require.Contains(t, statements.String(), "partner_tenant_accounts")

	// Non-member output is unchanged: the original lines are still printed.
	output.Reset()
	ordinary := fixture.ordinary
	RecordConsumeLog(partnerTenantUsageWriterContext(ordinary, "req-secret-ordinary"), ordinary, partnerTenantUsageWriterSecretConsume())
	RecordErrorLog(partnerTenantUsageWriterContext(ordinary, "req-secret-ordinary-e"), ordinary, 9, "err-model", "writer-key", partnerTenantUsageWriterSecretError, 41, 1, false, "g", NewLogOther())
	text = output.String()
	require.Contains(t, text, "record consume log: userId="+strconv.Itoa(ordinary)+", params=")
	require.Contains(t, text, "record error log: userId="+strconv.Itoa(ordinary)+", channelId=9, modelName=err-model, tokenName=writer-key, content="+partnerTenantUsageWriterSecretError)
	require.NotContains(t, text, "record partner tenant usage")
}

func TestPartnerTenantUsageWriterEndToEndHistory(t *testing.T) {
	db, fixture := setupPartnerTenantUsageWriterPQ(t, "pt_usage_writer_e2e_")
	// The default administrator list joins channel names.
	require.NoError(t, db.AutoMigrate(&Channel{}))
	member, ordinary := fixture.externalMember, fixture.ordinary
	now := common.GetTimestamp()
	start, end := now-3600, now+3600
	// Pre-cutover merchant history stays in logs.
	require.NoError(t, db.Create(&Log{UserId: member, Username: "p_usage_external", CreatedAt: now - 100, Type: LogTypeConsume, ModelName: "old-model", Quota: 100, RequestId: "req-e2e-old"}).Error)

	RecordConsumeLog(partnerTenantUsageWriterContext(member, "req-e2e-new"), member, partnerTenantUsageWriterConsume("new-model", 200, nil))
	RecordConsumeLog(partnerTenantUsageWriterContext(ordinary, "req-e2e-ordinary"), ordinary, partnerTenantUsageWriterConsume("ordinary-model", 50, nil))
	// Failed attempt then successful retry of one request.
	RecordErrorLog(partnerTenantUsageWriterContext(member, "req-e2e-retry"), member, 9, "retry-model", "writer-key", "first attempt failed", 41, 1, false, "writer-group", NewLogOther())
	RecordConsumeLog(partnerTenantUsageWriterContext(member, "req-e2e-retry"), member, partnerTenantUsageWriterConsume("retry-model", 300, nil))

	requestIDs := func(logs []*Log) []string {
		ids := make([]string, len(logs))
		for i, row := range logs {
			ids[i] = row.RequestId
		}
		sort.Strings(ids)
		return ids
	}

	admin, adminTotal, err := GetAllLogs(LogFilter{}, 0, 100)
	require.NoError(t, err)
	require.EqualValues(t, 2, adminTotal, "default administrator list reads logs only")
	require.Equal(t, []string{"req-e2e-old", "req-e2e-ordinary"}, requestIDs(admin))

	filter := PartnerTenantUsageFilter{TenantId: fixture.enabledTenant.Id, StartTimestamp: start, EndTimestamp: end}
	records, recordTotal, err := ListPartnerTenantUsageLogs(context.Background(), filter, 0, 100, true)
	require.NoError(t, err)
	require.EqualValues(t, 3, recordTotal, "merchant page: new member rows only")
	dedicatedIDs := make([]string, len(records))
	for i, record := range records {
		dedicatedIDs[i] = record.RequestId
		require.Equal(t, int64(member), record.UserId)
	}
	sort.Strings(dedicatedIDs)
	require.Equal(t, []string{"req-e2e-new", "req-e2e-retry", "req-e2e-retry"}, dedicatedIDs)

	own, ownTotal, err := GetUserLogs(member, LogFilter{}, 0, 100)
	require.NoError(t, err)
	require.EqualValues(t, 4, ownTotal, "own history: old + new")
	require.Equal(t, []string{"req-e2e-new", "req-e2e-old", "req-e2e-retry", "req-e2e-retry"}, requestIDs(own))

	outcomes, outcomeTotal, err := GetUserRequestLogs(context.Background(), member, start, end, 0, 100)
	require.NoError(t, err)
	require.EqualValues(t, 3, outcomeTotal)
	require.Equal(t, []string{"req-e2e-new", "req-e2e-old", "req-e2e-retry"}, requestIDs(outcomes))
	for _, outcome := range outcomes {
		if outcome.RequestId == "req-e2e-retry" {
			require.Equal(t, LogTypeConsume, outcome.Type, "the successful retry settles the request")
			require.Equal(t, 300, outcome.Quota)
		}
	}

	retry := filter
	retry.RequestId = "req-e2e-retry"
	stat, err := GetPartnerTenantUsageStat(context.Background(), retry)
	require.NoError(t, err)
	require.EqualValues(t, 2, stat.RecordCount)
	require.EqualValues(t, 1, stat.RequestCount)
	require.EqualValues(t, 1, stat.SucceededCount)
	require.EqualValues(t, 0, stat.FailedCount)
	require.Equal(t, "300", stat.Quota.String())

	count, quota := partnerTenantUsageWriterQuotaFeed(member)
	require.Equal(t, 2, count, "two settled consumes, the error adds nothing")
	require.Equal(t, 500, quota)
}
