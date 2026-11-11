# Scheduled Group IQ Tests

## 1. Scope / Trigger

Maintain this contract for IQ configuration, latest artwork, routing, scheduling,
and authenticated result APIs. IQ is a feature label, not a numeric benchmark.
The controller owns orchestration to avoid a service/controller import cycle.

## 2. Signatures

- Models: `IQConfig`, `IQBatch`, `IQAttempt`, `IQResult` in `model/iq_test_config.go`.
- `ListIQConfigs()` lazily and atomically splits the legacy singleton into one
  configuration row per routing group. Row 1 remains the template/allocation lock.
- `EnqueueIQGroup(group, scheduled, now)` snapshots one group and deduplicates
  with a bounded SHA-256-derived group active key; legacy shared runs still block
  duplicate requests for groups present in their snapshots. The runner retains
  its existing per-type lease and bounded worker budget.
- `ListIQHistory(groups, before)` pages 20 runs at a time, descending by RunSeq.
  `ListIQLatestResults(groups)` backfills quiet groups omitted by the first global
  history page, without selecting artifact bodies. Results are immutable and
  keyed by SHA-256(taskID + NUL + group + NUL + model).
- `StartIQAttempt(taskID, pairID, runner, now)` durably claims before sending;
  `CompleteIQAttempt` verifies the lease and replaces the latest row.
- `NextIQRun(config, now, anchor)` calculates a strictly future UTC Unix second.
- Viewer: `GET /api/iq-tests/results`, `GET /api/iq-tests/results/:id`.
- Admin: `GET|PUT|DELETE /api/iq-tests/config`, `GET /api/iq-tests/targets`,
  `POST /api/iq-tests/run`; use channel read/write/operate RBAC and PAT scopes.
- `testChannelWithIQ(..., options)` extends existing health-test conversion;
  `ExtractIQArtifact(text)` and `IQVisibleText(body, stream)` own extraction.

## 3. Contracts

- Default disabled/targetless. Each task owns exactly one concrete group, its
  models, reasoning level, prompt pool and schedule. Exact prompt content,
  maximum 64 KiB UTF-8 each, 100 prompts / 1 MiB total, 100 models per task.
  Reject `auto`, cross-group targets and incompatible targets. An empty prompt
  pool falls back to the saved prompt or IQDefaultPrompt. Draw one prompt once
  at enqueue, shared by all models, and persist only that selected prompt in the
  immutable execution snapshot. Configuration saves never trigger paid runs.
- `GET /config?list=true` returns tasks plus default_prompt; `GET /config?group=...`
  returns an existing task or an unsaved version=0 default. PUT creates version=0
  tasks or optimistically updates only that group's version. `POST /run?group=...`
  requires a saved group task. Catalog/group reads must not create plans.
  Independently queued groups never share run IDs.
- DELETE `/config` accepts `{group: string, version: positive integer}` using
  channel write RBAC, PAT scope and critical rate limiting. It atomically retains
  a `deleted` boolean tombstone (NOT NULL DEFAULT false), increments the version,
  disables scheduling, clears next_run_at and interrupts pending group attempts.
  Already claimed requests may complete; never delete artwork. Listings and
  authorization exclude tombstones; stale schedulers cannot enqueue them. Only
  an explicit version=0 save recreates a deleted plan, with a version above the
  tombstone so old editors/deletion requests cannot affect its successor. Legacy
  splitting counts tombstones too and must not resurrect a deleted plan.
- Gallery rows expose the plan's current `config_version` for versioned deletion,
  not the historical run version. The first page must contain each saved plan's
  latest run even if another group occupies all 20 paginated history slots. Older
  pages may repeat those backfills; clients deduplicate by taskID/group.
- Complete config PUT includes the last `version`, prompt, targets, enabled,
  schedule_mode, interval_hours, daily_time and timezone. Calendar is explicitly
  Asia/Shanghai, never server-local time. Optional `reasoning_effort` is shared
  across all pairs: empty string (default), none, minimal, low, medium, high,
  xhigh or max. Normalize with the production reasoning parser; persist empty
  values when clearing. The column is varchar(16) NOT NULL DEFAULT '' so existing
  rows and older queued snapshots retain default behavior. Save recomputes the
  next slot; a manual run preserves recurring cadence. Skip backlog and
  overlapping slots.
- Carry the saved effort in the immutable batch snapshot through `runIQBatch`
  and `executeIQPair`. Attach portable reasoning state **after InitChannelMeta**
  (it clears this state) and before model modifier handling. Production adapters
  render mapped-model native controls; model modifiers retain precedence. For
  explicit effort, restore converted reasoning controls after channel parameter
  overrides and retain matching usage metadata. Empty effort leaves channel
  defaults intact. Do not hard-code Claude/Gemini budgets or broaden IQ limits.
- A batch has two workers, a 25-minute pair deadline (`iqPairTimeout`), a
  16,384-token wire limit, one retry=0 group selector, and at most one
  non-replayable outbound POST per pair. Never enumerate channels, fail over,
  retry or replay started work. Derive timeout messages from the same constant;
  preserve earlier parent cancellation/deadlines. Deployment HTTP limits must
  allow this budget: `RELAY_TIMEOUT` and, for non-streaming output,
  `RELAY_RESPONSE_HEADER_TIMEOUT` must be 0 (disabled) or at least 1500 seconds.
- Propagate the deadline to the final HTTP request, clear `GetBody` and
  idempotency keys, and retain upstream redirects rather than following them.
- Set `ContextKeyUsingGroup` before relay-info generation. Use the root/system
  test identity and resource logs; never debit the viewing user's quota or
  modify channel health/test-time state. Do not log artifact bodies/credentials.
- Response limit 2 MiB; normalized artifact limit 1 MiB. Recognize complete
  direct/fenced HTML or SVG; prefer the whole HTML scene over nested SVG.
  Preserve inline scripts, not thinking/tool-only/file-link outputs. Extraction
  never fetches URLs or executes tools and is not a host-DOM script sanitizer.
- Every run retains its own result and artwork; failures, interruption, target
  edits and late cleanup must never overwrite/delete another run. Keep legacy
  pair-keyed rows readable without rewriting their IDs. List responses group by
  taskID/group, newest run first, and omit artifact bodies. Historical models
  remain readable even if deselected later, subject to current group access.
  Authorization is checked on metadata before fetching an artifact body. Private
  snapshots/checkpoints stay separate from user-facing immutable IQResult rows.
  Use MySQL MEDIUMTEXT, SQLite/PostgreSQL TEXT for Prompts, Targets and bodies.
  JSON `IQConfig.Targets` uses `IQTargets.GormDBDataType`, delegating to IQText;
  never replace this with `size:16777215`. The PostgreSQL dialect emits
  varchar(16777215) for that tag, exceeding its 10485760 varchar limit and
  fatally blocking application startup even though SQLite tests pass.
- Every data read requires authentication and current usable-group membership;
  administrators see configured groups. Protect direct artifact IDs identically.
  Return private/no-store JSON, never executable same-origin HTML. List/task
  payloads omit artifact bodies; timestamps are seconds except duration_ms.
- Eligible adapters are deliberately limited to known single-HTTP families.
  Codex may reject the enforced output cap; fail once, never relax it and retry.

## 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Stale config version / stale delete / repeated delete | 409, no write |
| Invalid delete JSON, empty group or nonpositive version | 400 |
| Deleted group list / directly known artwork | Absent / 404; bodies remain stored |
| Invalid prompt/targets/schedule/unknown reasoning effort | 400 |
| Anonymous / ordinary member admin action | 401 / 403 |
| Hidden, removed or unsuccessful artifact ID | Indistinguishable 404 |
| Duplicate manual enqueue for the same group | Existing active task, created=false; other groups enqueue independently |
| Provider failure / timeout / incomplete markup | Sanitized truthful terminal status |
| Lease loss / crashed started request | interrupted, never resend |
| Viewer reads results | No upstream call, quota change or channel mutation |

## 5. Good / Base / Bad Cases

- Good: three backing channels for one selected pair produce one IQ request.
- Base: old dated artwork remains in its original run row after new work terminates.
- Bad: putting HTML in SystemTask.Result, exposing a public HTML URL, or using
  the public relay retry controller to implement a supposedly single attempt.

## 6. Tests Required

- `model/iq_schema_test.go`: PostgreSQL is the deployment gate. Set
  TEST_POSTGRES_DSN to a disposable PostgreSQL service and run
  `go test ./model -run '^TestIQPostgresMigrationAndConfigRoundTrip$' -count=1`.
  The test creates and verifies a unique search_path schema, reproduces the
  old SQLSTATE 22023, applies/repeats migrations, checks targets is TEXT, and
  verifies exact prompt/JSON/effort persistence and upgrades an existing row
  after optional effort/plan/deletion columns are removed. Also assert latest-run
  tuple subqueries, retained artwork and monotonic delete/recreate behavior across
  repeated migrations. It never uses public
  schema for fixture writes. A missing DSN skips local tests, NOT CI acceptance.
- `.github/workflows/yeschoy-deploy.yml` requires the PostgreSQL 15 service/test
  job before building images; deployment still requires that build. Never
  replace this with a manual production migration check.
- Supplementary dialect-only checks assert targets/prompt/snapshot/artifact
  resolve to TEXT or MEDIUMTEXT. They are not a live migration/startup check.
- `model/iq_config_test.go` and `iq_group_config_test.go`: deterministic calendar/
  bounds, legacy split idempotence, independent group edits/enqueue, immutable
  random prompt snapshots, descending retained history, optimistic edits,
  duplicate enqueue/checkpoints, lease recovery and cadence;
  default/invalid effort validation, adding the effort column to an existing row,
  clearing a saved effort and immutable batch snapshot persistence. Verify fresh
  and read-only group selection stay empty, delete stops scheduled/unsent work,
  running work can finish, artwork remains, recreation is explicit/versioned and
  stale editors/deletes cannot modify the recreated plan.
- `controller/iq_tests_test.go`: mocked call counts, exact prompt, group routing,
  viewer/artifact denial, quota and health non-mutation, native request bounds.
  `TestIQReasoningEffortWireRequests` exercises mapped OpenAI/Responses/Codex,
  adaptive/manual Claude and level/budget Gemini against local HTTP mocks;
  verify explicit effort survives channel overrides, model modifiers win, empty
  effort retains defaults, usage metadata agrees, and one request is sent.
  Assert the executor receives a 25-minute deadline without waiting for it,
  preserves earlier parent deadlines, cancels completed pair contexts, and
  reports the same configured limit on timeout without retrying. Test saved-plan
  visibility, versioned deletion, deleted-artifact denial and latest-run backfills
  for quiet groups beyond a 20-run global page.
- `service/iq_artifact_test.go`: full/fenced markup and final native text,
  incomplete/oversized output, preservation of active self-contained content.
- `router/iq_router_test.go`: all seven anonymous denials and admin/member scopes,
  including DELETE channel-write enforcement.
- `relay/channel/iq_request_test.go`: deadline propagation and no redirect replay.
- SQLite test users need distinct nonempty `AffCode` values; initialize dialect
  column names and explicit model prices before invoking real model helpers.
  Do not mistake missing test bootstrap for a production behavior defect.

## 7. Wrong vs Correct

```go
// Wrong: a recoverable process error resends ambiguous upstream work.
for _, pair := range snapshot.Targets { callProvider(pair) }

// Correct: sending requires a durable, lease-checked pending -> running claim.
claimed, err := model.StartIQAttempt(taskID, pairID, runner, now)
if err == nil && claimed { /* issue exactly one bounded request */ }
```

Live MySQL/PostgreSQL concurrency and live provider compatibility are not proven
by SQLite/mock checks. Production provider verification requires separate cost
approval; deployment must never enable the schedule by default.
