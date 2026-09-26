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
  -> per-direction review policy + current hard-block / reconciliation check
  -> manual/T+N settlement or same-payment transaction immediate issue
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
| `PUT /api/cashback/config` | Root | Replaces the existing required config fields atomically; omitted optional review policy fields preserve the current values |
| `GET /api/cashback/campaigns` | Root | Lists bounded campaign history |
| `POST /api/cashback/campaigns` | Root + critical rate limit | Creates a nonoverlapping scheduled campaign with `start_at`, `end_at`, `max_rewards_per_user` |
| `POST /api/cashback/campaigns/:id/stop` | Root + critical rate limit | Idempotently stops a campaign without modifying its start/end or existing rewards |
| `GET /api/cashback/rewards` | Admin | Paginated list; filters: `trade_no`, `user_id`, `direction`, `review_status`, `settlement_status`, `risk_level` |
| `GET /api/cashback/rewards/:id` | Admin | Returns reward, order context, snapshots, and usernames; every read emits `cashback.sensitive_view` |
| `GET /api/cashback/summary` | Admin | Returns money/risk/debt/reconciliation aggregates and clusters |
| `GET /api/cashback/users/:id/recorded-spend?start_at=&end_at=&confirm_cny_top_up_id=...` | Admin | Bounded display (90 days, at most 50 positive-amount completed top-ups) and optional repeated per-order Epay CNY confirmations. Optional LOG_DB consume-log aggregates are only recorded-spend observations; an independently bounded full ordered credit scan may return FIFO remaining quota and conditional manual cash reference. Every successful view audits the confirmed IDs. |
| `POST /api/cashback/rewards/:id/review` | Admin + critical rate limit | `{ "action": "approve" | "reject", "reason": string }` |
| `POST /api/cashback/topups/:id/incident` | Admin + critical rate limit | `{ "kind": "refund" | "chargeback" | "dispute", "cumulative_refund_rate_bps": int, "reason": string, "evidence_ref": string }` |
| `POST /api/cashback/rewards/:id/debt/resolve` | Admin + critical rate limit | `{ "reason": string }` |
| `POST /api/cashback/orders/:id/principal-debt/resolve` | Admin + critical rate limit | `{ "reason": string }` |

The recorded-spend report is read-only, not a payout or certified cash balance.
LOG_DB consume intervals can include subscription usage or omit wallet spending;
missing/error LOG_DB returns `log_status=unavailable` and no observed intervals,
without blocking independent FIFO computation. The administrator must stop
usage and confirm the main-DB wallet balance is final (including batch flushes
and reservation refunds); this is an assumption, **not** verified by the query.
The main-DB wallet, event and source checks run in one read-only repeatable-read
snapshot; optional LOG_DB observations run only after it closes. Numeric FIFO
references are deployment-gated by `CASHBACK_REFUND_REFERENCE_ENABLED=true`
(default off): operators enable it only after every writer is upgraded and
source/balance history is reconciled. Reverse source checks scan all history
without relying on second-resolution timestamps from different clocks; they
can detect omissions, not prove completeness. Without this gate the endpoint
still returns bounded recorded intervals and manual reconciliation. The FIFO
scan reads all credit events from a nonrefundable zero wallet opening or a
new-registration opening (including its nonrefundable welcome grant),
independently of the display window (over 1000 events => manual), validates
known source records and exceptional changes, then consumes
`sum(grants)-User.quota` from oldest to newest. Response
`net_spent_quota` must retain that original total; use a separate mutable
allocation cursor while walking FIFO. Returning the cursor after allocation
silently reports zero consumption even when purchased quota was spent. A
historical nonzero/missing opening, negative or excessive balance, missing
evidence, debt, incident,
admin subtract/override or unknown grant requires manual reconciliation;
optional consume logs never certify a particular interval. Gift credits enter
only at actual issuance and are never cash. New admin add batches use their
original declared CNY cents; quota-only adds and non-Epay orders remain in
FIFO but prevent a complete cash total if unspent. Once the ordered credits,
sources and wallet balance pass every numeric-evidence gate, an individually
confirmed Epay order or admin add with declared CNY cents retains its own
per-credit manual reference even when another unspent purchase lacks a cash
face value. The total stays nil/manual; never sum those partial figures as a
complete amount. Any missing source, exception or invalid balance suppresses
all numeric references. Epay signed cents have no
currency: individually confirmed successful Epay orders for the user may be
outside the 90-day display window (at most 50 IDs per request) and receive
CNY *manual reference* amounts in that request; no system verification or
persistent attestation is implied. Integer proration floors each surviving
purchase's paid cents by remaining/original purchased quota. Historical
external refunds, omitted direct credits and old instances cannot be proven
absent by this one evidence table; operators must reconcile these externally.
No wallet, cashback, payout or ordinary spend is mutated by reading.

The normal response envelope is `{ success, message, data? }`. Cashback errors
also expose a stable `code`; a hard block may include `blocking_reason`.
`ErrUserQuotaMutationPending` maps to HTTP `409` with
`CASHBACK_QUOTA_MUTATION_PENDING`; lost fence ownership maps to HTTP `503` with
`CASHBACK_QUOTA_FENCE_LOST`. Both responses use fixed safe messages rather than
Redis/fence diagnostics. Frontend contracts live in
`web/src/features/cashback/types.ts` and must match the controller DTO rather
than GORM models.

### Database signatures

These cashback tables are registered in the main-database migration list:

- `CashbackOrderContext`: unique `top_up_id`; nullable-by-zero campaign association, normalized `base_quota`, actual
  `credited_quota`, order-local activation eligibility, request risk evidence,
  completion source/provider, incident, cumulative principal reversal, and
  principal debt.
- `CashbackReward`: unique `(top_up_id, direction)`; review source, relationship, calculation,
  immutable config/risk snapshots, review/settlement state, retry evidence,
  recovery, and reward debt.
- `CashbackDeviceLink`: unique `(user_id, device_fingerprint_hash)` and reverse
  `(device_fingerprint_hash, user_id)` lookup for correlation.
- `CashbackQuotaMutation`: unique `event_key`; main-database transactional
  evidence for issue, reward recovery, and principal recovery. Composite
  `(reward_id, kind)` and `(top_up_id, kind)` indexes support bounded
  reconciliation batches. `LOG_DB` remains human-facing best-effort audit
  evidence and is never the money ledger.
- `CashbackCampaign`: immutable `[start_at,end_at)` window, optional early
  `stopped_at`, positive per-payer reward limit and creator/stopper identities.
  `CashbackOrderContext.campaign_id=0` preserves old/unbound orders;
  `CashbackReward.review_source` distinguishes automatic and manual review while
  empty historical values remain readable.
- `EpayPaymentEvidence`: main-DB side table with primary key `top_up_id`;
  stores the first signed Epay amount and payment identifiers in the same
  transaction as the successful top-up. It is not a wallet credit ledger or
  a currency/merchant-settlement attestation.
- `AdminQuotaCreditEvidence`: main-DB side table for **new** administrator `add`
  operations only. Each positive quota credit and its unique event key, user,
  operator and DB timestamp commit with the locked user wallet row. Its nullable
  `cny_cents` is non-NULL only for new explicit positive bounded integer-CNY-cent
  `add_quota` requests from a form displaying CNY. It records the administrator's
  original input, not signed payment or a conversion of quota. The existing
  display-currency conversion still determines the submitted quota; the server
  validates cents independently of quota and wallet bounds and commits cents,
  credited quota and balance together. USD/token/custom and legacy quota-only
  adds keep NULL; do not infer CNY from quota or backfill historical credits.
  `subtract`/`override` do not create a purchase credit. `(user_id,id)` orders
  only these administrator credits, not other wallet grant sources. This table
  alone is not a wallet ledger, settlement proof, or refund cash quote.
- `WalletRefundCreditEvent`: main-DB `(user_id,id)` ordered low-frequency
  opening/purchase/gift/nonrefundable/exception evidence. Every covered wallet
  grant is written in the same transaction after locking the user's row;
  ordinary consumption never writes an event. `opening` is nonrefundable;
  `source_type=registration` identifies an atomic new-user welcome grant,
  whereas a historical positive `wallet` opening requires manual review.
  Manual order completion uses `source_type=manual_topup` even without a legacy
  order context, participates in FIFO, and never has signed cash provenance;
  online purchases still require a matching context and Epay signature proof.
  Exceptions block numeric output, and event IDs (not seconds) order grants.

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
- Review automation applies only to payer (`invitee` wire value) rewards. Its
  master switch defaults off; low/medium require no manual review by default,
  high/severe do; `auto_review_immediate_issue` defaults on but acts only for
  auto-approved rewards. Invitee/payer and inviter directions remain independently
  enabled; the latter always needs manual review. Missing new Option keys load
  these defaults; older PUT clients omit policy fields without resetting them.
- Campaigns are explicitly created, never synthesized at migration. Creation
  and early stop serialize on the config version Option row. Order creation
  captures campaign ID only when both server order-placement time and stored
  order time are in its active window and the payer switch is enabled; payment
  must also complete inside the same live campaign. Positive payer rewards
  consume one per-user per-campaign slot even if later canceled or recovered.
  Zero rewards do not count. No campaign never blocks inviter cashback.

### Order creation and provider completion

- `base_quota` is the face value selected/input by the user, normalized at order
  creation. It is not provider money, discounted payment, or credited quota.
- Every newly created online order gets a `CashbackOrderContext`, including
  before first enable. `eligible_after_first_enable` persists the activation
  decision visible in the order-creation transaction; payment completion must
  not reconstruct ordering from second-resolution timestamps.
- `InsertOnlineTopUp` creates `TopUp` and its context atomically. Pre-enable
  contexts settle normally but never create rewards. Orders created before the
  code owned order-local snapshots are not backfilled.
- A clearly post-enable online order cannot settle without its context. For
  legacy context-less orders, `first_enabled_at` remains a compatibility
  fallback, with timestamp equality treated as pre-activation because new
  same-second orders carry an explicit context.
- Verified provider settlement marks the order successful, credits purchased
  quota under the payer's existing quota fence, then calls
  `CompleteTopUpCashbackTx` in the same database transaction. This ordering
  prepares transaction-local immediate issuance without issuing it yet.
  Before purchase credit, read the payer's inviter, lock payer and possible
  inviter in ascending user ID order (as reward issuance does), then recheck
  the payer's referral identity under the lock. A changed referral fails the
  transaction for a retry rather than adding a later lock in reverse order.
  Verify the owned payer quota fence again after cashback completion and before
  commit; pre-credit verification alone cannot protect subsequent mutations.
  Any cashback invariant or fence failure rolls back the purchase credit,
  order status, and reward mutation so the provider can retry; only a committed
  purchase refreshes the quota cache after the transaction.
- Both verified Epay notify and browser return pass the signed `money` to the
  settlement transaction. Pending orders require a positive decimal amount
  with no more than two fractional digits, parsed in integer cents and equal
  to the stored order's original two-decimal checkout price. Invalid or
  mismatched amounts fail the callback without credit; a later valid callback
  remains retryable. The first verified completion atomically stores an
  `EpayPaymentEvidence` row (unique `top_up_id`): signed paid hundredths,
  merchant `out_trade_no`, gateway `trade_no`, signed merchant `pid`, completion
  source, and payment timestamp; retries never overwrite it. Pending Epay
  orders cannot settle without nonempty, bounded verified gateway trade number
  and merchant ID; missing/invalid details leave the order and wallet unchanged.
  Already successful historical orders remain idempotent without such details.
  No secret key is stored. Legacy completed orders without evidence are not
  backfilled. Epay's
  signature does not attest currency: this evidence alone is **not** a CNY
  attestation or permission to offer an automatic cash refund quote.
- `provider_callback` and `verified_return` are eligible completion sources.
  `admin_manual` records the completion evidence but cannot generate rewards.
- The payment-time configuration decides payer eligibility independently of a
  referral, subject to its order-bound live campaign and per-user positive
  reward limit. Only inviter rewards require an unchanged valid referral.
  Each eligible direction gets at most one row, enforced by
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
- Inviter and payer rewards requiring review begin `pending/frozen`.
  Auto-approved payer rewards begin `approved/frozen` with
  `review_source=automatic`, `reviewed_by=0` and a review timestamp. If the
  immediate switch is on, `available_at=paid_at`; otherwise they retain T+N.
  Existing manually approved rewards retain their original maturity and no
  change in policy retroactively changes them. Historical empty review sources
  are inferred from `reviewed_by` for display, not rewritten.
- Reject always requires a non-empty reason. Approving `high` or `severe` risk
  also requires a reason.
- Issuance requires all of: `approved`, `frozen`, `now >= available_at`, positive
  reward quota, a successful matching online order, enabled payer/beneficiary
  accounts, eligible completion source/channel, no incident, and no open
  beneficiary reward or principal debt. An inviter reward additionally requires
  an unchanged valid referral; payer rewards do not. Immediate issuance runs
  after purchased quota credit in the verified payment transaction, uses the
  held payer quota fence and transaction-local bounded reconciliation, and
  writes a unique issue mutation before commit. A failed check rolls back both
  purchase and reward. Post-commit cache publication invalidates the balance
  instead of publishing only the purchase delta when an immediate gift issued.
- Row locks, the unique mutation event, and state predicates—not the scheduler
  lease—guarantee at-most-once issuance. `cashback_settlement` runs every minute
  in batches of 100. Before issuing, it advances a bounded, primary-key ordered
  reconciliation page across rewards, order contexts, and mutation evidence; a
  mismatched page remains pinned and stops settlement until repaired. Process
  restart safely begins the bounded scan from the start instead of running an
  unbounded full-history count.
- `reconciliation_issues` is the issue count from the current bounded page, not
  a full-history total. Repeated clean calls advance the in-process cursor and
  eventually cycle through all rows.
- A blocked or failed frozen reward records the reason/error and a retry time.
  For review requests, only fence acquisition/verification and an actual
  issuance attempt are settlement failures; invalid review transitions do not
  delay settlement. A fence acquisition failure is recorded only when the
  persisted reward was already approved, frozen, and mature. Ineligible,
  pending, or immature records do not fabricate failures.

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
- Redis-enabled issue/recovery acquires sorted per-user quota mutation fences
  before the database transaction. The fence rejects concurrent cache writes
  and spending, keeps an owned cache generation stable through the DB decision,
  and verifies ownership before commit. Success, error, and panic invalidate the
  cached balance and retain a short cooldown fence so pending batch deltas can
  reach the database before authoritative rehydration. A lost owner still
  deletes the balance hash but never deletes or weakens a replacement owner's
  fence, so a rolled-back cache debit cannot become readable.
- Recovery holds the user-quota batch accumulator boundary while checking and
  reserving Redis. Any queued or already-swapped/in-flight user-quota delta
  makes the locked DB row non-authoritative and aborts accounting as retryable,
  including when the user cache hash is absent. Retry only after the batch delta
  has flushed. In `model/quota_reserve.go:userQuotaDeltaScript`, pass the signed
  decimal `ARGV[1]` directly to Redis `HINCRBY`; converting it with Lua
  `tonumber` rounds odd integer deltas above 2^53 and causes the cache to
  disagree with the committed wallet row by one quota unit.
- During an active quota fence, authentication and profile reads may return a
  direct DB snapshot without publishing it into Redis. Quota-authoritative reads
  (`GetUserQuota`, billing trust checks), reservations, and cache publication
  preserve `ErrUserQuotaMutationPending`, so a direct identity snapshot can
  never become spend authority. Committed authentication-version floors and
  required session revocation run independently of deferred quota-cache refresh;
  post-commit cache publication errors are logged rather than reported as a
  rollback. Cache mutation errors otherwise fail closed.
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
  debt transition. Pending dialogs keep Confirm disabled but remain dismissible
  through Escape, Close, and Cancel; mutation-owned invalidation must still run
  after the dialog unmounts.
- All visible strings use the seven project locales. Dialog reason fields need
  labels, validation/error association, keyboard handling, and focus recovery.
  Count copy must choose singular/plural from the raw numeric count before
  applying locale-specific number formatting.

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
| New order predates first enable | Persist an ineligible context; payment succeeds normally and creates no reward |
| Device signal absent, malformed, too long, or Web Crypto unavailable | Continue auth/payment; snapshot `missing`/`invalid` risk evidence |
| Approval occurs before `available_at` | Store approval but remain frozen |
| Scheduler sees a blocked reward | Keep frozen, store blocker/retry time, and do not credit quota |
| Bounded reconciliation page finds inconsistent state/evidence | Pin the page and fail the settlement run before issuing another reward |
| Queued/in-flight user-quota batch delta exists, with or without a cache hash | Abort incident accounting as retryable before state/debt/ledger mutation; flush the delta before retry |
| Cashback action encounters `ErrUserQuotaMutationPending` | `409`, `CASHBACK_QUOTA_MUTATION_PENDING`, fixed safe retry message; no mutation |
| Cashback action loses quota fence ownership | `503`, `CASHBACK_QUOTA_FENCE_LOST`, fixed safe retry message; roll back database mutation |
| Cashback money transaction encounters Redis failure or loses its fence | Roll back DB, invalidate the affected balance hash without altering a replacement fence, record settlement error/retry evidence for an eligible matured reward, and keep cache spending unavailable until safe rehydration |
| Identity/profile read occurs during quota cooldown | Return a direct DB snapshot without publishing cache; quota-authoritative reads and billing trust checks retain the pending error |
| Security mutation commits while quota cache refresh is deferred | Publish/retain the auth-version fence, complete required session revocation, log cache refresh failure, and do not report a false database rollback |
| Invalid review transition on an approved mature reward | Return the transition error without writing settlement failure metadata or delaying the scheduler |
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
- Migration: five cashback side tables; no cashback columns on existing
  business tables; old context/reward rows survive added fields and repeated
  migration; unique order context, `(top_up_id, direction)`, and mutation
  event keys.
- Provider matrix: Epay, Stripe, Creem, Waffo, and Waffo Pancake create the same
  normalized cashback semantics; forged callbacks are rejected; verified
  retries are idempotent; manual completion is ineligible.
- Transactionality: a missing required context or cashback insert failure rolls
  back provider completion and wallet credit. Run concurrent cap/settlement
  tests and `go test -race` for cashback state.
- Review/settlement: reason rules, maturity, hard blockers, task retries,
  reconciliation stop, wallet maximum, and at-most-once quota credit.
- Incident/debt: cumulative partial-to-full refund, decreasing/duplicate rates,
  reward-before-principal recovery, insufficient balances, queued and in-flight
  batch deltas with warm/cold caches, fence-protected cache expiry/rehydration,
  ownership loss on commit/rollback/panic, durable mutation evidence, and
  all-debts-closed unblocking.
- Read-only refund report: on known ordered grants, assert `net_spent_quota`
  equals `sum(grants)-wallet_quota` **and** exact per-batch remaining quota for
  35/125, delayed-gift and final-net-reservation cases; separate main/log DB
  must not alter FIFO, and unavailable logs must never masquerade as zero.
- Shared auth/billing blast radius: identity reads remain available during a
  quota fence, quota getters above the trust threshold remain fail-closed,
  committed auth changes publish/retain their floor and revoke sessions even
  when quota-cache refresh or Redis is unavailable, and invalid review actions
  never write settlement retry metadata. Run
  `TestManageUserQuotaCacheUsesCommittedIntegerDifference/large_odd_difference`
  with Redis: exact DB/cache equality is required above the JavaScript-safe
  integer boundary, not merely a rounded numeric comparison.
- Risk: missing/invalid device, shared IP/device, login mismatch, account age,
  velocity, repeated/small-then-large amounts, inviter concentration, and the
  rule that one correlation signal does not auto-reject.

Primary regression files are `model/cashback_test.go`,
`model/cashback_integration_test.go`, `controller/cashback_config_test.go`,
`controller/cashback_webhook_security_test.go`, and the affected provider
controller/model tests. Exercise MySQL/PostgreSQL row-lock and isolation paths
through the isolated `TEST_MYSQL_DSN` / `TEST_POSTGRES_DSN` integration test
before changing transaction ordering. Missing DSNs must produce an explicit
skip and must never be represented as production-database verification.

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
    // This locks potential beneficiaries by ascending ID, credits the payer,
    // completes cashback, and verifies the payer fence again before commit.
    return creditOnlineTopUpWithCashbackTx(tx, topUp, creditedQuota, nil, source, payerFences)
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

### Exact Redis wallet deltas

```lua
-- Wrong: Lua doubles cannot represent every int64 delta.
redis.call('HINCRBY', KEYS[1], 'Quota', tonumber(ARGV[1]))

-- Correct: Redis parses the decimal integer string itself.
redis.call('HINCRBY', KEYS[1], 'Quota', ARGV[1])
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
