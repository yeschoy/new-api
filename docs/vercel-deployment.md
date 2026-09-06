# Vercel static frontend

Use the repository root, `web/`, or `electron/` as the Vercel project root. Each contains `vercel.mjs`; do not add a second `vercel.json` in the same directory. The shared configuration has no additional runtime dependencies.

Set `VITE_REACT_APP_SERVER_URL` in the Vercel project's deployment environment to the backend HTTPS origin, for example `https://backend.example.com`. A path, query, fragment, embedded credentials, or a missing target is rejected when configuration loads. This variable is a server-side proxy target, despite its historical name; browser code always uses relative API paths. Local Rsbuild development continues to use its existing proxy.

Vercel proxies `/api`, `/pg`, `/v1`, and `/mj` before the SPA fallback. Query strings, request methods, authentication headers, and host-only response cookies pass through the external rewrite. Rewrite caching is disabled, and API responses use `private, no-store`. Ordinary page routes still serve `index.html`.

For HTTPS login and refresh, keep `SESSION_COOKIE_SECURE=true` and add the public frontend origin to `SESSION_COOKIE_TRUSTED_URL` on the backend. The backend target Host must be accepted by the existing ingress/custom-domain configuration; the trusted-Origin list does not authorize an arbitrary Host. Use an exact main backend origin rather than a customer promotion or wildcard host, whose OriginGuard only accepts its own origin. Ensure the backend reverse proxy preserves the browser Origin header. These settings preserve `HttpOnly`, host-only `SameSite=Strict` refresh cookies and the existing CSRF check; do not enable wildcard credentialed CORS or disable the OriginGuard.

When `CUSTOM_DOMAIN_ENABLED=true`, also validate the Host seen by the application for OAuth callbacks and domain handoffs. External rewrites target the backend origin, while the existing domain resolver intentionally trusts only `Request.Host`. A trusted ingress must preserve the intended public application Host for those flows; adding a Session trusted Origin alone does not establish callback-host identity. Do not enable trust in arbitrary client-supplied forwarded-host headers.

Keep `ServerAddress` set to the public frontend origin for desktop approval and wallet links. OAuth/Passkey deployments must also retain their configured public callback and RP origins; this change does not migrate existing provider registrations. Deployment previews are not automatically trusted for production accounts.

Before publishing, run `cd web && bun run test:deployment`, the affected tests, `bun run typecheck`, and `bun run build`. On a deployed test environment, confirm password login, page reload/refresh, logout, API-key operations, and desktop approval. Local configuration tests do not prove DNS, TLS, ingress, or a hosted provider callback.

Sources: [Vercel programmatic configuration](https://vercel.com/docs/project-configuration/vercel-ts), [external rewrites and caching](https://vercel.com/docs/routing/rewrites), and [the repository session contract](authentication.md).
