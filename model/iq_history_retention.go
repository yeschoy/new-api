package model

import "gorm.io/gorm"

const (
	IQDefaultHistoryLimit = 30
	IQMaxHistoryLimit     = 1000
)

// PruneIQHistory also covers disabled/deleted plans. It is maintenance, never a
// side effect of a viewer GET. The shared config lock serializes policy changes.
func PruneIQHistory() error {
	if _, err := GetIQConfig(); err != nil {
		return err
	}
	var ids []int
	if err := DB.Model(&IQConfig{}).Where("group_name <> ?", "").Pluck("id", &ids).Error; err != nil {
		return err
	}
	for _, id := range ids {
		if err := DB.Transaction(func(tx *gorm.DB) error {
			if err := lockIQConfigs(tx); err != nil {
				return err
			}
			var cfg IQConfig
			if err := tx.First(&cfg, id).Error; err != nil {
				return err
			}
			return pruneIQGroupHistory(tx, cfg)
		}); err != nil {
			return err
		}
	}
	return nil
}

func pruneIQGroupHistory(tx *gorm.DB, cfg IQConfig) error {
	if cfg.Group == "" {
		return nil
	}
	limit := cfg.HistoryLimit
	if limit == 0 {
		limit = IQDefaultHistoryLimit // Old snapshots/clients predate this field.
	}
	for {
		// Include attempts as well as results: a failed/interrupted run may have
		// only checkpoints, and system-task history may already have been cleared.
		results := tx.Model(&IQResult{}).Select("task_id, run_seq").Where("group_name = ?", cfg.Group)
		attempts := tx.Table("iq_attempts AS a").Select("a.task_id, COALESCE(s.id, 0) AS run_seq").
			Joins("LEFT JOIN system_tasks AS s ON s.task_id = a.task_id").Where("a.group_name = ?", cfg.Group)
		var expired []string
		err := tx.Table("(? UNION ALL ?) AS history", results, attempts).
			Where("NOT EXISTS (SELECT 1 FROM system_tasks AS active WHERE active.task_id = history.task_id AND active.status IN ?)", activeSystemTaskStatuses()).
			Where("NOT EXISTS (SELECT 1 FROM system_task_locks AS lease WHERE lease.task_id = history.task_id)").
			Group("history.task_id").Order("MAX(history.run_seq) DESC, history.task_id DESC").
			Offset(limit).Limit(200).Pluck("history.task_id", &expired).Error
		if err != nil || len(expired) == 0 {
			return err
		}
		if err := tx.Where("group_name = ? AND task_id IN ?", cfg.Group, expired).Delete(&IQResult{}).Error; err != nil {
			return err
		}
		if err := tx.Where("group_name = ? AND task_id IN ?", cfg.Group, expired).Delete(&IQAttempt{}).Error; err != nil {
			return err
		}
		// Old singleton batches can belong to several groups. Remove their
		// snapshot/task only after every group's retained references are gone.
		unreferenced := func(db *gorm.DB, table string) *gorm.DB {
			return db.Where("task_id IN ?", expired).
				Where("NOT EXISTS (SELECT 1 FROM iq_results WHERE iq_results.task_id = " + table + ".task_id)").
				Where("NOT EXISTS (SELECT 1 FROM iq_attempts WHERE iq_attempts.task_id = " + table + ".task_id)")
		}
		if err := unreferenced(tx, "iq_batches").Delete(&IQBatch{}).Error; err != nil {
			return err
		}
		if err := unreferenced(tx, "system_tasks").
			Where("type = ? AND status IN ?", SystemTaskTypeIQTest, []SystemTaskStatus{SystemTaskStatusSucceeded, SystemTaskStatusFailed}).
			Delete(&SystemTask{}).Error; err != nil {
			return err
		}
	}
}
