# 野菜 API · 商户套餐购买接口

本文对应当前分支代码，不代表已经上线或通过真实支付联调。商户负责自己的网页、用户登录和套餐购买弹窗；**我方负责订单、统一收银台、付款确认和套餐交付**。不支持商户自行报“已付款”后直接开通，旧直接开通接口已移除，不保留兼容模式。

## 基本约定

- 部署后的服务地址由我方提供，例如 `https://yeschoy.com`；以下路径均相对该地址。
- 商户后端：`Authorization: Bearer pt_<PARTNER_SECRET>`，仅限 HTTPS 服务端调用，不进入网页、日志或支付链接。与 OAuth/PartnerServer 充值接口不是同一套凭证和账号。
- 用户模型请求：`Authorization: Bearer sk-<USER_API_KEY>`，不能用 `pt_`。
- 成功响应直接返回业务对象，无 `{success,data}` 包装；响应禁止缓存。时间为 Unix 秒，额度为内部整数单位，不是 Token 数或支付金额。
- `external_user_id` 是商户稳定用户 ID，由商户后端从自己的可信登录态取得，不能把前端任意指定的 ID 原样透传。去除前后空白后为 1–128 个 Unicode 字符，不允许控制字符，区分大小写；身份按商户隔离。放入路径时须进行路径段编码。
- 写请求为 JSON，只接受列出的字段及单个 JSON 对象。账号接口上限 1 KiB，下单接口 2 KiB；订单接口不接受查询参数。

## 1. 独立创建账号 / 获取用户 Key

```http
PUT /api/partner/v1/accounts
Authorization: Bearer pt_<PARTNER_SECRET>
Content-Type: application/json
```

```json
{"external_user_id":"customer-1001","display_name":"用户1001"}
```

`external_user_id` 必填；`display_name` 可选，去空白后最多 128 个 Unicode 字符。首次 HTTP 201，重复请求 HTTP 200：

```json
{"external_user_id":"customer-1001","api_key":"sk-<USER_API_KEY>","created":true}
```

- 重复请求返回同一可用 Key，`created:false`，不更新既有资料。
- 此操作不下单、不收款、不赠送套餐。也可以不先调用，待首次已付款交付时由我方自动创建账号与 Key。
- 用户/成员被禁用、用户分组错误或 Key 被禁用、删除、过期时拒绝，不自动换 Key。
- Key 应由商户后端保管；不要放进支付链接、订单状态、回跳参数或跨页消息。

## 2. 查询本商户专属套餐

```http
GET /api/partner/v1/plans
Authorization: Bearer pt_<PARTNER_SECRET>
```

HTTP 200，只返回当前商户已启用套餐，以下省略非核心字段：

```json
{"plans":[{"id":42,"title":"标准月套餐","price_amount":99,"currency":"CNY","duration_unit":"month","duration_value":1,"applicable_group":"merchant-exclusive","total_amount":5000000,"requests_per_minute":60,"quota_reset_period":"monthly","max_purchase_per_user":0}]}
```

| 字段 | 说明 |
| --- | --- |
| `id` | 下单使用的 `plan_id` |
| `price_amount` / `currency` | 平台价格及币种；下单由我方重新验证、保存快照，不能由商户提交金额 |
| `duration_unit` / `duration_value` | 当前固定为一个日历月 |
| `applicable_group` | 商户专属模型分组 |
| `total_amount` | 每周期额度，`0` 表示不限量 |
| `requests_per_minute` | 每用户适用的套餐 RPM；`0` 不设套餐级限制，系统/分组限制仍生效 |
| `quota_reset_period` | 当前固定为 `monthly` |
| `max_purchase_per_user` | `0` 不限购买次数；非零存在购买名额预留约束，见后文 |

无可用套餐时返回 `{"plans":[]}`。第一版复用 Epay，Tenant 套餐统一使用 **CNY、正数且精确到分** 的价格；创建和修改时省略币种默认 CNY，显式提交 USD 等其他币种会被拒绝。历史非 CNY 条目下单仍返回 `unsupported_currency`，不会自动换算或迁移；在管理界面编辑时须重新填写人民币价格，不会将原金额直接改标为 CNY。普通用户套餐币种行为不变。

## 3. 创建套餐购买订单

```http
POST /api/partner/v1/subscription-orders
Authorization: Bearer pt_<PARTNER_SECRET>
Idempotency-Key: purchase_20261111_0001
Content-Type: application/json
```

```json
{"external_user_id":"customer-1001","plan_id":42,"payment_method":"alipay"}
```

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `external_user_id` | 是 | 当前登录用户在商户侧的稳定 ID，不必提前开户 |
| `plan_id` | 是 | 本商户启用的正整数套餐 ID |
| `payment_method` | 是 | 我方实际配置可用的 Epay 方式，例如 `alipay`；不保证所有渠道可用 |
| `Idempotency-Key` 请求头 | 是 | 16–64 位字母、数字、`-`、`_`，每次购买固定一个值，超时重试必须复用 |

不接受 `amount`、`paid`、内部用户 ID 或任意回调地址。商户无需先创建自己的应付订单号。

首次 HTTP 201，同请求重试 HTTP 200：

```json
{
  "order_no":"PTO0123456789ABCDEFGHIJKLMNOPQRSTUV",
  "external_user_id":"customer-1001",
  "plan_id":42,
  "plan_title":"标准月套餐",
  "amount":"99.00",
  "currency":"CNY",
  "payment_method":"alipay",
  "payment_status":"pending",
  "fulfillment_status":"not_ready",
  "created_at":1800000000,
  "expires_at":1800001800,
  "checkout_url":"https://platform.example/partner/checkout?order_no=PTO0123456789ABCDEFGHIJKLMNOPQRSTUV#token=pc_<ORDER_CAPABILITY>"
}
```

- `order_no` 由我方生成；`Idempotency-Key` 只是请求重试标识，二者不能混淆。
- 同租户、同键改用户/套餐/支付方式返回 `409 idempotency_conflict`。
- 重试复用原订单、原有效期，不会刷新有效期或再次收费。首次支付准备失败后用原键重试。
- 未付款下单不自动创建模型账号、不产生套餐权益。

## 4. 打开统一收银台

商户网页在用户操作后打开返回的 `checkout_url`。我方页面展示订单、二维码/付款链接和交付状态；用户不必另行登录我方完整账号。支付渠道可能要求新窗口，不承诺 iframe 内付款。

`#token=...` 是敏感、短期、仅限此订单的访问能力，不是用户 Key。不得写入日志、分析系统、转成 query 或替换为商户密钥。页面会在路由初始化前清除 fragment，仅保存在该订单的 `sessionStorage` 以便同标签页刷新，不使用 `localStorage`。

收银台内部使用：

```http
GET /api/partner/checkout/{order_no}
Authorization: Bearer pc_<ORDER_CAPABILITY>
```

此公开安全响应不含用户 ID、租户凭证或 Key；不能用订单号直接查，也不能凭它管理账号。商户不需要自行调用此接口。

访问能力在初始 30 分钟截止时失效。失效后通过商户后端查询订单，不应把收银台过期理解为支付渠道已关单。付款回跳仅用于展示，不会触发开通。

## 5. 查询付款与交付状态

```http
GET /api/partner/v1/subscription-orders/{order_no}
Authorization: Bearer pt_<PARTNER_SECRET>
```

返回订单业务对象，字段与创建响应一致，但不返回 `checkout_url`、二维码、付款链接或 Key；交付后可带 `subscription_id`。只允许查询本商户订单，商户后端还必须检查它属于自己当前登录用户。

| 字段 | 值 | 含义 |
| --- | --- | --- |
| `payment_status` | `pending` | 等待可信付款确认 |
|  | `paid` | 我方已记录核实的付款 |
|  | `failed` / `expired` | 支付不可继续或待付款订单超时；不代表已经收到的晚到付款可丢弃 |
| `fulfillment_status` | `not_ready` | 尚未具备交付条件 |
|  | `pending` | 已付款、等待交付 |
|  | `fulfilled` | 套餐交付完成 |
|  | `failed_retryable` | 已付款、本地交付待恢复，不要再次付款 |

**只有 `paid + fulfilled` 才表示已开通。** 商户网页经自己的后端适当轮询；关闭页面后后台照常交付，再打开时恢复查询。

我方验签通知会核对商户号、订单、金额、支付方式和交易唯一性；浏览器“我已支付”、回跳及商户声明均不构成付款凭据。付款事实单独持久保存，交付失败不会抹去。启动及每 30 秒扫描已付款待交付订单，重复通知/重试不重复续期。

本版依赖支付渠道可信通知重试建立付款事实，没有调用会将商户密钥放入 URL 的不安全主动查单接口；如果所有通知均丢失，仍需运营与渠道对账。

## 6. 查询订阅额度

```http
GET /api/partner/v1/accounts/{external_user_id}/subscription/quota
Authorization: Bearer pt_<PARTNER_SECRET>
```

```json
{"external_user_id":"customer-1001","subscriptions":[{"plan_id":42,"plan_title":"标准月套餐","start_time":1800000000,"end_time":1802678400,"status":"active","quota_total":5000000,"quota_used":250,"quota_remaining":4999750,"quota_unlimited":false,"next_reset_time":1801440000}]}
```

只返回当前有效且属于本商户的订阅；无有效套餐为 `subscriptions:[]`。`quota_unlimited:true` 时总额/剩余额为 `0`，不能视为耗尽。账号不存在返回 404。

同账号、同套餐有效时续费延长一个日历月，不增加当期额度。已被订单接受的续费即使在付款前自然到期，仍可在原订阅上恢复履约；不会恢复取消或删除的订阅。

## 7. 模型接口

以下使用用户 Key，模型 ID 和支持协议以实际模型列表/配置为准：

| 方法 | 路径 | 请求体示例 |
| --- | --- | --- |
| GET | `/v1/models` | 无 |
| POST | `/v1/chat/completions` | `{"model":"<MODEL_ID>","messages":[{"role":"user","content":"你好"}],"stream":false}` |
| POST | `/v1/responses` | `{"model":"<MODEL_ID>","input":"你好","stream":false}` |
| POST | `/v1/messages` | `{"model":"<MODEL_ID>","messages":[{"role":"user","content":"你好"}],"max_tokens":128}` |

`/v1/messages` 附带 `anthropic-version: 2023-06-01`，也支持 `x-api-key`。流式 Chat 设置 `stream:true`，文本在 `choices[].delta.content`，以 `data: [DONE]` 结束；HTTP 200 不代表流完整成功，须检查流内错误。

Tenant 身份强制仅套餐资金来源：钱包即使有钱、用户偏好钱包，无适用套餐或套餐过期/额度不足也不回退钱包。旧 Midjourney/SwapFace 不支持订阅，Tenant 用户会在请求上游前被拒绝，不走钱包。普通用户及独立 PartnerServer 充值不受此合同替代。

## 8. 错误码

```json
{"error":{"code":"order_not_found","message":"order not found"},"request_id":"<REQUEST_ID>"}
```

| HTTP | `error.code` | 说明 |
| --- | --- | --- |
| 400 | `invalid_request` | 身份/参数/请求体/幂等键错误或未知字段、禁止的 query |
| 400 | `unsupported_currency` | 当前套餐币种不能使用 CNY Epay 支付 |
| 401 | `invalid_partner_secret` | 密钥缺失/错误/已轮换，或租户被禁用 |
| 401 | `invalid_checkout_access` | 收银台能力缺失、错误或过期，返回商户查询 |
| 403 | `account_disabled` | 已有账号、成员被禁用或用户分组错误 |
| 404 | `account_not_found` / `plan_not_found` / `order_not_found` | 当前商户范围内资源不存在或不可用 |
| 409 | `credential_unavailable` | 既有 Key 不可用，不能自动换新 |
| 409 | `idempotency_conflict` | 同键请求内容发生变化 |
| 409 | `purchase_limit_reached` | 历史购买或待支付预留名额已达上限 |
| 429 | `rate_limited` | 按 Retry-After 等待；下单每用户每小时 20 笔、同时待付款 5 笔、租户每小时 2000 笔，另有 API 限流 |
| 503 | `payment_unavailable` | 支付配置/准备暂不可用，等待后使用原请求和原幂等键重试 |
| 500 | `server_error` | 服务异常；不确定是否创建成功时不要换键再次购买 |

模型接口保留各自协议错误格式。

## 9. 配置与运营注意

- 我方需启用租户、专属分组和 CNY 套餐，配置可用 Epay、规范 HTTPS 回调域，以及副本间一致且稳定的 `SESSION_SECRET` / `CRYPTO_SECRET`。轮换签名密钥会使旧收银台链接失效。
- CDN/反向代理须保持收银台 `no-store`、`no-referrer` 和禁止嵌入，不注入第三方分析脚本；内置 HTML 路由已设置这些响应头。
- 套餐非零 `max_purchase_per_user` 时，未履约的新购订单会预留名额，**收银台过期不会自动释放**，因为仍可能晚到付款。目前没有安全的渠道关单/自动释放接口，废弃订单需运营与渠道核实；普通可持续续费的月套餐建议使用 `0`，除非确实需要该保守限制。
- 已付款后套餐被禁用/删除或冻结权益、归属分组发生变化，可能停留在待恢复交付；不要要求用户再次付款。当前不包含自动退款或商户 webhook。
- 禁用租户会停止商户管理，不等于自动撤销已发放模型 Key；既有已交付权益按当前模型鉴权和套餐策略执行。
- 不兼容旧外部直接开通不等于清空测试/历史数据，本次也未部署或执行真实付款。
