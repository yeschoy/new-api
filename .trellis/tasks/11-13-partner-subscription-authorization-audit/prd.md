# 订阅 Key 接入授权日志与后台查询

## Goal and source requirements

Child of `../11-13-partner-access-mode-audit/`. The parent PRD owns the source requirements. This child owns R3/R5, with R1/R2/R4/R6 used as authorization and default-mode boundaries.

Expose safe, tenant-correlated authorization/credential events for the new buyer-ID-free subscription-key integration in the existing admin authorization-log UI, without pretending these are OAuth consent events or asking merchants to supply user IDs.

## Evidence

See parent `research/current-boundaries.md`, section 4. Existing safe log/action allowlists and frontend only cover OAuth/older partner server/account events; tenant admin actions use a separate security audit. Current log filters do not include tenant references, and ClickHouse migration needs explicit existing-table treatment if fields are added.

## Requirements

- Add a clear tenant event namespace and truthful event semantics; no synthetic OAuth client/binding identifiers or external buyer IDs.
- Associate trusted merchant, order, subscription and internally created user identifiers only where actually known. Failed unknown credentials cannot be attributed to an attacker-supplied target.
- The user approved the complete security-event scope: paid provisioning/credential issuance, Subscription Key claims/rotations, authentication failures and wrong-mode denials, plus every successful independent subscription query. Successful expired-subscription/history queries also count even though they omit Coding API Key; log only metadata, never the returned credentials. Higher log volume from successful reads is an accepted trade-off.
- Keep a bounded metadata-only projection: no raw pt_/sub_/sk_, headers, request/response bodies, query secrets, seeds, secret hashes, or capability URLs.
- Extend existing admin query/list/filter capabilities and labels without weakening authorization or exposing cross-permission data through shared caches.
- Preserve existing OAuth/server logs and current tenant security admin audit; do not replace them with misleading events.
- Business payment/provisioning state and log persistence must not be coupled in a way that rolls back durable paid evidence or duplicates delivery. Final log reliability policy and idempotent event behavior belong in design review.
- Match existing main/log database separation and supported log backends; migration of historical logs must be additive and repeatable.

## Acceptance criteria

- L-AC1 (parent AC2): every successful independent subscription query (active/exhausted/expired), credential issuance/claim/rotation and approved denial event has a safe record. Trusted tenant events are filterable by tenant reference, event, result and time without OAuth-only identifiers; failed unknown credentials do not invent tenant attribution.
- L-AC2 (parent AC4): invalid log actions/reasons/identifiers and duplicate/unknown filter fields are safely rejected; no secret appears in log storage, errors or admin DTOs.
- L-AC3 (parent AC2/AC3): credential claims and rotations have accurate success/failure results; signing/claim retries do not create duplicate business effects.
- L-AC4 (parent AC1/AC2): wrong-mode denial from the mode child is visible with the correct merchant when authenticated, safe route template/request ID and reason, with no unintended business side effects.
- L-AC5: existing OAuth/server/account logs, access control, pagination and query cache isolation remain unchanged; new UI text covers all seven locales.
- L-AC6: relevant log-backend fresh/upgrade/repeat migration behavior is demonstrated or explicitly reported as unverified; no full acceptance claim from static checks alone.

## Dependencies and integration order

- Event scope and success-read frequency are approved in parent R3; any mode-switch implications depend on resolving parent D2b before final planning approval.
- Tenant-auth/credential-event projection can proceed independently of mode implementation after approval.
- Wrong-mode event wiring and tests depend on `../11-13-partner-access-mode/` defining the authoritative persisted mode/denial contract first.
- Parent integration must exercise denied API -> safe event -> admin query/filter end to end. Parent/child linkage does not by itself express this ordering.

## Out of scope

Not a general model usage/request-body log, not a new payment reconciliation service, not OAuth consent redesign, and no plaintext secret export. No production/payment calls, real-data cleanup, or global frontend/backend test sweep.

## Blocking product decisions

Complete event scope, including every successful independent query, is approved. Only parent D2b (whether mode can change after creation) remains a product blocker. No legacy merchant mode is needed: the user reports no existing merchants and requires subscription_key defaults. Existing OAuth/server/account log history must nevertheless be preserved. Existing log failure-isolation semantics are current behavior, not a new user-approved reliability guarantee; make the proposed reliability guarantees explicit in the final design review.

## Artifact status

Planning PRD only. Design/implementation plan/context pending product decisions and subsequent final-review approval. Do not run task.py start.
