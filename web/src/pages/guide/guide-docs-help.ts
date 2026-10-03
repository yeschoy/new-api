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

/** Cherry Studio, and the error checklist. */
export const HELP_DOCS: GuideDoc[] = [
  {
    slug: 'cherry-studio',
    group: 'desktop',
    title: 'Cherry Studio',
    summary: tk('添加 OpenAI 兼容服务商，选择模型并测试连接。'),
    audience: 'openai',
    readingMinutes: 6,
    sections: [
      {
        id: 'prepare',
        title: tk('准备连接'),
        blocks: [{ type: 'paragraph', text: tk('先创建专用 API 密钥，然后在 Cherry Studio 中添加自定义服务商时保持本页打开。') }],
      },
      {
        id: 'configure',
        title: tk('添加服务商'),
        blocks: [
          {
            type: 'steps',
            items: [
              { title: tk('打开模型服务'), text: tk('在设置中选择“添加”，然后选择“OpenAI 兼容”。') },
              { title: tk('填写连接信息'), text: tk('使用 {baseUrl}、真实 API 密钥和上方选中的模型。') },
              { title: tk('使用所选分组的密钥'), text: tk('创建或编辑 API 密钥，将分组设为 {group}。客户端本身只需填写密钥。') },
              { title: tk('保存并测试'), text: tk('运行内置连接检查，然后在新对话中发送一条简短消息。') },
            ],
          },
          {
            type: 'table',
            columns: [tk('字段'), tk('值')],
            rows: [
              [tk('服务商类型'), tk('兼容 OpenAI')],
              [tk('API 密钥|字段'), '{apiKey}'],
              [tk('API 地址|客户端字段'), '{baseUrl}'],
              [tk('模型 ID'), '{model}'],
            ],
          },
        ],
      },
      {
        id: 'path-differences',
        title: tk('处理地址差异'),
        blocks: [
          {
            type: 'callout',
            tone: 'warning',
            title: tk('确认字段需要哪种地址'),
            text: tk('如果客户端会自动拼接 /v1，请使用 {host}；如果要求 Base URL，请使用 {baseUrl}。重复的 /v1 通常会返回 404。'),
          },
        ],
      },
    ],
  },
  {
    slug: 'troubleshooting',
    group: 'help',
    title: tk('常见错误与自查'),
    summary: tk('根据响应状态码和固定检查清单快速定位配置问题。'),
    audience: 'all',
    readingMinutes: 7,
    sections: [
      {
        id: 'errors',
        title: tk('常见错误'),
        blocks: [
          {
            type: 'table',
            columns: [tk('错误'), tk('通常表示'), tk('优先检查')],
            rows: [
              [
                tk('401 或 invalid_api_key'),
                tk('密钥缺失、格式错误、已禁用，或复制时带有空格。'),
                tk('从 API 密钥页重新复制密钥，并替换示例中的掩码占位符。'),
              ],
              ['404', tk('客户端拼接了错误的端点路径。'), tk('确认该字段需要 {host}、{baseUrl} 还是 {fullUrl}。')],
              ['429', tk('请求速率、并发数或账户额度已超限。'), tk('降低并发，并检查账户余额和限制。')],
              ['model_not_found', tk('模型名称错误，或所选分组中没有该模型。'), tk('请从上方选择器重新选择模型和分组。')],
              [tk('模型列表为空'), tk('当前账户没有已启用且匹配此协议的模型。'), tk('打开模型页，确认端点能力和分组访问权限。')],
              [tk('聊天正常但工具失败'), tk('模型或端点不支持所需的工具协议。'), tk('选择在该端点能力列表中包含工具调用的模型。')],
            ],
          },
        ],
      },
      {
        id: 'checklist',
        title: tk('一次只检查一项'),
        blocks: [
          {
            type: 'steps',
            items: [
              { title: tk('确认密钥'), text: tk('使用已启用的密钥，并删除首尾空格。') },
              { title: tk('确认地址格式'), text: tk('根据客户端字段名称，对照 {host}、{baseUrl} 与 {fullUrl}。') },
              { title: tk('同时确认模型与分组'), text: tk('使用基于当前账户的选择器，不要凭记忆输入旧值。') },
              {
                title: tk('确认协议'),
                text: tk('Codex 需要 Responses，Claude Code 需要 Anthropic Messages，Cherry Studio 使用 OpenAI 兼容端点。'),
              },
              { title: tk('重启客户端'), text: tk('终端和编辑器进程不会自动重新加载已修改的环境变量。') },
              { title: tk('测试最小请求'), text: tk('启用工具、文件、图片或长上下文前，先验证一行响应。') },
            ],
          },
        ],
      },
    ],
  },
]
