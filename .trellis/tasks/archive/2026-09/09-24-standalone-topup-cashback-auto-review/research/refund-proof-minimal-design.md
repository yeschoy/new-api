# 已撤销的按需 FIFO 资金证据方案（历史研究，禁止实施）

> 当前任务只做管理员只读参考报表，所有线下给付及额度/返现处置由管理员手工负责；下文钱包证据、生命周期、退款确认及 CNY 确认结构不再属于实施范围。仅作为此前证明「准确账本」需求比参考报表复杂的研究保留。

## 结论及证明边界

建议**不做逐笔消费批次分配**，但不能省掉可持久证明“全部钱包动作已经结束”的生命周期证据。对某用户，令 `G` 是按真正入账顺序排列的非负额度段（旧钱包余额只是一段不可退款的 opening），`Q` 是锁内可信且已结清的 `User.quota`。若其余变化只有正常可净额化的消费/预扣返还，并且没有欠额、未识别的增减或未校正的来源指定扣减，则 `S=sum(G)-Q` 是净消费；按 FIFO 扣掉段前缀，剩余后缀就是可用段。这一归纳不需要消费日志，也不需要每天为每笔普通 API 消费分配来源。**真实迟发赠送**只在实际发行时追加段；**请求预扣退还**不作为新段，在请求完全终结后净额重算。假设任何一项不能证明，不能返回数字。

例子（单位统一为钱包额度）：`[购100,赠10,购50,赠5], Q=40` → 新购剩 35、新赠剩 5（A）；`Q=140` → 旧购 75、新购 50、赠合计 15（B）；`[旧购100,新购50,迟发旧赠10], Q=55` → 新购 45、迟发赠 10，**不能**把赠插回旧订单；`[旧购100,新购50]` 中旧预扣 100 → 后耗 40 → 退回旧预扣 100，终态 `Q=110` → 旧购 60、新购 50。以上是已确定语义下的演算，**不是数据库验证**。

## 持久层：两张钱包侧表 + 一张人工退款表；复用已有易支付凭据

以下是逻辑最小值，不把表数当目标；全部在**主库**，整数钱包单位 / CNY 分，时间 bigint Unix 秒，普通 varchar 和 bigint 索引，避开部分索引、数据库 ENUM、方言 UPSERT 和 JSON。表名均为设计候选，实际迁移仍须三方实测。

1. `wallet_refund_proof`: `user_id` PK（对应 User）、`opening_quota` bigint、`opened_at` bigint、`state` varchar(24)（`clean` / `manual`，只允许审计过的人工复核重新建立 clean 边界）、`reason` varchar(64)、`revision` bigint（非空默认 0）。创建边界时，在资金 fence + 用户行锁下读取权威余额，与该行及 opening 事件**同一事务**提交；旧混合额度永不可退款。不能在旧未结清批量模式下自动初始化 clean；无证据的老钱包需人工。`revision` 的受影响行更新可作为 SQLite 写串行点；在 MySQL/PG 用 `lockForUpdate(tx)`，不能单靠 SQLite 不支持的 `FOR UPDATE`。
2. `wallet_refund_evidence`: `id` bigint PK 自增（仅对**同一用户已串行化提交的入账**排序）、`user_id` bigint 非空 + `(user_id,id)` 索引、`event_key` varchar(191) 非空全局唯一、`kind` varchar(32)、`source_type` varchar(32)、`source_id` varchar(191)、`top_up_id` bigint 默认 0、`reward_id` bigint 默认 0、`quota` bigint（正数入账；冲正用负数）、`target_event_id` bigint 默认 0、`status` varchar(24)（资金生命周期只取 `open/closed/needs_review`；额度事件固定 `committed`）、`created_at/closed_at` bigint。可选 `UNIQUE(source_type,source_id,kind)`，但 `event_key` 已能覆盖业务幂等，避免为每类赠送再建表；不能把充值赠送和购买合并为单段。订单成功的购买段以 `online_purchase:<topup_id>` 为键，人工补单为不可退款段；真实返现发行以唯一 `issue:<reward_id>` 为键，关联现有 `CashbackQuotaMutation.EventKey`，在**钱包实际增加**的事务内插入。兑换 `redeem:<code_id>`、签到 `checkin:<id>`、邀请转入 `affiliate_transfer:<唯一事务ID>`、管理员加额及注册赠送各用稳定键并且全部不可退款。退款冲正追加链接原段的负数修正，不以冲正创建一个“新负额度段”；计算时先按指向原段的修正得到有效段，再跑 FIFO，按用户锁串行。对同一支付事务的购买与即时返现，先插购买再插赠送；不要按 Unix 秒、事先分配的全局 ID 或 `LOG_DB` 日志推断顺序。每个独立请求/异步任务还须有一条 `kind=wallet_operation` 的**逻辑生命周期行**（同一张表而非另建“每日请求表”），`event_key=wallet_op:<不可复用请求/任务ID及阶段>`，`quota=0`，第一笔钱包变更前持久插 `open`，最终钱包变更成功提交后才置 `closed`；不确定的失败标 `needs_review`，崩溃留下 `open`，不能通过 TTL 变为 closed。`(user_id,kind,status)` 可选普通复合索引用于查未结清；不要在无测试数据时预设索引性能。
3. `wallet_manual_cash_refund`: `id` bigint PK、`top_up_id` bigint NOT NULL UNIQUE、`request_key` varchar(191) NOT NULL UNIQUE、`payer_id` bigint、`purchased_quota_removed` bigint、`payer_gift_recovered` bigint、`inviter_gift_recovered` bigint、`paid_cents` bigint、`currency` varchar(3) 固定 CNY、`payment_evidence_top_up_id` bigint、`attestation_id` bigint、`operator_id` bigint、`status` varchar(32) (`pending_payout/paid/failed_manual_resolution`)、`created_at/updated_at` bigint、人工给付凭据号（注意保护私人信息）。同单仅一次确认且金额、扣除额度之后不可变；外部人工给付失败**不重试扣钱包**，通过同一退款记录人工补偿。对同单的购买和两方向返现分别以 `refund:<refund_id>:purchase`、`refund:<refund_id>:reward:<reward_id>` 记录修正/追回；后续现金金额 `floor(已验签实付分 * 剩余原购买额度 / 原入账购买额度)`，整数安全乘法（大数或先校验乘积界）、每单上限实付分，不以 `TopUp.Money` 当额度；不允许少报金额或重复分段。

支付币种证据另有必要的**小型、不可改写的商户 CNY 确认**：建议 `epay_cny_attestation(id PK, config_generation bigint UNIQUE, config_fingerprint varchar(64), confirmed_by bigint, confirmed_at bigint, evidence_ref varchar(191), revoked_at bigint)`，或等价的已有可审计 Option 版本+审计行。只存规范化网关地址、商户 ID 与密钥的安全摘要/版本，不存密钥明文。当前已有 `model/epay_payment_evidence.go:EpayPaymentEvidence`：`top_up_id` PK、签名 `PaidCents`、商户/平台交易号及 `VerifiedAt`；可在此增加 `attestation_id`（默认 0；**不回填旧订单**），同支付成功事务绑定当前有效版本。回调签名没有币种，根管理员需有独立可审计的实际 CNY 收款确认；`PayAddress/EpayId/EpayKey` **任何一个**变化须与版本更新/撤销走同一权威主库事务、和付款绑定序列化。`model/option.go:UpdateOption/UpdateOptionsBulk` 目前通用写入并更新进程内 OptionMap，不能仅靠内存布尔值或支付后的读取完成此门禁。已有 `model/topup.go:rechargeEpayWithSource` 对**两条已验签回调**比较签名 Money 分和 checkout 分并原子保存 EpayPaymentEvidence；当前证据还没有币种/确认版本，老单或没有版本者只做人工报价。其他通道购买事件仍按时序进入 FIFO，**仅现金报价禁用**，无需为了现金报价改造其它四条通道金额捕获。

## 事务接入与失败关闭

- 报价：取得用户额度 fence（Redis 有则必须成功）→ 用户行锁、proof 行写锁，拒绝 `open/needs_review`、`manual`、负余额、批量未清或丢失历史，重读所有入账/冲正和余额；对目标订单检查**实际支付且有订单快照**、唯一购买段、有效易支付签名金额和当时 CNY 确认、无旧事故/已有退款/未解释追回；按金额整型计算。查询 UI 快照仅供显示。
- 确认：重取**付款人及所有发行奖励受益人**的 fence，按稳定顺序锁单、奖励、用户与 proof（需要与旧发行/事故路径统一顺序并处理数据库死锁重试）；重算剩余额度，拒绝报价状态漂移。待审/冻结两方向整笔取消；对已发两方向奖励按原额**足额**扣各受益人权威钱包，不足则整笔回滚，不得生成欠额后放行。连同付款人剩余购买额度一次性扣除、奖券状态和唯一 `CashbackQuotaMutation` / 修正事件、现金退款 pending 行同**一个主库事务**提交；同一用户兼任付款/奖励受益时合并余额条件。先做实际到账与奖券完整性检查，再改余额。已有 `HandleCashbackIncident` 会按指定订单比例追回并允许欠额，**不能直接复用**；重叠事故先转人工。退款后账户的修正段可重算其它订单；若来源指定的历史操作无法与修正及余额配平，该用户 proof 转 `manual`，不能虚构新的可退款购买额。
- 成功关闭生命周期**必须发生在最后一次钱包变更真正落库之后**；`BillingSession` 可信请求可能起初零预扣、后补扣，`Refund` 先置内存 `refunded` 后用 `gopool.Go` 异步 `IncreaseUserQuota`，不得在启动 goroutine 时关闭；失败/崩溃保持 open/needs_review。`SettleBilling` 无 session 会回退到 `PostConsumeQuota`；`service/task_billing.go:taskAdjustFunding/RefundTaskQuota/RecalculateTaskQuota`、`service/midjourney.go:RefundMidjourneyQuota` 和订阅余额购买也需覆盖。异步任务 status 终结不等于钱包 refund/结算已持久提交；任务钱包退款与 `Task.Quota` 更新目前分两步，失败后重试会重复返还，必须在统一主库资金状态/唯一幂等键下解决，否则这些用户只能人工。不能仅加一个 `WalletFunding` 钩子并宣称覆盖。
- 低频入账：`creditOnlineTopUpWithCashbackTx`、`issueLockedCashbackRewardTx` 已有主库事务；注册 `Insert/InsertWithTx`、`Redeem`、签到、`TransferAffQuotaToQuota`、`AdjustUserQuota(add)` 需按用户锁写入同事务且缓存提交后同步。当前 SQLite 签到是单独建记录再加余额/补偿删除，不满足原子性；管理员 `subtract/override`、来源不明直写、欠额及旧订单的 `HandleCashbackIncident` 标记 `manual`，不得混成普通消费。钱包计费的集中底层入口在未知调用者时应 fail closed 标记异常，而不是默认为普通消费；余额购买订阅是已结清普通扣款，可锁内扣款，无需创建购买段。
- `BatchUpdateEnabled=true` 时 `TryReserveUserQuota` 可以先改 Redis 再在进程内合并队列，Redis pending 会过期，崩溃丢失的 delta **不会**由切回非批量模式修复。任何发生在 proof 启用后的**不具持久 intent/ack 的批量钱包动作**都把该用户 `manual`（仅仍在处理中且尚能核查者可 `retry_later`）；不能凭当前批量开关已关闭或 Redis TTL 过期恢复 clean。无 Redis 模式也必须有主库生命周期标记与用户锁。若无法在批量动作之前持久标脏，不能给该账户承诺任何自动金额：要么全局关闭自动报价直到部署隔离/迁移证明，要么实现持久批量 intent 与崩溃恢复。

### 为什么不能再省“每日请求表”

可以**物理上**把生命周期行放在上述有序证据表，毋需第三张每日消费表；不需要记录逐次扣额或其批次分配。但**逻辑上**仍要为每个可回退/异步/延迟调整的普通钱包操作登记可靠身份、未结清和终态。只存 `User` 钱包、一个 `open_count` 或短期 Redis fence 不能在多实例崩溃、异步补偿失败和重试时区分“已完结但未写 closed”与“资金仍可能变动”；以超时清零会错误报价。复用现有任务状态也不覆盖普通 API、零预扣和无 session 路径。若为减写放弃这些记录，唯一正确降级是**所有碰过该类钱包操作的用户永远转人工**，而不是对 A/B/迟发赠送等日常消费用户给数值。这是小 schema 和少日常写之间的真实权衡：没有每消费批次表，但增加一次 open/close 的持久主库写入成本；性能、热点锁和清理存档规则待评估，不得直接用可关闭 `LOG_DB` 消费日志替代。

## 待解决的实施阻碍 / 必须转人工的具体情况

1. **未证明全入口覆盖**：当前 `model/quota_reserve.go` 的 Redis→DB 两步、`model/user.go` 通用正负增减、旧计费、任务异步、订阅、签到 SQLite、管理员调整的锁与补偿不一致。需为每条路径构造 open→commit→close/失败及崩溃后状态的测试；进程崩溃前后若无法区分唯一资金操作结果，标记 needs_review 而非重放非幂等增额。若这些集中入口改造超出批准范围，须重新复核方案。
2. **返现足额追回不等于返还其原段**：对每个受益人要按整个已发奖励金额追缴，而不是只扣剩余未消费赠额；对应原段撤销、当前钱包扣足，并用修正事件再算 FIFO。受益人钱不足、gift 部分旧版已追回/事故欠额、支付人新旧余额混合且起点不可信、跨渠道退款证据不全、任何钱包负额/管理员覆盖、未知现金给付、旧事故已占用该单，均不可走自动确认。此设计以“已发关联奖励整笔撤销”为已批准规则；不新增比例赠送逻辑。对其它订单重算时若修正导致 `Q` 与有效段不一致则永久人工，不能继续自动报价。
3. **商户及运行条件**：需验证 CNY 确认来自实际商户结算证据，并在跨实例可变 Option 写入、支付验签及支付事务之间建可靠版本锁；现有 EpayPaymentEvidence 只有无币种签名金额。缺确认的易支付、旧成功单、所有其它渠道不报自动 CNY 现金金额（其它渠道的额度仍占 FIFO）。预留与线下给付不能原子化，运营必须能核对 pending/paid/failed_manual_resolution，不得用二次点击重扣。
4. **验证状态**：此次仅阅读 PRD/design/implement、完整已有研究与 `.agents/rules/billing.md`，并检查所列现行 Go 实现、推导上面的额度演算；**未**改业务代码、未进行真实三数据库/崩溃/并发/支付渠道测试，以上表结构、锁顺序和“修正后重算”尚属待证的设计候选，不能宣称已可上线。SQLite/MySQL ≥5.7.8/PostgreSQL ≥9.6 必须分别新建、旧库升级、重复迁移并做真实锁/唯一约束/幂等验证。
