# Design: configurable cashback auto-review risk gates

## Boundaries and flow

Root Billing & Payment form → `PUT /api/cashback/config` → `UpdateCashbackSettingAtomic` locks the version Option, merges omitted fields and validates/serializes a bounded allowlisted flag array → payment-time `loadCashbackSettingTx` → `buildCashbackRiskSnapshotTx` → payer positive-reward review decision → immutable config/risk JSON snapshots + pending/approved reward → existing manual approval or issue path. Public offers and payer preview never include policy/flags.

## Configuration contract

- Add an optional `auto_review_risk_flags` field to the config (`null` on GET = not configured; `[]` = explicitly configured, no flags; nonempty = chosen flags). Keep omission in PUT distinct from an explicit `[]`. Reject explicit JSON `null`, malformed type, unknown/duplicate values and excessive bytes/length with `400` + field name; canonicalize storage order and preserve `[]` as non-nil. Validate again when loading stored Options. A missing new Option key remains missing on unrelated writes, including old-client PUT; no implicit migration on first read/write.
- A single bounded registry owned by the backend enumerates all 23 emitted flags (22 in `model/cashback_risk.go` plus `open_debt` appended for debt cancellation in `model/cashback_rewards.go`). Return it as Root-only `available_auto_review_risk_flags` alongside config for a backend-sourced form catalog. All codes have existing `t(flag)` locale keys. Test/inspect emission vs registry parity; future risk flags must be deliberately registered to be selectable.
- Stop using/exposing the four review-level settings for new decisions; do not delete existing Option rows or alter historical reward JSON snapshots. Old PUT payloads may still include deprecated fields; ignore them. Keep the existing master and immediate-issue switches. Every actual config update increments the version and records field changes in audit as today.
- `SaveCashbackSetting` used by tests retains missing-vs-empty semantics; do not serialize a missing key as `null` or `[]` and accidentally arm the policy.

## Review decisions and explanations

- For a new positive payer reward: master off → pending; master on but policy unconfigured → pending; configured policy with any intersection of selected/observed flags → pending; otherwise approved as today (immediate issue only if configured, approved and that switch is enabled). All cases still respect cancellation/debt and eligibility checks before this branch. Inviter remains manual. Risk level remains calculated and displayed as evidence, but does not itself decide review.
- Snapshot the decision gate (`master_disabled` / `policy_unconfigured` / `selected_flags` / `automatic`) and the exact matching flag codes into risk JSON on newly generated payer rewards. Display the reason and matched flags in Admin detail; do not confuse the overall `risk_flags` (all observed evidence) with matching policy flags. Historic JSON without these properties remains readable. No new reward columns or backfill.
- `open_debt` appears in the complete option catalog but under present rules is appended only to canceled zero rewards; selecting/deselecting it cannot bypass the debt hard block. Other cap-related flags may coexist with a positive capped reward and thus participate in review. No flag ever becomes a payment/authentication or wallet-fence bypass.

## Frontend UX

- Reuse the existing Root form layout, FormField, `Checkbox`, Alert, confirmation dialog and save action; no new generic UI component. Render all backend-provided risk options as accessible independently labeled checkboxes with `t(flag)`. Remove the four risk-level switches from this form. Keep the review master and immediate-issue controls.
- Unconfigured `null` shows an explicit all-manual notice and a deliberate 'activate per-flag policy' control. Saving unrelated settings while still unconfigured omits the new field. An explicit activation, including an empty selection, submits `[]`; transitioning to (or saving changes with) an empty active selection triggers a clearly worded confirmation before sending. If the master is off, saving configuration is allowed but no auto-approval occurs. The form must allow activating an empty list without requiring a dummy field edit.
- The existing Admin detail renders risk evidence; add a distinct short section for auto-review routing using snapshot decision/matched codes. Keep sensitive detail's existing audited fetch/cache lifecycle and permission boundaries; no bulk review or new endpoint.

## Compatibility / rollout / rollback

- No schema/table migration: Option key absent is the conservative rollout state. Existing low/high/severe Option values become inert but remain stored for rollback/data retention; historical snapshots remain unchanged. Old clients omitting `auto_review_risk_flags` cannot configure an unconfigured policy or erase a configured one. API responses no longer require old level fields.
- On deployment before Root activation, even formerly automatically approved positive payer rewards go to manual review, potentially increasing queue size. Communicate this operational change to Root; activating an empty list can expand auto-approval and must be confirmed. Rollback may restore old four-band behavior from retained Option keys; rewards created under the new policy remain immutable and must be handled via normal review/settlement.
- Option transaction/read behavior must be verified on real SQLite/MySQL/PostgreSQL in task-owned isolated Docker. No host database service. Avoid changing payment/settlement transaction boundaries.
