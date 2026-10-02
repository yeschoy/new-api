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
import { useState } from 'react'

import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

import { formatShare } from './chart-scale'

export type Slice = { key: string; label: string; value: number; color: string }

const SIZE = 200
const OUTER = 92
const INNER = 60

function point(radius: number, angle: number): string {
  return `${(SIZE / 2 + radius * Math.cos(angle)).toFixed(2)} ${(SIZE / 2 + radius * Math.sin(angle)).toFixed(2)}`
}

function arc(from: number, to: number): string {
  const large = to - from > Math.PI ? 1 : 0
  return `M ${point(OUTER, from)} A ${OUTER} ${OUTER} 0 ${large} 1 ${point(OUTER, to)} L ${point(INNER, to)} A ${INNER} ${INNER} 0 ${large} 0 ${point(INNER, from)} Z`
}

/** Shares of a whole as a ring, with a list of names, values and percentages beside it. */
export function DonutChart(props: { slices: Slice[]; format: (value: number) => string; ariaLabel: string }) {
  const { t } = useI18n()
  const [active, setActive] = useState<string | null>(null)
  const total = props.slices.reduce((sum, slice) => sum + slice.value, 0)
  const focus = props.slices.find((slice) => slice.key === active)
  let angle = -Math.PI / 2

  return (
    <div className='flex flex-col items-center gap-6 p-5 sm:flex-row sm:items-start'>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role='img' aria-label={props.ariaLabel} className='size-[200px] shrink-0'>
        {props.slices.length === 1 ? (
          <circle cx={SIZE / 2} cy={SIZE / 2} r={(OUTER + INNER) / 2} fill='none' style={{ stroke: props.slices[0].color, strokeWidth: OUTER - INNER }} />
        ) : (
          props.slices.map((slice) => {
            const from = angle
            angle += total > 0 ? (slice.value / total) * Math.PI * 2 : 0
            return (
              <path
                key={slice.key}
                d={arc(from, angle)}
                style={{ fill: slice.color }}
                opacity={active === null || active === slice.key ? 1 : 0.35}
                onPointerEnter={() => setActive(slice.key)}
                onPointerLeave={() => setActive(null)}
              />
            )
          })
        )}
        <text x={SIZE / 2} y={SIZE / 2 - 4} textAnchor='middle' fontSize='12' style={{ fill: 'var(--or-muted)' }}>
          {focus ? focus.label.slice(0, 18) : t('合计')}
        </text>
        <text x={SIZE / 2} y={SIZE / 2 + 16} textAnchor='middle' fontSize='16' fontWeight='600' style={{ fill: 'var(--or-fg)' }}>
          {props.format(focus ? focus.value : total)}
        </text>
      </svg>
      <ul className='flex w-full min-w-0 flex-col gap-1.5 text-[13px]'>
        {props.slices.map((slice) => (
          <li
            key={slice.key}
            onPointerEnter={() => setActive(slice.key)}
            onPointerLeave={() => setActive(null)}
            className={cn('flex items-center gap-2 rounded-[6px] px-2 py-1', active === slice.key && 'bg-or-fill')}
          >
            <span aria-hidden='true' className='size-2.5 shrink-0 rounded-full' style={{ background: slice.color }} />
            <span className='min-w-0 flex-1 truncate' title={slice.label}>
              {slice.label}
            </span>
            <span className='text-or-muted shrink-0 tabular-nums'>{props.format(slice.value)}</span>
            <span className='w-14 shrink-0 text-right tabular-nums'>{formatShare(total > 0 ? slice.value / total : 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
