# 商户日志执行与验收

状态：**A/B/C/D实现与本地隔离验收完成，用户已确认本地提交及归档**。规划已于2026-11-17获批，旧source-only/Docker-blocked历史见verification各阶段；C在B的PostgreSQL门禁通过后才启用。当前writer已启用，不再“新表始终为空”。最终集成见父`final-acceptance.md`。

## A. 共享安全归属

- [x] single/batch safe owner三态：真实映射即商户、确认无映射、查询失败。禁用/过期/假p_/普通订阅/OAuth边界，缺商户行仍保留映射。
- [x] request-local以实际userID为key，无额外全局负缓存；user list按页批量、空页不查，无secret/external ID/hash/配置投影。
- [x] log/user两个scope明确options入口，受控q/p/page_size/selected_id，仅id/name；真实SetApiRouter/PAT矩阵与字段白名单。
- [x] 共享签名冻结于verification A，用户分类已消费同一契约；A的源码交付与日志整体验收明确区分。

## B. 迁移与读取（先于C通过）

- [x] 显式新表字段/TEXT/64位/event_id/短前缀索引，不复用Log tags；shared/separate LOG_DB迁移幂等、不搬历史。
- [x] ClickHouse明确DDL/TTL，无新SQL清理，默认日志清理范围不变；完整CH dialect生成SQL契约，不冒充live CH验证。
- [x] 新表admin list/count/stat同filter、严格参数、安全固定错误、admin/root脱敏、字符串ID/quota/聚合、nullable CNY、冻结API文档。
- [x] outcome选择/失败分类分离，重试折叠、收费失败与stream错误保留真实consume；request=succeeded+failed。
- [x] self list/stat/requests/summary/export/token recent全部双表兼容，ownership在每分支内，UNION ALL后count/排序/分页，同local ID不丢行；默认admin list/stat/export不union。
- [x] 普通只有旧表的路径保持原行为；历史新表读取不依赖当前owner。不存在表回旧路径，存在但探测/目录失败返回错误；positive-only存在缓存绑定LOG_DB handle。
- [x] 实际pq首次/升级/重复、shared/separate、持久化大整数/长文本、六索引与各reader已通过后启用C；本轮实际admin/member SQL的EXPLAIN及CH完整SQL独立通过，optimizer变化不钉死。

## C. 写入与全站计数

- [x] 仅RecordConsumeLog/RecordErrorLog/RecordTaskBillingLog的consume/error分流；createLog及refund/topup/system/security/audit不重定向。
- [x] text/audio/realtime/task-submit/差额/可记录error/违规费真实service调用；零额/抑制/legacy funding不扩权，非成员原路。
- [x] 主库归属错误/新表错误两表不写，不fallback/重试、不阻塞已结算扣额，LogQuotaData/用户计数按原规则一次。
- [x] Tenant/未知归属不输出完整params/content/raw error；应用logger与GORM DEBUG秘密标记负例含正控/真实注入计数。
- [x] 旧商户行留logs，新成员单写独立表，普通订阅只旧表，自身历史连续；IP开关和所有成员状态writer覆盖。
- [x] 本轮新增6顶层至69：独立main/log schema+handle三writer，真实PG约束错误不回落、真实结算后收费/Token/feed不变、token生产路由伪参、商户session拒绝、own probe/union logger、EXPLAIN/CH SQL。
- [x] 最终独立check补强至**69顶层/128子测试**，两轮每轮全部通过、0失败/skip；前三轮新测试假设失败如实保留。见quality-review.final.md，不用gofmt/vet代替。

## D. 前端与金额

- [x] CNY统一converter已由15个测试/真实HTTP验证；日志raw聚合后调用同converter，前端无第二套算法。
- [x] 自有feature+admin developer-shell路由/菜单，复用DataTable/安全详情，不Number转换大ID/quota。
- [x] 同窗口/filter的list/stat，query key包含viewer/session/role，跨会话无placeholder泄漏，分页/filter URL正确。
- [x] 26日志键+13分类键七语言通过sanctioned writer+i18n:sync；范围提示/空/错/不可用/微额均覆盖。**无限额不适用于逐事件日志页**（冻结DTO无余额字段）；无限/terminal展示契约由订阅CNY接口覆盖，不伪造页面字段。
- [x] 前端48文件657用例/typecheck/build与触碰文件lint/format通过；全站151error/68warning为既有基线。
- [x] 真实backend浏览器：admin/root可读，普通403零admin请求，真实筛选/总数/统计一致、历史默认页、跨页、键盘详情焦点、移动大值换行、Back/Forward；用户页同归属/大ID精确请求。

## E. 运行命令与证据边界

Go仅本组Docker+显式fixture DSN，禁止宿主go test：

```bash
go test ./model ./controller ./router ./service -run '^TestPartnerTenantUsage' -count=1 -v -timeout 20m
```

最终非Usage联合套件已通过46顶层/45子测试/0fail/skip（CNY15+分类7+模式11+审计9+旧SubscriptionKey4）；已核查旧日志/summary/export/用户/OAuth/service/relay回归基线，原通过集合保持。遗留SQLite缺表失败与无DSN新增PG必败分别披露，不报整仓全绿。

完整6包无selector/no-DSN旧回归：2007通过/70失败/21跳过，69失败为应配DSN的PG用例，唯一非PG为既有TestImmediateTaskSettlementDatabase夹具缺表；基线通过集合无新增失败、跳过集合相同。初次巨型selector触发TestMain旁路的失败轮已披露作废，不作业务结论。静态最终gofmt/build/vet、git diff --check均rc0；不等同运行。实际PG EXPLAIN小夹具不等同生产容量证明。两独立schema/handle证明逻辑分库，不等于两台服务器宕机/恢复；liveCH/MySQL/SQLite联合读取无运行验收。无真实上游HTTP模型请求。

## F. 收尾

- [x] 独立check结果/全范围证据回填，A-U1–A-U8本地运行门禁关闭；父final-acceptance记录最终矩阵与限制。
- [x] spec更新writer/读写故障、request memo/诊断卫生/测试回调链/部署回滚与已披露限制；不改变冻结DTO和计费。
- [x] 本轮6个Go测试及本组i18n业务脚本已精确路径提交 `b5c9dee36`；规范/验收记录纳入已批准文档提交批次（旧业务在69092e8d5/febe9bd3e/1748176a6/65902706c等提交）。
- [ ] 文档提交后官方归档并记录journal；完成态以归档task.json为准。
- [x] 实际临时资源登记，浏览器和e2e server已停止，数据保留；清理需用户同意，Trellis永不清理。

## 发布/回滚

best-effort无outbox，归属主库错误也可能丢普通日志，已披露。task/fee未知subscription_id为0/DTO空，不事后查秘密；其他report只读旧表、整窗scan/union无topN等限制见spec。发布须迁移+reader先行，滚动节点无全球切换时刻；回滚保留新表/data/兼容reader，不倒灌或重放扣费。本次无生产变更/推送/部署。
