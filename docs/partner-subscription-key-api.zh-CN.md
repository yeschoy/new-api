# 商户订阅 Key API 接口文档

本接口供商户使用开发者密钥创建订阅订单，用户付款后领取独立订阅 Key，并以此查询订阅、额度和 Coding API Key。**新购不传 `external_user_id`，只有可信付款成功后的完整交付才新增平台用户；续费复用原用户和凭证。**

- 接入方式更新基线：`181c99e1b` 后的本次实现；文档按当前分支实际 controller/model/router 编写。
- OpenAPI 3.0.3：[partner-subscription-key.openapi.json](./openapi/partner-subscription-key.openapi.json)，可导入 Apifox、Swagger Editor 等支持 OpenAPI 的工具。
- 示例地址：`https://platform.example`，使用前替换为实际已部署且配置正确的 HTTPS 平台域名。
- 成功返回直接业务 JSON，**没有 `{success,data}` 包装**；错误格式见[错误码](#10-错误格式与错误码)。
- 历史订阅 Key 基线 `58616beef` 的任务专属 Docker PostgreSQL 15.19 定向测试及独立代码审阅已通过；该证据不覆盖本次接入方式变更，本次 Go 构建/测试和 pq 运行验证仍阻塞，也不表示部署、完整应用启动、生产迁移或真实支付验收完成。

## 0. 商户接入方式前提

本接口仅供 `integration_mode=subscription_key` 商户。创建表单默认及后端真正省略字段均为此模式；显式空/null/未知值拒绝。接入方式创建后固定，管理列表展示实际模式，无切换接口；状态更新/密钥轮换不能附带修改。

本模式不能使用 H5 会话或 external_user_id 账户/额度/旧查单辅助接口。H5 商户不能使用订阅 Key 订单/领取/轮换/查询链路；当前合法商户错误入口返回 `403 integration_mode_mismatch`。旧 `POST /api/partner/v1/subscription-orders` 在两模式均拒绝，包括精确重放。共享收银台、可信回调和已接受订单交付保持模式中立，不删除付款或重写身份。

原订阅 Key 基线的 pq 证据不覆盖本次模式变更：当前 Docker daemon 不可用，本次 Go 构建/迁移/运行回归尚未执行；不可据此宣称已部署或数据库验收完成。

## 1. 接入流程与鉴权

```text
平台管理员配置商户专属套餐
    ↓
商户后端用 pt_ 新购下单 → order_no + checkout_url
    ↓
买家打开平台收银台付款（此时浏览器回跳不能证明已付款）
    ↓
平台可信支付确认 → 原子创建内部用户、Coding Key、订阅和订阅 Key
    ↓
商户查单确认 paid + fulfilled → 领取 sub_ → 交给对应买家
    ↓
买家只凭 sub_ 查询该份订阅、精确额度和 Coding Key
    ↓
续费：商户 pt_ + 原 sub_ 下单 → 新付款 URL → 延长原订阅
```

### 1.1 凭证用途

| 凭证 | 持有者 | 用途 | 不可用于 |
| --- | --- | --- | --- |
| `pt_...` 开发者密钥 | 商户后端 | 套餐目录、新购/续费、查单、领取、重置 | 买家直接调用；模型调用；独立订阅查询 |
| `sub_` + 64 位小写十六进制 | 买家、负责交付的商户后端 | 查询单份订阅；续费时定位原订阅 | Coding 调用；单独执行商户管理或重置 |
| `sk-...` Coding API Key | 买家 | 现有模型 API | 订阅查询或商户管理 |
| `pc_...` 收银台访问凭证 | 对应订单的买家 | 已有收银台短期访问 | 领取订阅 Key 或 Coding Key |

买家独立查询**不需要 `pt_`、商户 ID、平台用户 ID、注册、登录或 Cookie**。商户不得把开发者密钥放入浏览器或交给买家。

### 1.2 接口总览

| 操作 | 方法与完整路径 | 鉴权 | 其他必需输入 | 成功码 |
| --- | --- | --- | --- | --- |
| 套餐目录 | `GET /api/partner/v1/plans` | Bearer `pt_` | 无 | 200 |
| 新购 | `POST /api/partner/v1/subscription-key-orders` | Bearer `pt_` | 幂等键、套餐、支付方式 | 201 / 200 重放 |
| 续费 | 同一个 POST | Bearer `pt_` | 上述输入加 `X-Subscription-Key: sub_...` | 201 / 200 重放 |
| 查单 | `GET /api/partner/v1/subscription-key-orders/{order_no}` | Bearer `pt_` | 路径订单号 | 200 |
| 领取订阅 Key | `GET /api/partner/v1/subscription-key-orders/{order_no}/subscription-key` | Bearer `pt_` | 已付款且已交付订单号 | 200 |
| 独立订阅查询 | `GET /api/partner/subscription` | **仅 Bearer `sub_`** | 无 | 200 |
| 重置订阅 Key | `POST /api/partner/v1/subscriptions/{subscription_id}/key/rotate` | Bearer `pt_` | 幂等键、当前版本 | 200 |

### 1.3 通用协议

- 新增接口使用 HTTPS，拒绝 query，包括空 `?`；JSON 最多 2KB，只接受文档中的必需字段，拒绝未知/重复/大小写别名、null 或尾随 JSON。已存在的 `/plans` 保持原目录契约，不把新接口的严格解析要求误当作其新增行为。
- `Authorization`、`Idempotency-Key`、`X-Subscription-Key` 均须单值。新购必须**完全省略** `X-Subscription-Key`；空字符串不等于省略。
- POST 请求使用 `Content-Type: application/json`。`Idempotency-Key` 必须是 16–64 位 ASCII 字母、数字、`-` 或 `_`，每次购买意图固定一个值，网络失败后复用。
- `order_no` 是 `PTO` 加 32 位大小写英文字母/数字，总长度 35；订单号不是幂等键。`subscription_id` 是正整数，路径用规范十进制形式。
- 时间为 Unix 秒。金额 `amount` 是 CNY 十进制字符串；不接受客户端价格、币种或 `paid` 声明。
- 响应使用 `Cache-Control: no-store`、`Pragma: no-cache`；新增接口使用 `Referrer-Policy: no-referrer`，支持 `X-Request-Id` 排障。
- 除续费 POST 外，其他新增接口不要携带 `X-Subscription-Key`。订阅查询只接受 Authorization 中的 `sub_`，不接受 URL、JSON、Cookie、`x-api-key` 替代。

## 2. 查询可购套餐

```http
GET /api/partner/v1/plans
Authorization: Bearer <pt_merchant-secret>
```

返回 `{"plans":[...]}`，无套餐时为 `{"plans":[]}`。仅列出本商户名下启用套餐，返回已有 `SubscriptionPlan` 字段；下表列出接入常用字段，并非全部字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | integer | 下单使用的 `plan_id` |
| `title` / `subtitle` | string | 套餐名称和说明 |
| `partner_tenant_id` | integer | 所属商户；不需要在新下单时传回 |
| `price_amount` | number | 目录中的原有数字价格，实际应付金额以订单 `amount` 为准 |
| `currency` | string | 只有合法 CNY 套餐可用当前 Epay 链路付款 |
| `duration_unit` / `duration_value` | string / integer | 商户可购套餐为 `month` / `1` |
| `total_amount` | integer（原有契约） | 周期总额度，0 表示不限量；**此目录字段不是新的字符串 DTO** |
| `quota_reset_period` | string | 商户套餐为 `monthly` |
| `requests_per_minute` | integer | 套餐 RPM 设置；系统/分组限制仍适用 |
| `enabled` | boolean | 启用状态 |

> `/plans` 的数字字段保持旧协议。大于 JavaScript 安全整数范围的数字应使用无损 JSON 解析；下方独立订阅查询的额度全部为精确十进制字符串。

平台 root 在现有「套餐管理」创建套餐时选择单一 Partner tenant，配置 CNY 精确分价、一个日历月/月度重置、额度和 RPM。同一商户可有多份专属套餐，归属不可编辑。目录可见不等于可付款：历史非 CNY 或配置不合法的套餐仍可能下单失败，不能自行换算币种。

## 3. 新购订阅订单

```http
POST /api/partner/v1/subscription-key-orders
Authorization: Bearer <pt_merchant-secret>
Idempotency-Key: merchant-intent-00000001
Content-Type: application/json

{"plan_id":42,"payment_method":"alipay"}
```

### 请求字段

| 位置 | 名称 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- | --- |
| header | `Authorization` | string | 是 | `Bearer pt_...` |
| header | `Idempotency-Key` | string | 是 | 16–64 位 URL-safe 字符，购买意图内保持不变 |
| body | `plan_id` | integer | 是 | 本商户名下启用且可支付的套餐 ID，>0 |
| body | `payment_method` | string | 是 | 非空、最长16字节，必须是平台当前配置的可用 Epay 渠道；如 `alipay`，不能假定示例渠道已启用 |

**不传 `external_user_id`、用户 ID、订阅 Key、价格或订单状态。** 新购与续费都只允许以上两个 JSON 字段。

### 返回示例

首次创建返回 201；相同幂等键和相同意图重放返回 200：

```json
{
  "order_no":"PTO0123456789ABCDEFGHIJKLMNOPQRSTUV",
  "plan_id":42,
  "plan_title":"Monthly plan",
  "amount":"9.99",
  "currency":"CNY",
  "payment_method":"alipay",
  "payment_status":"pending",
  "fulfillment_status":"not_ready",
  "created_at":1800000000,
  "expires_at":1800001800,
  "checkout_url":"https://platform.example/partner/checkout?order_no=PTO0123456789ABCDEFGHIJKLMNOPQRSTUV#token=pc_REPLACE_WITH_ORDER_CAPABILITY"
}
```

### 订单响应字段

| 字段 | 类型 | 出现条件与语义 |
| --- | --- | --- |
| `order_no` | string | 固定平台订单号 |
| `plan_id` / `plan_title` | integer / string | 本订单套餐及创建时名称 |
| `amount` / `currency` | string / string | 冻结的应付金额和币种，当前为 CNY |
| `payment_method` | string | 原支付方式 |
| `payment_status` | string | 见[状态与重试](#9-支付交付状态与重试) |
| `fulfillment_status` | string | 支付与本地交付状态分开 |
| `created_at` / `expires_at` | integer | 创建时间、初始收银台到期时间 |
| `checkout_url` | string | 成功的创建/重放 POST 返回；商户只读 GET 不返回 |
| `subscription_id` | integer | 有实际关联订阅时返回；未交付时一般省略 |

新模式商户响应不包含 `external_user_id`、内部 User/Account ID、订阅 Key、Coding Key、QR 或直接网关支付链接。买家应打开平台 `checkout_url`，不要自行拼接网关地址。URL 中原有 `pc_` fragment 是短期订单访问权，不能换成 `pt_` 或 `sub_`。

**创建订单及返回 URL 都不新增用户。** 首次可信支付后的完整原子交付才新增真实 User、Token、内部账户、订阅和查询 Key。不同独立购买意图互不合并；没有买家身份，平台不能按“同商户+同套餐”判断是同一个人。

## 4. 查询订单状态

```http
GET /api/partner/v1/subscription-key-orders/PTO0123456789ABCDEFGHIJKLMNOPQRSTUV
Authorization: Bearer <pt_merchant-secret>
```

成功返回 200，字段与上方订单 DTO 相同，但**不包含 `checkout_url`**。例如已交付：

```json
{
  "order_no":"PTO0123456789ABCDEFGHIJKLMNOPQRSTUV",
  "plan_id":42,
  "plan_title":"Monthly plan",
  "amount":"9.99",
  "currency":"CNY",
  "payment_method":"alipay",
  "payment_status":"paid",
  "fulfillment_status":"fulfilled",
  "created_at":1800000000,
  "expires_at":1800001800,
  "subscription_id":123
}
```

只允许当前商户、本接入模式的订单；他商户或旧 external 模式订单返回 `404 order_not_found`。GET 不准备支付、不开户、不授予权益。

## 5. 商户领取订阅 Key

```http
GET /api/partner/v1/subscription-key-orders/PTO0123456789ABCDEFGHIJKLMNOPQRSTUV/subscription-key
Authorization: Bearer <pt_merchant-secret>
```

仅 `paid + fulfilled` 且关联完整时返回 200：

```json
{
  "order_no":"PTO0123456789ABCDEFGHIJKLMNOPQRSTUV",
  "subscription_id":123,
  "subscription_key":"sub_<64 lowercase hex>",
  "key_version":1
}
```

- `subscription_key`：能读取 Coding Key 的高敏秘密，只交给商户自己核对过订单归属的买家。
- `key_version`：当前版本，商户重置时传给 `expected_version`。
- 未支付/未交付返回 `409 subscription_key_not_ready`；损坏或缺失绑定不能通过 GET 自动修复/补签。
- 重复领取返回当前 Key；重置后，通过合法关联的首购或续费订单领取也只返回当前版本。
- 到期仍可领取查询 Key 用于历史查询，但不能因此取得过期订阅的 Coding Key。
- 不要把商户取钥接口作为任意浏览器传入订单号即可调用的公共代理。

## 6. 买家独立查询订阅

```http
GET /api/partner/subscription
Authorization: Bearer <sub_64-lowercase-hex>
```

**只需要订阅 Key**，不用商户密钥、商户 ID、登录态或 Cookie，也不传订单/订阅目标参数。

### 有效订阅响应：200

```json
{
  "subscription": {
    "id":123,
    "plan_id":42,
    "plan_title":"Monthly plan",
    "status":"active",
    "start_time":1800000000,
    "end_time":1802678400,
    "requests_per_minute":60
  },
  "quota": {
    "quota_total":"9223372036854775807",
    "quota_used":"9007199254740993",
    "quota_remaining":"9214364837600034814",
    "quota_unlimited":false,
    "quota_usable":true,
    "next_reset_time":1801440000
  },
  "api_key":"sk-REPLACE_WITH_ACTUAL_MODEL_KEY"
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `subscription.id` | integer | 此 Key 关联的唯一订阅 |
| `subscription.plan_id` / `plan_title` | integer / string | 套餐 ID 与当前套餐名称 |
| `subscription.status` | string | `active`、`expired`、`cancelled` |
| `subscription.start_time` / `end_time` | integer | Unix 秒；自然到期不必等待后台状态任务 |
| `subscription.requests_per_minute` | integer | 当前套餐 RPM；不是对其他系统限流的豁免 |
| `quota.quota_total` | string | 当前/最后周期总额度，范围0至int64最大值 |
| `quota.quota_used` | string | 当前/最后周期已用额度 |
| `quota.quota_remaining` | string | 当前可用余额，非活跃订阅固定 `"0"` |
| `quota.quota_unlimited` | boolean | 总额度为 `"0"` 时为 true；不能仅看 remaining 判断耗尽 |
| `quota.quota_usable` | boolean | 当前订阅有效且有额度，或不限量 |
| `quota.next_reset_time` | integer | 下一周期重置时间，0表示无已设定重置时间；终态不代表还会继续重置 |
| `quota.historical_quota_remaining` | string，可省略 | 非活跃订阅的历史余额，**不可消费** |
| `api_key` | string，可省略 | 正常有效订阅的实际 Coding Key；过期/取消时字段完全省略，而不是 null/空字符串 |

所有额度为**精确十进制字符串**，不要转 JavaScript Number；可使用字符串或 BigInt。活跃但耗尽仍可能返回正常 Coding Key，同时 `quota_usable=false`，实际调用仍由订阅计费拒绝；Token 的 unlimited 设置不是订阅无限额度。

### 到期/取消响应

```json
{
  "subscription":{"id":123,"plan_id":42,"plan_title":"Monthly plan","status":"expired","start_time":1800000000,"end_time":1802678400,"requests_per_minute":60},
  "quota":{"quota_total":"5000000","quota_used":"250","quota_remaining":"0","quota_unlimited":false,"quota_usable":false,"next_reset_time":1802678400,"historical_quota_remaining":"4999750"}
}
```

历史查询不会重置新周期；其他订阅不能替此订阅放行取钥。禁用商户/账户/User、错组、删除/禁用/过期 Token 或损坏绑定均拒绝，不自动补发凭证。`sub_` 不能直接调用 Coding；模型接口仍使用返回的 `api_key`。

## 7. 通过原订阅 Key 续费

使用与新购相同的 POST，并额外带**当前**订阅 Key：

```http
POST /api/partner/v1/subscription-key-orders
Authorization: Bearer <pt_merchant-secret>
X-Subscription-Key: <current-sub_key>
Idempotency-Key: merchant-renewal-000001
Content-Type: application/json

{"plan_id":42,"payment_method":"alipay"}
```

返回新续费订单号和该订单的付款 URL，响应结构同新购。只有付款交付完成后才延长原订阅；**不新增用户，不更换订阅行、Coding Key 或订阅 Key**（期间商户主动重置订阅 Key 除外）。

- 只续原套餐；`plan_id` 必须与原订阅一致，当前商户必须拥有该订阅和允许购买的套餐。
- 活跃或自然到期允许续原行；取消/删除/损坏拒绝，不能自动改成新购补救。
- 新购须完全省略 `X-Subscription-Key`。有该头但为空/错误/旧版本/他商户 Key 会拒绝，不会退化为新购。
- 有效期从 `max(原 end_time, 交付时数据库时间)` 延长一个日历月；提前续费不会立即重置/叠加当期额度，已到期复活不携带旧周期余额。
- 订单接受时冻结续费目标。之后显式换钥不抹去已有订单的支付事实和目标，可信付款后仍按原目标履约。
- 换钥后旧 Key 不能新建或重放续费；商户领取当前 Key，再用新头、原参数/原幂等键重放同一目标即可。新幂等键表示新一笔续费，不能用于修复网络超时。

## 8. 商户重置订阅 Key

```http
POST /api/partner/v1/subscriptions/123/key/rotate
Authorization: Bearer <pt_merchant-secret>
Idempotency-Key: merchant-rotation-00001
Content-Type: application/json

{"expected_version":1}
```

| 参数 | 位置 | 类型 | 说明 |
| --- | --- | --- | --- |
| `subscription_id` | path | integer | 所属商户已签发凭证的订阅 ID |
| `expected_version` | body | integer | 领取结果的当前 `key_version`，从1开始；版本落后则冲突 |
| `Idempotency-Key` | header | string | 此次轮换固定使用的幂等键；与支付意图区分 |

成功返回 200：

```json
{"subscription_id":123,"subscription_key":"sub_<new 64 lowercase hex>","key_version":2}
```

提交后旧 Key 的新请求失效。相同幂等键和相同参数重试，仅当结果版本仍当前时返回同一 Key；被后续轮换超越返回 `409 subscription_key_changed`，不会复活旧 Key。新幂等键但 `expected_version` 落后也冲突；同幂等键改参数返回 `idempotency_conflict`。

**不轮换 Coding Key、不改变权益，不能撤回已授权请求、已发出的响应或买家已保存的 Coding Key。** 订阅 Key 本身没有重置权限。根秘密异常不会自动重签，详见运维约束。

## 9. 支付、交付状态与重试

| 字段 | 值 | 接入方处理 |
| --- | --- | --- |
| `payment_status` | `pending` | 未确认付款，打开已有付款 URL或按原参数恢复准备 |
| 同上 | `paid` | 已有可信支付事实；仍需结合交付状态 |
| 同上 | `expired` | 未付订单已超过原收银台期限；不等于网关取消，仍可能迟付 |
| 同上 | `failed` | 协议保留的失败状态；不可领钥，不代表客户端可以自行补标paid |
| `fulfillment_status` | `not_ready` | 尚未进入付费交付 |
| 同上 | `pending` | 等待交付 |
| 同上 | `fulfilled` | 本地交付完成；与paid一起才能领取 |
| 同上 | `failed_retryable` | 已付但交付失败待恢复，**不能让买家重复支付** |

| 场景 | 正确处理 |
| --- | --- |
| 创建请求超时/503支付准备失败 | 保持原参数和同一幂等键，重试原POST；不换键制造第二订单 |
| GET显示pending但没有付款URL | GET为只读，不能修复准备；用原POST显式重试 |
| paid但尚未fulfilled | 查询原订单等待交付/排障，不要求再次付款 |
| 浏览器返回“成功” | 仅作展示，查询平台订单；不能用回跳或客户端声明领钥 |
| 收银台超时 | 原单保留原deadline，商户查单核实；迟付仍可确认并交付 |
| 429 | 遵循 `Retry-After`，退避后重试原意图 |
| 轮换请求丢失响应 | 原幂等键及原expected_version重试；若结果已被后续轮换超越，则领取当前Key |

平台独立提交可信付款事实，再原子提交用户/Key/订阅/交付标记；本地失败不抹掉外部已付款事实。当前实现有启动/定时已付未交付恢复，不依赖买家一直打开页面；不是商户webhook，也不承诺即时完成。如果支付通知全部缺失，需平台/支付方核账。

## 10. 错误格式与错误码

```json
{
  "error":{"code":"subscription_key_not_ready","message":"payment and delivery must complete before claiming the key"},
  "request_id":"request-id-for-support"
}
```

以 HTTP 状态及 `error.code` 分支处理；`message` 是人类可读文案，不作为稳定枚举。保存排障 request_id 时不要同时保存秘密请求头或完整凭证响应。

| HTTP | code | 处理建议 |
| --- | --- | --- |
| 400 | `invalid_request` | 检查JSON字段、头单值、幂等键、路径和禁用query |
| 400 | `unsupported_currency` | 套餐不满足CNY支付，不能自行做汇率换算 |
| 401 | `invalid_partner_secret` | 商户密钥错误/已换钥/商户停用；核对后端配置 |
| 401 | `invalid_subscription_key` | sub_错误/旧版本/不匹配用途或续费商户；不降级为新购 |
| 403 | `integration_mode_mismatch` | 不符合创建时选定的接入方式；不能改传用户 ID 绕过 |
| 403 | `account_disabled` | 商户或关联账户/User禁用等状态问题；不能补建绕过 |
| 404 | `plan_not_found` | 当前商户范围内套餐不可用 |
| 404 | `order_not_found` | 不存在、其他商户或错误接入模式的订单 |
| 404 | `subscription_not_found` | 重置/续费目标不属于当前商户，或不允许续费 |
| 404 | `subscription_key_not_found` | 缺少/损坏的付费关联，GET不会修复 |
| 409 | `subscription_key_not_ready` | 未paid+fulfilled，继续查原订单 |
| 409 | `credential_unavailable` | Coding凭证不可用/绑定状态异常，禁止自动补发 |
| 409 | `idempotency_conflict` | 同幂等键不同意图/参数；排查而非盲目换键 |
| 409 | `subscription_key_changed` | 版本过时或原轮换结果已被超越，领取当前Key |
| 429 | `rate_limited` | 遵循Retry-After及退避策略 |
| 503 | `payment_unavailable` | 支付配置或准备暂不可用，原POST+原幂等键恢复 |
| 503 | `subscription_key_unavailable` | 根秘密/当前派生关系异常，平台排障，不静默换钥 |
| 500 | `server_error` | 保存request_id并排障；对不明状态仍先核对原订单 |

## 11. cURL 快速接入

下面仅为示例，所有凭证/订单均由接入方实际填入；不要将真实秘密写入仓库、CI日志或共享终端历史。`alipay` 仅为示例可用渠道，不发送真实付款请求作为文档验证。

```bash
BASE_URL='https://platform.example'
# 在安全环境中设置 PARTNER_SECRET、SUBSCRIPTION_KEY、ORDER_NO、SUBSCRIPTION_ID。

# 1. 商户：查询套餐
curl --silent --show-error "$BASE_URL/api/partner/v1/plans" \
  --header "Authorization: Bearer $PARTNER_SECRET"

# 2. 商户：新购（不带 X-Subscription-Key）
curl --silent --show-error --request POST "$BASE_URL/api/partner/v1/subscription-key-orders" \
  --header "Authorization: Bearer $PARTNER_SECRET" \
  --header 'Idempotency-Key: merchant-intent-00000001' \
  --header 'Content-Type: application/json' \
  --data '{"plan_id":42,"payment_method":"alipay"}'

# 3. 商户：查单；买家付款后等待 paid + fulfilled
curl --silent --show-error "$BASE_URL/api/partner/v1/subscription-key-orders/$ORDER_NO" \
  --header "Authorization: Bearer $PARTNER_SECRET"

# 4. 商户：领取并交付 Key
curl --silent --show-error "$BASE_URL/api/partner/v1/subscription-key-orders/$ORDER_NO/subscription-key" \
  --header "Authorization: Bearer $PARTNER_SECRET"

# 5. 买家：独立查询，不带商户秘密
curl --silent --show-error "$BASE_URL/api/partner/subscription" \
  --header "Authorization: Bearer $SUBSCRIPTION_KEY"

# 6. 商户：续费，保存新订单并让买家打开新付款 URL
curl --silent --show-error --request POST "$BASE_URL/api/partner/v1/subscription-key-orders" \
  --header "Authorization: Bearer $PARTNER_SECRET" \
  --header "X-Subscription-Key: $SUBSCRIPTION_KEY" \
  --header 'Idempotency-Key: merchant-renewal-000001' \
  --header 'Content-Type: application/json' \
  --data '{"plan_id":42,"payment_method":"alipay"}'

# 7. 商户：显式重置；expected_version 使用实际当前 key_version
curl --silent --show-error --request POST "$BASE_URL/api/partner/v1/subscriptions/$SUBSCRIPTION_ID/key/rotate" \
  --header "Authorization: Bearer $PARTNER_SECRET" \
  --header 'Idempotency-Key: merchant-rotation-00001' \
  --header 'Content-Type: application/json' \
  --data '{"expected_version":1}'
```

## 12. 安全、部署与旧接口兼容

- `sub_` 能读取Coding Key。反向代理、应用日志、分析/错误上报必须禁记 Authorization、X-Subscription-Key及凭证响应。收银台URL带短期capability，同样不能进入分析日志/公共缓存。
- 配置稳定且跨节点一致的 `SESSION_SECRET` / `CRYPTO_SECRET`。根秘密与存储哈希不一致时查询/领取失败，不自动重签；恢复原配置，或由合法商户显式轮换查询Key。此功能不提供KMS或自动根秘密轮换。
- 新接口按Tenant锁后当前pt_/sub_和严格数据库时间授权；旧凭证、错组、禁用、损坏关系不能用“重试”绕过。
- H5 仅对明确 hosted_h5 商户开放，仍要求 external_user_id；旧直接 POST subscription-orders 在两模式均拒绝。原订单不自动补签 sub_，新的内部账户也不能被 external 身份辅助接口认领。
- 没有新增买家登录页面、商户webhook、跨套餐换购、自动退款或Coding Key轮换。匿名不同新购意图分别开户，不能识别同一个买家；旧模式/后台管理员另行改授权益不在本模式隔离保证内。
- 回滚保留新列/表、所有订单/paid事实和权益；旧二进制不能安全处理新模式已付未交付订单，需关闭新入口并协调恢复，不能直接删除记录。
- 验证详情：[归档任务 verification.md](../.trellis/tasks/archive/2026-11/11-12-partner-subscription-access-key/verification.md)。必要定向pq通过不代表全量启动、生产迁移、真实网关/付款或部署已验收；未运行无关全量测试。
