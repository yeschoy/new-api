# 执行计划：商户可选独立 H5

## 审批与任务状态

- [x] 用户同意创建任务并进入规划。
- [x] 用户选择 A：独立链接/新窗口/WebView，不支持 iframe。
- [x] 探索现有合同，完成 PRD 收敛、设计和执行计划。
- [x] 已展示最新最终规划摘要，用户后续明确回复“开始”，批准实施。
- [x] 上下文校验通过（8/6 entries）并执行 `task.py start`，任务已为 `in_progress`。

## 最小行为差异与所有权

现状缺的是“绑定可信商户用户后，在平台页面选套餐并形成一次购买”，不是新的支付或账号产品。

预计代码边界（文件名可依实际封装微调，但不得扩产品范围）：

| 区域 | 预计文件 | 必要性 |
| --- | --- | --- |
| 会话持久化 | 新 `model/partner_tenant_purchase_session.go`、其测试及 `model/main.go` | 一次启动兑换、固定期限、幂等会话及迁移；不在客户端存可信用户归属。 |
| 接口 | 新 `controller/partner_tenant_purchase_session.go`、其测试及 `router/partner_tenant.go` | 商户创建/查会话，公开兑换/列套餐/下单；白名单 DTO 与限权能力。 |
| 现有订单复用 | `controller/partner_tenant_order.go` 及旧接口回归 | 仅按需抽取内部 helper，保持原路径、校验及 replay 行为，不复制计费流程。 |
| HTML | `router/web-router.go`、对应 router 测试 | 私有、不可缓存、禁止 iframe 的新敏感页面及路径别名。 |
| H5 | 新 `web/src/features/partner-purchase/**`、`web/src/routes/partner/purchase.tsx` | 选套餐/渠道、错误/恢复、同窗口进入原收银台，移动端与可访问性。 |
| 入口隔离 | `web/index.html`、`web/src/main.tsx`、`web/src/routes/__root.tsx`、public-surface helper/既有 access 测试 | 新页面提前清 fragment、无平台登录/分析；旧 checkout 与普通页不退化。 |
| 静态部署 | `web/scripts/vercel-config.mjs` 与现有 deployment 测试（如需 headers） | 生成器才是实际配置所有者，不创建不存在的 vercel.json。 |
| i18n | 现有 sanctioned script、七种 locale、局部翻译测试 | 全文案覆盖，不能手改 locale JSON。 |
| 文档/spec | `docs/partner-tenant-api.md`、新增 `docs/partner-hosted-h5.zh-CN.md`；相关 checkout/H5 spec 与本任务记录 | 并列 API/H5 接入及安全合同；既有 dirty 中文接入文档原样保留，不纳入本任务提交。 |

不做全局架构重构、管理员 H5 互斥开关、iframe、任意回跳、商户钱包或新渠道。原收银台继续负责支付/结果展示，不为视觉统一大改钱包页。

## 执行顺序

### 1. 环境与基线

- [x] 重新核对 current/artifacts/spec/git 状态，保护私钥、报告、Demo 和既有 dirty 中文文档；没有暂存文件。
- [x] 实施代理加载 before-dev、i18n、shadcn/React 规则，复用已安装组件，无依赖安装。
- [x] Docker 多次只读检查不可连接；未启停 daemon/创建资源、未宿主运行 Go 测试、未接触生产。运行门仍阻塞。
- [x] 临时产物和托管报告/本地 mock 预览已登记 root TEMPORARY_ARTIFACTS.md；预览进程已停止、文件保留待清理批准。

### 2. 会话领域与后端

- [x] 会话加法迁移/索引/nonce/精确 ID/绑定代码与测试已写，无预付款开户；迁移运行门待执行。
- [x] 创建幂等、期限/预算、purpose HMAC、禁用/轮换及 nonce 兑换代码与测试已写；数据库并发未执行。
- [x] 固定 namespaced hash 关联原订单，无双写指针。
- [x] 商户与公开接口、严格 JSON/query/边界/DTO 已实现。
- [x] CNY 合法计划和当前渠道投影、精确 int64 字符串；已存在 pending 原订单通过显式原 POST 恢复支付准备。
- [x] 小型 controller/shared model tx helper 及原 API parity 测试已写并静态分析；实际 Go HTTP parity 运行仍待 Docker。

### 3. 独立 H5 与安全入口

- [x] 新 route/feature 与 strict Zod/dedicated fetch 已实现并测试。
- [x] per-session nonce/能力、早期 scrub 与存储回退已实现；真实浏览器验证 fragment/reload。
- [x] 选择/错误/双击/恢复与同窗口原收银台已实现，F1 failure/status/remount 回归和 mock 浏览器恢复通过。
- [x] narrow public-surface HTML/bootstrap/编码与静态配置回归通过；实际 Go/provider headers 仍未运行验收。
- [x] 26 新 UI 键经脚本覆盖七种语言，sync 和本地化测试通过，保留已有值。

### 4. 接入说明与整体验收

- [x] 英文 API 和新增中文 H5 guide 并列说明路径/BFF/幂等/跟踪/Key/限制；既有 dirty guide 不改不提交。
- [x] 新增 backend/partner-hosted-h5.md 七节 executable contract，更新两个 layer index 和旧 checkout 引用。
- [x] 已完成实施 -> 独立检查 -> 三项修复 -> 独立复查，父会话静态/前端/真实 mock 浏览器验证；R1–R9 证据及运行缺口详见 research/verification-2026-11-12.md。
- [ ] **全量质量门阻塞：**数据库/Go 运行及 PostgreSQL 迁移并发支付验收未通过，不归档。
- [x] 用户明确回复“提交”批准最终 scoped checkpoint；按 research/commit-plan.md 精确加入相关业务与 Trellis 文件，排除原有 dirty 文件/私钥/报告/临时产物。该检查点不代表全量质量门通过，不推送、不归档。

## 验证计划与执行结果

实际结果：父会话 15 files / 267 tests、deployment 4 tests、typecheck/i18n sync/build、scoped lint、cached offline Go build/vet 与 diff checks 通过；Chrome mock desktop/mobile/French/503-refresh-resume/paid/delivered/expired 检查通过。下面 Go runtime 项仍未执行；完整命令和证据见 research/verification-2026-11-12.md。

### 静态与前端

```bash
git diff --check
go build ./...
go vet ./model ./controller ./router
cd web
bun run typecheck
bun run test -- src/features/partner-purchase src/features/partner-checkout
bun run i18n:sync
bun run test:deployment
bun run build:check
```

- 变更文件 gofmt / scoped oxlint / format 检查；全仓 lint 若有既有错误，分别报告基线与本任务新增，禁止顺手修复无关业务。
- 回归 root/main/真实 HTML 早期脚本，canonical/encoded/trailing/negative 路径，原 cashier access、route、bootstrap、普通登录/状态请求不变。
- 所有 public fetch/DTO 的 scope、token purpose、query 拒绝、链接安全、超时取消；兑换丢回复后同 nonce 恢复、不同 nonce 重放拒绝。
- 多语言覆盖，桌面和 390px 长标题/较长法俄越文案布局。

### Docker 后端与数据库（禁止宿主替代）

在 task-owned Docker Go runner 中执行针对 model/controller/router 的 `go test`，数据库优先 PostgreSQL、同时保留现有 Tenant 的 SQLite/MySQL 矩阵与 clientFoundRows 情况。具体 runner/网络/DSN 只使用本任务的隔离测试资源，登记后创建，不复制未跟踪私钥或生产报告到容器。

测试必须覆盖：

- fresh/repeat/upgrade additive migration；既有订单/账号保持不变。
- session 创建/重放/预算；大小写 ID；跨租户用户；会话期限、purpose 混用、secret 轮换/禁用。
- 并发兑换、同 nonce 回复恢复、不同 nonce 抢占失败；多副本/重启签名稳定性。
- 并发/双击相同订单一次、不同 plan/method 冲突；网关准备失败后同订单恢复；会话到期不截断已签发的订单期限。
- 原 HTTP 合同回归、过期后的商户查会话/查单、公共 DTO 不含身份或 Key。
- 真实执行 mock TLS 网关测试的未付款不交付、重复/晚回调、已付款交付失败恢复及不重复续期。
- 旧 Merchant API / PartnerServer 与 OAuth 非同一产品语义，不因 H5 抽取被合并。

### 真实浏览器（仅本地 mock，不真实交易）

使用 agent_browser 打开本地构建与明确标记的虚假会话/订单 fixtures，验证选购→订单链接→原收银台→mock pending/paid/delivered；刷新、过期、无存储、重复点击和 390px 页面。确认地址栏无敏感 fragment、无第三方脚本和平台登录请求；截图必须以工具 artifact verification 为准。不能把这些视为后端验签/数据库测试通过。

## 风险门与回滚

- 未获最终规划批准：停止在 planning，不提前编辑代码。
- Docker 持续不可用：允许已批准的代码实现/静态前端验证，但不宣称全量完成、不归档任务；单独报告准确缺口。
- 对旧订单创建 helper 的改动若无法用回归证明等价，缩小抽取边界，不复制或重写其支付领域逻辑。
- 回滚关闭新入口/前端路由，保留新会话历史与所有已形成订单、付款证据及交付恢复；绝不删除数据来“回滚”。
- 不部署、不推送、不真实收费，不清理用户产物；上述操作需要额外明确授权。
