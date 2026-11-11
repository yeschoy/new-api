# Authenticated IQ Gallery and Active Previews

## 1. Scope / Trigger

Use for `features/iq-tests`, `/iq-tests`, both console navigation modes, active
HTML/SVG previews and IQ administration. Do not change generic HtmlContent.

## 2. Signatures

- `IQTestsPage` lives under the authenticated route, not operator-only routing.
- `useIQViewerScope()` keys user ID, session ID, role, group and permissions;
  `iqKeys.artifact(scope, result)` includes stable pair ID and result revision.
- `buildIQPreviewDocument(artifact)` builds the trusted opaque-frame document.
- `IQ_PREVIEW_SANDBOX = 'allow-scripts'`; `MAX_LIVE_IQ_PREVIEWS = 4`.
- Configuration uses a complete versioned PUT. DELETE `/api/iq-tests/config`
  accepts `{ group, version }`; gallery rows carry the current `config_version`
  separately from each historical result's version. DTOs are owned by `types.ts`
  and `api.ts`. API timestamps are Unix seconds.
- `IQ_REASONING_EFFORTS` in `types.ts` owns the frontend effort union and Zod
  enum: '', none, minimal, low, medium, high, xhigh, max. An absent backend
  effort is displayed/submitted as the empty default by `editableIQConfig`.

## 3. Contracts

- Authentication/permission changes synchronously remount the gallery subtree;
  remove old scope queries on unmount. Never retain another viewer's document.
  Stable result IDs are insufficient cache keys: include task/version/completion.
- Fetch list metadata with cursor-based infinite queries (poll every 10 seconds
  while foreground). Load older runs explicitly; each backend page retains whole
  runs. Fetch artifacts lazily for visible cards or the open preview. Compare
  artifact revisions against metadata and fail closed on inconsistent responses.
- Saved plan arrays arrive in shared display order. `PUT /api/iq-tests/group-order`
  sends `{groups: string[], previous: string[]}` independently of task settings.
  Show drag handles plus keyboard/up/down alternatives in settings when multiple
  saved plans exist; require channel write for mutation and an explicit Save group
  order action. Reuse AutoGroupOrderItem with optional removal omitted and disabled
  controls while pending/read-only/conflicted. Keep the original previous list
  throughout a draft so background refreshes never silently rebase stale edits.
  On 409 retain the draft and require explicit reload. Successful ordering saves
  invalidate configs/results without resetting the selected task or unsaved prompt
  form. New-plan dialogs do not expose ordering.
- The gallery always shows retained generations, not a latest-only view hidden
  behind a history toggle. Use exactly one stable group section/header/controls
  per saved plan, in results.group_order (already viewer-filtered); older servers
  without this metadata retain first-response order. Within that group's single
  horizontal strip, flatten each newest-first run's model cards in response order.
  Card keys include taskID/model; repeated model names across rounds are distinct
  cards and artifact revisions. New active/results cards must not replace older
  retained ones. Keep per-card result timestamps; the group summary uses its
  latest row. Preserve cross-page taskID/group deduplication because quiet-group
  first-page backfills can recur on older pages. Load older runs stays directly
  available whenever the cursor exists, without a show/hide action. Task controls
  appear once per group; another group's run does not disable them.
  The model/run strip uses column-flow grid with bounded responsive card widths,
  in a labeled keyboard-focusable horizontal scroll region; never wrap a group
  across multiple rows or overflow the page. Retain lazy observation and the
  global live-preview cap across all retained cards.
- Preserve in-budget run cards during and after a new run. Do not merge new
  progress into a previous run or label historical artwork as the latest result.
  A pruned artifact is unavailable (404), never silently substituted with a newer
  result under the same model name.
- Thumbnail iframes render at a 1280x960 desktop viewport and scale as a whole
  using ResizeObserver into a 4:3 card. Never render a desktop artwork directly
  in a narrow 256px-tall viewport. Expanded previews stay interactive/responsive.
  Preserve html attributes on the actual documentElement after the trusted CSP,
  and place artwork directly in body, without an extra layout-changing div.
  Members see only backend-authorized groups and no configuration/run controls;
  administrators additionally follow channel RBAC capabilities.
- Never append generated nodes to the host or pass app tokens/user data into
  them. Parse into an inert template, remove untrusted base/meta/forms/frames,
  external scripts and static resource URLs. Preserve self-contained scripts,
  Canvas, SVG references and animations. Do not implement privileged message
  handlers for model code.
- The trusted CSP must precede ALL generated markup/attributes:
  `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';
  img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'none';
  object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'`.
- Use iframe srcDoc with sandbox=allow-scripts and referrerPolicy=no-referrer;
  never add allow-same-origin, popups, top navigation, forms or downloads.
  Unmount offscreen/hidden/closed previews; dialogs/settings pause card frames.
- This is NOT a hostile-code VM or a complete network air gap. Scripts may
  consume resources or navigate their own frame. A local browser probe observed
  a dynamic download link falling back to self-navigation; no download sandbox
  capability was granted. Do not misreport this as universal egress prevention.
- Settings lists saved plans only, not the union of plans and the target catalog.
  An explicit New plan action starts with no selected group and offers unplanned
  catalog groups. Selecting/closing never creates anything; version=0 PUT saves
  the plan. Delete requires confirmation and channel write permission; on success
  cancel stale reads, remove the group's rows and artifact caches, and invalidate
  configuration/results. Plan deletion itself does not purge in-budget artwork;
  normal retention still applies to deleted plans. Never promise to abort requests
  already started. The backend's tombstone keeps deleted plans hidden on refresh.
- Each task editor is bound to one routing group. Its thinking-level setting
  applies to that task's selected models; other tasks keep independent settings.
  Multiple prompt textareas form a pool; the backend chooses one per task run.
  The editor starts with the current project prompt and preserves exact text.
  Each prompt is at most 64 KiB, with at most 100 prompts / 1 MiB total.
  The first editor prompt plus the additional entries become the complete pool.
  Default retains model/channel behavior; model-name modifiers take precedence,
  and supported levels depend on the model. Preserve effort, prompt pool and
  selected models through saves and conflict recovery; saving settings never runs
  a paid test automatically.
- Settings include history_limit (Retained runs per group), integer 1–1000,
  default 30 via editableIQConfig for old payloads and unsaved plans. Save it in
  the complete versioned config PUT and preserve it across conflict reloads.
  Explain that it counts completed rounds, not individual model cards, and that
  older records/artwork/unused snapshots are permanently deleted; active work is
  protected. A lower limit applies on save, not just to future runs. Invalidate
  result metadata after save so pruned cards disappear without reusing artifacts.
- Retain exact prompt whitespace and edits after recoverable/stale save errors.
  Daily uses Beijing time. Give interval/daily branches distinct React keys so
  native number/time inputs and react-hook-form refs are not incorrectly reused
  and values survive mode round trips. Render errors accessibly.
- All copy uses English source keys and seven locales. Locale writes go through
  add-missing-keys.mjs and i18n:sync; benchmark prompt data is not UI translation.

## 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Anonymous protected route | Sign-in redirect retaining /iq-tests |
| Session/account/group/permissions change | Unmount old artwork/forms/dialogs |
| Artifact revision mismatch or fetch failure | Honest unavailable state; no cross-run document reuse |
| Metadata error | Hide active frames; retryable error, no stale success |
| Config 409 | Preserve edits; require explicit reload/reconciliation |
| Unplanned catalog group | Absent from gallery/settings; only selectable in New plan |
| Confirmed plan deletion | Hide all group runs, invalidate cache, stop schedule/unsent work; keep in-budget artwork |
| New completed generation | Add cards to the existing group strip, retaining earlier in-budget generations |
| Retention lowered / invalid retention | Remove expired cards after save / block invalid noninteger or out-of-range input |
| Deletion 409 | Keep the row; require refresh before deleting a newer plan |
| Ordering 409 | Preserve local order; block resubmission until explicit reload |
| Ordering saved while editing a plan | Keep selected group and unsaved prompt/schedule edits |
| Expanded preview | One frame; card frames paused; accessible close lifecycle |
| Mobile viewport | No document overflow; settings fit viewport |
| Model self-navigation / CPU abuse | Document limitation; never claim full isolation |

## 5. Good / Base / Bad Cases

- Good: JSON artifact fetch -> trusted wrapper -> opaque-origin iframe.
- Base: prior terminal artwork remains clearly dated while another run is active.
- Bad: dangerouslySetInnerHTML in the app, tokens in srcDoc, unbounded iframes,
  or reusing another user's artifact cache after an account change.

## 6. Tests Required

- `preview-document.test.ts`: policy ordering, unsafe nodes/URLs, Canvas/SVG
  preservation and size bound; jsdom is construction evidence, not isolation.
- `gallery.test.tsx`: admin/member controls, lazy bounded previews and expanded
  lifecycle, current status, account changes, artifact revision mismatches and
  independent horizontal group rows, one-header-per-group with repeated-model
  retained generation cards, direct older-history loading, cross-page deduplication,
  confirmed deletion/cancel, explicit
  creation, per-group manual execution and fixed desktop thumbnail dimensions.
  Verify member gallery follows group_order while generations within each strip
  remain newest-first, and more history cards do not exceed the four-frame cap.
- `settings.test.tsx`: exact prompt/targets/schedule save, mode round-trip values,
  stale-save prompt/effort preservation, effort enum/default, single-group
  selection, saved-plan-only settings, explicit version=0 creation, prompt-pool
  round trips and explicit discard/reload. Ordering tests cover arrow/keyboard
  movement, explicit independent saves, reopen persistence, read-only controls,
  conflict preservation/reload and unsaved plan-form preservation across reordering.
  Retention tests assert default 30, custom saves and integer/range validation.
- `localization.test.ts`: all static/dynamic feature keys in seven locales.
- One local mock-backed browser smoke: real Canvas/SVG render, blocked parent
  DOM/storage/cookies, subresource/fetch/worker/popup/top/form attempts, mobile
  layout, anonymous redirect and member controls. Inspect residual navigation
  honestly instead of asserting a nonexistent universal no-network guarantee.

## 7. Wrong vs Correct

```tsx
// Wrong: granting origin access defeats the credential boundary.
<iframe sandbox='allow-scripts allow-same-origin' srcDoc={artifact} />

// Correct: only the dedicated builder owns the trusted document/policy.
<iframe sandbox='allow-scripts' referrerPolicy='no-referrer'
  srcDoc={buildIQPreviewDocument(artifact)} />
```
