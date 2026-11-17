# 用户分类子任务质量复核（trellis-check）

- 复核时间：2026-11-17 08:34:28 – 08:5x CST（硬性预算 25 分钟）。
- 基线：`HEAD` = `febe9bd3e`，工作区未提交差异；未 `git add` / commit / push，未启动 Docker，未访问生产，未改依赖。
- **Go 测试执行数：0**（Docker 不可达，禁止宿主机 `go test`）。后端全部结论只有【源码推理】或【仅类型检查】。
- 证据标签：【源码推理】【仅类型检查】【mock 执行】（DOM 测试，仅 mock HTTP 传输）【已执行】（本机真实跑过的命令）。mock DOM 测试只证明 UI 行为，不证明后端正确。

## 1. 范围纠正：用户表 placeholder 行为（已完成）

| | 行为 | 证据 |
| --- | --- | --- |
| `HEAD` | `placeholderData: (previousData) => previousData`：**任何** query key 变化（关键词、状态、角色、组、OAuth partner、页码、每页条数、排序、refreshTrigger）加载期间都保留上一批行。key 不含查看者。 | `git show HEAD:web/src/features/users/components/users-table.tsx`【已执行/源码】 |
| 实现者改动 | key 改为 `['users', scopeKey, page, pageSize, sortParams, refreshTrigger]`，`scopeKey` = 查看者 + 关键词 + 状态 + 角色 + 组 + OAuth + 类别 + 商户；仅 `scopeKey` 相同才保留旧行 → **既有的关键词/状态/角色/组/OAuth 筛选变化不再保留旧行**（超出批准范围）。 | 工作区 diff【源码】 |
| 现在 | key = `['users', placeholderScope, page, pageSize, 关键词, status, role, group, partner, sortParams, refreshTrigger]`；`placeholderScope = JSON.stringify([viewerKey, user_category, tenant_id])`。`placeholderData` 仅在 `placeholderScope` 相同才返回上一批行。结果：全部既有输入（关键词/状态/角色/组/OAuth/页码/每页条数/排序/刷新）与 `HEAD` 完全一样保留旧行；只有 **查看者（user.id / role / session.sid）变化** 与 **商户维度（类别 / 商户）变化** 不显示旧行。key 仍完整（查看者 + 全部筛选 + 排序 + 分页）。 | `users-table.tsx:206-225, 272-275` |

与查看者隔离要求无冲突，未需停下请示。

验证【mock 执行】：
- 新增 `keeps the previous rows while a pre-existing filter or page change loads…`（`tenant-classification.test.tsx:612`）：状态筛选变化、翻页，请求永不返回时旧行仍在。
- 新增 `does not show the rows of the previous merchant filter while a new one loads`（`:648`）、`does not reuse cached rows when only the login session changes`（`:580`）。
- 变异验证【已执行】（就地临时修改后按字节恢复，sha 校验一致）：
  - 变异 1（把 `statusFilter` 放回 placeholder 作用域 = 实现者行为）→ 仅“既有筛选保留旧行”测试失败（1 failed / 18 passed）。
  - 变异 2（`HEAD` 的“总是保留”）→ 会话/角色/查看者/商户维度 4 个测试失败（4 failed / 15 passed）。
  说明这些测试对两个方向都有判别力，不是空过。

## 2. 发现与处理

| # | 严重度 | 位置 | 发现 | 处理 |
| --- | --- | --- | --- | --- |
| Q1 | 高（范围） | `web/src/features/users/components/users-table.tsx` | 见 §1：既有筛选的 placeholder 行为被改变。 | **已修复**并加测试。 |
| Q2 | 中（测试缺口） | `tenant-classification.test.tsx` | 仅 `session.sid` 变化的行缓存隔离、选项“上一页”未断言。 | **已补**（会话测试；`Previous page` → `Page 1 of 3` 且按钮禁用）。 |
| Q3 | 中（测试缺口） | `controller/partner_tenant_user_classification_test.go:299-310, 462-480` | HTTP 夹具缺“普通订阅用户”“订阅已过期的商户成员”；排序全枚举未与其他筛选组合。 | **已补源码**（未执行）：`class_subscribed`（active 普通订阅 → ordinary）、`p_class_expired`（expired 商户订阅 → merchant）；6 个排序列 × asc/desc 与 `user_category+tenant_id+status+role+keyword` 组合，逐页校验 total==行数且无重复。 |
| Q4 | 低（记录） | HTTP 层 `group` 组合 | 复核中曾尝试补 `group=` 组合，随后确认 `commonGroupCol` 仅由 model 包内 `initCol()` 初始化，controller 测试包无法初始化，运行时会生成非法 SQL —— **已撤回**，并在测试中留英文注释。group 组合仍只在 model PG 套件覆盖（该夹具调用 `initCol()`）。 | 未覆盖，保留为缺口。 |
| Q5 | 低（观察） | `controller/user.go` + `model.GetPartnerTenantOwners` | 归属 enrichment 在列表事务提交后用 `DB` 另行查询；映射在两次查询之间新增时，单次响应可能出现“按 ordinary 筛出但标成 merchant”的瞬时不一致。只读、映射不可变且极少新增，设计未要求同事务。 | 不改；记录。 |

未发现后端源码缺陷【源码推理】：
- 谓词（`model/partner_tenant_user_filter.go:60-63`）只关联 `partner_tenant_accounts.user_id = users.id`，`tenant_id` 为绑定参数；`EXISTS` 不会放大行数（且 `user_id` 唯一）。
- `GetAllUsersWithTenantFilter`：count（`model/user.go:448`，`tx.Unscoped().Model(&User{})`）与分页（`:456`，`tx.Unscoped()`+`Find(&users)`）都经 `apply`，同一事务、分页前；两种构造 GORM 的 FROM 都是未加别名的 `users`，相关子查询的 `users.id` 均可解析。`SearchUsersWithTenantFilter`（`:520`）在同一个 `query` 上加谓词，count 与分页共用，并与关键词/组/角色/状态（含 `deleted_at IS NOT NULL` 与 `Unscoped`）/OAuth 子查询 AND 组合。排序带 `id DESC` 次序键（既有），跨页稳定。
- SQL 为标准相关子查询，无方言专有语法；PostgreSQL 为验收目标（未实跑），MySQL/SQLite 语法上不受影响。
- `PartnerTenantAccount` 无软删除列，过滤与 enrichment 都是原始表读取，口径一致；不看账户/商户/订阅状态。
- 解析（`controller/partner_tenant_user_classification.go`）：省略=all；空值/重复/未知/非规范/溢出/`ordinary+tenant_id` 均 400 且在任何查询之前；只检查两个新键，既有参数解析路径文本未变。
- enrichment：空页不查；每页一次批量；失败返回 503 安全消息、不落 ordinary；JSON 只多 3 个字符串字段，`partner_client_id/name` 仍 `omitempty`。
- 失败形态：owner 失败 503 与邻近 `/api/user/tenant-options` 的失败形态一致（同一消息与状态码）；前端 axios 对非 2xx 抛错 → 与 200+`success:false` 一样进入既有“查询失败 → 空态”路径，对现有错误处理无害。
- `GetAllUsers` / `SearchUsers` 以零值 filter 委托，零值不加谓词。
- TestMain 新分支位于 legacy SQLite bootstrap 之前，`git diff` 仅 +5 行，旧分支文本未变。
- 文档 `docs/partner-tenant-api.md` 新小节与实现一致，并明确声明运行测试未执行。

未发现前端源码缺陷【源码推理 + mock 执行】：
- `getUsers` / `searchUsers` / `getUserTenantOptions` 仅在有值时发送新参数，不产生空字符串参数。
- 页码与商户参数取自同一 URL `search` 快照，筛选写入与 `page` 清除在同一次 `navigate`（`use-table-url-state.ts:231-237`）；本地 `columnFilters` 先于 URL 更新的那一帧里请求仍使用旧 URL 的商户参数，因此不存在“新商户筛选 + 旧页码”的请求。
- 商户 ID 全程字符串（无 `Number`/`parseInt`/数值 zod）；未调用 root-only `/api/partner-tenants`；无新依赖；新文件有版权头。
- i18n【已执行】：13 个新键及复用键（`All users`、`Loading...`、`Retry`、`Clear filters`、`Previous page`、`Next page`、`Page {{page}} of {{pages}}`）七语言齐全非空，抽查 zh/ja 为真实译文，占位符保留；`bun run i18n:sync` 后 locale diff 不变（7 文件 / +91）。
- DOM 测试渲染真实 `UsersTable`、真实路由 schema、真实 `api.ts`，只 mock `api.get`；不是过度 mock。

## 3. 实现者标注决策的评估

| 决策 | 评估 |
| --- | --- |
| 类别离开 `merchant`（切 `all` 或清空）也清空已选商户 | **一致，可接受**：UI 规则“有商户 ⇒ merchant”下 `all+商户` 不可表示，否则类别会立刻弹回。未改变 API 契约（后端仍支持 `all+tenant_id`）。属交互细节，建议主会话告知用户，不阻塞。 |
| 矛盾深链只归一化请求与 chip，地址栏待下次交互才改写 | **一致，无害**：请求已归一化，不会发出矛盾参数；主动重写需额外导航，设计未要求。 |
| 两种失败形态都落入既有“查询失败 → 空态”，无专门提示 | **与既有行为一致**；是否为 400/503 增加专门提示属产品决定，**需用户决定**（未改）。 |
| 选项缓存 60 秒 | **一致**（邻近 OAuth 选项为 5 分钟）；商户改名后标签最多滞后 60 秒。 |
| 已选商户且弹层关闭时请求一页选项（20 条）解析标签 | **合理，不改**：与打开弹层的第一页是同一 query key，打开时不再多发请求；改成 `page_size=1` 反而多一次请求。 |
| 关键词把 `_`/`%` 当 LIKE 通配符 | 既有行为，未改，范围外。 |

## 4. 边界证据

- 分类仅依据 `PartnerTenantAccount` 关系；无用户名/组/余额/角色/订阅/OAuth/缓存谓词【源码推理】。
- OAuth 维度未动：`partner_client_id` 过滤与字段、前端 `partner` 列/URL 键/权限门控的选项请求【mock 执行：2 个既有维度测试】。
- 只读：新后端文件无 `Create/Save/Update/Delete/Exec`【已执行 grep】。
- 路由/中间件/`service`/`go.mod`/`go.sum`/`web/package.json`/`web/bun.lock` 无改动【已执行 git status】；Stage A 已提交文件未改。

## 5. 命令与真实结果

| 命令 | 退出码 | 结果 | 标签 |
| --- | --- | --- | --- |
| `gofmt -l <8 个 Go 文件>`（go1.26.10） | 0 | 无输出 | 已执行 |
| `go build ./model ./controller ./router ./middleware ./service`（离线、`-mod=readonly`，最后一次 Go 修改后） | 0 | 无输出 | 仅类型检查 |
| `go vet` 同上 5 个包（含三个分类测试文件，`go list` 确认在范围内） | 0 | 无输出 | 仅类型检查 |
| `go test` | — | **未执行，0 个 Go 测试运行** | — |
| `bun run test -- src/features/users`（最后一次前端修改后，08:42:53） | 0 | **8 files / 64 tests 通过，0 失败**（修正前 8 / 61） | mock 执行 |
| 变异 1 / 变异 2（`vitest run …/tenant-classification.test.tsx`） | 1 / 1 | 1 failed·18 passed / 4 failed·15 passed（预期失败），源文件已按字节恢复 | 已执行 |
| `bun run typecheck` | 0 | `tsgo -b` 无输出 | 仅类型检查 |
| `./node_modules/.bin/oxlint -c .oxlintrc.json <8 个触及文件>` | 0 | 无诊断 | 已执行 |
| `./node_modules/.bin/oxfmt --check <8 个触及文件>` | 0 | 格式正确 | 已执行 |
| `bun run i18n:sync` | 0 | locale diff 不变 | 已执行 |

测试源数量（修改后）：Go 顶层测试 7 个（model 2 / controller 3 / router 2），`t.Run` 子测试 12 个（6 / 3 / 3），**均未执行**；DOM 测试 `tenant-classification.test.tsx` 19 个（原 16），users 目录合计 64 个。

未运行：全站 `bun run lint`（既有基线 151 errors / 68 warnings，未重测总数）、`bun run build:check`。

## 6. 仍缺的用例

- HTTP 层 `group` 组合（见 Q4）；router 真实中间件链下的 owner 失败（需导出注入点，属范围扩大，未做）；真实 `GetPartnerTenantOwners` 在 PG 上失败的路径。
- 前端：HTTP 400/503 在页面的专门呈现（当前等同普通失败的空态，仅有通用失败测试）；类别 chip 键盘操作；`q` 超 64 code point 截断；弹层内 Retry 恢复；选项缓存在仅 `session.sid` 变化时的隔离；骨架屏加载态；移动布局。

## 7. 残余门禁（A-V1…A-V5）

| 验收 | mock DOM 证据 | 仅源码推理 | 需 PostgreSQL（Docker） | 需真实浏览器 |
| --- | --- | --- | --- | --- |
| A-V1 归属正确、不误分类 | 列渲染只用服务端字段 | 谓词与 enrichment | **是**：model/controller 夹具全部未跑 | — |
| A-V2 组合 count/行一致、排序跨页、非法参数 | 参数省略/同参、矛盾 URL 归一化 | 同一 query 上 count+分页；400 解析（纯内存测试也未跑） | **是** | — |
| A-V3 批量 enrichment、无秘密/N+1/空页不查 | — | 源码 + 未执行的语句计数测试 | **是** | — |
| A-V4 保留旧 OAuth、不静默忽略 | OAuth 键独立、权限门控 | 字段/过滤未改 | **是**（路由/PAT 矩阵未跑） | — |
| A-V5 键盘/URL/刷新/分页重置/缓存/七语言/权限 | 商户筛选键盘、URL/刷新、页码重置、查看者与商户维度缓存、既有筛选保持 `HEAD`、七语言键 | 匿名/普通用户入口依赖既有 `beforeLoad` 与后端 gate | 路由权限矩阵 | **是**：键盘全流程、移动布局、七语言实际渲染、前后端联调 |

结论：子任务**不能标记完成**；后端为“源码就绪 / 运行阻塞”。

## 8. 本次未做 / 未看完

- `router/partner_tenant_user_classification_test.go` 只看了结构与权限矩阵声明，未逐行审。
- `users-columns.tsx` 只审了 diff；未做移动端与可访问性的逐项核对（仅确认沿用邻近 shadcn 组件写法）。
- 未跑全站 lint 与 `build:check`；未更新 `.trellis/spec/`（契约未经运行验证，不应写入 spec）。

## 9. 本次修改的文件

- `web/src/features/users/components/users-table.tsx`（placeholder 作用域纠正）
- `web/src/features/users/components/__tests__/tenant-classification.test.tsx`（+3 测试、+“上一页”断言）
- `controller/partner_tenant_user_classification_test.go`（+2 类夹具用户、排序×筛选枚举、订阅非分类信号断言；未执行）
- `.trellis/tasks/11-17-partner-user-classification/quality-review.md`（新）、`verification.md`（更正 F2/F3/F4/F7/F8 与后端缺口说明）
- `TEMPORARY_ARTIFACTS.md`（登记本次仅刷新既有缓存、无新产物）

## 10. 提交提示（给主会话）

- `.trellis/` 在 `.gitignore:55` 中被忽略：本目录的 `quality-review.md` 与 `verification.md` 目前**未被 git 跟踪**（`git status` 不显示），提交时需像其他任务记录一样显式 `git add -f`。本次未做任何 staging。
- 结束时间：2026-11-17 08:49 CST（约 15 分钟，预算内）。
