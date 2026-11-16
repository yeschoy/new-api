# 验证记录 — 商户订阅额度 CNY 金额投影

本文件只记录真实执行过的命令与结果；未列出的验证即未运行。每条结论标注证据类型：

- **【执行】** 本检查会话（trellis-check，2026-11-17 约 05:40–06:1x CST）实际运行并读取了真实退出码；
- **【主会话执行】** 主会话在 05:3x CST 独立运行并转述的结果，本会话是否重复见各行；
- **【类型检查】** 仅由离线 `go build` / `go vet` 的类型检查覆盖，没有运行；
- **【源码推理】** 仅阅读源码得出，没有运行。

状态：**source-ready / runtime-blocked**。Go 测试执行数 **0**。任务未完成，不得标记为已验收。

## 0. 交接事实与环境

- 起始 HEAD `69092e8d5`，分支 `feat/partner-accounts`。本任务全部改动在工作区，未暂存、未提交。
- **实现交接缺失（事实）**：`trellis-implement` 子代理结束时没有最终报告，返回文本只有 “Now the source files.”；本文件当时是一个短骨架，`implement.md` 没有任何勾选。因此实现代理可能运行过的任何命令、结果或中间判断**都没有记录**，本文件不引用、不推断它们。骨架中曾有实现代理自述的一条 Docker 探测（05:03 CST，rc=1），本会话没有复核那次执行，不作为证据。
- 【执行】Docker：2026-11-17 05:55 CST `docker version --format '{{.Server.Version}}'` rc=1，`Cannot connect to the Docker daemon at unix:///Users/lyh_god/.docker/run/docker.sock`。本会话只探测，没有启动/重启/切换引擎，没有创建容器/网络/卷/schema/镜像。
- 结论：Go 测试与 PostgreSQL 运行验证**阻塞**。没有用宿主机 `go test`、SQLite/MySQL 或生产库替代。
- 【执行】中间产物：本会话没有创建任何运行资源、脚本文件或输出文件，也没有触发 bash 工具的溢出日志。按文件名与 mtime 列出溢出日志时（未打开内容）发现一个**此前未登记**的 `/var/folders/h7/1s08hdn51x778k3dtg4ytt140000gn/T/pi-bash-e30444f70a896fce.log`（59411 字节，mtime 05:26 CST，早于本检查会话，落在实现子代理运行时段内），已补登记到 `TEMPORARY_ARTIFACTS.md`，未读取、未删除。

## 1. 文件清单

| 文件 | 性质 | 说明 |
| --- | --- | --- |
| `service/partner_tenant_quota_cny.go` | 新增 | 纯转换器、配置快照、三种投影 DTO；无数据库/秘密/外部 I/O |
| `controller/partner_tenant_quota_cny.go` | 新增 | 三个入口的 additive wrapper 与受控日志 |
| `controller/partner_tenant.go` | 修改 | H5 额度项追加 `quota_cny`；目录改用仅商户的 wrapper |
| `controller/partner_tenant_subscription_key.go` | 修改 | 独立查询成功后追加 `quota_cny` |
| `service/partner_tenant_quota_cny_test.go` | 新增 | 9 个纯转换器测试 |
| `controller/partner_tenant_quota_cny_test.go` | 新增 | 1 个纯渲染测试 + 3 个 PostgreSQL HTTP 测试 |
| `model/partner_tenant_quota_cny_test.go` | 新增 | 2 个纯形状守卫测试 |
| `model/task_cas_test.go`、`service/task_billing_test.go` | 修改 | 各插入一个 `PartnerTenantQuotaCNY` TestMain 旁路分支（纯插入） |
| `docs/openapi/partner-subscription-key.openapi.json` | 修改 | 1.1.0：新 schema、4 个示例 |
| `docs/partner-subscription-key-api.zh-CN.md`、`docs/partner-tenant-api.md`、`docs/partner-hosted-h5.zh-CN.md` | 修改 | 字段表、状态表、示例、兼容性与精度说明 |
| `.trellis/tasks/11-17-partner-quota-cny/{verification.md,quality-review.md,implement.md}` | 记录 | Trellis 持久记录 |
| `TEMPORARY_ARTIFACTS.md` | 追加 | 仅追加本检查会话的产物声明 |

`model/` 下除两个测试文件外没有任何改动【执行：`git status --porcelain -- model` 仅列出 `model/task_cas_test.go` 与 `model/partner_tenant_quota_cny_test.go`】。`go.mod`/`go.sum`/前端 lockfile 无改动【执行】。

本检查会话自己的改动（全部在本任务文件内，见 `quality-review.md`）：

- `controller/partner_tenant_quota_cny.go`：只改注释（H5 `usable` 的真实语义）。
- `service/partner_tenant_quota_cny.go`：只改注释（`Usable` 字段来源）。
- `controller/partner_tenant_quota_cny_test.go`：在纯渲染测试中新增 5 个 H5 `usable` 判定用例。
- `docs/partner-tenant-api.md`、`docs/partner-hosted-h5.zh-CN.md`：各补一句 H5 `usable` 的适用范围。

## 2. 最终签名与 JSON 形状

### 2.1 service（`service/partner_tenant_quota_cny.go`）

```go
const (
    PartnerTenantQuotaCNYCurrency            = "CNY"
    PartnerTenantQuotaCNYScale               = 6
    PartnerTenantQuotaCNYRounding            = "half_away_from_zero"
    PartnerTenantQuotaCNYReasonInvalidConfig = "invalid_conversion_config"
    PartnerTenantQuotaCNYReasonInvalidQuota  = "invalid_quota"
)

type PartnerTenantQuotaCNYConfig struct{ /* 不导出字段；零值 = 不可用 */ }

func CurrentPartnerTenantQuotaCNYConfig() PartnerTenantQuotaCNYConfig                        // 读一次 common.QuotaPerUnit 与 operation_setting.USDExchangeRate
func NewPartnerTenantQuotaCNYConfig(quotaPerUnit, usdExchangeRate float64) PartnerTenantQuotaCNYConfig
func (c PartnerTenantQuotaCNYConfig) Available() bool
func (c PartnerTenantQuotaCNYConfig) Metadata() PartnerTenantQuotaCNYMetadata
func (c PartnerTenantQuotaCNYConfig) AmountDecimal(quota decimal.Decimal) (string, bool)   // 任意精度，可为负
func (c PartnerTenantQuotaCNYConfig) AmountInt64(quota int64) (string, bool)
func (c PartnerTenantQuotaCNYConfig) AmountString(quota string) (string, bool)             // 仅规范非负十进制整数串，≤128 位
func (c PartnerTenantQuotaCNYConfig) Subscription(facts PartnerTenantQuotaCNYSubscriptionFacts) PartnerTenantSubscriptionQuotaCNY
func (c PartnerTenantQuotaCNYConfig) Catalog(totalAmount int64) PartnerTenantCatalogQuotaCNY
```

- 公式：`amount = quota × USDExchangeRate ÷ QuotaPerUnit`。`quota.Mul(rate)` 精确，随后**唯一一次** `DivRound(quotaPerUnit, 6)`，再 `StringFixed(6)`（`service/partner_tenant_quota_cny.go:152-153`）。
- 配置因子：先判 NaN/±Inf/≤0，再用 `strconv.FormatFloat(v,'f',-1,64)` 的规范十进制文本 `decimal.NewFromString` 构造；从不调用 `decimal.NewFromFloat`。quota 路径上没有 float64【执行：对 4 个业务文件 `git grep --untracked` `float64|NewFromFloat`，只命中两个配置因子函数的签名（`NewPartnerTenantQuotaCNYConfig`、`partnerTenantQuotaCNYFactor`）和两处注释】。
- 不读取站点展示偏好：未引用 `PartnerOAuthDisplayCurrency` / `ConvertPartnerWalletQuota` / `GetUsdToCurrencyRate` / `GetQuotaDisplayType`【执行：同一 `git grep` 无命中】。
- `AmountDecimal` 的输入界限：指数绝对值 ≤ 64、系数 ≤ 512 bit；越界返回 `("", false)`，不构造巨大的十次幂。

### 2.2 三个入口的 JSON 形状

独立订阅 `GET /api/partner/subscription`（顶层追加；原 `subscription`/`quota`/`api_key` 不变）与 H5 `subscriptions[]` 项（追加在原 int64 number 字段之后）：

```json
{
  "currency": "CNY",
  "available": true,
  "total": "30.000000",
  "used": "0.032016",
  "remaining": "29.967984",
  "unlimited": false,
  "usable": true,
  "quota_per_unit": "500000",
  "usd_to_cny_rate": "1",
  "scale": 6,
  "rounding": "half_away_from_zero"
}
```

可选键：`reason`（仅 `available=false`，取值只有 `invalid_conversion_config` / `invalid_quota`）、`historical_remaining`（仅独立查询的到期/取消有限额度；H5 入口只返回有效订阅，永不出现）。`total`/`used`/`remaining`/`quota_per_unit`/`usd_to_cny_rate` 可为 `null`。

目录 `GET /api/partner/v1/plans` 的 `plans[]` 项（`total_amount` 仍是 int64 JSON number，售价与币种不变）：

```json
{
  "currency": "CNY",
  "available": true,
  "total": "30.000000",
  "unlimited": false,
  "quota_per_unit": "500000",
  "usd_to_cny_rate": "1",
  "scale": 6,
  "rounding": "half_away_from_zero"
}
```

目录没有 `used` / `remaining` / `usable` / `historical_remaining`。

状态表（【源码推理】，与 `Subscription()` 的分支逐一对应；对应测试未执行）：

| 状态 | total | used | remaining | historical_remaining | unlimited | usable |
| --- | --- | --- | --- | --- | --- | --- |
| 有效有限 | 金额 | 金额 | 金额 | 省略 | false | 原权益事实 |
| 有效不限量 | null | 金额 | null | 省略 | true | 原权益事实 |
| 到期/取消有限 | 金额 | 金额 | "0.000000" | 金额（仅独立查询） | false | false |
| 到期/取消不限量 | null | 金额 | "0.000000" | 省略 | true | false |
| 配置无效 | null | null | null | 省略 | 原事实 | 原事实 |
| 存量 quota 非法 | null | null | null | 省略 | 原事实 | 原事实 |

### 2.3 controller wrapper

- `partnerTenantIndependentSubscriptionView{ *model.PartnerTenantIndependentSubscription; QuotaCNY ... "quota_cny" }`：匿名嵌入**指针**。`encoding/json` 对无 tag 的匿名指针结构体跟随指针并内联其导出字段，nil 指针整体跳过；嵌入类型没有 `MarshalJSON`/`MarshalText`，不会因方法提升吞掉新字段；字段名无冲突（`subscription`/`quota`/`api_key` 对 `quota_cny`）。【源码推理 + 执行：只读查看 go1.26.10 `encoding/json/encode.go`（727–728 行 nil 嵌入指针 `continue FieldLoop`，1152 行 “Follow pointer”，1236 行匿名结构体展开）；`git grep` 确认 `model` 中 `MarshalJSON` 只存在于 `LogOther`、`JSONValue`，`PartnerTenantIndependentSubscription` 无任何方法，`SubscriptionPlan` 只有 `BeforeCreate`/`BeforeUpdate`/`NormalizeDefaults`】
- `partnerTenantCatalogPlanView{ model.SubscriptionPlan; QuotaCNY ... }`：仅 `PartnerTenantListPlans` 使用【执行：`git grep --untracked`】；全局 `SubscriptionPlan` 的 JSON/GORM 形状未改。
- H5 私有 DTO `partnerTenantSubscriptionQuota` 追加一个字段，该类型只在 `PartnerTenantSubscriptionQuota` 使用【执行】。
- 三处投影都在原业务读取成功之后构造；错误路径、状态码、`no-store`/`no-referrer` 头（由既有中间件/`partnerTenantPurchasePrivacy` 设置）未改【源码推理】。
- 日志：仅 `invalid_quota` 时一行 `partner tenant quota_cny unavailable (request_id=%s): entry=%s id=%d reason=%s`；entry 是固定字面量（`subscription`/`hosted_quota`/`catalog`），id 是数值，reason 是常量，request_id 是服务端生成的关联 ID。配置无效不逐请求记录【源码推理】。

## 3. 日志子任务（usage-logs D 阶段）的调用方式

先**累加原始 quota**，再对总和转换一次；不要累加逐行已舍入的金额。

```go
config := service.CurrentPartnerTenantQuotaCNYConfig() // 每个响应只调用一次，所有行/统计共用
meta := config.Metadata()                              // currency/available/reason?/quota_per_unit/usd_to_cny_rate/scale/rounding

// 聚合值可能超过 int64：把 SQL SUM 的十进制文本或逐行 int64 累加成 decimal 再转换
sum, err := decimal.NewFromString(sumText)             // 或 decimal.NewFromInt 逐行 Add
amount, ok := config.AmountDecimal(sum)                // ("55340232221128.654842", true)
```

- 输入类型：`decimal.Decimal`（任意精度，允许负数，舍入仍为远离零）；也可用 `AmountString`（**只接受规范非负十进制整数串**，负数/带符号/小数/指数/前导零一律 `false`）或 `AmountInt64`。
- 返回：恰好六位小数的定点字符串与 `true`。
- **配置不可用时**：三个 `Amount*` 都返回 `("", false)`，`config.Available()==false`，`Metadata().Reason=="invalid_conversion_config"`，无效因子的元数据为 `nil`（JSON `null`）。调用方必须输出 `null`/不可用并回退展示原 quota，不得用 0、1 或其他倍率顶替。
- 输入越界（指数绝对值 > 64 或系数 > 512 bit）同样返回 `("", false)`。
- 该金额是**查询时**配置下的展示等值，不是历史实收现金；旧日志没有汇率快照。

签名与行为由类型检查和下方 oracle 复算支持，**没有运行证据**。

## 4. 舍入来源

- 【执行：本会话直接阅读模块缓存源码，只读】`github.com/shopspring/decimal@v1.4.0/decimal.go` 第 641–670 行 `DivRound`：先 `QuoRem(d2, precision)`，比较 `2·|r|·10^precision` 与 `|d2|`，`c < 0` 返回截断商，否则（**含恰好一半**）按符号向远离零方向加/减一个最小单位。即 half away from zero，且舍入判定基于精确余数，没有中间舍入。主会话也独立确认了同一行号。
- 同文件 `StringFixed`（1487 行）调用 `Round(places)`（1523 行起），其首行 `if d.exp == -places { return d }`：`DivRound(…, 6)` 的结果指数已是 -6，所以 `StringFixed(6)` 不会发生第二次舍入，只负责定点输出（`string(false)` 保留尾随零，不用科学计数法）。
- `go.mod` 中版本为 `github.com/shopspring/decimal v1.4.0`【执行】。

## 5. 实际执行的命令与结果

Go 工具链：`GO126=/Users/lyh_god/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.26.10.darwin-arm64/bin/go`，环境 `GOTOOLCHAIN=local GOPROXY=off GOSUMDB=off GOFLAGS=-mod=readonly`。退出码均取自 `out=$(cmd 2>&1); rc=$?` 或命令直接结束后的 `$?`，不取管道末端。

### 5.1 主会话（05:3x CST）转述的结果

| 检查 | 结果 | 本会话是否重复 |
| --- | --- | --- |
| 触碰 Go 文件 `gofmt -l` | 无输出 | 已在本会话改动后重跑，见 5.2 |
| 离线 `go build ./model ./controller ./router ./middleware ./service` | exit 0 | 已重跑 |
| 离线 `go vet` 同范围 | exit 0 | 已重跑 |
| `git diff --check` | exit 0 | 已重跑 |
| 无暂存 | 是 | 已重跑 |
| `PartnerTenantIndependentSubscription` / `SubscriptionPlan` 无自定义 `MarshalJSON` | 是 | 已独立 `git grep` |
| `DivRound`（decimal.go 641–670）远离零 | 是 | 已独立阅读 |

### 5.2 本检查会话（在本会话全部改动之后的最终结果）

| # | 命令 | 退出码与结果 | 证据类型 |
| --- | --- | --- | --- |
| 1 | 缓存工具链自带 `gofmt -l` 作用于 9 个触碰的 Go 文件 | rc=0，输出为空 | 执行（格式） |
| 2 | `"$GO126" version` | rc=0，`go1.26.10 darwin/arm64` | 执行 |
| 3 | `"$GO126" build ./model ./controller ./router ./middleware ./service` | rc=0，0 行输出 | 执行（**仅编译**） |
| 4 | `"$GO126" vet ./model ./controller ./router ./middleware ./service` | rc=0，0 行输出 | 执行（vet 会类型检查 `_test.go`，**没有运行任何测试**） |
| 5 | `python3` 精确有理数 oracle（`fractions.Fraction`，脚本经 stdin） | rc=0；37 行 `AmountTable` + 23 个其他期望，0 不一致，详见 §6 | 执行（检验的是测试预期，不是 Go 代码） |
| 6 | `python3` 文档检查（最终一次，文档改动之后） | rc=0，`PROBLEMS: 0`，详见 §8 | 执行 |
| 7 | `python3` 测试源普查（顶层测试计数、选择器外溢、`SubscriptionPlan` 键集合对比） | rc=0，详见 §7 | 执行 |
| 8 | `python3` 列出 OpenAPI 各响应的示例名 | rc=0 | 执行 |
| 9 | `git diff --check` | rc=0，输出为空 | 执行 |
| 10 | `git diff --cached --name-only` | rc=0，输出为空（无暂存） | 执行 |
| 11 | `git status --porcelain -- go.mod go.sum web/package.json web/bun.lock …` | rc=0，输出为空 | 执行 |
| 12 | 5 个未跟踪新文件的行尾空白/文件末换行检查 | 行尾空白 0，均以换行结束 | 执行 |
| 13 | `git diff -U0` 两个 TestMain 文件的删除行计数 | 0（纯插入，既有 `PartnerTenantUsage`/`AccessMode`/`AuthorizationAudit`/`SubscriptionKey` 分支文本未变） | 执行 |
| 14 | `git grep` 嵌入类型的 marshaler 方法 | 无 `MarshalJSON`/`MarshalText`（见 §2.3） | 执行 |
| 15 | `docker version` | rc=1，daemon 不可连接 | 执行（仅探测） |

过程中的失败尝试（如实记录，均未改变任何文件）：

- 文档检查脚本第一次放在 `$( … <<'PY' … )` 中，macOS bash 3.2 因 heredoc 内的反引号在解析阶段报语法错误（shell rc=2），**脚本没有运行**；之后改为不经命令替换直接运行。
- 第二次运行 rc=1：是**检查脚本自身的缺陷**（把 schema 的 `properties` 误当成示例对象，随后抛 `TypeError`），不是文档问题；修正脚本后重跑 rc=0。
- 第三次运行 rc=0，但脚本把嵌套的 `quota_cny` 对象重复计数；修正计数后在文档改动之后跑了最终一次（表中第 6 行），本文件引用的数字来自最终一次。

## 6. Oracle 独立复算（测试预期，不是 Go 代码）

【执行】用 `fractions.Fraction` 做精确有理数运算：因子取 Go `strconv.FormatFloat(v,'f',-1,64)` 等价的最短往返十进制文本（Python `repr(float)` 再转 `Decimal`），`amount = quota × rate ÷ quota_per_unit`，在第六位按 `floor(|x|·10^6 + 1/2)` 带符号舍入一次。

- `service` 的 `TestPartnerTenantQuotaCNYAmountTable` 全部 37 行：**0 不一致**。覆盖 15000000/16008/14983992、2^53 与 2^53+1、int64 max、3×int64 max、10^30、汇率 7.3/7.25/0.000001/0.1/1e21、不循环小数（÷3）、正负恰好半单位（1/3/5 ÷ 2000000）以及两条“只在最终舍入一次”的判别用例。
- 另外 23 个期望（求和后转换、快照/当前配置、状态表金额、目录 2^53+1、1e64 上界、controller 测试中的 7.3 汇率与 `historical-usd`、文档/OpenAPI 示例的 6 个金额）：**0 不一致**。
- 断言的推理也被复算确认：`1×0.9999999÷2000000 = 0.00000049999995`（先舍到七位会误达半单位）；`1×1.5÷3000000` 恰为 `0.0000005`；`quota×v÷v` 对 `5e-324`、`1e-300`、`1e21`、`MaxFloat64` 精确抵消。
- 本会话新增的 5 个 H5 用例使用的金额（`1×0.1÷500000→0.000000`、`100→0.000200`、`250→0.000500`、`1→0.000002`）与上面已复算的输入完全相同。

结论：未发现错误的测试预期。这只说明预期字符串与公式一致；Go 实现是否产出这些字符串仍需运行测试。

## 7. Go 测试：执行数 0

**Go 测试执行数：0。skip 数：未测。** 原因：Docker daemon 不可连接且不得由本会话启动；宿主机禁止 `go test`（包括纯转换器测试）；不以 SQLite/MySQL/生产库替代 PostgreSQL。

【执行：测试源普查】匹配 `^TestPartnerTenantQuotaCNY` 的顶层测试共 **15** 个，全部只存在于本任务的三个测试文件，其他包/文件没有命中该选择器：

| 包 | 数量 | 测试 | 是否需要 PostgreSQL |
| --- | --- | --- | --- |
| `service` | 9 | `AmountTable`、`SumsRawQuotaBeforeConverting`、`CanonicalQuotaStrings`、`BoundedDecimalInput`、`InvalidConfigIsUnavailable`、`IgnoresSiteDisplayPreference`、`SubscriptionStates`、`CatalogShape`、`NeverUsesScientificNotation` | 否（纯） |
| `controller` | 4 | `RenderedWrappersKeepLegacyFields`（纯）；`IndependentSubscriptionHTTP`、`HostedQuotaHTTP`、`CatalogHTTP` | 后三个需要 |
| `model` | 2 | `IndependentModelDTOStaysLegacy`、`SharedPlanShapeStaysLegacy` | 否（纯） |

以上 15 个测试的源码通过了 `go vet` 的类型检查【类型检查】，**没有一个被执行**。

TestMain 旁路【执行 + 源码推理】：`model/task_cas_test.go` 与 `service/task_billing_test.go` 各在 `flag.Parse()` 之后、SQLite bootstrap 之前插入 `TEST_PARTNER_QUOTA_CNY_POSTGRES_DSN != "" || test.run 含 "PartnerTenantQuotaCNY"` 分支；`git diff -U0` 删除行为 0，既有分支文本未变。`controller` 包没有 TestMain。

### 既有测试受影响面（【源码推理】，逐个阅读断言方式；均未执行）

新增字段只可能破坏：整体 body 相等、拒绝未知字段的严格解码、字段个数断言。逐一核对结果：**没有既有测试需要修改，也没有弱化任何既有断言。**

| 既有测试 | 对三入口 body 的断言方式 | 是否会被 additive 字段破坏 |
| --- | --- | --- |
| `controller/partner_tenant_subscription_key_test.go`（`TestPartnerTenantSubscriptionKeyHTTPPostgres`） | `Contains` `"quota_total":"9007199254740993"`、`"api_key":"sk-`，状态码 | 否 |
| `controller/partner_tenant_authorization_audit_test.go` | 只断言 200 与审计行数 | 否 |
| `controller/partner_tenant_integration_mode_test.go` | 状态码；`Contains "subscriptions"` | 否 |
| `controller/partner_tenant_purchase_session_quota_test.go` | `JSONEq` 的对象是**公开 H5 会话目录**（另一个 DTO，未改）；旧目录只 `Contains "total_amount":9223372036854775807` | 否 |
| `controller/partner_tenant_purchase_session_availability_test.go` | 旧目录 `Contains "currency":"USD"` | 否 |
| `controller/partner_tenant_purchase_session_test.go` | 仅注册目录路由，`JSONEq` 作用于会话/订单响应 | 否 |
| `router/partner_tenant_router_test.go` | 宽松解码到只含 `title` 的结构；`Contains "quota_unlimited":true`、`NotContains "B monthly"` | 否（`"quota_unlimited":true` 仍在） |
| `router/partner_tenant_{subscription_key,integration_mode,authorization_audit}_test.go`、`middleware/partner_tenant_subscription_key_test.go` | 路由注册/鉴权/状态码 | 否 |
| `model/partner_tenant_subscription_key_test.go`、`model/partner_tenant_integration_mode_test.go`、`model/partner_tenant_authorization_audit_test.go` | 直接调用 model 函数；model 未改 | 否 |

上述既有测试文件中没有 `DisallowUnknownFields`；`controller`/`router`/`middleware`/`model`/`service` 的 partner_tenant 文件里唯一一处（`controller/partner_tenant.go:278`）是管理端**请求体**解码器，不作用于这三个响应【执行：`git grep`】。前端 `web/src` 不消费这三个商户后端接口【执行：`git grep -E "api/partner/(subscription|v1/plans|v1/accounts)" -- web/src` rc=1 无命中】。这些既有套件（尤其前组 `AccessMode` 11 个、`AuthorizationAudit` 9 个顶层测试）自身的 pq 运行缺口不变，**不能**由本任务的新套件代表。

## 8. 文档检查（【执行】，最终一次，rc=0，`PROBLEMS: 0`）

- `docs/openapi/partner-subscription-key.openapi.json`：以拒绝重复键、拒绝 NaN/Infinity 常量的方式解析成功，`openapi 3.0.3`、`info.version 1.1.0`。
- 本地 `$ref`：共 103 处（29 个不同目标），未解析 0；没有带兄弟键的 `$ref`。
- schema 与 Go 结构逐字段比对（脚本从 Go 源码解析 json tag）：
  - `SubscriptionQuotaCNY` ↔ `PartnerTenantSubscriptionQuotaCNY`：13 字段，required 11，可选 `reason`、`historical_remaining`，nullable 为 `total`/`used`/`remaining`/`quota_per_unit`/`usd_to_cny_rate`，`additionalProperties:false`。
  - `CatalogQuotaCNY` ↔ `PartnerTenantCatalogQuotaCNY`：9 字段，required 8，可选 `reason`，nullable 为 `total`/`quota_per_unit`/`usd_to_cny_rate`；不含任何用量字段；与订阅变体的差集恰为 `used`/`remaining`/`usable`/`historical_remaining`。
  - `QuotaCNYReason.enum` 与 Go 两个 reason 常量相等。
  - `IndependentSubscription.quota_cny`、`Plan.quota_cny` 均为可选属性（不在 required 中），与“旧部署/回滚后可能缺失”的说明一致。
- 4 个独立订阅示例（active / expired / unlimited / conversion_unavailable）按其 schema 用 stdlib 迷你校验器校验通过（type、required、additionalProperties、pattern、enum、nullable、allOf、$ref）。这不是完整的 OpenAPI 元 schema 认证。
- Markdown fenced `json` 块：`partner-subscription-key-api.zh-CN.md` 9 块、`partner-tenant-api.md` 3 块、`partner-hosted-h5.zh-CN.md` 4 块，全部可解析且无重复键，代码围栏成对。
- 示例数值一致性：共 13 个 `quota_cny` 示例对象（OpenAPI 4 + Markdown 9），其中能从同一示例的原始 quota 重算的 **21 个金额全部与公式一致**；同时检查了键集合、常量字段、`available=false` 时金额为 null 且带有界 reason、独立示例 quota 仍是字符串、H5 示例 quota 仍是 JSON number、`api_key` 是否出现与状态一致、`usable`/`unlimited` 与原字段一致。
- 本次新增的相对链接 1 个（`partner-hosted-h5.zh-CN.md` → `partner-tenant-api.md`），目标存在。
- 三份 Markdown 的必备表述标记全部存在（售价/额度/等值三者区分、展示投影而非无损账本、三个金额可能相差一个末位单位、严格解码器需升级、未修复旧大整数 number 协议、运行验证尚未执行、H5 `usable` 不保证模型调用成功）。

文档人工阅读结论【源码推理】：没有运行或部署声明；没有声称字符串等于无限小数无舍入精确；OpenAPI `GET /plans` 响应本身没有示例（改动前也没有），目录示例在 Markdown 中。

## 9. 夹具与全局状态风险审计（【源码推理】，三个测试文件全文阅读；未执行）

| 项 | 结论 |
| --- | --- |
| schema 归属 | 三个 HTTP 测试经 `setupPartnerTenantIsolatedHTTPPQ` 各建唯一 `pt_quota_cny_{independent,hosted,catalog}_<纳秒>` schema，`search_path` 只含该 schema；不触碰非自建 schema |
| 破坏性 SQL | 无 `DROP`/`TRUNCATE`/`DELETE`/`.Delete(`/`.Exec(`/`Unscoped`；只在自建 schema 内 `Create`/`Update`。schema 保留不清理 |
| 缺 DSN | 包装函数先 `require.NotEmpty(dsn, "BLOCKED…")`，**失败而不是 skip**（共享夹具在空 DSN 时会 skip，但走不到） |
| `common.QuotaPerUnit`、`operation_setting.USDExchangeRate`、`GeneralSetting`（展示类型/自定义倍率） | 两个 hold helper 保存并在 `t.Cleanup` 恢复；测试内的临时改动都在同一测试内 |
| `model.DB`、数据库类型标志、`CryptoSecret`、`RedisEnabled`、支付配置 | 由共享夹具保存/恢复；包装函数在夹具之后改写 `CryptoSecret`，夹具的 cleanup 恢复原值。`pt_` 的哈希是纯 SHA-256，不依赖 `CryptoSecret`；`sub_` 在改写之后才派生，前后一致 |
| `model.LOG_DB` | 仅独立查询测试改写并恢复 |
| `gin.DefaultErrorWriter` | 在 `common.LogWriterMu` 下替换并恢复 |
| 套餐进程级缓存 | H5 测试对每个用到的 plan ID 先失效再使用，结束再失效 |
| GORM 回调探针 | 注册在本测试自己的连接上，cleanup 移除；审计写入是同步的，探针 map 只在单 goroutine 内读写 |
| 并行 | 无 `t.Parallel`，无 `t.Skip` |
| 空洞断言 | 未发现；兼容性断言比较的是原始 JSON token（`"15000000"` 与 `15000000` 不等），不是仅比较 Go 类型 |
| 与实现矛盾的断言 | 未发现（逐条对照实现分支；金额另见 §6） |

运行时才会暴露、需首次执行时留意的风险：

1. 三个 HTTP 测试依赖的共享夹具会调用前组的 `model.MigratePartnerTenantIntegrationModes`，该迁移的 pq 运行从未执行过；它若失败，会以与本任务无关的原因阻断这三个测试。
2. 日志断言用 `NotContains(serverLog, "quota_cny")`，而夹具的 schema 名与商户 group 以 `pt_quota_cny_` 开头；若错误输出流出现任何包含 schema/group 名的行，会产生假失败。已阅读的路径中没有这样的输出，故保留更严格的断言。
3. 独立查询测试断言每次请求恰好读取 `partner_tenant_subscription_access_keys` 2 次、`tokens` 1 次（依据 `findPartnerTenantSubscriptionKey` + `lockPartnerTenantSubscriptionBindingTx` + `validatePartnerTenantAccountClockTx` 的源码计数；取时钟的 `Raw().Scan()` 在 gorm v1.25.12 `finisher_api.go:525-533` 中经 `Rows()` 走 Row 回调而非 Query 回调，不计入——本会话只读查看了该源码）。这是源码推理得到的数字。

## 10. 未关闭的运行门禁（A-C1 … A-C5）

| 验收 | 已有证据 | 缺口（全部需任务自有 Docker + 隔离 PostgreSQL） |
| --- | --- | --- |
| A-C1 旧字段名/值/类型不变，新字段披露 currency/字符串/比例/舍入 | 源码推理（嵌入规则、无 marshaler）；类型检查；文档与 schema 已执行校验 | 4 个 controller 测试 + 2 个 model 测试未执行：真实 gin 渲染的逐 token 对比、与 model DTO 逐字节前缀相等 |
| A-C2 各状态正确；不新增读取其他订阅/秘密的能力 | 源码推理（状态分支、`model/` 无业务改动）；oracle 复算 | `SubscriptionStates`、三个 HTTP 测试未执行：到期/取消/自然到期/不限量终态、Key 可见性、凭证表读取次数、H5 仅有效且限本商户 |
| A-C3 >2^53、int64 max、最小 quota、小额、非整除、不同汇率、展示偏好无关、非法配置 | oracle 复算 60 个期望 0 不一致；源码推理 | 9 个 service 测试与 HTTP 测试未执行 |
| A-C4 文档/OpenAPI/示例同步 | **已执行**的文档检查（§8） | 无运行缺口；未做 OpenAPI 元 schema 认证或 Apifox 导入 |
| A-C5 锁内事实、鉴权/Key/续费/周期重置不变；不二次查询秘密；不持锁做 I/O | 源码推理（转换在事务提交后、纯函数、`model/` 仅测试文件变化） | 独立查询测试未执行：每次查询恰一条审计事件、凭证表读取次数不增、各表行数与存量事实不变 |

待 Docker 可用后在任务自有 runner 内执行（不是宿主机）：

```bash
go test -mod=readonly ./service ./model ./controller -run '^TestPartnerTenantQuotaCNY' -count=1 -v
```

需设置 `TEST_PARTNER_QUOTA_CNY_POSTGRES_DSN`；缺 DSN 时三个 HTTP 测试会**失败**。受影响的既有套件（`SubscriptionKey`、`AccessMode`、`AuthorizationAudit`、H5 quota/catalog）需另行登记选择器与执行数。

## 11. 需要决策或后续处理的事项

1. **H5 入口的 `usable` 语义**（详见 `quality-review.md` F1）：公式与独立查询的 `quota_usable` 相同，但 H5 额度接口历来不校验账号的平台 User/模型 Key 状态；在这些状态下独立查询返回 403/409，而 H5 会返回 `usable:true`。本会话只做了如实的文档与注释说明，没有改变行为。是否接受、或改为不在 H5 输出 `usable`、或增加校验读取，属于契约/范围决定。
2. `implement.md` 最后一步“把经验证金额协议写入相关 spec”未做：协议尚无运行证据。是否现在以 source-ready / runtime-blocked 状态写入 spec，由主会话决定。
3. Docker 需由用户提供可用环境后才能关闭 §10 的门禁。
