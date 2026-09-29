# 执行计划：充值人手审后即时发放

1. 在 `model/cashback_test.go` 扩展真实行为回归：手审充值人未来 `available_at` 立即授信；旧已批准/未来到期由定时任务领取；邀请人仍到期；自动批准但关闭即时开关仍等候；高/严重风险理由、硬阻断、失败/重试、重复审批与扫描并发不重复发放。
2. 修改 `model/cashback_state.go` 审核和单奖发放资格、可观测失败记录；修改有界扫描，区分审核来源并保留历史 T+N 证据。检查主库 mutation、额度 fence 和对账次序不变。
3. 对齐管理端审核对话框/详情的充值人文案与有效资格；按 `web/AGENTS.md`、`shadcn-ui`、`i18n-translate` 执行组件复用、七语翻译及行为测试；邀请人文案保持原意。
4. 修订既有 `.trellis/spec/backend/referral-recharge-cashback.md` 对人工充值人 T+N 的旧合同及现有运维说明（不新增 docs 文件）。
5. 执行 `gofmt`、聚焦 Go 测试/竞态检查、前端相关 Vitest/typecheck/lint/i18n；资金状态和 DB 查询在真实 SQLite、MySQL、PostgreSQL 进行安全隔离的数据库验证并记录版本与结果。若新增 schema，则三库新建、代表性旧版升级、重复迁移、独立 log DB 相关路径也验证。
6. `trellis-check` 审核资金路径/旧奖扫描/用户文案；失败则回到第 1 步。检查 diff、更新 spec、提交本子任务和 Trellis 文件，再交给父任务整体验收。不执行线上补发脚本。
