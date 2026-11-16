# 父任务集成验证记录 — 商户用量隔离

本文件只记录真实执行过的命令和结果。未列出的验证即未运行。子任务证据在各自 `verification.md`。

## 0. 批准与基线（2026-11-17 续接会话）

- 用户明确批准规划提交 `e61eb6533` + `b1929bdda` 的实施范围；禁区：生产访问、真实付款/模型消费、部署、推送、破坏性操作、清理既有文件、自行启动/重启 Docker 引擎。记录于 `prd.md`“授权与阶段”。
- 起始 HEAD `b1929bdda`，分支 `feat/partner-accounts`。`git diff --stat 03008c73a..HEAD` 仅 27 个 Trellis 规划文件，研究基线之后没有业务源码变化；`research/current-boundaries.md` 的写入口/读取/迁移锚点（`model/log.go:100,279,340,427,530,596,620,668,696,711,738`、`model/main.go:236,329,443,456`）逐一核对仍匹配。
- 写入口普查补充：`controller/channel-test.go:570`、`controller/iq_executor.go:221` 也调用 `model.RecordConsumeLog`，原 census 未列出。二者经模型层三入口分流自然覆盖，不需要调用点改动；归属仍只由已鉴权 user_id 的 Tenant 映射决定。交由 usage-logs C 阶段复核。
- 工作区起始仅有既有未跟踪项（私钥、reports、Demo、三份临时清单、两个前组 i18n 脚本目录），全部保留、不读取秘密、不暂存。

## 1. 运行环境实测（不是历史结论）

| 项 | 2026-11-17 03:3x CST 实测 |
| --- | --- |
| Docker CLI | `/usr/local/bin/docker` 28.2.2 存在 |
| Docker daemon | **不可连接**：`desktop-linux` 与 `default` 两个 context 均 `Cannot connect to the Docker daemon`；`~/.docker/run/` 无 socket，`/var/run/docker.sock` 不存在，无 Docker/colima/orbstack/podman 进程。`/Applications/Docker.app` 已安装但未运行 |
| 本会话对引擎的操作 | 仅探测；未启动/重启/切换引擎，未创建任何容器/网络/卷/schema |
| 结论 | Go 测试与 PostgreSQL 迁移/持久化验证**当前阻塞**。不使用宿主机 `go test`、SQLite/MySQL 或生产库替代 |

每个阶段检查点重新探测 Docker；可用后先登记确切资源名再创建。

## 2. 基线检查（改动前）

| 检查 | 命令 | 真实结果 | 证据边界 |
| --- | --- | --- | --- |
| Go 离线编译 | 缓存工具链 go1.26.10，`GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOFLAGS=-mod=readonly go build ./model ./controller ./router ./middleware ./service ./relay/...` | exit 0 | 宿主机**仅编译**，不是运行验收 |
| Go 离线 vet | 同环境 `go vet ./model ./controller ./router ./middleware ./service` | exit 0，0 行输出 | vet 会类型检查 `_test.go`，但**没有执行任何测试** |
| 前端类型 | `bun run typecheck` | exit 0 | — |
| 前端目标测试 | `bun run test -- src/features/usage-logs src/features/users src/features/partner-tenants src/features/partner-oauth-clients` | 45 文件 / 610 测试通过，exit 0 | DOM 测试，非后端证据 |
| 前端全站 lint | `bun run lint` | **exit 1，151 errors / 68 warnings（改动前既有基线）** | 不是绿色门禁；本组只保证触碰文件定向干净，不顺手修全仓 |

说明：首次尝试用 homebrew go 1.24.4 + `GOTOOLCHAIN=local` 时 go 拒绝运行（go.mod 要求 1.26.10），该次**没有编译**；随后改用模块缓存内的 1.26.10 工具链得到上表结果。首次命令打印的 `exit=0` 标签取自管道末端，属于错误读数，已作废不引用。

Go 测试执行数：**0**（宿主机禁止 `go test`，Docker 不可用）。skip 数未测。

## 3. 前组（11-13 接入方式 + 授权审计）遗留门禁现状

- 已读取 `../11-13-partner-access-mode-audit/verification.md` 与两个子任务 `verification.md`。前组结论仍是 source-review-ready / runtime-blocked：9 个 AuthorizationAudit + 11 个 AccessMode 顶层 Go 测试源码当时编译/执行均为 0。
- 本会话新增的**唯一**前组证据：上表 `go build` / `go vet` 在当前 HEAD exit 0，说明前组业务源码与这 20 个测试源码在 go1.26.10 下**可通过类型检查**。这不是运行通过：pq fresh/upgrade/repeat 迁移、行锁、真实路由鉴权、LOG_DB 持久化与故障隔离仍为 0 执行。
- 不重新实现前组功能，不把其标记为已验收。受本组改动影响的模式隔离/凭证查询/审计/共享迁移断言，待 Docker 可用后在任务自有 runner 中补跑，新旧证据分开登记。

## 3a. 子任务阶段进度（只记真实状态）

| 交付 | 状态 | 证据 | 未完成 |
| --- | --- | --- | --- |
| usage-logs A（安全 owner / 批量 owner / 安全 options / 两个入口） | **source-ready / runtime-blocked** | 实现 + 一轮独立 trellis-check；主会话独立复核：`gofmt -l` 无输出、离线 `go build` rc=0、离线 `go vet` rc=0（含 10 个 `TestPartnerTenantUsage*` 测试源码的类型检查）、`git diff --check` rc=0、无暂存、lockfile 未变 | **Go 测试执行 0**；pq 上的实际 SQL、真实路由鉴权/PAT 矩阵、路由注册不 panic 均未运行 |
| usage-logs B / C / D | 未开始 | — | C（切写）在 B 的迁移与兼容 reader 经 pq 验证前不得启用 |
| quota-cny（转换器、三个入口 additive `quota_cny`、文档/OpenAPI、15 个测试源码） | **source-ready / runtime-blocked** | 实现代理中途结束、未交接（仅返回一句话，记录为事实）；随后一轮独立 trellis-check 补齐审阅与记录。主会话独立复核（06:08 CST）：`gofmt -l` 无输出、离线 `go build` rc=0、离线 `go vet` rc=0、`git diff --check` rc=0、无暂存、`model/` 仅测试文件变化；主会话自行以拒绝重复键方式解析 OpenAPI，103 处本地 `$ref` 全部可解析；主会话读源码确认嵌入类型无自定义 `MarshalJSON`、`DivRound`（decimal.go:641-670）为半入远离零。检查代理**执行**了测试 oracle 的精确有理数复算（60 个期望 0 不一致）与文档检查（最终 rc=0） | **Go 测试执行 0**（15 个 `TestPartnerTenantQuotaCNY*`：service 9 / controller 4 / model 2，仅类型检查）。A-C1/A-C2/A-C3/A-C5 无运行证据；仅 A-C4（文档）有执行证据 |
| user-classification | 未开始 | — | 仅依赖 A 契约 |

A 阶段冻结的共享签名见 `../11-17-partner-usage-logs/verification.md`“A 阶段交接”；审阅记录见 `../11-17-partner-usage-logs/quality-review.stage-a.md`。A 的 source-ready 只表示其他子任务可以消费该契约，不是 usage-logs 的验收。

Docker 复测：04:16、04:53 CST 均不可连接。

### quota-cny 的一项语义决定（F1，已按已批准契约处理，需向用户披露）

- 独立查询 `GET /api/partner/subscription` 的 `quota_cny.usable` 复制模型已有的 `quota_usable` 事实。
- 托管 H5 额度入口的旧 DTO 没有 usable 字段。`quota_cny.usable` 由该入口**已有的**原始事实计算：`active && (unlimited || remaining > 0)`，不是由金额推断，也没有新增读取。
- 两个入口公式相同、前置条件不同：独立查询在用户被禁用、模型 Key 被禁用/过期、分组变更或存量 used 为负时直接返回 403/409，不输出布尔值；H5 入口历来只校验商户密钥、模式与账号启用，这些状态下仍返回 200，此时 `usable` 只表示“额度层面可用”，不保证模型调用一定成功。这一差异是两个入口既有的鉴权范围差异，不是本次引入的。
- 主会话决定：保持已批准契约（H5 item 含 `usable`、H5 不扩大读取），文档已如实写明其适用范围。改为“H5 不输出 usable”或“H5 增加用户/Key 校验读取”都属于契约/范围变更，未做；若用户希望调整，需先更新规划。

Docker 复测：05:55、06:08 CST 仍不可连接。

## 3b. 读取方普查补充（规划 census 之外，新发现）

规划的读取矩阵只覆盖：默认管理员 list/stat/export、商户管理员页、self 列表/统计/请求结果/汇总/导出、API Key 最近记录、全站仪表盘。源码中另有两个按 user_id 直接读 `logs` 的读取方：

- `model/cashback_refund_report.go:108`（`GetCashbackRecordedSpendReport`，管理员返现 recorded-spend 报告）：按用户、按充值区间汇总 `logs` 的 consume。
- `model/partner_account.go:1068`（`ListPartnerAccountUsage`，Partner Server 子账号用量 API）：属于另一套 PartnerAccount 身份。

处理：二者都不在已批准的 union 读取矩阵内，按“默认管理员读取不 union 新表”的已批准原则**保持不改**。切写之后，Tenant 用户的新消费不会出现在这两个读取方里。Tenant 成员为 subscription-only、不走钱包充值返现，Partner Server 子账号与 Tenant 账号是两套各自建号的身份，实际重叠概率很低，但这是**已知限制，需在最终报告中向用户披露**；若用户要求纳入，属于范围变更，需先更新规划。

## 3c. 需披露的过程偏差

- A 阶段实现代理执行过以仓库根为起点的递归 `grep -r`，grep 进程遍历了 `.local-tests/`、`reports/` 等目录。一次未过滤的结果打印了 `.local-tests/` 源码导出副本中的一行（与 `router/api-router.go:275` 相同，不含凭证）；另一次带 `*.json/*.ts/*.tsx` 过滤的扫描可能打开过 `reports/` 下的同类文件，但没有输出任何内容或文件名。私钥文件与两份受保护清单未被打开，没有文件被修改或暂存。主会话早先的一次 `grep -r --include='*.go' .` 同样打印过 `.local-tests/` 导出副本中的 Go 源码行（无凭证）。此后所有检索限定为 `git grep` 或显式源码目录。
- 基线阶段主会话创建并在同一命令中删除了两个 `/tmp` 输出捕获文件（内容为空的编译输出），未预先登记；已在 `TEMPORARY_ARTIFACTS.md` 披露，之后改用 shell 变量捕获。

## 4. 父级 AC1–AC8 证据映射

尚无子任务完成；本节在最终集成验收时填写。当前全部为未验收。
