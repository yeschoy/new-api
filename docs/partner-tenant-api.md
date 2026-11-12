# Partner Tenant API

For request examples and error codes, see the [Chinese API reference](./partner-tenant-integration.zh-CN.md). This describes the current branch implementation, not a claim that it has been deployed or payment/DB integration tests have passed.

## Contract and authentication

The merchant owns its website and user login. It may keep its own plan cards/purchase dialog and use the unchanged order API, or optionally open the platform-hosted H5 selector. Both paths can coexist without a mode switch. **The platform owns subscription orders, checkout, verified payment and delivery.** Merchants do not collect payment or report a paid flag. The old external direct-subscription-grant route is removed, with no legacy mode. This Tenant contract is separate from Partner OAuth and PartnerServer wallet recharge.

Merchant management endpoints use HTTPS and `Authorization: Bearer pt_<server-secret>`, only from the merchant backend. Derive `external_user_id` from that backend's authenticated user; never forward an arbitrary browser-supplied ID without ownership validation. A model request uses the user's `sk-` key, never `pt_`.

- Base prefix: `/api/partner/v1`; plain business JSON, without a `{success,data}` envelope; `Cache-Control: no-store`.
- `external_user_id`: trimmed, case-sensitive, 1–128 Unicode code points, no control characters; URL-encode it as a path segment. Account identity is `(tenant_id, external_user_id)`.
- Order writes require `Idempotency-Key`: 16–64 URL-safe letters/digits/`-`/`_`. Keep one stable key per purchase attempt, including network retries. It is not a merchant business order number or the platform-generated order number.
- Unknown JSON fields/multiple JSON documents are rejected. Account provisioning allows up to 1 KiB; order creation allows up to 2 KiB. Order routes do not accept query parameters.
- Error body: `{"error":{"code":"order_not_found","message":"order not found"},"request_id":"..."}`.

## Endpoints

| Method and path                                       | Contract                                                                                                                                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /purchase-sessions`                             | Optional hosted H5: `{external_user_id}` + Idempotency-Key → `{session_id,external_user_id,created_at,launch_expires_at,expires_at,purchase_url}`; first 201, exact replay 200, buyer conflict 409.       |
| `GET /purchase-sessions/{session_id}`                 | Merchant reconciliation: session fields, `redeemed`, and `order:null` or the existing merchant order status DTO (no checkout capability). Available after session expiry; BFF must check buyer ownership. |
| `GET /plans`                                          | Only this tenant's enabled plans. No user/account creation.                                                                                                                                               |
| `PUT /accounts`                                       | `{external_user_id, display_name?}` → stable `{external_user_id, api_key, created}`; initial create 201, repeat 200. Independent of payment/entitlement.                                                  |
| `POST /subscription-orders`                           | `{external_user_id, plan_id, payment_method}` + Idempotency-Key → platform order and cashier URL; initial 201, replay 200, conflicting body 409.                                                          |
| `GET /subscription-orders/{order_no}`                 | Authenticated tenant-scoped order state; no Key, QR, payment link or checkout capability. Merchant BFF must also check its current user's ownership.                                                      |
| `GET /accounts/{external_user_id}/subscription/quota` | Only active tenant-owned subscriptions; returns totals/used/remaining, unlimited flag and reset/expiry times.                                                                                             |

`PUT /accounts` can create an empty account and a fixed-group model Key before purchase; it does not grant quota. Disabled/deleted/wrong-group users and unavailable/expired/revoked credentials fail closed rather than being replaced. First fulfillment can provision an account if the merchant never called this operation.

Plans remain one calendar month with monthly reset and the tenant's dedicated group. `total_amount:0` means unlimited: check `quota_unlimited`, not a zero remaining amount. The highest applicable nonzero plan RPM applies, not the sum; system/group limits also apply. Multi-node shared RPM enforcement requires shared Redis.

## Ordering and cashier

```http
POST /api/partner/v1/subscription-orders
Authorization: Bearer pt_<server-secret>
Idempotency-Key: purchase_20261111_0001
Content-Type: application/json

{"external_user_id":"customer-7","plan_id":42,"payment_method":"alipay"}
```

```json
{
  "order_no": "PTO0123456789ABCDEFGHIJKLMNOPQRSTUV",
  "external_user_id": "customer-7",
  "plan_id": 42,
  "plan_title": "Monthly model plan",
  "amount": "99.00",
  "currency": "CNY",
  "payment_method": "alipay",
  "payment_status": "pending",
  "fulfillment_status": "not_ready",
  "created_at": 1800000000,
  "expires_at": 1800001800,
  "checkout_url": "https://platform.example/partner/checkout?order_no=PTO0123456789ABCDEFGHIJKLMNOPQRSTUV#token=pc_<order-capability>"
}
```

Amounts are server-authoritative decimal strings backed by integer cents. The first adapter is **configured Epay methods, CNY plans only**, with positive prices exactly representable in cents. Tenant plan creation and updates accept only CNY (the default when omitted); explicit foreign currencies are rejected. Historical non-CNY catalog entries still fail checkout with `unsupported_currency`; no implicit exchange rate or data migration is applied. The admin editor requires a new positive CNY price for such entries instead of carrying over their old amount. Ordinary plan currency behavior is unchanged.

Open `checkout_url` after a user action. It is a sensitive, short-lived, order-only bearer capability, not a platform login or model Key. Do not log, embed in analytics, share, put its fragment into a query string, or replace the fragment with the tenant secret. The cashier scrubs the fragment before router initialization and retains only per-order sessionStorage for same-tab reload. It fetches public-safe order data using `GET /api/partner/checkout/{order_no}` with `Authorization: Bearer pc_...`; no merchant management scope or buyer identity is exposed.

The cashier displays QR/payment links, and payment and delivery state separately. Payment channels can require a new window; the whole cashier is not an iframe storefront. Public cashier access lasts until the order's initial 30-minute deadline. After it expires, query through the authenticated merchant backend; an expired cashier does not prove that a late payment failed. Repeat create reuses the same order and deadline, not a fresh charge or refreshed expiry.

## Optional standalone hosted H5

See the [durable hosted-H5 guide (Chinese)](./partner-hosted-h5.zh-CN.md) for both integration paths and the browser protocol. Existing `/subscription-orders` consumers need no migration.

The merchant BFF derives `external_user_id` from trusted login, persists a stable purchase-intent idempotency key, and calls `POST /api/partner/v1/purchase-sessions` with **only** `{external_user_id}`. These new routes reject query parameters, unknown/duplicate/case-aliased JSON fields and bodies over 2 KiB. Keep pt_ and model Keys server-side. Save `session_id` and its buyer before returning the sensitive `purchase_url` to that buyer in a non-cacheable response. Do not put capabilities in logs, analytics, arbitrary redirects, or URL queries.

Open the URL standalone (current/new window or WebView, never iframe). Its `#launch=pl_...` is scrubbed before Router initialization and exchanged with a cryptographic, session-scoped client nonce. Lost exchange replies retry the same nonce; a different nonce/window cannot replay the launch. The returned ps_ stays in per-session sessionStorage/memory, not platform auth, localStorage or shared Query caches. Blocked storage limits refresh recovery. The launch deadline is fixed at creation +5 minutes and session deadline at creation +30 minutes; retries never extend either. Disabled tenants or rotated tenant credentials revoke later session requests. Order creation and replay re-read the session capability, binding, redemption/nonce, current merchant secret snapshot and fresh clock under the tenant lock in the shared order transaction, so delayed uploads and lock waits cannot preserve expired or revoked authority. Gateway preparation remains outside database transactions.

Only actual session catalog plans and payment methods are offered (positive exact-cent CNY prices, no legacy-currency relabeling). User submission freezes the original plan/method before sending. One session binds at most one order; double clicks, refresh and failed/timeout retries must reuse those original options. Conflicting options return `idempotency_conflict`, not another order. The page validates the original same-origin canonical cashier URL, then navigates there in the same tab; an existing order gets an explicit resume/view action, not another purchase form. An unexpired pending order is resumed by explicitly POSTing its server-returned `order.plan_id/payment_method` to the same session `/orders` endpoint before navigating, even after preparation returned 503 and a reload/status GET found the persisted order. A stale local draft never overrides the original order. GET remains read-only; prepared replay does not prepare/charge again, paid orders remain read-only, and expiry never creates a replacement. The original order keeps its own fixed 30-minute access deadline, independent of earlier H5 expiry.

The **new public H5 catalog only** represents `plans[].total_amount` as a canonical nonnegative decimal **string**, from `"0"` through `"9223372036854775807"` (signed int64 maximum). `quota_unlimited` is true exactly for `"0"`. Values such as `"9007199254740992"` are valid: clients must validate and render with string/BigInt operations, not convert to JavaScript Number or round them. Existing merchant plan/quota DTOs retain their numeric contract; this does not introduce a billing limit.

The BFF tracks `GET /api/partner/v1/purchase-sessions/{session_id}` using pt_, including after expiry. Check the returned `external_user_id` against the logged-in buyer before exposing any result. `order:null` means no order was found at query time; an order uses the existing merchant DTO without checkout/QR/payment links or Key. The public page uses only `POST /api/partner/purchase-sessions/{session_id}/exchange`, `GET /api/partner/purchase-sessions/{session_id}` and `POST /api/partner/purchase-sessions/{session_id}/orders`, with strict minimal DTOs and no cookie/platform authentication. Invalid, expired, revoked or replayed access returns `401 invalid_purchase_access`; unknown/foreign merchant sessions return `404 purchase_session_not_found`.

After lost responses or expired links, query the saved session before starting again. Paid-but-undelivered is **not** a reason to pay again. Closing the page does not cancel verified payment/delivery. New purchases require an explicit new merchant intent and key after reconciliation. No merchant webhook, automatic return, arbitrary return URL or universal WebView payment support is promised; gateways may require an external page. Browser return is never payment truth.

## Payment and delivery truth

- `payment_status`: `pending`, `paid`, `failed`, `expired`. `expired` is derived for a pending order past its deadline, not proof of gateway cancellation.
- `fulfillment_status`: `not_ready`, `pending`, `fulfilled`, `failed_retryable`.
- `paid` does not mean delivered. Only `paid + fulfilled` means entitlement delivery completed. A paid-but-pending/failed delivery must not prompt another payment.
- Dedicated Epay notification `/api/partner/subscription/epay/notify` verifies signature, success, merchant ID, order, exact amount, method and unique transaction evidence. Epay does not attest currency in its signed payload; this adapter's accepted currency is fixed to CNY.
- `/api/partner/subscription/epay/return` is informational only. Browser redirects, “I paid” buttons and merchant assertions never create payment truth.
- Verified payment commits separately from local delivery. Provision/account/key/entitlement plus the order's unique delivery marker commit atomically. Repeated notifications/recovery do not extend twice.
- Startup and a 30-second DB scan retry up to 100 due paid-undelivered orders; failures preserve paid status and retry after a bounded delay. Browser closure does not cancel this process.
- The implementation relies on trusted gateway notification retries to establish payment truth; it does **not** call an insecure gateway query API that exposes merchant keys in URLs. If all notifications are missing, operator/provider reconciliation is still required.
- Same-plan active renewal extends one month without adding current-period quota. An accepted renewal remains tied to its entitlement if natural expiry occurs before delivery; cancellation/deletion is not reversed.

### Purchase limits and operational recovery

A known exhausted purchase limit is rejected before checkout (`purchase_limit_reached`). Pending first-purchase orders reserve limited slots, including after cashier expiry, because a genuine late payment remains possible. There is currently no automatic gateway-close/slot-release API: abandoned limited orders require operator/provider reconciliation; do not delete them or release slots solely because a browser timer expired. For a normal renewable merchant monthly product, leave `max_purchase_per_user:0` unless this conservative limit is intended. Current plan removal, disabling, ownership/group or frozen-benefit changes can also leave paid delivery pending for operator recovery; do not charge again.

Configure stable `SESSION_SECRET` / `CRYPTO_SECRET` across restarts and replicas: rotating the cashier signing secret revokes outstanding links. Use the configured canonical HTTPS callback origin, never arbitrary merchant return URLs. Reverse proxies/CDNs must preserve no-store/no-referrer and must not inject analytics on the cashier; the built-in HTML route also denies framing.

## Subscription-only model use

Tenant membership forces subscription-only funding regardless of mutable billing preferences or a funded wallet. Missing/expired/inapplicable/exhausted subscriptions cannot fall back to wallet. Ordinary users and independent PartnerServer recharge are unchanged. Legacy Midjourney/SwapFace paths do not support subscriptions and reject Tenant members before upstream rather than use wallets. Membership lookup failures fail closed.

Disabling a tenant stops merchant management. It does not automatically revoke already-issued model Keys; existing delivered entitlement/model authentication follow their current policies. Membership is cached for up to one minute in a bounded cache and published after provisioning commits. Current plan rates/validity are read from the DB.

## Important errors

| HTTP | Code                                                       | Meaning                                                                                   |
| ---- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 400  | `invalid_request`                                          | Bad identity/body/idempotency key or forbidden fields/query                               |
| 400  | `unsupported_currency`                                     | Plan cannot be paid by the CNY Epay adapter                                               |
| 401  | `invalid_partner_secret`                                   | Invalid/rotated secret or disabled tenant                                                 |
| 401  | `invalid_checkout_access`                                  | Invalid/expired order capability; return to merchant status                               |
| 403  | `account_disabled`                                         | Existing account/member/user disabled or invalid group                                    |
| 404  | `account_not_found` / `plan_not_found` / `order_not_found` | Not found/unavailable in caller's tenant                                                  |
| 409  | `credential_unavailable`                                   | Existing Key unusable; never silently replaced                                            |
| 409  | `idempotency_conflict`                                     | Same retry key with a different user/plan/method                                          |
| 409  | `purchase_limit_reached`                                   | Already-purchased/reserved limit blocks a new order                                       |
| 429  | `rate_limited`                                             | Retry-After; per-user 20 recent orders/hour, 5 pending, tenant 2000/hour plus API budgets |
| 503  | `payment_unavailable`                                      | Configuration/preparation unavailable; retry same request/key after Retry-After           |
| 500  | `server_error`                                             | Server error; do not create a new purchase after an ambiguous timeout                     |

Model endpoints retain their normal protocol error format. No production deployment or live-payment test is implied by this contract; see the task verification report for executed and blocked checks.
