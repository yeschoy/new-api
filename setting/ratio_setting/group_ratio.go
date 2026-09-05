package ratio_setting

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/types"
)

var defaultGroupRatio = map[string]float64{
	"default": 1,
	"vip":     1,
	"svip":    1,
}

var groupRatioMap = types.NewRWMap[string, float64]()

var defaultGroupGroupRatio = map[string]map[string]float64{
	"vip": {
		"edit_this": 0.9,
	},
}

var groupGroupRatioMap = types.NewRWMap[string, map[string]float64]()

// modelGroupRatioMap stores the effective billing ratio for a model within a
// customer group. Keeping this separate from channel groups lets routing move
// between providers without changing the price promised to the customer.
var modelGroupRatioMap = types.NewRWMap[string, map[string]float64]()

var defaultGroupSpecialUsableGroup = map[string]map[string]string{}

type GroupRatioSetting struct {
	GroupRatio              *types.RWMap[string, float64]            `json:"group_ratio"`
	GroupGroupRatio         *types.RWMap[string, map[string]float64] `json:"group_group_ratio"`
	GroupSpecialUsableGroup *types.RWMap[string, map[string]string]  `json:"group_special_usable_group"`
	ModelGroupRatio         *types.RWMap[string, map[string]float64] `json:"model_group_ratio"`
}

var groupRatioSetting GroupRatioSetting

func init() {
	groupSpecialUsableGroup := types.NewRWMap[string, map[string]string]()
	groupSpecialUsableGroup.AddAll(defaultGroupSpecialUsableGroup)

	groupRatioMap.AddAll(defaultGroupRatio)
	groupGroupRatioMap.AddAll(defaultGroupGroupRatio)

	groupRatioSetting = GroupRatioSetting{
		GroupSpecialUsableGroup: groupSpecialUsableGroup,
		GroupRatio:              groupRatioMap,
		GroupGroupRatio:         groupGroupRatioMap,
		ModelGroupRatio:         modelGroupRatioMap,
	}

	config.GlobalConfig.Register("group_ratio_setting", &groupRatioSetting)
}

func GetGroupRatioSetting() *GroupRatioSetting {
	if groupRatioSetting.GroupSpecialUsableGroup == nil {
		groupRatioSetting.GroupSpecialUsableGroup = types.NewRWMap[string, map[string]string]()
		groupRatioSetting.GroupSpecialUsableGroup.AddAll(defaultGroupSpecialUsableGroup)
	}
	if groupRatioSetting.ModelGroupRatio == nil {
		groupRatioSetting.ModelGroupRatio = types.NewRWMap[string, map[string]float64]()
	}
	return &groupRatioSetting
}

// ResolveModelGroupRatio returns a model-specific customer price when one is
// configured. The customer's own group takes precedence over an internal
// routing group, so switching providers or Auto groups cannot change billing.
func ResolveModelGroupRatio(userGroup, usingGroup, modelName string, baseRatio float64) float64 {
	settings := GetGroupRatioSetting()
	if ratio, ok := getValidModelGroupRatio(settings, userGroup, modelName); ok {
		return ratio
	}
	if usingGroup != userGroup {
		if ratio, ok := getValidModelGroupRatio(settings, usingGroup, modelName); ok {
			return ratio
		}
	}
	return baseRatio
}

func getValidModelGroupRatio(settings *GroupRatioSetting, group, modelName string) (float64, bool) {
	ratios, ok := settings.ModelGroupRatio.Get(group)
	if !ok {
		return 0, false
	}
	ratio, ok := ratios[modelName]
	if !ok || ratio < 0 || math.IsNaN(ratio) || math.IsInf(ratio, 0) {
		return 0, false
	}
	return ratio, true
}

func CheckModelGroupRatio(jsonStr string) error {
	values := make(map[string]map[string]float64)
	if err := common.Unmarshal([]byte(jsonStr), &values); err != nil {
		return err
	}
	for group, ratios := range values {
		for modelName, ratio := range ratios {
			if ratio < 0 || math.IsNaN(ratio) || math.IsInf(ratio, 0) {
				return fmt.Errorf("model group ratio must be finite and not less than 0: %s/%s", group, modelName)
			}
		}
	}
	return nil
}

func GetGroupRatioCopy() map[string]float64 {
	return groupRatioMap.ReadAll()
}

func ContainsGroupRatio(name string) bool {
	_, ok := groupRatioMap.Get(name)
	return ok
}

func GroupRatio2JSONString() string {
	return groupRatioMap.MarshalJSONString()
}

func UpdateGroupRatioByJSONString(jsonStr string) error {
	return types.LoadFromJsonString(groupRatioMap, jsonStr)
}

func GetGroupRatio(name string) float64 {
	ratio, ok := groupRatioMap.Get(name)
	if !ok {
		common.SysLog("group ratio not found: " + name)
		return 1
	}
	return ratio
}

func GetGroupGroupRatio(userGroup, usingGroup string) (float64, bool) {
	gp, ok := groupGroupRatioMap.Get(userGroup)
	if !ok {
		return -1, false
	}
	ratio, ok := gp[usingGroup]
	if !ok {
		return -1, false
	}
	return ratio, true
}

func GroupGroupRatio2JSONString() string {
	return groupGroupRatioMap.MarshalJSONString()
}

func UpdateGroupGroupRatioByJSONString(jsonStr string) error {
	return types.LoadFromJsonString(groupGroupRatioMap, jsonStr)
}

func CheckGroupRatio(jsonStr string) error {
	checkGroupRatio := make(map[string]float64)
	err := json.Unmarshal([]byte(jsonStr), &checkGroupRatio)
	if err != nil {
		return err
	}
	for name, ratio := range checkGroupRatio {
		if ratio < 0 {
			return errors.New("group ratio must be not less than 0: " + name)
		}
	}
	return nil
}
