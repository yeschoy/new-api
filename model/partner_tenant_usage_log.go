package model

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

const partnerTenantUsageLogTable = "partner_tenant_usage_logs"

// PartnerTenantUsageLog is one model-call usage event (consume or error) of a
// Tenant member, stored in LOG_DB apart from the default logs table.
//
// The columns are explicit copies of the usage facts a Log row carries plus a
// frozen safe owner snapshot. Log is deliberately NOT embedded and none of its
// index tags are reused: PostgreSQL index names are schema-wide and names such
// as idx_created_at_id already belong to logs. Every index here carries the
// idx_ptul_ / ux_ptul_ prefix. idx_ptul_time (created_at, id) serves the
// administrator list when no merchant is selected, like logs' own time index.
//
// The row never stores an external buyer identifier or its hash, a credential
// hash or seed, a key or model-token string. There is no foreign key and no SQL
// join towards the main database.
//
// String columns without a size are text on PostgreSQL and SQLite; MySQL keeps
// varchar(191) for the defaulted ones and longtext for content/other, the same
// effective types the logs table has on each driver.
type PartnerTenantUsageLog struct {
	Id        int64  `json:"-" gorm:"column:id;primaryKey;autoIncrement;index:idx_ptul_time,priority:2;index:idx_ptul_tenant_time,priority:3;index:idx_ptul_user_time,priority:3;index:idx_ptul_token_time,priority:3"`
	EventId   string `json:"-" gorm:"column:event_id;type:varchar(64);not null;default:'';uniqueIndex:ux_ptul_event"`
	CreatedAt int64  `json:"-" gorm:"column:created_at;type:bigint;not null;default:0;autoCreateTime:false;index:idx_ptul_time,priority:1;index:idx_ptul_tenant_time,priority:2;index:idx_ptul_user_time,priority:2;index:idx_ptul_token_time,priority:2"`
	Type      int    `json:"-" gorm:"column:type;not null;default:0"`

	// Frozen safe owner snapshot captured from the validated identity.
	TenantId       int64  `json:"-" gorm:"column:tenant_id;type:bigint;not null;default:0;index:idx_ptul_tenant_time,priority:1"`
	AccountId      int64  `json:"-" gorm:"column:account_id;type:bigint;not null;default:0"`
	TenantName     string `json:"-" gorm:"column:tenant_name;type:varchar(64);not null;default:''"`
	IdentitySource string `json:"-" gorm:"column:identity_source;type:varchar(24);not null;default:''"`

	UserId           int64  `json:"-" gorm:"column:user_id;type:bigint;not null;default:0;index:idx_ptul_user_time,priority:1"`
	Username         string `json:"-" gorm:"column:username;not null;default:''"`
	ModelName        string `json:"-" gorm:"column:model_name;not null;default:''"`
	Quota            int64  `json:"-" gorm:"column:quota;type:bigint;not null;default:0"`
	PromptTokens     int64  `json:"-" gorm:"column:prompt_tokens;type:bigint;not null;default:0"`
	CompletionTokens int64  `json:"-" gorm:"column:completion_tokens;type:bigint;not null;default:0"`
	UseTime          int64  `json:"-" gorm:"column:use_time;type:bigint;not null;default:0"`
	IsStream         bool   `json:"-" gorm:"column:is_stream;not null;default:false"`
	ChannelId        int64  `json:"-" gorm:"column:channel_id;type:bigint;not null;default:0"`
	TokenId          int64  `json:"-" gorm:"column:token_id;type:bigint;not null;default:0;index:idx_ptul_token_time,priority:1"`
	TokenName        string `json:"-" gorm:"column:token_name;not null;default:''"`
	// Same reserved column name as logs so readers can project it unchanged.
	// GORM quotes it in DDL and inserts; raw fragments must use logGroupCol.
	Group             string `json:"-" gorm:"column:group;not null;default:''"`
	Ip                string `json:"-" gorm:"column:ip;not null;default:''"`
	RequestId         string `json:"-" gorm:"column:request_id;type:varchar(64);not null;default:'';index:idx_ptul_request"`
	UpstreamRequestId string `json:"-" gorm:"column:upstream_request_id;type:varchar(128);not null;default:''"`
	// Only a known fact at write time; zero otherwise. Never looked up later.
	SubscriptionId int64 `json:"-" gorm:"column:subscription_id;type:bigint;not null;default:0"`
	// No size and no default: text on PostgreSQL, never varchar(n).
	Content string `json:"-" gorm:"column:content"`
	Other   string `json:"-" gorm:"column:other"`
}

func (PartnerTenantUsageLog) TableName() string { return partnerTenantUsageLogTable }

// Fixed, content-free errors. The database error is intentionally dropped: its
// text can carry SQL, bound parameters or row content.
var (
	ErrPartnerTenantUsageLogInvalid     = errors.New("partner tenant usage log rejected: invalid row")
	ErrPartnerTenantUsageLogUnavailable = errors.New("partner tenant usage log write failed: log database unavailable")
	ErrPartnerTenantUsageLogWrite       = errors.New("partner tenant usage log write failed: database error")
)

// newPartnerTenantUsageEventId returns a random, non-secret correlation
// identifier. It is not derived from any credential or request content.
func newPartnerTenantUsageEventId() (string, error) {
	var raw [16]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	return "ptu_" + hex.EncodeToString(raw[:]), nil
}

// insertPartnerTenantUsageLog persists exactly one row in the dedicated table.
// It never falls back to logs and never writes twice. The caller-supplied Id
// and EventId are discarded. SQL logging is silenced for this statement even
// when DEBUG logging is on, because interpolated SQL would expose content/other.
func insertPartnerTenantUsageLog(row *PartnerTenantUsageLog) error {
	if row == nil || row.TenantId <= 0 || row.AccountId <= 0 || row.UserId <= 0 ||
		(row.Type != LogTypeConsume && row.Type != LogTypeError) {
		return ErrPartnerTenantUsageLogInvalid
	}
	if LOG_DB == nil {
		return ErrPartnerTenantUsageLogUnavailable
	}
	eventID, err := newPartnerTenantUsageEventId()
	if err != nil {
		return ErrPartnerTenantUsageLogWrite
	}
	row.Id = 0
	row.EventId = eventID
	if row.CreatedAt == 0 {
		row.CreatedAt = common.GetTimestamp()
	}
	if row.RequestId == "" {
		// Same rule as ensureLogRequestId for the default table.
		row.RequestId = common.NewRequestId()
	}
	if err := LOG_DB.Session(&gorm.Session{Logger: gormlogger.Default.LogMode(gormlogger.Silent)}).Create(row).Error; err != nil {
		return ErrPartnerTenantUsageLogWrite
	}
	return nil
}

// MigratePartnerTenantUsageLogs creates the dedicated usage table in LOG_DB.
// It is idempotent, additive and never reads, copies, moves or deletes rows of
// logs or any main-database table.
func MigratePartnerTenantUsageLogs() error {
	if LOG_DB == nil {
		return ErrPartnerTenantUsageLogUnavailable
	}
	if !common.UsingLogDatabase(common.DatabaseTypeClickHouse) {
		if err := LOG_DB.AutoMigrate(&PartnerTenantUsageLog{}); err != nil {
			return err
		}
	} else {
		ttlDays := clickHouseLogTTLDays()
		if err := LOG_DB.Exec(partnerTenantUsageLogClickHouseCreateTableSQL(ttlDays)).Error; err != nil {
			return err
		}
		if err := syncPartnerTenantUsageLogClickHouseTTL(ttlDays); err != nil {
			return err
		}
	}
	// The table now exists on this handle. Remembering it here means the
	// own-user / API-Key readers on the migrating node never have to infer
	// presence from a failed probe (see dedicatedLogOwnerHasRows).
	dedicatedLogTableKnown.Store(LOG_DB)
	return nil
}

// ClickHouse has no auto increment: id stays 0 and event_id is the identity,
// like logs. Identifiers, quota and token counts are 64-bit.
func partnerTenantUsageLogClickHouseCreateTableSQL(ttlDays int) string {
	return fmt.Sprintf(`
CREATE TABLE IF NOT EXISTS %s (
	id Int64 DEFAULT 0,
	event_id String DEFAULT '',
	created_at Int64 DEFAULT 0,
	type Int32 DEFAULT 0,
	tenant_id Int64 DEFAULT 0,
	account_id Int64 DEFAULT 0,
	tenant_name String DEFAULT '',
	identity_source String DEFAULT '',
	user_id Int64 DEFAULT 0,
	username String DEFAULT '',
	model_name String DEFAULT '',
	quota Int64 DEFAULT 0,
	prompt_tokens Int64 DEFAULT 0,
	completion_tokens Int64 DEFAULT 0,
	use_time Int64 DEFAULT 0,
	is_stream UInt8 DEFAULT 0,
	channel_id Int64 DEFAULT 0,
	token_id Int64 DEFAULT 0,
	token_name String DEFAULT '',
	`+"`group`"+` String DEFAULT '',
	ip String DEFAULT '',
	request_id String DEFAULT '',
	upstream_request_id String DEFAULT '',
	subscription_id Int64 DEFAULT 0,
	content String DEFAULT '',
	other String DEFAULT ''
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(toDateTime(created_at))
ORDER BY (created_at, event_id)%s`, partnerTenantUsageLogTable, clickHouseLogTTLClause(ttlDays))
}

// partnerTenantUsageLogClickHouseTTLStatement returns the statement that brings
// the table TTL in line with LOG_SQL_CLICKHOUSE_TTL_DAYS, or "" when the table
// already has no TTL and none is configured.
func partnerTenantUsageLogClickHouseTTLStatement(ttlDays int, hasTTL bool) string {
	if expression := clickHouseLogTTLExpression(ttlDays); expression != "" {
		return "ALTER TABLE " + partnerTenantUsageLogTable + " MODIFY TTL " + expression
	}
	if hasTTL {
		return "ALTER TABLE " + partnerTenantUsageLogTable + " REMOVE TTL"
	}
	return ""
}

func partnerTenantUsageLogClickHouseShowCreateSQL() string {
	return "SHOW CREATE TABLE " + partnerTenantUsageLogTable
}

func syncPartnerTenantUsageLogClickHouseTTL(ttlDays int) error {
	hasTTL := false
	if clickHouseLogTTLExpression(ttlDays) == "" {
		var createTableSQL string
		if err := LOG_DB.Raw(partnerTenantUsageLogClickHouseShowCreateSQL()).Scan(&createTableSQL).Error; err != nil {
			return err
		}
		hasTTL = clickHouseCreateTableHasTTL(createTableSQL)
	}
	statement := partnerTenantUsageLogClickHouseTTLStatement(ttlDays, hasTTL)
	if statement == "" {
		return nil
	}
	return LOG_DB.Exec(statement).Error
}
