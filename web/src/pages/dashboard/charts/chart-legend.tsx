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

export type LegendItem = { key: string; label: string; color: string; value?: string }

/** Series names with their totals; picking one shows it alone, picking it again shows all. */
export function ChartLegend(props: { items: LegendItem[]; selected: string | null; onSelect: (key: string | null) => void }) {
  return (
    <ul className='flex flex-wrap gap-x-1 gap-y-1 px-4 pb-4 text-[12px]'>
      {props.items.map((item) => {
        const pressed = props.selected === item.key
        return (
          <li key={item.key}>
            <button
              type='button'
              aria-pressed={pressed}
              onClick={() => props.onSelect(pressed ? null : item.key)}
              className={cn(
                'hover:bg-or-fill flex max-w-[260px] items-center gap-1.5 rounded-[6px] px-2 py-1 transition-opacity',
                props.selected !== null && !pressed && 'opacity-40'
              )}
            >
              <span aria-hidden='true' className='size-2 shrink-0 rounded-full' style={{ background: item.color }} />
              <span className='truncate'>{item.label}</span>
              {item.value ? <span className='text-or-dim shrink-0 tabular-nums'>{item.value}</span> : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
