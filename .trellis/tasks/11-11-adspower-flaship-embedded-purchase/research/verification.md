# Research verification — 2026-11-11

Scope: documentation/public static-code investigation only. No product code, production operations, authentication, order creation or payment submissions.

## Passed

- `task.py validate`: implement context 4 entries, check context 3 entries, all files exist.
- Parsed 20 JSON files and 12 nested JSON observation payloads; parsed all context JSONL entries.
- Checked task Markdown relative links and trailing whitespace.
- Reconciled the AdsPower main public bundle, FlashIP main bundle and FlashIP purchase chunk text SHA-256 digests with the report.
- Checked the BuyProxy -> shared PayDialog -> get-info/purchase call chain, provider alias, and payment-result URL/iframe fields in retained snippets.
- Confirmed the FlashIP API prefix rewrite includes `api.flaship.net`, not the page origin.
- Confirmed the standalone poll schedules the next request 3 seconds after completion; did not attribute it to AdsPower.
- Preserved unknowns: backend supplier calls, settlement, actual host order number, host identity mapping, trustworthy payment confirmation details, host synchronization and closed-window payment delivery were not runtime observed.
- Existing user documentation, untracked private-key file and reports were not read for secrets, modified by this task, or selected for its commit. TEMPORARY_ARTIFACTS.md received only the task's browser-artifact inventory addition.
- `git diff --check` passed for the current tracked worktree; no application build/test was run because business code did not change.

## Limits

Public code proves a released branch/call definition, not success or use in the screenshot's exact client build. The research was not validated with a login-state HAR, vendor backend logs, a payment sandbox or a live payment. No merchant webhook, OAuth/SSO bridge or host order polling is claimed as observed.

## Workflow

Task remains `planning`. `design.md` presents API-first as a recommendation and hosted H5 as an alternative; UI ownership and legacy direct-grant compatibility must be approved before product implementation. No `task.py start`, implementation delegation or task archival occurred.
