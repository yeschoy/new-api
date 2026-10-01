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
- `src/site/theme.tsx` (`ThemeProvider`, `useTheme()`) sets the `.dark` class. The theme follows the visitor's clock (06:00–18:00 day, otherwise night) and re-checks it every minute. The sun/moon button in the header flips the theme only until the next 06:00 or 18:00; then the clock takes over again, so one click never switches the automatic change off for good.
- The home hero sits on a dotted world map (`src/sites/router/home/world-map.tsx`): the headline, buttons and figures are laid over it. From the lg breakpoint that block sits over the Pacific, 10% of the map's width right of centre. The map is centred on the Pacific like world maps printed in China (`world-projection.ts`), so China sits left of the ocean and the US right of it. By day the land is a grey stipple; at night real city lights come on. `world-land.ts` and `world-lights.ts` are generated data (land from Natural Earth, lights from NASA Earth Observatory's Black Marble 2016, both public domain) made by a script kept outside the repo; treat them as data files. They load in their own chunks, the lights only once night is shown.
- There is no model list page. The home page's 精选模型 lists every model from `/api/pricing`: the models in `PINNED_MODELS` (`src/lib/pinned-models.ts`, also the chat's default model) first, shown even when the catalog does not list them yet, then ranked models, then the rest. Models without an icon in the admin get their family's icon from `src/lib/model-icons.ts`. Every card shows token usage and weekly trend, `--` when a model has no usage figures (rankings may be switched off on the server). No prices on these cards. It and 最新上线 show three cards and expand in place (展开 / 收起); their cards do not link anywhere. Model detail pages (`/models/:name`) remain, reached from the rankings and the header search.
- The chat page (`src/pages/chat/`) follows ChatGPT: your messages in rounded bubbles on the right, replies in the open with a copy button and the model's name beneath. The rounded message box holds the text, the chat settings at its bottom left and, as in Claude, the model picker at its bottom right (grouped by vendor, with the total), next to a microphone for voice input (the browser's Web Speech API, in the page language; hidden where the browser has none). Both menus open upwards. With no `?model=`, the chat opens on the first of `PINNED_MODELS` the catalog has; the menu lists every pinned model even before the catalog has it (a request to one fails until the server offers it). The settings hold 思考强度 (默认 / 低 / 中 / 高, sent as `reasoning_effort` low / medium / high, which the backend turns into each vendor's thinking settings), the output cap and the system prompt; there is no temperature. Effort and cap are left to the model until the visitor sets them, and only what they set is sent. On desktop there is no bar above the thread; phones keep a slim bar with 新对话.
- Layouts must hold on 360px phones (portrait and landscape), tablets, and desktops in either orientation. Keep a 24px side margin at every width (`px-6` with a `max-w-[…]` that includes it, never dropping the padding at a breakpoint), let grids step down in columns, and centre content that can outgrow a short screen with `justify-center-safe`.
- Pages never force a redirect to sign-in or setup. Signed-in-only pages wrap their content in `RequireAuth` (use `framed` when the children render their own page frame), which shows an in-page sign-in notice. An uninitialised instance shows no setup notice or button anywhere; the administrator opens `/setup` by URL.

The site is called 野菜 in Chinese (简体 and 繁體) and yeschoy in every other language: `useBrand()` in `src/lib/queries.ts` returns `t('野菜|品牌')`, and the browser tab shows the same name. The system name setting is not used. The logo is the yeschoy mark in `src/components/brand-mark.tsx` (also `public/favicon.svg`), unless the operator sets a logo URL in the system settings.

## Languages

The site speaks 12 languages (`LANGUAGES` in `src/i18n/i18n.ts`): 简体中文, 繁體中文, English, 日本語, 한국어, Español, Português (Brazil), Français, Deutsch, Русский, Tiếng Việt and Bahasa Indonesia. A visitor gets the language they picked in the header's globe menu (`src/components/language-menu.tsx`, kept in `localStorage` under `lang`); without a pick, the first of their browser's languages the site speaks; failing that, English. The language sets `<html lang>`, which also puts Japanese, Korean or Traditional Chinese fonts first (`src/styles.css`).

- Write UI text in Chinese and pass it through `t()` from `src/i18n/i18n.ts`, e.g. `t('创建密钥')`. The Chinese is the key into each language's table: English in `src/i18n/en.ts` ships with the page, the others in `src/i18n/locales/<id>.ts` load only when that language is used. `main.tsx` waits for the first table, so the page never flashes Chinese. Components that show text call `const { t } = useI18n()` so they re-render when the language changes.
- Placeholders use braces, the same in every language: `t('近 {days} 天', { days })` → `'Last {days} days'`. Always pass a single-quoted literal, never a template string, so the checks can find it.
- Text kept at module level (option lists, table columns) is marked with `tk('…')` and passed through `t()` where it is shown. A `t()` call at module level would freeze the language at load time.
- When the same Chinese needs a different translation in another role, add a `|tag`: `t('模型|表头')` shows 模型 in Chinese and uses its own entries (`'Model'`) elsewhere.
- A new text needs an entry in every table. `src/i18n/__tests__/coverage.test.ts` fails when a language has no table, when a `t()`/`tk()` text is missing from one, when `{placeholders}` differ, or when Chinese appears outside `t()`/`tk()` (comments and tests excepted).
- Dates follow the language (`shortDate` and `bucketLabel` in `src/lib/format.ts`). Backend data, such as model descriptions and names users typed, is shown as is.
- No right-to-left languages yet: the layout is not mirrored.

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
