# Execution and integration plan: partner access modes and authorization audit

## 1. Planning gate

- [x] R1-R7 confirmed: exclusive API/H5 choices, default subscription_key without buyer ID, no legacy mode, full access-event scope, immutable after creation, no secret logs.
- [x] Parent and both children have converged PRD/design/implementation documents and explicit ownership/dependencies.
- [x] Source research covers current routes/transactions/proof/log store/UI plus group-list source and existing unique-group rule.
- [x] Real spec/research entries curated into implement.jsonl/check.jsonl for all three tasks; validate before final review.
- [x] Presented final summary after planning commit 181c99e1b; user subsequently explicitly replied “开始”, approving the reviewed implementation scope and disclosed risk boundary.
- [x] Loaded development guidance and activated access-mode child first (in_progress), NOT this parent as the default business implementation target.

The earlier planning-only restriction has ended for the approved scope. Execute children sequentially; no production, real payment, destructive cleanup or extra fanout is authorized. If later task routing calls for an authorized implementation/check agent, query current task and start every dispatch with `Active task: <actual current path>`. No extra review fanout and no concurrent checkout writers.

## 2. Source task map and execution order

| Order | Task | Scope | Gate |
| --- | --- | --- | --- |
| 1 | ../11-13-partner-access-mode/ | Effective mode/schema/default/proof/immutable admin state and actual entry admission; UI/docs/spec. | M-AC1-4/6/7 standalone checks, explicit mode/denial handoff; M-AC5 awaits audit. |
| 2 | ../11-13-partner-subscription-authorization-audit/ | Safe LOG_DB metadata/events/migrations, one event per requested operation, existing admin UI/filter. | L-AC1-6 and mode-denial wiring. |
| 3 | This parent | Source requirement cross-check and integration evidence, no parallel business rewrite. | AC1-6, including HTTP denial -> log -> admin filter and unchanged paid/key lifecycle. |

The parent/child hierarchy does not enforce ordering automatically. Do not start audit implementation before inspecting the mode contract; do not archive the parent while cross-child acceptance is pending. Execution update: mode implementation has passed independent source review after one fixture/doc correction, but Docker blocks all Go/pq acceptance. Parent permits audit source implementation to follow that reviewed contract without committing/archiving the mode child; preserve the predecessor fingerprint and later run necessary runtime/integration gates before full acceptance.

## 3. Preflight and resource discipline

- [ ] Recheck clean tracked baseline and user untracked files. Never read/stage the private key, existing reports/ or pre-existing temporary documents, and never git add .
- [ ] Load child-specific skills/specs before code; UI changes use shadcn/React/i18n instructions, all seven locales through the sanctioned script/sync workflow.
- [ ] Before generated non-business outputs/resources, create only this task's `.partner-access-audit-temporary-artifacts.md` project ledger, names/ownership/purpose only, no secrets. Record task-owned Docker Go runner/network/PostgreSQL/schema/cache/output names before creating them.
- [ ] Do not reuse prior task containers or unknown host DB implicitly; never production DSNs/DDL/payment tests. Preserve old records and do not drop schemas as routine cleanup.
- [ ] npm/pnpm caches and diagnostics remain ignored. Task Trellis docs/research/verification are durable project records, not cleanup targets.

## 4. Standalone implementation checkpoints

### A. Access-mode child

Follow its implement.md. Preserve the distinction between tenant IntegrationMode and order/account identity source. Normalize omission/default only, reject explicit invalid modes, bind security proof to effective mode, protect all mutation-time entry boundaries, preserve mode-neutral shared payment/recovery. No switch operation. Test legitimate H5 support APIs separately from prohibited old direct POST.

Group selection diagnostic remains bounded: the current group list comes from GroupRatio, then removes default/auto or merchant-occupied names. Keep the one-group/one-merchant database rule. Add a focused create-dialog regression demonstrating a configured nondefault group remains selectable with no matching tenant (channel association is not part of this filter), and that a matching disabled tenant still occupies it under the existing rule. The reported deployed “可得财务” absence has not been reproduced; no sharing/index change is authorized. Do not claim that behavioral regression test proves the screenshot's cause.

### B. Audit child

Follow its implement.md. Safe receipts from actual transaction snapshots, emission only after commit, one request outcome owner, lifecycle issuance not duplicated by fulfilled replay. Log every successful independent query, including terminal results without api_key. Enforce new metadata/reason allowlists, unknown credential attribution safety, independent LOG_DB/default DB and actual existing-table migration. Best effort only: retain business result on log failure, disclose no-outbox/crash gap.

### C. Parent integration

- [ ] Default admin creation -> subscription_key stored; explicit H5 only; unknown/empty/null/legacy rejected, proof can't be switched.
- [ ] Subscription-key tenant cannot create/consume H5 sessions or call external account/support; H5 cannot use subscription-key management or old direct purchase. No forbidden writes/preparation.
- [ ] Actual wrong-mode HTTP request -> 403/generic capability rejection as designed -> safe trusted-metadata row -> authorized tenant_id/action/result/time filter retrieves it.
- [ ] Initial trusted payment -> one new credential relationship -> one issuance event; repeat fulfilled delivery no extra issuance. Claim and two successful independent reads -> distinct access events with unchanged keys/quota protocol.
- [ ] Rotation and safe replay log actual version/replay; expired/cancelled query logs success but omits Coding Key; unknown/foreign request cannot pollute trusted references.
- [ ] LOG_DB failure keeps paid/rotation business state, emits sanitized alert, no plaintext/raw DB error; do not promise zero-loss durability.
- [ ] Existing OAuth/server log row remains readable, normal admin access/pagination/cache isolation remains effective, mode updates impossible, shared cashier/notify/recovery unchanged.
- [ ] Both child verifications and all AC mappings reviewed; static-only or mocked checks do not replace actual pq persistence or real provider evidence.

## 5. Verification commands and reporting

Planning-only checks:

```bash
python3 ./.trellis/scripts/task.py validate .trellis/tasks/11-13-partner-access-mode-audit
python3 ./.trellis/scripts/task.py validate .trellis/tasks/11-13-partner-access-mode
python3 ./.trellis/scripts/task.py validate .trellis/tasks/11-13-partner-subscription-authorization-audit
git diff --check
```

After approval and implementation, children use their exact targeted commands with `TEST_PARTNER_ACCESS_AUDIT_POSTGRES_DSN` in the registered task-owned Go runner. Add parent integration tests with the AuthorizationAudit prefix rather than a broad new suite. If code is unchanged after passing integration, reuse recorded evidence instead of automatically rerunning all tests:

```bash
docker exec "$TASK_GO_RUNNER" go test -mod=readonly ./model ./controller ./middleware ./router ./service \
  -run '^TestPartnerTenant(AccessMode|AuthorizationAudit)' -count=1 -v
# From web/, run only the changed tenant/create and authorization-log test files,
# then typecheck/lint/i18n sync as listed in child plans.
```

Check that expected tests actually execute, not no-tests/DSN skips. Go tests including SQLite must not run on host; do not invoke old destructive/all-driver setup. PostgreSQL fresh/upgrade/repeat and main/separate-log persistence are runtime targets. Preserve ClickHouse compatibility with targeted add-column SQL-contract coverage; list lack of live CH verification explicitly unless actually done, never label a pq pass all-engine acceptance.

Save exact source baseline, commands/results/matching tests/skips and known gaps in child verification.md plus parent final verification.md. Real browser/production/payment/full app startup are not implied by DOM/fake gateway/affected migration checks.

## 6. Finish and rollback

- [ ] Final quality review against full parent/child scope, actual spec update only once code behavior exists, no unrelated abstractions/cleanup.
- [ ] Explicit scoped Git staging/commit for product code/docs and related Trellis files; exact force-add only for ignored task/spec paths. User subsequently authorized “提交推送”: normal push of the current branch is allowed. No private key/temp outputs, dependency cache churn, force-push or deploy.
- [ ] Child completion/archival only after own and cross-child gate ownership is clear; parent final acceptance after both deliverables. Record journal as applicable.
- [ ] Rollback is additive-data preserving: retain mode/log columns, orders, paid evidence and issued relationships. Old nodes do not enforce admission; do not claim safe mixed-version rollback or solve failure with drop/reset/remint.
- [ ] Report completion and verification gaps truthfully. Cleanup of this task's temporary resources requires user's consent; Trellis records are retained.

## 7. Current checkpoint status

All original product decisions settled and final summary approved by the subsequent user message “开始”. Both child source implementations and sequential independent reviews are complete; confirmed source/fixture/document defects were fixed. Parent verification.md consolidates actual frontend/static evidence and explicit Go/pq=0 gaps. Runtime integration acceptance is still blocked by unavailable Docker. Do not check the unexecuted runtime/AC/archive gates just because code is saved in Git.

The mode and audit deltas overlap model/router/locales; the user confirmed the single source checkpoint commit and current-branch push with “提交推送”, with a commit body stating no Go/pq execution. Keep both children in_progress; no force-push/deploy/archive. The group screenshot remains an unreproduced environment diagnostic; group uniqueness is unchanged. Actual permission-gate regression is now present as test source, not as a passing runtime result.
