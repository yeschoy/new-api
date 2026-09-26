# 只读退款金额：最小安全证据门禁（源码研究，2026-09-26）

## 结论／本轮可交付

**现有主库不能对任意（甚至仅凭余额、充值记录看似简单的）用户自动证明最终逐笔可退购买额度或“已核实 CNY 可退总额”。** 不需要逐次消费的批次分配表：若已证明所有入账按钱包真实提交顺序排列、其他变动仅为普通最终净消费、余额已结清且无未知来源，令 `S=全部额度段总和−当前权威余额`，从旧到新抵扣 `S` 即得购买／赠送剩余。迟发赠送在**实际发放**时加入；兑换码额度段在兑换到账时加入但永远不可退；套餐码只授订阅，不加入钱包；余额购买订阅是普通钱包支出。暂扣／退还要等最终结清后净额重算。此等式是**有前提的推论，不是余额对齐即证明了前提**。区间消费的 LOG_DB 合计仍只可称“已记录消费（参考）”，不能证明区间完整，更不能用于 FIFO。

在用户已明确“不在每次普通消费增写记录”、不改正常计费生命周期的边界内，不能持久证明在途／曾经丢失的扣费和异步退款。故建议维持现有 `model/cashback_refund_report.go` 的最窄 Admin 只读版本：限定区间的已完成正额 `TopUp` 节点 + LOG_DB 已记录消费次数／额度汇总 + 固定人工对账提示，**不返回任何自动计算的逐单购买余额、现金报价或 CNY 已核实总额**；LOG_DB 不可用返回错误，不冒充零消费。管理员自行核对币种、实付、旧钱包、未记录支出及线下已退款历史。若产品坚持真实数值，需要另行批准下述完整证据／生命周期改造；只批准的 `admin_quota_credit_evidences` 一张表并不足够。此结论不要求撤销已有业务改动，也不提议退款确认／给付／追回表。

## 现存证据与缺口（本工作区源码）

| 来源 | 当前可用事实 | 自动报价所缺门禁 |
| --- | --- | --- |
| `model/topup.go`、`CashbackOrderContext` | 在线成功订单的 `TopUp`、已覆盖订单的实际入账 `CreditedQuota`；`creditOnlineTopUpWithCashbackTx` 付款／入额同事务；`ManualCompleteTopUp` 另一路径 | `CompleteTime` 是秒，不保证与其他类型入账的跨表真实次序；旧订单上下文可能缺失；手工补单并非验签付款，不能按在线 CNY 报价。所有真实到账在线通道都须入序，非易支付也占 FIFO。 |
| `model/cashback_ledger.go`、`model/cashback_state.go` | 唯一 `CashbackQuotaMutation(issue)` 标示**实际**奖励发放额；恢复／本金冲正另有 mutation／欠额 | 奖励冻结／批准不等于到账；按实际发行时间加入赠送（邀请人赠送属于**另一用户**）。追回从可用钱包扣，未必仅扣其标称原段；有事故／欠额者停报自动金额。 |
| `model/redemption.go:Redeem` | 已用码 `plan_id=0` 的额度、使用用户、兑换时间及同事务钱包入额；`plan_id>0` 只建订阅 | 额度码必须按真实入额次序登记**不可退款**段，不能从现金报价中删除其影响，也不能把额度码面值报现金；码与其他来源同秒不保证先后。 |
| `model/admin_quota_credit_evidence.go`、`model/user_quota_adjustment.go` | 已批准的 `add` 同余额事务留 `credited_quota`、管理员输入 `cny_cents`（可空），自身 `(user_id,id)` 只排本表；非 CNY／旧客户端 NULL | CNY 分是管理员业务声明，**不是验签付款**；不能以当前汇率反推旧输入。与其他来源需共用序列。`subtract/override` 无购买事件，属于来源不明特殊变动，转人工。不要为面额修改旧 `value` 换算、Option 或普通消费。 |
| `model/user.go:Insert/InsertWithTx`、`model/checkin.go`、`TransferAffQuotaToQuota` | 注册初始额度、签到记录、邀请额度转入后余额可见 | 注册／签到／转入均需列为不可退款段；邀请转入没有独立主库转入事件；SQLite 签到先插记录再另写余额／补偿删除，不能把签到行本身当原子钱包证据。存量混合余额不得反推购买归属。 |
| `model/subscription.go:PurchaseSubscriptionWithBalance` | 钱包在订阅创建事务内扣，`SubscriptionOrder.ProviderPayload` 写额度文字 | 是消费而非入账；套餐兑换码、套餐承担的 API 用量不扣钱包。当前它不出现在普通 API 消费日志，不应由区间 SUM 代替。 |
| `model/epay_payment_evidence.go`、`model/topup.go:rechargeEpayWithSource` | 两种已验签成功回调传签名 `Money`，用整数分和下单价比较，同支付事务保存 `PaidCents`／商户、支付单号 | 签名**没有币种**；`TopUp.Money` 是订单价而非可独立证明的 CNY 实收。`EpayPaymentEvidence` 无商户实际 CNY 收款确认版本；不能事后用当前配置、币种、汇率追认旧订单。其他渠道也没有本次所需已核实 CNY 实付凭据。 |
| `model/log.go:RecordConsumeLog`、`model/cashback_refund_report.go` | LOG_DB 可按区间读到已记录 `LogTypeConsume`，现报表未给金额 | 日志可关闭、异库写失败不回滚，且包含订阅资助用量，不等于钱包消费；同秒的日志和充值无法排序。仅供参考统计。 |

## 为什么不能只补低频入账就对部分现有用户报真数

`model/quota_reserve.go:TryReserveUserQuota` 可先扣 Redis，再写 DB；批量模式只在进程内队列合并差额，`model/utils.go:batchUpdate` 后续刷新，Redis pending 标记会过期，进程崩溃可能永失差额。`service/billing_session.go:Refund` 在异步 `gopool.Go` **前**设置内存 refunded，`service/funding_source.go:WalletFunding.Refund/Settle(-delta)` 最终调用非幂等钱包增额；任务退款、传统 `PostConsumeQuota`、trusted 零预扣后补扣也不全在单一会话状态里。`User.quota` 的当前值、一个暂时没有 Redis fence／未结算任务的查询结果、消费日志或订阅订单，都不能证明“过去没有丢增减，未来也不会再退一笔预扣”。非批量模式依然有在途／异步窗口。发生过来源指定追回、负额后再充值、管理员覆盖／减额或线下退款，同样不能仅凭余额推断可退原单。**现有主库没有可验证的 clean 起点与全部钱包操作闭环；没有历史完整性标记，无法可靠挑出所谓安全的部分存量用户。** 新建且未有任何钱包操作的空账户至多有零额，不构成有意义的现金报价例外。

若未来增加强证据，普通消费本身不必写“花了哪一批”，但每个可能预扣、异步退回或补扣的**钱包操作**都必须在第一次潜在变动之前持久登记 open，并在最后一次钱包变动提交后终结；失败／崩溃保持不确定，不能凭 TTL 自动 close。还需排除或持久化批量 intent＋落库确认、持有跨实例钱包 fence 并与用户锁／事件序列协调读快照；证明所有入口覆盖，低频特殊扣额故障封闭。**这仍是在正常计费请求生命周期新增写入，超出当前授权。** 如果连这类写入也不要，普通 API 消费过的用户无法满足自动报价证明条件，应只做人工对账。

## 仅供审批的完整增量结构清单（**未批准、未实施；不是退款确认表**）

前提：产品另行批准改变钱包生命周期且愿意覆盖所有入口／禁用不可信批量模式；只建表不能自动修复旧历史。以下 3 张主库证据表 + 现有侧表 2 列 + 预建 Option 版本行，是有界候选（仍需证明覆盖所有入口）；没有钱包扣减／给付／返现追回接口，没有普通消费批次分配表。整数额度和分均用 bigint，状态用 varchar，序列按用户锁下提交的事件 ID，三数据库兼容性仍须真实验证。

1. `wallet_quote_states`：`user_id BIGINT PRIMARY KEY`、`opening_quota BIGINT NOT NULL`（仅在权威已结清边界锁内取得、当不可退款初始段）、`opened_at BIGINT NOT NULL`、`state VARCHAR(16) NOT NULL`（`clean`/`manual`）、`reason VARCHAR(64) NULL`、`revision BIGINT NOT NULL DEFAULT 0`。无自动可信旧起点者直接人工；新安装前已有混合余额不可标成可退款。`revision`／用户锁为建边界、入账和查询提供串行点（SQLite 用写事务而非 `FOR UPDATE`）。所有越界入口必须持久标 manual；老版本混跑禁报价。
2. `wallet_quote_events`（共用的低频入额顺序**兼**操作生命周期证据，不是逐笔消费分配）：`id BIGINT PK AUTO-GENERATED`、`user_id BIGINT NOT NULL`、`event_key VARCHAR(191) NOT NULL UNIQUE`（来源幂等键，例如 `topup:<id>:purchase`、`cashback:<reward_id>:issue`、`redeem:<id>`、`admin:<event_key>`、`wallet_op:<request_or_task_id>`）、`kind VARCHAR(16) NOT NULL`（`credit`/`operation`）、`source_type VARCHAR(32) NOT NULL`、`source_id VARCHAR(191) NOT NULL`、`credit_type VARCHAR(16) NULL`（`purchase`/`gift`/`nonrefundable`；operation 为 NULL）、`quota BIGINT NOT NULL`（credit >0；operation =0）、`status VARCHAR(24) NOT NULL`（credit `committed`；operation `open`/`closed`/`needs_review`）、`created_at BIGINT NOT NULL`、`closed_at BIGINT NULL`；索引 `(user_id,id)`、`(user_id,kind,status)`，`event_key` 唯一兼防重复来源。全部真实钱包入额（在线／人工补单、发行返现、注册、额度码、签到、邀请转入、管理员 add）和钱包改动**同事务** append，购先于同事务即时赠、迟发按发行；管理员事件关联**现有** `admin_quota_credit_evidences.event_key`，不再造第二份 CNY 面额。`operation` 的 open/close 必须覆盖钱包来源 API／传统计费／任务／异步退款／余额买套餐，前后在可靠事务边界写入；`needs_review` 永不自动清理。未知直接写、来源指定追回／减额／覆盖先把账户标 manual，不能将其记为普通净消费。记录未结清状态**不等于**解决任务钱包退款的非幂等重试；须配套业务修复或永久人工。即使合用一表，operation 行仍是每次普通钱包操作额外写入，当前边界下不可实施。
3. `epay_cny_attestations`：`id BIGINT PK AUTO-GENERATED`、`config_generation BIGINT NOT NULL UNIQUE`、`config_fingerprint CHAR(64) NOT NULL`（网关／商户 ID／密钥版本的安全摘要，绝不存密钥明文）、`confirmed_by BIGINT NOT NULL`、`confirmed_at BIGINT NOT NULL`、`evidence_ref VARCHAR(191) NOT NULL`（管理员核实商户 CNY 收款资料的受控引用）、`revoked_at BIGINT NULL`。现有 `cashback_order_contexts` 加 `checkout_cny_attestation_id BIGINT NOT NULL DEFAULT 0`，`epay_payment_evidences` 加 `payment_cny_attestation_id BIGINT NOT NULL DEFAULT 0`（均随既有 `top_up_id` 唯一键查询，不要求额外索引；0=当时无确认，**不回填**）。`RequestEpay` 在外部 `client.Purchase` 前读取配置版本和有效确认，订单写入事务内复核并冻结 checkout ID；支付验签事务再冻结当时同一确认 ID。两 ID 相同且非零才可作为自动 CNY 报价的前提，后来新确认不能追认旧 checkout；实际商户 CNY 收款仍须核实。现有 `options` 预建唯一键 `EpayCNYConfigGeneration`（值为正整数版本），创建／撤销确认、`PayAddress`/`EpayId`/`EpayKey` 任一配置写入、下单与支付绑定必须锁同一版本并共同串行化；否则旧服务实例绕过版本时停止报价。此确认是可审计的**管理员外部证据声明**，不是 Epay 协议签出币种的证明；未核实实际 CNY 结算不可标“已核实”。

配套**非 schema**门禁同样不可省：所有入额路径与钱包 fence／用户行的锁序统一、SQLite 签到改成原子同事务、批量模式禁止进入 clean 或新增持久 intent/ack＋崩溃修复、任务退款和异步回退具可核验终态、在途返回“稍后重试”、来源未知／负额／旧混合／已线下给付返回“人工核对”。按订单以 `floor(已核实签名 CNY 实付分 × 未消费购买额度 / 原购买入额)` 计算且上限实付；管理员 add 只按其已声明原始 CNY 分比例作**业务参考**、不得混称支付实收；赠送和额度码从不报现金，不跨币种求“已核实总额”。即使上述方案实施，也**不能**通过只读 DB 查询确认系统外是否已退款，须由管理员人工核对。任何结构实施前需用户对整个新增 schema、日常操作写入及性能／迁移范围另行明确批准；不能把已批准的 admin 侧表许可扩展成这套资金证据。

**验证范围：** 只读检查上述文件与当前任务 research／PRD／design／implement，未查生产库、未改业务代码或 schema、未跑三数据库、并发／崩溃／异步测试。结构和跨路径覆盖是待论证候选，不宣称可交付准确报价。旧研究中“Epay 签名金额未持久化”和“管理员 add 无侧表”已被当前代码替代；旧四张退款确认表方案已撤销，不能用作实施清单。
