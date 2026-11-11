package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestIQGroupOrderPersistenceAndIsolation(t *testing.T) {
	iqTestDB(t)
	now := time.Now()
	for _, group := range []string{"public", "private", "default"} {
		cfg, err := GetIQGroupConfig(group)
		require.NoError(t, err)
		cfg.Enabled = true
		cfg.Targets = IQTargets{{Group: group, Models: []string{"m"}}}
		_, err = SaveIQConfig(*cfg, 1, now)
		require.NoError(t, err)
	}
	before, err := ListIQConfigs()
	require.NoError(t, err)
	previous := []string{"public", "private", "default"}
	require.Equal(t, previous, []string{before[0].Group, before[1].Group, before[2].Group}, "new plans append")
	task, _, err := EnqueueIQGroup("public", false, now)
	require.NoError(t, err)
	snapshot, err := GetIQBatch(task.TaskID)
	require.NoError(t, err)
	before, err = ListIQConfigs()
	require.NoError(t, err)
	order := []string{"default", "public", "private"}
	require.NoError(t, SaveIQGroupOrder(order, previous))
	after, err := ListIQConfigs()
	require.NoError(t, err)
	require.Equal(t, order, []string{after[0].Group, after[1].Group, after[2].Group})
	for _, original := range before {
		reloaded, err := GetIQGroupConfig(original.Group)
		require.NoError(t, err)
		original.SortOrder = reloaded.SortOrder
		require.Equal(t, original, *reloaded, "ordering must not change versions, schedules, prompts or models")
	}
	stillSnapshot, err := GetIQBatch(task.TaskID)
	require.NoError(t, err)
	require.Equal(t, snapshot, stillSnapshot)
	var taskCount int64
	require.NoError(t, DB.Model(&SystemTask{}).Count(&taskCount).Error)
	require.EqualValues(t, 1, taskCount, "sorting must not enqueue model requests")
	require.ErrorIs(t, SaveIQGroupOrder(previous, previous), ErrIQConflict)
	for _, invalid := range []struct{ groups, previous []string }{
		{nil, nil},
		{[]string{"public"}, order},
		{[]string{"public", "public", "default"}, order},
		{[]string{"", "public", "private"}, order},
		{order, []string{"default", "public", "public"}},
		{[]string{"missing", "public", "private"}, order},
	} {
		require.ErrorIs(t, SaveIQGroupOrder(invalid.groups, invalid.previous), ErrIQInvalidOrder)
	}
	require.ErrorIs(t, SaveIQGroupOrder([]string{"public"}, []string{"public"}), ErrIQConflict, "a partial saved-plan list is stale")
	unchanged, err := ListIQConfigs()
	require.NoError(t, err)
	require.Equal(t, after, unchanged, "failed saves are atomic")
	// A regular editor (including older clients without sort_order) cannot reset it.
	edit := before[0]
	edit.SortOrder = 999
	edit.Prompt = "edited prompt"
	saved, err := SaveIQConfig(edit, 1, now)
	require.NoError(t, err)
	require.Equal(t, 2, saved.SortOrder)
	require.NoError(t, DeleteIQGroupConfig("default", before[2].Version, now))
	require.ErrorIs(t, SaveIQGroupOrder(previous, order), ErrIQConflict)
	recreated, err := GetIQGroupConfig("default")
	require.NoError(t, err)
	_, err = SaveIQConfig(*recreated, 1, now)
	require.NoError(t, err)
	configs, err := ListIQConfigs()
	require.NoError(t, err)
	require.Equal(t, []string{"public", "private", "default"}, []string{configs[0].Group, configs[1].Group, configs[2].Group}, "recreated plans append rather than reclaim an old position")
}

func TestIQLegacyGroupOrderIsDeterministic(t *testing.T) {
	iqTestDB(t)
	cfg, err := GetIQConfig()
	require.NoError(t, err)
	cfg.Targets = IQTargets{{Group: "public", Models: []string{"m"}}, {Group: "private", Models: []string{"m"}}}
	_, err = SaveIQConfig(*cfg, 1, time.Now())
	require.NoError(t, err)
	configs, err := ListIQConfigs()
	require.NoError(t, err)
	require.Equal(t, []string{"private", "public"}, []string{configs[0].Group, configs[1].Group})
	require.NoError(t, SaveIQGroupOrder([]string{"public", "private"}, []string{"private", "public"}))
	configs, err = ListIQConfigs()
	require.NoError(t, err)
	require.Equal(t, "public", configs[0].Group)
}

func TestIQPlansRequireSaveAndSupportVersionedDeletion(t *testing.T) {
	iqTestDB(t)
	now := time.Now()
	configs, err := ListIQConfigs()
	require.NoError(t, err)
	require.Empty(t, configs)
	unsaved, err := GetIQGroupConfig("public")
	require.NoError(t, err)
	require.Zero(t, unsaved.Version)
	configs, err = ListIQConfigs()
	require.NoError(t, err)
	require.Empty(t, configs, "reading a group never creates a plan")
	_, _, err = EnqueueIQGroup("public", false, now)
	require.Error(t, err, "unsaved plans cannot run")
	unsaved.Targets = IQTargets{{Group: "public", Models: []string{"running", "pending"}}}
	unsaved.Enabled = true
	saved, err := SaveIQConfig(*unsaved, 1, now)
	require.NoError(t, err)
	other, err := GetIQGroupConfig("private")
	require.NoError(t, err)
	other.Targets = IQTargets{{Group: "private", Models: []string{"m"}}}
	other, err = SaveIQConfig(*other, 1, now)
	require.NoError(t, err)
	task, _, err := EnqueueIQGroup("public", false, now)
	require.NoError(t, err)
	_, claimed, err := ClaimSystemTask(task.ID, SystemTaskTypeIQTest, "runner", common.GetTimestamp()+60)
	require.NoError(t, err)
	require.True(t, claimed)
	claimed, err = StartIQAttempt(task.TaskID, IQPairID("public", "running"), "runner", now.Unix())
	require.NoError(t, err)
	require.True(t, claimed)
	require.ErrorIs(t, DeleteIQGroupConfig("public", saved.Version+1, now), ErrIQConflict)
	require.NoError(t, DeleteIQGroupConfig("public", saved.Version, now))
	configs, err = ListIQConfigs()
	require.NoError(t, err)
	require.Len(t, configs, 1)
	require.Equal(t, "private", configs[0].Group)
	var tombstone IQConfig
	require.NoError(t, DB.First(&tombstone, saved.ID).Error)
	require.True(t, tombstone.Deleted)
	require.False(t, tombstone.Enabled)
	require.Zero(t, tombstone.NextRunAt)
	_, _, err = enqueueIQConfig(saved.ID, true, now.Add(48*time.Hour))
	require.ErrorIs(t, err, gorm.ErrRecordNotFound, "a stale scheduler cannot enqueue a deleted plan")
	claimed, err = StartIQAttempt(task.TaskID, IQPairID("public", "pending"), "runner", now.Unix())
	require.NoError(t, err)
	require.False(t, claimed, "deleted plans must not send unstarted requests")
	require.NoError(t, CompleteIQAttempt(IQResult{ID: IQPairID("public", "running"), TaskID: task.TaskID, Group: "public", Model: "running", Status: "success", Artifact: "<svg>kept</svg>", CompletedAt: now.Unix()}, "runner"))
	result, err := GetIQResult(IQResultID(task.TaskID, "public", "running"))
	require.NoError(t, err)
	require.Equal(t, IQText("<svg>kept</svg>"), result.Artifact)
	_, err = SaveIQConfig(*saved, 1, now)
	require.ErrorIs(t, err, ErrIQConflict, "stale editors cannot restore a deleted plan")
	recreated, err := GetIQGroupConfig("public")
	require.NoError(t, err)
	require.Zero(t, recreated.Version)
	recreated.Targets = unsaved.Targets
	recreated, err = SaveIQConfig(*recreated, 1, now)
	require.NoError(t, err)
	require.Greater(t, recreated.Version, saved.Version)
	require.ErrorIs(t, DeleteIQGroupConfig("public", saved.Version, now), ErrIQConflict)
	_, err = SaveIQConfig(*saved, 1, now)
	require.ErrorIs(t, err, ErrIQConflict)
	privateAfter, err := GetIQGroupConfig("private")
	require.NoError(t, err)
	require.Equal(t, other, privateAfter)
	configs, err = ListIQConfigs()
	require.NoError(t, err)
	require.Len(t, configs, 2)
}

func TestIQIndependentGroupsRandomSnapshotAndHistory(t *testing.T) {
	iqTestDB(t)
	now := time.Now()
	legacy, err := GetIQConfig()
	require.NoError(t, err)
	legacy.Prompt = " exact original prompt\n"
	legacy.Targets = IQTargets{{Group: "public", Models: []string{"m"}}, {Group: "private", Models: []string{"m"}}}
	_, err = SaveIQConfig(*legacy, 1, now)
	require.NoError(t, err)
	configs, err := ListIQConfigs()
	require.NoError(t, err)
	require.Len(t, configs, 2)
	configs, err = ListIQConfigs()
	require.NoError(t, err)
	require.Len(t, configs, 2, "migration is idempotent")
	public, err := GetIQGroupConfig("public")
	require.NoError(t, err)
	private, err := GetIQGroupConfig("private")
	require.NoError(t, err)
	require.NotEqual(t, public.ID, private.ID)
	public.Prompts = IQPrompts{"  scene one\n", "scene two"}
	public.Enabled, public.IntervalHours = true, 2
	public, err = SaveIQConfig(*public, 1, now)
	require.NoError(t, err)
	privateAfter, err := GetIQGroupConfig("private")
	require.NoError(t, err)
	require.Equal(t, private, privateAfter, "editing one task cannot change another")
	first, created, err := EnqueueIQGroup("public", false, now)
	require.NoError(t, err)
	require.True(t, created)
	other, created, err := EnqueueIQGroup("private", false, now)
	require.NoError(t, err)
	require.True(t, created)
	require.NotEqual(t, first.TaskID, other.TaskID)
	again, created, err := EnqueueIQGroup("public", false, now)
	require.NoError(t, err)
	require.False(t, created)
	require.Equal(t, first.TaskID, again.TaskID)
	snapshot, err := GetIQBatch(first.TaskID)
	require.NoError(t, err)
	require.Len(t, snapshot.Targets, 1)
	require.Equal(t, "public", snapshot.Targets[0].Group)
	require.Contains(t, []string(public.Prompts), string(snapshot.Prompt))
	public.Prompts = nil
	public, err = SaveIQConfig(*public, 1, now)
	require.NoError(t, err)
	sameSnapshot, err := GetIQBatch(first.TaskID)
	require.NoError(t, err)
	require.Equal(t, snapshot.Prompt, sameSnapshot.Prompt, "saving never changes an enqueued prompt")
	complete := func(task *SystemTask, status, artifact string) {
		t.Helper()
		_, claimed, err := ClaimSystemTask(task.ID, SystemTaskTypeIQTest, "runner", common.GetTimestamp()+60)
		require.NoError(t, err)
		require.True(t, claimed)
		pair := IQPairID("public", "m")
		started, err := StartIQAttempt(task.TaskID, pair, "runner", now.Unix())
		require.NoError(t, err)
		require.True(t, started)
		require.NoError(t, CompleteIQAttempt(IQResult{ID: pair, TaskID: task.TaskID, Group: "public", Model: "m", Status: status, Artifact: IQText(artifact), StartedAt: now.Unix(), CompletedAt: now.Unix()}, "runner"))
		require.NoError(t, FinishSystemTask(task.TaskID, "runner", SystemTaskStatusSucceeded, nil, ""))
	}
	complete(first, "success", "<svg>first</svg>")
	second, _, err := EnqueueIQGroup("public", false, now)
	require.NoError(t, err)
	secondSnapshot, err := GetIQBatch(second.TaskID)
	require.NoError(t, err)
	require.Equal(t, legacy.Prompt, secondSnapshot.Prompt, "an empty pool falls back to the saved/default prompt")
	complete(second, "error", "")
	rows, next, err := ListIQHistory([]string{"public"}, 0)
	require.NoError(t, err)
	require.Zero(t, next)
	require.Len(t, rows, 2)
	require.Equal(t, second.TaskID, rows[0].TaskID)
	require.Equal(t, first.TaskID, rows[1].TaskID)
	original, err := GetIQResult(rows[1].ID)
	require.NoError(t, err)
	require.Equal(t, IQText("<svg>first</svg>"), original.Artifact, "a later failure cannot replace a successful run")
	public.Targets = nil
	public.Enabled = false
	_, err = SaveIQConfig(*public, 1, now)
	require.NoError(t, err)
	_, err = GetIQResult(original.ID)
	require.NoError(t, err, "target edits never delete artwork history")
	invalid := *private
	invalid.Targets = IQTargets{{Group: "public", Models: []string{"m"}}}
	require.Error(t, NormalizeIQConfig(&invalid))
	invalid = *private
	invalid.Prompts = IQPrompts{" "}
	require.Error(t, NormalizeIQConfig(&invalid))
}
