# 野菜AI全工具接入与报错指南

> ✨ 更新时间：2026\-09\-12 v3 \| 全工具按类别重排，每个工具都有「配置步骤 \+ 注意事项 \+ 常见报错速查」
🎯 适合人群：第一次用 API、不懂代码、只想把地址和密钥填进软件的小伙伴
💡 小提示：本文只讲客户端怎么配置，服务器、Nginx 那些技术活儿就不聊啦～

嘿，欢迎来到野菜 AI！👋 这篇指南帮你把市面上 40 多款热门 AI 工具都接入野菜 AI，不管是聊天写作、写代码、翻译网页，还是搭工作流，都能在这里找到对应的教程～

每个热门工具后面还附了**高频报错速查表**——全是社区小伙伴真实踩过的坑，遇到报错先查表，大概率能自己搞定！软件版本迭代很快，"全工具"指的是主流接入方式全覆盖，小众软件的每个历史版本就没法一一保证啦，请多包涵～



---

## ⚡ 先看这一分钟版本

别急着往下翻！不管你用哪款软件，通常只要准备三样东西就够啦～

|软件里可能叫什么|你该填什么|
|---|---|
|API Key、密钥、Token|在野菜 AI 后台创建的 **API 密钥**（`sk-...` 格式，长得像一串密码）|
|Base URL、API Base、API 地址|OpenAI 格式：大陆线路 `https://yeschoy.com/v1`，全球线路 `https://api.yeschoy.com/v1`；Anthropic / Gemini 原生格式不带 `/v1`，直接填 `https://yeschoy.com`|
|Model、模型 ID、模型名称|从[模型定价](https://yeschoy.com/pricing)页复制的完整**模型 ID**，要一字不差哦|

如果软件要的不是 Base URL，而是"完整接口地址"，直接抄这个：

```Plaintext
https://yeschoy.com/v1/chat/completions
```

### 🌍 大陆线路和全球线路怎么选

两条线路填写方法一模一样，只要换换域名就行（`yeschoy.com` → `api.yeschoy.com`），其他什么 `/v1`、`/chat/completions`、API 密钥、模型 ID 都不用动～ Anthropic / Gemini 原生地址也是同样的道理：`https://yeschoy.com` → `https://api.yeschoy.com`。

> 💡 小建议：人在大陆就用大陆线路，人在海外就用全球线路，速度最快！

### 📍 先分清地址框是哪一种

这可是新手最容易踩的坑！**每款软件的拼接方式不一样**：大多数要求填到 `/v1`；NextChat 要填根域名（它自己会拼路径）；沉浸式翻译要填完整端点。遇到 404 别慌，先在「根地址 / 根地址\+/v1」之间换着试试～

|输入框写法|大陆优化线路|全球加速线路|
|---|---|---|
|Base URL / API Base / API 地址（OpenAI 格式）|`https://yeschoy.com/v1`|`https://api.yeschoy.com/v1`|
|Base URL（Anthropic / Gemini 原生格式）|`https://yeschoy.com`|`https://api.yeschoy.com`|
|API Host / Host|`https://yeschoy.com`|`https://api.yeschoy.com`|
|API Path / 请求路径|`/v1/chat/completions`|`/v1/chat/completions`|
|完整 URL / 完整接口 / Endpoint|`https://yeschoy.com/v1/chat/completions`|`https://api.yeschoy.com/v1/chat/completions`|

> ⚠️ 划重点：不要在 Base URL 后面重复拼路径哦！比如下面这个地址就是错的：

```Plaintext
https://yeschoy.com/v1/v1/chat/completions
```

> 是不是看到两个 `/v1` 啦？多加了一层就会 404 哦～

## 🚀 第一次使用的完整流程

跟着这 7 步走，保证不迷路～

1. 打开 [野菜 AI](https://yeschoy.com) 并登录。

2. 进入[API 密钥](https://yeschoy.com/console/token)页面，点一下创建一枚新密钥。

3. **立刻复制保存好完整密钥！** 关掉弹窗后就只能看到部分字符了，找不回来的哦。

4. 打开"模型定价"页，找到想用的模型，把模型 ID 完整复制下来。**模型 ID 必须一字不差**，多一个空格都不行。

5. 打开你要用的客户端，选择"OpenAI Compatible / OpenAI 兼容 / 自定义 OpenAI"。

6. 把地址、密钥和模型 ID 填进去，保存好后先发一句"你好"试试水～

7. 能正常回复就说明接入成功啦！再去跑长文本、代码或者批量任务也不迟～

> 💡 贴心小建议：每个软件最好单独创建一枚密钥，比如叫"Cherry Studio""Cline"。这样万一某枚密钥泄露了，只删那一枚就行，其他软件不受影响，安全感拉满！

## 🤔 不知道该选哪个工具？

别纠结，看看你主要用来干嘛，照着选就对了👇

|你的用途|推荐工具|上手难度|
|---|---|---|
|懒得折腾、想要一键搞定|**野菜 AI 桌面助手**（官方推荐）|⭐ 超级简单|
|普通聊天、写作、看文件|Cherry Studio、Chatbox|⭐ 超简单|
|国产办公智能体、操作本地文件|WorkBuddy / CodeBuddy|⭐ 超简单|
|网页、PDF、字幕翻译|沉浸式翻译、流畅阅读、Bob|⭐ 超简单|
|VS Code 里写代码|Cline、Roo Code、Kilo Code、Continue|⭐ 简单|
|国产桌面编程客户端|ZCode、Qoder、Trae|⭐ 简单|
|终端里写代码|Claude Code、Pi、OpenCode、dsh、Aider、Qwen Code、TraeCode CLI、Hermes Agent、Warp Agent CLI|⭐⭐ 中等|
|同时切换多个 CLI 的地址、密钥、MCP|CC Switch|⭐⭐ 中等|
|管理多个 IDE 账号、配额和多开实例|Cockpit Tools|⭐⭐ 中等|
|自建团队聊天网页|Open WebUI、LobeChat、NextChat|⭐⭐ 中等|
|自托管个人 AI 助手（接飞书/微信等）|OpenClaw|⭐⭐ 中等|
|搭建知识库或工作流|Dify、FastGPT、Flowise|⭐⭐⭐ 中等偏难|

---

# 💬 一、聊天与办公软件

## 1\. Cherry Studio（新手首选！）✅ 直接支持

Cherry Studio 界面清爽、配置简单，是小白入门的最佳选择～

**配置步骤**

1. 打开 Cherry Studio，点击左下角的"设置"图标。

2. 找到"模型服务"，点"添加"，类型选择 **"OpenAI"** 或 "OpenAI Compatible"。

3. 名称填"野菜 AI"，API 密钥填你的 `sk-...`，API 地址填 `https://yeschoy.com/v1`。

4. 点击"管理"或"添加模型"，把模型 ID 粘贴进去。

5. 点一下"检查"，检查成功后打开右上角的启用开关。

6. 回到聊天页面，选择刚添加的模型就可以开聊啦～

> 💡 小提示：如果检查时报 404，试试把 API 地址改成 `https://yeschoy.com`。不同版本的 Cherry Studio 对 `/v1` 的处理方式不太一样，多试一次就好～

**注意事项**

- 提供商类型别选错啦：Cherry Studio 有好几种类型（OpenAI、Responses、Anthropic、Gemini 原生），接野菜选 **"OpenAI"** 就对了。

- Base URL 拼接规则因版本而异：填根地址会自动拼路径，填 `/v1` 就原样发送（以 `#` 结尾强制原样发送、以 `/` 结尾会追加路径）。报 404 就在这几种写法之间换着试试。

- 网络连不上先查代理：设置 → 通用 → 代理模式，代理绕过规则不匹配是常见原因哦。

- 想诊断问题？启动时设置环境变量 `CS_DIAGNOSTICS=1`；日志在 macOS 的 `~/Library/Logs/CherryStudio/` 目录里。

**常见报错速查**

别慌！遇到报错先看看这张表，大概率能自己解决～

|你看到什么|为什么会这样|怎么办呢|
|---|---|---|
|`Invalid URL (GET /v1/v1/chat/completions)` 404|Base URL 末尾多加了 `/v1`，和自动拼接叠在一起了|删掉一个 `/v1` 就好啦|
|检查报 401，明明密钥没填错呀|复制的时候带了空格或换行；或者把别的平台的密钥填进来了（不通用哦）|把密钥删掉重新输入（别在原文上改哦）；确认密钥来自野菜 AI 后台|
|检查通过了，聊天却报错|"检查"用的模型和聊天选的模型不是同一个；或者模型 ID 填了展示名|每个模型都点一下检查；确认聊天页选的模型 ID 一字不差|
|`fetch failed` / `ECONNREFUSED` / `ENOTFOUND` / `ETIMEDOUT`|网络或代理问题：代理模式不对、公司网络有中间人拦截（`ERR_CERT_*`）|检查代理设置；换一条线路试试；公司网络确认证书没问题|
|`402 payment required` / `insufficient balance`|余额不足啦|去野菜 AI 后台充值就好～|
|403（同一密钥有的模型能用、有的不能）|模型级权限或令牌分组的问题|去后台确认一下当前令牌分组里有没有这个模型|
|偶尔 429 / 503 / 529 就中断了|上游比较忙，客户端又没重试机制|开启「重试 \+ 备选模型回退」，设置最大重试次数|
|`prompt is too long` / `context_length_exceeded`|超出模型的上下文窗口了|清空一下上下文，或者换长上下文的模型|
|回复乱码 / "模型返回内容解析失败"|模型 ID 填错走了错误适配，或者自定义参数残留不兼容|换个基础对话模型试试；清空自定义参数；升级到最新版|

**官方参考**：[Cherry Studio 自定义服务商](https://docs.cherry-ai.com/cherry-studio-wen-dang/en-us/pre-basic/providers/zi-ding-yi-fu-wu-shang)、[GitHub Issues](https://github.com/CherryHQ/cherry-studio/issues)

---

## 2\. Chatbox ✅ 直接支持

Chatbox 也是一款超受欢迎的聊天客户端，跨平台支持很好～

**配置步骤**

1. 打开设置 → 模型提供方 → 添加 → 类型选"OpenAI API compatible"。

2. 界面显示"API Host"就填 `https://yeschoy.com`；显示"Base URL"就填 `https://yeschoy.com/v1`。

3. API 密钥填你的 `sk-...`，API Path 保持 `/v1/chat/completions` 就行（没有这个输入框就不管它）。

4. **一定要手动添加至少一个模型 ID**，还要记得勾选能力（视觉、文件等，不勾的话会被当成纯文本模型哦）。

5. 保存好后点一下"检查"。

**常见报错速查**

|你看到什么|为什么会这样|怎么办呢|
|---|---|---|
|`Network Error: Failed to fetch`（只有安卓端出现）|安卓 WebView 先发 OPTIONS 预检请求，链路对预检处理不好导致 CORS 失败（Windows 桌面端是正常的）|升级新版 Chatbox 并开启「网络兼容模式」；换条线路试试|
|`Error from OpenAI: ...` JSON 解析错误 / 卡住后空白回复|中转返回的流式分片不太标准（缺 `data:` 前缀、截断、非 JSON 心跳行）|升级客户端；调低 max\_tokens；换条线路|
|`invalid model`|自定义 Provider 没添加模型，或者模型名和站内的不一样|手动添加模型 ID，和模型定价页完全一致|
|检查失败但实际能用（或者反过来）|「检查」走的路径和真实对话路径不一样（涉及 `/v1/models`）|以实际对话结果为准；模型列表拉不到就手动添加|
|旧版 API 主机自动补全乱七八糟|旧版本拼接逻辑有 bug|升级到最新版就好啦|

**官方参考**：[Chatbox 模型配置](https://docs.chatboxai.app/en/guides/providers)、[GitHub Issues](https://github.com/Bin-Huang/chatbox/issues)

---

## 3\. WorkBuddy / CodeBuddy（国产办公智能体）✅ 直接支持

**配置步骤**

1. 点击头像 → 设置 → 模型 → 添加模型。

2. 提供商选"自定义 / Custom"。

3. 接口地址填完整地址 `https://yeschoy.com/v1/chat/completions`。

4. API 密钥填 `请替换为你的密钥`。

5. 模型名称填完整模型 ID。

6. 第一次测试时先只开启"工具调用"；"图片输入"和"推理模式"仅在模型明确支持时开启。

> ⚠️ **注意：** 有"完整 URL / 自定义协议"开关时：填完整地址就打开，只填 `https://yeschoy.com/v1` 就关闭。两种只取一种，否则容易 404。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|保存后对话报 401|令牌分组没有该模型的权限|后台检查令牌分组；确认密钥复制完整|
|404 或路径错误|地址填写方式与"自定义协议"开关不匹配|按"两种只取一种"原则重填；重启客户端|
|`The reasoning_content in the thinking mode must be passed back to the API`|思考模式的多轮推理字段回传校验失败（CodeBuddy 已知问题，v2\.94\.3 前更常见）|升级到 v2\.94\.3\+；或临时关闭该模型的"Thinking"；或新开会话|
|普通对话正常，Agent 任务失败|工具调用不兼容，或"工具调用"能力没勾选|勾选"工具调用"；确认模型支持 function calling|
|文本正常、发图片就失败|模型不支持视觉，或"图片输入"勾错了|纯文本模型不要勾"图片输入"；需要看图换多模态模型|
|图形界面配置消失 / 不生效|配置文件写入失败或 JSON 格式错误|检查 `~/.workbuddy/models.json`（CodeBuddy Code 是 `~/.codebuddy/`）；用 `python3 -m json.tool` 校验|

**官方参考**：[腾讯云 WorkBuddy 自定义模型配置](https://intl.cloud.tencent.com/zh/document/product/1300/80640)

---

## 4\. LobeChat ✅ 直接支持

**配置步骤**

1. 优先用野菜后台一键导入。

2. 手动配置：打开设置 → 语言模型 → OpenAI（或自定义提供商）。

3. 密钥填 `请替换为你的密钥`，Base URL 填 `https://yeschoy.com/v1`。

4. 保存并测试。

**注意事项**

- 「OpenAI Compatible」自定义提供商**不会自动拉取模型列表，必须手动填写模型 ID**。

- 桌面/静态部署版本直连第三方时对 CORS 和 HTTPS 更敏感。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|401 Unauthorized|密钥复制带空格/换行，或密钥被禁用|重新粘贴；用 `curl -H "Authorization: Bearer sk-xxx" https://yeschoy.com/v1/models` 验证|
|模型列表不显示|不会自动拉取列表；或未保存、Base URL 漏 `/v1`|手动填模型 ID；确认已保存|
|`ERR_CONNECTION_REFUSED` / 404|Base URL 填错（漏端口、漏 /v1、把控制台地址当 API 地址）|先用 curl 验证地址可达性|
|`Blocked by CORS policy`|页面直连不支持 CORS 的后端|用网页部署版（走服务端转发）；或反代注入 CORS 头|
|页面 HTTPS 但请求被拦截|混合内容：中转站是 HTTP|中转必须走 HTTPS（野菜两条线路都是 HTTPS，检查是否手写成了 http）|
|流式输出一直等待/空白|中转流式格式不标准|换线路；升级 LobeChat|
|Docker 自部署连不上上游|容器内 localhost 指容器自身|野菜是公网地址不受影响；连本地服务才需 `host.docker.internal`|

**官方参考**：[LobeChat 文档](https://lobehub.com/docs)、[GitHub Issues](https://github.com/lobehub/lobe-chat/issues)

---

## 5\. NextChat ✅ 直接支持

**配置步骤**

1. 打开设置 → 自定义接口。

2. **接口地址填根域名 ****`https://yeschoy.com`**（NextChat 自己拼接 `/v1/chat/completions`，加了 `/v1` 反而 404）。

3. 密钥填 `请替换为你的密钥`。

4. 自定义模型填模型 ID。

**注意事项**

- 自定义模型用「\+模型名」添加（`CUSTOM_MODELS` 环境变量同理）；多个模型英文逗号分隔不加空格。

- 公网部署**必须设置访问密码（****`CODE`**** 环境变量）**，否则你的密钥会被陌生人刷爆。

- Vercel 部署改环境变量后必须 Redeploy 才生效。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|填完提示 404 或无响应|接口地址误加了 `/v1`（NextChat 自动拼接路径）|地址只填 `https://yeschoy.com`；两种写法各测一次|
|模型填了但下拉框看不到|自定义模型没加进模型列表；或被 `-all` 隐藏|用 `+模型ID` 显式添加|
|`the model has reached its context window limit`|上游模型上下文限制被忠实透出|清空上下文或换长上下文模型|
|`the socket connection was closed unexpectedly`|中转链路网络抖动/断流|重试；换大陆/海外线路|
|Vercel 改了环境变量不生效|没有重新部署|Redeploy；`MODEL` 字段与站内 ID 完全一致|

**官方参考**：[NextChat README\_CN](https://github.com/ChatGPTNextWeb/NextChat/blob/main/README_CN.md)

---

## 6\. Open WebUI ✅ 直接支持

**配置步骤**

1. 以管理员身份进入设置 → Connections → OpenAI → Manage → Add Connection。

2. URL 填 `https://yeschoy.com/v1`（Open WebUI 自己拼 `/chat/completions`，**不要填完整路径，密钥也不要带 Bearer 前缀**）。

3. 密钥填 `请替换为你的密钥`。

4. 模型留空自动读取（读不到手动添加）。

5. 保存并启用。

**注意事项**

- 环境变量 `OPENAI_API_BASE_URL` / `OPENAI_API_KEY` 与后台「Connections」配置**互相覆盖**，排查时确认实际生效的那份。

- 多连接用 `OPENAI_API_BASE_URLS`（分号分隔）。

- 长回复默认 5 分钟超时，可调环境变量 `AIOHTTP_CLIENT_TIMEOUT=600`。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|404 Not Found|Base URL 填成完整路径或多了一层 /v1|只填到 `https://yeschoy.com/v1` 为止|
|401 Unauthorized|密钥不完整、带空格、加了 Bearer 前缀|重新复制密钥，去掉 Bearer|
|模型列表不显示|`/v1/models` 请求失败或界面缓存|先 curl `/v1/models` 验证；不行就后台手动添加模型名|
|`Connection error`（宿主机通、容器不通）|容器 DNS/出网限制|`docker exec -it open-webui sh` 进容器 curl 测试|
|流式输出中断/超时|默认 300 秒超时不够；或反代缓冲|调大 `AIOHTTP_CLIENT_TIMEOUT`；Nginx 加 `proxy_buffering off`|

**官方参考**：[Open WebUI 环境变量](https://docs.openwebui.com/getting-started/env-configuration/)、[TROUBLESHOOTING](https://github.com/open-webui/open-webui/blob/main/TROUBLESHOOTING.md)

---

## 7\. DeepChat、AionUI、AI as Workspace、AMA 问天、OpenCat ✅ 直接支持

**配置步骤**

1. 优先用野菜后台一键导入。

2. 手动配置：类型选 OpenAI Compatible。

3. Base URL 填 `https://yeschoy.com/v1`。

4. 密钥填 `请替换为你的密钥`。

5. 模型填完整模型 ID。

---

## 8\. 沉浸式翻译 ✅ 直接支持

**配置步骤**

1. 打开设置 → 翻译服务 → OpenAI（或 OpenAI 兼容）。

2. 密钥填 `请替换为你的密钥`。

3. 自定义模型填模型 ID。

4. "自定义 URL"填完整地址 `https://yeschoy.com/v1/chat/completions`。

5. 用短网页测试。

**注意事项**

- **自定义 URL 必须填完整端点**（与其他客户端只填 Base URL 不同），照抄 Base URL 一定失败。

- 网页出错时页面上会出现"❗感叹号"，鼠标悬停可看到具体错误。

- "每秒最大请求数"默认 10，翻译电子书建议降到 5/秒以内。

- 支持英文逗号分隔多个密钥负载均衡，分隔符写错会整体失效。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|翻几段就报 429|网页翻译把文章拆成很多段落并发请求。注意 429 分两种：rate\_limit\_exceeded（太快）和 insufficient\_quota（欠费）——看到 429 别急着充值|每秒请求数降到 1 以下、同时翻译段落数调成 1；不要连续点重试|
|429 反复出现，换网络也没用|重试风暴：失败的请求也计入限流窗口|等一两分钟再试；降低并发|
|报 401|密钥错、令牌被禁用，或 URL 填错|重新复制密钥；自定义 URL 填完整端点|
|翻译失败/一直转圈|额度用尽或网络不通|悬停感叹号看具体错误；查余额；切换翻译服务对照|
|自定义模型下拉里没有想用的模型|服务不会自动拉取模型列表|手动输入完整模型 ID|

**官方参考**：[沉浸式翻译 OpenAI 配置](https://immersivetranslate.com/docs/services/openai/)、[官方 FAQ](https://immersivetranslate.com/docs/faq/)

---

## 9\. 流畅阅读（FluentRead）✅ 直接支持

**配置步骤**

1. 优先用后台一键配置。

2. 手动配置：添加"OpenAI 兼容"服务。

3. 地址填 `https://yeschoy.com/v1`（要求完整地址就填 `/v1/chat/completions` 完整地址）。

4. 填入密钥和模型 ID。

5. 短网页测试后再翻 PDF。

> ⚠️ **注意：** 遇 429 处理方式同沉浸式翻译：降并发、等一分钟再试。

---

## 10\. Bob（macOS）✅ 直接支持

**配置步骤**

1. 打开偏好设置 → 翻译 → 服务 → 添加 OpenAI 服务。

2. Bob 的 OpenAI 服务有**两个独立字段**：

    - 「自定义 API Base URL」填根地址 `https://yeschoy.com`

    - 「自定义 API Path」填 `/v1/chat/completions`

3. 密钥填 `请替换为你的密钥`。

4. 模型选"自定义模型"手工填完整 ID。

5. 短文本测试通过后再翻长文。

> ⚠️ **注意：** 两者拼起来才是完整端点。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|「接口响应错误」\+ 429|限流或额度耗尽（OpenAI 语义下欠费也返回 429）|先查余额再查 QPS，别只当限流处理|
|`Incorrect API key provided` 401|密钥带空格/换行、复制不完整|重新粘贴|
|翻译空结果/模型不存在|Bob 不拉取模型列表，模型填了展示名|选"自定义模型"手工填完整模型 ID|
|404|只填了 Base URL 没填 Path，或两个都填了完整路径|Base URL 填根地址 \+ Path 填 `/v1/chat/completions`，拼起来核对|
|插件「验证」失败但翻译正常|插件验证功能只针对官方 API 设计|可忽略，以实际翻译结果为准|

**官方参考**：[Bob OpenAI 服务文档](https://bobtranslate.com/service/translate/openai.html)

---

# 二、AI 编程 IDE 与插件

## 11\. Cline（VS Code）✅ 直接支持

**配置步骤**

1. 安装 Cline → 面板点齿轮。

2. API Provider 选 **OpenAI Compatible**（不是 OpenAI、不是 Anthropic、更不是 Ollama）。

3. Base URL 填 `https://yeschoy.com/v1`（结尾不要带斜杠）。

4. API 密钥填 `请替换为你的密钥`，模型 ID 填完整模型 ID（不要加前缀）。

5. 保存后让它读取一个小文件或解释一段代码。

**注意事项**

- Cline 直接字符串拼接 `baseURL + "/chat/completions"`、不做路径规范化，末尾斜杠会拼出 `/v1//chat/completions`。

- 老版本对推理模型会无条件发送 `temperature: 0` 导致 400，遇到就升级插件。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|`ECONNREFUSED 127.0.0.1:11434`|Provider 选错了（选成了 Ollama / 本地 Custom）|改选 OpenAI Compatible|
|无报错但一直卡住，Output 只有 Sending request\.\.\.|Base URL 末尾多了斜杠，拼出 `/v1//chat/completions`，异常响应体解析不了|去掉结尾斜杠|
|`API request failed: 400 Bad Request`，看不出原因|大概率是模型 ID 填了展示名|从模型定价页复制完整模型 ID|
|`API Streaming Failed: Cannot read properties of null`|流式响应末尾出现空数据块|升级插件版本；换线路|
|`Unsupported parameter: 'temperature'` / `'max_tokens' is not supported`|推理模型不支持这些参数（`max_tokens` 需改 `max_completion_tokens`）|升级到最新版 Cline（已做兼容）；或换模型|
|聊天能回复，但不能改文件、不执行命令|模型不支持工具调用，或流式工具调用格式不兼容|换明确支持原生 tool calling 的模型|
|报 does not support images|该模型不支持视觉输入|关闭图片输入，或换支持视觉的模型|

**官方参考**：[Cline OpenAI Compatible](https://docs.cline.bot/provider-config/openai-compatible)

---

## 12\. Roo Code（VS Code）✅ 直接支持

**配置步骤**

1. 同 Cline：选 OpenAI Compatible。

2. Base URL 填 `https://yeschoy.com/v1`。

3. 填入密钥和完整模型 ID。

**注意事项**

- Roo 不做路径规范化，Base URL 末尾别加 `/chat/completions`。

- 手动填 Max Output Tokens 和 Context Window（按野菜模型页填），不填会影响上下文管理。

- 建议插件版本 ≥3\.43。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|`XML tool calls are no longer supported`|新版 Roo 强制要求原生 function calling，模型输出 XML 工具标签直接报错|换明确支持原生 tool calling 的模型|
|401 Unauthorized|密钥复制带空格/换行/中文引号|重新复制|
|404 Not Found|Base URL 误加 `/chat/completions` 或漏了 `/v1`|检查 URL，Roo 不做规范化|
|模型表现异常|旧版插件对第三方 OpenAI 兼容端点兼容性差|升级到 3\.43\.0\+|
|模型能聊天不能改文件|模型不支持原生工具调用|换支持 tools/function calling 的模型|

**官方参考**：[Roo Code OpenAI Compatible](https://docs.roocode.com/providers/openai-compatible/)

---

## 13\. Kilo Code（VS Code / CLI）✅ 直接支持

**配置步骤**

1. 打开设置 → Providers → Add custom provider。

2. Provider ID 填 `yeschoy`，名称填"野菜 AI"。

3. **Provider API 选 OpenAI Compatible**（另有 Responses / Anthropic 选项，选错协议是 404 的常见根因）。

4. Base URL 填 `https://yeschoy.com/v1`，密钥填 `请替换为你的密钥`。

5. 自动获取模型（获取不到手动加）。

6. 选 `yeschoy/模型ID` 跑小任务。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|`max_tokens` 参数被拒 400|后端是 Azure/GPT\-5 系渠道，要求 `max_completion_tokens`|换模型；或用支持参数改写的渠道|
|自动模型检测失败|中转 `/v1/models` 不可达（野菜支持，通常说明 URL/密钥错）|核对地址和密钥；手动添加模型 ID|
|404 / 流式异常|Provider API 协议选错|选 OpenAI Compatible|
|能聊天但不能改文件|模型不支持工具调用|换明确支持工具调用的模型|

**官方参考**：[Kilo Code 自定义模型](https://kilo.ai/docs/ai-providers/openai-compatible)

---

## 14\. Continue（VS Code / JetBrains）✅ 直接支持

**配置步骤**

1. 编辑 `config.yaml`，填入以下配置：

```YAML
name: 野菜 AI
version: 1.0.0
schema: v1

models:
  - name: 野菜 AI 模型
    provider: openai
    model: 请替换为模型ID
    apiBase: https://yeschoy.com/v1
    apiKey: 请替换为你的密钥
    capabilities:
      - tool_use
```

2. 保存配置文件，重启 VS Code 窗口生效。

**注意事项**

- YAML 全程用 2 空格缩进（对 Tab 零容忍），数组项别漏 `-`，字段名大小写敏感（`apiKey` / `apiBase` / `contextLength`）。

- 不要同时存在 config\.yaml \+ config\.ts \+ config\.json，`config.ts` 优先级更高会劫持加载。

- 配置文件改动后重启 VS Code 窗口生效。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|`HTTP 404 Not Found from .../v1/responses`|新版 Continue 对 provider: openai 按模型自动选端点（GPT 系走 /responses、Claude 系走 /messages），`useResponsesApi: false` 在部分新版无法覆盖|优先选支持 Responses 端点的模型；不行就降级到 1\.2\.10 版本|
|`Failed to parse config: models.0: Invalid input`|数组缺 `-`、Tab 缩进、字段名大小写错|逐字段核对 schema；全 2 空格缩进|
|`ConfigValidationError: Invalid model configuration`|缺 `schema: v1` 头部或 roles 写法错|补全头部字段|
|`No models configured`|数组项缺 `-` 或缩进错|检查 YAML 结构|
|`Document config.yaml not found in AST tracker`|多份配置文件冲突|删除多余配置文件并清 sessions 缓存|

**官方参考**：[Continue 配置文档](https://docs.continue.dev/customize/model-providers/top-level/openai)

---

## 15\. Cursor ⚠️ 有限支持

**配置步骤**

1. 打开 Settings → Models。

2. 填入密钥。

3. 打开 Override OpenAI Base URL。

4. 填 `https://yeschoy.com/v1`。

5. 添加模型 ID。

6. 先用 Ask/Chat 测试。

**注意事项**

- **BYOK 必须 Pro 及以上套餐**；免费版连 Override 入口都不显示（静默隐藏，无任何报错）。

- **Override 全局生效**：开启后内置 GPT 也会被重定向、内置 Claude/Gemini 会挂。要用内置模型就手动关掉开关，两者不能共存。

- **请求从 Cursor 服务器发出**（不是你本机），所以中转必须公网可达——野菜满足；但不要指望 IP 白名单类方案。

- Verify 通过 ≠ 模型可用：Verify 只校验密钥和端点连通性，模型 ID 填错要等实际请求才报错。

- Tab 补全和 Apply 始终走 Cursor 自有模型，不受 Override 影响。

- Agent/Composer 模式发 Responses API 形状请求：只支持 Chat Completions 的模型 Chat 能用、Agent 可能失败。

- 已知 bug：切换开关后自定义端点不保存——只关「OpenAI API key」开关（别关 Override 开关），端点会保留。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|`Invalid model. The model xxx does not work with your current plan or api key`|免费/低价套餐 BYOK 不可用|升级 Pro|
|设置里找不到 Override 入口|免费版静默隐藏|升级套餐|
|内置模型突然不可用|Override 开着，把内置请求也重定向了|关闭 Override 开关|
|模型列表 Verify 绿勾但对话报错|模型 ID 错，Verify 不校验模型|核对完整模型 ID|

**官方参考**：[Cursor 论坛已知 bug 汇总](https://forum.cursor.com/t/fresh-bugs-with-custom-model/148815)、[LiteLLM Cursor 集成限制说明](https://docs.litellm.ai/docs/tutorials/cursor_integration)

---

## 16\. Windsurf ❌ 不建议 / 不能直连

Windsurf 官方 BYOK 面向官方 Provider Key，**没有面向任意 OpenAI 兼容中转的通用 Base URL 通道**。编辑器内 Custom Endpoint 存在「静默 fallback」：配置错了不报错、直接悄悄走默认模型，让人以为配置成功了。

**如何验证 override 是否真的生效**：故意填一个不存在的模型 ID，如果还能正常对话，说明配置根本没生效。

**静默 fallback 三坑**

|现象|原因|怎么办|
|---|---|---|
|填错模型名也不报错|Model Name 填了展示名/自造名，静默走默认模型|填站内完整模型 ID，并用"假模型名"法验证|
|自定义端点配完等于没配|Base URL 末尾带 `/chat/completions`，双重拼接 404 被吞掉|Base URL 只填到 `/v1`|
|401 但密钥确认没错|apiKey 字段带了 `Bearer` 前缀，请求头变成 `Bearer Bearer sk-...`|密钥只填 `sk-...` 本体|
|长文件补全被截断|context\_window 填 128000 不稳定|按 60000–64000 填测试|
|Tab 补全不是你选的模型|Tab 补全永远走 Windsurf 自有模型|属官方设计，无法改变|

> 当前建议：稳定接第三方接口用 Cline、Roo Code、Continue 或 Trae。

**官方参考**：[Windsurf 模型与 BYOK 说明](https://docs.windsurf.com/windsurf/models)

---

## 17\. ZCode（智谱 Z\.ai 桌面编程客户端）✅ 直接支持

ZCode 是智谱推出的桌面 Agentic 开发环境（ADE，macOS / Windows，Linux 内测），支持添加任何兼容 Anthropic / OpenAI 协议的自定义供应商。

**配置步骤（图形界面）**

1. 点击对话框中的模型名称 → 模型选择器 → 底部"管理模型"，进入 Agents 设置/模型面板。

2. 左侧提供商列表底部点"添加提供商"。

3. 名称填"野菜 AI"；Base URL 手动输入：OpenAI 协议填 `https://yeschoy.com/v1`；Anthropic 协议填 `https://yeschoy.com`（**不带 ****`/v1`****，带了会报错**）。

4. API 密钥填 `请替换为你的密钥`。接口地址确认后系统会自动拉取模型列表（野菜支持 `/v1/models`），需要时再手动补充模型 ID。

5. 开启启用开关，在模型选择器中选模型测试。

**配置步骤（配置文件方式）**

首次通过 UI 完成任意配置后，`~/.zcode/v2/config.json` 会自动生成，在 provider 对象中追加：

```JSON
"yeschoy": {
  "name": "野菜 AI",
  "kind": "openai-compatible",
  "options": {
    "apiKey": "请替换为你的密钥",
    "baseURL": "https://yeschoy.com/v1",
    "apiKeyRequired": true
  },
  "enabled": true,
  "source": "custom",
  "models": {
    "请替换为模型ID": {
      "limit": { "context": 128000, "output": 8192 },
      "modalities": { "input": ["text"], "output": ["text"] }
    }
  }
}
```

Anthropic 协议把 kind 改为 `"anthropic"`、baseURL 改为 `https://yeschoy.com`。context / output 上限按野菜模型定价页填写；多模态模型 input 加 `"image"`。

**注意事项**

- `options` 只识别 `apiKey`、`baseURL`、`apiKeyRequired`、`headers` 等白名单字段；手动加入 `reasoning_effort` 等其他字段**会被静默丢弃且不报错**。

- ZCode 默认不读系统 `HTTP_PROXY` 环境变量，代理以设置页内配置为准，改完需重启。

- API 密钥明文存于 config\.json，注意文件不要外发。

- 套餐内置模型的上下文窗口本地改不动（同步会恢复官方值）；自定义供应商的模型可以改。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|400 参数错误（选最高思考档位时）|同名模型的第三方部署接受的思考档位与官方端点不一致|改选 `high` 档|
|Anthropic 类型接入报错|Base URL 带了 `/v1` 后缀|Anthropic 协议只填 `https://yeschoy.com`|
|手动加的模型参数不生效|options 白名单外字段被静默丢弃|只写文档列出的字段；思考档位在界面里设置|
|`Model config is missing`|顶层 model 字段缺 `provider/model` 引用格式|检查 config\.json 顶层 model 字段|
|图片发送失败|纯文本模型未声明 image 能力|config\.json 模型 modalities 的 input 加 `"image"`|
|模型列表不自动加载|自定义供应商添加后未触发拉取|手动「添加模型」补 ID|

**官方参考**：[ZCode 配置文档](https://zcode.z.ai/docs/configuration)

---

## 18\. Qoder（阿里）✅ 直接支持

Qoder 桌面端支持自定义 OpenAI 兼容模型。

**配置步骤（桌面端）**

1. 点击右上角用户头像 → 用户设置 → Qoder 设置 → 模型 → 添加。

2. Provider 选择"自定义 OpenAI 兼容接口"。

3. Base URL 填 `https://yeschoy.com/v1`；模型 ID 填完整模型 ID；API 密钥填 `请替换为你的密钥`。

4. 保存后模型不会自动启用，**要在对话框模型选择器里手动切换到刚添加的模型**。

**配置步骤（Qoder CLI）**

启动后输入 `/model` → Tab 切到 Custom 标签 → Add custom model → 依次填模型类型（chat）、模型 ID、API 密钥、Base URL，点 Validate 验证。CLI 配置存于 `~/.qoder/settings.json`。

**注意事项**

- **CLI 的 Custom 标签只支持固定供应商**（百炼、DeepSeek、智谱、Kimi、MiniMax、小米 MIMO），接第三方中转请用桌面端（0\.1\.8\+ 的 BYOK 才支持自定义 Base URL）。

- 设置里找不到「模型」选项：未登录，或版本低于 0\.16\.0，先更新。

- 自定义模型仅支持文本生成类模型，图像/音频模型选了无法通过校验。

- 自定义模型费用由野菜账户直结，不占 Qoder 内置额度。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|接入后仍提示「您已达到配额上限」|配置完没有切换到自定义模型，仍在用 Qoder 内置模型|模型选择器切到自定义模型|
|添加模型失败|密钥带空格、密钥被禁用、余额不足或网络问题|逐项排查：密钥 → 余额 → 网络|
|找不到自定义模型入口|版本过低（桌面端自定义模型需 0\.7\.1\+，CLI 模型面板建议 0\.16\.0\+）|升级版本|
|Validate 失败|Base URL 层级错或模型 ID 错|Base URL 填到 `/v1`；ID 与定价页一致|

**官方参考**：[Qoder 官网](https://qoder.com)、[CLI 模型文档](https://docs.qoder.com/zh/cli/model)

---

## 19\. Junie（JetBrains）✅ 直接支持

JetBrains AI Assistant 已上线 BYOK，支持任意 OpenAI 兼容供应商，AI Chat 和 Junie 都可用，无需 JetBrains AI 订阅。

**配置步骤**

1. 打开 Settings → Tools → AI Assistant → 提供商与 API 密钥。

2. 选"自带密钥" → 选"兼容 OpenAI"。

3. Base URL 填 `https://yeschoy.com/v1`，密钥填 `请替换为你的密钥`。

4. **「Tool calling」选支持**。

5. 选模型测试。

**注意事项**

- AI Assistant 会强制请求 `GET /v1/models`（官方已知 issue LLM\-22911：它还会擅自改写 URL 路径版本），野菜支持该端点所以没问题；Test Connection 失败先 curl 验证 `/v1/models`。

- Test Connection 通过 ≠ 全部功能可用：官方明确「部分功能依赖特定模型」，BYOK 模型不支持的功能会直接消失（不报错）。

- 内联补全默认仍走 JetBrains 模型，BYOK 不自动覆盖。

- 本地/自定义模型默认 context window 64000 tokens，长上下文任务手动调大。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|Test Connection 报 failed to connect|客户端强拉 `/v1/models` 失败，或 URL 被改写|核对 Base URL 到 `/v1`；确认密钥无空格|
|Junie 无法执行 Agent 任务|Tool calling 开关没开，或模型不支持工具调用|开关选支持；换支持 function calling 的模型|
|部分 AI 功能消失|功能依赖特定模型，BYOK 模型不支持|属正常行为，换模型|
|长上下文任务异常|默认上下文 64000|手动调大上下文设置|

**官方参考**：[JetBrains BYOK 文档](https://www.jetbrains.com/help/ai-assistant/bring-your-own-key-byok.html)

---

## 20\. Kiro、Antigravity、GitHub Copilot：为什么暂不能直连 ❌ 不建议 / 不能直连

|工具|现状|结论|
|---|---|---|
|Kiro（AWS）|官方模型列表来自 Bedrock 及合作模型，未开放自定义 OpenAI 兼容供应商|不能直接接野菜 AI；社区有通过 MCP 桥接的进阶玩法，新手建议用 Cline / Kilo Code|
|Antigravity（Google）|官方仅支持 Gemini，无自定义 Base URL 入口|不能直接接野菜 AI；社区有 TLS 代理方案，但属于篡改请求的非官方玩法，有账号风险，本站不提供支持|
|GitHub Copilot|官方 BYOK 仅限特定范围，无法指定任意中转地址|不能直接接野菜 AI|

遇到"教程说能接"的说法，先看它是不是要求你安装第三方代理、改 hosts、伪造登录——这类做法风险自担。

---

# 三、终端 Agent 与 CLI

## 21\. Claude Code 🔄 协议转换

Claude Code 使用 Anthropic Messages 协议。野菜 AI 已支持 Anthropic 原生端点，并通过协议转换让 Claude Code 直接使用站内全部模型（不限于 Claude 系模型）。

> ⚠️ **注意：** Anthropic 协议的 Base URL 不带 `/v1`。

**配置步骤（macOS / Linux）**

```Bash
export ANTHROPIC_BASE_URL="https://yeschoy.com"
export ANTHROPIC_AUTH_TOKEN="请替换为你的密钥"
export ANTHROPIC_MODEL="请替换为模型ID"
export ANTHROPIC_SMALL_FAST_MODEL="请替换为模型ID"   # 辅助小模型，建议选便宜模型

claude
```

**配置步骤（Windows PowerShell）**

```PowerShell
$env:ANTHROPIC_BASE_URL="https://yeschoy.com"
$env:ANTHROPIC_AUTH_TOKEN="请替换为你的密钥"
claude
```

**配置步骤（写入 settings\.json）**

也可写入 `~/.claude/settings.json`：

```JSON
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://yeschoy.com",
    "ANTHROPIC_AUTH_TOKEN": "请替换为你的密钥"
  }
}
```

**注意事项**

- 环境变量和 settings\.json 同时存在时优先级不直观；旧终端不读新变量。改完配置永远先开新终端，再跑 `/doctor` 和 `/status` 确认。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|404，但地址没填错|Base URL 多写了 `/v1`，请求变成 `/v1/v1/messages`|ANTHROPIC\_BASE\_URL 只填 `https://yeschoy.com`，去掉 `/v1`|
|401 invalid x\-api\-key|密钥带空格/换行；或手动加了 Bearer 前缀（Claude Code 会自动补认证头）|重新完整复制密钥；去掉手写的 Bearer|
|启动就报 This organization has been disabled，但账号正常|电脑里残留了旧的 ANTHROPIC\_API\_KEY 等环境变量（以前接过的平台），优先级压过新配置|`env | grep -i anthropic` 查看实际生效值；unset 旧变量或从 \~/\.zshrc 删旧行，开新终端|
|配置改了但不生效|环境变量和 settings\.json 同时存在时优先级不直观；旧终端不读新变量|开新终端；跑 /doctor 和 /status|
|model not found|模型 ID 手写错，或令牌分组无权限|从定价页复制粘贴完整 ID；后台确认令牌分组|
|返回 HTML 而不是 JSON|地址路径错了，或被代理/WAF 拦截|Base URL 只填域名；临时关代理|
|529 Overloaded / 429 / 5xx|服务端或上游繁忙|稍等重试；持续出现带时间反馈|

**官方参考**：[Claude Code LLM Gateway 配置](https://docs.anthropic.com/en/docs/claude-code/llm-gateway)、[Claude Code 故障排除](https://docs.anthropic.com/en/docs/claude-code/troubleshooting)

---

## 22\. Gemini CLI 🔄 协议转换

Gemini CLI 使用 Gemini 原生协议，Base URL 不带 `/v1`。

**配置步骤**

```Bash
export GEMINI_API_KEY="请替换为你的密钥"
export GOOGLE_GEMINI_BASE_URL="https://yeschoy.com"
gemini
```

登录方式选 Gemini API Key，用 `/model` 切换。海外线路换 `https://api.yeschoy.com`。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|API key not valid / 401|GEMINI\_API\_KEY 没生效，或填了官方 Google Key|`echo $GEMINI_API_KEY` 确认；开新终端|
|404 NOT\_FOUND|Base URL 多写了 `/v1` 或 `/v1beta`|去掉所有路径后缀|
|403 PERMISSION\_DENIED|令牌分组无该模型权限|检查令牌分组|
|429 RESOURCE\_EXHAUSTED|触发限流|稍等重试；降并发|
|500 INTERNAL 且输入很长|上下文过长|精简输入或换长上下文模型|
|504 DEADLINE\_EXCEEDED|处理超时|调大超时|

**官方参考**：[Gemini CLI 配置](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md)、[Gemini API 问题排查](https://ai.google.dev/gemini-api/docs/troubleshooting)

---

## 23\. Codex CLI / Codex 桌面端 🔄 协议转换

Codex 使用 **Responses API**，只有当模型明确支持 `/v1/responses`（见模型定价页端点列表）时才配置。

**配置步骤**

编辑 `config.toml`：

```Plaintext
model = "请替换为支持Responses的模型ID"
model_provider = "yeschoy"

[model_providers.yeschoy]
name = "野菜 AI"
base_url = "https://yeschoy.com/v1"
env_key = "YESCHOY_API_KEY"
wire_api = "responses"
```

启动前设置环境变量 `YESCHOY_API_KEY`。

> ⚠️ **注意：** `model =` 必须填完整模型 ID（不填 Codex 默认发短名，服务端没有短名映射）。如果反复失败，改用 Cline、Roo Code、OpenCode 或 Trae，不要反复改地址碰运气。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|`Error loading config.toml: wire_api = "chat" is no longer supported`|新版 Codex 已移除 Chat Completions 模式|wire\_api 必须用 "responses"|
|`404 .../v1/responses`|模型不支持 Responses 协议，或 base\_url 末尾多写了 /v1|换支持 Responses 的模型；检查 base\_url|
|一启动就 503、无可用渠道|model = 没写，Codex 默认发短名|model = 必须填完整模型 ID|
|401 Unauthorized|用错密钥或复制带空格|确认 env\_key 指向的变量已设置|
|Windows 报 schannel / SEC\_E\_UNTRUSTED\_ROOT|系统根证书过期|管理员 CMD：`certutil -generateSSTFromWU roots.sst` 再 `certutil -addstore -f Root roots.sst`|
|工具调用反复循环|Responses 协议下部分模型工具调用格式有差异|换明确支持 Responses \+ 工具调用的模型；或改用 Cline、OpenCode|

**官方参考**：[Codex 配置参考](https://developers.openai.com/codex/config-file/config-reference)

---

## 24\. OpenCode ✅ 直接支持

**配置步骤**

1. 先运行 `/connect` → 选 Other → 设提供商 ID（如 `yeschoy`）。

2. 编辑 `opencode.json` 配置：

```JSON
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "yeschoy": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "野菜 AI",
      "options": {
        "baseURL": "https://yeschoy.com/v1",
        "apiKey": "请替换为你的密钥"
      },
      "models": {
        "请替换为模型ID": {
          "name": "野菜 AI 模型"
        }
      }
    }
  }
}
```

3. 重启 → `/models` → 选 `yeschoy/模型ID`。

**注意事项**

- OpenAI\-compatible provider **不会自动拉取模型列表**，`models` 下必须手动声明。

- `model` 字段格式是 `provider_id/model_id`，前缀必须与 provider 的 key 完全一致。

- `model` 字段里给模型声明 `context_window` 等上限，否则长对话会被保守默认值提前截断。

- 配置文件有语法错误时会**静默回退默认配置**，不报错——保留 `$schema` 字段让编辑器帮你校验。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|模型列表为空|没有手动声明 models，或 JSONC 结构写错|补全 models 对象；用 $schema 校验|
|`provider not found` / 模型选不中|model 前缀与 provider key 不一致|两处名字逐字符一致|
|404 Not Found|baseURL 少了 `/v1`|填 `https://yeschoy.com/v1`|
|`No credentials found for provider`|没配 apiKey|options 里写 apiKey，或 `opencode auth login`|
|长对话被提前截断|未声明 context\_window|在模型条目里设置上下文上限|

**官方参考**：[OpenCode 自定义提供商](https://opencode.ai/docs/providers)

---

## 25\. Trae / TraeCode CLI（国产编程工具）✅ 直接支持

**配置步骤（图形界面）**

1. 打开设置 → 模型 → 添加模型。

2. API 格式选 OpenAI。

3. Base URL 填 `https://yeschoy.com/v1`。

4. 密钥填 `请替换为你的密钥`。

5. 模型填完整 ID。

**配置步骤（TraeCode CLI）**

用 `traecli config edit` 编辑全局配置 `trae_cli.yaml`：

```YAML
models:
  - name: "野菜 AI"
    open_ai:
      base_url: https://yeschoy.com/v1
      api_key: "请替换为你的密钥"
      model: "请替换为模型ID"
      by_azure: false
```

TraeCode CLI 同时支持 Claude 协议（`claude:` 配置块），可接入野菜 AI 的 Anthropic 原生端点：base\_url 填 `https://yeschoy.com`（不带 `/v1`）。企业版需在 TRAE 企业版控制台打开"是否允许成员添加自定义模型"开关。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|请求 404、路径变成 Azure 格式|`by_azure: true` 时按 Azure API 规范构造请求（照抄示例忘改）|显式写 `by_azure: false`|
|IDE/SOLO 内报 `模型请求失败 (4054) Custom model internal error occurred`|IDE 里添加的自定义模型经 TRAE 官方代理转发，代理与中转兼容性失败|改用 **TraeCode CLI** 直连（trae\_cli\.yaml 的 open\_ai 块不走代理）|
|连接失败|base\_url 少 `/v1` 或多拼了 `/chat/completions`|CLI 的 base\_url 填到 `/v1` 为止|
|企业版看不到添加入口|管理员未开自定义模型权限|企业控制台开启开关|

**官方参考**：[TraeCode CLI 自定义模型](https://docs.trae.cn/cli_model)

---

## 26\. Aider ✅ 直接支持

**配置步骤（macOS / Linux）**

```Bash
export OPENAI_API_BASE="https://yeschoy.com/v1"
export OPENAI_API_KEY="请替换为你的密钥"
aider --model openai/请替换为模型ID
```

**配置步骤（Windows PowerShell）**

```PowerShell
$env:OPENAI_API_BASE="https://yeschoy.com/v1"
$env:OPENAI_API_KEY="请替换为你的密钥"
aider --model openai/请替换为模型ID
```

**注意事项**

- 模型名**必须带 ****`openai/`**** 前缀**（Aider 底层是 litellm，靠前缀路由）。

- 中转模型不在 Aider 内置元数据表里时，上下文窗口按保守默认值计算，长会话会提前截断——用 `--model-metadata-file`（JSON，声明 max\_input\_tokens / max\_output\_tokens）修正。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|`litellm.AuthenticationError` 401，且请求打到了 api\.openai\.com|只设了 \-\-model 没设 OPENAI\_API\_BASE，按官方 OpenAI 路由了|先 export OPENAI\_API\_BASE 再启动|
|404 Not Found|OPENAI\_API\_BASE 少写或多写 `/v1`|OpenAI 兼容接入必须带 `/v1`|
|`Unknown model` / 上下文算错|不带 `openai/` 前缀或模型不在内置表|加前缀；用 \-\-model\-metadata\-file 声明元数据|
|`This model's maximum context length is exceeded`|上下文窗口按默认小值计算|同上，补元数据文件|
|警告 `does not support function calling`|Aider 能力表里没有该模型，保守处理|属警告仍可用；确认模型确实支持工具调用|
|`litellm.BadRequestError`（参数 400）|中转不支持 litellm 发送的某个参数|降低参数（如 \-\-temperature）；换模型对照|
|`No module named litellm`|安装损坏或版本过旧|`python -m pip install -U aider-install && aider-install`|

**官方参考**：[Aider OpenAI 兼容接口](https://aider.chat/docs/llms/openai-compat.html)、[FAQ](https://aider.chat/docs/faq.html)

---

## 27\. Qwen Code ✅ 直接支持

**配置步骤**

1. 编辑 `~/.qwen/settings.json`：

```JSON
{
  "modelProviders": {
    "openai": [
      {
        "id": "请替换为模型ID",
        "name": "野菜 AI",
        "envKey": "YESCHOY_API_KEY",
        "baseUrl": "https://yeschoy.com/v1"
      }
    ]
  }
}
```

2. 启动前设置 `YESCHOY_API_KEY` 环境变量。

3. 用 `/model` 选择。

**注意事项**

- `envKey` 填的是**环境变量名**，不是密钥本身；变量名要与实际 export 的名字逐字符一致。

- 自定义 provider 要生效，认证方式需切换为 openai（`/auth` 确认），改完重启会话。

- 旧版包装格式已废弃，请用裸数组写法。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|`OPENAI_API_KEY environment variable not found`|envKey 指定的环境变量没导出|export 后重启；或写进 settings\.json 的 env 块|
|配置后仍走原认证/模型没变|认证类型没切换或没重启会话|`/auth` 确认；重启 qwen|
|自定义 provider 不出现在 /model 列表|modelProviders 结构写错（漏 envKey 等）或版本过旧|对照官方示例核对；升级到最新版|
|404|baseUrl 少 `/v1`|填 `https://yeschoy.com/v1`|
|请求参数 400（thinking 相关）|中转不支持 Qwen 特有参数|去掉模型条目里的自定义参数（extra\_body）|

**官方参考**：[Qwen Code 模型提供商](https://qwenlm.github.io/qwen-code-docs/zh/users/configuration/model-providers/)

---

## 28\. Pi Coding Agent（轻量、可扩展的终端 Agent）✅ 直接支持

**配置步骤**

1. 安装：

```Bash
npm install -g @mariozechner/pi-coding-agent
```

2. 创建或编辑 `~/.pi/agent/models.json`：

```JSON
{
  "providers": {
    "yeschoy": {
      "baseUrl": "https://yeschoy.com/v1",
      "api": "openai-completions",
      "apiKey": "$YESCHOY_API_KEY",
      "authHeader": true,
      "models": [
        {
          "id": "请替换为模型ID",
          "name": "野菜 AI 模型",
          "contextWindow": 128000,
          "maxTokens": 8192
        }
      ]
    }
  }
}
```

3. 设置 `YESCHOY_API_KEY` 环境变量后运行 `pi`。

4. 输入 `/model` 选择 `yeschoy/模型ID`。

海外线路只改 baseUrl。修改 models\.json 后重开 `/model` 即生效。

**注意事项**

- **apiKey 值带 ****`$`**** 才表示环境变量**（`"$YESCHOY_API_KEY"`）；不带 `$` 的大写字符串会被当作字面量密钥。也支持 `"!command"` 从密码管理器取值。

- **Pi 不读取 OPENAI\_API\_BASE 等环境变量**来注册自定义端点，必须走 models\.json。

- 未显式声明时上下文窗口默认 128000、最大输出默认 16384，长任务请按野菜模型页填真实值。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|模型加载了但 /model 里不可用（变灰）|没配 apiKey（本地服务也要填占位值）|补 apiKey 字段|
|401 且密钥确认正确|环境变量写成了裸字符串（被当字面量）|写成 `"$YESCHOY_API_KEY"`|
|400 报错提到 `developer` role|兼容性差异：服务不认识该角色|模型条目加 `"compat": { "supportsDeveloperRole": false }`|
|报错提到 `reasoning_effort`|服务不支持该字段|加 `"compat": { "supportsReasoningEffort": false }`|
|404|baseUrl 少 `/v1`|填到 `/v1`|
|上下文/输出被提前截断|未声明 contextWindow / maxTokens|在模型条目显式声明真实上限|

**官方参考**：[Pi 供应商配置](https://pi.dev/docs/latest/providers)、[GitHub 仓库](https://github.com/badlogic/pi-mono)

---

## 29\. Crush（终端编程 Agent）✅ 直接支持

**配置步骤**

```Bash
provider add yeschoy --type openai-compat \
  --base-url "https://yeschoy.com/v1" \
  --api-key "$YESCHOY_API_KEY"
```

再用 `model add` 添加模型。模型 ID 与定价页完全一致；上下文长度、最大输出以野菜模型页为准（每个模型显式声明 `context_window` 和 `default_max_tokens`，思考模型设 `can_reason: true`）。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|401 / 密钥为空|crush\.json 里写了 `"$VAR"` 引用，但启动 crush 的 shell 没导出该变量|同一 shell 会话里 export 后再启动|
|404|base\_url 少/多 `/v1`|填 `https://yeschoy.com/v1`|
|模型不出现/上下文异常小|models\[\] 未声明 context\_window、default\_max\_tokens|逐模型显式声明|
|请求参数 400（thinking）|can\_reason 未按模型能力设置|思考模型 true，非思考模型不设|
|升级后字段报错|v0\.x 字段名变更快（如 max\_tokens → default\_max\_tokens）|以 `https://charm.land/crush.json` schema 校验修正|

**官方参考**：[Crush 官方项目](https://github.com/charmbracelet/crush)、[配置 schema](https://charm.land/crush.json)

---

## 30\. DeepSeek Harness（dsh）✅ 直接支持

dsh 是 DeepSeek 开源的 Agent 运行框架（Agent = 模型 \+ Harness），提供 Web UI 与 headless 两种运行方式，原生支持 OpenAI 兼容协议。它处于开发者预览阶段：配置入口变化快、升级后旧配置可能失效，遇到报错先升级到最新版再排查。

**安装启动**（Node\.js ^22\.19\.0 或 \>=24\.0\.0）：

```Bash
npx @deepseek-ai/dsh web
```

浏览器打开 `http://127.0.0.1:3080`。首次安装慢可切国内镜像：`npm config set registry https://registry.npmmirror.com`。

### 方式一：Web UI 添加自定义 Provider（推荐新手）

**配置步骤**

1. 打开 Settings → Models → Add a custom provider。

2. Provider ID 填 `yeschoy`（小写，创建后不可修改；删除会连带丢失引用它的历史会话）。

3. Base URL 填 `https://yeschoy.com/v1`；API protocol 选 `openai-completions`（模型支持 Responses 端点时也可选 `openai-responses`）。

4. API 密钥填 `请替换为你的密钥`（保存后存于本地 `$DSH_HOME/.credentials.yaml`，界面不回显明文，属正常设计）。

5. Model catalog 点 Fetch available models 自动拉取（野菜支持 `/v1/models`），失败就手动输入完整模型 ID。

6. Save 后回对话页选中模型。

### 方式二：编辑 settings\.yaml

编辑 `~/.dsh/settings.yaml`：

```YAML
agent-default-model:
  provider: yeschoy
  model: 请替换为模型ID

llm-pi-ai:
  providers:
    yeschoy:
      api: openai-completions
      baseURL: https://yeschoy.com/v1
      apiKeyEnv: YESCHOY_API_KEY   # 注意：填环境变量名，不是密钥本身
      models:
        - id: 请替换为模型ID
        # 多模态模型需显式声明：
        # - id: 多模态模型ID
        #   input: [text, image]
```

```Bash
export YESCHOY_API_KEY="请替换为你的密钥"
npx @deepseek-ai/dsh web
```

### 方式三：复用内置 DeepSeek 路由（仅限 DeepSeek 官方同名模型）

```Bash
export DEEPSEEK_API_KEY="请替换为你的密钥"
export DEEPSEEK_BASE_URL="https://yeschoy.com/v1"
npx @deepseek-ai/dsh web
```

模型 ID 原样透传，必须与站内 DeepSeek 官方模型名完全一致，否则报 UNKNOWN\_MODEL。

### 思考强度（Effort）怎么选

很多用户发现接了第三方中转后，输入框没有 Effort（思考强度）选择行。原因：手工添加的第三方 OpenAI 兼容模型默认不声明推理档位（reasoningEfforts），dsh 据此决定是否显示 Effort 选择器——**这是 dsh 的设计，不是中转站的限制**。解决办法：

1. 安装社区声明插件（推荐）：

```Bash
dsh plugin --profile web add dsh-plugin-effort-declare
```

2. 重启后在 设置 → 推理档位 中为模型勾选可选档位（low/medium/high 等，网关档位命名不同时可修改线上拼写；也可在此声明图片输入）。之后对话输入框就会出现 Effort 行。

3. 或编辑 settings\.yaml 在模型上声明 reasoningEfforts（格式以官方 providers 文档为准）。

模型本身不支持推理控制时没有档位可选——换支持推理控制的模型。

> ⚠️ **注意：** 高思考强度会显著增加 Token 消耗和响应时间。

**dsh 高频报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|MISSING\_CREDENTIAL|密钥没保存，或 apiKeyEnv 指定的环境变量没注入|Models 页重新保存；确认已 export 对应变量名并重启。apiKeyEnv 填环境变量名，写成 apiKey: sk\-xxx 不支持|
|UNKNOWN\_MODEL|模型 ID 没加进 models 列表；或会话引用了已删除的 Provider|补模型 ID；误删 Provider 要用完全相同的 ID 重建才能恢复旧会话|
|Fetch models 报 401/404|密钥错，或服务端不支持 /v1/models|野菜支持该接口，401 通常是密钥带了空格；仍失败就手动填|
|密钥正确但网关拒绝每个请求|请求格式兼容性差异（developer 角色、max\_tokens 字段等）|先 curl 验证密钥和端点；再调 compat 开关（如 supportsDeveloperRole、maxTokensField）|
|只有推理模型失败|dsh 发送 developer 角色，部分上游不认|调 compat 开关改写 role；或换非推理模型对照|
|图片发送前被拒|模型未声明图片能力|settings\.yaml 给模型加 input: \[text, image\]；或用插件勾选|
|改了配置不生效 / 改一个字段别的回默认|patch 替换整行而非合并；多层配置互相覆盖|dsh \-\-dump\-config 看最终生效值；同一行字段写全|
|升级后配置/会话异常|npx 缓存静默跑旧版；rc 版本间存储格式不兼容|`npx @deepseek-ai/dsh@latest web` 强制最新；清理 \~/\.cache/dsh；必要时备份后重置 \~/\.dsh|
|端口被占（3080）|本地 3080 已被占用|`dsh --profile web --port 8080`|
|Windows 启动报 bash 相关错误|dsh 执行栈在 Windows 用 pwsh|保持默认执行栈配置|
|plugin tree failed to load|插件依赖或 patch 配置错|dsh \-\-dump\-config 定位；检查 cordis\.patch\.yml 语法|

> dsh 处于开发者预览阶段，官方明确警告会有破坏性变更。升级、重置前先备份 `~/.dsh`；不要把重要生产任务完全交给预览版工具无人值守运行。

**官方参考**：[DeepSeek Harness 官方仓库](https://github.com/deepseek-ai/DeepSeek-Harness)

---

## 31\. OpenHands ✅ 直接支持

**配置步骤**

1. 打开 Settings → LLM → Advanced。

2. **Custom Model 必须填 ****`openai/完整模型ID`****（带 openai/ 前缀）**。

3. Base URL 填 `https://yeschoy.com/v1`。

4. API 密钥填 `请替换为你的密钥`。

5. 保存后先派只读小任务。

模型需支持工具调用。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|`Unsupported model` / `Invalid model name`|模型没加 `openai/` 前缀，litellm 按内置厂商路由|改成 `openai/模型ID`|
|404 模型未找到|Base URL 填错|填到 `/v1` 为止|
|401 认证失败|密钥错或被删除|核对/重建密钥|
|429 Token usage exceeded quota|模型名称错或令牌分组无权限|核对模型 ID 和分组|
|连接失败（Docker 部署）|后端容器发出的请求，localhost 指容器自身|野菜是公网地址不受影响；连本地服务用 host\.docker\.internal|
|`LLMContextWindowExceedError`|会话超长|配置 condenser 压缩；或缩短输入/重置会话|

**官方参考**：[OpenHands 文档](https://docs.all-hands.dev)

---

## 32\. Warp（AI 终端 / Agent CLI）⚠️ 有限支持

**配置步骤（Warp 终端）**

1. 打开 Settings → AI → Custom Model / BYOK。

2. 类型选 OpenAI Compatible。

3. API Base URL 填 `https://yeschoy.com/v1`。

4. 密钥填 `请替换为你的密钥`。

5. 模型填完整 ID。

**配置步骤（Warp Agent CLI）**

```Bash
curl -fsSL https://app.warp.dev/download/agent-cli | bash
warp
```

启动后选"自带 API Key / OpenAI 兼容端点"。

**注意事项（Warp 的机制限制较多）**

- 自定义推理端点**必须是公网可达的 HTTPS URL**：localhost、内网地址在配置时直接被拒（野菜满足）。

- **Auto 模型永远走 Warp 自家 credits**，即使配了 BYOK——必须手动选带钥匙图标的具体模型。

- **Cloud Agents（云端运行）用不了 BYOK**，一律消耗 Warp credits。

- BYOK 只覆盖模型推理调用；Codebase Context 等功能照常扣 Warp credits。

- 密钥无效时请求直接中断，不会自动降级到 credits（可手动开启 fallback）。

- 自定义端点只支持 OpenAI Chat Completions 协议。

- 密钥架构：密钥存本地，但每次请求经 Warp 后端中转到你的端点（Warp 不存储）。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|端点被拒绝保存|填了 localhost / 内网地址|填公网 HTTPS 地址（野菜直接可用）|
|配了 BYOK 还在扣 Warp credits|选了 Auto 模型，或用的是 Cloud Agent|手动选带钥匙图标的模型|
|请求直接中断|密钥无效，默认不 fallback|检查密钥；或开启 Warp credit fallback|
|Anthropic 协议中转连不上|自定义端点只支持 OpenAI Chat Completions|野菜用 OpenAI 兼容地址 `/v1` 即可|

**官方参考**：[Warp BYOK 文档](https://docs.warp.dev/agents/inference/bring-your-own-api-key)、[自定义推理端点](https://docs.warp.dev/agents/inference/custom-inference-endpoint)

---

## 33\. Hermes Agent（Nous Research）✅ 直接支持

**配置步骤**

1. 安装（macOS / Linux / WSL2，不支持原生 Windows）：

```Bash
curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
```

2. 配置 OpenAI 兼容接入（Chat Completions）：

```Bash
hermes config set model.provider custom
hermes config set model.base_url "https://yeschoy.com/v1"
hermes config set model.api_key "请替换为你的密钥"
hermes config set model.default "请替换为模型ID"
hermes config set model.api_mode chat_completions
```

配置写入 `~/.hermes/config.yaml`，也可直接编辑。桌面版（hermes desktop）与命令行版共用同一份配置。

**注意事项**

- `api_mode` 支持三种：`chat_completions`（OpenAI Chat）、`codex_responses`（OpenAI Responses，需选支持 Responses 端点的模型）、`anthropic_messages`（Anthropic 协议，base\_url 填 `https://yeschoy.com`）。**api\_mode 必须与 Base URL 协议匹配**，错配表现为请求路径错乱/空响应；改完配置新开会话生效。

- config\.yaml 对 Tab 缩进零容忍，缩进/冒号写错时整段配置**静默失效**（启动回退默认配置且不报错）。

- vision、网页总结、MoA 等部分子功能仍独立调用 OpenRouter，需要 `OPENROUTER_API_KEY`，否则这些功能失败（其余功能不受影响）。

- 默认开启并行执行且 90 轮上限，Token 消耗可能很大：`/config delegation.orchestrator_enabled false`、`/config agent.max_turns 30` 可控消耗。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|请求路径错乱/空响应|api\_mode 与 Base URL 协议不匹配|按协议对应设置 api\_mode；OpenAI 兼容用 chat\_completions|
|401 鉴权失败|密钥无效/过期/类型混用|重新复制野菜密钥|
|403|对应模型额度用尽|换有权限的模型；检查令牌分组|
|配置改了完全没生效|YAML 缩进/语法错误，整段被静默忽略|用 `python3 -c "import yaml,sys; yaml.safe_load(open('$HOME/.hermes/config.yaml'))"` 校验|
|vision 等子功能失败|这些功能走 OpenRouter|配置 OPENROUTER\_API\_KEY 或不用这些功能|
|Token 消耗异常大|默认并行 \+ 90 轮|关 Orchestrator、降 max\_turns|

**官方参考**：[Hermes Agent 官方仓库](https://github.com/NousResearch/hermes-agent)

---

## 34\. OpenClaw ✅ 直接支持

OpenClaw 是可对接飞书、QQ、企业微信、钉钉的自托管个人 AI 助手。自定义模型支持 OpenAI 兼容和 Anthropic 协议（`api: "openai-completions"` 或 `"anthropic-messages"`）。

**配置步骤（配置器方式/桌面端）**

1. 打开 OpenClaw 配置器 → 更多设置 → 模型设置 → 添加供应商。

2. 供应商 ID 填 `yeschoy`，API 基础 URL 填 `https://yeschoy.com/v1`。

3. API 密钥填 `请替换为你的密钥`（支持 `"apiKey": "env:VAR名"` 写法）。

4. API 类型选 OpenAI Completions → 保存。

5. 再点"添加模型"：模型 ID 原样填，上下文窗口 / 最大 Token 按野菜模型页填，可设为默认模型。

**配置步骤（配置文件方式）**

编辑 `~/.openclaw/openclaw.json`：

```YAML
model:
  provider: openai_compatible
  base_url: https://yeschoy.com/v1
  api_key: "请替换为你的密钥"
  model_name: 请替换为模型ID
```

**注意事项**

- 对非官方端点，OpenClaw 会自动关闭 `supportsDeveloperRole`、抑制 `anthropic-beta` 头，避免被中转拒绝——这是自动行为，无需配置。

- 改配置后需**完全重启服务**才生效。

- WebUI 端口 18789 需 token 授权；云服务器建议 SSH 隧道访问，不要公网放通。

- 飞书 Access Token 约 2 小时过期，需保持刷新机制；Verification Token / Encrypt Key 不匹配会 401。

- 与机器人对话可用 `/new 模型别名`（丢记忆）或 `/model 别名`（保上下文）切模型。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|`404 The model or endpoint xxx does not exist`|模型名拼写错；或协议/Base URL 用错（类 Claude 用法却填了 OpenAI 地址）；或密钥无效|核对模型 ID；确认 api 类型与 Base URL 匹配|
|`400 请求的模型不支持函数调用`|所配模型不支持 function calling|换支持工具调用的模型（OpenClaw 是重工具调用框架）|
|`400 Input length exceeds the maximum length`|上下文超模型最大输入|压缩会话；换长上下文模型|
|`Model override "provider/model" is not allowed by agents.defaults.modelPolicy.allow`|配了非空 allowlist，模型被策略拦截|把模型加进 allow 列表或用 `provider/*` 通配|
|`This session is pinned to X`|会话被固定在旧模型|`/model default` 清除|
|401/403（中转密钥问题）|密钥错或改配置没重启|用 `env:VAR` 写法管理密钥；完全重启服务|
|404/405（路径错）|baseUrl 少层级|先 `curl -H "Authorization: Bearer KEY" https://yeschoy.com/v1/models` 验证中转本身|

**官方参考**：[OpenClaw 模型文档](https://docs.openclaw.ai/concepts/models)、[自定义 provider](https://docs.openclaw.ai/concepts/model-providers/custom-providers)

---

## 35\. Goose 及其他新工具怎么判断

只有在当前版本看到"Custom / OpenAI Compatible / Base URL"时才按三项填写；只有官方供应商登录、没有 Base URL 入口时，不要把野菜密钥当官方密钥填入。

**Goose 补充说明**：自定义 provider JSON 放 `~/.config/goose/providers/<名称>.json`（字段 name / engine: openai / host / models）；**密钥不读 config\.yaml**，必须用 `goose configure` 存入系统 keyring（headless 环境回退明文 secrets\.yaml）；自定义模型 JSON 中 `supports_tools` 默认 true，模型实际不支持工具调用时要改为 false，否则 Agent 循环反复失败；404 = 路径错、401 = 密钥问题，先按这个口诀定位。

|工具或工具组|它主要做什么|接入野菜 AI 时怎么看|
|---|---|---|
|Goose|桌面端与终端通用 Agent|找 OpenAI Compatible \+ Base URL；没有就暂不直连|
|Zed|AI 编辑器|以客户端是否提供 Base URL 为准|
|Grok CLI、iFlow CLI|终端 Agent|出现第三方 OpenAI 兼容配置时可填三项|
|Cursor、Windsurf、GitHub Copilot|商业 IDE / 插件|官方 BYOK 有范围限制，不能因为能填密钥就默认支持中转地址|

**官方参考**：[Goose 官方文档](https://block.github.io/goose/)

---

# 四、配置切换与多账号管理

## 36\. 野菜 AI 桌面助手（官方推荐！）✅ 直接支持

这是野菜 AI 官方推出的**桌面客户端**，专门为小白用户设计——不用手动改配置文件、不用记环境变量，图形界面点几下就能完成接入、切换模型和分组，新手最省心的选择！

**支持一键接入的工具**：Claude Code、Claude Desktop、Codex Desktop、Pi、dsh Web、Hermes Agent、OpenClaw（持续更新中）。

**它能帮你做什么** 🌟

- 🖱️ **一键接入**：选应用、选模型、选分组，点一下就自动写好配置

- 🔄 **一键换模型**：不用进每个软件的设置里改，桌面助手里切换完直接生效

- 🔧 **一键修复**：配置乱了、接不上了，点"修复"自动恢复

- 💰 **余额一目了然**：首页就能看到账户余额和用量，不用跑后台

- 📂 **多工具统一管理**：好几个 CLI 工具的地址、密钥、模型集中管

**使用步骤**

1. 从野菜 AI 官网下载「野菜 AI 桌面助手」安装包（Windows / macOS 都有）。

2. 安装并打开，用你的野菜 AI 账号扫码登录。

3. 在首页看到支持的工具卡片，选你想用的那个。

4. 选择模型和计费分组，点「接入」或「保存并应用」。

5. 等进度条走完，点「打开使用」就可以直接启动工具啦～

> 💡 小提示：接入过程中如果工具正在运行，会先提醒你保存工作再继续，不用担心丢东西哦～

**注意事项**

- 桌面助手会自动帮你写入各个工具的配置文件，**不需要你手动去改**，这就是它最方便的地方。

- 切换模型和分组只展开选择器，不会立刻写入配置；确认好以后点「使用所选模型」→「保存并应用」才会生效。

- 支持主版和朋友版两个更新通道，登录时注意区分。

- 遇到接入失败或状态异常，可以用「修复」功能试试，大部分问题能自动解决。

**常见报错速查**

|你看到什么|为什么会这样|怎么办呢|
|---|---|---|
|接入进度一直转圈，很久没反应|工具正在运行，等待退出确认；或状态读取较慢|耐心等一下；如果工具确实关了还在转，点取消重试|
|接入失败，提示"配置写入失败"|配置文件路径权限有问题，或被其他程序占用|检查目标工具是否完全退出；用管理员/权限修复试试|
|换了模型但打开工具还是旧模型|没有点「保存并应用」，或者工具没重启|确认操作完成；完全退出工具后重新打开|
|余额显示不对或不更新|账户数据没刷新，或网络不通|下拉刷新一下；检查网络连接|
|点「打开使用」没反应|工具未安装，或系统找不到执行路径|确认工具已安装；路径不对可手动指定|
|接入后工具报 401/404|配置写入了但有小问题，或令牌分组无权该模型|点「修复」自动重配；检查令牌分组是否包含该模型|

**官方参考**：[野菜 AI 官网](https://yeschoy.com)

---

## 37\. CC Switch（多个编程 CLI 的统一切换器）

CC Switch 是本地配置管理器（官网 ccswitch\.io）。对野菜 AI，最稳妥的方式是先给 OpenCode 单独添加供应商。

**配置步骤**

1. 先安装并至少启动一次 Claude或者codex（你需要用的agent工具），让 CC Switch 能找到它的配置目录。

2. 打开 CC Switch，顶部选"自定义"→ 点"\+"添加供应商 → 选"应用专属供应商" → 预设选 OpenAI Compatible（没有就选 Custom）。

3. 名称填"野菜 AI"，API 密钥填 `请替换为你的密钥`，Endpoint 填 `https://yeschoy.com/v1`（海外填 `https://api.yeschoy.com/v1`）。

4. 点"获取模型"，失败就手动粘贴完整模型 ID。

5. 保存 → 启用 → 完全退出并重开 Claude或者codex（你需要用的agent工具）。

> ⚠️ **注意：** Claude Code 和 Gemini CLI 已可直连野菜 AI，但地址不带 `/v1`、配置格式不同，请在 CC Switch 里分别添加专属供应商，不要用通用供应商一键同步。Codex 默认 Responses API，需要 CC Switch 显示"本地路由"选项时才可让它本地转换。首次使用前建议导出备份，避免切换时覆盖自己原有的 MCP、模型或登录配置。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|切换后 CLI 仍走旧地址|CLI 启动时才读配置；或有环境变量优先级更高|完全退出重开；`env | grep` 检查覆盖|
|Claude Code / Gemini CLI 直连失败|把 OpenAI 配置同步给了走原生协议的工具|分别添加专属供应商，Base URL 不带 /v1|
|Codex 报 404 /responses|模型不支持 Responses 且未开本地路由|选支持 openai\-response 端点的模型，或启用本地路由|
|切换后 MCP / 提示词丢了|切换覆盖了原有配置|切换前先导出备份|

**官方参考**：[CC Switch 官网](https://ccswitch.io)、[GitHub 仓库](https://github.com/Hortus-Edenensis/cc-switch)

---

## 38\. Cockpit Tools（多账号、配额和应用多开）

Cockpit Tools 管理多账号、配额、一键切号和多开实例，覆盖 Antigravity、Codex、GitHub Copilot、Windsurf、Kiro、Cursor、Grok CLI、CodeBuddy、CodeBuddy CN、Qoder、Trae、TRAE SOLO、Trae CN、Zed、ZCode 等。

与 CC Switch 的区别：切 API 地址/密钥/模型/MCP 用 CC Switch；切官方账号、看配额、多开用 Cockpit Tools。

> ⚠️ **注意：** 先关闭目标应用再切号；只有平台页面明确出现"API Key / Base URL / 模型 ID"时才填野菜；Cockpit 能管理某软件 ≠ 该软件支持自定义 API。安全提醒：这类工具会读写本机登录状态，只从官方项目下载，含 Token/Cookie 的备份不要外发。

**官方参考**：[Cockpit Tools 官方项目](https://github.com/jlcodes99/cockpit-tools)

---

# 五、知识库、工作流和团队平台

## 39\. Dify ✅ 直接支持

**配置步骤（管理员）**

1. 打开设置 → 模型供应商 → 安装「OpenAI\-API\-compatible」插件。

2. 填 API 密钥，**Endpoint URL 只填到 ****`https://yeschoy.com/v1`**** 为止**（插件自动拼 `/chat/completions`）。

3. 添加模型 ID，**把上下文长度从默认 4096 改成真实值**。

4. Function Call Type 按"支持 Tool Call"选择。

5. 测试并保存。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|凭据验证失败，但 curl 能通|URL 层级写错：填了完整路径、多尾部斜杠、拼出 /v1/v1|只填到 `/v1` 为止|
|`PluginInvokeError: KeyError: 'choices'`|上游返回体不符合 OpenAI 格式（错误页被当成功解析）|先 curl 看原始返回体；核对模型 ID|
|模型能保存，工作流报 model\_not\_found|插件里「API endpoint 中的模型名称」字段覆盖了界面模型名|清空该字段或填一致|
|非流式正常、流式卡住无输出|中转 SSE 格式或反代缓冲问题|野菜侧正常时检查自建反代 `proxy_buffering off`|
|超时|插件内置 connect 5s / read 300s；整体受 PLUGIN\_MAX\_EXECUTION\_TIMEOUT（600s）限制|流式首包慢单独排查；自部署可调环境变量|
|模型列表为空|`/v1/models` 不可用或格式不标准|手动「添加模型」|
|带工具的场景直接 400|Function Call Type 选错|选 Tool Call|
|自托管装插件报 bad signature|插件签名校验|`.env` 加 `FORCE_VERIFYING_SIGNATURE=false`|
|官方 OpenAI 插件（langgenius/openai 1\.0\+）连不上|1\.0 默认 Responses API，且「Enable request metadata」会发送中转可能拒绝的参数|换 OpenAI\-API\-compatible 插件；或关掉 metadata 开关|

**官方参考**：[Dify 模型配置](https://docs.dify.ai/zh-hans/guides/model-configuration/readme)、[官方插件仓库](https://github.com/langgenius/dify-official-plugins)

---

## 40\. FastGPT ✅ 直接支持

管理员在"模型供应商"添加 OpenAI 协议渠道。

> ⚠️ **注意：** 两个地址字段要求相反：渠道配置里的「代理地址」填 Base URL（`https://yeschoy.com/v1`，注意别填完整请求地址）；而模型配置里的「自定义请求地址」必须填**完整路径**（`https://yeschoy.com/v1/chat/completions`），只填 Base URL 不生效。自部署旧版也可用 `OPENAI_BASE_URL` \+ `CHAT_API_KEY`（填到 `/v1`）。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|模型不可用 / Model not found|模型 ID 与渠道登记的不一致（大小写、版本号）|模型 ID 是全局唯一、即请求体 model 字段值，逐字符核对|
|「模型流响应为空，请检查模型流输出是否正常」|上游流式返回格式异常或模型映射错误|先 curl 流式请求验证中转本身|
|改完配置模型"失效"|v4\.9\.6 已知 bug：点「渠道测试」会清空自定义请求地址|重新编辑\-更新\-测试；升级新版|
|401 Invalid API Key|填了管理员 Token 而非渠道 API 密钥|填野菜渠道密钥|
|config\.json 时代（\<4\.8\.20）知识库报错|模型能力开关全为 false|datasetProcess 等开关至少一个为 true|
|改了配置不生效|config\.json / docker\-compose 修改后没重启|重启容器|

**官方参考**：[FastGPT 模型配置](https://doc.fastgpt.cn/zh-CN/self-host/config/model/intro)

---

## 41\. Flowise ✅ 直接支持

**配置步骤**

1. 打开 ChatOpenAI 节点 → OpenAI 凭据填密钥。

2. **Additional Parameters 里 Base Path 填 ****`https://yeschoy.com/v1`**（不填则默认请求 api\.openai\.com）。

3. 内置列表没有该模型时用 ChatOpenAI Custom 填模型 ID。

**常见报错速查**

|你看到什么|为什么|怎么办|
|---|---|---|
|请求仍打到 api\.openai\.com|没配 Base Path|Additional Parameters → Base Path 填到 `/v1`|
|404 / 路径重复|Base Path 填了完整 `/v1/chat/completions`，SDK 又拼了一层|只填到 `/v1`|
|`model not found`|Model Name 填了界面展示名|填上游真实模型 ID|
|Docker 自部署连不上本地 vLLM|容器内 localhost 不指向宿主机|用 `http://host.docker.internal:8000/v1`|
|RAG 检索失败|Embedding 节点是独立节点，没配 Base Path 和密钥|OpenAI Embeddings Custom 节点单独配置|
|导出的 API 调用 401|`x-api-key` 请求头拼错|检查 APIKEY\_ENABLED 与请求头|

**官方参考**：[Flowise 文档](https://docs.flowiseai.com/)

---

## 42\. n8n、Langflow、Coze/扣子 及其他平台

### n8n

OpenAI 凭据**支持自定义 Base URL**（1\.73\.0 起，在 Credentials → OpenAI → Base URL 里填 `https://yeschoy.com/v1`，不在节点参数里）。老版本只能用 HTTP Request 节点。

|你看到什么|为什么|怎么办|
|---|---|---|
|凭据测试绿、运行时 404|OpenAI Chat Model 节点默认开启 **Use Responses API**，实际请求 `/responses`|关闭节点上的 Use Responses API 开关|
|`404 model not found`|同上，Responses 端点不存在|同上|
|`messages must be a non-empty array, got null`|模型名带斜杠触发节点内部校验失败|模型名改用表达式 `{{ "模型ID" }}`，或用 HTTP Request 节点|
|找不到 Base URL 填写处|1\.73\+ 移到了凭据里|Credentials → OpenAI → Base URL|

**参考**：[n8n OpenAI 凭据](https://docs.n8n.io/integrations/builtin/credentials/openai/)、[Use Responses API 404 issue](https://github.com/n8n-io/n8n/issues/24362)

### Langflow

新版走 Settings → Model Providers → **OpenAI Compatible**（环境变量 `OPENAI_COMPATIBLE_BASE_URL` 填 `https://yeschoy.com/v1` \+ 密钥）。保存时会**实时请求 ****`/v1/models`**** 校验并自动发现模型**，发现的模型需手动启用。

|你看到什么|为什么|怎么办|
|---|---|---|
|provider 保存失败|`/v1/models` 校验不通过|核对 URL/密钥；野菜支持该端点，通常说明填错|
|localhost/内网地址被拦截|默认 SSRF 防护拒绝私网地址|野菜是公网地址不受影响；本地服务需配 `LANGFLOW_SSRF_ALLOWED_HOSTS`|
|每个 provider 只能配一个密钥|官方限制|多中转场景拆多个 provider|
|安全警告|Langflow 曾有在野利用的严重漏洞（攻击者专门偷环境变量里的 API 密钥）|不要暴露公网；及时升级|

**参考**：[Langflow OpenAI Compatible](https://docs.langflow.org/concepts-models)

### Coze Studio（扣子自托管开源版）

|你看到什么|为什么|怎么办|
|---|---|---|
|模型下拉框为空|开源版没有页面添加模型：需复制 `backend/conf/model/template/*.yaml` 到 `backend/conf/model/` 并改 name/base\_url/api\_key/model|改完重启才出现|
|能配置但调用报 400/405|base\_url / 协议类型填错（"能配置 ≠ 能调用"）|按模板核对 protocol 与 base\_url|
|模型列表异常/互相覆盖|复制多份 yaml 忘改 id 字段（必须唯一）|逐份改 id|
|模型"思考过程"关不掉|需在 yaml 设 `meta.conn_config.enable_thinking: false` 并重启 coze\-server|改配置后 force\-recreate 重启|
|扣子云端版（coze\.cn）|不支持自定义模型 base\_url|接中转只有自托管开源版可行|

**参考**：[Coze Studio 仓库](https://github.com/coze-dev/coze-studio)

### 其他平台通用判断法

看模型凭据页有没有 API 密钥、Base URL / Endpoint、模型 ID 三个输入框：三个都有且写明 OpenAI Compatible 通常可接入；只有 API 密钥的通常只能连官方服务。找不到 Base URL 时不要把地址填进 API 密钥或 Organization 字段。

---

# 六、哪些产品不能直接这样接？

- ChatGPT / Claude / Gemini 网页版，Kimi、豆包、元宝等官方 App

- 通义灵码、百度 Comate 等未开放自定义 Base URL 的版本

- Kiro、Antigravity、GitHub Copilot（见第 20 节）

- 只允许填官方 OpenAI / Anthropic / Google 密钥、没有 Base URL 输入框的工具

判断方法很简单：

> 能填写"Base URL \+ API 密钥 \+ 模型 ID"，才有机会直连。只有登录按钮或只有 API 密钥输入框，不等于支持第三方中转。

---

# 七、通用开发调用

## curl 测试

```Bash
curl https://yeschoy.com/v1/chat/completions \
  -H "Authorization: Bearer 请替换为你的密钥" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "请替换为模型ID",
    "messages": [
      {"role": "user", "content": "只回复：连接成功"}
    ],
    "stream": false
  }'
```

## Python OpenAI SDK

```Python
from openai import OpenAI

client = OpenAI(
    api_key="请替换为你的密钥",
    base_url="https://yeschoy.com/v1",
)

response = client.chat.completions.create(
    model="请替换为模型ID",
    messages=[{"role": "user", "content": "只回复：连接成功"}],
)

print(response.choices[0].message.content)
```

## JavaScript / Node\.js OpenAI SDK

```JavaScript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "请替换为你的密钥",
  baseURL: "https://yeschoy.com/v1",
});

const response = await client.chat.completions.create({
  model: "请替换为模型ID",
  messages: [{ role: "user", content: "只回复：连接成功" }],
});

console.log(response.choices[0].message.content);
```

---

# 八、报错别慌，按这张表排查

|报错或现象|通俗解释|先怎么处理|
|---|---|---|
|`401 Invalid API key`|密钥错、被删除、复制不完整或前后有空格|重新复制完整密钥；仍失败就新建一枚|
|`404 Not Found`|地址或路径拼错|检查是否重复了 `/v1`；OpenAI 格式带 `/v1`，Anthropic/Gemini 格式不带|
|`400 model not found`|模型 ID 写错或当前令牌分组无权使用|从模型定价页重新复制模型 ID|
|`400 response_format unavailable`|客户端发送了该模型不支持的格式参数|关闭 JSON/结构化输出，或换模型/客户端|
|`Unsupported parameter: 'max_tokens'`|Azure/GPT\-5 系后端要求 `max_completion_tokens`|换模型或换客户端|
|`reasoning_content must be passed back`|思考模型的多轮协议不兼容|新开会话；升级客户端；关闭思考模式或换模型|
|`429`|请求太快、并发过高，或额度耗尽（注意 OpenAI 语义下欠费也返回 429）|降低并发，稍等再试，不要疯狂重试；先查余额再查并发|
|`500 Internal server error`|服务内部异常|保存请求 ID，稍后重试一次；持续出现再反馈|
|`502 all upstream attempts failed`|可用上游暂时全部失败|换模型或等恢复，带请求 ID 反馈|
|`503`|上游繁忙、维护或无可用线路|等待片刻或换模型|
|一直转圈、30 秒后失败|客户端超时或首字太慢|超时调到 120 秒；先测短问题|
|大陆访问很慢|到全球线路绕路|改用 `https://yeschoy.com/v1`|
|海外访问很慢|到大陆线路绕路|改用 `https://api.yeschoy.com/v1`|
|能聊天但不能改文件|模型不支持工具调用|换支持 tools/function calling 的模型|
|`Failed to fetch` / CORS 报错（仅浏览器端工具）\`\`|浏览器跨域或混合内容|确认中转地址是 HTTPS；用客户端版本绕过|
|模型列表为空|客户端没读到 `/v1/models`|手动添加模型 ID，不代表密钥失效|
|上下文提前压缩/截断|客户端未声明模型上下文上限|在客户端里按模型页填真实上下文窗口|

热门工具的专属报错看对应章节的"常见报错速查"表。通用工具按下面的三板斧排查。

## 通用排查三板斧

### 第 1 板斧：curl 最小请求，把客户端摘出去

```Bash
curl https://yeschoy.com/v1/chat/completions \
  -H "Authorization: Bearer 请替换为你的密钥" \
  -H "Content-Type: application/json" \
  -d '{"model": "请替换为模型ID", "messages": [{"role": "user", "content": "回复OK"}], "stream": false}'
```

curl 成功、客户端失败 → 问题在客户端的路径拼接、模型配置或流式处理。curl 也失败 → 看状态码：401 查密钥，404 查路径，403 查分组权限，429 查并发，5xx 是服务端。

### 第 2 板斧：确认实际生效的配置

环境变量类工具（Claude Code、Codex、Aider、Gemini CLI）最常见的问题是"改了配置但进程没读到"：

```Bash
echo $ANTHROPIC_BASE_URL     # Claude Code
echo $OPENAI_API_BASE        # Aider
echo $GEMINI_API_KEY         # Gemini CLI
cat ~/.codex/config.toml     # Codex
cat ~/.claude/settings.json  # Claude Code
```

重点检查：旧平台残留的变量（以前接过的服务）、`~/.zshrc` / `~/.bashrc` 里的旧行、是否开了新终端。

### 第 3 板斧：对照状态码定位层级

|状态码|层级|动作|
|---|---|---|
|401|认证层|重复制密钥；查空格；确认是野菜的密钥；查令牌是否被删|
|403|权限层|令牌分组是否包含该模型；账号是否欠费|
|404|路径层|查 `/v1` 是多写还是少写；查协议格式|
|400|参数层|模型 ID 原样复制；查不支持的请求参数|
|429|限流层|降并发、退避等待，不要疯狂重试|
|5xx|服务端|稍等重试；持续出现带时间反馈|
|连接超时|网络层|换大陆/海外线路；检查代理|

### 反馈模板

以上都试过还不行，按这个模板反馈，一次说清：

1. 大致时间（精确到分钟）。

2. 使用的软件名称和版本。

3. 模型 ID（原样复制）。

4. 使用的协议（OpenAI / Anthropic / Gemini）。

5. 完整错误文字或请求 ID。

6. 是否流式输出。

7. curl 最小请求的结果（第 1 板斧的输出）。

不要提供：完整 API 密钥、登录密码、2FA 密钥、Cookie。

---

# 九、安全与费用提醒

- API 密钥就像银行卡密码，不要发到群聊、截图、公开仓库或日志。多数工具（ZCode、Hermes、Goose、dsh 等）把密钥明文存在本地配置文件里，不要把配置文件或截图外发。

- 怀疑泄露时，先删除旧密钥，再创建新密钥；只改软件里的密钥，不需要改账号密码。

- 不同模型价格不同。切模型前先看模型定价页，不要只看名称猜价格。

- 一次长请求、Agent 多轮工具调用、网页翻译和批量任务都可能产生多次模型调用；Agent 工具（如 dsh、OpenClaw、Hermes）的任务链消耗尤其可能远超预期，大任务前先小额测试。

- 给不同人员、项目和软件使用不同密钥，便于查用量和单独停用。

- 自托管服务（Open WebUI、LobeChat、Langflow、OpenClaw 等）不要裸露公网——Langflow 等曾出现在野攻击专门偷环境变量里的 API 密钥；WebUI 类端口建议 SSH 隧道访问。

- 第一次接入先用短问题验证，确认计费、模型和工具调用都正常后再跑大任务。

---

# 十、快速兼容性总表

|工具|状态|推荐填写方式|备注|
|---|---|---|---|
|野菜 AI 桌面助手|✅ 直接支持|扫码登录，图形界面一键接入|**官方推荐，小白首选**|
|Cherry Studio|✅ 直接支持|OpenAI Compatible \+ `/v1`|新手友好|
|Chatbox|✅ 直接支持|API Host \+ Path，或 Base URL|新手友好|
|WorkBuddy / CodeBuddy|✅ 直接支持|自定义 \+ 完整 Chat URL|国产办公首选|
|LobeChat / NextChat|✅ 直接支持|OpenAI Base URL（NextChat 填根域名）|可自建|
|Open WebUI|✅ 直接支持|管理员添加 OpenAI 连接|适合团队|
|沉浸式翻译|✅ 直接支持|OpenAI \+ 完整 Chat URL|注意并发|
|Bob|✅ 直接支持|OpenAI 服务 \+ Base URL \+ Path 两个字段|macOS 桌面翻译|
|Cline|✅ 直接支持|OpenAI Compatible|VS Code|
|Roo Code|✅ 直接支持|OpenAI Compatible|要求原生工具调用|
|Continue|✅ 直接支持|`apiBase`|新版可能自动走 /responses|
|OpenCode|✅ 直接支持|自定义 provider（手动声明 models）|需要配置文件|
|Trae / TraeCode|✅ 直接支持|OpenAI 自定义模型|IDE 走代理，CLI 直连|
|Aider|✅ 直接支持|环境变量 `OPENAI_API_BASE` \+ `openai/` 前缀|注意变量名和前缀|
|Qwen Code|✅ 直接支持|`modelProviders` 裸数组|命令行|
|Codex|🔄 协议转换|仅 Responses 兼容模型|不是普通 Chat 接口|
|Claude Code|🔄 协议转换|`ANTHROPIC_BASE_URL` \+ `AUTH_TOKEN`（不带 /v1）|协议转换，站内全模型可用|
|Gemini CLI|🔄 协议转换|`GOOGLE_GEMINI_BASE_URL` \+ `GEMINI_API_KEY`（不带 /v1）|协议转换|
|Cursor|⚠️ 有限支持|Override OpenAI Base URL|需 Pro；请求经 Cursor 服务器|
|Windsurf|❌ 不建议|官方仅部分 BYOK；自定义端点会静默 fallback|支持度最低|
|CC Switch|配置管理器|给目标应用添加专属供应商|Claude Code / Gemini CLI 分别添加|
|Cockpit Tools|账号管理器|管切号、配额和多开|能管账号不等于支持自定义 API|
|Pi Coding Agent|✅ 直接支持|`models.json` \+ `openai-completions`|apiKey 要带 `$` 引用环境变量|
|Kilo Code|✅ 直接支持|Custom Provider \+ OpenAI Compatible|协议选错是 404 常见根因|
|Crush|✅ 直接支持|`openai-compat` 自定义供应商|声明 context\_window|
|DeepSeek Harness（dsh）|✅ 直接支持|Web UI / settings\.yaml \+ OpenAI Compatible|预览版变化快；思考强度需插件声明|
|OpenHands|✅ 直接支持|LLM 配置 \+ `openai/` 前缀|litellm 路由|
|Junie|✅ 直接支持|BYOK「兼容 OpenAI」\+ Base URL|需开 Tool calling|
|Warp|⚠️ 有限支持|终端 BYOK / 自定义推理端点|Auto 模型走 Warp credits；端点须公网|
|ZCode|✅ 直接支持|添加供应商，OpenAI / Anthropic 均可|Anthropic 地址不带 /v1|
|Qoder|✅ 直接支持|桌面端自定义 OpenAI 兼容接口|CLI 只支持固定供应商；保存后手动切换|
|Hermes Agent|✅ 直接支持|`hermes config set` \+ api\_mode|api\_mode 与协议要匹配|
|OpenClaw|✅ 直接支持|`openai_compatible` 配置|自托管个人助手；需支持工具调用的模型|
|Goose|版本相关|找 Custom / OpenAI Compatible|密钥不读 config\.yaml|
|Zed|逐工具确认|以客户端是否提供 Base URL 为准|—|
|Kiro|❌ 不建议|官方无自定义供应商|仅可 MCP 桥接（进阶）|
|Antigravity|❌ 不建议|仅 Gemini，无自定义入口|社区代理方案有风险|
|GitHub Copilot|❌ 不建议|BYOK 范围受限|不能指定中转地址|
|Dify|✅ 直接支持|OpenAI\-API\-compatible 插件 \+ `/v1`|上下文长度改真实值|
|FastGPT|✅ 直接支持|渠道填 Base URL；模型自定义地址填完整路径|两个字段要求相反|
|Flowise|✅ 直接支持|ChatOpenAI Base Path|Embedding 节点要单独配|
|n8n|✅ 直接支持|凭据里 Base URL \+ 关闭 Responses 开关|1\.73\.0\+|
|Langflow|✅ 直接支持|Model Providers → OpenAI Compatible|保存时校验 /v1/models|
|Coze Studio（自托管）|✅ 直接支持|改 backend/conf/model yaml|云端版不支持|

