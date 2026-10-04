# 2026-10-02 返现逐项审核策略：隔离数据库验证

## 环境与隔离

- Docker Desktop engine 28.2.2；常规 Docker socket 的容器启动和 exec 正常，无需 raw-socket fallback。全部数据库及 Go/SQLite runner 均为本任务独有容器，不发布宿主端口、不使用宿主数据库。源码通过 `/src:ro` 绑定，Go cache/module cache 存在任务 volume 内。Go runner：`golang:1.25.1-bookworm`，`go version go1.25.1 linux/arm64`。
- 在真实容器内查询 `SELECT VERSION()` / `SHOW server_version`：MySQL `mysql:5.7` = **5.7.44**（amd64 仿真），`mysql:8.0` = **8.0.46**；PostgreSQL `postgres:9.6` = **9.6.24**，`postgres:16` = **16.15**。Go runner 使用 `github.com/glebarez/go-sqlite`，在同一 runner 以 `SELECT sqlite_version()` 查询得 **3.50.4**。
- 最终代码改动后、最终测试前，逐个比较所有 9 个改动 Go 文件的宿主 `shasum -a 256` 与容器内 `/src/…` 的 `sha256sum`，全部相等，无 overlay。最终校验时 `model/cashback_integration_test.go` SHA-256 `59b3a084eb599b18c4dcce19cc3c4b4603390732509e8cb530a1715a6cfa8e29`，`controller/cashback_config_test.go` SHA-256 `bc30ff753471bd791093dff199774a9854f829fa3cd11adf8ca471d47dae9dfa`；其余文件的逐个散列保存在会话命令输出。之后未再编辑 Go 代码。

## 最终命令与结果

以下命令在宿主仅调用 `docker exec`，实际 `go test` 均在任务 runner 内执行；四种 DSN 均只连任务专用容器。`-v` 日志显示 MySQL/PostgreSQL integration 子测试实际 **PASS**，均非 SKIP，包括五条支付 provider 子测试；SQLite 的 `model`/`controller` 回归由同一 Go runner 执行。

```sh
# modern：MySQL 8.0.46 / PostgreSQL 16.15
# minimum：MySQL 5.7.44 / PostgreSQL 9.6.24
for pair in modern minimum; do
  # mysql=mysql80,pg=pg16 或 mysql=mysql57,pg=pg96
  docker exec \
    -e TEST_MYSQL_DSN="root:taskpass@tcp(cashback-risk-1002-$mysql:3306)/cashback_test?charset=utf8mb4&parseTime=True&loc=Local" \
    -e TEST_POSTGRES_DSN="postgres://postgres:taskpass@cashback-risk-1002-$pg:5432/cashback_test?sslmode=disable" \
    cashback-risk-1002-go \
    go test ./setting/operation_setting ./model ./controller \
      -run '^(TestCashback|TestUpdateCashback|TestCompleteTopUp|TestOnlineTopUp|TestStripeRecharge|TestRechargeEpay|TestPublicCashback)' -count=1 -v
done
```

- **modern**：`setting/operation_setting`、`model`、`controller` 均 PASS；`TestCashbackProductionDatabaseIntegration/mysql`、`…/postgres` 均 PASS。日志 `/tmp/cashback-risk-1002-final-modern.log`。
- **minimum**：同上，两个 integration 子测试均 PASS。日志 `/tmp/cashback-risk-1002-final-minimum.log`。
- 扩展已有 integration 测试，在每个真实 MySQL/PostgreSQL 上验证：旧客户端版本更新不创建缺失策略 Option；显式保存空数组后重新读取仍为非 nil 空数组；选中 `device_missing` 后风险命中只将返现置 `pending/frozen`，已验签购买仍到账，重复支付不重复建奖励；非法重复配置不改变版本/已选 Option；后续改策略不修改旧奖励审核及风险/配置快照。原有 fresh/repeated AutoMigrate、旧表模拟升级两次和多支付路径断言仍执行。**本任务无表结构迁移**；旧表模拟不等于来自最新发布版的真实生产库升级，因此不把它冒称为发布版升级验证。
- `docker exec -w /src/relaykit cashback-risk-1002-go sh -c 'GOWORK=off go test ./...'`：PASS；日志 `/tmp/cashback-risk-1002-relaykit.log`。
- `git diff --check` 无输出，改动 Go 文件 `gofmt -l` 无输出。

## 全范围结果与已知阻碍

尝试在任务 runner 内执行 `make test`（MySQL 8.0 / PostgreSQL 16）：首次以 bridge 容器 DNS 为 DSN 时，其他模块的测试夹具只允许 loopback DSN，且 migration 测试要求 PostgreSQL URL DSN，故这些非返现测试失败；该次不作为全范围结果。随后额外创建本任务的 loopback-sidecar MySQL/PostgreSQL（与 runner 共享网络命名空间，不映射宿主端口），用 `127.0.0.1` 和 PostgreSQL URL 重新执行 `make test`：**controller、model 及其他根模块全部包通过，但 middleware 有两个与本任务无关的认证测试失败，make 在 relaykit 前退出**。具体：`TestTryUserAuthCredentialClassification/expired_internal_access_jwt` 期望 401，实际 200；`TestHeaderNavPublicRouteRejectsExpiredInternalAccessToken` 亦失败。单独复跑 `go test ./middleware -run '^(TestTryUserAuthCredentialClassification|TestHeaderNavPublicRouteRejectsExpiredInternalAccessToken)$' -count=1 -v` 重现，未修改认证实现或声称全套通过。日志 `/tmp/cashback-risk-1002-full-loopback.log` 与 `/tmp/cashback-risk-1002-middleware.log`。

最终在 loopback sidecar 中另跑 `GOWORK=off go test -count=1` 全部根模块包（仅排除上述独立失败的 `middleware` 与需 web/dist 的 main 包）：全部 PASS，包括 controller/model；日志 `/tmp/cashback-risk-1002-final-root-except-middleware.log`。relaykit 独立 PASS 如上。**完整 `make test` 尚不通过**，认证失败需另行处理；不将其归因于返现修改，也不将三库局部验证说成全量测试通过。

## 保留待用户同意清理的资源

- Docker network：`cashback-risk-1002-net`。
- Docker containers（均未清理）：`cashback-risk-1002-probe`、`cashback-risk-1002-go`、`cashback-risk-1002-mysql57`、`cashback-risk-1002-mysql80`、`cashback-risk-1002-pg96`、`cashback-risk-1002-pg16`、`cashback-risk-1002-loop-mysql`、`cashback-risk-1002-loop-pg`。后两者与 runner 共享任务网络命名空间。
- Docker volumes（均未清理）：`cashback-risk-1002-mysql57-data`、`cashback-risk-1002-mysql80-data`、`cashback-risk-1002-pg96-data`、`cashback-risk-1002-pg16-data`、`cashback-risk-1002-loop-mysql-data`、`cashback-risk-1002-loop-pg-data`、`cashback-risk-1002-gocache`、`cashback-risk-1002-gomod`。
- 宿主 `/tmp/cashback-risk-1002-*.log` 及 runner `/tmp/cashback-risk-1002-sqlite-version.go` 保留；须经用户同意后再清理本任务资源，不碰其他容器/volume。
