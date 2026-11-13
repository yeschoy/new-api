# 商户托管 H5 购买接入

本文说明当前分支的实现合同，不代表已经部署或通过真实支付、数据库迁移验收。既有接口详见 [Partner Tenant API](./partner-tenant-api.md) 和 [中文接入指南](./partner-tenant-integration.zh-CN.md)。本文不替换该指南。

## 创建时选择单一接入方式

平台管理员创建商户时，默认 `subscription_key`（订阅 Key API，新购不传用户 ID）；只有明确选择 `hosted_h5` 才可使用本文的购买会话。接入方式创建后固定，不能通过状态更新或密钥轮换更改，也没有历史兼容模式。

H5 **仍需要**商户后端提供 `external_user_id`。H5 商户可以查询本商户套餐、创建/查询购买会话，并使用查单、账户 Key 和额度辅助接口；不能调用订阅 Key 订单/领取/轮换接口。旧 `POST /api/partner/v1/subscription-orders` 在两种模式均返回 `403 integration_mode_mismatch`，不能绕过会话直接购买。订阅 Key 商户不能创建、兑换或消费 H5 会话；商户鉴权失配返回 403，公开能力失配统一为 `401 invalid_purchase_access`，不披露商户信息。

托管 H5 是独立 URL，可在当前窗口、新窗口或 App WebView 打开；**不支持 iframe**，不使用 postMessage，不接受任意 `return_url`，也不自动返回商户。支付渠道可能要求外部浏览器或新窗口，不能保证任意 WebView 都可完成第三方支付。

## 商户 BFF：登录与密钥边界

1. 用户在商户侧完成登录。BFF 从该登录态得到稳定、大小写敏感的 `external_user_id`，不能相信浏览器提交的任意用户标识。
2. 为此次明确的购买意图生成并持久化 16–64 位 URL-safe `Idempotency-Key`（字母、数字、`-`、`_`），绑定本地用户。刷新和网络重试使用原键；不要每次 HTTP 重试生成新键。
3. 仅 BFF 使用 `Authorization: Bearer pt_<server-secret>` 调用管理 API。`pt_` 不进入 HTML、前端包、App 静态配置、浏览器存储或分析工具。模型 `sk-` Key 同样不进入购买 H5。
4. 将 `session_id`、原幂等键、当前用户与固定期限保存到商户数据库。会话标识不是登录凭证；BFF 向用户展示结果时仍须核验用户归属。
5. `purchase_url` 含短期能力，应仅经受保护、禁止缓存的响应发给对应用户，不写日志、分析事件、客服截图或 URL 查询参数。新窗口应禁用 opener（如 `noopener`）。

## 创建购买会话

```http
POST /api/partner/v1/purchase-sessions
Authorization: Bearer pt_<server-secret>
Idempotency-Key: merchant_intent_000001
Content-Type: application/json

{"external_user_id":"customer-7"}
```

响应为 plain JSON：首次 `201`，同租户、同键、同用户精确重放 `200`；同键换用户返回 `409 idempotency_conflict`。仅接受 `external_user_id`；禁止额外 JSON 字段、重复或大小写别名字段、多个 JSON 文档和 query，body 上限 2 KiB。

```json
{
  "session_id": "PPS0123456789abcdefghijklmnopqrstuv",
  "external_user_id": "customer-7",
  "created_at": 1800000000,
  "launch_expires_at": 1800000300,
  "expires_at": 1800001800,
  "purchase_url": "https://platform.example/partner/purchase?session_id=PPS0123456789abcdefghijklmnopqrstuv#launch=pl_<short-lived-launch-code>"
}
```

示例能力是占位符，不能用于实际兑换。URL 由平台可信 HTTPS callback origin 生成，不使用客户端传来的 origin、金额、商户 ID 或回跳地址。

- 启动码在创建后最多 **5 分钟**内兑换；会话从创建起最多 **30 分钟**有效。精确创建重放、兑换、重试、刷新均不延长期限。
- H5 在 Router 前移除 fragment，并按 `session_id` 暂存在当前标签页 sessionStorage；先生成并保存密码学随机 `client_nonce`。兑换丢失回复时，用原启动码和原 nonce 安全重试。
- 同启动码、同 nonce 可恢复；另一个 nonce/窗口重放被拒绝。不要把已兑换 URL 当作跨设备恢复入口。
- 兑换后的 `ps_` 仅有该会话的选购权限，不是平台登录、`pt_` 或 `pc_`，不写 localStorage 或通用查询缓存。禁用商户或轮换其密钥会撤销后续会话访问。
- 浏览器存储被禁用时仅允许当前文档的内存回退，刷新恢复受限；此时关闭页面应回 BFF 查单，而不是盲目重新购买。

## 页面选择、一次下单与恢复

H5 只显示真实会话 API 返回的本商户可购 CNY 套餐和当前支付方式；无套餐/渠道就显示空态，不提供示例支付渠道或历史外币换算。价格是精确两位小数字符串；有限额度明确显示“内部额度单位”，不冒称 token、人民币或现金余额。仅新增公开 H5 目录的 `plans[].total_amount` 使用 canonical 非负十进制**字符串**，范围为 `"0"`–`"9223372036854775807"`（signed int64 最大值）；`quota_unlimited` 为 true 当且仅当值为 `"0"`。`"9007199254740992"` 等超过 JS safe integer 的值合法，客户端必须用字符串/BigInt 校验与精确展示，不能转 Number 舍入。旧商户套餐/额度 DTO 的数值合同及计费限额不变。

每个会话最多形成一笔订单。只有用户提交才下单，不在加载、刷新或状态查询时自动下单。首次提交前保存原 `plan_id/payment_method`；双击受保护，失败/超时后锁定原选项，只能重试原购买或查询状态。后端使用会话固定的内部幂等身份；同入口换套餐或渠道返回冲突，不生成第二笔订单。下单/重放在同一订单事务的 tenant 锁内重新读取会话，并以新鲜时钟核验能力、兑换/nonce、租户绑定、当前 hosted_h5 接入方式及当前密钥快照；慢 body 或锁等待不能越过过期/撤销。网关网络调用始终位于数据库事务之外。

成功后校验原始、同源、canonical `/partner/checkout` 链接，再在同一窗口进入原收银台。已有订单不再展示新购买表单。对于未过期 pending 订单，用户显式继续时先将服务端 `order.plan_id/payment_method` 原样 POST 到同一会话 `/orders`，完成可能失败的网关准备后再跳转；不能受冲突的本地草稿覆盖，也不能直接进入没有付款链接的只读收银台。即使准备曾返回 503，刷新/查状态 GET 发现已持久化订单，仍按此流程恢复，GET 本身不准备支付。已准备的精确重放不重复准备/收费；已付款订单仅查看，过期不隐式重买。订单的金额、快照、截止时间和付款渠道以原订单为准；即使当前目录/渠道变更，精确重试仍恢复原订单。

会话期限和订单期限不同：原订单能力从订单创建起固定 **30 分钟**；H5 较早到期不会截断已进入的收银台能力。公开入口到期、关窗或网络断开均不是网关关单或未付款证明。链接失效后回商户后端查单。**已付款待交付或交付可重试失败时，不要再次付款。** 新购买必须回商户核对原状态后，由用户明确发起新意图、新键和新会话。

## 商户后端跟踪结果（不依赖回跳）

```http
GET /api/partner/v1/purchase-sessions/PPS0123456789abcdefghijklmnopqrstuv
Authorization: Bearer pt_<server-secret>
```

禁止 query。成功返回 `session_id,external_user_id,created_at,launch_expires_at,expires_at,redeemed,order`。尚未形成订单时 `order:null`；形成后 `order` 使用既有商户订单状态 DTO，不含 checkout URL、二维码、支付链接或模型 Key。会话到期后仍可凭商户鉴权查询，跨商户/未知会话为 `404 purchase_session_not_found`。

BFF 必须核验 `external_user_id` 是当前用户，再向该用户返回最小状态；不能仅凭浏览器递交 `session_id/order_no` 就公开其他买家的订单。可保存发现的 `order_no` 后调用原订单查询；如需获取 Key/额度，由商户后端依既有账号和额度接口处理。

- `payment_status`: `pending / paid / failed / expired`；`expired` 不代表网关已取消，真实晚付款仍可能到账。
- `fulfillment_status`: `not_ready / pending / fulfilled / failed_retryable`。
- 只有 `paid + fulfilled` 才表示支付且交付完成；`paid` 与“套餐可用”不是同一事实。
- 支付真相来自服务端验证的网关通知。浏览器返回、“我已付款”、商户断言都不结算。
- 关窗不停止后台交付；重复通知/恢复不重复续期。通知完全丢失时仍需运营/支付服务商对账。
- 本版**没有商户 webhook、自动返回商户、任意 return URL 或原生 WebView 支付桥承诺**。商户应通过已保存的会话主动查询或在用户返回商户时查询。

## 公开 H5 协议与部署保护

以下接口仅供页面使用，均禁止 query、cookie 身份依赖和宽松 CORS，响应 no-store/no-referrer：

| 路径（`/api/partner/purchase-sessions/{session_id}`） | 请求                                                       | 响应                                                                                |
| ----------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `POST /exchange`                                      | `{launch_code,client_nonce}`，nonce 为 64 位 lowercase hex | `{session_id,expires_at,access_token}`，能力为 `ps_`                                |
| `GET`                                                 | `Authorization: Bearer ps_...`                             | `{session_id,expires_at,merchant_name,plans,payment_methods,order}`，不含买家或 Key |
| `POST /orders`                                        | ps_，仅 `{plan_id,payment_method}`                         | 首次 201/精确重放 200，`{order_no,checkout_url}`                                    |

公开 `order` 为 `null` 或 `{order_no,plan_id,payment_method,payment_status,fulfillment_status,expires_at,checkout_url?}`；原订单能力到期后省略链接。错误沿用 `{error:{code,message},request_id}`。`401 invalid_purchase_access` 统一涵盖无效、过期、撤销、接入方式失配或重放；页面应回商户查单，不要求登录平台。冲突、不可购、网络或支付服务暂不可用不等于“没有订单”，重试须保留原购买意图。

Go HTML 路由与静态部署均需保留 no-store/no-referrer、DENY / `frame-ancestors 'none'`。`web/scripts/vercel-config.mjs` 是共享静态配置生成器；编码字符/分隔符和尾斜杠别名也应受保护。早期 HTML 禁止分析脚本，页面跳过平台登录刷新、setup、状态、品牌和奖励效果；不要由 CDN 再注入第三方分析。普通页面认证行为不变。

## 验证边界

本说明不授权生产调用、真实付款、部署或数据清理。前端 fixture/DOM 测试、类型检查与构建不能替代 task-owned Docker 中的 PostgreSQL 加法迁移、并发兑换/幂等和支付回调验证。任何尚未完成的数据库运行或真实浏览器/WebView 测试必须单独报告，不据此宣称全量验收通过。
