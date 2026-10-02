package setting

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
)

// DesktopNoticesKey stores the announcements shown by the desktop client as a
// JSON array. It is edited by root through the generic option API.
const DesktopNoticesKey = "DesktopNotices"

const (
	DesktopNoticesMaxServed = 30

	desktopNoticeMaxIDLength    = 64
	desktopNoticeMaxTitleLength = 120
	desktopNoticeMaxBodyLength  = 2000
)

type DesktopNoticeAction struct {
	Kind  string `json:"kind"`
	Label string `json:"label,omitempty"`
	URL   string `json:"url,omitempty"`
}

type DesktopNotice struct {
	ID                 string               `json:"id,omitempty"`
	Title              string               `json:"title"`
	Body               string               `json:"body,omitempty"`
	Severity           string               `json:"severity,omitempty"`
	PublishedAtEpochMs int64                `json:"publishedAtEpochMs,omitempty"`
	ExpiresAtEpochMs   int64                `json:"expiresAtEpochMs,omitempty"`
	Banner             bool                 `json:"banner,omitempty"`
	Action             *DesktopNoticeAction `json:"action,omitempty"`
}

// ValidateDesktopNotices is the save-time gate for DesktopNotices. An empty
// value is accepted and means "no notices".
func ValidateDesktopNotices(value string) error {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	var items []json.RawMessage
	if err := common.UnmarshalJsonStr(value, &items); err != nil || items == nil {
		return fmt.Errorf("DesktopNotices 必须是 JSON 数组")
	}
	seenIDs := make(map[string]int, len(items))
	for index, raw := range items {
		position := index + 1
		if common.GetJsonType(raw) != "object" {
			return fmt.Errorf("DesktopNotices 第 %d 条必须是 JSON 对象", position)
		}
		var notice DesktopNotice
		if err := common.Unmarshal(raw, &notice); err != nil {
			return fmt.Errorf("DesktopNotices 第 %d 条字段类型错误: %v", position, err)
		}
		if err := validateDesktopNotice(notice); err != nil {
			return fmt.Errorf("DesktopNotices 第 %d 条%s", position, err.Error())
		}
		if notice.ID == "" {
			continue
		}
		if previous, ok := seenIDs[notice.ID]; ok {
			return fmt.Errorf("DesktopNotices 第 %d 条的 id %q 与第 %d 条重复", position, notice.ID, previous)
		}
		seenIDs[notice.ID] = position
	}
	return nil
}

func validateDesktopNotice(notice DesktopNotice) error {
	if strings.TrimSpace(notice.Title) == "" {
		return fmt.Errorf("缺少 title")
	}
	if utf8.RuneCountInString(notice.Title) > desktopNoticeMaxTitleLength {
		return fmt.Errorf("的 title 超过 %d 个字符", desktopNoticeMaxTitleLength)
	}
	if utf8.RuneCountInString(notice.ID) > desktopNoticeMaxIDLength {
		return fmt.Errorf("的 id 超过 %d 个字符", desktopNoticeMaxIDLength)
	}
	if utf8.RuneCountInString(notice.Body) > desktopNoticeMaxBodyLength {
		return fmt.Errorf("的 body 超过 %d 个字符", desktopNoticeMaxBodyLength)
	}
	switch notice.Severity {
	case "", "info", "warning":
	default:
		return fmt.Errorf("的 severity 只能是 info 或 warning")
	}
	if notice.PublishedAtEpochMs < 0 || notice.ExpiresAtEpochMs < 0 {
		return fmt.Errorf("的时间戳不能为负数")
	}
	if notice.Action == nil {
		return nil
	}
	switch notice.Action.Kind {
	case "wallet":
	case "link":
		parsed, err := url.Parse(notice.Action.URL)
		if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.Host == "" {
			return fmt.Errorf("的 link 类型 action 需要 http(s) 地址")
		}
	default:
		return fmt.Errorf("的 action.kind 只能是 wallet 或 link")
	}
	return nil
}

// ActiveDesktopNotices parses raw leniently for serving: malformed config
// yields no notices, malformed entries are skipped, expired entries are
// dropped, and at most DesktopNoticesMaxServed entries are returned.
func ActiveDesktopNotices(raw string, now time.Time) []DesktopNotice {
	notices := make([]DesktopNotice, 0)
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return notices
	}
	var items []json.RawMessage
	if err := common.UnmarshalJsonStr(raw, &items); err != nil {
		return notices
	}
	nowMs := now.UnixMilli()
	seenIDs := make(map[string]struct{}, len(items))
	for _, item := range items {
		if len(notices) >= DesktopNoticesMaxServed {
			break
		}
		if common.GetJsonType(item) != "object" {
			continue
		}
		var notice DesktopNotice
		if err := common.Unmarshal(item, &notice); err != nil {
			continue
		}
		if err := validateDesktopNotice(notice); err != nil {
			continue
		}
		if notice.ExpiresAtEpochMs != 0 && notice.ExpiresAtEpochMs < nowMs {
			continue
		}
		if notice.ID != "" {
			if _, duplicate := seenIDs[notice.ID]; duplicate {
				continue
			}
			seenIDs[notice.ID] = struct{}{}
		}
		notices = append(notices, notice)
	}
	return notices
}

// GetActiveDesktopNotices reads the current DesktopNotices option.
func GetActiveDesktopNotices(now time.Time) []DesktopNotice {
	common.OptionMapRWMutex.RLock()
	raw := ""
	if common.OptionMap != nil {
		raw = common.OptionMap[DesktopNoticesKey]
	}
	common.OptionMapRWMutex.RUnlock()
	return ActiveDesktopNotices(raw, now)
}
