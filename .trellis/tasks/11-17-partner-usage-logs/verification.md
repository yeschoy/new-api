# 商户用量日志子任务验证记录

本文件只记录真实执行过的命令与结果。未列出的验证即未运行。父任务集成证据见 `../11-17-partner-usage-isolation/verification.md`。

## A 阶段交接

> 状态：**A 阶段 source-ready / runtime-blocked**（2026-11-17，usage-logs Stage A implement 子代理）。
>
> A 阶段 source-ready **仅表示**其他子任务（quota-cny、user-classification）可以消费下述 owner / options 契约；它**不是** usage-logs 任务的验收，B/C/D 阶段（新表、迁移、读者、写者、list/stat、CNY、前端）**全部未开始**，整个任务不得勾选为完成。所有 Go 测试执行数为 **0**。

### A.0 本次派发范围与禁区

- 范围：安全 Tenant owner（单用户 + 批量）、request-local owner 快照、无秘密商户 options 查询、两个 options 端点及其路由 / PAT scope 登记、测试源码、两个端点的 API 文档、本交接记录。
- 不在本次范围（未开始、未触碰）：`partner_tenant_usage_logs` 新表或任何迁移；`RecordConsumeLog` / `RecordErrorLog` / `RecordTaskBillingLog` / `createLog` 的任何改动；任何 reader 改动；list/stat 端点；CNY 换算；用户列表分类过滤；全部前端 / i18n；`.trellis/spec`（运行未验证，不把提案写成已实现契约）。
- 禁区（用户原话转述，均未触碰）：生产访问、真实付款、真实模型请求、部署、`git push`、`git commit` / `git add` / 任何暂存、破坏性操作、删除或清理任何既有文件/资源、启动或重启 Docker 引擎 / Docker Desktop、切换容器引擎、新增依赖或改动 `go.mod` / `go.sum` / 任何 lockfile、下载模块。
- 受保护路径：私钥文件、`reports/`、`examples/partner-subscription-key-demo/`、`.partner-access-audit-temporary-artifacts.md`、`web/.partner-checkout-temporary-artifacts.md`、`web/scripts/partner-access-mode/`、`web/scripts/partner-authorization-audit/`、`.local-tests/` —— **未修改、未暂存、未用 read/cat 打开**。如实披露的越界扫描（非故意，已停止）：
  - 若干次全仓 `grep -r --include=*.go .` 会让 grep 进程遍历 `.local-tests/` 下前组导出的 Go 源码副本做模式匹配。**第一次**（查 `authorization-logs`）未加过滤，输出了 1 行 `.local-tests/partner-subkey-a5278f4c/source/router/api-router.go:275` 的路径与匹配文本（与 `router/api-router.go:275` 逐字相同的路由注册行，无凭证）；此后的输出均用 `grep -v '^./.local-tests'` 过滤，但扫描本身仍打开了这些副本。
  - 一次 `grep -rln … --include=*_test.go --include=*.json --include=*.ts --include=*.tsx .`（查是否有测试/文档枚举路由）会让 grep 进程打开 `reports/`、`examples/partner-subscription-key-demo/`、`web/scripts/partner-*`、`.local-tests/` 下这些扩展名的文件做匹配。输出只有 3 个无关文件名（`web/src/features/users/api.ts`、同目录一个测试、`docs/openapi/api.json`），没有来自受保护目录的任何行或文件名，其内容未进入会话。
  - 私钥文件与两份受保护的 `.md` 清单不匹配上述任何 `--include` 扩展名，未被打开。之后的检索均限定在 `model controller router middleware service common docs` 等明确目录。

### A.1 冻结签名与 JSON 字段

**模型层 `model/partner_tenant_owner.go`（仅主库 `DB`，不触碰 `LOG_DB`，无跨库 join）**

```go
const PartnerTenantOptionMaxPageSize     = 100 // options 单页上限
const PartnerTenantOptionMaxKeywordRunes = 64  // 关键词上限（= 商户名列宽）

var ErrPartnerTenantOwnerLookup = errors.New("partner tenant owner lookup failed")       // 归属/选项查询失败（非成员结论）
var ErrPartnerTenantOptionQuery = errors.New("invalid partner tenant option query")      // 选项查询参数越界，未访问数据库

// 仅 5 个字段；全部 `json:"-"`，不可直接序列化，DTO 必须自行把 int64 ID 渲染为十进制字符串。
type PartnerTenantOwner struct {
    TenantId       int64  // partner_tenant_accounts.tenant_id
    TenantName     string // LEFT JOIN partner_tenants.name；商户行缺失时为 ""
    AccountId      int64  // partner_tenant_accounts.id
    UserId         int    // partner_tenant_accounts.user_id
    IdentitySource string // "external" | "subscription_key"；历史空值按迁移规则归一为 "external"
}

type PartnerTenantOption struct { // 仅 2 个字段，同样 `json:"-"`
    Id   int64
    Name string
}

func GetPartnerTenantOwner(userID int) (PartnerTenantOwner, bool, error)
func GetPartnerTenantOwners(userIDs []int) (map[int]PartnerTenantOwner, error)
func PartnerTenantOwnerForRequest(c *gin.Context, userID int) (PartnerTenantOwner, bool, error)

func ValidPartnerTenantOptionKeyword(keyword string) bool
func ListPartnerTenantOptions(keyword string, offset, limit int) ([]PartnerTenantOption, int64, error)
func GetPartnerTenantOption(id int64) (PartnerTenantOption, bool, error)
```

- 归属 SQL（单条/批量同一 builder `partnerTenantOwnerQuery`）：`FROM partner_tenant_accounts AS a LEFT JOIN partner_tenants AS t ON t.id = a.tenant_id`，只选 `a.tenant_id, COALESCE(t.name,''), a.id, a.user_id, COALESCE(a.identity_source,'')`。**没有** status / 订阅 / 商户状态 / 角色 / 组 / 用户名谓词，也不 join `users`（软删除用户只要映射仍在即为商户）。不读取 `external_user_id`、其 hash、`token_id`、`source_order_id`、`secret_hash`。
- `GetPartnerTenantOwners`：空输入直接返回空 map、**不查询**；去重后按 500 一块分块，每块一条 `IN` 查询（一页用户 = 1 条查询，无 N+1）；成员在 map 中，确认非成员不在 map 中；任何失败返回 `(nil, err)`，不返回部分结果。
- 不读、不写既有一分钟 bool `partnerTenantMembershipCache`，没有新增任何共享/全局缓存（尤其没有共享负缓存）。
- `PartnerTenantOwnerForRequest`：`c == nil` 直接查库（供无 context 的任务计费以持久化 `task.user_id` 调用）；否则 memo 存在 gin context 键 `"partner_tenant_owner_snapshot:" + strconv.Itoa(userID)`，值为不可变快照。**键含实际传入的 user ID**，同一 context 里不同 user ID 各自解析，绝不串用。成功结果（含“确认非成员”）在本请求内 memo；**失败不 memo**——对当次调用方仍是失败，同一请求内后续 writer 可重试。
- `ListPartnerTenantOptions`：`offset < 0`、`limit < 1`、`limit > 100`、关键词非法 → `ErrPartnerTenantOptionQuery` 且不访问数据库（模型层自身保证不存在无界全表下载）；`LOWER(name) LIKE ? ESCAPE '!'`，关键词为**字面子串**（`!`/`%`/`_` 均转义）；只读 `id`,`name`；`ORDER BY id DESC`；包含停用商户；`total` 与同一关键词同口径。
- `GetPartnerTenantOption(id)`：按 ID 取一个选项（含停用），`id <= 0` → `ErrPartnerTenantOptionQuery`。

**HTTP 层 `controller/partner_tenant_options.go`**

```go
func GetPartnerTenantOptions(c *gin.Context)              // 两个路由共用的唯一投影
func parseCanonicalPositiveInt64(raw string) (int64, bool) // 规范正 signed-int64 十进制文本
```

| 路由 | gate | PAT 规则 |
| --- | --- | --- |
| `GET /api/log/partner-tenants/options` | `middleware.AdminAuth()` | `log:read`（显式 scope 规则） |
| `GET /api/user/tenant-options` | `/api/user` 管理员组的 `middleware.AdminAuth()`（与 `GET /api/user/`、`/api/user/search` 同组） | `user:read`（显式 scope 规则） |

查询参数（全部可选；每个最多出现一次；未知参数拒绝）：

| 参数 | 约束 | 默认 |
| --- | --- | --- |
| `q` | 合法 UTF-8、≤64 个码点、无控制字符；首尾空白裁剪；空 = 不过滤；仅匹配商户名 | 空 |
| `p` | 规范十进制 `1`–`1000000` | `1` |
| `page_size` | 规范十进制 `1`–`100` | `20` |
| `selected_id` | 规范十进制正 signed-int64（`1`–`9223372036854775807`） | 不解析 |

成功响应（HTTP 200，`Cache-Control: no-store`，沿用项目 `{success,message,data}` 信封与分页字段名）：

```json
{
  "success": true,
  "message": "",
  "data": {
    "page": 1,
    "page_size": 20,
    "total": 37,
    "items": [{ "id": "9007199254740993", "name": "Example Merchant" }],
    "selected": { "id": "12", "name": "Another Merchant" }
  }
}
```

- 选项**恰好** `id`（十进制**字符串**）和 `name` 两个键；`items` 恒为数组；`total` 为 JSON number（计数，不是 ID）；`selected` 为对象或 `null`（未传 `selected_id` 或该商户不存在——不存在不是错误）。
- 失败响应：400 `{"success":false,"message":"Invalid parameters","message_key":"Invalid parameters"}`；503 `{"success":false,"message":"Database error, please contact the administrator","message_key":...}`。两个 message key 均为前端七语言中已存在的键，本阶段没有新增任何 i18n 文案。503 时服务端日志只有 `partner tenant options read failed (request_id=<id>): database error`，不含驱动错误 / SQL。

### A.2 三态错误语义

`GetPartnerTenantOwner` / `PartnerTenantOwnerForRequest`：

| 结果 | 返回值 | 含义 |
| --- | --- | --- |
| 成员 | `(owner, true, nil)` | 存在 `PartnerTenantAccount` 映射（不论账号/商户停用、套餐过期、用户软删除；`external` 与 `subscription_key` 均是） |
| 确认非成员 | `(零值, false, nil)` | **查询成功**且无映射 |
| 查询失败 | `(零值, false, err)`，`errors.Is(err, ErrPartnerTenantOwnerLookup)` | 归属未知。**绝不**等同非成员；调用方必须先判 `err` |

- 失败错误的 `Error()` 恒为有界文本 `partner tenant owner lookup failed`，不含驱动/SQL 细节；原始原因仅可经 `errors.Is` / `errors.Unwrap` 取得（供测试/诊断），调用方不应打印它。
- 批量：`(map, nil)` 中“在 map 里 = 成员、不在 = 确认非成员”；失败为 `(nil, err)`。
- 防御性一致性检查：返回行的 `user_id` 与请求不符 → 视为查询失败，而不是返回他人的 owner。
- `userID <= 0` 没有特殊分支：照常查询，按数据库事实得到“确认非成员”（见 A.9 偏差 1）。
- `GetPartnerTenantOption`：找到 `(option, true, nil)` / 确认不存在 `(零值, false, nil)` / 失败 `(零值, false, err)`。

### A.3 权限 / PAT 矩阵（按实际实现；**源码推导，未运行**）

| 凭证 | `GET /api/log/partner-tenants/options` | `GET /api/user/tenant-options` |
| --- | --- | --- |
| 匿名 | 401 `AUTH_UNAUTHORIZED` | 401 `AUTH_UNAUTHORIZED` |
| 普通用户会话（含商户子账号） | 403 `AUTH_INSUFFICIENT_PRIVILEGE` | 403 `AUTH_INSUFFICIENT_PRIVILEGE` |
| 普通用户的 PAT（即使带两个 scope） | 403 `AUTH_INSUFFICIENT_PRIVILEGE`（角色检查先于 scope） | 同左 |
| 普通管理员会话 / root 会话 | 200 | 200 |
| 管理员或 root 的 PAT，含 `log:read` + `user:read` | 200 | 200 |
| 管理员或 root 的 PAT，仅 `log:read` | 200 | 403 `ACCESS_TOKEN_SCOPE_DENIED` |
| 管理员或 root 的 PAT，仅 `user:read` | 403 `ACCESS_TOKEN_SCOPE_DENIED` | 200 |
| 管理员 PAT，无关 scope / 无 scope | 403 `ACCESS_TOKEN_SCOPE_DENIED` | 403 `ACCESS_TOKEN_SCOPE_DENIED` |
| 桌面端会话（含管理员的桌面端会话） | 403 `AUTH_DESKTOP_SCOPE_DENIED`（`dashboardSessionRouteAllowed` 为封闭白名单，未加入新路由） | 同左 |
| 管理员或 root 的 **legacy（旧版无 scope）访问令牌**，退役期限之前 | 200 —— 既有全局规则：`enforceAccessTokenRoute` 对 legacy 令牌只拦 session-only 路由，其余路由**不做 scope 检查**（`middleware/auth.go` `case lookup.legacy: return true`），角色检查仍先行。与 `/api/log/`、`/api/user/search` 完全一致，不是本阶段引入 | 同左 |
| 任何 legacy 访问令牌，退役期限之后 | 401 `ACCESS_TOKEN_LEGACY_RETIRED` | 同左 |

- 两条规则写在 `middleware/access_token_routes.go` 的显式表里，均为 `accessTokenScopeRule(...)`，**不是** `accessTokenAnyRule`。
- 鉴权先于参数校验（匿名带非法参数仍是 401，而非 400）。
- root-only `/api/partner-tenants`（列表/创建/轮换/状态）路由、handler、PAT 规则（`accessTokenSessionRule`）**一行未改**；options 不调用 `ListPartnerTenants`，不复用其响应。

### A.4 文件所有权（本阶段创建 / 修改）

新建：

| 文件 | 内容 |
| --- | --- |
| `model/partner_tenant_owner.go` | owner 单条/批量、request-local 快照、options 查询、有界错误 |
| `controller/partner_tenant_options.go` | 共享 options handler、规范 ID 解析器 |
| `model/partner_tenant_usage_owner_test.go` | 6 个顶层测试（2 个无库：结构 + nil DB；4 个 pq） |
| `controller/partner_tenant_usage_options_test.go` | 2 个顶层测试（1 个纯解析器 + 1 个 pq HTTP 投影） |
| `router/partner_tenant_usage_options_test.go` | 2 个顶层测试（1 个无库路由/规则声明 + 1 个 pq 真实 `SetApiRouter` 鉴权） |
| `.trellis/tasks/11-17-partner-usage-logs/verification.md` | 本记录（`.trellis/` 被 git 忽略，提交需按精确路径 force-add） |

修改：

| 文件 | 改动 |
| --- | --- |
| `router/api-router.go` | 新增两条 GET 路由（+5 行，含注释） |
| `middleware/access_token_routes.go` | 新增两条显式 scope 规则（+2 行） |
| `controller/partner_oauth_client.go` | 授权日志 `tenant_id` 过滤改为调用共享 `parseCanonicalPositiveInt64`（等价重构，-2/+2 行；语义不变：`ParseInt` 失败 / `<= 0` / 非规范文本 → 400） |
| `model/task_cas_test.go` | `TestMain` 新增 `TEST_PARTNER_USAGE_POSTGRES_DSN` / `PartnerTenantUsage` 旁路分支（+5 行） |
| `service/task_billing_test.go` | 同上旁路分支（+5 行）；A 阶段 service 包暂无 usage 测试 |
| `docs/partner-tenant-api.md` | 新增“Administrator read-only merchant options”一节（+55 行；其中 3 行为 trellis-check 补充的 legacy 令牌说明、`q` 大小写折叠说明、桌面端错误码） |
| `.trellis/tasks/11-17-partner-usage-logs/implement.md` | 仅勾选 A 阶段并标注运行待验证 |
| `TEMPORARY_ARTIFACTS.md` | 登记一个 bash 工具自动溢出日志与本阶段产物说明 |

文档选择：`docs/partner-tenant-api.md`。理由：它是仓库里唯一已描述 Tenant 概念与 root-only 管理端点（`POST /api/partner-tenants`）的文档，管理员可在同一处看到“管理 API 仍 root-only / options 为只读安全投影”的对照。`docs/openapi/api.json` 虽有 `/api/log/`、`/api/user/search` 的浅层桩，但没有任何 partner-tenant / partner-oauth 管理端点条目，且为导出式大文件；`docs/partner-tenant-integration.zh-CN.md` 是用户维护的商户接入指南，未触碰。list/stat schema 留给 B 阶段。

### A.5 实际执行的命令与真实结果

工具链：`GO126=/Users/lyh_god/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.26.10.darwin-arm64/bin/go`（`go version go1.26.10 darwin/arm64`），`gofmt` 取同目录二进制。退出码均以 `out=$(cmd 2>&1); rc=$?` 采集，输出只进 shell 变量，未建临时文件。

| # | 命令 | 真实结果 | 证据性质 |
| --- | --- | --- | --- |
| 1 | `gofmt -l` 5 个首批触碰文件（模型/控制器/路由/PAT 规则写完后） | rc=0，无输出 | 格式 |
| 2 | `GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOFLAGS=-mod=readonly "$GO126" build ./model ./controller ./router ./middleware ./service` | rc=0 | **仅编译** |
| 3 | `gofmt -l` 全部 10 个触碰 Go 文件（测试源码写完后） | rc=0，无输出 | 格式 |
| 4 | 同环境 `"$GO126" vet ./model ./controller ./router ./middleware ./service` | rc=0，0 行输出 | **仅类型检查**（含 `_test.go`），未执行测试 |
| 5 | 改一个子测试名后 `gofmt -l model/partner_tenant_usage_owner_test.go` | rc=0，**列出该文件**（map 字面量对齐） | 格式不合格 |
| 6 | `gofmt -d` 查看差异后 `gofmt -w model/partner_tenant_usage_owner_test.go`，再 `gofmt -l` | `-w` rc=0；复查 rc=0 无输出；未生成 `.orig` 文件（已 `ls model/*.orig` 确认） | 格式修复 |
| 7 | 最终 `gofmt -l` 全部 10 个触碰 Go 文件 | rc=0，无输出 | 格式 |
| 8 | 最终离线 `go build`（同 #2 包列表） | rc=0，0 行输出 | **仅编译** |
| 9 | 最终离线 `go vet`（同 #4 包列表） | rc=0，0 行输出 | **仅类型检查** |
| 10 | `git diff --check` | rc=0 | 仅覆盖已跟踪文件 |
| 11 | 对 5 个新建 Go 文件与本记录 `grep -c '[[:space:]]$'` | 均为 0 行行尾空白 | 新文件空白检查 |
| 12 | `git status --short`、`git diff --cached --name-only` | 暂存区为空；受保护路径仍为原有 `??` 状态、未变化 | 未暂存 |
| 13 | 文档 / 记录写完后复跑：`gofmt -l` 10 个 Go 文件、`git diff --check`、新文件与本记录行尾空白、`git diff --cached --name-only`、`git status --short go.mod go.sum web/bun.lock web/package.json`、`ls model/*.orig controller/*.orig router/*.orig` | gofmt rc=0 无输出；diff --check rc=0；行尾空白均 0；暂存区空；依赖/lockfile 无变化；无 `.orig` | 收尾检查（#8/#9 之后没有再改任何 Go 文件） |

未执行：任何 `go test`（宿主机禁止）、任何数据库/容器命令、任何前端命令、`docker` 探测（本子代理未再探测，沿用派发说明中的实测结论）。

### A.6 Go 测试执行数

- 执行数：**0**。skip 数：**未测**（没有任何测试被执行）。
- 原因：宿主机禁止 `go test`（含“纯”测试）；Docker daemon 不可连接且本会话不得启动；不得以 SQLite / MySQL / 生产库替代 PostgreSQL。
- 已写入、**仅通过 vet 类型检查**的 10 个顶层测试（全部以 `TestPartnerTenantUsage` 开头；其中 `…OwnerNilDatabase` 及若干子测试由 trellis-check 补充，见 A.11）：
  - model：`TestPartnerTenantUsageOwnerProjectionShape`（纯）、`…OwnerNilDatabase`（无库）、`…OwnerSingleLookup`、`…OwnerBatchLookup`、`…OwnerRequestSnapshot`、`…OptionsQuery`
  - controller：`TestPartnerTenantUsageCanonicalIDParser`（纯）、`…OptionsHTTPProjection`
  - router：`TestPartnerTenantUsageOptionsRouteDeclarations`（无库）、`…OptionsProductionRouteAuth`
- 6 个 pq 测试在缺少 `TEST_PARTNER_USAGE_POSTGRES_DSN` 时以 `require.NotEmpty` **失败**（不是 skip）。无论失败还是被跳过，**缺 DSN 都不是通过**。4 个无库测试即使单独变绿也不构成 A 阶段运行验收。
- 断言覆盖（源码层面，待运行证明）：external / subscription_key 成员；停用商户；停用账号（+停用用户 + 过期商户订阅）；商户行缺失（仍为成员、空名）；软删除用户；普通用户 / 持普通订阅的普通用户 / `p_` 用户名且同组 / 仅 Partner OAuth·Server 关系 → 确认非成员；强制查询失败 → error 且非“非成员”、错误文本有界；`DB == nil` 在单查 / 批量 / request memo / options 各路径均为查询失败且不 memo；空 `identity_source` 读作 `external`；不读不写 bool 缓存；后建映射立即可见（无共享负缓存）；批量 = 单查且整页 1 条查询、空批量 0 条、大输入按 500 分块、首块与后续块失败均无部分结果；request memo 按 user ID 隔离、nil context 直查、请求间不共享、失败不 memo、错配或非快照类型的 memo 条目不被采用；options 恰好 `id`/`name`、ID 为字符串且 >2^53 精确、含停用、页上限、选中项跨页解析、字面量通配、严格参数 400 且不触库（带计数器正向对照）、503 不泄漏；真实 `SetApiRouter` 下匿名 / 普通 / 商户子账号 / admin / root / 管理员桌面端会话 / 各 PAT 组合；root-only 管理 API 未放宽且响应键集合不变；全部响应体与 DEBUG SQL 不含秘密标记。

### A.7 Fixture 风险审计

| Fixture | DSN / schema | 修改的进程全局状态（均在 `t.Cleanup` 还原，除注明） | 删除 / drop |
| --- | --- | --- | --- |
| `model.setupPartnerTenantUsagePQ` → 复用既有 `setupPartnerTenantIsolatedPQ`（`model/partner_tenant_subscription_key_test.go:29`） | 显式 `TEST_PARTNER_USAGE_POSTGRES_DSN`；先 `require.NotEmpty`，因此既有 helper 的空 DSN `t.Skip` 分支对本套件不可达。schema `pt_usage_owner_single_` / `pt_usage_owner_batch_` / `pt_usage_owner_request_` / `pt_usage_options_model_` + UnixNano，**保留** | `model.DB`；`common` 主/日志库类型（→PostgreSQL）；`common.CryptoSecret`（fixture 常量）；`common.RedisEnabled=false`；`initCol()` 列名全局；`partnerTenantMembershipCache` 前后各 purge 一次。**不设置 `LOG_DB`**（TestMain 旁路下为 nil；A 阶段模型测试不用它）。本套件额外：两个子测试内把 `DB` 换成带 Info logger 的 session 后还原；无库测试 `…OwnerNilDatabase` 把 `DB` 临时置为 `nil` 并在 `t.Cleanup` 还原（旁路模式下原值本就是 `nil`）；一个子测试对 bool 缓存 `Set` 后 purge；GORM Query 回调只注册在本 fixture 自己的 `*gorm.DB` 上并移除 | 无 `DROP` / `TRUNCATE`。只对**自己创建**的行做 update 与一次 `User` 软删除。迁移用生产 helper `MigratePartnerTenantIntegrationModes`、`MigratePartnerTenantSubscriptionKeys`：后者内含“若存在旧索引 `idx_partner_tenant_external_user` 则 DropIndex”，全新 schema 中该索引不存在，且作用域限于 search_path 的本 schema |
| `controller.setupPartnerTenantUsageHTTPPQ`（新写，自包含） | 同一 DSN；schema `pt_usage_options_http_` + UnixNano，保留；schema 内**只有** `partner_tenants` 一张表 | `model.DB`；数据库类型；`common.RedisEnabled`；`gin.DefaultErrorWriter`（在 `common.LogWriterMu` 下替换并还原）；`gin.SetMode(TestMode)`（**不还原**，与既有测试一致）；回调仅在自有 DB。不改 `LOG_DB` | 无 |
| `router.setupPartnerTenantUsageRouterPQ`（新写，自包含） | 同一 DSN；schema `pt_usage_options_router_` + UnixNano，保留 | `model.DB` 与 `model.LOG_DB`（同一连接，等同共享 LOG_DB 模式，PAT 访问审计写入本 schema 的 `audit_logs`）；数据库类型；`common.RedisEnabled`；bool 缓存 purge；测试内 `common.SessionSecret` / `IsMasterNode` / `GlobalApiRateLimitEnable`；`SetApiRouter` 向进程级 PAT permission-rule 注册表做幂等声明（与既有测试相同）；`gin.SetMode`（不还原）。**不调用** `authz.Init`，不改 Casbin 状态 | 无 |
| `model/task_cas_test.go` / `service/task_billing_test.go` 的 `TestMain` 旁路 | 设了 `TEST_PARTNER_USAGE_POSTGRES_DSN` **或** `-run` 含 `PartnerTenantUsage` 时跳过内存 SQLite 引导 | 旁路时不替换 `DB` / `LOG_DB`、不改数据库类型 | 旧夹具的 `DELETE FROM …`（如 service `truncate`）只作用于其自建的内存 SQLite；旁路生效时这些旧测试没有可用 DB |

注意事项：

1. 这些 fixture 依赖进程全局变量，**不可并行**；测试未调用 `t.Parallel()`。
2. 设置了该 DSN 时**必须**配合 `-run '^TestPartnerTenantUsage'`：否则同包旧测试会在没有 SQLite 引导的情况下运行（`DB == nil`），对 nil `*gorm.DB` 的调用会 **panic 并中止该包的整个测试进程**（同一进程里的 usage 测试结果也随之丢失）——不会误写 pq（`model.DB` 只在 usage 测试生命周期内指向 pq，结束即还原）。这与前组 AccessMode / AuthorizationAudit / SubscriptionKey 旁路的既有约束相同。
3. 未设 DSN、未选中前缀时 usage 测试若被全包运行，会在 SQLite 引导之后于 `require.NotEmpty(dsn)` 处失败，**不会**在 SQLite 上执行任何断言。
4. 保留的 schema 会累积（每次运行每个 pq 测试 1 个）；清理需用户另行批准。

### A.8 未解决阻塞项

1. **Docker daemon 不可用** → 10 个 `^TestPartnerTenantUsage` 测试、PostgreSQL 上的实际 SQL（别名 + LEFT JOIN + `Find` 映射、`LIKE … ESCAPE '!'`）、gin 路由树注册（`/api/user/tenant-options` 与 `/api/user/:id` 并存只能在运行期由 `SetApiRouter` 是否 panic 证明）、PAT 矩阵、查询计数全部**未运行验证**。仅由源码与 GORM / gin 既有同类用法推导。
2. 既有 `TestAccessTokenRouteRulesCoverEveryDashboardRoute`（要求每条 `/api` 路由恰好声明一次）受本次新增路由影响，按源码应仍通过，但**未运行**。
3. 前组 `controller/partner_oauth_client.go` 的等价重构依赖前组 `^TestPartnerTenantAuthorizationAudit` 套件回归，该套件同样 0 执行。
4. 未写 `.trellis/spec`：契约运行验证后再落 spec。

### A.9 与派发契约的偏差 / 自行决定的技术细节（请主会话确认）

1. **`userID <= 0`**：未设特殊分支，按数据库事实返回“确认非成员”（`CreatePartnerTenantAccountWithTx` 拒绝 `UserId <= 0`，不存在这种映射）。C 阶段若希望“无身份事件”不落默认表，应在 writer 处自行判断，不要依赖本原语报错。
2. **未知查询参数 → 400**：比多数后台列表接口更严，与前组授权日志 handler 的做法一致；派发契约只列了“非规范/重复/越界/非法分页”，未知参数是我按同一家族惯例加严的。
3. **抽取共享解析器并改动前组文件 3 行**（`controller/partner_oauth_client.go`），以避免出现第二个可能分叉的规范 ID 解析器。
4. **响应在分页信封旁新增 `selected`**（对象或 `null`），选中项参数名定为 `selected_id`（而不是 `tenant_id`，避免与 B 阶段 list/stat 的过滤参数语义混淆）。
5. **错误用 HTTP 400 / 503**（带 `message_key`），而非旧式 HTTP 200 + `success:false`；400 为派发要求，503 沿用前组授权日志 handler 的做法。
6. **失败不 memo、确认非成员在请求内 memo**。依据：Tenant 账号只随新建用户一起创建，已鉴权的既有用户不会在请求中途变成成员；测试中“先非成员、后建映射”的用例只为证明没有**共享**负缓存，并证明旧请求保留自身快照。
7. **`q` 只匹配商户名**，不匹配 ID；按 ID 定位用 `selected_id`。
8. **`ListPartnerTenantOptions` 对越界参数报错而非静默钳制**。
9. **`PartnerTenantOwner` / `PartnerTenantOption` 字段全部 `json:"-"`**：强制消费者写显式 DTO（ID 为字符串）。user-classification 需自行定义输出字段。
10. **`identity_source` 空值归一为 `external`**（与 `MigratePartnerTenantSubscriptionKeys` 的回填规则一致）。
11. 未改 `docs/openapi/api.json`。

### A.10 提供给后续阶段的普查差异（只读发现，未改动）

写入口（除父 research 已列者外）：

- `controller/channel-test.go:570`、`controller/iq_executor.go:221` 直接调用 `model.RecordConsumeLog`（父 verification 已记录）。两处传入的 `userId` 是显式参数（`testUserID` / `userID`）；当前 `channel-test.go:176` 把同一个值写入 context 的 `"id"`，二者目前一致。C 阶段仍应用**写入口收到的 user ID 参数**调 `PartnerTenantOwnerForRequest`（本原语按传入 ID 做 memo 键），不要另取 `c.GetInt("id")`，以免两者日后分叉时归属错位。
- `createLog` 的全部调用点：`model/log.go:163,206,273,319,385,454` 与 `model/cashback_state.go:933`；其中只有 `:319`（error）、`:385`（consume）、`:454`（task billing）属于目标类型，其余（RecordLog / 管理 / 登录 / topup / cashback）不得被 blanket 重定向。
- `service/task_billing.go:351-357` 按差额正负在 consume / refund 间选类型后调用 `RecordTaskBillingLog`（`:365`）；`service/midjourney.go:141` 为退款。

读取方（父 research 未列，B/C 阶段需决定口径）：

- `model/cashback_refund_report.go:108`：管理员返现“recorded spend”报告按 `user_id` + `type=consume` 汇总 `logs`。C 阶段切写后，Tenant 用户的新消费不在 `logs`，该报告对 Tenant 用户将只含旧行。它属于管理员默认来源（按契约不 union），但需要在 B/C 明确披露或确认 Tenant 用户与返现无关。
- `model/partner_account.go:1068 ListPartnerAccountUsage`（`controller/partner_server_accounts.go:284`）：PartnerServer 子账号用量按 `user_id` 读 `logs`。PartnerServer 账号不是 Tenant（本阶段测试固定了这一点），其日志继续写默认表，预期不受影响；列出以免遗漏。
- `model/log.go:800 SumUsedToken` 目前仅有被注释掉的调用（`controller/log.go:266,300`），无活跃读者。

### A.11 trellis-check 复核（Stage A，2026-11-17）

> 完整发现、证据与 (a)–(h) 评估见同目录 `quality-review.stage-a.md`。结论：**未发现需要修改的实现缺陷**；修复集中在从未运行过的测试源码缺口与两处文档/记录不准确。状态仍是 **source-ready / runtime-blocked**，Go 测试执行数仍为 **0**。

复核范围：仅 A 阶段变更集（A.4 所列文件）。未开始、未预接 B/C/D。未触碰受保护路径；检索只用 `git grep`（已跟踪文件）与显式源码目录，没有以仓库根为起点的递归搜索。为核对 GORM / gin 行为只读查看了模块缓存 `gorm.io/gorm@v1.25.12`（`chainable_api.go`、`callbacks/query.go`、`scan.go`、`finisher_api.go`）与 `gin-gonic/gin@v1.9.1`（`context.go`）。

trellis-check 改动的文件：

| 文件 | 改动 | 性质 |
| --- | --- | --- |
| `model/partner_tenant_usage_owner_test.go` | 新增无库测试 `TestPartnerTenantUsageOwnerNilDatabase`；新增子测试“empty identity source reads as external”“failure in a later chunk returns no partial result”“a mismatched or malformed memo entry is never served”；“out-of-bounds…”子测试补计数器正向对照 | 测试缺口 |
| `controller/partner_tenant_usage_options_test.go` | “both entries share one projection” 先断言两个入口均为 200，再比较响应体（原写法两个入口同为 400 时也会通过） | 空洞断言 |
| `router/partner_tenant_usage_options_test.go` | 凭证矩阵新增“admin desktop-client session” → 两个入口均 403 `AUTH_DESKTOP_SCOPE_DENIED` | 矩阵行此前只有记录、没有断言 |
| `docs/partner-tenant-api.md` | 补 legacy（无 scope）令牌按既有全局规则不做 scope 检查的说明；`q` 非 ASCII 大小写折叠取决于数据库排序规则；错误表补 `AUTH_DESKTOP_SCOPE_DENIED` | 文档不准确 |
| 本文件 | A.3 补 legacy 令牌两行与桌面端错误码；A.4 / A.6 / A.7 / A.8 同步测试数量与新增覆盖；A.7 注意事项 2 把“失败”更正为“panic 并中止测试进程”；新增本节 | 记录同步 |
| `quality-review.stage-a.md` | 新建 | 持久复核记录 |
| `TEMPORARY_ARTIFACTS.md` | 登记 trellis-check 未产生任何临时产物 | 清单 |

没有改动任何非测试 Go 源码：`model/partner_tenant_owner.go`、`controller/partner_tenant_options.go`、`router/api-router.go`、`middleware/access_token_routes.go`、`controller/partner_oauth_client.go`、两个 `TestMain` 均保持实现子代理交付时的内容。

实际执行的命令（工具链与环境同 A.5；退出码以 `out=$(cmd 2>&1); rc=$?` 采集，输出只进 shell 变量）：

| # | 命令 | 真实结果 | 证据性质 |
| --- | --- | --- | --- |
| C1 | 改动前 `gofmt -l` 全部 10 个 Go 文件 | rc=0，无输出 | 格式 |
| C2 | 改动前离线 `go build ./model ./controller ./router ./middleware ./service` | rc=0，0 行输出 | **仅编译** |
| C3 | 改动前离线 `go vet`（同包列表） | rc=0，0 行输出 | **仅类型检查** |
| C4 | 改完三个测试文件后 `gofmt -l`（3 个测试文件）与离线 `go vet ./model ./controller ./router` | gofmt rc=0 无输出；vet rc=0，0 行输出 | 格式 / **仅类型检查** |
| C5 | 最终 `gofmt -l` 全部 10 个 Go 文件 | rc=0，无输出 | 格式 |
| C6 | 最终离线 `go build`（5 个包） | rc=0，0 行输出 | **仅编译** |
| C7 | 最终离线 `go vet`（5 个包） | rc=0，0 行输出 | **仅类型检查**（含全部 `_test.go`），未执行测试 |
| C8 | `git diff --check`；5 个新建 Go 文件 `grep -c '[[:space:]]$'`；`ls model/*.orig controller/*.orig router/*.orig` | rc=0；均为 0；无 `.orig` | 空白 / 残留检查 |
| C9 | `git diff --cached --name-only`；`git status --short go.mod go.sum web/bun.lock web/package.json`；`git diff --name-only -- controller/partner_tenant.go model/partner_tenant.go model/partner_tenant_integration_mode.go middleware/auth.go web` | 暂存区为空；依赖 / lockfile 无变化；root-only handler / 模型 / 鉴权中间件 / 前端均无改动 | 未暂存、范围核对 |

未执行：任何 `go test`、任何数据库 / 容器命令、任何前端命令、`docker` 探测。Go 测试执行数：**0**。C6 / C7 之后没有再改任何 Go 文件。

运行期待补门禁（均未运行）：

1. 任务自有 Docker + 隔离 PostgreSQL 中执行 `go test -mod=readonly ./model ./controller ./router ./middleware ./service -run '^TestPartnerTenantUsage' -count=1 -v`，确认恰好选中 10 个顶层测试（model 6、controller 2、router 2，middleware / service 0）、0 skip。
2. 同环境在 `./router` 执行 `-run '^TestAccessTokenRouteRulesCoverEveryDashboardRoute$'`（无库），证明两条新路由注册不 panic 且各恰好声明一次。
3. 前组 `^TestPartnerTenantAuthorizationAudit`（其自有 DSN）回归，证明 `tenant_id` 过滤的等价重构在运行期也不变。
4. MySQL / SQLite 仅有 SQL 推导，未运行；按数据库规范不扩大矩阵，如实披露。
5. 运行验证通过后再把 owner / options 契约写入 `.trellis/spec`。

## B 阶段 — B1a 表与迁移

> 状态（2026-11-17，trellis-implement 子代理，06:13 开始，约 12 分钟内完成源码与本交接）：**source-ready / runtime-blocked**。源码与测试源码已通过离线 `gofmt` / `go build` / `go vet`（vet 仅类型检查，含 `_test.go`）；**Go 测试执行数 0**，PostgreSQL / ClickHouse / MySQL / SQLite 上的 DDL、迁移、持久化全部**未运行验证**。本步只交付表模型、迁移 helper、一个无生产调用方的插入函数与测试源码；管理员 list/stat、任何 self/API-Key reader、union、三 writer、CNY、前端、spec 均未开始。

### B1a.1 表结构（`model/partner_tenant_usage_log.go`，`PartnerTenantUsageLog`，`TableName()` 固定 `partner_tenant_usage_logs`）

不嵌入 `Log`，不复用其 index tag。所有字段 `json:"-"`（强制读取方写显式 DTO，与 A 阶段 owner 投影同策略）。

| 列 | Go 类型 | 预期 PostgreSQL DDL | MySQL | ClickHouse |
| --- | --- | --- | --- | --- |
| `id` | int64，`primaryKey;autoIncrement` | `bigserial` PRIMARY KEY（catalog 为 bigint） | bigint AUTO_INCREMENT | `Int64 DEFAULT 0`（无自增，恒 0） |
| `event_id` | string | `varchar(64) NOT NULL DEFAULT ''` | varchar(64) | String |
| `created_at` | int64（`autoCreateTime:false`，是复制的事实不是 ORM 时间戳） | `bigint NOT NULL DEFAULT 0` | bigint | Int64 |
| `type` | int | `bigint NOT NULL DEFAULT 0`（Go int 在 pq 方言即 bigint，与 logs 相同） | bigint | Int32 |
| `tenant_id` / `account_id` | int64 | `bigint NOT NULL DEFAULT 0` | bigint | Int64 |
| `tenant_name` | string | `varchar(64) NOT NULL DEFAULT ''`（同 `PartnerTenant.Name`） | varchar(64) | String |
| `identity_source` | string | `varchar(24) NOT NULL DEFAULT ''`（同 `PartnerTenantAccount.IdentitySource`） | varchar(24) | String |
| `user_id` / `channel_id` / `token_id` | int64 | `bigint NOT NULL DEFAULT 0` | bigint | Int64 |
| `quota` / `prompt_tokens` / `completion_tokens` / `use_time` / `subscription_id` | int64 | `bigint NOT NULL DEFAULT 0` | bigint | Int64 |
| `is_stream` | bool | `boolean NOT NULL DEFAULT false` | boolean | UInt8 |
| `username` / `model_name` / `token_name` / `group` / `ip` | string，无 size | `text NOT NULL DEFAULT ''` | varchar(191)（有默认值的无 size 字符串，与 logs 在 MySQL 的实际类型一致） | String |
| `request_id` | string | `varchar(64) NOT NULL DEFAULT ''`（同 logs） | varchar(64) | String |
| `upstream_request_id` | string | `varchar(128) NOT NULL DEFAULT ''`（同 logs） | varchar(128) | String |
| `content` / `other` | string，无 size、无 default | `text`（可空，同 logs；**不会**是 `varchar(n)`） | longtext | String |

依据：只读核对模块缓存 `gorm.io/driver/postgres@v1.5.9/postgres.go:194-265`（无 size 字符串 → `text`；`type:` 自定义类型原样输出；自增 64 位 → `bigserial`）与 `gorm.io/driver/mysql@v1.5.7/mysql.go:389-412`（size=0 且无默认/索引 → `longtext`；有默认 → `varchar(191)`）。没有任何 `size:` / `serializer:` tag，不存在超过 10485760 的 varchar。pq 上各列长度上限均不小于 logs / 来源列，不新增“logs 能写而新表因长度写失败”的情形。

不含：external buyer id 及其 hash、secret hash、key/token 字符串、seed。`subscription_id` 只由写入方填已知事实，否则为 0，之后不回查。

### B1a.2 索引与撞名检查

| 索引名 | 列 | 类型 |
| --- | --- | --- |
| `idx_ptul_tenant_time` | `(tenant_id, created_at, id)` | 普通 |
| `idx_ptul_user_time` | `(user_id, created_at, id)` | 普通 |
| `idx_ptul_token_time` | `(token_id, created_at, id)` | 普通 |
| `idx_ptul_request` | `(request_id)` | 普通，**非唯一**（重试/任务事实共享 request_id） |
| `ux_ptul_event` | `(event_id)` | 唯一（见 B1a.9 第 1 条，待确认） |
| `partner_tenant_usage_logs_pkey` | `(id)` | pq 自动主键 |

名称最长 20 字节（< 63）；MySQL 下被索引的 varchar 为 64 字符（utf8mb4 256 字节，远低于 767）。未加 username/model/group/ip/channel 等低价值索引。

撞名检查：`git grep -hoE "(index|uniqueIndex):[a-zA-Z0-9_]+" -- 'model/*.go'` 得到的全部显式索引名（共 69 个）：idx_admin_quota_credit_user_id、idx_audit_time_event、idx_audit_token_time、idx_audit_user_time、idx_auth_flow_purpose_expiry、idx_casbin_rule、idx_casbin_rule_unique、idx_cashback_beneficiary_created、idx_cashback_beneficiary_debt、idx_cashback_beneficiary_paid、idx_cashback_device_user、idx_cashback_mutation_reward_kind、idx_cashback_mutation_topup_kind、idx_cashback_principal_debt、idx_cashback_settlement_scan、idx_created_at_id、idx_created_at_type、idx_custom_domains_active_owner、idx_custom_domains_label、idx_external_identity_subject、idx_external_identity_user、idx_iq_history_group_run、idx_logs_request_id、idx_logs_upstream_request_id、idx_partner_account_client_created、idx_partner_account_payment_account_created、idx_partner_account_payment_client_created、idx_partner_payment_binding_created、idx_partner_tenant_external_user、idx_partner_tenant_idempotency、idx_perf_bucket_ts、idx_perf_model_group_bucket、idx_pt_account_external_hash、idx_pt_account_source_order、idx_pt_auth_tenant、idx_pt_order_budget、idx_pt_order_delivery、idx_pt_order_request、idx_pt_purchase_budget、idx_pt_purchase_buyer、idx_pt_purchase_request、idx_pt_subkey_account、idx_pt_subkey_hash、idx_pt_subkey_rotate_request、idx_pt_subkey_subscription、idx_qdt_created_at、idx_qdt_model_user_name、idx_user_checkin_date、idx_user_id_id、idx_user_sessions_expires_at、idx_user_sessions_status_revoked、idx_user_sessions_user_created、idx_user_sessions_user_status_expiry、idx_user_sub_active、idx_wallet_refund_credit_user_id、index_username_model_name、uk_model_name_delete_at、uk_prefill_name、uk_task_plugin_key_version、uk_vendor_name_delete_at、ux_admin_quota_credit_event_key、ux_cashback_topup_direction、ux_cashback_user_device、ux_partner_account_external、ux_partner_account_payment_idempotency、ux_partner_payment_idempotency、ux_provider_userid、ux_user_provider、ux_wallet_refund_credit_event_key。没有任何一个以 `idx_ptul_` / `ux_ptul_` 开头。未命名 `gorm:"index"` 产生的隐式名为 `idx_<表名>_<列名>`（带各自表名），同样不可能落入该前缀。检查范围是已跟踪的 `model/*.go` 显式 tag；另用 `git grep -n "CREATE.*INDEX" -- model/*.go`（排除测试）确认 model 生产源码中没有手写建索引语句（无命中）。其他包未逐一枚举，最终以“共享库”pq 用例（同一 schema 内已有主库表 + logs + audit_logs + 授权日志）实际迁移不报错为准——**未运行**。

### B1a.3 group 列决定

列名保持 `group`（与 `logs` 相同，ClickHouse DDL 中写作 `` `group` ``）。GORM 在 DDL / INSERT / 结构体查询中按方言自动加引号（pq `"group"`，MySQL/SQLite/ClickHouse 反引号）；任何手写 SQL 片段必须使用既有 `logGroupCol`（`model/main.go` `initCol`：pq → `"group"`，其余 → `` `group` ``）。这样后续 union reader 两个分支可用同一个 `logGroupCol` 投影/过滤，无需 `AS "group"` 改名。

### B1a.4 迁移 helper 与接线

- `MigratePartnerTenantUsageLogs() error`（导出、幂等）：SQL 驱动 → `LOG_DB.AutoMigrate(&PartnerTenantUsageLog{})`（只此一个模型）；ClickHouse → 显式 `CREATE TABLE IF NOT EXISTS` + TTL 同步，不走 AutoMigrate。`LOG_DB == nil` 返回 `ErrPartnerTenantUsageLogUnavailable`。不读/扫/复制/移动/删除 `logs`，不碰付款表或任何主库表。
- 接线点 1（共享 `LOG_DB = DB`）：`model/main.go:248`，`InitLogDB` 的 master 分支，位于 `MigrateAuditLogs`、`MigratePartnerOAuthAuthorizationLogs` 之后；前者的错误改为显式返回后再调用本 helper，本 helper 的错误直接返回。
- 接线点 2（独立日志库）：`model/main.go:454`，`migrateLOGDB` 中 `MigratePartnerOAuthAuthorizationLogs` 之后、ClickHouse 分支 return 之前，因此对每种日志驱动都执行；错误返回不吞。
- 未改 `CountOldLog` / `DeleteOldLogBatch`，SQL 新表没有任何自动删除。

### B1a.5 ClickHouse 语句（纯函数，可契约测试；**无 live ClickHouse 验证**）

- `partnerTenantUsageLogClickHouseCreateTableSQL(ttlDays)`：`CREATE TABLE IF NOT EXISTS partner_tenant_usage_logs (...) ENGINE = MergeTree() PARTITION BY toYYYYMM(toDateTime(created_at)) ORDER BY (created_at, event_id)`，`ttlDays > 0` 时追加 `\nTTL toDateTime(created_at) + INTERVAL n DAY DELETE`（复用 `clickHouseLogTTLClause`）。id、created_at、tenant/account/user/channel/token/subscription ID、quota、tokens、use_time 均 `Int64`；`type Int32`；`is_stream UInt8`；其余 `String`；全部带 DEFAULT。
- `partnerTenantUsageLogClickHouseTTLStatement(ttlDays, hasTTL)`：`ALTER TABLE partner_tenant_usage_logs MODIFY TTL <expr>`；未配置且表上已有 TTL → `ALTER TABLE partner_tenant_usage_logs REMOVE TTL`；否则空串（不执行）。
- `partnerTenantUsageLogClickHouseShowCreateSQL()`：`SHOW CREATE TABLE partner_tenant_usage_logs`；`syncPartnerTenantUsageLogClickHouseTTL` 仅在未配置 TTL 时读取它并用既有 `clickHouseCreateTableHasTTL` 判断。沿用 `LOG_SQL_CLICKHOUSE_TTL_DAYS`（`clickHouseLogTTLDays`），流程与 `logs` 的 `syncClickHouseLogTTL` 一致。`logs` 的 DDL/TTL 函数未改。

### B1a.6 插入函数与“无生产调用方”证明

- `insertPartnerTenantUsageLog(row *PartnerTenantUsageLog) error`（未导出）：校验 `tenant_id/account_id/user_id > 0` 且 `type ∈ {consume, error}`，否则 `ErrPartnerTenantUsageLogInvalid`；丢弃调用方给的 `Id` / `EventId`，生成 `event_id = "ptu_" + 32 位 hex`（`crypto/rand` 16 字节，非秘密、不源自任何凭证/请求内容）；`created_at == 0` 时取当前时间；`request_id` 为空时按 `ensureLogRequestId` 同一规则生成；通过 `LOG_DB.Session(&gorm.Session{Logger: gormlogger.Default.LogMode(gormlogger.Silent)})` 单次 `Create`（与授权日志 writer 相同的静默会话，DEBUG 下也不输出插值 SQL）。失败只返回固定哨兵 `ErrPartnerTenantUsageLogWrite` / `...Unavailable`，**不包装底层错误**（`errors.Unwrap == nil`），文本不含 SQL/参数/行内容。无回退 `logs`，无双写，函数自身不打应用日志。
- 证明（本次实际执行）：
  - `git grep -n "insertPartnerTenantUsageLog" -- '*.go'` → rc=1、无输出（已跟踪文件中零引用）。
  - `git grep --untracked -n "insertPartnerTenantUsageLog" -- model controller router middleware service common setting relay` → 仅命中 `model/partner_tenant_usage_log.go`（注释 + 定义，第 88/92 行）与 `model/partner_tenant_usage_log_test.go`。
  - `git grep --untracked -n -e "PartnerTenantUsageLog\b" -e "partner_tenant_usage_logs" -e "partnerTenantUsageLogTable" -- <同上目录>` 过滤掉这两个新文件后为空：除 `model/main.go` 的迁移调用（`MigratePartnerTenantUsageLogs`）外，没有任何生产代码引用新表/模型。
  - `RecordConsumeLog` / `RecordErrorLog` / `RecordTaskBillingLog` / `createLog` 及 service/controller/relay 均未修改（`git status`：仅 `model/main.go` 被修改，另有两个新 model 文件）。

### B1a.7 文件

- 新增：`model/partner_tenant_usage_log.go`（204 行）、`model/partner_tenant_usage_log_test.go`（482 行）。
- 修改：`model/main.go`（+8/-1，两处接线）、本文件、`implement.md`（B 节备注）。
- 未改：`go.mod` / `go.sum` / lockfile、`.trellis/spec`、前端、任何受保护路径。

### B1a.8 实际执行的命令（均在宿主机；`GO126` = 既有 go1.26.10 工具链，`GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOFLAGS=-mod=readonly`）

| 命令 | 退出码 | 性质 |
| --- | --- | --- |
| `gofmt -l model/partner_tenant_usage_log.go model/partner_tenant_usage_log_test.go model/main.go` | 0，无输出 | 格式检查 |
| `"$GO126" build ./model ./controller ./router ./middleware ./service` | 0，无输出 | 仅编译（type-checked，不含测试文件） |
| `"$GO126" vet ./model ./controller ./router ./middleware ./service` | 0，无输出 | 仅类型检查/静态分析（含 `_test.go`），**不是执行** |
| `"$GO126" list -f '{{join .TestGoFiles "\n"}}' ./model` | 0；新测试文件在列 | 确认测试源码属于包（不运行测试） |
| 上述三条 `git grep` | 1 / 0 / 0 | 调用方证明 |

退出码用 `out=$(cmd 2>&1); rc=$?` 采集；中途还对 `./model` 单独跑过一次 build、一次 vet（均 rc=0）。**更正（trellis-check B1 复核）：** 原文“最终一轮 gofmt/build/vet 是在最后一次源码修改之后执行的”经其作者报告为不准确，B1a 步骤结束时并未在最后一次改动之后重跑完整的五包 build/vet，上表不能作为 B1a 最终源码状态的类型检查证据。当前工作区（含 B1a、B1b、B2a、B2b 与本次复核改动）的 gofmt / 五包 build / 五包 vet 以 `quality-review.stage-b1.md` 第 6 节为准（均 rc=0，仅类型检查）。未运行 `go test`（任何包/选择器），未启动/重启 Docker，未下载模块或工具链。

**Go tests executed: 0**——Docker daemon 不可达且不得启动，按规则不在宿主机运行 `go test`，也不以 SQLite/MySQL 代替 pq。

### B1a.9 自行决定、需主会话确认的技术细节

1. **`event_id` 用唯一索引 `ux_ptul_event`**（派发只要求“indexed”）。理由：128 位随机值不存在误冲突，唯一性让后续 union/排序可把它当确定性 tie-breaker。ClickHouse 无唯一约束，仅靠生成保证。若只要普通索引，改一个 tag 即可（表尚未在任何环境创建）。
2. **`user_id` / `channel_id` / `token_id` / tokens / `use_time` 在 Go 侧为 int64**（`Log` 为 int）。pq 上两表同为 bigint；ClickHouse 上 `logs` 是 Int32 而新表是 Int64，union 需显式 cast（design §5 已预告）。
3. **插入函数做最小不变量校验**（owner 三个 ID > 0、type 仅 consume/error），拒绝时不落库。C 阶段若出现 `tenant_id` 合法但 `account_id`/`user_id` 为 0 的事件会被拒，这是有意的（不写无归属行）。
4. **空 `request_id` 自动生成**，与 `createLog` 的 `ensureLogRequestId` 对齐；C 阶段仍应先在构造 `Log` 时生成，以便告警与行使用同一 ID。
5. **错误不包装底层 cause**：比 A 阶段 owner 错误（可 `Unwrap`）更严，调用方无法区分具体数据库原因；告警只能写受控文案 + 关联 ID。
6. **ClickHouse `ORDER BY (created_at, event_id)`**：与 `logs` 的 `(created_at, request_id)` 同构，便于联合排序；没有把 `tenant_id` 放进排序键。
7. **`username`/`model_name`/`token_name`/`group`/`ip` 在 pq 为 `text`**（与 logs 一致），未加长度上限，避免新增写失败路径。
8. 未提供 `Log + owner → PartnerTenantUsageLog` 的转换函数（属于 C 阶段切写），也未提供任何查询函数。

### B1a.10 测试源码（7 个顶层，全部 `TestPartnerTenantUsageLog…`，**均未执行**）

无库（3）：`TestPartnerTenantUsageLogSchemaShape`（列顺序、pq 方言 DDL 类型、MySQL 关键列类型、索引名/列/唯一性、≤63 字节、与 `Log`/`AuditLog`/`PartnerOauthAuthorizationLog` 索引名不相交、无凭证类列名）、`TestPartnerTenantUsageLogClickHouseDDL`（**仅生成 SQL 的契约检查，无 live ClickHouse**：CREATE 类型、PARTITION/ORDER BY、TTL 有/无、MODIFY/REMOVE、logs 语句不受影响）、`TestPartnerTenantUsageLogInsertRejectsWithoutDatabase`。

pq（4，需 `TEST_PARTNER_USAGE_POSTGRES_DSN`，缺失即失败不 skip）：
- `TestPartnerTenantUsageLogMigrationSharedDatabase`：同一 schema 已有主库表、`logs`（预置 3 行，含 consume/error/topup）、`audit_logs`、授权日志；经**真实 `InitLogDB()` 共享分支**（`LOG_SQL_DSN` 置空、`IsMasterNode=true`）迁移两次；断言 catalog 列类型/索引、`logs` 行与索引逐字节不变（`to_jsonb(t)::text` 与 `pg_indexes`）、新表为空（无历史搬迁）、插入一行后重复迁移行不变、插入不写 `logs`。
- `TestPartnerTenantUsageLogMigrationSeparateLogDatabase`：主 schema 与独立日志 schema；经**真实 `migrateLOGDB()`** 两次 + 一次；新表只在日志 schema，主 schema 无此表，主库 `logs` 不变。
- `TestPartnerTenantUsageLogPersistence`：每个 64 位列写入 > 2^53 的值（`tenant_id`=MaxInt64、`quota`=MaxInt64-1，`id` 列通过测试内直接 `Create` 指定 2^53+1）并按 `::text` 与结构体双重回读；`content`/`other` > 64 KiB 原样回读；同 `request_id` 两行并存且 `event_id` 非空、互异、唯一；调用方 `Id`/`EventId` 被丢弃；零 `created_at` 补时间、空 `request_id` 生成；非法行（无 tenant/account/user、topup/refund/unknown）不落库且 `logs` 为 0 行。
- `TestPartnerTenantUsageLogInsertRedaction`：`LOG_DB` 换成 Info 级捕获 logger（先用一条普通查询做阳性对照证明它确实打印插值 SQL），带秘密标记的插入输出为空；回调注入含标记的失败与真实 pq 超长拒绝都只返回哨兵、文本无标记/SQL、无 `Unwrap`；失败后新表仍 1 行、`logs` 0 行（无回退/双写）。

### B1a.11 fixture / 全局状态风险审计

- 复用 `setupPartnerTenantUsagePQ`（A 阶段）与 `setupPartnerTenantIsolatedPQ`：每次调用新建唯一 schema 并**保留**（无 DROP/TRUNCATE/DELETE）；它们保存并还原 `DB`、主/日志数据库类型、`CryptoSecret`、`RedisEnabled`、membership 缓存。
- 本文件新增 `usePartnerTenantUsageLogDB`：保存/还原 `LOG_DB` 与日志数据库类型并 `initCol()`。共享用例另外保存/还原 `common.IsMasterNode`，`LOG_SQL_DSN` 用 `t.Setenv`（自动还原）。独立库用例里第二个 fixture 会把 `DB` 指到日志 schema，测试显式改回主 schema，两层 cleanup 按 LIFO 还原到原值。
- 注册的 GORM create 回调带唯一名并在 cleanup 移除；测试不调用 `t.Parallel()`（依赖进程全局变量，不可并行）。
- 未改 `model/task_cas_test.go` 的 `TestMain` 旁路；A.7 的注意事项（设了 DSN 必须配合 `-run '^TestPartnerTenantUsage'`）同样适用。
- `InitLogDB()` 在共享分支会 `SetLogDatabaseType(MainDatabaseType())`：fixture 已把两者设为 pq，cleanup 还原。
- 计划保留的 schema 前缀（每次运行各 1 个）：`pt_usage_log_shared_`、`pt_usage_log_main_`、`pt_usage_log_separate_`、`pt_usage_log_persist_`、`pt_usage_log_redact_`。本次**未创建**任何 schema/容器/临时文件。

### B1a.12 未关闭的运行门禁

1. 任务自有 Docker + 隔离 PostgreSQL 中执行 `go test -mod=readonly ./model -run '^TestPartnerTenantUsage' -count=1 -v`：确认选中 model 13 个顶层（A 阶段 6 + 本步 7）且无 skip；证明 pq 实际 DDL（特别是 `autoCreateTime:false`、`uniqueIndex`、`column:group`、`default:''` 的 text 列）与重复 AutoMigrate 幂等。
2. 测试中的若干断言依赖从未运行过的假设：`information_schema` / `pg_indexes` 的文本形态、`to_jsonb(t)::text` 扫描进 `[]string`、方言 `DataTypeOf` 的纯函数调用（`postgres.Dialector{Config:&postgres.Config{}}`）。首次运行若失败需先判断是测试假设还是实现问题。
3. ClickHouse：仅生成 SQL 检查；真实建表、`SHOW CREATE TABLE` 扫描、TTL MODIFY/REMOVE、GORM 插入（id 省略走 DEFAULT 0、bool→UInt8）**未运行**。MySQL / SQLite：仅按方言源码推导，未运行，不扩大矩阵。
4. 目标查询的 EXPLAIN（design §2“依真实 pq EXPLAIN 校验”）要等 B 的查询落地后才有意义，本步未做。
5. 在门禁 1 通过、且兼容 reader（B 后续步骤）验证之前，**不得**让任何生产路径调用 `insertPartnerTenantUsageLog`。

## B 阶段 — B1b 管理员查询与统计

> 状态（2026-11-17，派发起始 06:27:44，25 分钟硬预算）：**source-ready / runtime pending**。只交付新表的管理员读取侧（list + stat + 路由 + PAT + 文档 + 测试源码）。**Go 测试执行数 0**；Docker daemon 不可用且未被授权启动。writer 仍未启用；self/API-Key reader、union、切写、前端均未开始。

### B1b.1 最终 Go 签名

`model/partner_tenant_usage_query.go`（新文件）：

```go
var ErrPartnerTenantUsageLogFilter // 非法 filter（调用方 bug / 越界），不触库
var ErrPartnerTenantUsageLogRead   // 固定文本；驱动错误被丢弃，不含 SQL/参数/行内容

type PartnerTenantUsageFilter struct {
    TenantId, UserId int64
    Username, ModelName, RequestId string // 精确匹配，空 = 不过滤
    Type int                               // LogTypeUnknown=consume+error；或 LogTypeConsume / LogTypeError
    StartTimestamp, EndTimestamp int64     // 生效的闭区间窗口，始终施加
}
func (f PartnerTenantUsageFilter) apply(tx *gorm.DB) *gorm.DB // 唯一的谓词构造处；list/count/stat 共用

type PartnerTenantUsageLogRecord struct { PartnerTenantUsageLog; ChannelName string }
func ListPartnerTenantUsageLogs(ctx context.Context, filter PartnerTenantUsageFilter, offset, limit int, root bool) ([]PartnerTenantUsageLogRecord, int64, error)

type PartnerTenantUsageStat struct {
    RecordCount, RequestCount, SucceededCount, FailedCount int64
    Quota, PromptTokens, CompletionTokens *big.Int // 仅 consume 行
}
func GetPartnerTenantUsageStat(ctx context.Context, filter PartnerTenantUsageFilter) (*PartnerTenantUsageStat, error)
```

`model/log_summary.go`（抽出共享失败分类，行为中性，见 B1b.6）：

```go
func logViolationFeeMarked(fee bool, code string, marker string) bool
func logOutcomeFailed(logType int, isStream bool, violation bool, streamStatus string) bool
```

`controller/partner_tenant_usage_log.go`（新文件）：

```go
func GetPartnerTenantUsageLogs(c *gin.Context)     // GET /api/log/partner-tenants
func GetPartnerTenantUsageLogStat(c *gin.Context)  // GET /api/log/partner-tenants/stat
func parsePartnerTenantUsageLogQuery(c *gin.Context, paging bool) (filter, page, pageSize, ok) // 两端点共用的严格解析
func parseCanonicalNonNegativeInt64(raw string) (int64, bool)
```

路由（`router/api-router.go`，均 `middleware.AdminAuth()`）与 PAT（`middleware/access_token_routes.go`，均 `accessTokenScopeRule("log:read")`，不是 any 规则）：`GET /api/log/partner-tenants`、`GET /api/log/partner-tenants/stat`。

### B1b.2 参数表（按实现）

| 参数 | 规则 | 端点 |
| --- | --- | --- |
| `tenant_id`, `user_id` | 规范正 int64 十进制；空串/前导零/符号/溢出 → 400 | 两者 |
| `username` | 精确匹配；合法 UTF-8、无控制字符、≤191 字节；空串 = 不过滤 | 两者 |
| `model_name` | 同上，≤255 字节 | 两者 |
| `request_id` | 同上，≤64 字节（列宽） | 两者 |
| `type` | 仅 `consume` / `error`；省略 = 两者；空串 → 400 | 两者 |
| `start_timestamp`, `end_timestamp` | 规范非负十进制 Unix 秒；**`0` 等同省略**（沿用 `limitLogTimeRange` 与默认日志的既有约定）；两者均非零时须 start ≤ end | 两者 |
| `p` | 规范，1–1000000 | 仅 list（stat 上是未知参数 → 400） |
| `page_size` | 规范，1–100；默认 `common.ItemsPerPage`（越界时钳到 100） | 仅 list |

未知 / 重复 / 畸形 / 非规范 / 越界一律在任何查询前 HTTP 400 `Invalid parameters`。生效窗口：`start = limitLogTimeRange(start, end)`（管理员与 root 同样受限；超出最大范围 → 400）；`end` 省略时取服务器当前时间；`start` 省略时回溯配置的最大范围（下限钳到 0）；生效 start > 生效 end（例如只给了一个晚于当前时间的 start）→ 400。响应回报生效窗口。两个处理器在入口即设置 `Cache-Control: no-store`（成功与失败响应都带）。数据库失败 → 503 既有通用文案，仅记录固定文本 + request_id。

### B1b.3 响应（按实现，字段名与派发冻结契约一致）

list `data`：`page`、`page_size`、`total`（JSON number，行数）、`items`、`start_timestamp`、`end_timestamp`（JSON number）。

item：十进制字符串 `id`、`tenant_id`、`account_id`、`user_id`、`token_id`、`channel_id`、`subscription_id`（0/未知 → `""`）、`quota`、`prompt_tokens`、`completion_tokens`；字符串 `event_id`、`tenant_name`（行内冻结快照）、`identity_source`、`username`、`token_name`、`model_name`、`channel_name`、`group`、`ip`、`request_id`、`upstream_request_id`、`content`、`other`（角色投影后的 JSON 文本）；JSON number `created_at`、`type`（2/5）、`use_time`；布尔 `is_stream`；`quota_cny`（六位定点字符串或 `null`，每响应一个配置快照）。

stat `data`：十进制字符串 `record_count`、`request_count`、`succeeded_count`、`failed_count`、`quota`、`prompt_tokens`、`completion_tokens`、`tokens`；`quota_cny` 对象 = converter metadata（`currency`、`available`、可选 `reason`、`quota_per_unit`、`usd_to_cny_rate`、`scale`、`rounding`）+ `amount`（先汇总 raw quota 再换算一次；不可用时 `null`）；JSON number `start_timestamp`、`end_timestamp`。

### B1b.4 与冻结契约的偏差 / 自行决定（请主会话确认）

1. **精确求和不走 SQL `SUM`**：派发要求“read SQL sums as exact decimals/strings”。实现改为在折叠所需的同一次流式扫描里用 `math/big` 在 Go 侧累加 consume 行的 quota / prompt / completion。理由：折叠本来就必须流过所选的每一行；Go 侧累加在所有驱动上都精确（ClickHouse `sum(Int64)` 会回绕、SQLite 整数 `SUM` 溢出报错、pq `numeric` 与 MySQL `DECIMAL` 的扫描形态各异），且 `record_count`、请求折叠、求和来自**同一次读取**，不会因两条语句之间有新行而彼此不一致。未经过 float64 或 32 位整数。若主会话坚持 SQL `SUM`，需按驱动各写一条语句（改动局限在 `GetPartnerTenantUsageStat`）。
2. **时间范围超限的文案**：按冻结契约统一返回 400 `Invalid parameters`，没有复用 `limitLogTimeRange` 返回的“The time range cannot exceed N days”文案。改为具体文案只需改 `parsePartnerTenantUsageLogQuery` 的一处返回。
3. `start_timestamp=0` / `end_timestamp=0` 视同省略（契约只说“规范非负”，未定义 0 的含义）。
4. 文本过滤的空串视同未提供（契约只规定数值参数空串非法）；`type=` 空串非法。
5. 文本长度上限 191 / 255 / 64 **字节**为自选值（契约只说“bounded”）。
6. `p` 上限 1000000（沿用 options 端点），契约只写 ≥1。
7. stat 的 `quota_cny`：配置有效但汇总值超出 converter 支持范围（>512 bit，现实不可达）时，`available=false`、`reason=invalid_quota`、`amount=null`，避免出现“available 却没有 amount”。
8. `total` 用 int64 直接输出为 JSON number（未用 `common.PageInfo`，因其 `Total` 是 int 且解析宽松）；envelope 仍是 `common.ApiSuccess` 的 dashboard 形态。
9. 主库 channel 名称批量查询失败 → 整个 list 返回 503（与 `GetAllLogs` 把该错误上抛一致）；`MemoryCacheEnabled` 时走缓存、缺失的名称留空。

### B1b.5 折叠算法与各驱动排序

- 单次流式读取：`filter.apply(...)` 后 `SELECT id, event_id, request_id, created_at, type, quota, prompt_tokens, completion_tokens, is_stream, other`，`ORDER BY request_id ASC, created_at ASC, id ASC`（ClickHouse：`…, event_id ASC`），`Rows()` + `ScanRows` 逐行处理，内存中只保留当前请求已选的 outcome；`WithContext(ctx)`，结束时再检查 `ctx.Err()`。
- 过滤先于折叠：被窗口或任一过滤排除的行根本不在结果集里，不会影响所选请求的 outcome。
- `request_id == ""` 的行各自成一个请求。非空且与当前已选 outcome 相同的行：`compareRequestOutcomes(行, 已选)`（行按原始存储 id 转成 `*Log` 比较形状，不改写 id）；`>0` 替换，`<0` 保留，`==0`（事实完全相同，实际只会出现在 ClickHouse）时 `event_id` 较大者胜出。
- 成功/失败只对**已选 outcome** 判定：`logOutcomeFailed(type, is_stream, logViolationFeeMarked(...), stream_status.status)`——与 `GetUserLogSummary` 共用同一对 helper。JSON 键（`violation_fee`、`violation_fee_code`、`violation_fee_marker`、`stream_status.status`）在新读取方用一个小结构体再解析一次；`other` 畸形时与 summary 一样保留已解码的部分。
- consume 行的 quota/Token 每行都累加（含违规费用、每次被计费的重试）；error 行不加。`request_count = succeeded_count + failed_count` 由构造保证。
- 已知局限（与既有 summary 相同，非本步引入）：分组依赖 `ORDER BY request_id` 让相等的 id 相邻，再用 Go 字节相等判断。大小写不敏感排序规则的 MySQL 上，仅大小写不同的两个 request_id 可能交错导致多计请求；pq 的确定性排序规则下不存在此问题。request_id 由服务端固定格式生成，未扩大处理。
- 分页排序：`created_at DESC, id DESC`；ClickHouse `created_at DESC, event_id DESC`。count 与 page 用同一个 `apply`。ClickHouse 行的 `id` 输出为 `"0"`（未像默认日志那样分配 display id；`event_id` 是其标识）。

### B1b.6 门禁证据

- `insertPartnerTenantUsageLog` 无生产调用方、默认 reader 未改：见 B1b.8 的 `git grep` / `git diff --stat` 实际输出。
- `model/log_summary.go` 的 diff 仅两处：新增两个纯函数；`GetUserLogSummary` 中 `violation := …` 与 `failed := …` 两行改为调用它们，布尔表达式逐字等价（`fee || code != "" || marker != ""`；`type == LogTypeError || violation || (isStream && status == "error")`）。其余（含 savings 判定里对三个 violation 字段的直接引用）未动。
- 新端点只对 `Model(&PartnerTenantUsageLog{})` 建查询；唯一的主库访问是 `channels` 的 id/name 批量读取。所有新查询用 silent GORM 会话。

### B1b.7 文件

- 新建：`model/partner_tenant_usage_query.go`、`model/partner_tenant_usage_query_test.go`、`controller/partner_tenant_usage_log.go`、`controller/partner_tenant_usage_log_test.go`、`router/partner_tenant_usage_log_test.go`。
- 修改：`model/log_summary.go`（抽出共享失败分类，见 B1b.6）、`router/api-router.go`（+2 路由 +2 行注释）、`middleware/access_token_routes.go`（+2 条 `log:read` 规则）、`docs/partner-tenant-api.md`（新增 “Administrator merchant usage logs” 一节，并把 options 一节末句改为指向它）、本文件、`implement.md`（状态说明）。
- **未改**：`model/log.go`、`controller/log.go`、`model/log_outcome.go`、`model/usedata.go`、`model/partner_tenant_usage_log.go`（B1a）、任何前端、`.trellis/spec`、`go.mod` / `go.sum`。工作区里 `model/main.go` 的改动来自 B1a，本步未触碰。未暂存、未提交。

### B1b.8 实际执行的命令与真实结果（宿主机；`GO126` = 既有 go1.26.10 工具链，`GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOFLAGS=-mod=readonly`；输出仅存在 shell 变量，未建临时文件）

以下三条均在**最后一次源码编辑之后**执行（06:40:51–06:40:53）：

| 命令 | 性质 | 退出码 / 结果 |
| --- | --- | --- |
| `gofmt -l model controller router middleware service` | 格式检查 | rc=0；输出 `controller/cashback.go`、`controller/model_list_test.go`——两者是既有基线（`git status` 显示未修改，本步未触碰）；本步新建/修改的文件均不在列表中 |
| `"$GO126" build ./model ./controller ./router ./middleware ./service` | **仅编译**（type-checked + 生成对象，未运行任何代码） | rc=0，无输出 |
| `"$GO126" vet ./model ./controller ./router ./middleware ./service` | **仅类型检查 + vet 分析**（含 `_test.go`；未运行任何测试） | rc=0，无输出 |

门禁 `git grep`（只限显式源码目录，未以 `.` 为根递归）：

- `git grep --untracked -n insertPartnerTenantUsageLog -- model controller router middleware service relay common setting main.go` → 仅 `model/partner_tenant_usage_log.go:88,92`（注释与定义）和 `model/partner_tenant_usage_log_test.go`（B1a 的测试）。**没有生产调用方**；本步新增的测试也不调用它（直接 `db.Create`）。
- `git grep --untracked -n 'PartnerTenantUsageLog{}\|partnerTenantUsageLogTable\|partner_tenant_usage_logs' -- model controller router middleware service relay`（排除 `_test.go`）→ 仅 B1a 的模型文件与本步 `model/partner_tenant_usage_query.go`；默认 reader 文件中没有任何引用。
- `git diff --stat -- model/log.go controller/log.go model/usedata.go model/log_outcome.go` → 空（未改）。
- `git diff -- model/log_summary.go` → +13 行（两个纯函数及注释），`GetUserLogSummary` 内 2 行替换为等价调用，无其他变化。

文档 JSON 示例：用 `python3` 的 `json.loads` 解析通过（含 `other` 内嵌 JSON），并核对 `750000 × 7.3 ÷ 500000 = 10.95`、`250000 × 7.3 ÷ 500000 = 3.65`。

### B1b.9 测试源码（**Go 测试执行数：0** —— 不是通过，也不是跳过）

新增顶层测试 10 个，全部以 `TestPartnerTenantUsage` 开头，仅经 vet 类型检查：

| 包 | 测试 | 依赖 | 覆盖 |
| --- | --- | --- | --- |
| model | `TestPartnerTenantUsageQueryRejectsInvalidFilter` | 无库 | 非法 filter / offset / limit → 固定错误；`LOG_DB == nil` → 固定读取错误 |
| model | `TestPartnerTenantUsageQueryOutcomeClassification` | 无库 | 失败分类真值表（error / 三种 violation 标记 / 流错误 / 非流 / 畸形 other）；比较形状保留原始 id 与 64 位 quota |
| model | `TestPartnerTenantUsageQueryFiltersAndPaging` | pq | 每个过滤单独与组合；7 行同 `created_at` 下页大小 1/3/100 无重复无遗漏；`total` = 全部页行数 = `record_count`；窗口边界闭区间；另一商户不泄漏；`logs` 中的行（含旧商户行、同 request_id）不出现 |
| model | `TestPartnerTenantUsageQueryStatFolding` | pq | 失败后重试成功；consume 被选但流错误 → failed 且 quota 保留；违规费用 consume + error 行；仅 error；空 request_id 各自计数；多次计费重试全部求和；`type=error` 只在 error 行内折叠；窗口外 / 被模型过滤排除的行不改写 outcome；`logs` 同 request_id 不参与；全窗口合计 |
| model | `TestPartnerTenantUsageQueryExactSums` | pq | quota 和 > int64 最大值、Token 和 > 2^53 的精确字符串；已取消的 ctx → 固定错误且无驱动文本 |
| model | `TestPartnerTenantUsageQueryRoleProjectionAndDefaultReadersUntouched` | pq | admin / root 的 `other` 投影与 `formatLogOtherJSON` 一致；写入新表行前后 `GetAllLogs`、`SumUsedQuota` 结果不变且旧商户行仍被默认统计计入 |
| controller | `TestPartnerTenantUsageLogQueryParser` | 无库 | 默认值与生效窗口；完整合法参数；约 60 个拒绝样例（未知 / 重复 / 空数值 / 非规范 / 溢出 / `end < start` / 超最大范围 / start 晚于当前 / 控制字符 / 非法 UTF-8 / 超长 / 畸形编码）；stat 上 `p` / `page_size` 被拒、list 上被接受；边界值被接受 |
| controller | `TestPartnerTenantUsageLogHTTPContract` | pq | envelope 与 item 的**精确字段集**；每个 ID/quota/token 字段是 JSON string、`created_at`/`type`/`use_time` 是 number；> 2^53 的 id/归属/Token 精确；`subscription_id` 0 → `""`；`quota_cny` 单行 `0.333333`、stat `1.000000`（≠ 逐行舍入之和 `0.999999`）；配置无效 → 行 `null`、stat `amount: null` + `available: false` + reason，HTTP 200、raw 字段不变；`record_count` == `total`；admin / root 投影；分页不重叠；经处理器的 400；数据库故障 → 503，响应体与服务端日志不含驱动错误 / 秘密标记 / 行内容，日志含 request 关联；全程 `no-store` |
| router | `TestPartnerTenantUsageLogRouteDeclarations` | 无库 | 真实注册：两条路由各一次、PAT 规则为 `scope` + `log:read`；该前缀下只有 list / stat / options 三个 GET；默认 `/api/log/`、`/stat`、`/export` 规则未变；root 管理 API 仍是 session 规则 |
| router | `TestPartnerTenantUsageLogProductionRouteAuth` | pq | 真实 `SetApiRouter`：匿名 401；普通用户会话 / 普通用户带 `log:read` 的 PAT 403；admin、root 会话 200；桌面会话 403；admin / root `log:read` PAT 200；仅 `user:read` / 仅 `usage:read` / 无 scope 的 PAT 403 `ACCESS_TOKEN_SCOPE_DENIED`；admin 与 root 的 `other` 投影不同；鉴权先于参数校验；新表行前后默认 `GET /api/log/` 与 `GET /api/log/stat` 响应体逐字节相同；`logs` 行不出现在新端点；`tenant_id` 过滤 |

派发要求中**尚未写出**的用例（如实列出，留给下一次派发）：

1. `channel_name` 富化的两条路径（内存缓存 / 主库批量查询）及主库查询失败 → 503：所有 fixture 都用 `channel_id = 0` 回避了 `channels` 表，这一段代码**没有任何测试覆盖**。
2. ClickHouse：`event_id` 作为分页与同事实折叠的最终 tie-break、`id` 恒为 0 时的行为——既没有 live 测试，也没有生成 SQL 的契约检查（排序字符串是内联常量，没有抽成可测的纯函数）。
3. “`other` / `content` 中持久化的秘密标记，对该角色的暴露不超过默认日志”——只证明了投影与 `formatLogOtherJSON` 逐字相等、admin 看不到 `root_info`；**没有**与默认 `GET /api/log/` 对同一 `other` 的输出做并排对比，`content` 是原样返回（与默认日志相同）但未单独断言。
4. quota 和 > int64 最大值只在 model 层断言；HTTP 层只覆盖了 > 2^53 的 Token 和与小额 quota。
5. 数据库故障的 503 只在 controller 层用 GORM 回调注入；未在真实路由上断言。流式扫描中途取消只测了“调用前已取消”。
6. 目标查询的 pq `EXPLAIN`（design §2）未做——需要真实数据库。
7. 商户子账号（有 `PartnerTenantAccount` 的普通用户）会话访问新端点被拒：只测了普通用户，未像 options 测试那样单独建子账号。

### B1b.10 fixture / 全局状态

- 复用 A / B1a 的 `setupPartnerTenantUsagePQ`、`usePartnerTenantUsageLogDB`、`setupPartnerTenantUsageHTTPPQ`、`setupPartnerTenantUsageRouterPQ`：唯一且**保留**的 `pt_usage_` schema，无 DROP / TRUNCATE / DELETE，缺 DSN 时 `require` 失败而非 skip。计划 schema 前缀：`pt_usage_query_filter_`、`pt_usage_query_fold_`、`pt_usage_query_sum_`、`pt_usage_query_role_`、`pt_usage_log_http_`、`pt_usage_log_router_`。本次**未创建**任何 schema / 容器 / 临时文件。
- 保存并还原的进程全局：`LOG_DB`、`common.MemoryCacheEnabled`、`common.QuotaPerUnit`、`operation_setting.USDExchangeRate`、`gin.DefaultErrorWriter`（持 `common.LogWriterMu`）、`common.SessionSecret` / `IsMasterNode` / `GlobalApiRateLimitEnable`；注册的 GORM Query / Row 回调带唯一名并在 cleanup 移除。测试不调用 `t.Parallel()`。
- 行由测试直接 `db.Create` 插入（需要空 `request_id` 与显式 id，生产插入函数会补 request_id）；依赖从未运行过的假设：pq `bigserial` 接受显式 id、GORM Row 回调名 `gorm:row`、`logger.LogError` 写入 `gin.DefaultErrorWriter`。首次运行若失败需先判断是测试假设还是实现问题。

### B1b.11 未关闭的运行门禁

1. 任务自有 Docker + 隔离 PostgreSQL 中执行 `go test -mod=readonly ./model ./controller ./router ./middleware ./service -run '^TestPartnerTenantUsage' -count=1 -v`，确认本步 10 个顶层（model 6 / controller 2 / router 2）被选中且无 skip。
2. pq 上未验证的实现假设：未加引号的列名 `type` 作谓词；`Count` 与 `Find` 在 silent 会话上复用同一 `apply`；`ScanRows` 进 `PartnerTenantUsageLog` 的部分列投影（`other` 为 NULL 时得到空串）；`ORDER BY request_id` 在目标库排序规则下令相等 id 相邻。
3. 统计是对窗口内所选行的一次全量流式扫描（含 `other` 文本列）。窗口受最大日志范围限制，但大商户的全年窗口仍可能很慢；没有做容量测试，也没有超时/行数上限。是否需要额外上限由主会话决定。
4. ClickHouse / MySQL / SQLite：仅按源码推导，未运行，未扩大矩阵。
5. `model/log_summary.go` 的重构虽逐字等价，但 `controller/log_summary_test.go` 等既有回归**未运行**；需在门禁 1 的环境里按 implement.md E 节的既有回归清单补跑。
6. writer 仍未启用；self/API-Key reader 的 union、切写、前端、`.trellis/spec` 均未开始。

### B1b.12 trellis-check 复核（B1a + B1b，2026-11-17）

完整记录见 `quality-review.stage-b1.md`。**Go 测试执行数仍为 0**；以下均为源码推理或仅类型检查。

- 代码变化（B1b）：`model/partner_tenant_usage_query.go` 把 list / stat 排序串抽为纯函数 `partnerTenantUsageListOrder(clickHouse bool)` / `partnerTenantUsageStatOrder(clickHouse bool)`（SQL 文本不变）；`controller/partner_tenant_usage_log.go` 的 `partnerTenantUsageLogUnavailable` 在请求 context 已结束（调用方离开）时不再写 error 级 “database error” 日志，仍返回固定 503。B1a 业务源码未改。
- 测试变化：本步顶层测试由 10 个变为 **12 个**（model 8 / controller 2 / router 2）；连同 B1a 的 7 个，本范围 4 个文件共 19 个。新增 `TestPartnerTenantUsageQueryOrderContract`（无库）、`TestPartnerTenantUsageQueryChannelName`（pq：主库缺 `channels` 表 → 固定读取错误；批量路径；缓存路径不读主库）；HTTP 契约测试补“quota 合计超过 int64”断言；真实路由测试补“`other` 与默认 `GET /api/log/` 同角色逐字相等”子用例。B1b.11 第 1 项的选中数相应为 12。
- 需主会话决定（未改）：① 新表没有以 `created_at` 开头的索引，不带商户过滤的默认管理员列表在 pq 上无法走索引取前 N 行（`logs` 有 `(created_at,id)`）；是否在首次建表前追加 `(created_at,id)` 索引需结合 EXPLAIN 决定。② 统计整窗扫描无超时/行数上限（即 B1b.11 第 3 项）。③ 超长窗口返回通用 `Invalid parameters` 是否改为带天数的既有消息。
- 五条门禁（writer 未启用、默认管理员 reader 未改、新端点只读独立表、迁移不动 `logs`、权限为 AdminAuth + 显式 `log:read`）经 diff 与 `git grep --untracked` 复核均成立。

---

## B 阶段 — B2a 自身/Key 双表读取

> 状态（2026-11-17，骨架先行，结尾处有最终补全）：**source-ready / runtime pending**。**Go 测试执行数：0**（不是通过，也不是跳过）。writer 仍无生产调用方；默认管理员 reader 未改。B2b（`GetUserRequestLogs` / `GetUserLogSummary`）未开始。

> **B2b 更正（2026-11-17，取代本节相应表述，原文保留作历史）**：B2a 把“独立表存在”做成了所有 self/Key reader 的硬前提（表缺失 = 读取失败），并为此改了 4 个既有测试 fixture。B2b 已加固：**表不存在是一次成功判定（走原单表路径）**，只有“表存在但探测失败”或“存在性检查本身失败”才是读取失败；4 个既有测试文件已用 `git checkout HEAD --` 还原为与 `HEAD` 字节相同。因此下文 B2a.2 第 3 条、B2a.7 “修改（既有测试 fixture）”、B2a.9 第 10 个用例（`…ProbeFailureIsAReadFailure`，已删除并由 B2b 的两个用例取代，B2a 新顶层用例数由 11 变为 10）、B2a.10 表中“fixture 追加独立表迁移”及其下方风险段、B2a.12 第 1 条均以 “B 阶段 — B2b” 一节为准。

### B2a.1 最终签名（`model/log_owned_union.go` 新文件；`model/log.go` / `controller/log.go` 小改）

```go
// 对外签名不变
func GetUserLogs(userId int, filter LogFilter, startIdx int, num int) (logs []*Log, total int64, err error)
func StreamUserLogs(ctx context.Context, userId int, filter LogFilter, fn func(*Log) error) error
func GetLogByTokenId(tokenId int) (logs []*Log, err error)
// 新增：self 统计 = 原 SumUsedQuota（原样调用，按会话 username）+ 独立表中该 user_id 的贡献
func SumUserUsedQuota(userId int, username string, logType int, startTimestamp int64, endTimestamp int64, modelName string, tokenName string, channel int, group string) (Stat, error)

// 包内
func dedicatedLogOwnerHasRows(ctx context.Context, ownerColumn string, ownerValue int) (bool, error)   // 探测
func ownedLogUnion(ctx context.Context, ownerColumn string, ownerValue int, filter LogFilter) (*gorm.DB, error)
func ownedLogUnionBranchColumns(databaseType common.DatabaseType, groupCol string, dedicated bool) string // 纯函数
func ownedLogUnionOuterColumns(groupCol string) string                                                    // 纯函数
func ownedLogUnionOrder(databaseType common.DatabaseType) string                                           // 纯函数
func countOwnedLogUnion / queryOwnedLogUnion / streamOwnedLogUnion / sumDedicatedUserUsedQuota
type ownedLogRow struct { Log `gorm:"embedded"`; LogSource int; LogEventId string } // 私有扫描结构，仅 *Log 外传
```

`ownerColumn` 只有两个包内常量 `user_id` / `token_id`，不来自输入；`ownerValue` 只来自 controller 已传入的鉴权身份（`c.GetInt("id")` / `c.GetInt("token_id")`）。不查询当前 Tenant owner 映射、不读 membership cache。

### B2a.2 探测设计

- `dedicatedLogOwnerHasRows`：`SELECT 1 AS hit FROM partner_tenant_usage_logs WHERE <user_id|token_id> = ? LIMIT 1`，命中 `idx_ptul_user_time` / `idx_ptul_token_time` 前缀；silent GORM 会话（DEBUG 也不输出 SQL）。
- 四个 reader 各探测一次。**无行 → 原单表代码原样执行**（同一 SQL、`id desc`、同一 count、同一格式化；`model/log.go` 该部分零删除）。有行 → 走双表路径。
- **探测失败 = 读取失败**，绝不当作“无行”：`GetUserLogs` / `GetLogByTokenId` 返回 `common.NewMessage("Failed to query logs")`；`SumUserUsedQuota` 返回 `common.NewMessage("Failed to query statistics")`；`StreamUserLogs` 返回固定的 `errOwnedLogRead`（controller 既有逻辑转成 `Failed to export logs`）。日志行是固定文案，不含 SQL / 驱动错误 / 行内容。
- 探测不看当前归属映射/套餐/状态：只看独立表里是否存有该已鉴权 ID 的行。

### B2a.3 联合 SQL 形状与逐列类型 / cast 矩阵

```sql
SELECT logs.id, …, logs.<group>, …, logs.log_source, logs.log_event_id
FROM (
  SELECT <列…>, 0 AS log_source, <''> AS log_event_id FROM logs                           WHERE logs.<owner> = ? AND <LogFilter.apply>
  UNION ALL
  SELECT <列…>, 1 AS log_source, logs.event_id AS log_event_id FROM partner_tenant_usage_logs AS logs WHERE logs.<owner> = ? AND <LogFilter.apply>
) AS logs
ORDER BY … LIMIT ? OFFSET ?
```

- 两个分支的表都别名为 `logs`，因此**未改写**的 `logs.` 前缀 `LogFilter.apply` 在每个分支内各应用一次（ownership 与过滤都在 union 之前、且为绑定参数）；外层派生表也叫 `logs`，排序列沿用 `logs.` 前缀。`UNION ALL`，不去重、不按本地 id / request_id join。count / 排序 / offset / limit 只作用于整个 union。
- 用 GORM 子查询（`Table("(? UNION ALL ?) AS logs", legacy, dedicated)`，与 `model/cashback_query.go:127`、`model/channel.go:985` 同一用法）拼接，占位符由 GORM 统一编号；没有字符串拼接任何输入。

| 投影列（顺序即此表） | `logs` 列类型（PG / MySQL / SQLite，按 GORM 对 Go `int` 的映射推导，**未在真实库核对**） | 独立表 | PG / SQLite cast | MySQL cast | ClickHouse `logs` → 独立表 | ClickHouse cast |
| --- | --- | --- | --- | --- | --- | --- |
| id | bigint（自增） | bigint | `CAST(logs.id AS BIGINT)` | `CAST(… AS SIGNED)` | Int64 → Int64（恒 0） | 无 |
| user_id | bigint | bigint | CAST BIGINT | CAST SIGNED | Int32 → Int64 | `toInt64(…)` |
| created_at | bigint | bigint | CAST BIGINT | CAST SIGNED | Int64 → Int64 | 无 |
| type | bigint | bigint（Go int） | CAST BIGINT | CAST SIGNED | Int32 → Int32 | 无 |
| content | text / longtext | 同 | 无 | 无 | String | 无 |
| username, token_name, model_name | text / varchar(191) | 同 | 无 | 无 | String | 无 |
| quota, prompt_tokens, completion_tokens, use_time | bigint | bigint | CAST BIGINT | CAST SIGNED | Int32 → Int64 | `toInt64(…)` |
| is_stream | boolean / tinyint(1) / numeric | 同 | 无 | 无 | UInt8 → UInt8 | 无 |
| channel_id, token_id | bigint | bigint | CAST BIGINT | CAST SIGNED | Int32 → Int64 | `toInt64(…)` |
| group | 同名保留字列 | 同 | `logs."group" AS "group"`（PG）/ 反引号 | 反引号 | String | 反引号 |
| ip | text / varchar(191) | 同 | 无 | 无 | String | 无 |
| request_id / upstream_request_id | varchar(64) / varchar(128) | 同 | 无 | 无 | String | 无 |
| other | text / longtext | 同 | 无 | 无 | String | 无 |
| log_source（私有） | 字面量 `0` | 字面量 `1` | — | — | — | — |
| log_event_id（私有） | PG：`CAST('' AS VARCHAR(64))`；其余 `''` | `logs.event_id` | — | — | — | — |

- `channel_name` 是 `Log` 上的只读字段（`->`），两张表都没有该列：**不投影**，扫描后为空，再由既有用户格式化置空。
- group 列引用：`ownedLogGroupColumn` = 既有 `logGroupCol`；仅当进程从未跑过 `InitDB/InitLogDB`（`logGroupCol == ""`，只在测试进程出现）时按 `initCol` 同一规则回退，避免生成空标识符。
- 扫描进私有 `ownedLogRow`（`Log` + `log_source` + `log_event_id`），只把 `*Log` 交给既有格式化函数；流式读取不经过固定 `Model(&Log{})` 的 `streamLogs`，而是 `Rows()` + 逐行 `ScanRows(&ownedLogRow)`。

### B2a.4 排序规则

- SQL 驱动：`logs.created_at desc, logs.id desc, logs.log_source asc, logs.log_event_id asc`。
- ClickHouse：`logs.created_at desc, logs.id desc, logs.request_id desc, logs.log_source asc, logs.log_event_id asc`（两表 id 恒 0，保留原 `request_id desc` 次序键）。
- 本地 id 只是排序键；显示 id 仍由既有 `formatUserLogs` / 流内计数在排序之后赋值。
- **仅当该用户/Key 在独立表有行时**排序才从 `id desc` 变为上述全局时间序；其余用户不变。

### B2a.5 四个 reader 的适配

| Reader | 无独立表行 | 有独立表行 |
| --- | --- | --- |
| `GetUserLogs` | 原代码原样 | `countOwnedLogUnion`（同样 `.Limit(logSearchCountLimit).Count`）+ `queryOwnedLogUnion`，再 `formatUserLogs(logs, startIdx)` |
| `StreamUserLogs` | 原 `streamLogs` 原样 | `streamOwnedLogUnion` 逐行回调；连续编号、`ChannelName=""`、用户投影与原闭包相同；ctx 取消返回 `ctx.Err()`；controller 的导出开关/锁/NDJSON 尾行未改 |
| `GetLogByTokenId` | 原代码原样 | 两分支均 `logs.token_id = ?`，全局序，`Limit(common.MaxRecentItems)`，`formatUserLogs(logs, 0)` |
| self stat（`GET /api/log/self/stat`） | `SumUserUsedQuota` = 原 `SumUsedQuota(...)` 原样调用后直接返回 | 再加 `sumDedicatedUserUsedQuota`：`user_id = ?`、仅 consume、同样的 model（含 `%` LIKE 规则）/ token_name / 时间窗 / channel / group；rpm/tpm 仍是独立的最近 60 秒窗口；任一步失败整体返回既有通用统计错误，不给部分和；溢出检查后相加，JSON 字段名与 number 类型不变 |

### B2a.6 门禁证据

- `git diff --stat -- model/log.go controller/log.go`：`model/log.go | 55 +`（**0 行删除**，只在 `GetLogByTokenId` / `GetUserLogs` / `StreamUserLogs` 内插入探测分支）；`controller/log.go | 4 ++-`（仅 `GetLogsSelfStat` 的一处调用改为 `model.SumUserUsedQuota(c.GetInt("id"), username, …)`）。
- 管理员路径：`GetAllLogs`、`StreamAllLogs`、`streamLogs`、`SumUsedQuota`、`SumUsedToken`、`CountOldLog`、`DeleteOldLogBatch`、`LogFilter.apply`、controller `GetAllLogs` / `GetLogsStat` / `ExportAllLogs` **一字未改**；`GetLogsStat` 仍直接调 `SumUsedQuota`。新增符号的全部生产调用点（`git grep`）：`controller/log.go:297`（self stat）与 `model/log.go:142,148,619,625,626,741,749`（三个 self/Key reader）。管理员行为变化：**无**（源码推导，未运行）。
- `git grep --untracked -n "insertPartnerTenantUsageLog(" -- model controller service relay router middleware common main.go`（新表文件尚未入库，必须带 `--untracked`；首次不带该参数的结果为空，**不能**作为证据，已作废）：仅命中定义 `model/partner_tenant_usage_log.go:92` 与 `model/partner_tenant_usage_log_test.go` 内的 13 处测试调用 → writer 仍无生产调用方。本次新测试不调用它（行由 `db.Create` 插入）。同样带 `--untracked` 复查了“哪些既有测试触达四个 reader”，结果与 B2a.10 一致。
- 输出字段：四个 reader 的返回类型仍是 `*model.Log`；`ownedLogRow` 的私有列不出包；没有 tenant/account/owner/event/source 字段。
- ownership：`ownerValue` 只来自 `c.GetInt("id")` / `c.GetInt("token_id")`；没有新增任何 query/body 读取。

### B2a.7 文件

- 新建：`model/log_owned_union.go`、`model/partner_tenant_usage_union_test.go`、`router/partner_tenant_usage_union_test.go`。
- 修改（业务）：`model/log.go`、`controller/log.go`。
- 修改（既有测试 fixture，**仅追加迁移，未改任何断言**）：`controller/log_summary_test.go`（2 处）、`controller/log_export_test.go`（2 处）、`controller/relay_error_log_test.go`（1 处）、`controller/user_manage_test.go`（1 处）——这些 fixture 原来只在 LOG_DB 建 `logs`，而探测失败按要求是读取失败，不建独立表会让既有用例报错；生产中 `InitLogDB` 两条路径都会先迁移该表。
- 记录：本节、`implement.md` 状态注。未建任何临时文件（命令输出只在 shell 变量；改源码的内联脚本不落盘），`TEMPORARY_ARTIFACTS.md` 无新增登记。

### B2a.8 实际执行的命令与真实结果（宿主机；`GO126` = 既有 go1.26.10 工具链，`GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOFLAGS=-mod=readonly`；均在最后一次源码改动之后执行）

| 命令 | 性质 | 退出码 |
| --- | --- | --- |
| `gofmt -l` 9 个改动/新建 Go 文件 | 格式检查 | 0，无输出 |
| `go build ./model ./controller ./router ./middleware ./service` | 编译（仅类型检查级证据） | 0 |
| `go vet ./model ./controller ./router ./middleware ./service` | 类型检查（含测试文件），**不执行测试** | 0 |
| `go test` | **未运行**（禁止在宿主机运行；Docker 不可用且不得启动） | — |

**Go 测试执行数：0。** 以上不是运行证据。

### B2a.9 测试源码（11 个新顶层，全部未执行）

`model/partner_tenant_usage_union_test.go`（10 个）：
1. `TestPartnerTenantUsageUnionProjectionContract`（纯函数，无 DB）：CH / PG / MySQL / SQLite 的 cast、group 引用、列数与逐位一致、私有列、排序串；非法 owner 列被拒。
2. `TestPartnerTenantUsageUnionGeneratedSQL`：PG fixture 上 dry-run 生成整条 union（PG 与 ClickHouse 类型各一）：恰一个 `UNION ALL`、ownership/过滤在两个分支内各一次且 owner 为绑定参数、ORDER BY、无 JOIN、count 语句带 LIMIT。ClickHouse 仅生成 SQL，未连 CH。
3. `…OrdinaryUserKeepsLegacyPath`：只有 `logs` 行的普通用户，list / export / token-recent / self stat 与旧语句结果逐项相等，且捕获到的语句里引用独立表的只有 4 次探测。
4. `…MergedOrderAndPaging`：两表相同本地 id、多行相同 `created_at`、他人同 request_id/token 名/用户名；页大小 1/2/4/50 下 total、无重无漏、全局序、显示 id 连续；export 全量一次且连续编号；回调报错即停、取消即停、预先取消不投递。
5. `…FiltersRestrictBothSources`：type / types / model（含 `%`）/ token_name / 时间窗 / group / request_id 对两来源同时生效（list 与 export）。
6. `…UserProjection`：新来源行的用户投影（无 admin/root、`channel_name` 空）、64 位 quota、JSON 键集合与普通 `Log` 相同且不含归属快照。
7. `…TokenRecent`：仅该 token、两来源、最新优先、上限 `MaxRecentItems`。
8. `…SelfStat`：各过滤下 = legacy + dedicated；同用户名他人行不计；rpm/tpm（增量断言）；普通用户与 legacy 相等；管理员统计只读 `logs`。
9. `…AdministratorReadersUnaffected`：`GetAllLogs` / `SumUsedQuota` / `StreamAllLogs` 在插入独立表行前后一致，且没有任何语句引用独立表。
10. `…ProbeFailureIsAReadFailure`：独立表不存在时四个 reader 都返回错误（非空结果），错误文本无表名/SQL/行内容，统计不返回部分和。

`router/partner_tenant_usage_union_test.go`（1 个）：`TestPartnerTenantUsageUnionSelfRoutesIgnoreForgedOwnership` —— 真实 `SetApiRouter`：`/api/log/self`、`/self/stat`、`/self/export` 合并两表、伪造 `user_id/tenant_id/token_id/username/account_id` 不改变响应、JSON 键恰为 `Log` 字段集、无 admin/root/归属数据；他人只见自己的行；普通用户与管理员默认 list/stat/export 前后字节相同。

**要求但未写出的用例**：
- `/api/log/token` 真实路由（模型 API Key 鉴权）及其伪造参数——只有 model 层 token-recent 用例。
- HTTP 层的探测失败（controller 通用错误文案）——只有 model 层。
- “导出不加载整个窗口”没有内存层面的断言，只有逐行回调中止/取消的证据。
- count 上限只有生成 SQL 检查（`LIMIT` 存在），没有 >10000 行的运行用例。
- self 路由的 PAT（`log:read` 等）在 union 路径下未单独覆盖；`types=`、`group` 等过滤未经真实路由（仅 model 层）。
- 分库（LOG_DB ≠ DB）下的 union reader；MySQL / SQLite 的 union 运行；live ClickHouse。
- 应用 logger / DEBUG GORM 对探测与 union 失败的负面秘密标记断言未写（实现上是 silent 会话 + 固定文案）。

### B2a.10 既有回归清单（均未执行）

| 既有测试 | 是否触及本次 reader | 影响 |
| --- | --- | --- |
| `controller/log_export_test.go`（`TestLogExportDatabaseMatrix`、`TestLogExportRules`） | `ExportUserLogs` / `GetLogsSelfStat` | fixture 追加独立表迁移；断言未动；无独立表行 → 仍走原路径 |
| `controller/log_summary_test.go`（`TestGetUserLogsFiltersMultipleRequestTypes`、`TestGetUserRequestLogsAcrossFiftyRawRows`） | `GetUserLogs` | 同上；该文件其余用例只用 `GetUserRequestLogs` / `GetUserLogSummary`（B2b，未改） |
| `controller/relay_error_log_test.go`、`controller/user_manage_test.go` | `model.GetUserLogs` | 同上 |
| `model/log_format_test.go`、`log_other_test.go`、`log_outcome_test.go`、`clickhouse_log_test.go` | 否（`git grep` 无这四个 reader 的调用） | 不受影响（推导） |
| `middleware/auth_test.go`（`/api/log/token`）、`router/access_token_scope_test.go` | 仅中间件/声明 | 不受影响（推导） |

风险：以上 4 个 fixture 在 SQLite 上 `AutoMigrate(&model.PartnerTenantUsageLog{})` 能否成功未运行验证；若还有未被 `git grep` 命中的、经路由间接触达 self reader 且 LOG_DB 没有独立表的 fixture，会因探测失败而报错。

### B2a.11 fixture / 全局状态

- 新测试沿用 `setupPartnerTenantUsageQueryPQ` / `setupPartnerTenantUsageRouterPQ`：`TEST_PARTNER_USAGE_POSTGRES_DSN` 缺失即失败、唯一保留的 `pt_usage_union_*` schema、无 DROP/TRUNCATE、行由测试插入。
- 改动的进程全局：`LOG_DB`、log database type、`logGroupCol`（经 `initCol`），由 `usePartnerTenantUsageLogDB` 的 cleanup 恢复；router 用例的 `SessionSecret` / `IsMasterNode` / `GlobalApiRateLimitEnable` / `MemoryCacheEnabled` 自行保存恢复。SQL 捕获回调注册在各用例自有的 gorm 连接上。用例必须串行。
- 取消用例里有一次 200ms sleep（等待 database/sql 的 watcher 关闭 rows）。

### B2a.12 需主会话确认 / 与计划不一致之处（只报告，不自行决定）

1. **探测把“独立表存在”变成 self reader 的硬前提**：表缺失 = 读取失败（按要求不当作无行）。生产由 B1a 迁移保证；但为此改了 4 个既有测试 fixture。（**已被 B2b 取代**：表缺失 = 成功判定为“无行”，4 个 fixture 已还原，见 B2b.1 / B2b.5。）
2. **既有 count “上限”实际不生效**：`….Limit(10000).Count()` 生成 `SELECT count(*) … LIMIT 10000`，LIMIT 作用在聚合后的单行上。union 路径保持同一写法（同样不截断）。
3. **legacy self stat 按会话 username、独立表部分按 user_id**：用户名为空/含 `%`/改名/重名时 legacy 部分的既有偏差原样保留，两部分口径因此不完全同源。
4. **成员的列表顺序变化**：`id desc` → 全局时间序（仅在其独立表有行后）。
5. **性能**：union 路径无每分支 top-N 下推，count 与分页都要扫描该 owner 过滤后的全部行；管理员角色的 self list 没有强制时间窗。每个 reader 对所有用户多一次索引探测。
6. **MySQL 排序规则**：若 `logs` 与新表的字符列 collation 不同，`UNION ALL` 可能报 illegal mix of collations；未验证。
7. **ClickHouse**：`toInt64(logs.x) AS x` 与分支内 `logs.x` 过滤在别名解析下语义应等价，Int64 扫入 Go `int`；均无 live 验证。
8. **`GetLogByTokenId` 失败文案**：原路径把驱动错误原文返回客户端（未改）；探测/union 失败返回通用 `Failed to query logs`。
9. `logs` 的列类型矩阵来自 GORM 映射规则推导，没有在真实库 `\d logs` 核对；显式 cast 即为覆盖历史上较窄的整型列。

### B2a.13 未关闭的运行门禁

- 11 个新用例 + 上表既有回归在 owned Docker / 隔离 PostgreSQL 的首次执行（当前执行数 0）。
- pq 上 union 的真实类型解析、`ownedLogRow` 嵌入扫描、分页/count、流式取消、EXPLAIN（探测是否走 `idx_ptul_user_time` / `idx_ptul_token_time`）。
- B2b（`GetUserRequestLogs`、`GetUserLogSummary`）未开始；B 阶段未完成，不得进入 C 切写。

---

## B 阶段 — B2b 请求结果/汇总与探测加固

> 状态（2026-11-17）：**source-ready / runtime pending**。**Go 测试执行数：0**（不是通过，也不是跳过）。writer 仍无生产调用方；默认管理员 reader 未改；`compareRequestOutcomes` 未改。B 阶段仍未完成（无任何运行证据），不得进入 C 切写。

### B2b.1 存在性 / 探测状态机与缓存规则（`model/log_owned_union.go`）

入口仍是 `dedicatedLogOwnerHasRows(ctx, ownerColumn, ownerValue) (bool, error)`，六个 self/Key reader（list、export、token-recent、self stat、request outcomes、summary）全部只经它读取独立表的存在性。

| 状态 | 判定方式 | 返回 | reader 行为 |
| --- | --- | --- | --- |
| present-rows | 探测 `SELECT 1 AS hit … WHERE <owner> = ? LIMIT 1` 成功且有行 | `(true, nil)`，并记住该 handle | 双表路径 |
| present-no-rows | 探测成功、无行 | `(false, nil)`，并记住该 handle | 原单表路径原样 |
| absent | 探测失败、该 handle 尚未记住；`Migrator().HasTable(独立表)` = false **且** `HasTable("logs")` = true **且对照成功后再查一次 `HasTable(独立表)` 仍 = false**（B2 复核追加，见 B2c） | `(false, nil)`，**不缓存** | 原单表路径原样（与无行用户相同） |
| probe failed | 探测失败，且该 handle 已记住表存在；或未记住但 `HasTable(独立表)` = true 且**重试一次探测仍失败**（B2 复核追加重试，见 B2c） | `(false, errOwnedLogRead)` | 该 reader 的既有通用错误 |
| check failed | 探测失败、未记住，`HasTable(独立表)` = false 且 `HasTable("logs")` 也 = false | `(false, errOwnedLogRead)` | 同上；绝不当作 absent |

- **为什么需要对照表**：GORM 各驱动的 `HasTable` 只返回 bool，目录查询出错与“表不存在”都返回 false（错误被吞）。`logs` 是每个日志库必有的表，用作阳性对照：连它都看不到，说明检查本身失败（连接/上下文取消/目录权限），按读取失败处理。全部使用驱动自带 migrator（PostgreSQL / MySQL / SQLite / ClickHouse），无手写目录 SQL；silent 会话。
- **缓存**：`dedicatedLogTableKnown atomic.Pointer[gorm.DB]` 只存“在哪个 `LOG_DB` handle 上见过该表”。只缓存阳性；按指针比较绑定到当前 handle，`LOG_DB` 被替换（测试换库、进程重新初始化）即重新判定；不缓存 absent（主节点可能随后建表）；原子读写，并发安全；测试无需显式复位（换 handle 即失效）。
- **稳态零额外开销**：表已迁移时与 B2a 相同（每次读取一条探测），从不查目录；只有探测失败且 handle 未记住时才调用 migrator（未迁移节点上每次 self 读取 = 1 次失败探测 + 3 次目录查询；B2 复核追加第 3 次，见 B2c）。
- 管理员独立表端点（`/api/log/partner-tenants*`）未改：表缺失仍是错误（503）。

### B2b.2 最终签名

```go
// 对外签名不变
func GetUserRequestLogs(ctx context.Context, userId int, startTimestamp int64, endTimestamp int64, startIdx int, num int) (logs []*Log, total int64, err error)
func GetUserLogSummary(ctx context.Context, userID int, start, end int64, timezoneOffset int) (*UserLogSummary, error)

// model/log_owned_union.go（加固 + 投影泛化）
var  dedicatedLogTableKnown atomic.Pointer[gorm.DB]
func ownedLogReadSessionOn(db *gorm.DB, ctx context.Context) *gorm.DB
func dedicatedLogTablePresent(ctx context.Context, db *gorm.DB) (bool, error)          // HasTable + logs 阳性对照
func dedicatedLogOwnerHasRows(ctx context.Context, ownerColumn string, ownerValue int) (bool, error) // 签名不变，语义见 B2b.1
func ownedLogBranchColumns(databaseType common.DatabaseType, groupCol string, dedicated bool, projection []string) string // 任意列子集，表达式与 B2a 矩阵相同
func ownedLogOuterColumns(groupCol string, projection []string) string
// ownedLogUnionBranchColumns / ownedLogUnionOuterColumns 保留为对全量投影的包装，输出不变

// model/log_owned_request.go（新文件）
var   ownedLogSummaryProjection = []string{"id","request_id","created_at","type","quota","prompt_tokens","completion_tokens","is_stream","other"}
const ownedLogSummaryOrder = "logs.request_id ASC, logs.created_at ASC, logs.id ASC, logs.log_source ASC, logs.log_event_id ASC"
func ownedRequestWindowUnion(ctx context.Context, userId int, startTimestamp, endTimestamp int64, projection []string) *gorm.DB
func compareOwnedRequestOutcomes(a, b *ownedLogRow) int   // compareRequestOutcomes(原始本地 id) → 完全相等时才 log_source → log_event_id
func queryOwnedRequestOutcomes(ctx context.Context, userId int, startTimestamp, endTimestamp int64) ([]*Log, error)
func streamOwnedLogSummaryRows(ctx context.Context, userId int, startTimestamp, endTimestamp int64, yield func(*ownedLogRow)) error

// model/log_summary.go
func foldUserLogSummary(timezoneOffset int, source func(yield func(*ownedLogRow)) error) (*UserLogSummary, error) // 唯一的折叠/累加循环
```

- `ownedRequestWindowUnion`：两个分支各自绑定 `logs.user_id = ?`、`logs.type IN (consume,error)`、`logs.created_at >= ? AND <= ?`（与旧语句同一组谓词），再 `UNION ALL`；无 join、无去重。ownership 只有 controller 已传入的 `c.GetInt("id")`。
- `GetUserRequestLogs` 双表路径：按 `ownedLogUnionOrder` 载入窗口（≤1 天，旧路径同样整窗载入）→ 非空 `request_id` 用 `compareOwnedRequestOutcomes` 选一行 → 空 `request_id` 每行保留 → 内存分页、`total`、`formatUserLogs`（显示 id 在折叠之后才赋值）。跨表同本地 id 的行从不被 id 识别/合并。完全相等事实的平局：独立表行（source=1）胜出，再按 event_id。
- 错误：`GetUserRequestLogs` 探测/union 失败 → 既有 `查询日志失败`；`GetUserLogSummary` 探测/union 失败 → ctx 已取消/超时则返回 `ctx.Err()`，否则 `Failed to query logs`；日志行为固定文案。

### B2b.3 汇总循环的拆分与“旧路径不变”的理由

- 原 `for rows.Next()` 循环体整体搬入 `foldUserLogSummary` 的 `yield` 闭包，**只有一份**分类 / 钱包-订阅拆分 / Token / saved_quota / 时区分桶代码；两条路径各自只提供行来源。
- 旧路径来源：与原来逐字相同的查询（`Model(&Log{})`、同一 `Select` 列、同一 `Where`、`Order("request_id ASC, created_at ASC, id ASC")`、`Rows()`、`LOG_DB.ScanRows(rows, &row.Log)`——扫描目标仍是 `*Log`），错误原样返回。
- 循环体的全部改动：`log` 由值变量改为 `&row.Log` 指针；`previousLog *Log` → `previousRow *ownedLogRow`；`compareRequestOutcomes(&log, previousLog) > 0` → `compareOwnedRequestOutcomes(row, previousRow) > 0`。单表行的 `LogSource` 恒 0、`LogEventId` 恒空，平局比较恒为 0，所以该表达式对旧路径与原表达式逐值相等；其余语句未动。`rows.Err()` 仍在循环后检查。
- 双表来源：数据库对 union 排序（`ownedLogSummaryOrder`），逐行 `ScanRows(&ownedLogRow)`，不在 Go 里归并两个有序流，不把窗口载入内存。
- 因此 `controller/log_summary_test.go` 的结果不会变：其 fixture 的 LOG_DB 没有独立表 → absent → 旧来源 + 同一循环；`model/log_outcome_test.go` 只测 `compareRequestOutcomes`，该函数 `git diff` 为空。（推导，未运行。）

### B2b.3a 既有回归与状态机的一致性（逐条读源码推导，**未运行**）

- `controller/log_summary_test.go` 共有 12 处只 `AutoMigrate(&model.Log{})` 的 fixture；B2a 只改过其中 2 处（`GetUserLogs` 用例），其余 10 处使用 `GetUserRequestLogs` / `GetUserLogSummary`——若沿用“表缺失即失败”，B2b 会让它们全部报错。加固后这些 SQLite fixture 的路径是：探测失败 → `HasTable(独立表)` = false、`HasTable("logs")` = true → absent → 旧路径。
- `TestGetUserRequestLogsPaginationDefaultsAndDatabaseError`：先 `DropTable(&model.Log{})` 再期望 `查询日志失败`。此时两张表都看不到 → check failed → 探测分支返回同一文案 `查询日志失败`（旧实现是查询 `logs` 失败得到该文案）。
- `TestGetUserRequestLogsWindowBoundariesAndCancellation`：取消的请求 ctx → 探测与两次 `HasTable` 都失败 → `查询日志失败` → `success=false`，与原期望一致。
- `TestGetUserRequestLogsRejectsUnboundedWindowsBeforeQuery`：controller 校验在调用 model 之前，探测不会被执行，查询计数不变。
- `TestRequestOutcomeZeroIDTiesAgreeAcrossListAndSummary` 等把日志库类型设为 ClickHouse 的用例：存在性判定走实际连接的 GORM dialector 的 migrator，不依赖 `common.LogDatabaseType()`。
- GORM 版本核对（只读模块缓存）：`gorm.io/driver/postgres@v1.5.9`、`gorm.io/driver/clickhouse@v0.6.0`、`glebarez/sqlite@v1.11.0` 的 `HasTable` 均丢弃 `RunWithValue` 的错误、只返回 `count > 0`；MySQL 使用 gorm 基础 migrator 的同一写法。

### B2b.4 各 reader 的排序

| Reader | 无独立表行 / 表不存在 | 有独立表行（SQL 驱动） | 有独立表行（ClickHouse） |
| --- | --- | --- | --- |
| `GetUserRequestLogs` | 原 `logs.id desc`（CH：`created_at desc, request_id desc`） | `created_at desc, id desc, log_source asc, log_event_id asc` | `created_at desc, id desc, request_id desc, log_source asc, log_event_id asc` |
| `GetUserLogSummary` | 原 `request_id ASC, created_at ASC, id ASC` | `request_id ASC, created_at ASC, id ASC, log_source ASC, log_event_id ASC`（所有驱动相同，由数据库排序） | 同左 |

ClickHouse / MySQL / SQLite 的双表路径均未运行。

### B2b.5 门禁证据

- `git diff --stat -- controller/log_summary_test.go controller/log_export_test.go controller/relay_error_log_test.go controller/user_manage_test.go model/log_outcome.go`：**空输出**（四个文件已用 `git checkout HEAD -- <四个确切路径>` 还原，退出码 0；`git status --short -- controller/` 只剩 `controller/log.go` 与两个未跟踪的新文件）。
- `git grep --untracked -n "insertPartnerTenantUsageLog(" -- model controller service relay router middleware common main.go`：非测试命中只有定义 `model/partner_tenant_usage_log.go:92`；其余 13 处均在 `model/partner_tenant_usage_log_test.go` → writer 仍无生产调用方。本次新测试不调用它。
- `git diff -U0 -- model/log.go` 仅 4 个纯插入 hunk（`GetLogByTokenId`、`GetUserLogs`、`GetUserRequestLogs`、`StreamUserLogs`），**删除行数 0**；`controller/log.go` 仍只有 B2a 的 `GetLogsSelfStat` 一处调用变化（本次未动 controller）。`GetAllLogs`、`StreamAllLogs`、`streamLogs`、`SumUsedQuota`、`SumUsedToken`、`CountOldLog`、`DeleteOldLogBatch`、`LogFilter.apply`、controller `GetLogsStat` 未改。
- 新符号的全部生产调用点：`model/log.go:142,619,660,666,766`、`model/log_summary.go:51,60,61,72`、`model/log_owned_union.go:134,399`。

### B2b.6 文件

- 新建：`model/log_owned_request.go`、`model/partner_tenant_usage_request_test.go`、`router/partner_tenant_usage_request_test.go`。
- 修改（业务）：`model/log_owned_union.go`（探测加固、投影泛化）、`model/log.go`（`GetUserRequestLogs` 插入探测分支）、`model/log_summary.go`（共享循环）。
- 修改（B2a 的未入库测试）：`model/partner_tenant_usage_union_test.go` 删除 `TestPartnerTenantUsageUnionProbeFailureIsAReadFailure`（其断言“表缺失即报错”与加固相矛盾），由本次两个探测用例取代。
- 还原为 `HEAD`：上述 4 个既有 controller 测试文件。
- 记录：本节、B2a 节更正注、`implement.md` 状态注。未创建任何临时文件（命令输出只在 shell 变量，改文件的内联脚本不落盘）；`TEMPORARY_ARTIFACTS.md` 无新增登记。

### B2b.7 实际执行的命令与真实结果（宿主机；`GO126` = 既有 go1.26.10 工具链，`GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOFLAGS=-mod=readonly`；均在最后一次源码改动之后、07:13 执行）

| 命令 | 性质 | 退出码 |
| --- | --- | --- |
| `gofmt -l` 7 个改动/新建 Go 文件 | 格式检查 | 0，无输出 |
| `go build ./model ./controller ./router ./middleware ./service` | 编译（仅类型检查级证据） | 0 |
| `go vet ./model ./controller ./router ./middleware ./service` | 类型检查（含测试文件），**不执行测试** | 0 |
| `git checkout HEAD -- <4 个既有测试文件>` | 还原已提交内容 | 0 |
| `go test` | **未运行**（宿主机禁止；Docker 不可用且不得启动） | — |

**Go 测试执行数：0。** 以上均不是运行证据。

### B2b.8 测试源码（7 个新顶层，全部未执行；B2a 用例删除 1 个）

`model/partner_tenant_usage_request_test.go`（6 个）：
1. `TestPartnerTenantUsageProbeAbsentTableKeepsLegacyReaders`：LOG_DB 只有 `logs` → 六个 reader 无错误且为旧结果；absent 未被记住；同一 handle 上建表后被识别（阳性被记住），插入独立表行后 list / requests / summary 立即包含它；再把 `LOG_DB` 换成另一个无表 handle → 仍是旧结果，阳性缓存未被沿用。
2. `TestPartnerTenantUsageProbeFailuresAreReadFailures`：取消的 ctx 使存在性检查失败 → `dedicatedLogTablePresent` / `dedicatedLogOwnerHasRows` 报错（不是 absent），`GetUserRequestLogs` / `GetUserLogSummary` / `StreamUserLogs` 报错，随后活 ctx 仍判定 absent；在自有 schema 建一张没有 owner 列的同名表 → 探测失败且表存在 → 六个 reader 全部报错、无数据、无部分和，错误文本无表名/SQL/行内容。
3. `TestPartnerTenantUsageRequestOutcomesAcrossTables`：失败在一张表、成功重试在另一张（双向）；收费但流失败；违规费用 consume + 伴随 error；仅 error；两表各两行空 `request_id`；两表相同本地 id 的两个不同请求都在；完全相等事实（含本地 id）→ 唯一、确定（独立表行）、重复调用稳定；他人同 `request_id` 行不影响；页大小 1/3/5/12/50 的 `total`、顺序、显示 id。
4. `TestPartnerTenantUsageSummaryAcrossTables`：同一场景的 requests/succeeded/failed、钱包与订阅额度拆分、Token = 两表 consume 行之和（另用 SQL 求和交叉核对），重复调用相等，他人汇总只含自己的行。
5. `TestPartnerTenantUsageSummaryRetryAcrossLocalMidnight`：UTC+8 下 error 在午夜前（`logs`）、consume 在午夜后（独立表）；与“同样事实全在 `logs` 的普通用户（旧路径）”的汇总逐字段相等，并显式断言两个日桶。
6. `TestPartnerTenantUsageRequestOrdinaryUserKeepsLegacyPath`：只有 `logs` 行的用户，request outcomes 保持 `id desc`、汇总数值符合旧规则，捕获到的语句中引用独立表的只有 2 次探测且不含 `UNION`。

`router/partner_tenant_usage_request_test.go`（1 个）：`TestPartnerTenantUsageRequestSelfRoutesIgnoreForgedOwnership` —— 真实 `SetApiRouter`：`/api/log/self/requests`、`/api/log/self/summary` 跨表折叠为 1 个成功请求；附加伪造 `user_id/tenant_id/token_id/username/account_id` 响应字节相同；无 admin 信息/归属快照；他人只见自己的行。

**要求但未写出 / 覆盖不足的用例**：
- Part 1：六个 reader 的“与旧结果完全相同”对 list / export / token-recent 只断言条数、self stat 只比 `Quota`，不是逐行相等；HTTP 层的 absent / 探测失败（controller 文案）未写；“存在性检查失败”只用取消的 ctx 触发，`GetUserLogs` / `GetLogByTokenId` / `SumUserUsedQuota`（内部用 `context.Background()`）在 reader 层没有 check-failed 用例，仅有底层函数断言；缓存的并发访问无用例；目录权限不足等非 ctx 类检查失败无用例；MySQL / SQLite / ClickHouse 的 `HasTable` 行为未运行（4 个还原的 SQLite fixture 执行时会覆盖 SQLite 的 absent 路径，但属于既有回归、未执行）。
- Part 2：`wallet_quota_deducted` 混合扣费、`saved_quota` / `comparable_requests` 非零场景的跨表用例未写（现有用例期望为 0）；负时区偏移的跨日用例未写；普通用户“与旧路径相同”是手算期望 + SQL 捕获，没有程序化重放旧实现；两个新 union 没有 dry-run 生成 SQL / ClickHouse 契约用例；union 汇总的 ctx 中途取消、“不整窗入内存”无断言；真实路由只覆盖会话鉴权与上述 5 个伪造参数，未覆盖 PAT、分页越界、时区参数；完全相等事实用例只在 model 层。
- 分库（LOG_DB ≠ DB）下的两个新 reader；live ClickHouse。

### B2b.9 需主会话确认 / 与计划不一致之处（只报告，不自行决定）

1. **`HasTable` 无法区分“不存在”与“检查失败”**（GORM migrator 吞错）。实现用 `logs` 作阳性对照来满足“检查失败 ≠ absent”。残余：(a) 第一条目录查询瞬时失败而第二条成功 → 该次请求被误判 absent（只可能发生在某 handle 首次成功探测之前）；(b) 若部署中 migrator 的目录查询看不到 `logs`（例如 PostgreSQL 表不在 `CURRENT_SCHEMA()`）**且**独立表缺失 → self 读取报错而非回退。表已迁移的稳态不查目录，不受影响。
2. **探测优先**：未迁移节点上每次 self 读取会产生一次失败语句（PostgreSQL 服务器日志每次一条 `relation does not exist`）外加两次目录查询；若将来有调用方在事务内调用这些 reader，PostgreSQL 上失败的探测会中止该事务（当前无此调用）。
3. **`GetUserLogSummary` 错误文案**：旧路径仍把驱动错误原样交给 `common.ApiError`（未改）；探测/union 失败返回通用 `Failed to query logs` 或 ctx 错误。
4. **成员的 request outcomes 顺序**：`id desc` → 全局时间序（仅在其独立表有行后），与 B2a 的 list 一致。
5. **平局方向**：完全相等事实时独立表行胜出（source 大者），为本实现自行选定；汇总对平局不敏感（相等事实分类/日期相同）。
6. **性能**：成员的汇总由数据库对整窗 union 按 `request_id` 排序（最长 10 天），无索引支撑；request outcomes 整窗载入（≤1 天，与旧路径相同）。未做 EXPLAIN。
7. **MySQL collation**：两表 `request_id` 排序规则若不同，union 上的 `ORDER BY` 可能报错或顺序不一致；未验证。
8. 删除了 B2a 的 1 个未入库测试函数（见 B2b.6）。

### B2b.10 未关闭的运行门禁

- 本节 7 个新用例 + B2a 的 10 个 + B1a/B1b 用例 + 还原后的既有回归（`controller/log_summary_test.go`、`log_export_test.go`、`relay_error_log_test.go`、`user_manage_test.go`、`model/log_outcome_test.go` 等）在 owned Docker / 隔离 PostgreSQL 的首次执行（当前执行数 0）。
- pq 上：absent / malformed 表时 `HasTable` 的真实返回、取消 ctx 的行为、两个新 union 的类型解析与 `ownedLogRow` 部分列扫描、汇总排序相邻性、显式 id 插入的夹具可行性。
- B 阶段整体仍未完成：`implement.md` B 段各项不勾选；不得进入 C 切写。

## B 阶段 — B1 复核后的主会话决定（2026-11-17 07:4x CST）

独立复核（`quality-review.stage-b1.md`）提出三项待决定事项，均属已批准设计内的技术细节，由主会话处理：

1. **新增索引 `idx_ptul_time (created_at, id)`**。不选商户的管理员默认列表是该页的主查询，在 PostgreSQL 上原索引集（均以 tenant/user/token 开头）无法支撑按时间倒序分页；`logs` 自身也有 `(created_at, id)`。design §2 要求“具体组合依目标查询校验”。表尚未在任何环境创建，现在加入零迁移成本。改动：`model/partner_tenant_usage_log.go` 两处 tag 与注释，`model/partner_tenant_usage_log_test.go` 的期望索引表增加一行。ClickHouse 排序键 `(created_at, event_id)` 已覆盖时间扫描，无需改动。**未做 EXPLAIN**（无 pq），该索引的实际收益仍是运行门禁。
2. **超长时间窗口的 400 改为既有消息**。原实现统一返回 `Invalid parameters`，前端拿不到上限天数。现在仍是 HTTP 400、仍在任何查询之前拒绝，但消息体复用 `limitLogTimeRange` 既有的 `The time range cannot exceed {{days}} days`（含 `days` 字段）。改动：`controller/partner_tenant_usage_log.go`（解析器把该错误放入请求上下文，`partnerTenantUsageLogInvalid` 读取后输出；解析器签名与其余 400 不变），`docs/partner-tenant-api.md` 两处。既有解析测试只断言 `ok=false`，不受影响；该消息体的 HTTP 断言尚未补。
3. **统计端点无行数/超时上限**：暂不加。它受最大日志范围约束且为流式扫描；D 阶段前端默认使用短时间窗。pq 实测后再决定是否加上限，列为发布注意事项。

主会话在上述改动后执行：`gofmt -l`（触碰文件）无输出；离线 `go build` 五包 + `./relay/...` rc=0；离线 `go vet` 五包 rc=0。`git diff --check` 第一次 rc=2（本节追加时在文件末尾多留了一个空行，属记录文件自身问题），修正后重跑 rc=0。均为格式/类型检查，**Go 测试执行 0**。

## B 阶段 — B2c trellis-check 复核（B2a + B2b，2026-11-17）

完整记录见 `quality-review.stage-b2.md`。本节只登记**代码/测试相对 B2a、B2b 记录的变化**与记录更正；**Go 测试执行数仍为 0**。

- **代码改动 1 处**（`model/log_owned_union.go` `dedicatedLogTablePresent`）：`HasTable(独立表)` = false、`HasTable("logs")` = true 之后，再查一次 `HasTable(独立表)`；为 true 则按“表存在”处理（调用方返回读取失败并记住 handle）。原因：四个驱动的 `HasTable` 都吞掉目录查询错误返回 false（已对照驱动源码，见复核记录 §5），两次查询不是一条原子语句；“第一次查询瞬时失败 + 对照成功”原本会把**已存在**的表报成 absent，使成员在该次读取中静默丢失独立表行。追加查询只缩小窗口，仍非原子（残留风险已登记）。稳态（表已迁移并探测成功过）不受影响。
- **代码改动第 2 处**（同文件 `dedicatedLogOwnerHasRows`）：handle 未记住、探测失败、存在性检查判定“表存在”时，先记住 handle 再**重试一次探测**，成功则返回其结果，再失败才是读取失败。原因：上一条追加的复查会让“表恰好在两次目录查询之间被主节点建出”的那一次读取变成错误；重试后该情形与“首次探测瞬时失败”都得到正确答案。已记住 handle 上的探测失败、存在性检查失败的行为不变。
- **测试 +3 个顶层、强化 1 个**（均在 `model/`，均未执行）：`TestPartnerTenantUsagePresenceCheckFailureFailsEveryReader`（六个 reader 在“探测 + 目录查询被强制失败、legacy 语句正常”时全部失败且不泄漏，并断言每个 reader 恰好 3 条被强制失败的语句）；`TestPartnerTenantUsageSummaryMixedBillingMatchesSingleTable`（`wallet_quota_deducted` 与订阅并存、非零 `saved_quota`、UTC-5 负时区，成员双表汇总与同事实单表汇总逐字段相等）；`TestPartnerTenantUsageRequestWindowGeneratedSQL`（两个请求窗口 union 的 PostgreSQL / ClickHouse 生成 SQL 与绑定参数顺序）；`TestPartnerTenantUsageUnionOrdinaryUserKeepsLegacyPath` 的导出与 token-recent 由“只比行数”改为与旧语句结果逐行全字段相等。
- **四个测试文件的顶层用例数**：`model/partner_tenant_usage_union_test.go` 9、`model/partner_tenant_usage_request_test.go` 9、`router/partner_tenant_usage_union_test.go` 1、`router/partner_tenant_usage_request_test.go` 1，共 20。
- **记录更正**：B2b.1 表格 absent 行与“未迁移节点开销”已按上面的改动更新（1 次失败探测 + 3 次目录查询）。B2a/B2b 其余内容经复核与源码一致，未改。
- **仍未写出**：`/api/log/token` 真实路由伪造参数用例（router 测试进程从不执行 `initCol()`，`GetTokenByKey` 依赖的 `commonKeyCol` 为空，需要先有可导出的列初始化夹具，属夹具/生产代码改动，未自行决定）；探测与 union 路径的应用 logger / DEBUG GORM 秘密标记负向用例；self 统计 rpm/tpm 的旧路径逐字段等价已有（`Stat` 全等），但真实路由上的数值类型断言仅覆盖 quota。
- **命令（宿主机，最后一次改动之后）**：`gofmt -l`（触碰的 3 个 Go 文件及 `model/`）无输出 rc=0；离线 `go build` 五包 rc=0；离线 `go vet` 五包 rc=0（vet 含测试文件类型检查）；`git diff --check` rc=0。最后一次 Go 改动（07:54）之后已重跑。均为格式/类型检查，不是运行证据。

## B 阶段 — B2 复核后的主会话决定（2026-11-17 08:0x CST）

独立复核（`quality-review.stage-b2.md`）提出四项待决定事项，处理如下：

1. **迁移成功后预置“表已存在”**：已采纳。`MigratePartnerTenantUsageLogs` 成功返回前执行 `dedicatedLogTableKnown.Store(LOG_DB)`（SQL 驱动与 ClickHouse 两个分支都是在各自全部步骤成功之后）。效果：执行迁移的节点上，自身/Key reader 不再需要从一次失败的探测去推断表是否存在，复核指出的非原子窗口在该节点上消失；未执行迁移的节点仍由首次成功探测记住。缓存仍只记正向结果并绑定当前 `LOG_DB` handle。已核对现有测试对该缓存的断言（`model/partner_tenant_usage_request_test.go` 第 78/83/109/224 行附近）：迁移之前断言 NotSame、迁移之后断言 Same，预置不改变这些期望。这是源码推理，未运行。
2. **重度成员的列表/汇总性能**（`logs` 无 `(user_id, created_at)` 索引、双表无分支 top-N 下推、汇总按 `request_id` 库内排序）：功能正确，暂不改。需要 pq `EXPLAIN` 证据后再决定是否下推或加索引；不为此给既有 `logs` 表加索引（那是对存量大表的变更，超出本组范围）。列为运行门禁与发布注意事项。
3. **MySQL 两表字符串 collation 不同可能使成员的双表 union 报错**：不改，作为已披露限制。两表由同一数据库的 GORM AutoMigrate 创建，默认 collation 相同；只有 `logs` 是在不同默认 collation 下建表的存量库才可能触发，且只影响独立表里已有行的成员，普通用户不受影响，PostgreSQL（验收目标）不涉及。MySQL 双表路径无任何运行证据。
4. **`/api/log/token` 真实路由的伪造参数用例**：未写。router 测试进程不执行 `initCol()`，补它需要新增可导出的列初始化夹具或改生产代码，不为一个测试扩大改动面。token 最近记录的归属限定目前只有 model 层用例。列为缺失用例。

主会话在第 1 项改动后执行：`gofmt -l`（触碰文件）无输出；离线 `go build` 五包 + `./relay/...` rc=0；离线 `go vet` 五包 rc=0；`git diff --check` 写入本节后第一次 rc=2（又是本记录文件末尾多了一个空行），修正后重跑 rc=0。**Go 测试执行 0**。

## D 阶段 — 管理员页面（前端）

> 状态（2026-11-17 08:53–09:1x CST，trellis-implement 子代理）：**前端源码 + DOM（mock 传输）已执行通过；无真实数据、无浏览器运行、后端从未对数据库执行**。本节只覆盖 `web/`；未改任何 Go 文件、依赖文件、`.trellis/spec`，未触碰 C 阶段（writer 仍无生产调用方）。本阶段不代表任务完成。

### D.1 文件

新增：

- `web/src/features/partner-usage-logs/index.tsx`（页面，受控 `search` / `onSearchChange`）
- `web/src/features/partner-usage-logs/api.ts`（list / stat / LOG 侧 options + 错误分类）
- `web/src/features/partner-usage-logs/types.ts`（zod schema：ID / quota / token / 聚合均为 `z.string()`，`quota_cny` nullable）
- `web/src/features/partner-usage-logs/lib/filters.ts`（URL schema、窗口解析、参数构造、CNY 展示状态）
- `web/src/features/partner-usage-logs/components/{columns,summary,detail-dialog,cny-amount}.tsx`
- `web/src/features/partner-usage-logs/__tests__/partner-usage-logs.test.tsx`、`__tests__/navigation.test.tsx`
- `web/src/routes/_authenticated/partner-usage-logs/index.tsx`

修改：

- `web/src/features/users/components/users-tenant-filter.tsx`：仅新增两个**可选** prop（`fetchOptions`、`queryScope`），默认值即原行为；用户页调用方未改。商户选择器因此被两页复用，没有写第三个变体。
- `web/src/hooks/use-sidebar-data.ts`：Admin 组新增 `Merchant usage logs` → `/partner-usage-logs`，`requiredRole: ROLE.ADMIN`。
- `web/src/lib/operator-route.ts`：`OPERATOR_PREFIXES` 增加 `/partner-usage-logs`（developer shell）。
- `web/src/routeTree.gen.ts`：生成文件，+23 行，未手改（见 D.2）。
- `web/src/i18n/locales/{en,zh,zh-TW,fr,ja,ru,vi}.json`：各 +26 / −0，仅经脚本写入。
- `web/scripts/partner-usage-isolation/add-missing-keys.mjs`：追加 26 个键；原 13 个用户页键保持幂等。

未修改：默认 usage-logs 页面及其统计/导出（`web/src/features/usage-logs/` 零改动，仅 import 其 `CompactDateTimeRangePicker`）；未调用 root-only `/api/partner-tenants`。

### D.2 路由 / 导航 / route tree

- 路由 `/partner-usage-logs`（`_authenticated` 下），`beforeLoad`：`!user || role < ROLE.ADMIN` → 重定向 `/403`；页面组件内再判一次 `canRead`（无会话/非管理员不发任何请求，显示 Access denied）。后端独立强制。
- 未作为既有 usage-logs 页的 tab / 模式；easy 模式导航无此入口。
- route tree：本项目由 `@tanstack/router-plugin`（`rsbuild.config.ts`）在 `rsbuild build/dev` 时生成，无独立 CLI。为在 typecheck 前得到路由，使用已安装的 `@tanstack/router-generator`（插件内部用的同一生成器）以 `node --input-type=module -e` 一次性调用 `new Generator({config: getConfig({target:'react'}, cwd), root: cwd}).run()`（rc=0）。之后 `bun run build:check` 再次经插件生成，文件 sha 前后**一致**（“routeTree unchanged by build”）。

### D.3 URL 键、query key、默认窗口

- URL 键：`page`、`pageSize`、`tenant`、`userId`、`username`、`model`、`requestId`、`type`（`consume`|`error`）、`start`、`end`（Unix 秒）。`tenant` / `userId` 是字符串且必须是规范正 int64 十进制；手写的未加引号数字会被路由解析成 Number → schema 丢弃（不取整、不发送）。非法/超长/含控制字符的文本、非法 type、越界页码同样丢弃。
- query key：列表 `['admin','partner-usage-logs','list', viewerKey, filters, page, pageSize]`；统计 `['admin','partner-usage-logs','stat', viewerKey, filters]`；商户选项 `['partner-usage-logs','tenant-options', viewerKey, keyword, page, selectedId]`。`viewerKey = "<user.id>:<role>:<session.sid>"`，`filters` 含全部过滤与显式窗口。未使用 `placeholderData`；`refetchOnMount: 'always'` 且行/合计只在 `isFetchedAfterMount && !isError` 时展示。
- 默认窗口：最近 **24 小时**（`DEFAULT_WINDOW_SECONDS`），以页面挂载（或每次 Search / Reset）时刻为终点固定下来；URL 给出 `start`/`end` 时用 URL 值。list 与 stat **始终**带同一对显式 `start_timestamp` / `end_timestamp`。页面显示服务端返回的生效窗口（`Effective window`），未返回前显示请求窗口。
- 默认 `page_size` 20（上限 100）。

### D.4 UI 要求对照

| 要求 | 实现 |
| --- | --- |
| 过滤 | 商户（LOG 侧 options，服务端搜索/分页，`selected_id` 解析标签，`selected: null` 回退显示原始 ID）、时间范围、`user_id` 与 `username`、模型、类型、request ID。非法输入 `aria-invalid` + Search 禁用，不发送 |
| 未设置参数省略 | `buildFilterParams` 只写非空值；统计不带 `p` / `page_size` |
| 合计 | CNY（不可用 → Unavailable；原始额度 > 0 且金额为 0.000000 → Less than ¥0.000001）、Raw quota、Requests (retries folded) + Succeeded/Failed + “失败请求仍可能已计费”说明、Records (every attempt)、Tokens（输入/输出）。无 RPM/TPM 卡片 |
| 表格 | 服务端分页（`total`）；时间、商户（快照名，无名回退 `Merchant #<id>`）、账号、模型、类型、tokens、额度 + CNY、时长/流式、request ID、详情 |
| 详情 | 只读 Dialog；`other` 按服务端下发的文本原样显示（不 `JSON.parse`，避免大数取整，也不请求更多数据） |
| 过滤改变回第 1 页 | 所有过滤变更在同一次 `onSearchChange` 中清除 `page` |
| 状态 | 加载（sr-only status + 表格骨架）、空态（含切换前为空属正常的说明）、错误 + Retry、超窗口 400 显示天数、503；范围说明 Alert 在工具栏常驻 |
| 字符串精度 | ID / quota / token / 聚合全程字符串渲染；feature 内无 `Number()` / `parseInt` / `parseFloat` 作用于这些值（唯一的 `Number(BIG_ID)` 在测试里用来构造“被取整的非法输入”） |
| 只读 | 无导出/删除/变更 |

### D.5 实际执行的命令与真实结果（均在 `web/`，`out=$(cmd 2>&1); rc=$?` 取退出码）

| 命令 | rc | 结果 |
| --- | --- | --- |
| router-generator 一次性调用（见 D.2） | 0 | `routeTree.gen.ts` +23 行 |
| `bun run typecheck`（首次 / 加测试后） | 0 / 0 | 无诊断 |
| `bun run i18n:sync`（写入前） | 0 | — |
| `node scripts/partner-usage-isolation/add-missing-keys.mjs` | 0 | 7 语言各 26，共 182；重复执行 2 次均 `Total: 0` |
| `bun run i18n:sync`（写入后） | 0 | — |
| `bun run test -- src/features/partner-usage-logs`（最终，最后一次源码改动之后） | 0 | **2 文件 / 20 通过 / 0 失败 / 0 跳过**（中途三次 rc=1：新增的详情用例失败，前两次是用例取到了表头按钮，第三次暴露真实缺陷，见 D.5a） |
| `bun run test -- src/features/partner-usage-logs src/features/users src/features/usage-logs src/features/partner-oauth-clients`（缺陷修复后重跑） | 0 | **47 文件 / 642 通过 / 0 失败 / 0 跳过**（含本目录 2 文件 20 用例；既有三目录全绿；此前一次为 47 / 639） |
| `bun run test -- src/features/users`（单独复核基线） | 0 | 8 文件 / 64 通过，与派发前基线一致 |
| `./node_modules/.bin/oxlint -c .oxlintrc.json <本次触及文件>`（最终） | 0 | 无诊断（中途两次 rc=1：`api.ts` no-nested-ternary、测试文件 unicorn/prefer-at，均已改正后 rc=0） |
| `./node_modules/.bin/oxfmt --check <本次触及文件>` | 0 | 全部符合（首次 rc=1：3 个本次文件，已用 oxfmt 仅格式化这些文件） |
| `bun run build:check`（共 2 次；第 2 次在 `index.tsx` 缺陷修复之后） | 0 / 0 | tsgo + rsbuild 生产构建成功；两次 route tree 前后 sha 均一致。其后只改过测试文件一行（prefer-at），之后 `bun run typecheck` rc=0、本目录测试 rc=0，未再重跑构建 |
| 只读七语言检查（node） | — | 26 键 × 7 语言，缺失 0；`git diff --numstat` 各 locale 26 / 0 |

未运行：全站 `bun run lint`（既有基线 151 errors / 68 warnings，未重跑；本次文件的定向 oxlint 为 0 诊断）、任何 Go 命令、dev server、浏览器。

### D.5a DOM 用例发现并修复的真实缺陷

详情 Dialog 最初渲染在 `SectionPageLayout` 之下、`SectionPageLayout.Content` 之外；该布局只渲染自己的 slot，Dialog 被丢弃，点击“Details”无任何反应。typecheck / lint / build 均未发现，由新增的详情用例暴露。已把 Dialog 移入 `SectionPageLayout.Content` 内，用例通过。说明：仅靠编译类检查不足以证明交互可用；尚未写 DOM 用例的交互（见 D.7“未写”）同样可能存在此类问题，需 check 派发与浏览器实测覆盖。

### D.6 新增 i18n 键（26）

`Merchant usage logs`、范围说明长句、`No merchant usage records in this window`、空态说明长句、`Failed to load merchant usage logs`、`Amount (CNY, current rate)`、CNY 说明长句、`Raw quota`、`Internal metering units, not money or tokens.`、`Requests (retries folded)`、`Succeeded: {{value}}`、`Failed: {{value}}`、“失败仍可能计费”长句、`Records (every attempt)`、`Input: {{input}} · Output: {{output}}`、`Less than ¥0.000001`、`Less than the smallest displayed unit, not free.`、`All types`、`Effective window: {{start}} – {{end}}`、`Check the user ID, text filters and time range.`、`Merchant usage record details`、`Event ID`、`Upstream request ID`、`Identity source`、`Recorded metadata`、`Summary`。

`The time range cannot exceed {{days}} days` 七语言**已存在**，未重复写入、未覆盖。其余文案复用既有键（`Owning merchant`、`Merchant #{{id}}`、`Unavailable`、`Consume`、`Error` 等）。

### D.7 DOM 用例：已写并执行 vs 未写

已写并通过（20，全部为 **mock HTTP 传输**——证明 UI 发送与渲染行为，不证明后端正确性）：

1. list 与 stat 使用同一显式窗口与过滤；未设置参数省略、无空串；stat 不带 `p`/`page_size`；>2^53 的 tenant_id 原样重发。
2. >2^53 的 ID / quota / token / 聚合按精确字符串渲染；无快照名回退 `Merchant #<id>`。
3. CNY 三态：金额、不可用（非 ¥0）、原始额度 > 0 且 0.000000 → “小于”。
4. 记录数与折叠后请求数分别标注；失败计数与计费合计并存（收费失败可见）。
5. 空态下范围说明存在。
6. 503 错误态 + 范围说明仍在 + 合计不臆造 + Retry 恢复。
7. 超长窗口 400 显示天数上限。
8. 过滤变更同一次更新回第 1 页；非规范 user ID 禁止提交、不发送。
9. 不同查看者（不同 id/role/session、共享 QueryClient、同一过滤）看不到前一查看者缓存的行与合计。
10. 商户选项走 LOG 侧端点、`selected_id`、选中标签；`selected: null` 回退原始 ID；未调用 `/api/user/*` 或 `/api/partner-tenants`。
11. 非管理员组件内拒绝且零请求。
12. 路由守卫：普通用户 → `/403`，管理员与 root 进入；`isOperatorRoute('/partner-usage-logs')`。
13. URL schema 往返；被取整的 Number ID、非规范 ID、溢出 ID、空/含控制字符/超长文本、非法 type、越界分页被丢弃。
14. 26 个新键 + 时间范围键在七语言存在、保留占位符、非英文不等于英文原文。
15–17. 导航：普通用户（developer 与 easy 模式）无入口；管理员、root 有入口且指向 `/partner-usage-logs`。
18. 详情 Dialog：键盘（焦点 + Enter）打开、`other` 文本原样显示（其中 >2^53 数字未被取整）、Escape 关闭。
19. 其他非法输入的 400 显示 `Invalid parameters`，合计不臆造。
20. Reset 清空全部过滤与页码，随后请求为第 1 页且不带已清除的参数。

**未写**（留给后续 check 派发）：

- 商户选择器的搜索/翻页交互与“选择商户/切换类型后回第 1 页”的点击级用例（当前只覆盖了文本过滤提交路径与 `selected_id` 解析）。
- 时间范围选择器交互、分页控件点击（page / pageSize 写回 URL）。
- 真实 TanStack Router 下的 URL 序列化往返（当前是 schema 级 + 受控 harness；未挂真实路由验证 `"…"` 字符串序列化）。
- stat 成功而 list 失败（或相反）的混合态、加载态断言。
- 移动端布局 / 键盘可达性的专门断言。

### D.8 证据边界与未关闭门禁

- **页面在 C 阶段启用前没有真实数据**：writer 无生产调用方，任何当前构建上此页为空属预期；未加假数据、feature flag 或回退到默认日志。
- **未做浏览器运行**（本派发不允许 dev server / 浏览器）；视觉、移动端、键盘操作只有源码与 jsdom 层面的证据。
- 后端三个端点从未对 PostgreSQL / 真实路由执行；DOM 用例对的是 `docs/partner-tenant-api.md` 冻结契约的 mock。
- A-U5 未关闭项：浏览器实测（加载/错误/空态、键盘、移动端、切换商户）、上面“未写”的 DOM 用例、真实路由 URL 往返。
- A-U3 未关闭项：total/过滤/分页/统计同范围需后端 pq 运行证据；“新页不暗示历史完整”仅有文案与 DOM 证据。
- 契约中 UI 无法单独兑现/做了保守处理的点（如实报告，未自行发挥）：
  1. 行级“收费失败”无法可靠标注：契约未给出 violation-fee 标记在 `other` 中的键名，且解析 `other` 会取整大数，故只在合计层用“失败数 + 计费合计 + 说明”呈现，行内不猜测。
  2. 超窗口 400 的天数取自响应体 `days`（或 `message_params.days`）；若后端实际字段形态不同，会退化为通用 `Invalid parameters` 文案——需后端运行时确认。
  3. `q` 搜索截断到 64 码点、`username`/`model`/`request_id` 在前端做了首尾空白裁剪（契约为精确匹配；带首尾空格的值无法从 UI 查询）。
  4. 时间范围只选一端时：缺 `end` 用挂载时刻，缺 `start` 用 `end − 24h`，始终发送显式一对。

### D.9 临时产物

无新建脚本/日志/临时文件（输出均在 shell 变量）。工具刷新的被忽略输出已登记于 `TEMPORARY_ARTIFACTS.md`：`web/src/i18n/locales/_reports/*`、`web/dist/`、`web/node_modules/.tmp/*.tsbuildinfo`。未删除任何东西。

### D.10 trellis-check 复核（2026-11-17 09:14–09:30 CST；详见 `quality-review.stage-d.md`）

复核后代码有变化，以下覆盖 D.3 / D.5 / D.7 中与之不符的陈述：

- **修复的缺陷（5 项 + 1 项 i18n 小修）**：
  1. `types.ts`：统计 `quota_cny.quota_per_unit` / `usd_to_cny_rate` 原为非空字符串，而后端在换算配置无效时发 `null`，导致“不可用”场景整块统计被判为加载失败；已改 `nullable`。原用例夹具 `quota_per_unit: '0'` 是后端不会发的形状，已改为 `null`。
  2. `index.tsx`：两个查询未设 `staleTime`，应用默认 10 秒；10 秒内回到刚看过的页/过滤会显示**伪空态**与 `—`。已显式 `staleTime: 0`。
  3. `index.tsx`：Search / Reset 在默认窗口下先改锚点再改 URL，URL 异步提交时会多发一对“旧过滤 + 旧页 + 新窗口”的 list/stat。锚点改为随 URL 变更一起采用（`pending`）。
  4. `api.ts`：超长窗口天数只从 `message_params.days` 读取（后端不发顶层 `days`）；原用例夹具改为真实响应体。
  5. `index.tsx`：列表失败态不再显示“空结果是预期的”说明。
  6. `columns.tsx` / `detail-dialog.tsx`：硬编码 `IP`、秒单位 ` s` 改用既有键 `t('IP')` / `t('s')`（未新增键，locale 文件未动）。
- **D.3 更正**：默认窗口锚点现在是 `{anchor, pending, search}`；伴随 URL 变更的重新锚定在 `search` 属性变化的那次渲染里生效，URL 不变时立即生效。query key 组成不变。
- **DOM 用例数**：本目录 **3 文件 / 35 用例**（原 2 / 20；新增 `__tests__/interactions.test.tsx` 15 用例）。D.7 “未写”清单中的商户选择器点击级、类型切换、时间范围、分页控件、每页条数、单端失败、加载态、Retry 重发、键盘操作现已写并执行；仍未写的见复核记录 §8。
- **最终一轮命令（最后一次源码改动之后，`web/`，`out=$(cmd 2>&1); rc=$?`）**：四目录测试 rc=0，**48 文件 / 657 通过**；`src/features/users` 单独 rc=0，8 / 64（与基线一致）；`bun run typecheck` rc=0；定向 oxlint rc=0；`oxfmt --check` rc=0；全站 `bun run lint` rc=1，**151 errors / 68 warnings = 既有基线**，本次触及路径 0 命中；写入脚本重跑 `Total: 0`、`bun run i18n:sync` rc=0，七个 locale sha 不变；`bun run build:check` rc=0，route tree diff 仍为 +23 行；`git diff --quiet -- web/src/features/usage-logs` rc=0。
- **证据边界不变**：以上全部是 mock 传输下的 DOM 证据 / 类型检查 / 构建；无浏览器、无真实后端、无真实数据（C 阶段 writer 未启用）。A-U3 / A-U5 的真实浏览器与真实后端门禁仍未关闭。
- **需主会话知悉**：“无限额”展示在日志/统计契约中无对应字段，复核同意判为本页不适用；行级“已扣费失败”标记若要做需后端在 DTO 增加显式字段（契约变更，需用户决定）；文本过滤 trim 比后端严（后端允许首尾空格）；移动端卡片视图在列表失败态会回退显示共享组件的 “No data available”。

## D.11 本地真实浏览器检查（主会话，2026-11-17 UTC 01:37 与 07:48–07:56）

环境：已构建的 `web/dist/` 由任务自有预览 `.local-tests/partner-usage-1117/preview.mjs` 在 `127.0.0.1:3391` 提供，`/api/*` 全部为内存假数据，无任何外连、真实 API、数据库、Key 或模型请求。托管浏览器会话 `ptusage-1117`。**这是前端在真实浏览器里的渲染/交互证据，不是后端证据**：假数据由预览脚本按冻结契约构造，后端端点仍从未对数据库执行，C 阶段 writer 仍未启用。

| 检查 | 结果（证据） |
| --- | --- |
| 管理员桌面 1440×900 | 页面、范围说明、摘要、表格渲染；> 2^53 的 ID / quota / Token 原样显示；`quota=1` 显示“小于 ¥0.000001”（`usage-desktop-admin.png`，DOM 文本） |
| 移动端 390×844 | `scrollWidth=390=innerWidth` 无横向溢出；范围说明、大 ID、微额提示都在 |
| **发现并修复的缺陷** | 移动端金额卡把 `¥18014398509.514502` 截成 `¥18014398509.51…`（`summary.tsx` 的值使用 `truncate`）。截断会隐藏金额位数，DOM 测试与构建都发现不了。改为 `break-all` 换行：修复后 5 张摘要卡的值 `scrollWidth ≤ clientWidth`，均未裁剪（`v2-usage-mobile-admin-fixed-settled.png`）。修复后执行：触碰文件 oxlint/oxfmt rc=0、typecheck rc=0、本目录 vitest 3 文件 / 35 通过、build:check rc=0 |
| 键盘 | 聚焦第一行“详情”按 Enter 打开详情，焦点进入对话框关闭按钮；对话框只显示服务端角色投影的 `other` 原文；Escape 关闭后焦点回到触发按钮（`v2-usage-detail-dialog-keyboard.png`、`v2-usage-after-escape.png`）。观察：关闭后 DOM 中仍残留处于共享 Dialog 退出动画的节点（`data-closed`），视觉上已关闭，属无头浏览器动画计时现象，非本功能缺陷 |
| CNY 不可用 | 金额卡显示“无法展示”，不出现 ¥0；原始额度照常显示 |
| 503 | 显示“数据库出错，请联系管理员”和重试按钮，摘要各值为“—”，范围说明仍在 |
| 普通用户 | 访问 `/partner-usage-logs` 被重定向到 `/403`，导航无入口；预览日志证明浏览器**零次**请求任何管理员接口 |
| root | 可进入、导航有入口、数据渲染 |
| 请求形态（预览日志） | list 与 stat 携带同一对显式 `start_timestamp`/`end_timestamp`；stat 不带 `p`/`page_size`；未设置参数省略 |

无效证据披露：同目录 `usage-mobile-admin.png`、`usage-detail-dialog-keyboard.png`、`usage-cny-unavailable.png` 是在托管浏览器被重新拉起、会话型测试 cookie 丢失之后拍的，实为登录页（预览日志 `viewer=none`），已在 `TEMPORARY_ARTIFACTS.md` 标为无效，不引用。部分 `v2-*` 截图是入场模糊动画帧，以上表格以 DOM 测量为准。

仍未覆盖：真实后端联调、写入启用后的同范围统计、前进/后退历史、屏幕阅读器。

## R. 隔离 PostgreSQL 实跑（2026-11-17 16:24 起，Docker Desktop 由用户启动；主会话执行）

环境（全部已登记于 `TEMPORARY_ARTIFACTS.md`“Runtime gate resources”）：内部网络 `ptusage-1117-net`（`internal=true`）；`ptusage-1117-pq`（postgres:15 → **PostgreSQL 15.19**，无主机端口、非特权，库/用户 `ptusage_fixture`，仅网络内 trust，无密码）；runner 镜像 golang:1.26.10-bookworm（**go1.26.10 linux/arm64**），只读根、只读 `/src`（`git archive` HEAD `834627dfa` 导出，1257 个 Go 文件与工作区逐字节一致，私钥/reports/examples/临时清单均不在其中）、只读主机模块缓存、`GOPROXY=off GOSUMDB=off GOTOOLCHAIN=local GOFLAGS=-mod=readonly`。每个选择器单独运行、只设置自己的 DSN。日志：`.local-tests/partner-usage-1117/runtime-*.log`。

| 选择器 | 结果 |
| --- | --- |
| `go test ./model ./controller ./router -run '^TestPartnerTenantUsage'`（第 1 次，runner `ptusage-1117-go-usage`） | 49 个顶层全部执行、0 跳过；48 通过、**1 失败**：`TestPartnerTenantUsagePresenceCheckFailureFailsEveryReader` |
| 同上（修正测试后第 2 次，`ptusage-1117-go-usage-r2`，08:33:24–08:33:34 UTC） | **rc=0：49/49 通过、107 个子测试通过、0 跳过**；源码中 49 个名称与实际运行名称一一对应；本次建 38 个真实 schema（含 controller HTTP `pt_usage_log_http`/`pt_usage_options_http`、router 真实路由 `pt_usage_*_router`） |

**第 1 次失败的根因（测试注入缺陷，实现未改）**：该用例只在 GORM **Query** 回调链上注入失败，而探测（`Table(...).Scan`）与 migrator 的 `HasTable`（`Raw(...).Scan`）都走 **Row** 回调链，注入从未触发；探测因表确实不存在而失败、目录检查正确判定“表不存在”并回落原路径——这是设计的“表缺失”路径，不是用例要测的“目录检查失败”路径。修正：同一注入函数同时注册到 Row 链（`model/partner_tenant_usage_request_test.go`）。修正后用例按原意命中：每个 reader 3 次（探测 + 两次目录查询）共 18 次注入，6 个 reader 全部返回通用读取错误、错误文本不含注入标记、且不缓存。随后复查同包其余回调注入：所有者查询用 `Find`/`Count`（Query 链），计数与失败注入有效，无假通过；union 用例本来就注册了 Query+Row 两条链。

覆盖到的 B 阶段门禁（真实 pq）：共享 / 独立 LOG_DB 的首次与重复迁移、实际 DDL 与 6 个索引名、>2^53 值与长文本持久化、写入脱敏（插入函数仅测试调用）；管理员 list/stat 同一过滤、折叠与求和（含超 int64 求和的 HTTP 断言）、admin/root 投影；真实 `SetApiRouter` 鉴权与 PAT（options / 日志端点）；六个自身读取（普通用户与原路径一致、成员双表合并/分页/折叠、表缺失回落、探测/目录失败即读取失败、伪造归属参数被忽略）。ClickHouse 只有生成 SQL 契约（无真实 ClickHouse），MySQL/SQLite 双表路径未实跑——均为已披露范围。
