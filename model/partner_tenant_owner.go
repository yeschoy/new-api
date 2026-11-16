package model

import (
	"errors"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const (
	// PartnerTenantOptionMaxPageSize bounds one page of the safe merchant
	// options; there is no unbounded listing.
	PartnerTenantOptionMaxPageSize = 100
	// PartnerTenantOptionMaxKeywordRunes equals the tenant name column width.
	PartnerTenantOptionMaxKeywordRunes = 64

	// One IN list per chunk keeps a large batch inside every driver's bind limit.
	partnerTenantOwnerBatchSize = 500
	// Request-local memo key; the user ID is part of the key, never implied.
	partnerTenantOwnerContextKeyPrefix = "partner_tenant_owner_snapshot:"
)

// ErrPartnerTenantOwnerLookup marks an ownership or option query that could
// not be answered. It is never a statement about membership.
var ErrPartnerTenantOwnerLookup = errors.New("partner tenant owner lookup failed")

// ErrPartnerTenantOptionQuery rejects an out-of-bounds option query before it
// reaches the database.
var ErrPartnerTenantOptionQuery = errors.New("invalid partner tenant option query")

// partnerTenantOwnerLookupError renders only the bounded sentinel text, so a
// caller that logs or returns it cannot leak driver or SQL details. The cause
// stays reachable through errors.Is / errors.As for tests and diagnostics.
type partnerTenantOwnerLookupError struct{ cause error }

func (e *partnerTenantOwnerLookupError) Error() string { return ErrPartnerTenantOwnerLookup.Error() }
func (e *partnerTenantOwnerLookupError) Unwrap() error { return e.cause }
func (e *partnerTenantOwnerLookupError) Is(target error) bool {
	return target == ErrPartnerTenantOwnerLookup
}

func partnerTenantOwnerLookupFailed(cause error) error {
	return &partnerTenantOwnerLookupError{cause: cause}
}

// PartnerTenantOwner is the only Tenant ownership projection shared by usage
// logs, user classification and administrator filters. It carries no external
// buyer ID or hash, credential, seed, order reference or configuration, and it
// is never serialized directly: response DTOs render the int64 IDs as decimal
// strings themselves.
type PartnerTenantOwner struct {
	TenantId       int64  `json:"-" gorm:"column:tenant_id"`
	TenantName     string `json:"-" gorm:"column:tenant_name"`
	AccountId      int64  `json:"-" gorm:"column:account_id"`
	UserId         int    `json:"-" gorm:"column:user_id"`
	IdentitySource string `json:"-" gorm:"column:identity_source"`
}

// PartnerTenantOption is the safe merchant filter option: ID and name only.
type PartnerTenantOption struct {
	Id   int64  `json:"-" gorm:"column:id"`
	Name string `json:"-" gorm:"column:name"`
}

// Ownership is the existence of an account mapping for the user, in the main
// database only. There is deliberately no account, tenant, subscription, role,
// group or username predicate: a disabled or expired merchant account is still
// a merchant account. The LEFT JOIN keeps a mapping whose tenant row is missing
// attributable (with an empty name) instead of reclassifying it as ordinary.
func partnerTenantOwnerQuery() *gorm.DB {
	return DB.Table("partner_tenant_accounts AS a").
		Select("a.tenant_id AS tenant_id, COALESCE(t.name, '') AS tenant_name, a.id AS account_id, a.user_id AS user_id, COALESCE(a.identity_source, '') AS identity_source").
		Joins("LEFT JOIN partner_tenants AS t ON t.id = a.tenant_id")
}

func normalizePartnerTenantOwner(owner PartnerTenantOwner) PartnerTenantOwner {
	// Same rule as MigratePartnerTenantSubscriptionKeys for pre-column rows.
	if owner.IdentitySource == "" {
		owner.IdentitySource = PartnerTenantIdentityExternal
	}
	return owner
}

// GetPartnerTenantOwner resolves the safe owner of one user with three
// distinguishable outcomes:
//
//   - member:      (owner, true, nil)
//   - non-member:  (zero, false, nil), only after a successful query
//   - failure:     (zero, false, err) with errors.Is(err, ErrPartnerTenantOwnerLookup)
//
// A failure is never reported as non-member. This reads the database every
// time: it neither consults nor populates the one-minute membership cache, and
// there is no shared negative cache.
func GetPartnerTenantOwner(userID int) (PartnerTenantOwner, bool, error) {
	if DB == nil {
		return PartnerTenantOwner{}, false, partnerTenantOwnerLookupFailed(errors.New("database is not initialized"))
	}
	var rows []PartnerTenantOwner
	if err := partnerTenantOwnerQuery().Where("a.user_id = ?", userID).Order("a.id ASC").Limit(1).Find(&rows).Error; err != nil {
		return PartnerTenantOwner{}, false, partnerTenantOwnerLookupFailed(err)
	}
	if len(rows) == 0 {
		return PartnerTenantOwner{}, false, nil
	}
	if rows[0].UserId != userID {
		return PartnerTenantOwner{}, false, partnerTenantOwnerLookupFailed(errors.New("owner row does not match the requested user"))
	}
	return normalizePartnerTenantOwner(rows[0]), true, nil
}

// GetPartnerTenantOwners is the batch form of GetPartnerTenantOwner for one
// page of users. Members are present in the result, confirmed non-members are
// absent, and any failure returns an error with no partial result. An empty
// input issues no query; otherwise one query per bounded chunk, never per row.
func GetPartnerTenantOwners(userIDs []int) (map[int]PartnerTenantOwner, error) {
	owners := map[int]PartnerTenantOwner{}
	if len(userIDs) == 0 {
		return owners, nil
	}
	if DB == nil {
		return nil, partnerTenantOwnerLookupFailed(errors.New("database is not initialized"))
	}
	seen := make(map[int]struct{}, len(userIDs))
	unique := make([]int, 0, len(userIDs))
	for _, userID := range userIDs {
		if _, duplicate := seen[userID]; duplicate {
			continue
		}
		seen[userID] = struct{}{}
		unique = append(unique, userID)
	}
	for start := 0; start < len(unique); start += partnerTenantOwnerBatchSize {
		chunk := unique[start:min(start+partnerTenantOwnerBatchSize, len(unique))]
		var rows []PartnerTenantOwner
		if err := partnerTenantOwnerQuery().Where("a.user_id IN ?", chunk).Order("a.id ASC").Find(&rows).Error; err != nil {
			return nil, partnerTenantOwnerLookupFailed(err)
		}
		for _, row := range rows {
			if _, requested := seen[row.UserId]; !requested {
				return nil, partnerTenantOwnerLookupFailed(errors.New("owner row does not match a requested user"))
			}
			if _, exists := owners[row.UserId]; exists {
				continue
			}
			owners[row.UserId] = normalizePartnerTenantOwner(row)
		}
	}
	return owners, nil
}

type partnerTenantOwnerSnapshot struct {
	userID int
	owner  PartnerTenantOwner
	member bool
}

// PartnerTenantOwnerForRequest resolves the owner of userID once per request
// and memoizes the answer only inside that request's gin context. The memo is
// keyed by the user ID actually passed, so another user ID in the same context
// is resolved on its own and never receives a different user's owner.
//
// A nil context performs a direct lookup (context-free task billing passes the
// persisted task user ID). Successful answers, including a confirmed
// non-member, are memoized; a failure is not, so it stays a failure for this
// caller while a later writer in the same request may retry.
func PartnerTenantOwnerForRequest(c *gin.Context, userID int) (PartnerTenantOwner, bool, error) {
	if c == nil {
		return GetPartnerTenantOwner(userID)
	}
	key := partnerTenantOwnerContextKeyPrefix + strconv.Itoa(userID)
	if value, ok := c.Get(key); ok {
		if snapshot, ok := value.(partnerTenantOwnerSnapshot); ok && snapshot.userID == userID {
			return snapshot.owner, snapshot.member, nil
		}
	}
	owner, member, err := GetPartnerTenantOwner(userID)
	if err != nil {
		return PartnerTenantOwner{}, false, err
	}
	c.Set(key, partnerTenantOwnerSnapshot{userID: userID, owner: owner, member: member})
	return owner, member, nil
}

// ValidPartnerTenantOptionKeyword accepts an empty keyword (no search) or
// bounded printable text.
func ValidPartnerTenantOptionKeyword(keyword string) bool {
	return utf8.ValidString(keyword) &&
		utf8.RuneCountInString(keyword) <= PartnerTenantOptionMaxKeywordRunes &&
		!strings.ContainsFunc(keyword, unicode.IsControl)
}

// The keyword is a literal substring: LIKE wildcards typed by the caller match
// themselves.
func partnerTenantOptionLikePattern(keyword string) string {
	keyword = strings.ReplaceAll(keyword, "!", "!!")
	keyword = strings.ReplaceAll(keyword, "%", "!%")
	keyword = strings.ReplaceAll(keyword, "_", "!_")
	return "%" + keyword + "%"
}

// ListPartnerTenantOptions returns one bounded page of merchant options
// (newest first) and the total for the same keyword. Disabled merchants are
// included: an option identifies history, it does not grant access. Only the
// id and name columns are read.
func ListPartnerTenantOptions(keyword string, offset, limit int) ([]PartnerTenantOption, int64, error) {
	if offset < 0 || limit < 1 || limit > PartnerTenantOptionMaxPageSize || !ValidPartnerTenantOptionKeyword(keyword) {
		return nil, 0, ErrPartnerTenantOptionQuery
	}
	if DB == nil {
		return nil, 0, partnerTenantOwnerLookupFailed(errors.New("database is not initialized"))
	}
	filtered := func() *gorm.DB {
		query := DB.Model(&PartnerTenant{})
		if keyword != "" {
			query = query.Where("LOWER(name) LIKE ? ESCAPE '!'", partnerTenantOptionLikePattern(strings.ToLower(keyword)))
		}
		return query
	}
	var total int64
	if err := filtered().Count(&total).Error; err != nil {
		return nil, 0, partnerTenantOwnerLookupFailed(err)
	}
	options := make([]PartnerTenantOption, 0)
	if total == 0 {
		return options, 0, nil
	}
	if err := filtered().Select("id", "name").Order("id DESC").Offset(offset).Limit(limit).Find(&options).Error; err != nil {
		return nil, 0, partnerTenantOwnerLookupFailed(err)
	}
	return options, total, nil
}

// GetPartnerTenantOption resolves one merchant option by ID, so a currently
// selected merchant keeps its label when it is not on the returned page. The
// outcomes mirror GetPartnerTenantOwner: found, confirmed absent, or failure.
func GetPartnerTenantOption(id int64) (PartnerTenantOption, bool, error) {
	if id <= 0 {
		return PartnerTenantOption{}, false, ErrPartnerTenantOptionQuery
	}
	if DB == nil {
		return PartnerTenantOption{}, false, partnerTenantOwnerLookupFailed(errors.New("database is not initialized"))
	}
	var options []PartnerTenantOption
	if err := DB.Model(&PartnerTenant{}).Select("id", "name").Where("id = ?", id).Limit(1).Find(&options).Error; err != nil {
		return PartnerTenantOption{}, false, partnerTenantOwnerLookupFailed(err)
	}
	if len(options) == 0 {
		return PartnerTenantOption{}, false, nil
	}
	return options[0], true, nil
}
