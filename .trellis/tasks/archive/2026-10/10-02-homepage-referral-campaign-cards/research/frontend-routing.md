# 首页与活动页现状（2026-10-02）

- `web/src/routes/index.tsx` → `Home`；`web/src/features/home/index.tsx` 在 `useHomePageContent()` 加载后优先展示管理员自定义 URL/HTML/Markdown，缺省才渲染 `DefaultHome`（`CiLandingPage`）。自定义内容有本地缓存与服务端刷新。新限时分支应在缺省内容分支，不能跳过加载或覆盖自定义内容。
- `web/src/routes/activity.tsx` → `CashbackActivityPage`；该页在 `web/src/features/cashback-activity/index.tsx`，含营销页壳、header、footer、两向返现规则和状态。匿名 `GET /api/cashback/public-offers` 提供活动实时规则；每 30 秒及 focus 刷新；刷新/失败时隐藏旧规则。迁到首页时保留该行为，避免误示仍生效。
- `web/src/components/layout/components/marketing-header.tsx` 的活动导航固定指向 `/activity`，模型导航固定指向 `/#models`。返现页成为默认首页时模型锚点不存在，要检查首页活动态导航，避免无效目标；`currentPage` 语义需按实际路由标记。
- `web/src/features/home/components/ci-landing-page.tsx` 是原默认首页；无需删除，10 月 8 日恢复。同一页面保持挂载跨截止时刻需定时重新计算是否展示活动。
- `web/src/features/wallet/components/subscription-plans-card.tsx` 已提供登录后的套餐列表／购买；`web/src/features/subscriptions/api.ts:getPublicPlans()` 虽名为 public，但 `/api/subscription/plans` 在 `router/api-router.go` 的 `middleware.UserAuth()` 组内。公共 `/activity` 不依赖此接口，只放两张中性介绍卡并按登录状态跳 `/wallet` 或 `/sign-up`。
- 仓库中找不到“狂蹬卡”的既有官方文案、权益、价格、图片或特定计划标识。方案不能从标题猜测额度／价格／限额或在前端硬写错误承诺。
- `web/src/styles/activity-landing.css` 已有活动页 hero、卡片、移动端与暗色样式；`web/src/components/ui/card.tsx` 和 `titled-card.tsx` 属于控制台通用容器，不必在既有营销风格页重复引入另一套卡片视觉；更适合沿用原活动页样式并定向调整。
- `web/src/features/cashback-activity/__tests__/activity-page.test.tsx` 已覆盖活动页匿名／登录 CTA、实时刷新、禁用时状态、语言切换。迁路由后要把返现回归改为首页组件测试，并为新 `/activity` 添角色/链接测试。
- `.trellis/spec/backend/referral-recharge-cashback.md` 规定公共返现页只能读取白名单动态响应，配置和规则可能提前停用；结束展示日期只控制首页替换，不变更返现支付资格、创建活动时间或已有奖励。
