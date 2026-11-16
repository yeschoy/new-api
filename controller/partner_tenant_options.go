package controller

import (
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

const (
	partnerTenantOptionsDefaultPageSize = 20
	partnerTenantOptionsMaxPage         = 1000000
)

// partnerTenantOptionView is the complete public shape of a merchant option.
// The ID is decimal text so a 64-bit value survives JavaScript clients.
type partnerTenantOptionView struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type partnerTenantOptionsPage struct {
	Page     int                       `json:"page"`
	PageSize int                       `json:"page_size"`
	Total    int64                     `json:"total"`
	Items    []partnerTenantOptionView `json:"items"`
	// Selected is the requested selected_id resolved by ID, or null when it was
	// not requested or no longer exists.
	Selected *partnerTenantOptionView `json:"selected"`
}

func partnerTenantOptionToView(option model.PartnerTenantOption) partnerTenantOptionView {
	return partnerTenantOptionView{ID: strconv.FormatInt(option.Id, 10), Name: option.Name}
}

// parseCanonicalPositiveInt64 accepts only the canonical decimal text of a
// positive signed 64-bit integer: no sign, leading zero, space or overflow.
func parseCanonicalPositiveInt64(raw string) (int64, bool) {
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value <= 0 || strconv.FormatInt(value, 10) != raw {
		return 0, false
	}
	return value, true
}

// GetPartnerTenantOptions serves the safe merchant filter options. It backs
// both GET /api/log/partner-tenants/options (log:read) and
// GET /api/user/tenant-options (user:read); the route decides the audience,
// this projection is identical and never reads the root-only management list.
func GetPartnerTenantOptions(c *gin.Context) {
	invalid := func() {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
	}
	query, err := url.ParseQuery(c.Request.URL.RawQuery)
	if err != nil {
		invalid()
		return
	}
	for key, values := range query {
		switch key {
		case "q", "p", "page_size", "selected_id":
		default:
			invalid()
			return
		}
		if len(values) != 1 {
			invalid()
			return
		}
	}
	page, pageSize := 1, partnerTenantOptionsDefaultPageSize
	if query.Has("p") {
		value, ok := parseCanonicalPositiveInt64(query.Get("p"))
		if !ok || value > partnerTenantOptionsMaxPage {
			invalid()
			return
		}
		page = int(value)
	}
	if query.Has("page_size") {
		value, ok := parseCanonicalPositiveInt64(query.Get("page_size"))
		if !ok || value > model.PartnerTenantOptionMaxPageSize {
			invalid()
			return
		}
		pageSize = int(value)
	}
	keyword := query.Get("q")
	if !model.ValidPartnerTenantOptionKeyword(keyword) {
		invalid()
		return
	}
	keyword = strings.TrimSpace(keyword)
	var selectedID int64
	if query.Has("selected_id") {
		value, ok := parseCanonicalPositiveInt64(query.Get("selected_id"))
		if !ok {
			invalid()
			return
		}
		selectedID = value
	}

	unavailable := func(err error) {
		if errors.Is(err, model.ErrPartnerTenantOptionQuery) {
			invalid()
			return
		}
		// Only the request correlation is logged; never the driver error.
		logger.LogError(c.Request.Context(), common.LogText("partner tenant options read failed (request_id=%s): database error", c.GetString(common.RequestIdKey)))
		common.ApiErrorStatus(c, http.StatusServiceUnavailable, common.NewMessage("Database error, please contact the administrator"))
	}
	options, total, err := model.ListPartnerTenantOptions(keyword, (page-1)*pageSize, pageSize)
	if err != nil {
		unavailable(err)
		return
	}
	result := partnerTenantOptionsPage{Page: page, PageSize: pageSize, Total: total, Items: make([]partnerTenantOptionView, 0, len(options))}
	for _, option := range options {
		result.Items = append(result.Items, partnerTenantOptionToView(option))
	}
	if selectedID > 0 {
		option, found, err := model.GetPartnerTenantOption(selectedID)
		if err != nil {
			unavailable(err)
			return
		}
		if found {
			view := partnerTenantOptionToView(option)
			result.Selected = &view
		}
	}
	c.Header("Cache-Control", "no-store")
	common.ApiSuccess(c, result)
}
