# Optional standalone H5 verification — 2026-11-12

## Status

Implementation, independent review/fixes/recheck and available parent static/frontend/local-browser verification are complete. **Full acceptance is blocked by unavailable Docker/Go/database runtime tests**, notably isolated PostgreSQL additive migration and concurrency. Task remains `in_progress`, not archived. The user explicitly approved the exact scoped checkpoint plan with “提交”; perform that local work commit only. No deployment, push, real charge/account, production credential access or data cleanup occurred.

## Implemented

- Optional standalone H5 `/partner/purchase` alongside unchanged self-built merchant API/UI; no tenant-mode switch, iframe, SSO, wallet, arbitrary return URL or webhook.
- Merchant-created/tracked purchase sessions with trusted tenant/user binding, 5-minute launch / 30-minute fixed purchase expiry, purpose-separated pl_/ps_, atomic nonce-bound exchange, session/secret revocation and additive migration.
- Transaction-guarded H5 creation/replay: current tenant -> session locks, strict current clock/capability/nonce/secret check, then original order core. No payment network inside DB transaction; original API/controller fast replay and paid fulfillment remain independent.
- One-session-one-order via purpose-separated idempotency, no second pointer write; safe persisted-order failure/reload/explicit-resume path; exact public int64 quota strings with shared expected-output fixture.
- Narrow public bootstrap/early fragment removal/HTML privacy/static-host policies and seven locales; original cashier handles QR/external payment and separate delivery state.
- New durable `docs/partner-hosted-h5.zh-CN.md`, additive English API documentation; existing dirty Chinese guide excluded from commit scope.

## Independent review

Workflow `146ccba0-a3aa-460f-83a1-7bf639c6dc68` implemented backend then frontend then read-only whole-feature review. Found two P1 and one P2, parent confirmed actual source before accepting. Workflow `959024e1-4c69-4a88-85b7-458d24b97c23` fixed only F1–F3 and independently rechecked:

| Finding | Fix / evidence | Current disposition |
| --- | --- | --- |
| F1 pending order stranded after gateway 503 + refresh | Explicit original-order POST before navigation, authoritative server plan/method, no mutating GET or new intent. Frontend failure/status/remount/conflicting-draft regressions execute; backend persisted-row regression written. | RESOLVED in source/frontend; DB test unrun |
| F2 pre-body authorization survives expiry/secret rotation | Guarded entry validates under actual tenant/session locks and fresh clock before both insertion and replay; original merchant API preserved. Controlled body and DB lock-wait regressions written. | RESOLVED by source review; runtime race tests unrun |
| F3 int64 quota poisons safe-int frontend | NEW public total_amount uses exact canonical string through int64 max, client validates/renders without Number; shared fixture boundary tests pass in frontend; backend actual-output assertion written. | RESOLVED in source/frontend; backend assertion unrun |

Recheck verdict: `ready-for-parent-validation`, no new concrete P0/P1/P2 verified. Reports live in managed session outputs, paths inventoried in root TEMPORARY_ARTIFACTS.md. This is not evidence of executed Go tests.

## Parent commands actually executed after final fixes

| Check | Result |
| --- | --- |
| `bun run test -- src/features/partner-purchase src/features/partner-checkout src/features/subscriptions --no-cache --configLoader runner` | PASS, **15 files / 267 tests**, jsdom scrollTo notices only |
| `bun run test:deployment` | PASS, 4 generated-config tests across repo/web/electron roots and unsafe targets |
| `bun run typecheck` | PASS |
| `bun run i18n:sync` | PASS; new UI keys covered in all seven locales; no intended old-key changes |
| `bun run build:check` | PASS, final Rsbuild build 7.15 seconds; existing broad bundle-size output retained |
| Scoped oxlint on purchase/checkout/main/root/new route and deployment scripts | PASS, no diagnostics |
| Offline cached Go 1.26.10 `go build ./...` | PASS |
| Offline cached Go 1.26.10 `go vet ./model ./controller ./router` | PASS including test source static analysis, NOT test execution |
| `git diff --check`; task context validation | PASS; context 9 implement / 7 check entries at recheck |
| `docker info` | Cannot connect to local daemon; no startup/restart/resource creation or host go test substitute |

Actual cached toolchain path: `/Users/lyh_god/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.26.10.darwin-arm64/bin/go` with `GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off`. No package installation/download or lockfile change. Full repository tests/lint not run; scoped results above are not a global pass.

## Real Chrome browser checks — LOCAL MOCK ONLY

Task-owned loopback fixture served actual final `web/dist/` on `127.0.0.1:3322`, no outbound network or real API/DB/gateway. Fake session `PPS` + 32 s, fake order `PTO` + 32 o, placeholder capabilities and QR payload `LOCAL-MOCK-NOT-A-PAYMENT`. These do not attest backend security/payment correctness; fixture deliberately does not implement production auth.

- Real selector desktop: width/documentWidth **1280/1280**, fragment removed, no external script sources, no-referrer, exact displayed `9223372036854775807`.
- Real selector mobile: **390/390**, long Chinese title wraps, readable CNY/quota, no horizontal overflow. French selector after reload also **390/390**, translated controls and exact quota. Image physically inspected.
- Selected actual radios and submitted: first mock POST persisted the one fake order then returned 503. Reload used ps_ storage and received persisted pending order; no new form/automatic POST. Explicit resume sent exactly `{plan_id:42,payment_method:"alipay"}` again, then same-window cashier loaded and scrubbed pc_ fragment. Stats show two identical POSTs for one fake order, prepared on retry; only purchase-session/exchange/orders and checkout APIs, no platform auth/setup/status calls.
- Resumed cashier mobile **390/390**, QR/safe link present, no external scripts, no-referrer. Third-party payment link was NOT clicked.
- Mock paid+failed_retryable reload: payment link count zero, actual visible text “正在开通订阅，请勿重复付款。关闭页面后仍会继续处理。”; initial assertion used different wording and returned false, then direct text extraction confirmed the actual correct wording.
- Mock paid+fulfilled reload: delivered text and original order/amount. No real payment happened.
- Encoded `/partner/%70urchase` canonicalized to `/partner/purchase`; French existing-order screen loaded. Artificially expiring fake sessionStorage then reload showed the translated expired message, not platform login or a new payment form.
- Browser page errors list empty at final French selector check. Browser tool batch guard required get-url boundaries; initial CSS selector clicks did not change radio state, then current-ref clicks did. One local QA eval string had a syntax error, no business mutation was retried as recovery.

Verified image artifacts under `.local-tests/partner-hosted-h5-20261112/`: `h5-desktop.png`, `h5-mobile.png`, `h5-resumed-cashier.png`, `h5-delivered.png`, `h5-french-mobile.png` (existing-order view), `h5-french-plans-mobile.png` (selector). Adjacent browser-*.json files preserve exact tool observations and artifact verification. Preview PID 93243 was command-checked/stopped, only owned browser session `partner-h5-parent-20261112` closed; no files deleted.

Not validated here: real WebView/provider payment compatibility, screen-reader audit, browser storage-denial real profile, actual Vercel parser/deployed headers, real Go HTML headers. Existing DOM/config tests cover intended rules, not deployment execution.

## Requirements evidence

- R1: implemented selector -> same cashier, anonymous bootstrap tests, real desktop/mobile/mock flow. Backend runtime pending.
- R2: additive routes/model, old merchant request/response retained; frontend cashier/subscription regression passes. Go HTTP parity tests pending.
- R3/R4: source-reviewed transaction guard, nonce/capability/secret binding, strict DTOs and public bootstrap, browser fragment/no unrelated requests. Go isolation/concurrency tests pending.
- R5: fixed namespaced order identity, F1 regressions and real mock failure-refresh-resume. DB uniqueness/concurrency pending.
- R6: original paid-order pipeline reused, exact prices/quotas; mock pending/paid/delivered presentation only. Real mock-gateway callback/fulfillment test execution pending.
- R7: merchant current-credential reconciliation contract and tests written; persistence execution pending.
- R8: real early-script/bootstrap tests and browser no external scripts/unrelated APIs, generated static headers tested. Go/provider headers pending.
- R9: English/new Chinese guide, seven-locale tests and sync, recorded honest gaps; protected existing guide left out of staging/commit.

## Remaining runtime gates / resume

1. Use only task-owned Docker runner/isolated test PostgreSQL plus existing compatible SQLite/MySQL/clientFoundRows matrix. No host Go tests or production substitute.
2. Run the full `TestPartnerTenantPaidOrderDatabaseMatrix` including added purchase-session checks (fresh/repeated/additive migration, nonce/identity/order/concurrency, tenant-lock deadline); account for explicit SQLite lock-wait skip.
3. Run controller `TestPartnerTenantPurchase*` / `TestPartnerTenant*`, new authority/quota/availability/preparation tests, mock TLS gateway and original HTTP parity; router purchase/cashier canonical/privacy tests. Run original funding/fulfillment/late-callback regressions per paid-checkout spec.
4. Verify no skipped PostgreSQL assertions; capture actual engine versions/migration/persistence evidence. Only then consider full acceptance and archive. Do not delete sessions/orders/paid evidence to reset state outside disposable test DBs.

## Retention and commit

Relevant code-spec added at `.trellis/spec/backend/partner-hosted-h5.md` and linked from both layer indexes/old checkout spec. Relevant task/spec records belong in the same scoped implementation checkpoint commit, including new ignored Trellis files by exact path. Original dirty guide, private key, reports, Demo and artifact inventories are excluded. Temporary outputs are recorded and retained pending separate user cleanup approval; Trellis records are not cleanup targets.
