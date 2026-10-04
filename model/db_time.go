package model

import (
	"errors"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

// GetDBTimestamp returns a UNIX timestamp from database time.
// Falls back to application time on error.
func GetDBTimestamp() int64 {
	return getDBTimestampOn(DB)
}

// getDBTimestampOn uses the current transaction's connection, avoiding a
// second connection while a caller holds a row lock (notably on SQLite).
func getDBTimestampOn(db *gorm.DB) int64 {
	ts, err := getDBTimestampOnStrict(db)
	if err != nil {
		return common.GetTimestamp()
	}
	return ts
}

// getDBTimestampOnStrict is for money and campaign decisions: a failed DB
// clock query must abort the transaction, never substitute a node's clock.
func getDBTimestampOnStrict(db *gorm.DB) (int64, error) {
	if db == nil {
		return 0, errors.New("database is required for timestamp")
	}
	var ts int64
	var err error
	switch {
	case common.UsingMainDatabase(common.DatabaseTypePostgreSQL):
		// PostgreSQL NOW() is fixed at transaction start; use statement time
		// so a grant waiting on row locks starts at the actual redeem time.
		err = db.Raw("SELECT FLOOR(EXTRACT(EPOCH FROM clock_timestamp()))::bigint").Scan(&ts).Error
	case common.UsingMainDatabase(common.DatabaseTypeSQLite):
		err = db.Raw("SELECT strftime('%s','now')").Scan(&ts).Error
	default:
		err = db.Raw("SELECT UNIX_TIMESTAMP()").Scan(&ts).Error
	}
	if err != nil {
		return 0, err
	}
	if ts <= 0 {
		return 0, errors.New("database returned invalid timestamp")
	}
	return ts, nil
}
