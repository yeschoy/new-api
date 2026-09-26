# 已撤销的退款证据结构草案（历史研究，禁止实施）

> 用户最终仅要求只读参考报表，线下退款及后续处置均手工完成。下述四张退款侧表、CNY 绑定列、钱包请求生命周期、自动确认/扣回和每消费请求写状态的方案**已撤销**，不再等待本任务审批，不属于本任务实施清单。返现活动表与已写入的易支付验签证据表不因退款范围收窄而撤销。

## 结论与相对上一版研究的修正

推荐 **4 张新增主库侧表**（钱包边界、资金证据/生命周期、手工退款、易支付 CNY 确认），复用当前工作区已新增的 2 张表（活动、易支付验签证据）；既有表仅维持已实施的 2 个返现列，另提议给**返现订单上下文**加一个下单时 CNY 确认 ID，给**易支付验签证据**加一个支付时 CNY 确认 ID。`User`、`TopUp`、普通消费日志不加列。不是已批准的最终迁移，更不是已验证的数据库兼容性。

上一版 `refund-proof-minimal-design.md` 把签名确认仅放到**支付时**是不够的：管理员在订单下单后、付款前才确认 CNY 时，不可追认这张旧订单。必须有订单级下单快照，不能仅按 Unix 秒判断（并发提交与同秒边界不可靠）。事件表里的 `target_event_id` 和负数也不意味着旧事故可自动纠正；已有 `HandleCashbackIncident` 能追债、跨批次取现，原则上让涉及用户/订单转人工，不凭双份事件或改写旧入账推导余额。

## 实际工作区已有（未提交）与拟新增的结构

| 状态 | 表 / 改列、最少关键字段与索引 | 用途和兼容 |
| --- | --- | --- |
| **已有未提交** | `cashback_campaigns`: `id` PK, `start_at`,`end_at` 分别索引, `stopped_at`,`max_rewards_per_user`,`created_by`,`stopped_by`,`created_at` | 活动历史、期限与计次，当前 `model/cashback_campaign.go`；非退款表。 |
| **已有未提交** | `cashback_order_contexts.campaign_id` bigint NOT NULL DEFAULT 0，单列索引；`cashback_rewards.review_source` varchar(16) NOT NULL DEFAULT '' | 下单活动归属和自动/人工/旧审核来源；当前 `model/cashback.go`。旧记录 0 / 空保持原状。 |
| **已有未提交** | `epay_payment_evidences`: `top_up_id` PK, `trade_no`,`gateway_trade_no`,`merchant_id`,`paid_cents`,`source`,`verified_at`；现无其余索引 | `model/epay_payment_evidence.go` 与 `rechargeEpayWithSource` 已在成功支付事务比较签名金额、落签名证据；金额没有币种证明，旧成功订单不回填。 |
| **拟新增列** | `cashback_order_contexts.checkout_cny_attestation_id` bigint NOT NULL DEFAULT 0（暂**不**加索引，只通过已有唯一 `top_up_id` 读）；`epay_payment_evidences.payment_cny_attestation_id` bigint NOT NULL DEFAULT 0（随 PK 查询） | 订单事务冻结下单时的有效确认，验签成功事务冻结当时确认；两者均须相同且非 0 才能自动 CNY 报价，旧订单/未确认订单永不回填。别在 `TopUp` 叠加币种列；若实际 checkout 先于订单落库，必须携带已读取的配置 epoch 并在订单事务重验，变化则写 0，不得拿落库时的新确认追认旧 checkout。 |
| **拟新增表 1** | `wallet_refund_proofs`: `user_id` PK、`opening_quota` bigint NOT NULL、`opened_at` bigint、`coverage_epoch` bigint、`state` varchar(16)（`clean/retry_later/manual`，数据库默认 `manual`）、`reason` varchar(64)、`revision` bigint NOT NULL DEFAULT 0；仅 PK | 旧混合余额只作为不可退款的 FIFO 首段，记录用户启用边界与**永久**污染状态；版本条件更新使 SQLite 写锁和三方数据库串行检查成为可能。不能仅有一条 proof 就默认 clean。 |
| **拟新增表 2** | `wallet_refund_events`: `id` bigint 自增 PK，`user_id` bigint、`event_key` char(64) UNIQUE（规范化业务键的稳定摘要；不存原始秘钥）、`kind` varchar(24)（`grant/withdrawal/operation`）、`source_type` varchar(24)、`source_id` bigint、`top_up_id` bigint、`reward_id` bigint、`refund_id` bigint、`quota` bigint、`target_event_id` bigint 默认 0、`status` varchar(16)（额度事件 `committed`；生命周期 `open/closed/needs_review`）、`created_at`,`closed_at` bigint；索引 `(user_id,id)` 与 `(user_id,kind,status)`，不加宽字符串复合唯一索引 | 购买/实际发行赠送/其它不可退入账按用户锁内写入 ID；来源指定扣款有正数金额、指向原 grant / 旧 `CashbackQuotaMutation` 的独立事件，**不是新负 grant**；`source_type + source_id`/原 mutation ID 或 `refund_id` 做业务核对，event_key 保证重复回调/重试单次事件。生命周期复用同表但不参与入账排序：第一次可能变钱之前持久 `open`，最终真实 DB 变更结束后 `closed`；未知结局永远 `needs_review`，不靠 TTL 自愈。对账按 ID 顺序只扫描 `grant`，用受支持的 `withdrawal` 原因调整额度；同一事务的购买先于即时赠送。主键自增**只有先获得该用户钱包/证据锁再插入、且都走此入口**才保证用户顺序，时间戳不够。 |
| **拟新增表 3** | `wallet_manual_cash_refunds`: `id` bigint PK、`top_up_id` bigint UNIQUE、`request_key` char(64) UNIQUE、`payer_id` bigint、`purchased_quota_removed` bigint、`payer_gift_recovered` bigint、`inviter_gift_recovered` bigint、`paid_cents` bigint、`currency` varchar(3) 固定 CNY、`payment_evidence_top_up_id` bigint、`attestation_id` bigint、`operator_id` bigint、`status` varchar(32)（`pending_payout/paid/failed_manual_resolution`）、`created_at`,`updated_at` bigint、`paid_by` bigint、`paid_at` bigint、最小必要的脱敏付款凭据引用（状态变更需单独审计）；索引 `payer_id`（查询） | 单订单一次系统确认、现金分和扣回额度不可变；确认时全部未使用购买额一次性移除、两方向未发取消/已发足额追回，任何不足则整个主库事务回滚。钱包扣款、奖励状态及对应 event/旧 mutation、退款记录同事务；线下给付非原子，失败仅人工补偿，不允许重试再次扣钱包。默认状态绝非 `paid`。 |
| **拟新增表 4** | `epay_cny_attestations`: `id` bigint PK、`config_epoch` bigint UNIQUE、`config_fingerprint` char(64)、`confirmed_by` bigint、`confirmed_at` bigint、`evidence_ref` varchar(191)、`revoked_at` bigint 默认 0；除唯一 epoch 不预设额外索引。另复用 `options` 增一个**稳定 singleton** `epay.refund_config_epoch` 字符串值行（需要预创建/串行更新）；全局钱包证据覆盖代次与自动报价总开关另设稳定 `wallet.refund_coverage` Option 行，锁内切换，回滚应用前先关闭报价 | 管理员审计确认的是该商户网关**实际 CNY 收款**事实，签名 `Money` 自身无币种；确认行不可改写核心事实。`PayAddress/EpayId/EpayKey` 任一变化都在同一数据库串行配置边界递增 epoch 并失效旧确认，重新改回相同配置仍须重新确认，不能靠内存字段或指纹相等复活；勿存明文密钥或可离线猜测的裸密钥哈希。老历史支付永不追认。旧确认撤销不会撤销该版本有效期间已正确双绑定的历史订单证据。 |

所有 `quota`、`paid_cents` 为整数且明确正数/允许零的域；现金换算逐单用无溢出的乘除及向下取整 `floor(verified_paid_cents * remaining_purchase / original_credited_purchase)`，上限为该单实付分，不允许任何分次退款。非易支付订单的已到账购买也作为 FIFO 段，但始终不显示自动 CNY 金额。

## 1. 启用边界：哪些钱包有机会 clean

- **仅迁移建表不自动启用任何旧账户**。先发完整 instrumentation，统一主库迁移、停用所有旧实例和绕过入口，停/排空批量模式并验证没有待刷、丢失或无法确定的 delta；如果不能证明历史批量期间余额权威，不能把“当前关闭批量模式”当作证明。启用开关/coverage epoch 在主库受锁控制，先进入只记证/拒绝自动报价，再逐用户建边界；老代码与新代码混跑期间，所有仍可能被旧实例写的钱包 `manual`，切流后也不可凭空 clean。既有长任务/异步退款、零预扣请求、失败补偿必须真正完结并可证明，否则已有用户仍 `retry_later` / `manual`，不因重启或 TTL 到期而解锁。
- **新用户**：在全部实例已切至新写入路径并确认 batch 不会丢数据后，创建用户和 `wallet_refund_proofs` 同事务，初始混合赠额计为不可退 opening（或零 opening + 同事务不可退 grant，二选一，不双计）；新用户仍须满足后续所有资金路径都被覆盖。**旧用户**只有获得 quota fence、钱包行/证据行锁、全入口已切换且账户无历史未知 pending/异常、锁内读取权威余额、同事务写 opening 后，未来新订单才可能自动核对；历史余额永不自动标可退。不能通过无法证明“旧请求都结束”的抽样造 clean；这些旧用户可永久人工。
- 后续任何不可验证的写入（旧实例、直写、缓存批量、异步崩溃、丢失 delta、负余额即使后来充值恢复、未知来源/跨钱包异常）先持久标 `manual` **再**允许它改变钱包，若无法保证这个顺序，则全局禁用自动报价（包括后续关闭 batch 后）；无证据但仍可能完成的正常操作保持 `retry_later`，不能仅在查询时看 `open_count=0` 就推断历史干净。开放自动确认还必须在隔离部署下测试此写序，不可在当前代码上直接上线。

## 2. 特殊修正和旧事故去重

- 主库 `CashbackQuotaMutation` 已有 `issue/reward_recovery/principal_recovery` 唯一 `event_key`，`CashbackOrderContext` 又存累计事故目标/本金已追回/欠额。新 `wallet_refund_events` 对实际赠送写 grant，其 `event_key` 由 `issue:<reward_id>` 派生，关联原 mutation；对退款足额追回写 withdrawal 指向对应 grant、`refund_id`、reward_id，并记录另一个**独立**、对该单剩余购买 grant 的 withdrawal；退款记录是唯一自动现金退款操作主键，旧 mutation 的新退款 kind（如确需）须与 `refund:<id>:<reward_id>` 同事务对应，不能用 `HandleCashbackIncident` 重跑本金比例冲正。查询只计一次 wallet delta，不能把旧 mutation 与新 withdrawal 各减一次。
- 只允许在锁内严格核对有效原 grant、已发/未发奖励状态、余额和**可证明尚未消费**的该笔购买剩余额度；扣回实付购买剩余及**整笔**已发相关赠额，赠额足额追回是对受益人当前钱包的扣款，不是假定其原 grant 仍在钱包。源赠额删除/扣款后的其它购买归属需重新模拟 FIFO；如果修正后余额或来源关系无法配平，后续报价 `manual`，绝不通过新负 grant 或只扣关联事件金额虚构可退额。对已经被消费的来源段、已有手工退款/旧事故、部分追回、欠额、债务后来被手动核销或未知历史变化，先**永久人工**，除非将来专门证明独立且不重叠的修正模型；这意味着该钱包其他本来合格的订单可能也不能自动报价，属于有意保守降级。
- 事故接口与自动退款确认必须按同一订单/钱包锁顺序互斥；若 `incident_kind` / `cumulative_refund_rate_bps` / `principal_reversal_target_quota` / `recovered_quota` 等有历史痕迹，或者存在旧 mutation 而无对应新 grant，不进入自动确认。反过来同订单已存在手工退款记录时，旧事故处理不能再次执行同笔退款性质的追回；若真实拒付/争议仍须处理，转独立人工核对，不能简单绕过原风险阻断。旧版只生成的 CashbackQuotaMutation 不回填成新 grant。

## 3. 易支付确认时间/配置一致性

下单时捕获**同一权威 DB**配置 epoch + 当前有效 CNY 确认并存入订单上下文；当前 `RequestEpay` 先调用 `client.Purchase` 再落订单，必须在 `Purchase` 前同时捕获 epoch 与有效确认 ID，带入落库事务复核两者，变化或缺失即不授予自动 CNY 资格；首次确认、撤销和重新确认也必须推进该 epoch，不能用调用 `Purchase` 之后出现的新确认追认旧 checkout；验签前使用对应 epoch 的支付客户端快照，支付成功事务核对订单 checkout ID、已验签 `MerchantID`、配置 epoch、签名金额与 `TopUp.Money` 结算到分的一致性，然后写 `EpayPaymentEvidence.payment_cny_attestation_id`。新确认如果晚于 checkout，订单 checkout ID=0，即便付款时已确认也**不可自动报价**；如果 epoch 在 checkout→付款间变化，即便管理员重新确认也不为旧 checkout 补签，支付本身按既有安全策略处理，但现金报价人工。只有两处 ID 相同且该版本对两次边界均有效、商户 CNY 事实经人工确认、钱包证据 clean 才返回现金数。**不能**根据 `created_at <= confirmed_at` 的反向查询/同秒比较追认。

`model/option.go:UpdateOption/UpdateOptionsBulk` 当前允许三个商户字段各自写并随后更新进程内内存；`controller/topup.go:GetEpayClient` 当前从进程内变量构造客户端。必须在所有写入路径实现一个主库串行 epoch 更新机制，支付/下单用携带 epoch 的单一配置快照，事务内校验 epoch/确认并对未知旧实例拒报；不允许直接更新 Option 或同步内存但未递增 epoch。epoch 串行锁、支付订单行锁、用户钱包锁之间需规定并测试一致锁序，避免持锁网络调用和 SQLite 单连接嵌套查询。无法把验签所用 client 配置和 epoch 建立可信关联时，**付款可以按既有协议结算，但自动 CNY 报价必须禁用**。

## 4. 必须覆盖的钱包生命周期与永久人工边界

- 购买实际到账：全部 5 个已验签在线渠道、非合格手工补单（只可记不可退段），先钱包用户锁再写 grant；即时返现同一支付事务购买→赠送；T+N 返现从**实际发行**时写 gift grant。新注册赠额/opening、兑换、签到、管理员 add、邀请转入均按到账先后写**不可退** grant；SQLite 签到现在跨事务补偿，不满足原子门禁，须重构为同事务或该路径用户手工。
- 普通净消费：`TryReserveUserQuota` 的 DB/Redis、`IncreaseUserQuota/DecreaseUserQuota` 的同步与 batch、`WalletFunding` / `BillingSession` 的首次零预扣及追加 Reserve/Settle/Refund、无 session `SettleBilling/PostConsumeQuota`、旧计费、任务 `taskAdjustFunding/RefundTaskQuota/RecalculateTaskQuota`、Midjourney 异步退还、余额订阅，都需要在任何可能变钱前持久打开并在最后一次余额变更**成功落库后**关闭对应生命周期；异步退款队列提交、任务 status 终结不是资金已结清。尚未覆盖的路径不能借通用 `IncreaseUserQuota` 猜测是赠送还是预扣退还；这类用户手工。无需逐次消费的批次表，但每个可逆/延迟请求需要 durable identity/state，增加主库写放大，须做性能与崩溃测试。
- 管理员 `subtract/override`、旧 `HandleCashbackIncident` 及债务消除、其它来源不明直写，即便余额最终非负也标 `manual`；`BatchUpdateEnabled` 若不能保证 durable intent/ack、进程崩溃恢复，就**从启用前禁止此模式写 clean 钱包**，或仅开放从未碰此模式且历史可证的用户；未知历史批量用户永久人工。用户无须看到伪数字：短暂在途有证据显示 `retry_later`，不明/污染 `manual_reconciliation`；退款确认同一 fence + 主库事务重新对账，任何竞态/失败拒绝自动给付。

## 迁移/发布/验证清单与就绪判定

- 上述新表都只新增，不更改历史钱包/订单数值；两个拟增列默认为 0、不回填旧单；proof 状态默认 `manual`，不因 AutoMigrate 自动置 clean。所有新旧双写必须同一主库事务；跨库 LOG_DB 不可作证据。完成数据库三方**新建、最新发布版代表数据升级、当前分支旧返现结构升级、重复迁移两次**，核查历史数据、唯一键、用户锁和同秒入账顺序；另测混跑/支付配置更改/崩溃、异常/退款重复调用、积分上限。若先回滚应用，不可用旧版继续写 clean 证据；停止自动报价/新计提后，已发和已扣款的历史需要人工善后，不可删证据表。
- MySQL 5.7.8 旧版 utf8mb4 InnoDB 索引前缀上限可能只有 **767-byte**（取决于行格式/设置）必须核对：不要将两个 `varchar(191)` 拼为联合唯一，也不要给 `varchar(255)` + 其它字段拼索引。这里用独立 `char(64)` 摘要 UNIQUE、短 `varchar` 状态与 bigint 索引，避免宽组合；`evidence_ref varchar(191)` 不索引。若 GORM 生成额外索引、主键尺寸或不同 row format 仍超限，按实际最低版本调整并重测；不能凭设计推定兼容。
- **审批状态：尚未准备直接启用自动退款确认或宣称已最终可实施。** 这份是可提交用户评审的有界 schema 提案：已明确全部拟新增表/列、索引、保守 fallback、发布与旧数据处理；但要先由负责人确认「旧用户不能证净额时可能永久人工」与 4 张侧表及主库 open/close 写入成本，实施中还须逐入口证明覆盖、配置 epoch 可串行绑定及纠正后的 FIFO 正确性。未运行三数据库矩阵/回归测试，未核实生产旧实例、批量残留、商户真实 CNY 收款；任何门禁无法满足时保持报价关闭，不能把未知标成 clean。

只读核查来源：`model/cashback.go`, `model/cashback_campaign.go`, `model/epay_payment_evidence.go`, `model/topup.go`, `model/cashback_state.go`, `model/cashback_ledger.go`, `model/quota_reserve.go`, `model/user.go`, `model/user_quota_cache_fence.go`, `model/user_quota_adjustment.go`, `model/checkin.go`, `model/option.go`, `controller/topup.go`, `controller/option.go`, `.trellis/tasks/09-24-standalone-topup-cashback-auto-review/{prd,design,implement}.md`、同目录 `research/refund-proof-minimal-design.md`、`.agents/rules/billing.md`。本次未修改业务代码/迁移、未运行数据库、支付或性能测试。