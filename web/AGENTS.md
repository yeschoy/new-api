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
- The home hero sits on a dotted world map (`src/sites/router/home/world-map.tsx`): the headline, buttons and figures are laid over it. From the lg breakpoint that block sits over the Pacific, 10% of the map's width right of centre. The map is centred on the Pacific like world maps printed in China (`world-projection.ts`), so China sits left of the ocean and the US right of it. By day the land is a grey stipple; at night real city lights come on. `world-land.ts` and `world-lights.ts` are generated data (land from Natural Earth, lights from NASA Earth Observatory's Black Marble 2016, both public domain) made by a script kept outside the repo; treat them as data files. They load in their own chunks, the lights only once night is shown.
- Pages never force a redirect to sign-in or setup. Signed-in-only pages wrap their content in `RequireAuth` (use `framed` when the children render their own page frame), which shows an in-page sign-in notice. An uninitialised instance shows no setup notice or button anywhere; the administrator opens `/setup` by URL.

Brand name and logo always come from the operator's system settings (`useBrand()` in `src/lib/queries.ts`); never hard-code a brand.

## Languages

The site opens in Simplified Chinese; the globe button in the header (`src/components/language-menu.tsx`) switches to English. The choice is kept in `localStorage` under `lang` and sets `<html lang>`.

- Write UI text in Chinese and pass it through `t()` from `src/i18n/i18n.ts`, e.g. `t('创建密钥')`. The Chinese is the key into the English table `src/i18n/en.ts`. Components that show text call `const { t } = useI18n()` so they re-render when the language changes.
- Placeholders use braces, in both languages: `t('共 {count} 个模型', { count })` → `'{count} models'`. Always pass a single-quoted literal, never a template string, so the checks can find it.
- Text kept at module level (option lists, table columns) is marked with `tk('…')` and passed through `t()` where it is shown. A `t()` call at module level would freeze the language at load time.
- When the same Chinese needs different English in another role, add a `|tag`: `t('模型|表头')` shows 模型 in Chinese and uses its own entry (`'Model'`) in English.
- Dates follow the language (`shortDate` and `bucketLabel` in `src/lib/format.ts`). Backend data, such as model descriptions and names users typed, is shown as is.
- `src/i18n/__tests__/coverage.test.ts` fails when a `t()`/`tk()` text has no English entry, or when Chinese appears outside `t()`/`tk()` (comments and tests excepted).

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
- UI copy is written in Simplified Chinese inside `t()`/`tk()`, with English in `src/i18n/en.ts` (see Languages).
- Keep files focused (roughly under 250 lines); split subcomponents into sibling files.
- Put tests in a `__tests__/` folder next to the code they cover, and assert user-visible behaviour.

## Checks before committing

```bash
bun run typecheck
bun run test
bun run build
```
