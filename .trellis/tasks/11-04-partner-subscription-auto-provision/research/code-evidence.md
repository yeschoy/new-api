# Repository evidence and planning preflight

> Historical planning evidence: the alternatives and unresolved decisions below were superseded by the user's final 2026-11-11 approval. See current task PRD/design/implement and `verification-2026-11-11.md` for implemented contract and blocked runtime verification. Do not treat historical line anchors or grant APIs as current behavior.

## Existing owners

- `model/partner_tenant.go:218`: `ProvisionPartnerTenantAccount` trims/validates the external ID, locks an enabled tenant inside `DB.Transaction`, reuses the existing token or creates User/Token/PartnerTenantAccount, and publishes cached membership only after commit.
- `model/partner_tenant.go:345`: `GrantPartnerTenantSubscription` also locks the tenant in its own transaction. It checks a tenant-scoped idempotency record before account/plan lookup, rejects missing accounts, validates partner monthly plans, creates or renews a subscription, and records the grant. A replay returns current subscription state without re-extending.
- `controller/partner_tenant.go:241`: activation accepts only a positive `plan_id` within 1 KiB, validates a 16–64-character URL-safe `Idempotency-Key`, and currently returns subscription data without a model key. Account provisioning maps disabled membership and unusable credential errors separately.
- `router/partner_tenant.go`: four **Tenant** endpoints share authentication, rate limiting, request ID, and no-store middleware. The original activation-only change needed no new route, but the later paid-plan-order requirement needs a reviewed public order contract. This is not the repository's entire merchant route inventory; see the PartnerServer correction below.
- `model/partner_tenant.go:74`: immutable membership has a bounded positive/negative cache; plan limiting uses it to avoid subscription queries for ordinary users. Reuse this ownership for merchant funding classification.
- `service/billing_session.go:385` and `common/str.go:109`: effective funding preference defaults to subscription-first and can fall back to the wallet for absent/inapplicable subscriptions. Account provisioning initializes wallet quota to zero but does not itself enforce immutable subscription-only funding.

## Existing tests and minimal reuse

- `router/partner_tenant_router_test.go`: account provisioning validates tenant isolation/fixed groups/stable keys; activation verifies foreign plans, order replay, renewal, and quota filtering. Extend the existing activation tests and avoid duplicating boilerplate across controllers.
- `model/partner_tenant_test.go`: SQLite fixture, Unicode IDs, membership-cache publication, rate limiting, and unlimited subscription consumption.
- `service/text_quota_test.go`: `TestSubscriptionGroupFundingPreferences` already covers SQLite and optional real MySQL/PostgreSQL DSNs with funded-wallet preference cases. Preserve ordinary-user behavior when extending it for merchant accounts.
- The only production caller of `GrantPartnerTenantSubscription` found by `rg` is `controller/partner_tenant.go`; a domain result carrying the API key can be adopted there without introducing a second activation function.

## Working tree and execution constraints

Planning starts on `feat/partner-accounts`, HEAD `3914bf702`. Preserve the existing modified `docs/partner-tenant-api.md` and `docs/partner-tenant-integration.zh-CN.md`; these are this conversation's simplified API documentation. Untracked private key, `TEMPORARY_ARTIFACTS.md`, and `reports/` are not task deliverables and must not be staged.

Read-only Docker preflight returned client `28.2.2` and no server: `Cannot connect to the Docker daemon at unix:///Users/lyh_god/.docker/run/docker.sock. Is the docker daemon running?` No containers, database services, dependency installs, live API writes, or new non-Trellis temporary artifacts were created during planning. Implementation must recheck Docker and report blocked coverage rather than install/use host databases.

## Mandatory caller identity follow-up

The user subsequently required "所有的接口，对方必须传open usder id". Source inspection confirms that `router/partner_tenant.go` currently has four merchant endpoints: account provisioning carries `external_user_id` in JSON, activation/quota carry it in the path, and plan listing carries no user ID. `router/relay-router.go` uses a separate user-key `TokenAuth` boundary for model listing and inference. An exact `rg` search for `open_user_id`, `openUserId`, `OpenUserId`, and `OpenUserID` in controller/model/service/router/middleware found no existing contract. Scope, meaning, naming, transport, and compatibility are user-owned decisions, not facts to infer from the current routes. Remain in planning and resolve the identity contract before changing product code.

## Independent user-key retrieval/issuance follow-up

The user next requested an API to retrieve a user's key and automatically create it if not created. Reinspection of `controller/partner_tenant.go:307` and `model/partner_tenant.go:218` confirms that existing `PUT /api/partner/v1/accounts` already implements first-time account/key creation plus stable-key retrieval on repeat calls, independently of subscriptions. The current request field is `external_user_id`; `open_user_id` would be rejected as unknown. A disabled membership returns `account_disabled`; a missing/disabled previously issued token returns `credential_unavailable` rather than replacement. Record initial issuance as R9, preserve fail-closed recovery boundaries, and recommend reuse instead of duplicating routes or using a side-effecting GET.

## Platform-created merchant orders — correction superseding the earlier assumption

The user rejected merchant-local order creation/collection and explicitly requires merchants to place orders through the platform API. The platform, not the merchant, must generate the platform business order number. Existing caller idempotency keys are retry tokens, not payment orders. This correction is R10 and supersedes the activation-only workflow; settlement/payer/payment output remain unresolved.

Reinspection found:
- `router/partner_tenant.go` has no order creation/status route; `controller/partner_tenant.go:241` and `model/partner_tenant.go:345` are entitlement grants only.
- `controller/subscription_payment_epay.go:23` implements ordinary platform checkout: it reads plan/payment method, derives the authenticated user, generates `SUBUSR...` trade numbers, inserts a pending `SubscriptionOrder`, and creates a provider checkout result. `router/api-router.go:190` protects this route with ordinary `UserAuth`, not tenant-secret authentication.
- `controller/subscription.go:189` rejects partner-owned plans on ordinary checkout, and `normalizePartnerSubscriptionPlan` disables wallet purchase/overflow. Do not remove this guard globally to pretend merchant checkout exists.
- `model/subscription.go:226` defines the existing order record with user/plan/money/trade-number/provider/status fields but no explicit tenant/external-user association or currency snapshot contract. Reuse and migration requirements need design.
- `model/subscription.go:510` restricts partner-plan creation to source `SubscriptionSourcePartner`; `CompleteSubscriptionOrder` at line 599 calls creation with source `order`. Consequently exposing ordinary payment creation alone would still not fulfill a partner plan correctly.

No final payment channel, checkout-link contract, merchant balance/credit ledger, outward merchant webhook, or direct-grant compatibility change has been approved. Ask the highest-value settlement question first; retain earlier identity questions. The revised design/implementation documents are deliberately provisional, and no product code or live payment traffic was changed.

## Broader source review correction and architecture assessment

See `research/architecture-assessment.md`. `router/main.go` also registers `router/partner-server-router.go`, whose `pst_`/PartnerAccount lane already has independent credential issue/retrieval, POST `/accounts/{external_user_id}/payment/orders`, and GET `/payment/orders/{order_id}`. `controller/partner_server_payment.go:188` accepts amount/payment method, returns QR/pay URL, and uses `model/partner_account.go:842` to create a **wallet TopUp**, not a subscription order. Thus "the project has no merchant order interface" was inaccurate; only the discussed Tenant plan-purchase closure is absent. These two merchant modes have different account mappings, tokens, and external-ID validation. Do not combine their records or silently change legacy recharge semantics.

The static review also recommends separating durable verified payment evidence from retryable exactly-once entitlement fulfillment, rather than erasing payment truth when local delivery rolls back. FlashIP architecture/session/checkout ideas in that report are explicitly hypotheses requested by the user, not observed vendor protocol or approved project requirements.
