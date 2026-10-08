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

/** Coding agents and editor extensions, second half. */
export const MORE_CODING_TOOLS: BeginnerTool[] = [
  {
    id: 'opencode',
    name: 'OpenCode',
    category: 'coding',
    status: 'yellow',
    summary: tk('终端编程 Agent，需编辑 opencode.json'),
    steps: [
      tk('运行 /connect，选择「Other」，设置一个提供商 ID'),
      tk('在 opencode.json 中按下面的示例配置'),
      tk('重启 OpenCode，输入 /models 选择你的模型'),
      tk('用一个小项目测试读取、编辑和命令调用'),
    ],
    snippet: { label: 'opencode.json', code: `{
  "provider": {
    "myprovider": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "My API provider",
      "options": { "baseURL": "{baseUrl}" },
      "models": { "YOUR_MODEL_ID": { "name": "API model" } }
    }
  }
}` },
  },
  {
    id: 'aider',
    name: 'Aider',
    category: 'coding',
    status: 'yellow',
    summary: tk('命令行结对编程，用环境变量配置'),
    steps: [
      tk('在终端设置环境变量后启动（见下方示例）'),
    ],
    snippet: { label: 'macOS / Linux', code: `export OPENAI_API_BASE="{baseUrl}"
export OPENAI_API_KEY="YOUR_API_KEY"
aider --model openai/YOUR_MODEL_ID` },
  },
  {
    id: 'qwen-code',
    name: 'Qwen Code',
    category: 'coding',
    status: 'yellow',
    summary: tk('命令行编程工具，需编辑 settings.json'),
    steps: [
      tk('在 ~/.qwen/settings.json 中按下面的示例配置'),
      tk('启动前设置对应的环境变量，然后用 /model 选择该模型'),
    ],
    snippet: { label: '~/.qwen/settings.json', code: `{
  "modelProviders": {
    "openai": [
      {
        "id": "YOUR_MODEL_ID",
        "name": "My API provider",
        "envKey": "MY_API_KEY",
        "baseUrl": "{baseUrl}"
      }
    ]
  }
}` },
  },
  {
    id: 'trae',
    name: 'Trae / TraeCode CLI',
    category: 'coding',
    status: 'green',
    recommended: true,
    summary: tk('国产编程工具，支持自定义 OpenAI 模型'),
    steps: [
      tk('进入「设置」→「模型」→「添加模型」'),
      tk('API 格式选择 OpenAI'),
      tk('Base URL 填 {baseUrl}'),
      tk('API Key 填 sk-...'),
      tk('模型填完整模型 ID'),
    ],
  },
  {
    id: 'crush',
    name: 'Crush',
    category: 'coding',
    status: 'yellow',
    summary: tk('终端编程 Agent，适合命令行熟手'),
    steps: [
      tk('在供应商管理中添加 openai-compat 类型的自定义供应商（见示例）'),
      tk('用 model add 添加模型，模型 ID 必须与模型列表完全一致'),
      tk('上下文长度、最大输出等参数以模型页面为准，不要照抄别家同名模型'),
    ],
    snippet: { label: tk('终端'), code: `provider add myprovider --type openai-compat \\
  --base-url "{baseUrl}" \\
  --api-key "$MY_API_KEY"` },
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    category: 'coding',
    status: 'blue',
    summary: tk('使用 Gemini 原生协议，需专用地址'),
    steps: [
      tk('只有平台提供「Gemini 专用地址」时才能配置：'),
      tk('export GEMINI_API_KEY="你的密钥"'),
      tk('export GOOGLE_GEMINI_BASE_URL="平台提供的Gemini专用地址"'),
    ],
    tips: [
      tk('普通 OpenAI 兼容地址不能直接代替 Gemini 原生地址'),
    ],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    category: 'coding',
    status: 'yellow',
    summary: tk('有限支持，可能影响内置模型'),
    steps: [
      tk('打开 Cursor Settings → Models'),
      tk('填写 OpenAI API Key（你的 sk-... 密钥）'),
      tk('打开 Override OpenAI Base URL，填 {baseUrl}'),
      tk('添加或选择模型 ID'),
      tk('先用 Ask/Chat 测试，不要一开始运行大型 Agent 任务'),
    ],
    tips: [
      tk('自定义 Key 主要用于普通聊天；Tab 补全等功能仍走 Cursor 自己的服务。需要稳定使用第三方接口时更推荐 Cline 或 Roo Code'),
    ],
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    category: 'coding',
    status: 'gray',
    summary: tk('暂无通用自定义 Base URL，不建议'),
    steps: [
      tk('Windsurf 官方 BYOK 只对它列出的部分模型开放，没有面向任意 OpenAI 兼容服务的通用 Base URL 配置'),
      tk('不要把密钥直接填进官方 OpenAI / Anthropic / Google Key 输入框后期待它自动识别中转地址'),
      tk('当前建议使用 Cline、Roo Code、Continue 或 Trae'),
    ],
  },
]
