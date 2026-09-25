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

## Design and themes

One design, a replica of the openrouter.ai catalog. Components live under `src/sites/router/` (shared pieces in `src/components/`, page-level logic in `src/pages/`).

- Colours come only from the `or-*` Tailwind tokens (`bg-or-bg`, `bg-or-card`, `text-or-fg`, `text-or-muted`, `border-or-line`, `bg-or-fill`, `bg-or-primary`, …). They are CSS variables defined in `src/styles.css` with a day palette on `:root` and a night palette on `.dark`, so never hard-code backgrounds, text, borders or the primary colour. The only literal hues are accents that read on both themes (chart palette, modality tags, the green "up" trend).
- `src/site/theme.tsx` (`ThemeProvider`, `useTheme()`) sets the `.dark` class. Mode `auto` (default) follows the visitor's clock (06:00–18:00 day, otherwise night); the sun/moon button in the header pins light or dark.
- The home page shows a dotted world map under the headline (`src/sites/router/home/world-map.tsx`); no text sits on top of it. The map is centred on the Pacific like world maps printed in China (`world-projection.ts`), so China sits left of the ocean and the US right of it. It shows real day and night (`world-sun.ts`, repainted every minute): wherever the sun has set right now, the land dots dim or darken and the city lights are on, so it is night over the US while it is day in China, and so on. The page's day/night theme only sets the colours (white-gold lights on the dark page, orange on the light page). `world-land.ts` and `world-lights.ts` are generated data (land from Natural Earth, lights from NASA Earth Observatory's Black Marble 2016, both public domain) made by a script kept outside the repo; treat them as data files. They load in their own chunks after the page.
- Pages never force a redirect to sign-in or setup. Signed-in-only pages wrap their content in `RequireAuth` (use `framed` when the children render their own page frame), which shows an in-page sign-in notice. An uninitialised instance shows no setup notice or button anywhere; the administrator opens `/setup` by URL.

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
