package model

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func seedIQRetentionRun(t *testing.T, taskID string, groups []string, status SystemTaskStatus) *SystemTask {
	t.Helper()
	task := &SystemTask{TaskID: taskID, Type: SystemTaskTypeIQTest, Status: status}
	require.NoError(t, DB.Create(task).Error)
	require.NoError(t, DB.Create(&IQBatch{TaskID: taskID, Snapshot: IQText(`{"prompt":"retained snapshot"}`)}).Error)
	for _, group := range groups {
		for _, name := range []string{"model-a", "model-b"} {
			a := IQAttempt{TaskID: taskID, PairID: IQPairID(group, name), Group: group, Model: name, Status: "success"}
			require.NoError(t, DB.Create(&a).Error)
			r := IQResult{ID: IQResultID(taskID, group, name), Group: group, Model: name, TaskID: taskID, RunSeq: task.ID, Status: "success", Artifact: IQText("<svg>" + taskID + "</svg>")}
			require.NoError(t, DB.Create(&r).Error)
		}
	}
	return task
}

func saveIQRetentionPlan(t *testing.T, group string, limit int) *IQConfig {
	t.Helper()
	cfg, err := GetIQGroupConfig(group)
	require.NoError(t, err)
	cfg.HistoryLimit = limit
	cfg.Targets = IQTargets{{Group: group, Models: []string{"model-a", "model-b"}}}
	saved, err := SaveIQConfig(*cfg, 1, time.Now())
	require.NoError(t, err)
	return saved
}

// Used against both SQLite and the live, schema-isolated PostgreSQL fixture.
func assertIQHistoryRetention(t *testing.T) {
	t.Helper()
	cfg := saveIQRetentionPlan(t, "retention-group", 30)
	active := seedIQRetentionRun(t, "retention-active", []string{cfg.Group}, SystemTaskStatusRunning)
	for i := 1; i <= 35; i++ {
		status := SystemTaskStatusSucceeded
		if i%2 == 0 {
			status = SystemTaskStatusFailed // Failed rounds consume the same budget.
		}
		seedIQRetentionRun(t, fmt.Sprintf("retention-run-%02d", i), []string{cfg.Group}, status)
	}
	require.NoError(t, PruneIQHistory())
	for _, value := range []any{&IQBatch{}, &SystemTask{}} {
		var count int64
		require.NoError(t, DB.Model(value).Where("task_id LIKE ?", "retention-%").Count(&count).Error)
		require.EqualValues(t, 31, count, "30 completed rounds plus the protected active round")
	}
	var results, attempts int64
	require.NoError(t, DB.Model(&IQResult{}).Where("group_name = ?", cfg.Group).Count(&results).Error)
	require.NoError(t, DB.Model(&IQAttempt{}).Where("group_name = ?", cfg.Group).Count(&attempts).Error)
	require.EqualValues(t, 62, results, "retain entire rounds, not only 30 model cards")
	require.Equal(t, results, attempts)
	_, err := GetIQResult(IQResultID("retention-run-01", cfg.Group, "model-a"))
	require.Error(t, err, "expired artifact bodies are actually removed")
	_, err = GetIQBatch("retention-run-01")
	require.Error(t, err, "expired prompt snapshots are actually removed")
	require.NoError(t, InterruptIQBatch("retention-run-01"), "late lease cleanup must not resurrect an expired round")
	require.ErrorIs(t, CompleteIQAttempt(IQResult{ID: IQPairID(cfg.Group, "model-a"), TaskID: "retention-run-01", Group: cfg.Group, Model: "model-a", Status: "success"}, "old-owner"), ErrSystemTaskLockLost)

	// Lowering retention applies in the same transaction as the saved setting.
	cfg.HistoryLimit = 2
	cfg, err = SaveIQConfig(*cfg, 1, time.Now())
	require.NoError(t, err)
	require.NoError(t, DB.Model(&IQResult{}).Where("group_name = ?", cfg.Group).Count(&results).Error)
	require.EqualValues(t, 6, results)
	// Even a terminal task is protected while its lease owner is still present.
	require.NoError(t, DB.Create(&SystemTaskLock{Type: SystemTaskTypeIQTest, TaskID: active.TaskID, LockedBy: "retention-owner", LockedUntil: common.GetTimestamp() + 60}).Error)
	require.NoError(t, DB.Model(active).Update("status", SystemTaskStatusFailed).Error)
	require.NoError(t, PruneIQHistory())
	_, err = GetIQBatch(active.TaskID)
	require.NoError(t, err)
	require.NoError(t, ReleaseSystemTaskLock(active.TaskID, "retention-owner"))
	require.NoError(t, PruneIQHistory())
	_, err = GetIQBatch(active.TaskID)
	require.Error(t, err)
	require.NoError(t, DB.Model(&IQResult{}).Where("group_name = ?", cfg.Group).Count(&results).Error)
	require.EqualValues(t, 4, results)
	kept, err := GetIQResult(IQResultID("retention-run-35", cfg.Group, "model-a"))
	require.NoError(t, err)
	require.Contains(t, string(kept.Artifact), "retention-run-35")
	require.NoError(t, PruneIQHistory(), "maintenance is idempotent")
}

func TestIQHistoryRetentionPhysicallyDeletesExpiredRuns(t *testing.T) {
	iqTestDB(t)
	assertIQHistoryRetention(t)
}

func TestIQHistoryRetentionPreservesSharedLegacyRuns(t *testing.T) {
	iqTestDB(t)
	first := saveIQRetentionPlan(t, "first", 1)
	second := saveIQRetentionPlan(t, "second", 2)
	seedIQRetentionRun(t, "shared-old", []string{"first", "second"}, SystemTaskStatusSucceeded)
	seedIQRetentionRun(t, "first-new", []string{"first"}, SystemTaskStatusSucceeded)
	require.NoError(t, PruneIQHistory())
	_, err := GetIQResult(IQResultID("shared-old", first.Group, "model-a"))
	require.Error(t, err)
	_, err = GetIQResult(IQResultID("shared-old", second.Group, "model-a"))
	require.NoError(t, err)
	_, err = GetIQBatch("shared-old")
	require.NoError(t, err, "another group's retained reference protects a shared snapshot")
	seedIQRetentionRun(t, "second-new-1", []string{"second"}, SystemTaskStatusSucceeded)
	seedIQRetentionRun(t, "second-new-2", []string{"second"}, SystemTaskStatusSucceeded)
	require.NoError(t, PruneIQHistory())
	_, err = GetIQBatch("shared-old")
	require.Error(t, err, "snapshot is deleted once no group retains the round")
	var count int64
	require.NoError(t, DB.Model(&SystemTask{}).Where("task_id = ?", "shared-old").Count(&count).Error)
	require.Zero(t, count)
	// A disabled/deleted plan still has a bounded history, not an unlimited leak.
	require.NoError(t, DeleteIQGroupConfig(second.Group, second.Version, time.Now()))
	seedIQRetentionRun(t, "second-after-delete", []string{"second"}, SystemTaskStatusSucceeded)
	require.NoError(t, PruneIQHistory())
	require.NoError(t, DB.Model(&IQResult{}).Where("group_name = ?", second.Group).Count(&count).Error)
	require.EqualValues(t, 4, count)
}

func assertIQRetentionCleanupRace(t *testing.T) {
	t.Helper()
	cfg := saveIQRetentionPlan(t, "retention-race", 1)
	seedIQRetentionRun(t, "retention-race-old", []string{cfg.Group}, SystemTaskStatusFailed)
	seedIQRetentionRun(t, "retention-race-new", []string{cfg.Group}, SystemTaskStatusSucceeded)
	require.NoError(t, DB.Model(&IQAttempt{}).Where("task_id = ?", "retention-race-old").Update("status", "running").Error)
	errors := make(chan error, 2)
	go func() { errors <- InterruptIQBatch("retention-race-old") }()
	go func() { errors <- PruneIQHistory() }()
	first, second := <-errors, <-errors
	require.NoError(t, first)
	require.NoError(t, second)
	var count int64
	require.NoError(t, DB.Model(&IQResult{}).Where("task_id = ?", "retention-race-old").Count(&count).Error)
	require.Zero(t, count, "racing delayed cleanup cannot resurrect an expired result")
	_, err := GetIQBatch("retention-race-old")
	require.Error(t, err)
	_, err = GetIQResult(IQResultID("retention-race-new", cfg.Group, "model-a"))
	require.NoError(t, err)
}

func TestIQHistoryRetentionCleanupRace(t *testing.T) {
	iqTestDB(t)
	assertIQRetentionCleanupRace(t)
}

func TestIQHistoryRetentionRollsBackConfigOnDeleteFailure(t *testing.T) {
	iqTestDB(t)
	cfg := saveIQRetentionPlan(t, "rollback", 30)
	seedIQRetentionRun(t, "rollback-1", []string{cfg.Group}, SystemTaskStatusSucceeded)
	seedIQRetentionRun(t, "rollback-2", []string{cfg.Group}, SystemTaskStatusSucceeded)
	require.NoError(t, DB.Exec(`CREATE TRIGGER retention_delete_failure BEFORE DELETE ON iq_results BEGIN SELECT RAISE(ABORT, 'fixture delete failure'); END`).Error)
	cfg.HistoryLimit = 1
	_, err := SaveIQConfig(*cfg, 1, time.Now())
	require.Error(t, err)
	reloaded, err := GetIQGroupConfig(cfg.Group)
	require.NoError(t, err)
	require.Equal(t, 30, reloaded.HistoryLimit)
	require.Equal(t, cfg.Version, reloaded.Version)
	var count int64
	require.NoError(t, DB.Model(&IQResult{}).Count(&count).Error)
	require.EqualValues(t, 4, count)
	_, err = GetIQBatch("rollback-1")
	require.NoError(t, err)
}

func TestIQHistoryRetentionBatchesLargeBacklogs(t *testing.T) {
	iqTestDB(t)
	cfg := saveIQRetentionPlan(t, "backlog", 1)
	var results []IQResult
	var attempts []IQAttempt
	var batches []IQBatch
	// Missing generic task history must not orphan the IQ-owned large bodies.
	for i := 1; i <= 405; i++ {
		taskID := fmt.Sprintf("backlog-%03d", i)
		results = append(results, IQResult{ID: taskID, Group: cfg.Group, Model: "m", TaskID: taskID, RunSeq: int64(i), Artifact: "<svg>old body</svg>"})
		attempts = append(attempts, IQAttempt{TaskID: taskID, PairID: IQPairID(cfg.Group, "m"), Group: cfg.Group, Model: "m", Status: "success"})
		batches = append(batches, IQBatch{TaskID: taskID, Snapshot: "old prompt snapshot"})
	}
	require.NoError(t, DB.CreateInBatches(&results, 50).Error)
	require.NoError(t, DB.CreateInBatches(&attempts, 50).Error)
	require.NoError(t, DB.CreateInBatches(&batches, 50).Error)
	require.NoError(t, PruneIQHistory())
	for _, value := range []any{&IQResult{}, &IQAttempt{}, &IQBatch{}} {
		var count int64
		require.NoError(t, DB.Model(value).Count(&count).Error)
		require.EqualValues(t, 1, count)
	}
	kept, err := GetIQResult("backlog-405")
	require.NoError(t, err)
	require.Equal(t, int64(405), kept.RunSeq)
}

func TestIQHistoryRetentionCompletionAndValidation(t *testing.T) {
	iqTestDB(t)
	cfg := saveIQRetentionPlan(t, "completion", 1)
	seedIQRetentionRun(t, "completion-old", []string{cfg.Group}, SystemTaskStatusSucceeded)
	task := seedIQRetentionRun(t, "completion-new", []string{cfg.Group}, SystemTaskStatusRunning)
	task.LockedBy = "retention-runner"
	require.NoError(t, DB.Model(task).Update("locked_by", task.LockedBy).Error)
	require.NoError(t, DB.Create(&SystemTaskLock{Type: SystemTaskTypeIQTest, TaskID: task.TaskID, LockedBy: task.LockedBy, LockedUntil: common.GetTimestamp() + 60}).Error)
	require.NoError(t, FinishSystemTask(task.TaskID, task.LockedBy, SystemTaskStatusSucceeded, nil, ""))
	_, err := GetIQResult(IQResultID("completion-old", cfg.Group, "model-a"))
	require.Error(t, err, "finishing a new round physically prunes the oldest immediately")
	for _, limit := range []int{0, 1, 30, 1000, -1, 1001} {
		c := defaultIQConfig()
		c.HistoryLimit = limit
		err := NormalizeIQConfig(&c)
		if limit < 0 || limit > IQMaxHistoryLimit {
			require.Error(t, err)
		} else {
			require.NoError(t, err)
			if limit == 0 {
				require.Equal(t, 30, c.HistoryLimit, "older payloads get the default")
			}
		}
	}
	var legacy IQConfig
	require.NoError(t, json.Unmarshal([]byte(`{"prompt":"old snapshot"}`), &legacy))
	require.Zero(t, legacy.HistoryLimit)
}
