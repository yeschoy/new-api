# 商户用量日志 — A 阶段（共享 owner 契约）质量复核记录

> 复核方：trellis-check 子代理，2026-11-17。持久 Trellis 记录，不是临时产物。
> 范围：**仅 A 阶段**（安全 Tenant owner 原语、request-local 快照、无秘密商户 options、两个 scope 明确的 options 入口）。B（新表 / 迁移 / 读者）、C（切写）、D（CNY / 前端）未开始，本次没有开始、完成或预接它们，也不把它们的缺失记为发现。

## 0. 结论

- **没有发现需要修改的实现缺陷。** `model/partner_tenant_owner.go`、`controller/partner_tenant_options.go`、两条路由、两条 PAT 规则、前组 handler 的等价重构、两个 `TestMain` 旁路均与已批准契约（本任务 design §1 / §4，父 `research/contract-decisions.md` §1 / §2）一致，本次**未改动任何非测试 Go 源码**。
- 修复集中在**从未运行过的测试源码**（1 处空洞断言 + 6 处覆盖缺口）和**文档 / 记录的 3 处不准确**。
- 状态不变：**source-ready / runtime-blocked**。本记录中的每一条结论都只有两种证据性质，逐条标注：
  - 「源码推导」= 阅读源码与依赖源码得出，未编译以外的任何执行；
  - 「类型检查」= 离线 `go build` / `go vet` 通过（vet 会类型检查 `_test.go`，但不执行测试）。
- **Go tests executed: 0**（宿主机禁止 `go test`；Docker daemon 不可用且不得启动；不得用 SQLite / MySQL / 生产库替代 PostgreSQL）。没有任何一条结论是「已执行」证据。

## 1. 方法与边界

- 完整阅读：5 个新文件、6 个已修改文件的 `git diff`、`verification.md` A 阶段交接、`implement.md`；本任务 prd / design / implement；父任务 prd / design / verification 与三份 research；`check.jsonl` 所列 4 份 spec。
- 为核对「编译器看不到」的行为，只读查看了依赖源码（模块缓存，非仓库文件）：`gorm.io/gorm@v1.25.12` 的 `chainable_api.go`（`Table` 别名正则）、`callbacks/query.go`（已有错误时不执行 SQL）、`scan.go`（目标类型与 Model 不同时重新解析 schema、空结果置为非 nil 空切片）、`finisher_api.go`（`Count` 走 Query 回调链）；`gin-gonic/gin@v1.9.1` 的 `context.go`（`Set` / `Get` 带锁、`reset` 清空 `Keys`）。
- 检索只用 `git grep`（已跟踪文件）与显式源码目录；**没有**以仓库根为起点的递归搜索。受保护路径（私钥、`reports/`、`examples/partner-subscription-key-demo/`、`.local-tests/`、两份受保护 `.md` 清单、`web/scripts/partner-access-mode/`、`web/scripts/partner-authorization-audit/`）未读取、未打印、未修改、未暂存、未删除。
- 未做：生产访问、真实付款 / 模型请求、部署、`git push` / `git commit` / `git add`、任何破坏性操作、启动或重启 Docker、新增依赖、改动 `go.mod` / `go.sum` / lockfile、下载模块或工具链。
- 没有创建任何临时文件、容器、schema 或日志；命令输出只进 shell 变量。离线 `go build` / `go vet` 只刷新了仓库外的共享 Go 构建缓存 `/Users/lyh_god/Library/Caches/go-build/`。

## 2. 发现

严重度：高 = 会造成错误归属 / 越权 / 泄密；中 = 测试会给出假阳性或记录误导验收；低 = 覆盖缺口或文档不精确；信息 = 无需改动、供后续阶段使用。

| # | 严重度 | 位置 | 证据 | 处置 |
| --- | --- | --- | --- | --- |
| F1 | 中 | `controller/partner_tenant_usage_options_test.go:237`（原写法） | “both entries share one projection” 只比较两个入口的响应体是否相等。若某个查询串被两个入口同样拒绝（两个 400 的响应体也相等），断言照样通过，证明不了“共享同一成功投影”。其中 `?q=merchant+1&selected_id=…` 这一组合在别处没有 200 断言 | **已修复**：先断言两个入口均为 200，再比较响应体 |
| F2 | 低 | `model/partner_tenant_owner.go:99,124,213,244` | `DB == nil` 在单查 / 批量 / options / 单选项四条路径都返回查询失败，但没有任何测试覆盖；派发要求明确点名“包括 nil DB” | **已修复**：新增无库测试 `TestPartnerTenantUsageOwnerNilDatabase`（同时断言失败不 memo、空批量不需要数据库、越界参数仍先报 `ErrPartnerTenantOptionQuery`） |
| F3 | 低 | `model/partner_tenant_owner.go:80-86` | 决定 (h)（空 `identity_source` 读作 `external`）写进了契约与记录，但没有测试固定它 | **已修复**：新增子测试 “empty identity source reads as external”（单查与批量一致） |
| F4 | 低 | `model/partner_tenant_owner.go:136-151` | “失败不返回部分结果”只在**第一块**失败时被断言；成员已在前一块解析出来、后一块失败的情形没有覆盖 | **已修复**：新增子测试 “failure in a later chunk returns no partial result”（506 个 ID，第 2 条查询失败，断言返回 `nil` 且恰好发出 2 条查询） |
| F5 | 低 | `model/partner_tenant_owner.go:174-179` | memo 命中前有“类型断言 + `snapshot.userID == userID`”双重防线，但测试只覆盖了正常路径；“错配快照 / 非快照值占了该用户的键”时是否仍走本人查询没有断言 | **已修复**：新增子测试 “a mismatched or malformed memo entry is never served” |
| F6 | 低 | `model/partner_tenant_usage_owner_test.go`（“out-of-bounds queries never reach the database”） | 子测试内新注册的计数器只断言为 0，没有正向对照；如果计数器没有接上，断言同样通过 | **已修复**：断言为 0 之后发一次合法查询，要求计数变为 2（count + page） |
| F7 | 低 | `verification.md` A.3、`docs/partner-tenant-api.md` | 权限矩阵写了“桌面端会话 403”，但真实路由测试里没有这一行 | **已修复**：`router/partner_tenant_usage_options_test.go` 凭证矩阵新增 “admin desktop-client session” → 两个入口均 403 `AUTH_DESKTOP_SCOPE_DENIED`（`middleware/auth.go:416`） |
| F8 | 低 | `docs/partner-tenant-api.md`、`verification.md` A.3 | 文档写“每个入口要求各自的显式 scope”，对 **scoped PAT** 成立；但既有全局规则下，legacy（旧版无 scope）访问令牌在退役期限前只被 session-only 路由拦截，其余路由**不做 scope 检查**（`middleware/auth.go:323-326`，`case lookup.legacy: return true`），角色检查仍先行（`:67`）。因此管理员 / root 的 legacy 令牌在过渡期内可访问两个新入口，与 `/api/log/`、`/api/user/search` 完全相同。这不是 A 阶段引入的行为，但文档与矩阵没有说明 | **已修复（仅文档 / 记录）**：补充说明与矩阵两行。**未改代码**——改变 legacy 令牌规则会改动既有 PAT 分层，超出范围 |
| F9 | 低 | `model/partner_tenant_owner.go:219` | `q` 的大小写不敏感由 Go 端 `strings.ToLower(keyword)` + SQL `LOWER(name)` 实现。ASCII 在三种驱动上一致；非 ASCII 字母的折叠取决于数据库：PostgreSQL 取决于库的 locale / collation（C locale 只折叠 ASCII），SQLite 的 `LOWER()` 只处理 ASCII，MySQL 默认 `_ci` 排序规则本身大小写不敏感（`_ai_ci` 还会忽略重音，匹配更宽）。中文名称不受影响 | **已修复（仅文档）**：补一句“非 ASCII 字母的大小写折叠取决于数据库排序规则”。代码未改：任何单一写法都无法在所有 locale 下一致，且不影响安全边界 |
| F10 | 中（记录） | `verification.md` A.7 注意事项 2 | 原文称“设了 DSN 而不带 `-run` 时，同包旧测试会失败”。实际上旁路后 `DB == nil`，旧测试对 nil `*gorm.DB` 的调用会 **panic 并中止该包的整个测试进程**，同进程内 usage 测试的结果也随之丢失 | **已修复（记录）**：更正措辞。约束本身（必须带 `-run '^TestPartnerTenantUsage'`）不变，与前组旁路相同 |
| F11 | 信息 | `controller/partner_tenant_options.go:139` | `Cache-Control: no-store` 只在 200 时设置；400 / 503 以及中间件返回的 401 / 403 不带。两条路由所在的管理员分组都没有 `DisableCache`（与 `/api/log/`、`/api/user/search` 相同）。这些状态码不属于可启发式缓存的集合，错误体也不含商户数据 | 未改动 |
| F12 | 信息 | `controller/partner_tenant_options.go:77-108` | `p=`、`page_size=`、`selected_id=` 以**空值**出现时为 400（`q=` 空值合法）。axios 会丢弃 `undefined` / `null`，但会发送空字符串 | 未改动；D 阶段前端必须省略空参数而不是发送空串 |
| F13 | 信息 | `controller/partner_tenant_options.go:94-99` | 关键词先校验（≤64 码点、无控制字符）后裁剪空白，因此“可见字符 ≤64 但连同首尾空白 >64”会被拒绝；首尾的制表符属于控制字符同样被拒绝 | 未改动；文档表述可覆盖 |
| F14 | 信息 | `model/partner_tenant_owner.go:98-113` | owner 查询不使用任何缓存（契约要求）。C 阶段接入后，**每个**会写 consume / error 日志的请求（包括普通用户）都会多一条走 `partner_tenant_accounts.user_id` 唯一索引的主库点查（请求内 memo 一次） | 未改动；属于已批准的取舍，C 阶段评估时知晓即可 |
| F15 | 信息 | `model/task_cas_test.go`、`controller/`、`router/` | A 阶段之后，不带 DSN、不带 `-run` 的裸 `go test ./model`（及 `./controller`、`./router`）会因 6 个 pq 测试在 `require.NotEmpty(dsn)` 处失败而变红。这是“缺 DSN 不得静默跳过”的直接后果，前组 router 审计测试已是同样做法 | 未改动；运行命令必须按 implement.md E 节显式选择 |

未发现高严重度问题。

## 3. 逐项核对结论

### 3.1 归属语义（`model/partner_tenant_owner.go`）— 源码推导 + 类型检查

- 成员资格**仅**是 `partner_tenant_accounts` 中存在该 `user_id` 的行（`:74-78`，`:103`）。全文件没有 status / 订阅 / 商户状态 / 角色 / 组 / 用户名谓词，也不 join `users`（软删除用户只要映射仍在即为成员）。与既有 `IsPartnerTenantUser`（`model/partner_tenant.go:84-99`）的存在性语义一致。
- `LEFT JOIN partner_tenants AS t` + `COALESCE(t.name, '')`：商户行缺失时仍是成员、名称为空。
- 三态在每条路径上可区分：成员 `(owner, true, nil)`；确认非成员 `(零值, false, nil)`，只在查询成功后返回；失败 `(零值, false, err)`。失败来源包括 nil `DB`（`:99`）、驱动错误（`:103`）、返回行与请求不符（`:109`）。批量路径任何失败返回 `(nil, err)`，没有部分结果（`:125,140,144`）。
- 不读、不写一分钟 bool `partnerTenantMembershipCache`（该文件没有对它的任何引用），没有新增共享缓存或负缓存。
- request memo（`:170-186`）：键为 `"partner_tenant_owner_snapshot:" + strconv.Itoa(userID)`，命中还要求值类型为快照且 `snapshot.userID == userID`；`c == nil` 直接查库；失败不写入 memo。gin 的 `Set` / `Get` 自带锁，`reset()` 在每个请求开始时清空 `Keys`，因此 memo 不会跨请求；即使 context 被复用，键与快照都带 user ID，也不会把另一个用户的 owner 交给当前用户。
- 生成 SQL（按 GORM v1.25.12 源码推导，PostgreSQL）：
  `SELECT a.tenant_id AS tenant_id, COALESCE(t.name, '') AS tenant_name, a.id AS account_id, a.user_id AS user_id, COALESCE(a.identity_source, '') AS identity_source FROM partner_tenant_accounts AS a LEFT JOIN partner_tenants AS t ON t.id = a.tenant_id WHERE a.user_id = $1 ORDER BY a.id ASC LIMIT $2`。
  - `Table("… AS a")` 命中别名正则，`Statement.Table = "a"`、`TableExpr` 原样输出；整段 `Select` 字符串在目标 schema 中查不到同名字段，按 raw 输出；`Joins` 字符串不是关系名，按 raw join 输出；`IN ?` 配切片展开为 `IN ($1,…)`，每块 ≤500；列别名与投影结构的 `gorm:"column:…"` 一一对应，`bigint` 扫描进 `int64` / `int`。这是仓库既有写法（`GetPartnerUserPlanRateLimit` 用同样的 `Table("… AS s")` + raw `Joins`）。
  - options：`SELECT count(*) FROM "partner_tenants" WHERE LOWER(name) LIKE $1 ESCAPE '!'` 与 `SELECT "id","name" FROM "partner_tenants" WHERE … ORDER BY id DESC LIMIT … OFFSET …`。关键词先转义 `!`，再转义 `%`、`_`，是字面子串；显式 `ESCAPE '!'` 使反斜杠在三种驱动上都是普通字符。
  - MySQL / SQLite 差异：SQL 语法三者通用；唯一的行为差异是非 ASCII 大小写折叠（F9）。未在 MySQL / SQLite 上运行。

### 3.2 秘密安全 — 源码推导 + 类型检查

- `PartnerTenantOwner` 恰好 5 个字段（tenant ID、tenant name、account ID、user ID、identity source），`PartnerTenantOption` 恰好 2 个字段（id、name），全部 `json:"-"`；响应 DTO `partnerTenantOptionView` 只有 `id`（十进制字符串）与 `name`。
- 查询不读取 `external_user_id`、其 hash、`secret_hash`、`token_id`、`source_order_id`、`group`、`integration_mode`、任何 key / seed / 配置。
- 错误文本有界：`partnerTenantOwnerLookupError.Error()` 恒为 `partner tenant owner lookup failed`，原始原因只能经 `errors.Unwrap` 取得；handler 的 503 响应体是固定 message key，应用日志只有 `partner tenant options read failed (request_id=<id>): database error`（`controller/partner_tenant_options.go:116`）。
- A 阶段查询即使在 GORM DEBUG 插值下也只含 user ID、商户 ID 与管理员输入的搜索词，不含凭证；design §3 要求的 silent GORM 会话针对的是 C 阶段的新日志写入，不属于本阶段。

### 3.3 HTTP 契约（`controller/partner_tenant_options.go`）— 源码推导 + 类型检查

- 严格解析 `RawQuery`（`url.ParseQuery`，编码错误 / 分号分隔 → 400）；未知键、重复键 → 400；`p` 规范十进制 1–1000000；`page_size` 规范十进制 1–100；`selected_id` 规范正 signed-int64；`q` 合法 UTF-8、≤64 码点、无控制字符。全部校验先于任何查询；模型层再独立拒绝越界参数，因此不存在无界下载。
- ID 以十进制字符串输出；`selected` 按 ID 解析，不存在时为 `null` 而不是错误；成功响应 `Cache-Control: no-store`；信封与分页字段名沿用项目的 `{success,message,data}` 与 `page` / `page_size` / `total` / `items`（`common/page_info.go:9-15`），参数名 `p` / `page_size` 与 `common.GetPageQuery` 一致。
- **拒绝未知参数是否会打断真实后台客户端**：不会。证据（源码推导）：`web/src/lib/http-client.ts:55-62` 的 axios 实例只设置 `baseURL` / `withCredentials` / 请求头，没有默认 `params` 或 `paramsSerializer`；唯一的请求拦截器（`:153-176`）只写请求头（设备信号、Authorization）；`web/src/lib/api-base-url.ts:21` 的 `API_BASE_URL` 为空串。全仓只有 `features/performance-metrics/api.ts:29` 在单次调用上用了 `paramsSerializer`。同家族的严格端点 `/api/partner-oauth/authorization-logs` 已经以 `{ params: filters }` 方式被同一个实例调用（`web/src/features/partner-oauth-clients/authorization-log-api.ts:81`）。没有全局追加的 cache-buster 或 locale 查询参数。注意 F12。

### 3.4 权限 — 源码推导 + 类型检查

- 两条路由都在 `AdminAuth` 之后：`router/api-router.go:173`（`/api/user` 的管理员分组，与 `GET /api/user/`、`/search` 同组）与 `:395`。`GetAllUsers` / `SearchUsers` / `GetAllLogs` 的 handler 内没有额外的 Casbin 检查，所以“与用户列表 / 默认日志相同的读取 gate”成立。
- PAT 表：`middleware/access_token_routes.go:121` 为 `user:read`，`:277` 为 `log:read`，均为显式 `accessTokenScopeRule`，不是 any 规则。
- root-only `/api/partner-tenants`：路由（`router/api-router.go:294-301`）、handler（`controller/partner_tenant.go`）、模型（`model/partner_tenant.go`）、PAT 规则（四条 `accessTokenSessionRule`）与响应形状均未改动——`git diff --name-only` 对这些文件为空，`router/api-router.go` 与 `middleware/access_token_routes.go` 的 diff 只有新增行。
- `/api/user/tenant-options` 与 `/api/user/:id` 并存：`go.mod` 为 gin v1.9.1，该版本允许同层静态段与参数段并存并在静态匹配失败时回退到参数节点；同一棵 GET 树里已有 `/api/user/search`、`/api/user/topup`、`/api/user/self`、`/api/user/models`、`/api/user/2fa/stats`（后者在 `/:id` **之后**注册）与 `/api/user/:id` 并存。结论：注册不会 panic，新路由也不会被 `/:id` 遮蔽。**这是推理，不是执行。**
- 既有 `TestAccessTokenRouteRulesCoverEveryDashboardRoute`（`router/access_token_scope_test.go:110`）要求每条 `/api` 面板路由恰好声明一次、每条声明都对应已注册路由。两条新路由各注册一次、各在静态表声明一次、都不经 `handlePermissionRoute`（不会进入 permission 注册表造成重复声明），按源码满足该测试。**未运行。** 其他枚举路由的测试（`iq_router_test.go`、`partner_tenant_subscription_key_test.go` 等）只检查各自的子集，不受影响。
- 桌面端会话：`dashboardSessionRouteAllowed` 是封闭白名单，未加入新路由 → 403 `AUTH_DESKTOP_SCOPE_DENIED`。legacy 令牌见 F8。

### 3.5 `controller/partner_oauth_client.go` 等价重构 — 源码推导 + 类型检查

原代码：`ParseInt(raw, 10, 64)` 出错、或值 `<= 0`、或 `FormatInt(value) != raw` → 400 `invalid tenant`。新代码把同一个三段判断搬进 `parseCanonicalPositiveInt64` 并在 `!ok` 时返回同一个 400。

| 输入类别 | 原行为 | 新行为 |
| --- | --- | --- |
| 空串 | `ParseInt` 语法错误 → 400 | 同 |
| 带符号（`+1` / `-1`） | `+1`：解析为 1 但 `FormatInt` ≠ 原文 → 400；`-1`：`<= 0` → 400 | 同 |
| 前导零（`01`） | `FormatInt` ≠ 原文 → 400 | 同 |
| 含空白（` 1` / `1 `） | `ParseInt` 语法错误 → 400 | 同 |
| 溢出（`9223372036854775808`） | `ParseInt` 范围错误 → 400 | 同 |
| `0` | `<= 0` → 400 | 同 |
| 负数 | `<= 0` → 400 | 同 |
| `9223372036854775807` | 接受，`filter.TenantId` 为该值 | 同 |
| 普通规范正整数 | 接受 | 同 |

接受集合与接受后的 `filter.TenantId` 完全相同。两处内部差异都不可观察：拒绝时 `filter.TenantId` 现在是 0（随即返回 400，不再使用）；外层 `err` 不再被这段赋值（到达此处时 `err` 恒为 nil，之后被 `items, total, err := …` 覆盖）。前组覆盖该过滤的测试（`controller/partner_tenant_authorization_audit_test.go:101,104`、`router/partner_tenant_authorization_audit_test.go:171`）在 `go vet` 下通过类型检查；**未运行**。

### 3.6 测试源码 — 源码推导 + 类型检查

逐行读完三个测试文件并对照被测代码与 fixture 依赖（`User` / `Token` / `SubscriptionPlan` / `UserSubscription` / `PartnerOAuthClient` / `PartnerAccount` / `PartnerOAuthBinding` / `UserSession` / `UserAccessToken` / `AuditLog` 的列约束与 hook，`service.CreateLoginSession`，`authHelper` / `enforceAccessTokenRoute` 的判定顺序，`RecordAuditLog` 为同步写入）。结论：

- schema / search_path：每个 pq fixture `CREATE SCHEMA <前缀><UnixNano>` 后把连接的 `search_path` 只设为该 schema，随后的迁移与读写都落在自己创建的 schema 内；`HasTable` / `HasIndex` 按当前 schema 判断，看不到其他 schema。
- 没有 `DROP` / `TRUNCATE` / `DELETE`：唯一的 `db.Delete(&User{}, id)` 是对自建行的软删除；`MigratePartnerTenantSubscriptionKeys` 内的 `DropIndex` 分支在全新 schema 中不可达。
- 进程全局状态：`model.DB`、`model.LOG_DB`（仅 router）、数据库类型、`common.RedisEnabled`、`common.CryptoSecret`（model，经既有 helper）、`initCol()`、membership 缓存、`gin.DefaultErrorWriter`（controller，持 `LogWriterMu`）、`common.SessionSecret` / `IsMasterNode` / `GlobalApiRateLimitEnable`（router）都在 `t.Cleanup` 还原；`gin.SetMode(TestMode)` 不还原（既有惯例）；`SetApiRouter` 对 PAT permission 注册表的声明是幂等的；不调用 `authz.Init`。测试不调用 `t.Parallel()`，每个 pq 测试用独立 schema，彼此不依赖顺序。`GlobalApiRateLimitEnable` 在 `SetApiRouter` 之前置为 false，而 `GlobalAPIRateLimit()` 在注册时取值，顺序正确。
- 查询计数确实接在被测路径上：回调注册在 fixture 自己的 `*gorm.DB`，而被测代码用的全局 `DB` 就是它（`Session` 派生实例共享回调表）；`Find` 与 `Count` 都走 Query 回调链。
- 真实路由测试走的是 `SetApiRouter` 的完整链（`AccessTokenAudit` → `AdminAuth` → handler），会话来自 `service.CreateLoginSession`，PAT 来自 `model.CreateUserAccessToken`，不是手工塞 context。
- 缺 DSN：6 个 pq 测试 `require.NotEmpty` 直接失败；既有 helper 里的 `t.Skip` 分支不可达。
- 断言与实现逐条对照没有发现相互矛盾之处（包括 400 时不带 `Cache-Control`、root-only 列表的键集合、各拒绝码的先后顺序）。
- 派发清单要求的覆盖全部存在；本次补上的缺口见 F1–F7。

### 3.7 `TestMain` 旁路 — 源码推导 + 类型检查

`model/task_cas_test.go` 与 `service/task_billing_test.go` 的新分支位于既有分支之前，条件是“设了 `TEST_PARTNER_USAGE_POSTGRES_DSN` 或 `-run` 含 `PartnerTenantUsage`”，动作与既有分支相同（`os.Exit(m.Run())`，跳过 SQLite 引导）。

- 选中 `PartnerTenantUsage` 或设了该 DSN 时，SQLite 引导不会发生，新套件不可能跑在 SQLite 之上；缺 DSN 时 pq 测试直接失败。
- 两个条件都不满足时落到既有分支，条件表达式一字未改；`AccessMode` / `AuthorizationAudit` / `SubscriptionKey` 的选择行为与之前完全相同。HEAD 中没有任何名字含 `PartnerTenantUsage` 的既有测试，新条件不会误伤旧测试。
- service 包在 A 阶段没有 usage 测试；该旁路只是让计划命令在 `./service` 上不引导内存 SQLite，属于变更集内已列出的改动。

### 3.8 记录

- `verification.md` “A 阶段交接”的签名、JSON 字段、参数表、三态语义、权限矩阵、文件清单、fixture 审计、阻塞项逐项对照代码：除 F7 / F8 / F10 外一致；已就这三处及本次新增的测试同步更新，并新增 A.11 记录本次复核的命令与结果。记录没有声称运行验收。
- `implement.md` 只勾选了 A 阶段条目，每条都带“运行待验证”说明，B / C / D / F 未勾选。未改动。
- `docs/partner-tenant-api.md` 与实现一致（除已修正的 F8 / F9 与补充的桌面端错误码），明确写明运行测试尚未执行、不作部署声明。

## 4. 对实现方自行决定事项的评估

| 项 | 决定 | 结论 | 理由 |
| --- | --- | --- | --- |
| (a) | `userID <= 0` 无特殊分支，按数据库事实返回“确认非成员” | **一致** | 契约要求区分“查询成功无映射”与“查询失败”，`userID <= 0` 属于前者；与既有 `IsPartnerTenantUser` 同样不设特判；`CreatePartnerTenantAccountWithTx`（`model/partner_tenant.go:375-377`）拒绝 `UserId <= 0`，不存在这种映射。提醒 C 阶段：writer 若要对“无身份事件”采取别的策略，应自行判断，不能指望本原语报错 |
| (b) | 未知查询参数 → 400 | **一致** | design §4 要求“重复 / 非法 / 超界参数拒绝”；同家族的授权日志 handler 已拒绝未知参数；端点是新增的，没有兼容包袱；真实后台客户端不追加全局查询参数（§3.3 证据） |
| (c) | 抽取共享规范 ID 解析器并改动前组 handler 2 行 | **一致** | 逐输入类别证明行为完全相同（§3.5），避免出现两份可能分叉的解析器。流程提示：该文件属于前组，提交时需把它列入本任务的精确路径；若主会话希望前组文件零改动，还原这 2 行即可，新 handler 不受影响 |
| (d) | 选中项参数名 `selected_id`，响应新增 `selected` | **一致** | design §4 要求 options 支持“选中 ID 补取”，命名留待实施时冻结；不用 `tenant_id` 可避免与 B 阶段 list / stat 的过滤参数混淆。已写入文档，后续子任务按此消费 |
| (e) | 错误用 HTTP 400 / 503，而非 200 + `success:false` | **一致** | 与同家族授权日志 handler 及仓库已有的 `common.ApiErrorStatus(c, http.StatusBadRequest, …)` 用法一致；两个 message key 在七种语言中已存在；axios 对非 2xx 走错误分支，前端按错误态处理 |
| (f) | 分页越界报错而非钳制；`q` 只匹配名称 | **一致** | design §4“超界参数拒绝”；上限 100 等于既有分页上限；options 契约是 id / name-only，按 ID 定位由 `selected_id` 承担 |
| (g) | 两个模型投影所有字段 `json:"-"` | **一致** | 强制消费者写显式 DTO 并把 int64 ID 渲染为字符串，符合“新 DTO 的 ID 用十进制字符串、不返回持久化模型全字段”；有结构测试守护 |
| (h) | 空 `identity_source` 归一为 `external` | **一致** | 与 `MigratePartnerTenantSubscriptionKeys` 的回填规则相同；只在回填前的窗口可达；引入该列之前所有账号都是 external，不是猜测。已补测试（F3） |

没有“需要修改”或“需要用户决定”的项。

## 5. 已修复内容

| 文件 | 修复 |
| --- | --- |
| `model/partner_tenant_usage_owner_test.go` | 新增 `TestPartnerTenantUsageOwnerNilDatabase`（F2）；新增 3 个子测试（F3 / F4 / F5）；补计数器正向对照（F6） |
| `controller/partner_tenant_usage_options_test.go` | “both entries share one projection” 先断言 200（F1） |
| `router/partner_tenant_usage_options_test.go` | 凭证矩阵新增管理员桌面端会话一行（F7） |
| `docs/partner-tenant-api.md` | legacy 令牌说明（F8）、`q` 大小写折叠说明（F9）、错误表补 `AUTH_DESKTOP_SCOPE_DENIED` |
| `.trellis/tasks/11-17-partner-usage-logs/verification.md` | A.3 / A.4 / A.6 / A.7 / A.8 同步，A.7 注意事项 2 更正（F10），新增 A.11 |

新增与改动的测试代码**同样从未执行**，只通过了类型检查。

## 6. 未改动内容及原因

- 全部非测试 Go 源码：未发现缺陷。
- F11（错误响应不带 `no-store`）：与同组既有管理员路由一致，无数据暴露。
- F9 的代码侧：数据库 locale 相关，无统一写法；已在文档披露。
- F8 的代码侧：legacy 令牌规则是既有全局行为，改动它会改变 PAT 分层，超出 A 阶段范围，也不应由本次复核决定。
- 未写 `.trellis/spec`：契约尚无运行证据，按 implement.md F 节留到运行验证之后。
- 未补“`GET /api/user/<数字 ID>` 仍命中 `/:id`”的运行断言：`GetUser` handler 依赖本 fixture 没有初始化的权限状态，属于 gin 自身的路由行为，由运行门禁 1 / 2 间接覆盖。

## 7. 实际执行的命令与真实退出码

工具链：`/Users/lyh_god/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.26.10.darwin-arm64/bin/go`（`go version go1.26.10 darwin/arm64`，rc=0），`gofmt` 取同目录二进制。Go 命令环境：`GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOFLAGS=-mod=readonly`。退出码均以 `out=$(cmd 2>&1); rc=$?` 采集。

| # | 命令 | 结果 | 性质 |
| --- | --- | --- | --- |
| C1 | 改动前 `gofmt -l` 全部 10 个 Go 文件 | rc=0，无输出 | 格式 |
| C2 | 改动前 `go build ./model ./controller ./router ./middleware ./service` | rc=0，0 行输出 | 仅编译 |
| C3 | 改动前 `go vet ./model ./controller ./router ./middleware ./service` | rc=0，0 行输出 | 仅类型检查 |
| C4 | 改完测试后 `gofmt -l`（3 个测试文件）；`go vet ./model ./controller ./router` | rc=0 无输出；rc=0，0 行输出 | 格式；仅类型检查 |
| C5 | 最终 `gofmt -l` 全部 10 个 Go 文件 | rc=0，无输出 | 格式 |
| C6 | 最终 `go build`（5 个包） | rc=0，0 行输出 | 仅编译 |
| C7 | 最终 `go vet`（5 个包） | rc=0，0 行输出 | 仅类型检查，未执行测试 |
| C8 | `git diff --check`；5 个新建 Go 文件行尾空白计数；`ls model/*.orig controller/*.orig router/*.orig` | rc=0；均为 0；无 `.orig` | 空白 / 残留 |
| C9 | `git diff --cached --name-only`；`git status --short go.mod go.sum web/bun.lock web/package.json`；`git diff --name-only -- controller/partner_tenant.go model/partner_tenant.go model/partner_tenant_integration_mode.go middleware/auth.go web` | 均为空 | 未暂存、依赖未变、root-only 面未改 |

其余命令均为只读检视（`git diff` / `git status` / `git grep` / `git ls-files` / `git check-ignore`、对指定文件的 `sed -n` / `grep -n` / `wc`）。C6 / C7 之后没有再改任何 Go 文件。

**Go tests executed: 0。** 未执行任何 `go test`、数据库 / 容器命令、前端命令或 `docker` 探测。

## 8. 残余运行门禁（全部未运行）

1. 任务自有 Docker + 隔离 PostgreSQL，设 `TEST_PARTNER_USAGE_POSTGRES_DSN`，执行
   `go test -mod=readonly ./model ./controller ./router ./middleware ./service -run '^TestPartnerTenantUsage' -count=1 -v`；确认恰好选中 10 个顶层测试（model 6、controller 2、router 2，middleware / service 0）、0 skip，并登记实际 schema 名。它同时是以下各项的唯一运行证据：别名 + LEFT JOIN + 投影扫描、`LIKE … ESCAPE '!'`、500 分块、查询计数、PAT / 会话 / 桌面端矩阵、root-only 管理 API 未放宽。
2. 同环境在 `./router` 执行 `-run '^TestAccessTokenRouteRulesCoverEveryDashboardRoute$'`（无库），证明两条新路由注册不 panic、各恰好声明一次。
3. 前组 `^TestPartnerTenantAuthorizationAudit`（其自有 DSN）回归，证明 §3.5 的等价重构在运行期同样不变；前组门禁仍独立计数，不能被新套件的绿色结果替代。
4. MySQL / SQLite 只有 SQL 推导；按数据库规范不扩大运行矩阵，如实披露未运行。
5. 运行验证通过后再把 owner / options 契约写入 `.trellis/spec`。
6. 运行时务必带 `-run` 选择器（F10 / F15）；保留的 `pt_usage_*` schema 会累积，清理需用户另行批准。

## 9. 本次复核修改的文件

- `model/partner_tenant_usage_owner_test.go`
- `controller/partner_tenant_usage_options_test.go`
- `router/partner_tenant_usage_options_test.go`
- `docs/partner-tenant-api.md`
- `.trellis/tasks/11-17-partner-usage-logs/verification.md`
- `.trellis/tasks/11-17-partner-usage-logs/quality-review.stage-a.md`（新建）
- `TEMPORARY_ARTIFACTS.md`（登记本次复核未产生临时产物）

`verification.md` 与本文件位于被 `.gitignore` 忽略的 `.trellis/` 下且尚未被跟踪，主会话提交时需按精确路径 `git add -f`。本次复核没有暂存或提交任何内容。
