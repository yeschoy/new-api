# CNY 额度执行与验收

状态：**实现与本地隔离验收完成，用户已确认本地提交及归档**。规划于 2026-11-17 获批；历史 source-only 检查记录保留在 `verification.md` / `quality-review.md`，其后 Docker 恢复后的运行记录覆盖早期阻塞状态。最终集成见父 `final-acceptance.md`。不代表生产上线。

## 实现

- [x] 单一 service converter：整数/规范decimal字符串直接进入 decimal，精确乘后一次 `DivRound(...,6)`、半入远离零、固定CNY，不使用用户显示币种偏好。
- [x] 配置快照/元数据/安全display DTO：无效、非正或非有限配置只令投影不可用，金额null，不使原业务失败。
- [x] 独立订阅GET在原授权与锁内事实读取成功后追加wrapper；无二次bearer/secret查询，无模型业务写入变化。
- [x] H5每item和catalog plan additive wrapper；原quota值/JSON类型、active-only/接入方式与现金售价币种保持。目录不虚构used/remaining。
- [x] 不限量active总额/剩余null，terminal剩余0且不可用；used>total不产生负余额；微额不等于免费。
- [x] 日志consumer使用同一 `AmountDecimal`，raw聚合后一次转换，支持>int64聚合；前端只渲染服务端字符串。
- [x] Markdown/OpenAPI示例/本地引用与字段类型同步；严格decoder的additive兼容风险、六位舍入和额度不等于现金已说明。

## 验证

- [x] 隔离Docker PostgreSQL：`^TestPartnerTenantQuotaCNY` **15/15、0 skip**（service9/model2/controller4），三个真实HTTP入口、旧JSON逐token兼容、授权审计/secret读取次数与状态/精度边界断言均执行。原运行 `runtime-quotacny.log`；最终重跑 `runtime-final-integration.log`。
- [x] 最终受影响旧链路/前组重跑：`^TestPartnerTenant(QuotaCNY|UserClassification|AccessMode|AuthorizationAudit|SubscriptionKey)`，5包 **46顶层通过/45子测试通过/0失败/0skip**，其中CNY15、分类7、模式11、审计9、SubscriptionKey4；真实quota/续费/rotation/锁/终态旧回归已执行。
- [x] OpenAPI拒绝重复键解析与103本地引用检查；历史完整schema/示例检查记录仍保留；未做Apifox GUI导入或OpenAPI元schema认证。
- [x] 日志consumer测试、前端48文件657用例/typecheck/build通过；本次触碰TS/TSX定向lint/format干净，全局既有151错误/68警告分开披露。
- [x] 独立trellis-check已审阅完整原差异，F1已由父会话按批准契约解释，不擅改鉴权；精确契约更新到 `.trellis/spec/backend/partner-tenant-usage-isolation.md`。
- [x] 本轮验收/Trellis记录纳入用户已批准的明确路径文档提交批次（已有业务提交 `8457836d9`；不重复提交旧业务）。
- [ ] 文档提交后官方归档，完成态以归档task.json/journal为准。

## A-C1–A-C5

全部由已执行15个suite和受影响SubscriptionKey回归覆盖；对应断言、文件和命令见 `verification.md` §7–§10及最后的运行记录。H5 `usable` **仅额度层面**，不增加User/Token检查，true不保证模型调用成功；两个入口既有鉴权范围差异已明确写文档，不是改变Key可见性。

## 边界与回滚

不改计费、售价、钱包、周期重置、生产配置或真实数据。撤销仅additive显示与consumer，保留raw quota。所有资源/日志实际路径登记 `TEMPORARY_ARTIFACTS.md`，清理需用户同意，Trellis永不清理。生产部署/推送不在授权内。
