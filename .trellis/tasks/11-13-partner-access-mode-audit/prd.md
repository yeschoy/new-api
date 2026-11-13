# 商户接入方式互斥与订阅 Key 授权审计

## Goal

平台管理员创建商户时仅启用一种接入方式，默认使用免用户 ID「订阅 Key API」，仅明确选择托管 H5 时启用另一入口；由后端执行对应接口边界，并纳入后台可查询的安全授权审计。

## User-confirmed requirements

- R1：新建商户时只能选择一种接入方式，不能只在界面上区分而允许后端混用。
- R2：新建商户只提供「免用户 ID 的订阅 Key API」（`subscription-key-orders`）与「平台托管 H5」，二选一；默认选中订阅 Key，H5 必须明确选择。托管 H5 保留现有 external_user_id 身份要求，旧 external API 不再作为独立接入方式提供。
- R3：该新接入也需要记录授权日志，并在后台查看、筛选。
- R4：新购不要求商户传用户 ID；可信付款成功后才创建内部用户及凭证；现有专属分组和商户套餐归属不因免用户 ID 而移除。
- R5：日志不得保存 pt_ / sub_ / sk- 明文、原始鉴权头或敏感请求/响应体。
- R6：用户说明“现在没有商户，全部默认是订阅key”。因此不引入历史兼容模式或自动分类：创建请求省略接入方式、数据库新增字段的默认/回填均使用 subscription_key；未知值或显式空值不按默认放行。该现状来自用户说明，并非生产数据库核验，不授权删除或改绑历史账户/订单。
- 用户已批准创建任务并确认选项/默认策略；尚未批准最终方案或业务实现。

## Current evidence

- `controller/partner_tenant_subscription_key.go:114`：新购只解析 plan_id/payment_method；X-Subscription-Key 选择续费。
- `model/partner_tenant.go:35`：商户当前持有专属分组，没有商户级接入方式字段。
- `.trellis/spec/backend/partner-subscription-key.md`：新旧入口目前并存，内部真实用户保持专属分组、订阅专用计费和 paid-only provisioning。
- `model/partner_oauth_authorization_log.go:18`：现有授权日志是 OAuth/旧 server/account 的安全投影，尚无 tenant/order/subscription 关联字段及对应事件。
- `web/src/features/partner-oauth-clients/authorization-logs.tsx`：现有后台有独立授权日志查询页。

## Deliverables / task map

已拆分为两个可独立验证、当前均为 planning 的子任务：
1. `../11-13-partner-access-mode/`：创建单选且默认订阅 Key、后端隔离、增量字段默认/回填、前端与文档。
2. `../11-13-partner-subscription-authorization-audit/`：订阅 Key 凭证相关事件、安全投影、后台查询与筛选。

父任务负责源需求、跨子任务的接入拒绝审计及最终集成验收，不作为默认业务实现目标。模式子任务先定义权威模式和拒绝合同；日志子任务可独立设计日志投影，但其拒绝事件接入依赖前者，依赖也已写入各子任务 PRD。

研究依据保存在 `research/current-boundaries.md`。

## Acceptance criteria (draft)

- AC1 / R1-R2、R6：新建表单默认选中订阅 Key；创建请求省略模式时使用 subscription_key，只有明确选择 H5 才启用 H5；未知值、显式空值及旧 API/历史兼容值均拒绝。选定模式可用，被禁止的其他购买入口不可直接调用绕过。
- AC2 / R3：后台可按商户/事件/结果定位新模式凭证操作及拒绝记录，不依赖 OAuth client_id。
- AC3 / R4：新购仍不传用户 ID；创建订单/只读查询不会开户；可信付款后原子交付、原 sub_ 续费及商户专属分组不回归。
- AC4 / R5：日志写入、错误输出、列表返回、筛选参数都不泄露凭证。
- AC5 / R4、R6：不创建历史兼容模式；新增模式字段默认和重复迁移均保持 subscription_key 的约定，不依历史订单猜测模式或删除业务数据。共享收银台、可信支付回调和已接受订单的恢复交付不因新入口限制被错误拦截。

## Out of scope

- 不改写普通用户 OAuth 的授权语义，不把订阅 Key 访问伪装成用户 OAuth 同意。
- 不替换模型调用日志、支付对账系统或用户登录体系。
- 本轮不执行生产部署、真实支付、已有数据清理或业务代码修改。

## Blocking product decisions

- D3（下一问）：授权审计事件范围：成功的独立订阅读取也可能返回 Coding API Key，建议将每次成功查询与签发/领取/轮换/拒绝等关键安全事件一起记录安全元数据，以便追溯凭证访问；日志量会高于只记凭证变更与失败。该频率建议尚未获用户确认。
- D2b：创建后是否允许切换接入方式尚未被用户明确选择；用户关于没有旧商户及默认订阅 Key 的说明只解决默认/历史兼容部分，不视为批准模式可变或不可变。

## Artifact status

已完成现有接口、身份/支付边界、授权日志后端和管理页面的定向源码研究；已记录两个子任务及明确依赖。D1（仅两种选项）及 D2 的默认/历史兼容部分已确认：默认 subscription_key，无历史兼容模式。当前仍为需求探索稿，D3 和 D2b 尚待产品决策；设计、执行计划与上下文清单将在决策收敛后补齐，不运行 task.py start。此次仅新增 Trellis 规划/研究记录，无业务代码或无关临时产物；既有未跟踪文件不读取、不暂存、不清理。
