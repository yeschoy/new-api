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

/** Chat, office and translation apps. */
export const CHAT_TOOLS: BeginnerTool[] = [
  {
    id: 'workbuddy',
    name: 'WorkBuddy / CodeBuddy',
    category: 'chat',
    status: 'green',
    recommended: true,
    summary: tk('国产办公智能体，可操作本地文件'),
    steps: [
      tk('打开 WorkBuddy，点击左下角账户头像'),
      tk('进入「设置」→「模型」，点击「添加模型」'),
      tk('提供商选择「自定义 / Custom」'),
      tk('接口地址填完整地址 {fullUrl}'),
      tk('API Key 填 sk-... 密钥'),
      tk('模型名称填模型列表里的完整模型 ID'),
      tk('第一次测试先只开「工具调用」，「图片输入」「推理模式」仅在模型明确支持时开启'),
      tk('保存后回到对话框选择刚添加的模型'),
    ],
    tips: [
      tk('有「完整 URL」开关的版本：填完整地址时打开开关；只填 {baseUrl} 时关闭开关让软件自动补路径。两者不要同时用，否则容易 404'),
    ],
  },
  {
    id: 'cherry-studio',
    name: 'Cherry Studio',
    category: 'chat',
    status: 'green',
    summary: tk('桌面聊天客户端，支持 OpenAI 兼容接口'),
    steps: [
      tk('打开 Cherry Studio，点击左下角「设置」'),
      tk('进入「模型服务」，点击「添加」，类型选择「OpenAI」或「OpenAI Compatible」'),
      tk('名称随意填，例如本站名称'),
      tk('API Key 填你创建的 sk-... 密钥'),
      tk('API 地址填 {baseUrl}'),
      tk('点击「管理」或「添加模型」，粘贴完整模型 ID'),
      tk('点击「检查」，成功后打开右上角启用开关'),
      tk('回到聊天页选择刚添加的模型，发一句「你好」测试'),
    ],
    tips: [
      tk('如果检查时报 404，把 API 地址改成 {host} 再试（不同版本对 /v1 的自动补全方式不同）'),
    ],
  },
  {
    id: 'chatbox',
    name: 'Chatbox',
    category: 'chat',
    status: 'green',
    summary: tk('轻量聊天客户端，手机电脑都能用'),
    steps: [
      tk('打开 Chatbox，点击侧边栏「设置」'),
      tk('进入「模型提供方」，点击「添加」，类型选「OpenAI API compatible」'),
      tk('如果界面显示「API Host」，填 {host}'),
      tk('如果界面显示「Base URL」，填 {baseUrl}'),
      tk('API Key 填 sk-... 密钥'),
      tk('API Path 保持 /v1/chat/completions，没有这个输入框就不用管'),
      tk('添加模型 ID，保存并点击「检查」'),
    ],
  },
  {
    id: 'lobechat',
    name: 'LobeChat',
    category: 'chat',
    status: 'green',
    summary: tk('漂亮的开源聊天界面，可自建团队版'),
    steps: [
      tk('进入「设置」→「语言模型」'),
      tk('选择 OpenAI，或创建自定义 OpenAI 提供商'),
      tk('API Key 填 sk-...'),
      tk('Base URL 填 {baseUrl}'),
      tk('保存后测试连接；如果没有自动显示模型，手动添加模型 ID'),
    ],
  },
  {
    id: 'nextchat',
    name: 'NextChat',
    category: 'chat',
    status: 'green',
    summary: tk('开源网页聊天，一键部署'),
    steps: [
      tk('打开设置页，找到「自定义接口」或「接口地址」'),
      tk('地址填 {baseUrl}'),
      tk('密钥填 sk-...'),
      tk('在自定义模型中填写模型 ID'),
      tk('保存后新建会话测试'),
    ],
    tips: [
      tk('如果版本会自动把 /v1 附加到地址后面，接口地址只填 {host}'),
    ],
  },
  {
    id: 'open-webui',
    name: 'Open WebUI',
    category: 'chat',
    status: 'green',
    summary: tk('团队自建聊天平台，需管理员权限'),
    steps: [
      tk('点击头像，进入「管理员设置」'),
      tk('打开「Connections / 连接」，找到 OpenAI，点击「管理」'),
      tk('点击「添加连接」，URL 填 {baseUrl}'),
      tk('API Key 填 sk-...'),
      tk('模型过滤留空可尝试自动读取；读不到时手动添加模型 ID'),
      tk('保存并启用该连接'),
    ],
  },
  {
    id: 'other-chat-clients',
    name: tk('DeepChat / AionUI / OpenCat 等'),
    category: 'chat',
    status: 'green',
    summary: tk('其他聊天客户端的通用配置方法'),
    steps: [
      tk('优先在本站「API 密钥」页寻找一键导入按钮'),
      tk('手动配置时，类型选「OpenAI Compatible」'),
      tk('Base URL 填 {baseUrl}'),
      tk('API Key 填你的 sk-... 密钥'),
      tk('Model 填模型列表上的完整模型 ID'),
    ],
  },
  {
    id: 'immersive-translate',
    name: tk('沉浸式翻译'),
    category: 'translate',
    status: 'green',
    recommended: true,
    summary: tk('网页、PDF、字幕翻译神器'),
    steps: [
      tk('打开沉浸式翻译设置'),
      tk('在「翻译服务」中选择 OpenAI，或添加 OpenAI 兼容服务'),
      tk('API Key 填 sk-...'),
      tk('自定义模型填模型 ID'),
      tk('「自定义 URL」填完整地址 {fullUrl}'),
      tk('保存并用一小段网页文字测试'),
    ],
    tips: [
      tk('翻译网页会短时间发出很多小请求。遇到 429 时降低「每秒请求数」，不要连续反复点重试'),
    ],
  },
  {
    id: 'fluent-read',
    name: tk('流畅阅读 FluentRead'),
    category: 'translate',
    status: 'green',
    summary: tk('开源沉浸式阅读翻译插件'),
    steps: [
      tk('在流畅阅读中添加「OpenAI 兼容」翻译服务'),
      tk('地址填 {baseUrl}；如果界面明确要求完整地址，则填 {fullUrl}'),
      tk('填写密钥和模型 ID'),
      tk('先用短网页测试，再翻译 PDF 或长页面'),
    ],
  },
]
