# 执行计划

1. 阅读 `web/AGENTS.md`、shadcn-ui、i18n-translate 技能与相关前端／返现契约；复核 Home、CashbackActivityPage、MarketingHeader、现有 CSS、基础 Card 实现和测试。确认本任务仅改变前端展示，不触及服务端结算／计费。
2. 先更新测试以刻画首页截止前、边界时刻、保持挂载跨界与自定义首页覆盖的行为，以及公开 `/activity` 两卡展示、注册／钱包行动与导航。迁移已有返现公开规则轮询、失败降级测试到首页活动路径，保持有意义回归；避免把旧 route 内容断言当作新契约。
3. 在 `Home` 的**自定义内容分支之后**接入限时活动渲染和截止唤醒。对返现活动组件保持现有 API 刷新行为，按实际页面调整导航上下文与失效锚点。不要硬编码支付资格逻辑。
4. 将 `/activity` 替换为两个中性狂蹬卡介绍与既有钱包／注册入口；复用现有营销样式／组件、明暗与移动端布局。使用确认过的 UI 文字作 `t(...)` 键，依 i18n 技能脚本写入七语言并执行 `cd web && bun run i18n:sync`。
5. 运行受影响 Vitest 测试（如 `cd web && bun run test -- src/features/cashback-activity/__tests__/activity-page.test.tsx` 及新首页测试）、`cd web && bun run typecheck`、`cd web && bun run lint`、`cd web && bun run build`。按 package.json 校对测试命令；对改动文件执行格式检查，检查生成产物不进入提交。
6. 浏览器回归 `/` 与 `/activity`：匿名／登录、窄屏、明暗、语言切换、真实链接目标、截止时刻模拟；检查自定义首页仍优先、返现刷新或失败不展示旧规则。若浏览器不可用，在交付中明确限制。
7. 执行 Trellis 全范围质量检查，评估需否把新的稳定展示契约写入 `.trellis/spec/`；只提交本任务涉及的产品／测试／翻译／Trellis 文件，不碰 `main` 推送。完成后询问用户是否允许清理本次非业务临时脚本／产物（Trellis 日志不需要清理）。

## 风险与回退点

- `Home` 的 `content` 优先级错误会覆盖管理员自定义页；守护测试和明确的分支顺序。
- 页面长期挂载、后台休眠或机器时区变化可令过期活动残留；使用固定 UTC instant、边界 timer 与 focus 复核。
- `/activity` 原有返现状态安全约束不能因移路由丢失；测试迁移并复核旧规则禁示。
- 向公共活动页展示计划详情会引入认证/隐私与过期价格风险；MVP 只提供中性介绍，不调用认证套餐 API。
- 两个路由应一起回滚；没有迁移或资金动作可回滚。
