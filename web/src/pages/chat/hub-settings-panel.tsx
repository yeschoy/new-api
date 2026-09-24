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
import { RotateCcw, Trash2 } from 'lucide-react'

import { cn } from '@/lib/format'
import type { CatalogModel } from '@/lib/queries'

import { ModelPicker } from './model-picker'
import { DEFAULT_SETTINGS, type ChatController } from './use-chat'

export const hubCard = 'rounded-[16px] border border-black/10 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)]'

const field =
  'text-hub-ink placeholder:text-hub-muted w-full rounded-[6px] border border-hub-line bg-white px-[11px] text-[14px] outline-none transition-[border-color,box-shadow] hover:border-hub-blue focus:border-hub-blue focus:shadow-[0_0_0_2px_rgba(37,99,235,0.1)]'

function Label(props: { htmlFor?: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className='mb-2 flex items-center justify-between'>
      <label htmlFor={props.htmlFor} className='text-hub-ink text-[14px]'>
        {props.children}
      </label>
      {props.extra}
    </div>
  )
}

/** Right column: model + sampling parameters, then local history. */
export function HubSettingsPanel(props: {
  chat: ChatController
  models: CatalogModel[]
  loading: boolean
  className?: string
}) {
  const chat = props.chat
  const settings = chat.settings
  const update = (patch: Partial<typeof settings>) => chat.setSettings({ ...settings, ...patch })

  return (
    <aside className={cn('flex flex-col gap-4', props.className)}>
      <section className={cn(hubCard, 'p-5')}>
        <div className='mb-4 flex items-center justify-between'>
          <h2 className='font-serif-display text-hub-ink text-[20px] font-bold'>参数设置</h2>
          <button
            type='button'
            onClick={() => chat.setSettings(DEFAULT_SETTINGS)}
            className='text-hub-muted hover:text-hub-blue flex items-center gap-1 text-[13px]'
          >
            <RotateCcw className='size-3.5' aria-hidden='true' />
            重置
          </button>
        </div>

        <div className='flex flex-col gap-5'>
          <div>
            <Label>模型</Label>
            <ModelPicker skin='hub' models={props.models} value={chat.model} onChange={chat.setModel} loading={props.loading} />
          </div>

          <div>
            <Label htmlFor='chat-temperature' extra={<span className='text-hub-text font-geist text-[13px]'>{settings.temperature.toFixed(1)}</span>}>
              温度（Temperature）
            </Label>
            <input
              id='chat-temperature'
              type='range'
              min={0}
              max={2}
              step={0.1}
              value={settings.temperature}
              onChange={(e) => update({ temperature: Number(e.target.value) })}
              className='accent-hub-blue h-4 w-full'
            />
            <div className='text-hub-muted mt-1 flex justify-between text-[12px]'>
              <span>精确</span>
              <span>发散</span>
            </div>
          </div>

          <div>
            <Label htmlFor='chat-max-tokens'>最大输出 Tokens</Label>
            <input
              id='chat-max-tokens'
              type='number'
              min={1}
              step={1}
              inputMode='numeric'
              value={settings.maxTokens ?? ''}
              onChange={(e) => {
                const value = Math.floor(Number(e.target.value))
                update({ maxTokens: e.target.value === '' || !(value > 0) ? null : value })
              }}
              placeholder='不限制'
              className={cn(field, 'h-8')}
            />
          </div>

          <div>
            <Label htmlFor='chat-system-prompt'>系统提示词</Label>
            <textarea
              id='chat-system-prompt'
              rows={4}
              value={settings.systemPrompt}
              onChange={(e) => update({ systemPrompt: e.target.value })}
              placeholder='例如：你是一名资深的前端工程师，回答要简洁'
              className={cn(field, 'resize-y py-1.5 leading-[22px]')}
            />
          </div>
        </div>
      </section>

      <section className={cn(hubCard, 'p-5')}>
        <h2 className='font-serif-display text-hub-ink mb-3 text-[20px] font-bold'>历史对话</h2>
        {chat.conversations.length === 0 ? <p className='text-hub-muted text-[13px]'>暂无对话记录</p> : null}
        <ul className='-mx-2 flex max-h-[260px] flex-col gap-0.5 overflow-y-auto'>
          {chat.conversations.map((c) => {
            const active = c.id === chat.activeId
            return (
              <li key={c.id} className='group flex items-center gap-1'>
                <button
                  type='button'
                  onClick={() => chat.select(c.id)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'min-w-0 flex-1 truncate rounded-[6px] px-2 py-1.5 text-left text-[14px] transition-colors',
                    active ? 'text-hub-blue bg-[#e6f4ff]' : 'text-hub-text hover:bg-hub-fill'
                  )}
                >
                  {c.title || '新对话'}
                </button>
                <button
                  type='button'
                  onClick={() => chat.remove(c.id)}
                  aria-label={`删除对话：${c.title}`}
                  title='删除对话'
                  className='text-hub-muted flex size-7 shrink-0 items-center justify-center rounded-[6px] hover:bg-[#fff2f0] hover:text-[#ff4d4f]'
                >
                  <Trash2 className='size-3.5' />
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    </aside>
  )
}
