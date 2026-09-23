# Implementation plan — Subscription redemption codes

## Before implementation

- [x] Confirm this PRD/design/plan with user, then `task.py start`; load backend/frontend spec context and read billing rule. Before frontend edits read `web/AGENTS.md`, `shadcn-ui`, React and i18n skills and matching shared component implementations.
- [x] Confirm no unrelated dirty tracked files, leave `.pi/npm/node_modules/` alone; task files under ignored `.trellis/` will require `git add -f` when committing.

## Code and regression sequence

1. [x] Add `plan_id` to existing redemption model with legacy-zero migration; enforce exclusive valid quota/plan entitlement on insert/update and admin create/update. Prevent re-enabling used codes. Restrict plan lookup on create and plan change to enabled plans; allow metadata/status edits of codes referring to a now-disabled plan. Verify concurrent admin editing does not make code state and redeemed entitlement disagree.
2. [x] Extend `Redeem` transaction to branch on entitlement, check live plan enabled without stale cache, create one subscription via transactional creator and preserve quota branch/cache fences. Make CAS/row locking/rollback cover duplicate code, plan failure, disabled plan, MaxPurchasePerUser and group upgrades; do not create paid order for a gift. Keep numeric response for wallet codes, typed subscription result only for new codes; remove raw redeem key from error logs.
3. [x] Extend existing admin drawer, list/mobile presentation and export to show entitlement type and plan title/ID, fetching existing admin plan list. Reuse existing combobox and UI primitives, preserve old quota defaults and accessible controls. Extend existing wallet redemption hook to handle numeric/typed result and refresh subscription state; translate every new user-facing key per `i18n-translate` skill in all seven locales.
4. [x] Extend focused existing backend test file(s) (prefer `model/redemption_test.go`, only add controller regression cases when necessary) for quota legacy data, subscription success/result, disabled/re-enabled plan, max purchases, invalid/duplicate/concurrent usage, failure rollback, group/cache effects and admin validation. Extend existing frontend admin drawer and wallet tests for both code types, proper error/success UI, export/mobile presentation as appropriate. Avoid duplicate implementation-only tests.
5. [x] Add/run integration verification against real SQLite, MySQL and PostgreSQL for fresh migration and representative `v1.0.0-rc.40` schema upgrade, twice each, and original data/key uniqueness. Record versions and commands. Docker proved unusable; isolated local Unix-socket MySQL 8.0.46 and PostgreSQL 16.15 and SQLite 3.50.4 were used instead. Both release-generated redemption schema upgrade and fresh/transaction matrix passed; see `research/existing-flows.md`. Minimum engine versions and full old application startup are not exercised.

## Gates and handoff

- [x] `gofmt` changed Go files; focused `go test ./model ./controller` (plus specific transaction/migration tests), `go test ./...` if feasible; `go build ./...`. Run `cd web && bun run typecheck`, lint on changed files, impacted `bunx vitest run ...`, `bun run build`, and `bun run i18n:sync`/skill-prescribed checks where applicable. Focused tests and builds passed; full controller suite still fails on tests reproduced on the HEAD baseline (see `research/existing-flows.md`), so it is not reported green.
- [x] Review cross-layer request/response/schema/locale paths and full three-dialect matrix; use Trellis check gate, inspect `git diff --check`, report unverified requirements explicitly. Do not claim complete while a required DB gate remains unverified.
- [x] Record new reusable conventions in `.trellis/spec/` if learned, include task/spec changes in commits, propose scoped commit plan and ask user confirmation according to Trellis workflow. Do not add docs under `docs/` or documentation under `plugins/`.

## Rollback points

- Before schema/UI changes: legacy quota path remains untouched; reverting code before publication is safe. After migration: leave harmless default-zero `plan_id` column in place rather than dropping in production; any issued subscription codes require the new code to redeem. If migration or transaction gate fails, stop and resolve before claiming delivery.
