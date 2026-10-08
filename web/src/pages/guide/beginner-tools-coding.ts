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

/** Coding agents and editor extensions, first half. */
export const CODING_TOOLS: BeginnerTool[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    category: 'coding',
    status: 'blue',
    summary: tk('使用 Anthropic 协议，需专用地址'),
    steps: [
      tk('Claude Code 使用 Anthropic Messages 协议，不能直接把 OpenAI 地址填进 ANTHROPIC_BASE_URL'),
      tk('只有当平台另外提供「Anthropic 专用地址」时才能配置：'),
      tk('export ANTHROPIC_BASE_URL="平台提供的Anthropic专用地址"'),
      tk('export ANTHROPIC_AUTH_TOKEN="你的密钥"'),
    ],
    tips: [
      tk('不要把 /v1/chat/completions 当作 Anthropic /v1/messages 使用。没有专用地址时请改用 Cline、Roo Code、OpenCode'),
    ],
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    category: 'coding',
    status: 'blue',
    summary: tk('仅支持 Responses API 兼容的模型'),
    steps: [
      tk('Codex 的自定义提供商使用 Responses API，不能把只支持 Chat Completions 的模型硬套进去'),
      tk('只有所选模型明确支持 /v1/responses 时才配置（见示例）'),
      tk('启动前设置对应的环境变量'),
    ],
    tips: [
      tk('如果报 404 /responses 或持续工具调用失败，请改用 Cline、Roo Code、OpenCode，不要反复改地址碰运气'),
    ],
    snippet: { label: 'config.toml', code: `model = "YOUR_RESPONSES_MODEL_ID"
model_provider = "myprovider"

[model_providers.myprovider]
name = "My API provider"
base_url = "{baseUrl}"
env_key = "MY_API_KEY"
wire_api = "responses"` },
  },
  {
    id: 'dsh',
    name: 'DeepSeek Harness (DSH)',
    category: 'coding',
    status: 'green',
    recommended: true,
    summary: tk('DeepSeek 官方开源 Agent，支持自定义 OpenAI 兼容供应商'),
    steps: [
      tk('先安装 Node.js，在项目目录运行 npx @deepseek-ai/dsh web'),
      tk('浏览器打开 http://127.0.0.1:3080，进入「Settings」→「Models」'),
      tk('选择「Add a custom provider」，Provider ID 填一个小写英文名称，例如 yeschoy'),
      tk('API protocol 选择「OpenAI Completions」，Base URL 填 {baseUrl}'),
      tk('Credential / API Key 填自己的 sk-... 密钥'),
      tk('添加完整模型 ID，保存后返回会话并选择项目目录开始使用'),
    ],
    tips: [
      tk('DSH 当前仍处于开发者预览阶段，升级后界面和配置格式可能变化'),
      tk('模型必须支持工具调用；只能聊天、不能执行任务时，先换用支持 tools/function calling 的模型'),
    ],
  },
  {
    id: 'pi-agent',
    name: 'Pi Coding Agent',
    category: 'coding',
    status: 'yellow',
    summary: tk('轻量可扩展的终端 Agent'),
    steps: [
      tk('安装：npm install -g @mariozechner/pi-coding-agent'),
      tk('创建或编辑 ~/.pi/agent/models.json，按下面的示例配置'),
      tk('设置环境变量后启动 pi，输入 /model 选择模型'),
      tk('先确认基础聊天和工具调用正常，再逐个增加扩展'),
    ],
    tips: [
      tk('不要把完整的 /chat/completions 地址写进 baseUrl'),
    ],
    snippet: { label: '~/.pi/agent/models.json', code: `{
  "providers": {
    "myprovider": {
      "baseUrl": "{baseUrl}",
      "api": "openai-completions",
      "apiKey": "$MY_API_KEY",
      "authHeader": true,
      "models": [{ "id": "YOUR_MODEL_ID", "name": "API model" }]
    }
  }
}` },
  },
  {
    id: 'cline',
    name: 'Cline',
    category: 'coding',
    status: 'green',
    summary: tk('VS Code 里的 AI 编程助手，新手编程首选'),
    steps: [
      tk('在 VS Code 中安装 Cline，打开面板点击齿轮'),
      tk('API Provider 选择「OpenAI Compatible」'),
      tk('Base URL 填 {baseUrl}'),
      tk('API Key 填 sk-...'),
      tk('Model ID 填完整模型 ID'),
      tk('保存后让它读取一个小文件或解释一段代码测试'),
    ],
    tips: [
      tk('聊天能回复但不能修改文件时，通常不是密钥问题，而是模型不支持工具调用。换支持 tools 的模型再试'),
    ],
  },
  {
    id: 'roo-code',
    name: 'Roo Code',
    category: 'coding',
    status: 'green',
    summary: tk('VS Code AI Agent，依赖原生工具调用'),
    steps: [
      tk('打开 Roo Code 设置'),
      tk('API Provider 选择「OpenAI Compatible」'),
      tk('Base URL 填 {baseUrl}'),
      tk('API Key 填 sk-...'),
      tk('Model ID 填完整模型 ID'),
      tk('保存并执行一个只读的小任务测试'),
    ],
    tips: [
      tk('模型必须支持 tools/function calling，否则无法执行 Agent 任务'),
    ],
  },
  {
    id: 'kilo-code',
    name: 'Kilo Code',
    category: 'coding',
    status: 'green',
    summary: tk('VS Code / CLI，原生支持自定义供应商'),
    steps: [
      tk('打开 Kilo Code 设置，进入 Providers，选择「添加自定义供应商」'),
      tk('Provider ID 随意填，显示名称填本站名称'),
      tk('Provider API 选择「OpenAI Compatible」'),
      tk('Base URL 填 {baseUrl}'),
      tk('API Key 填 sk-... 密钥'),
      tk('从自动获取的列表选择模型；获取不到时手动添加完整模型 ID'),
      tk('保存后先运行一个小任务测试工具调用'),
    ],
  },
  {
    id: 'continue',
    name: 'Continue',
    category: 'coding',
    status: 'yellow',
    summary: tk('VS Code / JetBrains 插件，需编辑配置文件'),
    steps: [
      tk('打开 Continue 的配置文件，按下面的示例添加模型'),
      tk('把 apiBase 填为 {baseUrl},apiKey 填你的密钥'),
      tk('保存后重启编辑器测试'),
    ],
    tips: [
      tk('如果 Continue 自动改用 /responses 后报错，在模型配置中增加 useResponsesApi: false'),
    ],
    snippet: { label: 'config.yaml', code: `models:
  - name: My API model
    provider: openai
    model: YOUR_MODEL_ID
    apiBase: {baseUrl}
    apiKey: YOUR_API_KEY
    capabilities:
      - tool_use` },
  },
]
