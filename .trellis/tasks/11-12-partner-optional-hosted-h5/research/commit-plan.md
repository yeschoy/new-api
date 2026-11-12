# Proposed implementation checkpoint commit

Status: user explicitly approved this exact plan with “提交”. The scoped implementation checkpoint is authorized; no push or cleanup. Full runtime acceptance remains blocked by Docker, so this is not a deployment-ready or completed-task claim. Do not archive the task.

Message: `feat(partner): add optional hosted H5 purchase flow`

## Exact allowed file list

```text
.trellis/spec/backend/index.md
.trellis/spec/backend/partner-hosted-h5.md
.trellis/spec/backend/partner-tenant-checkout.md
.trellis/spec/frontend/index.md
.trellis/tasks/11-12-partner-optional-hosted-h5/check.jsonl
.trellis/tasks/11-12-partner-optional-hosted-h5/design.md
.trellis/tasks/11-12-partner-optional-hosted-h5/implement.jsonl
.trellis/tasks/11-12-partner-optional-hosted-h5/implement.md
.trellis/tasks/11-12-partner-optional-hosted-h5/prd.md
.trellis/tasks/11-12-partner-optional-hosted-h5/research/commit-plan.md
.trellis/tasks/11-12-partner-optional-hosted-h5/research/current-contracts.md
.trellis/tasks/11-12-partner-optional-hosted-h5/research/review-findings.md
.trellis/tasks/11-12-partner-optional-hosted-h5/research/verification-2026-11-12.md
.trellis/tasks/11-12-partner-optional-hosted-h5/task.json
controller/partner_tenant_order.go
controller/partner_tenant_purchase_session.go
controller/partner_tenant_purchase_session_authority_test.go
controller/partner_tenant_purchase_session_availability_test.go
controller/partner_tenant_purchase_session_quota_test.go
controller/partner_tenant_purchase_session_test.go
controller/testdata/partner_purchase_quota_plans.json
docs/partner-hosted-h5.zh-CN.md
docs/partner-tenant-api.md
model/main.go
model/partner_tenant_order.go
model/partner_tenant_order_test.go
model/partner_tenant_purchase_session.go
model/partner_tenant_purchase_session_test.go
router/partner_tenant.go
router/partner_tenant_purchase_session_test.go
router/web-router.go
web/index.html
web/scripts/__tests__/vercel-config.test.mjs
web/scripts/add-missing-keys.mjs
web/scripts/vercel-config.mjs
web/src/features/partner-checkout/__tests__/bootstrap.test.ts
web/src/features/partner-checkout/__tests__/document-policy.test.ts
web/src/features/partner-checkout/__tests__/localization.test.ts
web/src/features/partner-checkout/lib/access.ts
web/src/features/partner-purchase/__tests__/access.test.ts
web/src/features/partner-purchase/__tests__/api.test.ts
web/src/features/partner-purchase/__tests__/fixtures.ts
web/src/features/partner-purchase/__tests__/localization.test.ts
web/src/features/partner-purchase/__tests__/purchase.test.tsx
web/src/features/partner-purchase/__tests__/route.test.tsx
web/src/features/partner-purchase/api.ts
web/src/features/partner-purchase/index.tsx
web/src/features/partner-purchase/lib/access.ts
web/src/features/partner-purchase/lib/surface.ts
web/src/i18n/locales/en.json
web/src/i18n/locales/fr.json
web/src/i18n/locales/ja.json
web/src/i18n/locales/ru.json
web/src/i18n/locales/vi.json
web/src/i18n/locales/zh-TW.json
web/src/i18n/locales/zh.json
web/src/main.tsx
web/src/routeTree.gen.ts
web/src/routes/__root.tsx
web/src/routes/partner/purchase.tsx
```

Only new ignored task/spec files from this list may need targeted force-add. Do not force-add `.trellis/` or any parent directory. Reinspect staged exact paths, secret patterns and diff whitespace before commit; no amend/push.

## Explicitly excluded pre-existing / local-only paths

- `docs/partner-tenant-integration.zh-CN.md` (already dirty before task, not authored by these implementation/fix children)
- `167.114.158.4_ubuntu_49555_ed25519` (private key; do not read/stage)
- `examples/`
- `reports/`
- `TEMPORARY_ARTIFACTS.md` (pre-existing local inventory, appended only for retention)
- `web/.partner-checkout-temporary-artifacts.md`
- `.local-tests/partner-hosted-h5-20261112/`, browser/lifecycle outputs and shared build caches

No archive commit while runtime gates are blocked. Journal bookkeeping waits until after authorized work commit; no cleanup without separate consent.
