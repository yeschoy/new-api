# Partner Tenant Authorization Audit

## 1. Scope / trigger

Read before changing credential audit emitters, dedicated LOG_DB storage, admin authorization-log projection/filter or UI. This extends existing OAuth/server/account events, not OAuth consent, generic route access logging or tenant ADMIN security audit. Implementation is source/frontend checked only; Go/pq runtime remains blocked by unavailable task Docker. Do not deploy or mark full acceptance from these checks.

## 2. Signatures

- `PartnerTenantAuditReceipt`: safe tenant/order/subscription/mode/version/internal-user/replay only; no persistence models, credentials or derivation material.
- `ClaimPartnerTenantSubscriptionKeyWithAudit`, `RotatePartnerTenantSubscriptionKeyWithAudit`, `QueryPartnerTenantSubscriptionWithAudit`: existing public results plus separate caller-owned receipt pointer. Legacy wrappers preserve signatures and public JSON.
- `RecordPartnerTenantAudit` -> `RecordPartnerOAuthAuthorizationLog`: bounded metadata, synchronous best effort, independent LOG_DB. Nil context/status 0 only for `partner_tenant.credential.issue`; old callers with ordinary HTTP statuses remain valid.
- Authorized existing GET `/api/partner-oauth/authorization-logs`: new `tenant_id` canonical positive signed-int64 text filter. New tenant_id/subscription_id/key_version DTOs are decimal strings, empty if unknown; old fields/types/paging remain unchanged.

## 3. Contracts

- Five actions: `partner_tenant.auth.denied`, `.credential.issue`, `.subscription_key.claim`, `.subscription_key.rotate`, `.subscription.read`.
- Issuance receipt captured inside initial paid new-account/key fulfillment, emitted only after successful commit. Rollback, renewal and already-fulfilled replay emit no new issue; background recovery shares this path.
- Claim/read/rotate capture validated locked principal/binding, never an unlocked second bearer lookup. The initial sub_ locator also uses a silent GORM session, including DEBUG, so credential hashes cannot appear in SQL diagnostics. Rotation replay includes actual resulting version; commit failure cannot claim a new version/replay. Reused caller receipts reset before lookup.
- Each independent read result counts, including exhausted/expired/cancelled success. Controller owns reached operations; early parser/auth/mode/rate/recovery owns auth.denied. Exactly one recorder after request-ID/privacy and before strict policy, not response-body interception.
- Bearer verification captures a safe principal BEFORE tenant rate limiting; mutation-time mode rejection carries current safe principal via an errors.Is-compatible bounded error. Path/body resource IDs are never association evidence. Public H5 generic failure carries no guessed principal.
- No tokens, hashes/seeds, headers, bodies, capability URLs or arbitrary errors in LOG_DB/admin/server diagnostics. Silent GORM sessions suppress interpolated log-query/write errors; safe alerts contain request correlation only.
- Business locks never span LOG_DB I/O. Logging outage does not roll back paid/delivery/rotation. No outbox/cross-DB transaction: outage or crash between commit and write can lose an event; fulfilled retry does not fabricate a replacement issuance.

## 4. Validation / error matrix

| Input/outcome | Contract |
| --- | --- |
| Unknown bearer / duplicate header / strict parser | One bounded denial/read failure, no guessed tenant/user/OAuth identity |
| Verified wrong-mode merchant | One denied event, current tenant/mode, fixed route, no requested target association |
| Known owned claim/rotate/query | Safe snapshot; success empty reason, failure bounded action-compatible reason |
| Unknown/repeated tenant filter / overflow / noncanonical decimal | 400; no Number rounding |
| LOG_DB unavailable/error | Safe alert, business result unchanged, possible event loss disclosed |
| Background initial fulfillment | status=0, empty route/IP, generated correlation; UI HTTP displays — |

## 5. Good / base / bad cases

- Good: valid sub_ read twice -> two events; rotation replay -> same result version and replayed=true; one paid delivery -> one issue after commit.
- Base: pre-column OAuth rows migrate with zero/empty metadata and keep legacy fields; default LOG_DB=DB and separate LOG_DB preserve existing naming.
- Bad: log returned key or raw error; infer ownership from a path; issue before commit; perform cross-DB write under tenant lock; pretend a log outage is lossless.

## 6. Required tests / remaining gates

Nine self-contained `^TestPartnerTenantAuthorizationAudit` sources in model/controller/router use explicit `TEST_PARTNER_ACCESS_AUDIT_POSTGRES_DSN`, unique retained pq schemas, no drop-table/all-driver fixture. Model/service TestMain bypass legacy SQLite for this explicit selection. They cover upgrade/repeat/default/separate LOG_DB, exact IDs, allowlists, rollback/retry/receipts/replay/fault redaction, HTTP every-read/denial/admin filter, rate and production-route recovery ordering. Go execution count is currently **0**, not passes/skips. Runtime must still prove these sources compile and assertions hold.

ClickHouse startup executes both CREATE and six `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ... DEFAULT` statements on existing tables. Contract source checks exist; no live ClickHouse verification. Existing admin authz read gate and session-scoped Query cache remain unchanged; focused DOM tests retain permission/cache/error coverage and add tenant precision/status tests. Seven locales use sanctioned script + sync. Source regressions additionally exercise actual recovery-scan issuance, renewal without new issuance, paid delivery during LOG_DB failure, foreign/old-key/corrupt-source receipt isolation, lock-wait/current-mode receipts, slow-body current-mode events and the actual 1200-request tenant budget boundary. All remain uncompiled/unrun; the real SetApiRouter/AdminAuth/PartnerOAuthClientRead gate now has a narrow source regression for anonymous/user/denied-admin/read-admin/root and tenant-filter projection, also uncompiled/unrun. These are review/runtime gates, not claimed complete.

## 7. Wrong vs correct

```go
// Wrong: lock-held logging or re-reading key outside authorization for metadata.
// tx -> LOG_DB.Create(secretBearingModel)

// Correct: safe receipt under lock, business commit, best-effort independent write.
err := businessTransactionCapturingSafeReceipt()
if err == nil { RecordPartnerTenantAudit(nil, PartnerTenantAuditIssue, 0, true, "", receipt) }
```

Rollback keeps additive columns/data and paid facts. Roll app/UI together; no destructive cleanup or production operation is authorized.
