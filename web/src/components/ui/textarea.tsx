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

/** A multi-line input styled like the text inputs; mono for JSON, keys and code. */
export function Textarea(props: {
  value: string
  onChange: (value: string) => void
  id?: string
  rows?: number
  placeholder?: string
  mono?: boolean
  disabled?: boolean
  ariaLabel?: string
  className?: string
}) {
  return (
    <textarea
      id={props.id}
      rows={props.rows ?? 4}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      placeholder={props.placeholder}
      disabled={props.disabled}
      aria-label={props.ariaLabel}
      className={cn(
        'border-or-line bg-or-bg text-or-fg placeholder:text-or-dim focus:border-or-fg/25 w-full min-w-0 resize-y rounded-[6px] border px-3 py-2 text-[14px] leading-[22px] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        props.mono ? 'font-geist text-[13px]' : null,
        props.className
      )}
    />
  )
}
