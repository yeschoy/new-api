# 整百返现的面额来源与跨层边界（规划调查）

## 确认的代码证据

- `model/cashback.go:CashbackOrderContext.BaseQuota` 是钱包额度（int），`TopUp.Amount` 也不是跨渠道统一面额。`model/cashback_rewards.go:CompleteTopUpCashbackTx` 在支付成功事务中取当时配置，基于 `BaseQuota` 计算比例并将 `RateBPS`、计算值、配置版本/快照写入奖励；`CashbackReward.validate` 保证计算值不超过 `BaseQuota`。
- `controller/topup.go`、`controller/topup_stripe.go`、`controller/topup_waffo.go`、`controller/topup_waffo_pancake.go`：下单原始输入 `req.Amount` 是用户选定面额。经 `cashbackBaseQuotaFromTopUpAmount` 归一化；token 展示模式会在 TopUp.Amount 存储前对部分渠道截断，因此支付时不能统一从该列反推原输入。
- `controller/topup_creem.go`：商品输入是 `selectedProduct.Quota`，即商品展示额度（`web/src/features/wallet/components/creem-products-section.tsx` 展示 Quota），并直接作为 BaseQuota；商品 Price 是支付金额，不是返现基数。
- `controller/topup.go:getTopUpQuota`：非 token 模式以 `common.QuotaPerUnit` 转换成额度；token 模式把输入截成单位倍数后形成 BaseQuota。`common/constants.go` 当前缺省倍率 500000、可配置。按 BaseQuota / 100 直接取整不等于按用户选择的面额每百取整；以支付时的倍率重算也有配置漂移风险。
- `setting/operation_setting/cashback_setting.go` 通过 `cashback_setting.*` Option 保存原有双向比例；`controller/cashback_config.go` 当前必填旧字段，新增字段要兼容旧客户端并保持配置更新原子性；同方向与两方向合计上限的服务端约束不可委托前端。
- `model/cashback.go:CashbackReward` / 管理员详情页目前仅用 `rate_bps` 展示比例，固定金额策略不能伪装成比例；需要保存/呈现实际模式与固定金额并兼容历史行。
- 前端现成 `CashbackSettingsForm` 复用 React Hook Form、SettingsForm、Input、FormField、SettingsPageFormActions；策略选择可复用 `web/src/components/ui/select.tsx`，调用样式见 `web/src/features/system-settings/auth/passkey-section.tsx`。现有回归在 `web/src/features/system-settings/billing/__tests__/cashback-validation.test.tsx`。七语言翻译用 `.agents/skills/i18n-translate/SKILL.md` 规定的脚本路径。

## 规划中的安全/兼容边界

- 下单时在返现专有 `CashbackOrderContext` 上保留原始面额和该面额对应额度的换算系数；支付成功时仍读最新返现配置，但使用不可变下单面额与换算证据，避免渠道、展示模式、倍率变更造成错算。不使用实付 Money 或到账 CreditedQuota。
- 对迁移前已存在、无法可靠恢复原始面额的未付款订单，若付款时选择新策略，不猜测返还数额，也不阻断合法充值；把该方向记为零额、不可发放并留可审计原因。旧比例策略仍按 BaseQuota 正常工作。此风险需在最终规划摘要明确提示用户。
- 新增 `CashbackOrderContext` / `CashbackReward` 字段属于数据库变更，完成门槛是 SQLite、MySQL、PostgreSQL 实例的 fresh + 代表最新已发布版本升级、两次启动/迁移及唯一性/旧数据验证；缺实例不得声称数据库兼容或任务完成。目前本终端 `TEST_MYSQL_DSN`、`TEST_POSTGRES_DSN` 未设置（mysql/psql/docker 命令存在），验证待执行。
- 记录用户预存未提交改动：`.gitignore`、`web/src/features/cashback/index.tsx` 和 `web/src/features/cashback/__tests__/table.test.tsx`；不覆盖或误提交。
