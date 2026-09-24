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
import { ArrowUp, Square } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'

import { cn } from '@/lib/format'
import type { SiteSkin } from '@/site/site-skin'

const MAX_HEIGHT = 200

const STYLES: Record<SiteSkin, Record<'box' | 'input' | 'send' | 'hint', string>> = {
  router: {
    box: 'border-or-line bg-or-card focus-within:border-or-fg/25 rounded-[8px] border',
    input: 'text-or-fg placeholder:text-or-dim',
    send: 'bg-or-lime text-or-bg rounded-[6px] disabled:opacity-30',
    hint: 'text-or-dim',
  },
  hub: {
    box: 'border-hub-line focus-within:border-hub-blue rounded-[12px] border bg-white focus-within:shadow-[0_0_0_2px_rgba(37,99,235,0.1)]',
    input: 'text-hub-ink placeholder:text-hub-muted',
    send: 'bg-hub-blue rounded-[8px] text-white disabled:opacity-40',
    hint: 'text-hub-muted',
  },
}

/** Auto-growing prompt box: Enter sends, Shift+Enter inserts a newline. */
export function ChatComposer(props: {
  skin: SiteSkin
  streaming: boolean
  disabled?: boolean
  onSend: (text: string) => void
  onStop: () => void
}) {
  const s = STYLES[props.skin]
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const canSend = !props.disabled && !props.streaming && value.trim().length > 0

  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden'
  }, [value])

  const submit = () => {
    if (!canSend) return
    props.onSend(value)
    setValue('')
  }

  return (
    <div>
      <div className={cn('flex items-end gap-2 p-2 pl-3.5 transition-[border-color,box-shadow]', s.box)}>
        <textarea
          ref={inputRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={props.disabled ? '请先选择模型' : '输入消息，Enter 发送，Shift + Enter 换行'}
          aria-label='消息'
          className={cn('min-h-8 flex-1 resize-none bg-transparent py-1 text-[14px] leading-6 outline-none', s.input)}
        />
        {props.streaming ? (
          <button
            type='button'
            onClick={props.onStop}
            aria-label='停止生成'
            title='停止生成'
            className={cn('flex size-8 shrink-0 items-center justify-center', s.send)}
          >
            <Square className='size-3.5 fill-current' />
          </button>
        ) : (
          <button
            type='button'
            onClick={submit}
            disabled={!canSend}
            aria-label='发送'
            title='发送'
            className={cn('flex size-8 shrink-0 items-center justify-center transition-opacity', s.send)}
          >
            <ArrowUp className='size-4' strokeWidth={2.5} />
          </button>
        )}
      </div>
      <p className={cn('mt-1.5 text-center text-[12px]', s.hint)}>AI 生成的内容可能不准确，请注意甄别</p>
    </div>
  )
}
