# 总体执行与最终集成门禁

状态：**三个子任务实现与本地隔离验收完成，用户已确认本地提交及归档**。原计划已在提交`e61eb6533`+`b1929bdda`获批，最终事实见`final-acceptance.md`；旧source-only记录保留但不作为当前状态。

## 0. 范围与准备

- [x] 用户批准R1–R7及AC1–AC8、三个现有child；恢复已有任务，不重复创建。
- [x] 读取父/子PRD/design/implement/research、backend/frontend spec与技能要求；复核owner/writer/readers/前端/迁移边界。
- [x] 起始HEAD`68cb5dd29`、原9组未跟踪资源保留；不读秘密、不blanket stage，npm/pnpm记录已有ignore。
- [x] Docker当前可用（由用户之前启动），仅复用本组内部fixture，不自行启动/重启引擎；前组曾经阻塞已用20个真实PG用例解除。
- [x] 受影响旧日志/用户/OAuth/额度回归清单与基线已核查；no-DSN legacy结果与明确DSN的PG结果分开。
- [x] 单cwd实现与检查顺序执行；主会话只写不冲突的父/CNY/分类/规范文件，浏览器只主会话使用。

## 1. 交付

- [x] usage-logs A：safe single/batch owner、request memo、id/name-only bounded options、log/user两个权限入口；不按有效期/用户名/组猜身份。
- [x] quota-cny：统一decimal转换器、三个入口additive wrapper、金额/终态/配置契约与文档；原quota/鉴权/秘密读取/计费保持。
- [x] usage-logs B：独立表/索引、shared/separate迁移、ClickHouse DDL/TTL、admin list/stat、六自身/token兼容reader；PG门禁先于writer通过。
- [x] usage-logs C：三入口仅consume/error分流、非成员原路、故障不回落、feed一次、秘密卫生与服务调用点；退款等非目标事件不重定向。
- [x] usage-logs D：独立admin页/导航、统一窗口、分页/过滤/CNY与原始精确字符串、scope提示、键盘/mobile/七语言。
- [x] user-classification：同owner过滤/批量enrichment、类别/商户/旧OAuth独立、同事务count/分页、safe options及会话隔离。
- [x] 主会话真实后端+假PG浏览器联调两页：同商户12/禁用成员、大ID、范围/统计/分页、旧历史、admin/root/普通用户、键盘/移动/URL与前进后退。
- [x] 日志独立trellis-check两轮每轮**69顶层/128子测试、0fail/skip**，修正版EXPLAIN/self-stat诊断矩阵已实跑；review结论持久化。

## 2. 实际验证

所有Go运行在本组Docker，禁止宿主go test；source导出按明确文件同步、只读挂载、模块只读且GOPROXY/GOSUMDB off，无依赖变更。

| 选择器 | 实际证据 |
| --- | --- |
| Usage原63顶层/114子测试 | C1/C2已pq通过；本轮加6顶层到69，分库/结算真实故障/token伪参/member权限/logger/EXPLAIN/CH SQL，最终独立check69/128全部通过 |
| QuotaCNY15 | 最终integration再次全过 |
| UserClassification7/22子测试 | 最终integration再次全过 |
| AccessMode11 / AuthorizationAudit9 | 最终integration再次全过，前组运行证据不等于擅自归档前组 |
| 既有SubscriptionKey4 | 最终integration全过，quota/续费/终态/轮换/并发锁/旧HTTP协议 |
| 上述非Usage五类联合 | 5包46顶层/45子测试，0fail/skip；34保留schema，`runtime-final-integration.log` |
| 前端四目录 | 48文件657用例、typecheck/build rc0；触碰TS/TSX定向lint/format rc0，i18n:sync rc0；全站151错误/68警告为既有基线 |

现有SQLite无DSN回归有已披露基线失败及新增PG测试按设计无DSN失败；基线通过的既有用例在HEAD仍通过，不假报整仓全绿。完整证据/计数/执行命令与失误过程见final-acceptance及child verification。

## 3. 父AC矩阵

- AC1/AC6：三writer+服务调用+fee/zero/error+feed；最终分库/已结算故障独立check已通过。
- AC2/AC4：两页真实owner/相同scope，PG过滤/count/分页/排序与批量，浏览器精确ID/URL/mobile、旧OAuth回归。
- AC3：15CNY+旧Key，舍入/无效配置/无限额/terminal，旧字段兼容与鉴权/审计不变；日志先聚合再转换。
- AC5：shared/separate真实迁移/索引/存储，旧历史保留/scope提示，EXPLAIN实际SQL+bind独立check通过（非容量证据）。
- AC7：六reader全覆盖，同ID/重试/跨日/导出stream取消/伪参，token生产路由与故障logger独立通过。
- AC8：真实SetApiRouter/PAT/desktop/角色投影/root-only保持；browser普通用户403且0次商户admin请求。

## 4. 收尾

- [x] 规范更新当前writer事实、best-effort/普通路径主库依赖/部署与回滚、测试注入链/EXPLAIN不要钉格式等可执行契约。
- [x] 全部质量结果回填，最终6包无DSN回归2007通过/70失败/21skip，其中69缺DSN PG失败、唯一非PG为既有夹具失败；基线通过的用例无新增失败、跳过集合完全相同。
- [x] 本轮6个Go测试及本组i18n writer已精确提交 `b5c9dee36`；规范和验收记录纳入已批准文档提交批次，无私钥/报告/临时文件。
- [ ] 工作提交后按官方archive三个child与父；再记录journal并提交Trellis，禁止把前组/其他任务一起归档。
- [x] 浏览器关闭且本组fixture server停止（未移除），无3392监听；其他容器/schema/卷/截图保留，实际清单在TEMPORARY_ARTIFACTS。
- [ ] 完成后询问用户是否清理本组临时产物；不删Trellis或共享缓存/旧资源，不推送部署。

## 5. 不扩范围

保持H5 usable额度层面、task/fee未知subscription_id不伪造、report两读取方仍旧表；统计整窗性能/union无topN/MySQL collation/liveCH为已披露限制。outbox、SQL自动清理、历史迁移、生产发布不是首版验收承诺。回滚保留新表与兼容reader，不重放扣费。
