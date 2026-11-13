# 商户套餐接入 Demo（历史直接下单协议）

> 本示例的直接 `POST /subscription-orders` 已在新版两种接入方式均被拒绝。以下仅保留历史本地 mock 教学；不要按旧 live 写入步骤联调本版。新接入使用默认[订阅 Key API](../../docs/partner-subscription-key-api.zh-CN.md)或明确选定的[托管 H5](../../docs/partner-hosted-h5.zh-CN.md)。本任务未重写 Demo 协议，也未执行任何生产调用。

配套文档：[野菜 API · 商户套餐接入文档](../../docs/partner-tenant-integration.zh-CN.md)。

这是一个**独立、零第三方依赖**的 Node.js 后端和中文演示页面，不依赖主站构建，不会修改主站代码或数据库。用于说明商户网页如何通过自己的后端完成套餐购买。需要 **Node.js 22 或更新版本**。

## 1. 直接运行：完整模拟流程

从仓库根目录执行：

```bash
node examples/partner-tenant-demo/server.mjs
```

打开 **http://127.0.0.1:3210**（不要改成 `localhost`，服务有严格 Host 校验）。

1. 查看模拟 CNY 套餐，选择标准套餐或不限量套餐。
2. 点击“创建订单 / 原键重试”，查看 `pending + not_ready`。
3. 点击“模拟付款并交付（不扣款）”，查看 `paid + fulfilled`。
4. 点击“订阅额度 → 查询”，查看有效订阅和额度；不限量为 `quota_unlimited:true`。
5. 重复提交原订单请求，订单号不变；刷新页面后幂等键及购买参数仍在。
6. 可先点击“独立开户 / 获取 Key”，也可跳过，让模拟付款交付自动开户。

**mock 模式没有真实支付链接，不打开支付网站，不访问真实 API。** “模拟付款”只修改本地内存；模拟续费日期只是教学近似值，不替代平台日历月算法。模拟数据会在进程重启时清空；如页面仍有旧草稿，请核查后点击“开始另一笔购买”。

## 2. 连接真实接口：默认只读

先向平台确认 API 根地址。密钥只在当前 shell 环境输入，不落盘、不进入命令历史：

```bash
read -r -s PARTNER_SECRET
printf '\n'
export PARTNER_SECRET

DEMO_MODE=live \
PARTNER_BASE_URL=https://yeschoy.com \
DEMO_USER_ID=your-stable-test-user-id \
node examples/partner-tenant-demo/server.mjs
```

页面会显示 **LIVE · 只读**，允许查询套餐、当前配置用户的额度及其已知订单；开户和下单均关闭。启动及页面初始化只会查询套餐，不会自动创建账号或订单。

**本次实际核对结果：** 使用用户提供的商户凭证，只读调用线上 `GET /api/partner/v1/plans` 得到 HTTP 200 / `Cache-Control: no-store`。当次列表只有套餐 ID `12`，名称“测试测试”，价格 `999`、币种 `USD`。凭证有效，但**这不证明线上已部署新版订单接口**。当前分支收银台只支持 CNY，Demo 会如实展示 USD 并禁用该套餐的新购买选项。需平台重新配置 CNY 价格并确认部署后才能联调真实下单，不会擅自换算或改价。

这里没有保存真实商户密钥，也没有执行真实开户、下单、付款、模型推理或套餐修改。

## 3. 显式允许真实开户和下单

仅在已获授权的联调环境、确认用户和 CNY 套餐后，重启为：

```bash
DEMO_MODE=live \
DEMO_ALLOW_WRITES=1 \
PARTNER_BASE_URL=https://yeschoy.com \
DEMO_USER_ID=your-stable-test-user-id \
node examples/partner-tenant-demo/server.mjs
```

环境中的 `PARTNER_SECRET` 沿用上一步。操作前页面会二次确认：

- 独立开户会创建真实平台账号；返回的 Key **只保存在后端内存**，不返回网页，也不输出日志。
- 下单会创建真实待付款订单；只有明确点击返回的收银台链接后才进入平台付款页面。
- 真实模式没有“模拟付款”能力，`/demo/mock-pay` 不可用；不能在商户侧伪造已付。
- 不要为了重试而开始另一笔购买。超时、500 / 503 使用原键和原参数；草稿在首次请求前写入当前标签页的 `sessionStorage`。
- 请求结果面板不显示 `checkout_url`、`api_key` 或 CSRF Token。真实收银台链接仅留在当前页面的打开链接中，刷新后不持久化；可用原键重试恢复原链接，但不会刷新其有效期。
- 查单会检查订单的 `external_user_id` 必须等于 `DEMO_USER_ID`，即便同一商户也不能查看其他用户的订单。
- 查询每 5 秒串行执行，最多 15 分钟；完成、过期、失败、请求错误、页面隐藏或点击停止时停止。重新查询可恢复。已付款交付待恢复会明确提示不要重付。

关闭真实模式后，可在当前 shell 执行 `unset PARTNER_SECRET`。密钥已通过对话交付；正式交给商户前，建议按平台流程轮换并通过安全渠道交付新密钥，切勿复制到文档。

## 4. 环境变量

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `DEMO_MODE` | `mock` | `mock` 完整离线模拟；`live` 调用真实接口 |
| `PARTNER_BASE_URL` | `https://yeschoy.com` | 仅 HTTPS 根地址，不能带路径、userinfo、query 或 fragment |
| `PARTNER_SECRET` | 无 | live 模式必填的 `pt_` 商户密钥；mock 不使用 |
| `DEMO_USER_ID` | `demo-user-1001` | 后端固定的演示用户 ID；真实模式请设置明确的稳定测试 ID |
| `DEMO_ALLOW_WRITES` | 未开启 | live 中只有精确值 `1` 才允许开户、下单；mock 始终允许本地模拟 |
| `PORT` | `3210` | 本机监听端口，只绑定 `127.0.0.1` |

不需要 `npm install`、`pnpm install` 或 `.env` 文件。该示例不会自动读取 `.env`。

## 5. 文件与请求映射

```text
server.mjs       本机商户 BFF：服务端鉴权、固定用户、只读开关、归属检查、凭证隔离
mock.mjs         无网络的内存模拟 API（不包含真实支付逻辑）
public/          独立静态页面，不属于主站 React/i18n 组件
server.test.mjs  Node 内置测试：模拟流程、真实模式边界及安全回归
app.test.mjs     执行实际页面脚本：订单关联、原键重试、刷新恢复及收银台链接回归
```

| 浏览器访问的本机接口 | 后端调用的平台接口 |
| --- | --- |
| `GET /demo/config` | 无，仅公开模式、固定演示用户、API origin 和本机 CSRF Token |
| `GET /demo/plans` | `GET /api/partner/v1/plans` |
| `PUT /demo/account`，请求 `{}` | `PUT /api/partner/v1/accounts`；用户 ID 由后端补入 |
| `POST /demo/orders` + 幂等键 | `POST /api/partner/v1/subscription-orders`；用户 ID 由后端补入 |
| `GET /demo/orders/{order_no}` | `GET /api/partner/v1/subscription-orders/{order_no}`；后端校验用户归属 |
| `GET /demo/quota` | `GET /api/partner/v1/accounts/{编码后的用户ID}/subscription/quota` |
| `POST /demo/mock-pay` | 无，仅 mock 内存状态变更 |

真实平台调用禁用重定向，防止认证请求跟随到意外目标；15 秒超时，错误面板仅显示受限错误码和 request_id，不反射任意上游文本。收银台 URL 允许使用平台独立配置的 HTTPS 回调域，验证其路径及令牌形态，不擅自改写域名。

## 6. 验证

```bash
node --test examples/partner-tenant-demo/server.test.mjs examples/partner-tenant-demo/app.test.mjs
node --check examples/partner-tenant-demo/server.mjs
node --check examples/partner-tenant-demo/mock.mjs
node --check examples/partner-tenant-demo/public/app.js
```

服务端测试只监听临时 loopback 端口，上游通过测试桩注入；页面测试在 Node VM 中执行实际 `public/app.js`，替换 DOM、网络、存储与计时器，不访问真实浏览器或平台。均无真实网络、支付、账号或 Key。不要将模拟通过理解为真实浏览器验收、支付渠道验收或平台数据库测试通过。

## 7. 生产改造边界

**不要直接把这个 Demo 暴露到公网。** 它有本机 Host / Origin / CSRF 校验及安全响应头，但不是生产商户后台：

- 无真实登录系统、用户会话、权限系统、租户管理或多用户并发隔离；单进程只代表一个固定用户。
- 购买草稿仅在浏览器标签页保存；存储不可用、关闭标签页、清理站点数据或跨设备不会可靠恢复。生产环境应在商户数据库持久化购买意图、原始参数、幂等键、订单号和归属。
- Key 仅存内存，重启即丢失；生产应使用加密存储、访问控制和安全轮换策略。
- 无商户自建持久化订单列表、可靠后台对账、退款或告警。
- 不演示模型推理，避免未经确认消耗真实额度。模型调用示例在主接入文档的“模型调用”一节，须由商户后端使用用户 Key 调用。
- 不复刻平台收银台、不替平台确认付款，也不更改平台计费、套餐或部署配置。
