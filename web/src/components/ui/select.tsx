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
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/format'

export type SelectOption = { value: string; label: string; disabled?: boolean }

/** A native select styled like the text inputs. */
export function Select(props: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  id?: string
  ariaLabel?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <span className={cn('relative block', props.className)}>
      <select
        id={props.id}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        aria-label={props.ariaLabel}
        disabled={props.disabled}
        className='border-or-line bg-or-bg text-or-fg focus:border-or-fg/25 h-9 w-full min-w-0 appearance-none rounded-[6px] border pr-8 pl-3 text-[14px] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60'
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className='text-or-muted pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2' aria-hidden='true' />
    </span>
  )
}
