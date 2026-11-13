# Approved source checkpoint commit and branch push

The user confirmed this exact commit scope and additionally authorized pushing the current branch with “提交推送”. Push only `feat/partner-accounts` to its existing `origin/feat/partner-accounts` upstream, without force. This authorization does not cover deployment, task archival, production operations or temporary-resource cleanup.

## Commit

`feat(partner): checkpoint exclusive access modes and authorization audit`

Proposed body:

```text
Default tenant admission to immutable subscription_key or explicit hosted_h5.
Add metadata-only credential lifecycle/access audit and admin filtering.
Preserve mode-neutral accepted-payment delivery and dedicated group uniqueness.

Frontend evidence: 7 tenant + 12 authorization-log DOM tests, typecheck,
scoped lint/format and seven-language script coverage passed.
Independent source reviews fixed locator logging and current-mode metadata.

Checkpoint only: Go build/test/vet and PostgreSQL runtime NOT RUN because
Docker daemon was unavailable. Mandatory migration/integration gates remain
open; full-site frontend lint baseline still fails. No deployment.
```

One coherent checkpoint contains both child deltas because model/router/proof/locales/specs are shared and the audit implementation directly depends on the new mode contract. This saves the reviewed source state, NOT full acceptance. Both children remain in_progress. Do not archive or invoke finish-work's mandatory archive path while runtime gates are open.

The 87 work/record paths below plus this commit-plan.md are the exact proposed 88-file commit scope. Existing unchanged planning files need no restaging. Before execution recheck exact modified/new path membership and staged set; do not use git add . or force-add whole ignored directories. Force-add only explicit Trellis paths.

## Exact included paths

```text
.trellis/spec/backend/index.md
.trellis/spec/backend/partner-authorization-audit.md
.trellis/spec/backend/partner-hosted-h5.md
.trellis/spec/backend/partner-integration-mode.md
.trellis/spec/backend/partner-subscription-key.md
.trellis/spec/backend/partner-tenant-checkout.md
.trellis/tasks/11-13-partner-access-mode-audit/commit-plan.md
.trellis/tasks/11-13-partner-access-mode-audit/implement.md
.trellis/tasks/11-13-partner-access-mode-audit/prd.md
.trellis/tasks/11-13-partner-access-mode-audit/verification.md
.trellis/tasks/11-13-partner-access-mode/audit-handoff-fingerprint.json
.trellis/tasks/11-13-partner-access-mode/implement.md
.trellis/tasks/11-13-partner-access-mode/implementation-report.e3095490.md
.trellis/tasks/11-13-partner-access-mode/implementation-report.md
.trellis/tasks/11-13-partner-access-mode/prd.md
.trellis/tasks/11-13-partner-access-mode/quality-review.md
.trellis/tasks/11-13-partner-access-mode/recovery-checkpoint.md
.trellis/tasks/11-13-partner-access-mode/task.json
.trellis/tasks/11-13-partner-access-mode/verification.md
.trellis/tasks/11-13-partner-subscription-authorization-audit/check.jsonl
.trellis/tasks/11-13-partner-subscription-authorization-audit/implement.jsonl
.trellis/tasks/11-13-partner-subscription-authorization-audit/implement.md
.trellis/tasks/11-13-partner-subscription-authorization-audit/implementation-report.md
.trellis/tasks/11-13-partner-subscription-authorization-audit/prd.md
.trellis/tasks/11-13-partner-subscription-authorization-audit/quality-review.66ef7ddd.md
.trellis/tasks/11-13-partner-subscription-authorization-audit/quality-review.md
.trellis/tasks/11-13-partner-subscription-authorization-audit/task.json
.trellis/tasks/11-13-partner-subscription-authorization-audit/verification.md
controller/partner_oauth_client.go
controller/partner_tenant.go
controller/partner_tenant_authorization_audit_test.go
controller/partner_tenant_integration_mode_test.go
controller/partner_tenant_order.go
controller/partner_tenant_order_test.go
controller/partner_tenant_purchase_session.go
controller/partner_tenant_purchase_session_test.go
controller/partner_tenant_review_test.go
controller/partner_tenant_subscription_key.go
controller/partner_tenant_subscription_key_test.go
docs/openapi/partner-subscription-key.openapi.json
docs/partner-hosted-h5.zh-CN.md
docs/partner-subscription-key-api.zh-CN.md
docs/partner-tenant-api.md
docs/partner-tenant-integration.zh-CN.md
examples/partner-tenant-demo/README.md
middleware/partner_oauth.go
middleware/partner_tenant.go
middleware/partner_tenant_authorization_audit.go
middleware/partner_tenant_integration_mode_test.go
model/main.go
model/partner_oauth_authorization_log.go
model/partner_tenant.go
model/partner_tenant_authorization_audit.go
model/partner_tenant_authorization_audit_test.go
model/partner_tenant_integration_mode.go
model/partner_tenant_integration_mode_test.go
model/partner_tenant_order.go
model/partner_tenant_order_test.go
model/partner_tenant_purchase_session.go
model/partner_tenant_purchase_session_test.go
model/partner_tenant_subscription_key.go
model/partner_tenant_subscription_key_order.go
model/partner_tenant_subscription_key_test.go
model/partner_tenant_test.go
model/subscription.go
model/task_cas_test.go
router/partner_tenant.go
router/partner_tenant_authorization_audit_test.go
router/partner_tenant_integration_mode_test.go
router/partner_tenant_router_test.go
service/auth_token_test.go
service/partner_tenant_integration_mode_test.go
service/security_verification.go
service/task_billing_test.go
web/src/features/auth/secure-verification/types.ts
web/src/features/partner-oauth-clients/__tests__/authorization-logs.test.tsx
web/src/features/partner-oauth-clients/authorization-log-api.ts
web/src/features/partner-oauth-clients/authorization-logs.tsx
web/src/features/partner-tenants/__tests__/index.test.tsx
web/src/features/partner-tenants/api.ts
web/src/features/partner-tenants/index.tsx
web/src/i18n/locales/en.json
web/src/i18n/locales/fr.json
web/src/i18n/locales/ja.json
web/src/i18n/locales/ru.json
web/src/i18n/locales/vi.json
web/src/i18n/locales/zh-TW.json
web/src/i18n/locales/zh.json
```

## Excluded dirty / temporary paths

Pre-existing, not part of this work (not read/staged/cleaned):

- `167.114.158.4_ubuntu_49555_ed25519`
- `TEMPORARY_ARTIFACTS.md`
- `reports/`
- `web/.partner-checkout-temporary-artifacts.md`

Task-owned non-business intermediates, registered and retained pending separate cleanup consent, NOT part of the commit:

- `.partner-access-audit-temporary-artifacts.md`
- `web/scripts/partner-access-mode/add-missing-keys.mjs`
- `web/scripts/partner-authorization-audit/add-missing-keys.mjs`
- ignored lint diagnostics, locale sync reports/extras, tsbuildinfo/tool caches and tool-managed truncated outputs listed in the task ledger.

No dependency manifest/cache/log, secret, production credential or unrelated code is included. The user's subsequent confirmation authorizes the normal branch push; no amend/force-push/deploy/cleanup/archival.

## Follow-up after confirmation

Save this source checkpoint, then record the session journal with its real commit hash and explicit runtime block in a separate bookkeeping-only journal commit. Push these commits together with the six existing task-planning commits that are already ahead of the upstream branch, after a fast-forward check. Do not call task.py archive. Next code acceptance step requires Docker availability and new registered task-owned pq/Go resources, using the approved targeted suites and actual admin-permission regression.
