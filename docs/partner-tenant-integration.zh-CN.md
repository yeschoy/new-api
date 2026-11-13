# 野菜 API · 商户接入

管理员创建商户时固定一种接入方式：默认 **订阅 Key API**（`subscription_key`），新购不传用户 ID，详见[订阅 Key API](./partner-subscription-key-api.zh-CN.md)；明确选择 **托管 H5**（`hosted_h5`）后才可使用购买会话。

本文说明 H5 商户的后端身份、查单、Key 和额度辅助接口。不能混用两种购买入口，不能创建后切换。平台负责收银、付款确认和交付；已接受订单/已有付款的交付不因新入口策略而中断。

## 基本配置

- **服务地址**：由平台提供，例如 `https://yeschoy.com`。
- **接口前缀**：`/api/partner/v1`，以下商户接口路径均相对此前缀。
- **鉴权**：`Authorization: Bearer pt_<商户密钥>`，只允许商户后端调用。
- **请求格式**：`Content-Type: application/json`；成功响应直接返回 JSON，无 `success/data` 包装。
- **用户标识**：`external_user_id` 使用商户的固定用户 ID，由后端登录态取得；区分大小写，去除首尾空白后 1–128 个 Unicode 字符，不含控制字符。用于路径时按单个路径段编码。

商户密钥和用户 `api_key` 均保存在后端，不放进网页、App、URL 或日志。正式接入前请与平台确认已上线版本、CNY 套餐和可用支付渠道。

## 接入流程

```text
商户登录 → 后端创建购买会话 → 用户打开 H5 选择套餐 → 进入收银台付款 → 后端查会话/订单 → 获取用户 Key
```

首次付款交付会自动开户，不必提前创建账号。

## 商户接口

### 1. 查询套餐

```http
GET /plans
```

响应示例（仅列常用字段）：

```json
{
  "plans": [{
    "id": 42,
    "title": "标准月套餐",
    "price_amount": 99,
    "currency": "CNY",
    "duration_unit": "month",
    "duration_value": 1,
    "total_amount": 5000000,
    "requests_per_minute": 60
  }]
}
```

- `id` 用于下单；价格以平台为准，当前收银台仅支持 **CNY**。
- `total_amount` 为每周期额度，`0` 表示不限量；不是 Token 数或人民币金额。
- `requests_per_minute` 为每用户套餐 RPM，`0` 不设套餐级限制，系统限制仍有效。
- 无可用套餐返回 `{"plans":[]}`。

### 2. 通过托管 H5 购买

```http
POST /purchase-sessions
Idempotency-Key: purchase_20261111_0001
Content-Type: application/json

{"external_user_id":"customer-1001"}
```

首次 HTTP 201、相同购买意图重放 200，同键换用户 409。商户后端保存会话、用户归属和固定幂等键，再将响应中的敏感 `purchase_url` 交给对应用户。用户在平台 H5 选购，由会话能力下单并进入收银台；不要把 `pt_` 放进浏览器。

完整期限、兑换、一次下单和原单恢复协议见[托管 H5 指南](./partner-hosted-h5.zh-CN.md)。**旧 `POST /subscription-orders` 在两种模式均拒绝（403 `integration_mode_mismatch`），包括原订单精确重放；不是 H5 的备用下单入口。** 有已接受订单时仍可查单、访问未过期原收银台能力，可信付款仍可履约。

### 3. 查询订单

```http
GET /subscription-orders/{order_no}
```

返回原订单的金额、付款/交付状态、期限等业务字段，但不含 `checkout_url`、付款链接或用户 Key；交付后可有 `subscription_id`。商户后端须核对返回的 `external_user_id` 属于当前登录用户。

| 字段 | 值 | 含义 |
| --- | --- | --- |
| `payment_status` | `pending` / `paid` / `failed` / `expired` | 待付款 / 已付款 / 失败 / 收银台过期 |
| `fulfillment_status` | `not_ready` / `pending` / `fulfilled` / `failed_retryable` | 未就绪 / 待交付 / 已交付 / 交付待恢复 |

**只有 `payment_status=paid` 且 `fulfillment_status=fulfilled` 才算开通成功。**

建议每 3–5 秒经商户后端查询，页面离开时停止。付款以平台确认结果为准，不能凭浏览器回跳开通；已付款但未交付时等待或联系平台，**不要再次付款**。当前不提供商户 webhook。

### 4. 开户 / 获取用户 Key

```http
PUT /accounts
```

```json
{"external_user_id":"customer-1001","display_name":"用户1001"}
```

`external_user_id` 必填；`display_name` 可选，去除首尾空白后最多 128 个 Unicode 字符。

```json
{"external_user_id":"customer-1001","api_key":"sk-<用户Key>","created":true}
```

首次 HTTP 201；重复调用 HTTP 200，返回同一可用 Key，`created:false`。可提前开户，也可付款交付后再获取 Key；**开户本身不赠送套餐**。既有 Key 不可用时会报错，不自动换新。

### 5. 查询订阅额度

```http
GET /accounts/{external_user_id}/subscription/quota
```

```json
{
  "external_user_id": "customer-1001",
  "subscriptions": [{
    "plan_id": 42,
    "plan_title": "标准月套餐",
    "start_time": 1800000000,
    "end_time": 1802678400,
    "status": "active",
    "quota_total": 5000000,
    "quota_used": 250,
    "quota_remaining": 4999750,
    "quota_unlimited": false,
    "next_reset_time": 1801440000
  }]
}
```

- 时间均为 Unix 秒；额度为内部整数单位。
- `quota_unlimited:true` 表示不限量，剩余额度为 `0` 不代表耗尽。
- 无有效套餐返回 `subscriptions:[]`；未开户返回 `404 account_not_found`。
- 同套餐有效期内续费延长一个日历月，不增加当期额度；无有效订阅时不回退钱包扣费。

## 模型调用

由商户后端使用上一步取得的 **用户 Key（`sk-`）**，不是商户密钥（`pt_`）。路径相对服务根地址：

```http
GET /v1/models
Authorization: Bearer sk-<用户Key>
```

从模型列表选择实际模型 ID，再发起请求：

```http
POST /v1/chat/completions
Authorization: Bearer sk-<用户Key>
Content-Type: application/json

{"model":"<MODEL_ID>","messages":[{"role":"user","content":"你好"}],"stream":false}
```

模型 ID 及支持协议以实际模型列表和平台配置为准。

## 常见错误

```json
{"error":{"code":"order_not_found","message":"order not found"},"request_id":"..."}
```

| HTTP | 错误码 | 处理 |
| --- | --- | --- |
| 400 | `invalid_request` / `unsupported_currency` | 检查参数；非 CNY 套餐联系平台重新定价 |
| 401 | `invalid_partner_secret` | 检查密钥或联系平台 |
| 403 | `integration_mode_mismatch` | 使用创建时选定的接入方式；旧直接下单不可用 |
| 403 / 409 | `account_disabled` / `credential_unavailable` | 账号或 Key 不可用，联系平台 |
| 404 | `account_not_found` / `plan_not_found` / `order_not_found` | 资源不存在或不属于本商户 |
| 409 | `idempotency_conflict` / `purchase_limit_reached` | 恢复原购买参数，或核查购买上限 |
| 429 | `rate_limited` | 按 `Retry-After` 等待 |
| 500 / 503 | `server_error` / `payment_unavailable` | 下单时使用原参数、原幂等键重试 |

报障提供订单号、错误码及 `request_id`，不要提供密钥或收银台完整链接。

---

旧直接下单 Demo 仅供历史本地 mock 参考，不适用于本版真实购买。 · [详细接口与边界说明](./partner-tenant-api.md)
