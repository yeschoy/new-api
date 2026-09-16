package model

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"

	"github.com/QuantumNous/new-api/common"
)

var ErrUserQuotaMutationPending = errors.New("user quota mutation is pending")
var ErrUserQuotaMutationFenceLost = errors.New("user quota mutation fence was lost")

const minUserQuotaMutationLeaseSeconds = 300
const minUserQuotaMutationCooldownSeconds = 10

// userQuotaMutationFences prevents a cache miss from publishing a database
// snapshot while a money transaction is still deciding. The Redis hash always
// expires before the lease, so a crashed writer cannot leave a stale balance
// reachable after the fence disappears.
type userQuotaMutationFences struct {
	tokens map[int]string
}

func getUserQuotaMutationFenceKey(userID int) string {
	return fmt.Sprintf("quota:user:fence:%d", userID)
}

func userQuotaMutationCooldownSeconds() int {
	seconds := common.BatchUpdateInterval*2 + 5
	if seconds < minUserQuotaMutationCooldownSeconds {
		return minUserQuotaMutationCooldownSeconds
	}
	return seconds
}

func userQuotaMutationLeaseSeconds() int {
	seconds := userCacheTTLSeconds() * 2
	batchSeconds := common.BatchUpdateInterval*4 + 60
	if seconds < batchSeconds {
		seconds = batchSeconds
	}
	if seconds < minUserQuotaMutationLeaseSeconds {
		seconds = minUserQuotaMutationLeaseSeconds
	}
	return seconds
}

func userQuotaMutationHashTTLSeconds() int {
	seconds := userQuotaMutationLeaseSeconds() - userQuotaMutationCooldownSeconds()
	if seconds < 30 {
		return 30
	}
	return seconds
}

func newUserQuotaMutationToken() (string, error) {
	bytes := make([]byte, 16)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

func acquireUserQuotaMutationFences(userIDs ...int) (*userQuotaMutationFences, error) {
	fences := &userQuotaMutationFences{tokens: map[int]string{}}
	if !common.RedisEnabled {
		return fences, nil
	}

	unique := make(map[int]struct{}, len(userIDs))
	ids := make([]int, 0, len(userIDs))
	for _, userID := range userIDs {
		if userID <= 0 {
			continue
		}
		if _, exists := unique[userID]; exists {
			continue
		}
		unique[userID] = struct{}{}
		ids = append(ids, userID)
	}
	sort.Ints(ids)

	const acquireScript = `
if redis.call('EXISTS', KEYS[2]) == 1 then
  return 0
end
redis.call('SET', KEYS[2], ARGV[1], 'EX', ARGV[2])
if redis.call('EXISTS', KEYS[1]) == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[3])
end
return 1`

	for _, userID := range ids {
		token, err := newUserQuotaMutationToken()
		if err != nil {
			fences.finalize()
			return nil, err
		}
		result, err := common.RDB.Eval(
			context.Background(),
			acquireScript,
			[]string{getUserCacheKey(userID), getUserQuotaMutationFenceKey(userID)},
			token,
			userQuotaMutationLeaseSeconds(),
			userQuotaMutationHashTTLSeconds(),
		).Int()
		if err != nil {
			fences.finalize()
			return nil, err
		}
		if result != 1 {
			fences.finalize()
			return nil, fmt.Errorf("%w for user %d", ErrUserQuotaMutationPending, userID)
		}
		fences.tokens[userID] = token
	}
	return fences, nil
}

func (fences *userQuotaMutationFences) takeAvailable(user User, requested int) (int, error) {
	if requested <= 0 || user.Id <= 0 {
		return 0, nil
	}
	amount := minPositiveQuota(user.Quota, requested)
	if !common.RedisEnabled {
		return amount, nil
	}
	token, ok := fences.tokens[user.Id]
	if !ok {
		return 0, ErrUserQuotaMutationFenceLost
	}

	// The database row is not authoritative while a user-quota batch delta is
	// queued or has already been swapped into the active flush. Hold the batch
	// lock through the Redis reservation so a new delta is ordered after this
	// recovery decision instead of racing the cold-cache check.
	batchUpdateLocks[BatchUpdateTypeUserQuota].Lock()
	defer batchUpdateLocks[BatchUpdateTypeUserQuota].Unlock()
	if batchUpdateStores[BatchUpdateTypeUserQuota][user.Id] != 0 || batchUpdateInFlightStores[BatchUpdateTypeUserQuota][user.Id] != 0 {
		return 0, ErrUserQuotaMutationPending
	}

	const takeScript = `
if redis.call('GET', KEYS[2]) ~= ARGV[2] then
  return -2
end
redis.call('EXPIRE', KEYS[2], ARGV[3])
if tonumber(redis.call('HGET', KEYS[1], 'Id') or '0') ~= tonumber(ARGV[4])
  or tonumber(redis.call('HGET', KEYS[1], 'CacheSchema') or '0') ~= tonumber(ARGV[5])
  or redis.call('HEXISTS', KEYS[1], 'Quota') == 0 then
  return -1
end
local quota = tonumber(redis.call('HGET', KEYS[1], 'Quota'))
local database_quota = tonumber(ARGV[7])
if quota == nil or database_quota == nil then
  return -4
end
-- A positive batch delta can make Redis newer than the locked database row.
-- Recovery must wait for that delta to flush instead of converting it to debt.
if quota > database_quota then
  return -3
end
if quota <= 0 or database_quota <= 0 then
  return 0
end
local requested = tonumber(ARGV[1])
local taken = quota
if database_quota < taken then
  taken = database_quota
end
if requested < taken then
  taken = requested
end
redis.call('HINCRBY', KEYS[1], 'Quota', -taken)
redis.call('EXPIRE', KEYS[1], ARGV[6])
return taken`

	result, err := common.RDB.Eval(
		context.Background(),
		takeScript,
		[]string{getUserCacheKey(user.Id), getUserQuotaMutationFenceKey(user.Id)},
		requested,
		token,
		userQuotaMutationLeaseSeconds(),
		user.Id,
		userCacheSchemaVersion,
		userQuotaMutationHashTTLSeconds(),
		user.Quota,
	).Int()
	if err != nil {
		return 0, err
	}
	switch result {
	case -3:
		return 0, ErrUserQuotaMutationPending
	case -2:
		return 0, ErrUserQuotaMutationFenceLost
	case -1:
		// A cold cache is safe under the fence when no newer positive cached
		// balance exists: no request can publish or spend a stale snapshot.
		return amount, nil
	default:
		if result < 0 || result > requested || result > user.Quota {
			return 0, errors.New("invalid user quota fence reservation result")
		}
		return result, nil
	}
}

func (fences *userQuotaMutationFences) verify() error {
	if fences == nil || !common.RedisEnabled {
		return nil
	}
	const verifyScript = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call('EXPIRE', KEYS[1], ARGV[2])
return 1`
	for userID, token := range fences.tokens {
		result, err := common.RDB.Eval(
			context.Background(),
			verifyScript,
			[]string{getUserQuotaMutationFenceKey(userID)},
			token,
			userQuotaMutationLeaseSeconds(),
		).Int()
		if err != nil {
			return err
		}
		if result != 1 {
			return ErrUserQuotaMutationFenceLost
		}
	}
	return nil
}

func (fences *userQuotaMutationFences) finalize() {
	if fences == nil || !common.RedisEnabled {
		return
	}
	const finalizeScript = `
local owner = redis.call('GET', KEYS[2])
-- The cached quota was mutated under this generation. Always invalidate the
-- hash, even after ownership loss, so a rolled-back debit cannot become
-- readable. A replacement owner's fence is deliberately left untouched.
redis.call('DEL', KEYS[1])
if owner ~= ARGV[1] then
  return 0
end
redis.call('EXPIRE', KEYS[2], ARGV[2])
return 1`
	for userID, token := range fences.tokens {
		result, err := common.RDB.Eval(
			context.Background(),
			finalizeScript,
			[]string{getUserCacheKey(userID), getUserQuotaMutationFenceKey(userID)},
			token,
			userQuotaMutationCooldownSeconds(),
		).Int()
		if err != nil {
			common.SysError(fmt.Sprintf("failed to finalize quota mutation fence for user %d: %v", userID, err))
			continue
		}
		if result != 1 {
			common.SysError(fmt.Sprintf("quota mutation fence lost before finalization for user %d", userID))
		}
	}
}

func userQuotaMutationFenceExists(userID int) (bool, error) {
	if !common.RedisEnabled {
		return false, nil
	}
	count, err := common.RDB.Exists(context.Background(), getUserQuotaMutationFenceKey(userID)).Result()
	return count > 0, err
}
