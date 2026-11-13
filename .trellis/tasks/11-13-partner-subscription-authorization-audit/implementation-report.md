# Implementation report — subscription authorization audit

## Result

**有界实施 checkpoint；核心源码/前端已实现，未达到完整 L-AC 验收。** 保持 in_progress，交由主会话安排独立 check 与后续必要运行验证。未 stage/commit/push/merge/archive，未改父/前置任务审批记录，未回滚任何前置合法修改。

本轮最小行为缺口是原 dedicated LOG_DB 没有 tenant 关联与凭证事件、业务事务结果没有安全 receipt、既有后台日志页没有商户过滤。已在实际所有者处分层修复，不改公共业务 JSON、付款事实/交付原子性、模式矩阵、权限资源、session 缓存隔离或依赖。

## Implemented delta

1. **安全投影与迁移**：扩展既有 PartnerOauthAuthorizationLog 的 tenant/order/subscription/mode/version/replayed；新标识在 admin DTO 为 canonical decimal strings（旧字段/types 保留）。tenant_id 严格正 signed-int64 文本过滤；重复/未知/非规范/溢出拒绝。动作/原因/组合/元数据允许列表，无伪造 OAuth 标识。非 CH additive defaults；CH fresh CREATE 加六条真实 existing-table `ADD COLUMN IF NOT EXISTS ... DEFAULT`，复用现有 startup 调用及命名策略。LOG_DB 写/读使用 silent GORM session，故障告警不输出原始错误/SQL。商户 bearer 查询同样禁止插值 credential hash。
2. **实际锁内 receipts**：独立 safe struct，与 secret-bearing persistence/public DTO 分开；claim/query/rotate 从已经验证的 owning binding 捕获，不凭 key 二次解锁查关联。rotate 返回实际版本及已确认 replay；事务失败不声称新提交版本。已有公共函数签名以 wrapper 保留。复用 receipt 入参每次先清空，未知 key 不残留上一结果。
3. **提交后签发**：仅初始 paid subscription-key 新建关系在原事务内捕获 receipt；transaction 成功返回后再写 LOG_DB。rollback 不发、renewal 不发、fulfilled 重放不再发；背景恢复复用原 fulfillment，因此 nil context/status=0。无跨库 IO 在业务锁内、无 model→service 依赖、无全局 callback registry。
4. **单请求单结果**：request-ID/privacy 后、strict parser/auth/rate/recovery 前安装限定 recorder。独立查询每次记录，包括 active/exhausted/expired/cancelled。控制器已接管的 claim/rotate 记录操作结果；前置失败记 auth.denied，不重复记两个结果。validated pt_ 在 tenant rate 检查前单独捕获安全 principal；锁内 mode 拒绝携带当前 safe principal（errors.Is 合同保持）。路径/body ID 不是可信归属。公共 H5 generic auth 失败不猜租户。保留并扩展 io.Discard scoped recovery，避免 Gin 转储 header。
5. **后台 UI**：复用已有授权日志页/接口/权限，展示商户、订单、订阅、模式、版本、重放；新增商户文本筛选，不 Number 转换；lifecycle HTTP 0 显示 —。保留分页、旧 OAuth/server/account 数据、fresh mount/refetch/denied/error/cache 隔离行为。10 个 UI keys × 七语言经 sanctioned script+sync 写入。
6. **测试源/规范**：新增 model/controller/router 共 6 个顶层 AuthorizationAudit 测试源，显式 pq DSN/unique retained schemas，不使用旧 drop-table/all-driver fixture。model/service TestMain 的显式 AuthorizationAudit 选择绕过旧 SQLite。新增三项 DOM 测试。新增七节实际审计 spec 并只 additive 更新 index。

## Actually executed verification

详细命令与证据：同目录 `verification.md`。

- **12/12** authorization-log DOM tests 最终通过（1 file，无 skips），原 9 项权限/缓存/分页/错误测试保留。
- `bun run typecheck` 最终通过；scoped oxlint 和 oxfmt 对 3 个 touched authorization-log TS/TSX 文件通过。
- 新增 nested ternary/测试拼接及 braces 的本次 lint 问题已局部修复；全站 lint **未重复运行**，继承 **151 errors / 66 warnings** 基线，不宣称全站通过。
- sanctioned translation script + `bun run i18n:sync` 前后通过；只读 locale 断言 **70/70** 非空字符串通过。
- `gofmt -l` touched Go 最终无输出；task manifests **8 implement / 7 check** 通过；CH/recorder/recovery source-contract assertions 与 `git diff --check` 通过；staged 文件为空。
- **Go build/test/vet 执行均为 0；pq/ClickHouse/runtime 执行均为 0。** 已知 Docker 不可用，不重试 preflight，不启动 Desktop/改引擎/host Go/SQLite替代。gofmt/source assertions 不是 Go 编译、类型或数据库运行证据。

## Exact audit-owned delta files

```text
.partner-access-audit-temporary-artifacts.md
.trellis/spec/backend/index.md
.trellis/spec/backend/partner-authorization-audit.md (new)
.trellis/tasks/11-13-partner-subscription-authorization-audit/implementation-report.md
.trellis/tasks/11-13-partner-subscription-authorization-audit/verification.md (new)
controller/partner_oauth_client.go
controller/partner_tenant.go
controller/partner_tenant_order.go
controller/partner_tenant_subscription_key.go
controller/partner_tenant_authorization_audit_test.go (new)
middleware/partner_oauth.go
middleware/partner_tenant.go
middleware/partner_tenant_authorization_audit.go (new)
model/partner_oauth_authorization_log.go
model/partner_tenant.go
model/partner_tenant_order.go
model/partner_tenant_subscription_key.go
model/partner_tenant_subscription_key_order.go
model/partner_tenant_integration_mode.go (predecessor new file, additive audit error handoff)
model/partner_tenant_authorization_audit.go (new)
model/partner_tenant_authorization_audit_test.go (new)
model/task_cas_test.go
router/partner_tenant.go
router/partner_tenant_authorization_audit_test.go (new)
service/task_billing_test.go
web/src/features/partner-oauth-clients/authorization-log-api.ts
web/src/features/partner-oauth-clients/authorization-logs.tsx
web/src/features/partner-oauth-clients/__tests__/authorization-logs.test.tsx
web/src/i18n/locales/{en,zh,zh-TW,fr,ja,ru,vi}.json
web/scripts/partner-authorization-audit/add-missing-keys.mjs (new; retained registered helper)
```

Shared files contain predecessor partial diff; this is NOT permission to stage all changes against HEAD. Fingerprint comparison showed this child's implement.md already differs from the saved earlier fingerprint due to the pre-dispatch approval handoff; this agent never wrote it. Parent/predecessor task records remain untouched by this run. Original private key, root reports/, TEMPORARY_ARTIFACTS.md and web old temporary ledger were not read/staged/cleaned. Task ledger updated only for this child; new helper retained pending cleanup consent. No containers/networks/volumes/DB schemas created, no secrets/DSNs recorded.

## Open gates / residual risks

- **Independent source review and actual Go compilation/runtime are not complete.** New tests may still contain compile/runtime defects. L-AC6 pq persistence/migration gate is unsatisfied, and backend L-AC1–4 behavior remains source evidence only.
- Additional explicit renewal-no-issue, background recovery-scan issuance, actual tenant-budget exhaustion, lock-time/body-race receipt, foreign ownership, paid-delivery LOG_DB outage and production backend admin permission integration coverage remain to be completed/reviewed. Existing authz registration was not changed; DOM permission tests do not prove HTTP permissions.
- Required Docker/pq commands and fixture/resource precautions are in verification.md. No live CH, full startup, real browser/mobile/WebView, real provider/payment, production migration or deployment tested.
- **Best effort, no outbox/cross-DB atomicity**: LOG_DB outage or crash after business commit can lose events. Log failures never undo paid facts/credential changes; fulfilled replay does not fabricate a replacement issue. This limitation is intentional and approved.

```acceptance-report
{
  "criteriaSatisfied": [
    {"id":"criterion-1","status":"satisfied","evidence":"Core implementation and bounded partial checkpoint recorded with exact executed frontend/static checks and explicit runtime/coverage risks; no full L-AC acceptance claimed."}
  ],
  "changedFiles": [
    "model/partner_oauth_authorization_log.go",
    "model/partner_tenant_authorization_audit.go",
    "model/partner_tenant_subscription_key.go",
    "model/partner_tenant_subscription_key_order.go",
    "model/partner_tenant_order.go",
    "model/partner_tenant.go",
    "model/partner_tenant_integration_mode.go",
    "model/task_cas_test.go",
    "service/task_billing_test.go",
    "middleware/partner_tenant_authorization_audit.go",
    "middleware/partner_tenant.go",
    "middleware/partner_oauth.go",
    "controller/partner_oauth_client.go",
    "controller/partner_tenant.go",
    "controller/partner_tenant_order.go",
    "controller/partner_tenant_subscription_key.go",
    "router/partner_tenant.go",
    "model/partner_tenant_authorization_audit_test.go",
    "controller/partner_tenant_authorization_audit_test.go",
    "router/partner_tenant_authorization_audit_test.go",
    "web/src/features/partner-oauth-clients/authorization-log-api.ts",
    "web/src/features/partner-oauth-clients/authorization-logs.tsx",
    "web/src/features/partner-oauth-clients/__tests__/authorization-logs.test.tsx",
    "web/src/i18n/locales/en.json",
    "web/src/i18n/locales/zh.json",
    "web/src/i18n/locales/zh-TW.json",
    "web/src/i18n/locales/fr.json",
    "web/src/i18n/locales/ja.json",
    "web/src/i18n/locales/ru.json",
    "web/src/i18n/locales/vi.json",
    "web/scripts/partner-authorization-audit/add-missing-keys.mjs",
    ".trellis/spec/backend/index.md",
    ".trellis/spec/backend/partner-authorization-audit.md",
    ".partner-access-audit-temporary-artifacts.md",
    ".trellis/tasks/11-13-partner-subscription-authorization-audit/implementation-report.md",
    ".trellis/tasks/11-13-partner-subscription-authorization-audit/verification.md"
  ],
  "testsAddedOrUpdated": [
    "model/partner_tenant_authorization_audit_test.go",
    "controller/partner_tenant_authorization_audit_test.go",
    "router/partner_tenant_authorization_audit_test.go",
    "model/task_cas_test.go",
    "service/task_billing_test.go",
    "web/src/features/partner-oauth-clients/__tests__/authorization-logs.test.tsx"
  ],
  "commandsRun": [
    {"command":"bun run test src/features/partner-oauth-clients/__tests__/authorization-logs.test.tsx","result":"passed","summary":"Final 12/12 DOM tests, 1 file."},
    {"command":"bun run typecheck","result":"passed","summary":"tsgo -b."},
    {"command":"scoped oxlint and oxfmt --check on 3 touched authorization-log files","result":"passed","summary":"Final no diagnostics; task-local lint issues fixed."},
    {"command":"node scripts/partner-authorization-audit/add-missing-keys.mjs; bun run i18n:sync; locale assertion","result":"passed","summary":"70 values, 7 locales."},
    {"command":"gofmt -l touched Go files; task.py validate; Python source-contract assertions; git diff --check","result":"passed","summary":"Formatting/manifests/source checks only, not Go compilation."},
    {"command":"task-owned Docker Go build/test/vet and pq suites","result":"not-run","summary":"Known unavailable Docker; 0 Go executions, no replacement engine or host Go."},
    {"command":"full-site frontend lint","result":"not-run","summary":"Inherited 151 errors / 66 warnings baseline retained, no repeat."}
  ],
  "validationOutput": ["12 DOM tests passed; typecheck/scoped lint/format passed; 70/70 locale values; 8 implement and 7 check manifest entries resolve; no staged files."],
  "residualRisks": [
    "Go source/tests have not been compiled or run; mandatory pq and independent review gates remain open.",
    "Additional lifecycle/race/fault/admin permission coverage listed above remains pending.",
    "LOG_DB outage or crash after business commit can lose best-effort events; no outbox or cross-DB atomicity.",
    "No live ClickHouse, full startup, real browser/payment/deployment acceptance."
  ],
  "noStagedFiles": true,
  "diffSummary":"Safe tenant audit schema/receipts/postcommit issuance/single-result middleware/admin filter/UI with focused tests and seven locales; predecessor changes preserved.",
  "reviewFindings":["blocker: mandatory Go/pq runtime and independent review remain unavailable/pending; this is a bounded checkpoint, not full acceptance"],
  "manualNotes":"Exact audit delta and next gates are recorded above and in verification.md. No parent/predecessor approvals edited, no resource creation or cleanup. Main session owns subsequent check/commit."
}
```
