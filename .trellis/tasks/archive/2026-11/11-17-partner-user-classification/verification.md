# 用户列表 Tenant 分类 — 验证与交接记录

> **最终状态入口**：`implement.md` 与父任务 `final-acceptance.md`。本文件早期Go=0/前端未开始/移动布局未验是历史检查点，已被后续pq、前端和真实backend浏览器证据取代。最终分类7顶层/22子测试再次通过，46项联合回归0失败/skip；前端657通过，大ID/禁用成员/键盘服务端商户搜索/类别联动/移动卡真实后端浏览器已检查。原业务提交`9dd775cc2`。

> 状态：**后端半部 source-ready / runtime-blocked**（2026-11-17，trellis-implement 子代理，后端派发）。
> 前端半部（users 表 UI、URL 状态、i18n、DOM 测试）**未开始**，任务不得勾选为完成。Go 测试执行数 **0**。

## 0. 起始与环境事实

- 子代理开始时间：08:00:11（本机时钟），硬预算 25 分钟。
- 起始 HEAD：`febe9bd3e`；已消费的 A 阶段提交：`69092e8d5`。
- Docker daemon 本会话不可达且不得启动 → 所有 Go 测试、PostgreSQL 迁移/查询**均未执行**；只做了 `gofmt` / `build` / `vet`（类型检查，不是运行证据）。
- 未触碰：`web/`、`.trellis/spec`、`go.mod` / `go.sum` / lockfile、受保护路径；未 `git add` / `commit` / `push`；检索仅用 `git grep` 与明确源码目录。

## 1. 消费的 A 阶段契约（未修改、未重复实现）

- `model.GetPartnerTenantOwners(userIDs []int) (map[int]PartnerTenantOwner, error)`：成员在 map 中、确认非成员缺席、任何失败返回错误且无部分结果、空输入不发查询。
- `controller.parseCanonicalPositiveInt64(raw string) (int64, bool)`：规范正 int64 十进制文本。
- `GET /api/user/tenant-options`（AdminAuth，PAT `user:read`）：供后续前端取商户选项，本次未改动。

## 2. 最终 Go 签名

`model/partner_tenant_user_filter.go`（新增）

```go
const UserTenantCategoryAll, UserTenantCategoryOrdinary, UserTenantCategoryMerchant = "all", "ordinary", "merchant"
var ErrUserTenantFilter = errors.New("invalid user tenant filter")

type UserTenantFilter struct {
    Category string // "" 等同 "all"
    TenantId int64  // 0 = 不限定商户
}
func (f UserTenantFilter) Validate() error            // 未知类别 / 负 ID / ordinary+tenant → ErrUserTenantFilter
func (f UserTenantFilter) IsZero() bool               // 不加任何谓词
func (f UserTenantFilter) apply(query *gorm.DB) *gorm.DB // 包内：count 与 page 共用
```

`model/user.go`（修改；旧函数签名与默认行为不变，改为零值 filter 委托）

```go
func GetAllUsers(pageInfo *common.PageInfo, sortOptions ...UserSortOptions) (users []*User, total int64, err error)            // 不变
func GetAllUsersWithTenantFilter(pageInfo *common.PageInfo, tenantFilter UserTenantFilter, sortOptions ...UserSortOptions) (users []*User, total int64, err error)
func SearchUsers(keyword, group string, role, status *int, partnerClientID string, startIdx, num int, sortOptions ...UserSortOptions) ([]*User, int64, error) // 不变
func SearchUsersWithTenantFilter(keyword, group string, role, status *int, partnerClientID string, tenantFilter UserTenantFilter, startIdx, num int, sortOptions ...UserSortOptions) ([]*User, int64, error)
```

`controller/partner_tenant_user_classification.go`（新增）

```go
var partnerTenantOwnersForUserList = model.GetPartnerTenantOwners // 仅测试可替换的失败注入点
func parseUserTenantFilter(c *gin.Context) (model.UserTenantFilter, bool) // false 时已写 400
func withPartnerTenantOwners(items []adminUserListItem) error             // 每页一次批量；空页不查
func respondUserTenantOwnerUnavailable(c *gin.Context)                    // 503 安全错误
```

`controller/user.go`（修改）：`adminUserListItem` 追加三个字段；`GetAllUsers` / `SearchUsers` 先解析 Tenant 过滤，再走原流程，最后做 Tenant enrichment。

## 3. 参数与响应契约（已实现）

`GET /api/user/` 与 `GET /api/user/search` 含义一致：

| 参数 | 取值 | 行为 |
| --- | --- | --- |
| `user_category` | `all` / `ordinary` / `merchant`；省略 = `all` | 未知值、空值、重复出现 → 400 |
| `tenant_id` | 规范正 int64 十进制文本；可省略 | 空值、重复、非规范（符号/前导零/空格/小数）、非正、溢出 → 400 |
| `ordinary` + `tenant_id` | — | 矛盾 → 400 |

- 校验在任何查询之前（handler 第一步）；400 文案（英文源文案，同时作为 `message_key`）：
  - `user_category must be exactly one of all, ordinary or merchant`
  - `tenant_id must be exactly one positive integer in canonical decimal form`
  - `user_category=ordinary cannot be combined with tenant_id`
- 只检查这两个键（`c.GetQueryArray`），既有参数（keyword/group/role/status/partner_client_id/sort/分页）的宽松解析未改。
- `all`（或省略）+ `tenant_id` 与 `merchant` + `tenant_id` 为同一集合。
- 响应每个用户新增（既有字段名/值/JSON 类型不变，`partner_client_id` / `partner_client_name` 仍为 `omitempty`）：
  - `user_category`: `"merchant"` | `"ordinary"`（始终输出）
  - `partner_tenant_id`: 十进制**字符串**；无归属为 `""`（始终输出）
  - `partner_tenant_name`: 商户当前名称；无归属或商户行缺失为 `""`（后者仍为 `merchant`）
- owner 投影中只有 TenantId / TenantName 进入响应；AccountId / IdentitySource / UserId 不输出。
- owner 批量查询失败 → HTTP 503 `Database error, please contact the administrator`，日志只含 request_id，不含 SQL/驱动错误；不会把用户显示成 `ordinary`。

### 与派发说明的偏差

1. **新 400 文案是三条新的英文 message key**，尚无七语言翻译（前端半部需经 sanctioned script 补齐；在此之前前端按英文原文回退）。
2. owner 查询失败使用 **503**（与 `/api/user/tenant-options` 的失败形态一致），而列表主查询失败仍沿用原有 `common.ApiError`（HTTP 200 + success=false）——未改既有行为。
3. 模型层未改旧函数签名，而是新增两个 `…WithTenantFilter` 函数，旧函数以零值 filter 委托（零值不加谓词，SQL 与改动前一致）。模型函数内部也会 `Validate()`，非法 filter 在 `DB.Begin()` 之前返回 `ErrUserTenantFilter`。

## 4. 过滤 SQL 形态

对外层 `users` 行做相关子查询，仅绑定参数：

```sql
-- merchant（无 tenant_id）
EXISTS (SELECT 1 FROM partner_tenant_accounts WHERE partner_tenant_accounts.user_id = users.id)
-- ordinary
NOT EXISTS (SELECT 1 FROM partner_tenant_accounts WHERE partner_tenant_accounts.user_id = users.id)
-- tenant_id（all 或 merchant）
EXISTS (SELECT 1 FROM partner_tenant_accounts WHERE partner_tenant_accounts.user_id = users.id AND partner_tenant_accounts.tenant_id = ?)
```

- 不含 account/tenant 状态、订阅、角色、组、用户名谓词；不 join `partner_tenants`（商户行缺失的映射仍是 merchant），与 `partnerTenantOwnerQuery` 的成员语义一致；不读一分钟成员缓存。
- count 与 page 共用：`SearchUsersWithTenantFilter` 在同一个 `query`（事务内 `tx.Unscoped().Model(&User{})`）上追加谓词后先 `Count` 再 `Order/Limit/Offset/Find`；`GetAllUsersWithTenantFilter` 的 count 与 page 两条语句分别调用同一个 `tenantFilter.apply(tx.Unscoped()…)`。两者都在 `Limit/Offset` 之前。
- EXISTS 不会像 join 那样重复用户；与 keyword / group / role / status（含 `-1` 软删除）/ `partner_client_id` 以 AND 组合；排序仍由 `UserSortOptions.Apply` 决定。

## 5. 文件

新增：

- `model/partner_tenant_user_filter.go` — typed Tenant 过滤与三条 EXISTS 谓词。
- `controller/partner_tenant_user_classification.go` — 参数解析、按页批量 enrichment、安全 503。
- `model/partner_tenant_user_classification_test.go`（2 个顶层测试）
- `controller/partner_tenant_user_classification_test.go`（3 个顶层测试）
- `router/partner_tenant_user_classification_test.go`（2 个顶层测试）
- 本文件 `verification.md`（注意：`.trellis/` 在 `.gitignore:55`，新文件不会出现在 `git status`，主会话提交时需 `git add -f`）。

修改：

- `model/user.go` — `GetAllUsers` / `SearchUsers` 改为零值 filter 委托；新增两个 `…WithTenantFilter`。
- `controller/user.go` — `adminUserListItem` 三个新字段；两个 handler 接入解析与 enrichment。
- `model/task_cas_test.go` — `TestMain` 新增 `TEST_PARTNER_USER_CLASSIFICATION_POSTGRES_DSN` / `PartnerTenantUserClassification` 旁路分支（既有分支文本未改）。
- `docs/partner-tenant-api.md` — 在安全 options 小节之后新增 “Administrator user list: merchant classification” 小节。**选择理由**：`git grep 'partner_client_id' -- docs/` 无结果，`docs/` 下没有描述管理员用户列表参数/响应的既有文档，因此按派发说明新增小节而非扩展旧文档。
- `.trellis/tasks/11-17-partner-user-classification/implement.md` — 仅勾选后端源码级完成项（标注“运行待验证”）。

未改：`web/`（0 个已跟踪改动）、`router/api-router.go`、`middleware/access_token_routes.go`、`model/partner_tenant_owner.go`、`controller/partner_tenant_options.go`、`go.mod` / `go.sum`、`.trellis/spec`。`task.json` 的 ` M` 状态是子代理开始前就存在的（主会话 start），非本次修改。

## 6. 实际执行的命令（真实退出码）

`GO126=/Users/lyh_god/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.26.10.darwin-arm64/bin/go`，环境 `GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOFLAGS=-mod=readonly`。以下均在**最后一次源码编辑之后**重跑（08:10:49–08:10:51）：

| 命令 | 退出码 | 性质 |
| --- | --- | --- |
| `gofmt -l` 本次 8 个 Go 文件 | 0，输出为空 | 格式检查 |
| `gofmt -l model controller router middleware service` | 0，输出 `controller/cashback.go`、`controller/model_list_test.go` | 这两个是**既有基线**（`git diff --quiet HEAD -- <两文件>` rc=0，本次未触碰），非本次引入 |
| `"$GO126" build ./model ./controller ./router ./middleware ./service` | 0 | 仅类型检查/编译（不含 `_test.go`） |
| `"$GO126" vet ./model ./controller ./router ./middleware ./service` | 0，无输出 | 类型检查（含 `_test.go` 编译），**不是测试执行** |
| `git diff --quiet -- go.mod go.sum` | 0 | 依赖未变 |

中途还各跑过一次 `build ./model ./controller`（rc=0，08:02）、`vet ./model`（rc=0，08:05）、`vet ./model ./controller`（rc=0，08:07）、`vet ./router ./controller`（rc=0，08:08）。另有只读的 `git grep` / `git status` / `git stash list` / `git check-ignore`。

**Go tests executed: 0。** 原因：Docker daemon 不可达且不允许启动；规定禁止在宿主机运行 `go test`，也不得用 SQLite/MySQL/生产替代 PostgreSQL。没有任何迁移、查询、路由鉴权在运行时被验证。

## 7. 测试源码（7 个新顶层测试，全部以 `TestPartnerTenantUserClassification` 开头）

| 测试 | 包 | 需要 PG | 覆盖 |
| --- | --- | --- | --- |
| `…FilterValidation` | model | 否 | Validate 矩阵、IsZero、谓词文本只含账户关系/仅一个绑定参数、非法 filter 在 `DB=nil` 下仍返回类型化错误（未开事务） |
| `…Postgres` | model | 是 | 复用 `seedPartnerTenantUsageFixture`（普通/普通订阅/伪 `p_`/external/subscription_key/禁用商户/禁用账户+过期订阅/商户行缺失/软删除/仅 OAuth）+ 双关联用户 + 管理员；10 种 filter × 6 种排序列 × asc/desc × 页大小 1/2/5/50，list 与 search 结果与顺序一致、total=跨页行数、无重复；filter × keyword × group × role × status（含 -1）× OAuth client 全组合对 Go oracle；旧函数与零值 filter 等价；非法 filter 查询计数为 0；无写入 |
| `…ParameterValidation` | controller | 否 | 两个端点 × 22 个非法/矛盾 query → 400 + 文案 + message_key；`model.DB=nil` 且 owner 查询桩 `t.Fatal`，证明 400 前无查询 |
| `…Enrichment` | controller | 否 | 空页不查；一页一次批量且 ID 列表精确；ID > 2^53 为 JSON 字符串；商户行缺失仍 merchant+空名；既有字段名/值/类型逐键 JSONEq；OAuth 字段保持 omitempty；不泄露 account ID / identity source；失败时不填任何字段 |
| `…HTTPPostgres` | controller | 是 | 真实 handler + PG：每用户三字段与 OAuth 字段、两端点同集合、跨页 total、他商户不出现、软删除、双维度独立与组合、每页恰 1 条 owner 语句/空页 0 条（按语句文本计数）、秘密标记不出现、owner 失败 → 503 且正文无 ordinary/SQL/驱动文本 |
| `…RouteDeclarations` | router | 否 | 真实注册：两个列表端点与 tenant-options 各 1 条、PAT 规则 `user:read`、无新增路由、`/api/partner-tenants` 仍 session |
| `…ProductionRouteAuth` | router | 是 | `SetApiRouter`：匿名 401、普通用户/商户子账号/普通用户 PAT 403、admin/root 会话与 `user:read` PAT 允许、无 `user:read` 的 PAT 403；两个端点均带新参数；非法参数 400 且鉴权先于校验；ordinary 过滤排除商户 |

### 要求但**未写**或只部分覆盖的用例

1. **HTTP 层的 `group` 组合**：`commonGroupCol` 只由包内 `initCol()` 初始化，controller/router 测试包无法调用，因此 group 组合只在 model PG 测试覆盖，HTTP 层未覆盖。
2. **“普通订阅用户”“订阅已过期的成员”**：model 夹具已有；trellis-check（2026-11-17）已在 controller HTTP 夹具补种 `class_subscribed`（active 普通订阅 → ordinary）与 `p_class_expired`（expired 商户订阅 → merchant），并补了 6 个排序列 × asc/desc 与 `user_category+tenant_id+status+role+keyword` 的组合遍历（仅源码，`go vet` 通过，**未执行**）。router 夹具仍未种这两类用户。HTTP 层 `group` 组合经复核确认仍不可行（见第 1 点与 `quality-review.md` Q4）。
3. **keyword / role / status × 每个排序列的全笛卡尔积**未写：排序全枚举只与 filter 组合（list+search），keyword/group/role/status/client 全组合固定用 `username asc`。
4. **owner 失败是通过 controller 包内变量桩注入**，不是让真实 `GetPartnerTenantOwners` 在 PG 上失败；router（真实中间件链）层没有 owner 失败用例。
5. **桌面客户端会话**（`AUTH_DESKTOP_SCOPE_DENIED`）未在本任务 router 测试中覆盖（A 阶段 options 测试覆盖过同一路由组）。
6. MySQL/SQLite 方言下的谓词未做任何验证（PostgreSQL 为验收目标；谓词为标准 SQL）。

## 8. 既有回归清单

| 既有测试 | 是否受影响 | 说明 |
| --- | --- | --- |
| `model/user_pagination_test.go`：`TestGetAllUsersSortsBeforePagination`、`TestSearchUsersSortsBeforePagination` | 代码路径受影响（经委托），预期行为不变 | 旧签名未变；零值 filter 不加谓词。**未运行**。 |
| `model/partner_account_test.go:595-599`（`SearchUsers` 的 OAuth `partnerClientID` 过滤）与 `:589`（`PartnerAccountOwners`） | 代码路径受影响（经委托），预期行为不变 | OAuth 子查询文本未改。**未运行**。 |
| `controller` / `router` / `middleware` 下 | 无直接调用用户列表的既有测试（`git grep -l 'SearchUsers\|GetAllUsers' -- '*_test.go'` 只有上面两个 model 文件） | — |
| `web/src/features/users/components/__tests__/partner-column.test.tsx` 等前端测试 | 不受影响 | 未改 `web/`；响应为纯新增字段。**未运行**。 |
| A 阶段 `…PartnerTenantUsage…` 套件 | 不受影响 | 未改 owner/options 源码；只在测试里复用其 model 夹具函数（只读调用）。 |

未削弱任何既有断言；`model/task_cas_test.go` 仅新增一个分支。

## 9. 夹具 / 进程全局状态风险审计

- PG 夹具仅由 `TEST_PARTNER_USER_CLASSIFICATION_POSTGRES_DSN` 驱动，schema 前缀 `pt_user_class_model_` / `pt_user_class_http_` / `pt_user_class_router_` + 纳秒时间戳，**保留不删**；无 DROP / TRUNCATE；唯一的 `db.Delete` 是对本夹具自建用户的软删除。
- 缺 DSN 时 `require.NotEmpty` **失败**而非 skip。副作用：不带 `-run` 选择、且无 DSN 地跑整个 `./model` / `./controller` / `./router` 时，这 3 个 PG 测试会失败（与 A 阶段 usage 套件同一设计）。
- 保存/恢复的全局：`model.DB`、`model.LOG_DB`（router）、`common` 的主/日志库类型、`common.RedisEnabled`、`common.CryptoSecret`（经 `setupPartnerTenantIsolatedPQ`）、`common.SessionSecret` / `IsMasterNode` / `GlobalApiRateLimitEnable`（router）、`controller.partnerTenantOwnersForUserList`、成员缓存 reset、GORM 回调（Cleanup 中 Remove）。测试均为串行（未调用 `t.Parallel`）。
- model 测试复用 `seedPartnerTenantUsageFixture` / `countPartnerTenantUsageQueries` / `setupPartnerTenantIsolatedPQ`（同包既有测试辅助函数，未修改）；若这些辅助函数将来变动，本套件的 oracle 行数断言（12 个用户、7 个账户）会随之失败，属预期的显式耦合。
- 未产生任何中间文件；`TEMPORARY_ARTIFACTS.md` 无新增登记（未修改该文件）。尚未创建任何 Docker / PostgreSQL 资源。

## 10. 未关闭的运行门禁（对应 A-V1…A-V5）

| 验收 | 源码状态 | 仍缺的运行证据 |
| --- | --- | --- |
| A-V1 归属正确性 | 后端源码 + 测试源码就绪 | PG 实跑 `…Postgres` / `…HTTPPostgres`；UI 展示未开始 |
| A-V2 过滤与 count/分页/排序一致、非法参数可解释 | 后端就绪 | PG 实跑；前端 URL/重置分页部分**未开始** |
| A-V3 按页批量、无 N+1、无秘密、与日志页同 ID 语义 | 后端就绪（复用同一 owner primitive，ID 均为十进制字符串） | PG 语句计数实跑；与日志页的联调未做 |
| A-V4 旧 OAuth 合作方列/筛选保持 | 后端就绪（OAuth 代码未改） | 既有 model 回归与新组合用例实跑；前端旧列回归**未开始** |
| A-V5 键盘/URL/缓存/七语言/权限入口 | 仅后端权限部分有测试源码（`…ProductionRouteAuth`） | 前端全部**未开始**；3 条新 400 文案无翻译 |

建议的运行命令（待任务自有 Docker + 空 PostgreSQL 可用时）：

```bash
TEST_PARTNER_USER_CLASSIFICATION_POSTGRES_DSN=... go test -mod=readonly ./model ./controller ./router ./middleware -run '^TestPartnerTenantUserClassification' -count=1 -v
```

另需单独跑第 8 节的既有回归（它们走 SQLite `TestMain` 引导，需在不设置上述 DSN 的进程中运行，否则会被旁路分支跳过引导）。

## 11. 需主会话/用户裁决的事项（未自行决定）

1. `SearchUsers` 既有关键词搜索把 `_` / `%` 当作 LIKE 通配符（改动前即如此）。因此“关键词 `p_`”并非字面匹配；这不影响分类（分类不看用户名），但前端若提示“按 `p_` 搜索”会有误导。本次未改既有关键词语义。
2. owner 失败返回 HTTP 503，而列表主查询失败仍是既有的 HTTP 200 + `success:false`；两种失败形态不同，前端需分别处理。是否统一未决定。
3. 3 条新的 400 英文文案同时是 `message_key`，需要前端半部经 sanctioned i18n 脚本补七语言。
4. `.trellis/` 被 `.gitignore` 忽略，本文件需 `git add -f` 才会进入提交。

---

# 前端半部（2026-11-17 08:15–08:3x CST，`trellis-implement` 子代理）

范围：仅 `web/`。未改任何 Go 文件、依赖/lockfile、`.trellis/spec`；未 `git add`/commit/push；未启动 Docker；未访问生产或真实 API。后端契约按派发说明冻结实现，未从 mock 自创字段。

## F1. 文件

新增：
- `web/src/features/users/lib/tenant-filter.ts` — 类别/商户 ID 校验与归一化（纯函数，ID 全程字符串，int64 上界用字符串比较，无 `Number`/`parseInt`）。
- `web/src/features/users/components/users-tenant-filter.tsx` — “所属商户”筛选 chip（Popover + cmdk `shouldFilter={false}`，服务端搜索/分页）。
- `web/src/features/users/components/__tests__/tenant-classification.test.tsx` — 16 个 DOM 测试。
- `web/scripts/partner-usage-isolation/add-missing-keys.mjs` — sanctioned 七语言写入脚本（仅本任务 13 个键）。

修改：
- `web/src/features/users/api.ts` — `getUsers`/`searchUsers` 透传 `user_category`/`tenant_id`（未设置即省略）；新增 `getUserTenantOptions`（`GET /api/user/tenant-options`，空值参数一律省略）。
- `web/src/features/users/types.ts` — `userSchema` 增 3 个可选 string 字段；`UserTenantFilterParams`、`userTenantOptionsSchema`（`id: z.string()`，数字型 ID 会被拒绝而不是被舍入）。
- `web/src/features/users/components/users-columns.tsx` — 新列 `user_category`（用户类别）、`partner_tenant`（所属商户）；旧 `partner` 列未动。
- `web/src/features/users/components/users-table.tsx` — URL 状态、归一化、请求参数、query key、placeholder 规则、筛选 UI。
- `web/src/routes/_authenticated/users/index.tsx` — search schema 增 `userCategory`、`tenant`。
- `web/src/i18n/locales/{en,zh,zh-TW,fr,ja,ru,vi}.json` — 仅经脚本写入，每个文件 +13 行（`git diff --stat`：7 files, 91 insertions, 0 deletions）。
- `TEMPORARY_ARTIFACTS.md` — 登记脚本已创建及 `_reports/`/`_extras/` 刷新。

## F2. URL 键 / 请求参数 / query key

- URL 键（独立于 OAuth 的 `partner`，后者未改名未复用）：`userCategory`（`["all"|"ordinary"|"merchant"]`，至多 1 项）、`tenant`（`["<规范十进制字符串>"]`，至多 1 项）。采用与既有筛选相同的 JSON 数组形式，因此 ID 在 URL 中始终是带引号的字符串；手写 `?tenant=9007199254740993`（会被路由解析为 Number）被 schema 丢弃，不会发出。
- 请求参数：`user_category=ordinary|merchant`、`tenant_id=<字符串>`；`all`/未选 → 两个参数都不发送（契约：省略 = all）。仅有商户维度筛选时走 `GET /api/user/`；有关键词或旧筛选（状态/角色/组/OAuth）时走 `GET /api/user/search`，两条路径带相同的商户参数。
- 列表 query key（trellis-check 2026-11-17 更正，见 `quality-review.md` §1）：`['users', placeholderScope, page, pageSize, 关键词, status, role, group, partner, sortParams, refreshTrigger]`，`placeholderScope = JSON.stringify([viewerKey, user_category, tenant_id])`，`viewerKey = "<user.id>:<role>:<session.sid>"`。key 仍含查看者 + 全部筛选 + 排序 + 分页；`placeholderScope` 只决定是否把上一查询的行当 placeholder。
- 选项 query key：`['users', 'tenant-options', viewerKey, q, page, selectedId]`；`enabled` 仅当弹层打开或已有选中 ID。

## F3. UI 要求逐条

| 要求 | 实现 | DOM 证据 |
| --- | --- | --- |
| 两路径同参数、未设置省略、无空串 | `api.ts` 条件展开 / 条件 `set` | 有（#1、#2、#6） |
| ID 全程字符串（> 2^53） | 无数值转换；zod string | 有（`9007199254740993` 在请求、URL、选项请求、列中逐字断言） |
| URL 独立键、刷新/深链 | route schema + `useTableUrlState` | 有（#2、#7） |
| 矛盾/非法 URL 归一化后再请求 | `resolveUserTenantFilter` | 有（#4：ordinary+商户、仅商户、未知类别、`05`、超 int64、数值型、`all`） |
| 选普通清商户、选商户切 merchant | `applyUserTenantFilterChange` | 有（#6） |
| 改筛选先回第 1 页再请求 | 筛选与页码在同一次 navigate 写入；请求的商户参数与页码取自同一 URL 快照 | 有（#5、#6：无任何“新筛选 + 旧页码”请求） |
| query key 含查看者与全部筛选；不跨查看者/不跨商户维度显示 placeholder；既有筛选保持 `HEAD` 行为 | 见 F2；`placeholderData` 仅在 `placeholderScope`（查看者 + 类别 + 商户）相同才保留上一批行；关键词/状态/角色/组/OAuth/页码/每页条数/排序/刷新变化与 `HEAD` 一样保留上一批行 | 有（#11 查看者 id+role 同时切换；#12 仅角色变化；check 新增：仅 `session.sid` 变化、既有筛选/翻页保留旧行、商户维度变化不显示旧行；两组变异验证见 `quality-review.md` §1） |
| 选项：服务端搜索、有界分页、`selected_id` 解析标签、`selected:null` 显示原始 ID、空/错态 | `users-tenant-filter.tsx`，page_size 固定 20 | 有（#2、#3、#6、#8） |
| 列：类别 + 所属商户；空名回退 `Merchant #<id>`；普通用户不显示误导内容；字段缺失不猜测 | `users-columns.tsx`，只读服务端字段 | 有（#15，含伪 `p_` 用户名、OAuth+商户并存） |
| 旧 OAuth `partner` 列/筛选/URL 键/权限门不变，无权限不发 options 请求 | 未改相关代码 | 有（#9、#10 + 既有 `partner-column`/`group-filter`/`permissions` 测试全部通过） |
| 键盘可操作 | 复用 Button/Popover/cmdk | 部分（#7：商户筛选 Enter 打开、方向键 + Enter 选择；类别 chip 沿用既有通用组件，未新增键盘测试） |
| 七语言 | 脚本写入 + `i18n:sync` | 有（#16 + 只读 node 检查 7×13/13） |
| 加载/错误/无匹配 | 沿用 DataTablePage 既有空态 | 部分（#14：空结果与请求失败均显示 `No Users Found` 且无旧行；骨架屏加载态未断言） |
| 移动布局 | chip 位于既有 flex-wrap 工具栏；新列 `mobileOrder` 36/37 | **无**（jsdom 无布局，未做浏览器验证） |

## F4. 实际执行的命令（`web/` 下，真实退出码）

| 命令 | rc | 结果 |
| --- | --- | --- |
| `bun run i18n:sync`（写入前） | 0 | locale 无 diff |
| `node scripts/partner-usage-isolation/add-missing-keys.mjs` | 0 | 每语言 13 条，共 91 |
| `bun run i18n:sync`（写入后，及收尾再跑一次） | 0 / 0 | — |
| `bun run test -- src/features/users`（实现阶段最终） | 0 | **8 files passed / 61 tests passed / 0 failed / 0 skipped**（改动前基线：7 files / 45 tests；新增 1 file / 16 tests） |
| `bun run test -- src/features/users`（trellis-check 修正后，2026-11-17 08:43） | 0 | **8 files passed / 64 tests passed / 0 failed**（`tenant-classification.test.tsx` 16 → 19） |
| `bun run typecheck`（最终） | 0 | `tsgo -b` 无输出 |
| `./node_modules/.bin/oxlint -c .oxlintrc.json <9 个触及文件>`（最终） | 0 | 无诊断 |
| `./node_modules/.bin/oxfmt --check <同 9 个文件>`（最终） | 0 | All matched files use the correct format |
| `bun run lint`（全站） | 1 | 151 errors / 68 warnings，与既有基线一致；其中来自本次文件的诊断 0 条 |
| 只读 node 七语言检查 | 0 | en/zh/zh-TW/fr/ja/ru/vi 各 13/13 非空 |

过程中出现并已修复的失败（如实记录）：首次 typecheck rc=1（`unknown` 索引，已改用 `readUserTenantFilter`）；首次新测试 1/13 失败（同一 document 多次 render 导致 `findByText` 多匹配，属测试写法，已改为按 container 查询）；首次 oxlint rc=1（`prefer-spread`、2 处嵌套三元、2 个测试 warning，均已改）；oxfmt 把 `node:fs`/`node:path` import 提到版权头之前（已改为经 `@/i18n/locales/*.json` 别名导入，版权头与相邻文件逐行一致）；一次 `vi` 标识符与 vitest 冲突（已改名）；一次追加 2 个测试的编辑因命令链前置的误输入空操作（`cp /dev/null /dev/null`，rc≠0，未写任何文件）而未执行，靠测试数仍为 14 发现并重做，最终 16。上表各项均为该次重做之后的最终一轮结果。
未执行：`bun run build:check`、`bun run test -- src/features/partner-usage-logs`（implement.md 列出但不在本次派发必跑清单内）；任何 Go 命令；任何真实浏览器/真实后端。

## F5. 新增 i18n 键（13 个，七语言均为真实译文，非英文拷贝；测试断言非 en 语言 ≠ en 值、`{{id}}` 占位符保留）

`User category`、`Owning merchant`、`Ordinary user`、`Merchant user`、`Merchant #{{id}}`、`Merchant ID: {{id}}`、`Unknown merchant`、`Search merchants...`、`No merchants found`、`Failed to load merchants`，以及 3 条服务端 `message_key`：`user_category must be exactly one of all, ordinary or merchant`、`tenant_id must be exactly one positive integer in canonical decimal form`、`user_category=ordinary cannot be combined with tenant_id`。复用既有键：`All users`、`Loading...`、`Retry`、`Clear filters`、`Previous page`、`Next page`、`Page {{page}} of {{pages}}`。

## F6. 仅 mock 证据的范围

全部 16 个新测试都 mock 了 `api.get`（其中七语言测试直接读取 locale JSON）。它们证明的是 UI 行为（发出什么参数、URL/缓存/渲染如何反应），**不是**后端正确性：服务端是否真的按 `tenant_id` 过滤、400/503 的真实响应体、`selected` 的真实解析、禁用商户是否出现在选项中、total 与行是否一致，均无运行证据。前后端从未联调。

## F7. 要求但未写的 DOM 用例

- 列表加载态（骨架屏）断言；HTTP 400（3 条 message_key）与 503 在页面上的实际呈现/翻译文案（键已入七语言，但未验证用户表在这些响应下会显示什么提示）。
- （trellis-check 已补行缓存部分）仅 `session.sid` 变化时行缓存隔离已有 DOM 测试；选项缓存的隔离仍只在 id+role 同时变化时断言过。
- 商户筛选与排序、每页条数变更、状态/角色/组的逐一组合（Reset 同时清空两个新筛选已测）。
- （trellis-check 已补“上一页”按钮断言）`q` 超过 64 code point 的截断、弹层内 Retry 点击后的恢复仍未测。
- 类别 chip 的键盘操作；移动端卡片/折叠布局；完整表格中旧服务端（缺 3 个字段）的渲染（仅在列级测试覆盖）。

## F8. 与派发说明的偏差 / 需主会话裁决

1. **类别离开 merchant 即清空商户**：派发只要求“选 ordinary 清商户”；实现为切到 `all` 或清空类别时也清商户（否则“有商户 ⇒ merchant”的归一化会把类别立刻弹回 merchant，`all` 无法选中）。
2. **矛盾深链的取舍**：`ordinary + tenant` → 丢弃商户（ordinary 优先）；`tenant` 无类别或 `all + tenant` → 按 merchant 请求。请求与 chip 显示已归一化，但**地址栏本身不会被主动改写**，要到下一次筛选交互才写回规范形式。
3. **既有筛选的 placeholder 行为改变（已由 trellis-check 于 2026-11-17 撤回）**：实现阶段曾让关键词/状态/角色/组/OAuth 变化时不再保留上一批行，超出批准范围。现已恢复为 `HEAD` 行为（这些筛选及页码/每页条数/排序/刷新变化时继续保留上一批行）；仅“查看者变化”和“商户维度（类别/商户）变化”不显示旧行。详见 `quality-review.md` §1。
4. “全部”实现为 chip 中的显式 `All users` 选项（URL `userCategory=["all"]`，不发参数）；未选中任何类别同样等价于全部。
5. 已选商户且弹层关闭时，为解析标签仍会请求选项第 1 页（20 条，带 `selected_id`），有界但多取了不展示的条目；选项 `staleTime` 60 s，商户改名后同会话内标签最多滞后 60 s。
6. 契约未能落实之处：无。后端 §11 第 2 点（503 与 200+`success:false` 两种失败形态）前端未分别定制提示，均落入既有的查询失败 → 空态路径。

## F9. A-V5 未关闭门禁

- 真实浏览器验证（键盘全流程、移动布局、七语言实际渲染）未做。
- 匿名/普通用户不可达入口：依赖既有路由 `beforeLoad`（role < ADMIN → /403，未改）与后端 gate；本次未新增该项前端测试，后端路由权限测试仍只有源码未运行。
- 前后端联调、A-V1–A-V4 的 PG 实跑仍全部待 Docker。
- `trellis-check`、spec 更新、提交均未做；任务未标记完成。

新测试清单（16，F3 表中的 #n 即此处顺序）：未设置时省略参数；深链两路径同参 + 超 2^53 ID + `selected_id` 标签；`selected:null` 原始 ID；矛盾/非法 URL 归一化；改类别先回第 1 页；服务端搜索/分页选商户 → merchant → 选普通清商户；键盘操作 + 刷新恢复；选项空/错态；OAuth 键独立且无权限不请求；有权限时请求 OAuth 选项；跨查看者不显示缓存行/选项；仅角色变化不复用缓存行；Reset 清空两个新筛选；空结果/请求失败的无匹配态；列渲染（有名/空名/普通/伪 `p_`/OAuth+商户/旧服务端）；七语言 13 键。

## 前端半部 — 本地真实浏览器检查（主会话，2026-11-17 UTC 07:55–07:56）

同一任务自有本地预览（`127.0.0.1:3391`，已构建 `web/dist/` + 内存假数据，无外连、无真实后端）。这是 UI 在真实浏览器中的证据，不是后端证据。

- 桌面 `/users`：8 个假用户中，`p_looks_like_merchant` 与仅有 OAuth 关系的用户显示“普通用户”；OAuth 与商户兼有的用户两列同时显示；商户名缺失显示“商户 #77”；停用商户仍为“商户用户”（`v2-users-all-desktop.png`）。
- 深链 `?userCategory=["merchant"]&tenant=["9007199254740993"]`：只显示 104，所属商户标签经 `selected_id` 解析为名称；预览日志证明请求为精确 `tenant_id=9007199254740993`，日志中未出现取整值 `9007199254740992`（`v2-users-merchant-deeplink.png`）。
- 移动端 390×844 + 商户类别：`scrollWidth=390` 无横向溢出，5 个商户用户、无普通用户（`v2-users-merchant-mobile.png`）。
- 未覆盖：真实后端联调（A-V1–A-V4 的后端行为仍只有源码推理）、前进/后退历史、屏幕阅读器。

## 隔离 PostgreSQL 实跑（2026-11-17 08:34:20–08:34:25 UTC，主会话）

环境同 `../11-17-partner-usage-logs/verification.md` R 节。`go test ./model ./controller ./router -run '^TestPartnerTenantUserClassification' -count=1 -v`，仅设置 `TEST_PARTNER_USER_CLASSIFICATION_POSTGRES_DSN`，runner `ptusage-1117-go-userclass`：**rc=0，7/7 顶层、22 个子测试通过，0 跳过**；真实 schema `pt_user_class_model_*`、`pt_user_class_http_*`、`pt_user_class_router_*`。A-V1–A-V4 现有真实 pq 证据（EXISTS/NOT EXISTS 在分页前、count 与行一致、ordinary+tenant_id 400、批量所有者补充、真实路由鉴权）。日志 `.local-tests/partner-usage-1117/runtime-userclass.log`。
