# Design: merchant integration mode admission

## 1. Authority and boundary

Read parent `../11-13-partner-access-mode-audit/design.md` sections 2-4 for the authoritative field/proof/route/migration contracts. This child implements those contracts; it does not create a legacy mode, expose another purchase path, change buyer identity facts, or implement a mode switch. User approved immutable mode after creation.

## 2. Owned schema and creation flow

- `PartnerTenant.IntegrationMode` / `integration_mode`: varchar(24), NOT NULL, default subscription_key, enum subscription_key / hosted_h5.
- Effective creation mode: missing -> subscription_key; explicit empty/null, unknown and legacy/external rejected. UI always sends its defaulted/selected string. Use a presence-aware decode for this field; do not let `*string` null silently equal omission.
- Central model enum/validator and helper make operation policy auditable. Do not default unknown stored values on read; migration only normalizes missing/NULL/empty historical values.
- UI create -> normalized mode -> single-use proof `{action,group,integration_mode}` -> controller parse/validation -> proof -> validated model create -> admin DTO/audit -> list mode label.
- Existing `CreatePartnerTenant(name,group)` can retain a default wrapper over an explicitly named mode-aware creator, avoiding scattered zero-value assumptions in fixtures/callers. No import cycle or variadic optional mode that conflates invalid and omitted.
- Secret rotation and status operations accept only their existing allowed fields; attempts to submit integration_mode are rejected without state change. No update-mode route. Secret rotation does not change mode.

## 3. Admission implementation

Define one error `ErrPartnerTenantIntegrationMode` translated to 403 integration_mode_mismatch on merchant APIs. Model helpers own exact operation policy; middleware consumes the same policy for an early check but is not mutation authority.

1. Tenant-scoped catalog remains shared.
2. New subscription-key create/replay, get, claim, rotate and independent query require subscription_key at their external entry, using locked/current tenant for transaction operations. Do not add the check to the low-level binding primitive used by already-accepted paid delivery.
3. Merchant session create/get and public H5 exchange/read/order require hosted_h5. Public capability failures remain generic; only proven capability identity may supply audit references.
4. H5 has allowed auxiliary `PUT /accounts`, quota and external order GET, keeping original external identity filtering. These support merchant delivery but do not grant permission to direct purchase.
5. Legacy direct `POST /subscription-orders` is denied for both modes before its fast idempotency lookup/gateway preparation. Keep the transaction-scoped external order core for the guarded H5 call; prevent any public wrapper from becoming a second admission route. Do not use a caller-supplied boolean/header to claim H5 authority.
6. Shared cashier, gateway notification/return, internal prepare/read, payment recording and fulfillment/recovery are not blanket mode-gated. Respect order.EntryMode, tenant enablement and existing binding/plan invariants.

Keep current locks Tenant -> session/order -> plan/account/etc., no new I/O under transactions. Slow-body/row-lock tests must show stale tenant or capability prechecks do not authorize a forbidden mutation. Runtime mode immutability through admin does not justify trusting a stale object when the model already has a current tenant lock.

## 4. Mode denial and audit handoff

The mode child exposes bounded error classification and authenticated tenant facts only. The audit child will attach it to a safe auth.denied event (parent design section 5). Do not introduce a temporary raw log, duplicate audit table or synthetic client ID while waiting for the audit child. Cross-child M-AC5 completes only after real log integration.

## 5. Startup migration and defaults

Add a focused `MigratePartnerTenantIntegrationModes(db)` (or equally explicit helper) called by real main migration and fixtures. AutoMigrate/add column plus missing/empty normalization is non-destructive, preserves hosted_h5 on rerun and leaves other identity/order fields untouched. Unknown nonempty values fail runtime admission, not silently reset to default. Verify pq actual fresh/pre-column upgrade/repeat and data preservation using task-owned schemas; do not invoke all application migrations as a substitute for this affected helper.

Default and mode-aware fixtures must be explicit: existing tests that depend on free-mixing external/H5 endpoints are no longer asserting the intended purchase policy. Update representative expectations/tenant construction rather than weakening scoped identity/paid recovery assertions. Keep shared driver support but pq is the required runtime engine.

## 6. UI and documentation

Extend existing `PartnerTenantsManager` create dialog/list and typed API. Use existing shadcn Select/items conventions, no dependency installation. Mode label and concise identity descriptions; default/reset subscription_key, H5 selection survives background list/group updates. List is read-only for mode. New labels and error descriptions go through i18n skill script and sync for all seven locales.

Update affected docs (`partner-subscription-key-api.zh-CN.md`, `partner-hosted-h5.zh-CN.md`, old tenant API/integration guidance as needed) and specs only to actual implemented policy. Replace now-false same-tenant simultaneous API/H5 promises; retain H5 external_user_id requirement and distinguish permitted account/status support from denied direct order creation. Do not change ordinary OAuth/pst_ descriptions.

## 7. Rollout/rollback and tests

Parent design sections 4/7 govern rollout and verification. Minimum standalone evidence: pq default/migration/create proof policy, both-mode route/model denials with zero forbidden writes/preparation, one allowed buyer-ID-free paid flow/renewal and one allowed H5 session/order/support flow, current-secret/lock boundaries and cashier/paid recovery safety, admin immutability/UI/i18n tests. Build/static checks alone do not prove persistence or authorization.

Rollback retains column/default, explicit mode values and all paid/identity data. An old binary cannot enforce policy; no mixed-version safety claim. Deployment and cleanup are not authorized by this plan.
