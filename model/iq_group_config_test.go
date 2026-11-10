package model

import (
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

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
