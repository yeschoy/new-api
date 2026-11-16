# B 阶段第 1 部分（B1a + B1b）质量复核记录

状态：**复核完成（源码/类型检查层面）；运行验证仍阻塞**。开始 07:19:43，复核与修改于 07:34 前结束（硬预算 25 分钟内）。

- 复核范围：独立表/迁移（B1a）、管理员 list/stat 读取 API（B1b）。B2a/B2b（自身/Key 双表读取）不在本次范围，未审未改。
- 基线：`HEAD = 8457836d9`，工作区未提交。本次未执行 `git add` / `commit` / `push`。
- **Go 测试执行数：0**（Docker daemon 不可用，未在宿主机运行任何 `go test`）。
- 结论标注约定：【源码推理】/【仅类型检查】/【已执行】。除 gofmt、build、vet、python3 文档检查外，本记录所有结论均为【源码推理】。

## 1. 发现

| # | 严重度 | 位置 | 证据 | 处理 |
| --- | --- | --- | --- | --- |
| F1 | 中（性能，需决定） | `model/partner_tenant_usage_log.go:33-52` 索引集；`model/partner_tenant_usage_query.go` `ListPartnerTenantUsageLogs` | 新表 5 个索引均不以 `created_at` 开头（`(tenant_id,created_at,id)` 等）。管理员页的默认查询是“不带商户过滤 + 时间窗 + `ORDER BY created_at DESC, id DESC LIMIT`”，PostgreSQL 无法用现有索引按序取前 N 行，只能全表/全窗扫描后 top-N 排序，`COUNT(*)` 同理。对照 `logs`：`idx_created_at_id` 是 `(created_at,id)`（`model/log.go:59-61`）。design §2 列出的就是这 5 个索引并写明“具体组合依真实 pq EXPLAIN 校验”。 | **未改**（索引集属于 design 契约，且无法实跑 EXPLAIN）。建议主会话决定是否在首次建表前追加 `idx_ptul_time (created_at,id)`；表建好并有数据后再加索引成本高得多。列为运行门禁。 |
| F2 | 低（已修） | `controller/partner_tenant_usage_log.go` `partnerTenantUsageLogUnavailable` | 统计是整窗流式扫描、无超时；前端切换筛选/离开页面取消请求时，`rows` 以 context 取消结束 → 原实现照样打 error 级 “database error” 日志，把“调用方离开”误报为数据库故障。 | 已修：请求 context 已结束时不写 error 行，仍返回固定 503 文案。真实数据库失败（context 未结束）日志不变，原有测试断言不受影响。 |
| F3 | 低（可测性，已修） | `model/partner_tenant_usage_query.go` | list / stat 的排序串内联在函数里，ClickHouse 的 `event_id` tie-break 无法在无库条件下做契约检查（实施者自报缺口）。 | 已修：抽成纯函数 `partnerTenantUsageListOrder(clickHouse)` / `partnerTenantUsageStatOrder(clickHouse)`，行为逐字不变；新增纯契约测试。 |
| F4 | 低（MySQL 专有，未改） | `GetPartnerTenantUsageStat` 折叠 | 相邻性依赖数据库 `ORDER BY request_id`，相等性用 Go 字节比较。MySQL 大小写不敏感/PAD SPACE 排序规则下，只差大小写或尾部空格的两个 request_id 会被数据库视为相等而交错，Go 侧会多算请求数；`request_id = ?` 过滤同理按排序规则匹配。request_id 由服务端生成（时间串 + 前缀 + 8 位随机），碰撞概率可忽略；PostgreSQL（验收目标）默认确定性排序规则不受影响。 | 未改，仅披露。 |
| F5 | 低（32 位构建，未改） | `partnerTenantUsageOutcomeLog` | `Log.Id/Quota/PromptTokens/CompletionTokens` 是 `int`；在 32 位构建上 `int(row.Quota)` 会截断。这些值只进入 `compareRequestOutcomes` 的并列决胜，不进入求和（求和走 `big.Int.SetInt64`）。服务端为 64 位平台。 | 未改，仅披露。 |
| F6 | 文档（已修） | `docs/partner-tenant-api.md` Errors 表 | 解析器会拒绝“`start_timestamp` 晚于有效结束时间（省略 end 时即当前时间）”，文档 400 行未列出；统计端点整窗扫描的成本也未提示。 | 已补两句英文说明。 |
| F7 | 记录不准确（已修） | `verification.md` B1a.8 | B1a 段声称最终 build/vet 在最后一次改动之后执行，其作者已报告不准确。 | 已更正并指向本记录的命令结果。 |

未发现阻塞级缺陷；五条门禁均未被违反（见第 3 节）。

## 2. 修复与新增

业务源码（行为变化仅 F2）：

- `model/partner_tenant_usage_query.go`：抽出两个排序纯函数（F3），SQL 文本逐字不变。
- `controller/partner_tenant_usage_log.go`：调用方已取消时不写 error 日志（F2）。

测试源码（**均未执行**）：

- `model/partner_tenant_usage_query_test.go`：+`TestPartnerTenantUsageQueryOrderContract`（纯函数，无库：两类驱动的 list/stat 排序串）；+`TestPartnerTenantUsageQueryChannelName`（pq：`channel_id>0` 时主库缺表 → 固定读取错误且不返回部分行、统计不触主库；自建最小 `channels` 表后批量路径命中/未知为空；缓存路径不读主库）。
- `controller/partner_tenant_usage_log_test.go`：HTTP 层断言 2×MaxInt64 的 quota 合计 `"18446744073709551614"` 及由精确和一次换算的 `"6148914691236517204.666667"`。
- `router/partner_tenant_usage_log_test.go`：+子用例，把同一份 `other` 写入默认 `logs`，分别用 admin/root 会话读默认 `GET /api/log/` 与新端点，断言两处 `other` 字符串逐字相等（角色在新端点看到的不多于默认页）。

文档：`docs/partner-tenant-api.md` Errors 表补充（F6）。

## 3. 门禁证据（【源码推理】，基于 diff 与 `git grep --untracked`）

1. **writer 未启用**：`git grep --untracked -E "insertPartnerTenantUsageLog|PartnerTenantUsageLog\{"` 于 `model controller router middleware service relay common`（排除 `_test.go`）除定义文件外无命中；`insertPartnerTenantUsageLog` 仅有定义，无生产调用方。
2. **默认管理员 reader 未改**：`git diff HEAD -U0 -- model/log.go` 的 4 个 hunk 分别落在 `GetLogByTokenId`、`GetUserLogs`、`GetUserRequestLogs`、`StreamUserLogs`；`controller/log.go` 唯一 hunk 在 `GetLogsSelfStat`。`GetAllLogs`、`StreamAllLogs`、`streamLogs`、`SumUsedQuota`、`SumUsedToken`、`CountOldLog`、`DeleteOldLogBatch`、`LogFilter.apply` 及 controller `GetAllLogs`/`GetLogsStat`/`ExportAllLogs` 无 diff。`model/log_outcome.go`、`model/log_other.go` 无 diff（`compareRequestOutcomes` 未修改）。
3. **新端点只读独立表**：`partnerTenantUsageReadSession` 固定 `Model(&PartnerTenantUsageLog{})`；唯一的另一处读取是主库 `channels` 的 `id,name` 批量查询（或缓存），无 union、无回退 `logs`。
4. **迁移**：`MigratePartnerTenantUsageLogs` 仅 `LOG_DB.AutoMigrate(&PartnerTenantUsageLog{})` 或 ClickHouse 显式 CREATE + TTL 同步；不读/写 `logs`，无自动删除（SQL 驱动），无主库/付款表，无 FK/跨库 join。两条 `InitLogDB` 路径均接线、错误上抛、主节点条件与相邻迁移一致；`LOG_DB == nil` 返回固定错误。
5. **权限**：两条路由 `logRoute.GET(..., middleware.AdminAuth(), ...)`；PAT 规则为显式 `accessTokenScopeRule("log:read")`；`router/api-router.go` 仅新增这两行及注释，root-only `/api/partner-tenants` 未动。gin 路由树：`/api/log/partner-tenants`、`/stat`、`/options` 均为静态段，无冲突。

## 4. 逐项核对结论（【源码推理】，引用依赖源码）

表与迁移：

- PostgreSQL DDL（`gorm.io/driver/postgres@v1.5.9/postgres.go:194-234` `DataTypeOf`；`gorm@v1.25.12/schema/field.go:320-327` `type:` 标签覆盖 DataType）：`id` → `bigserial`；带 `type:bigint` 的列 → `bigint`；`type int` → `bigint`；`is_stream` → `boolean`；无 size 的字符串 → `text`；`event_id`/`request_id` `varchar(64)`、`tenant_name` `varchar(64)`、`identity_source` `varchar(24)`、`upstream_request_id` `varchar(128)`，与来源列宽一致（`PartnerTenant.Name` varchar(64)、`IdentitySource` varchar(24)、`Log.RequestId` varchar(64)、`Log.UpstreamRequestId` varchar(128)）；`content`/`other` 为 `text`，无超限 varchar。
- 零值与 default：`schema/field.go:237-267` 为 bool/int/string 的 `default:` 解析出非 nil `DefaultValueInterface`；`callbacks/create.go:249,322-324` 表明此类列始终出现在 INSERT 中，零值写入的就是同一个零值 → `false`/`0`/`''` 往返正确。只有 `id`（自增，`DefaultValueInterface == nil`）在为零时被省略。
- `created_at`：`schema/field.go:292` 在 `autoCreateTime:false` 时两个分支都不成立（且此判断先于 `type:` 覆盖），`AutoCreateTime == 0`，不会被 GORM 覆盖。
- 索引：`idx_ptul_*` / `ux_ptul_*` 前缀在仓库中唯一（`git grep ptul`），长度 < 63；MySQL 上被索引的字符串列均为 `varchar(64)`，键长无风险。`event_id` 唯一 + `default:''`：绕过插入函数直接写空 `event_id` 时第二行会唯一冲突；生产唯一入口 `insertPartnerTenantUsageLog` 总是覆盖为随机 `ptu_` + 32 hex，测试夹具均显式赋值。
- ClickHouse：显式 `CREATE TABLE IF NOT EXISTS`，64 位字段为 `Int64`，`is_stream UInt8`、`type Int32` 与 `logs` DDL 同型；`ORDER BY (created_at, event_id)`、按月分区；TTL MODIFY/REMOVE 逻辑与 `syncClickHouseLogTTL` 等价；不依赖 AutoMigrate。**无 live ClickHouse 验证。**
- 插入函数：`gorm.go:307-308` `Session` 以传入 Logger 覆盖（含 `Debug()` 得到的 handle）→ silent；错误为固定文本，不包裹驱动错误；`TenantId/AccountId/UserId <= 0` 或非 consume/error 类型拒绝；无回退、无双写。

管理员 list / stat：

- list、count、stat 均经 `PartnerTenantUsageFilter.apply`，全部为绑定参数，文本过滤为 `=` 精确匹配（`%`/`_` 不是模式）；时间窗在 controller 以 `limitLogTimeRange` 对所有调用者限界（最小 1 天，`MaxRangeSeconds`）。`total` 与 `record_count` 同一谓词。
- 排序确定：`created_at DESC, id DESC`；ClickHouse 用 `event_id`。
- 统计：`request_id ASC, created_at ASC, id ASC` 使同请求相邻；空 `request_id` 每行独立；outcome 由未修改的 `compareRequestOutcomes` 选择，`event_id` 仅在 rank==0 时决胜；失败分类用共享的 `logViolationFeeMarked` / `logOutcomeFailed`；consume 行 quota/token 全量累加（含重试与收费失败），error 行不加；`request_count = succeeded + failed` 由增减对称保证；过滤先于折叠。
- 精确求和：列 `bigint` → `int64` 字段 → `big.Int.SetInt64` → `big.Int.Add` → `String()`；CNY 走 `decimal.NewFromBigInt(sum, 0)` → `AmountDecimal`，全程无 float64/32 位整数，可超过 int64。
- 流式循环：`row` 在循环体内声明，每次迭代新变量，`chosen = &row` 无别名问题；`defer rows.Close()`；`rows.Err()` 与 `ctx.Err()` 均检查。
- CNY：每响应一次 `CurrentPartnerTenantQuotaCNYConfig()` 快照；统计金额由原始和一次换算；配置不可用 → `null`，原始字段不变。
- DTO：64 位 ID/quota/token 均为十进制字符串；`other` 经 `formatLogOtherJSON`（admin/root 与默认页同一函数）；GORM 模型所有字段 `json:"-"`，不被序列化；`channel_name` 通过缓存或主库批量查询，无跨库 join，失败 → 固定 503（与默认 `GetAllLogs` 返回错误的处理一致）。
- controller：严格解析（未知/重复/畸形/非规范/越界 → 400，统计端点拒绝 `p`/`page_size`），`Cache-Control: no-store`，503 只记录固定文案 + request_id。

## 5. 实施者自述决策评估

| 决策 | 评估 |
| --- | --- |
| 单次流式扫描中用 `math/big` 在 Go 侧求和，而非 SQL `SUM` | **一致**。折叠需要解析 `other` JSON，与既有 `GetUserLogSummary` 的“不依赖数据库专有 JSON 函数”做法一致；求和精确。 |
| 超长窗口返回 400 `Invalid parameters` 而非“cannot exceed N days” | **可接受，建议主会话确认**。已在文档列明；但 D 阶段前端无法从响应得知上限天数，若需要友好提示可改为返回既有本地化消息（需改解析器签名，本次未动）。 |
| `start_timestamp=0` / `end_timestamp=0` 视为省略 | **一致**（`limitLogTimeRange` 对默认日志搜索同样把 0 当缺省）。 |
| 文本上限 191 / 255 / 64 字节 | **一致**（64 与列宽一致；191 与 MySQL 列宽一致；255 为宽松上限，无风险）。 |
| `p` 上限 1000000 | **一致**（最大 offset 1e8，int 安全；深分页慢但有界）。 |
| ClickHouse 行 `id` 输出 `"0"` | **一致**（文档已说明，`event_id` 为身份）。 |
| 统计为整窗流式扫描，仅受最大日志范围限制，无行数上限/超时 | **需用户/主会话决定**。管理员专用且窗口有界，但跨全部商户、带 `other` 文本并要求数据库按 `request_id` 排序，数据量大时单次调用可能很重；D 阶段页面每次筛选都会调用。建议在 pq 上实测后决定是否加服务端超时或行数上限。本次未改。 |

## 6. 命令与真实退出码

均在最后一次 Go 改动之后、07:29:57–07:30:07 执行；输出只在 shell 变量中，未建临时文件。

| 命令 | 退出码 | 性质 |
| --- | --- | --- |
| `gofmt -l` 于本范围 7 个 Go 文件 + `model/main.go`、`router/api-router.go`、`middleware/access_token_routes.go` | 0，输出为空 | 【已执行】格式检查 |
| `GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOFLAGS=-mod=readonly "$GO126" build ./model ./controller ./router ./middleware ./service` | 0，无输出 | 【仅类型检查】 |
| 同上 `vet`（含测试文件类型检查） | 0，无输出 | 【仅类型检查】 |
| `python3`（标准库，heredoc）解析文档本节 2 个 JSON 示例 | 0 | 【已执行】item 28 个字段、类型与 DTO 一致；250000×7.3÷500000=3.650000；750000×7.3÷500000=10.950000；3=2+1；6000=3600+2400；record_count=total=4 |

**Go 测试执行数：0。**

## 7. 测试数量与仍缺用例

本范围 4 个测试文件的顶层测试数（复核后）：`model/partner_tenant_usage_log_test.go` 7、`model/partner_tenant_usage_query_test.go` 8（原 6，+2）、`controller/partner_tenant_usage_log_test.go` 2、`router/partner_tenant_usage_log_test.go` 2，共 **19**（原 17）。

测试源码审读结论（【源码推理】）：夹具只在自建 `pt_usage_*` schema 内操作，无 DROP/TRUNCATE/DELETE；`DB`、`LOG_DB`、数据库类型、`IsMasterNode`、`MemoryCacheEnabled`、`QuotaPerUnit`、`USDExchangeRate`、`SessionSecret`、`gin.DefaultErrorWriter` 均有 LIFO 恢复；直接 `db.Create` 的行都显式给了唯一 `event_id`；缺 DSN 为 `require.NotEmpty` 失败而非 skip（`setupPartnerTenantIsolatedPQ` 内的 `t.Skip` 分支在此之前已被 `require` 挡住）；逐条手算了折叠用例（15 行 / 9 请求 / 4 成功 / 5 失败 / quota 145 / token 11）与精确和常量，未发现与实现矛盾或必然通过的断言。

仍缺（未写）：

- 商户子账号会话被新端点拒绝（鉴权路径不看归属，等价于已有的“普通用户会话”用例；需要建账号映射夹具，未运行条件下风险高，未写）。
- ClickHouse list/stat **生成 SQL** 的整句契约（现只有排序串纯函数契约，无 DryRun 方言夹具）。
- 取消请求时不写 error 日志（F2）的 HTTP 层断言。
- 无商户过滤的默认窗口查询的 `EXPLAIN`（F1）。

## 8. 残留运行门禁

- 全部 19 个测试从未执行；需在任务自有 Docker + 隔离 PostgreSQL（`TEST_PARTNER_USAGE_POSTGRES_DSN`）运行 `^TestPartnerTenantUsage`，确认实际选中数、无 skip。
- pq 实测：fresh/repeat/共享/独立 LOG_DB 迁移、实际 DDL 与索引、重复 AutoMigrate 不产生破坏性 ALTER、F1 的 EXPLAIN、统计整窗扫描耗时。
- ClickHouse、MySQL、SQLite：仅源码推导，未运行。
- B2a/B2b、C、D 阶段不在本次范围。

## 9. 未做到的事项与过程披露

- 未逐行复读 `verification.md` B1b 全段，只更正了 B1a.8 的不准确陈述并追加 `B1b.12` 复核小节；`implement.md` 的状态块未改。
- 未审 `model/log_summary.go` 中除 `logViolationFeeMarked` / `logOutcomeFailed` 以外的 B2 改动（按范围排除）。
- 未写第 7 节列出的仍缺用例；A 阶段共享夹具（`setupPartnerTenantUsagePQ` / `…HTTPPQ` / `…RouterPQ`）只核对了全局状态的保存/恢复与 schema 隔离，未重审其全部内容。
- 过程披露：追加 `B1b.12` 时一次编辑误吞了紧随其后的分隔线和 `## B 阶段 — B2a 自身/Key 双表读取` 标题的前半段，已立即按原文恢复（`grep '^## '` 复核五个二级标题齐全；`git diff --stat` 相对 HEAD 仅有新增行）。B2a/B2b 段落正文未被触碰。
- 未产生任何中间文件（命令输出只在 shell 变量中，python 脚本经 heredoc 传入），因此 `TEMPORARY_ARTIFACTS.md` 无需登记，也未修改。
- 未执行 `git add` / `commit` / `push`，未启动 Docker，未运行 `go test`，未改 `go.mod` / `go.sum`，未读取或改动受保护路径。
