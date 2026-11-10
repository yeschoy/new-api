# 研究执行记录与后续实施前门槛

状态：planning；不得因为存在本文而运行 task.py start。

## 本次已完成（非业务实施）

- [x] 获用户允许创建研究任务，保留已有未提交文档/密钥/报告不变。
- [x] 记录截图可证内容与架构未知，不将弹窗外观当 iframe 证据。
- [x] 核查 AdsPower 官方帮助、合作伙伴页、购买指南与 FlashIP/FlashID 官网入口。
- [x] 沿官方页面实际引用的静态资源追踪 AdsPower BuyProxy/PayDialog 与 FlashIP 独立站 PurchasePage；不猜测或调用业务接口。
- [x] 保留来源 URL、UTF-8 文本 hash、字符偏移与代码摘录，区分静态定义和交易运行时。
- [x] 对照本地 Tenant 商品/Key/grant、PartnerServer 充值与计费入口。
- [x] 形成证据分级报告、竞品/建议时序、职责、最小方案、脱敏取证清单。
- [x] 最终本地文档/引用/JSON/差异检查通过，见 `research/verification.md`；本任务研究记录作为独立 Git 提交，不混入现有变更。
- [x] 准备向用户交付研究结论与 UI 所有权选项，保留 planning 状态；产品决策仍待用户确认。

## 质量检查

- `git diff --check`；新建文档在 stage 后再做 `git diff --cached --check`。
- Python 解析 task.json、implement.jsonl、check.jsonl 与全部 research/*.json（浏览器返回的 JSON 字符串仅在确实是 JSON 时再解析）。
- 逐项核对：AdsPower `flashid -> FlashIP` 映射、BuyProxy/PayDialog 调用关系、支付 iframe 与商品 iframe 之别；FlashIP 的 API base 是 api.flaship.net/flashipapi/v1，不是同源路径；3 秒延后轮询只归因独立站。
- 核对未知：不把 trace_id 当订单号/幂等键，不声称验证了 B2B、渠道验签、跨站 SSO、AdsPower 订单轮询或关窗后支付实测。
- 不执行数据库测试、构建、依赖安装、生产访问、登录/下单/付款；本轮无业务代码。

## 后续实施候选顺序（全部待产品决定与新批准）

1. 选择商户 UI 或我方托管 H5；明确 Tenant 新付费模式与旧 direct-grant/PartnerServer 的兼容边界。
2. 在既有订阅自动开户任务中对齐正式 PRD、订单/支付/交付状态及接口合同，明确失败恢复与晚到回调。
3. 实现租户订单/幂等/权威计价/快照及支付适配；不复用钱包充值的用户/资金语义。
4. 可信渠道支付事实持久化与唯一订单交付事务；自动开户复用事务 helper，不嵌套独立事务造成半交付。
5. 订单查询、数据库待交付扫描、对账/告警；商户 BFF + 商品/付款/状态 UI。
6. Tenant 模式强制仅套餐资金来源；独立 Key 获取与受禁资源失败关闭。
7. 业务测试使用当时获批的隔离数据库资源；覆盖租户越权、价格篡改、并发下单/重复回调、关闭页面、paid 但交付失败、晚到支付、禁用账号/撤销 Key、钱包有钱但无套餐仍拒绝消费；不以生产付款作为测试。
8. 托管方案若获选，再专项实现短期 checkout 会话、CSP、无第三方 Cookie、postMessage origin/source/nonce 与外部支付兼容。

## 回滚和资源

本轮只有本任务研究文件及临时产物登记的追加；保留 Trellis 研究记录。业务代码/数据库/线上配置无修改，无回滚操作。浏览器管理的额外输出已在项目 TEMPORARY_ARTIFACTS.md 登记，只有用户批准才清理；不清理 Trellis 日志。不得将预存私钥或既有生产验证文件加入本任务提交。
