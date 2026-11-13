# 接入方式实现记录

## 开发前最小行为差与边界

- 现状：商户无接入方式字段，pt_ 可混用订阅 Key、H5 和旧直接下单；创建证明仅绑定 action/group，管理界面未标注模式。
- 目标：仅真实省略创建字段默认 subscription_key，显式 hosted_h5 开启 H5；创建后固定。模式授权在实际 tenant 锁/事务中重检，公开能力失配仍返回通用错误。旧直接下单两模式均拒绝，既有付款/共享收银台/交付继续模式中立。
- 权威位置：model 的模式枚举/操作策略、创建和受锁入口；middleware/router 只提前拒绝。controller presence-aware 解码及安全证明规范化和 UI context 一起修改。
- 预计必要文件：model/partner_tenant.go、新模式策略/迁移和 pq 测试、model/main.go、订阅 Key/H5/旧订单入口；middleware/partner_tenant.go、router/partner_tenant.go、相应 controller；service/security_verification.go 及证明测试；partner-tenants API/UI/tests；七语言（仅 sanctioned script 写入）；相关 docs/spec；本任务执行/验证记录及专属临时登记。
- 不做：第二子任务日志字段/事件/投影、模式切换、订单/账户 identity 改写、分组唯一规则修改、依赖升级、生产/真实支付/部署、旧资源或私钥读取/清理、暂存/提交/归档。
- 局部重构：只隔离旧公开直接下单 wrapper 与 H5 内部订单核心；用显式拒绝和模式中立已接受订单交付测试证明界限。

## 环境预检与调整

`docker version --format '{{.Server.Version}}'` 失败：Docker daemon socket 不可用。未创建容器/网络/卷/数据库，未运行任何 Go 测试或构建。
主会话明确批准继续实现、自包含 pq 测试及现有可行 frontend/static 验证；Go/pq runtime 保留阻塞，不能降级替代。任务保持 in_progress，不提交/归档。

实现及验证结果待更新。
