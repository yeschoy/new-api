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

import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

const MAX_HEIGHT = 200

const s = {
  box: 'border-or-line bg-or-card focus-within:border-or-fg/25 rounded-[28px] border shadow-[0_4px_16px_rgba(0,0,0,0.04)]',
  input: 'text-or-fg placeholder:text-or-dim',
  send: 'bg-or-fg text-or-bg rounded-full disabled:opacity-25',
  hint: 'text-or-dim',
}

/**
 * GPT-style prompt box: the text on top; beneath it the tools on the left and
 * the model with the send button on the right. Enter sends, Shift+Enter adds a line.
 */
export function ChatComposer(props: {
  streaming: boolean
  disabled?: boolean
  onSend: (text: string) => void
  onStop: () => void
  /** Bottom left of the box (the chat settings). */
  tools?: React.ReactNode
  /** Bottom right of the box, before the send button (the model picker). */
  model?: React.ReactNode
}) {
  const { t } = useI18n()
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
      <div role='group' aria-label={t('对话')} className={cn('px-3 pt-3 pb-2 transition-[border-color,box-shadow]', s.box)}>
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
          placeholder={props.disabled ? t('请先选择模型') : t('输入消息，Enter 发送，Shift + Enter 换行')}
          aria-label={t('消息')}
          className={cn('block min-h-10 w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-6 outline-none', s.input)}
        />
        <div className='mt-1 flex items-center gap-1'>
          {props.tools}
          <div className='ml-auto flex min-w-0 items-center gap-1.5'>
            {props.model}
            {props.streaming ? (
              <button
                type='button'
                onClick={props.onStop}
                aria-label={t('停止生成')}
                title={t('停止生成')}
                className={cn('flex size-9 shrink-0 items-center justify-center', s.send)}
              >
                <Square className='size-3.5 fill-current' />
              </button>
            ) : (
              <button
                type='button'
                onClick={submit}
                disabled={!canSend}
                aria-label={t('发送')}
                title={t('发送')}
                className={cn('flex size-9 shrink-0 items-center justify-center transition-opacity', s.send)}
              >
                <ArrowUp className='size-4' strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>
      <p className={cn('mt-2 text-center text-[12px]', s.hint)}>{t('AI 生成的内容可能不准确，请注意甄别')}</p>
    </div>
  )
}
