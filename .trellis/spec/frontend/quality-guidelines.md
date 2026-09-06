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
