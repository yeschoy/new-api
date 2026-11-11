# FlashIP implementation hypotheses and current-project assessment

## Review scope

The user explicitly asked for hypotheses about FlashIP and an assessment of this repository. This is a read-only architecture review and planning update, not permission to implement a hypothesis. Public evidence is in `flaship-ordering-comparison.md`; no FlashIP private API, authenticated session, network capture, or payment was inspected. No repository tests or payment integrations were run for this review.

## FlashIP hypotheses — not verified implementation facts

| Hypothesis | Reasoning | Confidence/limitation |
| --- | --- | --- |
| A provider-maintained purchase module is opened inside AdsPower, possibly H5/WebView or an embedded frontend component. | The supplied dialog has supplier branding, supplier terms, detailed SKU selection, fees, several payment methods, and wallet UI. Centralizing this avoids each partner rebuilding a full supplier checkout. | Plausible preferred hypothesis, not proof of iframe or frontend ownership; a native AdsPower UI calling APIs is also possible. |
| A partner/user-or-team mapping identifies the buyer, with a short-lived checkout/session handoff if supplier-hosted UI is used. | The dialog can show an account balance and purchased resources must be associated with an owner; AdsPower help mentions a Team USD Wallet. | Buyer/account correlation is necessary, but exact mapping, SSO/OAuth/signatures, user versus team scope, and initial account-creation timing are unknown. |
| The backend quotes product/term/region/quantity, computes fees, creates an order, confirms payment, then fulfills resources asynchronously. | The screenshot has a fee breakdown and AdsPower help says assignment can take time and supports refresh/purchase records. | General plausible commerce architecture, not verified endpoint shapes, order-number ownership, or final fund recipient. |
| Payment can use purchase-wallet funds or an external gateway, followed by resource synchronization into the host app. | Both are visible in the screenshot, whereas the public help's separate documented purchase entry is wallet-only. | Do not merge these entries as one proved backend; the screenshot alone cannot establish wallet owner, revenue share, settlement, or callback implementation. |

Do not copy an assumed FlashIP API. Copy the separation of merchant storefront, buyer identity, supplier-owned commerce, and fulfillment. A permanent merchant secret must remain on the merchant server; an embedded purchase page would receive a narrowly scoped short-lived session, not that secret in a URL.

## Important correction to the earlier repository assessment

The repository is **not missing all merchant order APIs**. Earlier inspection focused only on the Tenant subset and overlooked an already-registered PartnerServer payment lane. It is missing a paid **subscription-plan** purchase closure for the currently discussed Tenant mode. The distinction materially changes the reuse plan.

### Registered merchant lanes

- `router/main.go:20` registers `SetPartnerServerRouter`, and `router/partner-oauth-router.go:38` also registers the Tenant router.
- `router/partner-server-router.go` exposes POST `/api/partner/v1/accounts/{external_user_id}/credential`, POST `/api/partner/v1/accounts/{external_user_id}/payment/orders`, and GET `/api/partner/v1/payment/orders/{order_id}`.
- `controller/partner_server_payment.go:188` accepts **amount + payment_method**, creates a platform order, automatically ensures a PartnerAccount, and returns `qr_code` / `pay_url`. `PartnerServerGetPaymentOrder` at line 307 queries it. This is an existing API-first in-app payment building block.
- `model/partner_account.go:842` creates an account, **TopUp**, and tenant-client order link atomically, generates `TradeNo` on the platform, and calls the gateway after commit. It has retry-claim and persisted checkout mechanisms. Successful payment follows the recharge/wallet settlement path, not subscription fulfillment.
- `controller/partner_server_accounts.go:122` already independently gets/creates account/key. `.trellis/spec/backend/partner-server-accounts.md` documents this full lane, including server secrets, `pst_` tokens, disablement, limits, audit, and payment behavior.
- The Tenant lane has `pt_` authentication, `PartnerTenantAccount`, fixed-group credentials, plan listing, grant/renewal, and quota (`router/partner_tenant.go`; `model/partner_tenant.go:218,345`). It has no paid plan-order route.
- PartnerServer uses `PartnerAccount` keyed by client ID plus external-user-ID hash, with 32–64 URL-safe external IDs (`service/partner_account.go:19`). Tenant uses `(tenant_id, external_user_id)` and permits 1–128 Unicode characters. These identities/credentials are not interchangeable merely because both routes begin `/api/partner/v1`.

## Findings against the desired purchase experience

### F1 — Two incomplete business paths for the new goal, not a need to rebuild everything

PartnerServer already has order checkout/status but settles wallet recharge. Tenant already has dedicated subscription entitlement but no paid ordering. Requiring merchants to understand and combine both incompatible identity/auth paths would be error-prone. The same literal external ID may identify different accounts in the two namespaces; it is not a platform-global identity.

Recommendation: choose one canonical mode/account mapping for the new subscription offering; reuse gateway/retry/status patterns without mixing PartnerAccount and PartnerTenantAccount records. For a narrow MVP, extend the discussed Tenant subscription mode, preserve the existing PartnerServer recharge contract, and reuse/extract only stable payment transport primitives. Do not introduce a third merchant-account model or silently migrate funded legacy wallets.

### F2 — A direct grant is valid for the old trusted-merchant fulfillment design, but bypasses the new paid-order gate if left unrestricted

`model/partner_tenant.go:345` grants/renews on authenticated tenant + user + plan + request key with no verified platform-payment prerequisite. This is not a newly proved security defect in its original merchant-collects-payment contract. Under a platform-collects-payment contract, unrestricted access to that grant would allow entitlement without buying an order.

Recommendation: make order-backed fulfillment/internal administration the only entitlement authority for the approved paid mode; explicitly decide legacy direct-grant migration/authorization rather than leave both paths open.

### F3 — Ordinary subscription checkout is not a drop-in fix

`controller/subscription.go:189` rejects partner-owned plans; `model/subscription.go:510` gates partner plans by source. `CompleteSubscriptionOrder` at line 599 uses source `order`. Reusing ordinary checkout by removing only its frontend/controller rejection would fail or weaken tenant boundaries. Keep plan-ownership, compliance, source, and callback rules explicit.

The current ordinary `SubscriptionOrder` at `model/subscription.go:226` has money/provider/status but no explicit tenant association or currency/entitlement-snapshot contract. Design the merchant association and authoritative amount/currency/benefit snapshot instead of letting clients choose a charge or treating a current plan record as an immutable purchase snapshot.

### F4 — Model subscription-only policy needs membership-based enforcement

`service/billing_session.go:388` trusts `UserSetting.BillingPreference`; `common/str.go:109` defaults to subscription-first. At lines 473–478 absent/inapplicable subscriptions or permitted overflow can select the wallet. `model/partner_tenant.go:279–281` initializes wallet quota zero but does not force immutable subscription-only selection.

Recommendation: enforce the agreed **subscription-only mode** at the funding boundary, including existing Tenant users with funded wallets. Do not accidentally apply that policy to legacy PartnerServer recharge users unless their migration is explicitly approved.

### F5 — Payment truth and fulfillment progress must be distinguishable

`CompleteSubscriptionOrder` currently grants a subscription and marks the ordinary order successful in one transaction. A failing grant rolls back that local success and relies on callback retry. For the new merchant flow, a verified external payment must remain durably recorded even if account/key/subscription delivery is temporarily failing.

Recommendation: durably record verified payment evidence/status idempotently, then atomically execute entitlement + fulfillment marker. Expose/recover paid-but-unfulfilled orders and retry delivery using a persisted order/event identity. Repeated callbacks/retries must not duplicate renewal. Never treat external money movement as rollbackable by a DB transaction or force a customer to pay again after local delivery failure.

### F6 — Keep identity and credentials in their correct roles

Requiring caller identity for account/key/order/entitlement operations is coherent, with merchant credentials proving authority and user ID identifying the target. It is redundant to treat a client-supplied user ID as authentication when a model key already binds to the user. Plan catalog is naturally merchant-level. The user's explicit all-interface requirement still needs scope confirmation; this is a recommendation, not permission to omit requested IDs.

Do not return a model key in a public checkout URL, provider redirect, or unauthenticated order page. Use existing authenticated key retrieval. Keep account/key first issuance idempotent and fail closed on disabled/revoked resources. Current Tenant provisioning checks membership/token but not every user-status condition, and grant reads user ID/group without validating token usability; a shared fulfillment helper must validate those boundaries consistently rather than auto-replace forbidden resources.

## Recommended minimum product shape, awaiting approval

1. One agreed merchant authentication/account namespace and a stable external user ID.
2. Existing get-or-create user-key capability and tenant plan catalog.
3. A subscription-order API taking user + plan + approved payment method/retry key, with **platform-generated** order number and server-authoritative amount/currency.
4. Return an approved QR/payment URL using existing payment infrastructure; a full new embedded store, wallet, OAuth/SSO, or branded H5 is not necessary for the first API-first closure. A hosted checkout can be added/selected if partners need it.
5. Verified payment → durable paid evidence → exactly-once provision/grant/renewal → visible fulfillment status/recovery.
6. Authenticated order/entitlement lookup; merchant polling can be the recommended first integration, but webhook scope is still a user decision.
7. Subscription-only **model usage** stays separate from how an order is paid. Do not implement purchase as wallet recharge followed by subscription purchase unless that financial product is explicitly chosen.

This is a reasonable incremental evolution of existing code, whereas merely adding auto-provisioning to direct grants would not meet the desired in-app paid purchase experience. Settlement, canonical merchant mode, old recharge/direct-grant compatibility, final identity contract, and checkout UX still require approval. No product files were changed by this review.
