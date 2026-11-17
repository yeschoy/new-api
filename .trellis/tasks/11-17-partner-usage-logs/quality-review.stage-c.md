# Stage C（写入分流）独立质量复核 — trellis-check

时间：2026-11-17 09:08–09:30 UTC。范围：`git diff 0935b5f1d..HEAD`（C1 `65902706c` + C2 `13a7c41b2`）：`model/log.go`（三个 writer 函数体）、`model/partner_tenant_usage_writer.go`、`model/partner_tenant_usage_writer_test.go`、`service/partner_tenant_usage_paths_test.go`、五个旧夹具 AutoMigrate 补表、`docs/partner-tenant-api.md`“Writer routing”。对照 prd A-U1/A-U6/A-U7/A-U8、design §3、implement §C、verification C1/C1 主会话复核/C2、`.trellis/spec/backend/partner-tenant-usage-isolation.md`。未改冻结设计。

## 结论

生产代码**未发现缺陷**，未修改。发现 3 处测试覆盖偏弱（低），已补测试；1 处规范文档过期（中，不在本 diff 内，未改，需主会话处理）；另有若干残余风险/待用户决定项。修改后隔离 PostgreSQL 实跑 rc=0。

## 逐项检查

1. **非成员路径与 0935b5f1d 等价 — 通过。** 逐行比对：`RecordErrorLog`（`model/log.go:295-354`）与 `RecordConsumeLog`（`:371-459`）的 Log 字段构造、原 INFO 行文本（`:301`、`:379`）、`createLog` 调用、`failed to record log: %s` 失败行完全相同，INFO 行仍在写入前；`LogQuotaData`（`:443`）参数与位置不变，仍在分支外。唯一差异是先做一次主库归属查询（`:298`、`:376`），在开关早退之后（`:372`）。`RecordTaskBillingLog`（`:473-535`）非成员仍为原 `createLog` + 原 `SysLog`（`:514-517`），refund 等非 consume/error 类型不查询归属（`:500-507`）。
2. **成员路径 — 通过。** 只调用 `writePartnerTenantUsageLog` 一次（`:347`、`:428`、`:512`），内部单次 `insertPartnerTenantUsageLog`（`model/partner_tenant_usage_writer.go:120-131`），失败只告警，不回落、不重试、不调 `createLog`。`newPartnerTenantUsageLogRow`（`:53-80`）复制 Log 全部持久化字段（`ChannelName` 是只读列，本不写），int→int64；owner 快照四字段；`subscription_id` 只取 `other.public` 中为正的 int/int64（`:35-50`）；request_id 用上下文值，空则与 `ensureLogRequestId` 同规则生成（`partner_tenant_usage_log.go:112-115`）；IP 来自同一 `needRecordIp` 计算结果。
3. **归属查询失败 — 通过。** `RecordErrorLog` 在构建 Log 前返回（`:305-309`），`RecordConsumeLog` 跳过两表写入但仍执行 `LogQuotaData`（`:424-426` → `:430-458`），任务 writer 同样（`:509-510` → `:520`）。告警只含哨兵文本 + user_id/request_id（`partner_tenant_usage_writer.go:107-115`），`LogWarn` 无 args 时不做二次格式化。error 事件在三个 writer 中都没有 `LogQuotaData`。
4. **秘密卫生 — 通过（含说明）。** 成员/未知分支不再打印 params/content；同函数内其他输出：`GetUserSetting`/`GetUsernameById` 仅在 Redis 缓存回写失败时打印 Redis 错误（`model/user.go:1404-1412`、`:1603-1611`），`LogOther.jsonString` 仅打印 JSON 序列化错误（`model/log_other.go`），均为既有、全用户共用、不含正文。GORM：新表插入走 silent 会话；归属查询与 `GetUserSetting` 未 silent，DEBUG/错误日志只会带 `user_id` 绑定值（不含正文/凭证）。C1 测试替换 `gin.DefaultWriter`/`DefaultErrorWriter`，正好覆盖 `logger.LogInfo`（DefaultWriter）、`LogWarn/LogError`（DefaultErrorWriter）、`common.SysLog`/`SysError`（`common/sys_log.go:17-27`）全部目标，且同时用 Info 级 GORM logger 捕获 SQL。说明：查询失败用例的注入发生在 `gorm:query` 构建 SQL 之前，GORM 不会 trace 该语句（用例注释已披露），所以真实 DB 错误时 GORM 打印的归属查询 SQL/错误只靠源码推断（仅 user_id），未实测。
5. **调用点清单 — 通过。** `git grep` 生产调用方：`service/text_quota.go:531`、`service/quota.go:250,389`、`service/task_billing.go:81`、`service/violation_fee.go:150` 用 `relayInfo/info.UserId`；`service/relay_error.go:77` 用已鉴权 `c.GetInt("id")`；`service/task_billing.go:286,365`、`service/midjourney.go:141` 用持久化 `task.UserId`；`relay/mjproxy_handler.go:290,672` 用 relay 用户（商户在上游前已拒绝）；`controller/channel-test.go:570` 与 `controller/iq_executor.go:221` 传入的 `testUserID`/`userID` 与同一测试上下文 `c.Set("id", testUserID)`（`channel-test.go:176`）一致，是该测试调用的实际计费用户，无错配。
6. **请求内 memo — 通过。** key = 前缀 + 实际 userID，读取时再校验 `snapshot.userID == userID`（`model/partner_tenant_owner.go:170-187`）；失败不缓存。同一 context 的两个不同 userID 分别查询，不会串用。gin `Set/Get` 有锁。说明：responses websocket 的长连接 context 在整个会话内冻结首个归属快照（含商户名），符合“请求内快照”设计。
7. **测试 — 基本有效，3 处偏弱已补。** 行数断言两表都查（`partnerTenantUsageWriterRows`、`requireRouted`）；注入链正确：归属查询 `Find` → Query 链并匹配 `TableExpr`（别名），新表 `Create` → Create 链，且每次都断言 `fired` 计数，非空转；`LogConsumeEnabled=false` 断言零 Query；`DiagnosticsStaySafe` 断言 DEBUG 捕获里存在 `partner_tenant_accounts` 语句，证明捕获生效，不是空转。全局量（DB/LOG_DB、数据库类型、开关、gin writer、`CacheQuotaData`、Grok 设置、membership cache）都在 cleanup 中还原。五个旧夹具只在 AutoMigrate 加 `PartnerTenant`/`PartnerTenantAccount`（+8/−5），表为空 → 确认非成员 → 原路径，行为中立；`relay_error_log_test.go` 仍缺独立表，原“独立表缺失时 reader 可用”的意图不受影响。服务测试在自有 schema 内按 user_id `DELETE` 行（不是 DROP/TRUNCATE），可接受。
   - 偏弱（低）：①写入路径只覆盖 external / subscription_key 两类成员，停用商户、停用账号/过期订阅、缺商户行、软删用户四种成员状态未经 writer 验证；②`record_ip_log=true` 的 IP 复制无断言（只断言关闭时为空）；③audio/realtime 未断言 `subscription_id`。
8. **文档 — 与代码一致。** “Writer routing” 的目标表、开关优先、refund 等不分流、`quota_data` 每次 consume 恰一次、best-effort 无 outbox、只打印关联字段、上线/回滚说明均与代码一致。细节：未知归属时 context writer 还会多打一条 INFO 关联行（含 quota），文档要点“user ID, merchant ID, request ID, quota”已覆盖，不改。

## 缺陷与修复

| # | 严重度 | 问题 | 处理 |
| --- | --- | --- | --- |
| 1 | 低 | 7-① 成员各状态未经 writer 验证 | 新增 `TestPartnerTenantUsageWriterEveryMemberStateAndIp`（`model/partner_tenant_usage_writer_test.go`）：6 种成员状态各恰 1 条新表记录、0 条 logs，tenant/account 与映射一致；缺商户行 → tenant_id 保留、名称为空；停用商户名称快照 |
| 2 | 低 | 7-② IP 开关 | 同一用例：`record_ip_log=true` 后成员 consume/error 与普通用户 logs 行的 IP 都等于 `ClientIP()` |
| 3 | 低 | 7-③ audio/realtime subscription_id | `service/partner_tenant_usage_paths_test.go`：三种 relay 结算都断言成员行 `subscription_id` = 订阅 ID（三者都经过 `GenerateTextOtherInfo` → `appendBillingInfo`） |
| 4 | 中（未改） | `.trellis/spec/backend/partner-tenant-usage-isolation.md` §1 仍写“writer 未启用、三个 writer 未改、Go 测试执行数 0”，§6 也仍写“从未执行”，与当前代码和实跑证据矛盾，后续开发者会被误导 | 不在本 diff 内，按 implement F 由主会话更新规范 |

## 命令与结果

- 宿主机 go1.26.10（`GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOFLAGS=-mod=readonly`）：`gofmt -l` 两个改动文件 → 空；`go build ./...` rc=0；`go vet ./model/ ./service/` rc=0。
- 导出：两个改动文件复制到 `.local-tests/partner-usage-1117/source/` 并 `cmp` 一致；`model/log.go`、`partner_tenant_usage_writer.go` 和五个旧夹具与工作区一致（导出里的 `docs/partner-tenant-api.md` 是旧版，不参与编译）。
- Docker runner `ptusage-1117-go-chk-1`（派发给的命令，`./model ./controller ./router ./service -run "^TestPartnerTenantUsage"`）：**rc=0，四个包 ok，63/63 顶层通过（原 62 + 新 1），114 子测试通过，0 失败，0 跳过**；日志 `.local-tests/partner-usage-1117/runtime-chk-1.log`。新建 53 个保留 schema（含 `pt_usage_writer_states_1794907586759213386`），已登记 `TEMPORARY_ARTIFACTS.md`。
- 没有改旧路径代码或旧夹具，所以没跑旧回归套件。

## 残余风险与待决定项

- **待用户决定**：目前只有 text/audio/realtime 能写入 `subscription_id`。违规费（`service/violation_fee.go:137-148`）、任务提交（`task_billing.go:50-79`）和任务差额（C2.7）的 `other` 都不记录这项信息，所以虽然实际从订阅扣费，新表里仍是 0。这符合“只用已知事实、不事后查询”的冻结契约。要补齐就得在这些写入点把已知 SubscriptionId 写进 `other.public`，会同时改变默认表的 `other` 内容，需另行决定。
- **待用户知悉**（冻结设计的后果）：现在每次 consume/error 写日志前，所有用户（含普通用户）都要多查一次主库（按请求缓存，无全局缓存）。如果部署时 LOG_DB 和主库分开，主库查询失败时普通用户的日志也会丢（以前仍能写入 LOG_DB）。
- 未覆盖：分库写入、ClickHouse/MySQL/SQLite 写入、真实 HTTP relay 端到端、channel-test/IQ/MJ 写入点、真实 DB 错误时 GORM 对归属查询的输出（源码推断仅含 user_id）。
- best-effort 漏记窗口（崩溃、归属查询失败、LOG_DB 故障）已在文档披露，未引入 outbox。

## 修改的文件

- `model/partner_tenant_usage_writer_test.go`（新增 1 个测试）
- `service/partner_tenant_usage_paths_test.go`（加强断言）
- `TEMPORARY_ARTIFACTS.md`（登记 runner/日志/schema）
- `.trellis/tasks/11-17-partner-usage-logs/quality-review.stage-c.md`（本文件）
