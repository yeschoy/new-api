package controller

import (
	"errors"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
)

type iqCatalogGroup struct {
	Group  string   `json:"group"`
	Models []string `json:"models"`
}

// Query concrete enabled abilities directly: the default group's user-facing
// catalog intentionally hides default-only entries, but the admin selector must not.
func iqTargetCatalog() ([]iqCatalogGroup, error) {
	var abilities []model.Ability
	if err := model.DB.Table("abilities").Select("abilities.*").Joins("JOIN channels ON channels.id = abilities.channel_id").Where("abilities.enabled = ? AND channels.status = ?", true, common.ChannelStatusEnabled).Find(&abilities).Error; err != nil {
		return nil, err
	}
	channels := map[int]*model.Channel{}
	type eligibility struct {
		group, name string
		priority    int64
		compatible  bool
	}
	pairs := map[string]eligibility{}
	groups := map[string]map[string]bool{}
	for _, a := range abilities {
		if a.Group == "auto" || !ratio_setting.ContainsGroupRatio(a.Group) {
			continue
		}
		ch, ok := channels[a.ChannelId]
		if !ok {
			var err error
			ch, err = model.GetChannelById(a.ChannelId, true)
			if err != nil {
				return nil, err
			}
			channels[a.ChannelId] = ch
		}
		priority := int64(0)
		if a.Priority != nil {
			priority = *a.Priority
		}
		id := model.IQPairID(a.Group, a.Model)
		existing, seen := pairs[id]
		if seen && priority < existing.priority {
			continue
		}
		compatible := iqEndpoint(ch, a.Model) != ""
		if seen && priority == existing.priority {
			compatible = compatible && existing.compatible
		}
		pairs[id] = eligibility{group: a.Group, name: a.Model, priority: priority, compatible: compatible}
	}
	// retry=0 can choose any channel at the highest enabled priority. Every
	// possible choice must support this request; don't advertise a lower-priority
	// compatible route that IQ would reach only via forbidden failover.
	for _, pair := range pairs {
		if !pair.compatible {
			continue
		}
		if groups[pair.group] == nil {
			groups[pair.group] = map[string]bool{}
		}
		groups[pair.group][pair.name] = true
	}
	out := []iqCatalogGroup{}
	for group, names := range groups {
		models := []string{}
		for name := range names {
			models = append(models, name)
		}
		sort.Strings(models)
		out = append(out, iqCatalogGroup{group, models})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Group < out[j].Group })
	return out, nil
}
func validateIQTargets(c *model.IQConfig) error {
	if err := model.NormalizeIQConfig(c); err != nil {
		return err
	}
	catalog, err := iqTargetCatalog()
	if err != nil {
		return err
	}
	valid := map[string]bool{}
	for _, g := range catalog {
		for _, name := range g.Models {
			valid[model.IQPairID(g.Group, name)] = true
		}
	}
	for _, g := range c.Targets {
		for _, name := range g.Models {
			if !valid[model.IQPairID(g.Group, name)] {
				return errors.New("target is not an enabled compatible text-model/group pair")
			}
		}
	}
	return nil
}
func iqOK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": data})
}
func iqError(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{"success": false, "message": message, "data": nil})
}
func GetIQConfig(c *gin.Context) {
	if c.Query("list") == "true" {
		configs, err := model.ListIQConfigs()
		if err != nil {
			iqError(c, 500, "Unable to load IQ configuration")
			return
		}
		iqOK(c, gin.H{"tasks": configs, "default_prompt": model.IQDefaultPrompt})
		return
	}
	cfg, err := model.GetIQGroupConfig(c.Query("group"))
	if err != nil {
		iqError(c, 500, "Unable to load IQ configuration")
		return
	}
	iqOK(c, cfg)
}
func PutIQConfig(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 8<<20)
	var cfg model.IQConfig
	if err := c.ShouldBindJSON(&cfg); err != nil {
		iqError(c, 400, "Invalid IQ configuration JSON")
		return
	}
	if cfg.Group == "" {
		iqError(c, 400, "Each IQ task requires one group")
		return
	}
	if _, err := model.ListIQConfigs(); err != nil {
		iqError(c, 500, "Unable to load IQ configuration")
		return
	}
	if err := validateIQTargets(&cfg); err != nil {
		iqError(c, 400, err.Error())
		return
	}
	saved, err := model.SaveIQConfig(cfg, c.GetInt("id"), time.Now())
	if errors.Is(err, model.ErrIQConflict) {
		iqError(c, 409, err.Error())
		return
	}
	if err != nil {
		iqError(c, 500, "Unable to save IQ configuration")
		return
	}
	iqOK(c, saved)
}
func GetIQTargets(c *gin.Context) {
	targets, err := iqTargetCatalog()
	if err != nil {
		iqError(c, 500, "Unable to load IQ targets")
		return
	}
	iqOK(c, targets)
}
func RunIQTests(c *gin.Context) {
	group := c.Query("group")
	if group == "" {
		iqError(c, 400, "Select one IQ task group")
		return
	}
	cfg, err := model.GetIQGroupConfig(group)
	if err != nil {
		iqError(c, 500, "Unable to load IQ configuration")
		return
	}
	if err := validateIQTargets(cfg); err != nil {
		iqError(c, 400, "Configured targets are no longer available; update the configuration")
		return
	}
	task, created, err := model.EnqueueIQGroup(group, false, time.Now())
	if err != nil {
		iqError(c, 409, "Unable to enqueue IQ run; select targets or reload configuration")
		return
	}
	iqOK(c, gin.H{"task_id": task.TaskID, "status": task.Status, "created": created})
}
func iqVisibleGroups(c *gin.Context) (map[string]bool, error) {
	configs, err := model.ListIQConfigs()
	if err != nil {
		return nil, err
	}
	visible := map[string]bool{}
	admin := c.GetInt("role") >= common.RoleAdminUser
	userGroup := ""
	if !admin {
		userGroup, err = model.GetUserGroup(c.GetInt("id"), false)
		if err != nil {
			return nil, err
		}
	}
	for _, cfg := range configs {
		if admin || service.IsUserSelectableGroup(userGroup, cfg.Group) {
			visible[cfg.Group] = true
		}
	}
	return visible, nil
}

type iqModelCard struct {
	Model    string           `json:"model"`
	Latest   *model.IQResult  `json:"latest"`
	Progress *model.IQAttempt `json:"progress"`
}
type iqGroupCards struct {
	Group           string        `json:"group"`
	TaskID          string        `json:"task_id"`
	CreatedAt       int64         `json:"created_at"`
	Models          []iqModelCard `json:"models"`
	ActiveRun       *iqActiveRun  `json:"active_run"`
	NextRunAt       int64         `json:"next_run_at"`
	ScheduleEnabled bool          `json:"schedule_enabled"`
}
type iqActiveRun struct {
	TaskID        string                 `json:"task_id"`
	Status        model.SystemTaskStatus `json:"status"`
	ConfigVersion int64                  `json:"config_version"`
	CreatedAt     int64                  `json:"created_at"`
	Total         int                    `json:"total"`
	Completed     int                    `json:"completed"`
	Running       int                    `json:"running"`
	Pending       int                    `json:"pending"`
}

func GetIQResults(c *gin.Context) {
	configs, err := model.ListIQConfigs()
	if err != nil {
		iqError(c, 500, "Unable to load IQ results")
		return
	}
	visible, err := iqVisibleGroups(c)
	if err != nil {
		iqError(c, 500, "Unable to resolve group access")
		return
	}
	allowedGroups := []string{}
	for group := range visible {
		allowedGroups = append(allowedGroups, group)
	}
	before, _ := strconv.ParseInt(c.Query("before"), 10, 64)
	rows, nextCursor, err := model.ListIQHistory(allowedGroups, before)
	if err != nil {
		iqError(c, 500, "Unable to load IQ results")
		return
	}
	activeTasks, err := model.ListActiveIQTasks()
	if err != nil {
		iqError(c, 500, "Unable to load IQ progress")
		return
	}
	var active *iqActiveRun
	groupRuns := map[string]*iqActiveRun{}
	progress := map[string]*model.IQAttempt{}
	rowOrder := map[string]int64{}
	current := map[string]bool{}
	for _, cfg := range configs {
		for _, target := range cfg.Targets {
			for _, name := range target.Models {
				current[model.IQPairID(target.Group, name)] = true
			}
		}
	}
	for _, activeTask := range activeTasks {
		if before > 0 {
			continue // Active runs belong only to the newest page.
		}
		attempts, err := model.GetIQAttempts(activeTask.TaskID)
		if err != nil {
			iqError(c, 500, "Unable to load IQ progress")
			return
		}
		snapshot, err := model.GetIQBatch(activeTask.TaskID)
		if err != nil {
			iqError(c, 500, "Unable to load IQ progress")
			return
		}
		for i := range attempts {
			a := &attempts[i]
			if !visible[a.Group] || !current[a.PairID] {
				continue
			}
			progress[a.PairID] = a
			rowOrder[activeTask.TaskID] = activeTask.ID
			run := groupRuns[a.Group]
			if run == nil || run.TaskID != activeTask.TaskID {
				run = &iqActiveRun{TaskID: activeTask.TaskID, Status: activeTask.Status, ConfigVersion: snapshot.Version, CreatedAt: activeTask.CreatedAt}
				groupRuns[a.Group] = run
			}
			if active == nil {
				active = run // Legacy summary; each group owns its authoritative status.
			}
			run.Total++
			switch a.Status {
			case "pending":
				run.Pending++
			case "running":
				run.Running++
			default:
				run.Completed++
			}
		}
	}
	groups := []iqGroupCards{}
	indices := map[string]int{}
	ensureRow := func(group, taskID string, createdAt int64) *iqGroupCards {
		key := taskID + "\x00" + group
		if index, ok := indices[key]; ok {
			return &groups[index]
		}
		indices[key] = len(groups)
		groups = append(groups, iqGroupCards{Group: group, TaskID: taskID, CreatedAt: createdAt, Models: []iqModelCard{}})
		return &groups[len(groups)-1]
	}
	for i := range rows {
		r := &rows[i]
		rowOrder[r.TaskID] = r.RunSeq
		g := ensureRow(r.Group, r.TaskID, r.StartedAt)
		g.Models = append(g.Models, iqModelCard{Model: r.Model, Latest: r})
	}
	nextRunAt := int64(0)
	scheduleEnabled := false
	for _, cfg := range configs {
		if !visible[cfg.Group] {
			continue
		}
		run := groupRuns[cfg.Group]
		if before == 0 && run != nil {
			g := ensureRow(cfg.Group, run.TaskID, run.CreatedAt)
			g.ActiveRun = run
			for _, target := range cfg.Targets {
				for _, name := range target.Models {
					a := progress[model.IQPairID(cfg.Group, name)]
					if a == nil || a.TaskID != run.TaskID {
						continue
					}
					found := false
					for i := range g.Models {
						if g.Models[i].Model == name {
							g.Models[i].Progress = a
							found = true
						}
					}
					if !found {
						g.Models = append(g.Models, iqModelCard{Model: name, Progress: a})
					}
				}
			}
		}
		hasRow := false
		for i := range groups {
			if groups[i].Group == cfg.Group {
				groups[i].ScheduleEnabled = cfg.Enabled
				groups[i].NextRunAt = cfg.NextRunAt
				hasRow = true
			}
		}
		if !hasRow && before == 0 {
			g := ensureRow(cfg.Group, "", 0)
			g.ScheduleEnabled, g.NextRunAt = cfg.Enabled, cfg.NextRunAt
			for _, target := range cfg.Targets {
				for _, name := range target.Models {
					g.Models = append(g.Models, iqModelCard{Model: name})
				}
			}
		}
		scheduleEnabled = scheduleEnabled || cfg.Enabled
		if cfg.NextRunAt > 0 && (nextRunAt == 0 || cfg.NextRunAt < nextRunAt) {
			nextRunAt = cfg.NextRunAt
		}
	}
	sort.SliceStable(groups, func(i, j int) bool {
		if rowOrder[groups[i].TaskID] != rowOrder[groups[j].TaskID] {
			return rowOrder[groups[i].TaskID] > rowOrder[groups[j].TaskID]
		}
		return groups[i].Group < groups[j].Group
	})
	iqOK(c, gin.H{"groups": groups, "active_run": active, "next_cursor": nextCursor, "next_run_at": nextRunAt, "schedule_enabled": scheduleEnabled, "timezone": "Asia/Shanghai"})
}
func GetIQArtifact(c *gin.Context) {
	visible, err := iqVisibleGroups(c)
	if err != nil {
		iqError(c, 500, "Unable to resolve group access")
		return
	}
	metadata, err := model.GetIQResultMetadata(c.Param("id"))
	if err != nil || !visible[metadata.Group] || metadata.Status != "success" {
		iqError(c, 404, "IQ artifact not found")
		return
	}
	r, err := model.GetIQResult(metadata.ID)
	if err != nil || r.Status != "success" {
		iqError(c, 404, "IQ artifact not found")
		return
	}
	visible, err = iqVisibleGroups(c)
	if err != nil || !visible[r.Group] {
		iqError(c, 404, "IQ artifact not found")
		return
	}
	iqOK(c, gin.H{"id": r.ID, "group": r.Group, "model": r.Model, "task_id": r.TaskID, "config_version": r.ConfigVersion, "completed_at": r.CompletedAt, "artifact_kind": r.ArtifactKind, "artifact": string(r.Artifact)})
}
