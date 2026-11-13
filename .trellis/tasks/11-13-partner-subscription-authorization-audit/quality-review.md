# 独立质量审阅：订阅 Key 授权审计

## 1. 结论

**修复后可继续源码集成（source-review-ready）；Go/pq 运行门禁仍阻塞，不是完整 L-AC 或父任务验收通过。** 本轮独立审阅发现并修复 2 个确定问题，补强必要的生命周期、关联和时序回归源码。当前未发现另一个必须先修的确定业务源码阻断；但新增/既有 Go 测试均未编译、未执行，无法据此排除编译、fixture、DDL 或并发运行缺陷。任务保持 in_progress。

**实际执行：Go build=0，Go test=0，Go vet=0，pq=0，ClickHouse=0；skip 数未测。** 沿用已知 Docker unavailable 阻塞，没有重复预检、host Go、SQLite/MySQL 替代、启动 Docker Desktop、替换 CLI/代理/引擎、下载或新建资源。所有“覆盖”均指下面列明的测试源码，不冒充通过结果。

## 2. 范围、上下文与前置保护

已读取 check.jsonl 全部 **7** 个 spec/research、本任务 PRD/design/implement/implementation-report/verification、父任务源 PRD/design、前置 mode quality-review 及 handoff fingerprint。审查当前 HEAD `181c99e1b` / `feat/partner-accounts` 的未提交任务改动，包含 audit delta、前置 mode 与共享 paid/key/H5/普通 OAuth/server/admin 边界，不把前置合法改动当作待回滚内容。

fingerprint 位于 **前置任务目录** `../11-13-partner-access-mode/audit-handoff-fingerprint.json`：60 文件中 39 个保持字节一致，21 个不同；差异包括既有实施者已说明的 audit implement.md 审批交接差异、audit 预期 shared source/index/locales，以及本 checker 修复的 H5 锁内错误携带方式。未改父任务/前置任务审批或记录。结合前置独立审阅和 fingerprint 核对，本轮重点追踪全部 audit 增量及其共享影响，并复核模式矩阵、迁移启动、证明上下文、旧测试改造、UI/API、七语言和对外文档的一致性。

未读取既有私钥、TEMPORARY_ARTIFACTS.md、根 reports/ 或 web 旧临时登记；没有 stage/commit/push/merge/archive、生产/付款/清理。工具自动截断输出及新增测试计划 schema 前缀仅登记于项目 `.partner-access-audit-temporary-artifacts.md`，未创建实际数据库资源。

## 3. Findings：已直接修复

### F1 — 凭证哈希 locator 仍可能进入 SQL 诊断（安全，已修）

- 位置：`model/partner_tenant_subscription_key.go:114–125`。
- 证据：独立查询和续费先调用 `findPartnerTenantSubscriptionKey`，原函数使用普通 `DB.Where(secret_hash=...)`，发生在 silent business transaction **之前**。全局 DEBUG/Info 或带查询的错误诊断可能插值完整 sub_ 哈希；后续事务静默并不能保护这一步。
- 修复：locator 同样使用 `partnerTenantSecretDB(DB)`；不改变查询、凭证校验、锁或公共协议。
- 回归源码：给业务 DB 配置 Info SQL writer，调用实际 locator，断言输出为空；现有未知/旧 key 断言仍保留。**未编译/运行。**

### F2 — H5 锁内模式拒绝记录了旧 middleware mode（审计准确性，已修）

- 位置：`model/partner_tenant_purchase_session.go:93–95`、`model/partner_tenant.go:269–271`。
- 证据：session 创建、hosted account provisioning 在锁内验证当前 secret/mode 后仍返回 bare `ErrPartnerTenantIntegrationMode`。controller 没有新的安全 receipt 可取，会沿用 body 读取前的 middleware principal；慢 body/锁等待后策略变化时，拒绝日志的 mode 与实际拒绝快照不一致。创建后 immutable 不意味着可以用陈旧快照记录未知/损坏持久化状态；该防御合同在现有 mode 测试中也明确要求。
- 修复：使用已有 `PartnerTenantAuditAdmissionError{Receipt: PartnerTenantAuditPrincipal(&tenant)}`。仅携带安全当前 principal，保留 errors.Is、403 和固定公开错误；公共 H5 capability generic 401 路径不因此获得租户归因。
- 回归源码：慢 body 后改变持久 mode，H5 session/account 与 rotation 各断言一次正确动作/原因、当前 tenant/mode、没有输入目标关联；claim 另加真实 Tenant 行锁等待后的 receipt 断言。**未编译/运行。**

## 4. 必要测试源码补强及仍缺内容

原 **6** 个 audit 顶层测试对基础投影、每次 read/claim/rotate、拒绝/解析/恢复有价值，但不能单独支撑全部 AC。本轮在原文件扩展，并新增 2 个顶层测试，现在是 **8 audit + 11 mode** 顶层源码：

| 补强 | 具体内容 |
| --- | --- |
| 提交后 issue / rollback | 原注入失败发生在 key create、receipt 尚未形成；改为最终 order fulfillment-marker UPDATE 失败，验证 receipt 已捕获后事务回滚也没有 issue。 |
| 实际 recovery scan | 调用 `RecoverPartnerTenantSubscriptionOrders`，初次交付只有一条非 HTTP issue；同订阅续费成功不发新的 issue。 |
| paid delivery LOG_DB failure | 独立日志库 Create callback 故障，实际 recovery 仍保留 paid/fulfilled/可领取凭证；告警无注入秘密；恢复日志库后 fulfilled retry 不伪造丢失的 issue、不重复建 key。 |
| ownership / stale receipt | foreign tenant claim/rotate 不填他人的 order/subscription/user；旧 sub_、未知 sub_、错误 subscription source 不复用之前可信 receipt。 |
| 时序 / current mode | claim Tenant 行锁等待、独立 query 已验证 binding 的当前 mode；H5 session/account 与 rotate 慢 body 请求各产生一个正确快照事件。 |
| 真实 tenant budget | 原人工 1 次限制替换为实际 `PartnerTenantBearer` 的第 1200/1201 次边界，独立 principal ID 隔离共享内存状态，验证 Retry-After 及 rate 前捕获的可信 tenant。没有改业务 budget。 |

修改的测试文件：`model/partner_tenant_authorization_audit_test.go`、`controller/partner_tenant_authorization_audit_test.go`。原 router panic/parser/order 测试保留。人工核对 imports、调用签名、DTO/模型字段、callback table/时点、隔离 fixture 与清理顺序；**gofmt 可解析不等于这些测试能够编译或运行**。

仍明确缺少：**实际生产 admin authentication + PartnerOAuthClientRead 权限 HTTP 回归**。目前 `/admin-logs` 测试是 projection-only，绕过生产 gate；DOM 权限测试也不是后端授权证明。生产注册仍为 DisableCache + AdminAuth + 原 READ permission，源码没有新增公开日志入口或修改授权资源，但这一点需要真实 gate 测试验证。完整 HTTP fault/竞争组合、进程崩溃窗口也不是上述有限源码的穷举保证。

## 5. 全链路源码结论（非 runtime 证明）

| 边界 | 审阅结论 |
| --- | --- |
| LOG_DB / migration | 两条实际 startup log 初始化路径都调用同一迁移；非 CH AutoMigrate 新字段有零/空默认且无 destructive reset；CH fresh CREATE 后实际执行六条 defaulted `ADD COLUMN IF NOT EXISTS`，不止生成未调用的 DDL。非 CH 保留 GORM Oauth 命名，CH CREATE/ALTER/write 保留既有固定表名，实际 production GORM config 没有新 prefix 策略。fresh/upgrade/repeat/default/separate LOG_DB 均有针对性源码，未实测。 |
| 旧 OAuth/server/account | 原 action/reason 与旧字段/types 保留；新 tenant 元数据对旧事件为空，专门 admin view 仅将新 ID/version 输出为字符串。未把 pt_/sub_ 伪装成 OAuth consent，也没有改变旧 ADMIN security audit。 |
| IDs / filter | tenant/subscription/version 是 signed-int64 storage、canonical decimal-string admin projection；tenant_id filter 严格正值、规范文本和溢出检查，重复/未知 key 拒绝。前端不 Number 化新 ID。旧数值字段未被无关精度重构。 |
| allowlist / lifecycle | 五个 action 与实际 emitter/UI 同步；固定原因、mode/order 格式及动作组合受限，拒绝任意原始错误。status=0 仅 nil-context credential.issue；HTTP 普通事件仍 100–599，后台 HTTP 显示 —。 |
| receipt / 归因 | safe struct 独立于 persistence/public DTO；claim/rotate/read 从实际锁内 principal/owning binding 捕获，复用指针先清空。成功 rotation/replay 是实际结果版本，失败不宣称新提交版本。unknown/foreign/old key 和公共 H5 generic 失败不从输入 ID 编造归属。 |
| paid / issue | receipt 仅 initial subscription-key 新关系分支形成；外层 transaction 出错直接返回，只有成功 commit 后才写 LOG_DB。renewal/fulfilled retry 没有新 receipt。未给 shared cashier、notify/return、内部 getter、prepare/payment/fulfillment/recovery 加入口模式 gate。日志写入不在业务锁内。 |
| 每请求结果 / recovery | recorder 位于 request-ID/privacy 后、strict/auth/rate/recovery 前；独立 query 固定识别 read，handler接管的 claim/rotate 用操作结果，否则前置 credential/mode/parser/rate/recovery 拒绝为 denied。内层 io.Discard scoped recovery 的 c.Next/recover 返回后，外层 recorder 能看到终态；未新增吞 panic 或双发事件的另一 recovery/defer 层。validated pt_ 在 tenant budget 前捕获安全 principal。 |
| 普通功能 / cache | 普通 OAuth/server route/auth 与 admin READ 资源未替换；rate backend error 仅改安全诊断、不改结果。原 Query user/session-scoped keys、fresh mount refetch、权限/错误隐藏 stale rows 行为保留；audit UI不请求 root-only tenant列表。前置 ordinary subscription collector 抽取与 shared payment 中立边界未被 audit 扩大。 |
| docs / spec | 新 audit spec 保持 7 节可执行合同，补充本轮缺陷与源覆盖边界；没有为满足格式而改写前置 mode spec 的产品规则或前置 task 记录。文档明确无 runtime/生产/真实付款证明。 |

## 6. 实际验证

本 checker 实际执行：

1. `gofmt -w` 五个 touched Go 文件；最终 `gofmt -l model/partner_tenant_authorization_audit_test.go controller/partner_tenant_authorization_audit_test.go model/partner_tenant.go model/partner_tenant_purchase_session.go model/partner_tenant_subscription_key.go`：无输出，仅格式/解析证据。
2. `python3 ./.trellis/scripts/task.py validate .trellis/tasks/11-13-partner-subscription-authorization-audit`：通过，8 implement / 7 check entries。
3. read-only Python fingerprint 和 source-contract assertions：通过；7 节 spec、recorder 顺序、io.Discard、silent locator、两处 current-principal wrapper、8/11 测试源数。均不是编译或 SQL 执行。
4. `git diff --check`：通过；`git diff --cached --name-only`：空。

本轮没有改 TS/TSX/locale，故引用既有 **12 audit DOM / 7 mode DOM、typecheck/scoped lint、70/70 + 49/49 locale** 证据，不冒称新执行。全站 **151 errors / 66 warnings** lint 基线未重跑或无关修复。

实际 Go/pq/CH 执行仍为 0。Docker 恢复后由主会话登记任务资源、检查隔离 DSN/保留 schema，再在 task-owned runner 执行 audit 与 mode 两套定向 suite、受影响包 build/vet；不得把无 DSN skip/no-tests 当成通过，也不要运行旧 drop-table/all-driver fixture 代替。

## 7. 残余风险与下一门禁

- **L-AC6 未满足**：真实 pq fresh/pre-column upgrade/repeat/default/separate LOG_DB/故障隔离以及受影响启动迁移未运行；CH 仅有 DDL 合同源码，无 live engine 证据。
- **L-AC1–4 backend 仅源码审阅和测试源**：新补 lifecycle、ownership、rate、lock/body、paid log-failure 均必须编译实跑；不宣称签发/每次访问/拒绝完整验收通过。
- **L-AC5 有既有 frontend/static 证据但不完整**：实际生产后台 READ-permission HTTP 回归仍缺，无 real browser/mobile/WebView 验收。
- LOG_DB 是同步 best effort，不是 outbox/跨库原子账本。日志库故障或 business commit 后进程崩溃可丢事件；成功 paid/key 操作不能被日志失败回滚，重复 fulfilled 不能制造替代 issue。这是已批准保证边界，不应在最终摘要隐藏。
- 无完整应用启动、生产迁移、真实渠道/付款或部署验收；旧二进制不执行 immutable mode 策略，不保证混合版本安全。前置 mode 的 runtime/父任务端到端集成门禁仍开放。

本 checker 修改：3 个业务 Go 文件、2 个 audit 测试源、audit spec、项目临时产物 ledger、本 verification.md 和本报告；无前端/locale、父/前置记录、staged 文件或运行环境资源变更。主会话可据此继续源码集成与安排 Docker 验证，不能把此 checkpoint 归档成全部 AC 已完成。
