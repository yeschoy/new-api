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
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { LiquidGlass } from '@/components/liquid-glass'
import { cn } from '@/lib/utils'

function MockWindow(props: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <LiquidGlass
      tilt
      className={cn('overflow-hidden rounded-2xl border', props.className)}
    >
      <div className='flex items-center gap-2 border-b border-white/20 px-4 py-2.5 dark:border-white/10'>
        <span className='bg-foreground/18 size-2 rounded-full' />
        <span className='bg-foreground/12 size-2 rounded-full' />
        <span className='bg-foreground/8 size-2 rounded-full' />
        <span className='text-muted-foreground ml-2 truncate text-xs'>
          {props.title}
        </span>
      </div>
      <div className='p-4'>{props.children}</div>
    </LiquidGlass>
  )
}

export function KeyCreatedMock() {
  const { t } = useTranslation()
  return (
    <MockWindow title={t('Create a key')}>
      <div className='flex items-center gap-2 text-sm font-medium'>
        <span className='bg-success/15 text-success flex size-5 items-center justify-center rounded-full'>
          <Check className='size-3' strokeWidth={2.5} />
        </span>
        {t('API Key created')}
      </div>
      <div className='liquid-glass-inset mt-3 rounded-lg border px-3 py-2 font-mono text-xs'>
        sk-••••••••••••••••
      </div>
      <p className='text-muted-foreground mt-2 text-xs'>
        {t('Pick a rate group')} · default
      </p>
    </MockWindow>
  )
}

export function PasteFieldsMock() {
  const { t } = useTranslation()
  const rows = [
    { label: t('Base URL'), value: 'https://api.…/v1' },
    { label: t('API Key'), value: 'sk-••••••••••••••••' },
    { label: t('Model ID'), value: 'your-model-id' },
  ]
  return (
    <MockWindow title={t('Paste these three fields')}>
      <div className='grid gap-2'>
        {rows.map((row) => (
          <div
            key={row.label}
            className='liquid-glass-inset rounded-lg border px-3 py-2'
          >
            <div className='text-muted-foreground text-[10px] tracking-wide uppercase'>
              {row.label}
            </div>
            <div className='truncate font-mono text-xs'>{row.value}</div>
          </div>
        ))}
      </div>
    </MockWindow>
  )
}

export function HelloMock() {
  const { t } = useTranslation()
  return (
    <MockWindow title={t('Send 你好')}>
      <div className='flex justify-end'>
        <div className='liquid-chat-user bg-primary text-primary-foreground rounded-2xl rounded-br-md px-3 py-1.5 text-sm'>
          你好
        </div>
      </div>
      <div className='mt-3 flex justify-start'>
        <div className='liquid-chat-reply liquid-glass-inset rounded-2xl rounded-bl-md border px-3 py-2 text-sm'>
          <span className='text-success mr-2 font-mono text-xs'>200</span>
          {t('It replied.')}
        </div>
      </div>
    </MockWindow>
  )
}
