package model

import (
	"math"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/config"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func GetCashbackSettingFromDB() (operation_setting.CashbackSetting, error) {
	return loadCashbackSettingTx(DB)
}

func loadCashbackSettingTx(tx *gorm.DB) (operation_setting.CashbackSetting, error) {
	defaults := operation_setting.DefaultCashbackSetting()
	if tx == nil || !tx.Migrator().HasTable(&Option{}) {
		return defaults, nil
	}

	var options []Option
	if err := tx.Where(map[string]any{"key": operation_setting.CashbackSettingOptionKeys()}).Find(&options).Error; err != nil {
		return operation_setting.CashbackSetting{}, err
	}
	values := make(map[string]string, len(options))
	for _, option := range options {
		values[option.Key] = option.Value
	}
	return operation_setting.ParseCashbackSettingOptions(values)
}

func SaveCashbackSetting(setting operation_setting.CashbackSetting) error {
	return UpdateOptionsBulk(operation_setting.CashbackSettingOptionValues(setting))
}

func UpdateCashbackSettingAtomic(candidate operation_setting.CashbackSetting, complianceConfirmed bool, now int64, policy ...operation_setting.CashbackReviewPolicyUpdate) (operation_setting.CashbackSetting, operation_setting.CashbackSetting, error) {
	var current operation_setting.CashbackSetting
	var stored operation_setting.CashbackSetting
	var values map[string]string
	err := DB.Transaction(func(tx *gorm.DB) error {
		versionKey := operation_setting.CashbackSettingName + ".version"
		if err := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&Option{Key: versionKey, Value: "0"}).Error; err != nil {
			return err
		}
		var versionOption Option
		if err := lockForUpdate(tx).Where(map[string]any{"key": versionKey}).First(&versionOption).Error; err != nil {
			return err
		}

		var err error
		current, err = loadCashbackSettingTx(tx)
		if err != nil {
			return err
		}
		if current.Version == math.MaxInt64 {
			return &operation_setting.CashbackSettingValidationError{
				Field: "version", Message: "cashback configuration version is exhausted",
			}
		}
		stored = candidate
		stored.AutoReviewEnabled = current.AutoReviewEnabled
		stored.LowReviewRequired = current.LowReviewRequired
		stored.MediumReviewRequired = current.MediumReviewRequired
		stored.HighReviewRequired = current.HighReviewRequired
		stored.SevereReviewRequired = current.SevereReviewRequired
		stored.AutoReviewImmediateIssue = current.AutoReviewImmediateIssue
		if len(policy) > 0 {
			policy[0].Apply(&stored)
		}
		stored.FirstEnabledAt = current.FirstEnabledAt
		stored.Version = current.Version + 1
		if stored.AnyDirectionEnabled() && stored.FirstEnabledAt == 0 {
			if now <= 0 {
				return &operation_setting.CashbackSettingValidationError{
					Field: "first_enabled_at", Message: "first enabled time is required",
				}
			}
			stored.FirstEnabledAt = now
		}
		if err := operation_setting.ValidateCashbackSetting(stored, complianceConfirmed); err != nil {
			return err
		}
		values = operation_setting.CashbackSettingOptionValues(stored)
		return updateOptionsBulkTx(tx, values)
	})
	if err != nil {
		return operation_setting.CashbackSetting{}, operation_setting.CashbackSetting{}, err
	}

	common.OptionMapRWMutex.Lock()
	if common.OptionMap == nil {
		common.OptionMap = make(map[string]string)
	}
	for key, value := range values {
		common.OptionMap[key] = value
	}
	common.OptionMapRWMutex.Unlock()
	moduleValues := make(map[string]string, len(values))
	prefix := operation_setting.CashbackSettingName + "."
	for key, value := range values {
		moduleValues[strings.TrimPrefix(key, prefix)] = value
	}
	if err := config.GlobalConfig.UpdateFromMap(operation_setting.CashbackSettingName, moduleValues); err != nil {
		return current, stored, err
	}
	return current, stored, nil
}
