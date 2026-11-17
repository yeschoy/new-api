# 用户列表 Tenant 分类设计

状态：最终评审稿，已随父任务于 2026-11-17 获批实施；进度见 `verification.md`。需求 V1–V6，跨页 owner 语义以父 `research/contract-decisions.md` 为准。

## 1. 依赖与边界

先由日志子任务交付安全 single/batch owner 与用户权限的 safe options，然后本任务消费；不独立扩建缓存、不依赖 LOG_DB，CNY 不是本任务前置。原 OAuth 合作方 client_id/name 和权限逻辑保持，Tenant 为独立维度。

## 2. 参数与分类

列表/搜索统一支持 `user_category=all|ordinary|merchant`（省略等同 all）和规范正 signed-int64 十进制文本 `tenant_id`（可省略）。不接收 Number 产生的舍入值，不静默吞下无效/重复/越界枚举或 ID。

- merchant：EXISTS 对应 PartnerTenantAccount.user_id。
- ordinary：NOT EXISTS 同一关系；并非“不是订阅用户”或“不是 OAuth 用户”。
- all：不加分类谓词；提供 tenant_id 时仍与具体 Tenant 关系相交。
- ordinary + tenant_id 为矛盾条件，返回可解释 400；UI 选择商户时切至 merchant，选 ordinary 时清空 tenant_id。
- disabled/expired 不排除映射，既有用户页可见软删除用户且 mapping 尚在时仍展示归属。物理移除映射不在本任务修复范围。

使用 EXISTS/NOT EXISTS/subquery，不以用户名 p_、组名、当前套餐/余额推断，不把 join 放到分页后才过滤。

## 3. 模型/响应

在 GetAllUsers/SearchUsers 的现有事务和 count/rows 查询中使用同一 typed Tenant filter；保留既有 sort、角色/组/状态/关键词和 OAuth partner 过滤。可抽内部共用 builder/可选参数，保持现有调用默认不变，不为了新功能重写通用分页系统。

按结果页 user IDs 一次批量 owner enrichment；空页直接返回。新管理员用户投影字段：`user_category`、`partner_tenant_id`（规范十进制字符串，无归属为空字符串）、`partner_tenant_name`（安全当前名称）。现有 partner_client_id/name 原样保留；不添加持久化 User 身份列，不写账号/权限/配置。

归属查询错误返回安全错误，不把所有人默认为 ordinary；Tenant 名缺失但 account 关系尚在仍为 merchant，以安全 ID/不可用名称兜底，不暴露任意错误或秘密。

## 4. 权限与选项

沿用现有 user 管理读取 gate，普通管理员/root 可读。安全 `/api/user/tenant-options` 由日志 child 建立，PAT 限 user:read，仅返回 id/name 并包含禁用商户以便定位历史身份；不能调用/放宽 root-only Tenant 管理列表。

元数据选项要有受控搜索/分页与上限，不能全表无界下载；当前选中 ID 的名字可安全补取，不把“选项第一页没有它”当不存在。两页共享安全 owner/option primitive，不跨 LOG_DB join。

## 5. 前端

现有 users feature 追加用户类别/所属商户列及过滤，沿用 useTableUrlState/DataTable 结构。URL state 用独立 Tenant 键，不改旧 partner OAuth 键。getUsers/searchUsers 均传相同新过滤，count 在服务端；切换类别/商户先重置页码，不在新筛选下请求旧页。

Query key 加查看者会话/角色、类别、Tenant ID 及既有全部过滤/排序/分页；旧会话/权限的 placeholder 不能在新会话显示。ID 保持字符串，未知名称/空归属真实展示，不猜商户标签。

加载/错误/无匹配/空选项、键盘、移动布局与七语言完整；翻译仅 sanctioned script 写入后 i18n:sync。保留旧 OAuth column/test，没有相关权限时不得发它的 options 请求。

## 6. 验证与回滚

隔离 pq 证明普通、普通订阅、伪 p_、真实 external/subscription_key、禁用/过期、软删除保留映射及同时有 OAuth 关系的组合；count/分页/排序/关键词/角色/状态/组/两个身份维度均一致。生产路由匿名/user/admin/root/PAT 与负参数测试，JSON 不含秘密标记；按页批量查询无 N+1。

前端 DOM/路由测试 URL/刷新/页码、冲突清理、选项分页、旧 OAuth 保持、缓存跨会话与七语言。Go/DB 只能 owned Docker + 独立 PostgreSQL，缺服务不能称运行通过。

功能是新增读取/filter，无身份 schema 迁移。回滚可撤 UI/新增过滤且保持旧 OAuth；不重绑/删除账号关系、不修改角色。与日志 child 的共享 owner 若仍被其他功能使用不能删除。
