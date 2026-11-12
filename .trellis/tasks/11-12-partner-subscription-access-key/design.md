# 技术方案：商户交付独立订阅 Key

## 1. 审阅状态与架构边界

**重规划中：新下单不传 external_user_id；用户进一步询问完全不新增 users 的可行性。** 已确认可通过订阅独立调用/计费主体实现，但尚未选择该更大改造或同意自动创建内部用户。旧商户用户身份设计已撤回；3.3 的内部 User 是前一候选，3.4 是当前新增可行候选，不可混用或直接实施。已确认的专属套餐、付款 URL、商户交付、sub_ 独立查询、续费保留 Key、到期历史查询和商户重置继续有效。

复用 pt_ 鉴权及可信支付基础设施，不把旧 controller/model 的必填 external_user_id 当成新需求；以下新入口、持久化扩展和交付路径仍是草案，待产品关系确认后收敛并重新审阅。

- 商户开发者密钥复用现有 `pt_`，仅在商户服务端使用。
- 复用现有订阅订单、平台收银台、Epay 验证、原子交付及恢复扫描。
- 新增独立 `sub_` 订阅 Key，只访问一份实际 `UserSubscription`；不写入模型 `Token` 表。
- Coding API Key 的主体尚待选择：候选一为内部 User/Token，候选二为完全不新增 users 的独立订阅主体。无论选择哪种都不要求商户提供终端用户 ID，不把所有买家挂到共享用户。
- 公共收银台 `pc_`、H5 `pl_/ps_`、商户 `pt_`、订阅 `sub_`、模型 `sk-` 严格分离。
- 不新增买家平台页面：商户负责持有、领取和交付订阅 Key；现有收银台和 H5 响应不增加秘密字段。本期复用已有后台配置，无需新增前端页面或改动文案。

### 1.1 商户专属套餐配置（用户已选 A）

- 平台 root 在现有“套餐管理”的创建表单选择所属商户，为其创建一份或多份专属套餐；后续在同一入口编辑价格、额度、RPM 和启停。沿用 AdminCreate/UpdateSubscriptionPlan，不新增映射表或管理 API。
- 每份套餐只有一个 PartnerTenantId，保持该归属不可修改；复用现有 dedicated group、CNY、单日历月/月重置及无钱包兜底规则，不改变套餐所有权/计费算法。
- `GET /api/partner/v1/plans` 用当前 pt_ 只返回此商户名下 enabled 套餐；真实新下单在 model 层仍校验归属、启用状态和对应 group。直接提交他人或平台套餐 ID 返回 scoped 404，不因前端可见性而放宽服务端边界。
- 现有 H5 继续用其会话绑定商户的同一目录与订单核心；重试保留原订单，不把套餐停用当作取消已有真实支付或另起订单的理由，既有 paid-unfulfilled 恢复策略不变。
- 该选择已由现有后台/后端支持，因此本期以接入文档和一组 pq 定向回归保证“配置 → 目录 → 下单”的完整链路，不为实现同一能力重复造 UI 或修改已稳定接口。
- 用户查询仍与商户配置身份分离：GET /api/partner/subscription 只要 sub_，不再要 pt_、商户 ID、Cookie 或商户后端代签。

## 2. 接口契约

新接口沿用 plain JSON、统一错误对象和 request_id。所有响应包含 no-store / Pragma，额外配置 no-referrer；禁止 URL 携带任何秘密凭证，不使用平台 Cookie 或 OAuth 身份替代 Bearer。

### 2.1 无用户 ID 的新下单入口（草案）

- 旧 `POST /api/partner/v1/subscription-orders` 及 H5 会话继续保留原身份契约，不能直接去掉校验，避免静默改变旧客户端行为。
- 建议为新模式新增明确的入口，例如 `POST /api/partner/v1/subscription-key-orders`；路径待技术收敛，不对商户要求任何 external_user_id 或先开户动作。
- 商户用 `Authorization: Bearer pt_...` 和 Idempotency-Key；首次新购请求的业务字段为 `{plan_id, payment_method}`。幂等键表示购买意图，不表示用户。
- 建议续费请求显式带原订阅 Key，以便确定续期对象并沿用 Key；这是当前待确认的产品关系，不得擅自按同商户+套餐推断买家或续费目标。
- 成功返回 order_no 和 checkout_url：可直接打开平台统一收银台付款；下单阶段不返回订阅 Key/Coding API Key，也不以商户自报 paid 标记交付。
- 可复用订单号、精确金额、快照、支付准备、cashier URL 和恢复基础设施；新旧订单模式、请求摘要与内部账户关联需显式区分，不能借旧 request hash 混用幂等。
- 初始新购及续费的具体数据模型，在当前产品问题确认后补齐，不能把订单号/随机外部 ID 包装成商户真实用户身份。

### 2.2 商户领取订阅 Key（新增）

候选路径：`GET /api/partner/v1/subscription-key-orders/:order_no/subscription-key`（与新下单命名统一后定稿）。

- 用当前 pt_ 鉴权并校验该订单属于此商户；不要求任何外部用户 ID，拒绝 query。
- 成功响应：`{order_no, subscription_id, subscription_key, key_version}`，不返回虚构的 external_user_id。
- 商户根据自己保存的订单号/购买意图决定如何交付，平台不推断买家身份；不得暴露可由任意客户端传订单号的通用查钥代理。
- 仅 `paid + fulfilled` 且该订单实际 SubscriptionId、账户归属、凭证绑定一致时返回。
- GET 为只读：不补发、不开户、不授予权益，不通过查询修复历史映射。
- 重复领取返回当前有效 Key；重置后从任一合法关联订单领取的都是重置后的当前 Key，不复活旧版本。
- 到期订阅仍可领取它的查询 Key以读取历史，但不能由此直接取得 Coding API Key。
- 历史已完成订单若不存在凭证绑定，返回明确 `subscription_key_not_found`，不在 GET 中补迁移。升级后新的付费续期可给同一订阅首次建立绑定。

### 2.3 独立订阅查询（新增）

`GET /api/partner/subscription`

- 仅接受 `Authorization: Bearer sub_<64位小写十六进制>`；**不要求商户密钥、商户 ID、商户登录或平台 Cookie**。请求不接受 query、目标用户、订单号或订阅 ID。
- 绑定由 Key 的当前哈希确定，不依赖客户端指定查询范围。
- 响应结构：

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

- 新 DTO 的全部 int64 额度为精确十进制字符串，覆盖完整非负 int64；不改变旧商户额度接口的数字契约。
- total/used 来源于绑定的订阅行；有效订阅先使用现有周期重置逻辑处理到期周期。remaining = max(total-used, 0)，无限额用 quota_unlimited 明示，不把零解释为耗尽。
- 只有该绑定订阅本身在当前有效期内、未取消，且账户/用户/现有模型 Token 均正常时可返回 api_key。同账户其他有效订阅不能替它放行。
- 活跃但已耗尽的订阅可返回其正常模型 Key，`quota_usable:false`；模型调用仍由现有计费边界拒绝，不提前承诺可消费。
- 自然到期时返回有效投影 `status:expired`，即使持久化状态尚未由后台更新；`api_key` 字段完全省略，`quota_remaining:"0"`、`quota_usable:false`。保留 total/used 和 `historical_quota_remaining`（当期历史的 max(total-used,0)），明确其不是可用额度。
- 已取消的有效绑定可返回终态信息但不返回 api_key或可用额度；账户、用户或商户禁用/删除、绑定损坏等仍 fail closed，不因可查历史而绕过禁用。
- 现有模型 Token 被禁用/删除/过期/错组时不创建或替换 Key，不把不可用凭证返回；错误按照既有 account_disabled / credential_unavailable 风格安全分类。
- 查询时只返回一份订阅，不返回账户标识、其他订阅、商户秘密、订阅 Key 本身或内部存储材料。

### 2.4 商户重置订阅 Key（新增）

`POST /api/partner/v1/subscriptions/:subscription_id/key/rotate`

- 当前 `pt_`、严格请求体 `{expected_version: 1}`，并要求现有格式的 `Idempotency-Key`。
- 只能操作当前商户下已由付费交付签发凭证的订阅；订阅 Key 本身无重置权限。
- 返回 `{subscription_id, subscription_key, key_version}`；不返回或更换 Coding API Key，不改变金额、有效期、当前额度或订单支付状态。
- 一次成功轮换原子替换当前种子/哈希并递增版本，提交后开始的新请求无法再用旧 Key 鉴权。与轮换并发且此前已完成授权的请求不能被追溯撤回，不能承诺撤回已发送响应。
- 同幂等键、同订阅和 expected_version 的重试不再轮换；若该操作的结果仍是当前版本，返回同一 Key。
- 旧幂等操作被后续轮换超越时返回 `subscription_key_changed`，不返回废弃 Key也不再次轮换；商户通过领取接口获取当前 Key。
- 新幂等键但 expected_version 过时返回 409，避免并发重置无声覆盖或失去响应后盲目多次换钥。

### 2.5 错误矩阵

| 条件 | 行为 |
| --- | --- |
| 商户凭证无效/已轮换/商户停用 | 401 invalid_partner_secret |
| 商户查询他人订单或重置他人订阅 | 404 order_not_found / subscription_not_found |
| 合法订单未 paid + fulfilled | 409 subscription_key_not_ready，不泄露 Key |
| 已交付历史订单无凭证绑定 | 404 subscription_key_not_found，无副作用 |
| 缺失/伪造/旧版/其他用途 Key 查询新接口 | 401 invalid_subscription_key，统一安全文案 |
| 格式、未知/重复/大小写别名字段、query 不合法 | 400 invalid_request |
| 重置参数同键冲突/版本落后 | 409 idempotency_conflict / subscription_key_changed |
| 用户/账户禁用、模型凭证不可用 | 403 account_disabled / 409 credential_unavailable；不泄露或补发 |
| 凭证派生根与持久化哈希不一致 | 503 subscription_key_unavailable，不自动换钥 |
| DB/严格时间读取失败 | 500 server_error，无敏感内部错误 |
| 限流 | 429 rate_limited 和 Retry-After |

错误码在实现期可依据现有统一错误处理器收敛命名，但不得改变以上行为或隐私边界；如行为改变需重新审阅。

## 3. 持久化与凭证材料

本节仅保留独立查询凭证的可复用草案；无身份新订单的模式、内部账户 namespace 和新增/扩展表仍待产品关系确认后补齐。不能把下面两张凭证表误当作本轮完整迁移设计已就绪。

### 3.1 每份订阅一个当前绑定

新增 `PartnerTenantSubscriptionAccessKey`（建议文件 `model/partner_tenant_subscription_key.go`），字段：

- Id / TenantId / AccountId / UserSubscriptionId；订阅 ID 唯一，Tenant/账户索引。
- IssuedOrderId：首次创建绑定的真实付费订单锚点，不以客户端字段建立归属。
- Seed：crypto/rand 生成的 32 字节随机数，规范小写 hex。
- KeyVersion：从 1 开始递增的 int64。
- SecretHash：当前完整 sub_ Bearer 的 SHA-256，唯一索引，按精确输入字节计算。
- CreatedAt / UpdatedAt。全部内部字段禁止 JSON 直接导出；控制器只能使用专门 DTO。

新增 `PartnerTenantSubscriptionKeyRotation` 存轮换幂等事实：TenantId + IdempotencyHash 唯一、RequestHash、UserSubscriptionId、ResultVersion、CreatedAt。它不保存旧明文 Key 或旧种子。请求摘要按明确用途包含订阅 ID 和 expected_version，与支付幂等独立命名空间。

两表均为增量 AutoMigrate，注册 `model/main.go`；不修改旧订单请求哈希/唯一约束，不重新开户或迁移已有完成交付数据。

### 3.2 可重复领取而不保存明文

采用仓库已有的 HMAC-SHA256 + 稳定 `common.CryptoSecret` 模式：

`sub_ + hex(HMAC-SHA256(CryptoSecret, purpose + tenant_id + account_id + subscription_id + seed + key_version))`

- purpose 固定为独立的版本化域（例如 `partner-tenant-subscription-key:v1\0`）；字段采用无歧义固定顺序编码，不能与 pc_/pl_/ps_ 复用。
- 数据库存 Seed + 当前 Bearer 哈希；单独拿到数据库没有服务端根秘密不能派生 Bearer。不会保存明文 Key，也无需引入与现有登录 RSA 加密不相容的通用加密层。
- 商户重复领取可稳定派生 Key，并验证其摘要等于当前 SecretHash；不在 GET 中修复不匹配。
- 查询先用哈希索引定位，再在实际事务中重新核对当前绑定及常量时间比较；不能只凭事务外查询的过期副本放行。
- 重置替换随机 Seed、递增版本并更新哈希；所有节点实时读 DB，不缓存 Bearer 或撤销状态。
- 必须与收银台同样配置稳定、跨副本一致的 SESSION_SECRET/CRYPTO_SECRET。部署根秘密变更会使原 Key 无法验证；恢复旧配置或由已鉴权商户显式重置，不静默生成替代凭证。MVP 不新增根秘密轮换/KMS 系统。

### 3.3 无外部用户身份的内部账户关系（当前待确认）

- 已撤回按 `(tenant_id, external_user_id)` 为新接入识别买家的方案；这一映射只是旧 API 的源码现状，不是新方式的要求。
- 推荐关系：每个首次新购订阅实例由平台自动维护独立内部模型账户和 Coding API Key；无须商户提供、保存或理解内部 UserId/TokenId。不同新购不因商户/套餐相同而合并。
- 推荐续费显式携带原订阅 Key，锁定其实际订阅并沿用内部账户、API Key、订阅 Key；不传续费目标则只能视为新购，不能猜测同一人。该建议须用户确认。
- 同一 Idempotency-Key 的原购买重试必须复用订单和其固定内部关联，不再创建一套账户；支付重复通知/恢复不能重复开户或授予权益。
- 新模式内部身份须有与旧 external_user_id 映射分离的身份来源/唯一约束；仅生成一个可被旧 /accounts 外部 ID 命中的字符串并不构成隔离。新表、模式字段或显式身份 namespace 的具体实现须在最终设计收敛，未在本轮选定。
- sub_ 绑定 Tenant/订阅及其内部账户，查询按持久化的 TokenId 读取当前 Key，不在每订单/订阅复制 API Key；读取必须校验 Token.UserId/状态/有效期/group 与绑定一致，坏映射拒绝，不自动补发。
- 当前项目实际将可恢复原值存于 tokens.key；本期不声称它已有哈希/加密存储。额度仍在 UserSubscription 上统一维护，TokenUnlimited 不表示无限权益。
- 续费延续的到期规则、API Key 生命周期及模型消费隔离，须基于最终确认的“内部账户 ↔ 订阅”关系证明；不再承诺同一商户用户的多份新购共享账户。不因 sub_ 重置而轮换已确认不变的 Coding API Key。

### 3.4 完全不新增 users 的可行候选（待选择）

完整源码证据与改造边界见 `research/userless-feasibility.md`。模型 API Key 直接绑定独立商户订阅实例，查询 sub_ 也指向此实例；不在 users、旧 UserSubscription 或普通用户 Token 中写一个 UserId=0 的替代记录，也不挂已有商户共享用户。

该方向需要独立主体存储和类型化请求上下文，适配模型鉴权、分组权限、订阅专用预扣/实际结算/退款、RPM 和消耗日志。普通用户分支保留；新主体不能调用 GetUserCache 或钱包分支，不能把新订阅 ID 当作 user_subscriptions.id 混用。

若正式采用，该方案将替换本草案中 AccountId/UserSubscriptionId、内部 User/Token 交付、现有 SubscriptionFunding 与用户限流/日志假设。下面第 4–6 节仅保留可复用安全约束，不能作为完整无用户实施设计。须重写正式契约和执行清单并经最终审阅。

## 4. 事务与数据流

### 4.1 支付交付

1. 原订单写入与网关准备不变；可信回调独立记录支付事实。
2. 在新模式的本地交付事务中，根据本次固定的新购内部关联或明确续费目标处理账户/Token 和订阅；不要拿 merchant external_user_id 作为前提。现有交付核心能复用的部分须按模式边界重构，不能直接调用旧公开开户 API。
3. 仅新模式的实际交付按 SubscriptionId get-or-create 订阅凭证绑定；已存在则核对商户、内部账户和订阅，不覆盖 Seed 或版本。
4. 凭证绑定和账户/模型 Key/订阅/fulfilled 标记一起提交。任一步失败均回滚本地交付，保留已提交支付事实并沿用恢复扫描。
5. 已 fulfilled 的旧订单重试保持原先早返回语义，不因缺少新凭证而重做权益或续费；历史补签不属于本期。
6. 同订阅续期复用绑定；自然到期后另一次新购若产生新订阅行则得到另一把 Key，不重绑旧 Key。

### 4.2 查询/领取/重置授权

- 事务外可以按 hash/order_no 预查用于定位，但该结果不是最终授权。
- 同一事务遵循现有锁偏序：Tenant →（需要时 Order）→ Plan → Account → User/Token → UserSubscription → SubscriptionAccessKey → RotationRecord。若某步骤不需要则跳过，不逆序加锁。
- 轮换接收请求体后，在真正写入事务的 Tenant 锁内重新核对当前开发者密钥哈希，防止慢请求绕过商户换钥/禁用。
- 订阅查询在锁内重新验证当前哈希及绑定，锁等待后用 `getDBTimestampOnStrict(tx)` 的新鲜时间判断有效期；PostgreSQL 使用 clock_timestamp，不能用事务开始 NOW 或请求到达时间。
- 用同一份锁定的订阅快照构造 total/used/remaining/status；活跃重置复用 `maybeResetUserSubscriptionWithPlanTx`。到期历史不触发新周期重置。
- 不调用会创建用户或凭证的公开 Provision API 来“读取” Coding Key；复用现有账户校验/TokenId 映射。
- 无外部网络操作处于 DB 事务内；API Key、派生输入、完整 Authorization 不写应用/审计日志。

## 5. 兼容性与安全

- 老 merchant create/status/quota/accounts DTO、托管 H5 DTO、cashier DTO 均不增加秘密字段。只有新领取和查询接口返回各自必要的凭证。
- 订阅凭证仅由新无身份接入的真实付费交付创建；旧 external_user_id API/H5 保留原行为，不自动给其未来订单签发新模式凭证。无免费直授或遗留订单暗中改绑。
- 订阅 `sub_` 不进入 `tokens` 表、不被普通 TokenAuth 识别；测试覆盖 /v1/models 及模型请求，错误在上游调用前发生。
- 新查询接口拒绝 pt_/pc_/pl_/ps_/sk- 和 Cookie-only 请求；新重置接口拒绝 sub_。不从 Query、x-api-key 等替代来源读取新凭证。
- 全接口 no-store/no-referrer；新查询独立于平台登录拦截器。沿用 request ID、IP 预算与基于当前凭证哈希的预算，不在限流/日志键里放原始 Key。复用现有限流基础设施，无新 Redis 依赖。
- 密钥轮换只阻止今后查询，不能撤回已复制的账户 API Key；同账户 Coding 使用仍可消费其其他合法订阅，这不属于查询隔离的承诺。
- 不改钱包、计费算法、套餐计价或 RPM 合并规则，不升级前端依赖，不做生产部署。

## 6. 验证与运维

- 主要风险：交付事务新增故障点、跨节点根秘密一致性、重置/领取/查询竞态、到期临界点、历史订单缺少绑定、新 DTO int64 精度。
- 按用户最新要求只做必要测试：真实 PostgreSQL 增量/重复迁移、持久化及关键锁并发；本次 Key 签发/领取/查询/续期/到期/轮换；相关交付失败与重复通知；单订阅隔离、敏感 DTO 与鉴权边界。合并覆盖，避免重复跑同一路径。
- 按用户最终指示只验证 PostgreSQL（pq），不运行 SQLite、MySQL/FoundRows 或完整旧订单矩阵；必要的接口 fixture 也建立在隔离 PostgreSQL 上。保留代码原有跨驱动兼容性，不删除其他驱动支持。
- 不跑全站、无关前端或计费套件。未执行无关全量测试及未验证其他数据库不作为本次新增验收阻塞，明确披露验证范围即可。
- 所有 Go runner 与 DB 测试均在本任务专属 Docker；不使用生产、宿主 DB 或已有未知数据。缺少 Docker 或本次必需的 PostgreSQL 时如实报告未验证，build/静态检查不能代替 runtime。
- 回滚应用时保留两张新表、所有订单及支付事实，不做 drop/backfill 回滚、不回收已交付权益。旧版本不能提供新查询能力，需告知新增接入方；恢复新版本和原 CryptoSecret 后凭证可继续工作。
- 不清理当前未跟踪私钥、reports、examples 或既有临时文档。新增非业务临时产物登记到 TEMPORARY_ARTIFACTS.md，需用户同意后清理；Trellis 规划/日志保留。相关 Trellis 文件按明确路径强制纳入 Git，不能整体强加被忽略目录。
