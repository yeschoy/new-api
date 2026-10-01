# Subscription Group Billing

## 1. Scope / Trigger

Use this contract when changing subscription plan configuration, group routing, quota reservation, settlement/refund, or user-facing subscription scope. A plan's spending restriction is separate from a user's authorization group: `UpgradeGroup` may grant access, but does **not** define where plan quota can be spent.

## 2. Signatures

- `SubscriptionPlan.ApplicableGroup string` → JSON `applicable_group`, DB `varchar(64) NOT NULL DEFAULT ''`. Empty means all accessible groups. `SubscriptionPlan.UpgradeGroup` remains independent.
- `SubscriptionPreConsumeRecord.BillingGroup` and `.ApplicableGroup` → original actual request group and original plan scope, each `varchar(64) NOT NULL DEFAULT ''`. The existing unique `request_id` and pre-consumed amount remain intact.
- `PreConsumeUserSubscription(requestId string, userId int, modelName string, group string, quotaType int, amount int64)` selects one active subscription. `SubscriptionPreConsumeResult.ApplicableGroup` reports the reserved scope; `RelayInfo.SubscriptionApplicableGroup` carries it across retries.
- `NewBillingSession` reads `RelayInfo.UsingGroup` (the resolved actual group). `RelayInfo.AllowsBillingGroup(group)` guards HTTP/task and Responses WebSocket retries.
- `GET /api/subscription/self` returns `SubscriptionSummary.ApplicableGroup` from the **current** plan, even for an active subscription whose plan is now disabled. Admin create/update and public plan responses carry `applicable_group`.

## 3. Contracts

- A nonempty applicable group must name a configured real group, not virtual `auto`. It is a funding filter, **not** a permission grant or channel ID filter. One group may have multiple channels and a channel may belong to multiple groups. The token selects the request group; an empty token group uses the user's current group. For `auto`, pricing/billing uses the selected real group, never the literal `auto`.
- Only a plan with empty `ApplicableGroup` or one exactly matching the actual billing group can fund a request. Among matching active subscriptions, use the earliest-ending one that covers the entire reservation; do not split across plans. A missing plan, unreadable DB, or unresolved actual group is an error, not an unrestricted/wallet fallback.
- `subscription_first`: with no active or no matching subscription, try wallet; if matching subscriptions exist but lack quota, fall back only when **all matching** subscriptions allow wallet overflow. An unrelated strict plan must not block wallet. `subscription_only`: never use wallet. `wallet_first` and `wallet_only` preserve wallet priority/restrictions. Settlement, additional reservation, refund and logs retain the initially chosen funding source/subscription ID.
- Admin plan edits affect **future requests of existing subscriptions immediately**, not already reserved/settled requests. Select the current plan within the reservation transaction; bypass stale plan cache for spending decisions. Clear `applicable_group` to restore unrestricted funding; existing released plans/rows migrate to empty without changing their entitlement.
- For idempotency, check user and actual group on every replay and return the recorded scope rather than the current plan's scope. Old records without an original group may replay only while their current plan is unrestricted. Serialize same-user reservations by locking active subscription rows, then use `lockForUpdate(tx)` to re-read the request ID before normal unique-key insert. This locking read is needed after an earlier MySQL repeatable-read snapshot; an unexpected unique conflict rolls back. **Do not infer successful insertion from** `OnConflict{DoNothing}` `RowsAffected`: MySQL `clientFoundRows=true` can count a no-op conflict update as affected and double charge.
- A restricted live reservation cannot be sent to another group on retry. Check before upstream submission; unrestricted subscriptions and wallet funding can retain prior cross-group retry behavior.
- Admin UI uses the existing Combobox; listing, purchase confirmation and active subscription UI distinguish current applicable group from upgrade group and display an explicit unrestricted label. Translate new copy in all seven locales via `web/scripts/add-missing-keys.mjs` and `bun run i18n:sync`.

## 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| Unknown/virtual `applicable_group` in admin create/update | Reject on server; no plan mutation |
| Request group does not match the only active restricted plan | Never debit that plan; `subscription_first` tries wallet, `subscription_only` rejects |
| Matching plan exhausted, strict overflow disabled | Reject without debiting wallet or another group's plan |
| `auto` resolves to another group, or restricted retry selects another group | Do not debit restricted plan / do not submit cross-group retry |
| Duplicate request ID from another user/group | Reject; no second charge or switched source |
| Pre-upgrade record with unknown group after plan becomes restricted | Reject replay (fail closed) |
| Admin changes plan group after a reservation | New requests follow new scope; existing reservation and replay keep recorded scope |
| DB read/migration error | Surface error; never classify it as normal no-match and fall back |

## 5. Good / Base / Bad Cases

- Good: a `deepflash`-scoped plan funds two channels in `deepflash`; a request to `default` uses wallet when appropriate, even if the unrelated plan has `AllowWalletOverflow=false`.
- Base: a released plan with `ApplicableGroup=''` retains its unrestricted quota across accessible groups; a new unrestricted plan behaves the same.
- Bad: using `UpgradeGroup`, model name, or channel ID to decide subscription funding; letting a cross-group retry use an already reserved restricted plan; interpreting MySQL's conflict `RowsAffected` as proof of insertion.

## 6. Tests Required

- `model/subscription_group_test.go`: real SQLite/MySQL/PostgreSQL fresh and release-shaped old plan **and pre-consume table** upgrade twice; assert legacy ID, amount, defaults, indexes and unique `request_id`; verify group eligibility, earliest adequate plan, admin edits, replay/user/group mismatch and one-charge concurrent duplicate. Run MySQL with `clientFoundRows=true` as well.
- `service/text_quota_test.go` (`TestSubscriptionGroupFundingPreferences`): four preferences, unmatched strict plan, matching insufficiency, token rollback, wallet isolation, unrestricted legacy plan on real three engines.
- `controller/channel_pin_retry_test.go` (`TestAutoGroupSubscriptionFundingAndRetryRouting`): real auto selection and group propagation through billing, cross-group retry refusal and refund, pinned routing. `relay/common/relay_info_test.go` checks the retry predicate. Retain WebSocket retry guard when changing that path.
- All local DB tests—including SQLite—run inside **task-owned disposable Docker containers**. Record actual server versions and unskipped results; test fresh/upgrade/repeat migrations against the supported engine families and minimum-version behavior where version-sensitive. Stop/remove task-owned resources only after user approval.

## 7. Wrong vs Correct

```go
// Wrong: "has any active plan" is not proof this request can spend that plan,
// and a successful no-op conflict UPDATE need not have inserted a record.
if hasAnySubscription && insert.RowsAffected > 0 {
    sub.AmountUsed += amount
}

// Correct: lock user subscriptions, re-read the key with a locking/current
// read, then filter the current plan by the resolved request group. Rely on
// the unique request ID and transaction rollback, not conflict row counts.
subs := lockForUpdate(tx).Where("user_id = ? AND status = ? AND end_time > ?", userId, "active", now)
_ = subs.Find(&candidates)
_ = lockForUpdate(tx).Where("request_id = ?", requestId).Limit(1).Find(&existing)
// Replay a matching original record, or insert one new scoped record in tx.
```
