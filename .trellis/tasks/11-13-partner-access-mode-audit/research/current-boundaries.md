# Current boundaries and planning risks

Research date: 2026-11-13. Repository baseline: `1595f89cc` on `feat/partner-accounts`. Source inspection only; no runtime/deployment/payment validation or product-code changes.

## 1. Three existing purchase entries, not merely two UI choices

| Entry | Merchant input / identity | Source evidence |
| --- | --- | --- |
| Subscription Key API | `POST /api/partner/v1/subscription-key-orders`, strict `{plan_id,payment_method}`; optional X-Subscription-Key for renewal. No external buyer ID. | `controller/partner_tenant_subscription_key.go:114`, `model/partner_tenant_subscription_key_order.go:23` |
| External identity API | `PUT /accounts`, `POST /subscription-orders`, account quota/status routes, external_user_id required. | `router/partner_tenant.go:27`, `.trellis/spec/backend/partner-tenant-checkout.md` |
| Hosted H5 | Merchant creates purchase session with external_user_id, browser redeems pl_ -> ps_, then selects/creates an order. | `router/partner_tenant.go:25`, `controller/partner_tenant_purchase_session.go:141`, `.trellis/spec/backend/partner-hosted-h5.md` |

`GET /plans` is shared. The absence of buyer IDs in the new API does not remove its tenant dedicated group or plan ownership: paid fulfillment calls the same grouped User/Token creation helper (`model/partner_tenant_subscription_key_order.go:222`, `model/partner_tenant.go:437`).

Product decisions D1 and default/no-legacy portion of D2 confirmed: newly created tenants choose only Subscription Key API or hosted H5. The user subsequently stated there are no merchants and all should default to Subscription Key; this supersedes the earlier legacy-compatibility proposal. No third/legacy mode is needed. Omitted creation mode and additive field defaults/backfill use subscription_key; unknown/explicitly empty values do not fall back. This is user-reported deployment context, not production DB evidence or authority to remove/rebind data. D2b is now user-confirmed: mode is fixed after creation with no switching UI/API in scope. OAuth browser consent and pst_ wallet/server integration are separate systems and are not implicitly included.

## 2. Current tenant has no integration-mode field

- `model/partner_tenant.go:35`: tenant has name/group/secret hash/status/timestamps, no mode.
- `controller/partner_tenant.go:21`, `:35`: create input only name/group, security proof context binds action/group.
- `web/src/features/partner-tenants/api.ts:31` and `index.tsx:97`: frontend likewise sends only name/group.
- `router/partner_tenant.go:9-30`: one pt_ middleware authorizes all merchant entry routes. `middleware/partner_tenant.go:15` checks secret/status/rate limit, not entry type.
- Public H5 and independent sub_ routes have their own credential boundaries, not the pt_ middleware. UI-only gating or guarding only merchant routes cannot prove enforcement.

Final proposed design binds selected mode into sensitive-write proof context, database state, admin list/DTO, create validation, and transaction-authoritative purchase/session checks. Mode switching is not provided. Existing locked operations still check fresh tenant/credential/session state rather than trusting stale pre-body snapshots. Design awaits final-summary implementation approval.

## 3. Do not reject durable payment or recovery by broad mode guards

- `router/partner_tenant.go:32-53`: sub_ lookup, purchase-session access, cashier, notify and return have separate route groups.
- Subscription Key and external orders share mode-neutral preparation, cashier, payment evidence and background delivery.
- `.trellis/spec/backend/partner-subscription-key.md` and archived task `.trellis/tasks/archive/2026-11/11-12-partner-subscription-access-key/prd.md` explicitly preserve shared internal mode-neutral reads, committed paid evidence, atomic paid-only local delivery and old entry identity isolation.
- A new-entry restriction must not be installed on gateway notification/return or shared order retrieval in a way that strands accepted/paid orders. Although no existing merchants are reported, shared payment fixtures/data must remain intact. The default/backfill policy is subscription_key, not a legacy compatibility mode; an already stored explicit H5 choice must survive repeat migration. Mode immutability is now confirmed; preserve the mode-neutral accepted-payment boundary rather than applying an unrelated blanket gate.
- Current specs describe optional H5 coexisting with the old API. The requested exclusive-mode policy intentionally supersedes that contract only within the final approved scope; update the affected specs and documentation together.

## 4. Authorization log gap

- `model/partner_oauth_authorization_log.go:18`: current dedicated log has OAuth client/binding and actor/target user fields, no tenant/order/subscription references.
- `:60`: action allowlist contains OAuth / partner_server / partner_account events, but no partner_tenant subscription-key events.
- `:97`: safe metadata writer validates fields; uses LOG_DB, sanitized request ID/IP and Gin route template. Logging failure does not change the business authorization result and does not dump database errors.
- `:150`: filters support action/result/client/target user/time only.
- `:182`: non-ClickHouse uses AutoMigrate; ClickHouse currently uses CREATE TABLE IF NOT EXISTS only. Adding fields requires an explicit existing-table migration for that log backend, or an explicitly reviewed compatibility/defer decision; do not silently break existing ClickHouse logs.
- `controller/partner_oauth_client.go:47`: read endpoint rejects unknown/duplicate query filter keys; a tenant filter must be allowlisted and validated server-side as well as added in frontend.
- `web/src/features/partner-oauth-clients/authorization-log-api.ts:7`, `authorization-logs.tsx`: typed action list, labels, columns and filters need synchronized changes; localized new text requires all seven locales.
- `controller/partner_tenant.go:309`: tenant create/secret rotate/status updates already write security ADMIN audit, not this dedicated authorization log. Preserve this audit trail rather than silently replacing it.

Logging scope D3 is user-approved: credential/authentication denials, wrong-mode denials, paid provisioning/credential issuance, key claim and rotation, plus every successful independent subscription read because it may disclose Coding API Key. Successful history/expired responses still count as reads. The user accepted the higher log volume for access traceability compared with recording only key changes and rejected requests. Do not label a service-secret/subscription-key action as OAuth consent. Never invent OAuth client IDs, buyers, or user IDs for a tenant event.

Unknown/invalid credentials may have no trustworthy tenant/user reference. Log only known verified metadata, not a tenant inferred from attacker-supplied IDs or a secret prefix. Never persist raw pt_/sub_/sk_, Authorization/X-Subscription-Key, fragment/capability URLs, payloads, derivation seeds or secret hashes.

## 5. Scope and execution limits

- Parent task owns requirement decisions and final wrong-mode-denial-to-log integration acceptance.
- Child access-mode task owns creation with subscription_key default, persisted exclusive-mode policy, enforcement, additive field default/backfill without a legacy mode, UI and docs/spec alignment.
- Child audit task owns safe log projection/migration/events/query UI. It can design tenant credential events independently; wrong-mode event integration follows the access-mode contract and is retested at parent integration.
- Existing untracked private-key file, TEMPORARY_ARTIFACTS.md, reports/ and web temporary document are pre-existing and out of scope. They must not be read, staged, deleted or included in commits.
- This planning pass generated only Trellis records. No unrelated temporary artifact needs registration or cleanup.
- All original product decisions are confirmed. Parent/child PRD/design/execution documents and real spec/research context manifests are complete for final review; no task.py start, sub-agent dispatch, Go/DB tests, production or payment calls in this planning pass.

## 6. Added user report: existing group cannot be selected

The user supplied a group-settings screenshot and reported that the “可得财务” group cannot be selected, asking whether a group can belong to only one merchant. This is a request to explain/diagnose current selection behavior, not approval to make groups shareable.

- `web/src/features/partner-tenants/index.tsx:152`: candidate groups exclude default/auto and any group equal to ANY tenant.group, without a status condition. A disabled merchant still occupies its group.
- `model/partner_tenant.go:38`: group has a database uniqueIndex, so this is not only frontend filtering.
- `web/src/features/partner-tenants/index.tsx:314`: creation dialog explicitly states “A group can belong to only one partner tenant.”
- `web/src/features/subscriptions/api.ts:236` getGroups calls `/api/group`; `router/api-router.go:429` registers the admin group-list route; `controller/group.go:14` returns every key from `ratio_setting.GetGroupRatioCopy()`. It does not query channels or tenant membership.
- The merchant creation UI then applies the occupied-group filter above. Channel/model association is NOT that filter. A configured nondefault group used by channels can still be a valid unassigned merchant choice; a screenshot of unsaved/stale group settings does not prove it is in the actual API result.
- Screenshot alone does not prove a matching tenant record or deployment status. The user's “already bound” wording has not clarified merchant binding vs channel binding; the later “continue” does not approve sharing groups. This deployed symptom remains unverified and is not a blocker for the original mode/audit scope. No production DB, secrets or authenticated site inspected. Actual diagnosis would need the current sanitized group-list/tenant-list results from the relevant environment; do not guess its cause or claim it fixed.
- Keep the existing dedicated-group uniqueness rule unless the user explicitly requests a product change. If group sharing is requested, return to planning to trace isolation/plan/routing consequences; do not simply remove the UI filter/unique index.
