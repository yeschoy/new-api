# Partner Subscription Access Keys

## 1. Scope / Trigger

Read before changing the separate `subscription_key` order entry, internal account identity, query/renewal/rotation credentials or their payment/DTO boundaries. The first actual targeted Docker PostgreSQL 15.19 set passed affected fresh/upgrade/repeat migration, local payment/persistence and critical concurrency assertions (4 top-level tests + 7 model subtests). Independent trellis-check reviewed the complete task diff and matching runtime source without finding an in-scope business-code blocker; no runtime rerun was needed. Prior setup failure/worker timeout remain recorded in the task verification. This is not full application startup, production migration/real payment or deployment verification. Read alongside [paid checkout](partner-tenant-checkout.md) and [hosted H5](partner-hosted-h5.md); their external buyer identity remains required only for their original entries. No frontend/shared-plan authorization or ordinary billing redesign.

## 2. Signatures / API boundaries

- Current pt_: POST `/api/partner/v1/subscription-key-orders` with strict `{plan_id,payment_method}`, Idempotency-Key; optional **X-Subscription-Key** selects renewal. Returns safe order + existing checkout_url (201/new, 200/replay), never long-lived credentials.
- Current pt_: GET `/subscription-key-orders/:order_no` read-only safe state; GET `.../:order_no/subscription-key` only paid+fulfilled; POST `/subscriptions/:subscription_id/key/rotate` with strict `{expected_version}`, separate idempotency fact.
- Only Bearer sub_: GET `/api/partner/subscription`, outside pt_/login middleware. No buyer/merchant ID, query selector, Cookie, x-api-key fallback or other credential purpose. sub_ is exactly prefix + 64 lowercase hex. Token getter rejects sub_ before cache/SQL; it is never stored in tokens.
- All new routes reject query (including ForceQuery), duplicate/empty/comma-list credential/idempotency headers; JSON <=2KB, exact required field set, no duplicates/case aliases/null/trailing object. Existing strict purchase-body decoder is shared.
- no-store/Pragma/no-referrer; request IDs and scoped plain JSON errors. Scoped recovery does not dump headers. Access logs discard queries on these paths; secret-bearing transactions silence SQL interpolation even in DEBUG. Never log raw Authorization/X-Subscription-Key, derivation material or response keys.

## 3. Contracts

### Models / identity / migration

- Account: IdentitySource defaults `external`; nullable **unique** SourceOrderId anchors only the initial paid new purchase. New accounts have empty ExternalUserId and nonempty SHA256(`partner-tenant-subscription-account:v1` + NUL + original order_no). No synthetic external IDs, empty-string hash or NULL internal hash.
- Order: EntryMode defaults `external`, AccountId defaults 0; new purchase leaves 0 until fulfillment, renewal freezes account and RenewalSubscriptionId. New idempotency purpose differs from external/H5; canonical request includes actual renewal subscription ID, never raw key/version.
- All external identity lookup/fallback/backfill explicitly restrict `external`. Legacy merchant idempotency/status projection is mode-scoped. **Shared internal order getter stays mode neutral** for prepare, cashier, callback and recovery.
- AccessKey stores Tenant/Account/Subscription/IssuedOrder binding, random 32-byte hex seed, version >=1, current full Bearer SHA256 and timestamps. Short unique indexes: idx_pt_subkey_account, idx_pt_subkey_subscription, idx_pt_subkey_hash. Rotation stores request/result-version facts, no old seed or plaintext key; idx_pt_subkey_rotate_request.
- `MigratePartnerTenantSubscriptionKeys` is called by actual startup and pq fixtures; additive columns/tables, source/mode normalization, external-only identity backfill, existing hashes/rows retained. It is not a verified production migration.

### Atomic delivery / locks / time

- Verified payment **commits first**, independently; local delivery rolls back User/Token/Account/Subscription/AccessKey/fulfilled as one transaction. Pending/failed/expired/untrusted browser claims create none. Repeated paid delivery/recovery cannot create or extend twice; no GET repairs or minting.
- New purchase creates one real enabled ordinary User with unpredictable credentials, zero wallet, dedicated merchant group and fixed unlimited-quota model Token. Account membership preserves subscription_only funding/RPM/logging. Independent new intentions create separate accounts; anonymous cross-intent buyer deduplication is impossible.
- Renewal uses current pt_ + current sub_ at order acceptance/replay, only original same-plan row, active/naturally expired; cancellation/deletion/corruption never falls back to new purchase. Delivery uses frozen target, not an old submitted key, so later rotation does not erase accepted payment truth.
- Lock order: Tenant -> Order if any -> Plan -> Account -> User -> Token -> Subscription -> Key -> rotation fact. Plan is validated against its locator after locking; an already locked delivery plan is passed into the binding helper to prevent locking a second plan. Re-locks only touch rows already held. No network inside transactions.
- Current merchant hash/enabled status rechecked under Tenant lock for mutations/replay/reconciliation/claim. Current sub_ hash and HMAC/anchor relations rechecked under resource locks. Strict getDBTimestampOnStrict (pq clock_timestamp) after locks, never transaction-start NOW/app fallback; Token expiry rechecked after all waits. Root drift fails closed.
- Shared creation/grant helpers accept strict lock-time timestamps; legacy wrappers retain fallback clock behavior. Existing calendar-month/reset algorithm is reused. Active renewal extends end, no immediate quota bonus; lapsed revival clears old-period usage on same row. Cache publication occurs only after successful commit.

### Query / rotation

- Same locked snapshot for binding, periodic reset and quota. Only linked active subscription with valid account/User/Token can return its actual Coding Key. Exhausted active entitlement may return key but quota_usable=false. Other entitlements cannot substitute.
- All int64 quotas decimal strings. Validate nonnegative total/used, remaining=max(total-used,0) without float/overflow. total=0 => unlimited, remaining="0". Natural expiry projects expired immediately, no reset/api_key, remaining="0", usable=false; historical_quota_remaining explicitly nonspendable. Cancelled likewise.
- sub_ = HMAC-SHA256(CryptoSecret, versioned purpose + NUL-delimited immutable numeric binding + seed + version), hash checked before return/use. Stable root across nodes/restarts mandatory; mismatch 503, no implicit remint. Current legal merchant may explicitly rotate even with root drift.
- Rotation expected_version + independent idempotency. Same request returns stable current result only; superseded result/old expected_version => 409 subscription_key_changed. No old-seed retention/revival, no Coding Key or entitlement change. Cannot revoke already emitted responses or saved Coding Keys.

## 4. Validation & Error Matrix

Errors use plain JSON `{error:{code,message},request_id}` without raw internal errors or secrets.

| Condition | Required response / effect |
| --- | --- |
| Missing/invalid/rotated sub_ on independent query or renewal | 401 invalid_subscription_key; never fall back to a new purchase |
| Current pt_ changed or merchant disabled during body/lock wait | 401 invalid_partner_secret under Tenant lock; no new order/preparation |
| Foreign/wrong-mode order; foreign rotation target | Scoped 404 order_not_found / subscription_not_found |
| Claim before paid+fulfilled | 409 subscription_key_not_ready; no creation/repair |
| Missing/corrupt account/key/issued-order binding | 404 subscription_key_not_found; never mint replacement material |
| Disabled account/User or wrong User group | 403 account_disabled |
| Missing/disabled/expired/wrong-group Token or invalid subscription chronology/quota | 409 credential_unavailable; no Coding Key |
| Wrong-plan or cancelled renewal target | 404 subscription_not_found; accepted paid stays paid/retryable |
| Foreign/disabled/nonpayable plan for a new order | 404 plan_not_found; explicit non-CNY otherwise-valid plan: 400 unsupported_currency |
| Query, duplicate/empty headers or noncanonical JSON | 400 invalid_request; no mutation |
| Same idempotency with changed intent/rotation request | 409 idempotency_conflict |
| Stale expected_version or superseded rotation result | 409 subscription_key_changed; never return/revive old Key |
| Root derivation/hash mismatch | 503 subscription_key_unavailable; no implicit re-signing |
| DB/strict-clock failure | 500 server_error; no secret disclosure |
| Transient checkout preparation failure | 503 payment_unavailable; same POST resumes the original order/deadline; GET is read-only |
| Budget/rate limit | 429 rate_limited + Retry-After |

## 5. Good / Base / Bad Cases

- Good: pt_ creates a buyer-ID-free intent, verified payment commits, atomic delivery creates one internal User/Token/Account/Subscription/sub_; merchant claims it and the buyer queries with only sub_. A later paid renewal reuses that exact relationship and both keys unless the query key was explicitly rotated.
- Base: existing external API/H5 keep their identity/DTO contracts and mint no sub_; an expired linked subscription remains queryable with historical quota and no api_key.
- Bad: treating the idempotency key as a buyer identity, letting external fallback/backfill claim an internal account, repairing credentials in GET, using a pre-lock key/clock, recreating a cancelled renewal target, or rolling back paid evidence with local delivery.

## 6. Tests Required / Focused Evidence

- Self-contained DSN: TEST_PARTNER_SUBSCRIPTION_KEY_POSTGRES_DSN, task-owned Docker runner + empty isolated pq only. Unique retained per-package schemas, no drop/cleanup. Model TestMain bypasses old SQLite bootstrap for this explicit selection/DSN; no missing DSN skip counts as runtime success.
- New model suite: actual migration/legacy/repeat, atomic paid-only rollback/recovery/concurrent delivery, independent/external isolation, precision/reset/unlimited/exhaustion/history, same-row renewal/rotation, plan/credential rejection, locks/current keys/time, compatibility anchor checks.
- Controller: TLS fake gateway and strict notify, public-safe DTO/old mode boundary, preparation failure/resume/GET purity, purpose rejection before upstream, strict parsing, rotation, delayed-body merchant revocation, wallet fallback refusal. Router/auth and access log regression suites are separate.
- go build/vet/gofmt only static evidence; never host Go tests. The first actual owned-Docker execution of `go test -mod=readonly ./model ./controller ./router ./middleware -run '^TestPartnerTenant.*SubscriptionKey.*$' -count=1 -v` passed all selected tests without skips. Do not repeat it without an affected defect/fix. Register actual resources/schemas; cleanup needs approval. Retain paid/new structures on rollback; old binaries cannot safely deliver new mode orders.
- Evidence boundaries: affected shared startup migration helper, not complete startup; seeded plans, not root admin UI/create; direct concurrent delivery retries, not the timed recovery scan; recovery checks original order ID but not a separate deadline equality assertion; renewal reuse checks do not separately assert the exact one-month end-time delta. No ordinary-user billing/RPM matrix or real gateway/payment/deployment acceptance is implied.

## 7. Wrong vs Correct

```go
// Wrong: pre-read authorizes an old key after waiting; shared getter hides new payment orders.
locator, _ := findPartnerTenantSubscriptionKey(bearer)
// Trust locator without current locks/hash/derivation/time checks.
// GetPartnerTenantSubscriptionOrder globally adds entry_mode = external.

// Correct: pre-read locates only; caller holds Tenant (and Order if needed).
binding, err := lockPartnerTenantSubscriptionBindingTx(tx, tenant,
    locator.AccountId, locator.UserSubscriptionId, bearer, false, nil)
// Helper locks Plan -> Account -> User -> Token -> Subscription -> Key,
// validates immutable paid anchor/current hash/root, then reads strict DB time.
// Shared payment getter stays mode neutral; scope only merchant/H5 projections.
_ = binding
_ = err
```

```go
// Wrong: payment truth disappears when local provisioning fails.
DB.Transaction(func(tx *gorm.DB) error { /* mark paid + provision */ return deliveryErr })

// Correct: durable payment first; all local effects/fulfilled share the later transaction.
if err := RecordPartnerTenantPayment(orderNo, provider, merchant, method, transaction, cents); err != nil {
    return err
}
return FulfillPartnerTenantSubscriptionOrder(orderNo)
```
