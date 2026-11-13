# Execution plan: tenant credential authorization audit

## 1. Approval and dependencies

- [x] R3/R5 event scope and immutable default modes confirmed by user; final-structure PRD/design written.
- [ ] Parent final-summary approval received after its presentation.
- [ ] Access-mode child implemented/checked first and actual enum/error/admission contract inspected.
- [ ] Only then load trellis-before-dev, activate this child with task.py start and implement sequentially.

No business implementation, runtime resources or agent launch during planning. If later delegating under applicable authorization, prompt first line is `Active task: <task.py current path>`; one checkout writer only. Parent remains integration owner, not a parallel writer.

## 2. Preflight and resources

- [ ] Review parent PRD/design and this child's full artifacts plus log writer/model/admin endpoint, permission route, logger/scoped recovery and fresh authorization frontend tests.
- [ ] Recheck source baseline and preserve user untracked files. Use new task-owned Docker/pq and dedicated project temporary-artifact ledger already established by mode child; no credentials in ledger/logs and no unauthorized reuse/cleanup.
- [ ] Search all LOG_DB startup/migration and action/reason/filter registries (backend/frontend) before modifying them; inspect ClickHouse existing-table behavior and prefix contracts.
- [ ] Load backend database/payment/subscription-key specs, frontend specs and required i18n/shadcn/React skills before the respective code.

Expected owners: model/partner_oauth_authorization_log.go + focused safe helper/tests; model/main.go if needed for actual log migration call; model/partner_tenant_order.go and subscription-key helpers for post-commit/internal safe receipts; controller/middleware/router event ownership/error paths; controller/partner_oauth_client.go safe query projection; existing authorization-log frontend/API/tests and locales. No outbox, raw body logger, dependency upgrade, duplicate admin page or production action.

## 3. Safe log schema/projection (rollback point A: additive storage)

- [ ] Extend existing row/filter with validated tenant/order/subscription/mode/version/replay metadata, safe zero defaults, no secret material.
- [ ] Preserve current event fields/types; add new canonical decimal-string admin identifiers and bounded tenant_id string filter parsed server-side, no JS Number rounding.
- [ ] Extend action/reason allowlists using constants shared by actual emitters; validate combinations/identifiers/lengths before LOG_DB writes.
- [ ] Background issuance permits Status=0 only for explicit lifecycle action with nil request; UI renders no HTTP status. Keep normal status validation and old nil-context callers compatible.
- [ ] Non-ClickHouse AutoMigrate fresh/upgrade/repeat plus explicit idempotent ClickHouse ADD COLUMN IF NOT EXISTS path, actual log startup wiring, old event preservation.
- [ ] Prove default LOG_DB=DB and separate pq LOG_DB use correct tables and read/write metadata; no business-db leakage when LOG_DB separated.

## 4. Events and ownership (rollback point B: safe writer checked before emission)

- [ ] Add safe internal receipt/outcome type independent of key-bearing model/public DTO.
- [ ] Capture newly issued initial paid credential receipt in the existing serialized transaction; emit only after commit. Rollback, renewal and fulfilled retry do not manufacture new issuance; background recovery covered with nil HTTP context.
- [ ] Claim/query/rotate emit each reached operation result from validated snapshot; include actual version/replay metadata when known. Success queries for active/exhausted/expired/cancelled all count without sampling.
- [ ] Install request-ID/privacy and sanitized recorder before relevant strict auth/policy failures; keep secret-suppressing recovery. Record operation outcome or early auth.denied once, not duplicated.
- [ ] Integrate mode-child current-tenant denials and public capability-safe reasons; unknown bearer/foreign order/invalid target cannot inject tenant/subscription associations.
- [ ] Bounded maps for parse/auth/mode/resource/rotation/server errors, no raw error text or request/response content. Rate/recovery failure paths safe and nonrecursive.
- [ ] Inject LOG_DB failure: retain business success/paid state, emit safe request-ID service alert, no raw DB error, no implicit credential remint/double delivery. Clearly retain best-effort/no-outbox crash-loss boundary.

## 5. Admin interface/UI and docs

- [ ] Extend existing authorized list endpoint with safe projection and tenant_id filter; unknown/duplicate/malformed/overflow filter inputs rejected, existing filters/page order/no-store unchanged.
- [ ] Extend typed API/action registry/labels/table/filter in current log page; IDs are strings and unknown values show '—'; no privileged tenant-list request needed for filtering.
- [ ] Preserve admin READ checks, new-mount refetch, old cached-row suppression and user/session-scoped query keys. Add unauth/stale-session/403/query-error assertions.
- [ ] New labels/empty/status copy translated in seven locales via sanctioned script and bun run i18n:sync, not manual JSON edits. Register temporary helpers/reports first.
- [ ] Document events, log metadata-only handling and best-effort failure boundary; keep old OAuth/server/admin audit descriptions intact.

## 6. Necessary validation commands (after approval/implementation only)

Self-contained pq tests use `TEST_PARTNER_ACCESS_AUDIT_POSTGRES_DSN` in a registered task-owned runner, unique retained main/log schemas and affected actual migrations. Bypass legacy model SQLite setup only for this explicit suite/DSN. No old all-engine/drop-table fixture invocation, host Go tests or no-tests/skip success claims.

```bash
python3 ./.trellis/scripts/task.py validate .trellis/tasks/11-13-partner-subscription-authorization-audit

# In task-owned Docker Go runner only:
docker exec "$TASK_GO_RUNNER" go test -mod=readonly ./model ./controller ./middleware ./router \
  -run '^TestPartnerTenantAuthorizationAudit' -count=1 -v
docker exec "$TASK_GO_RUNNER" go build -mod=readonly ./model ./controller ./middleware ./router

# From web/, reuse installed dependencies:
bun run test src/features/partner-oauth-clients/__tests__/authorization-logs.test.tsx \
  src/features/partner-tenants/__tests__/index.test.tsx
bun run typecheck
bun run lint
bun run i18n:sync

git diff --check
```

Add/adjust narrowly named audit API/locale tests and include their exact paths when they exist. Coverage mapping: L-AC1-3 event lifecycle/negative leak/precision/ownership, L-AC4 actual mode denial event, L-AC5 original event/admin permission/cache UI and seven languages, L-AC6 real pq migration/separate LOG_DB/failure isolation plus ClickHouse SQL contract tests. No need to bring up ClickHouse solely to claim all-engine acceptance: explicitly report no live CH verification unless it was actually authorized and done.

Run each meaningful targeted test set after relevant changes, not repetitive full-suite loops. Re-run only affected failures/fixes. Fake gateway/DOM fixtures do not prove real payment/browser/provider acceptance.

## 7. Review and parent handoff

- [ ] Review every success and reject path, especially recorder-before-policy ordering, post-commit emission, hidden safe metadata, unknown tenant attribution and non-HTTP status display.
- [ ] Record actual runtime/static results and engine gaps in verification.md; state LOG_DB outage/crash can lose best-effort events.
- [ ] Update actual specs only once behavior exists, then final-check changes; explicit business/docs/Trellis file staging and commit, no unrelated files, push/deployment or cleanup.
- [ ] Parent integration reuses real router/controller/log API to test denied request -> correct log row -> allowed admin filter; also one issued key -> repeated successful queries -> one record per access, and existing OAuth event still readable.
- [ ] Retain log schema/data/paid facts on rollback; no drop/reset/remint. Resource cleanup needs user consent; Trellis records stay.
