# 固定 CNY 额度投影设计

状态：最终评审稿，已随父任务于 2026-11-17 获批实施；进度见 `verification.md`。产品依据 C1–C5/父 R3；跨交付契约见父 `research/contract-decisions.md`。

## 1. 归属与分层

在 service 增加 pure quota-to-CNY helper，使用已有 shopspring/decimal，不新增依赖。输入只包含已授权 quota/有限额/可用状态与本次转换配置，不传整个带 APIKey 的响应给转换器，不进行数据库/秘密/外部 I/O。

controller 在原业务操作成功后，用安全额度投影和兼容 response wrapper 增加 `quota_cny`：独立订阅可匿名嵌入旧 model DTO 并追加一个新字段；H5 私有 DTO 补字段；目录用嵌入 SubscriptionPlan 的仅商户响应 wrapper。不修改全局 SubscriptionPlan JSON 协议、不把展示字段写入 GORM，不破坏 model 的授权锁/周期重置/Key 审计。

原始 quota 从 int64 或规范十进制字符串直接变 decimal；绝不 float64/JS Number 中转。聚合额度允许以高精度十进制值传入同一底层金额函数，避免 SUM 超出 int64 再截断。

## 2. 覆盖入口与兼容性

| 入口 | 新字段位置 | 原协议 |
| --- | --- | --- |
| `GET /api/partner/subscription` | 响应顶层 quota_cny | quota 内精确字符串及 api_key 规则不变 |
| `GET /api/partner/v1/accounts/:external_user_id/subscription/quota` | 每个 subscriptions[] item.quota_cny | 原 H5 int64 number 字段/返回范围不变 |
| `GET /api/partner/v1/plans` | 每个 plans[] item.quota_cny | total_amount int64 number 和实际价格币种不变 |

H5 当前只返回授权 active summaries；不为 CNY 新增终态读取或扩大身份来源。目录只新增 total/unlimited 和转换元数据，不伪造 used、remaining、usable。原 pt_/sub_ purpose、模式隔离、query 拒绝、no-store/no-referrer 与安全审计链不变。

是 additive JSON 扩展；严格拒绝未知字段的第三方 decoder 可能需要同步升级，文档明确说明，不能承诺所有外部客户端无修改。目录的大整数 legacy number 仍需无损解析，不能因为补了 CNY 就宣称其原数值协议已修复。

## 3. 统一数据形状

订阅示例（仅展示安全新字段，不含真实凭证）：

```json
{
  "quota_cny": {
    "currency": "CNY",
    "available": true,
    "total": "30.000000",
    "used": "0.032016",
    "remaining": "29.967984",
    "unlimited": false,
    "usable": true,
    "quota_per_unit": "500000",
    "usd_to_cny_rate": "1",
    "scale": 6,
    "rounding": "half_away_from_zero"
  }
}
```

- 金额为六位定点十进制字符串或 null，不用科学记数法；currency 固定 CNY。
- available 仅表示转换配置/输入可以展示，不代表订阅可用。usable 来源于现有已授权权益事实，不由金额字符串大于零推断。
- 有限 active：total/used/remaining 分别从同一个 raw quota 快照转换；余额遵循原 max(total-used,0)。used>total 仍保留真实已用、不负余额。
- 无限 active：unlimited=true，total=null、remaining=null、used 有限，usable 仍依赖原权益；不能用字符串 0 表示零上限。
- 有限 terminal：remaining="0.000000"、usable=false；仅已有 historical_quota_remaining 时追加同单位 historical_remaining，明确不可消费。
- 无限 terminal：total=null、remaining="0.000000"、usable=false。保留 unlimited 事实，不因为历史原 quota_remaining=0 就显示“额度已耗尽”。
- 目录形状省略 used/remaining/usable/historical_remaining，仅保留 total、unlimited、available、currency、转换元数据。

非法/nonpositive/nonfinite QuotaPerUnit 或 USDExchangeRate：available=false，金额字段 null，reason 为有界 `invalid_conversion_config`；仅保留合法元数据，不能 JSON 输出 NaN/Infinity、使用站点自定义币种倍率、静默退为汇率1，或使原本成功的业务响应报错。非法 raw quota 显示不可用并安全记录受控原因，不修复原事实。

## 4. 精度与配置

公式 `amount = decimal(raw quota) × decimal(current USDExchangeRate) ÷ decimal(QuotaPerUnit)`。从现有配置的规范十进制表示构造倍率，先检查有限/正数；每个响应仅读取一次配置快照，所有项目使用相同倍率。不调用随 UI USD/CUSTOM/TOKENS 偏好变化的 PartnerOAuthDisplayCurrency/ConvertPartnerWalletQuota。

先精确乘，再做一次最终 `DivRound(..., 6)`、半入远离零；不先做默认16位除法再乘、避免双重舍入。raw quota 全精度保留，不把 round 后的显示值写回计费。total/used/remaining 各自舍入后可能差一个最小显示单位，消费者不得用它们重算账本。

六位是展示精度而非无限小数无损承诺。默认示例 1 quota = 0.000002 CNY；极低汇率/非整除可能令正值四舍五入为0，新 UI 必须以原 quota 判定“小于最小显示单位”，不能宣称免费。商户端可用 raw quota 与元数据作更高精度展示。

日志页采用同一金额函数，先累计原 quota 再转换，不累计逐条已舍入金额。此显示使用查询时倍率，不是历史实收现金，不影响钱包/订阅实际扣费或套餐价格；旧日志没有汇率快照时不伪造历史事实。

## 5. 文档、测试与回滚

更新 docs/partner-subscription-key-api.zh-CN.md、docs/openapi/partner-subscription-key.openapi.json，及 H5/目录对应 docs/partner-tenant-api.md、docs/partner-hosted-h5.zh-CN.md。OpenAPI 新 schema 明确 nullable/optional/目录差异，原 quota 类型、鉴权与价格保持。

测试覆盖 >2^53/int64 max、微额、非整除/半单位舍入、极低/非法汇率、站点显示偏好、终态/无限额、原 JSON 快照及无额外秘密；Go 即使纯数学测试也仅在任务自有 Docker 中运行，真实 pq 验证既有授权读取快照和无额外副作用。

可独立回滚追加字段/服务 helper，但已接入它的日志 UI/消费者必须一同兼容；保留 raw quota 回退展示，不能伪造 CNY 零值。无需 schema 迁移，不回滚付款事实、不修改生产汇率。
