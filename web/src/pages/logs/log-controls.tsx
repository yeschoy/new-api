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
import { Eye, EyeOff } from 'lucide-react'

import { Button, Pager, Select } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

import type { LogScope } from './log-types'
import { PAGE_SIZES } from './use-log-search'

/** Admins switch between everyone's logs and their own. */
export function ScopeSwitch(props: { value: LogScope; onChange: (scope: LogScope) => void }) {
  const { t } = useI18n()
  const options: Array<{ id: LogScope; label: string }> = [
    { id: 'all', label: t('全部用户') },
    { id: 'self', label: t('仅自己') },
  ]
  return (
    <div role='group' aria-label={t('查看范围')} className='border-or-line bg-or-fill flex rounded-[8px] border p-0.5'>
      {options.map((option) => (
        <button
          key={option.id}
          type='button'
          aria-pressed={props.value === option.id}
          onClick={() => props.onChange(option.id)}
          className={cn(
            'h-8 rounded-[6px] px-3 text-[13px] font-medium whitespace-nowrap transition-colors',
            props.value === option.id ? 'bg-or-card text-or-fg shadow-sm' : 'text-or-muted hover:text-or-fg'
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** Hides key names, users, groups, channel names and spend, e.g. while sharing the screen. */
export function MaskToggle(props: { masked: boolean; onChange: (masked: boolean) => void }) {
  const { t } = useI18n()
  const label = props.masked ? t('显示敏感信息') : t('隐藏敏感信息')
  return (
    <Button variant='ghost' ariaLabel={label} title={label} onClick={() => props.onChange(!props.masked)}>
      {props.masked ? <EyeOff className='size-4' aria-hidden='true' /> : <Eye className='size-4' aria-hidden='true' />}
    </Button>
  )
}

/** Rows per page beside the shared pager. */
export function LogPager(props: { page: number; size: number; total: number; onPage: (page: number) => void; onSize: (size: number) => void }) {
  const { t } = useI18n()
  return (
    <div className='flex flex-wrap items-start justify-between gap-x-4'>
      {props.total > PAGE_SIZES[0] ? (
        <label className='text-or-muted mt-4 flex items-center gap-2 text-[13px]'>
          {t('每页')}
          <Select
            value={String(props.size)}
            onChange={(value) => props.onSize(Number(value))}
            options={PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
            ariaLabel={t('每页条数')}
            className='w-[84px]'
          />
        </label>
      ) : (
        <span />
      )}
      <Pager page={props.page} size={props.size} total={props.total} onChange={props.onPage} />
    </div>
  )
}
