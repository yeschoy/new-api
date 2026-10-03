# 当前返现改动并行对抗审查：设计

## 1. 审查边界

父会话保留范围定义、编排、证据复核、冲突裁决和最终 merge verdict。三个 child 仅执行一次只读审查，不共享上下文、不修改工作树、不派生子代理。

审查目标是当前 `feat/recharge-cashback` 工作树相对 HEAD 的返现相关变化：

- 已跟踪目标：`controller/`、`model/`、`web/src/features/cashback/`、相关 Billing 设置、i18n、`docs/` 与返现 spec 中的当前差异；
- 未跟踪目标：`model/cashback_ledger.go`、`model/cashback_reconciliation.go`、`model/user_quota_cache_fence.go`；
- 排除：`.pi/npm/`、模板哈希、通用 guideline 模板改动、本任务编排文件以及仓库证据表明的既有无关差异。

reviewer 仍需自行运行 `git status`、`git diff` 和读取文件来验证边界，不能把本设计当作代码事实来源。

## 2. 并行结构

使用唯一一个顶层异步 `workflowScript`，内部通过 `runs.all` 启动三个 `reviewer`：

1. **资金与安全**：支付/返现原子性、幂等、状态转换、账本、对账、Redis quota fence、并发、鉴权、敏感数据和失败关闭。
2. **前端与跨层合同**：控制器 DTO/OpenAPI/TypeScript 一致性、Root/Admin 边界、表单和 action dialog 行为、错误展示、缓存、a11y、七语 i18n。
3. **验证与结构质量**：测试是否命中真实失败路径、迁移与多数据库差异、索引/查询/性能、运维文档和 spec 准确性、重复复杂度与可测试性。

所有 child 显式设置 `context: fresh`。并行 lane 都是 read-only，使用共享当前工作树而不创建 writer worktree。

## 3. Prompt 合同

每个 prompt 必须以当前 Trellis task 路径开头，并包含：

- repo/CWD、当前分支和审查目标；
- 需要自行读取的项目指令、spec、原任务计划、diff 与未跟踪文件；
- 独立角度和重点文件/合同；
- 只读权限边界和禁止派发子代理；
- finding 证据门槛：当前、具体、由 diff 引入或变得可达；
- 输出字段：`[P0|P1|P2]`、`Evidence`、`Impact/Reachability`、`Repro/Test/Contract contradiction`、`Suggested fix`；
- 无问题精确文本与最终 merge verdict 格式。

## 4. 父会话综合

父会话读取三个完整输出后：

1. 将同一根因的重复 finding 合并；
2. 对 P0/P1 和有冲突的结论直接检查当前源码、diff、测试或合同；
3. 剔除范围外、既有问题、纯偏好、不可达推测和证据不足项；
4. 分类为“现在值得修复”“可选改进”“忽略或延期”；
5. 给出总体 merge verdict。

初始审查不含 autofix。父会话综合后用户已批准仅修复值得现在处理的 P1，并确认返现业务尚未上线，因此无需兼容历史返现数据。

## 5. 获批修复设计

1. **共享对账门禁**：抽取现有 bounded reconciliation 检查，让定时结算和成熟奖励的人工 approve 发放入口都在发放前调用；不引入全历史扫描。
2. **支付失败关闭**：删除 `CashbackOrderContext` 表不存在时的成功旁路。历史订单兼容只在表存在且按 `first_enabled_at` 判断为旧订单时生效。
3. **稳定重试错误**：为 quota mutation pending 与 fence ownership lost 增加稳定 cashback API code、明确 409/503 语义、OpenAPI 描述和七语言前端提示，不再把底层英文错误直接展示给管理员。
4. **pending 弹窗可退出**：Confirm 在请求期间继续禁用并保留同步重复提交保护，但 Escape、关闭按钮和 Cancel 不得被无限锁死；关闭后 mutation 自身仍负责完成 query invalidation。
5. **mutation 表边界**：保留 `CashbackQuotaMutation` 作为主数据库事务内的发放/奖励追回/本金追回资金凭证。业务尚未上线，因此从首笔业务记录开始完整写入，不增加回填或 cutover。
6. **奖励计数文案**：遵循仓库现有计数文案模式；保证数值 1 使用自然单数，其他值使用复数并保持本地化数字格式。七语 locale 仍通过受控脚本更新。
7. **生产数据库集成验证**：新增 `TEST_MYSQL_DSN` / `TEST_POSTGRES_DSN` 门控测试。测试必须使用唯一表名前缀或等价隔离机制，只迁移/清理自身表；在真实方言上验证返现表与复合索引、`FOR UPDATE`/事务并发至多一次、唯一 mutation 与最终余额。未配置 DSN 时明确 skip，不以 SQLite 结果冒充生产数据库验证。

## 6. 故障与完整性

- workflow、runner、prompt runtime 或 child tooling 失败即停止，报告 run/status、repo/CWD/branch 和工作树状态；只允许同协议安全重试或请求用户决定。
- 只有一个 writer 可修改当前工作树；必须保留无关脏文件。
- i18n locale 写入必须通过项目 `add-missing-keys.mjs` 工作流并运行 `bun run i18n:sync`，不得手工修改 locale JSON。
- child 结论是证据，不是决策；最终验收由父会话负责。
