# Current contract findings for optional hosted H5

## Status

Historical planning evidence below. The user selected **A: standalone H5 URL/new window/WebView**, then approved the complete final plan with “开始”. Task was started and implementation/review/fixes/available validation have since completed; Go/database runtime acceptance is still blocked. See verification-2026-11-12.md for current truth.

## Evidence

| Evidence | Current behavior | Planning implication |
| --- | --- | --- |
| `router/partner_tenant.go:9` | Merchant plans, accounts and orders use `pt_` authentication; the public order cashier is a separate route group. | Add a merchant-authenticated purchase-session entry and limited public H5 endpoints; do not expose `pt_` or alter existing merchant contracts. |
| `controller/partner_tenant.go:223` | The merchant catalog is restricted to enabled plans owned by the authenticated tenant. | H5 must use the same tenant scope; public output should be a minimal catalog DTO rather than the entire model. |
| `controller/partner_tenant_order.go:160` | Merchant order creation validates trusted buyer ID, plan, payment method and idempotency, and replays existing orders before checking new-payment availability. | Reuse order-domain creation, preparation and error semantics; H5 must not duplicate settlement/fulfillment or weaken exact-replay behavior. |
| `controller/partner_tenant_order.go:225` | Creation returns a server-generated, order-bound checkout URL. | Existing API consumers continue receiving their original contract. H5 adds selection before this order step. |
| `controller/partner_tenant_order.go:273` | Cashier capability grants read-only, order-specific public status; merchant/user IDs and model keys are omitted. | Do not turn an order capability into a general buyer session. H5 needs its own narrow capability purpose and server-bound identity. |
| `model/partner_tenant.go:33` | Tenant configuration has name, group, secret hash and enabled/disabled status; no existing H5 embedding/return configuration exists. | Optional integration does not require forcing a new mutually exclusive API/H5 tenant mode. Embedding, if selected, needs explicit trusted-origin configuration. |
| `router/web-router.go:29` | Cashier HTML explicitly sets `X-Frame-Options: DENY` and `frame-ancestors 'none'`. | Current cashier is deliberately not embeddable. An iframe H5 requires a distinct, designed policy; never relax all pages or the existing cashier globally. |
| `web/src/main.tsx:46` | Cashier entry scrubs fragment access before Router construction and skips generic frontend cache/branding initialization. | H5 must receive comparable early credential scrubbing and privacy isolation, including encoded/trailing-path aliases and static hosting. |
| `web/src/routes/__root.tsx:53`, `:131` | Cashier bypasses platform login/setup, status, rewards and generic root effects. | Hosted H5 must not require users to sign in to the platform or trigger unrelated authenticated effects. |
| `web/src/features/partner-checkout/index.tsx:145` | Existing page renders frozen order details, QR/external HTTPS payment and separate payment/delivery progress. | Reuse payment/status presentation and authoritative backend truth where practical; add mobile-friendly plan selection and new-order progress. |
| `.trellis/spec/backend/partner-tenant-checkout.md` | CNY-only payment, paid-before-delivery, idempotency, tenant isolation and Docker-only Go DB testing are mandatory. | Add tests for session isolation and old API regression; never treat a frontend callback/postMessage as settlement. |

## Resolved product decision

The user selected **A**. MVP supports an independent H5 URL/new window/WebView; iframe, origin-allowlist administration and postMessage are out of scope. Existing cashier frame denial remains. No blocking product question remained at final review; the final summary was subsequently approved.

## Additional design evidence and environment check

- `model/partner_tenant_order.go:CreatePartnerTenantSubscriptionOrder` already has a tenant-scoped unique idempotency hash, exact request matching and original order recovery. A session-purpose-derived hash can reuse it without persisting a second order pointer or duplicating fulfillment.
- `controller/partner_oauth_payment.go:partnerEpayMethods/partnerEpayMethodAvailable` lists/filter-checks current channels. Reuse only these helpers, not OAuth wallet currency/accounting.
- `web/src/features/partner-checkout/api.ts` uses dedicated credential-omitting/no-store/no-referrer fetch and strict Zod DTOs; H5 should follow that policy rather than the platform axios client.
- `web/scripts/vercel-config.mjs` owns static-host rewrites and headers. There is no `web/vercel.json`; do not create a non-consumed config by guessing.
- `web/components.json` identifies the actual Base UI / base-nova setup. Use existing components and do not assume Radix `asChild` contracts.
- Planning preflight found Bun, Docker CLI and Go installed. `docker info --format '{{.ServerVersion}}'` could not connect to the local Docker daemon (`unix:///Users/lyh_god/.docker/run/docker.sock`). No daemon startup, containers, databases, Go tests, product frontend tests, production calls or payment actions were performed.
- `.trellis/` is ignored by `.gitignore:55`. At final scoped commit, explicitly add the relevant task/spec files only; do not force-add the whole tree or runtime/private files.

## Planning validation

- Final PRD was rewritten and read top-to-bottom with design.md and implement.md; the selected A scope is consistent and no blocking product question remains before final review.
- `task.py validate` passed: 8 implementation-context entries and 6 review-context entries, all real existing spec/research files.
- Planning-artifact checks passed for file presence, valid JSON/context paths, no trailing whitespace and task status still `planning`; `git diff --check` passed.
- These were documentation/context checks performed during planning only, before later explicit implementation approval. Current code/test evidence is maintained separately in verification-2026-11-12.md.

## Working tree / artifacts

Pre-existing modified integration docs and untracked Demo/reports/temporary records/credential file are out of scope for cleanup or unrelated staging. This investigation generated only task-owned Trellis documentation, no unrelated scratch outputs. Trellis logs/artifacts are retained.
