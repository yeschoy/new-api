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

/** Claude Code over the Anthropic-compatible endpoint. */
export const CLAUDE_CODE_DOCS: GuideDoc[] = [
  {
    slug: 'claude-code',
    group: 'coding',
    title: 'Claude Code',
    summary: tk('安装 Claude Code，连接 Anthropic 兼容端点，并验证所选路由。'),
    audience: 'anthropic',
    readingMinutes: 9,
    sections: [
      {
        id: 'requirements',
        title: tk('准备事项'),
        blocks: [
          { type: 'paragraph', text: tk('准备 Node.js 18 或更高版本、API 密钥，以及支持 Anthropic 兼容端点的模型。') },
          {
            type: 'callout',
            tone: 'info',
            title: tk('使用 Host 地址'),
            text: tk('Claude Code 会自行拼接 Messages API 路径。ANTHROPIC_BASE_URL 应使用 {host}，不要填写完整的 /v1/messages URL。'),
          },
        ],
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
                    {
                      title: tk('安装 Node.js LTS'),
                      text: tk('安装当前 LTS 版本，再重新打开 PowerShell。'),
                      code: {
                        label: tk('验证 Node.js'),
                        language: 'powershell',
                        template: `node --version
npm --version`,
                      },
                    },
                    {
                      title: tk('安装 Claude Code'),
                      code: {
                        label: tk('安装 Claude Code'),
                        language: 'bash',
                        copyLabel: tk('复制安装命令'),
                        template: 'npm install -g @anthropic-ai/claude-code',
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
                      text: tk('使用 Homebrew 或当前 Node.js LTS 安装包。'),
                      code: { label: 'Homebrew', language: 'bash', template: 'brew install node' },
                    },
                    {
                      title: tk('安装 Claude Code'),
                      code: {
                        label: tk('安装 Claude Code'),
                        language: 'bash',
                        copyLabel: tk('复制安装命令'),
                        template: 'npm install -g @anthropic-ai/claude-code',
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
                      text: tk('使用发行版包管理器或 NodeSource 安装 Node.js 18 或更高版本。'),
                      code: {
                        label: tk('验证 Node.js'),
                        language: 'bash',
                        template: `node --version
npm --version`,
                      },
                    },
                    {
                      title: tk('安装 Claude Code'),
                      code: {
                        label: tk('安装 Claude Code'),
                        language: 'bash',
                        copyLabel: tk('复制安装命令'),
                        template: 'npm install -g @anthropic-ai/claude-code',
                      },
                    },
                  ],
                },
              ],
              vscode: [
                {
                  type: 'paragraph',
                  text: tk('先配置并测试 Claude Code CLI，再安装 Claude Code 扩展并重启 VS Code，使其继承相同环境。'),
                },
              ],
              jetbrains: [{ type: 'paragraph', text: tk('在 JetBrains 中最可靠的方式是使用 IDE 终端。先配置本地 CLI，再在项目终端中运行 claude。') }],
            },
          },
        ],
      },
      {
        id: 'configure',
        title: tk('配置网关'),
        blocks: [
          {
            type: 'platform',
            platforms: {
              windows: [
                {
                  type: 'code',
                  label: tk('PowerShell 会话'),
                  language: 'powershell',
                  copyLabel: tk('复制 PowerShell 配置'),
                  template: `$env:ANTHROPIC_BASE_URL = "{host}"
$env:ANTHROPIC_AUTH_TOKEN = "{apiKey}"
$env:ANTHROPIC_MODEL = "{model}"`,
                },
              ],
              macos: [
                {
                  type: 'code',
                  label: '~/.zshrc',
                  language: 'bash',
                  copyLabel: tk('复制 Shell 配置'),
                  template: `export ANTHROPIC_BASE_URL="{host}"
export ANTHROPIC_AUTH_TOKEN="{apiKey}"
export ANTHROPIC_MODEL="{model}"`,
                },
              ],
              linux: [
                {
                  type: 'code',
                  label: tk('~/.bashrc 或 ~/.zshrc'),
                  language: 'bash',
                  copyLabel: tk('复制 Shell 配置'),
                  template: `export ANTHROPIC_BASE_URL="{host}"
export ANTHROPIC_AUTH_TOKEN="{apiKey}"
export ANTHROPIC_MODEL="{model}"`,
                },
              ],
              vscode: [
                {
                  type: 'callout',
                  tone: 'info',
                  title: tk('复用 CLI 配置'),
                  text: tk('修改环境变量后请完全重启 VS Code。扩展应与已正常工作的 CLI 使用相同网关和密钥。'),
                },
              ],
              jetbrains: [
                {
                  type: 'callout',
                  tone: 'info',
                  title: tk('从 IDE 终端开始'),
                  text: tk('添加可选插件集成前，先在 JetBrains 终端中运行已验证可用的本地 claude 命令。'),
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
              { title: tk('重启终端或编辑器'), text: tk('环境变更只对新启动的进程生效。') },
              {
                title: tk('启动 Claude Code'),
                code: { label: tk('终端'), language: 'bash', template: 'claude' },
              },
              { title: tk('发送最小提示词'), text: tk('在测试工具或长上下文前，先让模型只回复一行。') },
            ],
          },
        ],
      },
    ],
  },
]
