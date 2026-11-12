# 执行计划：商户下单、付款后开户与订阅 Key 续费

## 1. 规划门禁

- [x] 用户允许创建本任务并进行规划；已有支付/收银台/专属套餐及无 users 可行性证据。
- [x] 已确认：商户交付、sub_ 独立查询、到期历史不取 Coding Key、商户重置、每商户多份专属套餐、不传 external_user_id、下单返回付款 URL。
- [x] 已确认真实内部 User 方案，且选 A：仅可信付款成功后的首次交付新增 users，未付款不创建，重试不重复。
- [x] 用户确认“续费通过订阅key下单，对”：商户 pt_ + 原 sub_ 指定原订阅，付款后复用原用户/订阅/两种 Key。
- [x] 完成 design.md 的订单模式、内部身份隔离、迁移、鉴权/事务/锁、兼容/回滚设计；PRD R1–R13 / AC1–AC14 进行最终收敛。
- [x] 用户限定仅必要测试，数据库只验证任务专属 Docker PostgreSQL，不跑 SQLite/MySQL/FoundRows 或无关全量套件。
- [x] 本轮 task.py validate（implement 7 / check 5 条）及 git diff --check 已通过；本轮回复展示最新版最终摘要，不据此启动实施。
- [x] 用户在最终摘要后明确答复“开始”；已加载执行阶段/trellis-before-dev，task.py start 成功进入 in_progress。按项目 Pi 流程串行委派 trellis-implement / trellis-check，同 cwd 一次只有一个写入者，不额外 fanout。
- [x] 必要 pq runtime 定向集已首次实际执行通过：前次 daemon 恢复后 runner 因 Linux procfs/numcpus 缺失 setup 失败且代理30分钟超时，历史保留。恢复获准仅补两精确锁定模块并匹配既有 go.sum；新只读/internal runner 显式 -mod=readonly 执行 model/controller/router/middleware 4顶层+7子用例全 PASS，无 skip。未运行宿主 Go 测试/其他数据库；后续独立 trellis-check 已审阅完整任务 diff/同源恢复证据，无本范围业务阻断，未无故重跑 runtime，详见 verification.md 及第7节。

这是同一付费交付边界上的一个端到端任务，不拆为可单独上线的 UI/支付子任务。无额外代理授权时由当前会话执行；如后续按适用指令委派，先 task.py current，所有提示首行必须 `Active task: <实际任务路径>`，同 cwd 只有一个写入者。

## 2. 获批后的有序实施清单

### 2.1 基线与迁移（首个回滚点：仅新增兼容结构）

- [x] 复查 git status 和用户既有 docs/partner-tenant-integration.zh-CN.md 差异，不覆盖；不读取/暂存私钥及已有 examples/reports。加载 backend index、数据库、checkout/H5、复用和跨层规范。
- [x] 检索 PartnerTenantAccount/SubscriptionOrder、partnerTenantAccountQuery、migratePartnerTenantAccountIdentity、AutoMigrate 及相关 fixture 调用点，确认共享读取/外部投影边界。
- [x] model/partner_tenant.go：Account 增 IdentitySource（external 默认）及 nullable 唯一 SourceOrderId。新内部 hash 为含 NUL 用途域 + 首购订单号的 SHA256，ExternalUserId 留空；不使用假外部用户 ID 或 NULL hash。
- [x] model/partner_tenant_order.go：Order 增 EntryMode（external 默认）、AccountId；保持旧索引/旧请求摘要/H5 哈希不变。外部账户查询及 legacy backfill 只处理 external；校验旧身份不能命中新内部账户。
- [x] model/partner_tenant_subscription_key.go：AccessKey/Rotation 两表及明确短名唯一索引，内部字段不导出；model/main.go 注册实际增量迁移，迁移 helper 由实际入口及测试复用，不用单独模拟 schema 代替。
- [x] 用任务专属 pq 验证受影响结构 fresh、旧数据升级及重复迁移，保留账户/订单哈希和数据；两独占 schema 各10表及5个关键索引已只读核对。仅受影响迁移，不声称完整应用启动/生产升级。无业务新模式写入前可回退代码；不可为回滚 drop 新列/表。

### 2.2 凭证与内部账户（第二回滚点：尚未开放新路由）

- [x] 模型层实现用途分离 HMAC、随机 Seed、固定 sub_ 格式、哈希/版本、派生一致性和安全错误，不写 tokens，不缓存凭证，不保存原始 sub_。
- [x] 在原事务内抽取可共享 User/Token 创建逻辑，旧 helper 输入/输出保持；新私有 helper 按 SourceOrderId 校验或创建内部账户。zero wallet、商户 group、固定 TokenId；validatePartnerTenantAccountTx 的坏映射 fail closed，不补发。
- [x] 授予/重置周期使用共享日历/订阅 helper；为新路径接受严格锁后 DB 时间，旧调用封装语义保持，不复制计费实现。
- [x] 领取只读返回当前 Key；轮换 expected_version + 独立幂等事实，超越版本返回冲突，旧种子不保存。根秘密不匹配 fail closed，只有显式合法商户轮换能更换当前材料。

### 2.3 无买家 ID 的下单与付款交付

- [x] 新 model/partner_tenant_subscription_key_order.go（或相同职责文件）实现新购/续费入口：pt_ 锁后重验、独立幂等用途域、规范请求摘要、套餐/预算、冻结 AccountId/RenewalSubscriptionId。
- [x] 续费 Key 仅在 X-Subscription-Key 请求头；缺头是新购，有头但错误不得退化为新购。用 Key 定位并校验同商户/同套餐/当前绑定，活跃或自然到期可续原行，取消/损坏拒绝；不依赖 external_user_id。
- [x] 新购/续费及精确重放都在 Tenant → Order → Plan → Account → User/Token → Subscription → Key 的实际事务里授权，慢 body/锁等待后仍看当前 pt_/sub_ 和严格 DB 时钟。幂等请求摘要用实际目标 ID，不存 Key/版本，显式换钥后可用新 Key 重放原订单。
- [x] 订单创建/返回 URL 不新增 User/Token/订阅/长期凭证；网络网关准备在事务提交后复用旧实现。原 pending 失败准备可同幂等重试，不更换 snapshot/deadline；只读查单无准备副作用。
- [x] FulfillPartnerTenantSubscriptionOrder 按 EntryMode 分派：旧路径原样保留；新路径 paid 后新购开户或按冻结目标续费，User/Token/Account/Subscription/AccessKey/fulfilled 同事务提交。已 fulfilled 保持早返回，不补签/重新授予。
- [x] 失败回滚全部本地新建但 paid 独立保留，沿用 failed_retryable/扫描恢复；可信迟付和重复通知行为不退化。续费不按已轮换 Key 再定位，不因改钥/自然到期重建 User/订阅。
- [x] 源码提交后才发布 membership cache；pq 定向用例证明内部账户被 IsPartnerTenantUser 识别，HTTP 代表 funding 用例证明有钱包但取消订阅时 wallet_first 不可兜底且钱包不动。复用既有 RPM/日志，不增加新主体或重写模型计费；未扩跑 RPM/普通计费矩阵。

### 2.4 路由、严格 DTO 与安全（第三回滚点：新入口启用前）

- [x] controller/partner_tenant_subscription_key.go（建议）和 router/partner_tenant.go 增新下单/状态/领取/查询/重置。新商户路由在 pt_ 组内，GET /api/partner/subscription 在组外，只带 sub_ 即可。
- [x] 新模式商户 DTO 无 external_user_id/内部身份材料/长期凭证；状态 GET 不准备网关。旧商户 API/H5 的外部投影显式限制模式，底层共享订单读取仍允许收银台/准备/支付回调读取两模式，不能全局加 external 过滤使新模式支付失效。
- [x] 严格头/JSON/query 解析，2KB 上限、无重复/别名/尾随数据；no-store/no-referrer、request_id、IP/哈希预算、统一错误。审计周边日志，Authorization/X-Subscription-Key/响应凭证不可记录。
- [x] 查询在锁后核对当前 hash/派生/真实绑定/状态，用同一快照处理周期和额度。所有 quota 为十进制字符串；自然到期/取消不返回 api_key，历史余额单列且不可消费。读取当前 TokenId，不触发补发。
- [x] pq HTTP 定向用例验证 sub_ 在 /v1/models、代表 chat 和 TokenAuthReadOnly 被 sentinel 上游之前拒绝；查询拒绝其他用途 Key/Cookie-only/query，重置拒绝 sub_，严格头/DTO 拒绝非法替代输入。

### 2.5 文档、规范和提交

- [x] 采用独立 docs/partner-subscription-key-api.zh-CN.md 记录新购/续费 X-Subscription-Key、checkout_url、paid/fulfilled 后领取、独立查询、到期/重置与幂等；若编辑已有用户修改文档，只做明确不重叠追加，否则单独文档引用，不覆盖。
- [x] 说明 root 如何用现有套餐管理创建多个专属套餐，不造重复 UI/共享授权表，不增加前端翻译键或升级依赖。
- [x] 按 trellis-update-spec 将真实新合同写入 backend 对应规范；区分旧 external API、可选 H5、新 subscription_key 身份，避免把已实施现状提前写成上线结论。
- [x] 按 trellis-check 对本任务全范围做必要核对：16个任务Go文件/新与ignored规范、同源真实pq日志及共享启动迁移fixture已审阅；无经证据确认的本范围业务P0/P1/P2，不重复runtime。纠正新接入文档过时未执行状态、补齐英文可执行合同；实际命令/已有通过用例/证据边界记入 verification.md。
- [x] 用户确认25文件单业务提交计划后，主会话按精确路径提交为 `58616beef`（feat(partner): add subscription access keys and paid-only provisioning），提交前后路径集合校验一致，未包含原用户guide/私钥/旧产物/临时目录。未 git add . / force add 整个忽略目录，未 push/部署；npm/pnpm记录保持忽略。后续仅本任务归档/日志记账。

## 3. 必要验证与证据

### 3.1 规划检查（本轮仅运行）

```bash
python3 ./.trellis/scripts/task.py validate .trellis/tasks/11-12-partner-subscription-access-key
git diff --check -- .trellis/tasks/11-12-partner-subscription-access-key
```

规划阶段不创建数据库/容器、不运行代码测试，不产生无关构建缓存。

### 3.2 获批实施后的隔离环境

Go runner/空 PostgreSQL/网络/缓存卷全部任务专属，预先把精确名称、用途、路径登记到已有 TEMPORARY_ARTIFACTS.md，不登记明文 DSN 密码/凭证。DSN 使用 TEST_PARTNER_SUBSCRIPTION_KEY_POSTGRES_DSN，fixture 必须自包含并走实际受影响迁移，不调用旧 SQLite/OAuth setup 或完整矩阵。

```bash
docker info
# 在已登记的任务 runner 中，针对修改文件做 gofmt 检查及受影响包构建：
docker exec "$TASK_GO_RUNNER" go build ./model ./controller ./router
# 用实际实现的 SubscriptionKey 命名统一选择必要新用例：
docker exec "$TASK_GO_RUNNER" go test ./model ./controller ./router \
  -run '^TestPartnerTenant.*SubscriptionKey.*$' -count=1 -v
```

环境变量在 runner 中安全配置，禁止指向生产/宿主/已有未知数据。确认每组预期测试实际执行；缺 DSN、skip、no tests to run、build/vet 成功不算 runtime 通过。必需 Docker/pq 不可用时明确记录阻塞，不改跑其他数据库，也不扩大无关测试。

### 3.3 一次定向测试集覆盖

| 分组 | 必要断言 |
| --- | --- |
| 迁移/身份 | pq fresh/旧数据升级/重复迁移；external 历史数据/哈希保留；新内部账户不被外部 ID/fallback/backfill 命中，nullable SourceOrderId 唯一；只生成一次固定关联 |
| 套餐/下单 | root 现有配置 → 商户目录 → 无买家 ID 下单 → checkout_url；跨商户/普通/停用 plan 不可新购；同幂等重放、变参冲突、新旧模式/H5 隔离及公共 DTO 无秘密 |
| 付款后开户 | 未付/准备失败/失败/超时/假通知 users 零新增；可信支付独立保存，交付只新增一套；注入失败回滚本地但保留 paid，重复通知/恢复/并发只交付一次，可信迟付可恢复 |
| 续费 | pt_ + 原 sub_ 续同套餐和同 SubscriptionId/UserId/TokenId/两种 Key；自然到期续原行、活跃提前续不额外重置当期额度；旧/错/外商户 Key 不退化新购；原单换钥后用当前 Key 重放；已接受订单换钥后仍履约 |
| 查询 | 仅 sub_ 无 pt_/Cookie 即可读单订阅；周期/无限额/耗尽/2^53/int64 精度；自然到期历史/取消无 api_key；禁用/错组/缺 Token/过期/坏映射 fail closed；无跨订阅读取或补发 |
| 重置/并发 | 商户归属、expected_version、同幂等键重试、被后续版本超越、旧 Key 失效但 Coding Key/权益不变；领取/查询/续费/重置关键锁竞态，慢 body/锁等待后重验当前凭证/时间 |
| 兼容/用途 | sub_ 不能 Coding/列模型，其他用途 Key 不能独立查询；新内部账户 membership 和代表模型 funding 保持 subscription_only，钱包不动；旧模式代表订单/取钥/H5/收银台 DTO 保持原契约 |

尽量合并 fixture/断言、一次执行该定向集，不反复跑同一路径；不跑全站、无关前端、所有模型协议/计费或多引擎旧矩阵。race 仅出现新共享状态/具体风险时针对补跑。相关普通用户最小回归仅在确实触及其共享 helper 时纳入，不扩张为全量套件。

## 4. 收尾、回滚与资源

- 只在实现/必要验收及规范更新完成后报告已实现；本轮规划通过不等于部署、数据库迁移或支付验证通过。
- 任何阶段回滚都保留订单/paid 和新结构/已交付权益，不 drop、不重建已交付关系。旧应用无法承接新路由或安全解释新模式交付，回滚须协调停新入口，恢复新版本处理已付待交付，不宣称新旧二进制可无条件混跑。
- 不删除既有 reports/examples/私钥/临时文档；任务专属容器/网络/卷/输出完成后也必须先获得用户同意再清理，Trellis 记录保留。
- 若实施发现需买家页面、跨套餐换购、Coding Key 轮换、历史补签/改绑、独立无 users 主体或更大消费隔离改造，返回规划，不将用户局部答复作为范围扩张授权。

## 5. 实施边界记录（implement worker）

最小行为差：旧订单必须提供 external_user_id，且没有单订阅查询凭证。新增明确 subscription_key 模式和付款后独立内部账户；不更改旧模式身份、公共收银台或计费授权。

必要文件边界：model/partner_tenant.go、partner_tenant_order.go、main.go 负责模式/来源/迁移与原子分派；新增 subscription_key 模型和 order 模型负责秘密、当前锁内授权及新购/续费；controller 新文件和 router/partner_tenant.go 负责严格协议，旧 order controller 仅增加旧投影模式检查；subscription.go 仅抽取接受调用者锁后时间的共享创建 helper，原包装保持原行为。pq 测试自包含，不用旧 SQLite fixture。model/task_cas_test.go 的 TestMain 需在专属 pq DSN 存在时跳过旧 SQLite 引导。文档采用独立说明，不修改用户已有中文接入文档。

共享重构仅提取 User/Token 创建与订阅创建/延期的时间参数核心，旧入口保留包装调用和相同校验/返回值；静态 diff 及新定向 pq 旧 external/H5 代表兼容断言已核对，不复制日历或额度算法。不增加前端、共享套餐授权、普通计费、依赖版本、钱包行为或历史补签。原环境阻塞历史保留，恢复后的实际 pq 定向证据与静态证据明确区分。


## 6. 本次真实实施进度与验证门禁

- 已实现新增模式/来源隔离、两凭证表和启动迁移；无买家 ID 新购、原 Key 同订阅续费；当前商户锁内重验、严格时钟/绑定/Key 验证、paid 独立保留与本地原子交付；只读领取、独立精确额度/终态历史、expected_version+幂等轮换。
- 新路由和严格 DTO 已接入，公共支付 getter 仍模式中立，旧商户/H5 查询限制 external；未修改用户既有 docs/partner-tenant-integration.zh-CN.md，改用独立中文说明。新增 backend 真实合同并链接已有规范。
- 必要安全周边仅最小改动：model/token.go 对 sub_ 在 cache/SQL 前拒绝；middleware/logger.go 对新增接口 query 脱敏；新接口 scoped recovery 不输出 X-Subscription-Key；新秘密 SQL session 即使 DEBUG 也不插值秘密。未重写普通计费。
- 自包含 pq 测试原先仅由宿主离线 go vet 类型检查；前次没有实际执行。**恢复后首次实际执行 4顶层+7个model子用例全 PASS**：受影响迁移/身份/原子交付/续费/轮换/精度/终态/锁等待、HTTP 假 TLS 网关/DTO/慢 body/用途与 wallet_first 拒绝、路由/日志。已勾选有真实证据的必要门禁，不据此宣称完整应用启动、生产支付/迁移/部署或独立审阅完成。
- 实际 gofmt、离线受影响包 go build/go vet、上下文 validate、git diff --check 已通过。一次 go vet 发现新测试未用 net/http 导入，已修复并复查通过；详见 verification.md。
- 历史：daemon 恢复后主会话限定批准拉取两个镜像；任务 internal network、pqdata/gocache、pq/runner 和筛选 source export 已登记。原 runner setup failed：只读缓存缺 procfs v0.15.1 / numcpus v0.6.1，原 DB 为空；implement代理随后30分钟超时，check未启动，原日志保留。
- 本次限定恢复：主会话在已批准的定向验证范围内限定授权这两个精确模块，标准 go mod download 成功且 Sum/GoModSum 匹配已有 go.sum，go.mod/go.sum 不变。16个任务Go文件与筛选export全部相同，无额外非tracked数据；同网络/只读源码与cache/显式 -mod=readonly 的新 runner ptsubkey-a5278f4c-recovery-go 一次执行 exit0。DB 15.19 现保留 model/http 两schema各10表及关键索引，不再为空；无源码修复/重跑/其他下载/宿主测试。完整命令、用例和资源在 verification.md / TEMPORARY_ARTIFACTS.md。
- 本子代理无提交/暂存/archive 权限；未提交/暂存/删除/清理任何资源，任务继续 in_progress。主会话负责最终审阅与后续限定决策。资源与日志留在 TEMPORARY_ARTIFACTS.md 登记的路径，用户批准才清理。


## 7. 独立 trellis-check 完成记录

- 已加载 check.jsonl 全5条、PRD/design/implement/verification、Pi trellis-check 和 trellis-update-spec，审阅完整任务 diff、16个任务Go文件及新/ignored文档规范；不把旧用户中文guide的124/141行既有修改纳入本次修复。
- 无经证据确认的本范围业务P0/P1/P2，未修改Go实现/测试、未新增测试。共享迁移路径明确：实际启动 main.go → MigratePartnerTenantSubscriptionKeys，与model真实pq fixture相同helper及postgresMigrationDialector；不是内存模拟，也不冒充完整应用启动。
- 修复仅文档：新任务接入指南首段仍误写pq未执行，已改成既有定向集通过且非生产验收；英文code-spec补齐7项可执行合同结构、实际错误矩阵/Good-Base-Bad/Wrong-Correct与验证边界，不增加产品规则。同步task notes和verification独立审阅状态；原用户guide及go.mod/go.sum哈希不变。
- 本轮只读审计通过：NUL-safe tracked HEAD + 七个新Go文件export集合无缺失/额外、16份源代码逐字节相同；保存日志与成功runner docker logs完全相同，4包/4顶层/7model子例PASS无skip；三个任务容器状态/internal网络/无host ports符合授权。cached gofmt -l、manifest validate(7/5)、git diff --check及新/ignored文件空白/规范链接校验均通过，staging为空。
- 不因review角色重复执行已通过路径：没有具体业务缺陷/源码变动，故本轮未重跑runtime或build/vet，沿用同源实测及先前静态证据；没有宿主Go测试、其他数据库、旧矩阵/无关全量、下载、资源启动/停止/清理、commit/stage/push/archive。
- 未验证边界仍披露：完整启动/生产迁移、真实网关/付款/部署、root配置UI/API、定时扫描恢复、单列deadline相等/精确一个月end_time差、普通用户/RPM完整矩阵。无本范围剩余阻断；后续提交由主会话按用户权限决定，本代理无commit权限。
- 权威报告位于本运行指定 review/subscription-key-quality.md（完整路径见verification.md与TEMPORARY_ARTIFACTS.md），原超时/setup失败历史及全部临时资源保留。
