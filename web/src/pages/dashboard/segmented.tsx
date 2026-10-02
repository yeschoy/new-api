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

/** A row of mutually exclusive buttons (range, chart type, metric); the pressed one is the current choice. */
export function Segmented<T extends string | number>(props: {
  items: Array<{ id: T; label: React.ReactNode }>
  value: T | null
  onChange: (id: T) => void
  ariaLabel: string
}) {
  return (
    <div role='group' aria-label={props.ariaLabel} className='border-or-line bg-or-fill inline-flex max-w-full shrink-0 overflow-x-auto rounded-[8px] border p-0.5'>
      {props.items.map((item) => {
        const pressed = item.id === props.value
        return (
          <button
            key={String(item.id)}
            type='button'
            aria-pressed={pressed}
            onClick={() => props.onChange(item.id)}
            className={cn(
              'flex h-7 shrink-0 items-center gap-1.5 rounded-[6px] px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors',
              pressed ? 'bg-or-card text-or-fg ring-or-line ring-1' : 'text-or-muted hover:text-or-fg'
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
