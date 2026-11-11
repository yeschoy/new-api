# Approved design: Tenant paid orders + narrow hosted cashier

## Approval and behavior boundary

The user approved the final 11-11 research-task summary and implementation on the current dirty branch; no real merchants exist and Tenant direct-grant compatibility is unnecessary. This document replaces earlier provisional settlement/UI/identity alternatives without changing the approved product scope.

Smallest gap: Tenant already has scoped plans, independent Key provisioning and entitlement renewal, but no trusted paid-order closure; funding still trusts user preference. Implement that closure and a narrow cashier, not a full storefront, SSO, wallet top-up or third account namespace.

Source records: model/partner_tenant.go; controller/partner_tenant.go; router/partner_tenant.go; controller/subscription_payment_epay.go; model/subscription.go; service/billing_session.go. PartnerServer QR transport is reusable in concept, but its wallet settlement and pst_ accounts must not be reused as Tenant purchases.

## Cross-layer contract (fixed for backend/frontend lanes)

### Merchant backend APIs (Bearer pt_, no-store)

- Existing GET `/api/partner/v1/plans`: only enabled tenant-owned plans; price is now authoritative for this purchase contract, not a merchant-collection reference.
- Existing PUT `/api/partner/v1/accounts`: `{external_user_id, display_name?}` -> stable `{external_user_id, api_key, created}`; independent of purchasing.
- New POST `/api/partner/v1/subscription-orders`: `{external_user_id, plan_id, payment_method}` with `Idempotency-Key` (existing 16–64 URL-safe validation). No client amount, paid flag, raw internal user ID or arbitrary callback URL. First create 201, same request replay 200, conflicting body 409.
- New GET `/api/partner/v1/subscription-orders/:order_no`: tenant-scoped order status. An order ID does not replace pt_ auth or BFF current-user authorization.
- Stop registering external POST `/api/partner/v1/accounts/:external_user_id/subscriptions`. Internal transaction helpers may remain for paid delivery, not a public bypass.

Order response (plain object, consistent with existing Tenant API):

```json
{"order_no":"PTO...","external_user_id":"customer-7","plan_id":42,"plan_title":"Model plan","amount":"9.99","currency":"CNY","payment_method":"alipay","payment_status":"pending","fulfillment_status":"not_ready","created_at":1800000000,"expires_at":1800001800,"checkout_url":"https://platform.example/partner/checkout?order_no=PTO...#token=pc_..."}
```

`checkout_url` is returned on create/replay, not routine merchant status reads. No model Key in any order DTO. `payment_status`: pending/paid/failed/expired; `fulfillment_status`: not_ready/pending/fulfilled/failed_retryable. Optional `subscription_id` may appear only after delivery, not needed by cashier. Money is a two-decimal string backed by integer cents, never a float trusted from the caller.

### Public order-specific cashier

- Frontend route: `/partner/checkout?order_no=...#token=...` (not in authenticated console layout).
- Public GET `/api/partner/checkout/:order_no` with `Authorization: Bearer pc_...` -> plain cashier object:

```json
{"order_no":"PTO...","plan_title":"Model plan","amount":"9.99","currency":"CNY","payment_method":"alipay","payment_status":"pending","fulfillment_status":"not_ready","created_at":1800000000,"expires_at":1800001800,"qr_code":"optional QR text","pay_url":"https://gateway.example/..."}
```

No external user ID, internal user ID, Key, tenant secret or merchant management scope. QR/pay URL are optional and are omitted after payment/expiry. The header capability must be short-lived, order-bound, constant-time verified and purpose-separated from login tokens. Prefer a signed deterministic capability using existing stable server signing material so idempotent replay can return the same URL without storing plaintext long-lived credentials. Bind expiry/order; document stable secret requirements across restarts/replicas. A URL fragment avoids sending capability in HTTP URLs/referrers/logs. A short-lived capability is not an account login.

Cashier uses a dedicated fetch client, not global login refresh/redirect interceptors. Read fragment, remove it from visible history, retain only per-order sessionStorage for same-tab reload; never localStorage or generic analytics. Invalid/missing/expired access shows a safe return-to-merchant instruction, not another user's order or platform login. No third-party scripts on this page; no-store/referrer controls at appropriate response/frontend boundary.

Poll at a bounded interval (e.g. 3 seconds after each request), stop on paid+fulfilled or access expiry, cancel/unsubscribe on unmount and separate transport failure from payment failure. `paid + pending/failed_retryable` displays paid, delivery pending; do not invite a second payment. No client action grants a plan. Only safe HTTPS pay links without embedded credentials become clickable; render QR as data, not HTML. Use existing UI primitives, qrcode library, seven-locale i18n and component tests. If cashier is opened from a new tab, the browser return can be informational; no payment side effect or checkout secret in the gateway return URL.

## Payment adapter and monetary boundary

First implementation reuses configured Epay methods; new providers are out of scope. Tenant plans must have a finite positive amount exactly representable in cents. Epay's existing callback signs money but does not attest currency: accept CNY plans for this adapter and reject other currencies rather than silently charge USD as CNY or invent an exchange rate. Keep the general plan catalog intact and expose/document payment availability/unsupported-currency errors; ordinary checkout behavior is unchanged.

Persist the order before preparing gateway checkout; use stable platform-generated trade number. Reuse/extract existing safe Epay transport where appropriate, do not copy wallet accounting. HTTPS only; strict bounded parsing, timeouts and no logging of gateway payload/links/secrets. Use the platform's configured callback origin, not merchant-supplied URLs.

Dedicated signed notification path: `/api/partner/subscription/epay/notify` (GET/POST as required by Epay). Browser return path, if needed: `/api/partner/subscription/epay/return`, which redirects to informational cashier state only and never fulfills.

Before recording success verify signature/status, configured merchant pid, nonempty gateway trade number, platform order number/provider/method and exact cents; bind duplicate evidence consistently and reject conflicting transaction reuse. Currency is fixed by this adapter contract, not claimed as a signed callback field. Late verified payments are recorded even after pending order/capability expiry; do not discard real payment or ask for a second charge.

Where provider transport cannot safely support reconciliation (e.g. query APIs expose keys in URLs), do not add an insecure lookup. Callback retries plus durable paid-delivery recovery are mandatory; document any unverified/unavailable active reconciliation gap.

## Order persistence and state transitions

Use a dedicated `PartnerTenantSubscriptionOrder` table (not a new account model and not TopUp). Store tenant/external user/plan association, frozen title/price/currency/term/quota/group snapshot, provider/method, unique platform trade number, unique `(tenant_id,idempotency_hash)` and request hash, timestamps, checkout/claim metadata as needed, payment evidence and fulfillment progress/error code. Do not persist raw callback bodies, pt_ or model Keys in order records/logs. Handle case-sensitive external identity consistently with the existing Tenant contract.

1. Creation transaction locks enabled tenant, validates plan ownership/rules, existing resource state if present, authoritative cents/currency and order rate/pending budgets. It inserts one pending order without creating an account. Same key conflicts fail without side effects; rely on locks/current reads and unique indexes, not MySQL no-op conflict RowsAffected.
2. After commit, prepare/reuse gateway checkout with stable trade number. If network is needed, use a persisted short claim outlasting timeout and never hold DB locks across network calls. Failed preparation leaves same order retryable and does not grant.
3. Trusted notification transaction records verified payment/evidence idempotently and moves to paid + delivery pending. Commit this fact even if subsequent local fulfillment fails. Reject conflicting duplicate evidence/transaction ownership.
4. Fulfillment transaction locks order/tenant/account in a consistent order, confirms paid and unfulfilled, verifies enabled tenant/current plan ownership/group and forbidden resources. Use frozen purchased terms where needed; do not silently deliver a different group/benefit. Extract transaction-scoped account/key provisioning and grant/renewal helpers; grant source stays partner. Create/update entitlement and fulfilled marker in the same transaction, once per order.
5. Failed delivery retains paid and records a bounded safe retryable code (not sensitive DB/provider payload). Background bounded DB scan retries paid-unfulfilled orders on startup and periodically; no dependency on browser/merchant polling and no new queue required. Refresh membership caches only after successful commit.

Plan edits after payment may require fail-closed recovery if ownership/group/availability no longer permits delivery. Never silently replace disabled users/keys or charge again. Existing grant tables/data are not dropped; no real merchant compatibility does not authorize destructive data cleanup. Register new model migrations in both relevant normal/fast paths and test fresh/upgrade/repeat.

## Subscription-only funding and credential safety

Expose/reuse the existing bounded cached Tenant membership predicate at `NewBillingSession` before choosing funding. Members force subscription_only regardless of UserSetting; lookup errors fail closed. Do not change ordinary user preferences, group eligibility, quota math or PartnerServer wallets. Ensure independent provision and paid fulfillment both refuse disabled user/membership, wrong group and unusable/expired/deleted token; no replacement. Publish membership only after transaction commits.

## Change boundaries / lane ownership

Backend lane: model/partner_tenant*.go and order tests, controller/partner_tenant*.go and tests, router/partner_tenant.go and router regressions, model/main.go migration registration, main/service background hook, service/billing_session.go and funding tests, necessary shared payment helper refactor. It must not touch frontend/locales/docs or unrelated payment products. Demonstrate unchanged behavior of any shared refactor.

Frontend lane: new partner-checkout feature/route/tests, necessary generated route registration, dedicated capability HTTP boundary, existing translation script + seven locale files. It must not change Go/backend/docs or rebuild merchant websites.

Main session: task/spec records, API docs (merge dirty baseline), final integration checks and commits; only the supervisor commits. One end-to-end task with disjoint implementation lanes; no independently shipped duplicate feature or third account lane.

## Verification / rollout

Read `.agents/rules/billing.md`, subscription-group-billing and partner-server-accounts specs. All DB tests/Go test runner in task-owned Docker; daemon currently unavailable, no host DB fallback. Pure `go build` and frontend lint/typecheck/tests may run locally. No live gateway calls, deployment or data deletion. Tests cover R1–R11 plus signed notification forgery/amount/pid/method/transaction mismatches, concurrent retries, revoked resources, paid recovery, scope/capability isolation, late payment and funded-wallet refusal. Report missing engines/sandbox results honestly. Any rollback preserves recorded paid orders and data; do not reverse external money via DB rollback.
