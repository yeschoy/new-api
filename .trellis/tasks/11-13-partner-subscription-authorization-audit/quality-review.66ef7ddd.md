# 独立 check 最后有界收尾：生产日志权限 gate 与 mode spec

## 结论

本轮仅完成指定两项源码收尾：**生产 AdminAuth + PartnerOAuthClientRead HTTP 权限测试源已补；mode spec 已等义整理为七节。** 没有改生产授权规则或其他业务功能。

前次 `quality-review.md` 的两项缺陷修复结论仍有效；其中“生产 gate 测试仍缺”现由本报告更新为：**已有 actual production registration 回归源码，但尚未编译、尚未运行。** 本报告是此次指定 authoritative 输出，旧报告保留为历史 checkpoint。

可继续主会话的本地未验收 checkpoint 工作。**不是 L-AC 全部满足、runtime 通过或允许完结归档。Go build/test/vet、pq、ClickHouse 执行均为 0，skip 数未测。** 沿用 Docker unavailable 阻塞，不重复预检或使用 host Go/其他引擎。

## 1. 精确新增测试与真实链路

文件：`router/partner_tenant_authorization_audit_test.go`

新增顶层测试：`TestPartnerTenantAuthorizationAuditProductionAdminPermission`。

- 使用实际 **`SetApiRouter(engine)`** 注册 `/api/partner-oauth/authorization-logs`，经过生产 **DisableCache -> AdminAuth -> RequirePermission(PartnerOAuthClientRead) -> GetPartnerOAuthAuthorizationLogs**。没有复制该路由的 test-only projection/permission 注册，也没有 c.Set 注入 role/id 绕过认证。
- 抽取已有自包含 router pq 初始化为 `setupPartnerTenantAuthorizationAuditRouterPQ`，供原 actual-router 测试与新测试共用；保留原行为、显式 `TEST_PARTNER_ACCESS_AUDIT_POSTGRES_DSN`、独立保留 schema、静默 SQL。新增计划前缀 `pt_authorization_audit_admin_` 已登记，当前未创建任何实际 schema。
- 在该 fresh isolated pq schema AutoMigrate User/UserSession/CasbinRule/AuthzRole；调用真实 `authz.Init` 初始化权限，调用真实 `authz.SetUserPermissions` 给一个 admin 设置 read=false，调用真实 `service.CreateLoginSession` 生成短期 dashboard JWT 与持久 session，再由生产 auth 解析/验证。没有复用历史 SQLite/drop-table setup，也没有调用 SavePolicy。
- 人工追踪了这些 production helper 的依赖：router 包没有 TestMain；依赖包的 `_test.go`/TestMain 不因 import 执行；不调用 service/authz 旧 test fixture。authz.Init 的 built-in policy seed/reset 仅作用于本测试刚创建的隔离空 policy 表，不是共享表 reset 或旧 drop-table 测试。
- 沿用现有 router authz 测试的 serial singleton-enforcer 模式；不 t.Parallel，不启动 policy sync goroutine。model DB/LOG_DB、database types、Redis、SessionSecret、master/rate 设置由 fixture/cleanup 处理。初始化的 enforcer 是包内 singleton，没有新增生产 snapshot/reset API；因此本源码也不宣称任意 parallel/full-suite 全局隔离已验证。

### 五个 HTTP case

| 请求身份 | 期望 |
| --- | --- |
| 匿名 | 401，不能读取 fixture order |
| 普通用户 live session | 403，不能读取 fixture order |
| 无 read 权限 admin live session | 403，不能读取 fixture order |
| 有 read 权限 admin live session | 200，实际 controller/filter/projection 返回正确 row |
| root live session | 200，实际 controller/filter/projection 返回正确 row |

两个成功身份都使用 `tenant_id=9007199254740993` 筛选：预置两个不同 tenant 的安全 lifecycle rows，必须 total=1，tenant_id/subscription_id/key_version 保持精确 decimal strings，并断言 action、status=0 和 no-store。拒绝场景也断言 no-store。旧 `/admin-logs` tests 保持 projection-only 标签，不冒称它们证明权限。

当前总计 **9 个 audit + 11 个 mode 顶层 Go 测试源码**。新测试覆盖的是必要权限矩阵与 tenant filter，不扩展到全站 auth 或 PAT scope 测试。

## 2. 七节 mode spec（等义整理）

文件：`.trellis/spec/backend/partner-integration-mode.md`

整理为：

1. Scope / Trigger
2. Signatures / API Boundaries
3. Contracts（原 admission matrix、startup/migration/rollback、UI/group、safe audit handoff）
4. Validation / Error Matrix
5. Good / Base / Bad Cases
6. Tests Required / Evidence Boundaries
7. Wrong vs Correct

保留原所有产品/安全规则：仅两模式、omission 默认/显式坏值拒绝、immutable/proof 单次消费、无切换、H5 external identity、锁内当前授权、public H5 generic 401、retired direct POST 两模式拒绝、shared accepted-payment 中立、NULL/空历史回填及未知非空保留拒绝、H5 repeat 保留、专属分组含停用占用、UI异步刷新不重置、rollback/mixed-fleet 风险和 Docker runtime 阻塞。新增表格/示例只是表达已有合同，不改变规则。

`PartnerTenantAuditAdmissionError` wrapper、safe-principal/rate 顺序和 lifecycle status=0 的具体规则引用 audit spec，不把它们当作前置 mode task 的运行通过证据。没有修改父/前置 task 审批或记录。

Audit spec 只做对应机械更新：8 -> 9 个测试源，production permission coverage 从 missing 改为 source-present/uncompiled/unrun。没有新增功能或前端/locale 改动。

## 3. 本轮实际静态检查

- `gofmt -w router/partner_tenant_authorization_audit_test.go`，最终 `gofmt -l` 无输出。仅源码解析/格式检查，不是 Go compile/typecheck。
- `python3 ./.trellis/scripts/task.py validate .trellis/tasks/11-13-partner-subscription-authorization-audit`：通过，8 implement / 7 check entries。
- Read-only Python assertions：两份相关 spec 都为七节；测试调用 actual SetApiRouter、production session/authz helpers；生产注册确含 AdminAuth/READ gate；无 mock principal/SQLite/drop-table/SavePolicy 调用；9 audit/11 mode 顶层源码数。最终通过。首次粗 token 搜索被源码注释“No SavePolicy”误触发，改为排除注释的 call-aware 断言后通过；没有把它当作 Go 失败或修改业务逻辑。
- `git diff --check`：通过。
- `git diff --cached --name-only` / empty check：空，无 staged files。

人工核对 imports、model view 字段、SessionSecret/role 类型、CreateLoginSession 和 authz 初始化/override 签名、fresh fixture schema、真正路由注册与权限顺序；**不等于测试可编译/可运行的保证**。未改前端/locale，所以未重跑既有 DOM/typecheck/scoped lint/locale checks；未重跑全站 lint 基线。

## 4. 文件改动

本次 follow-up 仅：

- `router/partner_tenant_authorization_audit_test.go`：抽取已有安全 pq fixture、新增真实 production admin gate 测试。
- `.trellis/spec/backend/partner-integration-mode.md`：等义七节规范整理。
- `.trellis/spec/backend/partner-authorization-audit.md`：测试源计数/权限覆盖状态机械同步。
- `.trellis/tasks/11-13-partner-subscription-authorization-audit/verification.md`：明确 source-present、runtime-unrun 与本轮命令。
- `.partner-access-audit-temporary-artifacts.md`：计划 schema 前缀和本报告登记，无 DSN/secret。
- 本 `quality-review.66ef7ddd.md`。

保留整个前次合法 diff、旧 quality-review 和所有受保护文件；未 stage/commit/push/archive/cleanup、生产访问/付款、Docker启动/引擎切换、hostGo、下载或创建运行资源。

## 5. 残余风险 / 下一门禁

1. **0 Go build/test/vet/pq/CH**；所有新增权限/lifecycle/lock/rate 测试源仍须在任务专属 Docker/pq 中编译运行。缺 DSN/skip/no-tests 不能计作通过。
2. 实际 production 权限 gate 的源码缺口已补，不再列为“未写测试”；它的运行结果、fixture可运行性及全局状态隔离仍未验证。
3. 必要 pq fresh/upgrade/repeat/default/separate LOG_DB、并发/故障隔离、父任务端到端集成仍开放。无 live CH、完整启动、真实 browser/mobile/WebView、真实付款/生产迁移/部署证据。
4. best-effort LOG_DB / commit 后崩溃可丢事件，未新增 outbox/跨库原子保证；不回滚已支付或凭证业务结果。这一批准边界保持不变。

本轮无新确定生产业务源码阻断；结论限于所要求的两项有界源码收尾，不是全面 runtime 验收。
