# 执行计划：无外部用户 ID 的订阅 Key 接入（重规划中）

## 1. 状态与启动门禁

- [x] 用户允许创建任务；已取证现有 pt_、付费订单、收银台、交付、账户及专属套餐配置。
- [x] 已确认：商户交付、同订阅续费沿用 Key、到期历史查询不取 Coding Key、商户重置 Key、每商户多份专属套餐 A、下单返回付款 URL。
- [x] 最新用户明确：商户下单**不传 external_user_id**。前版依赖该字段识别买家/复用账户的实施步骤已撤回，旧代码事实不等于新需求。
- [x] 仅必要测试、数据库只验证 PostgreSQL（pq）；不运行 SQLite、MySQL/FoundRows 或无关全量套件。
- [x] 源码级评估完全不新增 users 的可行性，证据与所需主体/鉴权/计费/RPM/日志适配见 research/userless-feasibility.md；本轮未运行代码测试。
- [x] 用户选择自动新增内部 User，放弃无 users 主体改造；要求“下单成功”之后才新增，商户仍不传 external_user_id。
- [x] 用户选择 A：可信付款成功后，首次新购才在交付事务新增 User；创建订单/返回 URL 不开户，失败回滚本地交付并保留 paid。
- [ ] 收敛续费显式定位，不按商户/套餐猜测买家；建议商户带原订阅 Key 指定原订阅。
- [ ] 按该决定收敛 PRD R1–R13 / AC1–AC14，完成新旧订单模式、内部账户关联和新增入口设计，检查无商户 external_user_id 依赖残留。
- [ ] 再验证 implement/check 上下文清单，向用户呈现最新版最终摘要并等待后续明确批准。
- [ ] 获批后读取执行阶段指引和 trellis-before-dev，再 task.py start；此前不改业务代码、不运行代码测试、不派实施子代理。

仍在一个端到端任务规划中。未来如按适用项目流程委派，先读取 task.py current，所有子代理提示第一行必须为 `Active task: <实际任务路径>`；无适用授权不启动额外并行代理，同 cwd 同时只有一个写入者。

## 2. 重新收敛技术设计所需工作（不是实施授权）

1. **新旧接入区分**：旧 POST /api/partner/v1/subscription-orders 与 H5 要求 external_user_id，保留原契约；新无身份方式应有明确新入口/模式，不把旧客户端漏字段错误静默解释为新购。
2. **新购意图**：请求由 pt_ 鉴权，业务字段至少 plan_id/payment_method，Idempotency-Key 表示购买意图，不能当作人。响应 order_no + checkout_url，无长期 Key。
3. **新购调用主体**：已选择真实内部 User/Token，仅在可信付款成功后的交付事务创建。新购 User/Token/订阅/sub_ 与 fulfilled 一起原子提交，交付失败整体回滚但保留先行提交的 paid；同订单恢复不重复创建。不实施无 users 新 principal/funding/RPM/日志体系，不用用户 0/共享用户伪装。
4. **续费目标**：建议用原订阅 Key 显式定位原订阅并复用原账户/Key；同商户+同套餐不足以识别续费。明确相关请求摘要、权限、快照与锁序。
5. **支付复用**：继续使用独立支付事实、准确金额/币种/签名、初始订单 deadline、现有收银台和 paid-unfulfilled 恢复；首次交付内部账户/Token/订阅/sub_ 和 fulfilled 标记原子提交。
6. **独立查询**：只带 sub_，无 pt_/商户 ID/Cookie/外部用户 ID。按该 Key 的实际订阅和内部账户读取最新额度/Token；不调用旧 Provision API 去“读取”，不复制存储 Coding Key。
7. **商户领取/重置**：按当前商户和订单/订阅归属，不要求平台识别买家；商户本地保存购买意图并交付。轮换幂等和 expected_version 保留，旧 sub_ 后续请求无效，不更换 Coding API Key。
8. **精确 DTO 与终态**：活跃周期复用既有重置逻辑，额度用精确十进制字符串；到期不返回 api_key，历史余额不表示可消费；坏映射/禁用/错组/过期凭证 fail closed，不自动补发。
9. **专属套餐 A**：复用 root 套餐管理、PartnerTenantId 单归属和 dedicated group；目录与新购/续费选择必须按当前商户允许范围。无共享授权表或重复 UI。
10. **范围复核**：原“今后所有旧订单交付都签发 sub_”方案撤回；新凭证仅来自新模式真实支付。旧订单/账户/H5 不迁移、不暗中改绑，不回归免费直授。

## 3. 获批后实施顺序（详细文件/事务清单待上述决定收敛）

- [ ] 复查 git status 与已有用户文档差异；不覆盖 docs/partner-tenant-integration.zh-CN.md，不读取/暂存未跟踪私钥。
- [ ] 新增/扩展新模式订单及内部身份关联，增量迁移；保留旧订单索引/请求摘要与外部用户映射。先检索所有同名 Symbol 和相关 AutoMigrate fixture。
- [ ] 在模型层实现用途分离 sub_ 种子/哈希/版本、真实支付交付、新购与续费隔离和同幂等重试；模型 Key 仍以现有 Token 记录为单一来源。
- [ ] 新商户写请求在 actual transaction/锁内重新核对开发者密钥与资源状态；新查询在锁后复核当前 sub_ 和严格 DB 时钟，防慢 body/锁等待绕过到期或轮换。
- [ ] 实现新下单、商户查单/领取、sub_ 独立查询、商户重置路由与最小 DTO；拒绝 query 秘密和未知/重复/大小写别名字段，设置 no-store/no-referrer、请求 ID、限流与安全错误。
- [ ] 更新接入文档，突出“无 external_user_id 下单 → checkout_url → 付款交付 → 商户领取 sub_ → 用户只凭 sub_ 查询”；明确内部账户关系，不能继续要求商户稳定用户 ID。
- [ ] 按 trellis-update-spec 保存最终真实合同；按 trellis-check 仅做本次必要核对，记录运行命令和未验证项到任务 verification.md。
- [ ] 相关代码/文档/Trellis 文件按明确路径提交；不 git add .、不 force add 整个忽略目录，不 push 或部署。npm/pnpm 缓存/诊断记录保持忽略。

可复用点：pt_ Bearer、专属套餐配置、严格 DB 时钟、支付验证/准备、收银台 URL/capability、订阅周期重置、现有模型 Token 校验、统一错误与限流。新购身份、订单模式及交付关联必须重新设计，不能因为可复用某 helper 就沿用其不符合新需求的 external_user_id 前提。

## 4. 最小必要验证（仅获批实施后执行）

### 4.1 静态检查

```bash
python3 ./.trellis/scripts/task.py validate .trellis/tasks/11-12-partner-subscription-access-key
git diff --check
# 实施后仅对实际修改的 Go 文件 gofmt，构建受影响后端包：
go build ./model ./controller ./router
```

规划阶段只做任务文档/上下文检查，不运行代码测试。若实现后生成非业务缓存/输出，记录具体位置到 TEMPORARY_ARTIFACTS.md，不新增重复登记文档。

### 4.2 PostgreSQL 定向验证

Go runner 与数据库在本任务专属 Docker；只配置隔离 pq DSN，不用生产/宿主 DB，不调用原 SQLite fixture 或多数据库矩阵。必要新增用例统一带 SubscriptionKey，实际命名与配置在实施期核对：

```bash
docker info
docker exec "$TASK_GO_RUNNER" go test ./model ./controller ./router -run '^TestPartnerTenant.*SubscriptionKey.*$' -count=1 -v
```

一次覆盖本次必要边界，避免重复跑：

- 不传 external_user_id 的新购成功及 checkout_url；新旧 API 互不改变身份契约。
- 创建订单/返回付款 URL、未付、准备失败、支付失败/未付超时和伪造通知均不增加 users；首次可信支付交付成功只新增一个用户（保留可信迟付交付）。注入本地交付失败时用户/凭证/订阅整体回滚但 paid 保留；同订单恢复成功、重复通知及续费不重复开户。不测试已放弃的无 users 候选方案。
- 同购买意图幂等重试、不同新购不因同商户/同套餐误合并，续费明确定位原订阅及同 Key 保留（待产品决定确认）。
- 专属套餐 root 配置 → 商户目录 → 正常下单；跨商户/平台/停用套餐不能伪造 plan_id 绕过。
- 未支付无凭证；可信支付下内部账户/Token/订阅/sub_ 原子交付；重复通知/恢复不重复开户或延期，失败保留 paid。
- sub_ 独立查询、额度周期/无限额/耗尽/int64 精度、到期历史不取 api_key、映射损坏/禁用/错组拒绝、不在 DTO/日志泄露。
- 商户领取/重置归属、旧 Key 失效、轮换幂等/版本冲突及关键并发；无 sub_ 轮换顺带更换 Coding API Key。
- 严格时钟与锁后当前凭证验证；真实 pq fresh/增量/重复迁移与持久化，旧数据保持。

不跑全站、无关前端、计费算法或完整旧订单矩阵。race 仅新进程共享状态/具体竞态风险时定向补跑。确认实际执行目标测试，no tests to run、skip、build 或静态检查不能当作 runtime 通过。必需 Docker/pq 不可用时如实报告，不用其他数据库替代。

## 5. 资源、兼容与回滚

- 测试网络/容器/空数据库/输出预先登记 TEMPORARY_ARTIFACTS.md；不清理已有 reports/examples/私钥/既有临时文档，任务结束后经用户同意再清理新增非业务产物，Trellis 记录保留。
- 重试要求空库时用另一个任务专属空数据库，不为通过测试清空未知数据。没有服务安装、生产 DDL 或真实付款权限。
- 保留所有订单和可信支付事实；回滚不 drop 新表、不删订单/账户/权益。新接口依赖对应应用版本，回滚需告知接入方。
- 若设计再次涉及买家页面、Coding API Key 轮换、旧数据补签/改绑或消费隔离扩展，回到规划，不把任何局部答复当作新版最终计划批准。
