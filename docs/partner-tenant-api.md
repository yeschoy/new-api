# Partner Tenant API

For request examples and error codes, see the [Chinese API reference](./partner-tenant-integration.zh-CN.md). This describes the current branch implementation, not a claim that it has been deployed or payment/DB integration tests have passed.

## Contract and authentication

The merchant owns its website, user login, plan cards and purchase dialog. **The platform owns subscription orders, checkout, verified payment and delivery.** Merchants do not collect payment or report a paid flag. The old external direct-subscription-grant route is removed, with no legacy mode. This Tenant contract is separate from Partner OAuth and PartnerServer wallet recharge.

Merchant management endpoints use HTTPS and `Authorization: Bearer pt_<server-secret>`, only from the merchant backend. Derive `external_user_id` from that backend's authenticated user; never forward an arbitrary browser-supplied ID without ownership validation. A model request uses the user's `sk-` key, never `pt_`.

- Base prefix: `/api/partner/v1`; plain business JSON, without a `{success,data}` envelope; `Cache-Control: no-store`.
- `external_user_id`: trimmed, case-sensitive, 1–128 Unicode code points, no control characters; URL-encode it as a path segment. Account identity is `(tenant_id, external_user_id)`.
- Order writes require `Idempotency-Key`: 16–64 URL-safe letters/digits/`-`/`_`. Keep one stable key per purchase attempt, including network retries. It is not a merchant business order number or the platform-generated order number.
- Unknown JSON fields/multiple JSON documents are rejected. Account provisioning allows up to 1 KiB; order creation allows up to 2 KiB. Order routes do not accept query parameters.
- Error body: `{"error":{"code":"order_not_found","message":"order not found"},"request_id":"..."}`.

## Endpoints

| Method and path | Contract |
| --- | --- |
| `GET /plans` | Only this tenant's enabled plans. No user/account creation. |
| `PUT /accounts` | `{external_user_id, display_name?}` → stable `{external_user_id, api_key, created}`; initial create 201, repeat 200. Independent of payment/entitlement. |
| `POST /subscription-orders` | `{external_user_id, plan_id, payment_method}` + Idempotency-Key → platform order and cashier URL; initial 201, replay 200, conflicting body 409. |
| `GET /subscription-orders/{order_no}` | Authenticated tenant-scoped order state; no Key, QR, payment link or checkout capability. Merchant BFF must also check its current user's ownership. |
| `GET /accounts/{external_user_id}/subscription/quota` | Only active tenant-owned subscriptions; returns totals/used/remaining, unlimited flag and reset/expiry times. |

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
  "order_no":"PTO0123456789ABCDEFGHIJKLMNOPQRSTUV",
  "external_user_id":"customer-7",
  "plan_id":42,
  "plan_title":"Monthly model plan",
  "amount":"99.00",
  "currency":"CNY",
  "payment_method":"alipay",
  "payment_status":"pending",
  "fulfillment_status":"not_ready",
  "created_at":1800000000,
  "expires_at":1800001800,
  "checkout_url":"https://platform.example/partner/checkout?order_no=PTO0123456789ABCDEFGHIJKLMNOPQRSTUV#token=pc_<order-capability>"
}
```

Amounts are server-authoritative decimal strings backed by integer cents. The first adapter is **configured Epay methods, CNY plans only**, with positive prices exactly representable in cents. Other currencies fail with `unsupported_currency`; no implicit exchange rate. Newly edited Tenant plans in the admin UI use CNY; ordinary plan currency behavior is unchanged. Existing USD catalog entries are not silently converted.

Open `checkout_url` after a user action. It is a sensitive, short-lived, order-only bearer capability, not a platform login or model Key. Do not log, embed in analytics, share, put its fragment into a query string, or replace the fragment with the tenant secret. The cashier scrubs the fragment before router initialization and retains only per-order sessionStorage for same-tab reload. It fetches public-safe order data using `GET /api/partner/checkout/{order_no}` with `Authorization: Bearer pc_...`; no merchant management scope or buyer identity is exposed.

The cashier displays QR/payment links, and payment and delivery state separately. Payment channels can require a new window; the whole cashier is not an iframe storefront. Public cashier access lasts until the order's initial 30-minute deadline. After it expires, query through the authenticated merchant backend; an expired cashier does not prove that a late payment failed. Repeat create reuses the same order and deadline, not a fresh charge or refreshed expiry.

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

| HTTP | Code | Meaning |
| --- | --- | --- |
| 400 | `invalid_request` | Bad identity/body/idempotency key or forbidden fields/query |
| 400 | `unsupported_currency` | Plan cannot be paid by the CNY Epay adapter |
| 401 | `invalid_partner_secret` | Invalid/rotated secret or disabled tenant |
| 401 | `invalid_checkout_access` | Invalid/expired order capability; return to merchant status |
| 403 | `account_disabled` | Existing account/member/user disabled or invalid group |
| 404 | `account_not_found` / `plan_not_found` / `order_not_found` | Not found/unavailable in caller's tenant |
| 409 | `credential_unavailable` | Existing Key unusable; never silently replaced |
| 409 | `idempotency_conflict` | Same retry key with a different user/plan/method |
| 409 | `purchase_limit_reached` | Already-purchased/reserved limit blocks a new order |
| 429 | `rate_limited` | Retry-After; per-user 20 recent orders/hour, 5 pending, tenant 2000/hour plus API budgets |
| 503 | `payment_unavailable` | Configuration/preparation unavailable; retry same request/key after Retry-After |
| 500 | `server_error` | Server error; do not create a new purchase after an ambiguous timeout |

Model endpoints retain their normal protocol error format. No production deployment or live-payment test is implied by this contract; see the task verification report for executed and blocked checks.
