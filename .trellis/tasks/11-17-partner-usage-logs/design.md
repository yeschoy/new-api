# 独立商户用量：技术设计

状态：最终评审稿，仍 planning。产品要求/验收见本任务 prd；跨子任务契约以父 `research/contract-decisions.md` 为准。

## 1. 安全归属契约（本任务拥有）

在 model 增加最小安全 owner 投影和单用户/按页批量查询，来源仅为主 DB 的 PartnerTenantAccount.user_id 关系，LEFT JOIN Tenant 名称。不按 enabled、过期、余额、角色、组名或用户名筛掉关系。账号或商户停用不重新归类普通；保留仍有映射的软删除用户。

Owner 只含 Tenant ID/name、account ID、user ID、identity source。不返回 external_user_id、Key、hash/seed、配置。首个模型日志写入时从已鉴权 user_id 捕获并 request-local memoize；无 context 的任务正向消费使用持久化 task.user_id 查询。首版不扩展原 bool membership cache、不新增全局负缓存，避免新开户未提交/负缓存漂移。

返回值严格区分“成功无映射”和“查询失败”；失败不当普通，也不猜归属。批量版供用户分类调用，同一语义，不 N+1。名字是安全当前元数据，写入日志后冻结为历史快照。

## 2. 表、索引及迁移

新 `partner_tenant_usage_logs` 位于 LOG_DB：

- 独立本地 id 与不可变 event_id（随机非秘密关联标识），created_at、type；tenant_id、account_id、tenant_name 快照及 identity_source。
- 显式复制消费/错误所需 Log 事实：user_id/username、model、quota、input/output tokens、token_id/name、channel_id、group、时长/stream、可选 IP、request_id/upstream_request_id、content/other。原 IP 开关/脱敏不变；subscription_id 只有已知事实可填，不重新查 secret 关联。
- 主键/归属/quota 使用 int64；content/other 使用 TEXT。不要直接嵌入 Log 的 GORM index tags，避免与 logs 的 idx_created_at_id 等 PostgreSQL schema-wide 名称冲突。
- 前缀短索引覆盖 `(tenant_id,created_at,id)`、`(user_id,created_at,id)`、`(token_id,created_at,id)`、request_id 和 event_id。请求重试可多行，不给 request_id 加唯一约束。具体组合依真实 pq EXPLAIN/目标查询校验，不泛加低价值索引。
- 无跨主/日志库 FK 或 SQL join；渠道/名称补充只能安全批量查询或快照。新表不能依赖日志查询时的活动套餐归属。

新增专用幂等迁移 helper，挂入 `InitLogDB` 的共享 LOG_DB=DB 分支及独立 migrateLOGDB 分支。SQL 驱动使用明确 schema/AutoMigrate；ClickHouse 使用显式 MergeTree CREATE、64 位新字段、事件排序键、既有 LOG_SQL_CLICKHOUSE_TTL_DAYS 及 MODIFY/REMOVE TTL 同步。不搬迁/扫描旧 logs，不触碰付款表。

PostgreSQL 新表不添加自动删日志行为，原默认清理只管原范围；ClickHouse 新表沿用既有配置 TTL。独立 SQL 清理/容量运维单列后续事项，本任务不执行任何删除。

## 3. 写入分流

保留 createLog 的通用语义，只在 RecordConsumeLog、RecordErrorLog、RecordTaskBillingLog 的 consume/error 分支调用新的 usage-routing helper：

1. 按原逻辑构造 Log、生成/保留 request_id；遵守原 consume/error 开关和 no-record 策略。
2. 成功非成员 -> 原 createLog；成功成员 -> 转新表记录，只写一次；未知归属/新表失败 -> 有界安全告警，不混写/双写。
3. 外部 LOG_DB I/O 不置于任何计费/开户事务锁内；日志失败不回滚既有实扣。
4. 原 LogQuotaData 及全站计数调用保留原位置/次数，不能仅因返回日志错误而提前跳过。消费事件日志只换目的表，不增加聚合 feed。

调用点清单见父 research：text、audio/websocket、task submit/正向差额、可记录 relay 错误、既有费用。legacy MJ 等仍遵守原 Tenant funding 拒绝，不为日志支持开放调用。refund/topup/system/security/授权审计保持原存储；不要 blanket-route createLog。type=consume 的真实违规费用保留，error 本身不累计消费。

best-effort 风险：进程在业务提交后、日志写前退出或 LOG_DB 故障可漏记。告警只含受控原因与 request/event/user 关联，不打印原错误 SQL、正文、Other、token 字符串或秘密；新日志 I/O 使用 silent GORM 会话防 DEBUG 插值泄漏。未引入 outbox。

原 RecordConsumeLog 会记录完整 params，RecordErrorLog 会记录 content，三入口还有直接 err.Error() 输出；不能只新增安全 helper 而保留 Tenant/未知归属的这些旁路。目标分支使用安全关联日志，既有 LogOther 角色投影仅是读取脱敏，不是存储净化。秘密标记测试同时观察应用 logger 与 GORM DEBUG；不改变非目标路径的无关诊断策略。

## 4. 管理员查询与统计

新端点：

| GET | 作用 | gate |
| --- | --- | --- |
| `/api/log/partner-tenants` | 新表分页明细 | AdminAuth + PAT log:read |
| `/api/log/partner-tenants/stat` | 同条件聚合 | 同上 |
| `/api/log/partner-tenants/options` | 仅 id/name 的商户筛选 | 同上 |
| `/api/user/tenant-options` | 同一安全投影供用户页 | 既有 user read gate + PAT user:read |

新增端点在 middleware/access_token_routes.go 显式登记，不能用 Any 放行绕过 scope。普通管理员和 root 均可读，仍分别应用 FormatAdminLogs/FormatRootLogs 对应投影；普通用户/匿名被拒绝。原 root-only Tenant 管理不改。

统一类型化 filter：tenant_id、user_id/账号、model_name、request_id、type(consume/error)、start/end、p/page_size。正整数 ID 严格规范化为 signed-int64 范围十进制文本；重复/非法/超界参数拒绝，时间范围/分页沿用既有限制。list/count/stat 复用同一过滤 builder，查询参数不拼接标识符。

新 DTO 的 ID/quota（及大额聚合）使用十进制字符串，前端不 Number 解析。返回安全快照与 role-shaped other，不返回持久化模型全字段。消费/Token 只聚合 consume；统计分别给过滤记录数和 request_id 折叠后的请求/成功/失败，避免把重试行数叫成最终请求数。真实费用消费与响应失败可并存，不凭错误状态清零 quota。

最终 outcome 先按 compareRequestOutcomes 选择，再复用现有 summary 的失败分类（error、violation fee 或 stream_status=error）；不能仅以 consume 判定成功。空 request_id 每行独立；requests=succeeded+failed，quota/Token 累加与请求去重分别处理。时间/商户/模型/账号/type 等过滤先应用，再在所选范围内折叠，不借窗口外或被过滤行改写当前筛选结果。

实施前冻结 list/stat/options 的安全 response schema 与参数表并同步 API 文档/契约测试：沿用项目分页 envelope，说明 total/记录数/请求数区别、字符串聚合字段、nullable CNY、错误码及范围；options 约定 q/p/page_size/选中 ID 补取、上限及 id/name-only。list/count/stat 共用过滤，UI 不凭 mock 发明另一套字段。

新页不复制原 RPM/TPM 卡片的独立 60 秒窗口；首版只做筛选范围内金额、请求和 Token 合计。原默认列表/stat/export 只读 logs，保留旧商户历史。新表 stats 先精确汇总 raw quota，再调用统一 CNY 转换；无有效转换时展示不可用而不是 ¥0。

## 5. 个人/API Key 联合读取

必须覆盖 GetUserLogs、GetLogsSelfStat 对应新 userID-scoped 统计、GetUserRequestLogs、GetUserLogSummary、StreamUserLogs 和 GetLogByTokenId。仅适配这些已授权读者，不改 GetAllLogs/SumUsedQuota/StreamAllLogs 的默认管理员来源。

- 两个 union 分支先限定已鉴权 user_id 或 token_id，再套用户允许的过滤；调用方 tenant_id/user_id/token_id 查询参数不能替代身份。
- 子查询投影为兼容 Log 列，附内部 source/event 身份。UNION ALL 保留原始事件，不能按本地 id 或 request_id 去重消费行。
- 新旧同在时用 created_at、原本地 id、source/event 形成确定性全局时间顺序，再 count/offset/limit；不能分别取一页再拼接。只有原表的现有读取应保持旧行为，避免无关普通用户排序回归。
- 请求结果/汇总继续使用 compareRequestOutcomes（consume 优先、时间/原 id/确定性事实），只在完全相同事实时加内部来源 tie-breaker；空 request_id 是不同事件。不能先改 display id 再比较。
- 汇总继续区分 wallet/subscription quota，不将订阅计为现金节省；现有窗口/时区/导出开关/锁/NDJSON 尾部结果/取消保持。
- export 从联合排序流读取，逐行 user 投影并编号，不把全窗口缓存在内存；跨表同 id 不能挤掉另一行。user/token 输出不带新 admin/root owner/诊断字段。
- 实施前列出联合投影逐列类型/别名及驱动策略（特别是 ClickHouse id=0、新 Int64 quota 对旧 Int32、is_stream/group/只读 channel_name），统一适配现有 logs 前缀过滤；不能把 union SQL 直接塞入仍固定 Model(&Log{}) 的 streamLogs。pq 实跑 list/count/summary/export，CH 做 SQL/类型契约检查并披露未运行，MySQL/SQLite 保持现有支持不扩大运行矩阵。
- 非 Tenant/只有旧行用户不得丢失原排序/过滤/脱敏/导出结果；不能因当前 owner 映射不存在就跳过其历史新表记录。数据来源由已鉴权 ownership 决定，不由当前套餐/归属决定。

## 6. 页面与复用

独立 `/partner-usage-logs` 管理员 developer-shell 路由与菜单，使用 DataTablePage、server pagination、现有安全明细/可复用展示组件；feature 自有 columns/API/schema，不复制整个 usage-logs provider/export/task feature。不将商户 view 放进普通用户/easy/self 可切换入口。

Query key 包含会话/用户/角色可见范围、所有过滤及分页；切会话/过滤不复用另一权限的 placeholder 数据。tenant ID、quota/CNY 保持字符串，超出安全整数范围不能为了调用 legacy 组件转 Number；不兼容的金额细节使用新安全展示而非伪造精度。

始终有“仅含切换后的新记录、旧记录在默认日志页”的范围说明；不把最早记录当全局切换时间。空态/加载/失败/重试、键盘操作、移动布局及全部七语言走现有模式和 sanctioned script。

## 7. 回滚与验收

迁移/reader 先于 writer，新表与个人兼容读者一起保留。生产部署/滚动协调不在当前授权；出现混写、误归属/越权、迁移失败立即阻塞交付。回滚不 drop 新表、不倒灌旧表、不重放扣费，旧二进制单独回滚会失去新历史可见性，必须披露并保留兼容读取。

受控 PostgreSQL 验证覆盖真实三入口、共享/独立初始化、索引、单写、故障、管理员/个人范围、跨表相同 id 和跨日重试。前端 DOM/路由/七语言及本地假数据浏览器验证；Go/数据库全部在任务自有 Docker，不用 build/vet 充当运行证据。
