# Quality Guidelines

> Code quality standards for backend development.

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


## Console key identity and complete usage summaries

### 1. Scope / Trigger
Changes to easy-console key creation, request history or usage/savings reporting.

### 2. Signatures
- `POST /api/token/` -> success/message plus additive masked token `data`.
- `GET /api/log/self/summary?start_timestamp=<seconds>&end_timestamp=<seconds>&timezone_offset=<minutes>`.
- `model.GetUserLogSummary(ctx, userID, start, end, timezoneOffset)`.

### 3. Contracts
- Token creation returns the inserted ID and masked key via `buildMaskedTokenResponse`; full keys remain behind authenticated POST `/api/token/:id/key`.
- Summary binds identity to the authenticated user, not a query parameter. Its totals and daily rows expose requests, succeeded, failed, quota, tokens, saved_quota and comparable_requests. Daily rows include a YYYY-MM-DD date and are sorted descending.
- Scan the entire bounded LOG_DB window using GORM Rows/ScanRows and request context. Keep only day aggregates in memory; do not depend on optional/delayed QuotaData exports or SQL-vendor JSON/date functions.
- Failed consume streams still count toward charged quota/tokens. Stream error classification is separate from whether the row incurred a charge.
- Savings use recorded positive user_group_ratio before group_ratio, optional valid fee_quota, and exclude subscription/incomparable charges. Never reconstruct historical discounts from current model prices.

### 4. Validation & Error Matrix
| Condition | Result |
| --- | --- |
| Missing/malformed bounds, nonpositive start, reversed interval, interval > 30 days, offset outside -840..840 minutes | HTTP 400 |
| Database failure or 15-second request deadline | Error response; never a successful zero report |
| More than 100 logs in window | All rows contribute to summary |
| type=2 and stream_status.status=error | Failed request plus its charged quota |
| Missing/nonpositive multiplier or subscription | No manufactured savings |

### 5. Good/Base/Bad Cases
- Good: 101 consume rows and one charged failed stream are all billed and the stream contributes to failures.
- Base: ratio=1 yields zero savings even if the current catalog offers a cheaper group.
- Bad: aggregating one response page or using last-minute rpm/tpm as a month request count.

### 6. Tests Required
`controller/token_create_response_test.go` covers returned identity/masking/reveal. `controller/log_summary_test.go` covers 100+ rows, identity isolation, fixed-offset date boundaries, charged streams, multiplier precedence and invalid windows. Run relevant controller tests under `-race`.

### 7. Wrong vs Correct
- Wrong: return only success while the client immediately requires data.id.
- Correct: additive masked response data; clients still accept older success-only responses and refresh the list.
- Wrong: transfer every raw log to the browser to calculate reports.
- Correct: bounded server aggregation plus an independently paginated history list.
