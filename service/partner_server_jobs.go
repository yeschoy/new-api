package service

import (
	"context"
	"fmt"
	"sync"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/bytedance/gopkg/util/gopool"
)

const (
	PartnerServerJobSuspension    = "suspension"
	PartnerServerJobKeyRevocation = "key_revocation"

	partnerServerJobBatchSize = 500
)

// PartnerServerJobProgress is the state of a background job over one
// partner's sub-accounts.
type PartnerServerJobProgress struct {
	Running   bool   `json:"running"`
	Processed int    `json:"processed"`
	Error     string `json:"error,omitempty"`
}

type partnerServerJob struct {
	progress PartnerServerJobProgress
	rerun    bool
}

// Jobs and their progress live in this process. That holds for the current
// single-instance deployment; several instances would need a database lock.
var (
	partnerServerJobsMu sync.Mutex
	partnerServerJobs   = map[string]*partnerServerJob{}
)

// PartnerServerJobRunner starts a background job. Tests replace it to run
// jobs inline.
var PartnerServerJobRunner = func(task func()) { gopool.Go(task) }

func partnerServerJobKey(kind, clientID string) string {
	return kind + ":" + clientID
}

// GetPartnerServerJobProgress returns the latest progress of a partner's job.
func GetPartnerServerJobProgress(kind, clientID string) PartnerServerJobProgress {
	partnerServerJobsMu.Lock()
	defer partnerServerJobsMu.Unlock()
	if job, ok := partnerServerJobs[partnerServerJobKey(kind, clientID)]; ok {
		return job.progress
	}
	return PartnerServerJobProgress{}
}

// StartPartnerServerJob runs the job in the background. If the same job is
// already running it is restarted from the beginning once it finishes, so a
// suspend quickly followed by a resume always ends in the latest state.
func StartPartnerServerJob(kind, clientID string) {
	key := partnerServerJobKey(kind, clientID)
	partnerServerJobsMu.Lock()
	job, ok := partnerServerJobs[key]
	if ok && job.progress.Running {
		job.rerun = true
		partnerServerJobsMu.Unlock()
		return
	}
	job = &partnerServerJob{progress: PartnerServerJobProgress{Running: true}}
	partnerServerJobs[key] = job
	partnerServerJobsMu.Unlock()

	PartnerServerJobRunner(func() {
		defer func() {
			if recovered := recover(); recovered != nil {
				finishPartnerServerJob(key, job, fmt.Errorf("panic: %v", recovered))
			}
		}()
		for {
			err := runPartnerServerJob(kind, clientID, job)
			partnerServerJobsMu.Lock()
			again := job.rerun && err == nil
			job.rerun = false
			if again {
				job.progress.Processed = 0
			}
			partnerServerJobsMu.Unlock()
			if !again {
				finishPartnerServerJob(key, job, err)
				return
			}
		}
	})
}

func finishPartnerServerJob(key string, job *partnerServerJob, err error) {
	partnerServerJobsMu.Lock()
	job.progress.Running = false
	if err != nil {
		job.progress.Error = "the job stopped early; run it again"
	}
	partnerServerJobsMu.Unlock()
	if err != nil {
		logger.LogError(context.Background(), common.LogText("partner server job %s failed: %s", key, err.Error()))
	}
}

func runPartnerServerJob(kind, clientID string, job *partnerServerJob) error {
	var after int64
	for {
		var batch *model.PartnerAccountBatch
		var err error
		switch kind {
		case PartnerServerJobSuspension:
			batch, err = model.ReconcilePartnerAccountSuspensionBatch(clientID, after, partnerServerJobBatchSize)
		case PartnerServerJobKeyRevocation:
			batch, err = model.RevokePartnerAccountKeysBatch(clientID, after, partnerServerJobBatchSize)
		default:
			return fmt.Errorf("unknown partner server job %q", kind)
		}
		if batch != nil {
			// Publish what committed even when the batch stopped part-way.
			model.FinalizePartnerAccountUserStatusChanges(batch.ChangedUserIds)
			partnerServerJobsMu.Lock()
			job.progress.Processed += batch.Processed
			partnerServerJobsMu.Unlock()
			after = batch.LastId
		}
		if err != nil {
			return err
		}
		if batch.Done {
			return nil
		}
	}
}

var partnerServerRecoveryOnce sync.Once

// StartPartnerServerJobRecovery finishes suspension and resume jobs a restart
// interrupted. It runs once, on the master node.
func StartPartnerServerJobRecovery() {
	partnerServerRecoveryOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		clientIDs, err := model.ListPartnerServerClientsToReconcile()
		if err != nil {
			common.SysError(common.LogText("failed to list partners to reconcile: %s", err.Error()))
			return
		}
		for _, clientID := range clientIDs {
			StartPartnerServerJob(PartnerServerJobSuspension, clientID)
		}
	})
}
