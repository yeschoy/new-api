# 实施计划：订阅套餐适用分组

1. **基线与测试定位**：检查当前分支/工作区及 `model/subscription.go`、`service/billing_session.go`、`controller/subscription.go`、表单/购买展示；确认 `RelayInfo.UsingGroup` 在文本、图片、任务插件、`auto` 与重试的预扣前均是实际分组。记录测试入口，不动用户已有改动。
2. **回归用例先行**：优先扩展现有合适的 Go 测试文件；覆盖限定组与非限定组、存量不限、同组多渠道、`auto` 实际组、多个有效套餐最早到期和足额、严格套餐不匹配可钱包/匹配不足禁钱包、四种计费偏好、预扣失败回滚、套餐编辑后生效、结算/退款不跨订阅。必要时新增最多一个集中回归文件。前端新增/扩展 feature `__tests__` 内的表单与购买/已购显示测试，不重复空泛覆盖。
3. **模型/迁移**：在 `SubscriptionPlan` 增加 `ApplicableGroup` 和默认不限；更新 SQLite 手写建表和缺列增列、MySQL/PostgreSQL 现有迁移。预扣记录存预扣时真实组及适用范围；旧记录未知来源时只允许仍不限的计划复用。三库旧库升级需覆盖两个表。管理新增/修改服务端校验真实分组、支持清空；编辑提交后失效缓存。为活跃订阅摘要提供当前计划适用范围，确保失效/停用计划仍可读。
4. **服务端扣费**：从 `RelayInfo.UsingGroup` 传组至资金来源；订阅预扣事务内用当前计划校验分组，区分无适用/适用但余额不足、保持幂等和先到期顺序；调整 `NewBillingSession` 回退以及仅查询匹配套餐的严格溢出规则，保留错误与令牌回滚语义。审查 `auto`、钉住渠道、异步任务/任务插件路径及消费日志资金来源与订阅 ID。
5. **管理与用户 UI**：复用表单的 Combobox、表格 GroupBadge、钱包卡和购买确认，加入独立字段及清晰的动态适用范围展示；显示不限分组，区分升级分组。更新类型/表单映射；遵守 `web/AGENTS.md`、shadcn-ui/i18n skill，locale 更新必须经 `web/scripts/add-missing-keys.mjs` 与 `bun run i18n:sync`，七语言齐全。
6. **本地检查**：`gofmt` 修改过的 Go 文件；`go test ./model ./service ./controller -run '<focused tests>' -count=1` 和 `go build ./...`（其中所有 DB 测试在任务专用可丢弃 Docker Go 容器中运行）；`cd web && bun run typecheck && bun run test -- <affected files>`，对修改文件运行 lint/format 检查，并 `bun run build`；`git diff --check`。按 `AGENTS.md` 跑 `make test` 可行范围并报告未运行/基线失败。
7. **强制真实三库矩阵**：先检查 Docker 可用性，仅用本任务 Docker 网络/容器/卷及隔离数据库与容器内 Go runner。记录 SQLite/MySQL/PostgreSQL 实际版本、相应 DSN 与未跳过的运行结果；三库均测新库迁移与选组/钱包回退事务。用 `v1.0.0-rc.40`（若有更近的正式发布，以最新为准）构造代表性旧表和数据，再用新代码迁移两次、核对存量 `id`/金额/索引/唯一性/空分组，单独测 SQLite 手写建表路径。覆盖最低支持版本的差异风险；Docker 启动失败则报告「验证受阻」，禁止宿主数据库替代。测试资源直到用户同意才清理。
8. **检查与交付门槛**：运行 Trellis check；核对 PRD A1-A7、三库证据、并发缓存行为、UI 复用及七语言。必要时更新 `.trellis/spec/` 的稳定计费约定，显式提交任务规划文件、spec、业务代码及测试（不含临时构建/数据库/日志）。未经三库强制验证不能宣称数据库兼容或任务完成；不直接推送 `main`。

## 高风险点与回滚检查

- SQLite `ensureSubscriptionPlanTableSQLite` 不能漏新库和旧库两条 DDL 路径；旧库重复迁移后仍能读写。
- 不匹配与额度不足必须区分，否则严格套餐会误阻断钱包、或匹配套餐耗尽后错误放开钱包。
- `auto` 的真实分组及钉住/重试路径不可用字面量/渠道 ID 代替；失败时不可扣错订阅。
- 管理计划缓存命中不可在编辑后长时间使用旧适用分组，已预扣的请求结算不可切换资金来源。
- 回退开关：可清空套餐适用分组恢复旧不限行为；所有清理仅在用户授权后执行。
