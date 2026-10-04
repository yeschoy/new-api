# 实施计划：可配置阶梯返现

## 前置检查

- [ ] 确认 `feat/recharge-cashback` 工作区没有他人未提交变动；按 `trellis-before-dev` 读取 backend/frontend 指南、返现契约、数据库规范、`web/AGENTS.md`、shadcn-ui、i18n-translate、React 最佳实践。
- [ ] 用已有测试先锁定原策略、配置合并与预估口径；选取现有表单/表单控件和 `.trellis/spec/` 中的跨层契约。
- [ ] 先写失败回归用例，分别覆盖配置字段、支付时最高档与分精度、公开页生效规则。

## 1. 配置与纯计算（可回滚点）

- [ ] 在 `setting/operation_setting/cashback_setting.go` 增加阶梯类型、两个 Option 字段及第三策略；服务端验证严格升序/不重复、正整数分、档位数/序列化界限、合计名义曝光；继承旧 PUT 的缺席保留语义与旧数据默认值。
- [ ] 修改 `model/cashback_config.go` 原子保存/加载及配置缓存更新，并扩展 `controller/cashback_config.go` DTO、校验字段映射、更新审计字段。用 `common` JSON 包装处理数组。扩展既有 `setting/operation_setting/cashback_setting_test.go`、`controller/cashback_config_test.go`，避免多层重复夹具。
- [ ] 实现可复用的整数分选档与精确 quota 转换。验证恰好达档、差 1 分、超过最高档、额度溢出/不能转换、旧订单缺面额快照；分级计算本身不读取或改变账户。

## 2. 支付计奖与预估（可回滚点）

- [ ] 移除首轮后端未提交实现中引入的 `face_basis_kind` 列、元数据及所有读写，不增加表结构；仅使用现有订单面额快照、订单支付渠道和单位因子，对当前 CNY 标准充值选档，对 Creem/因子为 `1` 的非标准路径保守不计新策略。接入 `model/cashback_rewards.go` 的支付事务：每方向独立选择策略及最高档；保留零额审计、活动/审核/限额/欠款与幂等流程，不用前端预估作为支付输入。`CashbackReward.validate` 接受新策略且保持旧记录；已有快照包含支付时完整档位。
- [ ] 扩展 `model/cashback_preview.go` / `controller/topup.go` 及钱包预估 DTO/显示；标准订单以面额为准、token/Creem 对阶梯返回显式不适用，原有策略不变。钱包名义预估与后端同步，防过期响应和错误金额暗示。
- [ ] 扩展 `model/cashback_test.go`、`model/cashback_integration_test.go` 对支付时间切换、双方向、50/100/200/500/1000、100.50 分边界、重试/限额/审计、旧订单面额缺失及非标准路径不误发进行回归；尽量集中在原有文件。

## 3. 管理表单、审核展示与公开页

- [ ] 先查复用的表单、Input/Select/Button 与业务封装；在 Root 表单按方向编辑动态档位，前端只做 UX 校验、服务端仍为权威。沿用确认弹窗的高返还提示；切换策略不清除其他策略数据，所有输入/错误与删除按钮具备 label、键盘/焦点语义。
- [ ] 更新 `web/src/features/cashback` 列表/详情的第三策略标签；从配置快照与订单面额展示命中档，无需新增冗余奖励列。更新钱包预估的规则文案与测试。
- [ ] 新增最小匿名 `/api/cashback/public-offers` DTO、有效期判断、拒绝泄露内部字段的接口测试；`/activity` 加载实时规则，正确处理无活动、部分方向启用、加载失败和响应竞态；顶部长期固定显示“国庆期间”，但无活动时明确写无生效优惠。七语言经 i18n skill 指定流程同步；前端交互/窄屏/语言切换测试补齐，断言固定文案与实时活动状态互不替代。
- [ ] 同步更新 `.trellis/spec/backend/referral-recharge-cashback.md` 中配置、支付面额、预估、公开接口及三库测试契约；如现有相关文档需要同步，优先修改已有文件，不新增 `docs/` 文件。

## 4. 质量门禁与提交

- [ ] 每轮修改 Go 文件 gofmt；`GOWORK=off go build ./model ./controller ./router`（不替代数据库测试）。
- [ ] 所有 DB 相关 Go 测试在任务专用 Docker Go runner 内跑；在独立 MySQL/PostgreSQL 实例设置 `TEST_MYSQL_DSN` / `TEST_POSTGRES_DSN`，运行 `TestCashbackProductionDatabaseIntegration` 且核对未 skip，再跑 `go test ./model ./controller -run 'TestCashback...'` 等受影响测试，记录真实 SQLite/MySQL/PostgreSQL 版本。配置 Option 与奖励读写须兼容既有库；本方案不改模型或迁移。若后续发现必须修改表结构，停止实施并更新规划，不在无验证条件下偷偷引入新列。Docker 不可用时报告验证受阻，不在宿主机跑 SQLite 测试或声称任务完成。
- [ ] `cd web && bun run test <相关文件>`、`bun run typecheck`、变更文件 `oxlint`/`oxfmt --check`、`bun run build`；再按影响范围运行整套前端测试，列明不相关失败。`cd relaykit && GOWORK=off go build ./...` 仅当更改该模块/API 时运行。
- [ ] 按 `trellis-check` 做安全/跨层/复用/历史兼容复核，`git diff --check`；只提交本任务文件和 Trellis 规划/契约文件到功能分支，不推 `main`。本任务的构建产物或 Docker 资源仅在用户同意后清理（Trellis 日志无需清理）。

## 验证记录（2026-09-30，待全局门禁复核）

- 所有数据库 Go 测试在任务专用 `tiered-0930-go`（Go 1.25.1）中运行，未使用宿主机数据库。该 runner 的变更 Go 文件与宿主 SHA-256 一致。真实引擎：Go SQLite `sqlite_version()=3.50.4`、MySQL `8.0.46`、PostgreSQL `16.15`。容器与网络仅属本任务，无宿主端口，待用户同意后清理。
- `go test ./model -run '^TestCashbackProductionDatabaseIntegration$' -count=1 -v`：MySQL/PostgreSQL 子测试及五种渠道子测试均 PASS，未 skip；`go test ./model ./controller ./router ./setting/operation_setting -run '^(TestCashback|TestDefaultCashback|TestValidateCashback|TestParseCashback)' -count=1`：四包 PASS，SQLite 测试位于 runner。`go test -race ./model -run '^(TestConcurrentCashbackSettlementCreditsAtMostOnce|TestCashbackReconciliationConcurrentCleanCannotUnpinMismatch|TestCashbackTieredPaymentUsesHighestOrderFaceTierAndPreservesAudit)$' -count=1`：PASS。首次路由测试发现新夹具重复空邀请代码导致 SQLite 唯一性失败，已为两个用户设不同 `AffCode` 后复测 PASS。
- `cd relaykit && GOWORK=off go test ./...`（runner）PASS。前端 9 个相关测试文件 `bun run test <paths>` 为 **93/93 PASS**，`bun run typecheck`、变更文件 `oxlint`/`oxfmt --check`、`bun run build`、`git diff --check` PASS；最终无障碍修补后的复核另有 7 文件 69 项通过。
- 全量 `make test` **FAIL**：初次非 loopback DSN 被现有 controller 测试拒绝；改用任务专用共享网络命名空间中 `127.0.0.1` 的真实 MySQL/PostgreSQL 后，该 controller 三库测试组 PASS。剩余独立失败：middleware 的过期 JWT 两项返回 200 而非 401，以及 model 的 `TestRedemptionDatabaseMatrix/postgres` 在整包顺序下发现此前测试遗留 `tokens` 表；相关文件均未由本任务修改，独立隔离测试 `TestMigrationSchemaStability|TestRedemptionMigration|TestRedemptionDatabaseMatrix` 已 PASS，故不能报告全量通过。完整 `bun run test` 仍报告 132 个失败，主要分布于未修改模块；同数失败在本任务前的测试中已出现，但尚未逐一做基线对照。未修复这些任务外失败，未推送/部署。

## 停止/回滚点

- 配置验证、支付计奖或三库矩阵不通过：不启用新策略，不合入生产分支；保留旧 `rate` / `per_hundred` 行为。
- 上线后需要回滚：Root 先切回旧策略或关闭方向；保留新 Option 键和历史快照，不删除支付记录。
- 公共接口发生泄露或无法判定活动状态：下线公开规则展示并返回不可用状态，不透传 Root DTO 或展示过期档位。
