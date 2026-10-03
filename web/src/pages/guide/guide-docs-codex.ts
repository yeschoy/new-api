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

import type { GuideDoc } from './guide-types'

/** Codex over the Responses endpoint, and CC Switch for both coding tools. */
export const CODEX_DOCS: GuideDoc[] = [
  {
    slug: 'codex',
    group: 'coding',
    title: 'Codex',
    summary: tk('安装 Codex，配置兼容 Responses 的自定义服务商，并验证所选模型。'),
    audience: 'openai-response',
    readingMinutes: 10,
    sections: [
      {
        id: 'requirements',
        title: tk('准备事项'),
        blocks: [{ type: 'paragraph', text: tk('准备 Node.js、API 密钥和支持 Responses 端点的模型。上方模型选择器已按此协议筛选。') }],
      },
      {
        id: 'install',
        title: tk('按系统安装'),
        blocks: [
          {
            type: 'platform',
            platforms: {
              windows: [
                {
                  type: 'steps',
                  items: [
                    { title: tk('安装 Node.js LTS'), text: tk('安装当前 LTS 版本，然后重新打开 PowerShell。') },
                    {
                      title: tk('安装 Codex'),
                      code: {
                        label: tk('安装 Codex'),
                        language: 'bash',
                        copyLabel: tk('复制安装命令'),
                        template: 'npm install -g @openai/codex',
                      },
                    },
                  ],
                },
              ],
              macos: [
                {
                  type: 'steps',
                  items: [
                    {
                      title: tk('安装 Node.js'),
                      code: { label: 'Homebrew', language: 'bash', template: 'brew install node' },
                    },
                    {
                      title: tk('安装 Codex'),
                      code: {
                        label: tk('安装 Codex'),
                        language: 'bash',
                        copyLabel: tk('复制安装命令'),
                        template: 'npm install -g @openai/codex',
                      },
                    },
                  ],
                },
              ],
              linux: [
                {
                  type: 'steps',
                  items: [
                    {
                      title: tk('验证 Node.js'),
                      code: {
                        label: tk('终端'),
                        language: 'bash',
                        template: `node --version
npm --version`,
                      },
                    },
                    {
                      title: tk('安装 Codex'),
                      code: {
                        label: tk('安装 Codex'),
                        language: 'bash',
                        copyLabel: tk('复制安装命令'),
                        template: 'npm install -g @openai/codex',
                      },
                    },
                  ],
                },
              ],
              vscode: [{ type: 'paragraph', text: tk('先配置并验证 Codex CLI，再安装 Codex 扩展并完全重启 VS Code，使其读取同一配置。') }],
              jetbrains: [{ type: 'paragraph', text: tk('本地 Codex CLI 正常后，再使用 JetBrains 项目终端。这样 IDE 与终端会共用同一配置。') }],
            },
          },
        ],
      },
      {
        id: 'configure',
        title: tk('配置自定义服务商'),
        blocks: [
          { type: 'paragraph', text: tk('将此配置保存到 ~/.codex/config.toml。服务商 ID 固定不变，端点和模型来自当前选择。') },
          {
            type: 'code',
            label: '~/.codex/config.toml',
            language: 'toml',
            copyLabel: tk('复制 Codex 配置'),
            template: `model = "{model}"
model_provider = "yeschoy"

[model_providers.yeschoy]
name = "yeschoy"
base_url = "{baseUrl}"
env_key = "YESCHOY_API_KEY"
wire_api = "responses"`,
          },
          {
            type: 'platform',
            platforms: {
              windows: [
                {
                  type: 'code',
                  label: tk('PowerShell 会话'),
                  language: 'powershell',
                  copyLabel: tk('复制密钥命令'),
                  template: '$env:YESCHOY_API_KEY = "{apiKey}"',
                },
              ],
              macos: [
                {
                  type: 'code',
                  label: tk('终端会话'),
                  language: 'bash',
                  copyLabel: tk('复制密钥命令'),
                  template: 'export YESCHOY_API_KEY="{apiKey}"',
                },
              ],
              linux: [
                {
                  type: 'code',
                  label: tk('终端会话'),
                  language: 'bash',
                  copyLabel: tk('复制密钥命令'),
                  template: 'export YESCHOY_API_KEY="{apiKey}"',
                },
              ],
            },
          },
        ],
      },
      {
        id: 'verify',
        title: tk('验证连接'),
        blocks: [
          {
            type: 'steps',
            items: [
              { title: tk('启动新的终端会话'), text: tk('启动 Codex 前确认环境变量已生效。') },
              {
                title: tk('检查已安装版本'),
                code: { label: tk('终端'), language: 'bash', template: 'codex --version' },
              },
              { title: tk('从小任务开始'), code: { label: tk('终端'), language: 'bash', template: 'codex' } },
            ],
          },
        ],
      },
      {
        id: 'large-context',
        title: tk('可选的大上下文配置'),
        blocks: [
          {
            type: 'context-window',
            supportedTitle: tk('此模型声明支持 1M 上下文窗口'),
            supportedText: tk('可以在 config.toml 顶部添加明确的上下文窗口和保守的自动压缩阈值。'),
            unavailableTitle: tk('尚未确认此模型支持 1M 上下文'),
            unavailableText: tk('除非模型页明确显示上下文窗口至少为 1,000,000 tokens，否则请保留默认上下文设置。'),
          },
        ],
      },
    ],
  },
  {
    slug: 'cc-switch',
    group: 'coding',
    title: 'CC Switch',
    summary: tk('集中管理 Claude Code 与 Codex 服务商配置，无需手动编辑文件即可切换。'),
    audience: 'all',
    readingMinutes: 8,
    sections: [
      {
        id: 'when-to-use',
        title: tk('何时使用 CC Switch'),
        blocks: [
          { type: 'paragraph', text: tk('当你使用多个服务商，或希望集中管理 Claude Code 与 Codex 配置时，可使用 CC Switch。') },
          { type: 'callout', tone: 'info', title: tk('自定义服务商配置'), text: tk('如果预设中没有本服务，请选择“自定义”并填写本页显示的值。') },
        ],
      },
      {
        id: 'claude-provider',
        title: tk('添加 Claude Code 服务商'),
        blocks: [
          {
            type: 'table',
            columns: [tk('字段'), tk('值')],
            rows: [[tk('名称'), '{brand}'], ['ANTHROPIC_BASE_URL', '{host}'], ['ANTHROPIC_AUTH_TOKEN', '{apiKey}']],
          },
        ],
      },
      {
        id: 'codex-provider',
        title: tk('添加 Codex 服务商'),
        blocks: [
          {
            type: 'table',
            columns: [tk('字段'), tk('值')],
            rows: [
              [tk('名称'), '{brand}'],
              [tk('API 地址'), '{baseUrl}'],
              [tk('API 密钥|字段'), '{apiKey}'],
              ['Wire API', 'responses'],
            ],
          },
        ],
      },
      {
        id: 'verify',
        title: tk('切换并验证'),
        blocks: [
          {
            type: 'steps',
            items: [
              { title: tk('启用服务商'), text: tk('将新的自定义服务商设为目标客户端的当前服务商。') },
              { title: tk('重启客户端'), text: tk('关闭现有终端和编辑器进程，使其重新读取配置。') },
              { title: tk('运行最小请求'), text: tk('先确认一条简短响应，再测试工具或大型提示词。') },
            ],
          },
        ],
      },
    ],
  },
]
