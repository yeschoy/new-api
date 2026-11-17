# 用户分类执行计划

状态：父任务规划已于 2026-11-17 获用户批准实施；进度与真实证据见 `verification.md`，未勾选项即未完成。日志 child 的 owner/options 是明确前置，CNY 无前置关系。

## 顺序

- [ ] 读取父任务 PRD/design/共享 research、现有 User list/search/controller/API/schema/table/route 和旧 OAuth 测试；核对日志 child 实际交付的 safe owner/options。
- [ ] 保存 owner/options A 阶段签名和验证证据，不将其 source-ready 当作日志整体完成；本任务无需等待日志 UI 或 CNY。建立既有 user/OAuth list/search、权限与前端 partner-column 受影响回归清单，审核 fixture 后记录实际命令/执行数，不只测新增分类前缀。
- [x] 新分类/ID typed parser 和共用模型过滤；GetAllUsers/SearchUsers 在 count/rows 分页前应用同条件，保留排序/状态/组/角色/关键词/OAuth。（后端源码级完成，2026-11-17；`gofmt`/`build`/`vet` 通过，Go 测试执行数 0，**运行待验证**，见 `verification.md` §2–§4、§6）
- [x] 按页批量附加 user_category、partner_tenant_id/name，不持久化新角色，不把 owner 查询失败当普通。（后端源码级完成，2026-11-17；**运行待验证**，PG 语句计数与失败路径测试仅有源码，见 `verification.md` §3、§7）
- [x] users API/schema/URL/columns/toolbar 使用独立 Tenant 维度；选择普通清商户、选择商户切类别；先重置分页再新查询。（前端源码完成并有 mock DOM 执行证据，2026-11-17：`bun run test -- src/features/users` 8 files / 61 tests 通过；未与真实后端联调、无浏览器验证，偏差见 `verification.md` F8）
- [x] 使用 user:read safe options，不依赖 Root-only 管理 API；受控选项搜索/分页，缓存按会话/角色及全部过滤隔离。（前端源码完成并有 mock DOM 执行证据：`/api/user/tenant-options` 服务端搜索/分页/`selected_id`，query key 含查看者；仅 id+role 同时切换有缓存隔离测试，见 `verification.md` F3/F7）
- [ ] 七语言经 sanctioned script + i18n:sync，覆盖空/错/未归属、键盘与移动布局；旧 OAuth 字段/权限/test 保留。（部分完成，**未勾选**：13 键已经脚本 + `i18n:sync` 写入七语言并有测试；商户筛选键盘、空/错/未归属有 DOM 证据；移动布局与真实浏览器未验证，见 `verification.md` F7/F9）

## 验证命令（批准后）

在任务自有 Docker runner、空隔离 PostgreSQL `TEST_PARTNER_USER_CLASSIFICATION_POSTGRES_DSN` 内：

```bash
go test -mod=readonly ./model ./controller ./router ./middleware -run '^TestPartnerTenantUserClassification' -count=1 -v
```

需新增对应 TestMain 自包含选择分支，避免 legacy SQLite bootstrap；真实执行而非缺 DSN skip。矩阵包括普通/普通订阅/假 p_、两个真实 Tenant 身份、禁用/过期/软删除映射、Tenant+OAuth 双关联、同关键词/状态/组/角色/排序/跨页、非法/矛盾参数、真实路由/PAT/秘密负例。

在 web 使用现有依赖：

```bash
bun run test -- src/features/users src/features/partner-usage-logs
bun run typecheck
bun run lint
bun run build:check
bun run i18n:sync
```

另执行本次目标文件 oxlint，区分既有全局基线；locale 写入先经过脚本而非直接改 JSON。DOM 测试必须覆盖 URL/刷新/页码、旧 OAuth、跨会话缓存和七语言，不把 mock 行字段当后端归属证据。

## 完成门禁

- [ ] A-V1–A-V5 逐项实际证据，用户页和商户日志页同一 Tenant ID/归属；空页无无界 enrichment、无 N+1。
- [ ] trellis-check 检查全差异、权限、参数/查询同口径与旧伙伴协议；Docker/pq 缺失时报告阻塞，不降级为宿主机或生产运行。（**未勾选**：2026-11-17 已做一轮源码级 trellis-check，记录见 `quality-review.md`——撤回了既有筛选 placeholder 行为的越界改动并补测试；Go 测试执行数仍为 0，Docker/pq 阻塞未解除。）
- [ ] 将已验证契约写 spec，精确路径提交业务/测试/UI/docs/Trellis，不 staged 私钥/报告/临时产物；不推送/部署。
- [ ] 回父级 AC2/AC4/AC8 集成检查。回滚仅新读取/UI，保留真实关系和仍被日志使用的共享 helper。
- [ ] 实际资源登记 TEMPORARY_ARTIFACTS.md；清理须用户同意，Trellis 不清理。
