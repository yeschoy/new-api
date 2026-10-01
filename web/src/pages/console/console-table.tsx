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
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

import { pageCount } from './console-helpers'
import { Button } from './console-ui'

export type Column = { label: string; right?: boolean }

/** Scrollable data table; place it inside a flush `Panel`. */
export function Table(props: { columns: Column[]; minWidth?: number; children: React.ReactNode }) {
  const { t } = useI18n()
  return (
    <div className='overflow-x-auto'>
      <table className='w-full border-collapse text-left text-[14px]' style={{ minWidth: props.minWidth }}>
        <thead className='text-or-muted text-[13px]'>
          <tr>
            {props.columns.map((column) => (
              <th
                key={column.label}
                scope='col'
                className={cn('px-4 py-2.5 font-medium whitespace-nowrap', column.right && 'text-right')}
              >
                {t(column.label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{props.children}</tbody>
      </table>
    </div>
  )
}

export function Tr(props: { children: React.ReactNode }) {
  return <tr className='border-or-line hover:bg-or-fill border-t'>{props.children}</tr>
}

export function Td(props: { children: React.ReactNode; right?: boolean; muted?: boolean; mono?: boolean; className?: string }) {
  return (
    <td
      className={cn(
        'px-4 py-3 align-middle',
        props.right && 'text-right tabular-nums',
        props.muted && 'text-or-muted',
        props.mono && 'font-geist text-[13px]',
        props.className
      )}
    >
      {props.children}
    </td>
  )
}

/** Full-width row for loading / empty / error states. */
export function TableMessage(props: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={props.colSpan} className='text-or-muted px-4 py-16 text-center text-[14px]'>
        {props.children}
      </td>
    </tr>
  )
}

export function Pager(props: { page: number; size: number; total: number; onChange: (page: number) => void }) {
  const { t } = useI18n()
  const pages = pageCount(props.total, props.size)
  if (props.total <= props.size && props.page === 1) return null
  return (
    <div className='mt-4 flex items-center justify-end gap-2'>
      <span className='text-or-muted mr-2 text-[13px]'>
        {t('第 {page} / {pages} 页 · 共 {total} 条', { page: props.page, pages, total: props.total })}
      </span>
      <Button size='sm' disabled={props.page <= 1} onClick={() => props.onChange(props.page - 1)}>
        <ChevronLeft className='size-4' aria-hidden='true' />
        {t('上一页')}
      </Button>
      <Button size='sm' disabled={props.page >= pages} onClick={() => props.onChange(props.page + 1)}>
        {t('下一页')}
        <ChevronRight className='size-4' aria-hidden='true' />
      </Button>
    </div>
  )
}
