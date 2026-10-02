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
import { useId } from 'react'
import { Link } from 'react-router'

import { getLang, localeOf } from '@/i18n/i18n'
import { cn } from '@/lib/format'

const LINK_VARIANTS = {
  primary: 'bg-or-primary text-or-bg hover:bg-or-primary/90',
  secondary: 'border-or-line bg-or-bg text-or-fg hover:bg-or-fill border',
}

/** A link that looks like the console buttons. */
export function LinkButton(props: { to: string; children: React.ReactNode; variant?: keyof typeof LINK_VARIANTS }) {
  return (
    <Link
      to={props.to}
      className={cn(
        'inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[6px] px-3 text-[14px] font-medium whitespace-nowrap transition-colors',
        LINK_VARIANTS[props.variant ?? 'secondary']
      )}
    >
      {props.children}
    </Link>
  )
}

/**
 * A console panel that is a named region (its heading names it), so each
 * block of the dashboards can be found by its title.
 */
export function Section(props: {
  title: string
  description?: React.ReactNode
  extra?: React.ReactNode
  flush?: boolean
  className?: string
  children: React.ReactNode
}) {
  const id = useId()
  return (
    <section aria-labelledby={id} className={cn('border-or-line bg-or-card min-w-0 overflow-hidden rounded-[8px] border', props.className)}>
      <header
        className={cn(
          'flex min-h-[52px] flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-3',
          props.flush ? 'border-or-line border-b' : 'pb-0'
        )}
      >
        <div className='min-w-0'>
          <h2 id={id} className='text-or-fg text-[16px] font-semibold'>
            {props.title}
          </h2>
          {props.description ? <p className='text-or-muted mt-0.5 text-[13px]'>{props.description}</p> : null}
        </div>
        {props.extra}
      </header>
      {props.flush ? props.children : <div className='p-5'>{props.children}</div>}
    </section>
  )
}

/** A small figure with its label; the label names the region. */
export function StatTile(props: { label: string; value: string; caption?: React.ReactNode; children?: React.ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className='border-or-line bg-or-card min-w-0 rounded-[8px] border p-5'>
      <h2 id={id} className='text-or-muted text-[13px] font-medium'>
        {props.label}
      </h2>
      <div className='mt-1 truncate text-[24px] leading-8 font-semibold tabular-nums' title={props.value}>
        {props.value}
      </div>
      {props.caption ? <div className='text-or-dim mt-1 text-[12px]'>{props.caption}</div> : null}
      {props.children}
    </section>
  )
}

export type DotTone = 'good' | 'bad' | 'warn' | 'info' | 'neutral'

// Status accents that read on both palettes: the site's green "up", the chart amber, and the tokens.
const DOT_TONES: Record<DotTone, string> = {
  good: 'bg-[#22c55e]',
  bad: 'bg-or-red',
  warn: 'bg-[#f5a524]',
  info: 'bg-or-blue',
  neutral: 'bg-or-dim',
}

export function StatusDot(props: { tone: DotTone; className?: string }) {
  return <span aria-hidden='true' className={cn('inline-block size-2 shrink-0 rounded-full', DOT_TONES[props.tone], props.className)} />
}

/** Centred note for a list or chart with nothing to show. */
export function EmptyNote(props: { children: React.ReactNode; className?: string }) {
  return <p className={cn('text-or-muted px-5 py-10 text-center text-[13px]', props.className)}>{props.children}</p>
}

/** Whole numbers in the page language: 1234 → "1,234". */
export function formatCount(value: number): string {
  return Math.round(Number.isFinite(value) ? value : 0).toLocaleString(localeOf(getLang()))
}

/** Rates with up to three decimals: 0.0347 → "0.035". */
export function formatRate(value: number): string {
  return (Number.isFinite(value) ? value : 0).toLocaleString(localeOf(getLang()), { maximumFractionDigits: 3 })
}
