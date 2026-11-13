# Execution plan: exclusive merchant integration modes

## 1. Approval gate and order

- [x] Parent product choices confirmed: two modes, subscription_key default/no legacy, complete credential audit, immutable after creation.
- [x] Final-structure PRD and design cover route/proof/data/migration boundaries; context manifests are curated before start.
- [ ] Parent final summary is presented, then a later user message explicitly approves implementation.
- [ ] Only after that approval load trellis-before-dev and step 1.4/2.1, run `task.py start .trellis/tasks/11-13-partner-access-mode` and implement this child first.
- [ ] Complete standalone check/commit, then activate audit child; parent end-to-end M-AC5 finishes after audit integration.

No business code, runtime tests, new resources or implementation sub-agent is authorized by this planning pass. Do not create a parent implementation worker. If delegation is later permitted by applicable instructions, query task.py current and put `Active task: <actual path>` as dispatch prompt line 1; only one writer in the checkout, no extra fanout.

## 2. Baseline and affected files

- [ ] Recheck git status; preserve pre-existing private key, TEMPORARY_ARTIFACTS.md, reports/ and web temporary document, do not stage or clean them.
- [ ] Read backend/frontend indexes, database, checkout/H5/subscription-key, reuse/cross-layer guides; load shadcn/i18n/React skills before UI implementation.
- [ ] Search all tenant create/migration call sites, route wrappers, proof context normalization, old test fixtures and external fast-replay paths.
- [ ] Before new test/build resources, create a dedicated project `.partner-access-audit-temporary-artifacts.md` ledger of only this task's names/paths/ownership; no secret DSNs. Keep caches/logs ignored and leave unrelated pre-existing ledgers untouched.

Expected owners: model/partner_tenant.go + new affected migration/policy file; model/main.go; existing subscription-key/session entry helpers; middleware/partner_tenant.go and router/partner_tenant.go; tenant/order/purchase controllers; service/security_verification.go; partner-tenants frontend/API/tests; seven locales; affected docs/specs. Touch shared fulfillment only if needed to preserve existing mode-neutral behavior, not to impose global admission.

## 3. Schema and creation (rollback point A: additive schema only)

- [ ] Add IntegrationMode constants/validation/operation policy and safe error classification; distinguish omitted input from explicit null/empty/unknown.
- [ ] Add NOT NULL varchar(24) default subscription_key; explicit migration helper registered in actual startup, normalize only historical missing/empty values, preserve explicit H5/repeat and all account/order identity columns.
- [ ] Default existing internal creation wrapper to subscription_key; explicit H5 fixture creator validates supported mode.
- [ ] Admin create uses effective mode and sensitive-write proof binding; update proof context struct/allowlist/field counts and matching frontend proof together. Same proof cannot authorize another mode.
- [ ] Admin list/create include stored mode; create audit includes its field, status/secret rotation preserve immutable mode and reject mode-change extras.
- [ ] Add self-contained pq pre-column/fresh/repeat migration assertions; test values/preserved rows/default/canonical DTO, no production DDL.

## 4. Backend admission (rollback point B: policy validated before UI exposure)

- [ ] Central route checks for tenant catalog/shared, subscription-key-only operations and H5-only session/support operations.
- [ ] Deny legacy direct POST /subscription-orders in both modes before replay/gateway work; preserve internal session-guarded order core.
- [ ] Add current-tenant checks to subscription-key create/replay/get/claim/rotate/query entry transactions, without gating low-level paid binding/fulfillment.
- [ ] Add hosted_h5 checks to merchant create/get and public exchange/read/order authorization, including actual mutation/replay transaction after tenant/session locks.
- [ ] H5 account/key/quota and external order GET remain tenant-scoped support; subscription-key tenants cannot use them as identity bypass.
- [ ] Merchant mismatch returns 403 integration_mode_mismatch; public capability failures retain generic 401 behavior and no foreign resource disclosure.
- [ ] Never mode-gate shared cashier/getter/payment notification/return/accepted-order fulfillment/recovery. Preserve lock/time/secret/paid evidence isolation.
- [ ] Supply bounded errors/trusted context for audit child; no temporary raw logging mechanism.

## 5. UI, docs and specs

- [ ] Creation mode Select defaults to subscription_key, explicit H5 only; cancel/reopen reset, asynchronous queries do not overwrite selection, submit/proof mode match.
- [ ] Typed API request/response and read-only list column reflect mode; no edit-mode control.
- [ ] New UI/error strings via i18n sanctioned add-missing-keys script, all seven locales then bun run i18n:sync. Register any helper scripts/reports in task ledger; user approval before cleanup.
- [ ] Update tenant/subscription-key/H5 guides and corresponding specs to the actual two-mode policy; remove same-tenant free-mixing examples. Describe H5 support endpoints versus forbidden direct purchase.
- [ ] No dependency upgrades, automatic production deployment or general frontend rewrites.

## 6. Targeted verification commands (after approval only)

Create a new task-owned Docker Go runner/network/PostgreSQL and unique retained schemas. Never use production/unknown host DB or reuse an old task's containers implicitly. Use `TEST_PARTNER_ACCESS_AUDIT_POSTGRES_DSN` for new self-contained tests; explicitly bypass model TestMain's old SQLite setup only for this suite/DSN. Runtime results must have actual tests, no no-tests/DSN skips counted as success.

```bash
# Planning-only check (safe now):
python3 ./.trellis/scripts/task.py validate .trellis/tasks/11-13-partner-access-mode

# Implementation runtime, executed only in the registered task-owned Go runner:
docker exec "$TASK_GO_RUNNER" go test -mod=readonly ./model ./controller ./middleware ./router ./service \
  -run '^TestPartnerTenantAccessMode' -count=1 -v
# Statically validate affected packages in the same owned runner:
docker exec "$TASK_GO_RUNNER" go build -mod=readonly ./model ./controller ./middleware ./router ./service

# From web/, existing local dependencies only:
bun run test src/features/partner-tenants/__tests__/index.test.tsx
bun run typecheck
bun run lint
# Once new strings have been inserted by the sanctioned script:
bun run i18n:sync

git diff --check
```

Test names may be refined without widening scope; record actual command and matching count. No host Go tests, SQLite/MySQL matrix or unrelated all-site regression. New runtime coverage: M-AC1-4/6 (mode creation/default/proof immutability, all route/model denials, allowed subkey paid purchase+renewal and H5 session/support, locks/slow body/current secret, preserved cashier/late paid recovery); M-AC7 UI/i18n. M-AC5 is the parent's final audit integration gate.

If changed shared helpers invalidate existing SubscriptionKey tests, run only the affected targeted cases with task-owned DSN bound safely, after checking fixture isolation. Do not run old tests that reset shared tables or initialize SQLite to claim pq success.

## 7. Review, commit and handoff

- [ ] Read final diff against parent/child PRD/design, inspect route matrix and actual migration call, ensure deny tests cannot pass without enforcement.
- [ ] Record verification in child verification.md with exact tests/skips/blockers; static/build is not migration/deployment/payment proof.
- [ ] Update actual specs after implementation, run final targeted checks, stage only explicit task business/docs/Trellis files; force-add only exact ignored Trellis paths, never whole .trellis or git add .
- [ ] Commit child implementation and related Trellis records; no push/deploy/cleanup. Hand audit child the actual mode enum/error/verified metadata contract and remaining M-AC5 integration gate.
- [ ] Retain all additive structures and accepted payments on rollback. Old binaries cannot enforce the new policy; report rollout limitations instead of claiming transparent rollback.
