# 商户接入方式互斥与订阅 Key 授权审计

## Goal

平台管理员创建商户时明确选择唯一接入方式，由后端执行对应接口边界；最近新增的免用户 ID「订阅 Key API」接入必须作为真实选项，并纳入后台可查询的安全授权审计。

## User-confirmed requirements

- R1：新建商户时只能选择一种接入方式，不能只在界面上区分而允许后端混用。
- R2：选项必须包含最近提交实现的免用户 ID API 接入（`subscription-key-orders`），不能误认为只支持旧 external_user_id API。
- R3：该新接入也需要记录授权日志，并在后台查看、筛选。
- R4：新购不要求商户传用户 ID；可信付款成功后才创建内部用户及凭证；现有专属分组和商户套餐归属不因免用户 ID 而移除。
- R5：日志不得保存 pt_ / sub_ / sk- 明文、原始鉴权头或敏感请求/响应体。
- 本轮用户仅批准创建任务并进入规划；尚未批准最终方案或业务实现。

## Current evidence

- `controller/partner_tenant_subscription_key.go:114`：新购只解析 plan_id/payment_method；X-Subscription-Key 选择续费。
- `model/partner_tenant.go:35`：商户当前持有专属分组，没有商户级接入方式字段。
- `.trellis/spec/backend/partner-subscription-key.md`：新旧入口目前并存，内部真实用户保持专属分组、订阅专用计费和 paid-only provisioning。
- `model/partner_oauth_authorization_log.go:18`：现有授权日志是 OAuth/旧 server/account 的安全投影，尚无 tenant/order/subscription 关联字段及对应事件。
- `web/src/features/partner-oauth-clients/authorization-logs.tsx`：现有后台有独立授权日志查询页。

## Deliverables / task map

已拆分为两个可独立验证、当前均为 planning 的子任务：
1. `../11-13-partner-access-mode/`：创建必选、后端隔离、旧数据兼容、前端与文档。
2. `../11-13-partner-subscription-authorization-audit/`：订阅 Key 凭证相关事件、安全投影、后台查询与筛选。

父任务负责源需求、跨子任务的接入拒绝审计及最终集成验收，不作为默认业务实现目标。模式子任务先定义权威模式和拒绝合同；日志子任务可独立设计日志投影，但其拒绝事件接入依赖前者，依赖也已写入各子任务 PRD。

研究依据保存在 `research/current-boundaries.md`。

## Acceptance criteria (draft)

- AC1 / R1-R2：新商户未选模式不能创建；选择免用户 ID API 后能使用新链路，不允许调用被禁止的其他购买入口。
- AC2 / R3：后台可按商户/事件/结果定位新模式凭证操作及拒绝记录，不依赖 OAuth client_id。
- AC3 / R4：新购仍不传用户 ID；创建订单/只读查询不会开户；可信付款后原子交付、原 sub_ 续费及商户专属分组不回归。
- AC4 / R5：日志写入、错误输出、列表返回、筛选参数都不泄露凭证。
- AC5：既有已付款订单、回调、收银台、恢复交付不因入口隔离而中断；旧商户处理策略须经用户确认。

## Out of scope

- 不改写普通用户 OAuth 的授权语义，不把订阅 Key 访问伪装成用户 OAuth 同意。
- 不替换模型调用日志、支付对账系统或用户登录体系。
- 本轮不执行生产部署、真实支付、已有数据清理或业务代码修改。

## Blocking product decisions

- D1（本轮优先）：新建商户只提供「免用户 ID 订阅 Key API / 托管 H5」两种，还是额外保留「旧 external_user_id API」作为第三种互斥选项。建议只提供前两种，旧 API 仅兼容既有商户；此建议尚未获用户选择。
- D2：旧商户的兼容/迁移方式及模式是否允许创建后切换。现有旧商户可以混用入口，不能仅凭某一历史订单自动替用户选模式。
- D3：授权审计事件范围：是否记录每次成功的独立订阅读取，或只记录签发/领取/轮换/拒绝等关键安全事件。

## Artifact status

已完成现有接口、身份/支付边界、授权日志后端和管理页面的定向源码研究；已记录两个子任务及明确依赖。当前仅为需求探索稿，D1-D3 尚待产品决策；设计、执行计划与上下文清单将在决策收敛后补齐，不运行 task.py start。此次仅新增 Trellis 规划/研究记录，无业务代码或无关临时产物；既有未跟踪文件不读取、不暂存、不清理。
