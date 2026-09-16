# Referral recharge cashback contract

## 1. Scope / Trigger

Use this contract when changing any of the following:

- online `TopUp` creation or provider settlement for Epay, Stripe, Creem,
  Waffo, or Waffo Pancake;
- referral cashback configuration, calculation, review, settlement, incidents,
  debt resolution, reconciliation, or audit events;
- the `cashback_settlement` system task;
- the Root settings UI, Admin `/cashback` UI, device-signal transport, or their
  API types.

The end-to-end flow is:

```text
browser signal + online order
  -> CashbackOrderContext
  -> verified provider success transaction
  -> CashbackReward per enabled direction
  -> manual review + T+N maturity + current hard-block check
  -> User.quota
  -> optional incident recovery / debt
```

The cashback ledger is side-table based. Do not add cashback-specific columns
on `User`, `UserSession`, or `TopUp`, and do not use `aff_quota` as the frozen
cashback balance. Automatic provider refund/dispute callbacks and cash
withdrawal remain outside this contract.

## 2. Signatures

### Go entry points

```go
func InsertOnlineTopUp(
    topUp *TopUp,
    baseQuota int,
    metadata CashbackRequestMetadata,
) error

func CompleteTopUpCashbackTx(
    tx *gorm.DB,
    topUp *TopUp,
    creditedQuota int,
    source CashbackCompletionSource,
) error

func MarkManualTopUpCashbackCompletionTx(
    tx *gorm.DB,
    topUp *TopUp,
    creditedQuota int,
) error

func ReviewCashbackReward(
    rewardID int64,
    action CashbackReviewAction,
    reason string,
    reviewerID int,
    now int64,
) (CashbackReviewResult, error)

func IssueCashbackReward(rewardID int64, now int64) (CashbackSettlementOutcome, error)
func SettleMaturedCashbackRewards(now int64, batchSize int) (CashbackSettlementRunResult, error)
func HandleCashbackIncident(topUpID int, input CashbackIncidentInput) (CashbackIncidentResult, error)
func ResolveCashbackRewardDebt(rewardID int64, operatorID int, reason string, now int64) (*CashbackReward, error)
func ResolveCashbackPrincipalDebt(topUpID int, operatorID int, reason string, now int64) (*CashbackOrderContext, error)

func UpdateCashbackSettingAtomic(
    candidate operation_setting.CashbackSetting,
    complianceConfirmed bool,
    now int64,
) (current operation_setting.CashbackSetting, stored operation_setting.CashbackSetting, err error)
```

All online provider completion paths use the package-owned
`cashbackTransaction`, whose isolation is `sql.LevelReadCommitted`. This is
required because beneficiary rows are locked before the rolling 24-hour reward
aggregate is read; MySQL `REPEATABLE READ` can otherwise retain an older
snapshot and overrun the cap.

### HTTP API

| Route | Auth / guard | Contract |
| --- | --- | --- |
| `GET /api/cashback/config` | Root | Returns the stored config plus `compliance_confirmed` |
| `PUT /api/cashback/config` | Root | Replaces the complete writable config object atomically |
| `GET /api/cashback/rewards` | Admin | Paginated list; filters: `trade_no`, `user_id`, `direction`, `review_status`, `settlement_status`, `risk_level` |
| `GET /api/cashback/rewards/:id` | Admin | Returns reward, order context, snapshots, and usernames; every read emits `cashback.sensitive_view` |
| `GET /api/cashback/summary` | Admin | Returns money/risk/debt/reconciliation aggregates and clusters |
| `POST /api/cashback/rewards/:id/review` | Admin + critical rate limit | `{ "action": "approve" | "reject", "reason": string }` |
| `POST /api/cashback/topups/:id/incident` | Admin + critical rate limit | `{ "kind": "refund" | "chargeback" | "dispute", "cumulative_refund_rate_bps": int, "reason": string, "evidence_ref": string }` |
| `POST /api/cashback/rewards/:id/debt/resolve` | Admin + critical rate limit | `{ "reason": string }` |
| `POST /api/cashback/orders/:id/principal-debt/resolve` | Admin + critical rate limit | `{ "reason": string }` |

The normal response envelope is `{ success, message, data? }`. Cashback errors
also expose a stable `code`; a hard block may include `blocking_reason`.
Frontend contracts live in `web/src/features/cashback/types.ts` and must match
the controller DTO rather than GORM models.

### Database signatures

Only these cashback tables are registered in normal and fast migration lists:

- `CashbackOrderContext`: unique `top_up_id`; normalized `base_quota`, actual
  `credited_quota`, request risk evidence, completion source/provider, incident,
  cumulative principal reversal, and principal debt.
- `CashbackReward`: unique `(top_up_id, direction)`; relationship, calculation,
  immutable config/risk snapshots, review/settlement state, retry evidence,
  recovery, and reward debt.
- `CashbackDeviceLink`: unique `(user_id, device_fingerprint_hash)` and reverse
  `(device_fingerprint_hash, user_id)` lookup for correlation.

The settlement scan index is ordered by
`(review_status, settlement_status, available_at)`. Rolling exposure uses
`(beneficiary_id, created_at)`. JSON snapshots are display evidence; strong
typed columns remain authoritative for transitions.

## 3. Contracts

### Configuration

`CashbackSetting` is stored under the `cashback_setting.*` Option namespace and
is replaced as one object. Rates and money use integer basis points and integer
wallet quota; floating-point money arithmetic is forbidden.

- Both directions default disabled and both rates default to zero.
- `inviter_rate_bps` and `invitee_rate_bps` are each `0..10000`, their sum is at
  most `10000`, and an enabled direction has a positive rate.
- `settlement_days` is `1..90`, default `7`.
- `max_reward_quota` and `daily_reward_quota` are
  `0..common.MaxWalletQuota`; both must be positive while either direction is
  enabled.
- IP/device/top-up thresholds default to `3/2/5`; IP and device thresholds are
  `2..100000`, and the top-up threshold is `1..100000`.
- Enabling requires current payment-compliance confirmation.
- The server owns `first_enabled_at` and `version`. The first enable timestamp is
  written once and is never reset by later updates; every successful update
  increments the version under a locked Option row.
- Generated rewards retain their config version and full config snapshot.
  Later configuration changes never recalculate an existing reward.

### Order creation and provider completion

- `base_quota` is the face value selected/input by the user, normalized at order
  creation. It is not provider money, discounted payment, or credited quota.
- After the feature has first been enabled, every newly created online order
  gets a `CashbackOrderContext`, even while both current direction switches are
  off. Orders created before `first_enabled_at` are never backfilled.
- `InsertOnlineTopUp` creates `TopUp` and its required context atomically.
- A post-enable online order cannot settle without that context. A missing
  context is a transaction error, not a silent cashback skip.
- Verified provider settlement marks the order successful, calls
  `CompleteTopUpCashbackTx`, and credits top-up quota in the same database
  transaction. Any cashback invariant failure rolls back the complete payment
  mutation so the provider can retry.
- `provider_callback` and `verified_return` are eligible completion sources.
  `admin_manual` records the completion evidence but cannot generate rewards.
- The payment-time configuration and current valid referral relationship decide
  eligibility. Each enabled direction gets at most one row, enforced by
  `(top_up_id, direction)`.
- Calculation is
  `floor(base_quota * rate_bps / 10000)`, then the single-reward and beneficiary
  rolling-24-hour caps are applied. A zero result is preserved as a canceled,
  explainable record rather than an issuable zero-value reward.

### Risk, review, and settlement

- Device/IP/User-Agent data is evidence, never authentication. The browser may
  send `X-Device-Signal: v1:<64 hex chars>` on the allowlisted login,
  registration, OAuth handoff, and online top-up POST routes.
- The server accepts at most 128 characters, hashes a valid signal again, and
  stores `valid`, `missing`, or `invalid`. Missing/invalid data raises risk but
  must not block login or payment. Missing devices use a user-isolated anchor
  for first-IP history and are excluded from shared-device counts.
- A single shared IP or device is only a risk flag. Risk snapshots combine
  account age, registration delay, session/IP/UA evidence, device rotation,
  provider consistency, top-up outcomes/frequency/amount patterns, inviter
  concentration, prior incidents, and exposure caps.
- Every payable reward begins `review_status=pending` and
  `settlement_status=frozen`; no automatic review is allowed.
- Reject always requires a non-empty reason. Approving `high` or `severe` risk
  also requires a reason.
- Issuance requires all of: `approved`, `frozen`, `now >= available_at`, positive
  reward quota, a successful matching online order, unchanged valid referral,
  enabled accounts, eligible completion source/channel, no incident, and no
  open beneficiary reward or principal debt.
- Row locks and state predicates, not the scheduler lease, guarantee at-most-once
  issuance. `cashback_settlement` runs every minute in batches of 100 and first
  refuses to settle when reconciliation detects inconsistent rows.
- A blocked or failed frozen reward records the reason/error and a retry time;
  it is not silently issued or canceled.

### Incidents, recovery, and debt

- Incidents are manual and provider-neutral. A reason is mandatory and reason /
  evidence values are each limited to 1000 characters.
- The request carries the cumulative principal refund rate, never a per-call
  delta. It is `0..10000` and monotonically non-decreasing. Refund requires a
  positive rate; chargeback is forced to `10000`; dispute may begin at zero.
- The same incident kind plus the same cumulative rate is idempotent.
- Any incident cancels frozen rewards or attempts to recover every issued reward
  before reversing the incremental principal target. Principal target is
  `floor(credited_quota * cumulative_rate / 10000)`.
- Insufficient available quota creates reward/principal debt. Any open debt for
  the beneficiary blocks later cashback creation, approval, and issuance.
- Redis-enabled recovery reserves the authoritative cache before the matching
  locked database debit. Transaction error or panic must compensate every cache
  reservation. Do not debit only one side of the cache/database boundary.
- Debt resolution is an explicit audited administrative disposition: it clears
  the selected debt record but does not restore a canceled reward. Blocked
  rewards are released for retry only after all reward and principal debt for
  that user is closed.

### Admin frontend

- Root configuration stays in Billing & Payment; review operations stay on the
  Admin-only `/cashback` route. Do not expose bulk review.
- Sensitive detail is fetched afresh whenever the detail sheet opens so every
  full IP/device view is audited; clear its query cache on close.
- Mutations disable repeat submission and invalidate list, summary, the changed
  reward, and any other reward details affected by an order-level incident or
  debt transition.
- All visible strings use the seven project locales. Dialog reason fields need
  labels, validation/error association, keyboard handling, and focus recovery.

## 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Malformed config JSON or invalid cross-field config | `400`; config validation includes the offending `field`; no partial Option update |
| Either direction enabled without compliance or positive caps | `400`; keep the previous complete configuration |
| Client attempts to send `first_enabled_at` or `version` | Ignore by DTO ownership; server derives both |
| Invalid reward/list ID, filter enum, user ID, or overlong trade number | `400`, no unbounded query |
| Missing reward / top-up | `404` |
| Invalid transition, open-state conflict, or debt state conflict | `409` with `CASHBACK_STATE_CONFLICT` or the applicable conflict response |
| Current hard blocker on approval/issue | `409`, `CASHBACK_HARD_BLOCKED`, and `blocking_reason`; never issue quota |
| Reject without reason, or high/severe approval without reason | `400`, `CASHBACK_REASON_REQUIRED` |
| Review/incident/debt reason over 1000 characters | `400`, no mutation |
| Refund rate outside `0..10000`, decreases, or refund uses zero | `400`, `CASHBACK_REFUND_RATE_INVALID` |
| Repeated verified payment callback | Return the provider path's idempotent success; do not credit top-up or create rewards twice |
| Post-enable online order lacks its context | Roll back provider completion; callback path must return retryable failure |
| Manual top-up completion | Credit only the top-up; persist ineligible source when context exists; create no reward |
| Order predates first enable | Create no context/reward, even if payment succeeds later |
| Device signal absent, malformed, too long, or Web Crypto unavailable | Continue auth/payment; snapshot `missing`/`invalid` risk evidence |
| Approval occurs before `available_at` | Store approval but remain frozen |
| Scheduler sees a blocked reward | Keep frozen, store blocker/retry time, and do not credit quota |
| Reconciliation finds inconsistent issued/recovery rows | Fail the settlement run before issuing another reward |
| Incident transaction fails after Redis reservation | Roll back DB and compensate reserved cache quota, including panic paths |
| One of several user debts is resolved | Keep the user blocked until every open reward/principal debt is closed |

## 5. Good / Base / Bad Cases

- **Good:** A post-enable Stripe order with both directions enabled settles once.
  The same transaction snapshots the face-value base, creates inviter and
  invitee rewards, and credits the purchased quota. A repeated webhook changes
  nothing.
- **Good:** An approved reward reaches T+7. The scheduler locks it, rechecks the
  order, relationship, incident, channel, account status, and debt, then moves
  `frozen -> issued` while crediting `quota` once.
- **Good:** A 25% refund cancels/reclaims all rewards and targets 25% of the
  original credited principal. A later 100% request reverses only the remaining
  75%; repeating 100% is idempotent.
- **Base:** Both switches are off after first enable. New online orders still
  retain context evidence, but payment success creates no rewards.
- **Base:** Device storage or Web Crypto is unavailable. Payment still works and
  `device_missing` remains visible to the reviewer.
- **Base:** An order created before the immutable activation boundary succeeds
  after activation. It remains ineligible and receives no backfill.
- **Bad:** Calculate cashback from `TopUp.Money`, provider-paid currency, or the
  credited quota; these meanings differ by provider.
- **Bad:** Credit the wallet first and create cashback records in a second
  transaction; a crash would make payment and cashback disagree.
- **Bad:** Treat shared IP/device as an automatic reject or a trusted identity.
- **Bad:** Resolve one debt and clear every frozen reward for the user while
  another reward or principal debt remains open.

## 6. Tests Required

### Backend assertions

- Configuration: defaults; individual/combined rates; compliance; positive
  caps; immutable first-enable timestamp; atomic version update.
- Migration: exactly the three side tables; no cashback columns on existing
  business tables; unique order context and `(top_up_id, direction)`.
- Provider matrix: Epay, Stripe, Creem, Waffo, and Waffo Pancake create the same
  normalized cashback semantics; forged callbacks are rejected; verified
  retries are idempotent; manual completion is ineligible.
- Transactionality: a missing required context or cashback insert failure rolls
  back provider completion and wallet credit. Run concurrent cap/settlement
  tests and `go test -race` for cashback state.
- Review/settlement: reason rules, maturity, hard blockers, task retries,
  reconciliation stop, wallet maximum, and at-most-once quota credit.
- Incident/debt: cumulative partial-to-full refund, decreasing/duplicate rates,
  reward-before-principal recovery, insufficient balances, cache compensation
  on error and panic, and all-debts-closed unblocking.
- Risk: missing/invalid device, shared IP/device, login mismatch, account age,
  velocity, repeated/small-then-large amounts, inviter concentration, and the
  rule that one correlation signal does not auto-reject.

Primary regression files are `model/cashback_test.go`,
`controller/cashback_config_test.go`,
`controller/cashback_webhook_security_test.go`, and the affected provider
controller/model tests. Exercise MySQL/PostgreSQL row-lock and isolation paths
in integration tests before changing transaction ordering.

### Frontend assertions

- Config cross-field validation, read-only activation metadata, and server field
  errors.
- Admin route permissions, filters, summary, detail refresh/audit behavior,
  action reason requirements, disabled repeated submission, and query
  invalidation after order-wide changes.
- Device header allowlist, stable `v1` signal, storage/Web Crypto failure, and no
  signal on unrelated requests.
- Seven-locale key/placeholder parity, keyboard/focus behavior, narrow layout,
  type-check, lint, and production build.

## 7. Wrong vs Correct

### Payment transaction ownership

```go
// Wrong: payment can commit while cashback silently fails later.
creditTopUpQuota(DB, topUp.UserId, creditedQuota, nil)
go createCashback(topUp)

// Correct: one row-locked READ COMMITTED transaction owns all money state.
err := cashbackTransaction(func(tx *gorm.DB) error {
    // lock TopUp, validate provider, mark success
    if err := CompleteTopUpCashbackTx(tx, topUp, creditedQuota, source); err != nil {
        return err
    }
    return creditTopUpQuota(tx, topUp.UserId, creditedQuota, nil)
})
```

### Configuration ownership

```go
// Wrong: transiently stores an enabled direction with an invalid zero rate.
UpdateOption("cashback_setting.inviter_enabled", "true")
UpdateOption("cashback_setting.inviter_rate_bps", "500")

// Correct: validate and persist one locked, versioned object.
_, stored, err := UpdateCashbackSettingAtomic(candidate, compliance, now)
```

### Incident arithmetic

```go
// Wrong: retrying a 25% per-call delta deducts principal twice.
principalToDebit := creditedQuota * request.RefundPercent / 100

// Correct: derive the new cumulative target and apply only its increase.
newTarget := floor(creditedQuota * cumulativeRateBPS / 10000)
deltaTarget := newTarget - oldTarget
```

### Device and detail boundaries

```ts
// Wrong: device evidence becomes an authentication/payment prerequisite.
if (!deviceSignal) throw new Error('device required')

// Correct: attach when available; the server records missing/invalid as risk.
const signal = await getDeviceSignal()
if (signal) config.headers[DEVICE_SIGNAL_HEADER] = signal
```

Do not retain sensitive detail indefinitely in the query cache. Re-fetch it on
each sheet open and remove it on close so each full IP/device view crosses the
audited backend boundary.
