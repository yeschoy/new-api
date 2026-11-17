# 11-17 任务组最终验收续接

会话：`pi_01a1ea7d-fd81-7463-a795-93fd8b990484`；起始 HEAD `68cb5dd29`。既有三个 child 全为 in_progress，本次恢复 usage-logs 为当前任务，不创建新任务。用户要求继续完成；沿用父 PRD 中已经批准的实现/隔离测试/本地提交范围，禁止生产、真实支付/模型消费、推送部署和未授权清理。

## 1. 已确认的实际起点

旧 implement/spec/父 verification 前部仍写“Go 执行 0、C 未开始”，这些是历史检查点，不是当前状态。后续 R/C1/C2 和 `quality-review.stage-c.md` 已证明：

- usage-logs：63 顶层 / 114 子测试，隔离 PostgreSQL 15.19 通过，无 skip；writer 已启用，text/audio/realtime/task/违规费/error 的服务调用点已实跑。
- quota-cny：15 顶层通过；独立订阅/H5/catalog 的真实 HTTP additive 兼容与精度已验证。
- user-classification：7 顶层 / 22 子测试通过，分页/排序/过滤/归属与真实路由已验证。
- 前组 access-mode 11、authorization-audit 9 已在隔离 PostgreSQL 通过，既有回归的失败集合已有基线比较（见父 verification §7、日志 C1 主会话复核）。不能把“不带 DSN 必败的新增 PG 测试”误当新业务失败，也不能声称全部 legacy 套件无失败。

本轮剩余：独立 LOG_DB 写入与结算后故障、token 真实路由伪参/成员 session 权限、probe/union logger 安全、目标 SQL EXPLAIN/ClickHouse生成SQL契约、真实后端浏览器联调、最终全范围回归和状态/规范收尾。

## 2. 真实后端 + 浏览器（本轮已执行）

复用任务自有 `ptusage-1117-e2e-server`，仅 `127.0.0.1:3392`，独立假库 `ptusage_e2e`（真实 PostgreSQL/后端，不是 mock API）。二进制来自前会话 HEAD 构建；本轮业务源码未改时与当前逻辑一致。数据由既有 `e2e-seed.sql` 种入，不是模型真实调用，writer 端到端由 Docker Go suite 单独证明。站点采用既有测试配置 quota_per_unit=500000、rate=7.3，没有写生产配置。

本轮只在这个假库更新 root/ordinary-user 的临时测试登录 hash、新建 id=106 的普通管理员 `fixture-admin`，没有接触真实账号；登录口令只用于这个 fixture，不写任何文件。使用正常 POST login，浏览器只输出安全投影，不输出 bearer/cookie/hash。

| 验证 | 实际结果 |
| --- | --- |
| 普通管理员访问新页 | 正常加载；全部窗口 5 记录，原始quota `9007199254757252`，4请求（3成功/1失败）；重试错误/成功折叠但真实consume额度保留 |
| 选择商户12 | 4记录 / 3请求（2成功、1失败），quota `16259`，input `1310` / output `395`，CNY `0.237381`；列表/API/stat相同范围 |
| 分页 | 同窗口 page_size=2，p1事件1/2，p2事件3/5，total各为4，无重复/遗漏 |
| 两页同归属 | 用户页 tenant12 仅101/105，均 Acme 商户；105禁用仍merchant。日志行 user101/105 同tenant12 |
| 默认日志历史隔离 | `/api/log/` 仅 `req-ordinary`、`req-old-default`；新商户事件不混入 |
| 普通管理员root-only限制 | `/api/partner-tenants/` →403；安全新读取仍200。一次误写 `/api/partner/tenants` 得404，不计作权限证据 |
| 匿名 | 新商户读取401 |
| 普通用户 | 真登录ordinary-user后冷打开新页→`/403`；性能资源列表中商户管理员端点请求0，无旧admin行残留 |
| root | 可进入新页，超2^53商户 `9007199254740993` 单条正确：quota `9007199254740993`、CNY `131505109119.218498`、tokens `9007199254740995` |
| 大ID用户筛选 | URL刷新后正常；真实请求 `tenant_id=9007199254740993` 和 options `selected_id=9007199254740993`，仅user102，未Number舍入 |
| 类别联动 | users选ordinary后URL删除tenant，返回4普通用户，包括伪p_用户；后退恢复merchant12；禁用成员归属保留 |
| 浏览器历史 | usage切tenant12后Back→全部5记录，Forward→tenant12的4记录，统计同步 |
| 移动端390×844 | 两页document.scrollWidth=390=innerWidth；大金额/额度/Token卡clientWidth=scrollWidth=153，无省略截断；用户移动卡归属可见 |
| 键盘详情 | 聚焦详情→Enter打开，focus在Close；Escape关闭后稳定帧focus回详情。关闭动画尚未完成的瞬时帧focus仍为Close，不当作稳定结果 |
| 键盘商户筛选 | 聚焦users所属商户→Enter打开、输入Acme触发服务端q搜索，ArrowDown/Enter选中；URL同时写merchant/tenant12，返回2行 |

已核验保存截图：`.local-tests/partner-usage-1117/final-usage-admin-mobile.png`、`final-users-big-id-mobile.png`、`final-usage-root-big-mobile.png`、`final-users-keyboard-mobile.png`。截图由浏览器工具 verified，未删除。浏览器 `ptusage-1117-e2e` 已关闭；fixture server容器停止（未移除），3392无监听。数据库、schema、卷、旧截图保留。

未做生产或真实上游HTTP relay；无屏幕阅读器审计。历史假API的503/CNY不可用前端证据仍仅前端证据；实际backend错误/配置降级由Go suites证明。

## 3. 前端最终复验（本轮已执行）

- `bun run test -- src/features/partner-usage-logs src/features/users src/features/usage-logs src/features/partner-oauth-clients`：rc=0，**48 files / 657 tests passed**。
- `bun run typecheck`：rc=0；`bun run build:check`：rc=0。
- `bun run lint`：rc=1，**151 errors / 68 warnings**，与改动前既有基线完全一致；本任务触碰TS/TSX的定向oxlint/oxfmt --check均rc=0。未修全仓无关问题。
- `bun run i18n:sync`：rc=0；没有编辑locale、没有新增文案或依赖/lockfile变化。原39新键的七语言locale/DOM断言仍通过。
- 构建输出过长自动落地 `/var/folders/h7/1s08hdn51x778k3dtg4ytt140000gn/T/pi-bash-476107e46b6de1df.log`，已登记，非秘密，待用户同意后清理。

## 4. 最终后端补齐与独立检查

实施新增6个Usage顶层，最初69顶层/125子测试，生产业务源码0改；前三轮仅新测试编译/SQL捕获/EXPLAIN文本假设失败，修正已写入。workflow `c73e56fa-5814-4f9f-91c3-129082760722` 因主会话把子返回值`ok`误写成`status`判断，implementation成功交接后提前结束，**没有自动启动check**。已显式续接独立check `01db93c6-ebb6-49f2-803e-37b70f0ef74d`，补强3个self-stat子测试及真实执行链/admin bind/CH完整过滤，**最终两轮每轮69顶层/128子测试、0失败/skip、rc=0**。报告摘要持久化于日志child `quality-review.final.md`，完整权威managed报告含全部122个保留schema名称；主会话读日志核对每轮计数、6文件SHA与只读导出一致。门禁已关闭，没有以静态检查冒充通过。

### 4.1 CNY / 分类 / 前组 / 既有SubscriptionKey实际联合复验

runner `ptusage-1117-go-final-integration`，rc=0；同一内部fixture数据库但每个用例新建唯一schema，各DSN显式指向该fixture（无密码、无生产）：

```bash
go test ./model ./controller ./router ./middleware ./service \
  -run '^TestPartnerTenant(QuotaCNY|UserClassification|AccessMode|AuthorizationAudit|SubscriptionKey)' \
  -count=1 -v -timeout 20m
```

**46顶层通过、45子测试通过、0失败、0skip**，所有包ok。CNY15、分类7、接入方式11、授权审计9、SubscriptionKey4。新建保留34schema：CNY3、分类3、模式13、审计13、SubscriptionKey2。新增/历史模式必须分别报告，不把前组整个任务擅自归档。

`SubscriptionKeyPostgres` 既有fixture在自己新schema中DropColumn模拟旧版本再重复迁移，审核后执行，未DROP/TRUNCATE任何既有schema或资源；其quota/renewal/rotation/terminal/并发锁回归与HTTP旧字段断言全部通过。

### 4.2 验收矩阵当前证据

| 验收 | 证据 |
| --- | --- |
| AC1 | C1/C2三writer、真实服务text/audio/realtime/task/fee/error、zero/suppression/ordinary不误分流；最终分库/结算真实故障已独立69/128通过 |
| AC2 | pq list/count/stat同filter/role projection + 本轮真实backend浏览器同范围/跨页/两页同归属 |
| AC3 | 15 CNY + 4旧SubscriptionKey，旧字段/精度/终态/无限额/配置降级/锁和审计；日志consumer同converter |
| AC4 | 7分类/22子测试，model过滤组合/排序跨页/批量enrichment与真实路由；657前端回归+browser URL/类别/大ID/键盘/mobile |
| AC5 | shared/separate首次/重复迁移/索引/持久化，旧logs不搬迁；本轮browser默认历史保留/范围提示；实际SQL+bind EXPLAIN独立通过（小样本、非容量证明） |
| AC6 | C1/C2逐消费全站feed恰1；零消费/error原规则；实际默认页排除新行；分库结算故障feed保持一次已独立通过 |
| AC7 | 6读者的pq兼容/同ID/去重/跨日/stream取消/伪参；token真实路由伪参与13个读者logger故障子测试独立通过 |
| AC8 | pq真实SetApiRouter匿名/普通/admin/root/PAT/desktop gates与字段白名单；真member session拒绝已独立通过；browser普通0次admin请求/root-only403 |

### 4.3 完整旧回归最终对照

- 初次尝试按历史顶层名字构造巨型选择器不适合作为整套证据：字符串包含旧SubscriptionKey/AccessMode名字，意外触发TestMain的PG旁路，model未bootstrap导致nil DB panic；改变选择集合也触发一个websocket余额假设失败。该轮`runtime-final-legacy.log`**保留但不采作业务回归结论**，未改任何业务或旧断言。
- 随后按原方式**无selector、无DSN**重跑全部6包（model/controller/router/middleware/service/relay/...），runner `ptusage-1117-go-final-legacy-r2`：rc=1，**2007顶层通过、70失败、21跳过**。70失败中69项是明确要求DSN而当前未设置的PG测试；唯一非PG失败为基线已存在 `TestImmediateTaskSettlementDatabase`（夹具缺`partner_tenant_accounts`）。
- 与`b1929bdda`的`runtime-legacy-base.log`+`runtime-legacy-base-relay.log`对照：**基线通过的全部用例在当前没有新增失败；跳过集合逐名完全相同**。没有把新增PG无DSN失败当通过；它们分别在显式DSN套件已实际通过。
- 最后cached Go1.26.10离线 `go build ./...` / `go vet`五包 / gofmt / `git diff --check` rc0。未宿主go test、无依赖或lockfile变化；sanctioned i18n writer幂等执行7语言各0改动，语法/定向lint通过。

**父AC1–AC8本地隔离验收完成。用户在核对测试与未上线边界后回复“好”并要求“继续”，已按批准范围完成工作提交`b5c9dee36`与文档提交`3b41b3e13`；2026-11-18经官方task.py archive将三个child及父归档至`archive/2026-11/`，四份task.json均completed，当前任务指针已清空。归档/journal以其后独立提交保存。没有推送、部署或清理，不声称整仓所有测试绿色。**

## 5. 交付边界

最终联合复验34个新schema（仅内部fixture，均保留不删）：

```text
pt_access_mode_http_1794937059600463263
pt_access_mode_http_1794937059695526263
pt_access_mode_http_1794937059764993555
pt_access_mode_http_1794937059848955055
pt_access_mode_http_1794937059895932055
pt_access_mode_http_1794937059969511597
pt_access_mode_http_1794937060024781680
pt_access_mode_model_1794937059685243138
pt_access_mode_model_1794937059695631347
pt_access_mode_model_1794937059895236055
pt_access_mode_model_1794937060062257139
pt_access_mode_model_1794937060174730514
pt_access_mode_router_1794937060696324375
pt_authorization_audit_admin_1794937060651131416
pt_authorization_audit_body_1794937059403592680
pt_authorization_audit_body_1794937059463124513
pt_authorization_audit_body_1794937059524999638
pt_authorization_audit_business_1794937059285801513
pt_authorization_audit_events_1794937059287966597
pt_authorization_audit_http_1794937059166999930
pt_authorization_audit_log_1794937059127810305
pt_authorization_audit_main_1794937059123898388
pt_authorization_audit_rate_1794937059278311847
pt_authorization_audit_recovery_1794937059539496555
pt_authorization_audit_recovery_log_1794937059541647930
pt_authorization_audit_router_1794937060629858166
pt_quota_cny_catalog_1794937060313812722
pt_quota_cny_hosted_1794937060215886055
pt_quota_cny_independent_1794937060079496722
pt_subkey_http_1794937060384332208
pt_subkey_model_1794937060289473889
pt_user_class_http_1794937060473158416
pt_user_class_model_1794937061047750625
pt_user_class_router_1794937060706506375
```

- H5 usable仅额度层面；task/fee缺subscription_id事实时不伪造；两项是批准合同内的已披露限制，不扩大范围。
- 日志best-effort漏记窗口、普通用户归属查询增加主库依赖、滚动发布无原子切换、统计整窗扫描/union无topN、MySQL collation/liveCH不验收、其他两个report只读旧表，均保留spec说明。
- 不以源码构建/单元测试宣称生产已部署。新表SQL清理/outbox/历史迁移不在首版范围。
- 最终提交按明确路径包含规范和Trellis记录；私钥/reports/Demo/旧脚本/临时文件不纳入。脚本`web/scripts/partner-usage-isolation/add-missing-keys.mjs`是此前本组业务工具，已按用户批准计划与6个Go测试一并提交`b5c9dee36`。
- 清理必须征得用户同意，Trellis不清理；server已停止、其他保留资源不擅删。
