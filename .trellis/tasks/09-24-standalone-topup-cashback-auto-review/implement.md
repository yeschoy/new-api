# 执行计划（实施中）

本任务的返现资格、逐场活动、四档审核及即时发放已有部分未提交实现，继续验证并收尾。退款需求已收敛为**只读参考报表**：区间消费为已记录日志汇总；最终 FIFO 剩余独立用完整有序入账与可信余额计算，不依赖消费日志完整性。仅新增一张已批准的低频有序入账侧表；不加四张旧退款确认/生命周期表或 CNY 绑定列，不增日常消费写入，不实现系统确认、扣钱包、给付或返现追回。旧的复杂退款结构草案仅为已撤销研究材料。

## 0. 范围与既有状态

- [x] 任务处于 `in_progress`；用户已授权返现主线实施，退款随后收窄。保留工作区全部既有业务/任务变更及未跟踪的 `.pi/npm/node_modules/`，不因改范围重置他人的成果。
- [ ] 开发前复核 `trellis-before-dev`、backend/frontend 指南及完整 `.agents/rules/billing.md`；前端修改还须先读 `web/AGENTS.md`、`shadcn-ui`、`i18n-translate`、React 最佳实践，检索已有业务组件。
- [ ] 当前新增 `CashbackCampaign`、`EpayPaymentEvidence` 两张主库表及 `CashbackOrderContext.campaign_id`、`CashbackReward.review_source` 两列是返现活动/验签部分的未提交变更，不是只读报表新增的四张旧退款表；迁移仍需三库验证。
- [ ] 对只读报表先做数据可观测性门禁：现有 `LOG_DB` 消费日志可能关闭/丢失，余额订阅等支出不必出现在日志；相同总余额不能证明各充值区间完整。但完整有序入账和可信已结清余额足以在无特殊变动的普通 FIFO 情况下推得最终购买额度剩余，不需要逐区间消费日志。不能由只读查询保证线下给付单次性。

## 1. 返现主线后端

- [ ] 对照现有 `model/cashback_test.go`、`model/cashback_integration_test.go`、`controller/cashback_config_test.go` 检查已写回归：无邀请人可领充值方向；有关系至多两方向；无活动/次数已满不妨碍邀请人；四档审核、自动批准后立即发放开/关与 T+N；验签失败/资金失败回滚、同订单幂等、充值与返现同事务。
- [ ] 核对活动时间依据数据库时间及早停锁序，正额奖励计次与零额例外、旧奖励/旧配置兼容；对竞态保护、额度 fence 结束校验及对账分页做聚焦复查。不因用户希望简化退款报表而削弱真实充值与返现的资金安全。
- [ ] 核对两张主库表、两列及常规/快速迁移；对已存在返现数据的升级和重复迁移作检查，保留支付成功时易支付签名金额、商户及订单号证据，明确它不证明币种。

## 2. 只读报表的证据门禁与实现边界

- [ ] 列明可从现有 `TopUp`/`CashbackOrderContext`/`CashbackReward`/`CashbackQuotaMutation`/`EpayPaymentEvidence`、管理员 `AdjustUserQuota(add)`/人工补单、其他入账记录、`LOG_DB`、余额订阅与钱包余额获得的事实；管理员正向入账按可退购买额度段参与 FIFO；额度兑换码（`plan_id=0`）作为**不可退款批次**按实际到账时间参与 FIFO，不能报价现金；套餐兑换码（`plan_id>0`）只开通订阅、不动钱包，套餐用量不算钱包消费，余额购买套餐才算钱包支出。管理员入账 CNY 参考以原输入为准；按 CNY-only 范围以管理员入账时录入的人民币金额作为 1:1 面额；现 UI 输入经可变汇率转内部 quota，须对旧批次缺当时面额转人工，新批次的最小持久证据结构需另行经用户确认，不能以当前汇率倒推。`subtract/override` 特别处理。不补造历史快照。确定查询上限与旧余额边界。
- [ ] 设计只读 Admin 接口和页面：各充值节点间的**已记录消费合计**单独展示；最终 FIFO **推算**用全部可核实有序真实入账、钱包可信余额求累计净消费，再分配购买/赠送批次，不以区间日志 SUM 为资金输入。展示不可退赠送、每单实付比例参考额、资金依据与 `需人工核对` / `稍后重试`。不展示逐次消费明细；易支付的实付与 CNY 来源经核实时才可作为 CNY 参考；管理员加额只能按已确认的 1:1 业务约定作参考，不能标为验签实付，以入账时人民币面额为基准，历史缺证据者人工核对；新持久证据方案需先通过数据库结构确认门禁。
- [ ] 普通预扣/退还按最终净消费、迟发赠送按实际到账时加入；管理员查询前负责确认相关业务结清、批量余额已落库，报表以最终钱包余额为假设，不新增在途生命周期证明或假称系统已验证。管理员余额覆盖或减额、旧混合余额、欠额、旧退款/来源指定追回、**缺入账或特殊扣减证据**时不得报准确金额；管理员正向入账及额度码兑换不可直接视为未知扣款或无批次，但额度码批次始终不可退款，订阅套餐兑换则不产生钱包段；仅缺消费日志不应阻断普通 FIFO 的最终余额推算。即使日志合计与余额碰巧相等，仍不得声称区间日志完整；无法证明钱包或来源时只展示日志参考及提示，不做伪准确现金总额。
- [ ] 报表本次**仅**新增用户批准的 `wallet_refund_credit_events` 有序低频入账表；**不**新建旧提案的 `wallet_refund_proofs`、`wallet_refund_events`、`wallet_manual_cash_refunds`、`epay_cny_attestations`，不添加 `checkout_cny_attestation_id`、`payment_cny_attestation_id` 或 merchant epoch Option 行，不修改普通消费写入、不执行退款或追返现。管理员加额 CNY 面额留证的 `design.md` §7 **一张主库侧表**已获用户在明确「每笔消费不写入」后授权。第一阶段已实现 `add` 事务内写额度事件（`cny_cents=NULL`）。用户最终澄清金额只需记录原输入，**不得改动旧加额额度换算及默认表单语义**：CNY 展示时将原输入按正整数分送到服务端，原有 `parseQuotaFromDollars` 仍负责原有 `value` 与预览；服务端只校验声明 CNY 分的范围与 `add` 关系，不重新计算/替换实际入账额度，并与额度同事务写证据。旧客户端及非 CNY 展示仍按原逻辑加额，面额 NULL；不把管理员声明当支付凭据。不改 Option 写路径、不新增表/消费写入；这一张表本身仍不解决其它入账和钱包结清证明，不得声称完整退款报价已完成。若要求自动确认准确且防重复给付，需重新提出完整 schema/性能/迁移方案供用户确认。
- [x] 撤回未提交的固定 CNY→额度 1:1 换算，恢复原 `parseQuotaFromDollars` 加额/预览。仅页面明确 CNY 且输入精确可表述为正整数分时传原金额；如原表单允许的子分/科学计数输入不能精确记录金额，照旧加额但 CNY 面额 NULL，绝不伪造四舍五入分。展示币种切换清空输入，避免误标。旧 API/非 CNY 输入仍 NULL；后端金额只是管理员声明，额度计算不变。前端17项和后端聚焦测试、类型检查/构建/定向 lint/diff check 通过；当时完整管理额度测试曾被既有 Redis 极值缓存差1阻断，后续已在 `model/quota_reserve.go` 用整数参数修复并复测通过；三库迁移另在后续轮次验证。
- [ ] 在既有合适测试文件集中覆盖 35/125、迟发赠送 45、预扣净额、90 实付/100 额度/剩 50→45 参考分、赠送不退款；构造「两段消费分布不同而余额总额相同」与漏日志场景，断言区间汇总不同/不完整但最终普通 FIFO 剩余相同；另测缺入账、来源指定扣款、订阅扣款、未核实币种、旧余额、在途预扣等，保证不返回貌似准确的现金总额。先验证可观测性是否足以满足用户认可的**参考报表**；无法满足则停在规划门禁，不扩大结构或隐性替用户承担风险。

### 本轮证据门禁结论（2026-09-25）

- 从 `TopUp` 成功记录及可选的 `LOG_DB` 消费日志可安全提供限时、限单的**已记录消费（参考）**区间汇总；日志关闭、失败或独立库不可用不能视作实际零消费；查询错误不能伪装为零。新增 Admin 只读查询与现有 `/cashback` 页面入口，固定提示需人工对账，不返回可退款购买额度或现金金额。
- 当前主库没有覆盖注册/兑换/签到/邀请额度转入/管理员加减额等全部入账的用户序列；`CashbackQuotaMutation` 只覆盖返现发行和追回，充值完成时间精度为秒，不能证明同秒与迟发赠送先后。现有 Redis/内存批量余额可能滞后或丢失，`BillingSession` 异步退款与任务路径没有持久结清证据；旧混合余额与来源指定追回也不能自动归属。`EpayPaymentEvidence.PaidCents` 虽已验签但未证明币种，商户 CNY 确认无持久绑定。故本轮**不计算 FIFO 余额与现金报价**，不能宣称满足退款报价验收，待产品确认额外资金证据方案（任何新 schema 先征询用户）。
- 当前报表仅按最近 30 天 UI 查阅；接口接受至多 90 天、最多 50 笔正额已完成充值（排除 `upsertSubscriptionTopUpTx` 生成的零额订阅兼容行），秒级半开区间同秒事件不判定先后。管理员线下已退款历史同样未能从现有记录排除。报表查询不改钱包/奖励；敏感访问沿现有 Admin 管理审计。额度码兑换是**不可退款**钱包入账、套餐码只授订阅权益、余额购买套餐是钱包扣款；这一分类已按用户最后纠正更新。
- 2026-09-26 只读复核见 `research/read-only-refund-amount-evidence-gate.md`：该研究基于**系统必须证明每个钱包操作已结清**的旧要求，列出 3 表+2侧表列+Option版本行的未批准候选。用户随后明确本轮**假设管理员查询前已结算**，不要求系统证明在途预扣、异步退还或批量刷新，也不因此新增日常操作生命周期表；这消除了中间态实施门槛，不能倒推出支付/赠送/兑换的跨表入账顺序或 Epay 实际 CNY 收款。继续只读核查能否用既有来源给出明确标注假设的参考金额，缺入账/币种等证据则人工核对；不得声称系统已核验钱包结清或准确给付。
- 用户指示开始后的现有结构门禁：跨表支付/返现/额度码/管理员 add 的同秒顺序不明，签到和邀请额度转入无统一原子事件，管理员 subtract/override 没有主库异常标记，旧混合余额缺开口；易支付验签证据无 CNY 币种。此前 `go test ./model -run '^TestCashbackRecordedSpend' -count=1`、`go build ./...`、`git diff --check` 通过，未造虚假的金额。用户随后**明确同意**一张低频有序入账侧表及「管理员在查询时确认 CNY、显示人工参考金额」口径；参见 `design.md` §7 的唯一新表字段/索引、写入路径、旧数据/发布/回滚。不要将管理员 CNY 确认误写为支付协议证明。
- [x] 第一阶段在主库迁移加入唯一新表并以已锁用户行事务写 opening、在线/人工补单购买、实际返现发放、额度码/注册/签到/邀请转入不可退批次、管理员 add；subtract/override/事故追回写 exception。每个真实入账与原钱包变化同提交/回滚，不污染正常消费；无交易原子性或漏入口者拒报。新数据首个事件只可开不可退 opening，不回填旧可退历史。
- [x] 第二阶段在既有只读报表按事件 ID 和已结算钱包余额做购买→赠送→后续批次 FIFO；异常/缺口隐藏数字，易支付只有管理员本次明确确认商户 CNY 后按签名金额换算**参考**，管理员 add 按原输入 CNY 面额，非易支付/旧无面额人工核对。新增行为测试集中到既有 `model/cashback_test.go` 或 `model/cashback_integration_test.go`，覆盖 35/125/迟发45/净预扣/90→45、兑换码不可退、异常/旧开口、重复回调和缺币种；前端已在现有报表组件复用 Checkbox/Label/Alert 展示结果、逐单CNY人工确认与七语言，待最终质量门禁。

### 有序入账第一阶段实施记录（2026-09-26）

- 新增且仅新增 `wallet_refund_credit_events`：`id` bigint 主键、`(user_id,id)` 查询索引、唯一 64 字符 SHA-256 来源键、`kind/source_type/source_id/quota/created_at`；`migrateDB` 注册主库迁移，未改 `User`、`TopUp`、LOG_DB 或普通消费。用户行锁之后同事务写首次不可退 opening（老账户仅第一次覆盖入账时按变动前混合余额开口；负余额 opening=0 并追加 exception），随后写事件。注册两路径以创建行事务写 opening；在线五渠道和人工补单购买先于同事务即时返现赠额；手工/到期返现实际发放才写 gift；额度码、签到（SQLite 原分步补偿改为完整事务）、邀请额度转入为不可退；管理员 add 事件关联原有管理员额度证据 ID、subtract/override 仅 exception；事故对涉及钱包写 exception。所有事件写失败回滚主库余额/状态；支付/额度码重试沿原幂等门禁，无历史可退批次回填。
- 入账/异常入口清单（源码核查）：`model/topup.go` 五个已验签渠道和人工补单 → `creditOnlineTopUpWithCashbackTx` / `ManualCompleteTopUp`；`model/cashback_state.go` 即时/延迟 `issueLockedCashbackRewardTx`、`HandleCashbackIncident`；`model/redemption.go` 钱包码 `Redeem`（套餐码不入钱包）；`model/user.go` 注册 `Insert/InsertWithTx`、`TransferAffQuotaToQuota`；`model/checkin.go` `UserCheckin`；`model/user_quota_adjustment.go` `AdjustUserQuota`。`model/subscription.go` 余额买套餐仅普通扣款；`model/user.go` 的 `IncreaseUserQuota/DeltaUpdateUserQuota`、`model/quota_reserve.go` 的 Redis/DB 预扣/返还、`model/utils.go` 的异步批量刷盘及 task/legacy billing 返还是普通净消费/回退而非新 grant，本阶段没有插入证据。未知直接钱包入账（包括绕开这些入口的旧实例或未来新代码）、历史线下退款、在途或丢失批量余额无法由本表证明；第二阶段必须 fail closed/人工核对，**不能只看有 opening+余额对齐就报价**；未知入账若恰好被其他消费抵消，余额相等也无法发现。若无法提供足以排除该缺口的业务保证/核对依据，继续禁用数字报价而非伪造「证据完整」。管理员先确认所有实例覆盖和余额已落库；无新自动报价开关/接口，本阶段报表仍只返回日志参考。
- 验证：`go test ./model -count=1`、`go test ./model -run 'TestRegistrationInitialQuota|TestRedeem|TestCashback' -count=1`、SQLite 事务/回滚/唯一键回归通过。使用原任务隔离数据库目录 `/tmp/cashback-release-upgrade-Se6yQI`（重启并确认真实 datadir）运行 `TEST_MYSQL_DSN`/`TEST_POSTGRES_DSN` 的 `TestCashbackProductionDatabaseIntegration`：MySQL 8.0.46、PostgreSQL 16.15 五渠道、重复迁移、旧返现列/表升级、并发即时发放事件顺序通过；当前代码对原 `v1.0.0-rc.40` 代表库 SQLite 3.50.4 / MySQL 8.0.46 / PG 16.15 各重跑两次隔离 `upgrade.go`，旧 User/TopUp/Redemption 值和唯一键保持、新表不回填历史、唯一来源键/复合索引存在。`go build ./...` 与 `git diff --check` 通过；早期 controller 定向检查遇到 Redis 超过 JS 安全整数差1，后续单行修复并通过完整管理额度测试；`TestRegister|TestRegistration|TestOAuth` 定向测试遇到既有 `TestOAuthLoginConsumesFlowOnlyAfterProviderIdentity/exchange_failure` nil 指针 panic（本阶段不改 OAuth），注册 Insert/InsertWithTx 的原子性与不可退 opening 已由 model 回归验证。注册路径仅新增与用户创建同事务的入账 opening，未改凭据/会话协议；参照 OWASP Authentication Cheat Sheet、Session Management Cheat Sheet（未使用 ASVS 特定 requirement ID、不宣称全链符合 ASVS）。未测最低 MySQL 5.7.8/PG 9.6、真实生产数据、独立 ClickHouse LOG_DB 和全部服务启动，不声称覆盖最低版本或完成整个退款报表。

### 后续整合验证（2026-09-27）

- 已实现 `model/cashback_refund_report.go` 的主库 Repeatable Read 一致快照、从 opening 起最多 1000 条事件的 FIFO、来源与事故异常门禁、精确整数分比例和 Epay 逐单管理员确认；默认关闭的 `CASHBACK_REFUND_REFERENCE_ENABLED=true` 仅在写入节点已全部升级、旧余额及线下给付经运维核对后启用。`LOG_DB` 缺失单独标 unavailable，不伪装零消费。部分 CNY 单笔金额可显示，但遇未核价批次完整总额仍隐藏；已知来源缺证或异常时隐藏全部数字。旧正额混合开口人工，新注册赠额开口仅不可退；旧无上下文人工补单参与 FIFO 但现金人工。
- `web/src/features/cashback/components/recorded-spend-report.tsx` 已对齐 API 类型、旧单逐笔 CNY checkbox、切换用户/解除确认即时清除旧金额、金额按固定 CNY 分显示、无需日志仍可见独立 FIFO；七语言经项目 i18n 脚本添加并同步。已检查代码复用：沿用 `Checkbox`、`Label`、`Alert`、`Card`、`LoadingState` 和现有报表入口，未新增通用控件。
- 三方真实数据库隔离验证：SQLite 3.50.4、MySQL 8.0.46、PostgreSQL 16.15 的新表/索引、代表 `v1.0.0-rc.40` 升级重复迁移及返现支付路径已通过；最新集成在 MySQL/PG 亦验证 100购/90元实付/余50→人工参考45、0奖励签到不动钱包、额度码不退。移除 `Checkin.TableName()` 的冗余固定表名，确认默认 GORM 仍为 `checkins`，测试表前缀现可隔离。隔离实例已停止，保留 `/tmp/cashback-it-tTEk43/` 等记录。最低 MySQL 5.7.8/PG9.6、ClickHouse、生产数据和完整应用启动仍未实测，数据库兼容性不得宣称全面完成。
- 最新 `go test ./model -count=1`、前端 `bun run typecheck` 与记录报表 8 项测试通过；完整 `go test ./controller -count=1` 仍在 OAuth 跨域 Cookie/审计及注册会话断言失败。新增表导致的 OAuth  fixture 缺表已补迁移并复测相关路径；随后以 `git archive HEAD` 解压到 `/tmp/cashback-head-auth-HT0H4t/` 并在隔离源码上执行 `GOWORK=off go test ./controller -count=1`：HEAD 同样出现这 11 项 OAuth 跨域 Cookie/审计和注册会话失败，另多一项已在本工作树修复的 Redis 极值缓存差1；当前 controller 失败列表与 HEAD 扣除该 Redis 用例后一致。该比较仅证明当前测试环境的基线结果，不替代认证功能安全验证。当前工作树 `go test ./... -count=1` 除相同 controller 11 项外，middleware 的 `TestTryUserAuthCredentialClassification` 与 `TestHeaderNavPublicRouteRejectsExpiredInternalAccessToken` 失败；在同一隔离 HEAD 源码运行这两项亦失败，日志 `/tmp/cashback-full-go-latest.log`、`/tmp/cashback-head-auth-HT0H4t/head-middleware.log`。本轮无认证行为改动，涉及测试 fixture 时复核 OWASP Authentication/Session Management Cheat Sheets，未声称全链 ASVS 合规。全站前端 lint 在未修改文件失败，本任务所改文件定向 lint、构建通过。

## 3. 前端与规范

- [x] 复用现有 Root 配置/活动组件与 Admin 风险列表、详情及共享 UI，完成分级策略、活动创建/早停、方向标签和审核来源；不新增 CNY 收款确认配置或退款确认按钮。全链复查后已局部修复：活动早停进行中允许 Esc/Close/Cancel，mutation 自身负责 toast/失效；新增查询兜底文案七语；`model/cashback_test.go` 对 low/medium/high/severe 的自动/人工策略、主开关关闭、邀请人始终人工补充紧凑测试。相关 Go/前端聚焦、typecheck、定向 lint/构建及 diff check 通过，整体检查仍待做。
- [x] 在既有 Admin 区域完成只读区间汇总与有序来源/FIFO 依据、参考/人工核对状态，并通过前端类型、校验、七种语言的已有 i18n 流程对齐接口。数值与时间格式遵循 `web/AGENTS.md`。
- [ ] 只修改现有 `.trellis/spec/backend/referral-recharge-cashback.md` 中返现已实施合同；旧退款自动确认合同不得作为新增规范。项目不新增 `docs/` 文件。

## 4. 验证与审查

- [x] 既有管理额度缓存边界 `TestManageUserQuotaCacheUsesCommittedIntegerDifference/large_odd_difference` 曾因 Redis Lua `tonumber(ARGV[1])` 丢 1；已改用原始整数参数传 `HINCRBY`，先复现失败、后复测该测试及完整管理额度聚焦通过。仅修复 User quota delta，不顺带更改其它 token quota Lua 路径。
- [ ] `gofmt` 后运行 `go test ./model -run 'TestCashback' -count=1`、`go test ./controller -run 'TestCashback|TestUpdateCashbackConfig' -count=1`、涉及支付渠道聚焦测试、必要时 `-race`、`go build ./...`、`go test ./...`、`git diff --check`；区分已有失败与本次回归。2026-09-26 全量 `go test ./... -count=1` 失败：controller 的 OAuth/domain handoff、注册、账户删除及 `TestManageUserQuotaCacheUsesCommittedIntegerDifference`，middleware 的过期 JWT 断言；其他包多数通过。完整输出保留 `/tmp/cashback-full-go-test-0926.log`，不能声称全量后端通过；这些失败尚未逐项归因本任务或基线。
- [ ] 真实 SQLite/MySQL/PostgreSQL 分别进行新库、代表发布版/旧返现数据升级、重复迁移和索引唯一性验证；记录确切版本与命令。2026-09-26 使用隔离本地 SQLite 3.50.4、MySQL 8.0.46、PostgreSQL 16.15：`TEST_MYSQL_DSN`/`TEST_POSTGRES_DSN` 下 `go test ./model -run '^TestCashbackProductionDatabaseIntegration$' -count=1` 的两方 integration 通过（新建、模拟旧返现结构升级、重复迁移、支付及索引）；`TEST_MANAGE_USER_DIALECT={sqlite,mysql,postgres}` 配合隔离 DSN 和 `TEST_MANAGE_USER_SEPARATE_LOG_DB=1` 下 controller 管理加额聚焦测试通过（新建、模拟旧钱包升级、重复迁移、CNY 原输入/旧客户端 NULL、唯一约束、事务回滚、并发快照）。日志与隔离数据保留于 `/tmp/cashback-dbcheck-lCWf7h/`，服务已停止。**尚未**验证最低 MySQL 5.7.8/PostgreSQL 9.6、完整应用启动与 ClickHouse 独立日志库；因此此项不能勾选为完整数据库兼容。

  2026-09-26 另以真实 `v1.0.0-rc.40` tag 完成隔离代表数据升级：`git archive v1.0.0-rc.40 | tar -xf - -C /tmp/cashback-release-upgrade-Se6yQI/release`，从 tag 源码执行 `env -i HOME="$HOME" PATH="$PATH" SQL_DSN=<隔离 DSN> GOWORK=off go run /tmp/cashback-release-upgrade-Se6yQI/seed.go`（`model.InitDB` 后插入旧 User/TopUp/额度 Redemption）；再从当前工作区对**同一库**执行 `env -i HOME="$HOME" PATH="$PATH" SQL_DSN=<同一隔离 DSN> GOWORK=off go run /tmp/cashback-release-upgrade-Se6yQI/upgrade.go` 两次（各自独立进程调用实际 `model.InitDB`）。SQLite DSN 为 `local`，runner 显式指定该目录下 `legacy.sqlite`；MySQL 使用仅此任务初始化的 `mysql-data`、TCP `127.0.0.1:55176`、库 `cashback_release_Se6yQI`；PostgreSQL 使用仅此任务 `initdb -A trust` 的 `pg-data`、TCP `127.0.0.1:55177`、同名库。连接前后查询服务器 `@@datadir` / `SHOW data_directory` 确认目标确为该目录；MySQL `mysqld --no-defaults --initialize-insecure` 后 `--daemonize --datadir=... --socket=... --pid-file=... --port=55176 --bind-address=127.0.0.1`，PG 用 `pg_ctl -D ... -o '-h 127.0.0.1 -p 55177 -k ...' -w start`。实际 SQLite 库 `sqlite_version()=3.50.4`（宿主 sqlite3 CLI 3.43.2，不代表驱动）；MySQL 服务端 8.0.46；PostgreSQL 服务端 16.15。三方 tag 建库/插入及当前迁移两次均成功；每次验证旧用户 ID/余额/已用额度、成功 topup ID/金额/实付、额度码 ID/额度及新增默认 `plan_id=0` 未改，旧用户/订单/额度码唯一键通过故意重复插入报错确认；七张新增返现/易支付/管理员证据表、活动列与审核来源列均存在，新表的关键唯一索引经数据库元信息确认为 unique，无历史活动或虚构支付/管理员证据回填。tag 中**尚无 cashback 表**，本验证只覆盖无返现发布版升级；此前当前分支旧返现结构升级由上述 integration 另测。完整日志、runner、数据库文件保留在 `/tmp/cashback-release-upgrade-Se6yQI/`，仅本次启动的 MySQL/PG 已用 `mysqladmin --socket=<新实例 socket> shutdown`、`pg_ctl -D <新实例目录> -m fast -w stop` 停止且状态已核查。未运行 MySQL 5.7.8/PG 9.6 最低版本、真实生产数据或完整应用启动；不据此声称全量数据库兼容。
- [ ] 前端执行聚焦 Vitest、`bun run typecheck`、`bun run lint`、`bun run build` 和七语键核查。2026-09-26 全量 `cd web && bun run lint` 因未修改文件中多处已有规则错误退出 1，见 `/tmp/cashback-full-web-lint-0926.log`；本任务涉及文件的定向 lint 已通过。执行 `trellis-check` 最终质量门禁，重点复核支付→活动→计次→审核→发行及查询→区间来源→FIFO→手工提示的跨层契约。

## 5. 提交与收尾

- [ ] 若只读现有数据无法满足用户要求的区间准确度，明确现状、风险与最小决策，**先停止报表实施并回规划**；不自作主张增加表/字段或在每次消费写入。与用户确认实际需求后再推进。
- [ ] 检查只提交本任务文件，更新适用 Trellis spec 并提交相关变更；不要提交 `.pi/npm/node_modules/`。质量门禁通过再归档、记录 journal；完成后征得用户同意才清理非业务临时文件，Trellis 日志保留。
