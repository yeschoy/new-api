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

import type { TroubleshootRow, UseCase } from './beginner-types'

/** Errors people meet first, in plain words, with what to do. */
export const TROUBLESHOOT_ROWS: TroubleshootRow[] = [
  { error: '401 Invalid API key', meaning: tk('密钥错、被删除、复制不完整或前后有空格'), fix: tk('重新复制完整密钥；仍失败就新建一枚') },
  { error: '404 Not Found', meaning: tk('地址或路径拼错'), fix: tk('检查是否重复了 /v1 或 /chat/completions') },
  { error: '400 model not found', meaning: tk('模型 ID 写错或当前分组无权使用'), fix: tk('从模型列表重新复制模型 ID') },
  { error: '400 response_format unavailable', meaning: tk('客户端发送了该模型不支持的格式参数'), fix: tk('关闭 JSON/结构化输出，或换模型/客户端') },
  { error: '429 Too Many Requests', meaning: tk('请求太快、并发过高或额度窗口已满'), fix: tk('降低并发，稍等后再试，不要疯狂重试') },
  { error: '500 Internal server error', meaning: tk('服务内部异常，也可能是上游返回异常'), fix: tk('保存请求 ID，稍后重试一次；持续出现再反馈') },
  { error: '502 all upstream attempts failed', meaning: tk('可用上游暂时全部失败'), fix: tk('换模型或等待恢复，并带请求 ID 反馈') },
  { error: '503 Service Unavailable', meaning: tk('上游繁忙、维护或当前无可用线路'), fix: tk('等待片刻或换模型') },
  { error: tk('一直转圈、30 秒后失败'), meaning: tk('客户端超时或首字太慢'), fix: tk('将超时调到 120 秒；先测试短问题') },
  { error: tk('能聊天但不能改文件'), meaning: tk('模型不支持工具调用，或工具协议不兼容'), fix: tk('换支持 tools/function calling 的模型') },
  { error: tk('模型列表为空'), meaning: tk('客户端没成功读取 /v1/models'), fix: tk('手动添加模型 ID，不代表密钥失效') },
  { error: tk('上下文提前压缩'), meaning: tk('客户端自己的压缩策略触发'), fix: tk('查看客户端上下文设置；不等于服务端只有小上下文') },
]

/** "What do you want to do?" cards, each narrowing the tool list. */
export const USE_CASES: UseCase[] = [
  { useCase: tk('国产办公智能体、操作本地文件'), tools: 'WorkBuddy / CodeBuddy', difficulty: 'easy', toolIds: ['workbuddy'] },
  { useCase: tk('网页、PDF、字幕翻译'), tools: tk('沉浸式翻译、流畅阅读'), difficulty: 'easy', toolIds: ['immersive-translate', 'fluent-read'] },
  { useCase: tk('用 DeepSeek 官方 Agent 执行任务'), tools: 'DeepSeek Harness (DSH)', difficulty: 'medium', toolIds: ['dsh'] },
  { useCase: tk('用国产工具辅助编程'), tools: 'Trae / TraeCode CLI', difficulty: 'easy', toolIds: ['trae'] },
  { useCase: tk('终端里写代码'), tools: 'Claude Code、Codex、Pi、OpenCode、Crush', difficulty: 'medium', toolIds: ['claude-code', 'codex', 'pi-agent', 'opencode', 'crush'] },
  { useCase: tk('VS Code 里写代码'), tools: 'Cline、Roo Code、Kilo Code、Continue', difficulty: 'easy', toolIds: ['cline', 'roo-code', 'kilo-code', 'continue'] },
  { useCase: tk('同时切换多个 CLI 的配置'), tools: 'CC Switch', difficulty: 'medium', toolIds: ['cc-switch'] },
  { useCase: tk('自建团队聊天网页'), tools: 'Open WebUI、LobeChat、NextChat', difficulty: 'medium', toolIds: ['open-webui', 'lobechat', 'nextchat'] },
  { useCase: tk('搭建知识库或工作流'), tools: 'Dify、FastGPT、Flowise', difficulty: 'advanced', toolIds: ['dify', 'fastgpt', 'flowise'] },
]
