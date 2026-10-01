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

/** An on/off switch; the label names it for screen readers and, unless hidden, sits beside it. */
export function Switch(props: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  hideLabel?: boolean
  id?: string
  disabled?: boolean
}) {
  return (
    <span className='inline-flex items-center gap-2 text-[14px]'>
      <button
        id={props.id}
        type='button'
        role='switch'
        aria-checked={props.checked}
        aria-label={props.label}
        disabled={props.disabled}
        onClick={() => props.onChange(!props.checked)}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          props.checked ? 'bg-or-primary' : 'bg-or-fg/20'
        )}
      >
        <span className={cn('absolute top-0.5 left-0.5 size-4 rounded-full transition-transform', props.checked ? 'bg-or-bg translate-x-4' : 'bg-white')} />
      </button>
      {props.hideLabel ? null : <span aria-hidden='true'>{props.label}</span>}
    </span>
  )
}
