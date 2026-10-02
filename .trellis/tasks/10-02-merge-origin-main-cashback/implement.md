# Execution plan

1. Verify current branch/worktree and clean state, pin `origin/main=d07c08dcd` and preserve premerge HEAD SHA. Review conflict inventory and instructions: AGENTS.md, web/AGENTS.md, backend/desktop/auth contracts, shadcn-ui, i18n-translate and OWASP guides.
2. Start `git merge --no-commit --no-ff origin/main`. Resolve backend quality spec by preserving the two local-deleted pre-existing sections plus incoming JWT fixture guidance. For each conflicted locale, use stage 2/3 JSON via task-scoped i18n script to merge all keys/translated values; `bun run i18n:sync`, inspect same-key collisions and remove temporary scripts only after verification/with cleanup consent (do not delete Trellis logs).
3. Inspect all other auto-merged files and both branch diffs for lost contracts: dashboard JWT expiry/classification and desktop read-scope, option management, API routes, settings types, notice/keys UI, seven-locale texts, cashback risk form. Do not alter protected identity strings. Run format and `git diff --check`, ensure no conflict markers remain.
4. Run targeted authentication, desktop v2, cashback configuration and related backend tests, full `make test` and `cd relaykit && GOWORK=off go test ./...`; for database-related Go tests use task-specific isolated Docker Go runner and real SQLite/MySQL/PostgreSQL (minimum versions if image available), verify runner-source hashes, actual server versions and no silent skips. Run frontend `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build` and locale consistency; record commands/results in task research.
5. Perform final full-scope spec/quality check, update existing specs only if a new merge-specific contract needs preservation, then finish the **single independent merge commit** with both parents. Commit Trellis planning/research and archive/journal changes separately (path-specific staging; ignored files via exact `git add -f`). Do not push.

## Gates / rollback

- Before merge: working tree clean; no other worktree's branch or resources touched.
- Before commit: tests reviewed, no unresolved conflict, preserve both sets of locale keys/spec sections and check `git merge-base --is-ancestor origin/main HEAD` after commit.
- If resolution is unsound before commit: `git merge --abort` and keep task artifacts; do not reset/clean user work. Request user approval before cleaning Docker or temporary artifacts; Trellis logs stay.

## Execution status (user-requested early commit)

- Merge commit `c0ab13a39` exists on the feature branch; after the user separately requested a push, `origin/feat/recharge-cashback` was fast-forwarded to `99bab7a51`. Nothing was pushed to `main`. Do not rebase/amend it or mark the task complete while the Docker-only backend matrix and full frontend-suite investigation remain open.
- Resume Phase 2 verification when Docker is available: rerun expired JWT middleware tests, `make test`, MySQL/PostgreSQL minimum-version integration, then document results. Frontend full suite/lint currently fail; focused regressions pass. See `research/verification.md`.
