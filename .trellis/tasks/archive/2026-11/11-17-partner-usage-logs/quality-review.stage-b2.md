# B 阶段第 2 部分（自身 / API-Key 双表读取）质量复核

> 复核人：trellis-check 子代理。开始 07:38:20，硬预算 25 分钟，07:55 停止审查并收尾。
> 基线：`HEAD` = `8457836d9`，B 阶段改动未提交。
> 证据标签：**源码推理**（读源码/驱动源码推导）/ **仅类型检查**（gofmt、离线 build、vet）/ **已执行**。
> **Go 测试执行数：0**（Docker daemon 不可用；禁止宿主 `go test`）。本记录中没有任何一条是运行证据。

## 1. 结论摘要

- 未发现会改变**普通用户**（独立表无行、或 LOG_DB 无独立表）结果的缺陷；六个 reader 在探测之后执行的语句、排序、count、格式化与 `HEAD` 一致（§4，源码推理）。新增的唯一行为差异是“探测失败 → 该次读取失败”，属设计要求（失败不得当作无行）。
- 未发现越权/泄漏缺陷：归属只来自 controller 已鉴权的 `c.GetInt("id")` / `c.GetInt("token_id")`，谓词是每个分支内的绑定参数；序列化类型仍是 `model.Log`。
- **修复 1 处代码缺陷（中）**：存在性检查的非原子窗口可把已存在的表报成 absent（§2 F1）。
- **补强测试**：新增 3 个顶层用例、强化 1 个（§3）。四个测试文件现有 **20** 个顶层用例（9 + 9 + 1 + 1）。
- 五项门禁全部成立（§6）。
- 有 4 项需要主会话/用户知悉或决定（§7 D 表中标“需知悉/决定”的行）。

## 2. 发现

| # | 级别 | 位置 | 证据（源码推理） | 处理 |
| --- | --- | --- | --- | --- |
| F1 | 中 | `model/log_owned_union.go` `dedicatedLogTablePresent` | 四个驱动的 `HasTable` 都吞掉目录查询错误返回 false（§5）。原实现先查独立表、再查 `logs` 对照，两条语句非原子：进程启动后首次成功探测之前，若“探测失败 → 第一次目录查询瞬时失败 → 对照成功”，已存在的表被报成 absent，成员该次读取走单表路径，**静默丢失独立表行**（不是错误）。违反“absent 不得用于已存在的表”。 | **已修（两步）**：(a) 对照成功后再查一次独立表；(b) 判定“表存在”时先记住 handle 并**重试一次探测**，成功返回其结果，再失败才报错——否则 (a) 会让“表恰好在两次目录查询之间被建出”的那次读取报错。误报 absent 的窗口缩小为“失败-失败-成功-失败”，仍非原子，登记为残留风险 R1。 |
| F2 | 低（测试） | `model/partner_tenant_usage_union_test.go` `…OrdinaryUserKeepsLegacyPath` | 导出只比 `id:request_id`，token-recent 只比 `Len`；“与旧路径相同”的断言实际只比行数。 | **已修**：两者改为与旧语句结果逐行全字段 `require.Equal`。 |
| F3 | 低（测试缺口） | `model/partner_tenant_usage_request_test.go` | “存在性检查失败 → 错误”只在取消 ctx 的三个 reader 上断言；`GetUserLogs` / `GetLogByTokenId` / `SumUserUsedQuota` 内部用 `context.Background()`，没有 reader 级用例。 | **已补**：`TestPartnerTenantUsagePresenceCheckFailureFailsEveryReader`。 |
| F4 | 低（测试缺口） | 同上 | 两个请求窗口 union 没有生成 SQL / ClickHouse 契约与参数顺序断言；`wallet_quota_deducted` 与非零 `saved_quota` 混合、负时区无用例。 | **已补**：`…RequestWindowGeneratedSQL`、`…SummaryMixedBillingMatchesSingleTable`。 |
| F5 | 提示 | `model/log_owned_union.go` `sumDedicatedUserUsedQuota` | group 过滤直接用 `logGroupCol`，未走 `ownedLogGroupColumn` 回退；与 legacy `SumUsedQuota` 一致，生产上 `initCol` 必然已执行；未初始化进程里带 group 过滤会报错（fail-closed）。 | 未改（与旧行为一致，无正确性影响）。 |
| F6 | 提示 | `router/partner_tenant_usage_union_test.go` export 子用例 | 依赖进程全局 `UserExportEnabled` 默认值 true，未在用例内固定。 | 未改（低价值）；登记。 |

未发现：分支外的归属谓词、`UNION`（去重）、按本地 id 或 request_id 的 join/去重、私有列进入响应、对管理员 reader 的改动。

## 3. 修复清单

1. `model/log_owned_union.go`：`dedicatedLogTablePresent` 追加第二次 `HasTable(独立表)`，注释说明仍非原子；`dedicatedLogOwnerHasRows` 把探测抽成闭包，未记住的 handle 上判定“表存在”后重试一次探测。已记住 handle 的失败、存在性检查失败、absent 三条路径的返回值不变。
2. `model/partner_tenant_usage_union_test.go`：`TestPartnerTenantUsageUnionOrdinaryUserKeepsLegacyPath` 的导出、token-recent 改为全字段等价。
3. `model/partner_tenant_usage_request_test.go`：新增 3 个顶层用例（见 F3、F4），新增 import `errors`、`strings`。
4. `verification.md`：B2b.1 表格 absent 行与未迁移节点开销更正；新增 “B2c trellis-check 复核” 小节。

未动：B1 文件、`controller/log.go`、`model/log.go`、`model/log_summary.go`、`model/log_owned_request.go`、两个 router 测试、`.trellis/spec`、C/D 阶段。

## 4. 逐 reader 的旧路径等价论证（源码推理，对照 `git show HEAD:`）

共同前提：`dedicatedLogOwnerHasRows` 返回 `(false, nil)`（无行或表 absent）后，各 reader 落入的代码块与 `HEAD` 逐行相同（`git diff HEAD -- model/log.go` 只有 4 个纯插入 hunk）。额外开销：表存在时**每次读取恰好 1 条**索引探测（`idx_ptul_user_time` / `idx_ptul_token_time` 前缀，`LIMIT 1`）；表不存在时 1 次失败探测 + 3 次目录查询（不缓存 absent）。

| reader | 探测位置 | 旧路径是否逐句相同 | 错误值差异 |
| --- | --- | --- | --- |
| `GetUserLogs` | `filter.apply` 之后（过滤错误仍先返回、值不变） | 是：同一 `tx`、`Limit(logSearchCountLimit).Count`、`logs.id desc`（CH 用 `clickHouseLogOrder`）、`formatUserLogs` | 探测失败返回既有的 `Failed to query logs` |
| `StreamUserLogs` | `filter.apply` 之后 | 是：同一 `streamLogs(tx, "logs.id desc", …)` 与编号/脱敏回调 | 探测失败：ctx 已结束返回 `ctx.Err()`，否则固定无内容错误；controller 在 `ctx.Err()!=nil` 时直接返回、否则输出既有 `Failed to export logs` |
| `GetLogByTokenId` | 函数开头 | 是：`Model(&Log{}).Where("token_id = ?").Order("id desc").Limit(MaxRecentItems)` 未动 | 探测失败返回 `Failed to query logs`（旧路径此处返回驱动原始错误） |
| self 统计 | `SumUsedQuota` **之后** | 是：`SumUsedQuota` 以原参数原样调用，无行时原样返回其 `Stat`；管理员 `GET /api/log/stat` 仍直接调 `SumUsedQuota` | 探测失败返回既有 `Failed to query statistics` 且 `Stat{}`（不返回部分和） |
| `GetUserRequestLogs` | 函数开头，用请求 ctx | 是 | 探测失败返回与旧路径相同文案 `查询日志失败`；既有 dropped-table / cancel 用例的期望仍成立（表被删 → 探测失败、对照 `logs` 也看不到 → 错误，文案相同） |
| `GetUserLogSummary` | 函数开头，用 15s ctx | 是，见下 | 取消/超时：旧为 `query.Rows()` 的 ctx 错误，新为 `ctx.Err()`，同类；非 ctx 探测失败为通用 `Failed to query logs`（旧为驱动原始错误文本） |

`GetUserLogSummary` 循环拆分逐句比对：扫描目标由 `var log Log` 变为循环体内 `var row ownedLogRow` 的 `&row.Log`（`ScanRows` 目标类型仍是 `*Log`）；`row` 每次迭代新分配，`previousRow` 不会被下一次扫描覆盖；同请求比较由 `compareRequestOutcomes(&log, previousLog)` 变为 `compareOwnedRequestOutcomes(row, previousRow)`，后者先调用未修改的 `compareRequestOutcomes`，非 0 直接返回，为 0 时比较 `LogSource`（两行都是 0）与 `LogEventId`（都是空串）得 0，`> 0` 判定完全一致；累加语句、顺序、`Rows()` / `ScanRows` / `rows.Err()` 错误原样上抛；`rows.Close()` 由闭包内 `defer` 在所有路径执行。失败分类抽成 `logViolationFeeMarked` / `logOutcomeFailed`，布尔表达式与原式相同。

## 5. 探测状态机（对照驱动源码）

`HasTable` 吞错的证据（均为只读查看依赖源码）：

- PostgreSQL：`gorm.io/driver/postgres@v1.5.9/migrator.go:210-217`，`RunWithValue` 的返回值被丢弃，查询 `information_schema.tables WHERE table_schema = CURRENT_SCHEMA()`（`CurrentSchema`，同文件 617-630）。
- MySQL：继承 `gorm.io/gorm@v1.25.12/migrator/migrator.go:333-342`。
- SQLite：`github.com/glebarez/sqlite@v1.11.0/migrator.go:29-35`。
- ClickHouse：`gorm.io/driver/clickhouse@v0.6.0/migrator.go:180-191`。
- 字符串参数只设置 `stmt.Table`（`migrator.go:61-75`），migrator 持有的会话保留 ctx 与 silent logger。

| 状态 | 结论 |
| --- | --- |
| rows / no rows | 探测成功即记住 handle；成立。 |
| absent | 四驱动上“独立表 false + `logs` true + 再查独立表 false”才成立；不缓存。 |
| probe failed（表存在） | handle 已记住 → 错误；未记住但目录显示表存在 → 重试一次探测，仍失败 → 错误；成立，绝不返回无行。 |
| check failed | `logs` 也看不到 → 错误；取消的 ctx 属此类（两次目录查询都失败）。 |
| 缓存 | 存的是全局 `LOG_DB` 指针本身，不是 `WithContext`/`Session` 派生指针，比较不会被派生会话破坏；`atomic.Pointer` 无数据竞争；被缓存的 handle 仍被引用，不会发生地址复用误判；换 handle 即重新判定。 |
| 管理员独立表端点 | 不经过此回退（`model/partner_tenant_usage_query.go` 未调用 `dedicatedLogOwnerHasRows`）。 |

残留：**R1** 存在性检查仍非原子（仅在进程首次成功探测之前可达）。**R2** PostgreSQL `search_path` 多 schema：migrator 只看 `CURRENT_SCHEMA()`，查询按整个 `search_path` 解析；若 `logs` 不在首个 schema 且独立表尚未创建，会判为 check failed（所有用户的 self 读取报错，直到迁移建表）；GORM AutoMigrate 自身也用同一规则，常规部署两表同在 `CURRENT_SCHEMA()`，未在 pq 上验证。建议（未做，属 B1 文件）：迁移成功后预置 `dedicatedLogTableKnown`，可在主节点上彻底消除 R1。

## 6. 门禁证据

1. writer 未启用：`git grep --untracked insertPartnerTenantUsageLog -- model controller router middleware service relay common` 排除测试后只有 `model/partner_tenant_usage_log.go` 的定义与注释（**已执行的静态检索**）。
2. 管理员默认 reader 未改：`model/log.go` 的 diff 仅 4 个插入 hunk，位于 `GetLogByTokenId`、`GetUserLogs`、`GetUserRequestLogs`、`StreamUserLogs`；`model/log_outcome.go` diff 0 行。
3. 归属来源：六个 reader 的唯一生产调用点在 `controller/log.go:103,130,207,237,297` 与 `controller/log_summary.go:25`，均传已鉴权 id / token_id；`log_owned_*.go` 不引用任何 Tenant owner / membership 符号。
4. 响应类型仍为 `model.Log`；`ownedLogRow` 无 json tag、不出包。
5. 四个既有测试文件与 `HEAD` 的 diff 为 0 行。

## 7. 双表路径与 D 项评估（源码推理）

双表路径核对结果：分支内归属为绑定参数；`UNION ALL` 仅一处；`partner_tenant_usage_logs AS logs` 经 GORM `Table()` 原样输出，未改的 `LogFilter.apply`（`logs.` 前缀）在两个分支内生效；子查询变量由 GORM `Statement.AddVar(*DB)` 顺序并入外层，占位符与参数同序；count / order / offset / limit 作用于整个 union；全序为 `created_at desc, id desc, log_source, log_event_id`；扫描目标 `ownedLogRow` 的私有列按列名映射，只读 `ChannelName` 不参与；64 位平台 `int` 可容纳 Int64；请求折叠用未修改的 `compareRequestOutcomes` 与原始本地 id，空 request_id 不折叠；汇总由数据库排序、与单表共用一个循环；self 统计 = 原样 `SumUsedQuota` + 按已鉴权 user_id 的独立表部分，任一失败整体失败。

| 实现方标记项 | 评估 |
| --- | --- |
| 成员列表/请求结果由 `id desc` 变为全局时间序 | 与 design §5 一致；仅在该用户有独立表行后发生。**需知悉**：成员翻阅旧历史时顺序依据由 id 变为时间。 |
| 完全相同事实取独立表行 | 一致（design 允许内部来源 tie-break，方向确定即可）。 |
| 双表 count/分页扫描该 owner 全部过滤后行，无分支 top-N 下推 | 功能正确；`logs` 没有 `(user_id, created_at)` 索引，重度成员每页都要排序其全部旧行。**需知悉/可能需决定**：必须有 pq `EXPLAIN` 证据后再定是否下推或加索引，属运行门禁。 |
| 成员汇总按 request_id 在库内排序无索引 | 与旧单表汇总同一代价类别（窗口 ≤ 10 天）；一致。 |
| MySQL 两表字符串 collation 不同时可能拒绝 union | 真实风险，方向为成员读取报错（fail-closed），普通用户不受影响；PostgreSQL 不涉及。**需决定**：是否为 MySQL 加显式 COLLATE，或作为已披露限制。 |
| `logGroupCol` 回退 | 一致；仅服务于从未执行 `initCol` 的进程（router 测试进程）。 |
| 删除 `…ProbeFailureIsAReadFailure` | 已确认被 `TestPartnerTenantUsageProbeFailuresAreReadFailures` 后半段（建一个无归属列的同名表，六个 reader 全部断言报错且不泄漏）覆盖。该用例只在自己新建的 schema 内 `CREATE TABLE`，可接受。 |

## 8. 测试源码审查（均未执行）

- 夹具：每次调用新建 `pt_usage_*` schema，不 DROP / TRUNCATE / DELETE 既有数据；缺 DSN 为失败不是跳过（`setupPartnerTenantUsagePQ` 先 `require.NotEmpty`）。全局 `DB` / `LOG_DB` / 库类型 / 列名由 cleanup 恢复；`dedicatedLogTableKnown` 不恢复，但按 handle 绑定，换 handle 即失效。
- SQL 捕获：回调注册在 handle 的共享 callbacks 上，silent 会话与 dry-run 子查询都会经过，断言非空洞（其它用例断言恰好 N 条探测语句）。
- 仍缺的用例：`/api/log/token` 真实路由伪造参数（router 测试进程不执行 `initCol()`，`GetTokenByKey` 的 `commonKeyCol` 为空，需先有列初始化夹具）；探测/union 路径的应用 logger 与 DEBUG GORM 秘密标记负向用例；真实路由上 rpm/tpm 的数值类型；MySQL/SQLite/ClickHouse 的任何实跑。

## 9. 命令与真实退出码

| 命令 | 结果 | 性质 |
| --- | --- | --- |
| `gofmt -l model controller/log.go router/…_union_test.go router/…_request_test.go` | 无输出，rc=0 | 仅格式 |
| 离线 `go build ./model ./controller ./router ./middleware ./service` | rc=0 | 仅类型检查 |
| 离线 `go vet` 同五包（含测试文件） | rc=0 | 仅类型检查 |
| `git diff --check` | rc=0 | 仅格式 |
| `go test` | **未运行，执行数 0** | — |

以上命令均在最后一次 Go 改动（07:54）之后重跑。

未创建任何临时文件（输出只在 shell 变量中），`TEMPORARY_ARTIFACTS.md` 无需登记。

## 10. 未关闭的运行门禁

全部 20 个用例及 B1 用例、既有回归在 owned Docker / 隔离 PostgreSQL 的首次执行；pq 上 union 的类型解析、`ownedLogRow` 扫描、`HasTable` 真实返回与 `search_path` 行为、取消行为、`EXPLAIN`；ClickHouse / MySQL / SQLite 均无实跑。

## 11. 本次没有做到的

- 两个 router 测试文件已读完，但没有逐项核对其依赖的进程全局默认值（如 `UserExportEnabled`、限流开关）在同包其它用例之后是否仍成立。
- 没有核对 `model/partner_tenant_usage_union_test.go` 中每个期望数值，只抽查了排序、统计与汇总期望。
- 没有审查 ClickHouse 下 UInt8 `log_source` 扫描到 `int` 的驱动细节，也没有核对 MySQL/SQLite 的 `HasTable` 之外的方言差异。
- 新增的 3 个用例与强化的断言只经过类型检查，其期望值是手工推导的，可能在首次运行时需要调整。
- 探测重试（F1 的第二步）没有专门的用例：既有用例只覆盖“表存在但两次探测都失败 → 错误”，没有覆盖“第一次失败、重试成功”。
