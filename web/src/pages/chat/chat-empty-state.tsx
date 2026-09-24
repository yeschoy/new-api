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
import { Code2, Lightbulb, MapPinned, PenLine } from 'lucide-react'

import { cn } from '@/lib/format'

const SUGGESTIONS = [
  { icon: Lightbulb, title: '解释概念', prompt: '用通俗易懂的语言解释一下什么是量子计算，控制在三段以内' },
  { icon: Code2, title: '写代码', prompt: '用 Python 写一个快速排序，并说明它的时间复杂度' },
  { icon: PenLine, title: '创作', prompt: '写一首关于秋天的七言绝句，并简单赏析' },
  { icon: MapPinned, title: '做计划', prompt: '帮我规划一个周末两天的杭州旅行行程，预算 2000 元' },
]

const s = {
  title: 'text-or-fg text-[28px] font-semibold tracking-[-0.02em]',
  sub: 'text-or-muted',
  card: 'border-or-line bg-or-card hover:bg-or-fill rounded-[8px] border',
  cardTitle: 'text-or-fg',
  cardText: 'text-or-muted',
  icon: 'text-or-primary',
}

export function ChatEmptyState(props: {
  model: string
  disabled?: boolean
  onPick: (prompt: string) => void
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-4 py-10', props.className)}>
      <h2 className={s.title}>有什么可以帮你？</h2>
      <p className={cn('mt-2 text-center text-[14px]', s.sub)}>
        {props.model ? `正在使用 ${props.model}，选择一个示例或直接输入问题` : '请先选择一个模型'}
      </p>
      <div className='mt-8 grid w-full max-w-[640px] gap-3 sm:grid-cols-2'>
        {SUGGESTIONS.map((item) => (
          <button
            key={item.title}
            type='button'
            disabled={props.disabled}
            onClick={() => props.onPick(item.prompt)}
            className={cn('flex flex-col gap-1.5 p-4 text-left transition-colors disabled:opacity-50', s.card)}
          >
            <span className={cn('flex items-center gap-2 text-[14px] font-medium', s.cardTitle)}>
              <item.icon className={cn('size-4', s.icon)} aria-hidden='true' />
              {item.title}
            </span>
            <span className={cn('text-[13px] leading-5', s.cardText)}>{item.prompt}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
