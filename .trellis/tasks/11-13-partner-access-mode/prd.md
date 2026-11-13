# 商户接入方式必选与后端隔离

## Goal and source requirements

Child of `../11-13-partner-access-mode-audit/`. The parent PRD is the authoritative source of R1-R6 and cross-child acceptance. This child owns R1/R2/R4/R6 and the access-mode portion of R3/R5.

Make merchant creation select exactly one integration mode, defaulting to the recently delivered buyer-ID-free Subscription Key API. Only explicitly choosing hosted H5 enables H5. Enforce the choice at the backend rather than treating it as a UI preference.

## Evidence

See parent `research/current-boundaries.md`, sections 1-3. Current pt_ tenant creation accepts name/group only; all three purchase entries coexist. Hosted H5 still requires external_user_id; the new subscription-key API does not. Neither changes dedicated group or tenant plan ownership.

## Requirements

- User-approved creation options are exactly buyer-ID-free Subscription Key API and hosted H5, mutually exclusive. Hosted H5 retains its external_user_id requirement; old external API and legacy compatibility are not selectable modes.
- The user reports no current merchants and requests Subscription Key as the default for all. Default the creation UI and omitted create-mode field to subscription_key; database defaults/backfill use the same policy. Reject unknown or explicitly empty values rather than falling back. Do not delete, relabel identity sources, or rebind any stored accounts/orders based on the reported deployment state; no production DB inspection is authorized.
- Authorized shared functions and merchant plan isolation remain available; prohibited purchase entry cannot be bypassed by calling its route directly or by existing public H5 capabilities.
- Credential issuance/account lookup must not bypass selected identity/entry boundaries.
- Existing accepted payments, shared cashier/notifications, order lookup and retry delivery remain safe under the approved compatibility rules.
- Root permissions, single-use sensitive-write proof, no-store handling and existing admin audit are preserved.
- Provide a safe, structured wrong-mode denial event for the audit child to consume; never include credentials or invent a tenant/user association.
- Frontend descriptions and protocol/spec docs accurately state which mode requires external_user_id and which does not.

## Acceptance criteria

- M-AC1 (parent AC1): the form defaults to Subscription Key and an omitted create-mode field produces subscription_key; only explicit H5 chooses H5. Reject unknown/explicitly empty/legacy-mode values. Each of the two valid modes persists and appears in admin list/details.
- M-AC2 (parent AC1): direct HTTP calls to disallowed new-purchase/account/session entries fail without creating users, orders, sessions, payment preparations or credentials.
- M-AC3 (parent AC3): allowed buyer-ID-free new purchase, same-subscription renewal and paid-only provisioning retain their existing contracts and dedicated group.
- M-AC4 (parent AC5): fresh and repeat additive migrations apply the subscription_key default/backfill policy without a legacy mode, retain accounts/orders/paid evidence, preserve any already stored explicit H5 mode, and do not interrupt shared accepted-payment delivery.
- M-AC5 (parent AC2/AC4): a denied wrong-mode request produces only allowlisted audit metadata and is locatable in the existing authorization-log UI after child integration.
- M-AC6: all seven locales cover added UI labels and the frontend cannot misrepresent a stored mode or offer a forbidden choice.

## Dependencies and integration order

- The two new-tenant options and subscription_key default/no-legacy-mode policy are confirmed; post-creation mode-change policy still awaits the user's decision.
- Authoritative mode/denial contract precedes the audit child's wrong-mode event integration, irrespective of parent/child tree ordering.
- Audit projection/schema work can be implemented independently after its own planning approval, but this child's integration is not complete without parent wrong-mode logging acceptance.

## Out of scope

No changes to ordinary OAuth consent, pst_ wallet integration, ordinary billing algorithms, payment truth, real provider/production operations, or private-key/temporary-file cleanup.

## Blocking product decisions

Two options and the subscription_key default/no-legacy-mode policy are resolved in parent R2/R6. Post-creation mode-change policy remains unresolved; the user's no-existing-merchants statement does not approve mutable or immutable modes. Do not invent a compatibility mode.

## Artifact status

Planning PRD only. Design/implementation plan/context pending product decisions and subsequent final-review approval. Do not run task.py start.
