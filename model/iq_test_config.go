package model

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/rand/v2"
	"sort"
	"strconv"
	"strings"
	"time"
	_ "time/tzdata"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relaykit/relayconvert/reasoning"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/schema"
)

const (
	SystemTaskTypeIQTest = "group_iq_test"
	IQMaxPairs           = 100
	IQMaxPromptBytes     = 64 << 10
	IQMaxPrompts         = 100
	IQMaxPromptPoolBytes = 1 << 20
	IQMaxResponseBytes   = 2 << 20
	IQMaxArtifactBytes   = 1 << 20
	IQOutputTokens       = 16384
	IQDefaultPrompt      = "画一个鹈鹕骑单车的HTML，我要的是最高水准的完成品，不要草稿，黄昏氛围，角色有表情和配饰，场景有远近层次，动作自然，带一个小彩蛋，你先想好整体的设计再动手，不用测试，直接发我文件"
)

var ErrIQConflict = errors.New("IQ configuration changed; reload and try again")

// IQText keeps >64 KiB payloads portable (MySQL TEXT is too small).
type IQText string

func (IQText) GormDataType() string { return "string" }
func (IQText) GormDBDataType(db *gorm.DB, _ *schema.Field) string {
	if db.Dialector.Name() == "mysql" {
		return "mediumtext"
	}
	return "text"
}

type IQTarget struct {
	Group  string   `json:"group"`
	Models []string `json:"models"`
}

// IQTargets preserves JSON serialization while selecting a portable large-text
// column. A large size tag would become an invalid varchar(N) on PostgreSQL.
type IQTargets []IQTarget

func (IQTargets) GormDBDataType(db *gorm.DB, field *schema.Field) string {
	return IQText("").GormDBDataType(db, field)
}

type IQPrompts []string

func (IQPrompts) GormDBDataType(db *gorm.DB, field *schema.Field) string {
	return IQText("").GormDBDataType(db, field)
}

type IQConfig struct {
	ID              int       `json:"id" gorm:"primaryKey;autoIncrement:false"`
	Group           string    `json:"group" gorm:"column:group_name;type:varchar(64);not null;default:'';uniqueIndex"`
	Prompts         IQPrompts `json:"prompts" gorm:"serializer:json"`
	Version         int64     `json:"version"`
	Prompt          IQText    `json:"prompt"`
	ReasoningEffort string    `json:"reasoning_effort" gorm:"type:varchar(16);not null;default:''"`
	Targets         IQTargets `json:"targets" gorm:"serializer:json"`
	Enabled         bool      `json:"enabled"`
	ScheduleMode    string    `json:"schedule_mode"`
	IntervalHours   int       `json:"interval_hours"`
	DailyTime       string    `json:"daily_time"`
	Timezone        string    `json:"timezone"`
	NextRunAt       int64     `json:"next_run_at"`
	UpdatedAt       int64     `json:"updated_at"`
	UpdatedBy       int       `json:"updated_by"`
	DispatchSeq     int64     `json:"-"`
}

// No artwork or prompt snapshot belongs in SystemTask's publicly listed bodies.
type IQBatch struct {
	TaskID   string `gorm:"type:varchar(64);primaryKey"`
	Snapshot IQText
}
type IQAttempt struct {
	TaskID      string `json:"-" gorm:"type:varchar(64);primaryKey"`
	PairID      string `json:"id" gorm:"type:varchar(64);primaryKey"`
	Group       string `json:"group" gorm:"column:group_name;type:varchar(64)"`
	Model       string `json:"model" gorm:"type:varchar(255)"`
	Status      string `json:"status" gorm:"type:varchar(32)"`
	StartedAt   int64  `json:"started_at"`
	CompletedAt int64  `json:"completed_at"`
}
type IQResult struct {
	ID            string `json:"id" gorm:"type:varchar(64);primaryKey"`
	Group         string `json:"group" gorm:"column:group_name;type:varchar(64);index:idx_iq_history_group_run,priority:1"`
	Model         string `json:"model" gorm:"type:varchar(255)"`
	TaskID        string `json:"task_id" gorm:"type:varchar(64)"`
	RunSeq        int64  `json:"-" gorm:"index:idx_iq_history_group_run,priority:2"`
	ConfigVersion int64  `json:"config_version"`
	Status        string `json:"status" gorm:"type:varchar(32)"`
	StartedAt     int64  `json:"started_at"`
	CompletedAt   int64  `json:"completed_at"`
	DurationMS    int64  `json:"duration_ms"`
	ArtifactKind  string `json:"artifact_kind"`
	Artifact      IQText `json:"-"`
	ErrorCode     string `json:"error_code"`
	ErrorMessage  string `json:"error_message"`
}

func IQPairID(group, name string) string {
	sum := sha256.Sum256([]byte(group + "\x00" + name))
	return hex.EncodeToString(sum[:])
}
func defaultIQConfig() IQConfig {
	return IQConfig{ID: 1, Version: 1, Prompt: IQDefaultPrompt, Targets: []IQTarget{}, ScheduleMode: "interval", IntervalHours: 24, DailyTime: "09:00", Timezone: "Asia/Shanghai"}
}
func GetIQConfig() (*IQConfig, error) {
	initial := defaultIQConfig()
	if err := DB.Clauses(clause.OnConflict{DoNothing: true}).Create(&initial).Error; err != nil {
		return nil, err
	}
	var cfg IQConfig
	err := DB.First(&cfg, 1).Error
	return &cfg, err
}

// NormalizeIQConfig preserves the exact administrator prompt, including whitespace.
func NormalizeIQConfig(c *IQConfig) error {
	effort, err := reasoning.ParseEffort(c.ReasoningEffort)
	if err != nil {
		return err
	}
	c.ReasoningEffort = string(effort)
	if strings.TrimSpace(string(c.Prompt)) == "" {
		c.Prompt = IQDefaultPrompt
	}
	if !utf8.ValidString(string(c.Prompt)) || len(c.Prompt) > IQMaxPromptBytes {
		return errors.New("prompt must contain 1–65536 UTF-8 bytes")
	}
	if len(c.Prompts) > IQMaxPrompts {
		return errors.New("at most 100 prompts are allowed")
	}
	totalBytes := 0
	for _, prompt := range c.Prompts {
		if !utf8.ValidString(prompt) || strings.TrimSpace(prompt) == "" || len(prompt) > IQMaxPromptBytes {
			return errors.New("each prompt must contain 1–65536 UTF-8 bytes")
		}
		totalBytes += len(prompt)
	}
	if totalBytes > IQMaxPromptPoolBytes {
		return errors.New("prompt pool must not exceed 1 MiB")
	}
	if c.Group != "" && (strings.TrimSpace(c.Group) != c.Group || c.Group == "auto" || len(c.Group) > 64 || strings.ContainsRune(c.Group, 0)) {
		return errors.New("invalid task group")
	}
	if c.Timezone != "Asia/Shanghai" {
		return errors.New("timezone must be Asia/Shanghai")
	}
	switch c.ScheduleMode {
	case "interval":
		if c.IntervalHours < 1 || c.IntervalHours > 8760 {
			return errors.New("interval_hours must be 1–8760")
		}
	case "daily":
		if _, err := time.Parse("15:04", c.DailyTime); err != nil || len(c.DailyTime) != 5 {
			return errors.New("daily_time must be HH:mm")
		}
	default:
		return errors.New("schedule_mode must be interval or daily")
	}
	groups := map[string]map[string]bool{}
	for _, target := range c.Targets {
		group := strings.TrimSpace(target.Group)
		if c.Group != "" && group != c.Group {
			return errors.New("each IQ task must contain exactly one group")
		}
		if group == "" || group == "auto" || len(group) > 64 || strings.ContainsRune(group, 0) {
			return errors.New("invalid concrete group")
		}
		if groups[group] == nil {
			groups[group] = map[string]bool{}
		}
		for _, name := range target.Models {
			name = strings.TrimSpace(name)
			if name == "" || len(name) > 255 || strings.ContainsRune(name, 0) {
				return errors.New("invalid model")
			}
			groups[group][name] = true
		}
	}
	c.Targets = []IQTarget{}
	count := 0
	for group, names := range groups {
		models := []string{}
		for name := range names {
			models = append(models, name)
		}
		sort.Strings(models)
		if len(models) > 0 {
			c.Targets = append(c.Targets, IQTarget{group, models})
			count += len(models)
		}
	}
	sort.Slice(c.Targets, func(i, j int) bool { return c.Targets[i].Group < c.Targets[j].Group })
	if count > IQMaxPairs {
		return fmt.Errorf("at most %d pairs are allowed", IQMaxPairs)
	}
	if c.Enabled && count == 0 {
		return errors.New("enabled schedule requires targets")
	}
	return nil
}

// NextIQRun is strictly future. Missed slots are skipped, never replayed.
func NextIQRun(c IQConfig, now time.Time, anchor int64) int64 {
	if !c.Enabled {
		return 0
	}
	if c.ScheduleMode == "interval" {
		step := int64(c.IntervalHours) * 3600
		if step <= 0 {
			return 0
		}
		if anchor > 0 {
			if anchor > now.Unix() {
				return anchor
			}
			return anchor + ((now.Unix()-anchor)/step+1)*step
		}
		return now.Unix() + step
	}
	zone, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		return 0
	}
	parts := strings.Split(c.DailyTime, ":")
	if len(parts) != 2 {
		return 0
	}
	h, e1 := strconv.Atoi(parts[0])
	m, e2 := strconv.Atoi(parts[1])
	if e1 != nil || e2 != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return 0
	}
	local := now.In(zone)
	next := time.Date(local.Year(), local.Month(), local.Day(), h, m, 0, 0, zone)
	if !next.After(now) {
		next = next.AddDate(0, 0, 1)
	}
	return next.Unix()
}
func SaveIQConfig(c IQConfig, userID int, now time.Time) (*IQConfig, error) {
	if err := NormalizeIQConfig(&c); err != nil {
		return nil, err
	}
	if c.Group == "" {
		c.ID = 1 // Legacy/template configuration; group tasks use separate rows.
	}
	c.UpdatedAt = now.Unix()
	c.UpdatedBy = userID
	c.NextRunAt = NextIQRun(c, now, 0)
	err := DB.Transaction(func(tx *gorm.DB) error {
		if c.Group != "" {
			if err := lockIQConfigs(tx); err != nil {
				return err
			}
			var existing IQConfig
			err := tx.Where("group_name = ?", c.Group).First(&existing).Error
			if errors.Is(err, gorm.ErrRecordNotFound) && c.Version == 0 {
				if err := nextIQConfigID(tx, &c); err != nil {
					return err
				}
				c.Version = 1
				if err := tx.Create(&c).Error; err != nil {
					return err
				}
				c.Version = 0 // Incremented after the transaction, like updates.
				return nil
			}
			if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
				return err
			}
			if err != nil || existing.Version != c.Version {
				return ErrIQConflict
			}
			c.ID = existing.ID
		}
		targets, _ := json.Marshal(c.Targets)
		prompts, _ := json.Marshal(c.Prompts)
		res := tx.Model(&IQConfig{}).Where("id = ? AND version = ?", c.ID, c.Version).Updates(map[string]any{"version": c.Version + 1, "prompt": c.Prompt, "prompts": string(prompts), "reasoning_effort": c.ReasoningEffort, "targets": string(targets), "enabled": c.Enabled, "schedule_mode": c.ScheduleMode, "interval_hours": c.IntervalHours, "daily_time": c.DailyTime, "timezone": c.Timezone, "next_run_at": c.NextRunAt, "updated_at": c.UpdatedAt, "updated_by": userID})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected != 1 {
			return ErrIQConflict
		}
		return nil // Configuration changes never delete previously generated artwork.
	})
	c.Version++
	return &c, err
}
func iqTargetIDs(c IQConfig) []string {
	ids := []string{}
	for _, t := range c.Targets {
		for _, n := range t.Models {
			ids = append(ids, IQPairID(t.Group, n))
		}
	}
	return ids
}

// EnqueueIQBatch atomically advances a due slot and snapshots the configuration.
// Legacy entry point for the pre-upgrade singleton; new runs use EnqueueIQGroup.
// Updating DispatchSeq serializes manual/scheduled enqueue with config edits.
func EnqueueIQBatch(scheduled bool, now time.Time) (*SystemTask, bool, error) {
	if _, err := GetIQConfig(); err != nil {
		return nil, false, err
	}
	return enqueueIQConfig(1, scheduled, now)
}

func EnqueueIQGroup(group string, scheduled bool, now time.Time) (*SystemTask, bool, error) {
	cfg, err := GetIQGroupConfig(group)
	if err != nil {
		return nil, false, err
	}
	if cfg.ID == 0 {
		return nil, false, errors.New("save the group task before running")
	}
	return enqueueIQConfig(cfg.ID, scheduled, now)
}

func enqueueIQConfig(configID int, scheduled bool, now time.Time) (*SystemTask, bool, error) {
	var task *SystemTask
	created := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		var c IQConfig
		if err := tx.First(&c, configID).Error; err != nil {
			return err
		}
		if err := NormalizeIQConfig(&c); err != nil {
			return err
		}
		if scheduled && (!c.Enabled || c.NextRunAt == 0 || c.NextRunAt > now.Unix()) {
			return nil
		}
		q := tx.Model(&IQConfig{}).Where("id = ? AND version = ?", c.ID, c.Version)
		if scheduled {
			q = q.Where("enabled = ? AND next_run_at = ?", true, c.NextRunAt)
		}
		updates := map[string]any{"dispatch_seq": gorm.Expr("dispatch_seq + 1")}
		if scheduled {
			updates["next_run_at"] = NextIQRun(c, now, c.NextRunAt)
		}
		res := q.Updates(updates)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected != 1 {
			return ErrIQConflict
		}
		activeKey := iqActiveKey(c.Group)
		active, err := activeIQGroupTask(tx, c.Group)
		if err != nil {
			return err
		}
		if active != nil {
			task = active
			return nil
		}
		if len(iqTargetIDs(c)) == 0 {
			return errors.New("select at least one target")
		}
		id, err := GenerateSystemTaskID()
		if err != nil {
			return err
		}
		kind := SystemTaskTypeIQTest
		task = &SystemTask{TaskID: id, Type: kind, Status: SystemTaskStatusPending, ActiveKey: &activeKey, Payload: fmt.Sprintf(`{"config_version":%d}`, c.Version)}
		if err := tx.Create(task).Error; err != nil {
			return err
		}
		// Draw once per group run, before persisting the immutable snapshot.
		// All models compare the same prompt; recovery never redraws it.
		if len(c.Prompts) > 0 {
			c.Prompt = IQText(c.Prompts[rand.IntN(len(c.Prompts))])
		}
		c.Prompts = nil
		snapshot, err := json.Marshal(c)
		if err != nil {
			return err
		}
		if err := tx.Create(&IQBatch{TaskID: id, Snapshot: IQText(snapshot)}).Error; err != nil {
			return err
		}
		attempts := []IQAttempt{}
		for _, t := range c.Targets {
			for _, name := range t.Models {
				attempts = append(attempts, IQAttempt{TaskID: id, PairID: IQPairID(t.Group, name), Group: t.Group, Model: name, Status: "pending"})
			}
		}
		if err := tx.Create(&attempts).Error; err != nil {
			return err
		}
		created = true
		return nil
	})
	if err != nil {
		var cfg IQConfig
		if e := DB.First(&cfg, configID).Error; e == nil {
			if active, e := GetActiveIQGroupTask(cfg.Group); e == nil && active != nil {
				return active, false, nil
			}
		}
	}
	return task, created, err
}
func GetIQBatch(taskID string) (*IQConfig, error) {
	var b IQBatch
	if err := DB.First(&b, "task_id = ?", taskID).Error; err != nil {
		return nil, err
	}
	var c IQConfig
	err := json.Unmarshal([]byte(b.Snapshot), &c)
	return &c, err
}
func GetIQAttempts(taskID string) ([]IQAttempt, error) {
	a := []IQAttempt{}
	err := DB.Where("task_id = ?", taskID).Order("group_name, model").Find(&a).Error
	return a, err
}
func iqLease(tx *gorm.DB, taskID, runner string) error {
	var n int64
	err := tx.Model(&SystemTask{}).Where("task_id = ? AND status = ? AND locked_by = ?", taskID, SystemTaskStatusRunning, runner).Where("EXISTS (SELECT 1 FROM system_task_locks WHERE system_task_locks.task_id = system_tasks.task_id AND system_task_locks.locked_by = ? AND locked_until >= ?)", runner, common.GetTimestamp()).Count(&n).Error
	if err != nil {
		return err
	}
	if n != 1 {
		return ErrSystemTaskLockLost
	}
	return nil
}
func StartIQAttempt(taskID, pairID, runner string, now int64) (bool, error) {
	started := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		if err := iqLease(tx, taskID, runner); err != nil {
			return err
		}
		res := tx.Model(&IQAttempt{}).Where("task_id = ? AND pair_id = ? AND status = ?", taskID, pairID, "pending").Updates(map[string]any{"status": "running", "started_at": now})
		started = res.RowsAffected == 1
		return res.Error
	})
	return started, err
}
func CompleteIQAttempt(r IQResult, runner string) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		if err := iqLease(tx, r.TaskID, runner); err != nil {
			return err
		}
		res := tx.Model(&IQAttempt{}).Where("task_id = ? AND pair_id = ? AND status = ?", r.TaskID, r.ID, "running").Updates(map[string]any{"status": r.Status, "completed_at": r.CompletedAt})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected != 1 {
			return errors.New("IQ attempt is already terminal")
		}
		var task SystemTask
		if err := tx.Select("id").Where("task_id = ?", r.TaskID).First(&task).Error; err != nil {
			return err
		}
		r.RunSeq = task.ID
		return storeIQHistory(tx, r)
	})
}

// Expired work is terminal, including unsent pending pairs. Never replay a batch.
func InterruptIQBatch(taskID string) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		var b IQBatch
		if err := tx.First(&b, "task_id = ?", taskID).Error; err != nil {
			return err
		}
		var snapshot IQConfig
		if err := json.Unmarshal([]byte(b.Snapshot), &snapshot); err != nil {
			return err
		}
		var attempts []IQAttempt
		if err := tx.Where("task_id = ? AND status IN ?", taskID, []string{"pending", "running"}).Find(&attempts).Error; err != nil {
			return err
		}
		for _, a := range attempts {
			var task SystemTask
			if err := tx.Select("id").Where("task_id = ?", taskID).First(&task).Error; err != nil {
				return err
			}
			now := common.GetTimestamp()
			res := tx.Model(&IQAttempt{}).Where("task_id = ? AND pair_id = ? AND status IN ?", taskID, a.PairID, []string{"pending", "running"}).Updates(map[string]any{"status": "interrupted", "completed_at": now})
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected > 0 {
				r := IQResult{ID: a.PairID, Group: a.Group, Model: a.Model, TaskID: taskID, RunSeq: task.ID, ConfigVersion: snapshot.Version, Status: "interrupted", StartedAt: a.StartedAt, CompletedAt: now, ErrorCode: "interrupted", ErrorMessage: "Execution interrupted; not retried"}
				if err := storeIQHistory(tx, r); err != nil {
					return err
				}
			}
		}
		return nil
	})
}
func GetIQResultMetadata(id string) (*IQResult, error) {
	var r IQResult
	err := DB.Omit("artifact").First(&r, "id = ?", id).Error
	return &r, err
}

func GetIQResult(id string) (*IQResult, error) {
	var r IQResult
	err := DB.First(&r, "id = ?", id).Error
	return &r, err
}

// A result belongs to a run, not just a group/model pair. Never overwrite
// another run, including when a late lease-expiry cleanup arrives out of order.
func storeIQHistory(tx *gorm.DB, r IQResult) error {
	r.ID = IQResultID(r.TaskID, r.Group, r.Model)
	return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&r).Error
}

func IQResultID(taskID, group, name string) string {
	sum := sha256.Sum256([]byte(taskID + "\x00" + group + "\x00" + name))
	return hex.EncodeToString(sum[:])
}

// Pages are bounded by runs rather than model count, so one gallery row is
// never split across pages. Legacy pair-keyed rows are retained without rewrite.
func ListIQHistory(groups []string, before int64) ([]IQResult, int64, error) {
	rows := []IQResult{}
	if len(groups) == 0 {
		return rows, 0, nil
	}
	query := DB.Model(&IQResult{}).Where("group_name IN ?", groups)
	if before > 0 {
		query = query.Where("run_seq < ?", before)
	}
	var runs []int64
	if err := query.Distinct("run_seq").Order("run_seq DESC").Limit(21).Pluck("run_seq", &runs).Error; err != nil {
		return nil, 0, err
	}
	next := int64(0)
	if len(runs) > 20 {
		runs = runs[:20]
		next = runs[len(runs)-1]
	}
	if len(runs) == 0 {
		return rows, 0, nil
	}
	err := DB.Omit("artifact").Where("group_name IN ? AND run_seq IN ?", groups, runs).Order("run_seq DESC, group_name, model").Find(&rows).Error
	return rows, next, err
}
