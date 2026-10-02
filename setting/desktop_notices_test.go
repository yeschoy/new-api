package setting

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateDesktopNoticesAcceptsContractShapes(t *testing.T) {
	for _, value := range []string{
		"",
		"[]",
		`[{"title":"仅标题"}]`,
		`[{"id":"a","title":"余额提醒","body":"第一段\n第二段","severity":"warning","publishedAtEpochMs":1767225600000,"expiresAtEpochMs":0,"banner":true,"action":{"kind":"wallet","label":"去充值"}},
		  {"id":"b","title":"细则更新","severity":"info","action":{"kind":"link","label":"查看细则","url":"https://yeschoy.com/terms"}}]`,
	} {
		assert.NoError(t, ValidateDesktopNotices(value), value)
	}
}

func TestValidateDesktopNoticesRejectsInvalidValues(t *testing.T) {
	tests := map[string]string{
		"not json":            `[{"title":`,
		"not an array":        `{"title":"x"}`,
		"null":                `null`,
		"non-object entry":    `["x"]`,
		"missing title":       `[{"id":"a"}]`,
		"blank title":         `[{"id":"a","title":"   "}]`,
		"duplicate id":        `[{"id":"a","title":"x"},{"id":"a","title":"y"}]`,
		"wrong field type":    `[{"title":"x","banner":"yes"}]`,
		"unknown severity":    `[{"title":"x","severity":"error"}]`,
		"unknown action kind": `[{"title":"x","action":{"kind":"mail"}}]`,
		"link without url":    `[{"title":"x","action":{"kind":"link","label":"看看"}}]`,
		"non-http link":       `[{"title":"x","action":{"kind":"link","url":"javascript:alert(1)"}}]`,
		"title too long":      `[{"title":"` + strings.Repeat("长", desktopNoticeMaxTitleLength+1) + `"}]`,
		"id too long":         `[{"id":"` + strings.Repeat("i", desktopNoticeMaxIDLength+1) + `","title":"x"}]`,
		"body too long":       `[{"title":"x","body":"` + strings.Repeat("b", desktopNoticeMaxBodyLength+1) + `"}]`,
	}
	for name, value := range tests {
		t.Run(name, func(t *testing.T) {
			assert.Error(t, ValidateDesktopNotices(value))
		})
	}
}

func TestActiveDesktopNoticesFiltersExpiredAndMalformedEntries(t *testing.T) {
	now := time.UnixMilli(1_800_000_000_000)
	raw := `[
		{"id":"expired","title":"过期","expiresAtEpochMs":1799999999999},
		{"id":"boundary","title":"恰好到期","expiresAtEpochMs":1800000000000},
		{"id":"no-title"},
		"junk",
		{"id":"forever","title":"长期","expiresAtEpochMs":0}
	]`

	notices := ActiveDesktopNotices(raw, now)

	require.Len(t, notices, 2)
	assert.Equal(t, "boundary", notices[0].ID)
	assert.Equal(t, "forever", notices[1].ID)
}

func TestActiveDesktopNoticesReturnsEmptyListForBadJSON(t *testing.T) {
	notices := ActiveDesktopNotices("[{", time.Now())

	require.NotNil(t, notices)
	assert.Empty(t, notices)
}
