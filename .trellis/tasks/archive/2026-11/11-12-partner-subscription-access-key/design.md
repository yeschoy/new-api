# 技术方案：无外部用户 ID 的商户订阅 Key 接入

## 1. 审阅状态与边界

本版对应 PRD R1–R13 / AC1–AC14，**用户在最终摘要后答复“开始”批准实施，任务已 in_progress**。已确认商户通过原订阅 Key 指定续费目标；仅可信付款后的首次新购新增真实 User。无 users principal/funding/RPM/日志重构不实施。

保持一个端到端任务：新模式订单、隔离身份及凭证在同一付费交付事务验证，不能独立上线；不为已存在的套餐 UI/支付系统另建子任务或重复实现。

复用 pt_、专属套餐、订单支付事实、Epay 校验、平台收银台、恢复扫描、User/Token、UserSubscription、周期重置及订阅专用 funding。只增加新模式和查询凭证；旧 external_user_id API、H5 和普通用户路径保持兼容。

## 2. 接口与权限

### 2.1 接口表

| 接口 | 鉴权/输入 | 输出与边界 |
| --- | --- | --- |
| GET /api/partner/v1/plans | 当前 pt_ | 复用启用的本商户专属套餐目录 |
| POST /api/partner/v1/subscription-key-orders | 当前 pt_、Idempotency-Key，严格 JSON `{plan_id,payment_method}` | 新建 201/原样重试 200，返回订单安全 DTO 和 checkout_url |
| 同一 POST 的续费形式 | 同上，额外 `X-Subscription-Key: sub_...` | 当前 Key 指定原订阅；仍返回付款 URL，不返回长期凭证 |
| GET /api/partner/v1/subscription-key-orders/:order_no | 当前 pt_ | 本商户、本模式订单状态，无买家 ID/秘密；GET 不准备支付 |
| GET /api/partner/v1/subscription-key-orders/:order_no/subscription-key | 当前 pt_ | paid+fulfilled 才返回 `{order_no,subscription_id,subscription_key,key_version}` |
| GET /api/partner/subscription | 仅 `Authorization: Bearer sub_...` | 关联单订阅、额度、条件允许时的 Coding API Key；不需要 pt_/商户 ID/Cookie |
| POST /api/partner/v1/subscriptions/:subscription_id/key/rotate | 当前 pt_、Idempotency-Key、严格 JSON `{expected_version:1}` | `{subscription_id,subscription_key,key_version}`，不更换 Coding Key/权益 |

新 API 使用 plain JSON、request_id、安全错误、no-store/Pragma/no-referrer。新增商户路由放在现有 pt_ 组内；独立查询在该组之外，不能误挂平台登录或商户鉴权。

所有新请求拒绝 query，JSON 限 2KB，拒绝未知/重复/大小写别名字段、尾随 JSON 和重复鉴权/幂等/订阅 Key 请求头。sub_ 为固定前缀加 64 位小写 hex；不接受 URL、JSON、Cookie、x-api-key 中的替代凭证。续费 Key 放单独请求头，避免与 pt_ 的 Authorization 混用，也避免业务 JSON/请求摘要保存原秘密。出现该头但为空/错误时拒绝，绝不能退化为新购。

Idempotency-Key 沿用 16–64 URL-safe 字符校验。新模式写请求在真正的事务内、Tenant 锁后重验当前开发者密钥哈希及启用状态；中间件早期鉴权不是最终变更授权。

### 2.2 新购与续费

- 无 X-Subscription-Key：一次独立购买意图。商户不提供任何用户 ID，不能按 tenant/plan 推断同一人；下单只保存订单，User/Token/订阅/长期凭证均不创建。
- 有 X-Subscription-Key：当前 pt_ 与当前 sub_ 必须归同一商户；锁内验证真实账户、订阅和凭证绑定。只能续其原 plan_id，不能以此换购/升级或授权其他订阅。
- 活跃/自然到期的原订阅均可显式续同一行，取消/删除/禁用或损坏关系拒绝。自然到期是可查询状态，不使长期查询 Key 自动作废。这里显式指定原订阅，与“到期后另一次独立新购”不同，后者仍创建新关系，不改绑旧 Key。
- 创建订单冻结 RenewalSubscriptionId、账户 ID、plan/精确 CNY 价格/币种/方式/商户支付配置。接受的续费可跨自然到期交付，取消/损坏不能换一份新订阅补救。
- 支付交付从 max(原 end_time, 交付时严格 DB 时间) 延长一个日历月；沿用现有周期重置语义，活跃期提前续费不立即重置/叠加当期额度，已到期复活不携带旧周期余额。不换 User/Token/订阅行/查询 Key（期间显式重置 Key 除外）。
- 两种下单都返回现有 checkout_url，仍使用原 pc_、30 分钟固定收银台 deadline 和安全公共 DTO；初始响应绝不含 sub_/Coding Key。不新增直接网关秘密链接字段。
- 网关准备失败保留原 pending 订单，原参数/同幂等 POST 恢复原订单和 deadline；GET 不准备支付、不自动另开新单。新幂等键才表示新意图。

### 2.3 商户领取与重置

领取只读地核对订单模式/归属、paid+fulfilled、实际 AccountId/SubscriptionId 及绑定锚点，返回当前 Key。不能创建 User/Token/权益/凭证，不能修复坏映射。到期仍可领取查询 Key，但不是直接取 Coding Key。

旧模式订单在新模式领取入口返回 scoped order_not_found；新模式已交付但缺少凭证绑定返回 subscription_key_not_found，不静默补签。旧 API/H5 未来交付同样不自动签发 sub_。重置后从任何合法关联的新模式付费订单领取的都是当前 Key，不复活旧版本。

轮换在当前商户锁下验证 expected_version，并原子替换随机种子/哈希、递增版本，写独立轮换幂等事实。同幂等键同参数重试：结果版本仍当前则派生同一 Key；已被后续轮换超越则 409 subscription_key_changed，不返回旧 Key、不再轮换。新幂等键但旧 expected_version 同样 409；版本溢出拒绝。

提交后新请求不能用旧 Key 查询或新建/重放续费。已经由旧 Key 授权并冻结目标的付费订单仍按原目标履约，不因后来换钥而抹掉支付事实；已授权请求/已发出的响应不可追溯撤回。

### 2.4 独立查询与精确额度

请求仅由 sub_ 决定范围，拒绝目标订阅/订单/用户等 query；不要求商户密钥、商户 ID、平台登录或 Cookie。

```json
{
  "subscription": {
    "id": 123,
    "plan_id": 42,
    "plan_title": "Monthly plan",
    "status": "active",
    "start_time": 1800000000,
    "end_time": 1802678400,
    "requests_per_minute": 60
  },
  "quota": {
    "quota_total": "5000000",
    "quota_used": "250",
    "quota_remaining": "4999750",
    "quota_unlimited": false,
    "quota_usable": true,
    "next_reset_time": 1801440000
  },
  "api_key": "sk-<actual-model-key>"
}
```

全部 int64 额度用精确十进制字符串；验证 total/used 非负后计算 max(total-used,0)，避免溢出/浮点转换。total=0 表示 unlimited，remaining 为 "0"、quota_unlimited=true，不当作耗尽。旧数字 DTO 不变。

锁定的有效订阅先调用 maybeResetUserSubscriptionWithPlanTx；到期/取消历史不重置。自然到期即投影为 expired，不等后台状态更新；省略 api_key，quota_remaining="0"、quota_usable=false，另给 historical_quota_remaining，保留 total/used，明确历史不是权益。取消同样无 API Key/可用额度。

只有关联订阅本身有效，且商户、账户、User、Token 状态/分组/绑定/有效期均正常才返回实际 TokenId 的 Coding Key。活跃但耗尽可返回正常 Key，quota_usable=false，真实调用仍由既有 subscription_only funding 拒绝。其他有效订阅不能替关联订阅放行取钥；禁用/坏映射均 fail closed，不自动补发。

响应不返回账户标识、其他订阅、商户秘密、sub_ 本身、种子或内部存储材料。

## 3. 数据模型与身份隔离

### 3.1 扩展现有订单和账户，而不伪造买家 ID

**PartnerTenantSubscriptionOrder** 增量增加：

- EntryMode：非空 varchar(24)，默认 external；历史及旧 API/H5 为 external，新入口为 subscription_key。
- AccountId：非空 bigint 默认 0；新购在交付前为 0，交付时写入；续费在接受订单时冻结现有账户 ID。
- 沿用 RenewalSubscriptionId/SubscriptionId、支付与交付状态、价格快照/交易证据/恢复字段。新模式 ExternalUserId 留空，ExternalUserHash 是内部意图/账户预算哈希，不作为买家身份，不对外导出。
- 新模式幂等摘要为 SHA256(版本化用途域 + 经原校验得到的幂等哈希)，不改变现有唯一索引或旧/H5 摘要。请求摘要用无歧义编码包含模式、新购/续费、plan、method、实际续费订阅 ID；不含原始 sub_ 或当前版本，Key 显式重置后仍可用新 Key 原样重试同一订阅订单。

**PartnerTenantAccount** 增量增加：

- IdentitySource：非空 varchar(24) 默认 external，历史映射及旧 helper 仍为 external，新内部账户为 subscription_key。
- SourceOrderId：nullable bigint、唯一索引 idx_pt_account_source_order；仅新模式首次付费新购填写该原订单 ID。与持久化 UserId/TokenId 一起构成固定内部身份。
- 新内部账户 ExternalUserId=""，ExternalUserIdHash 必须为非空 SHA256("partner-tenant-subscription-account:v1\\0" + 初始订单号)，用途域实际编码含 NUL。不是 SHA256(空串)、不是随机假 external_user_id，也不留 NULL 给旧回填误处理。
- 保持既有 tenant/hash、UserId、TokenId 唯一约束；新内部哈希不同于合法外部 ID 的输入域（外部 ID 禁止控制字符），且所有新版本外部查询仍显式过滤 IdentitySource=external，包含旧哈希为空时的精确值 fallback。猜订单号/用户名/空串均不能命中新内部映射。
- 历史空/缺省 source 统一为 external；migratePartnerTenantAccountIdentity 只回填 external 来源，不能将内部账户改写成外部账户。既有行和哈希保留。

在 partner_tenant.go 提取事务内通用的 User/Token 创建部分，旧外部开户 helper 保持输入和输出；另设私有内部开户 helper，按 SourceOrderId get-or-create 并核对来源/归属。不能给旧 helper 填随机 external_user_id 冒充隔离。

内部 User 使用不可预测用户名/随机密码哈希、普通角色、启用状态、商户分组、零钱包额度，不向买家/商户提供登录密码。Token 使用现有生成器、UnlimitedQuota=true、固定 TokenId，不代表无限订阅额度；PartnerTenantAccount 仍被 IsPartnerTenantUser 识别，沿用钱包拒绝、套餐 RPM 和消费日志，无新 funding 主体。缓存只在完整交付提交后发布。

新模式正常创建/续费只给该独立 User 维护这一份订阅，不通过旧身份 API向其增加其他订阅。模型计费仍按现有用户选订阅，不声称 sub_ 是全站 Token 的计费过滤器；管理员另行直授/修改用户不在本次消费隔离保证内。

### 3.2 两张凭证表

**PartnerTenantSubscriptionAccessKey**：Id、TenantId、AccountId、UserSubscriptionId、IssuedOrderId、Seed、KeyVersion、SecretHash、CreatedAt/UpdatedAt；全部内部字段不直接 JSON 导出。

- AccountId 和 UserSubscriptionId 各有明确短名唯一索引（idx_pt_subkey_account / idx_pt_subkey_subscription）；SecretHash 用 idx_pt_subkey_hash 唯一索引。
- IssuedOrderId 是首次新购真实付费锚点，与账户 SourceOrderId 对齐；续费只复用该绑定。
- Seed 为 crypto/rand 的 32 字节随机种子（规范 hex），KeyVersion 从 1 开始，SecretHash 为完整当前 Bearer 的 SHA256。

**PartnerTenantSubscriptionKeyRotation**：TenantId、IdempotencyHash、RequestHash、UserSubscriptionId、ResultVersion、CreatedAt；tenant+幂等哈希用 idx_pt_subkey_rotate_request 唯一约束。不保存旧种子/旧明文 Key，请求摘要含订阅 ID 和 expected_version，独立于支付幂等用途域。

新文件以 model/partner_tenant_subscription_key.go 为主；新模式订单可置于 model/partner_tenant_subscription_key_order.go。新增字段/两表注册在 model/main.go 的实际迁移入口，必要迁移 helper 同时供入口及测试复用。显式 text/合适字段长度，不能由 serializer size 制造 PostgreSQL 超长 varchar。

### 3.3 可重复领取与根秘密

`sub_ + hex(HMAC-SHA256(common.CryptoSecret, purpose + tenant_id + account_id + subscription_id + seed + key_version))`

用途为固定版本化域（partner-tenant-subscription-key:v1 + NUL），字段采用固定顺序/无歧义编码，不与 pt_/pc_/pl_/ps_ 共用域。库中只存随机种子和当前 Bearer 哈希，领取稳定派生后必须核对持久化哈希；查询也验证当前种子派生关系及常量时间比较，不依赖缓存授权。

根秘密必须跨副本/重启稳定一致；仅数据库而无根秘密不能派生 sub_。配置变更导致派生与旧哈希不符时 503 subscription_key_unavailable，不静默重签；恢复原配置，或由当前合法商户显式轮换。MVP 不做 KMS/根秘密轮换。

现有 Coding Token 原值仍保存在 tokens.key，本期不声称它已加密，也不在每订单/查询凭证复制一份。

## 4. 事务、锁与恢复

### 4.1 统一锁偏序和授权

对本期路径按 Tenant → 必要时 Order → Plan → Account → User → Token → UserSubscription → AccessKey → RotationRecord；跳过无关项但不能逆序。预查 hash/order_no 只定位，不是最终授权。实施时核对实际复用 helper，不把同一资源的再加锁反转顺序。

Tenant 锁后重验当前 pt_（新购/续费/重置/领取），禁用或换钥中的慢请求不能继续用旧授权。续费和查询在持有资源锁后重新核对当前 sub_、绑定及派生关系；锁后用 getDBTimestampOnStrict(tx) 新鲜 DB 时间判断订阅和 Token 有效期，PostgreSQL 用 clock_timestamp()，不能只用请求时间或事务开始 NOW。DB 时间失败即失败。

续费已存在订单的同参数重放同样要验证当前 pt_/sub_；当前 Key 轮换后可先领取新 Key，再用新头重放。目标 ID 不变，规范请求摘要不变；旧 Key 的新请求失败。读取同一锁定快照构造额度，不能拼接事务外旧数据。

### 4.2 下单

新事务验证当前凭证、模式、幂等和目标；锁 plan/必要账户与订阅，冻结精确快照并保存一次订单。仅在真正新下单检查当前支付配置和套餐启用；精确重放沿用原快照/deadline，不因套餐编辑/停用改价、另建订单或丢弃已付事实。续费即使是重放也不能忽略当前 Key 或损坏/取消的目标。

无买家身份时不伪造每买家限购/预算：新购保持 tenant 每小时订单预算和现有 IP/商户请求限流，独立意图各自开户；续费可按固定账户做 20/小时、5 个未过期待付订单预算。旧模式的 external_user_hash 限额/预约计数不受影响，相关查询显式按模式隔离。MaxPurchasePerUser 仍是内部真实 User 的规则，不宣传为匿名买家的跨新购识别能力。

事务提交后才调用已有网关准备；没有任何外部 I/O 跨 DB 事务。共用收银台/支付准备的底层订单 getter 保持模式中立，旧 merchant status/get-by-idempotency 和 H5 在各自入口只接受 external，新 merchant GET 只接受 subscription_key；不能把共用 GetPartnerTenantSubscriptionOrder 全局改成 external 过滤而破坏新支付读取，也不能让内部身份进入旧 BFF 归属检查。

### 4.3 可信付款后的交付

1. 现有签名/pid/方式/金额/币种/交易唯一性校验通过后，独立提交 paid。收银台过期不是网关取消，可信迟付仍可记录和履约。
2. FulfillPartnerTenantSubscriptionOrder 在锁内按 EntryMode 分派；external 保持旧路径。subscription_key 必须 paid；已 fulfilled 则只验证必要既有一致性并早返回，不再开户/延期/补签。
3. 新购按 SourceOrderId 建立独立内部 User/Token/Account，再授予一份 UserSubscription；续费按冻结 AccountId/RenewalSubscriptionId 校验原关系，不重新通过当前/旧 sub_ 定位，也不把取消/损坏目标退化成新购。
4. 新购建立 AccessKey，续费核对并复用现有绑定、种子/版本。账户、User、Token、订阅、凭证及订单 AccountId/SubscriptionId/fulfilled 标记同事务提交；任一失败整体回滚，仅 paid 保留，failed_retryable/恢复沿用原机制。
5. 新路径的续期/周期 helper 接受严格锁后 DB 时间；需要抽取共享实现时保留旧调用封装语义，不复制一份计费/日历算法。
6. 提交后发布账户 membership 缓存；重复通知、后台恢复、多副本并发依靠 Tenant/Order 锁和唯一约束只交付一次。

## 5. 安全与错误矩阵

| 条件 | 行为 |
| --- | --- |
| 商户凭证错误/轮换/商户停用 | 401 invalid_partner_secret，新路径锁内复核 |
| 外商户/错误模式订单或订阅 | scoped 404 order_not_found / subscription_not_found，不暴露另一方存在性 |
| 非 paid+fulfilled 的领取 | 409 subscription_key_not_ready，无副作用 |
| 新模式缺失交付凭证绑定 | 404 subscription_key_not_found，不补签 |
| 查询 sub_ 缺失/格式错/旧版/其他用途 | 401 invalid_subscription_key，统一安全文案 |
| 续费头错误/已轮换/跨归属或目标不匹配 | 安全拒绝，不创建新购/第二订阅，不泄露 Key |
| JSON/query/重复头或字段错误 | 400 invalid_request |
| 同幂等键不同意图/版本落后/已超越轮换 | 409 idempotency_conflict / subscription_key_changed |
| 禁用账户/User、错误 group、损坏/禁用/删除/过期 Token | 403 account_disabled / 409 credential_unavailable，不补发 |
| 根秘密与存储哈希不匹配 | 503 subscription_key_unavailable，不静默换钥 |
| 严格时钟/数据库失败 | 500 server_error，不返回内部错误或秘密 |
| 预算超限 | 429 rate_limited + Retry-After |

sub_ 不进入 tokens 表，不能通过 TokenAuth/TokenAuthReadOnly，测试以 /v1/models 和一个代表 Coding 请求证明拒绝发生在上游之前。独立查询拒绝 pt_/pc_/pl_/ps_/sk-/Cookie-only，商户重置拒绝 sub_。

沿用请求 ID 和 IP/凭证哈希预算，不在限流/日志键放原始秘密；明确禁止记录 Authorization、X-Subscription-Key、完整凭证响应/派生材料。新的机密不进入 URL；既有 pc_ fragment 收银台及其 scrub 规则保持不变，不新增第三方脚本。

## 6. 套餐配置、验证与回滚

root 复用套餐管理创建时单选商户及编辑价格/额度/RPM/启停，归属不可变；沿用 dedicated group、CNY、单月/月重置和无钱包兜底。目录与新订单验证商户归属/启用，不能伪造普通平台或他方 plan_id。没有共享授权表、管理 API 或新前端文案。

只运行本次必要 PostgreSQL 迁移、持久化、HTTP 与关键并发验证，Go runner/空库均在任务专属 Docker。新 fixture 使用 TEST_PARTNER_SUBSCRIPTION_KEY_POSTGRES_DSN，不调用隐式 SQLite setup；无 DSN/跳过/no tests to run 不当作通过。不跑 SQLite/MySQL/FoundRows、全站、无关前端/计费或旧完整矩阵，保留跨驱动代码。覆盖明细和命令见 implement.md。

主要风险是新身份模式/迁移、交付失败恢复、Key 派生根配置和重置竞态。匿名购买无法按买家跨意图合并或限购，独立付费新购会增加真实用户。模型 Token 仍沿用现有可恢复存储安全模型。

回滚保留新列/两表、账户、权益、所有订单和 paid，不 drop、不 backfill 改绑、不回收已交付权益。旧版本无新路由，不应继续承接新模式下单；旧交付不能解释新模式，应协调回滚并保留 paid-unfulfilled 待恢复新版本履约。内部哈希非 NULL 避免旧回填误处理，ExternalUserId 为空令旧外部开户不能误领内部账户；回滚不等于已验证可混跑新旧二进制。

不访问生产/真实付款/私钥，不覆盖已有用户文档。不新增未登记非业务产物；后续容器/网络/空库/输出登记 TEMPORARY_ARTIFACTS.md，用户同意后才清理，Trellis 记录保留。
