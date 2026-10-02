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
import { ChevronDown, Search } from 'lucide-react'
import { useState } from 'react'

import { Button, Panel } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

/**
 * The filter panel of a log page: fields in a grid that steps down to one
 * column on phones, optional extra fields behind 更多筛选, figures for the
 * applied filters, and 重置 / 搜索 (Enter in any field searches too).
 */
export function LogFilterBar(props: {
  children: React.ReactNode
  advanced?: React.ReactNode
  /** Extra filters in use; they start expanded when there are any. */
  advancedCount?: number
  stats?: React.ReactNode
  tools?: React.ReactNode
  busy?: boolean
  onSearch: () => void
  onReset: () => void
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState((props.advancedCount ?? 0) > 0)

  return (
    <Panel>
      <form
        role='search'
        onSubmit={(event) => {
          event.preventDefault()
          props.onSearch()
        }}
      >
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          {props.children}
          {expanded ? props.advanced : null}
        </div>
        <div className='mt-4 flex flex-wrap items-center gap-3'>
          <div className='flex min-w-0 flex-wrap items-center gap-2'>{props.stats}</div>
          <div className='ml-auto flex flex-wrap items-center justify-end gap-2'>
            {props.tools}
            {props.advanced ? (
              <Button variant='ghost' onClick={() => setExpanded(!expanded)}>
                {expanded ? t('收起筛选') : t('更多筛选')}
                {props.advancedCount ? (
                  <span className='bg-or-primary-soft text-or-primary rounded-full px-1.5 text-[12px] leading-5'>{props.advancedCount}</span>
                ) : null}
                <ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} aria-hidden='true' />
              </Button>
            ) : null}
            <Button onClick={props.onReset}>{t('重置')}</Button>
            <Button type='submit' variant='primary' busy={props.busy}>
              {props.busy ? null : <Search className='size-4' aria-hidden='true' />}
              {t('搜索')}
            </Button>
          </div>
        </div>
      </form>
    </Panel>
  )
}

/** A small "label value" figure shown beside the filter buttons. */
export function StatChip(props: { label: string; value: string }) {
  return (
    <span className='border-or-line inline-flex h-7 items-center gap-1.5 rounded-[6px] border px-2.5 text-[13px]'>
      <span className='text-or-muted'>{props.label}</span>
      <span className='font-medium tabular-nums'>{props.value}</span>
    </span>
  )
}
