# Partner Tenant Integration Modes

## 1. Scope / Trigger

Read before changing tenant creation, merchant/public admission, startup mode migration, security-proof context or tenant-management UI. This supersedes older same-tenant API/H5 coexistence promises. OAuth and pst_ wallet integration are separate. This seven-section organization preserves the existing mode policy; it does not authorize switching modes or claim runtime acceptance.

## 2. Signatures / API Boundaries

- `PartnerTenant.IntegrationMode`: varchar(24), NOT NULL, database default `subscription_key`. Only `subscription_key` / `hosted_h5` are supported. IdentitySource and order EntryMode stay external/subscription_key identity facts, not tenant policy.
- Root creation: a truly omitted `integration_mode` defaults before proof validation; explicit null/empty/unknown/legacy is rejected. `CreatePartnerTenant` is the default wrapper; `CreatePartnerTenantWithIntegrationMode` validates its explicit value independently.
- `partner_tenant.sensitive_write` create proof binds `{action,group,integration_mode}`. Rotation proof remains `{action,tenant_id}`. Consumption stays single-use. Status accepts only status; rotation accepts absent body or `{}`. No switch route or UI. Create ADMIN audit includes integration_mode among changed_fields; dedicated authorization-log events belong to the [audit contract](partner-authorization-audit.md), not this mode-policy owner.
- Model policy owner: `RequirePartnerTenantIntegrationMode` with catalog/subscription-key/H5/direct-order operations. Empty/unknown stored modes fail closed; do not normalize on runtime reads. Wrong authenticated merchant entry -> `ErrPartnerTenantIntegrationMode` -> 403 `integration_mode_mismatch`.
- `MigratePartnerTenantIntegrationModes(DB)` is the additive startup migration. `middleware.PartnerTenantFromContext` supplies the bearer-verified tenant for pre-handler admission; never serialize its SecretHash or bearer into audit.

## 3. Contracts

### Admission and authoritative locks

| Entry | subscription_key | hosted_h5 |
| --- | --- | --- |
| Tenant catalog | Allow | Allow |
| Subscription-key create/replay/get/claim/rotate | Allow | Deny |
| Independent sub_ query, after current binding validation | Allow | Deny |
| Merchant H5 session create/status; public launch/exchange/read/order | Deny | Allow |
| External account Key, quota and order-status support | Deny | Allow |
| Retired direct POST subscription-orders, including replay | Deny | Deny |
| Shared cashier, notify/return, accepted-order prepare/payment/fulfillment/binding/recovery | Mode-neutral | Mode-neutral |

- Route middleware is early rejection, not authority. Subscription-key operations recheck current pt_ plus mode under Tenant lock; H5 session mutation/replay validates current locked tenant/session mode/capability/secret/deadline. Public capability failures remain generic 401 invalid_purchase_access, not mode disclosure. Shared binding/fulfillment primitives must never inherit admission gating.
- H5 support getters use current pt_ under Tenant lock; quota reset shares that transaction. Shared internal getters remain neutral. H5 retains external_user_id. New subscription-key purchase has no buyer ID and remains paid-only provisioning with same-subscription renewal.

### Startup / migration / rollback

`MigratePartnerTenantIntegrationModes(DB)` runs BEFORE startup's broad AutoMigrate: normalize existing null/empty mode values before tightening NOT NULL, add the defaulted column on pre-column schema/fresh table, preserve explicit H5 on repeats, and keep unknown nonempty values denied rather than reclassifying. No account/order identity or paid facts are rewritten. Dedicated group uniqueness remains intact, including disabled tenants.

Rollback retains additive columns, identity/payment data and accepted orders. Old nodes do not enforce this policy; merchant admission cannot be safely served by a mixed fleet of old binaries. No production DDL/deployment is implied.

### UI and group selection

Default/reset subscription_key in dialog user-event handlers, not effects reacting to asynchronous tenant/group queries. H5 selection survives refresh. List displays stored mode and has no edit control. Proof and API payload send the same selected mode. Seven locales are script-written and synced. `/api/group` configured nondefault Chinese group names are available when not tenant-occupied; disabled tenants still occupy a group. Channel association is not a filtering input. This regression is not a reproduction/fix of the reported deployed screenshot.

### Safe audit handoff

`ErrPartnerTenantIntegrationMode` is the bounded classifier. Bearer-verified pre-handler tenant context may project only ID/mode, NEVER SecretHash/bearer. Scoped order/subscription references require successful owning model lookups; request path IDs alone are untrusted. Public H5 generic failures are not proof of a merchant. Independent sub_ unknown/malformed failures carry no tenant association. Safe committed transaction receipts and LOG_DB events are owned by the audit child; no synthetic OAuth IDs or temporary raw logs.

For the current `PartnerTenantAuditAdmissionError` wrapper, lock-time safe-principal capture, tenant-budget ordering, single request outcome and non-HTTP credential.issue status=0, follow [Partner Tenant Authorization Audit](partner-authorization-audit.md). The wrapper preserves errors.Is with the mode classifier; these audit metadata mechanisms do not relax admission or add a mode switch.

## 4. Validation / Error Matrix

| Condition | Required result |
| --- | --- |
| Creation omits mode | Normalize to subscription_key before proof validation |
| Explicit null/empty/unknown/legacy creation mode | Reject; never substitute a default |
| Empty/unknown stored mode | Fail closed at runtime; no read-time normalization |
| Verified pt_ uses a prohibited entry, including retired direct POST replay | 403 integration_mode_mismatch; no purchase/session/provisioning/gateway side effects |
| Public H5 invalid capability or incompatible current mode | Generic 401 invalid_purchase_access; no tenant disclosure |
| Credential/mode changes during body or lock wait | Recheck current locked authorization, not the earlier middleware snapshot |
| Status/rotation includes integration_mode | Reject extra field; do not silently imply mutation |
| Accepted-order cashier/payment/delivery/recovery | Remain mode-neutral; preserve payment and identity facts |

Existing credential/resource/parser errors remain owned by the [subscription-key](partner-subscription-key.md), [H5](partner-hosted-h5.md) and [paid checkout](partner-tenant-checkout.md) contracts; this matrix does not replace their checks.

## 5. Good / Base / Bad Cases

- Good: true omission creates subscription_key with a matching single-use proof; explicitly selected hosted_h5 retains external buyer sessions and support APIs. Both deny the retired direct purchase entry.
- Base: a stored H5 choice survives repeated migration and UI refresh; an already accepted paid order can still be delivered regardless of new-entry policy.
- Bad: defaulting unknown stored modes on reads, trusting pre-body admission for a later transaction, changing mode via secret/status operations, or applying an admission gate to shared payment/fulfillment.

## 6. Tests Required / Evidence Boundaries

Required runtime suite: `^TestPartnerTenantAccessMode` with explicit `TEST_PARTNER_ACCESS_AUDIT_POSTGRES_DSN`, only task-owned Docker/pq. Model TestMain bypasses SQLite for this selection. Coverage source includes fresh/pre-column/nullable/repeat preservation, policy denials/no side effects, paid subkey purchase/renewal, H5 support/late delivery, row-lock wait and slow-body checks, proof single-use/cross-mode and admin immutability. Existing payment tests use explicit H5 entry or clearly labelled historical accepted-order fixtures, not the retired API.

Current evidence: frontend focused DOM tests/typecheck and scoped lint pass; Go build/tests and pq runtime have NOT executed because task Docker daemon is unavailable. See child verification.md. Static/fixture source does not prove migration, startup or payment runtime. Cross-child log integration runtime acceptance remains pending; audit test sources and checks are described in the linked audit spec, not promoted to runtime passes here.

## 7. Wrong vs Correct

```go
// Wrong: middleware admission authorizes a later mutation, or shared payment
// delivery acquires the new-entry policy gate.
// RequirePartnerTenantIntegrationMode(staleTenant, operation)
// ...read slow body... then mutate using staleTenant.

// Correct: the actual entry transaction acquires current Tenant authority.
tenant, err := lockPartnerTenantAdmission(tx, tenantID, secretHash,
    PartnerTenantOperationSubscriptionKey)
if err != nil { return err }
_ = tenant // Continue the existing owning resource/credential checks under locks.
// Shared accepted-order payment/binding/fulfillment remains mode-neutral.
```

```ts
// Wrong: an asynchronous group/tenant refresh resets the user's H5 choice.
// useEffect(() => setIntegrationMode('subscription_key'), [tenants, groups])

// Correct: default/reset on explicit dialog user events; submit the same mode
// in both verification context and create payload. Stored mode stays read-only.
changeCreateOpen(false)
```
