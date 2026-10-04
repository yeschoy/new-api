# 当前返现改动并行对抗审查：执行计划

## 前置门

- [ ] 用户审核并明确批准本任务最终规划摘要后，再运行 `task.py start`。
- [ ] 读取 subagent workflow/tool-reference、prompting、execution、review 和 constraints 指引。
- [ ] 再次运行 `subagent action:list, capabilities:true`，确认 `reviewer` 可执行。
- [ ] 记录启动前 `git status --short`、HEAD/branch 和目标 diff，确保 reviewer 只读。

## 并行审查

- [ ] 由父会话发起唯一一个顶层异步 workflow 调用。
- [ ] workflow 内用 `runs.all` 同时启动三个 `reviewer`，分别标注资金安全、前端合同、验证结构三个角度。
- [ ] 每个 child 使用 `context: fresh`，prompt 首行写入 `Active task: .trellis/tasks/09-16-cashback-adversarial-review`。
- [ ] prompts 明确要求直接读取仓库指令、返现 spec、原任务计划、当前 diff 和未跟踪目标文件；不得依赖主对话。
- [ ] prompts 明确只读、证据门槛、P0/P1/P2、精确无问题文本、建议修复和 merge verdict。
- [ ] 为每个 reviewer 绑定持久输出引用；普通 async 完成依赖原生通知，不轮询。

## 综合与复核

- [ ] 收齐三份输出后，父会话按根因去重。
- [ ] 对关键 finding 读取对应源码/测试/合同，必要时运行窄范围只读复现或测试。
- [ ] 过滤非当前、非目标 diff、无证据、纯偏好和范围外建议。
- [ ] 汇总为：现在值得修复、可选改进、忽略或延期，并给出总体 merge verdict。
- [ ] 若无现在值得修复项，报告结果且不编辑；若有，提供编号菜单并等待用户选择。

## 获批修复 Pass

- [ ] 使用单一 `trellis-implement` writer 修改当前工作树，不派发并行 writer。
- [ ] 为人工成熟审批补上与 scheduler 共用的 bounded reconciliation 门禁及回归测试。
- [ ] 删除 context 表缺失时的支付成功旁路，并增加事务回滚/错误回归测试。
- [ ] 将 quota mutation pending / fence lost 映射为稳定 API code 和 409/503，更新 OpenAPI、前端错误映射及七语言文案。
- [ ] pending action dialog 保持 Confirm 禁用和同步去重，但允许 Escape、关闭按钮与 Cancel；更新用户行为测试。
- [ ] 保留 `CashbackQuotaMutation`，不实现历史回填或 cutover。
- [ ] locale 变更严格通过 `web/scripts/add-missing-keys.mjs` 临时脚本流程和 `bun run i18n:sync` 完成，随后删除临时脚本。

## 获批 P2 Pass

- [ ] 修正奖励数量在 1 与其他数量下的单复数显示，并增加 table/summary 最小回归测试；不得顺手清理其他历史计数文案。
- [ ] 按现有环境变量约定增加 MySQL/PostgreSQL 返现集成测试，使用唯一隔离表前缀和可靠 cleanup，验证相关表/index、真实并发至多一次、最终余额和唯一 mutation。
- [ ] 运行未配置 DSN 的门控测试并确认明确 skip；若当前环境提供 DSN，必须实际运行相应方言测试，否则在报告中明确标注未执行真实数据库验证。

## 验证与收尾

- [ ] 对比修复前后 `git status --short`，确认无关脏文件未被修改。
- [ ] 运行聚焦 Go model/controller 测试和相关 React 测试。
- [ ] 运行 `cd web && bun run typecheck`、涉及文件 lint，并运行 `git diff --check`。
- [ ] 派发 fresh-context `trellis-check` 复核四项 P1 和修复爆炸半径。
- [ ] 记录编排失败、未运行验证和残余风险。

## 禁止事项

- [ ] 不实现历史 mutation 回填或范围外重构。
- [ ] 不提交、amend、push 或创建 PR。
- [ ] 不修改无关脏文件或以修复名义清理代码。
