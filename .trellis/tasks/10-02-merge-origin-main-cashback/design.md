# Technical design: merge origin/main into the feature branch

## Boundaries and merge shape

- Merge only the pinned fetched `origin/main=d07c08dcd` into `feat/recharge-cashback` using a non-fast-forward merge commit. Do not rebase, squash, push or merge `upstream/main`. Preserve both parents to make the production-origin sync auditable. Worktree/branch identity and clean state must be rechecked immediately before merge.
- Use read-only `git merge-tree` as a conflict inventory, then start `git merge --no-commit --no-ff origin/main` (or a guarded equivalent). Resolve only identified conflicts, inspect auto-merged code semantically and run checks before completing the merge commit. If a rollback is needed, `git merge --abort` before commit; after commit, stop rather than resetting unrelated history without approval.

## Conflict resolution contracts

- `.trellis/spec/backend/quality-guidelines.md`: our branch deleted two pre-existing executable sections (embedded static/SPA directory behavior and authenticated request outcome pagination) while incoming adds a Dashboard JWT fixture rule to the same file. Restore both executable sections and append the incoming JWT note, preserving the rest of the file/branding. Do not choose only ours or theirs.
- `web/src/i18n/locales/{en,fr,ja,ru,vi,zh-TW,zh}.json`: integrate key/value changes from both sides by the i18n-translate script-only locale write workflow; do not directly edit JSON, drop one side, or blindly pick conflict markers. Use Git's stage 2/3 content as inputs to a task-scoped script, maintain alphabetical keys, then run `bun run i18n:sync` and locale tests. On same-key disagreement, inspect source UI semantics before choosing a value.
- Auto-merged files: audit `middleware/auth.go` and tests for strict internal JWT purpose/expiry and desktop route allowlist; inspect `controller/desktop.go`, `model/option.go`, `router/api-router.go`, React settings types and pages, routes and styles so new notices/acceleration UI coexist with cashback settings. Preserve protected project/author identity references.

## Security and compatibility

- Authentication review uses OWASP Authentication and Session Management Cheat Sheets and ASVS v5.0.0 session/authentication chapters for applicable controls. Merge should not weaken signature, issuer/audience/expiry enforcement or optional-auth invalid-token classification; the expired token fixture must represent a real internal access token before exp mutation.
- User-facing notice configuration and new desktop path follow existing authorization scope; no new production rollout or config migration is initiated by this task. Existing main-DB behavior must remain portable across SQLite, MySQL >=5.7.8, PostgreSQL >=9.6; any database-affecting auto-merge requires the real three-dialect matrix in isolated containers.

## Validation and rollback

- Focus on prior failing middleware JWT tests, desktop v2 notice router/controller tests, keys frontend tests, locale parity, cashback config/review tests, `make test` and relaykit. Record actual results; tests requiring Docker run only in task-owned disposable containers. No host DB fallback.
- If a conflict cannot be resolved without changing product behavior or if tests reveal an unrelated issue, stop with evidence and request direction; do not silently modify policy, deploy or push.
