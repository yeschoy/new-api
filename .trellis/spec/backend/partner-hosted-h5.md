# Optional Partner Tenant Hosted H5

## 1. Scope / Trigger

Read before changing the standalone Tenant purchase selector, its purchase-session model/capabilities, public bootstrap, or the new merchant session APIs. Only explicitly hosted_h5 tenants may create/consume these sessions. Read [Integration Modes](partner-integration-mode.md) for immutable mode, default subscription_key, route/model admission and migration. Direct POST subscription-orders is denied for both modes; H5 support APIs do not grant direct purchase. No iframe, OAuth login, wallet credit, return-URL or webhook is implied. Read [paid checkout](partner-tenant-checkout.md) for the reused order/payment/fulfillment invariants.

Implementation and static/frontend/browser-mock checks exist; Go/database runtime acceptance remains blocked. Do not equate these checks with a deployment-ready migration or payment test.

## 2. Signatures

- Merchant pt_: `POST /api/partner/v1/purchase-sessions` with `Idempotency-Key` and `{external_user_id}`; `GET /api/partner/v1/purchase-sessions/:session_id`.
- Public: `POST /api/partner/purchase-sessions/:session_id/exchange` with `{launch_code,client_nonce}`; `GET /api/partner/purchase-sessions/:session_id`; `POST .../:session_id/orders` with `{plan_id,payment_method}`. GET/order POST use Bearer ps_. No query credentials/cookie identity.
- Document: `/partner/purchase?session_id=PPS...#launch=pl_...`; the existing cashier remains `/partner/checkout?order_no=PTO...#token=pc_...`.
- `PartnerTenantPurchaseSession`: unique exact-case `PPS` + 32 random alphanumeric ID, tenant/buyer and secret-hash snapshot, tenant/idempotency uniqueness, fixed launch/session deadlines, nonce hash/redemption time. Additive migration registered in `model/main.go`.
- `CreatePartnerTenantPurchaseOrder(sessionID, token, planID, method, merchantID, validateNew)` owns H5 mutation-time authorization, then calls the retained unexported external order core. The retired public direct wrapper always rejects. `validateNew` reads local config only; never external I/O.

## 3. Contracts

- Merchant creation returns 201, exact replay 200, changed buyer same key 409. Launch lifetime is 5 minutes, absolute session lifetime 30 minutes from creation; replays/reloads/exchange do not extend them. Session creation does not provision accounts or grants.
- Separate HMAC purposes/prefixes pl_/ps_/pc_. ps_ binds session, persisted nonce hash, fixed deadline and tenant-secret snapshot. Stable shared CryptoSecret is required across replicas/restarts. Disabled tenant/rotated secret revokes subsequent H5 requests, not already-issued order access or durable payment truth.
- Exchange uses tenant -> session locks. Persist random 32-byte nonce as lowercase hex before browser exchange; same launch/nonce recovers a lost response, foreign nonce fails. Keep launch only until successful exchange and ps_ only in per-session sessionStorage/memory, not localStorage/auth/Query caches.
- New order AND exact H5 replay validate current hosted_h5 mode/session/token/binding/secret/deadline after acquiring tenant -> session locks in the actual order transaction. Use a fresh strict DB clock (PostgreSQL clock_timestamp) and current application clock, not request-arrival time. Pre-body or pre-lock checks alone permit delayed-body/lock-wait expiry or rotation bypass.
- One session maps to one original order through `SHA256("partner-tenant-h5-order:v1\0" + session_id)` and the existing tenant/hash order uniqueness. Do not add a separately written order pointer or duplicate payment/fulfillment logic. Retired direct POST rejects even fast/exact replay before gateway work; only guarded H5 may use the shared order core.
- Catalog is an explicit tenant-scoped payable CNY projection with exact decimal money. NEW public H5 `plans[].total_amount` is canonical nonnegative decimal STRING through `9223372036854775807`; unlimited iff `"0"`. Never round int64 quotas via JS Number or change legacy numeric DTOs/billing limits. Shared expected-output fixture: `controller/testdata/partner_purchase_quota_plans.json`.
- Public order projection omits buyer/Key/gateway details. Merchant session status includes buyer for BFF ownership validation and read-only order state, no checkout/payment links; reconciliation survives browser expiry/secret rotation with CURRENT pt_.
- Pending existing order resume is an explicit original POST using server order plan/method, then validated same-origin canonical checkout URL. This retries failed gateway preparation after refresh; a direct link to the read-only cashier can strand an unprepared order. GET never prepares payment; paid order view is read-only; no automatic second purchase on expiry/failure.
- Go HTML and actual shared static-config generator enforce no-store/no-referrer/DENY/frame-ancestors none. Early HTML, surface/access helpers, main and root agree on one URL-path decode; scrub fragments before Router, suppress auth/setup/status/branding/reward/analytics effects only for exact purchase/checkout surfaces. Keep normal/malformed/double-encoded/lookalike routes ordinary.

## 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Unknown/foreign merchant session | Scoped 404 purchase_session_not_found |
| Invalid/expired/replayed/revoked public capability | 401 invalid_purchase_access; no buyer or platform login redirect |
| Same create key with different buyer | 409 idempotency_conflict |
| Same session with different order options | Conflict; no new order/charge |
| Secret/expiry changes during body or tenant-lock wait | Reject at mutation/replay; no new preparation/capability |
| Gateway preparation 503 followed by refresh/status | Existing pending order; explicit same-options POST recovers original order/amount/deadline |
| Prepared or paid replay with new-payment channel off | Reuse original; do not charge/renew again |
| Quota at 2^53 or signed int64 max | Decode/display exact decimal string; other plans and resume remain usable |
| No payable plan/channel | Honest empty state; no guessed channel or currency conversion |
| Session expires after order created | Existing order keeps original independent deadline; merchant reconciliation available |

## 5. Good / Base / Bad Cases

- Good: BFF binds logged-in user, stores an intent/session, H5 selects a tenant plan, transient gateway failure survives refresh, explicit resume prepares exactly one original order, existing cashier handles payment/delivery.
- Base: a subscription_key tenant uses its selected API, not H5. H5 tenant uses sessions and retains external account/status/quota support; no tenant can mix purchase entries.
- Bad: replay unguarded because an order exists; authorize before a slow body and trust it later; assume checkout_url means gateway preparation completed; emit numeric int64 to a safe-integer-only client; grant on browser return.

## 6. Tests Required

- Model: existing paid-order database matrix includes additive/fresh/repeat session migration, preserved account/order rows, nonce redemption/concurrency/secret checks, namespaced one-order races, tenant-row-lock expiry for new/replay. SQLite explicitly skips two-connection row-lock cases; do not hide PostgreSQL/MySQL skips.
- Controller: strict bounded JSON/query/case-alias/duplicate rejection; merchant scope and reconciliation; purpose/expiry/revocation; persisted preparation failure -> GET -> original POST -> unchanged snapshot/deadline; controlled body secret-rotation/deadline tests for new/unprepared/prepared/paid cases; actual int64 output versus shared fixture and unchanged legacy numeric output.
- Router: added registrations/auth and canonical/encoded/trailing alias privacy, plus old cashier unchanged.
- Frontend: real entry/HTML/main/root control flow; lost exchange response keeps nonce; no implicit order effects; failure then persisted order on remount/status; conflicting local draft cannot replace server options; exact quota fixture decoding/display; all seven locales; narrow URL validation; normal routes unchanged. Static deployment tests use `web/scripts/vercel-config.mjs` for all supported project roots.
- Real browser with LOCAL MOCK ONLY: desktop/390px/long-language layout, selection -> 503 -> refresh -> explicit resume -> cashier, paid-pending/delivered, fragments removed, no unrelated platform API calls or external scripts. Mock responses/headers are not Go/database/provider proof.
- All Go tests (including SQLite) run only in task-owned Docker; isolated live PostgreSQL migration/persistence/concurrency required before full acceptance. Build/vet/frontend checks never substitute for runtime evidence.

## 7. Wrong vs Correct

```go
// Wrong: pre-body/pre-lock authorization is not mutation authority.
s, _, _ := AuthorizePartnerTenantPurchaseSession(id, token, arrival)
decodeBody()
createOrReplayPartnerTenantOrder(inputFrom(s))

// Correct: current tenant/session/token/clock checked under the actual order lock.
model.CreatePartnerTenantPurchaseOrder(id, token, planID, method, merchantID, validateLocalCheckoutConfig)
// Gateway preparation happens only after this transaction commits.
```

```ts
// Wrong: a persisted order can have no payment details after preparation failed.
location.assign(catalog.order.checkout_url)

// Correct for unexpired pending order: explicit action, original server options.
const href = await createPurchaseOrder(access, {
  plan_id: catalog.order.plan_id,
  payment_method: catalog.order.payment_method,
}, signal)
location.assign(href)
```
