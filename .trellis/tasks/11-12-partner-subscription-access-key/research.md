# 仓库取证：订阅 Key 接入

## 取证范围与结论

本记录仅描述当前分支源码与规范，不表示接口已上线或支付/数据库运行验证已通过。本轮只进行规划，未修改业务代码、未访问生产、未读取未跟踪私钥、未创建测试数据库或临时构建产物。

**最新纠正优先：用户明确新方式下单不传 external_user_id。下文旧源码中的账户映射只能作为兼容性取证，不是新方式的用户身份前提；上一版据此要求商户稳定用户 ID 的设计已撤回。**

### 1. 现有开发者密钥与下单能力可复用

- `router/partner_tenant.go:9`：`/api/partner/v1` 已挂载商户鉴权；包含套餐、账户、订阅订单、额度与可选 H5 接口。
- `middleware/partner_tenant.go:15`：商户使用 Authorization Bearer 密钥，经哈希查找启用 Tenant；不接受 URL 中的商户凭证；有请求与商户限流。
- `model/partner_tenant.go:137` 附近：商户密钥采用 `pt_` 前缀，仅持久化哈希。新需求中的“开发者密钥”可以复用现有商户密钥，不需要另建第二套商户鉴权系统；最终方案需明确命名。
- `controller/partner_tenant_order.go:160`：订单创建已有 `{external_user_id, plan_id, payment_method}` 与 Idempotency-Key；不接受客户端价格或已支付声明。

### 2. 现有支付与交付边界

- `model/partner_tenant_order.go:31`：专用付费订单保存支付与交付两个状态，以及实际交付后的 `SubscriptionId`。
- `model/partner_tenant_order.go:361`：可信支付成功后，在 Tenant → 订单 → 账户等锁边界内开通账户、生成/复用模型 Token、授予订阅并记录交付完成。重复已交付订单不重复开通。
- 支付事实独立提交，交付失败保留 paid 并可由后台恢复。新增订阅 Key 的签发必须纳入现有本地原子交付，不能靠浏览器回跳创建。
- `controller/partner_tenant_order.go:250`：商户查单 DTO 当前没有 API Key 或订阅 Key。
- `controller/partner_tenant_order.go:279`：公众收银台 pc_ capability 当前是短期、订单级、只读安全 DTO；不得无意将它扩权成长期查询 Coding API Key 的凭证。

### 3. 关键产品边界：订阅 Key 的绑定粒度

- `model/partner_tenant.go:45`：现有 `PartnerTenantAccount` 按商户与 external_user_id 映射一个 UserId 和一个 TokenId；API Key 是账户级凭证，不是每份订阅一把。
- `model/partner_tenant.go:255`：重复开户校验并返回原模型 API Key；禁用、删除、过期或错组的映射不自动换新。
- `model/partner_tenant.go:392`：同用户同套餐有效期内购买通常续费同一订阅；不同套餐可形成多份订阅。
- `controller/partner_tenant.go:162`、`model/subscription.go:908`：现有商户额度查询返回该用户的所有有效、当前商户所属订阅；按订阅行计算额度并执行到期周期重置，不是钱包余额或 Token 的额度字段。
- 用户同意创建任务前已接受的范围是“只能访问它所关联的订阅，不能查询其他订阅”；因此新增查询凭证不应仅为方便复用旧额度接口而扩大为同一账户全部订阅。该区别属于实现需保护的边界，不重新当作用户未回答的问题。
- 查询 Key 限定一份订阅，但返回现有账户 API Key 时，不能宣称 Coding 消费已经严格绑定该单份订阅；若要求消费级隔离，需要另行确认 scope 并设计账户/计费边界。

### 4. 数据与兼容性约束

- `.trellis/spec/backend/partner-tenant-checkout.md`：原商户订单和托管收银台接口需保持兼容；支付验证、精确 CNY 金额、幂等、账户禁用 fail-closed、订阅专用扣费不得退化。
- `.trellis/spec/backend/partner-hosted-h5.md`：可选托管 H5 与商户自建购买页并存；pl_/ps_/pc_ 用途分离，不能混用新长期订阅凭证。
- 新查询接口需使用独立订阅 Key，密钥只在 Authorization，配置 no-store，返回额度需避免新客户端丢失 int64 精度。
- 旧 API 的外部用户 ID 来源是商户可信登录状态。用户最新已明确新方式不提供该 ID，因此保留旧契约而另行设计新购内部关联；不要求商户伪造 ID，也不擅自按商户/套餐聚合。

### 5. 新增范围：商户可订阅套餐配置

- 用户提出“并且这里我需要为商户可以配置可订阅的套餐”，随后选择 A（商户专属套餐）；已纳入 R11/AC12，一份套餐仅归属一个商户、每商户可有多份。需在新版摘要审阅后实施，不能把旧摘要或单项选择当作新范围批准。
- `web/src/features/subscriptions/components/subscriptions-mutate-drawer.tsx:355`：root 创建套餐已有“Partner tenant”选择，单选商户；编辑已有套餐时禁用归属选择。
- `controller/subscription.go:150`：商户套餐仅 root 可配置，要求启用商户；按商户独立模型分组、月度周期和不回退钱包规范化。`:319` 拒绝修改现有套餐所属商户。
- `controller/partner_tenant.go:223`：目录查询仅 enabled 且 partner_tenant_id=当前商户；`model/partner_tenant_order.go:113`：真实下单及交付校验严格要求单一归属与专属 group。
- `web/src/features/partner-tenants/index.tsx`：现有商户管理页面提供创建、状态与密钥轮换，没有单独的“多选可订阅套餐”配置。
- 用户已选最小复用方案：平台 root 在既有套餐管理创建时选择商户，配置该商户多份专属套餐并启停；目录和下单继续按该归属严格过滤。多商户共享授权不在本期，不新增映射表或重复的后台页面。

### 6. 下单返回付款 URL 与账户凭证维护澄清

- 用户明确“商户使用开发者下单返回的也是付款url”。现有 `controller/partner_tenant_order.go:231` 的 respondPartnerTenantCreatedOrder 在成功响应填写 checkout_url，可直接打开平台收银台付款；无需新增直接网关 URL 字段，也不在初始下单交付任何长期 Key。
- 用户询问“既然是账户级的api key凭证，你是如何维护的”。现有 `model/partner_tenant.go:45` 的映射是 `(tenant_id, external_user_id) → UserId/TokenId`，不是一商户共用一 Key。`:255` 创建或复用对应模型子账户及 Token，`:349` 校验现有凭证，禁止坏映射自动补发。
- `model/token.go` 的 Token.Key 保存可恢复原值；本期不声称它已是哈希/加密存储，也不把新 sub_ 的安全模型当成旧 Token 的变化。
- `model/subscription.go:1422` 附近原计费从同一用户的有效适用订阅中选择；因此查询按订阅隔离，不等于 Coding 消费按订阅隔离。到期不返回 api_key 不会撤回已取得 Key，也不能通过作废整个账户 Token 来模拟单份订阅到期，否则误伤其他有效权益。
- 上一版 design.md 3.3 据旧映射解释账户级 Token 的方案已被用户纠正：商户新下单不传 external_user_id。原解释不再作为新方式的身份设计；单一 Token 数据源和安全校验可保留，内部账户粒度须重新确认。

### 7. 新方式不传 external_user_id（当前重规划依据）

- 用户原话：“不是，商户下单时不会传external_user_id这个”。已记为 R12/AC13，明确撤回此前助手自加的身份前提，不能以旧代码必须该字段为由反向要求用户迁就。
- `model/partner_tenant_order.go:119` 的旧输入及 validPartnerTenantOrderInput、原 controller 下单处理确实需要 external_user_id；所以“只复用原下单路由不改语义”不满足最新要求。旧 API/H5 留原行为，新方式应新增明确的无身份入口/模式。
- 没有买家身份时，无法从同商户/同 plan_id 判断不同订单是否为同一人，也不能据此决定续哪份订阅；Idempotency-Key 只确定一个购买意图，不能当作用户 ID。
- 前一候选（未获同意）：首次新购订阅实例自动建立内部 User/Token/订阅及 sub_；用户随后追问能否完全不新增 users，不能再将自动开户当成默认。显式续费定位仍待收敛。
- 技术上不能仅给新身份一个可被旧 /accounts 外部 ID 命中的字符串就称隔离；需要来源/namespace 或独立映射唯一约束，最终 schema 与交付模式须在后续设计收敛。

### 8. 完全不新增 users 的可行性（已评估、本期未选）

- 用户询问“可以做到不往users新增用户吗”。源码级评估结论：可以，但需要独立订阅调用主体，不是删除 Create(User) 即可，也不是挂用户 0/负数或商户共享用户。
- 详见本任务 `research/userless-feasibility.md`：模型 Token/UserSubscription、TokenAuth 的 GetUserCache、NewBillingSession 的 UserId>0、RPM 以用户 ID 计数和用量/日志归属均有实际用户依赖。
- 建议的纯订阅关系为：商户 → 付费订单 → 独立订阅实例 → 查询 Key 与 Coding API Key；额度/分组/限流/日志直接按订阅主体维护，普通用户路径保留。
- 后续用户已因改造范围选择自动新增内部 User，因此该无 users 方案不进入实施或测试；保留原研究证据，不删除 Trellis 记录。

### 9. 已选择内部 User，创建时点待澄清

- 用户原话：“修改比较大那就新增吧，但是得下单成功才新增users”。已明确允许新增真实内部 User，仍不要求商户提供 external_user_id。
- “下单成功”存在订单创建成功/付款确认成功两个时点，不能由助手擅自选择。建议可信支付后原子开户，避免未付订单制造 users；用户若选择返回付款 URL 就开户，则需相应定义失败和未付账户语义。
- `model/partner_tenant_order.go:375` 先检查 paid 再调用内部开户 helper，证明现有实现支持付款后开户；该证据不是用户已选择时点。
- 当前首要问题为开户时点，续费原订阅定位随后收敛。尚未获得最终实施批准，未改业务代码。

## 产品决策与后续问题

- **已确认：商户交付（A）**。用户选择由商户后端使用开发者密钥，在支付和交付均完成后领取订阅 Key，再交给已校验身份的买家。公共收银台不展示或返回长期凭证，pc_ 权限保持不变。
- **已确认：同一订阅续费沿用原订阅 Key**。用户答复“要”，确认原 Key 持续查询同一订阅更新后的有效期和额度；不代表跨订阅合并或自动关联到期后新建的另一份订阅。
- **已确认：到期后保留查询，不返回 Coding API Key**。用户答复“可以”，确认保留该订阅信息、到期状态及历史额度统计，不把历史剩余额度表述为当前可消费权益；不允许借同账户其他有效订阅继续取钥。
- **已确认：本期提供订阅 Key 重置接口**。用户答复“好”，确认仅商户后端可调用，新 Key 替代旧 Key，旧 Key 随事务提交失效；不轮换 Coding API Key，不声称可收回此前已泄露的 Coding API Key。现有 `controller/partner_tenant.go:83`、`model/partner_tenant.go:169` 仅重置商户开发者密钥，不能替代本功能。
- **再次明确：用户查询不需要商户密钥**。用户强调订阅 Key 可独立获取信息；查询只接受 sub_，不要求 pt_、商户 ID、商户登录态或平台 Cookie。商户密钥仅用于下单/领取/重置等商户端动作，这与原设计一致，文档需突出。
- **已确认：套餐配置采用 A，商户专属套餐**。现有创建/编辑入口与单归属约束可复用；通过本期 pq 定向测试和接入说明保证配置 → 目录 → 下单权限链路，不增加共享套餐系统或无关前端改动。
- **已确认：新下单不传 external_user_id 或其他终端用户身份**。商户按其订单/购买意图领取和交付，用户依然只凭订阅 Key 查询。
- **已确认：允许自动新增真实内部 User**，放弃本期无 users 大改；商户不传外部用户 ID 的约束不变。
- **当前首要决策：何谓“下单成功后”开户**。建议付款渠道可信确认成功后，不在只生成付款 URL 时建用户；需用户明确 A/B 后再落实精确事务与验收。续费目标定位仍待收敛。

## 验证与资源约束

用户新增要求：“写完之后只做有必要的测试，不需要做过多无关的测试”；随后明确“不需要验证sqllite，只需要验证pq”。最终范围：仅本次凭证生命周期、鉴权/精度/泄露边界、直接受影响的支付交付和 PostgreSQL 迁移/关键并发，不全站扫测、不运行 SQLite/MySQL/FoundRows 或多引擎矩阵。原有跨驱动代码支持保留。

`controller/partner_tenant_order_test.go:22` 的 setup 调用旧 OAuth payment setup，原有相关测试可能隐式使用 SQLite；必要新接口/交付断言须改用任务自有 pq fixture，不靠执行旧测试引入另一个数据库。

仍沿用安全运行约束：Go runner 和 PostgreSQL 在本任务专属 Docker 执行，必需 PostgreSQL 不可用时明确报告，不能拿编译冒充运行验证。当前尚未执行业务测试，也未为本任务产生无关临时产物。

现有 `docs/partner-tenant-integration.zh-CN.md` 修改及未跟踪 examples/reports/私钥/临时文档均为任务开始前状态，不覆盖、不删除、不将私钥纳入提交。后续新增非业务临时产物应登记到项目现有 `TEMPORARY_ARTIFACTS.md`，清理需用户同意，Trellis 日志保留。
