# Paid Tenant subscription checkout and automatic account provisioning

## Goal and approval

A merchant's website sells that merchant's enabled model plans. Its backend creates an order with our platform; our platform generates the order number, owns checkout/payment verification, and provisions the missing account and subscription after verified payment. Independently get-or-create the user's model key. Tenant model use is subscription-only.

The user approved the final scope in `.trellis/tasks/11-11-adspower-flaship-embedded-purchase/` and explicitly said: “确认，可以基于当前的修改，反正没有上线”. The user also confirmed there are no real merchants and no old-contract compatibility is required. This replaces this task's former planning blockers and activation-only/hosted-storefront hypotheses. It authorizes local implementation and isolated verification, not deployment, live payments, production access, private-key inspection or deletion of existing test resources.

## Confirmed decisions

- Merchant owns plan cards, selection and purchase UI/BFF; we own a narrow order-specific hosted cashier, backend orders, payment confirmation and fulfillment. No complete iframe storefront or cross-site full-account SSO.
- Canonical identity is existing `pt_` Tenant + `(tenant_id, external_user_id)`; use existing field spelling/validation. Merchant derives the ID from its server-side authenticated user. Key/order/account-target operations identify that user; plan catalog remains tenant-scoped and standard model requests keep their existing key-bound identity.
- Remove the old external Tenant grant contract, with no alias, legacy toggle or dual-mode configuration. Internal entitlement helpers may be reused only by paid-order delivery. Do not remove/migrate separate `pst_` PartnerServer recharge, OAuth or ordinary-user products.
- Platform order creation precedes payment. It does not require a merchant-local payable order or a merchant-reported paid flag. Provision missing model accounts at fulfillment, unless independent key retrieval already created an empty account.
- Reuse currently supported payment infrastructure; no new providers, purchase-wallet product, auto-renew, merchant webhook or automated refunds in this MVP.
- Existing modified API docs are the baseline and may now be merged into the new contract. Do not revert unrelated edits or touch the untracked private key or production reports.

## Repository background

- `model/partner_tenant.go:218,345`: existing independent provisioning and direct grant/renewal transactions. Share transaction-scoped helpers; do not nest the public provisioning transaction in fulfillment.
- `router/partner_tenant.go`: enabled-tenant plans, key provisioning and quota; replace external direct-grant route with paid subscription-order routes.
- `controller/partner_server_payment.go:188,307` and `model/partner_account.go:842`: existing QR/pay-URL ordering is wallet recharge in another namespace, not plan fulfillment. Borrow stable transport patterns without mixing accounts or settlement.
- `controller/subscription.go:189`, `model/subscription.go:510,599`: ordinary checkout/source restrictions reject partner plans. Keep ordinary checkout isolation; do not globally remove rejection.
- `service/billing_session.go:396,451-478`: funding currently follows mutable user preferences and can fall back to wallet. Membership-based subscription-only enforcement belongs at funding selection, not merely a new user's initial zero balance.
- Competitor findings are in the 11-11 research task. Public AdsPower BuyProxy/PayDialog supports the chosen merchant-native UI pattern; private identity/payment/fulfillment protocols remain unknown and are not an API specification.

## Requirements and acceptance

| ID | Requirement | Observable acceptance |
| --- | --- | --- |
| R1 | Paid fulfillment provisions missing users | Unpaid order creation grants nothing and need not create a user; verified paid delivery creates exactly one tenant membership/account/key as needed and activates the purchased plan. |
| R2 | Reuse accounts/keys and renew correctly | Existing usable key remains the same. Same-plan renewal extends the active term one calendar month without adding current-period quota. Independent key retrieval does not grant a plan. |
| R3 | Preserve payment truth and atomic local delivery | Verified payment remains durable when delivery fails. Account/key/entitlement and unique order-delivery marker commit together; failures roll back only local delivery. Paid-but-unfulfilled work remains visible and recoverable. |
| R4 | Idempotent platform ordering and fulfillment | Same tenant/request identity and body return the same platform-numbered order; conflicts return 409. Duplicate callbacks/retries cannot charge/grant/renew twice. Request key and order number are distinct. |
| R5 | Tenant isolation and disabled-resource failure | Foreign plans/orders/accounts do not cross tenant boundaries. Disabled tenant/membership/user and revoked/deleted/expired keys are never silently replaced or re-enabled by fulfillment or key retrieval. |
| R6 | Subscription-only model funding | Existing and new Tenant members cannot use a funded wallet, even with wallet-oriented preferences, exhausted/expired/inapplicable plans. Ordinary users and PartnerServer recharge retain their behavior. DB errors fail closed. |
| R7 | Platform-owned order and trusted payment | Server validates plan/amount/currency/method, freezes purchase terms, generates order number and persists before external calls. Verified provider callback checks merchant, order, amount, method and transaction identity; browser returns or merchant assertions never grant entitlement. |
| R8 | Explicit identity and safe cashier scope | Keep external_user_id validation on target operations. Hosted cashier requires a short-lived order-only capability, never a full user login, pt_ secret or model Key. Public status cannot reveal buyer identity or another order. Key/order responses retain no-store. |
| R9 | Stable independent model Key API | Existing PUT provisioning remains independent and idempotent; concurrent first issuance yields one usable key; no order/payment/subscription side effects. Fail closed on forbidden resources. |
| R10 | Replace direct grant and publish concise integration | Old external grant route cannot bypass payment and is no longer documented as usable. Merchant API has catalog, order create/status, quota and independent Key; docs distinguish payment/fulfillment state, retry key, order number and cashier access. |
| R11 | Hosted cashier and closed-window recovery | Merchant opens returned cashier URL; it shows trusted order summary, QR/pay link and separate paid/delivered states. It polls using order-only auth, cleans up polling, survives page reload safely, does not refresh platform login, and cannot confirm payment itself. Background delivery works with no browser. |

## Out of scope

Production deployment/access, real orders/payments or credential use; deleting any existing account/test order/subscription/data; rebuilding merchant websites; full hosted product storefront/iframe SDK, general SSO, new providers, user-wallet top-ups or merchant credit, auto-renew, merchant webhooks, automated refunds, model pricing/quota arithmetic redesign and unrelated account/rate-limit changes.

## Verification constraints

All DB tests and the Go test runner (including SQLite) use task-owned disposable Docker resources. Verify real SQLite/MySQL/PostgreSQL transactions, concurrency, fresh/upgrade/repeat migrations where possible. Docker daemon was unavailable at current preflight; report blockers/skips and do not fall back to a host/production DB or claim unrun tests passed. Pure code builds/static checks and frontend tests may run locally. Mock/sandbox payment boundaries only. Record new temporary artifacts/resources in TEMPORARY_ARTIFACTS.md and retain until cleanup approval; retain Trellis logs.

## Scope status

UI/identity/payment authority/compatibility decisions are converged and the final plan is approved. Technical implementation must follow design.md and implement.md. There is one end-to-end feature, not two independently shipped order systems; backend and frontend lanes may own disjoint files under this task with a fixed API contract. No new task or repeated product-approval question is needed unless a material product-scope change is discovered.
