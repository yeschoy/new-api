# 实施计划：整百返现策略

## 实施顺序

1. 基线：检查 `git status` 和 `git diff`，保护用户在 `.gitignore`、`web/src/features/cashback/index.tsx`、`web/src/features/cashback/__tests__/table.test.tsx` 的修改；读 Trellis backend/frontend 指引、返现合同、billing 规则与前端技能。确认五个在线支付入口的面额、转换与 token 归一化实际行为。
2. 服务端设置：增加双向模式与 X 的默认值、Option round-trip、旧 PUT 保留、服务端单方向/混合合计及启用状态校验，更新 controller 字段错误与配置审计；扩展原有设置/控制器测试，核对并发原子更新。
3. 返现专用订单快照：下单时按各渠道输入保存有效面额及其额度换算因子；不改购买额度、支付价、结算。增加新旧订单数据校验及迁移；有信用渠道完成路径分别覆盖。迁移前旧上下文缺快照时按设计产生零额取消记录，不能阻断支付。
4. 计提/奖励记录：固定金额使用每单整数百数和严格额度换算；继续现有封顶/风险/审核/发放/退款追回；奖励记录保存显式策略与参数，旧行视为比例。扩展 `model/cashback_test.go` 中一组行为回归，覆盖 99/100/250、60+40、双方向混用、上限、支付时策略切换、零额、重复回调、倍率变更、旧记录/旧订单；避免重复或无意义的跨层测试文件。
5. 管理端：扩展现有设置表单、服务端字段映射、策略条件输入与风险确认；奖励列表/详情正确显示整百；更新 API 类型与现有前端回归（谨慎处理已被用户修改的 table.test）。复用现有 UI 组件，不另起选择器/弹窗。七语文案只通过 i18n 脚本写入；最后 sync，删除新增非业务临时脚本需先依用户清理同意执行。
6. 对照计划验证完整调用链/资金不变量；先完成检查再根据 findings 修复。更新必要的返现 Trellis 规范（不是在 docs/ 新建文件），提交本任务产品及 Trellis 改动，不连带提交用户原有改动。

## 验证门槛（实际运行后记录版本、命令和结果）

- `gofmt` 修改的 Go 文件；`go test ./setting/operation_setting ./controller ./model` 中受影响用例及全量适用回归；若耗时明显，先 `go test ./model -run 'Cashback|TopUp'` 和 `go test ./controller -run 'Cashback|TopUp'`；`go build ./...`。
- 在真实 SQLite、MySQL 与 PostgreSQL 分别运行新的返现跨库集成测试；记录 `sqlite_version()`、`SELECT VERSION()`、`SHOW server_version` 实际结果及 DSN 来源（不泄密）。每种数据库覆盖 fresh migration、从最新发行版 schema+代表数据升级、连续启动/迁移两次、数据/唯一性/索引、回调与生成金额行为；`TEST_MYSQL_DSN` / `TEST_POSTGRES_DSN` 当前未设置，实施时准备隔离实例，若不可用必须明确报阻塞，不能声称完成。只在本次改动影响 LOG_DB 共享路径时加入 ClickHouse 验证；设计仅改主库返现侧表。
- `cd web && bun run typecheck`；受影响测试至少 `bun run test --run src/features/system-settings/billing/__tests__/cashback-validation.test.tsx src/features/cashback/__tests__/table.test.tsx`（以 package.json 当前测试命令为准）；受影响文件 lint 和 `bun run build`，检查现有 UI 组件复用、可访问标签/键盘、七语键完整与 i18n sync 结果。
- 运行 Trellis check / `python3 ./.trellis/scripts/task.py validate 09-30-cashback-per-hundred`，核对任何 DB blocker、用户未提交修改与 `git diff --check`。记录未验证项，不把模拟或单库测试写成三库结论。

## 风险点与回滚点

- `CashbackReward.validate` 的 `CalculatedQuota <= BaseQuota`、单笔/24 小时封顶、重复支付回调与恢复台账必须继续成立；禁用或回滚新策略不删除已发奖励，保留其快照。旧未付款订单无面额快照的零额行为需专门测试/审查。
- 配置模式切换需保留旧客户端策略字段；切换后旧客户端不能误清除整百金额。上线需考虑先完成 DB 增列再启用新策略；实例跨版本混跑时先禁用整百，避免旧版本仅按比例计提。
- 新增 schema 验证失败，先停在实现或检查阶段，不提交不符合三库规则的完成结论；返现开关可关停新奖励生成，已有冻结奖励仍按原快照处置。
