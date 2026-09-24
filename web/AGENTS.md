# Frontend (web/) conventions

This is the 2026-09 rewrite of the dashboard UI. The previous frontend was removed in the same change; its code is still available in git history on `main`.

## Stack

| Area | Choice |
| --- | --- |
| Package manager | Bun (`bun install`, `bun add`) |
| Build | Vite, output **must** stay in `web/dist` (the Go server embeds it with `//go:embed web/dist`) |
| UI | React 19, TypeScript, Tailwind CSS v4 (`src/styles.css` holds all design tokens) |
| Routing | react-router v8, route table in `src/router.tsx` |
| Data | @tanstack/react-query + axios instance in `src/lib/api.ts` |
| Tests | Vitest + Testing Library (`bun run test`), `bun run typecheck` must be clean |

## Two reference designs ("skins")

The site ships two complete designs that visitors can switch with the floating control in the bottom-right corner (stored in `localStorage['site-skin']`):

- `router`: dark catalog design, components under `src/sites/router/`, tokens `or-*` (e.g. `bg-or-bg`, `text-or-muted`, `bg-or-lime`).
- `hub`: light gateway design, components under `src/sites/hub/`, tokens `hub-*` (e.g. `bg-hub-blue`, `text-hub-link`), serif headings via `font-serif-display`.

Pages pick their implementation with `<BySkin router={...} hub={...} />` from `src/site/site-skin.tsx`. Pages that are mostly logic (console, chat, auth) render one component and branch on `useSiteSkin()` for styling.

Brand name and logo always come from the operator's system settings (`useBrand()` in `src/lib/queries.ts`); never hard-code a brand.

## Backend contract

The frontend only uses existing endpoints; do not change Go code for UI work. Key modules:

- `src/lib/api.ts`: axios instance, Bearer access token, one automatic refresh via `POST /api/user/auth/refresh` (httpOnly cookie) on 401.
- `src/lib/auth-store.ts`: in-memory session (`useAuth()`), restored on page load by `refreshSession()`.
- `src/lib/services.ts`: status, setup, pricing, rankings, login/2FA/register/logout, keys, logs, redeem.
- `src/lib/console-api.ts`: top-up info/history, key enable/disable, usage summary, display name.
- `src/lib/chat-stream.ts`: SSE parser for `POST /pg/chat/completions`.
- `src/lib/pricing.ts`: price math must match backend billing: `model_ratio × $2` per 1M input tokens, output × `completion_ratio`, cache × `cache_ratio`, then × group ratio.

Login passwords are RSA-encrypted when `status.password_login_encryption_enabled` is on (`src/lib/password-encryption.ts`).

## Code style

- Every source file starts with the AGPL license header (copy it from any existing file).
- Single quotes, no semicolons, 2-space indent; function components; read props as `props.x` instead of destructuring.
- Merge class names with `cn` from `src/lib/format.ts`.
- No nested ternaries; use early returns or `if` chains.
- UI copy is Simplified Chinese.
- Keep files focused (roughly under 250 lines); split subcomponents into sibling files.
- Put tests in a `__tests__/` folder next to the code they cover, and assert user-visible behaviour.

## Checks before committing

```bash
bun run typecheck
bun run test
bun run build
```
