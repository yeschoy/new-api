# 技术研究结论与候选方案

## 状态与边界

本任务停留在 planning。本文是研究产物与候选技术方案，不授权业务代码、支付配置、生产操作或其他任务状态变更。完整来源、原文、公开代码 hash/偏移、时序图与补证步骤见 [研究报告](research/REPORT.zh-CN.md)。

## 竞品证据所支持的边界

- AdsPower 官方分发的公开 Web JS 有完整 Vue BuyProxy / PayDialog，调用宿主商品、报价及购买路径。首选解释改为宿主自建购买 UI + 宿主后端，而非默认供应商商城 iframe。
- 供应商枚举将内部 `flashid` 显示为 `FlashIP`。FlashIP 与 FlashID 有不同公开产品入口，但共享标识/认证基础设施的证据存在，不能笼统描述为两个毫不相关服务。
- `iframe_url` 属于支付结果分支，不证明商品页嵌入；FlashIP 独立控制台的授权码和延后 3 秒订单查询不能转写为 AdsPower 内嵌入口的事实。
- 未观察到登录态交易网络、支付回调或宿主与供应商通信；对订单号归属、免登录映射和关窗交付保留未知。

## 推荐方案 A：商户原生 UI + 服务端 API

用户当前要求可以不引入跨站浏览器登录：商户后端验证自己的用户，从会话映射稳定 external_user_id，持 pt_ 服务端凭证调用我方。浏览器不携带长期商户 secret。

- 商户前端：仅本商户可售套餐、确认页、支付入口及订单恢复/状态。
- 商户后端：会话与归属校验、外部 ID 映射、我方 API 调用及持久重试键。
- 我方：已有 Tenant 商品/Key 初建基础；新增付费套餐订单与支付交付闭环。复用支付传输，不混用 PartnerServer 钱包充值账号命名空间。
- 我方维护支付落地页（渠道需要时），不必为 A 新建全套商城 H5。

### 合同建议（新增项未实现）

- 复用 GET /api/partner/v1/plans 与 PUT /api/partner/v1/accounts。
- 建议 POST /api/partner/v1/subscription-orders：external_user_id、plan_id、payment_method、租户级 Idempotency-Key；由我方返回 order_no、权威价格/币种、checkout 输出。
- 建议 GET /api/partner/v1/subscription-orders/{order_no}：租户鉴权 + 对象归属；分别返回 payment_status 与 fulfillment_status，不含 API Key。
- 支付确认必须来自渠道验签通知/可信主动查单；商户或浏览器的 paid 声明无权开通。

### 持久化与失败恢复

1. 本地创建订单和权益/价格快照，调用支付渠道前可持久定位；重复同请求不产生新收费订单。
2. 幂等保存外部已付款事实与证据，不随本地交付事务失败回滚。
3. 交付事务内原子复用/初建账号和 Key、激活/续期、保存唯一 order fulfillment marker。
4. paid-but-unfulfilled 可重试、告警和恢复；重试不得重复续期。数据库待办扫描足以支持 MVP，不强求新队列。
5. 订单状态轮询经商户 BFF；关窗不取消后台交付；必要时渠道查单对账。
6. 仅套餐消费在 Tenant 模式的资金选择入口强制执行；不能仅依赖初始 0 钱包或用户偏好。旧 PartnerServer 充值不自动迁移。
7. 禁用账号/成员、已撤销 Key 失败关闭；不为完成交付静默替换受禁资源。

## 备选方案 B：我方维护统一托管 H5

商户只做入口/BFF；我方增加商品与订单 UI、短期限权 checkout session、精确父 origin/回跳白名单、iframe CSP 与支付新窗口兼容。

一次性启动码兑换短期会话，绑定租户/用户/允许商品/nonce/到期时间；浏览器不接触 pt_ 或模型 Key。不要依赖第三方 Cookie 必然可用。postMessage 仅用于刷新且校验 origin/source/nonce，不能作为支付或交付权威。

该方案能减少每家商户 UI 开发，但增加我方前端维护和嵌入兼容成本；不是已证实的 AdsPower 商品页架构。A/B 是产品所有权选择，不能由研究代替用户决策。

## 兼容与后续审批

- 当前 Tenant direct-grant 是旧“商户自行确认收款”合同；新平台收款模式必须明确其权限边界，否则可绕过新订单。不能擅自下线旧接口。
- 现有 docs 中商户收款文案与新目标不一致；实施获批后统一更新，不覆盖本轮已有未提交修改。
- 既有 auto-provision 任务仍处于 planning；本任务不启动、不重复实现它。若进入开发，应复用/更新那个需求任务或明确拆分，避免创建两套订单系统。
- 待用户选择 UI 所有权后，才将推荐合同收敛为实现方案并获取新的实现批准。
