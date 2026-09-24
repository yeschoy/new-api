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
import { Loader2 } from 'lucide-react'

import { cn } from '@/lib/format'

/**
 * Console building blocks. Colours come only from the `or-*` tokens, whose
 * values flip between the day and night palettes in CSS.
 */
export function Panel(props: {
  title?: React.ReactNode
  extra?: React.ReactNode
  children: React.ReactNode
  flush?: boolean
  className?: string
}) {
  return (
    <section className={cn('border-or-line bg-or-card overflow-hidden rounded-[8px] border', props.className)}>
      {props.title ? (
        <header
          className={cn(
            'flex min-h-[52px] items-center justify-between gap-3 px-5 py-3',
            props.flush ? 'border-or-line border-b' : 'pb-0'
          )}
        >
          <h2 className='text-or-fg text-[16px] font-semibold'>{props.title}</h2>
          {props.extra}
        </header>
      ) : null}
      {props.flush ? props.children : <div className='p-5'>{props.children}</div>}
    </section>
  )
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-or-primary text-or-bg hover:bg-or-primary/90',
  secondary: 'border-or-line bg-or-bg text-or-fg hover:bg-or-fill border',
  danger: 'bg-or-red text-white hover:bg-or-red/90',
  ghost: 'text-or-muted hover:bg-or-fill hover:text-or-fg',
}

export function Button(props: {
  children: React.ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: Variant
  size?: 'sm' | 'md'
  busy?: boolean
  disabled?: boolean
  title?: string
  ariaLabel?: string
  className?: string
}) {
  const small = props.size === 'sm'
  return (
    <button
      type={props.type ?? 'button'}
      onClick={props.onClick}
      disabled={props.disabled || props.busy}
      title={props.title}
      aria-label={props.ariaLabel}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[6px] font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        small ? 'h-7 px-2 text-[13px]' : 'h-9 px-3 text-[14px]',
        VARIANTS[props.variant ?? 'secondary'],
        props.className
      )}
    >
      {props.busy ? <Loader2 className='size-4 animate-spin' aria-hidden='true' /> : null}
      {props.children}
    </button>
  )
}

export function TextInput(props: {
  value: string
  onChange: (value: string) => void
  id?: string
  placeholder?: string
  type?: string
  inputMode?: 'decimal' | 'text'
  maxLength?: number
  autoFocus?: boolean
  disabled?: boolean
  ariaLabel?: string
  className?: string
}) {
  return (
    <input
      id={props.id}
      type={props.type ?? 'text'}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      placeholder={props.placeholder}
      inputMode={props.inputMode}
      maxLength={props.maxLength}
      autoFocus={props.autoFocus}
      disabled={props.disabled}
      aria-label={props.ariaLabel}
      className={cn(
        'border-or-line bg-or-bg text-or-fg placeholder:text-or-dim focus:border-or-fg/25 h-9 w-full min-w-0 rounded-[6px] border px-3 text-[14px] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        props.className
      )}
    />
  )
}

export function Field(props: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className='flex flex-col gap-1.5'>
      <label htmlFor={props.htmlFor} className='text-or-fg text-[13px] font-medium'>
        {props.label}
      </label>
      {props.children}
      {props.hint ? <p className='text-or-dim text-[12px]'>{props.hint}</p> : null}
    </div>
  )
}

type Tone = 'info' | 'success' | 'error'

const NOTICE_TONES: Record<Tone, string> = {
  info: 'border-or-line bg-or-fill text-or-muted',
  success: 'border-or-primary/30 bg-or-primary-soft text-or-primary',
  error: 'border-or-red/30 bg-or-red/10 text-or-red',
}

export function Notice(props: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <div
      role={props.tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-[6px] border px-3 py-2 text-[13px]', NOTICE_TONES[props.tone], props.className)}
    >
      {props.children}
    </div>
  )
}

export type TagTone = 'neutral' | 'success' | 'warning' | 'danger'

// There is no amber token, so the warning tag picks a readable shade per palette.
const TAG_TONES: Record<TagTone, string> = {
  neutral: 'border-or-line text-or-muted',
  success: 'border-or-primary/30 text-or-primary',
  warning: 'border-amber-500/40 text-amber-700 dark:text-amber-300',
  danger: 'border-or-red/40 text-or-red',
}

export function Tag(props: { tone?: TagTone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-[4px] border px-1.5 text-[12px] leading-none font-medium whitespace-nowrap',
        TAG_TONES[props.tone ?? 'neutral']
      )}
    >
      {props.children}
    </span>
  )
}
