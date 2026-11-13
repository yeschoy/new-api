# 商户接入方式必选与后端隔离

## Goal and source requirements

Child of `../11-13-partner-access-mode-audit/`. The parent PRD is the authoritative source of R1-R5 and cross-child acceptance. This child owns R1/R2/R4 and the access-mode portion of R3/R5.

Make new merchant creation require exactly one intended integration mode, including the recently delivered buyer-ID-free subscription-key API. Enforce the choice at the backend rather than treating it as a UI preference.

## Evidence

See parent `research/current-boundaries.md`, sections 1-3. Current pt_ tenant creation accepts name/group only; all three purchase entries coexist. Hosted H5 still requires external_user_id; the new subscription-key API does not. Neither changes dedicated group or tenant plan ownership.

## Requirements

- Mode choices and wording must match the final user-approved product decision; never conflate the new API with the old external identity API.
- Creation has no silent fallback when an explicitly required mode is missing/unknown; returned admin state shows the persisted choice.
- Authorized shared functions and merchant plan isolation remain available; prohibited purchase entry cannot be bypassed by calling its route directly or by existing public H5 capabilities.
- Credential issuance/account lookup must not bypass selected identity/entry boundaries.
- Existing accepted payments, shared cashier/notifications, order lookup and retry delivery remain safe under the approved compatibility rules.
- Root permissions, single-use sensitive-write proof, no-store handling and existing admin audit are preserved.
- Provide a safe, structured wrong-mode denial event for the audit child to consume; never include credentials or invent a tenant/user association.
- Frontend descriptions and protocol/spec docs accurately state which mode requires external_user_id and which does not.

## Acceptance criteria

- M-AC1 (parent AC1): missing/invalid selection rejected; each valid new-tenant mode persists and appears in admin list/details.
- M-AC2 (parent AC1): direct HTTP calls to disallowed new-purchase/account/session entries fail without creating users, orders, sessions, payment preparations or credentials.
- M-AC3 (parent AC3): allowed buyer-ID-free new purchase, same-subscription renewal and paid-only provisioning retain their existing contracts and dedicated group.
- M-AC4 (parent AC5): the approved old-tenant migration preserves accounts/orders/paid evidence and continues accepted payment delivery; repeats of migration are safe.
- M-AC5 (parent AC2/AC4): a denied wrong-mode request produces only allowlisted audit metadata and is locatable in the existing authorization-log UI after child integration.
- M-AC6: all seven locales cover added UI labels and the frontend cannot misrepresent a stored mode or offer a forbidden choice.

## Dependencies and integration order

- Planning remains blocked on the parent's mode-choice/compatibility decisions.
- Authoritative mode/denial contract precedes the audit child's wrong-mode event integration, irrespective of parent/child tree ordering.
- Audit projection/schema work can be implemented independently after its own planning approval, but this child's integration is not complete without parent wrong-mode logging acceptance.

## Out of scope

No changes to ordinary OAuth consent, pst_ wallet integration, ordinary billing algorithms, payment truth, real provider/production operations, or private-key/temporary-file cleanup.

## Blocking product decisions

Inherit parent decisions: exact new-tenant options, old-tenant compatibility, and whether a tenant may change mode after creation. No defaults selected by the implementation agent.

## Artifact status

Planning PRD only. Design/implementation plan/context pending product decisions and subsequent final-review approval. Do not run task.py start.
