package model

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type blockFirstEvalHook struct {
	once    sync.Once
	entered chan struct{}
	release chan struct{}
}

func newBlockFirstEvalHook() *blockFirstEvalHook {
	return &blockFirstEvalHook{entered: make(chan struct{}), release: make(chan struct{})}
}

func (hook *blockFirstEvalHook) BeforeProcess(ctx context.Context, cmd redis.Cmder) (context.Context, error) {
	if cmd.Name() == "eval" {
		hook.once.Do(func() {
			close(hook.entered)
			<-hook.release
		})
	}
	return ctx, nil
}

func (*blockFirstEvalHook) AfterProcess(context.Context, redis.Cmder) error {
	return nil
}

func (*blockFirstEvalHook) BeforeProcessPipeline(ctx context.Context, _ []redis.Cmder) (context.Context, error) {
	return ctx, nil
}

func (*blockFirstEvalHook) AfterProcessPipeline(context.Context, []redis.Cmder) error {
	return nil
}

type blockAfterFirstEvalHook struct {
	mu            sync.Mutex
	evalCount     int
	firstExecuted chan struct{}
	secondStarted chan struct{}
	releaseFirst  chan struct{}
	blockOnce     sync.Once
}

func newBlockAfterFirstEvalHook() *blockAfterFirstEvalHook {
	return &blockAfterFirstEvalHook{
		firstExecuted: make(chan struct{}),
		secondStarted: make(chan struct{}),
		releaseFirst:  make(chan struct{}),
	}
}

func (hook *blockAfterFirstEvalHook) BeforeProcess(ctx context.Context, cmd redis.Cmder) (context.Context, error) {
	if cmd.Name() == "eval" {
		hook.mu.Lock()
		hook.evalCount++
		if hook.evalCount == 2 {
			close(hook.secondStarted)
		}
		hook.mu.Unlock()
	}
	return ctx, nil
}

func (hook *blockAfterFirstEvalHook) AfterProcess(_ context.Context, cmd redis.Cmder) error {
	if cmd.Name() == "eval" {
		hook.blockOnce.Do(func() {
			close(hook.firstExecuted)
			<-hook.releaseFirst
		})
	}
	return nil
}

func (*blockAfterFirstEvalHook) BeforeProcessPipeline(ctx context.Context, _ []redis.Cmder) (context.Context, error) {
	return ctx, nil
}

func (*blockAfterFirstEvalHook) AfterProcessPipeline(context.Context, []redis.Cmder) error {
	return nil
}

type evalOrdinalContextKey struct{}

type blockSecondEvalReplyHook struct {
	mu             sync.Mutex
	evalCount      int
	firstExecuted  chan struct{}
	secondExecuted chan struct{}
	releaseFirst   chan struct{}
	releaseSecond  chan struct{}
	secondErr      error
}

func newBlockSecondEvalReplyHook(secondErr error) *blockSecondEvalReplyHook {
	return &blockSecondEvalReplyHook{
		firstExecuted:  make(chan struct{}),
		secondExecuted: make(chan struct{}),
		releaseFirst:   make(chan struct{}),
		releaseSecond:  make(chan struct{}),
		secondErr:      secondErr,
	}
}

func (hook *blockSecondEvalReplyHook) BeforeProcess(ctx context.Context, cmd redis.Cmder) (context.Context, error) {
	if cmd.Name() != "eval" {
		return ctx, nil
	}
	hook.mu.Lock()
	hook.evalCount++
	ordinal := hook.evalCount
	hook.mu.Unlock()
	return context.WithValue(ctx, evalOrdinalContextKey{}, ordinal), nil
}

func (hook *blockSecondEvalReplyHook) AfterProcess(ctx context.Context, cmd redis.Cmder) error {
	if cmd.Name() != "eval" {
		return nil
	}
	ordinal, _ := ctx.Value(evalOrdinalContextKey{}).(int)
	switch ordinal {
	case 1:
		close(hook.firstExecuted)
		<-hook.releaseFirst
	case 2:
		close(hook.secondExecuted)
		<-hook.releaseSecond
		return hook.secondErr
	}
	return nil
}

func (*blockSecondEvalReplyHook) BeforeProcessPipeline(ctx context.Context, _ []redis.Cmder) (context.Context, error) {
	return ctx, nil
}

func (*blockSecondEvalReplyHook) AfterProcessPipeline(context.Context, []redis.Cmder) error {
	return nil
}

func closeTestChannel(channel chan struct{}) {
	select {
	case <-channel:
	default:
		close(channel)
	}
}

func insertUserForPaymentGuardTest(t *testing.T, id int, quota int) *User {
	t.Helper()
	user := &User{
		Id:       id,
		Username: "payment_guard_user",
		Status:   common.UserStatusEnabled,
		Quota:    quota,
	}
	require.NoError(t, DB.Create(user).Error)
	return user
}

func insertSubscriptionPlanForPaymentGuardTest(t *testing.T, id int) *SubscriptionPlan {
	t.Helper()
	plan := &SubscriptionPlan{
		Id:            id,
		Title:         "Guard Plan",
		PriceAmount:   9.99,
		Currency:      "USD",
		DurationUnit:  SubscriptionDurationMonth,
		DurationValue: 1,
		Enabled:       true,
		TotalAmount:   1000,
	}
	require.NoError(t, DB.Create(plan).Error)
	return plan
}

func insertSubscriptionOrderForPaymentGuardTest(t *testing.T, tradeNo string, userID int, planID int, paymentProvider string) {
	t.Helper()
	order := &SubscriptionOrder{
		UserId:          userID,
		PlanId:          planID,
		Money:           9.99,
		TradeNo:         tradeNo,
		PaymentMethod:   paymentProvider,
		PaymentProvider: paymentProvider,
		Status:          common.TopUpStatusPending,
		CreateTime:      time.Now().Unix(),
	}
	require.NoError(t, order.Insert())
}

func insertTopUpForPaymentGuardTest(t *testing.T, tradeNo string, userID int, paymentProvider string) {
	t.Helper()
	topUp := &TopUp{
		UserId:          userID,
		Amount:          2,
		Money:           9.99,
		TradeNo:         tradeNo,
		PaymentMethod:   paymentProvider,
		PaymentProvider: paymentProvider,
		Status:          common.TopUpStatusPending,
		CreateTime:      time.Now().Unix(),
	}
	require.NoError(t, topUp.Insert())
}

func getTopUpStatusForPaymentGuardTest(t *testing.T, tradeNo string) string {
	t.Helper()
	topUp := GetTopUpByTradeNo(tradeNo)
	require.NotNil(t, topUp)
	return topUp.Status
}

func countUserSubscriptionsForPaymentGuardTest(t *testing.T, userID int) int64 {
	t.Helper()
	var count int64
	require.NoError(t, DB.Model(&UserSubscription{}).Where("user_id = ?", userID).Count(&count).Error)
	return count
}

func getUserQuotaForPaymentGuardTest(t *testing.T, userID int) int {
	t.Helper()
	var user User
	require.NoError(t, DB.Select("quota").Where("id = ?", userID).First(&user).Error)
	return user.Quota
}

func TestRechargeWaffoPancake_RejectsMismatchedPaymentMethod(t *testing.T) {
	truncateTables(t)

	insertUserForPaymentGuardTest(t, 101, 0)
	insertTopUpForPaymentGuardTest(t, "waffo-pancake-guard", 101, PaymentProviderStripe)

	err := RechargeWaffoPancake("waffo-pancake-guard")
	require.Error(t, err)

	topUp := GetTopUpByTradeNo("waffo-pancake-guard")
	require.NotNil(t, topUp)
	assert.Equal(t, common.TopUpStatusPending, topUp.Status)
	assert.Equal(t, 0, getUserQuotaForPaymentGuardTest(t, 101))
}

func TestUpdatePendingTopUpStatus_RejectsMismatchedPaymentProvider(t *testing.T) {
	testCases := []struct {
		name                    string
		tradeNo                 string
		storedPaymentProvider   string
		expectedPaymentProvider string
		targetStatus            string
	}{
		{
			name:                    "stripe expire",
			tradeNo:                 "stripe-expire-guard",
			storedPaymentProvider:   PaymentProviderCreem,
			expectedPaymentProvider: PaymentProviderStripe,
			targetStatus:            common.TopUpStatusExpired,
		},
		{
			name:                    "waffo failed",
			tradeNo:                 "waffo-failed-guard",
			storedPaymentProvider:   PaymentProviderStripe,
			expectedPaymentProvider: PaymentProviderWaffo,
			targetStatus:            common.TopUpStatusFailed,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			truncateTables(t)
			insertUserForPaymentGuardTest(t, 150, 0)
			insertTopUpForPaymentGuardTest(t, tc.tradeNo, 150, tc.storedPaymentProvider)

			err := UpdatePendingTopUpStatus(tc.tradeNo, tc.expectedPaymentProvider, tc.targetStatus)
			require.ErrorIs(t, err, ErrPaymentMethodMismatch)
			assert.Equal(t, common.TopUpStatusPending, getTopUpStatusForPaymentGuardTest(t, tc.tradeNo))
		})
	}
}

func TestCompleteSubscriptionOrder_RejectsMismatchedPaymentProvider(t *testing.T) {
	truncateTables(t)

	insertUserForPaymentGuardTest(t, 202, 0)
	plan := insertSubscriptionPlanForPaymentGuardTest(t, 301)
	insertSubscriptionOrderForPaymentGuardTest(t, "sub-guard-order", 202, plan.Id, PaymentProviderStripe)

	err := CompleteSubscriptionOrder("sub-guard-order", `{"provider":"epay"}`, PaymentProviderEpay, "alipay")
	require.ErrorIs(t, err, ErrPaymentMethodMismatch)

	order := GetSubscriptionOrderByTradeNo("sub-guard-order")
	require.NotNil(t, order)
	assert.Equal(t, common.TopUpStatusPending, order.Status)
	assert.Zero(t, countUserSubscriptionsForPaymentGuardTest(t, 202))

	topUp := GetTopUpByTradeNo("sub-guard-order")
	assert.Nil(t, topUp)
}

func TestExpireSubscriptionOrder_RejectsMismatchedPaymentProvider(t *testing.T) {
	truncateTables(t)

	insertUserForPaymentGuardTest(t, 303, 0)
	plan := insertSubscriptionPlanForPaymentGuardTest(t, 401)
	insertSubscriptionOrderForPaymentGuardTest(t, "sub-expire-guard", 303, plan.Id, PaymentProviderStripe)

	err := ExpireSubscriptionOrder("sub-expire-guard", PaymentProviderCreem)
	require.ErrorIs(t, err, ErrPaymentMethodMismatch)

	order := GetSubscriptionOrderByTradeNo("sub-expire-guard")
	require.NotNil(t, order)
	assert.Equal(t, common.TopUpStatusPending, order.Status)
}

func createEpayTestOrder(t *testing.T, userId int, tradeNo string, provider string, status string) TopUp {
	t.Helper()
	topUp := TopUp{
		UserId:          userId,
		Amount:          2,
		Money:           10.0,
		TradeNo:         tradeNo,
		PaymentMethod:   "alipay",
		PaymentProvider: provider,
		CreateTime:      common.GetTimestamp(),
		Status:          status,
	}
	require.NoError(t, DB.Create(&topUp).Error)
	return topUp
}

func TestBalanceSubscriptionDebitRequiresQuotaFenceOwnership(t *testing.T) {
	truncateTables(t)
	useUserCacheMiniRedis(t)

	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 10
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })

	user := insertUserForPaymentGuardTest(t, 509, 1_000)
	require.NoError(t, populateUserCache(*user))
	plan := insertSubscriptionPlanForPaymentGuardTest(t, 509)
	owner, err := acquireUserQuotaMutationFences(user.Id)
	require.NoError(t, err)

	err = PurchaseSubscriptionWithBalance(user.Id, plan.Id)
	assert.ErrorIs(t, err, ErrUserQuotaMutationPending)
	assert.Equal(t, 1_000, getUserQuotaForPaymentGuardTest(t, user.Id))
	assert.Zero(t, countUserSubscriptionsForPaymentGuardTest(t, user.Id))
	owner.releaseUnused()
}

func TestBalanceSubscriptionRollsBackWhenQuotaFenceOwnershipIsLost(t *testing.T) {
	oldDB := DB
	isolatedDB, err := gorm.Open(sqlite.Open("file:subscription-fence-"+common.GetRandomString(8)+"?mode=memory&cache=shared"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := isolatedDB.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(2)
	require.NoError(t, isolatedDB.AutoMigrate(&User{}, &SubscriptionPlan{}, &UserSubscription{}, &SubscriptionOrder{}))
	DB = isolatedDB
	t.Cleanup(func() {
		DB = oldDB
		_ = sqlDB.Close()
	})
	useUserCacheMiniRedis(t)

	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 10
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })

	user := insertUserForPaymentGuardTest(t, 512, 1_000)
	require.NoError(t, populateUserCache(*user))
	plan := insertSubscriptionPlanForPaymentGuardTest(t, 512)
	const replacementOwner = "subscription-replacement-owner"
	callbackName := "test:subscription-quota-fence-loss"
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

	err = PurchaseSubscriptionWithBalance(user.Id, plan.Id)
	assert.ErrorIs(t, err, ErrUserQuotaMutationFenceLost)
	require.NoError(t, DB.Callback().Update().Remove(callbackName))
	callbackRegistered = false
	assert.True(t, replaced)
	assert.Equal(t, 1_000, getUserQuotaForPaymentGuardTest(t, user.Id))
	assert.Zero(t, countUserSubscriptionsForPaymentGuardTest(t, user.Id))
	var orderCount int64
	require.NoError(t, DB.Model(&SubscriptionOrder{}).Where("user_id = ?", user.Id).Count(&orderCount).Error)
	assert.Zero(t, orderCount)
	owner, ownerErr := common.RDB.Get(t.Context(), getUserQuotaMutationFenceKey(user.Id)).Result()
	require.NoError(t, ownerErr)
	assert.Equal(t, replacementOwner, owner)
}

func TestRechargeEpayCreditsQuotaExactlyOnce(t *testing.T) {
	truncateTables(t)

	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 500000
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })

	user := insertUserForPaymentGuardTest(t, 501, 0)
	order := createEpayTestOrder(t, user.Id, "EPAYTESTONCE", PaymentProviderEpay, common.TopUpStatusPending)

	alreadyDone, err := RechargeEpay(order.TradeNo, "alipay", "127.0.0.1")
	require.NoError(t, err)
	assert.False(t, alreadyDone)
	assert.Equal(t, 2*500000, getUserQuotaForPaymentGuardTest(t, user.Id))

	reloaded := GetTopUpByTradeNo(order.TradeNo)
	require.NotNil(t, reloaded)
	assert.Equal(t, common.TopUpStatusSuccess, reloaded.Status)
	assert.NotZero(t, reloaded.CompleteTime)

	alreadyDone, err = RechargeEpay(order.TradeNo, "alipay", "127.0.0.1")
	require.NoError(t, err)
	assert.True(t, alreadyDone)
	assert.Equal(t, 2*500000, getUserQuotaForPaymentGuardTest(t, user.Id))
}

func TestOverlappingRechargeEpayCallbacksReturnIdempotentSuccess(t *testing.T) {
	truncateTables(t)
	useUserCacheMiniRedis(t)

	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 5
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })

	user := insertUserForPaymentGuardTest(t, 508, 7)
	require.NoError(t, populateUserCache(*user))
	order := createEpayTestOrder(t, user.Id, "EPAYTESTOVERLAPPING", PaymentProviderEpay, common.TopUpStatusPending)
	hook := newBlockAfterFirstEvalHook()
	common.RDB.AddHook(hook)

	type result struct {
		alreadyDone bool
		err         error
	}
	firstDone := make(chan result, 1)
	secondDone := make(chan result, 1)
	go func() {
		alreadyDone, err := RechargeEpay(order.TradeNo, "wxpay", "127.0.0.1")
		firstDone <- result{alreadyDone: alreadyDone, err: err}
	}()
	select {
	case <-hook.firstExecuted:
	case <-time.After(2 * time.Second):
		t.Fatal("first callback did not acquire the quota fence")
	}
	go func() {
		alreadyDone, err := RechargeEpay(order.TradeNo, "wxpay", "127.0.0.1")
		secondDone <- result{alreadyDone: alreadyDone, err: err}
	}()
	select {
	case <-hook.secondStarted:
	case <-time.After(2 * time.Second):
		close(hook.releaseFirst)
		t.Fatal("overlapping callback did not contend for the quota fence")
	}
	close(hook.releaseFirst)

	first := <-firstDone
	second := <-secondDone
	require.NoError(t, first.err)
	require.NoError(t, second.err)
	assert.NotEqual(t, first.alreadyDone, second.alreadyDone, "exactly one callback must perform the credit")
	assert.Equal(t, 17, getUserQuotaForPaymentGuardTest(t, user.Id))
	cached, err := cacheGetUserBase(user.Id)
	require.NoError(t, err)
	assert.Equal(t, 17, cached.Quota)
}

func runOverlappingEpayAcquisitionReplyRace(t *testing.T, userID int, tradeNo string, secondErr error, waitForDeadline bool) {
	t.Helper()
	truncateTables(t)
	useUserCacheMiniRedis(t)

	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 5
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })

	user := insertUserForPaymentGuardTest(t, userID, 7)
	require.NoError(t, populateUserCache(*user))
	order := createEpayTestOrder(t, user.Id, tradeNo, PaymentProviderEpay, common.TopUpStatusPending)
	hook := newBlockSecondEvalReplyHook(secondErr)
	common.RDB.AddHook(hook)
	t.Cleanup(func() {
		closeTestChannel(hook.releaseFirst)
		closeTestChannel(hook.releaseSecond)
	})

	type callbackResult struct {
		alreadyDone bool
		err         error
	}
	firstDone := make(chan callbackResult, 1)
	secondDone := make(chan callbackResult, 1)
	go func() {
		alreadyDone, err := RechargeEpay(order.TradeNo, "wxpay", "127.0.0.1")
		firstDone <- callbackResult{alreadyDone: alreadyDone, err: err}
	}()
	select {
	case <-hook.firstExecuted:
	case <-time.After(2 * time.Second):
		t.Fatal("first callback did not acquire the quota fence")
	}

	secondStartedAt := time.Now()
	go func() {
		alreadyDone, err := RechargeEpay(order.TradeNo, "wxpay", "127.0.0.1")
		secondDone <- callbackResult{alreadyDone: alreadyDone, err: err}
	}()
	select {
	case <-hook.secondExecuted:
	case <-time.After(2 * time.Second):
		t.Fatal("second callback did not reach the contended acquisition response")
	}

	closeTestChannel(hook.releaseFirst)
	var first callbackResult
	select {
	case first = <-firstDone:
	case <-time.After(3 * time.Second):
		t.Fatal("winning callback did not complete")
	}
	if waitForDeadline {
		remaining := secondStartedAt.Add(topUpQuotaFenceWaitTimeout + topUpQuotaFenceRetryInterval).Sub(time.Now())
		if remaining > 0 {
			time.Sleep(remaining)
		}
	}
	closeTestChannel(hook.releaseSecond)

	var second callbackResult
	select {
	case second = <-secondDone:
	case <-time.After(3 * time.Second):
		t.Fatal("contending callback did not finish after its acquisition response was released")
	}
	require.NoError(t, first.err)
	require.NoError(t, second.err)
	assert.NotEqual(t, first.alreadyDone, second.alreadyDone, "exactly one callback must perform the credit")
	assert.Equal(t, 17, getUserQuotaForPaymentGuardTest(t, user.Id))
	cached, err := cacheGetUserBase(user.Id)
	require.NoError(t, err)
	assert.Equal(t, 17, cached.Quota)
}

func TestOverlappingRechargeEpayAcquisitionErrorRereadsIdempotentSuccess(t *testing.T) {
	runOverlappingEpayAcquisitionReplyRace(
		t,
		510,
		"EPAYTESTACQUIREERRORREREAD",
		context.DeadlineExceeded,
		false,
	)
}

func TestOverlappingRechargeEpayTerminalContentionRereadsIdempotentSuccess(t *testing.T) {
	runOverlappingEpayAcquisitionReplyRace(
		t,
		511,
		"EPAYTESTTERMINALREREAD",
		nil,
		true,
	)
}

func TestRechargeEpayKeepsRedisAndDatabaseCreditInSync(t *testing.T) {
	truncateTables(t)
	useUserCacheMiniRedis(t)

	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 5
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })

	user := insertUserForPaymentGuardTest(t, 502, 7)
	require.NoError(t, populateUserCache(*user))
	order := createEpayTestOrder(t, user.Id, "EPAYTESTREDISSYNC", PaymentProviderEpay, common.TopUpStatusPending)

	alreadyDone, err := RechargeEpay(order.TradeNo, "alipay", "127.0.0.1")
	require.NoError(t, err)
	assert.False(t, alreadyDone)
	assert.Equal(t, 17, getUserQuotaForPaymentGuardTest(t, user.Id))
	cached, err := cacheGetUserBase(user.Id)
	require.NoError(t, err)
	assert.Equal(t, 17, cached.Quota)

	alreadyDone, err = RechargeEpay(order.TradeNo, "alipay", "127.0.0.1")
	require.NoError(t, err)
	assert.True(t, alreadyDone)
	cached, err = cacheGetUserBase(user.Id)
	require.NoError(t, err)
	assert.Equal(t, 17, cached.Quota)
}

func TestRechargeEpayAcquiresQuotaFenceBeforeLockingOrder(t *testing.T) {
	truncateTables(t)
	server := useUserCacheMiniRedis(t)

	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 5
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })

	user := insertUserForPaymentGuardTest(t, 507, 7)
	require.NoError(t, populateUserCache(*user))
	order := createEpayTestOrder(t, user.Id, "EPAYTESTFENCEBEFORELOCK", PaymentProviderEpay, common.TopUpStatusPending)
	hook := newBlockFirstEvalHook()
	common.RDB.AddHook(hook)

	type rechargeResult struct {
		alreadyDone bool
		err         error
	}
	rechargeDone := make(chan rechargeResult, 1)
	go func() {
		alreadyDone, err := RechargeEpay(order.TradeNo, "alipay", "127.0.0.1")
		rechargeDone <- rechargeResult{alreadyDone: alreadyDone, err: err}
	}()

	select {
	case <-hook.entered:
	case <-time.After(2 * time.Second):
		t.Fatal("quota fence acquisition did not reach Redis")
	}

	updateDone := make(chan error, 1)
	go func() {
		updateDone <- DB.Model(&TopUp{}).Where("id = ?", order.Id).Update("payment_method", "wxpay").Error
	}()
	select {
	case err := <-updateDone:
		require.NoError(t, err, "the top-up row must not be locked while Redis fence acquisition is waiting")
	case <-time.After(500 * time.Millisecond):
		close(hook.release)
		t.Fatal("database update blocked while Redis fence acquisition was delayed")
	}
	close(hook.release)

	result := <-rechargeDone
	assert.False(t, result.alreadyDone)
	assert.ErrorIs(t, result.err, ErrTopUpStatusInvalid, "transactional revalidation must reject the changed order")
	assert.Equal(t, 7, getUserQuotaForPaymentGuardTest(t, user.Id))
	assert.Equal(t, common.TopUpStatusPending, getTopUpStatusForPaymentGuardTest(t, order.TradeNo))
	assert.False(t, server.Exists(getUserQuotaMutationFenceKey(user.Id)), "unused owned fence must be released")
	cached, err := cacheGetUserBase(user.Id)
	require.NoError(t, err)
	assert.Equal(t, 7, cached.Quota, "unused fence release must preserve the valid balance hash")
}

func TestRechargeEpayUpdatesPaymentMethodToActual(t *testing.T) {
	truncateTables(t)

	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 500000
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })

	user := insertUserForPaymentGuardTest(t, 503, 0)
	order := createEpayTestOrder(t, user.Id, "EPAYTESTMETHOD", PaymentProviderEpay, common.TopUpStatusPending)

	alreadyDone, err := RechargeEpay(order.TradeNo, "wxpay", "127.0.0.1")
	require.NoError(t, err)
	assert.False(t, alreadyDone)

	reloaded := GetTopUpByTradeNo(order.TradeNo)
	require.NotNil(t, reloaded)
	assert.Equal(t, "wxpay", reloaded.PaymentMethod)
	assert.Equal(t, 2*500000, getUserQuotaForPaymentGuardTest(t, user.Id))
}

func TestRechargeEpayRejectsForeignAndNonPendingOrders(t *testing.T) {
	truncateTables(t)

	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 500000
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })

	user := insertUserForPaymentGuardTest(t, 504, 7)

	t.Run("order from another payment provider", func(t *testing.T) {
		order := createEpayTestOrder(t, user.Id, "EPAYTESTSTRIPE", PaymentProviderStripe, common.TopUpStatusPending)
		_, err := RechargeEpay(order.TradeNo, "alipay", "127.0.0.1")
		assert.ErrorIs(t, err, ErrPaymentMethodMismatch)
		assert.Equal(t, 7, getUserQuotaForPaymentGuardTest(t, user.Id))
	})

	t.Run("order that is not pending", func(t *testing.T) {
		order := createEpayTestOrder(t, user.Id, "EPAYTESTEXPIRED", PaymentProviderEpay, common.TopUpStatusExpired)
		_, err := RechargeEpay(order.TradeNo, "alipay", "127.0.0.1")
		assert.ErrorIs(t, err, ErrTopUpStatusInvalid)
		assert.Equal(t, 7, getUserQuotaForPaymentGuardTest(t, user.Id))
	})

	t.Run("missing order", func(t *testing.T) {
		_, err := RechargeEpay("EPAYTESTMISSING", "alipay", "127.0.0.1")
		assert.ErrorIs(t, err, ErrTopUpNotFound)
	})
}

func TestRechargeEpayRejectsQuotaOverflowBeforeCompletingOrder(t *testing.T) {
	truncateTables(t)

	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = float64(common.MaxWalletQuota + 1)
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })

	user := insertUserForPaymentGuardTest(t, 505, 3)
	order := createEpayTestOrder(t, user.Id, "EPAYTESTOVERFLOW", PaymentProviderEpay, common.TopUpStatusPending)

	_, err := RechargeEpay(order.TradeNo, "alipay", "127.0.0.1")
	require.Error(t, err)
	assert.Equal(t, 3, getUserQuotaForPaymentGuardTest(t, user.Id))
	assert.Equal(t, common.TopUpStatusPending, getTopUpStatusForPaymentGuardTest(t, order.TradeNo))
}

func TestRechargeEpayEnforcesFinalWalletQuotaLimit(t *testing.T) {
	oldQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 500000
	t.Cleanup(func() { common.QuotaPerUnit = oldQuotaPerUnit })

	testCases := []struct {
		name         string
		currentQuota int
		wantErr      bool
		wantQuota    int
		wantStatus   string
	}{
		{
			name:         "allows exact highest representable wallet balance",
			currentQuota: common.MaxWalletQuota - 1_000_000,
			wantQuota:    common.MaxWalletQuota,
			wantStatus:   common.TopUpStatusSuccess,
		},
		{
			name:         "rejects balance above wallet quota domain",
			currentQuota: common.MaxWalletQuota - 999_999,
			wantErr:      true,
			wantQuota:    common.MaxWalletQuota - 999_999,
			wantStatus:   common.TopUpStatusPending,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			truncateTables(t)
			user := insertUserForPaymentGuardTest(t, 506, tc.currentQuota)
			order := createEpayTestOrder(t, user.Id, "EPAYTESTWALLETLIMIT", PaymentProviderEpay, common.TopUpStatusPending)

			_, err := RechargeEpay(order.TradeNo, "alipay", "127.0.0.1")
			if tc.wantErr {
				require.ErrorIs(t, err, ErrTopUpQuotaLimitExceeded)
			} else {
				require.NoError(t, err)
			}
			assert.Equal(t, tc.wantQuota, getUserQuotaForPaymentGuardTest(t, user.Id))
			assert.Equal(t, tc.wantStatus, getTopUpStatusForPaymentGuardTest(t, order.TradeNo))
		})
	}
}
