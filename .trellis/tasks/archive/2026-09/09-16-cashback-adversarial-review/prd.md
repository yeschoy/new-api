# 当前返现改动并行对抗审查

## Goal

对 `feat/recharge-cashback` 分支当前工作树中的返现相关未提交改动运行一次独立、只读、fresh-context 的并行对抗审查，找出由当前差异引入或变得可达的具体问题，并由父会话给出可执行的合并判断。

## Background / Confirmed Facts

- 当前 HEAD 为 `1d9663551`，审查目标是相对 HEAD 的返现相关工作树差异，包含已跟踪修改及未跟踪的 `model/cashback_ledger.go`、`model/cashback_reconciliation.go`、`model/user_quota_cache_fence.go`。
- 目标差异跨越后端资金状态机、事务与 Redis 额度一致性、控制器、迁移、React 管理界面、测试、七语 i18n、OpenAPI、运维文档和返现规范，属于跨层高风险审查。
- 主要合同来源是 `.trellis/spec/backend/referral-recharge-cashback.md`，原功能任务位于 `.trellis/tasks/archive/2026-09/09-15-referral-recharge-cashback/`。
- 现有 `.trellis/tasks/09-16-referral-cashback-review-loop/` 记录了此前审查循环；本任务只审查当前工作树的最新状态，不依赖主会话历史或此前 reviewer 结论。
- `.pi/npm/`、`.trellis/.template-hashes.json`、通用 guideline 模板改动以及本任务目录不是返现实现审查目标；reviewer 可读取相关指令，但不得把这些既有或编排性改动误报为返现 finding。
- 初始审查未启用 `autofix`；审查综合后，用户明确批准修复“现在值得修复”的 P1。
- 用户确认返现业务尚未上线，正式环境不存在旧返现业务数据。因此保留新增的 `CashbackQuotaMutation` 资金凭证表，但历史台账回填 finding 的前提不可达，本任务不实现回填或 cutover。

## Requirements

1. 父会话使用一个顶层并行编排，同时启动三个只读 reviewer；所有 reviewer 使用 `fresh` context，不得使用 forked context。
2. 三个 reviewer 必须从当前仓库直接读取 `AGENTS.md`、相关 Trellis 指令/规范、原功能任务材料、`git status`、当前 diff 及未跟踪目标文件，不得依赖主会话对话历史。
3. 根据当前差异采用三个互补角度：
   - 后端资金正确性、事务/并发、Redis/DB 一致性与安全边界；
   - 前端 UX/API 契约、权限、可访问性、类型/i18n 与跨层行为；
   - 测试有效性、迁移/多数据库/性能、文档合同与简单可维护性。
4. 每个 reviewer 只报告具体且当前的问题。对 diff 审查，finding 必须由本次差异引入或因本次差异变得可达，并由源码证据、可运行测试/复现或明确合同矛盾支持。
5. 每条 finding 标记 P0/P1/P2，提供文件与行号、影响/可达性和建议修复；P0 阻止合并，P1 应在发布前修复，P2 仅报告。
6. reviewer 不得修改文件，也不得派发子代理。无合格 finding 时必须精确写出 `No issues found.`。
7. 每份审查必须以 `Merge verdict: BLOCK`、`Merge verdict: OK` 或 `Merge verdict: OK with notes` 结束，正文是审查反馈而不是上下文摘要。
8. 父会话必须复核和去重 reviewer 结论，并综合为：现在值得修复、可选改进、忽略或延期及简短理由；不得机械接受所有建议。
9. 审查完成后先征得用户同意；用户已选择仅修复值得现在处理的 P1。
10. 获批修复严格限于四项：所有发放入口共享对账门禁、上下文表缺失时支付失败关闭、quota fence 冲突稳定 API/前端错误契约、pending action dialog 可安全退出且仍禁止重复提交。
11. 保留 `CashbackQuotaMutation`；因业务未上线，不增加历史回填、cutover 或旧数据兼容复杂度。
12. 用户随后批准处理两项 P2：修正奖励数量的单复数显示；按仓库现有 `TEST_MYSQL_DSN` / `TEST_POSTGRES_DSN` 门控模式增加安全隔离的返现生产数据库集成测试，覆盖迁移/index、真实行锁/并发至多一次和 mutation 结果。
13. 任一编排、runner 或 child 启动失败都视为基础设施阻断；父会话报告准确状态，不得静默切换执行协议。

## Acceptance Criteria

- [ ] 三个 reviewer 在一个并行 workflow 中以 fresh context 成功完成只读审查。
- [ ] 每个 reviewer 的任务 prompt 明确其独立角度、仓库/CWD、目标工作树范围、证据门槛、禁止编辑和输出格式。
- [ ] reviewer 实际检查当前 diff、目标未跟踪文件、项目指令、返现规范及原任务计划。
- [ ] 所有保留 finding 都有当前文件/行号证据，并能说明为何由目标差异引入或变得可达。
- [ ] 每份输出符合 P0/P1/P2 和 merge verdict 契约；无问题时使用精确文本 `No issues found.`。
- [ ] 父会话完成证据复核、重复项合并和三类综合：现在修复、可选改进、忽略/延期。
- [ ] 父会话明确总体 merge verdict，并在修改产品代码前取得用户批准。
- [ ] 四项获批 P1 均有回归测试，后端聚焦测试与前端测试/typecheck/lint 通过。
- [ ] `CashbackQuotaMutation` 保留且从首笔业务记录开始写入，不新增不可达的历史回填。
- [ ] 奖励计数在 1 与其他数量下显示正确，七语键一致并有前端回归测试。
- [ ] 新增 MySQL/PostgreSQL DSN 门控集成测试；测试使用隔离表名并清理自身数据，不破坏共享数据库；DSN 缺失时明确 skip，配置后验证真实 migration/index、行锁并发、至多一次余额与 mutation。

## Out of Scope

- 历史 mutation 回填或 cutover；用户已确认业务未上线、无旧返现数据。
- 自动启动、配置或销毁本机/远程 MySQL/PostgreSQL 服务；集成测试仅消费显式 `TEST_MYSQL_DSN` / `TEST_POSTGRES_DSN`。
- 修改、格式化或清理无关脏文件。
- 重新设计已批准的返现产品范围。
- 提交、amend、push 或创建 PR。
