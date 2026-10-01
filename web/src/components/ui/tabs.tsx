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

/** A row of tabs; the page shows the matching content itself. */
export function Tabs<T extends string>(props: {
  items: Array<{ id: T; label: string }>
  value: T
  onChange: (id: T) => void
  ariaLabel: string
  className?: string
}) {
  return (
    <div role='tablist' aria-label={props.ariaLabel} className={cn('border-or-line flex gap-1 overflow-x-auto border-b', props.className)}>
      {props.items.map((item) => {
        const selected = item.id === props.value
        return (
          <button
            key={item.id}
            type='button'
            role='tab'
            aria-selected={selected}
            onClick={() => props.onChange(item.id)}
            className={cn(
              '-mb-px h-10 shrink-0 border-b-2 px-3 text-[14px] font-medium whitespace-nowrap transition-colors',
              selected ? 'border-or-primary text-or-fg' : 'text-or-muted hover:text-or-fg border-transparent'
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
