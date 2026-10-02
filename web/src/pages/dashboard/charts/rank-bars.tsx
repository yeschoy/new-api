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
import { cn } from '@/lib/format'

export type RankItem = { key: string; label: string; value: number; other?: boolean }

/** A ranked list with a bar per entry, scaled to the largest; "other" comes last without a rank. */
export function RankBars(props: { items: RankItem[]; format: (value: number) => string; ariaLabel: string }) {
  const max = Math.max(0, ...props.items.map((item) => item.value))
  return (
    <ol aria-label={props.ariaLabel} className='flex flex-col gap-2.5 p-5'>
      {props.items.map((item, index) => (
        <li
          key={item.key}
          className='grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-[13px] sm:grid-cols-[28px_minmax(0,220px)_minmax(0,1fr)_auto]'
        >
          <span className='text-or-dim tabular-nums'>{item.other ? '' : index + 1}</span>
          <span className='truncate' title={item.label}>
            {item.label}
          </span>
          <span className='bg-or-fill order-last col-span-full h-2 overflow-hidden rounded-full sm:order-none sm:col-span-1'>
            <span
              className={cn('block h-full rounded-full', item.other ? 'bg-or-dim' : 'bg-or-primary')}
              style={{ width: `${max > 0 ? Math.max(1, (item.value / max) * 100) : 0}%` }}
            />
          </span>
          <span className='text-right font-medium tabular-nums'>{props.format(item.value)}</span>
        </li>
      ))}
    </ol>
  )
}
