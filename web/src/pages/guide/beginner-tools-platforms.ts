/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { tk } from '@/i18n/i18n'

import type { BeginnerTool } from './beginner-types'

/** Configuration managers and self-hosted platforms. */
export const PLATFORM_TOOLS: BeginnerTool[] = [
  {
    id: 'cc-switch',
    name: 'CC Switch',
    category: 'manager',
    status: 'yellow',
    summary: tk('多个编程 CLI 的地址、Key、MCP 统一切换器'),
    steps: [
      tk('先安装并至少启动一次目标应用，让 CC Switch 能找到它的配置目录'),
      tk('打开 CC Switch，顶部选择你要配置的目标应用'),
      tk('点击右上角「+」添加供应商，选择「应用专属供应商」，不要先选「通用供应商」'),
      tk('预设选择「OpenAI Compatible」；没有该预设就选「Custom / 自定义」'),
      tk('API Key 填自己的 sk-... 密钥'),
      tk('Endpoint / Base URL 填 {baseUrl}'),
      tk('点击「获取模型」；失败时手动粘贴完整模型 ID'),
      tk('保存后点击「启用」，完全退出并重新打开目标应用'),
    ],
    tips: [
      tk('不要把同一配置通过「通用供应商」直接同步给 Claude Code 和 Gemini CLI，它们使用的原生协议不同'),
      tk('切换后大多数 CLI 需要重启才能读取新配置；旧地址仍生效时先检查系统环境变量是否覆盖了配置'),
      tk('首次使用前建议导出备份，避免切换时覆盖原有的 MCP、模型或登录配置'),
    ],
  },
  {
    id: 'cockpit-tools',
    name: 'Cockpit Tools',
    category: 'manager',
    status: 'green',
    summary: tk('支持 Codex API Key、自定义 Base URL 与本地 API 服务'),
    steps: [
      tk('升级到最新版 Cockpit Tools，打开 Codex 账号页'),
      tk('选择「API Key」方式添加账号，供应商模式选「自定义」'),
      tk('API Key 填自己的 sk-... 密钥，Base URL 填 {baseUrl}'),
      tk('按本站模型列表填写或同步模型 ID，协议选择与模型匹配的 Responses 或 OpenAI 兼容模式'),
      tk('保存并切换到该账号；需要给其他工具调用时，再到「Codex API Service」创建客户端 Key 并启用本地服务'),
      tk('把 Cockpit Tools 显示的本地 Base URL 和客户端 Key 填进目标工具，先发一条短消息测试'),
    ],
    tips: [
      tk('Cockpit Tools 的本地 API Service 地址通常是 localhost 加动态端口，不要误填成本站上游地址'),
      tk('只从官方项目下载；切换前备份配置，不要把包含 Token、Cookie 或客户端 Key 的备份发给别人'),
    ],
  },
  {
    id: 'dify',
    name: 'Dify',
    category: 'platform',
    status: 'green',
    summary: tk('知识库与工作流平台，需管理员权限'),
    steps: [
      tk('进入「设置」→「模型供应商」'),
      tk('安装或打开 OpenAI 模型供应商'),
      tk('填 API Key'),
      tk('自定义基础 URL 填 {baseUrl}'),
      tk('添加或选择模型 ID，测试并保存'),
    ],
    tips: [
      tk('如果插件只显示官方 OpenAI 模型、不能添加自定义模型，需换用支持自定义模型 ID 的 OpenAI 兼容插件'),
    ],
  },
  {
    id: 'fastgpt',
    name: 'FastGPT',
    category: 'platform',
    status: 'green',
    summary: tk('知识库平台，管理员配置'),
    steps: [
      tk('在「模型供应商」中添加 OpenAI 协议渠道'),
      tk('Base URL 填 {baseUrl}'),
      tk('Key 填 sk-...'),
      tk('模型填完整模型 ID'),
    ],
    tips: [
      tk('自部署版本也可通过 OPENAI_BASE_URL 和 CHAT_API_KEY 环境变量配置。不要把完整 /chat/completions 地址当作 Base URL'),
    ],
  },
  {
    id: 'flowise',
    name: 'Flowise',
    category: 'platform',
    status: 'green',
    summary: tk('可视化工作流编排'),
    steps: [
      tk('使用 ChatOpenAI 节点'),
      tk('创建 OpenAI 凭据并填入密钥'),
      tk('在 Additional Parameters 中将 Base Path 改为 {baseUrl}'),
      tk('内置列表没有该模型时，使用 ChatOpenAI Custom 并填写模型 ID'),
    ],
  },
  {
    id: 'n8n-langflow',
    name: tk('n8n / Langflow / Coze 等'),
    category: 'platform',
    status: 'yellow',
    summary: tk('其他自动化平台的通用判断方法'),
    steps: [
      tk('先看它的模型凭据页面有没有三个输入框：API Key、Base URL / Endpoint、Model ID'),
      tk('三个都有，并且明确写着 OpenAI Compatible，通常可以接入'),
      tk('只有 API Key、没有 Base URL 的，通常只能连接官方服务，不能接入自定义中转'),
    ],
    tips: [
      tk('找不到 Base URL 时，不要把地址填进 API Key 或 Organization 字段'),
    ],
  },
]
