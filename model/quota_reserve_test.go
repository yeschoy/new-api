package model

import (
	"context"
	"math"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type failAfterNthEvalHook struct {
	mu        sync.Mutex
	remaining int
	err       error
	fired     bool
}

func (hook *failAfterNthEvalHook) BeforeProcess(ctx context.Context, _ redis.Cmder) (context.Context, error) {
	return ctx, nil
}

func (hook *failAfterNthEvalHook) AfterProcess(_ context.Context, cmd redis.Cmder) error {
	if cmd.Name() != "eval" {
		return nil
	}
	hook.mu.Lock()
	defer hook.mu.Unlock()
	if hook.fired {
		return nil
	}
	hook.remaining--
	if hook.remaining == 0 {
		hook.fired = true
		return hook.err
	}
	return nil
}

func (*failAfterNthEvalHook) BeforeProcessPipeline(ctx context.Context, _ []redis.Cmder) (context.Context, error) {
	return ctx, nil
}

func (*failAfterNthEvalHook) AfterProcessPipeline(context.Context, []redis.Cmder) error {
	return nil
}

func createReserveTestUser(t *testing.T, quota int) User {
	t.Helper()
	user := User{
		Username:    "reserve-user-" + common.GetRandomString(6),
		Password:    "unused-password-hash",
		Role:        common.RoleCommonUser,
		Status:      common.UserStatusEnabled,
		Group:       "default",
		AuthVersion: 1,
		Quota:       quota,
		AffCode:     "reserve-aff-" + common.GetRandomString(8),
	}
	require.NoError(t, DB.Create(&user).Error)
	return user
}

func createReserveTestToken(t *testing.T, remainQuota int) Token {
	t.Helper()
	token := Token{
		UserId:      1,
		Key:         "reserve-token-" + common.GetRandomString(8),
		Name:        "reserve-test",
		Status:      common.TokenStatusEnabled,
		ExpiredTime: -1,
		RemainQuota: remainQuota,
	}
	require.NoError(t, token.Insert())
	return token
}

func getUserQuotaFromDB(t *testing.T, id int) int {
	t.Helper()
	var user User
	require.NoError(t, DB.Select("quota").First(&user, id).Error)
	return user.Quota
}

func getTokenFromDB(t *testing.T, id int) Token {
	t.Helper()
	var token Token
	require.NoError(t, DB.First(&token, id).Error)
	return token
}

func resetBatchUpdateTestState(t *testing.T) {
	t.Helper()
	oldBatchEnabled := common.BatchUpdateEnabled
	common.BatchUpdateEnabled = false
	batchUpdateRunLock.Lock()
	for i := range BatchUpdateTypeCount {
		batchUpdateLocks[i].Lock()
		batchUpdateStores[i] = make(map[int]int)
		batchUpdateInFlightStores[i] = make(map[int]int)
		batchUpdateLocks[i].Unlock()
	}
	batchUpdateRunLock.Unlock()
	t.Cleanup(func() {
		common.BatchUpdateEnabled = oldBatchEnabled
		batchUpdateRunLock.Lock()
		for i := range BatchUpdateTypeCount {
			batchUpdateLocks[i].Lock()
			batchUpdateStores[i] = make(map[int]int)
			batchUpdateInFlightStores[i] = make(map[int]int)
			batchUpdateLocks[i].Unlock()
		}
		batchUpdateRunLock.Unlock()
	})
}

func TestTryReserveQuotaWithoutRedis(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)

	user := createReserveTestUser(t, 100)
	reserved, err := TryReserveUserQuota(user.Id, 60)
	require.NoError(t, err)
	assert.True(t, reserved)
	assert.Equal(t, 40, getUserQuotaFromDB(t, user.Id))

	reserved, err = TryReserveUserQuota(user.Id, 41)
	require.NoError(t, err)
	assert.False(t, reserved)
	assert.Equal(t, 40, getUserQuotaFromDB(t, user.Id))

	token := createReserveTestToken(t, 80)
	reserved, err = TryReserveTokenQuota(token.Id, token.Key, 25, false)
	require.NoError(t, err)
	assert.True(t, reserved)
	reloaded := getTokenFromDB(t, token.Id)
	assert.Equal(t, 55, reloaded.RemainQuota)
	assert.Equal(t, 25, reloaded.UsedQuota)

	reserved, err = TryReserveTokenQuota(token.Id, token.Key, 56, false)
	require.NoError(t, err)
	assert.False(t, reserved)
	assert.Equal(t, 55, getTokenFromDB(t, token.Id).RemainQuota)
}

func TestRedisBatchReserveNeverFallsBackToStaleDatabaseBalance(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)
	useUserCacheMiniRedis(t)
	common.BatchUpdateEnabled = true

	user := createReserveTestUser(t, 10)
	reserved, err := TryReserveUserQuota(user.Id, 3)
	require.NoError(t, err)
	assert.True(t, reserved)
	assert.Equal(t, 10, getUserQuotaFromDB(t, user.Id), "batch delta is not flushed yet")

	reserved, err = TryReserveUserQuota(user.Id, 4)
	require.NoError(t, err)
	assert.True(t, reserved, "a warm Redis balance remains authoritative while the batch marker exists")
	reserved, err = TryReserveUserQuota(user.Id, 4)
	require.NoError(t, err)
	assert.False(t, reserved, "stale DB balance must not authorize an unaffordable spend")
	cachedUser, err := GetUserCache(user.Id)
	require.NoError(t, err)
	assert.Equal(t, 3, cachedUser.Quota)
	cachedQuota, err := GetUserQuota(user.Id, false)
	require.NoError(t, err)
	assert.Equal(t, 3, cachedQuota)

	token := createReserveTestToken(t, 9)
	reserved, err = TryReserveTokenQuota(token.Id, token.Key, 7, false)
	require.NoError(t, err)
	assert.True(t, reserved)
	reserved, err = TryReserveTokenQuota(token.Id, token.Key, 3, false)
	require.NoError(t, err)
	assert.False(t, reserved)
	assert.Equal(t, 9, getTokenFromDB(t, token.Id).RemainQuota)

	pending, err := userQuotaMutationPendingExists(user.Id)
	require.NoError(t, err)
	assert.True(t, pending)
	batchUpdate()
	assert.Equal(t, 3, getUserQuotaFromDB(t, user.Id))
	pending, err = userQuotaMutationPendingExists(user.Id)
	require.NoError(t, err)
	assert.False(t, pending)
	reloadedToken := getTokenFromDB(t, token.Id)
	assert.Equal(t, 2, reloadedToken.RemainQuota)
	assert.Equal(t, 7, reloadedToken.UsedQuota)
}

func TestBatchUpdateAccumulatesTwoMaximumRequestCharges(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)
	common.BatchUpdateEnabled = true

	user := createReserveTestUser(t, common.MaxQuota*2+100)
	require.NoError(t, DecreaseUserQuota(user.Id, common.MaxQuota, false))
	require.NoError(t, DecreaseUserQuota(user.Id, common.MaxQuota, false))

	batchUpdate()
	assert.Equal(t, 100, getUserQuotaFromDB(t, user.Id))
}

func TestQuotaFenceRejectsColdCacheWithQueuedOrInFlightBatchDelta(t *testing.T) {
	for _, testCase := range []struct {
		name     string
		setDelta func(userID int)
	}{
		{
			name: "queued",
			setDelta: func(userID int) {
				addNewRecord(BatchUpdateTypeUserQuota, userID, 5_000)
			},
		},
		{
			name: "in_flight",
			setDelta: func(userID int) {
				batchUpdateLocks[BatchUpdateTypeUserQuota].Lock()
				batchUpdateInFlightStores[BatchUpdateTypeUserQuota][userID] = 5_000
				batchUpdateLocks[BatchUpdateTypeUserQuota].Unlock()
			},
		},
		{
			name: "queued_net_zero",
			setDelta: func(userID int) {
				addNewRecord(BatchUpdateTypeUserQuota, userID, 5_000)
				addNewRecord(BatchUpdateTypeUserQuota, userID, -5_000)
			},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			truncateTables(t)
			resetBatchUpdateTestState(t)
			useUserCacheMiniRedis(t)
			common.BatchUpdateEnabled = true

			user := createReserveTestUser(t, 0)
			fences, err := acquireUserQuotaMutationFences(user.Id)
			require.NoError(t, err)
			defer fences.finalize()
			testCase.setDelta(user.Id)

			_, err = fences.takeAvailable(user, 5_000)
			assert.ErrorIs(t, err, ErrUserQuotaMutationPending)
			assert.Equal(t, 0, getUserQuotaFromDB(t, user.Id))
		})
	}
}

func TestSharedBatchMarkerBlocksCrossInstanceColdCacheRecovery(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)
	server := useUserCacheMiniRedis(t)
	common.BatchUpdateEnabled = true

	user := createReserveTestUser(t, 0)
	require.NoError(t, populateUserCache(user))
	require.NoError(t, queueUserQuotaBatchDelta(user.Id, 5_000))
	assert.Greater(
		t,
		server.TTL(getUserQuotaBatchPendingKey(user.Id)),
		server.TTL(getUserCacheKey(user.Id)),
		"a crashed writer's shared marker must outlive its stale cache hash",
	)
	require.NoError(t, common.RDB.Del(t.Context(), getUserCacheKey(user.Id)).Err())

	// Remove this process's local evidence to model a second application
	// instance. Redis remains the only shared pending signal.
	batchUpdateLocks[BatchUpdateTypeUserQuota].Lock()
	delete(batchUpdateStores[BatchUpdateTypeUserQuota], user.Id)
	batchUpdateLocks[BatchUpdateTypeUserQuota].Unlock()

	identity, err := GetUserCache(user.Id)
	require.NoError(t, err, "identity reads may use the direct database snapshot")
	assert.Equal(t, 0, identity.Quota)
	assert.False(t, server.Exists(getUserCacheKey(user.Id)), "a pending batch marker must prevent stale quota hydration")
	_, err = GetUserQuota(user.Id, false)
	assert.ErrorIs(t, err, ErrUserQuotaMutationPending)
	assert.False(t, server.Exists(getUserCacheKey(user.Id)))

	_, err = acquireUserQuotaMutationFences(user.Id)
	assert.ErrorIs(t, err, ErrUserQuotaMutationPending)
	assert.Equal(t, 0, getUserQuotaFromDB(t, user.Id))
}

func TestCommittedCreditPublishesBeforeReleasingQuotaFence(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)
	useUserCacheMiniRedis(t)

	user := createReserveTestUser(t, 10_000)
	require.NoError(t, populateUserCache(user))
	fences, err := acquireUserQuotaMutationFences(user.Id)
	require.NoError(t, err)
	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		if err := creditTopUpQuotaProtected(tx, user.Id, 5_000, nil, fences); err != nil {
			return err
		}
		_, err := acquireUserQuotaMutationFences(user.Id)
		assert.ErrorIs(t, err, ErrUserQuotaMutationPending)
		return nil
	}))
	defer fences.finalize()

	syncCreditUserQuotaCache(fences, user.Id, 5_000, "test credit")

	assert.Equal(t, 15_000, getUserQuotaFromDB(t, user.Id))
	cachedQuota, err := common.RDB.HGet(t.Context(), getUserCacheKey(user.Id), "Quota").Int()
	require.NoError(t, err)
	assert.Equal(t, 15_000, cachedQuota)
	pending, err := userQuotaMutationPendingExists(user.Id)
	require.NoError(t, err)
	assert.False(t, pending)
}

func TestDirectDebitCannotCommitWhileProtectedCreditOwnsFence(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)
	useUserCacheMiniRedis(t)
	common.BatchUpdateEnabled = false

	user := createReserveTestUser(t, 100)
	require.NoError(t, populateUserCache(user))
	creditFences, err := acquireUserQuotaMutationFences(user.Id)
	require.NoError(t, err)
	defer creditFences.finalize()

	err = DecreaseUserQuota(user.Id, 30, true)
	assert.ErrorIs(t, err, ErrUserQuotaMutationPending)
	assert.Equal(t, 100, getUserQuotaFromDB(t, user.Id), "a debit without fence ownership must fail before its database mutation")

	require.NoError(t, DB.Transaction(func(tx *gorm.DB) error {
		return creditTopUpQuotaProtected(tx, user.Id, 50, nil, creditFences)
	}))
	syncCreditUserQuotaCache(creditFences, user.Id, 50, "concurrent debit regression")
	require.NoError(t, DecreaseUserQuota(user.Id, 30, true), "the debit may retry after the winning credit releases its fence")

	assert.Equal(t, 120, getUserQuotaFromDB(t, user.Id))
	quota, err := GetUserQuota(user.Id, false)
	require.NoError(t, err)
	assert.Equal(t, 120, quota)
	reserved, err := TryReserveUserQuota(user.Id, 121)
	require.NoError(t, err)
	assert.False(t, reserved, "spending authority must not exceed the committed database balance")
}

func TestDirectDebitPublicationFailureInvalidatesSpendAuthority(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)
	useUserCacheMiniRedis(t)
	common.BatchUpdateEnabled = false

	user := createReserveTestUser(t, 100)
	require.NoError(t, populateUserCache(user))
	common.RDB.AddHook(&failAfterNthEvalHook{remaining: 3, err: context.DeadlineExceeded})

	require.NoError(t, DecreaseUserQuota(user.Id, 30, true), "a committed debit must not be reported as rolled back when cache publication is ambiguous")
	assert.Equal(t, 70, getUserQuotaFromDB(t, user.Id))
	assert.Zero(t, common.RDB.Exists(t.Context(), getUserCacheKey(user.Id)).Val(), "ambiguous publication must invalidate the cached spend authority")

	quota, err := GetUserQuota(user.Id, false)
	require.NoError(t, err)
	assert.Equal(t, 70, quota, "after an executed-but-unacknowledged publication, rehydration must use committed DB")
	reserved, err := TryReserveUserQuota(user.Id, 71)
	require.NoError(t, err)
	assert.False(t, reserved)
}

func TestDirectQuotaMutationRollsBackWhenFenceOwnershipIsLost(t *testing.T) {
	for _, testCase := range []struct {
		name   string
		mutate func(userID int) error
	}{
		{
			name: "increase",
			mutate: func(userID int) error {
				return IncreaseUserQuota(userID, 25, true)
			},
		},
		{
			name: "decrease",
			mutate: func(userID int) error {
				return DecreaseUserQuota(userID, 25, true)
			},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			truncateTables(t)
			resetBatchUpdateTestState(t)
			useUserCacheMiniRedis(t)

			user := createReserveTestUser(t, 100)
			require.NoError(t, populateUserCache(user))
			const replacementOwner = "replacement-owner"
			callbackName := "test:direct-quota-fence-loss-" + testCase.name
			replaced := false
			require.NoError(t, DB.Callback().Update().After("gorm:update").Register(callbackName, func(tx *gorm.DB) {
				if !replaced && tx.Statement.Table == "users" {
					replaced = true
					_ = common.RDB.Set(t.Context(), getUserQuotaMutationFenceKey(user.Id), replacementOwner, time.Minute).Err()
				}
			}))
			callbackRegistered := true
			t.Cleanup(func() {
				if callbackRegistered {
					_ = DB.Callback().Update().Remove(callbackName)
				}
			})

			err := testCase.mutate(user.Id)
			assert.ErrorIs(t, err, ErrUserQuotaMutationFenceLost)
			require.NoError(t, DB.Callback().Update().Remove(callbackName))
			callbackRegistered = false
			assert.True(t, replaced)
			assert.Equal(t, 100, getUserQuotaFromDB(t, user.Id), "lost ownership must roll back the database quota mutation")
			owner, ownerErr := common.RDB.Get(t.Context(), getUserQuotaMutationFenceKey(user.Id)).Result()
			require.NoError(t, ownerErr)
			assert.Equal(t, replacementOwner, owner, "rollback cleanup must preserve a replacement owner")
		})
	}
}

func TestAmbiguousFenceAcquireReleasesOnlyTentativeOwner(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)
	server := useUserCacheMiniRedis(t)

	user := createReserveTestUser(t, 100)
	require.NoError(t, populateUserCache(user))
	common.RDB.AddHook(&failAfterNthEvalHook{remaining: 1, err: context.DeadlineExceeded})

	_, err := acquireUserQuotaMutationFences(user.Id)
	require.ErrorIs(t, err, context.DeadlineExceeded)
	assert.False(t, server.Exists(getUserQuotaMutationFenceKey(user.Id)), "fresh-context cleanup must remove the tentatively acquired owner")
	assert.True(t, server.Exists(getUserCacheKey(user.Id)), "unused acquisition cleanup must preserve the valid balance hash")
}

func TestUnusedFenceReleasePreservesReplacementOwner(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)
	server := useUserCacheMiniRedis(t)

	user := createReserveTestUser(t, 100)
	require.NoError(t, populateUserCache(user))
	const staleToken = "stale-owner"
	const replacementToken = "replacement-owner"
	require.NoError(t, common.RDB.Set(t.Context(), getUserQuotaMutationFenceKey(user.Id), replacementToken, time.Minute).Err())

	fences := &userQuotaMutationFences{tokens: map[int]string{user.Id: staleToken}}
	fences.releaseUnused()

	owner, err := common.RDB.Get(t.Context(), getUserQuotaMutationFenceKey(user.Id)).Result()
	require.NoError(t, err)
	assert.Equal(t, replacementToken, owner)
	assert.True(t, server.Exists(getUserCacheKey(user.Id)))
}

func TestBatchUpdateAccumulatorSaturatesOverflow(t *testing.T) {
	resetBatchUpdateTestState(t)

	addNewRecord(BatchUpdateTypeUserQuota, 1, math.MaxInt)
	addNewRecord(BatchUpdateTypeUserQuota, 1, 1)
	batchUpdateLocks[BatchUpdateTypeUserQuota].Lock()
	assert.Equal(t, math.MaxInt, batchUpdateStores[BatchUpdateTypeUserQuota][1])
	batchUpdateLocks[BatchUpdateTypeUserQuota].Unlock()

	batchUpdateLocks[BatchUpdateTypeUserQuota].Lock()
	batchUpdateStores[BatchUpdateTypeUserQuota] = make(map[int]int)
	batchUpdateLocks[BatchUpdateTypeUserQuota].Unlock()
	addNewRecord(BatchUpdateTypeUserQuota, 1, math.MinInt)
	addNewRecord(BatchUpdateTypeUserQuota, 1, -1)
	batchUpdateLocks[BatchUpdateTypeUserQuota].Lock()
	assert.Equal(t, math.MinInt, batchUpdateStores[BatchUpdateTypeUserQuota][1])
	batchUpdateLocks[BatchUpdateTypeUserQuota].Unlock()
}

func TestReserveFailsClosedWhenRedisIsUnavailable(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)
	server := useUserCacheMiniRedis(t)

	user := createReserveTestUser(t, 20)
	require.NoError(t, populateUserCache(user))
	server.Close()

	// Redis may contain authoritative unflushed quota. An outage cannot safely
	// distinguish that state from a cache miss, so spending fails closed.
	reserved, err := TryReserveUserQuota(user.Id, 5)
	assert.Error(t, err)
	assert.False(t, reserved)
	assert.Equal(t, 20, getUserQuotaFromDB(t, user.Id))
}

func TestUserQuotaMutationFenceBlocksRehydrationAndSpending(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)
	server := useUserCacheMiniRedis(t)

	initialQuota := int(operation_setting.GetQuotaSetting().TrustQuotaUSD*common.QuotaPerUnit) + 1
	user := createReserveTestUser(t, initialQuota)
	require.NoError(t, populateUserCache(user))
	fences, err := acquireUserQuotaMutationFences(user.Id)
	require.NoError(t, err)

	// Simulate TTL expiry while a money transaction is open. Neither a stale
	// snapshot nor a normal spend may cross the active fence.
	require.NoError(t, common.RDB.Del(t.Context(), getUserCacheKey(user.Id)).Err())
	err = writeUserCache(user.ToBaseUser(), true)
	assert.ErrorIs(t, err, ErrUserQuotaMutationPending)
	reserved, err := TryReserveUserQuota(user.Id, 1)
	assert.ErrorIs(t, err, ErrUserQuotaMutationPending)
	assert.False(t, reserved)
	assert.Equal(t, initialQuota, getUserQuotaFromDB(t, user.Id))

	require.NoError(t, fences.verify())
	fences.finalize()
	assert.False(t, server.Exists(getUserCacheKey(user.Id)))

	// Identity/profile reads use a direct DB snapshot during cooldown without
	// publishing it as spend authority. Even a balance above TrustQuota cannot
	// enter the billing trust bypass because the quota-specific getter fails.
	direct, err := GetUserCache(user.Id)
	require.NoError(t, err)
	assert.Equal(t, initialQuota, direct.Quota)
	assert.False(t, server.Exists(getUserCacheKey(user.Id)))
	_, err = GetUserQuota(user.Id, false)
	assert.ErrorIs(t, err, ErrUserQuotaMutationPending, "quota-authoritative reads must not enter the billing trust path")
	reserved, err = TryReserveUserQuota(user.Id, 1)
	assert.ErrorIs(t, err, ErrUserQuotaMutationPending)
	assert.False(t, reserved)
	err = writeUserCache(user.ToBaseUser(), true)
	assert.ErrorIs(t, err, ErrUserQuotaMutationPending)
	assert.False(t, server.Exists(getUserCacheKey(user.Id)))

	server.FastForward(time.Duration(userQuotaMutationCooldownSeconds()+1) * time.Second)
	fresh, err := GetUserCache(user.Id)
	require.NoError(t, err)
	assert.Equal(t, initialQuota, fresh.Quota)
	assert.True(t, server.Exists(getUserCacheKey(user.Id)))
}

func TestSynchronousReserveCompensatesCacheWhenPersistenceFails(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)
	useUserCacheMiniRedis(t)

	user := createReserveTestUser(t, 10)
	require.NoError(t, populateUserCache(user))
	require.NoError(t, DB.Delete(&user).Error)

	reserved, err := TryReserveUserQuota(user.Id, 6)
	assert.False(t, reserved)
	assert.ErrorIs(t, err, gorm.ErrRecordNotFound)
	cached, cacheErr := cacheGetUserBase(user.Id)
	require.NoError(t, cacheErr)
	assert.Equal(t, 10, cached.Quota)

	token := createReserveTestToken(t, 12)
	_, err = GetTokenByKey(token.Key, true)
	require.NoError(t, err)
	require.NoError(t, DB.Delete(&token).Error)
	reserved, err = TryReserveTokenQuota(token.Id, token.Key, 7, false)
	assert.False(t, reserved)
	assert.ErrorIs(t, err, gorm.ErrRecordNotFound)
	cachedToken, cacheErr := cacheGetTokenByKey(token.Key)
	require.NoError(t, cacheErr)
	assert.Equal(t, 12, cachedToken.RemainQuota)
	assert.Zero(t, cachedToken.UsedQuota)
}

func TestTokenCacheInitPreservesLiveQuotaAndFenceBlocksStaleSnapshot(t *testing.T) {
	truncateTables(t)
	resetBatchUpdateTestState(t)
	server := useUserCacheMiniRedis(t)

	token := createReserveTestToken(t, 100)
	loaded, err := GetTokenByKey(token.Key, true)
	require.NoError(t, err)
	stale := *loaded

	result, err := cacheApplyTokenQuotaDelta(token.Id, token.Key, -70)
	require.NoError(t, err)
	require.Equal(t, cacheQuotaOK, result)

	// 已存在的哈希只刷新 TTL：数据库快照不得覆盖已被原子预扣的余额。
	code, err := cacheInitToken(stale)
	require.NoError(t, err)
	assert.Equal(t, 2, code)
	cached, err := cacheGetTokenByKey(token.Key)
	require.NoError(t, err)
	assert.Equal(t, 30, cached.RemainQuota)

	// 变更期间：fence 删除缓存并拦截并发读者手中的过期快照。
	require.NoError(t, invalidateTokenCacheForMutation(token.Key))
	code, err = cacheInitToken(stale)
	require.NoError(t, err)
	assert.Zero(t, code, "the pre-mutation snapshot must not be published while fenced")
	_, err = cacheGetTokenByKey(token.Key)
	assert.Error(t, err)

	// fence 过期后可重新从数据库水合。
	server.FastForward(time.Duration(tokenCacheFenceSeconds+1) * time.Second)
	fresh, err := GetTokenByKey(token.Key, false)
	require.NoError(t, err)
	assert.Equal(t, 100, fresh.RemainQuota)
	cached, err = cacheGetTokenByKey(token.Key)
	require.NoError(t, err)
	assert.Equal(t, 100, cached.RemainQuota)
}
