# Design: safe tenant authorization events and admin projection

## 1. Source and subsystem boundary

Parent `../11-13-partner-access-mode-audit/prd.md` R3/R5 and parent design sections 5-7 own event scope, route semantics and guarantees. The user approved every successful independent subscription query, including history/expired responses, alongside issuance/claim/rotate/auth-denial events. Modes are fixed after creation, default subscription_key, no legacy mode.

Reuse `PartnerOauthAuthorizationLog`, its LOG_DB writer, admin endpoint/page and permission model. Retain old OAuth/server/account records and tenant security admin audit. Do not log an OAuth consent event for a pt_/sub_ operation.

## 2. Storage and safe projection contract

Extend log row with nullable-by-convention zero/empty metadata:

| Storage field | Constraint | Admin JSON |
| --- | --- | --- |
| TenantId | nonnegative int64, >0 only from verified principal/snapshot | tenant_id canonical positive decimal string, empty when unknown |
| OrderNo | empty or canonical PTO + 32 alphanumeric after scoped lookup | order_no string |
| SubscriptionId | nonnegative integer, trusted owned resource only | subscription_id decimal string or empty |
| IntegrationMode | empty or known subscription_key/hosted_h5 | integration_mode string |
| KeyVersion | nonnegative int64, >0 only verified current/result version | key_version decimal string or empty |
| Replayed | true only confirmed rotation replay | replayed boolean |

No secret hash, raw token, capability, request body, error string, buyer ID or derived seed is added. Safe structs are separate from secret-bearing model results or have json:"-" fields; API code never serializes a persistence/key model wholesale.

New authorization-log filters: tenant_id canonical positive signed-int64 decimal text. Preserve old paging/action/success/client/user/time semantics and unknown/duplicate filter rejection. Do not change all existing ID DTOs as an unrelated precision project. A dedicated safe admin projection can embed/copy existing fields without changing their names/types and append the new string fields.

Writer must validate new fields and action/reason relationships, rather than accepting arbitrary strings that can smuggle secrets. Existing event rows have zero/empty new metadata and remain valid. HTTP events use sanitized RequestId/IP and Gin FullPath, not request URL. Background credential.issue has nil request, generated correlation ID, empty IP/route and Status=0; allow zero ONLY for the explicitly whitelisted non-HTTP lifecycle action, and render it as '—' instead of a fictional HTTP result. Other actions retain 100-599 status validation. Existing OAuth nil-context unit logs with real status remain compatible.

## 3. Event semantics and ownership

| Action | Trigger | Metadata / retry semantics |
| --- | --- | --- |
| partner_tenant.auth.denied | pt_ rejection before handler, forbidden mode, applicable bounded parser/rate/recovery rejection | tenant only if verified; generic unknown credential reasons; no unscoped target IDs |
| partner_tenant.credential.issue | initial subscription-key paid fulfillment commits a newly-created credential relationship | trusted tenant/order/subscription/user/version; once per actual new delivery; no success on rollback or renewal/duplicate fulfilled delivery |
| partner_tenant.subscription_key.claim | each request that reaches claim operation, success/failure | current owned order/subscription/version if verified; never log returned sub_ |
| partner_tenant.subscription_key.rotate | each reached rotation attempt, success/failure | owned subscription + actual result version, replayed when known; repeat access is not repeat mutation |
| partner_tenant.subscription.read | independent query success/failure | after valid binding, trusted tenant/subscription/user/version; all successful active/exhausted/expired/cancelled reads count, never log api_key |

Use an allowlisted safe reason mapper (e.g. invalid_request/invalid_partner_secret/invalid_subscription_key/integration_mode_mismatch/account_disabled/credential_unavailable/subscription_key_not_ready/subscription_key_changed/subscription_key_unavailable/resource_not_found/idempotency_conflict/rate_limited/server_error). Exact mapping follows current public errors but must not store raw arbitrary DB/provider errors. Success reason is empty. Preserve old reason validation for old actions.

One request outcome event per semantic operation: do not double-log a claim auth failure as both claim and auth.denied. Early bearer/mode middleware owns failures before handler; once a controller operation owns the request, its finalization records its own bounded result. Independent query parsing failures remain subscription.read failures if identified by that fixed route. Unknown or cross-tenant requested resource IDs do not become trusted associations. Request ID is server-normalized, never a raw attacker-provided log ID.

## 4. Capturing trusted data without changing public protocols

### Issuance

Inside shared fulfillment transaction, create a local safe receipt ONLY when the initial subscription-key branch actually creates User/Token/Account/Subscription/AccessKey. Upon successful transaction return emit credential.issue to LOG_DB. The receipt contains IDs/mode/version, no original persistence models/keys. If transaction rolls back, discard it; if order was fulfilled already or is renewal, do not claim new initial issuance. This covers notification-triggered and background-recovery delivery without requiring a Gin context. Do not use global observers or add model->service dependencies.

### Claim, rotate, independent query

Reuse the already locked/validated tenant/binding snapshot. Return an internal safe outcome alongside the existing public DTO, or provide private helper wrappers preserving current external signatures. The outcome includes actual version/replay information for rotation. Never re-read a bearer outside the authorized transaction just to fill a log; never leak internal actor IDs into public subscription JSON.

### Middleware and error handling

Install request-ID/privacy then the sanitized outcome recorder early enough to observe strict policy, auth and mode failures. The request-scoped recovery must prevent credential-bearing header dumps, and no generic logger should serialize c.Request. Current SubscriptionKeyRequestPolicy runs before RequestID in the router: change ordering with regression tests, not an unexamined extra defer after a handler that never runs. Use context only for safe outcome metadata/ownership and event-recorded marker; no secret-bearing body/response capture.

Public H5 auth failures remain generic and only use tenant references proven by capability validation; mode-child route checks provide safe classification. Signed notification parsing is not transformed into a public auth-event endpoint. Model-level mode rejection must also reach the same event mapper when it supersedes an earlier allowed snapshot.

## 5. Persistence guarantees and log-backend migration

Log writes are synchronous best effort after business transaction/authorization result, as existing code; failures emit only safe request-ID service errors. No outbox/distributed transaction, and no promise of zero event loss during LOG_DB outage or process crash after commit. Query/claim access events are not intentionally sampled; ordinary DB availability must produce each requested event. Failed log writes must not turn an already committed rotation/payment into a false business rollback/retry or cause duplicate fulfillment.

Extend non-ClickHouse AutoMigrate with zero/empty defaults for existing rows. For ClickHouse update create DDL AND idempotent ADD COLUMN IF NOT EXISTS statements, including safe defaults, invoked by both log startup paths. Keep prefixed-table naming consistent with current code. Use short tenant/time index names where supported; do not perform destructive table resets or alter retention policy. No actual ClickHouse runtime acceptance is claimed without a live engine; targeted SQL-contract tests and explicit disclosure are required at minimum.

Independent pq LOG_DB fixture must prove logs are written/read in LOG_DB, not main DB, and that migration twice preserves pre-existing OAuth events. Also test default LOG_DB=DB configuration. Fault injection should demonstrate safe error isolation without raw secrets/DB errors and without changing business results.

## 6. Admin UI and access control

Extend `authorization-log-api.ts` typed event registry/filter and `authorization-logs.tsx` columns/labels. Show tenant ID, order/subscription, mode, key version/replay where useful, keeping compact/mobile row layout. Use text/canonical decimal filtering rather than unsafe Number coercion; no need to request Root-only merchant administration endpoints just to filter logs.

Preserve existing admin READ permission resource and user/session-scoped query keys, fresh authorization on mount, hidden stale rows and denied-session/error behavior. No public log API. Seven locales via sanctioned i18n script then sync; reuse existing page/DataTable/Combobox/Input patterns, no framework/dependency change.

## 7. Validation and rollback

Necessary evidence: pq safe row round-trip/filter/paging, pre-column upgrade/repeat and separate/default LOG_DB, issuance post-commit/rollback/retry/background, successful queries for all terminal/usable states, claim/rotation outcome/replay/version, all relevant auth/parser/rate/mode denials, ownership/unknown input isolation, negative secret-leak assertions across LOG_DB/admin/service logs. HTTP-to-log-admin end-to-end exercises the same route policy as production.

Run only targeted Go tests inside task-owned Docker with isolated pq; existing all-engine OAuth tests may drop tables and bootstrap SQLite, so do not invoke them indiscriminately. Add self-contained pq tests and a narrow TestMain bypass for the explicit task DSN/run selection. Frontend tests cover filters/string IDs/new event names/session permissions and seven-language keys. Static checks do not replace actual migration/persistence.

Rollback retains columns and audit data; old clients can ignore added JSON fields. Old app action allowlists will not recognize new filter choices, so roll back app/UI together and stop new merchant admissions if mode-aware app is unavailable. No data cleanup, production change, real payment or dependency upgrade is authorized by this plan.
