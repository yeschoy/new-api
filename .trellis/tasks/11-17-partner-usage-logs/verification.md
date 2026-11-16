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
