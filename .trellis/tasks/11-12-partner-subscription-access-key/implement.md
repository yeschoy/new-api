# 执行计划：订阅 Key 接入

## 1. 阶段门禁

- [x] 用户允许创建任务，完成现有鉴权、付费订单、交付与额度取证。
- [x] 用户确认：商户交付、同订阅续费沿用 Key、到期可查历史但不取 Coding Key、本期有商户重置接口。
- [x] 用户选择 A（商户专属套餐），重新收敛 PRD 并保留 R1–R11、来源锚点与 AC1–AC12，无阻塞产品问题。
- [x] 设计与执行计划已更新为复用现有后台套餐管理/单商户归属，不新增共享授权表或前端页面；后端清单 7 条、check 5 条，补充套餐配置与独立鉴权检查重点。
- [x] 用户补充测试约束：“写完之后只做有必要的测试，不需要做过多无关的测试”；最终指定“不需要验证sqllite，只需要验证pq”。仅必要 PostgreSQL 验证，不运行 SQLite、MySQL/FoundRows 或无关全量套件。
- [ ] 向用户呈现最新最终摘要，并等待其后明确批准；之前不 start、不改业务代码、不派实施子代理。
- [ ] 批准后读取执行阶段指引及 trellis-before-dev；执行 `task.py start`，状态变为 in_progress 后才能实施。

只有一个端到端任务，不创建独立订单/查询两套实现或父子树。未来如按项目流程委派，先取 `task.py current`，所有子代理提示第一行必须是 `Active task: <实际任务路径>`；没有适用授权不自行启动额外并行代理。同 cwd 同时只有一个写入者。

## 2. 最小实现顺序

### 2.1 前置检查

- [ ] 复查 git status、当前用户文档差异、既有规范，不覆盖 `docs/partner-tenant-integration.zh-CN.md` 既有修改。
- [ ] 查找新的 Symbol/路由/Key 前缀与所有调用 paid fulfillment 的测试 fixture，确认没有同名冲突。
- [ ] 检查 Docker 是否可用；优先保证本次必需的 PostgreSQL 迁移与核心路径验证，记录缺失，不因阻塞改用宿主或生产 DB。
- [ ] 预先登记后续专属容器、网络、测试输出等非业务临时产物到 TEMPORARY_ARTIFACTS.md；不新建另一套临时登记文档。

### 2.2 模型、凭证与迁移

- [ ] 复用已有 root 套餐创建/编辑入口、PartnerTenantId 单归属、目录过滤及下单校验；不新建多对多授权表或重复 UI。文档写清如何为每商户配置多份专属套餐。
- [ ] 用同一组 pq fixture 验证 root 配置 → 商户目录 → 正常下单及跨商户/平台/停用套餐拒绝，命名带 SubscriptionKey，合并进本次定向执行。
- [ ] 新增每份实际 UserSubscription 的当前凭证绑定与轮换幂等记录，内部字段不直接 JSON 导出。
- [ ] 注册增量迁移，保留全部旧订单、账户、模型 Token 及权益；不对历史已 fulfilled 订单补写秘密或重新交付。
- [ ] 在 model 层实现用途分离 HMAC 派生、当前哈希索引、严格格式及常量时间校验；不把 sub_ 写入 tokens 表。
- [ ] 从原交付事务 get-or-create 绑定，首次签发和账户/订阅/fulfilled 原子提交；已有绑定不覆盖，续期保持当前 Seed 和版本。
- [ ] 更新所有相关 paid fulfillment fixture 的 AutoMigrate 集合，包括旧 controller/router 测试，避免缺表使兼容测试误失败。
- [ ] 增加基于 PostgreSQL 的自包含模型/接口 fixture，验证未支付无凭证、首次交付、重复回调/恢复、续费稳定、失败原子性及现有用户凭证不替换；不复用会隐式初始化 SQLite 的旧 setup helper。

### 2.3 读取、额度与轮换

- [ ] 实现只读商户领取；校验订单 paid + fulfilled、实际订阅和账户归属；不调用 Provision 来实现读取。
- [ ] 实现单订阅专用查询，**只要求 sub_，不要求 pt_、商户 ID 或 Cookie**；hash 预定位后在实际事务重新校验当前绑定、账户、商户状态，锁后严格时钟判断到期。
- [ ] 活跃订阅按原周期重置，构造精确十进制额度 DTO；无限额、耗尽、到期、取消、其他份有效订阅的边界按 design.md。
- [ ] 到期不输出 api_key；可用 remaining=0、quota_usable=false，保留明确命名的历史 remaining 与 total/used。
- [ ] 实现商户轮换 expected_version + Idempotency-Key 原子更新；同操作重试不再轮换，被后来轮换超越时安全冲突；不复活旧 Key。
- [ ] 新商户敏感操作在真实事务锁内重新核对开发者密钥，防慢 body 或锁等待绕过轮换/禁用。
- [ ] 不新增长期秘密缓存或自动替换坏映射的逻辑；根秘密与持久化哈希不匹配必须 fail closed。

### 2.4 HTTP 与安全边界

- [ ] 新增商户领取 `/api/partner/v1/subscription-orders/:order_no/subscription-key`。
- [ ] 新增商户重置 `/api/partner/v1/subscriptions/:subscription_id/key/rotate`。
- [ ] 新增独立 `/api/partner/subscription` GET，只认 sub_，无可指定目标的 query/body/path。
- [ ] 严格请求上限、未知/重复/大小写别名字段、尾随 JSON 与 query 拒绝；新敏感接口 no-store/no-referrer、统一请求 ID、错误与限流。
- [ ] 旧下单、查单、账户、额度、H5、cashier 响应不新增秘密字段；不改变旧请求哈希或强制新模式。
- [ ] 路由回归覆盖 sub_ 不能用于 Coding、其他用途 Key 不能查询、sub_ 不能重置、跨商户不泄露、没有平台登录依赖。

### 2.5 文档、规范与检查

- [ ] 更新中英文接入文档，明确三类密钥、商户领取、查询样例、到期与续费、轮换重试、精确额度、历史未补签行为及泄露风险。
- [ ] 按 trellis-update-spec 更新后端专用规范或原 checkout 规范/index，记录真实实现合同，不改与本任务无关规范。
- [ ] R11 采用现有后台“套餐管理 → 创建时选择所属商户 → 设置价格/额度/RPM与启停”；本期默认无前端修改。若取证发现必须改 UI，先加载 frontend/shadcn/i18n 指南，涉及新产品行为则返回审阅，不扩跑无关套件。
- [ ] 按 trellis-check 对本次 AC1–AC12 做定向核对，不运行无关测试；将实际命令、版本、通过/失败/未运行项写入任务内 verification.md。
- [ ] 只提交本任务代码/文档和相关 Trellis 文件（忽略目录需按明确文件 force add），绝不 `git add .` 或强加整个 .trellis/。
- [ ] 不 push、不部署；按阶段完成情况汇报，运行验证缺失时不归档为完整验收。

## 3. 文件边界与复用点

- 新增主文件：`model/partner_tenant_subscription_key.go` 与测试、`controller/partner_tenant_subscription_key.go` 与测试；新 middleware 仅在职责明确且不能复用现有 Bearer 提取逻辑时增加。
- 最小修改：`model/main.go` 迁移、`model/partner_tenant_order.go` 原子交付、`router/partner_tenant.go` 注册；对应测试 fixture。
- 复用：`model/partner_tenant.go` 的账户 TokenId 校验、`model/subscription.go` 的周期重置、`model/db_time.go` 严格时钟、现有 request ID/no-store/rate limit/幂等键校验及 API 错误结构。
- 默认不改普通模型 TokenAuth、支付通道、billing session 或前端页面；需要新回归可在 router/已有模型测试层做，不用改生产计费路径。
- 风险最高：fulfillment 原子边界、新表注册遗漏、锁序、过期时间判断、轮换重试与当前版本重核，以及任何把内部结构直接 JSON 化的写法。

## 4. 验证命令与运行环境

规划阶段只验证文档与上下文；以下代码测试仅在获得实施批准后执行。数据库只验证 PostgreSQL，Go runner 和数据库在任务专属容器内运行；不在宿主运行 go test，也不运行 SQLite/MySQL fixture。

### 4.1 静态检查（不代替 runtime）

```bash
python3 ./.trellis/scripts/task.py validate .trellis/tasks/11-12-partner-subscription-access-key
git diff --check
# 实施后对实际修改的 Go 文件执行 gofmt；纯构建允许本地执行：
go build ./model ./controller ./router
```

若本地 build 产生缓存/输出，明确位置并登记非业务临时产物；不把 npm/pnpm 缓存和诊断文件纳入 Git，当前 .gitignore 已包含相关规则。

### 4.2 容器测试

先创建并登记本任务独占的 Go runner 和隔离 PostgreSQL（需要互通时才建专属网络）。使用假密钥、mock TLS 支付服务，不使用生产 DSN/外部真实支付。容器工作目录统一设为仓库挂载根；以下变量只能指向本任务资源：

```bash
docker info
# 一次定向执行：新增必要用例统一带 SubscriptionKey，并使用 PostgreSQL。
# 包含自包含的 TestPartnerTenantSubscriptionKeyPostgres，以及相关交付回归；
# 不直接调用依赖 SQLite 的旧用例。以实际命名收敛，不重复跑同一套件。
docker exec "$TASK_GO_RUNNER" go test ./model ./controller ./router -run '^TestPartnerTenant.*SubscriptionKey.*$' -count=1 -v
```

- PostgreSQL 用例使用专门测试 DSN，只指向本任务的空数据库；若复用原测试配置则仅设置 `TEST_TENANT_ORDER_POSTGRES_DSN`，不借此触发整个旧订单矩阵。新 harness 必须可独立初始化，不能依赖被过滤掉的旧迁移子测试。
- 不建 MySQL/SQLite 服务、不配置其 DSN、不跑旧多引擎矩阵。旧 controller/router setup helper 会通过其他 helper 初始化 SQLite（如 `setupPartnerTenantOrderController`），因此只复用安全的断言/签名辅助函数，不直接调用其数据库 setup。使用 pq fixture 做同一交付边界的必要回归。
- race 仅在新实现实际引入进程内共享状态或发现竞态迹象时针对相关用例补跑；普通 DB 并发语义优先通过 PostgreSQL 行锁用例验证，不把 race 重复跑一遍当固定仪式。
- 测试要求空库时，重复运行另建专属数据库；不为通过而清空未知数据。任务资源创建/销毁先登记并遵循用户清理许可。
- 验证输出确实执行了目标测试，不以 no tests to run 为通过。Docker/必需 PostgreSQL 不可用时明确报告阻塞；不能把 skip、编译或静态检查当成 DB runtime 通过。

### 4.3 最小必要覆盖清单（合并用例，避免重复执行）

| 范围 | 样本 |
| --- | --- |
| 迁移 | 仅真实 PostgreSQL fresh/增量/重复迁移与持久化，已有订单/Token/订阅不变；不验证其他数据库 |
| 签发 | 未支付/交付失败无 Key、首购原子生成、重复回调/后台恢复、同订阅续期沿用、新订阅不同 Key |
| 套餐配置 | root 为 A 配置多份专属套餐，A 目录/正常新购可用，B 无法读取/下单；平台/停用/他人 plan_id 不可绕过，无新授权表 |
| 领取 | paid 未 fulfilled、正确/错误商户、过期/换钥后领取当前 Key、历史无绑定 GET 不写库、买家映射 |
| 查询 | 单订阅绑定、更新额度、周期重置、0/无限额/耗尽、2^53/int64 边界、到期/取消、其他订阅有效仍不取钥 |
| 禁用 | 商户/账户/用户/Token 停用、删除、错组、Token 过期、映射损坏、严格时钟错误、根秘密不一致 |
| 重置 | 新旧 Key、同键同参重试、同键异参、expected_version 冲突、后来轮换超越旧请求、并发领取/查询/续期 |
| 时间授权 | 慢请求体期间商户换钥/停用、锁等待期间到期、旧 Key 在等待时被轮换、事务内当前读取 |
| 隐私鉴权 | 凭证混用、URL/未知字段/重复字段拒绝、无缓存、最小 DTO、错误/日志无秘密、sub_ 调模型在上游前拒绝 |
| 直接回归 | 原账户 Key稳定、付款交付/失败恢复、原 H5/cashier DTO 无新秘密；订单金额、计费与前端未改则静态核对，不跑其完整旧测试集 |

## 5. 回滚与完成规则

- 实现前后均不读取/提交未跟踪私钥，不清理 reports/examples/既有临时文件，不覆盖用户脏文档。
- 用户已确认商户专属套餐 A，新增范围与实施步骤已收敛；仍等待新版最终摘要的后续明确实施批准，不把单项选择当作 task start 批准。
- 任何设计变更若扩大到平台收银台展示、Coding Key 重置、跨订阅查询或历史补签，返回规划并请求重新审阅。
- 应用回滚保留新表和全部支付事实，不 drop、删订单或撤回权益。已签发凭证依赖新版本提供查询，回滚时需告知接入方。
- Trellis 规划与后续规范修改均提交 Git。临时产物按 TEMPORARY_ARTIFACTS.md 列表取得用户同意再清理，Trellis 日志不删。
- 验证缺口按证据披露；只有本次必要门禁通过才可声明完整验收/归档。不得把未跑的无关全量测试列为本次新增阻塞，也不得声称它们已通过。
