# CNY 额度执行计划

状态：父任务规划已于 2026-11-17 获用户批准实施；进度与真实证据见 `verification.md`，未勾选项即未完成。本任务可独立于日志表实现，输出契约是日志页金额集成的前置。

## 顺序

- [ ] 读取目标 specs、父共享 research，确认当前独立/H5/catalog 原 JSON 和安全边界；先写纯转换及兼容快照的回归断言。
- [ ] 在 service 建立单一 explicit-CNY converter、规范配置快照及 display DTO。quota 精确输入，精确乘后一次六位除法舍入；元数据与非法配置降级完整。
- [ ] 独立 GET 仅在原查询成功后追加安全 display wrapper；不改锁/审计/周期重置/APIKey 决策、不二次查 bearer。
- [ ] H5 每 item/catalog plan additive wrapper，保持其原数值类型、active-only/模式和价格币种；目录无虚构 used/remaining。
- [ ] 提供日志 child 的已验证调用签名及 >int64 聚合 decimal 输入途径，不复制转换逻辑。
- [ ] 同步各 API 文档/OpenAPI；示例区分现金售价、quota 和额度等值，说明 nullable/unlimited/terminal/invalid config、六位舍入与严格客户端 additive 兼容风险。

## 边界测试

| 场景 | 断言 |
| --- | --- |
| 15000000/16008/14983992, ratio500000/rate1 | 30.000000 / 0.032016 / 29.967984 |
| >2^53、int64 max、聚合更大值 | quota 不 float 中转/溢出，新金额是精确输入后的显式舍入字符串 |
| used>total、零使用、最小quota | 不负余额，正微额不被当免费 |
| unlimited active/terminal | null 无限额与 terminal 零可用区分 |
| expired/cancelled finite | 可用0、历史余额不可消费，不扩大 Key 可见性 |
| 显示 USD/CUSTOM/TOKENS | 新投影仍为配置明确的 CNY，不用 preference helper |
| 0/负/NaN/Infinity 配置 | 新金额不可用，原业务成功/原quota保持 |
| 半单位、非整除 | 明确半入远离零、只最终舍入，无科学计数法 |

## 验证命令（批准后）

在任务自有 Docker runner 内（不是宿主机）：

```bash
go test -mod=readonly ./service ./model ./controller -run '^TestPartnerTenantQuotaCNY' -count=1 -v
```

设计中的自包含 DSN 为 `TEST_PARTNER_QUOTA_CNY_POSTGRES_DSN`；新增匹配 TestMain 分支避免误触 legacy SQLite，显式空隔离 PostgreSQL/唯一留存 schema。必须实际执行授权读取/兼容测试，缺 DSN skip 不是通过。纯 converter 测试也在同一受控 Docker，不用宿主机测试兜底。

- [ ] JSON 解析、所有本地 OpenAPI refs/schema 和 Markdown 示例/链接验证；不调用真实 API/秘密查询。
- [ ] 核对 `model/partner_tenant_subscription_key_test.go`、`controller/partner_tenant_subscription_key_test.go`、H5/quota/catalog 相关旧测试和前组模式/授权审计断言；检查 TestMain/DSN/fixture 后在 owned Docker/pq 运行或迁入安全自包含夹具。尤其每次额度查询仍有原审计事件、终态 Key 规则不变；记录实际选择器/执行数，不以新增 converter suite 代表全部旧回归。
- [ ] 必要 consumer 单测（日志 child 集成时执行），无额外依赖/lockfile。
- [ ] trellis-check 覆盖完整差异，A-C1–A-C5 有实际证据。build/vet 不代替 Go/pq runtime；Docker 不可用精确报阻塞。
- [ ] 把经验证金额协议写入相关 spec，精确路径提交代码/测试/文档/Trellis；生产配置、私钥/报告/临时产物不进入提交。

## 回滚/停止

任何原 quota 类型/值、鉴权/终态、Key 可见性或实际扣额改变都阻塞交付。回滚只撤 additive display 与其消费者适配，不重算账本/改汇率；个人/raw quota 入口保留。实际资源记录在 TEMPORARY_ARTIFACTS.md，清理需同意，Trellis 记录保留。
