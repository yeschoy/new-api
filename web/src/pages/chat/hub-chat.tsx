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
import { Plus } from 'lucide-react'

import { cn } from '@/lib/format'
import type { CatalogModel } from '@/lib/queries'

import { ChatComposer } from './chat-composer'
import { ChatEmptyState } from './chat-empty-state'
import { HubSettingsPanel, hubCard } from './hub-settings-panel'
import { MessageList } from './message-list'
import type { ChatController } from './use-chat'

/** Light playground: chat card on the left, settings column on the right. */
export function HubChat(props: { chat: ChatController; models: CatalogModel[]; loading: boolean }) {
  const chat = props.chat
  const messages = chat.active?.messages ?? []

  return (
    <div className='mx-auto w-full max-w-[1440px] px-5 pt-8 pb-12 md:px-[50px]'>
      <div className='mb-6'>
        <h1 className='font-serif-display text-hub-ink text-[36px] leading-tight font-bold'>在线对话</h1>
        <p className='text-hub-muted mt-1 text-[14px]'>在线体验与调试模型，对话记录仅保存在当前浏览器</p>
      </div>

      <div className='flex flex-col gap-4 lg:flex-row lg:items-start'>
        <section className={cn(hubCard, 'flex h-[calc(100dvh-220px)] min-h-[520px] min-w-0 flex-1 flex-col')}>
          <div className='border-hub-soft-line flex h-14 shrink-0 items-center gap-3 border-b px-5'>
            <h2 className='text-hub-ink min-w-0 flex-1 truncate text-[16px] font-semibold'>
              {chat.active?.title ?? '新对话'}
            </h2>
            <button
              type='button'
              onClick={chat.newChat}
              className='border-hub-line text-hub-ink hover:border-hub-blue hover:text-hub-blue flex h-8 shrink-0 items-center gap-1.5 rounded-[6px] border bg-white px-[15px] text-[14px] shadow-[0_2px_0_rgba(0,0,0,0.02)] transition-colors'
            >
              <Plus className='size-4' aria-hidden='true' />
              新对话
            </button>
          </div>

          {messages.length > 0 ? (
            <MessageList skin='hub' messages={messages} streaming={chat.streaming} models={props.models} className='min-h-0 flex-1' />
          ) : (
            <ChatEmptyState
              skin='hub'
              model={chat.model}
              disabled={!chat.model || chat.streaming}
              onPick={chat.send}
              className='min-h-0 flex-1 overflow-y-auto'
            />
          )}

          <div className='shrink-0 px-5 pt-2 pb-4'>
            <ChatComposer skin='hub' streaming={chat.streaming} disabled={!chat.model} onSend={chat.send} onStop={chat.stop} />
          </div>
        </section>

        <HubSettingsPanel chat={chat} models={props.models} loading={props.loading} className='w-full shrink-0 lg:w-[340px]' />
      </div>
    </div>
  )
}
