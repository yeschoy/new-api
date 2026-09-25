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
import { SquarePen } from 'lucide-react'

import type { CatalogModel } from '@/lib/queries'

import { ChatComposer } from './chat-composer'
import { ChatEmptyState } from './chat-empty-state'
import { ChatSettingsPopover } from './chat-settings'
import { MessageList } from './message-list'
import { ModelPicker } from './model-picker'
import { RouterSidebar } from './router-sidebar'
import type { ChatController } from './use-chat'

/** Chat workspace: history rail, model + settings bar, thread, composer. */
export function RouterChat(props: { chat: ChatController; models: CatalogModel[]; loading: boolean }) {
  const chat = props.chat
  const messages = chat.active?.messages ?? []

  return (
    <div className='flex h-[calc(100dvh-56px)] xl:h-[calc(100dvh-78px)]'>
      <RouterSidebar chat={chat} className='hidden md:flex' />
      <section className='flex min-w-0 flex-1 flex-col'>
        <div className='border-or-line flex h-14 shrink-0 items-center gap-2 border-b px-4'>
          <button
            type='button'
            onClick={chat.newChat}
            aria-label='新对话'
            title='新对话'
            className='border-or-line text-or-muted hover:text-or-fg flex size-9 shrink-0 items-center justify-center rounded-[6px] border md:hidden'
          >
            <SquarePen className='size-4' />
          </button>
          <ModelPicker
            models={props.models}
            value={chat.model}
            onChange={chat.setModel}
            loading={props.loading}
            className='w-[300px] min-w-0'
          />
          <div className='ml-auto flex min-w-9 items-center gap-3'>
            {chat.active ? (
              <span className='text-or-muted hidden truncate text-[13px] lg:block'>{chat.active.title}</span>
            ) : null}
            <ChatSettingsPopover settings={chat.settings} onChange={chat.setSettings} />
          </div>
        </div>

        {messages.length > 0 ? (
          <MessageList messages={messages} streaming={chat.streaming} models={props.models} className='min-h-0 flex-1' />
        ) : (
          <ChatEmptyState
            model={chat.model}
            disabled={!chat.model || chat.streaming}
            onPick={chat.send}
            className='min-h-0 flex-1 overflow-y-auto'
          />
        )}

        <div className='mx-auto w-full max-w-[768px] shrink-0 px-4 pt-2 pb-3'>
          <ChatComposer streaming={chat.streaming} disabled={!chat.model} onSend={chat.send} onStop={chat.stop} />
        </div>
      </section>
    </div>
  )
}
