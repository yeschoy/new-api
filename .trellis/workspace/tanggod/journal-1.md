# Journal - tanggod (Part 1)

> AI development session journal
> Started: 2026-09-01

---



## Session 1: 恢复 ui-domain 专属域名回调链路

**Date**: 2026-09-03
**Task**: 恢复 ui-domain 专属域名回调链路
**Branch**: `ui-domain`

### Summary

从 69837cf8 的父提交按白名单恢复完整专属域名能力，保留 UI、Trellis 和 Compose；完成 TDD、全量测试、定向 race、前端构建及隔离 Host 路由验证。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `6b05696e` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 2: 完成主域名泛域匹配

**Date**: 2026-09-04
**Task**: 完成主域名泛域匹配
**Branch**: `codex/desktop-api-v2`

### Summary

完成 09-04-main-domain-wildcards：显式一级泛域 Host 匹配、具体 Host 同源 Cookie 校验、固定 OAuth/重置/支付回调与移除规则回归、Compose 具体 Host 探测。受影响包全量测试、race、根模块及 relaykit vet/build、make test、Compose 假环境渲染全部通过。任务已本地归档，既有四处未提交改动保留；未部署生产或执行远程 Git 操作。

### Main Changes

- 主域泛域配置、单 label 匹配和泛域 Host 的 HTTPS 同源校验。
- OAuth/重置/订单具体 Host 返回及旧规则移除回归。
- Compose 具体 Host 探测、配置示例和共享规范更新。

### Git Commits

| Hash | Message |
|------|---------|
| `5020c7f0` | ✨ feat(domain): 支持主域名泛域匹配 |

### Testing

- [OK] 受影响包全量测试、目标 race 检查、根模块与 relaykit vet/build、make test。
- [OK] Compose 隔离假配置渲染和健康检查命令行为回归。
- macOS race 构建产生链接器警告，测试全部通过且无竞态。

### Status

[OK] **Completed**

### Next Steps

- 本地任务完成；生产上线及 DNS/TLS/代理配置需要单独授权。


## Session 3: 完成注册自动登录与两轮审查

**Date**: 2026-09-04
**Task**: 完成注册自动登录与两轮审查
**Branch**: `feat/custom-domain-callback-flow`

### Summary

完成账号密码注册自动登录；复用会话响应和安全用户 DTO，保留密码登录关闭及会话失败时的注册成功回退。两轮审查补充安全 Cookie 来源校验并修正刷新测试旧数据误判。后端认证 race 回归、前端 46 项测试、类型检查、构建、lint、格式和七语言 i18n 同步通过。任务已本地归档，未推送或部署。

### Main Changes

- 注册成功后应用统一认证数据并进入控制台，保留登录关闭或会话创建失败时的回退。
- 安全 Cookie 模式复用来源校验，避免跨站注册建立登录会话。
- 独立解析刷新响应并验证返回令牌，防止测试沿用注册数据误判。

### Git Commits

| Hash | Message |
|------|---------|
| `94f9c0cc` | 🐛 fix(auth): 支持注册成功后自动登录 |
| `6cb9352a` | 🐛 fix(auth): 校验注册自动登录请求来源 |

### Testing

- [OK] controller/service/middleware/router 相关认证 race 回归；强化刷新断言后再次通过 controller/middleware 注册与来源校验 race 回归。
- [OK] 前端 46 项认证测试、typecheck、build、变更文件 lint/format、七语言 i18n 同步。
- [OK] 用临时 Go overlay 证明缺失刷新数据会被强化后的测试捕获；未修改生产刷新实现。

### Status

[OK] **Completed**

### Next Steps

- 任务已本地归档；后续推送和部署按用户指令执行。


## Session 4: 优化首页品牌与社群入口
<!-- trellis-session: v=2 fp=15fd52429f64b029 -->

**Date**: 2026-09-18
**Task**: 优化首页品牌与社群入口
**Branch**: `qq-image`

### Summary

在首页品牌行加入 yeschoy 玻璃胶囊，保留交流社群在公共页面、轻松模式和开发模式中的常驻入口，并补充响应式、主题与模式回归验证。

### Git Commits

| Hash | Message |
|------|---------|
| `7f4da2c1b` | feat(home): add yeschoy brand badge |

### Status

[OK] **Completed**


## Session 5: 合作方 OAuth 授权日志（专表）
<!-- trellis-session: v=2 fp=9186403f922f6283 -->

**Date**: 2026-10-19
**Task**: 合作方 OAuth 授权日志（专表）
**Branch**: `feat/partner-oauth-audit-rc44`

### Summary

授权/令牌事件写入独立 partner_oauth_authorization_logs 表，新增后台日志页；SQLite/MySQL5.7/PG9.6 迁移已验证，ClickHouse 未验证（用户确认无需验证）。

### Git Commits

| Hash | Message |
|------|---------|
| `431cc580c` | feat(partner-oauth): record authorization events in a dedicated log table |

### Testing

- [OK] [OK] controller/model/service/router/middleware 全量测试、go vet、前端 typecheck 与相关 vitest

### Status

[OK] **Completed**

### Next Steps

- 推送与合入按用户指令


## Session 6: 合作商账号与不限量套餐提交及远端整合
<!-- trellis-session: v=2 fp=18f44a535330b834 -->

**Date**: 2026-11-02
**Task**: 合作商账号与不限量套餐提交及远端整合
**Branch**: `feat/partner-accounts`

### Summary

Implemented partner tenant accounts, unlimited quota and per-user RPM; fixed review items 3 and 4 and preserved the existing remote partner server account implementation.

### Git Commits

| Hash | Message |
|------|---------|
| `d2e908664` | feat(partner): add isolated accounts and rate-limited unlimited plans |
| `2f465c900` | merge: integrate remote partner server accounts with tenant subscription plans |

### Testing

- [OK] Merged tree: go test and go vet for model, middleware, router, controller and service passed.
- [OK] Merged frontend: 34 tests in 9 files, typecheck, affected-module lint and build:check passed.

### Status

[OK] **Completed**

### Next Steps

- Review items 1 (video remix limiter coverage) and 2 (partner plan compliance UI gate) remain open; the user requested only fixes 3/4 and commit/push.


## Session 7: Scheduled group IQ tests and isolated gallery
<!-- trellis-session: v=2 fp=b805d7b9f8935264 -->

**Date**: 2026-11-09
**Task**: Scheduled group IQ tests and isolated gallery
**Branch**: `iq-test`

### Summary

Implemented administrator-configured prompts, concrete group/model targets, interval/daily Beijing schedules, durable single-attempt execution and authenticated latest-only HTML/SVG gallery. Completed focused mock/SQLite/frontend/build/browser checks; documented iframe self-navigation/resource limits and unavailable independent child review. User authorized commit and push; temporary outputs retained for cleanup consent.

### Main Changes

- Add bounded IQ persistence/scheduling/execution and private group-filtered APIs without viewer quota debit or retries.
- Add /iq-tests in both console modes, active opaque-origin previews, versioned admin forms and seven locales; fix schedule input identity.

### Git Commits

| Hash | Message |
|------|---------|
| `11d7d3d0b` | feat(iq-tests): add scheduled group artwork tests |

### Testing

- [OK] Nine focused IQ backend test functions and affected channel-test regression passed; frontend feature tests, affected lint, typecheck and build passed.
- [OK] One local built-app smoke verified Canvas/SVG, parent/storage isolation, blocked subresources and anonymous/member/mobile UI; observed and documented own-frame navigation limitation.

### Status

[OK] **Completed**

### Next Steps

- Push iq-test branch to origin; request consent before deleting inventoried temporary outputs. Keep Trellis logs and default-disabled schedules.


## Session 8: Fix PostgreSQL IQ migration startup failure
<!-- trellis-session: v=2 fp=cf15d62472654cd7 -->

**Date**: 2026-11-09
**Task**: Fix PostgreSQL IQ migration startup failure
**Branch**: `iq-test`

### Summary

Confirmed production deployment failed on introduced iq_configs.targets varchar(16777215), SQLSTATE 22023. Replaced size inference with portable text mapping and added a required PostgreSQL check before image build/deployment. User prioritizes PostgreSQL; real isolated PostgreSQL 15.19 migration, repeat migration, config round trip and full application startup/health passed. No production mutation or main merge.

### Main Changes

- Fix IQTargets JSON column mapping; record PostgreSQL-first acceptance and the actual production incident.
- Add a PostgreSQL 15 service/regression gate to the deployment workflow before build and deploy.

### Git Commits

| Hash | Message |
|------|---------|
| `2089840ad` | fix(iq-tests): prevent PostgreSQL migration startup failure |

### Testing

- [OK] Actual PostgreSQL 15.19 rejects the legacy varchar with 22023; fixed TEXT migration/repeat and exact JSON/prompt round trip pass in a verified isolated schema.
- [OK] Native application build passes, full PostgreSQL-backed startup succeeds, and /api/status returns success=true. Workflow YAML/dependency checks pass.

### Status

[OK] **Completed**

### Next Steps

- Push only iq-test. Main merge/deployment needs owner authorization; temporary local PG resources remain inventoried for approved cleanup.


## Session 9: IQ group tasks, prompt pools and retained run gallery
<!-- trellis-session: v=2 fp=0e2a9bdec5715419 -->

**Date**: 2026-11-11
**Task**: IQ group tasks, prompt pools and retained run gallery
**Branch**: `iq-test`

### Summary

Implemented independent per-group IQ configuration/schedule/run with atomic legacy split, random prompt pool snapshots and existing default prompt. Preserved immutable per-run artwork and descending whole-run cursor pagination. Fixed thumbnail layout with a scaled 1280x960 viewport and direct-body preview markup. IQ-only Go checks, frontend lint/typecheck and 14 targeted checks passed; one local browser visual probe passed. No paid provider calls or deployment. Live PostgreSQL migration check skipped because TEST_POSTGRES_DSN is unset. The user subsequently approved cleanup: removed this session's .iq-independent-tasks-temp-artifacts.md, /tmp/iq-independent-go-check.log, /tmp/iq-independent-web-check.log and /tmp/iq-independent-preview-smoke/. Feature commits and Trellis logs were retained; pre-existing unrelated temporary inventories were left untouched.

### Git Commits

| Hash | Message |
|------|---------|
| `187fc781d` | feat(iq-tests): isolate group tasks and preserve chronological run history |

### Status

[OK] **Completed**


## Session 10: Tenant paid checkout implementation; DB verification blocked
<!-- trellis-session: v=2 fp=b73bd25ae5faec8e -->

**Date**: 2026-11-11
**Task**: Tenant paid checkout implementation; DB verification blocked
**Branch**: `feat/partner-accounts`

### Summary

Implemented paid Tenant subscription orders, order-scoped public cashier, strict Epay CNY confirmation, atomic provisioning/fulfillment and recovery, removed direct grants, forced subscription-only funding including legacy MJ guard. Updated dirty merchant docs and code-spec; two independent reviews fixed issues. Go build/vet and frontend typecheck/build pass; cashier/subscription 85 tests pass. Global frontend lint has pre-existing failures. Docker containers remain created/not-running after start/restart, so all Go/DB runtime tests remain unrun; task kept in_progress, no archive/deploy/live payment/data deletion. Temporary resources inventoried and retained pending cleanup approval.

### Git Commits

| Hash | Message |
|------|---------|
| `a117c925f` | feat(partner): add paid subscription checkout and automatic delivery |

### Status

[OK] **Completed**


## Session 11: Fix explicit IQ plan visibility and deletion
<!-- trellis-session: v=2 fp=7da0db802d2962fa -->

**Date**: 2026-11-11
**Task**: Fix explicit IQ plan visibility and deletion
**Branch**: `iq-test`

### Summary

Fixed the gallery regression: saved plans show one latest group row by default, history is opt-in, creation requires explicit group selection and save, and versioned deletion stops schedules/pending requests while retaining artwork.

### Main Changes

- Added versioned plan tombstones, deleted-group artifact authorization, and latest-row backfill for quiet groups beyond the global history page.
- Updated seven locales and frontend/backend IQ contracts; no new task or production data changes.

### Git Commits

| Hash | Message |
|------|---------|
| `a186b3e4f` | fix(iq-tests): show saved plans once and support plan deletion |

### Testing

- [OK] Passed: go test ./model ./controller ./router -count=1; 18 frontend IQ tests; typecheck; build; scoped lint; changed-file format check; i18n sync.
- [OK] Mock-backed native browser verified one default row, history toggle, explicit create/save/delete and 390px layout without horizontal overflow.
- Not verified: live PostgreSQL test, because the owned local Docker PostgreSQL container failed to start; existing CI PostgreSQL gate remains mandatory. Full frontend lint has unrelated existing violations.

### Status

[OK] **Completed**

### Next Steps

- Deploy only after PostgreSQL CI passes.

### Approved Cleanup

- The user approved cleanup and requested commit/push of the current `iq-test` branch.
- Removed 36 recorded temporary files: local browser observations/screenshots, dev-server log, generated i18n reports, the external truncated build log, and `.iq-plan-visibility-temp-artifacts.md`; removed the two now-empty artifact/report directories.
- Removed only the owned, unstarted `postgres:15` container `iq-plan-visibility-test` (`6dee1b00b4f5`); verified no matching container remains.
- Preserved all Trellis logs, tracked translation tools, `web/dist/`, and the three pre-existing IQ artifact manifests. No production data or application code changed during cleanup.


## Session 12: 商户订阅 Key：付款后开户与原 Key 续费
<!-- trellis-session: v=2 fp=6980cf1759c52f95 -->

**Date**: 2026-11-13
**Task**: 商户订阅 Key：付款后开户与原 Key 续费
**Branch**: `feat/partner-accounts`

### Summary

实现无 external_user_id 的商户 pt_ 下单并返回付款 URL；仅可信付款后原子创建真实 User/Token/账户/单订阅/sub_，支持商户领取、sub_ 独立查询精确额度/Coding Key、原 Key 续费复用用户和双 Key、到期历史及幂等轮换。显式隔离旧 external API/H5 并保留共享收银台/支付读取。必要 Docker PostgreSQL 15.19 定向测试 4 顶层+7模型子例全PASS，无skip；离线build/vet、gofmt、独立trellis-check及精确25路径提交核对通过。原daemon/缺Linux缓存/setup失败和30分钟代理超时保留，限定恢复补两已锁定模块后同源实测成功，go.mod/go.sum未变。归档至 .trellis/tasks/archive/2026-11/11-12-partner-subscription-access-key/，详见verification.md；未做生产/真实支付/部署/完整启动或无关全量。用户原中文guide、私钥及其他未跟踪内容保留未提交，任务Docker/导出/日志在TEMPORARY_ARTIFACTS.md登记，清理待单独授权；未push。

### Git Commits

| Hash | Message |
|------|---------|
| `58616beef` | feat(partner): add subscription access keys and paid-only provisioning |

### Status

[OK] **Completed**


## Session 13: 商户接入 Demo：并行审查、订单恢复修复与提交
<!-- trellis-session: v=2 fp=57fc2831361717cf -->

**Date**: 2026-11-13
**Task**: 商户接入 Demo：并行审查、订单恢复修复与提交
**Branch**: `feat/partner-accounts`

### Summary

完成精简接入指南与零依赖本机 Demo，三个全新上下文只读审查后修复两项 P1 订单串单问题；按用户要求提交并准备普通推送当前 feat/partner-accounts 分支。

### Main Changes

- 接入指南与完整 Demo 共9个文件精确提交；默认mock、live默认只读、凭证仅后端、固定用户归属及明确真实写入开关。
- 页面展示与购买草稿解耦，仅create/replay绑定本意图订单；收银台链接绑定待付款订单，切换/编辑/终态清除并拦截旧查询；补入实际app.js的VM状态回归。
- 用户管理源码核对：开户后内部用户可见并可查订阅；Tenant归属尚未接入现有Partner OAuth列，未扩展该功能。私钥、reports及临时清单保留不提交，不创建或归档其他任务。

### Git Commits

| Hash | Message |
|------|---------|
| `16c4acaa3` | docs(spec): preserve demo purchase intent and checkout isolation |
| `1d3e4b324` | feat(partner): add integration demo with safe order recovery |

### Testing

- [OK] 原有服务端15例与页面状态回归合计28/28 PASS；新增回归先在旧实现中复现11项失败，再修复全通过。
- [OK] 全部Demo JS语法、限定oxlint deny-warnings、暂存及新文件空白、文档链接、假凭证/私钥标记扫描与精确提交路径集合检查PASS。未访问生产或真实支付，未部署、安装依赖或清理。

### Status

[OK] **Completed**

### Next Steps

- P2大整数额度展示精度仍待后续授权处理；真实浏览器/支付渠道验收及商户归属用户管理增强不在本次范围。


## Session 14: 商户互斥接入与授权日志源码检查点
<!-- trellis-session: v=2 fp=dcd9621e657a3824 -->

**Date**: 2026-11-13
**Task**: 商户互斥接入与授权日志源码检查点
**Branch**: `feat/partner-accounts`

### Summary

按用户“提交推送”授权保存模式隔离、授权日志与相关 Trellis 记录；源码独立审阅完成，Docker 不可用导致 Go/PostgreSQL 运行验收仍阻塞，不归档或部署。

### Main Changes

- 默认 subscription_key 与显式 hosted_h5 互斥且创建后固定；专属分组唯一性和已接受订单支付交付边界保持不变。
- 凭证生命周期、拒绝和每次成功查询的安全日志、后台筛选与七语言已实现；修复 SQL 凭证哈希诊断及锁内当前模式元数据问题。
- 88 个精确批准文件已提交，私钥、既有 reports 和临时脚本/诊断未纳入；用户另已批准正常推送当前分支，禁止强推、部署和清理。

### Git Commits

| Hash | Message |
|------|---------|
| `7b4b5af1a` | feat(partner): checkpoint exclusive access modes and authorization audit |

### Testing

- [OK] 已有 7 项商户 DOM + 12 项日志 DOM、TypeScript、定向 lint/format 与七语言覆盖检查通过；本轮提交前精确暂存范围和 git diff --cached --check 通过。
- [OK] 9 audit + 11 mode 顶层 Go 测试只有源码；Go build/test/vet、PostgreSQL 和 ClickHouse 执行均为 0。全站前端 lint 的 151 errors / 66 warnings 基线未扩大修复。

### Status

[OK] **Completed**

### Next Steps

- Docker 可用后在新登记的任务专属 runner/隔离 PostgreSQL 中完成编译、迁移、持久化、权限与跨子任务端到端验收；两子任务继续 in_progress。
- 本轮记录后正常推送 origin/feat/partner-accounts 并核对远端 SHA；临时产物按项目登记保留，仅获单独同意后清理，Trellis 记录保留。


## Session 15: Merchant usage isolation: stages A/B/D, CNY projection, user classification (runtime-blocked)
<!-- trellis-session: v=2 fp=998dddf5e25661e7 -->

**Date**: 2026-11-17
**Task**: Merchant usage isolation: stages A/B/D, CNY projection, user classification (runtime-blocked)
**Branch**: `feat/partner-accounts`

### Summary

Implemented the approved plan for 11-17-partner-usage-isolation at source level: safe Tenant owner/options, fixed-CNY quota_cny, dedicated LOG_DB table + migration + admin read API + compatible own-user two-table readers, users merchant classification, admin merchant usage page. Docker daemon unreachable all session: Go tests executed = 0; stage C writer deliberately NOT enabled. Frontend verified by DOM tests and a local fake-data browser check.

### Main Changes

- usage-logs A/B/D source-ready; C (write routing) blocked by the migration/reader-before-writer gate
- quota-cny: additive quota_cny on independent query, hosted H5 items and catalog; exact decimal, six places, invalid config -> null
- user-classification: user_category/tenant_id filters before pagination; batch owner enrichment; users table filter and column
- New spec .trellis/spec/backend/partner-tenant-usage-isolation.md with explicit evidence boundary

### Git Commits

| Hash | Message |
|------|---------|
| `69092e8d5` | feat(partner): add safe tenant owner and merchant filter options (usage-logs stage A) |
| `8457836d9` | feat(partner): add additive fixed-CNY quota projection for merchant quota APIs |
| `febe9bd3e` | feat(partner): add dedicated tenant usage table, admin read API and compatible self readers (usage-logs stage B) |
| `9dd775cc2` | feat(users): add merchant classification filter and owning-merchant column to the admin user list |
| `1748176a6` | feat(partner): add administrator merchant usage page (usage-logs stage D) |
| `d2135cbda` | fix(partner): wrap merchant usage summary values instead of truncating them |
| `83de2de6c` | docs(spec): record merchant usage isolation contracts and parent integration status |

### Testing

- [OK] Executed: vitest 48 files / 657 tests; tsgo typecheck; touched-file oxlint/oxfmt; build:check; whole-site lint unchanged at baseline 151/68
- [OK] Executed: CNY test oracle recomputed with exact rationals (60/60); OpenAPI parse + 103 refs; local browser QA (fixed a mobile amount truncation)
- [OK] Type-check only: offline go build / go vet go1.26.10 exit 0; 71 new Go test sources never executed

### Status

[OK] **Completed**

### Next Steps

- Make Docker available, register task-owned pq runner, run TestPartnerTenantUsage/QuotaCNY/UserClassification + affected legacy log/user suites + previous-group AccessMode/AuthorizationAudit suites
- Only after B passes on pq: implement stage C write routing, then parent AC1/AC6 and final acceptance; no task archived yet


## Session 16: 11-17商户用量隔离：完成运行验收与归档
<!-- trellis-session: v=2 fp=ab326f70472973ad -->

**Date**: 2026-11-18
**Task**: 11-17商户用量隔离：完成运行验收与归档
**Branch**: `feat/partner-accounts`

### Summary

完成三个11-17子任务及父集成的本地验收与提交归档；补6项Usage顶层和self-stat安全矩阵，独立Docker PostgreSQL两轮69/128通过；CNY/分类/前组/SubscriptionKey联合46/45通过，前端657通过，真实后端浏览器联调完成。整仓基线失败和lint基线单独披露，未推送部署或清理。

### Main Changes

- 补独立LOG_DB单写、结算后真实PG插入失败不影响计费/feed、token生产路由伪参、商户session拒绝、两层logger安全、EXPLAIN与CH生成SQL契约；生产业务源码本轮0改动。
- 两批明确路径工作提交完成；a3cc0bc18归档3 child+parent至archive/2026-11，40份记录保留、四task.json completed、归档后JSONL引用校验通过；其他任务未归档。
- 更新spec和验收证据边界，保留H5 usable额度层面、未知subscription_id不伪造、best-effort可能漏记、非liveCH/非容量验证等限制。

### Git Commits

| Hash | Message |
|------|---------|
| `b5c9dee36` | test(partner): close merchant usage isolation acceptance gaps |
| `3b41b3e13` | docs(partner): finalize November 17 task acceptance |

### Testing

- [OK] 独立Usage Docker PostgreSQL15.19两轮每轮69顶层+128子测试通过，0失败/skip；最终源码SHA256和只读导出一致。
- [OK] 最终非Usage联合5包46顶层+45子测试通过，0失败/skip：CNY15、分类7、AccessMode11、AuthorizationAudit9、SubscriptionKey4。
- [OK] 前端48文件657测试、typecheck/build及本组定向lint/format通过。
- [KNOWN BASELINE / NOT GREEN] 全站lint有151错误/68警告；完整旧回归2007通过/70失败/21skip，其中69为无DSN PG必败，唯一非PG为既有缺表夹具。基线通过集合无新增失败、skip集合相同，不把整个检查报告为通过。
- [OK] 真实backend+假PG浏览器覆盖两页同归属/同scope、默认旧历史、大ID精确请求、admin/root/普通用户、键盘焦点/移动布局/URL历史；fixture server已停止。

### Status

[OK] **Completed**

### Next Steps

- 未授权推送/部署；生产发布需迁移与兼容reader先行，协调所有API/异步节点。
- 所有临时文件、Docker/schema/卷、私钥及报告保留，清理须用户另行明确同意；Trellis记录永不清理。
