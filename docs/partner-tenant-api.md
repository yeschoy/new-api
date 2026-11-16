# Partner Tenant API

Tenants have exactly one immutable `integration_mode`: **subscription_key** (default) or explicitly selected **hosted_h5**. See the [buyer-ID-free subscription Key API](./partner-subscription-key-api.zh-CN.md) and [OpenAPI](./openapi/partner-subscription-key.openapi.json) for the default integration. This page documents H5 merchant support and shared payment invariants; [Chinese support reference](./partner-tenant-integration.zh-CN.md), [H5 protocol](./partner-hosted-h5.zh-CN.md).

## Creation and admission

Root-only `POST /api/partner-tenants` accepts `{name,group,integration_mode?}`. Only true field omission defaults to `subscription_key`; explicit empty/null/unknown/legacy values are invalid. The single-use security proof binds `{action:"create",group,integration_mode}` using the effective mode. Responses and management lists include stored `integration_mode`. Status updates accept only `{status}`; secret rotation accepts no body or `{}`. Extra mode fields are rejected, not silently ignored. No mode-switch endpoint exists. One dedicated group belongs to one tenant, including disabled tenants.

| Surface | subscription_key | hosted_h5 |
| --- | --- | --- |
| Tenant catalog `GET /plans` | Allow | Allow |
| Subscription-key order/read/claim/rotate and independent sub_ query | Allow | Deny |
| Merchant purchase sessions and public pl_/ps_ H5 | Deny | Allow |
| Account Key/quota and external-order status support | Deny | Allow |
| Old direct `POST /subscription-orders`, including exact replay | Deny | Deny |
| Shared cashier, verified payment, accepted-order delivery/recovery | Mode neutral | Mode neutral |

A current authenticated pt_ wrong entry returns `403 integration_mode_mismatch`. Public H5 capabilities use generic `401 invalid_purchase_access`, including wrong mode. Model entry transactions recheck current locked tenant policy; frontend/middleware are not mutation authority. Unknown/empty persisted modes fail closed. No mode restriction is added to shared paid fulfillment/binding/notify/recovery.

The platform owns orders, checkout, payment truth and delivery. Merchants do not collect payment or submit paid flags. Partner OAuth and PartnerServer wallet recharge remain separate and unchanged. Documentation describes branch code, not production deployment or live-payment acceptance.

Merchant management endpoints use HTTPS and `Authorization: Bearer pt_<server-secret>`, only from the merchant backend. Derive `external_user_id` from that backend's authenticated user; never forward an arbitrary browser-supplied ID without ownership validation. A model request uses the user's `sk-` key, never `pt_`.

- Base prefix: `/api/partner/v1`; plain business JSON, without a `{success,data}` envelope; `Cache-Control: no-store`.
- `external_user_id`: trimmed, case-sensitive, 1–128 Unicode code points, no control characters; URL-encode it as a path segment. Account identity is `(tenant_id, external_user_id)`.
- Order writes require `Idempotency-Key`: 16–64 URL-safe letters/digits/`-`/`_`. Keep one stable key per purchase attempt, including network retries. It is not a merchant business order number or the platform-generated order number.
- Unknown JSON fields/multiple JSON documents are rejected. Account provisioning allows up to 1 KiB; order creation allows up to 2 KiB. Order routes do not accept query parameters.
- Error body: `{"error":{"code":"order_not_found","message":"order not found"},"request_id":"..."}`.

## hosted_h5 merchant endpoints (catalog is shared)

| Method and path                                       | Contract                                                                                                                                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /purchase-sessions`                             | hosted_h5 only: `{external_user_id}` + Idempotency-Key → `{session_id,external_user_id,created_at,launch_expires_at,expires_at,purchase_url}`; first 201, exact replay 200, buyer conflict 409.       |
| `GET /purchase-sessions/{session_id}`                 | Merchant reconciliation: session fields, `redeemed`, and `order:null` or the existing merchant order status DTO (no checkout capability). Available after session expiry; BFF must check buyer ownership. |
| `GET /plans`                                          | Only this tenant's enabled plans. No user/account creation. Each plan also carries the additive `quota_cny` object (total only); see below. |
| `PUT /accounts`                                       | `{external_user_id, display_name?}` → stable `{external_user_id, api_key, created}`; initial create 201, repeat 200. Independent of payment/entitlement.                                                  |
| `POST /subscription-orders`                           | Retired: 403 integration_mode_mismatch for both modes; use the selected entry, never this endpoint.                                                          |
| `GET /subscription-orders/{order_no}`                 | Authenticated tenant-scoped order state; no Key, QR, payment link or checkout capability. Merchant BFF must also check its current user's ownership.                                                      |
| `GET /accounts/{external_user_id}/subscription/quota` | Only active tenant-owned subscriptions; returns totals/used/remaining, unlimited flag and reset/expiry times. Each item also carries the additive `quota_cny` object; see below. |

`PUT /accounts` can create an empty account and a fixed-group model Key before purchase; it does not grant quota. Disabled/deleted/wrong-group users and unavailable/expired/revoked credentials fail closed rather than being replaced. First fulfillment can provision an account if the merchant never called this operation.

Plans remain one calendar month with monthly reset and the tenant's dedicated group. `total_amount:0` means unlimited: check `quota_unlimited`, not a zero remaining amount. The highest applicable nonzero plan RPM applies, not the sum; system/group limits also apply. Multi-node shared RPM enforcement requires shared Redis.

### Fixed CNY quota display (`quota_cny`, additive)

Quota is an internal metering unit: it is not money and not a token count. Three different things must not be confused:

- **Purchase price**: `price_amount` + `currency` in the catalog; the amount actually charged is the order's `amount`.
- **Quota**: `total_amount` / `quota_total` / `quota_used` / `quota_remaining`, in internal quota units. These fields keep their names, values and JSON types (int64 JSON **numbers** on these two endpoints).
- **`quota_cny`**: the CNY display equivalent of that quota under the platform's **current** conversion configuration. It is not a wallet balance, not a price and not a historical cash debit, and it takes no part in billing, period reset, renewal or Key issuance.

`quota_cny` is added to each `subscriptions[]` item of `GET /accounts/{external_user_id}/subscription/quota` and to each `plans[]` item of `GET /plans`. Example quota item (configuration `quota_per_unit=500000`, rate `1`):

```json
{
  "plan_id": 42,
  "plan_title": "Monthly plan",
  "start_time": 1800000000,
  "end_time": 1802678400,
  "status": "active",
  "quota_total": 15000000,
  "quota_used": 16008,
  "quota_remaining": 14983992,
  "quota_unlimited": false,
  "next_reset_time": 1801440000,
  "quota_cny": {
    "currency": "CNY",
    "available": true,
    "total": "30.000000",
    "used": "0.032016",
    "remaining": "29.967984",
    "unlimited": false,
    "usable": true,
    "quota_per_unit": "500000",
    "usd_to_cny_rate": "1",
    "scale": 6,
    "rounding": "half_away_from_zero"
  }
}
```

Catalog plans carry the total only. There is no `used`, `remaining`, `usable` or `historical_remaining`, because a plan has no usage or entitlement:

```json
{
  "currency": "CNY",
  "available": true,
  "total": "30.000000",
  "unlimited": false,
  "quota_per_unit": "500000",
  "usd_to_cny_rate": "1",
  "scale": 6,
  "rounding": "half_away_from_zero"
}
```

| Field | Type | Meaning |
| --- | --- | --- |
| `currency` | string | Always `"CNY"`, whatever the site displays (USD, CNY, custom or tokens). |
| `available` | boolean | Whether the conversion can be displayed. It is **not** whether the subscription is usable. When false every amount is `null` and `reason` is present. |
| `reason` | string, optional | Only when `available` is false: `invalid_conversion_config` (a conversion factor is not finite and positive) or `invalid_quota` (the stored quota fact is invalid). |
| `total` | string or null | Period total. `null` when unlimited. |
| `used` | string or null | Quota items only. Stays the true used amount even when it exceeds the total. |
| `remaining` | string or null | Quota items only. Usable remaining, never negative; `null` when unlimited. |
| `unlimited` | boolean | Same fact as `quota_unlimited` / `total_amount == 0`. |
| `usable` | boolean | Quota items only. The entitlement fact: active and (unlimited or a positive raw remaining quota). It is never derived from an amount being greater than zero. It is a subscription-level quota fact: this endpoint does not check whether the account's platform user or model Key is currently enabled, so `usable: true` does not guarantee that a model call will succeed. |
| `quota_per_unit`, `usd_to_cny_rate` | string or null | Decimal text of the factors used for this response; `null` for a factor whose configuration is invalid. |
| `scale` | integer | Always `6`. |
| `rounding` | string | Always `"half_away_from_zero"`. |

Rules:

- `amount = quota × usd_to_cny_rate ÷ quota_per_unit`. Quota enters as an exact integer (never through floating point); the product is exact and only the single final division is rounded, to six places, with exact halves going away from zero. Amounts are fixed-point strings with exactly six fractional digits, never JSON numbers and never in scientific notation.
- Six places is a **display projection, not a lossless ledger**. `total`, `used` and `remaining` are rounded independently and may differ by one last-place unit; do not recompute a ledger from them. Reconcile with the raw quota fields.
- A small positive quota can display as `"0.000000"`. Decide whether quota is left from the raw fields and `usable`, and show "below the smallest display unit" rather than "free" or "zero".
- Unlimited is `total: null` (and `remaining: null`), never `"0.000000"`. Do not treat `null` as a zero limit.
- The configuration is read once per response at query time, so every item of one response uses the same factors. It is not an exchange-rate snapshot taken at purchase time.
- If the conversion configuration is invalid the endpoint still returns 200 with all original fields unchanged; only `quota_cny` reports `available: false` with `null` amounts. The platform never substitutes a default rate, a site display multiplier or zero. Fall back to showing raw quota.
- The hosted quota endpoint remains active-only, so its items never carry `historical_remaining`.

Compatibility: the field is purely additive. A third-party decoder that rejects unknown fields must be updated before it consumes these responses, and a client talking to an older or rolled-back platform must tolerate the field being absent. Adding `quota_cny` does not change or "fix" the legacy numeric contract: `total_amount` and the `quota_*` fields above remain int64 JSON numbers that need lossless parsing beyond the JavaScript safe-integer range. Go/PostgreSQL runtime verification of this addition has not been executed yet.

## Ordering and cashier

H5 orders are admitted only through an authenticated purchase session, as below. A public `POST /api/partner/purchase-sessions/{session_id}/orders` accepts `{plan_id,payment_method}` with Bearer ps_ and returns `{order_no,checkout_url}`. The BFF can read safe original order state with current pt_ after verifying external buyer ownership. Default-mode merchants instead use `POST /subscription-key-orders` with no buyer ID.

Amounts are server-authoritative decimal strings backed by integer cents. The first adapter is **configured Epay methods, CNY plans only**, with positive prices exactly representable in cents. Tenant plan creation and updates accept only CNY (the default when omitted); explicit foreign currencies are rejected. Historical non-CNY catalog entries still fail checkout with `unsupported_currency`; no implicit exchange rate or data migration is applied. The admin editor requires a new positive CNY price for such entries instead of carrying over their old amount. Ordinary plan currency behavior is unchanged.

Open `checkout_url` after a user action. It is a sensitive, short-lived, order-only bearer capability, not a platform login or model Key. Do not log, embed in analytics, share, put its fragment into a query string, or replace the fragment with the tenant secret. The cashier scrubs the fragment before router initialization and retains only per-order sessionStorage for same-tab reload. It fetches public-safe order data using `GET /api/partner/checkout/{order_no}` with `Authorization: Bearer pc_...`; no merchant management scope or buyer identity is exposed.

The cashier displays QR/payment links, and payment and delivery state separately. Payment channels can require a new window; the whole cashier is not an iframe storefront. New orders have a fixed 5-minute cashier deadline from creation; existing orders retain their persisted deadlines. The deadline does not expire or release the idempotency binding. After it expires, query through the authenticated merchant backend; an expired cashier does not prove that a late payment failed. Repeat create reuses the same order and deadline, not a fresh charge or refreshed expiry.

## hosted_h5 standalone purchase

See the [durable hosted-H5 guide (Chinese)](./partner-hosted-h5.zh-CN.md) for the browser protocol. Old direct-order consumers must use an approved selected entry; there is no compatibility purchase mode.

The merchant BFF derives `external_user_id` from trusted login, persists a stable purchase-intent idempotency key, and calls `POST /api/partner/v1/purchase-sessions` with **only** `{external_user_id}`. These new routes reject query parameters, unknown/duplicate/case-aliased JSON fields and bodies over 2 KiB. Keep pt_ and model Keys server-side. Save `session_id` and its buyer before returning the sensitive `purchase_url` to that buyer in a non-cacheable response. Do not put capabilities in logs, analytics, arbitrary redirects, or URL queries.

Open the URL standalone (current/new window or WebView, never iframe). Its `#launch=pl_...` is scrubbed before Router initialization and exchanged with a cryptographic, session-scoped client nonce. Lost exchange replies retry the same nonce; a different nonce/window cannot replay the launch. The returned ps_ stays in per-session sessionStorage/memory, not platform auth, localStorage or shared Query caches. Blocked storage limits refresh recovery. The launch deadline is fixed at creation +5 minutes and session deadline at creation +30 minutes; retries never extend either. Disabled tenants or rotated tenant credentials revoke later session requests. Order creation and replay re-read the session capability, binding, redemption/nonce, current hosted_h5 mode, merchant secret snapshot and fresh clock under the tenant lock in the shared order transaction, so delayed uploads and lock waits cannot preserve expired or revoked authority. Gateway preparation remains outside database transactions.

Only actual session catalog plans and payment methods are offered (positive exact-cent CNY prices, no legacy-currency relabeling). User submission freezes the original plan/method before sending. One session binds at most one order; double clicks, refresh and failed/timeout retries must reuse those original options. Conflicting options return `idempotency_conflict`, not another order. The page validates the original same-origin canonical cashier URL, then navigates there in the same tab; an existing order gets an explicit resume/view action, not another purchase form. An unexpired pending order is resumed by explicitly POSTing its server-returned `order.plan_id/payment_method` to the same session `/orders` endpoint before navigating, even after preparation returned 503 and a reload/status GET found the persisted order. A stale local draft never overrides the original order. GET remains read-only; prepared replay does not prepare/charge again, paid orders remain read-only, and expiry never creates a replacement. New orders keep their own fixed 5-minute access deadline, independent of the H5 session deadline; existing orders retain their original deadlines.

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
| 403  | `integration_mode_mismatch` | Operation is not permitted for this tenant integration; direct purchase is retired |
| 403  | `account_disabled`                                         | Existing account/member/user disabled or invalid group                                    |
| 404  | `account_not_found` / `plan_not_found` / `order_not_found` | Not found/unavailable in caller's tenant                                                  |
| 409  | `credential_unavailable`                                   | Existing Key unusable; never silently replaced                                            |
| 409  | `idempotency_conflict`                                     | Same retry key with a different user/plan/method                                          |
| 409  | `purchase_limit_reached`                                   | Already-purchased/reserved limit blocks a new order                                       |
| 429  | `rate_limited`                                             | Retry-After; per-user 20 recent orders/hour, 5 pending, tenant 2000/hour plus API budgets |
| 503  | `payment_unavailable`                                      | Configuration/preparation unavailable; retry same request/key after Retry-After           |
| 500  | `server_error`                                             | Server error; do not create a new purchase after an ambiguous timeout                     |

Model endpoints retain their normal protocol error format. No production deployment or live-payment test is implied by this contract; see the task verification report for executed and blocked checks.

## Administrator read-only merchant options

Two dashboard endpoints return one shared, safe projection of merchants (tenants) for administrator filters. They are read-only, use the dashboard `{success,message,data}` envelope, and are separate from both the merchant `pt_` API and the root-only management API (`/api/partner-tenants`), whose access rules and response shape are unchanged.

| Method and path | Used by | Session role | Personal access token scope |
| --- | --- | --- | --- |
| `GET /api/log/partner-tenants/options` | Merchant usage-log filters | Administrator or root | `log:read` |
| `GET /api/user/tenant-options` | User-list merchant filter | Administrator or root | `user:read` |

Each entry requires its own explicit scope: a token with only `log:read` cannot call the user entry and a token with only `user:read` cannot call the log entry. A token never widens its owner's role, so an ordinary user's token is rejected whatever scopes it lists. Desktop-client sessions cannot reach these routes. Merchant sub-accounts are ordinary dashboard users and are rejected like any other non-administrator.

These scope rules apply to scoped personal access tokens. A legacy (unscoped) dashboard access token is not scope-checked on any non-session dashboard route until the deployment's legacy-token retirement deadline; while it is still accepted, an administrator's or root's legacy token reaches both entries exactly as it already reaches the administrator log and user lists. It remains limited by its owner's role. This is the existing dashboard rule, not a behavior added by these endpoints.

Query parameters (all optional; each may appear at most once; unknown parameters are rejected):

| Parameter | Contract |
| --- | --- |
| `q` | Case-insensitive literal substring of the merchant name. At most 64 Unicode code points, valid UTF-8, no control characters; surrounding spaces are trimmed; empty means no filter. `%` and `_` match themselves. Only the name is searchable. Case folding of non-ASCII letters follows the database collation. |
| `p` | Page number, canonical decimal `1`–`1000000`. Default `1`. |
| `page_size` | Canonical decimal `1`–`100`. Default `20`. There is no unbounded listing. |
| `selected_id` | Canonical decimal positive signed 64-bit merchant ID (`1`–`9223372036854775807`). Resolves that one merchant by ID even when it is not on the returned page or does not match `q`. |

"Canonical decimal" means digits only: no sign, leading zero, space, fraction, exponent or hexadecimal form.

```json
{
  "success": true,
  "message": "",
  "data": {
    "page": 1,
    "page_size": 20,
    "total": 37,
    "items": [{ "id": "9007199254740993", "name": "Example Merchant" }],
    "selected": { "id": "12", "name": "Another Merchant" }
  }
}
```

- `items` are ordered newest first (descending ID) and `total` counts every merchant matching `q`, not only the returned page.
- An option is exactly `id` and `name`. `id` is a decimal **string**; clients must not convert it to a JavaScript Number. `name` is the merchant's current name.
- Disabled merchants are included: an option identifies records, it does not grant access. The dedicated group, integration mode, status, timestamps, secrets, buyer identities and model keys are never returned.
- `selected` is `null` when `selected_id` is omitted or no such merchant exists; an unknown ID is not an error.
- Successful responses send `Cache-Control: no-store`.

| HTTP | Code / message | Meaning |
| ---- | -------------- | ------- |
| 400 | `Invalid parameters` | Unknown or repeated parameter, malformed query encoding, non-canonical or out-of-range `p` / `page_size` / `selected_id`, or an invalid `q`. Nothing is silently ignored and no query is executed. |
| 401 | `AUTH_UNAUTHORIZED` (and the other dashboard authentication codes) | Missing, invalid or expired credential. |
| 403 | `AUTH_INSUFFICIENT_PRIVILEGE` | The caller is not an administrator or root. |
| 403 | `AUTH_DESKTOP_SCOPE_DENIED` | A desktop-client session called the route. |
| 403 | `ACCESS_TOKEN_SCOPE_DENIED` | The personal access token lacks this entry's scope. |
| 503 | `Database error, please contact the administrator` | The options could not be read. No database detail is returned; retry later. |

Authentication is evaluated before parameter validation. These two endpoints are documented from branch code; their PostgreSQL and real-route runtime tests have not been executed yet (see the usage-logs task verification record), so no deployment claim is made. The merchant usage-log list and statistics endpoints are specified in the next section.

## Administrator merchant usage logs

> **Scope of this surface.** These endpoints read ONLY the dedicated merchant usage table, which receives records written after merchant usage logging is cut over to it. Merchant records written before the cut-over stay in the default log table, remain visible on the default administrator log page (`GET /api/log/`) and are **not** migrated, copied or hidden. An empty or short result here therefore does not mean a merchant had no earlier usage, and the earliest record here is not a global cut-over time. The default administrator list, statistics and export never include records of the dedicated table. On this branch the writer that fills the dedicated table is not enabled yet.

| Method and path | Purpose | Session role | Personal access token scope |
| --- | --- | --- | --- |
| `GET /api/log/partner-tenants` | Paged records | Administrator or root | `log:read` |
| `GET /api/log/partner-tenants/stat` | Aggregates for the same filter | Administrator or root | `log:read` |

Authentication, token scope, legacy-token and desktop-session rules are those of the options endpoint above. Anonymous callers and ordinary users (including merchant sub-accounts) are rejected. Both endpoints use the dashboard `{success,message,data}` envelope and always send `Cache-Control: no-store`. The root-only management API (`/api/partner-tenants`) is unchanged.

### Filter parameters (both endpoints)

All parameters are optional and may appear at most once. An unknown, repeated, malformed, non-canonical or out-of-range parameter is rejected with HTTP 400 before any query; nothing is silently ignored. "Canonical decimal" is defined in the options section.

| Parameter | Contract |
| --- | --- |
| `tenant_id` | Canonical decimal positive signed 64-bit merchant ID. An empty value is invalid. |
| `user_id` | Canonical decimal positive signed 64-bit user ID. An empty value is invalid. |
| `username` | Exact match. Valid UTF-8, no control characters, at most 191 bytes. Empty means no filter. |
| `model_name` | Exact match. Same text rules, at most 255 bytes. |
| `request_id` | Exact match. Same text rules, at most 64 bytes. |
| `type` | `consume` or `error`. Omitted selects both. Any other value, including empty, is invalid. |
| `start_timestamp`, `end_timestamp` | Canonical decimal non-negative Unix seconds, inclusive. `0` is the same as omitted. When both are given, `start_timestamp` must not exceed `end_timestamp`. |

**Bounded window.** The window is always bounded, for administrators and root alike, by the deployment's maximum log time range (the same rule and setting as the ordinary user log search), because the statistics scan the whole window. An omitted `start_timestamp` reaches back that maximum range from the end (or from now, if the end is later than now); a wider explicit range is rejected with HTTP 400 and the existing message `The time range cannot exceed {{days}} days` (the body carries `days`, the configured limit). An omitted `end_timestamp` is the server's current time. Both responses report the effective window as `start_timestamp` / `end_timestamp`. Send both bounds explicitly when a list page and the statistics must describe the same set.

The list additionally accepts:

| Parameter | Contract |
| --- | --- |
| `p` | Canonical decimal `1`–`1000000`. Default `1`. |
| `page_size` | Canonical decimal `1`–`100`. Default: the deployment's default page size (10 unless reconfigured). |

`p` and `page_size` are unknown parameters on the statistics endpoint and are rejected there.

### `GET /api/log/partner-tenants`

```json
{
  "success": true,
  "message": "",
  "data": {
    "page": 1,
    "page_size": 10,
    "total": 4,
    "start_timestamp": 1794800000,
    "end_timestamp": 1794886400,
    "items": [
      {
        "id": "9007199254740993",
        "event_id": "ptu_0123456789abcdef0123456789abcdef",
        "created_at": 1794880000,
        "type": 2,
        "tenant_id": "12",
        "tenant_name": "Example Merchant",
        "account_id": "345",
        "identity_source": "subscription_key",
        "user_id": "6789",
        "username": "pt_u_6789",
        "token_id": "4321",
        "token_name": "default",
        "model_name": "example-model",
        "channel_id": "7",
        "channel_name": "Example Channel",
        "group": "merchant-12",
        "ip": "",
        "request_id": "20261117093320000000001abcdefgh",
        "upstream_request_id": "",
        "subscription_id": "",
        "quota": "250000",
        "quota_cny": "3.650000",
        "prompt_tokens": "1200",
        "completion_tokens": "800",
        "use_time": 3,
        "is_stream": true,
        "content": "",
        "other": "{\"billing_source\":\"subscription\"}"
      }
    ]
  }
}
```

The example shows the first of the four matching items; the other three are omitted for brevity.

`total` is the number of matching **records** (rows) for the filter, across all pages; it is a JSON number. Records are ordered newest first by `created_at`, then by local `id`, both descending (on ClickHouse, where `id` is always `0`, by `event_id`). The count and the page are produced by the same filter.

| Field | JSON type | Meaning |
| --- | --- | --- |
| `id` | string (decimal) | Local row ID in the dedicated table. Not comparable with IDs of the default log table. |
| `event_id` | string | Immutable, random, non-secret event identifier. |
| `created_at` | number | Unix seconds. |
| `type` | number | `2` = consume, `5` = error — the same codes as the default logs. |
| `tenant_id`, `account_id` | string (decimal) | Merchant and merchant-account IDs frozen in the record. |
| `tenant_name` | string | Merchant name **as frozen when the record was written**, not the current name. |
| `identity_source` | string | `external` or `subscription_key`. |
| `user_id`, `token_id`, `channel_id` | string (decimal) | Internal IDs. `"0"` when not known. |
| `username`, `token_name`, `model_name`, `group`, `ip` | string | Usage facts as recorded. `ip` follows the existing recording switch. |
| `channel_name` | string | Current channel name looked up by ID; empty when unknown. |
| `request_id`, `upstream_request_id` | string | Request correlation. Retries of one request share a `request_id`. |
| `subscription_id` | string (decimal) | Only when it was a known fact at write time; otherwise the empty string. |
| `quota` | string (decimal) | Raw charged quota units of this record. `"0"` for error records. |
| `quota_cny` | string or `null` | Six-place fixed-point CNY display equivalent of `quota` at the current configuration; `null` when the conversion is unavailable. |
| `prompt_tokens`, `completion_tokens` | string (decimal) | Token counts. |
| `use_time` | number | Seconds. |
| `is_stream` | boolean | |
| `content` | string | Recorded message, as on the default logs. |
| `other` | string | JSON text of the recorded metadata, projected for the caller's role exactly like the default logs: administrators do not receive root-only diagnostics, root does. |

Every ID, quota and token field is a decimal string: do not convert it to a JavaScript Number. The response never contains merchant secrets, buyer identifiers, credential hashes or model-key strings.

### `GET /api/log/partner-tenants/stat`

```json
{
  "success": true,
  "message": "",
  "data": {
    "record_count": "4",
    "request_count": "3",
    "succeeded_count": "2",
    "failed_count": "1",
    "quota": "750000",
    "prompt_tokens": "3600",
    "completion_tokens": "2400",
    "tokens": "6000",
    "quota_cny": {
      "currency": "CNY",
      "available": true,
      "quota_per_unit": "500000",
      "usd_to_cny_rate": "7.3",
      "scale": 6,
      "rounding": "half_away_from_zero",
      "amount": "10.950000"
    },
    "start_timestamp": 1794800000,
    "end_timestamp": 1794886400
  }
}
```

(Here 750000 × 7.3 ÷ 500000 = 10.95, and 4 records fold into 3 requests because two records share one `request_id`.)

| Field | JSON type | Meaning |
| --- | --- | --- |
| `record_count` | string (decimal) | Rows matching the filter, consume and error. Equals the list's `total` for the same filter and window. |
| `request_count` | string (decimal) | Request outcomes after folding. Always `succeeded_count + failed_count`. |
| `succeeded_count`, `failed_count` | string (decimal) | Outcomes by the failure classification below. |
| `quota` | string (decimal) | Exact sum of raw `quota` over **consume** rows. May exceed the signed 64-bit range. |
| `prompt_tokens`, `completion_tokens`, `tokens` | string (decimal) | Exact sums over consume rows; `tokens` is their total. |
| `quota_cny` | object | Conversion metadata (`currency`, `available`, optional `reason`, `quota_per_unit`, `usd_to_cny_rate`, `scale`, `rounding`) plus `amount`. |
| `quota_cny.amount` | string or `null` | The raw quota is summed first and converted **once**; it is not the sum of per-row rounded amounts. `null` — never `"0.000000"` — when the conversion is unavailable. |
| `start_timestamp`, `end_timestamp` | number | Effective window. |

**Cost.** The statistics endpoint reads every matching record of the window in one pass on each call; there is no row cap or server-side timeout beyond the bounded window. Narrow the window or add a merchant filter for large data sets.

**Records versus requests.** `total` and `record_count` count rows. `request_count` counts request outcomes: rows sharing a non-empty `request_id` (for example a failed attempt and its successful retry) fold into one outcome, while every row with an empty `request_id` is its own request. Filters are applied first and folding happens only among the selected rows: a row outside the window or excluded by a filter never changes the outcome of a selected request (with `type=error`, folding happens among error rows only).

**Outcome and failure classification.** Among the rows of one request the outcome is the consume row over an error row, then the latest by time, then by ID (the existing request-outcome ranking of the user request list). Being chosen does not make a request successful. The chosen outcome is **failed** when it is an error record, when it carries a violation-fee marker, or when it is a stream whose recorded stream status is `error`; otherwise it succeeded.

**Sums cover charged facts.** `quota` and the token sums add every consume row: a charged failure (for example a violation fee recorded as consume, or a stream that failed after being charged) and every charged retry attempt are included and are never zeroed or de-duplicated by `request_id`. Error rows add nothing. A request can therefore be counted as failed while its charge is part of `quota`.

**CNY is a display equivalent.** `quota_cny` values convert raw quota at the **current** `quota_per_unit` and USD→CNY rate (one configuration snapshot per response), rounded once to six places, half away from zero. They are not historical cash debits, not a wallet balance and not a plan price; they change when the configuration changes. When either factor is invalid the amounts are `null` (`available: false`, `reason: "invalid_conversion_config"`) while the raw fields and HTTP 200 are unaffected. A small positive quota can round to `"0.000000"`; use the raw `quota` to tell it from zero.

### Errors

| HTTP | Code / message | Meaning |
| ---- | -------------- | ------- |
| 400 | `Invalid parameters` | Unknown or repeated parameter, malformed query encoding, non-canonical or out-of-range value, `start_timestamp` after `end_timestamp` (or after the server's current time when `end_timestamp` is omitted), or `p` / `page_size` on the statistics endpoint. No query is executed. |
| 400 | `The time range cannot exceed {{days}} days` | The requested window is wider than the maximum log time range. The response body includes `days`. No query is executed. |
| 401 | `AUTH_UNAUTHORIZED` (and the other dashboard authentication codes) | Missing, invalid or expired credential. |
| 403 | `AUTH_INSUFFICIENT_PRIVILEGE` | The caller is not an administrator or root. |
| 403 | `AUTH_DESKTOP_SCOPE_DENIED` | A desktop-client session called the route. |
| 403 | `ACCESS_TOKEN_SCOPE_DENIED` | The personal access token lacks `log:read`. |
| 503 | `Database error, please contact the administrator` | The records could not be read. No database detail is returned; retry later. |

Authentication is evaluated before parameter validation. These two endpoints are documented from branch code. They have **not** been executed against PostgreSQL or through the real routes yet (see the usage-logs task verification record); ClickHouse, MySQL and SQLite behavior is derived from source only. No deployment claim is made.

## Additive migration and rollout boundary

Startup calls `MigratePartnerTenantIntegrationModes` before broad AutoMigrate: varchar(24), NOT NULL, default subscription_key; missing/null/empty historical modes normalize to that default. Explicit H5 survives repeat migration; unknown nonempty values are retained but denied. Account identity_source, order entry_mode and payment facts are not relabelled/deleted. PostgreSQL runtime verification for this change is blocked by unavailable task Docker; no startup/production claim is made. Old binaries do not enforce these modes. Rollback must retain columns, accepted orders and payments; do not serve merchant admission on old nodes or assume mixed-version safety.
