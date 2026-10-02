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
import { Check, CircleAlert, X, type LucideIcon } from 'lucide-react'

import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

/** One thing the desktop app may do once connected. */
export function Permission(props: { icon: LucideIcon; label: string }) {
  return (
    <div className='border-or-line bg-or-bg flex min-h-24 flex-col gap-3 rounded-[8px] border p-4'>
      <props.icon className='text-or-primary size-5' aria-hidden='true' />
      <p className='text-[14px] leading-5 font-medium'>{props.label}</p>
    </div>
  )
}

/** Why the connection cannot go ahead (yet). */
export function Problem(props: { title: string; text: string }) {
  return (
    <div role='alert' className='border-or-red/30 bg-or-red/10 flex gap-3 rounded-[8px] border p-4'>
      <CircleAlert className='text-or-red mt-0.5 size-4 shrink-0' aria-hidden='true' />
      <div>
        <p className='text-[14px] font-medium'>{props.title}</p>
        <p className='text-or-muted mt-1 text-[13px] leading-5'>{props.text}</p>
      </div>
    </div>
  )
}

/** The answer has been recorded; nothing is left to do on this page. */
export function Outcome(props: { approved: boolean }) {
  const { t } = useI18n()
  const Icon = props.approved ? Check : X
  return (
    <div className='flex flex-col items-center py-7 text-center'>
      <span
        className={cn(
          'flex size-16 items-center justify-center rounded-[16px]',
          props.approved ? 'bg-or-primary-soft text-or-primary' : 'bg-or-fill text-or-muted'
        )}
      >
        <Icon className='size-7' aria-hidden='true' />
      </span>
      <h2 className='mt-5 text-[24px] font-semibold tracking-[-0.4px]'>{props.approved ? t('已同意连接') : t('已拒绝连接')}</h2>
      <p className='text-or-muted mt-2 max-w-sm text-[14px] leading-6'>
        {props.approved ? t('现在可以关闭此页面，回到桌面助手继续使用。') : t('没有授予任何访问权限，可以关闭此页面。')}
      </p>
    </div>
  )
}
