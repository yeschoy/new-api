# 独立质量审阅：商户接入方式

## 结论

**source-review-ready with runtime blocked**。已审阅基线 `181c99e1b` / `feat/partner-accounts` 上本任务完整未提交 diff，而非仅 timeout 恢复记录。修复 1 处确定的旧测试 fixture 错误及 1 处文档证据歧义；未发现仍需先修的确定业务源码阻断。此结论是人工源码审阅，**不是 Go typecheck/build，也不是 pq 或全部 M-AC 通过**。任务保持 in_progress。

Docker daemon 不可用的既有阻塞继续有效；本轮没有执行 Go build/test/vet、数据库迁移或后端运行测试，也没有尝试 host Go、SQLite/MySQL 替代、启动 Docker Desktop、切换引擎/CLI 或创建资源。**11 个顶层 AccessMode Go 测试只有源码，实际执行数仍为 0；skip 数未测。M-AC5 日志集成仍待第二子任务/父任务。**

## 审阅范围与依据

已加载 check.jsonl 全部 6 条 spec/research、本子任务 PRD/design/implement、verification.md、implementation-report.e3095490.md、recovery-checkpoint.md，以及父任务源 PRD/design。审阅包括：

- 全部 51 个 tracked 变更文件，包含合法保留的 5 个主会话审批/激活记录；未撤销这些记录。
- 新增 `model/partner_tenant_integration_mode.go`、model/controller/middleware/router/service 五包新增测试文件、任务新增模式 spec、翻译脚本及本任务 ledger。
- 模型/启动迁移/事务入口、controller/middleware/router、服务证明、既有测试改造、管理 UI/API/验证类型、七语言、OpenAPI 和相关文档。
- 追踪外部调用与包内 core 的 call sites、普通订阅辅助函数抽取及 TestMain 的定向 bootstrap。

未读取、stage 或清理既有私钥、TEMPORARY_ARTIFACTS.md、根 reports/、web 旧临时登记；未改父任务或第二子任务，未 stage/commit/push/merge/archive/付款/部署/清理。

## 已确认并修复的问题

### F1：H5 跨租户测试 fixture 被新默认模式提前拦截（测试错误，已修）

文件：`controller/partner_tenant_purchase_session_test.go`，`TestPartnerTenantPurchaseStrictBodiesQueriesAndCapabilityScope` 的 foreign tenant。

原 fixture 仍调用默认 `CreatePartnerTenant`，现在得到 subscription_key；`GetPartnerTenantHostedPurchaseSession` 先在锁内检查模式，因此该请求会返回 403，而测试目标是已获准使用 H5 的另一租户访问他人 session 必须返回 scoped 404。仅把断言改为 403 会丢失跨租户 ownership coverage。

修复：明确使用 `CreatePartnerTenantWithIntegrationMode(..., hosted_h5)`，保留原 404 断言并注释原因。该机械修复已检查格式，**未编译/运行**。

### F2：接口文档顶部的 pq 成功证据容易误指本次变更（文档歧义，已修）

文件：`docs/partner-subscription-key-api.zh-CN.md`。

顶部保留的“任务专属 pq 测试及独立审阅已通过”紧邻当前接入方式基线，虽后文写明本次阻塞，仍可能被摘要式阅读误解。现明确限定为历史订阅 Key 基线 `58616beef`，并直接声明本次 Go/pq 验证尚未执行。不改变接口合同，也不伪造新证据。

## 核心源码审阅结果

| 边界 | 源码结论（非运行验收） |
| --- | --- |
| 两模式与默认 | 权威 enum 仅 subscription_key / hosted_h5；严格对象解析器保留字段 presence。真正 omission 默认 subscription_key；null/空/未知/legacy/external 不被默认放行；显式模型 creator 独立验证。坏持久化模式 fail closed。 |
| immutable / proof | create proof 使用有效 action/group/integration_mode；前后端 context 同步。status 只接受 status，rotation 仅空 body 或空对象，附加 mode 拒绝；更新模型没有 mode 写入路径，列表只读。 |
| early 与 locked authority | 路由矩阵使用统一策略提前拒绝。subscription-key create/replay/get/claim/rotate 均调用当前 tenant+secret 锁内 admission；独立 sub_ query 在当前 binding/hash/HMAC 校验后才检查 mode，未从输入 ID/前缀归因。 |
| H5 能力 | session 创建及 exchange/order mutation/replay 读取当前 tenant；公共读取/能力校验统一检查 H5 mode，失败保持 generic 401。订单事务 tenant→session 锁及 strict clock/secret/nonce/期限检查保留；慢 body 前的快照不是写入 authority。 |
| 旧直接 POST / wrapper | 两模式均拒绝，controller 无 fast replay/gateway 路径，导出旧模型 wrapper 无条件拒绝；生产中 unexported external-order core 只由受会话授权 H5 调用。test-only accepted-order fixture 未进入生产代码。 |
| H5 辅助能力 | 账户/Key、额度及 external order/session status 使用当前 pt_ + H5 模型检查；外部身份查询仍限制 external。旧 provisioning wrapper 自身也有锁内 mode 检查；共享 paid provisioning core 不继承该门禁。 |
| 已接受付款 | 没有给共享 binding、内部 order getter、cashier、prepare、notify/return、payment、fulfillment/recovery 增加全局 mode gate；原 EntryMode/IdentitySource/paid facts 不因租户策略改写。 |
| migration | 实际 `migrateDB` 在 broad AutoMigrate 前调用模式 helper；已有列先规范 NULL/空，再 AutoMigrate 添加/收紧默认与非空。显式 H5/未知非空值保留，后者运行时拒绝；没有重写账户、订单或付款身份。DDL/pq 效果仍必须实跑。 |
| 普通 subscription 调用 | `GetPartnerTenantActiveUserSubscriptions` 抽取前后的 ID 校验、事务外 now 取值、排序、plan ownership、reset/save 与 summary 逻辑一致；仅复用事务内 collector 给 H5 quota，没有给普通路径加模式门禁。 |
| 旧测试价值 | 历史模型 payment/recovery 断言保留，通过清楚标识的 accepted-order fixture 建立付款前置事实；controller 付款/重放用真实 H5 session 路径。已删除的旧直接下单 body 校验对应已退休入口，H5 strict body/price/paid/duplicate 覆盖仍在。F1 修复保住了真正的 foreign-session 404 coverage。 |
| Go fixture/bootstrap | 手工核对新增测试所用 imports、函数签名/结果字段及相邻 helper；未发现确定缺 import/签名源码错误。model 与 service 的显式 AccessMode 选择可避开旧 SQLite TestMain；controller/router/middleware 无新增 SQLite TestMain。此检查不等于编译，fixture/运行风险仍未排除。 |
| UI / locales / group | 默认/取消重开通过事件 reset，异步查询不重置 H5；proof 和请求取同一选择；只读实际模式。七语言各增 7 项并有脚本/sync 工作流。分组仍仅排除 default/auto/任何商户占用（含停用），中文未占用组不被排除，唯一索引未改；截图环境未复现。 |

## 验证与证据边界

本 checker 实际运行：

| 命令 | 结果 | 范围 |
| --- | --- | --- |
| `gofmt -l controller/partner_tenant_purchase_session_test.go` | 通过，无输出 | 本轮 fixture 修复的语法/格式检查；不是 typecheck。 |
| `git diff --check` | 通过 | 完整 tracked diff 无 whitespace error。 |
| `git diff --cached --name-only` | 空 | 无 staged files。 |

此前 implementation/恢复记录保留的 **7 DOM tests、tsgo typecheck、scoped oxlint/oxfmt、49/49 locale、OpenAPI 静态检查**未重跑，因为本轮未改前端或 OpenAPI。它们是先前记录的证据，不冒称本 checker 新执行。全站 lint 的 **151 errors / 66 warnings** 基线失败也未重跑或扩大修复。

仍未运行：task-owned Docker Go build/test/vet、pq fresh/pre-column/nullable/repeat migration、HTTP/锁等待/slow-body/付款交付恢复。未来需要执行现有 `^TestPartnerTenantAccessMode` 五包定向 pq suite，并在已检查隔离的任务 Docker fixture 中覆盖本轮修复的 `TestPartnerTenantPurchaseStrictBodiesQueriesAndCapabilityScope`；不能以旧 SQLite fixture 在 host 上执行替代本任务 pq 验收。没有缺 DSN skip/no-tests 结果可计入通过。

M-AC1/2/3/4/6 的 backend 行为目前只完成源码审阅；M-AC7 有既有 focused frontend 证据但无真实浏览器验收；M-AC5 明确未满足。本轮不是 full application startup、生产迁移、真实网关/付款或部署验收。

## 给日志子任务的可继续合同

- 枚举：`PartnerTenantIntegrationSubscriptionKey` / `PartnerTenantIntegrationHostedH5`。
- 策略及有界错误：`RequirePartnerTenantIntegrationMode` / `ErrPartnerTenantIntegrationMode`；已鉴权 pt_ 错入口 → `403 integration_mode_mismatch`，公开 H5 → generic `401 invalid_purchase_access`。
- `PartnerTenantFromContext` 在成功 pt_ 验证后写入。仅可投影合法 mode/tenant ID；不能把含 SecretHash 的整个对象或原始 bearer 传给日志。该上下文在 tenant rate-limit 检查之后才写入，rate-limit 事件不能假设已存在可信租户上下文，需由日志子任务在验证点安全捕获。
- 中间件快照不能代表慢 body/锁等待后的 authority；日志子任务仍需从实际锁内验证结果捕获单独安全 receipt，成功业务 commit 后再发射。当前没有 issuance/claim/rotation/query receipt API。
- path/body order/subscription/session ID 不是关联证明；只有成功 scoped owning lookup 可填入。未知/失效 sub_ 不猜租户，不伪造 OAuth client/user；公共通用失败不虚构归属。
- 日志故障不回滚付款/交付，不在事务锁内做日志网络/跨库 I/O；禁止凭证、hash/seed、请求体、能力 URL。正常 LOG_DB 下实际“拒绝→写入→后台筛选”留待 M-AC5 集成。

## 残余风险 / 后续门禁

1. Go 编译/类型与测试 fixture 的真实可运行性尚未验证；源码审阅无法排除后端缺陷。Docker/pq 恢复后必须补齐必要定向运行证据，不能发布为全部 AC 已通过。
2. pq 真实 DDL/default/NOT NULL/重复迁移、并发锁等待及 accepted-payment 恢复尚无本次运行证据。
3. 日志子任务未实施，M-AC5/父任务集成仍为开放门禁；receipt 与 rate-limit 的安全关联需在第二子任务验证。
4. 既有全站 lint 失败；无真实浏览器/WebView、完整启动、生产迁移/部署、真实付款验收。旧二进制不执行新策略，不保证混合版本安全。
5. 用户分组截图仍未复现；不将保留唯一规则的本地 DOM 回归描述为修复了部署环境问题。

本轮实际修改仅：上述旧 controller 测试、订阅 Key 文档、verification.md、本 quality-review.md，以及本任务 ledger 中 3 个工具自动截断临时输出的确切路径登记。无业务代码改动、无新增测试执行或运行环境/数据库资源操作。
