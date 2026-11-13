# Verification — partner access mode

## Status and evidence boundary

- Baseline: `181c99e1b`, branch `feat/partner-accounts`.
- Independent trellis-check full-diff source review is complete, with two local test/documentation fixes recorded in `quality-review.md`; current status is **source-review-ready with runtime blocked**. Task remains **in_progress**. This is **not** backend/runtime acceptance or deployment readiness.
- Initial worker timed out before its final handoff; this single retained-session recovery inspected the preserved diff and recorded results below. Previously passing checks were not rerun without a code change. No business edits were made during recovery.
- Docker preflight actually failed: `docker version --format '{{.Server.Version}}'` → `Cannot connect to the Docker daemon at unix:///Users/lyh_god/.docker/run/docker.sock. Is the docker daemon running?`
- Supervisor explicitly permitted continuing implementation and frontend/static checks under that environment block. **No Go build/test/vet, PostgreSQL migration or backend runtime test executed.** No host Go tests, SQLite/MySQL substitute, Docker Desktop start, alternative engine/proxy or external CLI workaround was used.

## Independent check follow-up

- Reviewed the full task diff against `181c99e1b`, including all new mode/policy and five-package Go test sources, UI/API/proof/locales, changed historical tests, docs/specs, and preserved approval/checkpoint records. No unresolved definite business-source blocker was identified; this is manual source review, **not Go typechecking**.
- Fixed `TestPartnerTenantPurchaseStrictBodiesQueriesAndCapabilityScope`: its foreign merchant now explicitly uses hosted_h5. The default subscription_key fixture would return 403 before the intended scoped 404 ownership assertion. The 404 assertion is retained rather than weakened.
- Clarified the subscription-key API guide's opening pq-success bullet as historical baseline `58616beef` evidence only, not evidence for the current access-mode change.
- This checker ran `gofmt -l controller/partner_tenant_purchase_session_test.go` (no output), `git diff --check` (passed) and `git diff --cached --name-only` (empty). No unchanged frontend tests/typecheck/lint/i18n checks were repeated. No Go build/test/vet or database command was attempted.
- Existing frontend/static results below remain implementation-session evidence; the test-fixture edit is not runtime-verified. Required future execution must include the affected H5 cross-tenant case under an inspected task-owned Docker fixture in addition to the access-mode pq suite; do not use host Go or substitute engines.
- Audit integration M-AC5 remains pending. No transaction receipt API, LOG_DB event/schema or logging child work was added by this review.

## Actually executed checks

All frontend commands ran from `web/` with existing dependencies, without dependency installation/upgrades.

| Command/check | Actual result | Evidence / scope |
| --- | --- | --- |
| `bun run test src/features/partner-tenants/__tests__/index.test.tsx` | Passed | Last preserved run 16:56:16: **1 file, 7 tests passed**, no skips. Actual manager component; selected mode list, group filtering, default/reset, async H5 persistence, proof/create mode agreement and non-root hiding. |
| `bun run typecheck` | Passed | `tsgo -b`; after adding mode to typed verification context and correcting the test role selector. First attempt failed on those two task-local type issues; corrected before the recorded final pass. |
| `./node_modules/.bin/oxlint -c .oxlintrc.json src/features/partner-tenants src/features/auth/secure-verification/types.ts` | Passed | Scoped touched frontend files; no diagnostics on final invocation. |
| `./node_modules/.bin/oxfmt --check src/features/partner-tenants src/features/auth/secure-verification/types.ts` | Passed | **4 files** matched, all formatted. Prior `oxfmt --write` affected only those files. |
| `bun run lint` | **Failed** | Full-site baseline: **151 errors / 66 warnings** after fixing task-local UI/import issues. Remaining error paths are outside touched source, e.g. confirm-dialog, unrelated pricing/home/auth validation/UI files. No unrelated remediation. Diagnostic retained at `.cache/partner-access-mode/frontend-lint.log`. This is not a lint-wide pass. |
| `node scripts/partner-access-mode/add-missing-keys.mjs` then `bun run i18n:sync` | Passed | Sanctioned script wrote **7 new keys × 7 locales = 49 translations**. Sync run before/after insertion and final check; no direct locale JSON editing. |
| Node read-only seven-locale assertion | Passed | **49/49** newly introduced values present, strings and nonempty across en/zh/zh-TW/fr/ja/ru/vi. This is coverage, not a claim of independent linguistic review. |
| OpenAPI JSON parse with duplicate-key rejection and applicable 403 checks | Passed | `docs/openapi/partner-subscription-key.openapi.json` parses without duplicate fields; **6 paths** include 403 response. Static contract check only. |
| `gofmt -w` on touched Go sources/tests | Passed | Syntax/formatting only; no Go typechecking/build/runtime evidence. |
| `python3 ./.trellis/scripts/task.py validate .trellis/tasks/11-13-partner-access-mode` | Passed | implement.jsonl **7 entries**, check.jsonl **6 entries** resolve. |
| `git diff --check` | Passed | Original run and recovery's final source inspection: no whitespace errors. |
| `git diff --cached --name-only` | Empty | No staged files. No commit/push/merge/archive executed. |

Frontend group evidence uses the real `getGroups()` function with a mocked `/api/group` transport response: configured non-default Chinese `可得财务` is selectable without a matching tenant; a disabled matching tenant still occupies it. No channel-association filtering was introduced; database group uniqueness remains. **The user's deployed screenshot was not reproduced or diagnosed.**

## Backend source coverage — NOT RUN

The source defines **11 top-level `TestPartnerTenantAccessMode*` tests**, not 11 passing tests:

- model (4): `Migration`, `EntryAndPaidRecovery`, `TenantLock`, `H5TenantLock`.
- controller (4): `HTTPMatrix`, `SlowBody`, `AdminProofAndImmutable`, `H5SlowBody` (four order states: new/unprepared/prepared/paid).
- middleware (1): `EarlyPolicy` (both legal modes, empty/unknown, all operation classes).
- router (1): `ActualRoutes` (actual production route registration, invalid body denied before mutation/model tables).
- service (1): `ProofBinding`.

Intended assertions include fresh SQL default/NOT NULL, pre-column and nullable/empty upgrades, repeat migration preserving explicit H5/unknown values/payment/account identity, direct-entry denial before replay/preparation, current tenant locks, valid sub_ authority before independent-query mode rejection, no-buyer-ID paid-only purchase and same-row renewal, H5 session/order/support and accepted late-paid delivery, slow-body current-secret/mode changes, one-use/cross-mode proof, immutable status/rotation and administrator audit fields.

Existing affected tests were adapted instead of disabled: H5 fixtures explicitly select hosted_h5; controller payment cases now enter through real H5 sessions; model historical accepted-order fixtures are labelled test-only mode-neutral payment/fulfillment setup, not an admission API. Existing subscription-key fixtures share an isolated pq fixture constructor without changing their DSN contract. Model **and service** TestMain bypass legacy SQLite bootstrap only for explicit AccessMode selection / task DSN. None of these adapted Go tests were compiled or executed in this run.

Required future commands, **only after exact new resource names are registered and task-owned Docker/pq exists**:

```bash
# TEST_PARTNER_ACCESS_AUDIT_POSTGRES_DSN is supplied only in the new owned runner.
docker exec "$TASK_GO_RUNNER" go test -mod=readonly ./model ./controller ./middleware ./router ./service \
  -run '^TestPartnerTenantAccessMode' -count=1 -v
docker exec "$TASK_GO_RUNNER" go build -mod=readonly ./model ./controller ./middleware ./router ./service
```

Actual Go matching/executed count: **0 executed; skips not measured because no Go invocation occurred**. A missing-DSN skip, no-tests result or another database engine must not be counted as pq evidence. Run necessary affected subscription-key cases only with inspected isolated fixtures and the correct explicit task-owned DSN; do not run the old SQLite/MySQL/full-site matrix.

## Final source inspection

Recovery found no definite mechanical defect requiring another business edit. This is self-review, not independent trellis-check or proof of type/runtime correctness. Confirmed in source:

- startup calls `MigratePartnerTenantIntegrationModes` **before** broad AutoMigrate, so historical null/empty values normalize before NOT NULL reconciliation;
- enum/default/policy stay distinct from account identity_source and order entry_mode;
- locked subscription-key and H5 entries enforce policy; middleware is early rejection only;
- old direct POST and its exported model wrapper reject before order replay or gateway work; retained unexported external-order core is called by guarded H5;
- shared cashier/payment/fulfillment/binding/recovery were not globally mode-gated;
- strict create parsing distinguishes omission/null/empty, status and rotation reject added fields, proof context includes selected mode;
- seven-language script workflow and read-only management mode UI are present; no dependency files changed;
- no audit-child LOG_DB schema/projection/event implementation was added.

## Log-child integration contract

- Constants: `model.PartnerTenantIntegrationSubscriptionKey = "subscription_key"`; `model.PartnerTenantIntegrationHostedH5 = "hosted_h5"`.
- Policy/error: `RequirePartnerTenantIntegrationMode(tenant, operation)` and `ErrPartnerTenantIntegrationMode`. Merchant errors are bounded `403 integration_mode_mismatch`; public H5 remains generic `401 invalid_purchase_access`.
- `middleware.PartnerTenantFromContext(c)` is set **after successful pt_ verification**, before admission. Its tenant ID and supported mode may be projected for that authenticated pre-handler denial. **Never forward the tenant object, SecretHash or raw bearer** to a logger. The middleware snapshot does not replace mutation-time locked authority.
- Locked operation wrappers revalidate current secret/status and mode. The audit child must capture safe transaction receipts from these verified snapshots for body/row-lock races and independent sub_ outcomes; this child does not yet supply issuance/claim/rotation/query audit receipt APIs.
- An order/subscription/session ID from a path/body alone is not verified association. Only a successful scoped owning lookup can supply those references. Missing/malformed/unknown pt_/sub_ must not acquire guessed tenant or OAuth client/user attribution. Public generic H5 failures must not manufacture verified merchant metadata.
- Emit future lifecycle successes only after commit; do not gate or roll back existing payment/fulfillment on log failure. No secrets, payloads, hashes, capability URLs, synthetic OAuth IDs or temporary raw logs.
- M-AC5 (wrong-mode request → LOG_DB → admin filter) remains the second child / parent integration gate, **not satisfied here**.

## Files and ownership

Implementation-owned changed business/test files:

```text
controller/partner_tenant.go
controller/partner_tenant_order.go
controller/partner_tenant_order_test.go
controller/partner_tenant_purchase_session.go
controller/partner_tenant_purchase_session_test.go
controller/partner_tenant_review_test.go
controller/partner_tenant_subscription_key_test.go
controller/partner_tenant_integration_mode_test.go (new)
middleware/partner_tenant.go
middleware/partner_tenant_integration_mode_test.go (new)
model/main.go
model/partner_tenant.go
model/partner_tenant_order.go
model/partner_tenant_order_test.go
model/partner_tenant_purchase_session.go
model/partner_tenant_purchase_session_test.go
model/partner_tenant_subscription_key.go
model/partner_tenant_subscription_key_order.go
model/partner_tenant_subscription_key_test.go
model/partner_tenant_test.go
model/partner_tenant_integration_mode.go (new)
model/partner_tenant_integration_mode_test.go (new)
model/subscription.go
model/task_cas_test.go
router/partner_tenant.go
router/partner_tenant_router_test.go
router/partner_tenant_integration_mode_test.go (new)
service/auth_token_test.go
service/security_verification.go
service/task_billing_test.go
service/partner_tenant_integration_mode_test.go (new)
web/src/features/auth/secure-verification/types.ts
web/src/features/partner-tenants/api.ts
web/src/features/partner-tenants/index.tsx
web/src/features/partner-tenants/__tests__/index.test.tsx
web/src/i18n/locales/{en,zh,zh-TW,fr,ja,ru,vi}.json
```

Docs/spec changed:

```text
docs/openapi/partner-subscription-key.openapi.json
docs/partner-hosted-h5.zh-CN.md
docs/partner-subscription-key-api.zh-CN.md
docs/partner-tenant-api.md
docs/partner-tenant-integration.zh-CN.md
examples/partner-tenant-demo/README.md (old direct-purchase Demo marked historical/local mock)
.trellis/spec/backend/index.md
.trellis/spec/backend/partner-hosted-h5.md
.trellis/spec/backend/partner-subscription-key.md
.trellis/spec/backend/partner-tenant-checkout.md
.trellis/spec/backend/partner-integration-mode.md (new)
```

Task/resource records: original development-boundary `implementation-report.md`, this `verification.md`, authoritative recovery handoff `implementation-report.e3095490.md`, and task ledger `.partner-access-audit-temporary-artifacts.md`. Main-session approval changes in parent/child prd/implement/task records and `recovery-checkpoint.md` were preserved, not authored or reverted during recovery. No parent or second-child records were changed in recovery.

## Resources and residual risks

- **No containers, networks, volumes, database/schema resources or production requests created/reused.** No passwords/DSNs recorded. No Go dependency/cache download, no go.mod/go.sum change.
- Task-owned retained artifacts: `web/scripts/partner-access-mode/add-missing-keys.mjs`, ignored `.cache/partner-access-mode/frontend-lint.log`, ignored locale sync reports/extras and potential compiler/cache outputs. Ledger owns these; no cleanup is authorized or performed.
- Fixture schema prefixes are only planned (`pt_access_mode_model_`, `pt_access_mode_http_`, `pt_access_mode_router_`); no actual schema exists from this run. Before future creation, register exact owned Docker/network/volume names and actual schema names without credentials.
- Protected private key, root reports/, TEMPORARY_ARTIFACTS.md and web's pre-existing temporary ledger were not read, staged or cleaned.
- Necessary residual gates: Go build/type correctness; actual pq fresh/upgrade/repeat and transaction/HTTP tests, including the repaired H5 ownership fixture; cross-child logging integration. Independent full-diff source review is recorded in quality-review.md and does not satisfy these runtime gates. No real browser/WebView, full application startup, production migration/deployment or real payment verified.
- Old binaries do not enforce policy: retain additive data/payment facts on rollback and do not claim mixed-version admission safety.
