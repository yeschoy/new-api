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

/** Getting started: the first request and the four connection values. */
export const START_DOCS: GuideDoc[] = [
  {
    slug: 'quick-start',
    group: 'start',
    title: tk('快速开始'),
    summary: tk('创建密钥、选择可用路由并发送首个请求。'),
    audience: 'openai',
    readingMinutes: 5,
    sections: [
      {
        id: 'before-you-start',
        title: tk('开始之前'),
        blocks: [
          { type: 'paragraph', text: tk('你只需要 API 密钥、Base URL、模型和计费分组。本页会自动填入除密钥外的所有信息。') },
          {
            type: 'callout',
            tone: 'info',
            title: tk('密钥始终保持私密'),
            text: tk('示例使用掩码占位符。仅在客户端要求密钥时，才从 API 密钥页复制真实密钥。'),
          },
        ],
      },
      {
        id: 'connect',
        title: tk('三步完成接入'),
        blocks: [
          {
            type: 'steps',
            items: [
              { title: tk('选择模型和分组'), text: tk('使用上方选择器；这里只显示当前账户可用的组合。') },
              {
                title: tk('创建 API 密钥'),
                text: tk('在 {group} 分组中创建密钥，使计费和路由与上方选择一致。'),
                action: { label: tk('打开 API 密钥'), to: '/settings/keys' },
              },
              {
                title: tk('发送最小请求'),
                text: tk('将掩码密钥替换为真实密钥后再运行此请求。'),
                code: {
                  label: 'curl',
                  language: 'bash',
                  copyLabel: tk('复制请求'),
                  template: `curl {fullUrl} \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer {apiKey}" \\
  -d '{"model":"{model}","messages":[{"role":"user","content":"Reply with: connected"}]}'`,
                },
              },
            ],
          },
        ],
      },
      {
        id: 'verify',
        title: tk('确认接入成功'),
        blocks: [
          { type: 'paragraph', text: tk('成功响应表示地址、密钥、模型和分组可以协同工作。之后可在使用记录中查看该请求。') },
          {
            type: 'callout',
            tone: 'warning',
            title: tk('如果首次请求失败'),
            text: tk('不要一次修改所有值。先查看状态码，再按照故障排查文章逐项验证。'),
          },
        ],
      },
    ],
  },
  {
    slug: 'essentials',
    group: 'start',
    title: tk('密钥、地址、模型与分组'),
    summary: tk('配置客户端前，先了解所有兼容客户端都需要的四项信息。'),
    audience: 'all',
    readingMinutes: 7,
    sections: [
      {
        id: 'four-values',
        title: tk('四项连接信息'),
        blocks: [
          {
            type: 'table',
            columns: [tk('值'), tk('作用'), tk('获取位置')],
            rows: [
              [tk('API 密钥|字段'), tk('验证请求身份并应用对应的访问限制。'), tk('在 API 密钥页创建并复制。')],
              [tk('API 地址'), tk('告诉客户端应将请求发送到哪个网关。'), '{baseUrl}'],
              [tk('模型|字段'), tk('选择请求所使用的模型能力。'), tk('从上方基于当前账户的选择器中选择。')],
              [tk('分组'), tk('选择可用的计费与路由分组。'), tk('选择支持当前模型的分组。')],
            ],
          },
        ],
      },
      {
        id: 'addresses',
        title: tk('选择正确的地址格式'),
        blocks: [
          {
            type: 'table',
            columns: [tk('客户端字段'), tk('使用此值')],
            rows: [
              [tk('Host 或 API Host'), '{host}'],
              [tk('API 地址'), '{baseUrl}'],
              [tk('完整 Chat Completions 端点'), '{fullUrl}'],
              [tk('Anthropic 兼容 Base URL'), '{host}'],
            ],
          },
          {
            type: 'callout',
            tone: 'warning',
            title: tk('避免重复路径'),
            text: tk('如果客户端会自动拼接 /v1 或 /chat/completions，只填写它要求的较短地址。重复路径通常会返回 404。'),
          },
        ],
      },
      {
        id: 'compatibility',
        title: tk('模型与分组兼容性'),
        blocks: [
          { type: 'paragraph', text: tk('密钥只能调用所选分组中已启用的模型。本页选择器会检查当前账户并隐藏不兼容的组合。') },
          {
            type: 'steps',
            items: [
              { title: tk('先选择模型'), text: tk('选择客户端或工作流所需的模型。') },
              { title: tk('选择兼容分组'), text: tk('模型变更后，分组列表会自动筛选。') },
              { title: tk('创建 API 密钥'), text: tk('在 {group} 分组中创建密钥，使计费和路由与上方选择一致。') },
            ],
          },
        ],
      },
      {
        id: 'key-safety',
        title: tk('保护密钥'),
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: tk('像保护密码一样保护 API 密钥'),
            text: tk('不要将密钥粘贴到截图、聊天消息、源码仓库、浏览器 URL 或公开问题报告中。密钥一旦泄露，请立即撤销。'),
          },
        ],
      },
    ],
  },
]
