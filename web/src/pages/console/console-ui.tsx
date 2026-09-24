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
import { useSiteSkin } from '@/site/site-skin'

/**
 * Console building blocks. Each one renders the dark catalog look for the
 * `router` skin and the light antd-style look for the `hub` skin.
 */
export function useIsRouter(): boolean {
  return useSiteSkin().skin === 'router'
}

/** Muted secondary text colour per skin. */
export function useMutedText(): string {
  return useIsRouter() ? 'text-or-muted' : 'text-[#626773]'
}

export function Panel(props: {
  title?: React.ReactNode
  extra?: React.ReactNode
  children: React.ReactNode
  flush?: boolean
  className?: string
}) {
  const router = useIsRouter()
  return (
    <section
      className={cn(
        'overflow-hidden',
        router
          ? 'border-or-line bg-or-card rounded-[8px] border'
          : 'rounded-[16px] border border-black/10 bg-white shadow-[0_2px_8px_rgba(0,0,0,0.06)]',
        props.className
      )}
    >
      {props.title ? (
        <header
          className={cn(
            'flex min-h-[52px] items-center justify-between gap-3 px-5 py-3',
            props.flush ? (router ? 'border-or-line border-b' : 'border-b border-[#f0f0f0]') : 'pb-0'
          )}
        >
          <h2 className={cn('text-[16px] font-semibold', router ? 'text-or-fg' : 'text-[rgba(0,0,0,0.88)]')}>
            {props.title}
          </h2>
          {props.extra}
        </header>
      ) : null}
      {props.flush ? props.children : <div className='p-5'>{props.children}</div>}
    </section>
  )
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const ROUTER_VARIANTS: Record<Variant, string> = {
  primary: 'bg-or-lime text-or-bg hover:bg-or-lime/90',
  secondary: 'border-or-line bg-or-bg text-or-fg hover:bg-or-fill border',
  danger: 'bg-or-red text-white hover:bg-or-red/90',
  ghost: 'text-or-muted hover:bg-or-fill hover:text-or-fg',
}

const HUB_VARIANTS: Record<Variant, string> = {
  primary: 'bg-hub-blue text-white shadow-[0_2px_0_rgba(5,145,255,0.1)] hover:bg-[#1d4ed8]',
  secondary: 'hover:border-hub-link hover:text-hub-link border border-[#d9d9d9] bg-white text-[rgba(0,0,0,0.88)]',
  danger: 'bg-[#ff4d4f] text-white hover:bg-[#ff7875]',
  ghost: 'text-[#626773] hover:bg-black/[0.04] hover:text-[rgba(0,0,0,0.88)]',
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
  const router = useIsRouter()
  const variant = props.variant ?? 'secondary'
  const small = props.size === 'sm'
  return (
    <button
      type={props.type ?? 'button'}
      onClick={props.onClick}
      disabled={props.disabled || props.busy}
      title={props.title}
      aria-label={props.ariaLabel}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        small ? 'h-7 px-2 text-[13px]' : 'h-9 px-3 text-[14px]',
        router ? 'rounded-[6px]' : small ? 'rounded-[6px]' : 'rounded-[8px]',
        (router ? ROUTER_VARIANTS : HUB_VARIANTS)[variant],
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
  const router = useIsRouter()
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
        'h-9 w-full min-w-0 px-3 text-[14px] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        router
          ? 'border-or-line bg-or-bg text-or-fg placeholder:text-or-dim focus:border-or-fg/25 rounded-[6px] border'
          : 'hover:border-hub-link focus:border-hub-link rounded-[8px] border border-[#d9d9d9] bg-white text-[rgba(0,0,0,0.88)] placeholder:text-black/25 focus:shadow-[0_0_0_2px_rgba(5,145,255,0.1)]',
        props.className
      )}
    />
  )
}

export function Field(props: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  const router = useIsRouter()
  return (
    <div className='flex flex-col gap-1.5'>
      <label htmlFor={props.htmlFor} className={cn('text-[13px] font-medium', router ? 'text-or-fg' : 'text-[rgba(0,0,0,0.88)]')}>
        {props.label}
      </label>
      {props.children}
      {props.hint ? <p className={cn('text-[12px]', router ? 'text-or-dim' : 'text-black/45')}>{props.hint}</p> : null}
    </div>
  )
}

type Tone = 'info' | 'success' | 'error'

export function Notice(props: { tone: Tone; children: React.ReactNode; className?: string }) {
  const router = useIsRouter()
  const tones: Record<Tone, string> = router
    ? {
        info: 'border-or-line bg-or-fill text-or-muted',
        success: 'border-or-lime/30 bg-or-lime-soft text-or-lime',
        error: 'border-or-red/30 bg-or-red/10 text-or-red',
      }
    : {
        info: 'border-[#91caff] bg-[#e6f4ff] text-[rgba(0,0,0,0.88)]',
        success: 'border-[#b7eb8f] bg-[#f6ffed] text-[rgba(0,0,0,0.88)]',
        error: 'border-[#ffccc7] bg-[#fff2f0] text-[rgba(0,0,0,0.88)]',
      }
  return (
    <div
      role={props.tone === 'error' ? 'alert' : 'status'}
      className={cn('border px-3 py-2 text-[13px]', router ? 'rounded-[6px]' : 'rounded-[8px]', tones[props.tone], props.className)}
    >
      {props.children}
    </div>
  )
}

export type TagTone = 'neutral' | 'success' | 'warning' | 'danger'

export function Tag(props: { tone?: TagTone; children: React.ReactNode }) {
  const router = useIsRouter()
  const tone = props.tone ?? 'neutral'
  const tones: Record<TagTone, string> = router
    ? {
        neutral: 'border-or-line text-or-muted',
        success: 'border-or-lime/30 text-or-lime',
        warning: 'border-amber-400/30 text-amber-300',
        danger: 'border-or-red/40 text-or-red',
      }
    : {
        neutral: 'border-[#d9d9d9] bg-[#fafafa] text-[rgba(0,0,0,0.88)]',
        success: 'border-[#b7eb8f] bg-[#f6ffed] text-[#389e0d]',
        warning: 'border-[#ffe58f] bg-[#fffbe6] text-[#d48806]',
        danger: 'border-[#ffccc7] bg-[#fff2f0] text-[#cf1322]',
      }
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-[4px] border px-1.5 text-[12px] leading-none font-medium whitespace-nowrap',
        tones[tone]
      )}
    >
      {props.children}
    </span>
  )
}
