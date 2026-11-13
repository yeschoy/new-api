# Design: exclusive partner purchase modes and safe authorization audit

## 1. Scope and ownership

This is a planning contract, not implementation or deployment evidence. Parent PRD R1-R7 is authoritative. The access-mode child owns persisted policy and admission; the audit child owns safe event storage and admin reads. Apply access-mode work first, audit work second, then parent integration. Do not dispatch parallel writers in this checkout.

Existing OAuth consent and pst_ wallet/server integrations are separate systems. They remain unchanged. Merchant-specific plans, grouped internal users, subscription-only funding, quota/reset logic and the existing cashier/payment implementation are reused.

## 2. Integration-mode data contract

Add `PartnerTenant.IntegrationMode` (`integration_mode`, varchar(24), NOT NULL, default `subscription_key`). Values:

- `subscription_key`: buyer-ID-free merchant API, existing sub_ lifecycle.
- `hosted_h5`: existing external-buyer purchase-session flow.

Tenant mode is distinct from `PartnerTenantAccount.IdentitySource` and order `EntryMode`, which remain identity facts (`external` / `subscription_key`). Never rename/rewrite those identity columns to hosted_h5 or infer tenant mode from an order.

Creation accepts an optional `integration_mode` field. Omission becomes subscription_key before validation/security proof; explicit empty, null, unknown or legacy values fail. UI sends the selected explicit value and defaults/resets to subscription_key. Model creation must validate independently and default only true omission, never coerce arbitrary stored values. Existing internal creation callers may keep a default wrapper if needed; no unvalidated variadic string policy.

The single-use `partner_tenant.sensitive_write` create proof binds `{action:"create",group,integration_mode}` after normalization. Update `service/security_verification.go` field count/allowlist and frontend request context together. Rotate-secret proof remains its existing action/tenant shape and cannot carry mode. Root permissions and security admin audit remain intact; create audit changed_fields includes integration_mode. Reject mode fields on status/rotation rather than implying mutation; no mode update endpoint/control is added.

## 3. Route admission matrix

| Surface | subscription_key | hosted_h5 |
| --- | --- | --- |
| GET /api/partner/v1/plans | Allow tenant-scoped catalog | Allow tenant-scoped catalog |
| POST/GET /subscription-key-orders, claim, key rotate | Allow with current pt_ and existing resource validation | 403 integration_mode_mismatch |
| GET /api/partner/subscription (sub_) | Allow after current binding/tenant checks | Reject without emitting secrets; validate bearer before attributing a tenant |
| POST/GET merchant /purchase-sessions | 403 integration_mode_mismatch | Allow with current pt_ |
| Public purchase-session exchange/read/order (pl_/ps_) | Reject capability access, no cross-tenant disclosure | Allow after full capability, current tenant and session checks |
| PUT /accounts; account quota; external order GET | Deny | Allow as H5 backend account/delivery/status support; keep external identity isolation |
| POST /subscription-orders (old direct buyer-ID API) | Deny | Deny: purchase admission must use H5 session |
| Cashier read, signed Epay notify/return, shared prepare/payment/fulfillment/recovery | Mode-neutral internal behavior | Mode-neutral internal behavior |

Old direct purchase is not offered as a third option; H5 must not be able to bypass its session through a pt_ direct POST. Preserve its shared transaction core for H5, not an exposed alternate purchase route. Keep blocked route handlers registered with stable safe 403 rather than silently turning wrong-mode attempts into unobservable behavior.

Use a central model policy predicate/constants plus a specific safe `ErrPartnerTenantIntegrationMode` error. A route-level guard rejects disallowed merchant calls before body/gateway work and leaves an auditable current tenant; authoritative model checks remain inside subscription-key create/replay/claim/rotate/query and H5 create/exchange/public read/order operations. For mutations, check a freshly locked tenant in the actual transaction, not a stale pre-body snapshot. Preserve existing lock order/time/secret validation. A shared low-level binding/fulfillment primitive must not acquire a blanket mode check that strands already accepted payments. Read-only getters used by cashier/recovery remain mode neutral; restrict only merchant/public projections.

Public H5 invalid/foreign capability requests keep generic `401 invalid_purchase_access`, including incompatible tenant mode, to avoid exposing tenancy. Only verified capabilities may contribute trusted tenant/order references to audit. A known authenticated pt_ wrong entry gets `403 integration_mode_mismatch`; unknown/malformed pt_/sub_ keep their current 400/401 semantics. Do not attribute an attacker-supplied order/subscription ID to the authenticated merchant unless the scoped lookup verified ownership.

## 4. Migration and compatibility

Register an explicit affected-schema mode migration in the actual startup path (`model/main.go`) and reuse it in isolated pq fixtures. Additive column/default then normalize only NULL/empty historical values to subscription_key. Preserve explicit hosted_h5 on repeated runs, reject unexpected values at runtime rather than granting access. No legacy mode, table resets, secret rotations, account rebinding, identity-source conversion, or data deletion.

The user reports no merchants. This avoids a legacy feature path but is not permission to inspect production or delete test/old data. Preserve paid evidence and existing accepted-order delivery even in upgrade fixtures. Existing external/H5 tests must create an explicitly hosted_h5 tenant when exercising allowed support paths; old direct-purchase tests are replaced/adjusted only where the intended admission contract changed, not disabled wholesale.

No mixed-version guarantee: an old binary does not enforce modes. When eventually deploying, merchant admission must be served only by mode-aware nodes; prepare/persist compatible schema first. Rollback keeps columns, log data, orders and paid facts; stop new merchant admissions and restore a compatible version for delivery rather than claiming old binaries are safe policy enforcers. Actual deployment is out of scope.

## 5. Audit data flow and guarantees

```text
HTTP authenticated intent or model fulfillment transition
 -> explicit allowlisted event + verified non-secret references
 -> post-transaction emitter (no DB/network under business locks)
 -> existing safe LOG_DB writer
 -> authorized admin log API with tenant filter
 -> existing authorization-log page
```

Extend existing `PartnerOauthAuthorizationLog` / filter / safe writer, not a duplicate UI or raw request log. Keep old OAuth/server fields optional/unchanged. New storage metadata: TenantId, OrderNo, SubscriptionId, IntegrationMode, KeyVersion and Replayed, with zero/empty when unknown. Route is Gin's template, not URL/path/query; nil-context background issuance uses an empty route, generated request ID and no fabricated client IP. Allow Status=0 only for the explicit non-HTTP credential.issue lifecycle action and render '—' rather than a fictional HTTP result; other actions retain status validation. Existing writer generates event IDs and validates bounded action/reason/route/IP/status.

Numeric tenant/subscription/version metadata is positive signed integer storage. For new authorization-log API fields use canonical decimal strings (empty when absent), including tenant_id/subscription_id/key_version, and string filters parsed with bounded canonical decimal validation. This avoids introducing JS int64 rounding into a new audit contract; existing log fields and tenant management DTOs are not redesigned. Frontend displays identifiers as text, never converts a long filter to Number.

Proposed minimum action set (names are implementation constants with matching UI labels):

- `partner_tenant.auth.denied` — malformed/missing/invalid/disabled credentials and admission denials; safe bounded reasons include invalid_partner_secret, invalid_subscription_key, integration_mode_mismatch, account_disabled, credential_unavailable, rate_limited or invalid_request as appropriate. Unknown bearer => no tenant reference.
- `partner_tenant.credential.issue` — successful initial paid subscription-key delivery only; includes trusted tenant/order/subscription/user and version. A rolled-back transaction emits no success; an already-fulfilled retry is not new issuance.
- `partner_tenant.subscription_key.claim` — each successful or failed claim request; ownership-known references only.
- `partner_tenant.subscription_key.rotate` — each successful/failed authorized rotation attempt, with result version and replay flag when known. Replaying is an access result, not a second key mutation.
- `partner_tenant.subscription.read` — each independent subscription request reaching that operation; all successful active/exhausted/expired/cancelled reads count, failed auth/read attempts count with a bounded reason and only trusted metadata. No successful-read sampling.

Choose one operation result event per request where possible: an operation-specific event captures its authorization failure rather than duplicating it as auth.denied. Merchant bearer failures before handler use auth.denied; wrong-mode pre-handler failures also use auth.denied. The early strict-header policy/scoped recovery must allow a sanitized finalization hook or equivalent so it cannot return before recording applicable denials. Rate-limit/recovery paths log safe metadata and never trigger another recursive attempt. Do not turn this into a generic every-route API access log.

Initial issuance originates from the committed fulfillment transition, including background recovery with no browser. Capture a sanitized local receipt under the existing order lock, emit only after successful business commit; no global callback registry, model->service dependency, or secret-bearing persistence object passed to LOG_DB. Public model result DTOs must not gain internal user/tenant metadata accidentally: internal receipt is separate or json:"-". Query/claim/rotate similarly return internal safe audit context from their already-validated snapshot rather than performing secret-bearing second lookups outside the transaction. Model wrappers may preserve signatures where needed.

The existing writer is best effort, not an audit ledger: LOG_DB failure generates a safe request-ID service error, never raw DB errors; business success and durable paid evidence remain unchanged. No outbox/distributed transaction. A crash after commit before emission or LOG_DB outage can lose an event; repeated fulfilled delivery does not manufacture a new issuance just to hide this. This limit is explicit in final review. Normal available-DB operation must persist every approved event; no deliberate sampling/dedup of read/claim attempts.

## 6. Log schema/admin migration

Existing model uses AutoMigrate on non-ClickHouse LOG_DB and explicit MergeTree DDL on ClickHouse. Add new fields with safe zero/empty defaults so old events remain readable. ClickHouse needs `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for existing tables, not just updated CREATE TABLE. Respect established log naming/prefix rules and both default LOG_DB=DB and separate LOG_DB startup paths. Do not create logs in business DB when an independent LOG_DB is configured.

Admin endpoint remains the authorized `/api/partner-oauth/authorization-logs`; add validated tenant_id filter and safe projection fields. Preserve action/result/client/user/time filters, unknown/duplicate-filter rejection, paging, no-store and permission checks. UI extends the existing columns/event names/filter form with merchant ID, order, subscription and mode where useful; no need to fetch a Root-only merchant list for admins who can only read logs. Sensitive events remain invisible to unauthorized/stale sessions and shared query caches remain session scoped. All new UI strings require seven locales via the sanctioned script/sync workflow.

## 7. Verification and acceptance

Access-mode child proves create/default/proof immutability, all denied admission surfaces, allowed subscription-key and H5 representative paths, actual pq fresh/upgrade/repeat and mode-neutral shared payment regression. Audit child proves safe data/action filtering, dedicated LOG_DB writes, post-commit/no-duplicate issuance, each read/claim/rotate attempt, denial/recovery/rate-limit behavior, best-effort failure isolation, API permissions/filtering/UI and existing event compatibility. Parent proves wrong-mode HTTP -> safe stored event -> admin filter, and no loss of paid-only/identity safety.

Go tests run only in new task-owned Docker with isolated PostgreSQL schemas; no host Go tests, SQLite substitute, destructive resets or unrelated full suite. Preserve shared driver support. ClickHouse add-column behavior requires targeted DDL contract tests; live ClickHouse is not required for pq acceptance and must be explicitly reported unverified unless separately exercised safely. No real payment, production migration or full-startup claims from fixtures/static checks.

## 8. Planning state

All product decisions settled, including immutable mode. This final design must be reviewed through the parent summary before task.py start; approval of individual product questions was not implementation approval. Context manifests reference actual specs/research; they do not replace these design and execution documents.
