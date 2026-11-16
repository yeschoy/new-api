package model

import (
	"context"
	"errors"
	"math"
	"strings"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

// Ownership-scoped two-table reads for the existing own-user / API-Key log
// readers. A Tenant member's new usage rows live in partner_tenant_usage_logs;
// these helpers let the readers keep returning that history next to the rows
// still stored in logs.
//
// Ownership is only ever the authenticated identity handed in by the caller
// (user ID or token ID). The current Tenant owner mapping and the membership
// cache are never consulted: a row belongs to a reader because its stored
// user_id / token_id matches. Administrator readers do not use this file.

// Fixed ownership identifiers. They are never built from input.
const (
	ownedLogUserColumn  = "user_id"
	ownedLogTokenColumn = "token_id"
)

// Private source markers of the union projection. They order rows that tie on
// created_at and local id and never reach a response.
const (
	ownedLogSourceLegacy    = 0
	ownedLogSourceDedicated = 1
)

// errOwnedLogRead is a fixed, content-free read failure. The driver error is
// dropped on purpose: its text can carry SQL, bound parameters or row content.
var errOwnedLogRead = errors.New("owned log read failed: database error")

// ownedLogRow is the private scan target of the union: the Log columns plus
// the two private ordering columns. Only the embedded Log leaves this file.
type ownedLogRow struct {
	Log        `gorm:"embedded"`
	LogSource  int    `gorm:"column:log_source"`
	LogEventId string `gorm:"column:log_event_id"`
}

// Integer columns of the projection, in projection order relative to the
// string columns below (see ownedLogUnionBranchColumns for the full order).
var ownedLogIntegerColumns = map[string]bool{
	"id": true, "user_id": true, "created_at": true, "type": true, "quota": true,
	"prompt_tokens": true, "completion_tokens": true, "use_time": true,
	"channel_id": true, "token_id": true,
}

// ownedLogProjection is the Log-compatible column order shared by both union
// branches and the outer select. "group" is a placeholder replaced by the
// driver-quoted column. channel_name is not a column of either table.
var ownedLogProjection = []string{
	"id", "user_id", "created_at", "type", "content", "username", "token_name",
	"model_name", "quota", "prompt_tokens", "completion_tokens", "use_time",
	"is_stream", "channel_id", "token_id", "group", "ip", "request_id",
	"upstream_request_id", "other",
}

func ownedLogReadSession(ctx context.Context) *gorm.DB {
	return ownedLogReadSessionOn(LOG_DB, ctx)
}

func ownedLogReadSessionOn(db *gorm.DB, ctx context.Context) *gorm.DB {
	// Silenced even in DEBUG: no interpolated statement or driver error of
	// these reads may reach the SQL log.
	return db.WithContext(ctx).Session(&gorm.Session{Logger: gormlogger.Default.LogMode(gormlogger.Silent)})
}

// dedicatedLogTableKnown is the LOG_DB handle on which the dedicated table was
// seen. Only a positive answer is remembered (this feature never drops the
// table) and it is bound to that handle: another handle is checked again.
// "Absent" is never remembered, because the master node may create the table
// a moment later.
var dedicatedLogTableKnown atomic.Pointer[gorm.DB]

// dedicatedLogTablePresent decides, through the driver's GORM migrator,
// whether the dedicated table exists on db. HasTable reports false both for a
// missing table and for a failed catalog query, so the logs table (which every
// log database has) is the positive control: when it cannot be seen either,
// the check itself failed and that is an error, not "absent". The check is
// still not one atomic statement; the second lookup only narrows that window.
func dedicatedLogTablePresent(ctx context.Context, db *gorm.DB) (bool, error) {
	migrator := ownedLogReadSessionOn(db, ctx).Migrator()
	if migrator.HasTable(partnerTenantUsageLogTable) {
		return true, nil
	}
	if !migrator.HasTable("logs") {
		return false, errOwnedLogRead
	}
	// The control answered, so the catalog is reachable now. Ask once more:
	// the two lookups are not atomic, and a transient failure of the first one
	// followed by a working control must not be reported as "absent".
	if migrator.HasTable(partnerTenantUsageLogTable) {
		return true, nil
	}
	return false, nil
}

// dedicatedLogOwnerHasRows reports whether the dedicated table holds any row
// of the authenticated owner. It is one indexed existence check
// (idx_ptul_user_time / idx_ptul_token_time).
//
//   - The probe succeeds: the table exists (remembered for this handle) and the
//     answer is "rows" or "no rows".
//   - The probe fails on a handle where the table is known: read failure.
//   - The probe fails on a handle where the table is not yet known: the
//     migrator decides. Table missing is a successful "no rows" (a missing
//     table holds none; another node may not have migrated yet) and is not
//     remembered. The presence check failing is a read failure. Table
//     present: the probe is repeated once (the table may have been created
//     meanwhile); a second failure is a read failure.
//
// A failure must never be treated as "no rows".
func dedicatedLogOwnerHasRows(ctx context.Context, ownerColumn string, ownerValue int) (bool, error) {
	db := LOG_DB
	if db == nil || (ownerColumn != ownedLogUserColumn && ownerColumn != ownedLogTokenColumn) {
		return false, errOwnedLogRead
	}
	probe := func() (bool, error) {
		var hits []struct {
			Hit int64 `gorm:"column:hit"`
		}
		if err := ownedLogReadSessionOn(db, ctx).Table(partnerTenantUsageLogTable).
			Select("1 AS hit").Where(ownerColumn+" = ?", ownerValue).Limit(1).Scan(&hits).Error; err != nil {
			return false, errOwnedLogRead
		}
		if dedicatedLogTableKnown.Load() != db {
			dedicatedLogTableKnown.Store(db)
		}
		return len(hits) > 0, nil
	}
	if hasRows, err := probe(); err == nil {
		return hasRows, nil
	}
	if dedicatedLogTableKnown.Load() == db {
		return false, errOwnedLogRead
	}
	present, err := dedicatedLogTablePresent(ctx, db)
	if err != nil {
		return false, errOwnedLogRead
	}
	if !present {
		return false, nil
	}
	// The table is visible although the probe failed: it was created a moment
	// ago, or the failure was transient. Probe once more; a second failure is
	// a read failure on a table that exists.
	dedicatedLogTableKnown.Store(db)
	return probe()
}

// ownedLogIntegerExpr makes an integer column union-compatible. logs keeps the
// Go int width chosen by each driver while the dedicated table is 64-bit.
func ownedLogIntegerExpr(databaseType common.DatabaseType, column string) string {
	qualified := "logs." + column
	switch databaseType {
	case common.DatabaseTypeClickHouse:
		// id / created_at are Int64 and type is Int32 in both tables.
		if column == "id" || column == "created_at" || column == "type" {
			return qualified
		}
		return "toInt64(" + qualified + ")"
	case common.DatabaseTypeMySQL:
		return "CAST(" + qualified + " AS SIGNED)"
	default:
		return "CAST(" + qualified + " AS BIGINT)"
	}
}

// ownedLogUnionBranchColumns is the explicit projection of one union branch.
// Both branches alias their table as logs, so the column expressions are the
// same; only the private source marker and event identity differ.
func ownedLogUnionBranchColumns(databaseType common.DatabaseType, groupCol string, dedicated bool) string {
	return ownedLogBranchColumns(databaseType, groupCol, dedicated, ownedLogProjection)
}

// ownedLogBranchColumns is ownedLogUnionBranchColumns for any subset of
// ownedLogProjection: the same per-column expressions and private columns.
func ownedLogBranchColumns(databaseType common.DatabaseType, groupCol string, dedicated bool, projection []string) string {
	columns := make([]string, 0, len(projection)+2)
	for _, column := range projection {
		switch {
		case column == "group":
			columns = append(columns, "logs."+groupCol+" AS "+groupCol)
		case ownedLogIntegerColumns[column]:
			columns = append(columns, ownedLogIntegerExpr(databaseType, column)+" AS "+column)
		default:
			columns = append(columns, "logs."+column+" AS "+column)
		}
	}
	if dedicated {
		columns = append(columns, "1 AS log_source", "logs.event_id AS log_event_id")
	} else if databaseType == common.DatabaseTypePostgreSQL {
		columns = append(columns, "0 AS log_source", "CAST('' AS VARCHAR(64)) AS log_event_id")
	} else {
		columns = append(columns, "0 AS log_source", "'' AS log_event_id")
	}
	return strings.Join(columns, ", ")
}

// ownedLogGroupColumn is the driver-quoted group column of the projection. It
// is logGroupCol whenever the log database was initialised; the fallback is
// the same rule initCol applies, so the projection never emits an empty
// identifier.
func ownedLogGroupColumn(databaseType common.DatabaseType) string {
	if logGroupCol != "" {
		return logGroupCol
	}
	if databaseType == common.DatabaseTypePostgreSQL {
		return `"group"`
	}
	return "`group`"
}

func ownedLogUnionOuterColumns(groupCol string) string {
	return ownedLogOuterColumns(groupCol, ownedLogProjection)
}

func ownedLogOuterColumns(groupCol string, projection []string) string {
	columns := make([]string, 0, len(projection)+2)
	for _, column := range projection {
		if column == "group" {
			column = groupCol
		}
		columns = append(columns, "logs."+column)
	}
	columns = append(columns, "logs.log_source", "logs.log_event_id")
	return strings.Join(columns, ", ")
}

// ownedLogUnionOrder is the deterministic global order of mixed rows: time,
// original local id, source marker, event identity. The local id is only a
// sort key; the two tables have independent sequences, so it never identifies
// or deduplicates a row. ClickHouse keeps its legacy request_id tie-break
// because id is 0 in both tables there.
func ownedLogUnionOrder(databaseType common.DatabaseType) string {
	if databaseType == common.DatabaseTypeClickHouse {
		return "logs.created_at desc, logs.id desc, logs.request_id desc, logs.log_source asc, logs.log_event_id asc"
	}
	return "logs.created_at desc, logs.id desc, logs.log_source asc, logs.log_event_id asc"
}

// ownedLogUnion builds the derived table
//
//	(SELECT … FROM logs WHERE logs.<owner> = ? AND <filter>
//	 UNION ALL
//	 SELECT … FROM partner_tenant_usage_logs AS logs WHERE logs.<owner> = ? AND <filter>) AS logs
//
// The ownership predicate is a bound parameter inside each branch and the
// unchanged logs.-prefixed LogFilter restricts each branch before the union.
// UNION ALL keeps every event; nothing is deduplicated. Count, order, offset
// and limit are applied by the caller to the union as a whole. The only error
// returned is a filter error, exactly as LogFilter.apply reports it.
func ownedLogUnion(ctx context.Context, ownerColumn string, ownerValue int, filter LogFilter) (*gorm.DB, error) {
	databaseType := common.LogDatabaseType()
	legacy, err := filter.apply(LOG_DB.Table("logs").
		Select(ownedLogUnionBranchColumns(databaseType, ownedLogGroupColumn(databaseType), false)).
		Where("logs."+ownerColumn+" = ?", ownerValue))
	if err != nil {
		return nil, err
	}
	dedicated, err := filter.apply(LOG_DB.Table(partnerTenantUsageLogTable+" AS logs").
		Select(ownedLogUnionBranchColumns(databaseType, ownedLogGroupColumn(databaseType), true)).
		Where("logs."+ownerColumn+" = ?", ownerValue))
	if err != nil {
		return nil, err
	}
	return ownedLogReadSession(ctx).Table("(? UNION ALL ?) AS logs", legacy, dedicated), nil
}

// countOwnedLogUnion counts the union with the same (legacy) count limit the
// single-table self list applies.
func countOwnedLogUnion(ctx context.Context, ownerColumn string, ownerValue int, filter LogFilter) (int64, error) {
	union, err := ownedLogUnion(ctx, ownerColumn, ownerValue, filter)
	if err != nil {
		return 0, err
	}
	var total int64
	if err := union.Limit(logSearchCountLimit).Count(&total).Error; err != nil {
		return 0, errOwnedLogRead
	}
	return total, nil
}

// queryOwnedLogUnion returns one globally ordered page of the union.
func queryOwnedLogUnion(ctx context.Context, ownerColumn string, ownerValue int, filter LogFilter, startIdx int, num int) ([]*Log, error) {
	union, err := ownedLogUnion(ctx, ownerColumn, ownerValue, filter)
	if err != nil {
		return nil, err
	}
	var rows []ownedLogRow
	if err := union.Select(ownedLogUnionOuterColumns(ownedLogGroupColumn(common.LogDatabaseType()))).
		Order(ownedLogUnionOrder(common.LogDatabaseType())).
		Limit(num).Offset(startIdx).Find(&rows).Error; err != nil {
		return nil, errOwnedLogRead
	}
	logs := make([]*Log, len(rows))
	for i := range rows {
		logs[i] = &rows[i].Log
	}
	return logs, nil
}

// streamOwnedLogUnion calls fn with each row of the union in global order.
// Rows are scanned one at a time; the window is never materialised.
func streamOwnedLogUnion(ctx context.Context, ownerColumn string, ownerValue int, filter LogFilter, fn func(*Log) error) error {
	union, err := ownedLogUnion(ctx, ownerColumn, ownerValue, filter)
	if err != nil {
		return err
	}
	rows, err := union.Select(ownedLogUnionOuterColumns(ownedLogGroupColumn(common.LogDatabaseType()))).
		Order(ownedLogUnionOrder(common.LogDatabaseType())).Rows()
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
		}
		return errOwnedLogRead
	}
	defer rows.Close()
	for rows.Next() {
		var row ownedLogRow
		if err := LOG_DB.ScanRows(rows, &row); err != nil {
			return errOwnedLogRead
		}
		if err := fn(&row.Log); err != nil {
			return err
		}
	}
	if err := rows.Err(); err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
		}
		return errOwnedLogRead
	}
	return nil
}

// sumDedicatedUserUsedQuota is the dedicated-table part of the self
// statistics: consume rows of the authenticated user only, with the same
// optional filters and the same 60-second rpm/tpm window as SumUsedQuota.
func sumDedicatedUserUsedQuota(ctx context.Context, userId int, startTimestamp int64, endTimestamp int64, modelName string, tokenName string, channel int, group string) (quota int64, rpm int64, tpm int64, err error) {
	scoped := func(selectSQL string) (*gorm.DB, error) {
		tx := ownedLogReadSession(ctx).Table(partnerTenantUsageLogTable).Select(selectSQL).
			Where("user_id = ?", userId).Where("type = ?", LogTypeConsume)
		if tokenName != "" {
			tx = tx.Where("token_name = ?", tokenName)
		}
		if channel != 0 {
			tx = tx.Where("channel_id = ?", channel)
		}
		if group != "" {
			tx = tx.Where(logGroupCol+" = ?", group)
		}
		return applyExplicitLogTextFilter(tx, "model_name", modelName)
	}

	quotaQuery, err := scoped("COALESCE(sum(quota), 0) quota")
	if err != nil {
		return 0, 0, 0, err
	}
	if startTimestamp != 0 {
		quotaQuery = quotaQuery.Where("created_at >= ?", startTimestamp)
	}
	if endTimestamp != 0 {
		quotaQuery = quotaQuery.Where("created_at <= ?", endTimestamp)
	}
	var quotaStat struct {
		Quota int64
	}
	if err := quotaQuery.Scan(&quotaStat).Error; err != nil {
		return 0, 0, 0, errOwnedLogRead
	}

	rateQuery, err := scoped("count(*) rpm, COALESCE(sum(prompt_tokens), 0) + COALESCE(sum(completion_tokens), 0) tpm")
	if err != nil {
		return 0, 0, 0, err
	}
	var rateStat struct {
		Rpm int64
		Tpm int64
	}
	if err := rateQuery.Where("created_at >= ?", time.Now().Add(-60*time.Second).Unix()).Scan(&rateStat).Error; err != nil {
		return 0, 0, 0, errOwnedLogRead
	}
	return quotaStat.Quota, rateStat.Rpm, rateStat.Tpm, nil
}

func addOwnedLogStat(base int, extra int64) (int, bool) {
	if extra < 0 || extra > math.MaxInt || base > math.MaxInt-int(extra) {
		return 0, false
	}
	return base + int(extra), true
}

// SumUserUsedQuota is the self statistics of one authenticated user. The
// legacy part is SumUsedQuota exactly as the self endpoint always called it
// (scoped by the session username). The dedicated-table part is added only
// when that table holds rows of the authenticated user ID. Any failure of the
// dedicated part fails the whole statistic: a partial sum is never returned.
func SumUserUsedQuota(userId int, username string, logType int, startTimestamp int64, endTimestamp int64, modelName string, tokenName string, channel int, group string) (Stat, error) {
	stat, err := SumUsedQuota(logType, startTimestamp, endTimestamp, modelName, username, tokenName, channel, group)
	if err != nil {
		return stat, err
	}
	ctx := context.Background()
	dedicated, err := dedicatedLogOwnerHasRows(ctx, ownedLogUserColumn, userId)
	if err != nil {
		common.SysError("failed to probe dedicated user log statistics")
		return Stat{}, common.NewMessage("Failed to query statistics")
	}
	if !dedicated {
		return stat, nil
	}
	quota, rpm, tpm, err := sumDedicatedUserUsedQuota(ctx, userId, startTimestamp, endTimestamp, modelName, tokenName, channel, group)
	if err != nil {
		if !errors.Is(err, errOwnedLogRead) {
			// Filter error: same pass-through as SumUsedQuota.
			return Stat{}, err
		}
		common.SysError("failed to query dedicated user log statistics")
		return Stat{}, common.NewMessage("Failed to query statistics")
	}
	var ok bool
	if stat.Quota, ok = addOwnedLogStat(stat.Quota, quota); ok {
		if stat.Rpm, ok = addOwnedLogStat(stat.Rpm, rpm); ok {
			stat.Tpm, ok = addOwnedLogStat(stat.Tpm, tpm)
		}
	}
	if !ok {
		common.SysError("failed to combine dedicated user log statistics")
		return Stat{}, common.NewMessage("Failed to query statistics")
	}
	return stat, nil
}
