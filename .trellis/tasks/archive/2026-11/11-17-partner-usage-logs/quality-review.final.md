# 商户用量最终独立质量检查

时间：2026-11-17 17:41–17:42 UTC；基线HEAD `68cb5dd29`，检查run `01db93c6-ebb6-49f2-803e-37b70f0ef74d`。

## 结论

**本轮验收补齐无剩余阻塞问题。** 指定owned Docker+PostgreSQL15.19最终源码独立两次通过，**每次69顶层/128子测试、0失败/0skip，rc=0**；不相加冒充覆盖数。生产源码/公开DTO/权限/收费/默认other均0改动。完整权威报告（含122schema全部名称和源码SHA256）保留在：

`/Users/lyh_god/.pi/agent/sessions/--Users-lyh_god-GolandProjects-new-api--/subagent-artifacts/outputs/01db93c6-ebb6-49f2-803e-37b70f0ef74d/acceptance/review.md`

runner `ptusage-1117-go-final-review`：首次docker run、补强后复用docker start -a，最终exited/ExitCode0。日志`.local-tests/partner-usage-1117/runtime-final-review.log`保留两轮及两个runner_rc=0。两轮各61schema均保留不DROP/TRUNCATE。主会话独立读日志核对69/128、核对全部6个Go文件SHA256与review相同、source export逐文件一致。

## 完整审查范围

六文件全部相对HEAD差异：
- `model/partner_tenant_usage_query_test.go`
- `model/partner_tenant_usage_request_test.go`
- `model/partner_tenant_usage_writer_test.go`
- `router/partner_tenant_usage_log_test.go`
- `router/partner_tenant_usage_union_test.go`
- `service/partner_tenant_usage_paths_test.go`

检查代理仅补强query/request两个现有测试文件，最终六文件共506行新增；不把实施代理的内容冒充自己新写。读取check.jsonl全部7项、父/三个child合同和生产关键读写/fixture/TestMain。

## 发现与修复

1. **self-stat诊断矩阵缺口、union注入可能命中内部DryRun（已修）**：增加probe/self_stat、stat_quota/self_stat、stat_rate/self_stat三子测试。正控旧quota3+新11=14；任一新表阶段失败必须`Stat{}`，无旧表部分和。按真实SQL区分probe/quota/rate，排除DryRun、SQL先成功再注入，恰命中1次。Query/Row与打开Rows关闭处理有效，子测试使用自己的t。两层logger有正控/标记负例，13诊断子测试全部通过。
2. **admin bind与CH过滤合同可加强（已修）**：默认/tenant admin完整bind类型/顺序/值；CH count/list/stat补username过滤，覆盖全部可选文本/归属过滤。真实CH dialector DryRun，不连接CH。
3. 实施三轮编译/SQL捕获/PG常量文本假设错误已修，旧失败日志保留；EXPLAIN改用真实SQL+bind而不钉optimizer常量格式，最终两轮绿色。

## 验收有效性

| 边界 | 结果 |
| --- | --- |
| 独立LOG_DB三writer | 主库decoy不变，LOG_DB无owner表，成员只新表、普通只logs；PG CHECK真实23514三次，不回落/重复；owner失败三次无写入，feed按原规则 |
| 结算后日志失败 | 真实PreConsumeBilling→PostTextConsumeQuota，第二轮23514，charge/token/subscription/counters/wallet逐项正确；成员钱包不动、feed每请求1次 |
| 合法Key伪参 | InitLogDB+SetApiRouter+TokenAuthReadOnly；自己token旧/新各1，排除同用户sibling/他人，伪造user/tenant/token/account响应逐字相同；401与安全投影负例 |
| member session | 真user/token/tenant account+session，新list/stat均403，admin/root/PAT/desktop边界保持 |
| probe/union/self-stat | 实际执行链13子测试恰1次注入，无返回/应用日志/DEBUG秘密标记、无部分行/和 |
| EXPLAIN | 实际admin默认/tenant与member union SQL+bind三条EXPLAIN ANALYZE/BUFFERS；pg_indexes列序验证，允许小样本optimizer变化 |
| CH | 完整count/list/stat/token union生成合同，cast/group/排序/分页与过滤bind；不是live兼容证明 |

最终实际计划：默认窗idx_ptul_time backward scan/0.006ms；tenant窗idx_ptul_tenant_time/0.005ms；member Append（旧表idx_created_at_type，新表idx_ptul_user_time）+Sort/Limit/0.021ms。首轮旧表索引不同，测试正确允许变化；不是容量/生产延迟承诺。

## 限制

逻辑分库为同PG数据库独立schema/handle，不是两台服务器/网络分区；feed只内存cache不启动无限flush；诊断注入在交付前，不覆盖部分NDJSON已输出后的故障。无outbox仍best-effort，可漏记；无liveCH/MySQL/SQLite、真实上游模型/付款、容量/生产迁移验收。本次check不替代父会话CNY/分类/前组/旧回归/657前端/浏览器证据。H5 usable和未知subscription_id既有契约不改。

静态gofmt/build/vet/diff-check通过，全部1260tracked Go导出0 mismatch；宿主go test0。没有stage/commit/push、秘密读取/清理/引擎重启/浏览器操作。
