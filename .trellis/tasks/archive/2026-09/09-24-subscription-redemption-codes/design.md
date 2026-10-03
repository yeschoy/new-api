# Technical design — Subscription redemption codes

## Boundary and schema

- Extend the existing `Redemption` table with `plan_id` (integer, default 0). `plan_id = 0` means legacy wallet-quota code; `plan_id > 0` means subscription code and requires `quota = 0`. Do not add a second code table, parallel redemption API, physical FK, or snapshot columns. Existing rows migrate to `plan_id = 0`; active JSON can expose this field, with the frontend treating missing fields as 0 for defensive compatibility.
- Admin create/update validation enforces exactly one entitlement, validates enabled target plan on create or changing plan, checks quota only for quota codes, and keeps existing count/expiry/compliance limits. An unchanged disabled plan can still have code metadata/status edited, but redemption remains paused. Editing an existing used code must not change its entitlement or permit re-enabling; guard writes against a concurrent redeem. No new business-wide subscription rules: reuse purchase-count validation inside `CreateUserSubscriptionFromPlanTx`.
- Admin list/get stays in the original routes. For plan labels, use the existing admin plan-list API and a client-side `plan_id → title` map; retain the raw ID as fallback if a plan is no longer present.

## Redemption path and contract

- Keep `/api/user/topup` and the existing single input. Inside the existing `Redeem` transaction, lock/load the code, validate status/expiry, then CAS enabled→used against the entitlement values to protect SQLite and concurrent admin edits. For quota codes, retain current quota-fence, credit and cache-sync semantics. For subscription codes, load the plan from the transaction **without the plan cache**, confirm it is enabled and exists, then call `CreateUserSubscriptionFromPlanTx(tx, userId, plan, "redemption")` inside the same transaction. Failure rolls back status and any user/group changes. Preserve user serialization/lock ordering and refresh group cache after commit if the subscription upgraded the group.
- The controller keeps `data: number` for successful quota codes. Only successful subscription codes return a typed object (e.g. `{type:"subscription", plan_id, plan_title}`); no `key` or secret appears in the response. The wallet hook branches on response shape to show a subscription-specific toast and refresh user/subscription state. Older clients retain quota response compatibility but must update to present a subscription-specific success message; they cannot be guaranteed to interpret the new typed result.
- Return the existing generic failure to the user for invalid/used/disabled/expired/not-found/plan-failure codes; do not log the full redeem key (already present in the legacy error log). Record a non-secret redemption event after successful commit, without a paid subscription order or wallet debit for the gifted plan.

## UI reuse

- Extend `web/src/features/redemption-codes` form/schema/table/mobile row/export rather than creating a new admin page. Reuse existing `Combobox` for plan selection, existing drawer/table/status badge/export dialog for management, and existing wallet redemption component/hook for users. Display quota only for quota codes; display current plan title/ID for subscription codes. Fetch admin plans via `getAdminPlans`, show eligible plans in new-code selection, and preserve disabled existing selections for inspection/editing.
- Keep existing quota form defaults and response parsing. Change form validation to require positive quota for quota codes and a selected enabled plan for subscription codes; server remains authoritative. Add translation keys using the project's i18n workflow in all supported locales.

## Compatibility, migration, and rollback

- `AutoMigrate` adds the nullable-by-default `plan_id` column without rewriting legacy rows. Test fresh + latest-released-version representative schemas, repeat migration and check original data/key uniqueness. Do not remove `plan_id` on rollback; disabling the new admin path/reverting code retains legacy wallet codes but subscription codes cannot be redeemed by old server code and require upgrade again.
- Database verification must run on real SQLite, MySQL and PostgreSQL and record versions/results. At planning time Docker daemon is unavailable, `TEST_MYSQL_DSN` and `TEST_POSTGRES_DSN` are unset. Do not declare compatibility/completion if matrix cannot be run.

## Trade-offs

- Inferring code type from `plan_id` saves a redundant field but requires strict mutual-exclusion validation and defensive handling of malformed rows.
- Reading the live plan intentionally means later edits change unredeemed-code entitlements. Blocking disabled plans is a user-confirmed exception to existing admin binding semantics, not a global change to admin binding.
