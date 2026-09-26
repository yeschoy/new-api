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
import { AlertCircle, Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

import type { ChatMessage } from './use-chat'

const s = {
  user: 'bg-or-fill text-or-fg rounded-[20px]',
  assistant: 'text-or-fg',
  label: 'text-or-muted',
  action: 'text-or-muted hover:bg-or-fill hover:text-or-fg rounded-[6px]',
  reasoning: 'border-or-line text-or-muted border-l-2',
  error: 'border-or-red/30 bg-or-red/10 text-or-red rounded-[6px] border',
}

/** GPT-style thread: your messages in bubbles on the right, replies in the open; follows new tokens unless you scrolled up. */
export function MessageList(props: { messages: ChatMessage[]; streaming: boolean; className?: string }) {
  const { t } = useI18n()
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [props.messages])

  const onScroll = () => {
    const el = scrollRef.current
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const lastIndex = props.messages.length - 1

  return (
    <div ref={scrollRef} onScroll={onScroll} className={cn('overflow-y-auto', props.className)}>
      <div className='mx-auto flex max-w-[768px] flex-col gap-6 px-4 py-6'>
        {props.messages.map((m, index) => {
          if (m.role === 'user') {
            return (
              <div key={index} className='flex justify-end'>
                <div className={cn('max-w-[80%] px-4 py-2.5 text-[15px] leading-6 break-words whitespace-pre-wrap', s.user)}>
                  {m.content}
                </div>
              </div>
            )
          }
          const live = props.streaming && index === lastIndex
          return (
            <div key={index} className='flex flex-col gap-2'>
              {m.reasoning ? (
                <details open={live && !m.content} className='text-[13px]'>
                  <summary className={cn('cursor-pointer select-none', s.label)}>
                    {live && !m.content ? t('思考中…') : t('思考过程')}
                  </summary>
                  <div className={cn('mt-2 pl-3 leading-6 whitespace-pre-wrap', s.reasoning)}>{m.reasoning}</div>
                </details>
              ) : null}
              {m.content || (live && !m.reasoning) ? (
                <div className={cn('text-[15px] leading-7 break-words whitespace-pre-wrap', s.assistant)}>
                  {m.content}
                  {live ? (
                    <span
                      aria-hidden='true'
                      className='ml-0.5 inline-block h-4 w-[7px] translate-y-[3px] animate-pulse bg-current'
                    />
                  ) : null}
                </div>
              ) : null}
              {m.error ? (
                <div role='alert' className={cn('flex items-start gap-2 px-3 py-2 text-[13px]', s.error)}>
                  <AlertCircle className='mt-0.5 size-4 shrink-0' aria-hidden='true' />
                  <span className='break-words'>{m.error}</span>
                </div>
              ) : null}
              {!live && m.content ? (
                <div className='-ml-1.5 flex items-center gap-1'>
                  <CopyButton text={m.content} />
                  {m.model ? <span className={cn('ml-1 truncate text-[12px]', s.label)}>{m.model}</span> : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Copies a reply; the icon turns into a tick for two seconds. */
function CopyButton(props: { text: string }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const id = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(id)
  }, [copied])

  const label = copied ? t('已复制') : t('复制')
  return (
    <button
      type='button'
      aria-label={label}
      title={label}
      onClick={() => {
        navigator.clipboard.writeText(props.text).then(
          () => setCopied(true),
          () => undefined
        )
      }}
      className={cn('flex size-7 items-center justify-center transition-colors', s.action)}
    >
      {copied ? <Check className='size-3.5' aria-hidden='true' /> : <Copy className='size-3.5' aria-hidden='true' />}
    </button>
  )
}
