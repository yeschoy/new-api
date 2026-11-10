# Paid Tenant checkout verification — 2026-11-11

## Overall status

Implementation and two independent code reviews are complete; **full acceptance is blocked by Docker container startup**. Do not archive this task or call the DB/payment/concurrency/migration tests passed. No deployment, real payment, production login/access or test-data deletion occurred. Work is saved as a scoped implementation checkpoint.

## Implemented

- Tenant platform-numbered paid subscription orders and a public order-only hosted cashier; old external direct grant removed without a legacy mode.
- Independent stable Key issuance, atomic paid fulfillment/renewal, separately durable verified payment evidence, late-payment preservation, bounded background paid-delivery recovery.
- CNY exact-cent Epay adapter with strict notification validation, tenant/user/plan/order isolation and no wallet accounting reuse.
- Tenant membership forces subscription-only funding; unsupported legacy MJ/SwapFace rejects before upstream instead of spending wallets.
- Admin Tenant plan payload/price labels/actual-currency display; ordinary plan behavior retained.
- English/Chinese API docs updated from the user's dirty baseline, preserving the requested concise interface style; executable code-spec added.

## Checks actually executed

| Check | Result |
| --- | --- |
| `go build ./...` | PASS, repeated after backend/review fixes; Go 1.26.10 darwin/arm64 |
| `go vet ./model ./controller ./router ./service ./relay` | PASS, includes test-source static compilation but does not execute tests |
| gofmt affected Go and `git diff --check` | PASS |
| `cd web && bun run typecheck` | PASS |
| Cashier + subscription frontend suites | PASS: 9 files / 85 tests (`vitest run src/features/partner-checkout src/features/subscriptions`) |
| Prior cashier + targeted subscription + auth preload regression selection | PASS: 8 files / 83 tests; selections overlap, do not sum as unique tests |
| Scoped oxlint | PASS: 24 changed/new JS/TS files, 0 errors; 2 pre-existing style warnings in retained translation script |
| Full `bun run lint` | FAIL: 151 errors / 66 warnings in pre-existing unrelated files, e.g. home pricing gateway and ai-elements. Raw evidence in frontend-lint.log; no unrelated lint cleanup |
| `bun run i18n:sync` | PASS; seven locales contain the 15 new cashier keys; no unrelated tracked normalization |
| `bun run build:check` | PASS; typecheck + Rsbuild build, raw evidence frontend-build.log |
| Real browser against localhost built preview + intercepted fixture API | PASS for pending, paid+failed_retryable, fulfilled/reload, fragment scrub/no external scripts and 390px no horizontal overflow |
| Go test / SQLite/MySQL/PostgreSQL runtime matrix / signed callback execution | NOT RUN: Docker startup blocked; no host DB/Go-test fallback and no live gateway |

Frontend tests print jsdom's unimplemented scrollTo warning; assertions pass. Existing frontend bundle-size/build warnings are retained in build output, not hidden.

## Independent review and fixes

First read-only review confirmed:

1. P1: admin handlers forced USD despite CNY-only checkout. Fixed controller normalization, merchant admin payload and displayed price currency; added actual admin create/update -> checkout regression.
2. P1: legacy MJ/SwapFace bypassed BillingSession and could spend Tenant wallets. Fixed common membership guard before upstream; added funded/no-plan/expired/active Tenant and ordinary-wallet mock regressions.
3. P2: purchase cap rejected only after payment, and renewal could cross natural expiry. Added pre-payment eligibility and conservative pending first-purchase reservation plus frozen renewal target; cancellation remains rejected. Tests cover both.
4. P2: existing controller BillingSession fixtures lacked the membership table. Added migrations without swallowing fail-closed lookup errors.

Second review confirmed the above fixes and identified cross-fixture membership-cache pollution. Added ResetPartnerTenantMembershipCache at DB initialization and explicit DB-swap/test cleanup boundaries in controller fixtures and affected funding/legacy tests. Build/vet pass afterward; repeated/ordered DB execution remains unrun.

No remaining production P1/P2 was confirmed by the second static review. This is not a substitute for DB execution. HTML no-store/no-referrer/unframed response was added separately with regression assertions; reverse-proxy/CDN deployment must preserve it.

## Docker blocker: observed states, not inferred test success

- Initially daemon unavailable. Started installed Docker Desktop with native `docker desktop start`; engine answered version 28.2.2.
- Pulled `golang:1.26.10-bookworm` and `mysql:8.4`, reused `postgres:15`.
- Created task network `pto-1111-test`, named cache volumes `pto-1111-gocache` and `pto-1111-gomod`.
- `pto-1111-postgres` create succeeded, but start timed out at 60/120 seconds. Inspect remained Status=created, Running=false, Pid=0, no start time/error.
- `pto-1111-go` was created with `--network none` to rule out dependence on task network; its start also timed out, same created/not-running state.
- Docker Desktop restart completed, but subsequent Go runner start still timed out and inspect remained created. No Go test command was dispatched inside any running container. No database server version can therefore be reported.
- MySQL container was planned but **not created**: execution stopped at the preceding start blocker. PostgreSQL's anonymous volume and task cache resources are retained until user-approved cleanup. No host port/production DSN/credential was used.
- Repeated unchanged start attempts stopped after the confirmed failure; no host database/service installation or host test execution substituted for container verification.

### Resume runtime validation when containers work

Use fresh task-owned databases for each test matrix (matrix setup asserts empty database); do not reuse production or prior test DBs. Copy only tracked source plus explicitly reviewed task source/assets into a runner: never copy the untracked private key or reports. Supply TEST_TENANT_ORDER_MYSQL_DSN, TEST_TENANT_ORDER_MYSQL_FOUND_ROWS_DSN (clientFoundRows=true), TEST_TENANT_ORDER_POSTGRES_DSN and separate fresh TEST_SUBSCRIPTION_GROUP_* / TEST_FIXED_* DSNs as appropriate.

Required groups:

- model: TestPartnerTenantMoneyBoundary, TestPartnerTenantPaidOrderDatabaseMatrix and existing Tenant/key/rate-limit tests. Matrix covers real migration repeat, parallel same/different-key creates, duplicate payment/transaction ownership, rollback/recovery, forbidden resources, price and purchase-limit rules.
- controller: TestPartnerTenant*, TestPartnerEpaySharedTransport*, existing PartnerServer Epay checkout tests, TestPreConsumePolicyDatabaseMatrix and TestAutoGroupSubscriptionFundingAndRetryRouting. Run relevant order+ordinary funding tests twice and shuffled to validate membership-cache isolation.
- router: TestPartnerTenant*, TestPartnerCashierHTMLIsPrivateAndUnframed and ordinary routing regressions.
- service: TestSubscriptionGroupFundingPreferences, TestFixedPriceBillingDatabaseMatrix, TestPartnerTenantMembershipQueryFailureDoesNotFallBackToWallet.
- relay: TestLegacyMidjourneyTenantFundingGuardBeforeUpstream and TestLegacyMidjourneyTenantMembershipDBFailureFailsClosed.

Keep provider behavior mocked with local TLS servers; no live charges. Record actual engine versions, unskipped assertions and any failures before full acceptance.

## Local browser evidence (mock only)

Built preview: 127.0.0.1:3011, fixture order `PTO0123456789ABCDEFGHIJKLMNOPQRSTUV`, fake `pc_` token and QR content `fixture-payment-not-real`. No real cashier API, buyer or gateway was used and no payment link was clicked.

- `browser-cashier-pending-ready.json`, `cashier-desktop.png`: summary, QR and safe external link visible, URL fragment removed, no external script src, referrer no-referrer.
- `browser-cashier-mobile.json`, `cashier-mobile.png`: viewport 390px, documentWidth 390px, no horizontal overflow.
- `browser-cashier-paid-pending.json`: response switched to paid+failed_retryable, UI says do not pay again and payment link count is zero.
- `browser-cashier-reload-fulfilled.json`, `cashier-fulfilled.png`: same-tab page reload with no fragment recovers short-lived access from sessionStorage and displays delivered.

Screenshots were saved and tool artifact verification confirmed their existence. They prove frontend presentation and mocked state handling, not backend payment/DB correctness or production HTML headers.

## Explicit operational limitations

- Epay CNY-only for this adapter; existing USD catalog entries are not auto-converted.
- Callback retries establish payment truth. Active gateway reconciliation/close is not implemented where it would expose merchant keys; missing all notifications requires operator/provider review.
- Nonzero max_purchase_per_user reserves unfulfilled first-purchase slots beyond browser expiry to avoid late-payment overselling. There is no safe automatic release; default recurring product can use zero. Documented rather than silently claim expiry cancels payment.
- Stable signing secrets are required; rotating revokes outstanding cashier capabilities.
- Disabled/changed/missing plan or forbidden account/Key may keep paid delivery retryable until operator resolution, never a second charge or silent replacement.

## Retention and authorization

Temporary artifacts/resources are inventoried in project TEMPORARY_ARTIFACTS.md and frontend inventory. Do not remove them without user approval. Trellis evidence/logs are retained. Do not stage the untracked private key, existing reports or unrelated inventory content as business code. Task remains in_progress due to runtime quality gate.
