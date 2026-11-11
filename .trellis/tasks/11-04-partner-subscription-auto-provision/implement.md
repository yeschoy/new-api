# Execution plan — approved paid Tenant checkout

## Approval and single implementation target

- [x] User approved merchant-native plan UI + our hosted cashier/order/payment/fulfillment, independent Key and subscription-only funding.
- [x] User confirmed no real merchants/no Tenant direct-grant compatibility; no dual mode; unrelated OAuth/PartnerServer/ordinary-user products and existing test data remain untouched.
- [x] Final summary approved by subsequent explicit message: “确认，可以基于当前的修改，反正没有上线”. No further planning permission is needed within this scope.
- [x] Read current source/specs and replace stale provisional PRD/design; use this existing task, not a second implementation in the research task.
- [x] Validated manifests (11 implementation / 8 check entries) and started task before product edits; status in_progress.

## Smallest behavior change and ownership

The gap is a paid-order closure for existing Tenant plans, not another account model or full storefront. Source owners and backend/frontend contracts are in design.md. Backend owns Go model/controller/router/payment/funding/tests; frontend owns isolated public cashier route/feature/tests/i18n; main owns docs/spec/task records/integration/commits. Implement subagents must work directly without recursively dispatching or committing.

## Ordered work

1. [x] Backend: extract transaction-scoped credential/grant helpers with equivalent independent issuance behavior, stricter disabled-resource checks, and post-commit membership publication.
2. [x] Backend: dedicated Tenant subscription-order persistence/migration, server-generated number, authoritative cents/terms, tenant/request idempotency, pending/rate budgets, create/status APIs and bounded checkout preparation. No model-account creation at unpaid order creation.
3. [x] Backend: Epay adapter with fixed CNY monetary contract, trusted signed notifications, durable paid evidence and exactly-once local delivery; do not copy wallet crediting or ordinary checkout completion.
4. [x] Backend: bounded startup/periodic paid-unfulfilled recovery; remove external Tenant grant registration; preserve unrelated payment/account routes.
5. [x] Backend: order-bound short-lived cashier capability and safe public status; fragment checkout URL; informational browser return only; no credentials/keys in DTOs/logs.
6. [x] Frontend (may run with backend after fixed design contract): public `/partner/checkout` route, dedicated fetch without platform-login effects, QR/HTTPS payment link, separate payment/delivery states, bounded cancellable polling, short-lived per-order sessionStorage access, no secret URL/log leaks, all seven locales through sanctioned script.
7. [x] Backend: membership-based forced subscription-only funding and regression coverage for ordinary users and independent PartnerServer recharge.
8. [x] Main: merge the existing dirty API docs into the implemented contract, update specs and cross-check request/response fields with actual code. Do not overwrite current docs by restoring old versions.
9. [ ] Main + check agent: two independent static reviews and their fixes are done; available build/frontend checks pass (global unrelated lint remains). Docker container startup blocks DB/Go runtime suites; preserve as implementation checkpoint, not full acceptance. See research/verification-2026-11-11.md.

## Required verification

Database tests AND Go test runner must be in task-owned disposable Docker, including SQLite. At preflight `docker info` cannot reach configured daemon. No host DB fallback, no production resources; do not install services or silently claim DB/payment tests passed. Local pure builds/static checks and frontend tests are allowed. Record Docker resource/image/output artifacts in TEMPORARY_ARTIFACTS.md before later user-approved cleanup.

- [x] `gofmt` affected Go files; `git diff --check` and context validation.
- [x] Pure local `go build ./...` (or affected packages if pre-existing embed/build blockers); do not confuse build success with tested DB behavior.
- [ ] In Docker Go runner, real SQLite/MySQL/PostgreSQL model/controller/router/funding suites, migrations fresh/old-schema/repeat, same-key concurrency and current-read/unique constraints (including MySQL clientFoundRows semantics).
- [ ] Mock/TLS gateway callback coverage: signature, pid/amount/method/provider/order/transaction mismatch, wrong status, duplicate and late callbacks, checkout failure/replay, no live traffic.
- [ ] Unpaid no entitlement, independent Key no grant, old direct-grant route unavailable, paid provisioning and renewal atomic, no duplicate renewal, revoked resources fail closed, paid-failure recovery after restart/no browser.
- [ ] Cashier capability wrong order/expired/missing invalid; no external user/Key disclosure; pending/paid-pending/fulfilled/expired/error rendering; protocol-safe payment links; polling cleanup/reload; no auth refresh redirect.
- [x] `cd web && bun run i18n:sync` preflight/final; translations only through scripts/add-missing-keys.mjs; all 15 new cashier keys in seven locales, no unrelated normalization.
- [x] Frontend typecheck/build passed; 9 cashier/subscription files / 85 tests passed, separate overlapping auth-preload selection 83 passed. Scoped lint has 0 errors; global lint has 151 pre-existing errors / 66 warnings. No package installation. Mock-only desktop/mobile/reload browser verification passed.
- [ ] Independent whole-feature check per R1–R11; report skipped engines/tests/sandbox honestly and do not archive as fully verified while required gates remain blocked.

## Sensitive/unrelated files and finish

Never read/stage the untracked private key. Preserve reports/production artifacts and unrelated user changes. Do not deploy, push, create real payments, delete test data or clean temporary resources without explicit authorization. Include relevant Trellis/spec changes in scoped Git commits. Record newly generated unrelated intermediate artifacts in TEMPORARY_ARTIFACTS.md; Trellis logs are retained.

Rollback preserves users/keys/orders/payment truth and in-flight paid orders. External money cannot be undone by DB rollback. The research task is a retained source/approval record, not a second code target.
