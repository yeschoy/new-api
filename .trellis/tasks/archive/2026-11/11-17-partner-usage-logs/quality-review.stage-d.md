# D 阶段（管理员商户用量页，前端）质量复核

> 复核者：trellis-check 子代理；09:14:20 开始，09:28 停止复核并收尾（硬预算 25 分钟内）。
> 基线：`HEAD = 9dd775cc2` 之上的未提交工作区，仅 `web/`。未改 Go、未改 `.trellis/spec`、未改默认 usage-logs 页、未 `git add/commit/push`、未装依赖、未启动 Docker / dev server / 浏览器。
> 证据标签：【源码推理】【仅类型检查】【mock DOM 执行】【已执行】。mock DOM 只证明 UI 行为，**不证明后端正确**；本页在任何现有构建上都没有真实数据（C 阶段 writer 未启用）。

## 状态

复核完成，发现 5 项缺陷并已全部修复（4 项有先失败后通过的 DOM 用例为证）；另有 1 项 i18n 小修。无遗留阻塞项；有若干需主会话/用户知悉的边界（见 §3、§4、§8）。

## 1. 发现

| # | 严重度 | 位置（修复前） | 证据 | 标签 |
| --- | --- | --- | --- | --- |
| F1 | **高**（契约不符 → 页面伪造失败态） | `types.ts:83-84` `quota_per_unit: z.string()` / `usd_to_cny_rate: z.string()` | Go `service.PartnerTenantQuotaCNYMetadata` 两字段是 `*string`，配置无效时为 JSON `null`（`partnerTenantQuotaCNYText("")` 返回 nil；文档 `docs/partner-tenant-api.md:109` 也写 “string or null”）。恰恰在“CNY 不可用”这一场景，zod 解析失败 → 统计整体变成 “Failed to load merchant usage logs” + Retry，原始 quota / 请求数 / Token 全部变 `—`，而不是“Unavailable”。原测试夹具用了后端永远不会发的 `quota_per_unit: '0'`，所以没暴露。新用例先失败（`Unable to find … 250012`）后通过。 | mock DOM 执行（夹具按 Go 源码推导） |
| F2 | **高**（伪造空态） | `index.tsx` 两个 `useQuery` 未设 `staleTime`，而应用默认 `staleTime: 10s`（`web/src/lib/query-client.ts:47`） | 行/统计只在 `isFetchedAfterMount` 后显示；10 秒内回到刚看过的页或过滤（同一 query key）时不会重新请求，`isFetchedAfterMount=false` 且 `isFetching=false` → 表格显示 **“No merchant usage records in this window”**、统计显示 `—`，而实际有数据。既有测试用 `staleTime=0` 的 QueryClient，所以没暴露。新用例（按应用默认 10s）先失败（上一页后找不到 `row-of-page-1`）后通过。 | mock DOM 执行 |
| F3 | 中（多余的整窗统计扫描 + 旧过滤/旧页请求） | `index.tsx` `submit` / `reset`：`setAnchor(now)` 与 `onSearchChange(next)` 分两步 | 路由导航是异步提交的；`setAnchor` 先同步渲染 → 用**旧过滤 + 旧页 + 新窗口**发出一对 list/stat，随后 URL 生效再发一对。结果不会显示错（key 不同），但每次默认窗口下 Search/Reset 都多做一次整窗统计扫描。用“延迟提交 URL 状态”的 Harness + 固定时钟的新用例先失败（`expected … length 2 but got 3`）后通过。真实路由下是否完全等价需浏览器确认。 | mock DOM 执行（延迟提交模型）；真实 router 未运行 |
| F4 | 中（契约夹具不符 + UI 读取后端不发送的字段） | `api.ts:108-113` 先读顶层 `source.days`；测试夹具 `days: 7`（顶层） | 后端不会发顶层 `days`（见 §6）。UI 另有 `message_params.days` 的回退，所以真实响应本来可用，但唯一的用例验证的是不存在的形状。已删顶层读取，夹具改为真实响应体。 | mock DOM 执行 |
| F5 | 低（错误态下的误导文案） | `index.tsx` `emptyDescription` 恒为“空结果是预期的…” | 列表读取失败时，标题是“加载失败”，说明却是“空结果在切换前是预期的”。失败不是空窗口。已在失败态去掉该说明。 | mock DOM 执行 |
| F6 | 低（i18n 硬编码） | `detail-dialog.tsx:85` `'IP'`；`columns.tsx` / `detail-dialog.tsx` 的秒单位 ` s` | 七语言已有键 `IP`、`s`（zh/zh-TW 为“秒”）。改为 `t('IP')` / `t('s')`，不新增键。 | 源码 + 只读 locale 检查 |

未发现的问题（已检查，见 §5）：产品边界、精度、路由守卫、导航可见性、默认 usage-logs 未改、i18n 26 键、脚本幂等。

## 2. 修复（均在 `web/src/features/partner-usage-logs/`）

- `types.ts`：`quota_cny.quota_per_unit` / `usd_to_cny_rate` 改为 `z.string().nullable()`（F1）。其余字段仍是严格 `z.string()`，数字不会被强转（有用例）。
- `index.tsx`：
  - 两个查询显式 `staleTime: 0`（F2）——保留“只显示本次挂载后读到的数据”的跨查看者保护，同时保证回到旧 key 必然重读（期间显示加载，不显示空态）。
  - 窗口锚点改为 `{anchor, pending, search}`：伴随 URL 变更的新锚点先记为 `pending`，在 `search` 属性真正变化的那次渲染里采用；URL 不变时直接改锚点（F3）。`reset` 同样处理。
  - 列表失败时 `emptyDescription` 为 `undefined`（F5）。
- `api.ts`：`classifyPartnerUsageLogError` 只从 `message_params.days` 读天数（F4）。
- `components/columns.tsx`、`components/detail-dialog.tsx`：`t('s')`、`t('IP')`（F6）。
- `__tests__/partner-usage-logs.test.tsx`：两处夹具改成后端真实形状（`message_params: { days: 7 }`；无效配置 `quota_per_unit: null`）。
- 新增 `__tests__/interactions.test.tsx`：15 个用例（见 §8）。

未改：`users-tenant-filter.tsx`、`use-sidebar-data.ts`、`operator-route.ts`、`routeTree.gen.ts`（build 插件重生成后 diff 仍为 +23 行）、七个 locale 文件、写入脚本、路由文件。

## 3. 未处理及原因

- **移动端卡片视图在列表失败态的说明**：`emptyDescription` 为 `undefined` 时，共享 `card-grid` 会回退显示通用的 “No data available”（标题仍是“加载失败”，上方有带 Retry 的失败提示）。改它要动共享表格组件，超出范围；仅登记。【源码推理】
- **默认窗口在“选商户 / 切类型 / 翻页”时不重新锚定**：窗口末端固定在上次 Search/Reset/挂载时刻，页面上有 “Effective window” 明示，list 与 stat 始终同一对。长时间停留后新记录需点 Search 才会进入窗口。这是实现者的既定设计且翻页期间窗口稳定是合理的，未改；若希望切商户也刷新窗口属产品取舍。【源码推理 + mock DOM 执行】
- **文本过滤比后端更严**：见 §4 第 3 条。
- 没有真实浏览器、没有真实后端：见 §8。

## 4. 实施者标记的决定评估

| 决定 | 结论 | 理由 |
| --- | --- | --- |
| 行级不做“已扣费失败”标记，只在汇总给失败数 + 已扣总额 + 说明 | **一致，保持** | Go DTO 的 `other` 是角色投影后的原文字符串，标记键不在冻结契约里；`JSON.parse` 会把 >2^53 的数字取整。行本身仍显示真实 `quota` / CNY（违规费用是 consume 行，带金额），所以不会被呈现为免费。若产品要行级标记，需要后端在 DTO 增加显式布尔字段 —— **属契约变更，需用户决定**，本次不做。 |
| implement.md D 的“无限额”展示判为不适用 | **一致** | 已逐字段核对 `partnerTenantUsageLogView` / `partnerTenantUsageStatView` / `partnerTenantUsageStatCNY`：没有任何 unlimited 字段；“无限额”属于订阅额度投影（CNY 子任务的接口），不属于日志/统计。建议主会话把该子项标为“本页不适用”而不是未完成。 |
| 文本过滤 trim，带首尾空格的值无法查询 | **一致，但比后端严**（登记） | 后端 `validPartnerTenantUsageLogText` 只拒绝控制字符与超长，允许首尾空格并做精确匹配。用户名/模型名/request_id 带首尾空格在实际数据中极不可能；trim 避免了“全空白 → 空串参数 → 400”。有用例证明全空白不会发出任何空串参数。不需要改；如要支持需产品确认。 |
| 只选时间范围一端时推导另一端（缺 end = 固定的“现在”，缺 start = end − 24h） | **一致** | list 与 stat 永远收到同一对显式时间戳；后端对缺失 start 会回溯到最大范围，UI 更窄但明确显示 “Effective window”。超过上限时走 400 天数提示。 |
| 默认每页 20 | **一致** | 始终显式发送 `page_size`，≤ 后端上限 100；共享分页控件选项 `[10,20,30,40,50,100]` 均合法。 |
| route tree 先手动调用生成器、再由构建插件重生成且结果一致 | **一致** | 我在最后一次源码改动后重跑 `bun run build:check`（rc=0），`git diff --stat web/src/routeTree.gen.ts` 仍为 +23 行，无其他变化。【已执行】 |

## 5. 产品边界证据

- **仅管理员页**：路由 `beforeLoad` 对 `role < ADMIN` 重定向 `/403`；组件自身 `canRead` 还要求 session + access token，非管理员落到组件时 0 请求（既有用例）。导航项 `requiredRole: ROLE.ADMIN`，普通用户在 developer / easy 两种模式都看不到（既有用例）；管理员与 root 可见。`/partner-usage-logs` 在 `OPERATOR_PREFIXES`。不是 usage-logs 的 tab/模式。【mock DOM 执行】
- **不调用 root-only API**：`git grep "api/partner-tenants"` 在本 feature 非测试代码中只命中一条注释；商户选项走 `/api/log/partner-tenants/options`（用例断言未出现 `/api/user/` 与 `/api/partner-tenants`）。【已执行 + mock DOM 执行】
- **只读**：feature 内无导出/删除/变更请求，只有 3 个 GET。`git diff --quiet -- web/src/features/usage-logs` rc=0，且该目录无未跟踪文件（默认页、其统计与导出未改）。【已执行】
- **范围说明恒可见**：数据 / 空 / 加载 / 仅统计失败 / 仅列表失败 / 503 六种状态均有用例断言 `partner-usage-scope-notice`。页面没有任何“最早记录 = 切换时间”的表述。【mock DOM 执行】
- **精度搜索**（`git grep --untracked -E "Number\(|parseInt|parseFloat|z\.number\(\)|z\.coerce|toLocaleString|BigInt|JSON\.parse|Math\."`，feature 非测试代码）：
  - `Math.floor/Math.max`：只作用于秒级时间戳（`index.tsx`、`lib/filters.ts`）。
  - `z.number()`：`created_at`、`type`、`use_time`、`page`、`page_size`、`total`、`start_timestamp`、`end_timestamp`、`scale`，以及 URL 的 `page` / `pageSize` / `start` / `end` —— 与 Go DTO 的 JSON number 字段一一对应（`total` 是行数）。
  - 无 `Number(` / `parseInt` / `parseFloat` / 一元 `+` / `z.coerce` / `JSON.parse` / 对 ID、quota、Token、聚合值的算术或 `toLocaleString`。
  - > 2^53：`tenant_id=9007199254740993` 在请求参数、URL schema、渲染中原样往返；URL 中裸数字（被路由解析成 Number）被 schema 丢弃而非取整（既有用例）；选商户后的请求参数也是原字符串（新用例）。【mock DOM 执行】
- **CNY**：页面无任何换算运算，只渲染服务端字符串；标签为 “Amount (CNY, current rate)” 并附“不是历史扣款 / 钱包余额 / 套餐价格”；`available=false` 或 `null` → “Unavailable”，断言不出现 `¥`；正 quota + `0.000000` → “Less than ¥0.000001”，不出现“free”。【mock DOM 执行】
- **记录 vs 折叠请求**：“Records (every attempt)” 与 “Requests (retries folded)” 分卡；失败数旁有“失败请求仍可能已扣费，其 quota 保留在合计中”。【mock DOM 执行】

## 6. 超长窗口 400 响应体（由 Go 源码推导）

`limitLogTimeRange` 返回 `common.NewMessage("The time range cannot exceed {{days}} days", {"days": maxRange/86400})` → `partnerTenantUsageLogInvalid` → `common.ApiErrorStatus(c, 400, err)`：`body = {success:false, message: err.Error()}`，再 `maps.Copy(body, message.Fields())`，`Fields()` = `{message_key, message_params}`（有参数时）。因此真实响应体是：

```json
{
  "success": false,
  "message": "The time range cannot exceed 30 days",
  "message_key": "The time range cannot exceed {{days}} days",
  "message_params": { "days": 30 }
}
```

（`days` 是 JSON 整数，数值取决于配置。）**没有顶层 `days`**。修复后 UI 只读 `message_params.days`，两个用例的夹具都与此形状一致。其他 400 为 `{success:false, message:"Invalid parameters", message_key:"Invalid parameters"}` → UI 显示 “Invalid parameters”；503 为 `{success:false, message:"Database error, please contact the administrator", message_key:…}` → UI 按状态码显示该文案并提供 Retry。【源码推理 + mock DOM 执行；未对真实后端执行】

## 7. 命令与真实退出码（均在 `web/`，`out=$(cmd 2>&1); rc=$?`；以下为最后一次源码改动之后的最终一轮，09:26–09:28）

| 命令 | rc | 结果 | 标签 |
| --- | --- | --- | --- |
| `bun run test -- src/features/partner-usage-logs src/features/users src/features/usage-logs src/features/partner-oauth-clients` | 0 | **48 文件 / 657 通过 / 0 失败**（派发基线 47 / 642；+1 文件 +15 用例） | mock DOM 执行 |
| `bun run test -- src/features/partner-usage-logs` | 0 | 3 文件 / 35 通过（20 + 15） | mock DOM 执行 |
| `bun run test -- src/features/users` | 0 | 8 文件 / 64 通过，与基线一致（共享选择器对用户页行为无变化） | mock DOM 执行 |
| `bun run typecheck` | 0 | 无诊断 | 仅类型检查 |
| `./node_modules/.bin/oxlint -c .oxlintrc.json <15 个触及文件>` | 0 | 无诊断 | 已执行 |
| `./node_modules/.bin/oxfmt --check <15 个触及文件>` | 0 | 全部符合（我只对本 feature 内自己改动/新增的文件跑过写入式 oxfmt） | 已执行 |
| `bun run lint`（全站） | 1 | **151 errors / 68 warnings，与既有基线相同**；输出中命中本次触及路径 0 处 | 已执行 |
| `node scripts/partner-usage-isolation/add-missing-keys.mjs`（幂等性） | 0 | `Total: 0 translations applied`；七个 locale 的 sha 前后一致 | 已执行 |
| `bun run i18n:sync`（×2） | 0 / 0 | locale 文件 sha 前后一致 | 已执行 |
| `bun run build:check`（×2，第 2 次在最后一次源码改动之后） | 0 / 0 | tsgo + 生产构建成功；route tree diff 仍为 +23 行 | 已执行 |
| `git diff --quiet -- web/src/features/usage-logs` | 0 | 无改动 | 已执行 |

中途的真实失败（均已解决）：新用例首跑 rc=1（F1、F2 暴露，2 失败 / 10 通过）；我把失败文案同时放进 `emptyDescription` 的一次尝试使 4 个用例 rc=1（同一文本出现两次，也确实是重复文案），已改为 `undefined`；延迟提交用例首跑 rc=1（F3 暴露）。未运行：任何 Go 命令、dev server、浏览器、真实 API。

i18n 只读检查【已执行】：feature 使用的 60 个键在七语言全部存在且占位符一致；各 locale `git diff` 均为 +26 / −0（即既有键 `The time range cannot exceed {{days}} days`、用户页 13 键均未被改写）；26 个新键在非英语 locale 中无一与英文原文相同，全部被代码使用。

## 8. 仍无测试的交互 / 剩余门禁 / 未完成项

**本次新增并执行的 DOM 用例（15，`__tests__/interactions.test.tsx`）**：商户选择器搜索 / 翻页 / 选中 / 清除及其后的请求（回第 1 页、list 与 stat 同过滤同窗口、打开选择器不提交表单）；类型切换 all/consume/error；时间范围选择（仅在 Search 后生效，list/stat 同一对）；上一页 / 下一页（stat 无 `p`/`page_size`，回到旧页不出现伪空态）；每页条数切换（回第 1 页）；仅统计失败；仅列表失败；加载态；503 后键盘触发 Retry 真正重发两个请求；无效换算配置的真实响应形状；真实 400 天数响应体；数字冒充字符串被拒绝；全空白文本过滤不发空串并 trim；键盘打开商户选择器与键盘切换类型；URL 异步提交时每次 Search / Reset 只发一对请求。

**仍无测试**：
- 时间选择器手动输入起止时间（只测了预设 “7 Days”）与“只选一端”的推导；起止颠倒的禁用态。
- 商户选项接口失败时选择器内的错误 / Retry（用户页已有同组件的用例，日志页未单独测）。
- 真实 TanStack Router 下的 URL 往返（导航、前进/后退、深链）—— 目前只测了 schema 与受控 Harness；F3 的修复只在“延迟提交”模型下验证。
- 移动端布局（卡片视图）、焦点可见性、读屏播报、七语言下的溢出 —— jsdom 无法证明。
- 首/末页按钮、跳页按钮。

**A-U3 / A-U5 剩余门禁**：
- 已有 mock-DOM 证据：total（记录数）与折叠请求数分开标注；过滤 / 分页 / 统计同一过滤同一窗口；加载 / 错误 / 空态；键盘（表单 Enter、Retry、详情触发、商户与类型）；切换商户；查看者与过滤的缓存隔离；七语言键齐全；未复制 usage-logs feature。
- 需要真实浏览器：移动端布局与触控、真实路由的 URL 状态与前进/后退、弹层定位与焦点陷阱、长翻译溢出、实际可访问性。
- 需要真实后端且 C 阶段 writer 启用：端点从未对数据库执行；“total / 分页 / 金额 / 请求 / Token 同范围”“旧行在默认页可查、新行不双计”只能由真实数据证明；400/503 响应体只按 Go 源码推导；PAT / admin / root 鉴权矩阵属后端门禁（A-U4），前端不能证明。

**没做到的**：没有逐条人工审读七语言译文质量（只做了存在性 / 占位符 / 非英文原文的机械检查）；没有通读 `shadcn-ui` 与 `vercel-react-best-practices` 两个 skill 全文（时间预算内只按其常规要点审了组件组合与渲染期 setState 用法）；没有复核 `verification.md` D 段的每一句历史陈述，只在其后追加了本次复核小节。

## 9. 本次修改的文件

- 改：`web/src/features/partner-usage-logs/index.tsx`、`api.ts`、`types.ts`、`components/columns.tsx`、`components/detail-dialog.tsx`、`__tests__/partner-usage-logs.test.tsx`
- 新：`web/src/features/partner-usage-logs/__tests__/interactions.test.tsx`
- 记录：本文件、`verification.md`（D 段追加 D.10）、`TEMPORARY_ARTIFACTS.md`（追加一条）
