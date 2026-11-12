# 商户无买家 ID 下单与独立订阅 Key

本文说明新增 `subscription_key` 接入模式。**任务专属 Docker PostgreSQL 15.19 的受影响迁移、付费交付与关键并发定向集已实际通过，独立代码审阅未发现本范围业务阻断；这不等于完整应用启动、生产迁移、真实支付或部署验收，详见任务 verification.md。** 旧 `external_user_id` API、可选托管 H5 和公共收银台合同保持不变，不自动为旧订单补签订阅 Key。

## 1. 两类客户端、三种秘密

| 秘密 | 持有者 | 唯一用途 |
| --- | --- | --- |
| `pt_...` 开发者密钥 | 商户后端 | 套餐目录、新购/续费下单、查单、领取/重置订阅 Key |
| `sub_` + 64 位小写 hex | 买家及交付它的商户后端 | 独立查询一份订阅；商户续费时用它定位原订阅 |
| `sk-...` Coding API Key | 买家 | 现有模型接口；不是订阅查询或商户凭证 |

买家查询不需要 `pt_`、商户 ID、平台用户 ID、注册、登录或 Cookie。`sub_` 能读取 Coding Key，必须按高敏秘密保护；不要放在 URL、业务日志、分析/错误上报、浏览器公共缓存或公共收银台。HTTPS 必须开启，服务端和反向代理应禁记 Authorization、X-Subscription-Key 和凭证响应。响应使用 `Cache-Control: no-store`、`Pragma: no-cache`、`Referrer-Policy: no-referrer`。

每次独立新购只建立订单；**仅可信支付确认后的完整原子交付才新增真实 User、Token、内部账户、一份订阅和查询 Key**。未付、准备失败、未付超时、伪造 paid/浏览器回跳不开户。已确认 paid 独立保留；交付失败回滚全部本地新增，后台恢复不会再扣款/重复开户。

## 2. 套餐配置与目录

平台 root 在现有「套餐管理」创建套餐时选择单一 Partner tenant，配置 CNY 精确分价、一个日历月/月度重置、额度和 RPM，可为同一商户创建多份套餐并启停。归属不可编辑，不新增共享套餐授权或另一套管理页面。

商户调用 `GET /api/partner/v1/plans`，使用 `Authorization: Bearer <pt_>` 获取本商户启用套餐。下单会再次校验真实归属/分组/启用和可支付 CNY 价格，不能伪造其他商户或普通平台 plan_id。

## 3. 新购：不传 external_user_id

```http
POST /api/partner/v1/subscription-key-orders
Authorization: Bearer <pt_merchant-secret>
Idempotency-Key: merchant-intent-00000001
Content-Type: application/json

{"plan_id":42,"payment_method":"alipay"}
```

创建返回 201，原参数幂等重试返回 200：

```json
{
  "order_no":"PTO<32 random alphanumeric characters>",
  "plan_id":42,
  "plan_title":"Monthly plan",
  "amount":"9.99",
  "currency":"CNY",
  "payment_method":"alipay",
  "payment_status":"pending",
  "fulfillment_status":"not_ready",
  "created_at":1800000000,
  "expires_at":1800001800,
  "checkout_url":"https://platform.example/partner/checkout?order_no=PTO...#token=pc_..."
}
```

响应无买家 ID、User/Account ID、订阅 Key 或 Coding Key。让买家打开已有平台 `checkout_url`；`pc_` 只是短期订单访问权，不允许取长期凭证。收银台有效期固定 30 分钟，原单重试不延长。准备支付可能返回 503；保留同一个 Idempotency-Key 和原参数重试 POST，不要换意图重复下单。GET 从不准备网关支付。

同商户/同套餐的不同幂等意图是**不同新购**，不能推断是同一人；没有终端身份就无法按买家跨新购合并或限制次数。商户自己保存购买意图/订单与买家的交付关系。限流超限返回 429 和 Retry-After。

## 4. 商户查单与领取

```http
GET /api/partner/v1/subscription-key-orders/<order_no>
Authorization: Bearer <pt_merchant-secret>
```

只读返回该商户该模式的安全订单状态，不返回付款链接、凭证或买家标识。旧模式/他商户订单返回 scoped 404。前端回跳不是支付证据。

```http
GET /api/partner/v1/subscription-key-orders/<order_no>/subscription-key
Authorization: Bearer <pt_merchant-secret>
```

仅 `payment_status=paid` 且 `fulfillment_status=fulfilled` 可领取：

```json
{"order_no":"PTO...","subscription_id":123,"subscription_key":"sub_<64 lowercase hex>","key_version":1}
```

未交付返回 409 `subscription_key_not_ready`。GET 不开户/授予/补签；坏映射返回 `subscription_key_not_found`。重复领取返回当前 Key；显式重置后，通过合法关联首购或续费订单领取也只返回当前版本。商户应核对自己保存的订单意图后向正确买家交付，不将领取接口暴露为浏览器公共接口。

## 5. 买家独立查询

```http
GET /api/partner/subscription
Authorization: Bearer <sub_64-lowercase-hex>
```

```json
{
  "subscription":{"id":123,"plan_id":42,"plan_title":"Monthly plan","status":"active","start_time":1800000000,"end_time":1802678400,"requests_per_minute":60},
  "quota":{"quota_total":"9223372036854775807","quota_used":"9007199254740993","quota_remaining":"9214364837600034814","quota_unlimited":false,"quota_usable":true,"next_reset_time":1801440000},
  "api_key":"sk-<actual-model-key>"
}
```

所有额度为**十进制字符串**，不要转 JavaScript Number。`quota_total="0"` 表示不限量，此时 `quota_unlimited=true`，remaining="0" 不是耗尽。有效订阅按现有周期 helper 重置；活跃但耗尽仍可得到正常 Coding Key，quota_usable=false，模型调用由原 subscription_only funding 拒绝。

自然到期即时投影为 `status=expired`，即使后台尚未改状态。到期/取消保留 total/used 和 `historical_quota_remaining`，但 remaining="0"、usable=false，**省略 api_key**；历史余额不代表当前可消费权益。禁用商户/账户/User、错组、删除/禁用/过期 Token 或损坏绑定均 fail closed，不补发。其他订阅不能替这一份放行取钥。响应不含其他订阅、商户秘密、账户标识或 sub_ 自身。

不接受 query 目标参数或 URL/Cookie/x-api-key 替代凭证。`pt_/pc_/pl_/ps_/sk-` 不可用于独立查询，`sub_` 不可调用 Coding。

## 6. 续原订阅

仍由商户后端持有当前 pt_，在相同下单接口额外发送：

```http
POST /api/partner/v1/subscription-key-orders
Authorization: Bearer <pt_merchant-secret>
X-Subscription-Key: <current-sub_key>
Idempotency-Key: merchant-renewal-000001
Content-Type: application/json

{"plan_id":42,"payment_method":"alipay"}
```

返回原有收银台 checkout_url，付款后延长**原 User/Token/Subscription 行**，不换 Coding Key 或查询 Key。只续同一套餐；活跃/自然到期允许，取消/损坏拒绝。有续费头但为空/错误/旧版本/他商户 Key 会拒绝，绝不退化成新购。省略此头才表示独立新购。

续期按 max(原 end_time, 交付时数据库时间) 延长一个日历月；提前续费不会立即重置/额外叠加当期额度，已到期复活不携带旧周期余额。已接受的续费订单冻结目标，后来显式换钥不抹去其支付事实，仍履行原目标。

Key 重置后，旧 Key 不能新建或重放续费；商户领取当前 Key，再以新头、原参数/原幂等键重放同一目标即可。幂等摘要不存秘密或 Key 版本。

## 7. 商户重置查询 Key

```http
POST /api/partner/v1/subscriptions/123/key/rotate
Authorization: Bearer <pt_merchant-secret>
Idempotency-Key: merchant-rotation-00001
Content-Type: application/json

{"expected_version":1}
```

```json
{"subscription_id":123,"subscription_key":"sub_<new 64 lowercase hex>","key_version":2}
```

同幂等键/相同参数重试只在结果版本仍为当前时返回同一 Key；被后续轮换超越返回 409 `subscription_key_changed`，不复活旧 Key。新幂等键但 expected_version 落后也冲突。同幂等键改参数返回 `idempotency_conflict`。不轮换 Coding Key、不改权益。

轮换提交后的后续请求不能再用旧 Key；无法撤回已授权请求、已发出的响应或买家已保存的 Coding Key。根秘密不匹配返回 503 `subscription_key_unavailable`，不会自动重签；恢复稳定的 CRYPTO_SECRET，或由合法商户显式轮换。根秘密必须跨节点/重启一致。

## 8. 严格协议、安全错误与运维

- 所有新增接口拒绝 query（包括空 `?`）；JSON 最大 2KB，只允许文档列出的必需字段，拒绝未知/重复/大小写别名/尾随 JSON。
- 鉴权、Idempotency-Key、X-Subscription-Key 请求头必须单值；Idempotency-Key 为 16–64 URL-safe 字符。sub_ 是固定前缀加 64 小写 hex。
- 错误为 plain JSON `{error:{code,message},request_id}`；不返回内部错误/秘密。常见：401 invalid_partner_secret / invalid_subscription_key、403 account_disabled、404 scoped order/subscription/key_not_found、409 not_ready/credential_unavailable/幂等或版本冲突、429 rate_limited、503 unavailable。
- 新接口在数据库事务 Tenant 锁后重新校验当前 pt_；sub_、真实绑定、Token 和有效期在锁后严格数据库时钟上校验，不依赖早期中间件或缓存授权。
- 内部账户 source=subscription_key、首次 source_order_id 唯一；旧 external 查询/回填不能命中内部账户。支付/公共收银台内部 getter 仍支持两模式，旧订单不迁移/改绑。
- 回滚保留新列/表、订单、paid 和已交付权益；不能直接让旧二进制处理新模式 paid-unfulfilled，需关闭新入口并协调恢复履约。没有生产/真实付款或迁移上线证据。
