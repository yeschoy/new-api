# 商户日志执行与验证计划

状态：未实施。遵守父 implement 的后续批准门禁；子任务实际 start 后才写业务代码/创建运行资源。

## A. 先交付共享 owner 契约

- [ ] 读取父 PRD/design/共享 research 和 model/log.go、三写入口、LOG_DB 初始化/现有脱敏/真实路由；复核 writer census，没有遗漏新增调用。
- [ ] 增加单用户及批量 safe owner、request-local 快照、无秘密商户 options；禁止额外全局负缓存。owner 查询失败不得按普通用户写回默认表。
- [ ] 两个 scope 明确的 options 入口复用同一安全投影；增加真实路由/PAT/字段白名单回归。
- [ ] 冻结共享签名/字段/错误语义，登记供用户分类消费。测试只在 owned Docker，未有 runtime 不宣称 owner 全验收。

## B. 表与读取先行

- [ ] 新表显式字段/TEXT/64位/短前缀索引/event_id，不复用 Log index tags。覆盖默认 LOG_DB=DB 与独立日志库初始化，迁移幂等且不搬历史。
- [ ] ClickHouse 显式 DDL/TTL 保持现有驱动支持；SQL 新表不新增清理，默认清理范围不变。
- [ ] 新表分页/count/stat 使用同一过滤；新 ID/quota 字符串，admin/root 脱敏与安全错误。
- [ ] 逐个适配 self list/stat/requests/summary/export/token-recent。ownership 下推两个分支后再 union/count/排序/分页；默认 admin list/stat/export 不 union。
- [ ] 回归同本地 ID、空 request_id、失败重试成功、consume 与异常费用、时区/窗口、流式导出取消和既有开关。

## C. 切写与全站统计

- [ ] 仅消费/错误专用入口分流；通用 createLog 及非目标类型不重定向。
- [ ] 真实调用覆盖 text/audio/websocket/task 正向消费和可记录 error；抑制/legacy funding 禁止路径不扩权。
- [ ] 归属与 LOG_DB 故障安全告警、不回默认表、不阻塞既有已结算扣费；LogQuotaData/全站计数仍一次。
- [ ] 预置旧商户行、写入新商户/普通订阅行，证明默认旧历史保留、新行单表隔离、自身连续可查。

## D. 前端与金额集成

- [ ] CNY 子任务 converter 契约/测试已交付后才接入，不先写第二套算法。
- [ ] 实现 features/partner-usage-logs 与管理员 developer-shell 独立路由/菜单；复用通用表格/安全明细，拒绝不安全 Number 转换。
- [ ] 筛选、summary、分页同 scope，包含会话/角色的 cache key；跨会话不可使用旧 placeholder。
- [ ] 七语言通过现有 add-missing-keys.mjs + i18n:sync；补范围说明、空/错/不可用/无限额/微额展示。

## E. 执行命令（均为批准后的计划）

在已登记的 owned Docker runner 内，使用显式空隔离 PostgreSQL DSN `TEST_PARTNER_USAGE_POSTGRES_DSN`，新增 TestMain 选择分支避免误跑 legacy SQLite bootstrap：

```bash
go test -mod=readonly ./model ./controller ./router ./middleware ./service -run '^TestPartnerTenantUsage' -count=1 -v
```

测试名/DSN 是计划接口，须先实现并确认实际选中用例、无缺 DSN skip；测试夹具应隔离 schema、留存证据、不 DROP 旧资源。覆盖 fresh/repeat/default/separate LOG_DB、实际 DDL/持久化/目标 EXPLAIN、真实 SetApiRouter 鉴权、writer 与各 reader。其他 driver 只保持现有兼容并披露未运行项，不扩泛化数据库矩阵。

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
