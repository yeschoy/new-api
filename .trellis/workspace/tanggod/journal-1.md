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
