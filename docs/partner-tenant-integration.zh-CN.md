# 野菜 API · 商户接入

商户负责用户登录与套餐展示；野菜 API 负责收银、付款确认和套餐交付。

## 基本配置

- **服务地址**：由平台提供，例如 `https://yeschoy.com`。
- **接口前缀**：`/api/partner/v1`，以下商户接口路径均相对此前缀。
- **鉴权**：`Authorization: Bearer pt_<商户密钥>`，只允许商户后端调用。
- **请求格式**：`Content-Type: application/json`；成功响应直接返回 JSON，无 `success/data` 包装。
- **用户标识**：`external_user_id` 使用商户的固定用户 ID，由后端登录态取得；区分大小写，去除首尾空白后 1–128 个 Unicode 字符，不含控制字符。用于路径时按单个路径段编码。

商户密钥和用户 `api_key` 均保存在后端，不放进网页、App、URL 或日志。正式接入前请与平台确认已上线版本、CNY 套餐和可用支付渠道。

## 接入流程

```text
查询套餐 → 创建订单 → 用户打开收银台付款 → 查询订单确认交付 → 获取用户 Key → 调用模型
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

### 2. 创建订单

```http
POST /subscription-orders
Idempotency-Key: purchase_20261111_0001
```

```json
{"external_user_id":"customer-1001","plan_id":42,"payment_method":"alipay"}
```

三个字段均必填：用户 ID、套餐 ID、平台已启用的支付方式。**不提交金额或“已付款”标记。**

首次 HTTP 201，原请求重试 HTTP 200：

```json
{
  "order_no": "PTO0123456789ABCDEFGHIJKLMNOPQRSTUV",
  "external_user_id": "customer-1001",
  "plan_id": 42,
  "plan_title": "标准月套餐",
  "amount": "99.00",
  "currency": "CNY",
  "payment_method": "alipay",
  "payment_status": "pending",
  "fulfillment_status": "not_ready",
  "created_at": 1800000000,
  "expires_at": 1800001800,
  "checkout_url": "https://platform.example/partner/checkout?order_no=PTO0123456789ABCDEFGHIJKLMNOPQRSTUV#token=pc_<订单令牌>"
}
```

**重试规则**：幂等键为 16–64 位字母、数字、`-`、`_`。每笔购买保存一个固定键；超时或失败后使用**原参数、原键**重试。同键改参数返回 409，不要盲目换键重复下单。

用户点击后，新窗口打开返回的 `checkout_url`（建议 `rel="noopener noreferrer"`），无需登录野菜账号。不保证支持 iframe；链接含敏感订单令牌，不改写、不记录日志或埋点。初始有效期 30 分钟，重试不延长；过期后通过商户后端查单，不能据此认定渠道已关单。

### 3. 查询订单

```http
GET /subscription-orders/{order_no}
```

返回与创建订单相同的业务字段，但不含 `checkout_url`、付款链接或用户 Key；交付后可有 `subscription_id`。商户后端须核对返回的 `external_user_id` 属于当前登录用户。

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
| 403 / 409 | `account_disabled` / `credential_unavailable` | 账号或 Key 不可用，联系平台 |
| 404 | `account_not_found` / `plan_not_found` / `order_not_found` | 资源不存在或不属于本商户 |
| 409 | `idempotency_conflict` / `purchase_limit_reached` | 恢复原购买参数，或核查购买上限 |
| 429 | `rate_limited` | 按 `Retry-After` 等待 |
| 500 / 503 | `server_error` / `payment_unavailable` | 下单时使用原参数、原幂等键重试 |

报障提供订单号、错误码及 `request_id`，不要提供密钥或收银台完整链接。

---

[运行接入 Demo](../examples/partner-tenant-demo/README.md) · [详细接口与边界说明](./partner-tenant-api.md)
