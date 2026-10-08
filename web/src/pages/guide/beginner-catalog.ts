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

import type { TagTone } from '@/components/ui'

import { CHAT_TOOLS } from './beginner-tools-chat'
import { CODING_TOOLS } from './beginner-tools-coding'
import { MORE_CODING_TOOLS } from './beginner-tools-coding-more'
import { PLATFORM_TOOLS } from './beginner-tools-platforms'
import type { BeginnerTool, ToolCategory, ToolStatus, UseCase } from './beginner-types'

export const BEGINNER_TOOLS: ReadonlyArray<BeginnerTool> = [...CHAT_TOOLS, ...CODING_TOOLS, ...MORE_CODING_TOOLS, ...PLATFORM_TOOLS]

export const CATEGORIES: ReadonlyArray<{ id: ToolCategory | 'all'; label: string }> = [
  { id: 'all', label: tk('全部') },
  { id: 'chat', label: tk('聊天与办公') },
  { id: 'translate', label: tk('翻译与阅读') },
  { id: 'coding', label: tk('编程开发') },
  { id: 'manager', label: tk('配置管理') },
  { id: 'platform', label: tk('自建平台') },
]

// Status colours are accents that read on both palettes, like the modality tags; gray uses the tokens.
export const STATUS_META: Record<ToolStatus, { label: string; dot: string; pill: string }> = {
  green: { label: tk('直接可用'), dot: 'bg-emerald-500', pill: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  yellow: { label: tk('需要配置文件'), dot: 'bg-amber-500', pill: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  blue: { label: tk('专用协议'), dot: 'bg-or-blue', pill: 'bg-or-blue/15 text-blue-700 dark:text-blue-300' },
  gray: { label: tk('暂不支持'), dot: 'bg-or-dim', pill: 'bg-or-fill text-or-muted' },
}

export const DIFFICULTY: Record<UseCase['difficulty'], { label: string; tone: TagTone }> = {
  easy: { label: tk('简单'), tone: 'success' },
  medium: { label: tk('中等'), tone: 'warning' },
  advanced: { label: tk('高级'), tone: 'danger' },
}

/**
 * The tools to show: one category (or all), only a use case's tools when one
 * is picked, only those whose name, summary or steps (in the current
 * language) contain the query; recommended ones first, otherwise in order.
 */
export function filterTools(input: {
  category: ToolCategory | 'all'
  focus?: string[]
  query?: string
  translate: (text: string) => string
}): BeginnerTool[] {
  const focus = input.focus?.length ? new Set(input.focus) : null
  const needle = input.query?.trim().toLocaleLowerCase() ?? ''
  const matches = (tool: BeginnerTool) =>
    [tool.name, tool.summary, ...tool.steps].map(input.translate).join(' ').toLocaleLowerCase().includes(needle)
  return BEGINNER_TOOLS.filter(
    (tool) => (input.category === 'all' || tool.category === input.category) && (!focus || focus.has(tool.id)) && (!needle || matches(tool))
  ).sort((a, b) => Number(Boolean(b.recommended)) - Number(Boolean(a.recommended)))
}
