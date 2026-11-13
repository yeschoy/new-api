# 实现交接：商户接入方式（第一子任务）

## 结论

已保留并完成第一轮源码实现；本次唯一一次 timeout 恢复仅做最终差异自检与验收记录，**未重做实现、未新增业务修改、未重新运行代码未变的已通过测试**。详细逐项证据、完整文件清单及后续命令见同目录 `verification.md`。

当前交付状态：**实现待独立审阅；Go/pq 运行验收阻塞；任务保持 in_progress。** 没有 stage、commit、push、merge、archive、资源清理、生产或真实付款操作。主会话既有审批/激活记录和 recovery checkpoint 均保留，未改父任务或第二子任务记录。

## 已实现边界

1. **权威模式、默认与迁移**：`PartnerTenant.IntegrationMode` 仅 subscription_key / hosted_h5。真正省略创建字段默认 subscription_key；显式 null/空/未知/legacy/external 拒绝。启动在 broad AutoMigrate **之前**调用增量迁移，先规范历史 null/空值，保留明确 H5 和未知非空值（后者运行时拒绝），不重写账户/订单身份或付款事实。
2. **创建后固定与证明**：创建证明绑定 action/group/integration_mode；管理 DTO/列表显示真实模式，create ADMIN audit 包含模式字段；状态/密钥轮换严格拒绝附加 mode 字段，无切换 UI/API。
3. **实际入口授权**：共享策略用于路由提前拒绝及受锁模型入口；订阅 Key create/replay/get/claim/rotate/query、H5 会话 create/get/exchange/read/order 和 H5 账户/Key/额度/查单支持按矩阵隔离。关键 mutation/replay 使用当前 tenant 锁，不依赖慢 body 前的快照。
4. **旧直接下单关闭但付款核心保留**：旧 POST subscription-orders 两模式均拒绝，不能通过 fast replay 绕过；H5 保留受会话保护的内部订单核心。共享 cashier/notify/payment/fulfillment/binding/recovery 不加全局模式门禁，已接受订单和已有付款仍保留交付能力。
5. **前端/七语言/文档**：默认、取消重开 reset、异步刷新保留 H5、proof/API payload 一致、只读模式列；使用现有 shadcn 组件。翻译仅由登记脚本写入再 sync，7 键 × 7 语言。相关文档/规范撤销同商户任意混用承诺；旧 Demo 标为历史直接协议/本地 mock，未擅自重写 Demo。
6. **分组窄回归**：使用真实 getGroups() 和模拟 `/api/group` 响应，中文非默认未占用组可选，停用同名商户仍占用。数据库唯一约束未移除，渠道关联未参与过滤；**没有复现或宣称修好用户截图环境**。

## 已有证据与阻塞

以下为保存 session 的真实结果，不是本恢复重复测试：

- tenant DOM：**1 文件 / 7 tests passed**，最后记录 16:56:16；无 skips。
- `bun run typecheck`：通过。
- touched tenant/verification 类型文件定向 oxlint：通过；oxfmt check：**4 文件通过**。
- sanctioned add-missing-keys + `bun run i18n:sync`：完成；读回断言 **49/49** 新 locale entries 存在且非空。
- OpenAPI：无重复 JSON 字段，**6 路径**都有 403 response。
- gofmt、task manifest validate（7 implement / 6 check entries）、diff whitespace：通过。gofmt **不是** Go build/typecheck。
- **全站 `bun run lint` 失败**：151 errors / 66 warnings；本次触碰源码 lint 已修正并定向通过，未扩大修复无关基线错误。ignored 原始诊断保留于 `.cache/partner-access-mode/frontend-lint.log`。

Docker 预检真实失败：本机 Docker daemon socket 不可连接。经 supervisor 明确批准，只继续实现与前端/static。

**没有执行任何 Go test/build/vet，没有 pq migration/persistence/HTTP/runtime 结果。** 新增 **11 个顶层 AccessMode Go 测试定义**覆盖 5 package，但均未编译/运行；执行数 0，skip 数未测，不以源码/skip/static 冒充 runtime。已为 model 与 service 的显式 AccessMode/独立 DSN 选择避开旧 SQLite TestMain bootstrap。未用 host Go、SQLite/MySQL 或其他引擎替代。

## 修改文件范围

完整逐路径清单已在 `verification.md`。核心新增：

- `model/partner_tenant_integration_mode.go`
- `model/partner_tenant_integration_mode_test.go`
- `controller/partner_tenant_integration_mode_test.go`
- `middleware/partner_tenant_integration_mode_test.go`
- `router/partner_tenant_integration_mode_test.go`
- `service/partner_tenant_integration_mode_test.go`
- `.trellis/spec/backend/partner-integration-mode.md`

其余必要修改：现有 tenant/订阅 Key/H5/旧订单 controller-model 入口、model/main.go、model/subscription.go 的事务内辅助复用、middleware/router、security verification context/类型及受影响既有测试；tenant 管理 UI/API/tests、七语言；五份接口文档/OpenAPI、旧 Demo README 提示和相关 specs。go.mod/go.sum、依赖版本、普通 OAuth/pst_ 行为及授权日志存储/投影/事件实现未改。

## 给日志子任务的合同

- 权威枚举：`PartnerTenantIntegrationSubscriptionKey` / `PartnerTenantIntegrationHostedH5`；策略：`RequirePartnerTenantIntegrationMode`；有界错误：`ErrPartnerTenantIntegrationMode`。
- 当前合法 pt_ 错入口 → **403 integration_mode_mismatch**；公开 H5 能力失败仍是 **401 invalid_purchase_access**，不披露租户。
- `middleware.PartnerTenantFromContext(c)` 仅在 bearer 验证成功后写入，供前置拒绝安全投影 **tenant ID / 合法 mode**；不能把整个 tenant（含 SecretHash）或原始凭证传入日志。
- 事务锁后 authority 与 middleware 快照不同：日志子任务应从实际验证过的锁内快照捕获安全 receipt，并在成功 commit 后发射。当前没有把签发/领取/轮换/独立查询的 audit receipt API 或事件提前实施。
- path/body 中 order/subscription/session ID 不代表可信关联；只有成功的 owning scoped lookup 才能填引用。未知 pt_/sub_ 不猜租户，不伪造 OAuth client/user；公开通用 H5 失败不能虚构 merchant 归属。
- 禁止日志中出现 pt_/sub_/sk_、鉴权头、payload、secret hash/seed、能力 URL；不能让日志故障回滚付款/凭证业务。
- **M-AC5 留待第二子任务和父任务完成真实“拒绝 → LOG_DB → 管理筛选”集成验收，本交付未声称满足。**

## 资源所有权与后续

- **本次没有创建/复用任何容器、网络、卷或数据库/schema。** 仅预登记 fixture schema 前缀，没有实际 schema 名或 runtime 输出。
- 本任务保留：翻译脚本 `web/scripts/partner-access-mode/add-missing-keys.mjs`、ignored lint log、locale sync reports/extras、可能的 typecheck/cache 输出；均在项目本任务 ledger 登记，未经批准不清理。
- 私钥、根 reports/、TEMPORARY_ARTIFACTS.md、web 旧临时登记不读取/暂存/清理。
- 后续由主会话独立 trellis-check / 源码审阅；Docker 可用后先登记新任务专属资源确切名称，再以独立 `TEST_PARTNER_ACCESS_AUDIT_POSTGRES_DSN` 执行定向 Go build 和 pq suite。缺少这两项之前，不能将迁移/安全边界/付款恢复称为已运行验收。
- 不保证旧二进制/混合版本执行新策略；回退保留增量列与已接受订单、身份、付款事实。生产迁移、部署、真实浏览器/WebView、真实付款均未验证。

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "已交付模式实现与第一子任务边界摘要、逐命令真实验证记录和残余风险；verification.md 明确区分 frontend/static 通过、全站 lint 失败和所有 Go/pq 未运行。此状态不代表业务所有 M-AC 已验收。"
    }
  ],
  "changedFiles": [
    "model/partner_tenant_integration_mode.go",
    "model/partner_tenant.go",
    "model/main.go",
    "model/partner_tenant_subscription_key.go",
    "model/partner_tenant_subscription_key_order.go",
    "model/partner_tenant_purchase_session.go",
    "model/partner_tenant_order.go",
    "model/subscription.go",
    "controller/partner_tenant.go",
    "controller/partner_tenant_order.go",
    "controller/partner_tenant_purchase_session.go",
    "middleware/partner_tenant.go",
    "router/partner_tenant.go",
    "service/security_verification.go",
    "web/src/features/auth/secure-verification/types.ts",
    "web/src/features/partner-tenants/api.ts",
    "web/src/features/partner-tenants/index.tsx",
    "web/src/i18n/locales/en.json",
    "web/src/i18n/locales/zh.json",
    "web/src/i18n/locales/zh-TW.json",
    "web/src/i18n/locales/fr.json",
    "web/src/i18n/locales/ja.json",
    "web/src/i18n/locales/ru.json",
    "web/src/i18n/locales/vi.json",
    "docs/openapi/partner-subscription-key.openapi.json",
    "docs/partner-hosted-h5.zh-CN.md",
    "docs/partner-subscription-key-api.zh-CN.md",
    "docs/partner-tenant-api.md",
    "docs/partner-tenant-integration.zh-CN.md",
    "examples/partner-tenant-demo/README.md",
    ".trellis/spec/backend/index.md",
    ".trellis/spec/backend/partner-hosted-h5.md",
    ".trellis/spec/backend/partner-subscription-key.md",
    ".trellis/spec/backend/partner-tenant-checkout.md",
    ".trellis/spec/backend/partner-integration-mode.md",
    ".trellis/tasks/11-13-partner-access-mode/verification.md",
    ".trellis/tasks/11-13-partner-access-mode/implementation-report.e3095490.md"
  ],
  "testsAddedOrUpdated": [
    "model/partner_tenant_integration_mode_test.go",
    "controller/partner_tenant_integration_mode_test.go",
    "middleware/partner_tenant_integration_mode_test.go",
    "router/partner_tenant_integration_mode_test.go",
    "service/partner_tenant_integration_mode_test.go",
    "model/partner_tenant_order_test.go",
    "model/partner_tenant_purchase_session_test.go",
    "model/partner_tenant_subscription_key_test.go",
    "model/partner_tenant_test.go",
    "model/task_cas_test.go",
    "controller/partner_tenant_order_test.go",
    "controller/partner_tenant_purchase_session_test.go",
    "controller/partner_tenant_review_test.go",
    "controller/partner_tenant_subscription_key_test.go",
    "router/partner_tenant_router_test.go",
    "service/auth_token_test.go",
    "service/task_billing_test.go",
    "web/src/features/partner-tenants/__tests__/index.test.tsx"
  ],
  "commandsRun": [
    {"command":"docker version --format '{{.Server.Version}}'","result":"failed","summary":"Docker daemon socket unavailable; no resources created."},
    {"command":"bun run test src/features/partner-tenants/__tests__/index.test.tsx","result":"passed","summary":"Preserved session evidence: 1 file, 7 tests, no skips."},
    {"command":"bun run typecheck","result":"passed","summary":"Preserved final tsgo -b pass; initial two task-local issues corrected."},
    {"command":"./node_modules/.bin/oxlint -c .oxlintrc.json src/features/partner-tenants src/features/auth/secure-verification/types.ts","result":"passed","summary":"Final scoped lint pass."},
    {"command":"./node_modules/.bin/oxfmt --check src/features/partner-tenants src/features/auth/secure-verification/types.ts","result":"passed","summary":"4 matched files formatted."},
    {"command":"bun run lint","result":"failed","summary":"Full-site baseline: 151 errors / 66 warnings; no unrelated fixes."},
    {"command":"node scripts/partner-access-mode/add-missing-keys.mjs && bun run i18n:sync","result":"passed","summary":"49 translations through sanctioned script; 49/49 readback coverage."},
    {"command":"OpenAPI JSON duplicate-field and 403 response assertion","result":"passed","summary":"6 paths, valid JSON without duplicate fields; static only."},
    {"command":"gofmt on touched Go sources/tests","result":"passed","summary":"Syntax/format only, not Go build or runtime."},
    {"command":"python3 ./.trellis/scripts/task.py validate .trellis/tasks/11-13-partner-access-mode","result":"passed","summary":"7 implement and 6 check entries resolve."},
    {"command":"git diff --check && git diff --cached --name-only","result":"passed","summary":"Recovery: no whitespace defects and no staged files."},
    {"command":"task-owned Docker Go build / TestPartnerTenantAccessMode pq suite","result":"not-run","summary":"Blocked by unavailable Docker; 11 source test definitions, 0 executed, skips not measured."}
  ],
  "validationOutput": [
    "Frontend 7/7 DOM tests; typecheck and touched-file lint/format passed.",
    "49/49 new locale values present/nonempty; OpenAPI six paths include 403.",
    "Full-site lint failed; Go/pq/runtime entirely unverified.",
    "Recovery made no business edits and did not rerun unchanged passing tests."
  ],
  "residualRisks": [
    "Go build/type correctness and all pq fresh/upgrade/repeat, locking, HTTP and accepted-payment recovery assertions remain unexecuted until task-owned Docker is available.",
    "Independent trellis-check/source review and M-AC5 authorization-log integration remain pending.",
    "Full-site lint baseline fails; targeted touched frontend files pass.",
    "No real browser/WebView, full application startup, production migration/deployment or real payment verified; old binaries do not enforce immutable admission policy.",
    "Reported deployed group screenshot remains unreproduced; unique group rule is intentionally unchanged."
  ],
  "noStagedFiles": true,
  "diffSummary": "Immutable default subscription_key / explicit hosted_h5 policy across creation proof, migration, locked backend entries and existing management UI; retain mode-neutral accepted-payment core, seven locales, docs/spec and focused tests. No audit-child events/projection.",
  "reviewFindings": [
    "No definite mechanical blocker identified in recovery source self-inspection; this is not independent review or Go compile/runtime proof.",
    "blocker: task Docker unavailable — backend build and PostgreSQL runtime acceptance cannot be attested."
  ],
  "manualNotes": "Task remains in_progress. No stage/commit/archive or resource cleanup. Exact full changed-file inventory, resource ownership and audit metadata boundaries are recorded in verification.md. Protected pre-existing resources were untouched; authoritative recovery report is this file."
}
```
