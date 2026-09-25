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
import { MessageSquare, Plus, Trash2 } from 'lucide-react'

import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

import type { ChatController } from './use-chat'

/** Left rail: "new chat" plus the locally stored conversation history. */
export function RouterSidebar(props: { chat: ChatController; className?: string }) {
  const { t } = useI18n()
  const chat = props.chat
  return (
    <aside className={cn('border-or-line w-[260px] shrink-0 flex-col border-r', props.className)}>
      <div className='p-3'>
        <button
          type='button'
          onClick={chat.newChat}
          className='border-or-line text-or-fg hover:bg-or-fill flex h-9 w-full items-center gap-2 rounded-[6px] border px-3 text-[14px] font-medium transition-colors'
        >
          <Plus className='size-4' aria-hidden='true' />
          {t('新对话')}
        </button>
      </div>
      <div className='text-or-dim px-5 pt-1 pb-1.5 text-[12px] font-medium'>{t('历史对话')}</div>
      <ul className='min-h-0 flex-1 overflow-y-auto px-2 pb-3'>
        {chat.conversations.length === 0 ? (
          <li className='text-or-dim px-3 py-4 text-[13px]'>{t('暂无对话记录')}</li>
        ) : null}
        {chat.conversations.map((c) => {
          const active = c.id === chat.activeId
          return (
            <li key={c.id} className='group relative'>
              <button
                type='button'
                onClick={() => chat.select(c.id)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex h-9 w-full items-center gap-2 rounded-[6px] pr-9 pl-3 text-left text-[14px] transition-colors',
                  active ? 'bg-or-fill text-or-fg' : 'text-or-muted hover:bg-or-fill hover:text-or-fg'
                )}
              >
                <MessageSquare className='size-3.5 shrink-0 opacity-70' aria-hidden='true' />
                <span className='truncate'>{c.title || t('新对话')}</span>
              </button>
              <button
                type='button'
                onClick={() => chat.remove(c.id)}
                aria-label={t('删除对话：{title}', { title: c.title })}
                title={t('删除对话')}
                className={cn(
                  'text-or-muted hover:text-or-red absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-[4px] transition-opacity group-hover:opacity-100 focus-visible:opacity-100',
                  active ? 'opacity-100' : 'opacity-0'
                )}
              >
                <Trash2 className='size-3.5' />
              </button>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
