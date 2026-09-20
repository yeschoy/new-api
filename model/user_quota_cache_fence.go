package model

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

var ErrUserQuotaMutationPending = errors.New("user quota mutation is pending")
var ErrUserQuotaMutationFenceLost = errors.New("user quota mutation fence was lost")

const minUserQuotaMutationLeaseSeconds = 300
const minUserQuotaMutationCooldownSeconds = 10
const userQuotaRedisOperationTimeout = 5 * time.Second

func userQuotaRedisContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), userQuotaRedisOperationTimeout)
}

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

// Each batch writer owns one expiring sorted-set member per user. The member
// outlives the shortened user-cache hash, so a crashed writer can never expose
// a stale cached balance after its shared pending evidence expires.
func getUserQuotaBatchPendingKey(userID int) string {
	return fmt.Sprintf("quota:user:batch-pending:%d", userID)
}

var userQuotaBatchOwnerOnce sync.Once
var userQuotaBatchOwnerToken string
var userQuotaBatchOwnerErr error

func userQuotaBatchOwner() (string, error) {
	userQuotaBatchOwnerOnce.Do(func() {
		userQuotaBatchOwnerToken, userQuotaBatchOwnerErr = newUserQuotaMutationToken()
	})
	return userQuotaBatchOwnerToken, userQuotaBatchOwnerErr
}

func userQuotaBatchPendingLeaseMillis() int64 {
	return int64(userQuotaMutationLeaseSeconds()) * 1000
}

func userQuotaBatchPendingKeyTTLSeconds() int {
	return userQuotaMutationLeaseSeconds() + userQuotaMutationCooldownSeconds()
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
	ctx, cancel := userQuotaRedisContext()
	defer cancel()
	return acquireUserQuotaMutationFencesWithContext(ctx, userIDs...)
}

func acquireUserQuotaMutationFencesWithContext(ctx context.Context, userIDs ...int) (*userQuotaMutationFences, error) {
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
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', now)
if redis.call('EXISTS', KEYS[2]) == 1 or redis.call('ZCARD', KEYS[3]) > 0 then
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
			fences.releaseUnused()
			return nil, err
		}
		// Record the tentative owner before EVAL. If Redis executes SET but the
		// reply is lost, releaseUnused can still remove only this token with a
		// fresh bounded context. It never invalidates the balance hash.
		fences.tokens[userID] = token
		result, err := common.RDB.Eval(
			ctx,
			acquireScript,
			[]string{
				getUserCacheKey(userID),
				getUserQuotaMutationFenceKey(userID),
				getUserQuotaBatchPendingKey(userID),
			},
			token,
			userQuotaMutationLeaseSeconds(),
			userQuotaMutationHashTTLSeconds(),
		).Int()
		if err != nil {
			fences.releaseUnused()
			return nil, err
		}
		if result != 1 {
			fences.releaseUnused()
			return nil, fmt.Errorf("%w for user %d", ErrUserQuotaMutationPending, userID)
		}
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
	_, queued := batchUpdateStores[BatchUpdateTypeUserQuota][user.Id]
	_, inFlight := batchUpdateInFlightStores[BatchUpdateTypeUserQuota][user.Id]
	if queued || inFlight {
		return 0, ErrUserQuotaMutationPending
	}

	const takeScript = `
if redis.call('GET', KEYS[2]) ~= ARGV[2] then
  return -2
end
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[3], '-inf', now)
if redis.call('ZCARD', KEYS[3]) > 0 then
  return -3
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
		[]string{
			getUserCacheKey(user.Id),
			getUserQuotaMutationFenceKey(user.Id),
			getUserQuotaBatchPendingKey(user.Id),
		},
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

func (fences *userQuotaMutationFences) publishDelta(userID int, delta int) error {
	if fences == nil || delta == 0 || !common.RedisEnabled {
		return nil
	}
	token, ok := fences.tokens[userID]
	if !ok {
		return ErrUserQuotaMutationFenceLost
	}
	const publishScript = `
if redis.call('GET', KEYS[2]) ~= ARGV[1] then
  return 0
end
if tonumber(redis.call('HGET', KEYS[1], 'Id') or '0') == tonumber(ARGV[3])
  and tonumber(redis.call('HGET', KEYS[1], 'CacheSchema') or '0') == tonumber(ARGV[4])
  and redis.call('HEXISTS', KEYS[1], 'Quota') == 1 then
  redis.call('HINCRBY', KEYS[1], 'Quota', ARGV[2])
  redis.call('EXPIRE', KEYS[1], ARGV[5])
else
  redis.call('DEL', KEYS[1])
end
redis.call('DEL', KEYS[2])
return 1`
	ctx, cancel := userQuotaRedisContext()
	defer cancel()
	result, err := common.RDB.Eval(
		ctx,
		publishScript,
		[]string{getUserCacheKey(userID), getUserQuotaMutationFenceKey(userID)},
		token,
		delta,
		userID,
		userCacheSchemaVersion,
		userCacheTTLSeconds(),
	).Int()
	if err != nil {
		return err
	}
	if result != 1 {
		return ErrUserQuotaMutationFenceLost
	}
	delete(fences.tokens, userID)
	return nil
}

func (fences *userQuotaMutationFences) releaseUnused() {
	if fences == nil || !common.RedisEnabled {
		return
	}
	const releaseScript = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then
  return 0
end
redis.call('DEL', KEYS[1])
return 1`
	for userID, token := range fences.tokens {
		ctx, cancel := userQuotaRedisContext()
		_, err := common.RDB.Eval(
			ctx,
			releaseScript,
			[]string{getUserQuotaMutationFenceKey(userID)},
			token,
		).Int()
		cancel()
		if err != nil {
			common.SysError(fmt.Sprintf("failed to release unused quota mutation fence for user %d: %v", userID, err))
		}
		// The database/cache was not mutated under this token. Even when Redis
		// is unavailable, leave the remote lease to expire instead of letting a
		// later finalizer delete a replacement owner's balance hash.
		delete(fences.tokens, userID)
	}
}

func (fences *userQuotaMutationFences) owns(userID int) bool {
	if fences == nil {
		return false
	}
	_, ok := fences.tokens[userID]
	return ok
}

func finalizeUserQuotaMutationFences(fences *userQuotaMutationFences, committed bool) {
	if fences == nil {
		return
	}
	if committed {
		fences.finalize()
		return
	}
	fences.releaseUnused()
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
	ctx, cancel := userQuotaRedisContext()
	defer cancel()
	for userID, token := range fences.tokens {
		result, err := common.RDB.Eval(
			ctx,
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
		ctx, cancel := userQuotaRedisContext()
		result, err := common.RDB.Eval(
			ctx,
			finalizeScript,
			[]string{getUserCacheKey(userID), getUserQuotaMutationFenceKey(userID)},
			token,
			userQuotaMutationCooldownSeconds(),
		).Int()
		cancel()
		if err != nil {
			common.SysError(fmt.Sprintf("failed to finalize quota mutation fence for user %d: %v", userID, err))
			continue
		}
		if result != 1 {
			common.SysError(fmt.Sprintf("quota mutation fence lost before finalization for user %d", userID))
		}
	}
}

func invalidateUserQuotaHash(userID int) error {
	if !common.RedisEnabled {
		return nil
	}
	ctx, cancel := userQuotaRedisContext()
	defer cancel()
	return common.RDB.Del(ctx, getUserCacheKey(userID)).Err()
}

func userQuotaMutationFenceExists(userID int) (bool, error) {
	if !common.RedisEnabled {
		return false, nil
	}
	count, err := common.RDB.Exists(context.Background(), getUserQuotaMutationFenceKey(userID)).Result()
	return count > 0, err
}

func userQuotaMutationPendingExists(userID int) (bool, error) {
	if !common.RedisEnabled {
		return false, nil
	}
	const script = `
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
if redis.call('EXISTS', KEYS[1]) == 1 or redis.call('ZCARD', KEYS[2]) > 0 then
  return 1
end
return 0`
	result, err := common.RDB.Eval(
		context.Background(),
		script,
		[]string{getUserQuotaMutationFenceKey(userID), getUserQuotaBatchPendingKey(userID)},
	).Int()
	return result == 1, err
}

func refreshUserQuotaBatchPending(userID int, owner string) error {
	if !common.RedisEnabled {
		return nil
	}
	const script = `
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
redis.call('ZADD', KEYS[1], now + tonumber(ARGV[2]), ARGV[1])
redis.call('EXPIRE', KEYS[1], ARGV[3])
return 1`
	return common.RDB.Eval(
		context.Background(),
		script,
		[]string{getUserQuotaBatchPendingKey(userID)},
		owner,
		userQuotaBatchPendingLeaseMillis(),
		userQuotaBatchPendingKeyTTLSeconds(),
	).Err()
}

func clearUserQuotaBatchPending(userID int, owner string) error {
	if !common.RedisEnabled {
		return nil
	}
	const script = `
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
redis.call('ZREM', KEYS[1], ARGV[1])
if redis.call('ZCARD', KEYS[1]) == 0 then
  redis.call('DEL', KEYS[1])
end
return 1`
	return common.RDB.Eval(
		context.Background(),
		script,
		[]string{getUserQuotaBatchPendingKey(userID)},
		owner,
	).Err()
}
