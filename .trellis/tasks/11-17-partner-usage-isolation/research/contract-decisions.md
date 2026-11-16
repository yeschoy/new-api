# Cross-child contract baseline for final review

Status: proposed technical implementation of user-confirmed PRD R1–R7. All four tasks remain planning; the final summary still needs a subsequent explicit implementation approval. No business code, runtime test, production read/write or deployment is implied.

## 1. User-confirmed read matrix

| Reader | Default logs | Dedicated Tenant logs | Boundary |
| --- | --- | --- | --- |
| Administrator default list/stat/export | Yes, including old Tenant history | No | Preserve original history |
| Administrator Tenant page | No | Yes | New rows only; explicit transition notice |
| Existing own-user list/stat/outcome/summary/export | Authorized own rows | Authorized own rows | Authenticated user_id before merge |
| Model API Key recent logs | Authorized token rows | Authorized token rows | Authenticated token_id, never query ID |
| Global dashboard | Existing quota_data/real counters | No new duplicate feed | Merchant use remains included once |

Ordinary admins and root may read safe merchant metadata; root-only management remains unchanged. PAT log readers retain log:read, user readers retain user:read through explicit route declarations; no session or role check is bypassed. Safe options reuse one primitive through two appropriately scoped entry points (log:read and user:read respectively); both use bounded search/pagination and only safe id/name data, including disabled merchants and safe resolution of a selected ID.

## 2. Authoritative safe owner

`PartnerTenantAccount.user_id` uniquely anchors Tenant ownership. New safe owner projection contains tenant_id, tenant_name, account_id, user_id, identity_source only; no external buyer ID, credential/seed/hash or model token string. Use a left join for safe merchant name so a surviving account mapping is not reclassified ordinary if merchant metadata is missing. No account-status, subscription-status or tenant-status predicate in membership.

Resolve at the first authenticated usage writer and memoize the safe result only within that request, keyed by the actual user ID. Context-free task consumption resolves from persisted server task.user_id. Do not use the one-minute bool membership cache as a rich snapshot, nor add negative shared caching in this MVP. Batch the same owner projection for user rows. Stored usage freezes safe owner/name; user list uses current safe name, with the distinction documented.

Owner lookup failure is not nonmembership: do not mix an unknown event into default logs. Skip that best-effort usage write and emit a bounded correlation warning, without changing settled billing or the existing quota_data feed. New-table write failure likewise never falls back or dual-writes. Outbox/lossless delivery is outside scope; disclose the existing crash/outage loss window.

## 3. Writer census and existing semantics

- `service/text_quota.go:531`: text consumption; `service/quota.go:250,389`: audio/websocket consumption.
- `service/task_billing.go:81`: task submission consumption; `:286,365`: context-free task refund or positive-delta consumption.
- `relay/mjproxy_handler.go:290,672`: legacy consumption writers; retain existing Tenant funding rejection before upstream, do not enable unsupported paths.
- `service/relay_error.go:76-97`: only existing loggable errors, after suppression.
- `service/violation_fee.go:117-163`: real fee is persisted as consume even though the response is unsuccessful. Moving logs must not zero this charged fact or count its accompanying error as a second charge.
- `service/midjourney.go:141` and task negative deltas are refund events. Refund/topup/system/security/audit are NOT moved by a blanket user-based createLog hook. New helper is called only for model consume/error types at the explicit usage writers.

Request outcome and charged consumption are different aggregates. Retry-folded requests retain compareRequestOutcomes; all actual consume facts retain their charges. Existing raw logs are not deduplicated by request_id. No new uniqueness constraint on request_id: retries/task facts can legitimately share it.

## 4. Storage and read identity

New table: partner_tenant_usage_logs in LOG_DB, with local primary key, separate event_id, safe Tenant/account/name snapshot and explicit copies of usage Log fields. Do not embed Log GORM index tags: PostgreSQL index names must not collide with logs (e.g. idx_created_at_id). Use prefixed short new index names, TEXT for content/other, int64 quota/ownership values. No FK/cross-database join with main DB.

Union readers project a compatible Log view with private source/event tie-breakers. Never deduplicate on local id, and never order the union solely by independent table IDs. For mixed records use created_at, original local id and deterministic source/event tie-breaking; keep legacy behavior for old-table-only readers, and preserve compareRequestOutcomes ranking before display-ID reassignment. Apply ownership and filters inside both union branches, then count/sort/paginate. Streaming must not materialize an unbounded export.

## 5. Fixed CNY display contract

Add quota_cny without replacing existing fields: top-level independent subscription response, each hosted subscription item, each merchant catalog plan. Catalog projection contains total/unlimited only; no invented usage or entitlement.

Subscription projection: currency=CNY, available, total/used/remaining decimal strings or null, unlimited, usable, optional historical_remaining; conversion metadata quota_per_unit/usd_to_cny_rate as strings, scale=6, rounding=half_away_from_zero. Exact decimal(int64 quota) × configured CNY rate ÷ quota_per_unit, one final rounding to six places; fixed-point JSON strings, no scientific notation. Read/validate the current conversion config once per response. Do not use site-display-preference-driven PartnerOAuthDisplayCurrency.

- Active finite: all three amounts finite; remaining clamps according to the existing authorized quota snapshot.
- Unlimited active: total=null, remaining=null, used finite, unlimited=true. Unlimited inactive: remaining="0.000000", usable=false; total stays null. No false zero-limit display.
- Terminal finite: usable remaining="0.000000"; historical_remaining may show the existing explicitly nonspendable historical value.
- Invalid/nonpositive/nonfinite conversion config: available=false, amount fields null, bounded unavailable reason; preserve original quotas/authorization/business response and never substitute a made-up exchange rate.
- A six-place rounded value is a display projection, not an exact alternative ledger. Very small positive values rounded to zero must not be advertised as free; use a less-than indicator in the new UI when raw quota is positive.

The same conversion helper formats new merchant log charges/statistics; those are current-rate display equivalents, not historical cash debits or purchase prices. Sum raw quota first, then convert once to avoid per-row rounding drift.

## 6. Scope and retention

No historical migration, hiding or recount. New SQL table has no added automatic deletion; existing default-log cleanup retains its original scope. ClickHouse uses the existing LOG_SQL_CLICKHOUSE_TTL_DAYS setting and explicit DDL/TTL synchronization for the new table. No new destructive cleanup endpoint; document SQL-table capacity/retention as an operational follow-up requiring separate approval.

Coordinated rollout must include all API and background writers; no fabricated single cutover timestamp across mixed versions. Rollback retains new table/data and a reader capable of accessing it. An old binary alone cannot prove personal read continuity; never copy/delete records to fake rollback completeness.

## 7. Validation boundary

All Go tests and database engines run only in task-owned Docker; isolated PostgreSQL is the migration acceptance target. Do not run host go test, restart Docker, use production, or substitute SQLite/build/vet for missing pq evidence. No resource has been created in planning. Record later exact resources in TEMPORARY_ARTIFACTS.md; cleanup needs approval and excludes Trellis records.
