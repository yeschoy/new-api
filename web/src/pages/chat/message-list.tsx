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
import { AlertCircle } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { ProviderIcon } from '@/components/provider-icon'
import { cn } from '@/lib/format'
import type { CatalogModel } from '@/lib/queries'

import type { ChatMessage } from './use-chat'

const s = {
  user: 'border-or-line bg-or-fill text-or-fg rounded-[8px] border',
  assistant: 'text-or-fg',
  label: 'text-or-muted',
  reasoning: 'border-or-line text-or-muted border-l-2',
  error: 'border-or-red/30 bg-or-red/10 text-or-red rounded-[6px] border',
}

/** Scrollable thread; follows new tokens unless the reader scrolled up. */
export function MessageList(props: {
  messages: ChatMessage[]
  streaming: boolean
  models: CatalogModel[]
  className?: string
}) {
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
                <div className={cn('max-w-[80%] px-3.5 py-2.5 text-[14px] leading-6 break-words whitespace-pre-wrap', s.user)}>
                  {m.content}
                </div>
              </div>
            )
          }
          const live = props.streaming && index === lastIndex
          const name = m.model ?? ''
          const info = props.models.find((c) => c.model_name === name)
          return (
            <div key={index} className='flex flex-col gap-2'>
              <div className={cn('flex items-center gap-2 text-[13px] font-medium', s.label)}>
                <ProviderIcon name={info?.vendorIcon} fallback={info?.vendor ?? name} size={16} />
                <span className='truncate'>{name || '助手'}</span>
              </div>
              {m.reasoning ? (
                <details open={live && !m.content} className='text-[13px]'>
                  <summary className={cn('cursor-pointer select-none', s.label)}>
                    {live && !m.content ? '思考中…' : '思考过程'}
                  </summary>
                  <div className={cn('mt-2 pl-3 leading-6 whitespace-pre-wrap', s.reasoning)}>{m.reasoning}</div>
                </details>
              ) : null}
              {m.content || (live && !m.reasoning) ? (
                <div className={cn('text-[14px] leading-7 break-words whitespace-pre-wrap', s.assistant)}>
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
