package model

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"slices"
	"time"

	"gorm.io/gorm"
)

func lockIQConfigs(tx *gorm.DB) error {
	return tx.Model(&IQConfig{}).Where("id = 1").UpdateColumn("dispatch_seq", gorm.Expr("dispatch_seq + 1")).Error
}

func nextIQConfigID(tx *gorm.DB, cfg *IQConfig) error {
	var last int
	if err := tx.Model(&IQConfig{}).Select("COALESCE(MAX(id), 1)").Scan(&last).Error; err != nil {
		return err
	}
	cfg.ID = last + 1
	return nil
}

// ListIQConfigs upgrades the old shared configuration once, atomically. Existing
// artwork and already queued snapshots remain intact. Row 1 stays as a template
// and serialization lock; only group-owned rows are editable/executable via APIs.
func ListIQConfigs() ([]IQConfig, error) {
	legacy, err := GetIQConfig()
	if err != nil {
		return nil, err
	}
	if len(legacy.Targets) > 0 {
		err = DB.Transaction(func(tx *gorm.DB) error {
			if err := lockIQConfigs(tx); err != nil {
				return err
			}
			var source IQConfig
			if err := tx.First(&source, 1).Error; err != nil {
				return err
			}
			for _, target := range source.Targets {
				var count int64
				if err := tx.Model(&IQConfig{}).Where("group_name = ?", target.Group).Count(&count).Error; err != nil {
					return err
				}
				if count > 0 {
					continue
				}
				cfg := source
				cfg.Group = target.Group
				cfg.Targets = IQTargets{target}
				if err := nextIQConfigID(tx, &cfg); err != nil {
					return err
				}
				if err := tx.Create(&cfg).Error; err != nil {
					return err
				}
			}
			return tx.Model(&IQConfig{}).Where("id = 1").Updates(map[string]any{"targets": "[]", "enabled": false, "next_run_at": 0, "version": gorm.Expr("version + 1")}).Error
		})
		if err != nil {
			return nil, err
		}
	}
	configs := []IQConfig{}
	err = iqOrderedConfigs(DB).Find(&configs).Error
	return configs, err
}

func iqOrderedConfigs(db *gorm.DB) *gorm.DB {
	return db.Where("group_name <> ? AND deleted = ?", "", false).Order("sort_order, group_name")
}

func appendIQGroupOrder(tx *gorm.DB, cfg *IQConfig) error {
	var last int
	if err := tx.Model(&IQConfig{}).Where("group_name <> ? AND deleted = ?", "", false).
		Select("COALESCE(MAX(sort_order), 0)").Scan(&last).Error; err != nil {
		return err
	}
	cfg.SortOrder = last + 1
	return nil
}

var ErrIQInvalidOrder = errors.New("IQ group order must contain every saved group exactly once")

// SaveIQGroupOrder only changes presentation order. Compare the complete ordered
// group list under the same lock as plan creation/deletion; stale editors must
// explicitly reload rather than overwrite another administrator's ordering.
func SaveIQGroupOrder(groups, previous []string) error {
	if len(groups) == 0 || len(groups) != len(previous) {
		return ErrIQInvalidOrder
	}
	seen := make(map[string]bool, len(groups))
	for _, group := range groups {
		if group == "" || seen[group] {
			return ErrIQInvalidOrder
		}
		seen[group] = true
	}
	for _, group := range previous {
		if !seen[group] {
			return ErrIQInvalidOrder
		}
		delete(seen, group)
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := lockIQConfigs(tx); err != nil {
			return err
		}
		var current []string
		if err := iqOrderedConfigs(tx.Model(&IQConfig{})).Pluck("group_name", &current).Error; err != nil {
			return err
		}
		if !slices.Equal(current, previous) {
			return ErrIQConflict
		}
		for i, group := range groups {
			if err := tx.Model(&IQConfig{}).Where("group_name = ? AND deleted = ?", group, false).
				UpdateColumn("sort_order", i+1).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func GetIQGroupConfig(group string) (*IQConfig, error) {
	configs, err := ListIQConfigs()
	if err != nil {
		return nil, err
	}
	for i := range configs {
		if configs[i].Group == group {
			return &configs[i], nil
		}
	}
	cfg := defaultIQConfig()
	cfg.ID, cfg.Version, cfg.Group = 0, 0, group
	cfg.Targets = IQTargets{{Group: group, Models: []string{}}}
	return &cfg, nil
}

// DeleteIQGroupConfig retains a versioned tombstone and artwork. Deleting and
// recreating a plan must not let stale editors overwrite or delete its successor.
func DeleteIQGroupConfig(group string, version int64, now time.Time) error {
	if group == "" || version <= 0 {
		return ErrIQConflict
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := lockIQConfigs(tx); err != nil {
			return err
		}
		res := tx.Model(&IQConfig{}).
			Where("group_name = ? AND version = ? AND deleted = ?", group, version, false).
			Updates(map[string]any{"deleted": true, "enabled": false, "next_run_at": 0, "version": version + 1, "updated_at": now.Unix()})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected != 1 {
			return ErrIQConflict
		}
		// A pending->running claim races atomically with this update. Requests
		// already claimed may finish, but unsent work must never start later.
		return tx.Model(&IQAttempt{}).
			Where("group_name = ? AND status = ?", group, "pending").
			Updates(map[string]any{"status": "interrupted", "completed_at": now.Unix()}).Error
	})
}

func iqActiveKey(group string) string {
	if group == "" {
		return SystemTaskTypeIQTest
	}
	sum := sha256.Sum256([]byte(group))
	// SystemTask.ActiveKey is bounded to 64 bytes.
	return "iq:" + hex.EncodeToString(sum[:30])
}

func GetActiveIQGroupTask(group string) (*SystemTask, error) {
	return activeIQGroupTask(DB, group)
}

func activeIQGroupTask(db *gorm.DB, group string) (*SystemTask, error) {
	var tasks []SystemTask
	if err := db.Where("active_key IN ?", []string{iqActiveKey(group), SystemTaskTypeIQTest}).Order("id DESC").Find(&tasks).Error; err != nil {
		return nil, err
	}
	for i := range tasks {
		task := &tasks[i]
		if *task.ActiveKey == iqActiveKey(group) {
			return task, nil
		}
		// An upgrade may leave an old shared run in flight. Do not enqueue a
		// duplicate paid request for any group already in that immutable run.
		var batch IQBatch
		if err := db.First(&batch, "task_id = ?", task.TaskID).Error; err != nil {
			return nil, err
		}
		var snapshot IQConfig
		if err := json.Unmarshal([]byte(batch.Snapshot), &snapshot); err != nil {
			return nil, err
		}
		for _, target := range snapshot.Targets {
			if target.Group == group {
				return task, nil
			}
		}
	}
	return nil, nil
}

// The gallery's first page needs the latest completed row of every saved plan,
// even when one busy group has filled the global history page by itself.
func ListIQLatestResults(groups []string) ([]IQResult, error) {
	rows := []IQResult{}
	if len(groups) == 0 {
		return rows, nil
	}
	latest := DB.Model(&IQResult{}).Select("group_name, MAX(run_seq)").
		Where("group_name IN ?", groups).Group("group_name")
	err := DB.Omit("artifact").Where("(group_name, run_seq) IN (?)", latest).
		Order("run_seq DESC, group_name, model").Find(&rows).Error
	return rows, err
}

func ListActiveIQTasks() ([]SystemTask, error) {
	tasks := []SystemTask{}
	err := DB.Where("type = ? AND status IN ?", SystemTaskTypeIQTest, activeSystemTaskStatuses()).Order("id").Find(&tasks).Error
	return tasks, err
}
