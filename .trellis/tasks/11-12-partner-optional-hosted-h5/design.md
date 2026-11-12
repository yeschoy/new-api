# 技术设计：可选、独立的商户套餐购买 H5

## 1. 决策与最小变更边界

产品选择为独立链接/新窗口/WebView，不支持 iframe。新页面负责“选套餐与支付方式”，下单后在同一窗口进入现有 `/partner/checkout`，继续使用已实现的二维码、渠道跳转、付款/交付进度与轮询，避免复制收银和交付逻辑。

新增一个“购买会话”资源，绑定商户可信用户并限制为一次购买。它不是平台登录，不签发模型 Key，不自动开户。商户使用新接口即选择 H5；继续使用旧接口即选择自建 UI，无需互斥模式字段或修改现有商户配置。

这是一项跨层交付：会话后端与 H5 前端必须联调才能验收，因此在同一任务分步执行，不拆分为可独立归档的父子任务。

## 2. 复用与现有事实

- `model/partner_tenant_order.go`：复用 `CreatePartnerTenantSubscriptionOrder`、`FindPartnerTenantOrderByIdempotency`、权威分币价格、限购/订单预算及已付款交付。不得另建订单/收款/权益状态机。
- `controller/partner_tenant_order.go`：复用 checkout 配置验证、支付准备 claim、订单 DTO、订单 URL 与错误映射。若抽取小型内部 helper，保持原商户路由绑定、校验顺序、精确重试及 HTTP 201/200 行为不变。
- `controller/partner_oauth_payment.go:partnerEpayMethods/partnerEpayMethodAvailable`：仅复用渠道列举/可用性谓词；不复用 OAuth 钱包资金语义、币种或整个 OAuth DTO。
- 旧商户目录仍原样返回其合同；新 H5 目录使用白名单 DTO，只列当前能够在 Tenant 付费链路购买的计划，拒绝跨租户、非 CNY、非法价格及不符合 Tenant 周期/分组等规则的计划。
- `web/src/features/partner-checkout`：原收银台页面与专用 fetch 保持原有合同。H5 成功下单后使用后端给出的同源、合法收银台链接进行同窗口跳转，不自动跳第三方网关、不另开异步弹窗。

## 3. 数据流

```text
商户已登录用户点击购买
  → 商户 BFF 从登录态取得 external_user_id，持久保存本次意图/幂等键
  → BFF 携 pt_ 创建 purchase-session
  ← session_id、purchase_url、固定有效期
  → 浏览器打开 purchase_url
  → Router/埋点前清除 fragment；一次性启动码兑换限权会话
  ← 本商户可售套餐、当前可用支付方式
  → 用户选择后提交 plan_id/payment_method
  → 服务器从会话补入 tenant/user，使用固定内部幂等身份调用原订单创建流程
  ← 原订单 checkout_url
  → 同窗口进入原收银台，原有 pc_ 能力生效
  → 渠道可信回调 → 原有持久已付款事实 → 原有后台交付
商户 BFF 使用 session_id 查到订单与交付状态，必要时调用既有账号/额度接口
```

## 4. 资源与持久化

新增 `PartnerTenantPurchaseSession`（独立表，只做加法迁移）：

- 内部主键；随机公开 `SessionId`（`PPS` + 32 位随机字母数字，全局唯一，精确大小写比较）。
- `TenantId`；`ExternalUserId` 和其 SHA-256 hash；`TenantSecretHash`（签发时的服务端摘要快照，JSON 不可见）。
- 商户会话创建的 `IdempotencyHash`、`RequestHash`，唯一 `(tenant_id, idempotency_hash)`。
- `CreatedAt`、`LaunchExpiresAt`、`ExpiresAt`；`RedeemedAt`、可空 `ClientNonceHash`。
- 类型使用现有 bigint、varchar/char/text 等兼容声明，注册到实际迁移列表。无大型 varchar/JSON 误声明，不触碰或删除既有订单/账号数据。

不在会话表复制付款/交付状态。由公开随机 session ID 计算带用途前缀的内部订单幂等摘要：

```text
SHA256("partner-tenant-h5-order:v1\0" + session_id)
```

该输入不在商户可提交的 16–64 位 URL-safe 幂等键集合内，不与商户原始幂等键域混用。以 `(tenant_id, order_idempotency_hash)` 查询会话对应的唯一订单，避免“订单已提交但 session.order_id 尚未更新”的双写窗口。

每个会话最多一笔订单：首次成功创建后冻结 plan/method/buyer，其他参数返回既有 `idempotency_conflict`；网络/网关准备失败重试恢复原订单。已有 pending 订单的显式“继续/重试”必须用其服务端 plan/method 重放原 POST 完成支付准备，再进入收银台；不能把只有订单号但未准备成功的订单直接交给只读收银台。新的购买由商户生成新意图/新会话；不在 H5 内提供隐式重买按钮。

## 5. 能力与有效期

### 5.1 启动与会话

- URL 形态：`https://<configured-callback-origin>/partner/purchase?session_id=PPS...#launch=pl_<64hex>`。
- 启动码用 `common.CryptoSecret` 做用途隔离的 HMAC，绑定 session ID、固定启动截止时间、签发时的商户 secret hash。原始商户 secret 不保存、不拼接到 URL。
- 启动码最多 5 分钟可兑换；购买会话从创建时起最多 30 分钟有效，不因 POST 重试、兑换、刷新或切换套餐延长。
- 浏览器首次兑换前生成 32 随机字节、编码为 64 位 lowercase hex 的 `client_nonce`，并以 session ID 隔离暂存。兑换在事务中原子写入 nonce hash/兑换时间：相同 launch + 相同 nonce 可幂等恢复；不同 nonce/不同浏览器重放拒绝，防止兑换回复丢失导致无法安全重试。
- 兑换成功返回用途不同的 `ps_<64hex>` 能力，绑定 session ID、nonce hash、固定到期时间及商户 secret hash。只存当前标签页、会话隔离的 sessionStorage（不可用时内存回退），不进 localStorage、全局 Query 缓存或 auth store。成功后清除暂存启动码/nonce。
- 每个公开请求均验证会话、HMAC、固定期限、商户仍启用及 secret hash 快照。下单还必须在同一个订单事务取得 tenant 锁后重新读取/验证绑定会话、nonce、当前 secret 和新鲜时钟，覆盖请求 body 延迟及锁等待期间过期/撤销；H5 的 prior-order 快路径不能绕过该检查。禁用或轮换商户凭证后新的会话请求拒绝；已完成的支付事实和原收银台合同不因此回滚。
- 限制新会话预算（优先沿用现有 Tenant 2000/小时、买家 20/小时的保守上限），精确创建重试不消耗新预算；已有订单预算继续生效。独立路由还使用现有请求限流中间件。

### 5.2 两个不同期限

H5 会话期限只控制选购和新订单创建。订单仍使用原来的创建后 30 分钟截止时间；从 H5 同窗口进入原收银台后，订单能力按订单期限生效，不被较早的 H5 会话截止打断。任何浏览器过期都不是网关关单或未付款证明。商户后端凭 pt_ 可在会话过期后查到已绑定订单和交付状态。

## 6. 接口合同（新增，原合同不变）

所有成功响应为 plain JSON；错误沿用 `{error:{code,message},request_id}`；no-store，无宽松 CORS。身份敏感字段只允许商户接口返回。

### 6.1 商户接口：创建入口

`POST /api/partner/v1/purchase-sessions`

- Bearer pt_；`Idempotency-Key` 使用现有 16–64 URL-safe 验证。
- 严格 JSON body：`{external_user_id}`，只允许商户后端由登录态提供。
- 首次 201、同租户同键同买家 200；同键换买家 409。
- 输出：`{session_id,external_user_id,created_at,launch_expires_at,expires_at,purchase_url}`。
- 精确重放返回原 session/URL/期限，不自动续期；已兑换链接不会允许新窗口再次兑换。过期或已使用时商户先查单，再决定是否重新发起，不得盲目制造第二次购买。
- 使用与原 checkout URL 同级的可信 HTTPS callback-origin 校验，不接受客户端提供 origin/价格/任意回跳 URL。

### 6.2 商户接口：跟踪购买

`GET /api/partner/v1/purchase-sessions/:session_id`

- pt_ 商户隔离，未知/外商户 404；禁止额外 query。
- 输出：`{session_id,external_user_id,created_at,launch_expires_at,expires_at,redeemed,order}`；无订单时 `order:null`。
- `order` 使用既有商户订单状态 DTO，不含 checkout_url、二维码、付款链接或模型 Key。
- 过期会话仍可由商户鉴权读取用于对账；BFF 必须核对 `external_user_id` 属于当前登录用户。商户知道该资源 ID，因此无需前端回跳/postMessage 才能发现 H5 新订单。

### 6.3 公开接口：兑换

`POST /api/partner/purchase-sessions/:session_id/exchange`

- 严格、有限长度 JSON `{launch_code,client_nonce}`；launch/nonce 格式、session ID、过期和兑换状态统一校验。
- 输出：`{session_id,expires_at,access_token}`。令牌只在此能力交换 DTO 返回，不附在日志、错误或 Query 中。
- 初次兑换、同 nonce 的安全重试为 200；无效/重放/撤销/过期统一安全错误，不泄露用户或商户是否存在。

### 6.4 公开接口：页面数据

`GET /api/partner/purchase-sessions/:session_id`

- `Authorization: Bearer ps_...`；禁止 URL token/query；无 cookie 依赖。
- 输出：`{session_id,expires_at,merchant_name,plans,payment_methods,order}`。
- `plans` 白名单字段：`id,title,subtitle,amount,currency,duration_unit,duration_value,total_amount,quota_unlimited,requests_per_minute`。价格使用精确两位十进制字符串；新 H5 的 `total_amount` 使用 canonical 非负十进制字符串（0–9223372036854775807），避免现有 int64 值超过 JS safe integer 后损坏整个目录，`quota_unlimited` 与字符串 `"0"` 一致。旧商户 DTO 不变。内部额度不得误标为 Token 或按付款汇率换算；有限额度用 BigInt/字符串精确展示并明确单位，不读取平台全局状态补充上下文。
- 只列该商户当前 checkout 合法的 CNY 计划，排序复用现有目录规则；无可购套餐或无可用渠道时显示诚实空态，不用示例渠道兜底。展示名/副标题纯文本渲染。
- `payment_methods` 是当前 Epay 可用的 `{id,name}` 子集，不暴露支付配置。
- `order` 无订单为 null；已有订单精确返回 `{order_no,plan_id,payment_method,payment_status,fulfillment_status,expires_at,checkout_url?}`，仅在原订单能力未过期时附 `checkout_url`。不能传任意 order_no 查其他订单，不返回买家、模型 Key、二维码或原始网关链接。H5 对已有订单展示“继续付款/查看订单”操作，不重新展示可提交的新购买表单。

### 6.5 公开接口：一次购买

`POST /api/partner/purchase-sessions/:session_id/orders`

- ps_；严格 JSON 只含 `{plan_id,payment_method}`，不接受 tenant/user/金额/paid 等额外字段。
- 从服务端会话补入身份和固定内部幂等摘要。首次 201，精确重试 200；返回 `{order_no,checkout_url}`。
- 原订单准备/网关失败保留可恢复状态；已有订单重放保留原金额、订单号与截止时间。先精确查找原订单再进行新支付可用性判断，保持旧合同的重要重试特性。
- H5 校验响应 schema、订单格式及同源 canonical `/partner/checkout` 链接，随后同窗口跳转。不得把 ps_ 当 pc_、不得向第三方付款网址附带会话。

## 7. 前端与 HTML 隔离

新增 `web/src/features/partner-purchase/` 与 `/partner/purchase` 路由。组件使用现有 Base UI/shadcn Card、Button、RadioGroup 等，键盘可用、长文案换行，选择状态单一来源；请求串行/可取消，禁止用 effect 自动下单，提交后禁重复操作。

在 `web/index.html`、`main.tsx`、根路由和访问 helper 增加统一“partner public purchase surface”分类，分别保留 purchase/checkout 的特定凭证逻辑。不把所有 `/partner/*` 一概当作免认证页。

- 与 Go 的一次 URL-path 解码语义一致；覆盖编码分隔符、trailing slash、双重编码、malformed 和 lookalike 负例。
- HTML 最早阶段装载 CSP/no-referrer，禁止第三方分析；fragment 在 createRouter 之前清除并仅进入本会话私有暂存。
- 跳过通用 auth/setup、系统状态、品牌/奖励、devtools、全局缓存初始化；普通页保持原样。
- Go 为新 HTML canonical/别名路径设置 no-store/no-referrer、X-Frame-Options DENY、frame-ancestors none；保留旧 cashier canonicalization 和 privacy headers。
- `web/scripts/vercel-config.mjs` 是实际静态部署配置生成器，不存在 `web/vercel.json`。如为新/旧敏感页补齐 header，使用该共享生成器并运行现有 deployment 测试，勿新建无效配置文件。API 同源 rewrite 保持原有约束。
- 独立 fetch 使用 credentials omit、cache no-store、referrerPolicy no-referrer、redirect error；严格 Zod DTO。不要使用平台 axios/auth 拦截器，不把上游原始响应挂进异常。
- 新可见文案及错误/空态覆盖 en/zh/zh-TW/fr/ja/ru/vi，只通过 i18n skill 规定的脚本写 locale，并做最终 sync。

## 8. 兼容、迁移与回滚

- 只加购买会话表及新路由；原路由、JSON 字段、订单签名、支付回调/交付与资金选择不变。
- 若为复用提取 controller helper，必须运行旧商户接口 HTTP、重复请求和渠道关闭后的精确 replay 回归，不能为了复用改变旧 API 的拒绝顺序或错误码。
- 不修改现有商户记录以“启用 H5”，不要求商户迁移。平台可以停止发放新 H5 入口而继续处理既有订单与支付通知。
- 回滚页面/新增入口不删购买会话、订单、付款证据、账号、Key 或套餐。到期会话失效即可，清理/保留策略另行评审，当前无自动删除历史数据。
- 不新增依赖；包管理安装产物/日志不进入提交。相关被忽略的 Trellis 任务/spec 文档需在最终提交时显式精确加入，不能 force-add 整个 `.trellis/` 或运行时日志。

## 9. 主要风险与验证

1. 一次性兑换并发/丢回复：相同 nonce 恢复、不同 nonce 拒绝、事务原子性、跨副本/重启稳定签名。
2. 一会话多订单：固定目的隔离幂等摘要、并发不同 plan 冲突、失败重试查找相同订单；不使用双写关联指针。
3. 凭证泄露/免登录边界：测试执行真实早期 HTML 与入口控制流，不 mock 掉核心 path predicate。
4. 购买权限范围：修改 tenant/user/plan/order、跨商户 session、混用 pl_/ps_/pc_、已禁用或轮换 secret 均应拒绝。
5. 旧 API/普通页面退化：覆盖原登录、普通目录/钱包、旧收银台、PartnerServer/OAuth 独立语义。
6. 数据库验证：遵守现有所有 Go 测试在 task-owned Docker 运行的约束，新增迁移以 PostgreSQL 为部署验收目标，保留 SQLite/MySQL 支持与既有 Tenant 矩阵。当前 daemon 不可连接，不得将计划的测试当作已经通过。

## 10. 实施批准

用户在包含目标、范围、验收、风险及三份规划文件的最终摘要后明确回复“开始”，已批准本设计。按流程验证上下文并 start 后实施；生产部署、推送、真实付费/开户及清理仍不在授权范围内。
