# 商户日志执行与验证计划

状态：父任务规划已于 2026-11-17 获用户批准实施；本子任务已 start。阶段进度与真实证据见 `verification.md`，未勾选项即未完成。

## A. 先交付共享 owner 契约

> A 阶段状态（2026-11-17）：**source-ready / runtime-blocked**。下列勾选仅表示源码与测试源码已写完并通过离线 `gofmt` / `go build` / `go vet`（vet 只做类型检查）；**Go 测试执行数为 0，PostgreSQL / 真实路由运行验证待补**（Docker daemon 不可用）。实际签名、权限矩阵、偏差与阻塞项见 `verification.md`“A 阶段交接”。A 的 source-ready 不等于日志任务完成。

- [x] 读取父 PRD/design/共享 research 和 model/log.go、三写入口、LOG_DB 初始化/现有脱敏/真实路由；复核 writer census，没有遗漏新增调用。（已读；census 复核发现的额外写入口/读取方记入 verification A.10，留给 B/C 阶段处理。）
- [x] 增加单用户及批量 safe owner、request-local 快照、无秘密商户 options；禁止额外全局负缓存。owner 查询失败不得按普通用户写回默认表。（源码完成：原语三态返回、失败不会被报成非成员；“不写回默认表”的 writer 行为属于 C 阶段，尚未实现。运行验证待补。）
- [x] 两个 scope 明确的 options 入口复用同一安全投影；增加真实路由/PAT/字段白名单回归。（源码与回归测试源码完成；回归**未执行**。）
- [x] 冻结共享签名/字段/错误语义，登记供用户分类消费。测试只在 owned Docker，未有 runtime 不宣称 owner 全验收。（签名已冻结并登记于 verification A.1–A.3；未宣称验收。）
- [x] A 阶段交接写入 verification.md：owner/options 实际签名、字段/权限、文件所有权、测试执行数与阻塞项；仅表示可被其他子任务消费，不勾选整个日志交付完成。（已写入；测试执行数 0。）

## B. 表与读取先行

> B1a 步骤状态（2026-11-17）：**source-ready / runtime pending**。新表模型、幂等迁移 helper（已接入共享与独立 LOG_DB 两条初始化路径，含 ClickHouse 显式 DDL/TTL）、一个**无生产调用方**的插入函数及 7 个测试源码已写完并通过离线 gofmt / build / vet；**Go 测试执行数 0**，pq 实际迁移/持久化未验证。下列各项均**未**勾选：管理员 list/stat、self/API-Key reader、union、切写尚未开始。详见 `verification.md`“B 阶段 — B1a 表与迁移”。

> B1b 步骤状态（2026-11-17）：**source-ready / runtime pending**。新表的管理员读取侧已写完：单一类型化 filter（list / count / stat 共用一个 builder）、`GET /api/log/partner-tenants` 与 `/stat`（`AdminAuth` + PAT `log:read`）、冻结的响应 schema 已写入 `docs/partner-tenant-api.md`、10 个测试源码；离线 gofmt / build / vet 通过，**Go 测试执行数 0**。writer 仍无生产调用方，默认管理员 reader 未改。下列各项仍**不**勾选：第 3、4 项只有源码与文档、无运行证据且有未写出的用例；self/API-Key reader、union、切写、前端未开始。偏差与缺口见 `verification.md`“B 阶段 — B1b 管理员查询与统计”。

> B2a 步骤状态（2026-11-17）：**source-ready / runtime pending**。自身/Key 读取的双表基础设施（按已鉴权 `user_id` / `token_id` 的 `UNION ALL` 投影，先探测、无新表行则原单表路径原样执行）与 `GetUserLogs`、`StreamUserLogs`、`GetLogByTokenId`、self 统计（`SumUserUsedQuota`）已写完；11 个测试源码；离线 gofmt / build / vet 通过，**Go 测试执行数 0**。writer 仍无生产调用方，默认管理员 reader 未改。下列第 5–7 项仍**不**勾选：`GetUserRequestLogs` / `GetUserLogSummary`（B2b）未开始，且无任何运行证据。未写出的用例与需确认事项见 `verification.md`“B 阶段 — B2a 自身/Key 双表读取”。

> B2b 步骤状态（2026-11-17）：**source-ready / runtime pending**。（1）探测加固：独立表不存在 = 成功判定（走原单表路径），表存在但探测失败 / 存在性检查失败才是读取失败；只缓存阳性并绑定当前 `LOG_DB` handle；B2a 改过的 4 个既有 controller 测试文件已还原为与 `HEAD` 字节相同。（2）`GetUserRequestLogs`、`GetUserLogSummary` 的双表路径已写完，汇总的折叠/累加循环新旧路径共用一份。7 个新测试源码（并删除 1 个被取代的 B2a 用例）；离线 gofmt / build / vet 通过，**Go 测试执行数 0**。writer 仍无生产调用方，默认管理员 reader 与 `compareRequestOutcomes` 未改。下列第 5–7 项仍**不**勾选：六个 self reader 源码齐备但无任何运行证据，且有未写出的用例。详见 `verification.md`“B 阶段 — B2b 请求结果/汇总与探测加固”。

- [ ] 新表显式字段/TEXT/64位/短前缀索引/event_id，不复用 Log index tags。覆盖默认 LOG_DB=DB 与独立日志库初始化，迁移幂等且不搬历史。
- [ ] ClickHouse 显式 DDL/TTL 保持现有驱动支持；SQL 新表不新增清理，默认清理范围不变。
- [ ] 新表分页/count/stat 使用同一过滤；新 ID/quota 字符串，admin/root 脱敏与安全错误。
- [ ] 冻结 list/stat/options 的 response schema、分页/字符串聚合、nullable CNY、过滤与 bounded options 参数；同步新端点 API 文档和契约测试。outcome 选择与失败分类分离，覆盖收费失败/流失败，requests=succeeded+failed。
- [ ] 逐个适配 self list/stat/requests/summary/export/token-recent。ownership 下推两个分支后再 union/count/排序/分页；默认 admin list/stat/export 不 union。
- [ ] 回归同本地 ID、空 request_id、失败重试成功、consume 与异常费用、时区/窗口、流式导出取消和既有开关。
- [ ] 列出双表逐列投影/类型/别名与各驱动策略；pq 实跑联合流，CH 检查类型与生成 SQL；现有 logs 前缀过滤和固定 Model 的流读取须显式适配。普通旧表用户保持原行为，历史新表读取不受当前 owner 查询过滤。
- [ ] B 阶段迁移/兼容 reader 通过后才允许进入 C 切写；记录 fresh/upgrade/repeat、同库/分库与 reader 实际证据。

## C. 切写与全站统计

- [ ] 仅消费/错误专用入口分流；通用 createLog 及非目标类型不重定向。
- [ ] 真实调用覆盖 text/audio/websocket/task 正向消费和可记录 error；抑制/legacy funding 禁止路径不扩权。
- [ ] 归属与 LOG_DB 故障安全告警、不回默认表、不阻塞既有已结算扣费；LogQuotaData/全站计数仍一次。
- [ ] 核对三 writer 原整对象 params/content/raw error 输出，Tenant/未知归属不能绕过安全告警；秘密标记覆盖应用 logger 与 GORM DEBUG，不只验证角色读取投影。
- [ ] 预置旧商户行、写入新商户/普通订阅行，证明默认旧历史保留、新行单表隔离、自身连续可查。

## D. 前端与金额集成

> D 阶段状态（2026-11-17）：**前端 source + DOM（mock 传输）已执行**：`web/` 下 typecheck / 定向 oxlint / oxfmt / build:check 均 rc=0，`src/features/partner-usage-logs` 2 文件 20 用例通过，四目录合计 47 文件 642 通过（trellis-check 复核后：修复 5 项缺陷，本目录 3 文件 35 用例、四目录 48 文件 657 通过，全站 lint 仍为既有基线 151/68；见 `quality-review.stage-d.md` 与 `verification.md` D.10）。**无浏览器运行、无真实数据（C 阶段 writer 未启用）、后端端点从未对数据库执行**。勾选项后标注证据类型；未写的 DOM 用例与未关闭门禁见 `verification.md`“D 阶段 — 管理员页面（前端）”。任务未完成。

- [ ] CNY 子任务 converter 契约/测试已交付后才接入，不先写第二套算法。（D 阶段备注：前端未写任何换算算法，只渲染服务端 `quota_cny` 字符串及不可用/微额状态，有 DOM 证据；但“converter 契约/测试已交付”这一前置条件本派发未核实，故不勾选，由主会话依据 CNY 子任务记录判断。）
- [x] 实现 features/partner-usage-logs 与管理员 developer-shell 独立路由/菜单；复用通用表格/安全明细，拒绝不安全 Number 转换。（已执行 DOM 证据：路由守卫、导航可见性、>2^53 字符串、详情 Dialog 键盘开关与 `other` 原样显示。无浏览器运行。）
- [x] 筛选、summary、分页同 scope，包含会话/角色的 cache key；跨会话不可使用旧 placeholder。（已执行 DOM 证据：同窗口同过滤、跨查看者缓存隔离、过滤变更回第 1 页；分页控件点击与商户/类型点击级用例未写。）
- [ ] 七语言通过现有 add-missing-keys.mjs + i18n:sync；补范围说明、空/错/不可用/无限额/微额展示。（D 阶段备注：26 键 × 7 语言已经脚本写入 + 同步，范围说明、空态、错误、不可用、微额展示均已实现并有执行过的 DOM/locale 用例；**“无限额”展示未实现**——日志/统计冻结契约没有 unlimited 字段，本页无处呈现。因条目未全部满足，不勾选，由主会话决定该子项是否适用。）

## E. 执行命令（均为批准后的计划）

在已登记的 owned Docker runner 内，使用显式空隔离 PostgreSQL DSN `TEST_PARTNER_USAGE_POSTGRES_DSN`，新增 TestMain 选择分支避免误跑 legacy SQLite bootstrap：

```bash
go test -mod=readonly ./model ./controller ./router ./middleware ./service -run '^TestPartnerTenantUsage' -count=1 -v
```

测试名/DSN 是计划接口，须先实现并确认实际选中用例、无缺 DSN skip；测试夹具应隔离 schema、留存证据、不 DROP 旧资源。覆盖 fresh/repeat/default/separate LOG_DB、实际 DDL/持久化/目标 EXPLAIN、真实 SetApiRouter 鉴权、writer 与各 reader。其他 driver 只保持现有兼容并披露未运行项，不扩泛化数据库矩阵。

另建立受影响既有回归清单：`model/log_format_test.go`、`model/log_other_test.go`、`model/log_outcome_test.go`、`model/clickhouse_log_test.go`、`controller/log_export_test.go`、`controller/log_summary_test.go`、`controller/relay_error_log_test.go` 及相关 service/任务计数测试。先检查 TestMain/fixture，必要时把目标断言接入安全自包含 pq suite；登记实际命令/选中数，不盲跑旧 SQLite/清表夹具。新前缀命令通过不等于旧回归通过；新迁移/共享响应还须按父计划运行受影响前组模式/授权审计断言。

在 web 使用现有依赖：

```bash
bun run test -- src/features/partner-usage-logs src/features/usage-logs src/features/users
bun run typecheck
bun run lint
bun run build:check
bun run i18n:sync
```

先登记现有全局 lint 基线，如有无关报错另报，不顺手修全仓；另跑本次 TS/TSX 目标 oxlint。所有新翻译写入必须先过 sanctioned script，不能用同步代替翻译。本地浏览器仅任务自有 fixture，无真实 API/Key/网关。

## F. 检查与提交门禁

- [ ] A-U1–A-U8 的证据逐项齐全，全部个人入口都有回归，不以一个 summary 测试代表全部。
- [ ] trellis-check 验证日志故障、秘密标记和 DEBUG SQL redaction；静态/DOM/pq/浏览器边界明确。缺 Docker/pq 时保持阻塞，不部署/归档为已验收。
- [ ] 后续已验证契约写 spec；按 exact paths 提交日志业务/测试/UI/文档/Trellis 变更。
- [ ] 记录实际临时资源；清理须同意且不删 Trellis。新表/data 保留，writer 回滚时保留兼容 reader。
