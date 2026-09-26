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
import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

import { DEFAULT_SETTINGS, type ChatSettings } from './use-chat'

const FIELD =
  'border-or-line bg-or-bg text-or-fg placeholder:text-or-dim focus:border-or-fg/25 w-full rounded-[6px] border px-3 text-[14px] outline-none transition-colors'

function isCustomized(settings: ChatSettings): boolean {
  return (
    settings.temperature !== DEFAULT_SETTINGS.temperature ||
    settings.maxTokens !== DEFAULT_SETTINGS.maxTokens ||
    settings.systemPrompt.trim() !== ''
  )
}

/** Top-bar popover for the sampling temperature, output cap and system prompt. */
export function ChatSettingsPopover(props: {
  settings: ChatSettings
  onChange: (settings: ChatSettings) => void
  className?: string
}) {
  const { t } = useI18n()
  const settings = props.settings
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const temperatureId = useId()
  const maxTokensId = useId()
  const systemPromptId = useId()
  const update = (patch: Partial<ChatSettings>) => props.onChange({ ...settings, ...patch })

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className={cn('relative', props.className)}>
      <button
        type='button'
        aria-label={t('对话设置')}
        title={t('对话设置')}
        aria-haspopup='dialog'
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'hover:bg-or-fill hover:text-or-fg relative flex size-9 shrink-0 items-center justify-center rounded-full transition-colors',
          open ? 'bg-or-fill text-or-fg' : 'text-or-muted'
        )}
      >
        <SlidersHorizontal className='size-4' aria-hidden='true' />
        {isCustomized(settings) ? (
          <span className='bg-or-primary absolute top-1.5 right-1.5 size-1.5 rounded-full' aria-hidden='true' />
        ) : null}
      </button>

      {open ? (
        <div
          role='dialog'
          aria-labelledby={titleId}
          className='border-or-line bg-or-card absolute bottom-full left-0 z-50 mb-2 max-h-[70vh] w-[320px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-[8px] border p-4 shadow-xl'
        >
          <div className='mb-4 flex items-center justify-between'>
            <h2 id={titleId} className='text-or-fg text-[14px] font-semibold'>
              {t('对话设置')}
            </h2>
            <button
              type='button'
              onClick={() => props.onChange(DEFAULT_SETTINGS)}
              className='text-or-muted hover:text-or-fg flex items-center gap-1 text-[13px] transition-colors'
            >
              <RotateCcw className='size-3.5' aria-hidden='true' />
              {t('重置')}
            </button>
          </div>

          <div className='flex flex-col gap-4'>
            <div>
              <div className='mb-1.5 flex items-center justify-between'>
                <label htmlFor={temperatureId} className='text-or-fg text-[13px] font-medium'>
                  {t('温度（Temperature）')}
                </label>
                <span className='font-geist text-or-muted text-[13px]'>{settings.temperature.toFixed(1)}</span>
              </div>
              <input
                id={temperatureId}
                type='range'
                min={0}
                max={2}
                step={0.1}
                value={settings.temperature}
                onChange={(e) => update({ temperature: Number(e.target.value) })}
                className='accent-or-primary h-4 w-full'
              />
              <div className='text-or-dim mt-0.5 flex justify-between text-[12px]'>
                <span>{t('精确')}</span>
                <span>{t('发散')}</span>
              </div>
            </div>

            <div>
              <label htmlFor={maxTokensId} className='text-or-fg mb-1.5 block text-[13px] font-medium'>
                {t('最大输出 Tokens')}
              </label>
              <input
                id={maxTokensId}
                type='number'
                min={1}
                step={1}
                inputMode='numeric'
                value={settings.maxTokens ?? ''}
                onChange={(e) => {
                  const value = Math.floor(Number(e.target.value))
                  update({ maxTokens: e.target.value === '' || !(value > 0) ? null : value })
                }}
                placeholder={t('不限制')}
                className={cn(FIELD, 'h-9')}
              />
            </div>

            <div>
              <label htmlFor={systemPromptId} className='text-or-fg mb-1.5 block text-[13px] font-medium'>
                {t('系统提示词')}
              </label>
              <textarea
                id={systemPromptId}
                rows={4}
                value={settings.systemPrompt}
                onChange={(e) => update({ systemPrompt: e.target.value })}
                placeholder={t('例如：你是一名资深的前端工程师，回答要简洁')}
                className={cn(FIELD, 'resize-y py-2 leading-[22px]')}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
