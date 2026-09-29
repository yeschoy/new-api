# v1.0.0-rc.40 真实版本三库升级验证（2026-09-30）

## 隔离范围与来源

- 源版本：`git rev-parse v1.0.0-rc.40` → `0aec08fee811ec6136828fda790551b49e410301`；目标工作树 `git rev-parse HEAD` → `4f6b215c5a2f8c774d1483cb43d733b8bb394f78`（包含本任务尚未提交的产品修改）。
- `git archive v1.0.0-rc.40 | tar -x -C /tmp/cashback-rc40-upgrade-20260929195356`。脚本 `/tmp/cashback-rc40-upgrade-20260929195356/upgrade_probe.go`、`current_cashback_index_probe.go`；完整逐次输出在同目录 `release-*.log`、`baseline-mysql.log`、`upgrade-1-*.log`、`upgrade-2-*.log`、`index-*.log`。没有停止服务、删除表/库/schema 或清理临时文件。
- 独占新建的数据库：MySQL `cashback_rc40_upgrade_20260929195356`（本机 root unix socket `/tmp/mysql.sock`，utf8mb4）、PostgreSQL 同名数据库（本机用户 `lyh_god`，unix socket `/tmp`），SQLite 独立文件 `/tmp/cashback-rc40-upgrade-20260929195356/upgrade.db`。仅对这些全新库及文件执行写操作；探针拒绝非该名字的 DSN。没有使用原有 `cashback_test_run` 或业务库。
- 实际运行时数据库版本：SQLite Go 驱动 `SELECT sqlite_version()` = **3.50.4**（系统 `/usr/bin/sqlite3` CLI 为 3.43.2，不能代表 Go 运行时）；MySQL `SELECT VERSION()` = **8.0.46**；PostgreSQL `SHOW server_version` = **16.15 (Homebrew)**。没有验证最低支持版本 MySQL 5.7.8 / PostgreSQL 9.6。

## 精确复现命令

在当前仓库执行：

```bash
stamp=20260929195356
root=/tmp/cashback-rc40-upgrade-$stamp
mkdir "$root"
git archive v1.0.0-rc.40 | tar -x -C "$root"
mysql -uroot -e "CREATE DATABASE cashback_rc40_upgrade_$stamp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
createdb "cashback_rc40_upgrade_$stamp"
# 升级探针文件的持久位置见上文。脚本设置 common.IsMasterNode=true，调用 model.InitDB()，
# SQLite 设置 common.SQLitePath 为 $root/upgrade.db（附生产 busy_timeout/WAL/_txlock pragma）。
# 通过 release 源代码编译运行，使旧版实际启动迁移创建 schema 并插入代表数据：
cd "$root"
UPGRADE_ENGINE=sqlite UPGRADE_PHASE=release SQL_DSN=local GOWORK=off go run "$root/upgrade_probe.go" > "$root/release-sqlite.log" 2>&1
UPGRADE_ENGINE=mysql UPGRADE_PHASE=release SQL_DSN="root@unix(/tmp/mysql.sock)/cashback_rc40_upgrade_$stamp?parseTime=true" GOWORK=off go run "$root/upgrade_probe.go" > "$root/release-mysql.log" 2>&1
UPGRADE_ENGINE=postgres UPGRADE_PHASE=release SQL_DSN="postgres:///cashback_rc40_upgrade_$stamp?host=/tmp&sslmode=disable" GOWORK=off go run "$root/upgrade_probe.go" > "$root/release-postgres.log" 2>&1
# MySQL 第一遍旧版启动及数据种子成功，但原探针随后使用未转义的 WHERE key = ? 查询，
# 导致探针失败（非产品迁移失败）。修正探针为 GORM 条件后，用已种的旧库重启并验证：
UPGRADE_ENGINE=mysql UPGRADE_PHASE=baseline SQL_DSN="root@unix(/tmp/mysql.sock)/cashback_rc40_upgrade_$stamp?parseTime=true" GOWORK=off go run "$root/upgrade_probe.go" > "$root/baseline-mysql.log" 2>&1
# 返回当前仓库根目录，下面每一轮、每个引擎均运行同一条 go run（记录到 upgrade-1/2-*.log）：
for round in 1 2; do
  for engine in sqlite mysql postgres; do
    case "$engine" in
      sqlite) dsn=local;;
      mysql) dsn="root@unix(/tmp/mysql.sock)/cashback_rc40_upgrade_$stamp?parseTime=true";;
      postgres) dsn="postgres:///cashback_rc40_upgrade_$stamp?host=/tmp&sslmode=disable";;
    esac
    UPGRADE_ENGINE="$engine" UPGRADE_PHASE=upgrade SQL_DSN="$dsn" GOWORK=off go run "$root/upgrade_probe.go" > "$root/upgrade-$round-$engine.log" 2>&1
  done
done
# 另对升级后的新返现索引、复合唯一约束、旧比例字段语义执行探针；
# UPGRADE_ENGINE 和 SQL_DSN 仍沿用上述 case，命令逐一如下：
UPGRADE_ENGINE=sqlite SQL_DSN=local GOWORK=off go run "$root/current_cashback_index_probe.go" > "$root/index-sqlite.log" 2>&1
UPGRADE_ENGINE=mysql SQL_DSN="root@unix(/tmp/mysql.sock)/cashback_rc40_upgrade_$stamp?parseTime=true" GOWORK=off go run "$root/current_cashback_index_probe.go" > "$root/index-mysql.log" 2>&1
UPGRADE_ENGINE=postgres SQL_DSN="postgres:///cashback_rc40_upgrade_$stamp?host=/tmp&sslmode=disable" GOWORK=off go run "$root/current_cashback_index_probe.go" > "$root/index-postgres.log" 2>&1
```

## 结果与边界

- 旧版 `InitDB` 创建三库 schema，代表数据：邀请人/充值人及关联与原钱包额度、两条 Option、Stripe 未付款 `TopUp`（面额 250/实付 2.5）。旧版没有 `CashbackOrderContext` / `CashbackReward` 模型或表，**不能**声称从正式版迁移了历史返现奖励。旧版三库数据查询、原 `users.username` / `top_ups.trade_no` / `options.key` 实际重复 INSERT 拒绝均通过。MySQL 第一轮脚本的保留字错误已更正并通过旧版重新启动复验。
- 当前版本对以上真实 release 数据执行第一次及第二次 `InitDB`：三库各 **PASS**；原邀请关系、钱包额度、订单面额/价/状态、Option 值和三种旧唯一约束均仍在；新增返现侧表及 `face_amount`、`quota_per_face_unit`、`strategy`、`fixed_per_hundred` 均存在。重复迁移未自动回填无证据的旧订单、未捏造返现奖励/上下文。主库 `users` 四个额度列在 MySQL/Postgres 为 bigint，满足已有启动守卫。
- 后续当前版探针均 **PASS**：新 context `top_up_id` 唯一索引、reward `(top_up_id,direction)` 唯一索引、结算扫描索引存在；实际重复 INSERT 被三库拒绝；旧未付款订单在迁移后没有凭空出现面额快照；手动创建的空 strategy / `fixed_per_hundred=0` 比例奖励可读且 `rate_bps=1000`、额度保持 25。这一步的测试数据只写到前述隔离库。探针最初使用错误的默认索引名及未显式设置奖励状态，分别修正后通过，非产品问题。
- 与已有 `TestCashbackProductionDatabaseIntegration` 的 fresh + 模拟旧分支迁移互补：本次证明真实正式版升级；该正式版尚未包含返现侧表，因此旧返现侧表增列/历史奖励兼容仍只能由模拟旧分支和现有行为测试覆盖，不冒充正式版数据。MySQL/PostgreSQL 当前版本的回调/计提集成测试由主会话先前实跑 PASS；本探针不重复运行该会自动 DropTable/Drop Schema 的测试，以遵守此次禁止清理测试库的要求。
