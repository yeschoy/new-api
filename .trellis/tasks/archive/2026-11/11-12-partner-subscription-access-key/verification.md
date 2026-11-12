# Subscription Key implementation verification

## Status and scope

Implementation source and focused test code are present; task remains **in_progress**. **Bounded recovery now passed the first actual targeted PostgreSQL runtime set**: affected fresh/legacy/repeat migration, local payment/persistence and critical concurrency assertions passed on task-owned PostgreSQL 15.19. Independent trellis-check has now reviewed the complete task diff, all 16 task Go source/test files, current matching export and actual recovery logs; no in-scope business-code P0/P1/P2 was found. Only stale documentation/evidence status and missing mandatory code-spec sections were corrected, so no test rerun was warranted. This is not full application startup, production migration/payment or deployment acceptance. No host Go test (including TestMain), SQLite/MySQL/FoundRows/old full matrix, unrelated frontend test, production call, real gateway call, commit/push/staging/archive or cleanup was performed.

The original implementation child `80fe7bdd-4aa0-4f13-95d5-115503c735dc` timed out at 30 minutes, failing workflow `a5278f4c-e3fb-4c4f-8049-49bf0bf008e8`; the following check never started. Its saved output contains only opening text. The original setup failure below is preserved as history; disk evidence and the bounded recovery section are the current handoff.

Loaded PRD/design/implement, all seven real implement.jsonl entries, before-dev and backend/guides. Explicit dispatch path was used: task.json says in_progress, while task.py current --source returned no pointer. Approved planning baseline is f8aeb6a5a. Preserved initial user edits to docs/partner-tenant-integration.zh-CN.md and initial task artifact changes; never read/staged the untracked private key or modified existing reports/examples/web temporary documents.

## Actual static commands

Cached binary prefix: `/Users/lyh_god/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.26.10.darwin-arm64/bin/`. Go environment for every host build/vet: `GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off` (no module/toolchain installation).

| Command | Actual result | Evidence meaning |
| --- | --- | --- |
| `python3 ./.trellis/scripts/get_context.py --mode packages` | pass: single-repo backend/frontend | discovery only |
| `task.py current --source` and scoped git status/diff | pass; current pointer none, dispatched task.json in_progress | explicit task context used |
| cached `gofmt -w` on 16 touched Go source/test files | pass | syntax/formatting only |
| offline `go build ./model ./controller ./router` | pass on initial implementation | no runtime evidence |
| offline `go build ./model ./controller ./router ./middleware` | pass on final code | no runtime evidence |
| offline `go vet ./model ./controller ./router ./middleware` | final pass, includes test type-checking | no test/TestMain execution |
| first vet after controller-test addition | failed: unused net/http import | removed then reintroduced only when used by mock writer; subsequent vet passed |
| `python3 ./.trellis/scripts/task.py validate .trellis/tasks/11-12-partner-subscription-access-key` | pass: implement 7/check 5 entries | context manifest only |
| `git diff --check` | pass | tracked diff whitespace only; new files separately checked |
| `git diff --cached --name-only` | empty | nothing staged |
| original Chinese guide diff numstat | unchanged 124 insertions / 141 deletions | initial user edit left intact |

## Prior worker history: Docker became available; exact runtime blocker (resolved in recovery below)

Initial parent evidence was daemon unavailable. This worker later ran read-only `docker info --format '{{.ServerVersion}}'` and obtained **28.2.2**, without starting/restarting the daemon. `docker image ls` was empty; inspecting both required images returned No such image. The worker requested and received explicit supervisor authorization to pull **only** `golang:1.26.10-bookworm` and `postgres:15`, then registered all resource/output paths in TEMPORARY_ARTIFACTS.md before creation. No module/toolchain download authorization was granted.

Actual owned resources:

- internal network `ptsubkey-a5278f4c-net`;
- PostgreSQL container `ptsubkey-a5278f4c-pq`, volume `ptsubkey-a5278f4c-pqdata`, empty test DB/user subkey_fixture, task-network-only trust auth; no host port;
- read-only runner `ptsubkey-a5278f4c-go`, task cache volume `ptsubkey-a5278f4c-gocache`, tmpfs /tmp; no privileged/socket/host-network access;
- selected tracked HEAD source plus only 16 task Go source/test edits exported to `.local-tests/partner-subkey-a5278f4c/source/` (not entire worktree/private key/untracked reports/examples); existing module cache mounted read-only;
- Go image ID `sha256:5de7c99eb78ca5e515a4c340235d0955ec5964a5071c492c15503d7c267da473`; PostgreSQL image ID `sha256:1aac5b49cefd627f02816141ca4ad012d6cc19460dfe02a9b5168a105be3fc53`.

Actual command inside the task runner:

```sh
# GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOCACHE=/gocache
# DSN supplied only in task container environment; no password stored in source/log.
go version
go test ./model ./controller ./router ./middleware \
  -run '^TestPartnerTenant.*SubscriptionKey.*$' -count=1 -v
```

**FAILED before tests:** Go1.26.10 linux/arm64 printed setup failures in all four packages. Existing host module cache lacks Linux-specific dependencies:

- github.com/prometheus/procfs v0.15.1, required by client_golang process collector;
- github.com/tklauser/numcpus v0.6.1, required by go-sysconf Linux code.

Go printed `go: downloading ...` but failed at `mkdir /go/pkg/mod/cache/download/...: read-only file system`; no download succeeded, no cache/permissions/proxy/lockfile/dependencies were changed, no alternate mirror/module installation or repeated runtime attempt was made. Runner exited 1. **Zero tests, zero TestMain/fixture migration execution, zero skip/no-tests success.** Final source export was refreshed after small static-only review improvements, without rerunning the blocked runner.

PostgreSQL `pg_isready` passed; a read-only task-container psql query recorded PostgreSQL **15.19**, `fixture_schemas=0`, `user_tables=0`. This proves only owned pq availability/empty state, **not application migration or persistence**. Both owned containers/network/volumes are retained (pq remains running) pending user-approved cleanup; no unrelated resource was altered.

Retained logs:

- `.local-tests/partner-subkey-a5278f4c/pull.log`
- `.local-tests/partner-subkey-a5278f4c/postgres-start.log`
- `.local-tests/partner-subkey-a5278f4c/targeted-pq.log`
- `.local-tests/partner-subkey-a5278f4c/resource-state.log`
- `.local-tests/partner-subkey-a5278f4c/postgres-empty-evidence.log`

No runner-start.log was created (runner start output was captured directly in targeted-pq.log). The prior worker's configured output path is registered in TEMPORARY_ARTIFACTS.md, but the worker timed out and did not deliver a complete final report; do not treat that configured path as completed evidence.

## Focused tests written (unexecuted in prior attempt; all selected tests passed in recovery)

- `model/partner_tenant_subscription_key_test.go`: self-contained unique retained pq schema; shared actual startup migration with legacy account/order upgrade/repeat, indexes/unique SourceOrderId; no users before paid; invalid evidence/late paid; injected key-creation rollback preserving paid; concurrent delivery; independent identity/external query isolation; exact int64/reset/unlimited/exhaustion/history; same User/Token/Subscription/keys on active/lapsed renewal; cancellation rejection; current/versioned/idempotent/concurrent rotation/root drift; disabled/bad mappings/plan scope; old external/H5 representative compatibility; Tenant lock stale pt_/sub_ and Token wait expiry.
- `controller/partner_tenant_subscription_key_test.go`: separate pq schema, no legacy SQLite setup; local fake TLS gateway; new safe checkout/old mode scope, forged/duplicate verified notifications, claim/read-only behavior, sub_-only precision, Coding/readonly auth rejection before sentinel upstream, malformed DTO/query/duplicate headers/Cookie-only, rotation/current renewal replay, scoped panic response secrecy, direct affected wallet_first refusal, prepare failure -> GET -> original POST recovery, delayed body merchant rotation.
- `router/partner_tenant_subscription_key_test.go`: actual registration matrix and independent-versus-merchant authentication/headers.
- `middleware/partner_tenant_subscription_key_test.go`: actual access formatter strips credential query and does not log headers.
- Model TestMain now bypasses its unconditional SQLite setup for this explicit SubscriptionKey selection/DSN. Missing DSN yields blocked skip only; it is never acceptance.

## Manual code review notes

- New plaintext sub_ appears only in authorized responses/headers/in-memory derivation; database stores seed/current hash/version. Coding Key retains existing single tokens.key storage; not a claim of token-at-rest encryption.
- Tenant -> optional Order -> Plan -> Account -> User -> Token -> Subscription -> Key -> Rotation lock order; already-locked plan passed to delivery binding helper, current Bearer hash rechecked after waiting, strict DB clock after resources/rotation lock. No gateway call inside DB transaction.
- Verified payment function unchanged and commits before dispatch; new local effects and fulfilled marker share one transaction. Already-fulfilled path validates but never repairs/mints/extends again. GET claim/query never creates identities/credentials/entitlements.
- Shared order getter remains mode neutral; old merchant idempotency/status and external identity fallback/backfill are explicitly external-only. Dedicated source hash is nonempty and purpose-separated, SourceOrderId unique. Existing H5 routes/contracts unchanged.
- Single linked subscription decides API-key disclosure; no other subscription projection; decimal quota strings, immediate natural expiry/history nonspendable, no wallet fallback redesign.
- Global model Token lookup reserves sub_ before cache/SQL, new secret sessions disable debug SQL interpolation, new routes suppress request-dump recovery, access log queries redacted. No Authorization/X-Subscription-Key/body response logger was added.

## Prior acceptance gaps and their disposition

1. Original pq runtime gap: the prior runner failed before tests; build/vet alone were insufficient. **Resolved for the necessary targeted set by the actual passing recovery below**, not by reinterpreting static evidence. Full application startup/deployment and independent review remain unverified.
2. Original Linux module-cache gap: **resolved only by the user's additional two-module authorization** and existing go.sum verification below. Original failed runner/log retained; no other module/toolchain/image was acquired in recovery.
3. Stable shared CryptoSecret remains operationally required; no automatic root-secret migration/KMS/rotation. Explicit query-key rotation cannot revoke already-known Coding Keys or emitted responses.
4. Independent anonymous purchase cannot identify/deduplicate the same buyer across intentions; each fulfilled new intention adds one real internal user. Admin cross-entitlement edits remain outside the single-purchase isolation guarantee.
5. Old binaries cannot safely fulfill new-mode paid orders; rollback must stop new entry and preserve structures/paid/entitlements for coordinated new-version recovery. No deployment/real payment/production access was attempted.

## Bounded recovery 2f7543f4: actual runtime evidence (2026-11-13 local / 2026-11-12 UTC)

### Authorization, source and dependency integrity

- This is one bounded recovery of the existing implementation, not reimplementation/fanout. Explicit dispatched path remains authoritative despite absent current-task pointer; task.json remains in_progress.
- Inspected exact original resource mounts/network/state before use: pq running, original runner exited 1, internal network only, no host ports/socket/privilege. Nothing unrelated restarted; nothing removed.
- NUL-safe git-tree audit proved the export contains all tracked HEAD files plus exactly seven new task Go source/test files, no extra untracked key/reports/examples. All 16 task Go changes byte-match the current worktree. An initial newline/quoted git-name audit falsely listed tracked Chinese artwork as extras; corrected NUL-safe audit found zero extras/missing files. No source refresh/edit was needed.
- Existing cached Go 1.26.10 darwin/arm64 binary ran **only module acquisition**, not tests. Command: `GOTOOLCHAIN=local /Users/lyh_god/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.26.10.darwin-arm64/bin/go mod download -json github.com/prometheus/procfs@v0.15.1 github.com/tklauser/numcpus@v0.6.1` → exit 0; stderr empty. Current normal proxy/checksum configuration was not changed, no go get/tidy, other dependency/toolchain/image download.
- Both returned Sum and GoModSum exactly match pre-existing go.sum:
  - procfs v0.15.1: `h1:YagwOFzUgYfKKHX6Dr+sHT7km/hxC76UB0learggepc=`; go.mod `h1:fB45yRUv8NstnjriLhBQLuOUt+WW4BsoGhij/e3PBqk=`.
  - numcpus v0.6.1: `h1:ng9scYS7az0Bk4OZLvrNXNSAO2Pxr1XXRAPyjhIx+Fk=`; go.mod `h1:1XfjsgE2zo8GVw7POkMbHENHzVg3GzmoZ9fESEdAacY=`.
- go.mod SHA256 remains `99bf099289267a5f82f7265494e150ca4c08daea4a6de7d9e45a4683ebce9782`; go.sum remains `579086968f4b4eaac6404cfb47a05437461736d2a77aad24ef7df5f0643962be`. User-edited integration guide SHA256 remains `d9056b747f1c3e32d1678702fe08585f20624a8ea7ecae6cc5d8c312d91ebf70` (124 insertions/141 deletions). Shared module cache was supplemented with only the two approved modules and is not a disposable resource.

### Exact first executing runtime command and result

Created **new** owned runner `ptsubkey-a5278f4c-recovery-go` (container ID `c99e56de191e279af8f76452a10410f3c1a1858a6ae9c6b5dce419a3dca86252`) with the same approved golang image ID, original internal network and gocache, read-only `/src` filtered export and `/go/pkg/mod` shared cache, read-only root, tmpfs `/tmp:rw,exec,size=3g`. No original runner/container replaced. DSN targets only the original task pq with local fixture user/database; no production/gateway credentials.

```sh
# Container environment only:
# GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOCACHE=/gocache
# TEST_PARTNER_SUBSCRIPTION_KEY_POSTGRES_DSN targets task-owned pq
# Inside /src:
go version && go test -mod=readonly ./model ./controller ./router ./middleware \
  -run '^TestPartnerTenant.*SubscriptionKey.*$' -count=1 -v
```

Started once via `docker start ptsubkey-a5278f4c-recovery-go`; logs saved with `docker logs`. **Exit 0**, Go1.26.10 linux/arm64; container runtime 16:58:37–16:59:42 UTC. **All 4 selected top-level tests and 7 model subtests actually ran and passed; no SKIP/no-tests/setup-failure.** No test demonstrated a defect, so no source/test fix and no rerun was necessary.

| Actual case | Result / observed assertions |
| --- | --- |
| model `TestPartnerTenantSubscriptionKeyPostgres/actual_affected_migration_fresh_legacy_repeat` | PASS: fresh affected structures, legacy account identity hash/source backfill, drop/re-add legacy order mode/account columns, two repeat migrations, preserved hash/amount, short unique indexes |
| model `.../paid-only_atomic_rollback_recovery_independent_identities_and_external_isolation` | PASS: pending/unpaid delivery, expired checkout and invalid payment evidence add zero users; injected AccessKey-create failure rolls back local user while paid+failed_retryable persist; four concurrent retries create exactly one user; internal SourceOrderId uniqueness and external/fallback/backfill isolation |
| model `.../single_subscription_precise_quota_renewal_rotation_and_terminal_history` | PASS: int64 max and 2^53+1 exact decimals; active renewal preserves usage and existing subscription/account/user/token/API Key; old sub_ rejected, current-key replay after explicit rotation; fulfilled retry succeeds with unchanged row counts (does not separately assert exact end_time delta); root drift fails closed; expiry history/no API Key, lapsed same-row revival clears old use, accepted-but-cancelled renewal rejected; independent intent creates separate user |
| model `.../concurrent_rotation_and_idempotent_current_version` | PASS: concurrent same rotation returns identical v2, stale expected version rejected, changed request conflicts |
| model `.../reset_unlimited_exhaustion_and_absent_binding_never_repaired` | PASS: monthly reset clears use and advances next_reset_time, unlimited/exhausted projections, corrupted issued-order binding rejected without key/user repair even on fulfilled retry |
| model `.../forbidden_credentials_plan_scope_membership_and_legacy_contract` | PASS: internal user membership; sub_ not model token; cross-merchant claim/renew/rotate rejected; disabled account, wrong group, disabled/expired token fail closed; foreign/disabled plan rejected; representative old external order/provision and H5 exchange/order/delivery remain external and mint no sub_ |
| model `.../lock_wait_revalidates_current_merchant_and_strict_token_clock` | PASS: real pg_stat_activity-observed lock waits, stale pt_ after Tenant lock rejected; located old sub_ rejected after committed rotation; Token expiry after waiting revalidated |
| controller `TestPartnerTenantSubscriptionKeyHTTPPostgres` | PASS: local fake TLS gateway only; no buyer ID/secret in checkout DTO; pending/forged/browser-return zero users; signed/duplicate notify one user; old status hides new mode while cashier works; sub_-only exact quota; /v1/models, representative chat and readonly reject sub_ before sentinel; wrong-purpose/Cookie-only/query/duplicate headers/strict JSON rejected; rotation/current renewal replay; panic secrecy; funded internal wallet_first with cancelled entitlement rejected and wallet unchanged; prepare-503 → read-only GET → same POST recovers original order (deadline equality is not separately asserted); delayed body cannot retain rotated pt_ |
| router `TestPartnerTenantSubscriptionKeyRoutes` | PASS: actual new+old route registration, merchant 401/privacy headers, independent sub_ validator rather than pt_/login |
| middleware `TestPartnerTenantSubscriptionKeyAccessLogRedaction` | PASS: actual access formatter drops credential query, does not emit Authorization/X-Subscription-Key |

Package summaries: model `0.613s`, controller `0.273s`, router `0.095s`, middleware `0.039s`. Controller expected invalid-token and subscription-only preconsume logs are rejection-path evidence, not test failures; no raw keys were logged.

### Retained pq evidence and final checks

Read-only `docker exec` psql transaction confirms PostgreSQL **15.19**, schemas `pt_subkey_model_1794502760210064926` and `pt_subkey_http_1794502779644416462` (10 application tables each), and all five required named indexes in each. pg_isready passes. Original empty-db evidence remains historical; the DB is **no longer empty**. Deliberately invalid test rows/failed retry orders remain in fixture schemas; they are not production incidents.

`task.py validate` passes (implement 7/check 5 entries), `git diff --check` passes and staging remains empty. No business Go file changed in this recovery; prior static build/vet remain valid for the identical source. This recovery only updates task/spec status/evidence and temporary-resource inventory. It does not assert independent review or full ordinary-user/model billing regression, full application startup, production migration/real payment/deployment. Those were not executed; no unrelated matrix is requested as a new blocker. Coverage is bounded, not an all-AC attestation: fixtures seed plans rather than exercising root admin UI/create; delivery recovery uses direct concurrent fulfillment retries rather than a timed background scan; HTTP recovery asserts original order identity but not a separate deadline-equality assertion; repeated renewal delivery checks row reuse/usage but not an exact single-month end-time delta. These are honest evidence boundaries, not permission to expand tests in this recovery.

Retained artifacts under `.local-tests/partner-subkey-a5278f4c/`: prior `source/`, `pull.log`, `postgres-start.log`, `targeted-pq.log`, `resource-state.log`, `postgres-empty-evidence.log`; new `recovery-module-download.json`, `recovery-module-download.stderr.log` (empty), `recovery-export-audit.log`, `recovery-targeted-pq.log`, `recovery-resource-state.log`. No runner-start.log and no rerun log were created. Network, pqdata/gocache volumes, original failed runner, new successful runner, running pq and shared image/module caches are all retained; cleanup requires user approval. Exact recovery handoff path is recorded in TEMPORARY_ARTIFACTS.md.

Final recovery integrity checks also passed: read-only cached gofmt `-l` on all 16 task Go paths (no output), exact source/export re-match, protected guide/lockfile SHA256 re-match, 4 package/4 top-level/7 subtest PASS log-count check with no SKIP/no-tests/raw key literal, and empty staged-file list. No additional Go test run occurred.


## Independent trellis-check: full-task quality review (2f7543f4 / review)

### Scope and findings

Loaded all five real check.jsonl entries, PRD/design/implement, this verification record, the Pi trellis-check instructions and trellis-update-spec. Explicit dispatched task path was used despite the absent current-task pointer; task stays in_progress on feat/partner-accounts. No agent fanout, staging/commit/push/archive, dependency acquisition, cleanup or production/real gateway access.

Reviewed the complete task diff and all 16 changed/new Go files, including the seven untracked Go files and ignored new English spec. Excluded the original user edits to docs/partner-tenant-integration.zh-CN.md from modification: its SHA256 still matches d9056b747f1c3e32d1678702fe08585f20624a8ea7ecae6cc5d8c312d91ebf70 (124 additions/141 deletions). Private-key contents and pre-existing reports/examples were not read or changed.

- **No in-scope business-code P0/P1/P2 found.** No Go source/test changes or added tests were needed. Verified durable RecordPartnerTenantPayment before atomic mode-dispatched fulfillment; rollback/retry and SourceOrderId uniqueness; external-only identity/fallback/backfill and merchant/H5 projections while payment getter stays mode neutral; frozen renewal target surviving key rotation; single-subscription locked current hash/root/binding/Token/DB clock and exact int64/terminal quota; rotation expected_version/idempotency; no secret-bearing SQL/recovery/access logs; sub_ rejected before model Token lookup; existing membership-based subscription_only funding preserved.
- **Fixed evidence-status documentation:** new task-owned docs/partner-subscription-key-api.zh-CN.md still said isolated pq execution had not happened. Corrected only that new guide's introductory status to the actual passing bounded runtime + independent review, explicitly excluding full startup/production/real payment/deployment. The original user-edited integration guide is untouched.
- **Fixed code-spec completeness:** after loading trellis-update-spec, organized partner-subscription-key.md into the seven mandatory executable-contract sections, with actual error matrix, Good/Base/Bad cases, Wrong/Correct examples and honest runtime boundaries. No new product rule or architecture was introduced.

### Migration and runtime evidence audit (not a new execution)

Inspected model/main.go:416 calling MigratePartnerTenantSubscriptionKeys; that helper performs real AutoMigrate/normalization/external hash backfill. Model pq fixture uses the same production postgresMigrationDialector (not an in-memory/simulated DDL substitute) and invokes the helper on a real unique PostgreSQL schema for legacy/fresh/repeat migration. Controller fixture also calls the shared helper. This proves the affected startup migration segment only, not migrateDB/full application startup.

NUL-safe tracked HEAD/export audit and byte comparison passed: all 16 task Go files match the previously executed export; the source tree is exactly tracked HEAD plus seven new task Go files, zero missing/unexpected files. Saved recovery-targeted-pq.log exactly matches docker logs of the retained successful runner. Counted 4 package ok / 4 top-level PASS / 7 model subtest PASS, with no SKIP/no-tests/setup-failure/raw long credential literal. This preserves the recovery's actual runtime result without claiming a new run.

Read-only docker inspect reconfirmed original runner exited1, recovery runner exited0 with the approved image/read-only root, pq running, no host port bindings, and ptsubkey-a5278f4c-net internal=true. No resource was started/stopped/recreated. Original failed runner/log and timeout history remain intact.

### Actual review commands and results

| Command / check | Result |
| --- | --- |
| git status --short; scoped git diff/stat; git diff --cached --name-only | PASS: reviewed full task diff, staging empty |
| docker inspect on the three exact task containers; docker network inspect on the exact task network | PASS: retained states/approved image/internal network/no host ports |
| Inline Python NUL-safe git ls-tree/export comparison, 16 source byte comparisons, protected guide/go.mod/go.sum SHA256 assertions | PASS: exact runtime source and protected files unchanged |
| Inline Python comparison of saved recovery output with docker logs; package/top-level/subtest counts and skip/credential scan | PASS: actual prior 4/4/7 PASS evidence independently checked |
| Cached gofmt -l on all 16 task Go files | PASS: no output; no host Go test/TestMain/build/vet |
| python3 ./.trellis/scripts/task.py validate .trellis/tasks/11-12-partner-subscription-access-key | PASS: implement 7 / check 5 |
| git diff --check; separate new/ignored file trailing-whitespace and code-spec/link checks | PASS (final checked after review record updates) |

**No runtime test was repeated:** the user permits only an affected SubscriptionKey group rerun after a concrete defect; business code/tests are unchanged and all required bounded tests already passed on the identical source. Existing offline build/vet evidence remains from implementation, not this reviewer. No host tests, SQLite/MySQL/FoundRows, old full matrix, unrelated frontend or billing/RPM suite was run; static checks are not substituted for runtime.

### Residual evidence boundaries / handoff

No remaining in-scope blocker. Preserve the already-disclosed boundaries: complete startup/production migration, real gateway/payment/deployment, root admin UI/create, timed recovery scan, separate HTTP deadline-equality assertion and exact single-month renewal-delta assertion were not validated. Ordinary-user/RPM/full billing matrix was not repeated. CryptoSecret stability, inability to revoke known Coding Keys/emitted responses, anonymous cross-intent identity limits and coordinated rollback remain operational/product constraints rather than new review defects.

Review changed only the new task guide, new English code-spec, implement.md/verification.md/task.json status/evidence and append-only TEMPORARY_ARTIFACTS.md inventory. Authoritative review report: /Users/lyh_god/.pi/agent/sessions/--Users-lyh_god-GolandProjects-new-api--/subagent-artifacts/outputs/2f7543f4-a5f6-4682-96b9-2981c8396134/review/subscription-key-quality.md. All retained resources/artifacts still require user consent before cleanup; no commit authority was exercised.

## Parent final pre-commit verification

The parent read both successful recovery and independent check reports, the final executable code-spec and integration guide, and sampled the actual new controller/model boundaries. Rechecked all 16 task Go source/test files against the executed source export (identical); go.mod/go.sum and the user's pre-existing Chinese guide matched the recorded SHA256 baseline. Read the retained successful runner log and verified 4 package successes, 4 top-level tests and 7 model subtests without skip/setup failures; exact task container inspection confirms failed original runner exit1, recovery runner exit0 and owned pq running. No runtime rerun, production access or resource mutation was performed.

Parent manifest validation passed (implement7/check5), git diff --check passed, staging remains empty. The new 7-section English contract is linked from the backend index/checkout contract and contains the actual API/schema/secret/timing/error/test boundaries. Phase 3.4 requires a one-shot scoped commit-plan confirmation; implementation and necessary quality gates are complete, but no work commit, task archive, journal commit or cleanup has happened yet. Exclude the original Chinese guide, private key, examples/reports, TEMPORARY_ARTIFACTS.md, web's old inventory and all ignored local test/container/agent artifacts from the proposed work commit. Include only this task's source/tests, independent integration guide, exact code-spec changes and task planning/verification records.

The user subsequently replied “好” to the explicit 25-file, single-work-commit plan. This approves that scoped work commit and the stated task archive/journal wrap-up only; no push, deployment, production access or resource cleanup was requested. All test resources and temporary inventories remain retained pending separate cleanup consent.

## Approved scoped publication

Work commit `58616beef3d48d84d0f1973b019be1eb72d718cf` (`feat(partner): add subscription access keys and paid-only provisioning`) contains exactly the approved 25 paths. Parent asserted the staging and committed path sets, staged whitespace, unchanged executed 16-source export and protected guide/lockfile hashes before committing. Staging was empty afterwards. Only the pre-existing modified Chinese guide and excluded untracked private key/examples/reports/inventories remain; none were included. No tests were rerun, no push/deploy or cleanup occurred. Subsequent commits are limited to this task's archive and developer journal bookkeeping.
