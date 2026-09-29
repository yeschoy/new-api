# 设计：按充值面额每满百返固定额度

## 边界与数据流

Root 设置页（双方向模式+整数 X）→ `PUT /api/cashback/config` → `CashbackSetting` 的 Option 键（版本/审核/合规仍原子更新）→ 下单时在返现专用 `CashbackOrderContext` 保存订单有效面额及换算证据 → 验签支付成功事务读取最新设置、创建每方向 `CashbackReward` → 旧审核、封顶、发放、追回及对账链路。无需改普通计费表达式或实付/购买额度计算。

### 配置合同

- 新增 `inviter_strategy` / `invitee_strategy`（`rate`/`per_hundred`）和 `inviter_fixed_per_hundred` / `invitee_fixed_per_hundred`（整数 0～100；选中且开启时 1～100）；两个方向仍使用已有开关、`*_rate_bps`、单笔/24h 限额。旧 Option 缺键默认 `rate` 与 0。
- `PUT` 新键用指针接收，旧客户端不传时在持有版本行锁的 `UpdateCashbackSettingAtomic` 内保持当前值；新客户端发送全量。未知模式、负值、溢出/小数由服务端拒绝。按选中模式计算名义 BPS（rate 为原 BPS；fixed 为 `X * 100`），合计 <=10000。双向名义约束延续原行为，不依赖前端校验；未选中的字段仍限制合法取值。
- 复用原来的合规、风险配置、首次开启时间与审计 changed fields；更新配置只影响支付完成后创建的新奖励。高暴露配置确认弹窗以两个方向选中策略的名义比例衡量。

### 订单快照与金额

- 追加到返现专有 `CashbackOrderContext`：`face_amount`（整数、有效充值面额）与 `quota_per_face_unit`（正数十进制文本，下单时的转换系数）。旧行允许 0/空组合；新单必须提供且验证两字段。现有 BaseQuota 继续作为旧比例策略和单笔防超额上界，不用 `TopUp.Money`、CreditedQuota 或支付时最新汇率反推。
- Epay/Stripe/Waffo/Pancake 在现有 `insertOnlineTopUpWithCashbackContext` 下单入口上传原始面额和下单时的计量转换；非 token 模式单位对应 `common.QuotaPerUnit`，token 模式每 token 对应 1 quota。token 模式若现有 `getTopUpQuota` 对面额取整，则快照**实际归一化购买面额**以保持奖励不超过 BaseQuota，不在返现逻辑里修改充值主流程。Creem 商品以展示的 `selectedProduct.Quota` 为面额、1 quota/单位，不按 `Price` 换算。对所有提供方保留 `BaseQuota` 不变。
- 新策略 `count = face_amount / 100`（整数除法）；使用十进制算术计算 `floor(count × X × quota_per_face_unit)` 并经钱包严格有界转换；最终必须在 `[0, BaseQuota]`。非整数换算系数的余数只在最终兑换额度时向下取整。预留防溢出、非法快照/不一致拒绝（不允许负额或超本金）。按比例仍使用原 `calculateCashbackQuota(BaseQuota, RateBPS)`。
- 迁移前的未付款旧订单若订单上下文缺少可信 `face_amount`/系数而支付时选择整百，不从渠道的 `TopUp.Amount` 猜测；为该方向留 `CalculatedQuota=RewardQuota=0`、`cap_reason=face_basis_unavailable`、取消发放的可审计记录，订单付款和充值正常成功；有可靠快照的其他方向照常创建。须让当前退款/对账逻辑接受该零额记录。

### 奖励记录与显示

- 追加 `CashbackReward.strategy`（历史空值视为 `rate`）和 `fixed_per_hundred`（固定整数，比例为 0），保留现有 `rate_bps` 供旧历史记录读取；固定策略 `rate_bps=0`，绝不能仅展示成 0%。更新奖励校验、快照、列表/详情 API 类型，管理员表格及详情显示实际模式和「每满 100 返 X」参数、计算/封顶值。旧记录空策略展示其原比例。
- 旧侧表在主库使用 `AutoMigrate` 增列，兼容 SQLite/MySQL/PostgreSQL，不改现有唯一索引；新数据的状态/金额/追偿仍走原有链路。验证新库与最新发行版升级，重复迁移与原记录可读。

### 前端复用与国际化

- 延伸现有 `CashbackSettingsForm`、`SettingsForm`、`FormField`、`Input`、`SettingsPageFormActions`；策略选择使用已有 `web/src/components/ui/select.tsx`，其 RHF 集成参考 `web/src/features/system-settings/auth/passkey-section.tsx`，不新增通用组件。条件显示所选策略字段；客户端错误映射到策略/金额。列表/详情使用现有奖励组件，不覆盖当前用户的独立修改。
- 新 UI 文案使用 `t('English key')`，经 `web/scripts/add-missing-keys.mjs` 为七种语言补全并执行 `bun run i18n:sync`；检查翻译键及溢出。

## 权衡、兼容与回退

- 面额快照而非支付时重新算：需要两列迁移和渠道下单路径接线，但能避免 Epay/Token 归一化及倍率变更造成返现错误。奖励侧的显式策略列而非从 JSON 快照猜测，保证历史比例与新固定策略可读/可审计。
- 旧客户端保持新配置字段，仍可能无法编辑新策略；Root 应升级管理界面。历史奖励无需数据回填；旧未付款订单不能无证据补返，用户需在最终规划审核接受风险。现有高限额/资金冻结规则不变。
- 如发现迁移或跨库精度/锁语义问题，停止启用新策略并回退应用；新增列/Option 键可保留而不要求破坏性降级，已生成奖励仍照快照处理。数据库兼容完成门槛按 AGENTS.md 三数据库矩阵执行。
