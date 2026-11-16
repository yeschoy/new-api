# 续接规划复核 — 2026-11-17

## 授权与结论

用户确认继续这组任务，并要求检查多个任务及上一轮需要的修改。本轮仅授权复核/调整已有规划；不是对最新完整规划的实施批准。保留父任务 + 三个子任务，不创建新任务、不 start、不写业务代码。

已逐份读取父/子 PRD、design、implement、上下文清单，以及前一组模式/授权审计的 verification。四组 implement/check 清单路径校验通过；这只证明清单有效，不证明业务验收通过。

## 必须补齐的规划项

| 编号 | 发现与证据 | 本轮调整 | 实施门禁 |
| --- | --- | --- | --- |
| P1 | usage-logs 同时承担 owner/options、迁移、六类自身读取、三入口写入、管理员页；父 implement 原顺序需在日志与 CNY 之间切换任务 | 明确 usage-logs 的 A/B/C/D 阶段交付和切换检查点；保留三个可验收子任务，不把半成品标记为完成 | reader/迁移完成前不得启用 writer；CNY 完成前不接金额 UI |
| P2 | 前组 `11-13-partner-access-mode-audit/verification.md` 明确 Go build/test/vet/pq 执行均为 0，两个子任务仍 in_progress | 将前组 source-review-ready / runtime-blocked 基线显式列入执行前检查，分开新旧套件证据 | 可继续规划；受影响旧套件必须在隔离 Docker/pq 验证，未通过不得宣称新旧整体验收完成 |
| P3 | 新计划只列 `^TestPartnerTenant*` 选择器；`model/log_format_test.go`、`model/log_other_test.go`、`model/log_outcome_test.go`、`controller/log_export_test.go`、`controller/log_summary_test.go`、`controller/relay_error_log_test.go` 已有相关回归 | 增加旧测试 census、TestMain/fixture 审核与受影响回归命令登记；不盲跑旧 destructive/SQLite fixture | 新命名 suite 不代表已有排序、脱敏、导出、汇总已回归 |
| P4 | `model/log.go:594-618,704-735` 以 logs 别名过滤和流式读取；`model/log_summary.go:35-43` 有独立列投影/排序 | 补双表兼容 SQL 的类型/别名/驱动矩阵及普通用户无新行回归；不能只换表名 | pq 实跑联合过滤/count/流式；CH 生成 SQL/列类型静态检查与未实跑披露 |
| P5 | `model/log_summary.go:65-85` 将 violation 和 stream_status=error 视为失败；`model/log_outcome.go` consume 优先仅决定最终事实，不等于成功 | 明确商户统计复用失败分类与 outcome 排序，避免新页把收费失败/流失败计为成功 | requests=succeeded+failed；收费失败 quota 保留，error 不加费用 |
| P6 | 新 list/stat/options 只有路由与概念设计，缺可冻结的响应/参数清单 | 实施前冻结安全 DTO、分页/ID/string 聚合、过滤/统计口径及 bounded options；新 API 同步文档与 schema/契约测试 | UI 不凭 mock 自创字段，不返回原始 GORM model |
| P7 | `model/log.go:280-284,344-345,387-390,455-457` 原 writer 会打印 content/params 或底层 error；新 helper 若复用外层错误输出会绕过安全告警 | 明确 Tenant/未知归属分支不输出整对象/原 SQL/Other/原始错误；保留必要安全关联 | 负面秘密标记覆盖应用 logger 与 DEBUG GORM 两层；不把角色投影当存储净化 |

原始复核锚点：旧表自身列表过滤 `model/log.go:594-618`、export/stream `model/log.go:680-735`、summary 投影/排序 `model/log_summary.go:35-43`、失败分类 `model/log_summary.go:65-85`、outcome 排序 `model/log_outcome.go:10`；应用 logger `model/log.go:280-284,344-345,387-390,455-457`。这些是当前证据定位，不代表已修复。

## 原任务是否需要补做

前一组“接入方式 + 授权审计”的源码检查点已保存，不重新实现其功能。还需在该组原有任务记录中承接未完成 Go/pq 构建、迁移、锁/恢复、真实路由鉴权和父级集成门禁。当前尚未重试 Docker，也未新建测试资源，不能断言环境仍不可用或这些测试已失败。

本组不处理前组未核验的实际环境中文分组选项问题、不扩展支付修复或生产检查。只在共享入口/迁移/凭证响应受本组改动影响时纳入必要回归。

## 任务与依赖决定

- 父任务继续负责源需求、跨子验收及最终报告；三个业务子任务边界保持。
- usage-logs A：owner/options 契约 + 安全/权限回归；B：迁移 + 读者兼容；C：切写与全站计数；D：CNY/UI/文档。
- quota-cny 可独立开始；推荐在 usage-logs A 合同冻结后交付。user-classification 仅依赖 owner/options，不必等待日志 UI。
- 一次只启动实际工作的子任务；切换须保存修改所有权、已执行命令/结果、阻塞项与提供给下个任务的实际签名。不同任务的 planning/in_progress 不得被当作其功能已完成。
- 首版不再新增“owner 基础设施”“个人兼容”“运行环境”等子任务：它们尚未形成用户要求的独立产品交付，按日志内部检查点管理可避免额外拆分。若实施规模或独立发布要求改变，再明确提出拆分并取得同意。

## 证据边界

本轮仅源码/文档读取、manifest 校验和差异检查。没有 Go/前端业务测试、数据库/容器创建、生产访问、秘密读取或清理。Trellis 规划复核记录不是临时产物，永久保留；既有未跟踪私钥、Demo、reports 和临时清单不纳入提交。
