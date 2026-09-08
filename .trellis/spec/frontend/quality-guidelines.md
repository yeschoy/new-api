# Quality Guidelines

> Code quality standards for frontend development.

---

## Overview

<!--
Document your project's quality standards here.

Questions to answer:
- What patterns are forbidden?
- What linting rules do you enforce?
- What are your testing requirements?
- What code review standards apply?
-->

(To be filled by the team)

---

## Forbidden Patterns

<!-- Patterns that should never be used and why -->

(To be filled by the team)

---

## Required Patterns

<!-- Patterns that must always be used -->

(To be filled by the team)

---

## Testing Requirements

<!-- What level of testing is expected -->

(To be filled by the team)

---

## Code Review Checklist

<!-- What reviewers should check -->

(To be filled by the team)

## Public pricing previews and savings estimates

### Scope / Trigger
Home-page pricing is an optional preview on a public page. Savings calculations
consume billing expressions, while sidebar sizing composes with Base UI state.

### Signatures
- `usePricingData(enabled, { publicPreview: true })` opts into home access handling.
- `getPricing(config?: ApiRequestConfig)` accepts request-scoped error policy.
- `buildSavingsCatalog(models, priceRate)` returns only supported estimates.

### Contracts
- Check fresh `HeaderNavModules.pricing` before a preview request; do not grant
  access from localStorage placeholder status. Keep preview queries separate
  from the authenticated catalog and partition by viewer identity.
- Preview 401 responses must not refresh the session or redirect the home page.
  Do not deduplicate a preview with a catalog request carrying another policy.
- Savings supports a complete optional `v1:` single `tier` with a sum of finite
  nonnegative `p`, `c`, `cr`, `cc` coefficients. Preserve explicit zero cache
  prices; absence alone means regular-input fallback.

### Validation & Error Matrix
| Condition | Behavior |
| --- | --- |
| Pricing disabled, anonymous private pricing, status unavailable | No pricing request |
| Permitted public or signed-in preview | Fetch and display models |
| Pricing access changes to 401 during request | Empty/error preview, no session rotation |
| Conditional, outer arithmetic, unsupported token dimensions | Exclude from estimator |
| Explicit `cr * 0` / `cc * 0` | Free cache, never regular-input fallback |

### Good / Base / Bad Cases
- Good: `tier("base", p * 10 + c * 20 + cr * 0)` preserves a free cache.
- Base: `tier("base", p * 10 + c * 20)` treats cache as regular input.
- Bad: `tier("base", p * 10 + c * 20) * 2` cannot use unscaled tier coefficients.

### Tests Required
- Real pricing hook + HTTP boundary: restricted access, stale cached status,
  sign-out, and policy changes after the status check.
- Savings: complete expression matching, zero vs omitted cache, finite prices.
- Real sidebar + stylesheet: expand/collapse/reopen in icon and offcanvas modes
  for sidebar, floating and inset variants. Expanded `inline-size` overrides
  must not match a collapsed gap and override the primitive's width utilities.

### Wrong vs Correct
- Wrong: infer estimator eligibility from `summary.tierCount === 1`; display
  summaries can omit zero entries and parse only part of the formula.
- Correct: validate the entire supported formula and retain term presence.
- Wrong: apply expanded `sidebar-gap` sizing regardless of `data-state`.
- Correct: scope expanded geometry to `data-state="expanded"`.


## Easy-console pricing, keys and reports

### Scope / Trigger
Landing/auth/catalog pricing, key quote/revoke flows, and easy-console reporting.

### Signatures and Contracts
- `buildModelCatalog(models, priceRate)` retains every PricingModel and exposes an optional supported estimator quote. Do not filter discoverable models by calculator eligibility.
- SavingsModel quote numbers already incorporate the recharge price. `formatPerMillionTokens` formats that local amount without applying another USD exchange conversion.
- `getFullApiKey(id)` reveals only through the dedicated endpoint, rejects masked results and normalizes the sk- prefix. Successful creation must refresh keys even when reveal fails.
- `revokeAllApiKeys()` collects all IDs before deleting bounded batches and verifies the final list is empty. Partial/error outcomes refresh the list and never show an all-revoked success.
- `useUsageSummary(7|10)` uses the authenticated complete summary. Requests keeps pagination; page-only filters are labeled. Home/wallet savings explicitly say 10 days. All three views share the same user/date/offset query cache; use a fixed current UTC offset so ten daily buckets stay within the API limit across DST changes.
- Request rows compare recorded charged quota against the same price with group multiplier 1 via `getLogQuotaComparison`. Use the logged positive user override before group ratio; preserve zero fees, exclude subscription cash comparisons, and show an unavailable mark for missing/invalid rates. Show above-base charges as a surcharge, not savings.
- `buildUsageReportCsv(rows)` exports numeric display amounts with a currency unit, or explicitly labeled raw quota in tokens mode.

### Validation & Error Matrix
| Input/state | Behavior |
| --- | --- |
| Group ratio/cache rate zero | Preserve free pricing |
| Selected model has no usable group | Disable creation and show an honest empty state |
| Model uses per-request/task/complex tier pricing | Keep it discoverable with a details link |
| Summary unavailable | Error/pending display; no fabricated zero totals |
| Empty/undiscounted auth catalog | Real data or empty state, no fallback marketing prices |
| Retired supplier section | No supplier form or sell-capacity navigation remains on the landing page |

### Good / Base / Bad Cases
- Good: priceRate=7 and displayed quote=7 yields ¥7, not ¥49.
- Base: an existing masked key gets an explicit copy action after reload.
- Bad: reuse the on/off translation for a percentage discount, or apply flex display to td elements.

### Tests Required
Cover 101-key revoke and incomplete deletion, reveal retry without duplicate creation, group changes/free pricing, all pricing modes, complete reports vs a paginated list, stream failures and currency export. Browser/DOM tests cover mobile anchor-close behavior, table-cell layout, visible rate comparisons and absence of retired supplier entry points.

### Wrong vs Correct
- Wrong: use catalog discount percentages to estimate savings for historical logs.
- Correct: use recorded-rate summary data from the backend.
- Wrong: use an icon identifier as img.src.
- Correct: use the existing icon renderer for identifiers; image URLs remain image sources.
