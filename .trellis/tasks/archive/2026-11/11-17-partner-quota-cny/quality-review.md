# 质量审阅 — 商户订阅额度 CNY 金额投影（trellis-check）

审阅会话：2026-11-17 约 05:40–06:1x CST，HEAD `69092e8d5`，工作区未暂存改动。审阅对象是本任务的全部差异（5 个新文件、8 个修改文件）。证据类型标注同 `verification.md`：**【执行】**、**【类型检查】**、**【源码推理】**。

前提事实：实现子代理没有留下最终报告（返回文本只有 “Now the source files.”），`verification.md` 当时是骨架、`implement.md` 未勾选。本审阅不依赖任何实现代理可能运行过的命令。

## 结论

- 没有发现阻塞性问题：三个响应的既有字段名称/取值/JSON 类型、全局 `SubscriptionPlan` 形状、`model/` 业务代码、锁/审计/周期重置/Key 可见性均未被改动【源码推理 + 执行的 `git status`/`git grep`】。
- 发现 1 个需要决策的语义问题（F1），已用文档与注释如实说明，**没有改变行为**。
- 修复 3 处：两处不实注释、一处测试覆盖缺口。
- 测试预期经独立 oracle 复算 0 错误；文档检查 rc=0。
- **Go 测试执行数 0**。15 个 `TestPartnerTenantQuotaCNY*` 测试只通过了类型检查，A-C1/A-C2/A-C3/A-C5 没有运行证据。任务不能标记为完成。

## 发现

### F1（中，需决策）H5 入口的 `usable` 与独立查询的 `quota_usable`：公式相同，前置条件不同

对任务第 2 项的回答：

- 独立查询：`model/partner_tenant_subscription_key.go:453` `active := s.Status == "active" && s.EndTime > b.now`（锁后严格 DB 时钟），`:473` `q.Usable = active && (q.Unlimited || remaining > 0)`，其中 `Unlimited = AmountTotal == 0`、`remaining = total > used ? total-used : 0`。controller 把它原样**复制**进投影（`controller/partner_tenant_quota_cny.go:38-39`，`Active` 取响应里已投影的 status，与 model 的 `active` 等价）。这一入口的 `usable` 是复制的既有事实。
- H5：旧 DTO 根本没有 usable 字段，`controller/partner_tenant_quota_cny.go:52-59` 在 controller 里用原始整数**重新计算** `active && (QuotaUnlimited || QuotaRemain > 0)`，`active := item.Status == "active"`。它没有用金额推断（满足“不由金额字符串大于零推断”），但不是复制，而是同一公式的第二份实现。
- 公式是否相同：是。对 `total ≥ 0, used ≥ 0`，两处的 `unlimited` 与 `remaining` 逐值相等；H5 的行已由 `model/subscription.go:1629` 的 `status = 'active' AND end_time > now` 过滤，所以 `item.Status == "active"` 等价于 model 的 `active`（区别只在时钟来源：H5 用允许回退应用时钟的 `getDBTimestampOn`，独立查询用严格时钟，这是既有差异）。**凡是两个入口都能给出布尔值的状态，结果一致。**
- 是否是“同一条规则”：不是。两者的**前置条件**不同，因此存在可达的不一致状态：
  - 独立查询在给出 `quota_usable` 之前先通过 `lockPartnerTenantSubscriptionBindingTx`（`model/partner_tenant_subscription_key.go:154-222`）和 `validatePartnerTenantAccountClockTx`（`model/partner_tenant.go:335-369`）校验：User 启用且分组正确、模型 Token 启用/未过期/分组正确、`AmountTotal`/`AmountUsed` 非负（`:217`）。不满足时返回 403 `account_disabled` / 409 `credential_unavailable`，**不输出任何布尔值**。
  - H5 额度读取（`model/partner_tenant_integration_mode.go:113-130`）只校验商户密钥/模式与账号启用，**历来不校验** User 与 Token 状态，也不校验 quota 符号。
  - 因此：平台禁用了该商户用户、模型 Key 被禁用/过期/删除、或用户分组被改动时，独立查询失败关闭，而 H5 返回 200 且 `quota_cny.usable=true`（只要订阅有效且有剩余）。此时模型调用实际上无法成功。存量 `amount_used` 为负的损坏数据同理：独立查询 409，H5 返回 `available=false` 且 `usable=true`（该用例已被 `TestPartnerTenantQuotaCNYHostedQuotaHTTP` 明确断言）。
  - 改动之前 H5 响应没有任何“可用”断言，这是本次新增字段带来的新表述。

处理：

- 行为未改。可选的行为修复都越界：在 H5 增加 User/Token 校验意味着新增读取（违反“不新增读取/不改 model”）；去掉 H5 的 `usable` 违反父契约第 5 节（hosted item 使用订阅投影，含 `usable`）。
- 已做的范围内修复：`docs/partner-tenant-api.md:108` 与 `docs/partner-hosted-h5.zh-CN.md:154` 写明 H5 的 `usable` 只是订阅层面的额度事实，不检查平台用户或模型 Key 状态，`usable=true` 不保证模型调用成功；`controller/partner_tenant_quota_cny.go:45-50` 注释同步说明。
- **留给用户/主会话决定**：接受当前语义（文档已如实）；或修改契约让 H5 不输出 `usable`；或批准在 H5 入口增加校验读取。

### F2（低，未改）`usable` 公式存在两份实现

`model/partner_tenant_subscription_key.go:473` 与 `controller/partner_tenant_quota_cny.go:59` 各写一遍，将来任何一处改动都可能漂移。共享需要在 `model/` 导出一个纯函数，而本任务的边界是 `model/` 只允许测试文件变化，所以没有动。建议下次有权修改 model 时收敛为一个导出的纯判定函数。新增的纯用例（F4）至少把 H5 这一份钉住。

### F3（低，已修复）两处注释与实现不符

- `service/partner_tenant_quota_cny.go:203-205` 原文称 `Usable` “is copied, never derived from an amount”。对 H5 调用方不成立（它是由调用方用原始整数推导的）。已改为“调用方基于原始 quota 事实做出的权益判定（独立查询复制 `quota_usable`），绝不由换算后的金额推导”。
- `controller/partner_tenant_quota_cny.go:45-50` 原文称 H5 的 usable “mirrors the independent query's entitlement rule”，没有说明前置条件差异。已改写（见 F1）。

仅注释变化；改后 `gofmt -l` 无输出、离线 `go build`/`go vet` rc=0【执行】。

### F4（低，已修复）H5 `usable` 判定缺少不依赖数据库的用例

原测试中 H5 的 exhausted/overused 只在需要 PostgreSQL 的 `TestPartnerTenantQuotaCNYHostedQuotaHTTP` 里断言；“正的原始剩余显示为 `0.000000` 仍可用”只覆盖了独立入口；“非 active 状态不得报告可用/可消费”在 H5 助手上完全没有断言。

修复：`controller/partner_tenant_quota_cny_test.go:235-259` 在纯渲染测试 `TestPartnerTenantQuotaCNYRenderedWrappersKeepLegacyFields` 中新增 5 个用例（低于显示单位仍 `usable=true`、exhausted、overused、非 active 有限、非 active 不限量），断言投影 JSON 的精确前缀。所用金额与已复算的 oracle 输入相同。**【类型检查】，未执行。**

### F5（信息，未改）日志断言的匹配串与夹具 schema 名重叠

`controller/partner_tenant_quota_cny_test.go:280,291,617,642,792` 用 `NotContains(serverLog, "quota_cny")` 断言“没有投影日志”，而夹具 schema 名与商户 group 以 `pt_quota_cny_` 开头。若错误输出流里出现任何带 schema/group 名的行，会假失败。阅读过的请求路径没有这样的输出，且该断言比只匹配 `"quota_cny unavailable"` 更严格（能发现将来新增的逐请求日志），所以保留；首次真实运行时需留意。

### F6（信息）三个 HTTP 测试依赖前组尚未运行过的迁移

`setupPartnerTenantIsolatedHTTPPQ`（`controller/partner_tenant_subscription_key_test.go:38`）调用 `model.MigratePartnerTenantIntegrationModes`，该迁移属于前组（接入方式）交付，pq 运行为 0。它若失败会阻断本任务的 HTTP 测试，但原因不在本任务。

### F7（信息）`implement.md` 最后一步未做

“把经验证金额协议写入相关 spec”没有执行，也不在本检查的产出范围内；协议目前没有运行证据，不能以“经验证”写入。是否以 source-ready 状态先记录由主会话决定。

### F8（信息）OpenAPI `GET /plans` 响应没有示例

改动前即如此；`CatalogQuotaCNY` schema 与 `Plan.quota_cny` 已定义，目录示例在三份 Markdown 中。未补。

### F9（信息）配置快照由两次无锁读取组成

`service/partner_tenant_quota_cny.go:62-64` 分别读取 `common.QuotaPerUnit` 与 `operation_setting.USDExchangeRate`。与仓库对这两个全局量的既有用法一致；理论上在管理员更新配置的瞬间可能读到新旧各一个因子，只影响那一次响应的展示（元数据会如实反映所用因子）。未改。

### F10（信息）H5 逐项构造投影时可能在 500 之前写出一行日志

`controller/partner_tenant.go:210-239`：若前面的项是 `invalid_quota`（已写日志），后面的项 `GetSubscriptionPlanById` 失败使整个响应变为 500，这行日志仍然存在。日志内容不含秘密，无害。

## 逐项核对（未发现问题）

1. **转换器**【源码推理 + oracle 执行】：quota 经 `decimal.NewFromInt` / 规范串 `decimal.NewFromString` / 调用方 `decimal.Decimal` 进入，无 float64；因子先判 NaN/±Inf/≤0 再由规范十进制文本构造，从不调用 `NewFromFloat`；`Mul` 精确后唯一一次 `DivRound(…,6)`，`StringFixed(6)` 不再舍入；恒为六位定点、无科学计数法、JSON 字符串；不使用展示偏好相关 helper；每个响应读取一次配置。状态表六种情况与契约第 5 节、设计第 3–4 节逐条一致；到期/取消不限量省略 `historical_remaining` 符合设计（不因历史 `quota_remaining=0` 显示耗尽）。目录只有 `total`/`unlimited`/`available`/`currency`/元数据。
2. **wrapper**【源码推理 + 执行的 grep】：嵌入规则、指针嵌入、无 marshaler 方法提升、无字段名冲突；投影只在原业务读取成功后构造；错误路径与响应头不变；`result` 在 `err == nil` 时必非 nil；日志只含固定入口名、数值 ID、有界原因、服务端关联 ID。`partnerTenantCatalogPlanView` 只被 `PartnerTenantListPlans` 使用，其他序列化 `SubscriptionPlan` 的端点没有获得新字段。
3. **测试源**【源码推理】：见 `verification.md` §9。无越界 schema、无破坏性 SQL、全局状态均恢复、无并行、缺 DSN 失败而非 skip、兼容性断言比较原始 JSON token。任务要求的覆盖点（参考三元组、>2^53、int64 max、超 int64 聚合、used>total、零使用、最小 quota 舍入为零而原 quota 可见、不循环除法、半单位、7.3 与极低汇率、USD/CUSTOM/TOKENS 偏好、QuotaPerUnit 与汇率各自 0/负/NaN/±Inf、不限量有效与终态、到期/取消有限且 Key 可见性不变、目录无用量字段、无科学计数法、逐入口旧字段值与 JSON 类型、秘密标记不进入 `quota_cny`、每次独立查询仍有审计事件）在源码中均有对应断言。
4. **既有回归**【源码推理】：见 `verification.md` §7 的表；无需修改、未弱化任何既有断言。
5. **TestMain**【执行 + 源码推理】：新分支位置与条件正确，既有分支文本未变（`git diff -U0` 删除行 0）。
6. **文档**【执行】：见 `verification.md` §8，rc=0。
7. **oracle**【执行】：60 个期望 0 不一致，见 `verification.md` §6。

## 本会话修改的文件

- `controller/partner_tenant_quota_cny.go`（注释）
- `service/partner_tenant_quota_cny.go`（注释）
- `controller/partner_tenant_quota_cny_test.go`（新增 5 个纯用例）
- `docs/partner-tenant-api.md`、`docs/partner-hosted-h5.zh-CN.md`（H5 `usable` 适用范围各一句）
- `.trellis/tasks/11-17-partner-quota-cny/verification.md`（重写）、`quality-review.md`（新建）、`implement.md`（勾选与标注）
- `TEMPORARY_ARTIFACTS.md`（仅追加本会话的产物声明）

没有暂存、提交或推送；没有改动 `go.mod`/`go.sum`/lockfile；没有触碰受保护路径；没有启动 Docker；没有运行任何 `go test`。

## 遗留事项

| 项 | 原因 |
| --- | --- |
| 15 个新测试与受影响既有套件的 pq 运行 | Docker daemon 不可连接，且不得由代理启动 |
| F1 的语义决定 | 涉及契约/范围，不由检查代理决定 |
| F2 规则收敛 | 需要修改 `model/` 业务代码，超出本任务边界 |
| F7 spec 更新 | 协议尚无运行证据 |
