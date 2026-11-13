# Verification — tenant subscription authorization audit

## Status / limits

**Bounded implementation checkpoint; not full L-AC acceptance.** Core source and focused frontend checks are implemented. Independent source review is recorded below; runtime gates remain pending. Task stays in_progress. Existing access-mode source changes and approval/task records were preserved; no stage/commit/push/merge/archive/cleanup.

Known Docker daemon outage inherited from predecessor. No repeated preflight, Docker Desktop start, engine change, host Go, SQLite replacement, Go dependency upgrade, production request/payment or database resource creation. **Go build/test/vet executions: 0; Go tests executed: 0; skip count not measured.** gofmt is formatting only, not compilation/typechecking/runtime. Required pq and live migration/persistence gates remain open.

## Actually executed

From web/ using installed dependencies:

| Check | Actual result |
| --- | --- |
| `bun run test src/features/partner-oauth-clients/__tests__/authorization-logs.test.tsx` | Final **1 file, 12 tests passed** (17:26:02), no skips. Earlier 9-test baseline and first 12-test run also passed. Existing permission/cache/refetch/error/pagination tests retained; 3 new tests cover canonical int64/string filters/reset, 5-action registry and lifecycle status/string metadata. |
| `bun run typecheck` | Final passed (`tsgo -b`), also passed initial UI/new-test runs. No shared mode UI/type edits, so unchanged 7 mode DOM tests were not rerun. |
| `./node_modules/.bin/oxlint -c .oxlintrc.json src/features/partner-oauth-clients/authorization-log-api.ts src/features/partner-oauth-clients/authorization-logs.tsx src/features/partner-oauth-clients/__tests__/authorization-logs.test.tsx` | Final passed, no diagnostics. Initial task-local nested ternary and string-concat warning, then required braces, fixed locally. No unrelated files changed. |
| `./node_modules/.bin/oxfmt --check` on those 3 files | Passed, all matched files formatted. Scoped --write used before checks. |
| `bun run i18n:sync`; `node scripts/partner-authorization-audit/add-missing-keys.mjs`; `bun run i18n:sync` | Passed. **10 keys × 7 languages = 70 script-applied values**, no direct locale JSON edits. |
| Node seven-locale read-only assertion | Passed **70/70** nonempty string values. Not independent linguistic review. |

Repository checks:

- `gofmt -w` / `gofmt -l` on changed Go files: no final formatting output; not Go build/test.
- `python3 .trellis/scripts/task.py validate .trellis/tasks/11-13-partner-subscription-authorization-audit`: passed, 8 implement / 7 check entries resolve.
- Python source-contract assertions: CH upgrade statement generator is invoked, six defaulted ADD columns present; recorder precedes strict policy/bearer; scoped recovery uses io.Discard. Passed; source-only, not DDL execution.
- `git diff --check`: passed.
- `git diff --cached --name-only`: empty.
- Full-site lint **not rerun**: inherited baseline remains **151 errors / 66 warnings**, not a project-wide pass.

## New backend test sources — NOT RUN / NOT COMPILED

Six top-level `TestPartnerTenantAuthorizationAudit*` functions:

- model `ProjectionMigration`: pre-column upgrade/repeat/history preservation, separate LOG_DB vs main, default LOG_DB=DB fresh/repeat, metadata rejection and canonical max-int64/2^53+1 projection.
- model `PostCommitOutcomes`: local delivery rollback -> no issue; retry/repeated fulfilled -> one issue; claim and actual rotation/replay receipt/version; active/exhausted/expired/cancelled query snapshots; unknown bearer clears reused receipt; injected LOG_DB callback failure redaction without reverting committed rotation.
- model `ClickHouseAndAllowlist`: actual generated six idempotent ALTER statements/defaults and bounded action/reason rejection. No live CH.
- controller `HTTPToAdmin`: one event per reached claim/rotate/read, all four successful read states, early duplicate headers/unknown bearer with no guessed association, verified mode denial -> tenant admin filter, malformed/duplicate/unknown/overflow filters and secret-negative projection assertions. Admin test route is explicitly projection-only, not proof of production authz gate.
- controller `RateOutcome`: bounded rate-denial record after validated principal; this is a fixture rate policy, not the actual 1200-request tenant budget exhaustion.
- router `ActualRouter`: actual SetPartnerTenantRouter denial/strict-parser ordering, safe correlation and route template, query-callback panic -> scoped secret-suppressing recovery -> one denied event.

All fixtures require explicit `TEST_PARTNER_ACCESS_AUDIT_POSTGRES_DSN`, unique retained `pt_authorization_audit_*` schemas, no table/schema drop. Model/service TestMain include explicit AuthorizationAudit selection to avoid legacy SQLite bootstrap. No schemas were created this run. Before execution, register actual task-owned Docker resource names and exact generated schemas without secrets/DSNs. Source fixtures may still contain compile/runtime errors until executed.

Required later, inside inspected task-owned Docker/pq only:

```bash
docker exec "$TASK_GO_RUNNER" go test -mod=readonly ./model ./controller ./middleware ./router \
  -run '^TestPartnerTenantAuthorizationAudit' -count=1 -v
docker exec "$TASK_GO_RUNNER" go build -mod=readonly ./model ./controller ./middleware ./router ./service
docker exec "$TASK_GO_RUNNER" go vet -mod=readonly ./model ./controller ./middleware ./router ./service
```

No missing-DSN/no-tests/skipped result counts as pq success. Do not run old all-driver/drop-table OAuth fixtures.

## Remaining coverage/review gates

1. Independent full-diff check and actual Go build/test/vet/pq fresh/upgrade/repeat/separate LOG_DB behavior are mandatory; none completed here.
2. Additional explicit renewal-no-issue and background recovery-scan issuance tests; current implementation shares the reviewed fulfillment transition, but test sources only exercise direct retry/fulfilled delivery.
3. Actual tenant-rate-budget boundary, lock-time/body-race receipts, foreign ownership, LOG_DB outage during paid delivery, full business success/fault boundaries and admin backend permission integration need further runtime coverage/review. Existing admin authz registration was not modified; DOM tests are not HTTP permission proof.
4. No live ClickHouse, full startup, real browser/mobile/WebView, production migration, provider or real-payment acceptance.
5. Best-effort log outage/crash may lose events after business commit. No outbox, cross-DB transaction or lossless guarantee; paid/credential results are not rolled back by logging failure.
6. The predecessor fingerprint includes a pre-dispatch difference for this child's implement.md (approval handoff). This agent did not edit it or parent/predecessor task records. Necessary audit additions to shared source/locale/index files intentionally differ; all unrelated predecessor changes remain.

## Independent trellis-check checkpoint (source review; runtime still blocked)

This supersedes the earlier **independent review pending** statement only for the bounded source-review gate. It does NOT supersede Go/pq runtime gates. See `quality-review.md` for findings and full boundaries. No parent/predecessor task approval records were edited.

Fixed two confirmed source issues:
- `findPartnerTenantSubscriptionKey` ran its credential-hash locator outside a silent GORM session, before the protected transaction. Query and renewal now suppress interpolated SQL diagnostics there too.
- H5 session creation and hosted-account provisioning returned a bare mode error after locked policy validation, leaving stale middleware mode in audit context. Both now return the existing safe `PartnerTenantAuditAdmissionError` carrying the locked current principal; errors.Is and public errors remain unchanged.

Regression **sources** added/strengthened (NOT compiled/run):
- Final fulfillment-marker failure after safe issuance receipt capture -> rollback/no issue (stronger than failure before key creation).
- Actual bounded background recovery scan -> lifecycle issue; same-subscription renewal -> no issue; independent LOG_DB failure during new paid delivery -> paid/fulfilled/key remain available; fulfilled retry does not fabricate lost issue.
- Foreign merchant claim/rotate, old bearer after rotation, corrupt subscription source and receipt reuse isolation.
- Silent initial locator under an Info logger; current-mode receipt after actual tenant lock wait; validated independent-query mode snapshot.
- Real `PartnerTenantBearer` 1200/1201 budget boundary (not the old artificial 1-request limiter), unique tenant ID to isolate shared in-memory state, Retry-After and trusted principal assertions.
- Slow-body H5 session/account and subscription rotation -> exactly one event with current locked mode and no unverified target association.

There are now **8 audit + 11 access-mode top-level Go test sources**. Execution counts remain **0 Go build / 0 Go tests / 0 Go vet / 0 pq / 0 ClickHouse**; skip counts not measured. Manual import/signature/fixture inspection and gofmt are not compilation. Existing Docker blocker was not retried; no host Go or alternate engine/resource was used.

Actually executed by this checker:
- `gofmt -w` on the five touched Go files; final `gofmt -l model/partner_tenant_authorization_audit_test.go controller/partner_tenant_authorization_audit_test.go model/partner_tenant.go model/partner_tenant_purchase_session.go model/partner_tenant_subscription_key.go`: no output.
- `python3 ./.trellis/scripts/task.py validate .trellis/tasks/11-13-partner-subscription-authorization-audit`: passed, 8 implement / 7 check entries.
- Read-only Python contract assertions: seven audit-spec sections, recorder before policy/auth, io.Discard recovery, silent locator, two locked admission wrappers, 8 audit/11 mode test-source count: passed (static only).
- Fingerprint comparison against predecessor handoff: 39/60 files unchanged; 21 differ, including documented pre-dispatch implement.md difference and intended audit/shared-source/index/locale changes. No predecessor rollback. Checker adds the intentional H5 locked-error changes.
- `git diff --check`: passed; `git diff --cached --name-only`: empty.

Frontend/locale were NOT changed in this review, so earlier 12 audit DOM / 7 mode DOM, typecheck/scoped lint and 70/70 + 49/49 locale checks are cited, not rerun/newly claimed. Full-site 151 errors / 66 warnings lint baseline not rerun.

Open gates: run the explicit audit AND access-mode pq suites plus build/vet in task-owned Docker; actual migration/default/separate LOG_DB, transaction/locking/rate/recovery assertions remain unproven until then. The production admin authentication/READ-permission HTTP regression source is now added in `TestPartnerTenantAuthorizationAuditProductionAdminPermission`, but remains uncompiled/unrun (older admin-logs fixtures remain projection-only); live CH, full startup, real browser/mobile/WebView/payment/deployment remain unverified. No full L-AC/parent acceptance implied. LOG_DB outage/crash may lose best-effort events; no outbox or cross-DB atomicity.


## Final bounded source follow-up — production admin gate and seven-section mode spec

Current authoritative follow-up review: `quality-review.66ef7ddd.md`; earlier quality-review.md remains the historical first checkpoint. Its “production gate test missing” finding is superseded at the **source-only** level, NOT at runtime.

- Added `router/partner_tenant_authorization_audit_test.go:TestPartnerTenantAuthorizationAuditProductionAdminPermission`. Uses actual `SetApiRouter` registration and thus DisableCache -> AdminAuth -> RequirePermission(PartnerOAuthClientRead) -> actual list controller. No test-only permission/projection route, mocked principal or copied auth logic.
- Reuses the existing isolated router pq fixture after extracting it into a local helper. New planned schema prefix `pt_authorization_audit_admin_`; no schema was created. Requires explicit task DSN, retains the schema, no old SQLite/drop-table setup or SavePolicy helper.
- Calls production `authz.Init` on fresh isolated CasbinRule/AuthzRole tables, `authz.SetUserPermissions` for a scoped denied admin, and `service.CreateLoginSession` for actual short-lived dashboard JWT/live-session validation. Serial process globals follow the existing router authz convention; Redis is disabled and no sync goroutine is started. No service/authz test setup or TestMain runs in this router package.
- Cases: anonymous 401; ordinary user 403; admin with read=false 403; normal read admin and root 200. Rejected bodies disclose no fixture order. Both successful actors must read exactly the selected tenant row, preserve new int64 identifiers as decimal strings, and retain lifecycle status=0/no-store.
- Equal-meaning reorganization of `partner-integration-mode.md` into seven sections: Scope, Signatures, Contracts, Validation/Error Matrix, Good/Base/Bad, Tests Required, Wrong vs Correct. All original default/immutable/proof/admission/migration/payment-neutral/UI/group/rollback/attribution/evidence rules retained. AuditAdmissionError/safe-principal/status=0 details link to audit spec, without broadening policy or changing prior evidence to a runtime pass.
- Audit spec mechanically updated to **9** test sources and source-only production gate coverage. **9 audit + 11 mode top-level Go test sources** now exist; 0 compiled or executed, Go build/test/vet/pq/CH all still 0, skip count unmeasured.

Actually run in this follow-up: gofmt -w/-l on the one touched router Go file; task manifest validation (8 implement/7 check); read-only Python seven-section/test-source/actual-registration safety assertions; git diff --check; staged-file check. All final static checks passed. No unchanged frontend/locale checks rerun; no stage/commit/archive/cleanup/production/resource operation.

Remaining: task-owned Docker compilation and explicit audit/mode pq suites, actual migration/persistence/concurrency/production-gate behavior, live CH/full startup/browser/payment/deployment evidence. Best-effort log loss boundary is unchanged. This is a local unaccepted checkpoint, not complete L-AC acceptance.
