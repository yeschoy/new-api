# Database Guidelines

> Database patterns and conventions for this project.

---

## Overview

<!--
Document your project's database conventions here.

Questions to answer:
- What ORM/query library do you use?
- How are migrations managed?
- What are the naming conventions for tables/columns?
- How do you handle transactions?
-->

(To be filled by the team)

---

## Query Patterns

<!-- How should queries be written? Batch operations? -->

(To be filled by the team)

---

## Migrations

<!-- How to create and run migrations -->

(To be filled by the team)

---

## Naming Conventions

<!-- Table names, column names, index names -->

(To be filled by the team)

---

## Common Mistakes

- Do not call `GetDBTimestamp()` (which queries the global `DB`) inside a GORM transaction. SQLite test setups may have one available connection, so the nested query waits on the transaction's own connection indefinitely. Use `getDBTimestampOn(tx)` for transaction-local database time; `CreateUserSubscriptionFromPlanTx` is an example. This also keeps transactional reads on the same connection across dialects.
- Avoid a redundant fixed `TableName()` when GORM's default already names the production table correctly. `Checkin` naturally maps to `checkins`; its former override bypassed `schema.NamingStrategy{TablePrefix: ...}` in MySQL/PostgreSQL migration tests, causing test setup and cleanup to touch an unscoped table. Verify the default table name before removing any override, then test normal startup and prefixed isolated migrations on SQLite, MySQL and PostgreSQL.

## Scenario: Redemption code entitlement migration and grant

### 1. Scope / Trigger

Adding a redemption entitlement or changing subscription grant semantics touches the `redemptions` schema, wallet quota, subscription creation and the `/api/user/topup` response. Preserve existing wallet codes and their public numeric response; verify all three supported database engines.

### 2. Signatures

- `Redemption.PlanId int` (`plan_id`, default `0`); `Redemption.Quota int` keeps its historical `default:100` database tag.
- `Redemption.Type string` is optional request-only (`gorm:"-:all"`), not a persisted discriminator; infer stored entitlement from `plan_id`.
- `model.Redeem(key, userId) (data any, err error)` is called by `POST /api/user/topup`.
- Admin routes: `POST /api/redemption/`, `PUT /api/redemption/` (`?status_only=...`), existing list/search/delete routes.

### 3. Contracts

- `plan_id = 0`, positive validated `quota`: wallet code. `plan_id > 0`, `quota = 0`: subscription code. Existing rows migrate to `plan_id = 0` with no balance changes. The optional `type` request value, if supplied, must match the entitlement.
- On a wallet-code success, `/api/user/topup` still returns `data: <integer quota>`. Only subscription-code success returns `data: {"type":"subscription","plan_id":<int>,"plan_title":<string>}`. A client supporting subscription codes must branch on this shape; never send a code key back or log a raw submitted key.
- Subscription grants use the **current** enabled plan in the same transaction as the enabled→used CAS; `CreateUserSubscriptionFromPlanTx` applies duration, reset, group and `MaxPurchasePerUser`. A disabled plan does not consume its unredeemed code. A code can never be re-enabled after use.
- The old `quota default:100` tag must remain for cross-dialect migration stability. GORM substitutes a zero-valued struct field with this default during INSERT; for subscription codes, explicitly write `quota=0` in the **same** transaction before commit.

### 4. Validation & Error Matrix

| Condition | Behavior |
| --- | --- |
| Wallet code quota non-positive or above wallet bound; subscription code with quota nonzero; invalid `type`/`plan_id` pairing | Reject admin insert/update on server |
| Plan missing/disabled on issuance or plan change | Reject, without creating a new code |
| Existing code whose unchanged plan was later disabled | Allow metadata/status edit; reject redemption until plan is re-enabled |
| Code expired, disabled, used or concurrently consumed | Reject redemption; do not grant wallet quota or subscription |
| Grant fails (plan deleted, purchase limit, DB error) | Roll back both code status and entitlement; do not create a paid order |

### 5. Good / Base / Bad Cases

- Base: pre-upgrade quota code is still a quota code and returns the same integer after redemption.
- Good: issue a plan code with zero quota, disable its plan, observe a rejected redeem and unchanged code; re-enable, redeem once and observe the current plan's subscription entitlement.
- Bad: create a subscription code in a separate table, drop the quota default during `AutoMigrate`, read the plan through a stale cache inside the redeem transaction, or call `GetDBTimestamp()` on global `DB` while that transaction holds a lock.

### 6. Tests Required

- Extend `model/redemption_test.go`: single-use wallet and subscription grants, disabled/re-enabled plan, plan edits, purchase limits, concurrent CAS, rollback and user balance preservation.
- On isolated SQLite, MySQL and PostgreSQL, repeat fresh `AutoMigrate`; upgrade a representative schema created by the latest release twice and assert legacy ID/data, `quota` default, key uniqueness and `plan_id=0` remain. Run real transaction tests on each engine. Record versions and commands; a unit test or SQLite alone is not the matrix.
- Exercise the admin form and wallet result shape in frontend interaction tests, plus all supported i18n locales.

### 7. Wrong vs Correct

```go
// Wrong: `key` is reserved in MySQL and this predicate is not portable.
db.Where("key = ?", key).First(&code)
// Correct: GORM quotes the column for the active dialect.
db.Where(map[string]any{"key": key}).First(&code)
```
