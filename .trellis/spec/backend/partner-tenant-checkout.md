# Partner Tenant Paid Checkout

## 1. Scope / Trigger

Read before changing pt_ Tenant account/key provisioning, subscription plan ownership/currency, order checkout/notification/fulfillment, the public partner cashier or Tenant model funding. This replaces the external Tenant direct-grant API; it does not replace Partner OAuth, pst_ PartnerServer wallet recharge or ordinary-user checkout. No legacy/new-mode switch exists. For the optional standalone selector before order creation, also read [Optional Hosted H5](partner-hosted-h5.md); API/H5 are coexisting entry choices, not legacy/direct-grant modes.

## 2. Signatures

- Merchant: `GET /api/partner/v1/plans`, `PUT /accounts`, `POST /subscription-orders`, `GET /subscription-orders/:order_no`, `GET /accounts/:external_user_id/subscription/quota` (Bearer pt_, plain JSON, no-store).
- Create body `{external_user_id,plan_id,payment_method}` + Idempotency-Key, 16–64 URL-safe chars. Server order number `PTO` + 32 random alphanumeric chars. No client price or paid flag.
- Public cashier: `/partner/checkout?order_no=...#token=pc_...`; GET `/api/partner/checkout/:order_no` with capability in Authorization, not query.
- Epay: GET/POST `/api/partner/subscription/epay/notify`; return endpoint is informational only.
- `PartnerTenantSubscriptionOrder`: unique order_no and `(tenant_id,idempotency_hash)`, request hash, buyer hash, frozen plan/price/currency/renewal intent, separate payment and fulfillment state, globally unique nullable transaction hash, checkout claim and retry progress. Never use TopUp to credit its wallet.
- `PartnerTenantAccount.ExternalUserIdHash`: unique tenant/hash with nullable legacy backfill; drop the old collation-dependent unique index only after backfill. Existing mapping data is preserved.
- `IsPartnerTenantUser(userID) (bool,error)`, transaction-scoped provisioning/grant helpers, `RecordPartnerTenantPayment`, `FulfillPartnerTenantSubscriptionOrder`, `RecoverPartnerTenantSubscriptionOrders` own the boundaries.

## 3. Contracts

- Merchant backend derives its stable, case-sensitive external_user_id from trusted login state. pt_ never enters browser code. Independent PUT account operation may create an empty user/Key but never entitlement; unpaid ordering does not create an account.
- Plan scope is tenant/group, one calendar month/monthly reset, no wallet overflow. Tenant plan create/update accepts CNY only (omission defaults to CNY), with finite positive exact-cent prices; explicit USD/other currencies are rejected. Ordinary admin plans retain USD behavior. Admin Tenant UI sends CNY and displays actual price currency without applying quota exchange rates. Historical non-CNY prices are not migrated or relabelled: opening them in the editor clears the price to zero and requires explicit positive CNY repricing before submit; their stored catalog currency remains truthful until saved.
- Create returns 201, exact replay 200, different body with same key 409. Replays retain original order/deadline; snapshots cannot be silently replaced after plan edits. Lock tenant -> order -> account when combined; use unique constraints/current reads, never MySQL no-op RowsAffected as insertion proof.
- Order/API money is decimal string backed by integer cents. Signed callback must match success, configured pid, exact order/provider/method/cents and unique gateway transaction. Epay's signature does not prove currency; the adapter fixes CNY. Late real payments remain recordable after checkout expiry.
- Payment evidence commits independently before fulfillment. Account/Key/subscription and fulfilled marker commit together; duplicate notification/retry does not renew twice. Paid failure stays paid and retryable. No DB transaction spans external network calls.
- Account/tenant/user/credential disablement, deletion, wrong group and key expiry fail closed. Never issue replacement credentials to heal a forbidden mapping. Membership cache is published only after transaction commit.
- Background startup/30-second scans process at most 100 due paid-unfulfilled orders. Callback retry establishes external payment truth; no insecure query endpoint exposing merchant keys in URL. Missing all gateway notifications requires operator/provider reconciliation.
- Known purchase limits are checked before payment. Accepted renewal freezes its subscription ID and can survive natural expiry, not explicit cancellation. Nonzero purchase limits conservatively reserve pending first-purchase slots beyond browser expiry because of late payment; no automatic gateway close/release exists. Do not delete/release such orders without payment reconciliation.
- Cashier HMAC is purpose-separated, order-bound and expires at initial 30-minute deadline. Stable SESSION_SECRET/CRYPTO_SECRET across nodes/restarts are required. DTO has no buyer ID/tenant secret/Key; only pending DTO includes QR/payment URL.
- Merchant status needs pt_ and BFF user ownership; public capability is not a login. Scrub fragment before Router, use per-order sessionStorage only, separate fetch from auth interceptors, no third-party analytics, strict DTO decoder, HTTPS no-userinfo pay links, nonoverlap cancellable polling. HTML/API no-store/no-referrer and frame denial; redirects never settle.
- Cashier path classification must match Go's single URL-path decode, not raw browser pathname literals. Before analytics, `web/index.html` classifies once (catch malformed encodings) for both CSP/referrer and analytics exclusion; `isPartnerCheckoutPath(pathname)` uses the same rule. Exact decoded `/partner/checkout` or `/partner/checkout/` is cashier; malformed, double-encoded and lookalike paths are not. `prepareCashierEntry()` canonicalizes recognized static-host aliases to `/partner/checkout`, preserving the raw query and scrubbing the fragment before Router or generic cache/branding/status effects. Both Go HTML routes redirect encoded/trailing-slash aliases with 301 to the local canonical path plus unchanged query and retain no-store/no-referrer/DENY/frame-ancestors headers. Never put a capability in Location or rely solely on a server redirect to protect static deployments.
- Tenant membership forces subscription_only at NewBillingSession even with wallet preference/balance. Membership DB error fails closed. Legacy MJ/SwapFace unsupported subscription paths must check membership before upstream and reject, not debit wallet. Ordinary users/pst_ recharge behavior stays unchanged.

## 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Foreign/disabled plan/order | Scoped 404, no payment/entitlement mutation |
| Non-CNY paid checkout | 400 unsupported_currency; never reinterpret as CNY |
| Same retry key, different buyer/plan/method | 409 idempotency_conflict |
| Known purchased/reserved limit | 409 purchase_limit_reached before gateway |
| Invalid/missing/expired cashier token | 401 invalid_checkout_access, no buyer disclosure |
| Invalid signature/pid/method/money/transaction | Notify `fail`, no paid fact |
| Duplicate verified callback | Same paid fact, one fulfillment effect |
| Delivery fails after payment | paid + failed_retryable, no second charge, safe retry code |
| User/Key forbidden | account_disabled / credential_unavailable; no replacement |
| Tenant wallet has funds but no usable plan | Reject model use, wallet untouched |
| Legacy MJ Tenant or membership-query failure | Reject before upstream |
| Browser success/return/paid assertion | Informational only, no settlement |
| `/partner/%63heckout`, `/%70artner/checkout`, encoded separator, trailing slash | Same early CSP/no analytics; canonical path, preserved query, fragment removed before Router; Go aliases redirect with privacy headers |
| Malformed encoding, `/partner/%2563heckout`, `/partner/checkout-other` | No decode exception or recursive decoding; ordinary-page behavior remains unchanged |

## 5. Good / Base / Bad Cases

- Good: merchant creates one order, user closes cashier after paying, notification records payment, background delivery provisions one user/Key/plan, merchant later queries paid+fulfilled.
- Base: independent key creation first; purchase reuses that Key. Ordinary user's wallet_first still works.
- Bad: directly calling old grant after collecting money; replay creates another charge; changing USD to CNY without conversion authority; source is paid but rolled back because a Key was disabled; expired browser link treated as gateway cancellation.

## 6. Tests Required

- `model/partner_tenant_order_test.go`: real SQLite/MySQL/PostgreSQL and MySQL clientFoundRows, fresh/legacy/repeated migrations, identity case sensitivity, same-key concurrency, paid evidence uniqueness, atomic rollback, disabled resources, recovery, renewal and known/accepted purchase limits.
- `controller/partner_tenant_order_test.go`, `partner_tenant_review_test.go`: mocked TLS gateway, strict notifications, late/duplicate payment, failed preparation, public DTO/capability, real admin plan create/update -> checkout, purchase limit before gateway. Keep shared transport PartnerServer regression.
- `router/partner_tenant_router_test.go`, web-route regression: removed grant, authenticated tenant scoping, cashier HTML/cache headers. `router/plugin_router_test.go:TestPartnerCashierHTMLCanonicalizesEncodedPaths` asserts encoded aliases/trailing slash redirect locally, preserve raw query and privacy headers, then serve canonical HTML; double-encoded/lookalike negative cases do not redirect.
- Service funding and `relay/mjproxy_tenant_funding_test.go`: funded wallet refusal, DB failure, ordinary-user unchanged and no legacy upstream calls. Test fixtures using BillingSession must migrate PartnerTenantAccount.
- `web/src/features/partner-checkout/__tests__`: access scrub/reload/scope, raw fetch contract/no login effects, schema/status/links/QR/poll cleanup, public root isolation, all seven locales. Subscription admin price/payload CNY vs ordinary USD regression, explicit foreign-currency admin rejection, and historical non-CNY edits requiring a new exact-cent CNY price rather than carrying the old amount.
- Cashier access/document-policy/route/bootstrap regressions must execute real early HTML scripts, access helper, root route and `main.tsx` control flow with encoded/canonical/negative samples: CSP/referrer before analytics, no mounted analytics, fragment gone at Router construction, no generic login/status/branding/cache initialization, per-order reload preserved, ordinary pages unchanged. Do not mock the path predicate itself to prove this security boundary.
- All Go tests/DB engines, including SQLite, run in task-owned Docker. A successful `go build`/`go vet` is NOT DB runtime verification. Report blocked container startup or skipped engines and do not archive as fully verified.

## 7. Wrong vs Correct

```go
// Wrong: local delivery rollback erases evidence that external money moved.
DB.Transaction(func(tx *gorm.DB) error {
    markPaid(tx)
    return provisionAndGrant(tx)
})

// Correct: durable verified payment and atomic, idempotent local delivery.
if err := RecordPartnerTenantPayment(order, provider, pid, method, txn, cents); err != nil {
    return err
}
return FulfillPartnerTenantSubscriptionOrder(order)
```

```ts
// Wrong: raw browser pathname can differ from Gin's decoded routing path.
const cashier = window.location.pathname === '/partner/checkout'

// Correct: bounded single decode before policy/analytics; catch malformed paths.
const cashier = isPartnerCheckoutPath(window.location.pathname)
prepareCashierEntry() // canonicalize/scrub before createRouter and shared effects
```

```ts
// Wrong: generic auth client, URL credential, browser success grants rights.
api.get(`/checkout?secret=${tenantSecret}`)

// Correct: order-only auth, dedicated request policy, authoritative status.
fetch(`/api/partner/checkout/${orderNo}`, {
  headers: { Authorization: `Bearer ${orderCapability}` },
  credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
})
```
