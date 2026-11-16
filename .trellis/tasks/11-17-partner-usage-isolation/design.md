# 商户用量隔离：总体设计

## 状态与决策来源

最终评审稿，未批准实施。产品源要求仅见 prd R1–R7；共享技术契约见 `research/contract-decisions.md`。父任务只拥有集成设计与验收，不承担默认业务实现。

## 架构与边界

```text
已鉴权模型调用 / 服务端异步任务
  -> 原有 consume/error 构造与记录开关
  -> 安全 Tenant owner（主 DB，request-local 快照）
     -> 非 Tenant：原 logs
     -> Tenant：LOG_DB.partner_tenant_usage_logs
     -> 归属未知或新表故障：安全告警，不回退/双写
  -> 既有 LogQuotaData / 实扣计数（不因分表重复或遗漏）

默认管理员列表/统计/导出 -> logs（包含切换前历史）
商户管理员列表/统计    -> partner_tenant_usage_logs
原有 self/token 入口    -> 已鉴权 ownership 限定后的两表联合视图
全站仪表盘             -> 原 quota_data / 全站计数
用户分类               -> 主 DB Tenant account 关系（与日志同源语义）
商户 CNY 投影           -> 已授权 quota 快照 × 当前明确 CNY 换算配置
```

不改变 BillingSession、付款事实、预扣/退款、套餐有效期、会员角色和 Key 发放。现有错误抑制保持；未选中订阅的失败只有已知商户/用户身份，不能推断订阅。

## 子任务所有权与依赖

| 交付 | 所有者 | 前置 |
| --- | --- | --- |
| 安全 owner、无秘密 options、日志快照 | usage-logs | 无；先冻结共享接口 |
| 固定 CNY pure converter 和兼容 DTO | quota-cny | 无业务前置，可独立验证 |
| 新表/写入/管理员及个人读取 | usage-logs | owner 契约；金额集成等待 CNY |
| 用户分类与归属列 | user-classification | owner/options 契约已经交付 |
| 跨页/统计/权限/回滚集成验收 | 父任务 | 三个子任务证据齐全 |

默认顺序为日志子任务先交付 owner 契约，CNY 子任务完成独立换算，再完成日志端到端，最后用户分类和父集成；允许在不同检查点切换子任务，但同一 cwd 仅一个写者。不因为父子链接自动并行，不在 planning 派发实现。

## 数据与 API 契约

- 新表放在 LOG_DB，主/日志库可以不同；不跨库 SQL join。新表具备完整安全归属快照和 int64 消费事实，独立 event_id 与 request_id 分工；旧 logs 不加商户反向过滤、不搬迁。
- 管理员新 GET `/api/log/partner-tenants`、`/stat`、`/options` 用 AdminAuth + 显式 log:read PAT 规则；安全用户筛选 GET `/api/user/tenant-options` 沿用用户读取 gate + user:read。两个 options 入口可复用同一仅 id/name 的投影。
- 新商户日志 DTO 的 ID/quota 用字符串；现有个人/默认 DTO 类型不改。新表内部映射到 legacy Log 时不得借局部 ID 进行跨表去重。
- 管理员界面独立 `/partner-usage-logs`，不挤进可切 self/easy 的通用日志页。入口及导航保持管理员和 developer shell；后端权限独立保障。
- 用户列表新增 `user_category=all|ordinary|merchant`、`tenant_id`；输出安全新归属字段，不覆盖 partner_client_id/name。过滤在分页前、按页批量 enrich。
- 三个商户额度入口兼容追加 `quota_cny`，统一精确输入、六位显示舍入、无限/终态/配置不可用语义，详见 CNY 子设计。原 quota 和售价原样保留。

## 兼容性与失败策略

1. 管理员默认页继续展示旧商户历史；新页注明只包括新版本写入记录。个人范围读取包含授权旧/新记录，默认全量接口不能误复用个人 union。
2. 请求结果按 request_id 折叠，消费优先、时间/ID/确定性字段按既有 compareRequestOutcomes；真正收费的 consume（含既有费用）与 error 记录区分，绝不把“失败界面”误当成零收费。
3. 日志为计费事务外 best-effort。新归属/日志库故障只安全告警并可能漏记，不把数据混回默认表，也不回滚已结算额度。未引入 outbox，不承诺无损。
4. 不修改原管理员清理范围；SQL 新表暂不增加自动清理。ClickHouse 新表沿用其显式配置 TTL；实际清理/容量策略部署前单独核对，不能执行未授权删除。
5. CNY 为当前配置的显示等值，不是历史支付金额；配置无效时显示不可用，不能因展示失败破坏原业务查询。

## 迁移、发布与回滚形态

- 仅增表/索引，覆盖共享及独立 LOG_DB 真实初始化路径；PostgreSQL 检查实际 DDL，ClickHouse 显式 CREATE/TTL，不依赖其 AutoMigrate。
- 读者适配必须先于启用新写者；最终部署需统一 API/异步节点版本并说明切换范围。多节点滚动期间不声称全球原子时间点。
- 本任务不授权生产发布。后续发布前验证完整新表读写、个人双表、管理员隔离和新 UI；禁止用生产迁移尝试代替隔离 pq 测试。
- 回滚保留新表和记录，保留可读新表的兼容读取版本；降级为仅旧读者会使自身新历史不可见，不算完整回滚。不得 drop/回填/重复写入来掩盖。

## 验证与风险

- 以父 AC1–AC8 与各子验收逐项映射：真实写入单表、列表/聚合同筛选、旧历史不变、self/token 越权负例、owner 一致、固定 CNY 边界。
- Go/DB 仅任务自有 Docker + 隔离 PostgreSQL；已知上轮 Docker 不可连接，但本轮不重新启动/创建。不可用时如实阻塞，不把静态检查当运行通过。
- 前端聚焦 DOM/路由/缓存、七语言与受控本地浏览器检查，不访问真实商户密钥、网关或模型。
- 延后：lossless 日志 outbox、SQL 新表清理运维、历史回迁/报表。它们不是首版隐式承诺。
