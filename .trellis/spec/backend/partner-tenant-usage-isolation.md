# Partner Tenant Usage Isolation (dedicated usage store, CNY projection, user classification)

## 1. Scope / Trigger

Read before changing: Tenant (merchant) ownership lookups, the dedicated `partner_tenant_usage_logs` table or its migration, any own-user / API-Key log reader, the administrator merchant usage API or page, the `quota_cny` projection, or the administrator user list classification.

Evidence status (2026-11-17/18, task group `11-17-partner-usage-isolation`) — keep these distinctions when citing this spec:

- **The dedicated-table writer is enabled.** `RecordConsumeLog`, `RecordErrorLog` and consume/error branches of `RecordTaskBillingLog` route confirmed Tenant members only to `partner_tenant_usage_logs`. Generic `createLog` and other event types keep their original destination. Migration and own-reader PostgreSQL gates passed before this routing was enabled.
- **Executed on task-owned PostgreSQL 15.19 in Docker (Go 1.26.10).** Migration/persistence, all own readers, route/PAT authorization, CNY compatibility and classification tests passed. Historical source-only / Docker-blocked notes in the task records are superseded by their later runtime sections; do not repeat them as current status.
- Frontend: Vitest DOM tests (mock transport), local browser rendering checks, and real loopback backend + isolated fake PostgreSQL fixture checks. The browser's fake usage rows prove UI/API integration, not real model consumption. Writer/settlement integration is proved separately by the Go suites. No production deployment, real payment/model call or live ClickHouse/MySQL verification is implied.

## 2. Signatures

Model (main DB unless stated):

- `GetPartnerTenantOwner(userID int) (PartnerTenantOwner, bool, error)`; `GetPartnerTenantOwners(userIDs []int) (map[int]PartnerTenantOwner, error)`; `PartnerTenantOwnerForRequest(c *gin.Context, userID int) (PartnerTenantOwner, bool, error)`. `PartnerTenantOwner{TenantId int64, TenantName, AccountId int64, UserId int, IdentitySource}` — every field `json:"-"`.
- `ListPartnerTenantOptions(keyword string, offset, limit int)`, `GetPartnerTenantOption(id int64)`; errors `ErrPartnerTenantOwnerLookup`, `ErrPartnerTenantOptionQuery`.
- LOG_DB: `PartnerTenantUsageLog` → table `partner_tenant_usage_logs`; `MigratePartnerTenantUsageLogs() error` wired at `model/main.go` in the shared `LOG_DB = DB` master branch and in `migrateLOGDB`.
- `PartnerTenantUsageFilter`, `ListPartnerTenantUsageLogs(ctx, filter, offset, limit, root)`, `GetPartnerTenantUsageStat(ctx, filter)`.
- Own-user readers keep their signatures: `GetUserLogs`, `StreamUserLogs`, `GetLogByTokenId`, `GetUserRequestLogs`, `GetUserLogSummary`; self statistics now use `SumUserUsedQuota(userId, username, logType, start, end, model, tokenName, channel, group)`.
- `UserTenantFilter{Category, TenantId}`; `GetAllUsersWithTenantFilter`, `SearchUsersWithTenantFilter` (the old `GetAllUsers` / `SearchUsers` delegate with the zero filter).

Service: `CurrentPartnerTenantQuotaCNYConfig()` / `NewPartnerTenantQuotaCNYConfig(quotaPerUnit, usdExchangeRate float64)`; methods `Available`, `Metadata`, `AmountInt64`, `AmountString`, `AmountDecimal`, `Subscription(facts)`, `Catalog(totalAmount)`.

HTTP (dashboard envelope, `Cache-Control: no-store`):

| Route | Gate | PAT scope |
| --- | --- | --- |
| `GET /api/log/partner-tenants/options` | AdminAuth | `log:read` |
| `GET /api/user/tenant-options` | AdminAuth (user admin group) | `user:read` |
| `GET /api/log/partner-tenants` | AdminAuth | `log:read` |
| `GET /api/log/partner-tenants/stat` | AdminAuth | `log:read` |
| `GET /api/user/`, `GET /api/user/search` (+`user_category`, `tenant_id`) | unchanged | `user:read` |
| `GET /api/partner/subscription`, H5 quota, catalog (+`quota_cny`) | unchanged | n/a |

Full parameter / field tables: `docs/partner-tenant-api.md` (options, usage logs, user classification) and `docs/partner-subscription-key-api.zh-CN.md` + OpenAPI (`quota_cny`).

## 3. Contracts

Ownership:
- A user is a merchant iff a `partner_tenant_accounts` row exists for that `user_id`. No status / subscription / role / group / username predicate; disabled or expired tenants and accounts stay merchants; a LEFT JOIN keeps a mapping whose tenant row is missing (empty name). Partner OAuth / Server (`PartnerAccount`) is a different identity system.
- Three outcomes: member, confirmed non-member, lookup failure. A failure is never reported as non-member. The one-minute bool membership cache is neither read nor written; no shared or negative cache. The request memo is keyed by the actual user ID.

Dedicated table (LOG_DB): explicit columns, 64-bit ids / quota / tokens, TEXT `content` / `other`, frozen owner snapshot (`tenant_id`, `account_id`, `tenant_name`, `identity_source`), random non-secret `event_id` (unique), no uniqueness on `request_id`. Index names `idx_ptul_time (created_at,id)`, `idx_ptul_tenant_time`, `idx_ptul_user_time`, `idx_ptul_token_time` (`(x, created_at, id)`), `idx_ptul_request`, `ux_ptul_event` — never reuse `Log` index tags (PostgreSQL index names are schema-wide). ClickHouse: explicit MergeTree CREATE, `ORDER BY (created_at, event_id)`, existing `LOG_SQL_CLICKHOUSE_TTL_DAYS` with MODIFY/REMOVE TTL. The migration never reads, moves or deletes `logs`; no new automatic SQL deletion. Inserts use a silent GORM session and return fixed error text.

Writer contract:
- Resolve ownership from the writer's actual `userID` argument (task writer: persisted task user), not another context user. Request memo keys include that ID. Original consume/error suppression remains upstream; consume disabled returns before ownership lookup. Refund/topup/system/security/authorization audit events do not get blanket-routed.
- Confirmed member → one dedicated insert; confirmed non-member → original `createLog` and diagnostic path. Lookup failure → neither table, bounded warning. Dedicated insert failure → warning only, no default-table fallback, retry, or compensation. Main DB and LOG_DB may be separate; never join across them.
- Keep `LogQuotaData` outside the routing branch, once per original consume event (including zero and failed-but-charged consumes), never for plain error. A failed log insert after settlement cannot roll back subscription/token/user counters or alter whole-site feed.
- For member/unknown ownership, suppress the old full params/content/raw error diagnostics; application warnings contain fixed reason and user/tenant/request correlation only. Silent GORM insert/read sessions prevent interpolated binds/driver errors from bypassing this boundary. Non-member diagnostics are intentionally unchanged.
- `subscription_id` uses only a positive `int`/`int64` in `other.public`; absent facts remain 0 internally / empty string in the admin DTO. Text/audio/realtime supply it. Task/violation/error paths without that fact do not re-query or fabricate a subscription.
- Best-effort, not an outbox: a crash, ownership lookup failure or LOG_DB outage may lose the usage row. No claim of lossless cross-database logging. Even ordinary-user logging can be skipped if the main ownership query is unavailable.
- SQLite fixtures that invoke the writers must migrate both `PartnerTenantAccount` and `PartnerTenant` even for ordinary users. Production initializes both; a test missing them is an ownership-query failure, not proof of non-membership.

Read matrix:
- Default administrator list / stat / export read only `logs` (old merchant history stays there). The dedicated endpoints read only the dedicated table and never union or fall back.
- Own-user / API-Key readers probe the dedicated table for the authenticated `user_id` / `token_id`. No rows, or table confirmed absent → the original single-table code runs unchanged. Rows present → ownership-scoped `UNION ALL` (predicate bound inside both branches, explicit per-column casts, global order `created_at desc, id desc, source, event`), count / sort / page on the union. Table present but probe failed, or the presence check failed → the reader's generic error, never "no rows". Presence is cached positive-only, bound to the current `LOG_DB` handle; a successful migration marks the handle.
- Request folding uses the unmodified `compareRequestOutcomes` on original local ids; the private source/event tie-break applies only to fully equal facts; empty `request_id` rows are never folded. Failure classification is the shared `logOutcomeFailed` (error row, violation-fee marker, or stream status error). Every charged consume row is summed, including failed-but-charged requests; error rows add no quota. `request_count = succeeded_count + failed_count`.

Admin usage API: one filter builder for list, count and stat; strict parameters (unknown / repeated / empty / non-canonical → 400 `Invalid parameters`; window wider than the max log range → 400 with `message_key` `The time range cannot exceed {{days}} days` and `message_params.days`); 503 with a fixed database message. ids, quota, token counts and aggregates are decimal strings; `total` / `record_count` are rows, `request_count` is folded requests.

CNY: `amount = quota × USDExchangeRate ÷ QuotaPerUnit`, exact multiply then one six-place division rounded half away from zero (`DivRound`), fixed-point strings, never the site display preference. Invalid or non-finite config → `available=false`, amounts `null`, `reason=invalid_conversion_config`, metadata factors `null`; the business response still succeeds. Unlimited active → `total`/`remaining` null; terminal → `remaining="0.000000"`, `usable=false`. Aggregates are summed raw first and converted once. It is a current-rate display equivalent, not cash, balance or price. Hosted H5 `usable` is quota-level (`active && (unlimited || remaining > 0)`), it does not re-validate user/key state like the independent query.

User classification: `user_category=all|ordinary|merchant`, `tenant_id`; same EXISTS / NOT EXISTS predicate on count and page in one transaction before pagination; `ordinary` + `tenant_id` → 400. Each user gains `user_category`, `partner_tenant_id` (string, `""` if none), `partner_tenant_name`; one batch owner query per page; owner failure → 503, never "ordinary". OAuth `partner_client_id` filter and fields unchanged.

Frontend: dedicated `/partner-usage-logs` route (role ≥ admin; non-admins redirected with zero admin requests), not a tab of the default usage-logs page. Scope notice always visible. List and stat always share one explicit window and filters; unset parameters omitted, never empty strings. Query keys include viewer (user id, role, session sid) and every input. ids / quota stay strings end to end.

Compatibility limits and rollout:
- Deploy migration plus compatible readers before enabling the writer across API/async nodes. During rolling upgrades there is no global atomic cutover timestamp. Keep the new table/data and compatible readers on rollback; an old read-only-from-logs binary hides the new own-user history.
- Cashback recorded-spend reports and Partner Server sub-account usage are separate readers and still read only `logs`; they are not implicitly unioned. Tenant/PartnerAccount identity systems must not be conflated.
- Stats stream the full bounded time window; own-union does not push per-branch top-N. Tiny-fixture EXPLAIN is not production-scale performance certification. MySQL collation mismatches and live ClickHouse remain unverified operational risks.
- Usage DTO has no unlimited-balance field: the merchant log page therefore has no invented unlimited-quota badge. Unlimited/terminal balances belong to the CNY subscription/catalog DTO, not per-event log rows.

## 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Owner lookup DB error | Error, never non-member; user list → 503 |
| Merchant with disabled tenant / account / expired plan | Still merchant |
| Dedicated table missing on this node | Own-user readers use the original single-table path |
| Dedicated table exists, probe fails | Reader's generic error |
| Admin dedicated endpoint, table missing | 503 (no fallback) |
| Unknown / repeated / empty / non-canonical parameter | 400 before any query |
| Window wider than max log range | 400 with `message_params.days` |
| CNY config invalid | `available=false`, `null` amounts, HTTP 200 |
| `ordinary` + `tenant_id` | 400 |
| Ordinary user or anonymous on admin routes | 401/403; UI redirects to `/403` |
| PAT with only `user:read` on log endpoints (or the reverse) | Rejected |

## 5. Good / Base / Bad Cases

- Good: a member with old rows in `logs` and new rows in the dedicated table sees one merged, correctly paged own history; the administrator default page keeps only the old rows; the merchant page shows only the new rows with the scope notice.
- Base: an ordinary user (no dedicated rows) executes exactly the pre-change SQL, plus one indexed probe.
- Bad: classify by `p_` username or subscription; treat a probe failure as "no rows"; union the dedicated table into the default admin export; sum per-row rounded CNY; convert a >2^53 id with `Number()`; truncate an amount with an ellipsis.

## 6. Tests Required

Go suites use explicit DSNs `TEST_PARTNER_USAGE_POSTGRES_DSN`, `TEST_PARTNER_QUOTA_CNY_POSTGRES_DSN`, `TEST_PARTNER_USER_CLASSIFICATION_POSTGRES_DSN`, unique retained schemas (`pt_usage_*`, `pt_quota_cny_*`, `pt_user_class_*`), no DROP/TRUNCATE, and fail (not skip) without a DSN; `model` / `service` `TestMain` bypass SQLite for these selections. Run only inside task-owned Docker with selectors, never host `go test`.

Assert: fresh/upgrade/repeat migration on shared and separate LOG_DB; actual DDL/indexes; >2^53 and long text persistence; every own reader and probe state; all writer destinations, suppression and feed counts; settled balances survive a genuine PostgreSQL constraint failure on separate LOG_DB; real route/PAT and token-selector forgery denial; exact CNY and old JSON token compatibility; user category/count/page/batch enrichment; whole SQL generation with ClickHouse dialect (not live CH).

Regression evidence must separate selected PostgreSQL suites from the old no-DSN SQLite suites. The latter contain known baseline fixture failures and intentionally failing new PostgreSQL tests; compare named failure/skip sets, never hide them or call the whole run green. Previous-group access-mode/authorization-audit suites and affected SubscriptionKey quota tests are separate gates.

GORM failure injection must target the executed chain: `Find`/`Count` use Query, `Scan`/migrator presence checks use Row; assert the injection fired. `Table("x AS a")` may expose only `a` in `Statement.Table`, so inspect `TableExpr` too. Positive-control SQL proves DEBUG capture is active. EXPLAIN actual executed SQL+binds, assert ownership predicates on both union branches and index definitions; do not hardcode the optimizer's small-fixture scan choice or constant/cast formatting.

Frontend (executed): `bun run test -- src/features/partner-usage-logs src/features/users src/features/usage-logs src/features/partner-oauth-clients` (48 files / 657), typecheck, touched-file oxlint/oxfmt, build:check; seven locales via `web/scripts/partner-usage-isolation/add-missing-keys.mjs` + `bun run i18n:sync`. Global lint has a separately reported pre-existing 151-error/68-warning baseline. Browser integration: admin/root, ordinary-user 403 with zero admin requests, consistent list/stat/owner scope, history, exact large-ID requests, keyboard and 390px layout. Final task evidence lives in `11-17-partner-usage-isolation/final-acceptance.md` (then its archive path), not in screenshots alone.

## 7. Wrong vs Correct

```go
// Wrong: a failed probe silently hides a member's new history.
hasRows, _ := dedicatedLogOwnerHasRows(ctx, ownedLogUserColumn, userID)
if !hasRows { return legacyRead() }

// Correct: only "no rows" / "table confirmed absent" take the legacy path.
hasRows, err := dedicatedLogOwnerHasRows(ctx, ownedLogUserColumn, userID)
if err != nil { return nil, common.NewMessage("Failed to query logs") }
if !hasRows { return legacyRead() }
```

```tsx
// Wrong: an ellipsis hides digits of an exact amount on narrow screens.
<div className='truncate tabular-nums'>{amount}</div>
// Correct: exact decimal strings wrap.
<div className='break-all tabular-nums'>{amount}</div>
```
