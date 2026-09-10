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

- Shared console chrome resolves the active mode with `useConsoleMode`: operator-only paths render developer controls even when the saved preference is easy. Choosing easy on those paths navigates to the easy overview; choosing developer from the easy report opens model analytics. Keep the mode control in the terminal header and use authenticated chrome for signed-in catalog/detail/guide pages.
- Every request row opens the same accessible details sheet. Read billing and usage facts from the selected log; never query current model prices to fill historical gaps. Preserve trigger focus and hide operator diagnostics from the easy sheet.
- Recorded fee quota remains the charged amount even without a valid comparison multiplier. Subscription and violation-fee logs must not invent cash savings. Unit prices are explicitly labeled as pre-discount rates per million tokens; variable dynamic prices remain labeled as dynamic.
- Developer price comparisons use the "Official price" label with a tooltip explaining that values are recorded-base estimates, not independently verified provider prices. Recognized overseas model families display the native official USD amount; domestic and unknown families display CNY. Keep the actual site charge in CNY and compute discounts after converting the overseas reference at `OFFICIAL_PRICE_USD_TO_CNY = 6.75`. Use the unrounded amount for this conversion and do not apply the recharge price to the native USD number. Currency recognition follows the same model-family resolver as the model badge; no official-price feed is implied.
- Per-request billing (`isPerCallBilling(other.model_price)`) does not show original-price or savings comparisons in developer cost cells, easy request rows, or request details. Preserve the actual charge and any subscription/tool-surcharge indicators.
- Configured cache-write ratios, including zero, are displayed even when no cache was written. Claude's recorded 5-minute and 1-hour rates remain separate. Missing historical rates are not filled from current catalog settings.
- Do not display an unconnected reserved-balance metric as a hardcoded zero.

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

## Preload-safe authentication navigation

### Scope / Trigger
Authentication guards, legacy URL redirects, and asynchronous profile writes.

### Signatures
- `createInternalRedirect(href: string)` accepts an already validated internal path.
- `auth.setUser(user, expectedSessionId?)` updates the current authenticated profile;
  only `setBundle` establishes authentication.

### Contracts
- Internal guard redirects must provide `to`, parsed `search`, and `hash`. In the
  installed router, `preloadRoute` does not resolve href-only redirects like
  `navigate` does: sign-in can repeatedly preload itself and starve the UI thread.
- Keep intent preloading enabled. Preserve validated return queries, typed search
  values, and fragments through the shared redirect helper.
- Sign-in/sign-up and protected routes must agree that both user and access token
  are required before redirecting an already-authenticated visitor.
- Non-null profile updates require a current token, session, and matching user ID.
  Async callers pass the session ID captured before their request so a late
  response cannot affect a later session, including the same account signing in again.

### Validation & Error Matrix
| Condition | Expected behavior |
| --- | --- |
| Authenticated sign-in preload | Finishes at the validated return target or dashboard |
| User remains without a token | Auth pages remain accessible, no redirect bounce |
| Legacy URL preload | Reaches its mapped target, not the home-page fallback |
| Profile response after sign-out/account or session switch | Does not restore or replace the current user |
| Profile response for the current session | Updates profile while preserving credentials |

### Good / Base / Bad Cases
- Good: `/keys?page=2&tags=["text"]#recent` keeps its typed search and fragment.
- Base: signed-in `/sign-in` preloads the dashboard once; anonymous sign-in remains a form.
- Bad: `redirect({ href: '/dashboard' })` from sign-in with intent preloading enabled.

### Tests Required
- Exercise the actual route guards through a real router's `preloadRoute`, with a
  bounded failure guard so regressions cannot hang the test runner.
- Cover anonymous, complete, and residual-user authentication states, legacy
  targets, query/fragment preservation, and stale profile response transitions.
- Verify desktop/mobile login clicks and continued navigation/scrolling in-browser.

### Wrong vs Correct
```ts
// Wrong for a route guard: the preload path does not interpret href.
throw redirect({ href: validatedTarget, replace: true })
// Correct: normalize the trusted path into router navigation fields.
throw createInternalRedirect(validatedTarget)
```
