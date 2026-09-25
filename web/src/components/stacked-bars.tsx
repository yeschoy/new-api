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
import { useMemo, useState } from 'react'

import { useI18n } from '@/i18n/i18n'
import { bucketLabel, compactNumber } from '@/lib/format'
import type { ModelHistoryPoint } from '@/lib/services'

export type ChartTheme = {
  palette: string[]
  grid: string
  text: string
  tooltipBg: string
  tooltipText: string
}

/** Stacked token bars per time bucket, with a hover tooltip per bucket. */
export function StackedBars(props: {
  points: ModelHistoryPoint[]
  models: string[]
  theme: ChartTheme
  height?: number
  showTotals?: boolean
}) {
  const { t, lang } = useI18n()
  const W = 1232
  const H = props.height ?? 300
  const pad = { l: 56, r: 12, t: 24, b: 36 }
  const [hover, setHover] = useState<number | null>(null)

  const buckets = useMemo(() => {
    const map = new Map<string, Map<string, number>>()
    for (const p of props.points) {
      if (!props.models.includes(p.model)) continue
      const label = bucketLabel(p.ts, p.label, lang)
      const row = map.get(label) ?? new Map<string, number>()
      row.set(p.model, (row.get(p.model) ?? 0) + p.tokens)
      map.set(label, row)
    }
    return [...map.entries()]
  }, [props.points, props.models, lang])

  if (buckets.length === 0) {
    return (
      <div className='flex h-[220px] items-center justify-center text-[13px]' style={{ color: props.theme.text }}>
        {t('暂无数据')}
      </div>
    )
  }

  const totals = buckets.map(([, row]) => [...row.values()].reduce((a, b) => a + b, 0))
  const max = Math.max(...totals) * 1.12
  const plotW = W - pad.l - pad.r
  const plotH = H - pad.t - pad.b
  const slot = plotW / buckets.length
  const barW = Math.max(4, Math.min(34, slot * 0.7))
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max)
  const every = buckets.length > 16 ? Math.ceil(buckets.length / 16) : 1
  const colorOf = (i: number) => props.theme.palette[i % props.theme.palette.length]

  return (
    <div className='relative'>
      <svg viewBox={`0 0 ${W} ${H}`} className='w-full' role='img' aria-label={t('模型 Token 用量走势')} onMouseLeave={() => setHover(null)}>
        {ticks.map((tick) => {
          const y = pad.t + plotH - (tick / max) * plotH
          return (
            <g key={tick}>
              <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} style={{ stroke: props.theme.grid }} />
              <text x={pad.l - 8} y={y + 3} textAnchor='end' fontSize='10' style={{ fill: props.theme.text }}>
                {compactNumber(tick)}
              </text>
            </g>
          )
        })}
        {buckets.map(([label, row], index) => {
          const x = pad.l + index * slot + (slot - barW) / 2
          let y = pad.t + plotH
          return (
            <g key={label} onMouseEnter={() => setHover(index)}>
              <rect x={pad.l + index * slot} y={pad.t} width={slot} height={plotH} fill='transparent' />
              {props.models.map((model, mi) => {
                const h = ((row.get(model) ?? 0) / max) * plotH
                y -= h
                return <rect key={model} x={x} y={y} width={barW} height={h} style={{ fill: colorOf(mi) }} opacity={hover === null || hover === index ? 1 : 0.55} />
              })}
              {props.showTotals && index % every === 0 ? (
                <text x={x + barW / 2} y={y - 5} textAnchor='middle' fontSize='9' style={{ fill: props.theme.text }}>
                  {compactNumber(totals[index])}
                </text>
              ) : null}
              {index % every === 0 ? (
                <text x={x + barW / 2} y={H - 14} textAnchor='middle' fontSize='10' style={{ fill: props.theme.text }}>
                  {label}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>
      {hover !== null ? (
        <div
          className='pointer-events-none absolute top-2 z-10 min-w-[180px] rounded-[8px] px-3 py-2 text-[12px] shadow-xl'
          style={{
            left: `${Math.min(80, ((hover + 0.5) / buckets.length) * 100)}%`,
            background: props.theme.tooltipBg,
            color: props.theme.tooltipText,
          }}
        >
          <div className='mb-1 font-semibold'>{buckets[hover][0]}</div>
          {props.models.map((model, mi) => (
            <div key={model} className='flex items-center justify-between gap-4'>
              <span className='flex items-center gap-1.5'>
                <span className='size-2 rounded-full' style={{ background: colorOf(mi) }} />
                {model}
              </span>
              <span>{compactNumber(buckets[hover][1].get(model) ?? 0)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** Colors resolve through the day/night CSS variables. */
export const ROUTER_CHART: ChartTheme = {
  palette: ['var(--or-primary)', '#4d8dff', '#f5a524', '#e879f9', '#22d3ee', '#fb7185', '#a78bfa', '#34d399', '#f97316', '#94a3b8'],
  grid: 'var(--or-line)',
  text: 'var(--or-dim)',
  tooltipBg: 'var(--or-card)',
  tooltipText: 'var(--or-fg)',
}
