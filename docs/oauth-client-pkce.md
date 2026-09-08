# New API 客户端 OAuth 2.0 + PKCE 接口

本文描述固定桌面客户端 `yeschoy-desktop` 的账号授权接口。客户端基于 Authorization Code + PKCE S256，通过系统浏览器登录，并使用操作系统分配的 `127.0.0.1` 随机端口接收回调。

OAuth 凭证只用于读取当前账号信息、保持客户端登录，以及查看或撤销本客户端的授权设备。OAuth Access Token 不能调用 `/v1/*`，也不能创建、读取或管理普通 API Key。模型调用继续使用客户端自行管理的普通 API Key。

## 基础约定

| 项目 | 值 |
|---|---|
| 服务地址 | `https://yeschoy.com` |
| OAuth 前缀 | `/api/oauth` |
| Client ID | `yeschoy-desktop` |
| Client 类型 | Public Client，无 Client Secret |
| 回调 | `http://127.0.0.1:{port}/oauth/callback` |
| PKCE | 仅 `S256` |
| Token request | UTF-8 `application/x-www-form-urlencoded` |
| OAuth resource auth | `Authorization: Bearer <access_token>` |
| 时间 | RFC 3339 UTC |

公网接口必须使用 HTTPS。HTTP 仅允许客户端本机 loopback 回调。

## Scope

| Scope | 权限 |
|---|---|
| `profile` | 读取当前账号的基本信息、用户分组和展示额度 |
| `offline_access` | 签发 Refresh Token，允许最长 30 天的客户端会话 |
| `sessions` | 查看和撤销当前用户、当前 Client 的授权设备 |

省略 scope 时默认为 `profile`。普通长期登录建议申请：

```text
profile offline_access
```

需要设备管理时申请：

```text
profile offline_access sessions
```

scope 区分大小写。未知、重复或已移除的 `api` scope 返回 `invalid_scope`。用户在授权页只能整包授权或拒绝，服务端不会增加客户端未申请的 scope。

## 1. 发起授权

```http
GET /api/oauth/authorize
```

参数：

| 参数 | 必填 | 值 |
|---|---:|---|
| `response_type` | 是 | `code` |
| `client_id` | 是 | `yeschoy-desktop` |
| `redirect_uri` | 是 | 已监听的完整 loopback URI |
| `state` | 是 | 32 字节 CSPRNG 的 Base64URL-no-padding 值 |
| `code_challenge` | 是 | `BASE64URL_NO_PADDING(SHA256(ASCII(code_verifier)))` |
| `code_challenge_method` | 是 | `S256` |
| `scope` | 否 | 空格分隔的允许 scope |

客户端必须先绑定 `127.0.0.1:0` 并保留 listener，再把实际端口放入授权 URL。不得把端口 `0` 放入 `redirect_uri`。

服务端只接受精确规范形式：

```text
http://127.0.0.1:<1..65535 的无前导零十进制端口>/oauth/callback
```

拒绝 `localhost`、IPv6、`0.0.0.0`、省略/无效端口、其他 path、尾斜线、query、fragment、userinfo 和 host 前缀欺骗。Client 或 redirect 无效时服务端返回 400 错误页，不向该地址跳转。

授权入口验证成功后进入 New API 登录和授权页面。页面显示固定客户端、当前账号与本次 scopes，并提供“拒绝”和“授权”。页面不会展示或传递密码、API Key、Authorization Code、verifier、AT 或 RT。

## 2. 浏览器回调

批准后，浏览器授权页从服务端取得经过验证的 loopback URL，并使用 `Referrer-Policy: no-referrer` 导航到：

```http
GET /oauth/callback?code=AUTHORIZATION_CODE&state=CLIENT_STATE HTTP/1.1
Host: 127.0.0.1:49182
```

拒绝后导航到：

```http
GET /oauth/callback?error=access_denied&state=CLIENT_STATE HTTP/1.1
Host: 127.0.0.1:49182
```

Authorization Code 是至少 32 字节的高熵一次性凭证，有效期 300 秒，并绑定用户、Client、完整 redirect URI、PKCE challenge、实际 scopes 和批准时的用户鉴权版本。数据库只保存凭证摘要。

客户端本机 callback 必须验证 method、Host、path、关键参数唯一性、本地流程状态和 state。错误 state、favicon 或无关请求不得终止仍有效的登录流程。合法回调最多触发一次换码。

## 3. Authorization Code 换 Token

```http
POST /api/oauth/token
Content-Type: application/x-www-form-urlencoded
```

```text
grant_type=authorization_code
client_id=yeschoy-desktop
code=AUTHORIZATION_CODE
redirect_uri=http://127.0.0.1:49182/oauth/callback
code_verifier=CODE_VERIFIER
device_id=550e8400-e29b-41d4-a716-446655440000
device_name=我的 MacBook
platform=macos
client_version=1.0.0
```

前三个设备字段之外，`client_version` 也为可选。`device_id` 必须是 UUID；`device_name` 最多 80 个 Unicode 字符；`platform` 为空或 `windows`、`macos`、`linux`；`client_version` 最多 64 字符。设备字段仅用于展示和审计，不参与认证。

服务端要求完整 redirect URI 与授权时完全一致，并使用提交的 verifier 验证 S256 challenge。Code 消费、OAuth Session 和扩展元数据在一个数据库事务中提交；并发兑换最多一个请求成功。

成功响应：

```json
{
  "access_token": "opaque-to-the-client",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "opaque-to-the-client",
  "refresh_expires_in": 2592000,
  "scope": "profile offline_access sessions",
  "session_id": "opaque-session-id"
}
```

未授予 `offline_access` 时不返回 `refresh_token` 或 `refresh_expires_in`，会话与 AT 一同到期。AT 最长 3600 秒；长期 Session 和 RT 从首次换码起最长 30 天，刷新不延长绝对截止时间。

## 4. Refresh Token

```http
POST /api/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&client_id=yeschoy-desktop&refresh_token=CURRENT_REFRESH_TOKEN
```

每次成功刷新返回新的 AT 和 RT，`session_id` 不变。旧 RT 立即失效；再次使用已轮换 RT 会撤销该 OAuth Session 的整个 Token family。客户端必须对同一会话使用 singleflight/互斥，原子保存完整的新凭证后再丢弃旧凭证。

OAuth RT 不能用于 Web `/api/user/auth/refresh`，Web 或旧桌面 RT 也不能用于 OAuth Token Endpoint。Token 请求结果不确定时不得盲目重放一次性 Code 或旧 RT，应重新授权。

## 5. 当前账号

```http
GET /api/oauth/userinfo
Authorization: Bearer <access_token>
```

需要 `profile`：

```json
{
  "id": "42",
  "username": "example",
  "email": null,
  "group": "default",
  "status": "active",
  "quota": {
    "remaining": "23.4182",
    "unit": "USD"
  }
}
```

ID 和 quota 均按字符串处理。unit 使用服务端当前展示单位。账号禁用后资源访问直接返回 `account_disabled`。

## 6. 授权设备

```http
GET /api/oauth/sessions?limit=20&cursor=OPAQUE_CURSOR
Authorization: Bearer <access_token>
```

需要 `sessions`。limit 默认 20，范围 1–100。只返回当前用户且属于 `yeschoy-desktop` 的未撤销、未过期会话：

```json
{
  "data": [
    {
      "id": "opaque-session-id",
      "client_id": "yeschoy-desktop",
      "device_name": "我的 MacBook",
      "platform": "macos",
      "created_at": "2026-09-08T00:00:00Z",
      "last_active_at": "2026-09-08T00:30:00Z",
      "current": true
    }
  ],
  "next_cursor": null
}
```

`current` 根据调用 AT 的 SID 判断，不能根据 `device_id` 判断。

撤销设备：

```http
DELETE /api/oauth/sessions/{session_id}
Authorization: Bearer <access_token>
```

成功或能够确认归属的重复撤销返回 204。目标不存在、属于其他用户、其他 Client 或 Web Session 时统一返回 404。

## 7. Revoke

```http
POST /api/oauth/revoke
Content-Type: application/x-www-form-urlencoded

client_id=yeschoy-desktop&token=TOKEN&token_type_hint=refresh_token
```

`token_type_hint` 可省略，值只能为 `access_token` 或 `refresh_token`。提交有效 OAuth AT 或 RT 都会撤销其所属的整个 OAuth Session；不会影响 Web Session 或其他授权设备。未知、过期、已撤销和重复 Token 均返回 200 空响应，不透露凭证是否存在。

## 8. 错误与响应头

Token 和 OAuth JSON resource 使用扁平错误：

```json
{
  "error": "invalid_grant",
  "error_description": "The authorization grant is invalid.",
  "request_id": "request-id"
}
```

| 场景 | HTTP | error |
|---|---:|---|
| 参数缺失、重复、格式错误 | 400 | `invalid_request` |
| Client 无效 | 400 | `invalid_client` |
| 不支持的 response/grant | 400 | `unsupported_response_type` / `unsupported_grant_type` |
| scope 不合法 | 400 | `invalid_scope` |
| Code、redirect、PKCE 或 RT 无效 | 400 | `invalid_grant` |
| AT 无效或过期 | 401 | `invalid_token` |
| scope 不足 | 403 | `insufficient_scope` |
| 账号禁用 | 403 | `account_disabled` |
| Session 不存在或不可访问 | 404 | `not_found` |
| 服务异常 | 500/503 | `server_error` |

OAuth 响应携带 `Cache-Control: no-store`、`Pragma: no-cache` 和请求 ID。401/权限错误使用 `WWW-Authenticate: Bearer`。

## 9. 会话和部署边界

- OAuth 与 Web 使用不同 SID、JWT audience、Refresh endpoint 和凭证载体；OAuth API 不读写 Web Refresh Cookie。
- OAuth 登录、刷新、设备撤销和 revoke 不改变 Web Session；账号禁用、删除、密码重置或鉴权版本升级会使两类会话同时失效。
- 服务端复用 `auth_flows` 保存短期请求与 Code，复用 `user_sessions` 保存会话主体，并使用 `oauth_client_sessions` 保存 scopes 与设备元数据。
- OAuth 不依赖 Redis，支持 SQLite、MySQL 和 PostgreSQL。
- 上线需要公开 HTTPS Origin、正确的 `ServerAddress`/callback main Origin，以及允许 `/api/oauth/*` 和 `/oauth/authorize` 的反向代理规则。
- 反向代理、CDN、APM、客户端与服务端日志必须过滤 authorize query、完整 callback URL、Authorization、Code、verifier、AT、RT 以及 Token/revoke body。
- 浏览器与客户端必须运行在同一台可访问 `127.0.0.1` 的电脑上；手机打开、远程 SSH 进程或隔离容器不在本契约支持范围内。
