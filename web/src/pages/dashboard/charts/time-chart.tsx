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

import { bucketName, bucketTick, type Granularity } from '../dashboard-time'
import { niceTicks, useWidth } from './chart-scale'

export type TimeSeries = { key: string; label: string; color: string; values: number[] }

const HEIGHT = 260
const TOP = 12
const RIGHT = 12
const BOTTOM = 28
const TOOLTIP_ROWS = 10

/**
 * Values per time bucket: stacked bars, or one line per series. Hover (or tap)
 * a bucket to read its values; the chart is drawn at the real width of its box.
 */
export function TimeChart(props: {
  kind: 'bar' | 'line'
  buckets: number[]
  granularity: Granularity
  series: TimeSeries[]
  format: (value: number) => string
  ariaLabel: string
}) {
  const { ref, width } = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const count = Math.max(1, props.buckets.length)
  const totals = props.buckets.map((_, index) => props.series.reduce((sum, series) => sum + (series.values[index] ?? 0), 0))
  const peak = props.kind === 'bar' ? Math.max(0, ...totals) : Math.max(0, ...props.series.flatMap((series) => series.values))
  const ticks = niceTicks(peak)
  const top = ticks[ticks.length - 1]
  const tickText = ticks.map(props.format)
  const left = Math.min(96, Math.max(32, Math.max(...tickText.map((text) => text.length)) * 6.5 + 12))
  const plotW = Math.max(40, width - left - RIGHT)
  const plotH = HEIGHT - TOP - BOTTOM
  const slot = plotW / count
  const xAt = (index: number) => left + slot * (index + 0.5)
  const yAt = (value: number) => TOP + plotH - (value / top) * plotH
  const every = Math.max(1, Math.ceil(64 / slot))

  const pick = (event: React.PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    if (box.width <= 0) return
    const index = Math.floor(((event.clientX - box.left) / box.width) * count)
    setHover(Math.min(count - 1, Math.max(0, index)))
  }
  /** What the tooltip shows for a bucket: its name, the stack total for bars, and each series' value. */
  const tipAt = (index: number) => ({
    title: bucketName(props.buckets[index], props.granularity),
    total: props.kind === 'bar' ? props.format(totals[index]) : null,
    rows: props.series
      .map((series) => ({ key: series.key, label: series.label, color: series.color, value: series.values[index] ?? 0 }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value),
    at: (xAt(index) / width) * 100,
  })
  const tip = hover === null || props.buckets[hover] === undefined ? null : tipAt(hover)

  return (
    <div ref={ref} className='relative' onPointerLeave={() => setHover(null)}>
      <svg width={width} height={HEIGHT} role='img' aria-label={props.ariaLabel} className='block max-w-full'>
        {ticks.map((tick, index) => (
          <g key={tick}>
            <line x1={left} x2={left + plotW} y1={yAt(tick)} y2={yAt(tick)} style={{ stroke: 'var(--or-line)' }} />
            <text x={left - 8} y={yAt(tick) + 4} textAnchor='end' fontSize='11' style={{ fill: 'var(--or-dim)' }}>
              {tickText[index]}
            </text>
          </g>
        ))}
        {props.kind === 'bar' ? (
          <Bars series={props.series} count={props.buckets.length} hover={hover} width={Math.max(1, Math.min(28, slot * 0.68))} xAt={xAt} yAt={yAt} />
        ) : (
          <Lines series={props.series} count={props.buckets.length} xAt={xAt} yAt={yAt} />
        )}
        {hover !== null ? <line x1={xAt(hover)} x2={xAt(hover)} y1={TOP} y2={TOP + plotH} style={{ stroke: 'var(--or-dim)', strokeDasharray: '3 3' }} /> : null}
        {props.buckets.map((bucket, index) =>
          index % every === 0 ? (
            <text key={bucket} x={xAt(index)} y={HEIGHT - 9} textAnchor='middle' fontSize='11' style={{ fill: 'var(--or-dim)' }}>
              {bucketTick(bucket, props.granularity)}
            </text>
          ) : null
        )}
        <rect x={left} y={TOP} width={plotW} height={plotH} fill='transparent' onPointerMove={pick} onPointerDown={pick} />
      </svg>
      {tip ? <Tooltip title={tip.title} total={tip.total} rows={tip.rows} format={props.format} at={tip.at} /> : null}
    </div>
  )
}

type Scale = { xAt: (index: number) => number; yAt: (value: number) => number }

function Bars(props: Scale & { series: TimeSeries[]; count: number; hover: number | null; width: number }) {
  return (
    <>
      {Array.from({ length: props.count }, (_, index) => {
        let base = 0
        return (
          <g key={index} opacity={props.hover === null || props.hover === index ? 1 : 0.55}>
            {props.series.map((series) => {
              const value = series.values[index] ?? 0
              if (value <= 0) return null
              const bottom = props.yAt(base)
              base += value
              const y = props.yAt(base)
              return <rect key={series.key} x={props.xAt(index) - props.width / 2} y={y} width={props.width} height={Math.max(0.5, bottom - y)} style={{ fill: series.color }} />
            })}
          </g>
        )
      })}
    </>
  )
}

function Lines(props: Scale & { series: TimeSeries[]; count: number }) {
  const floor = props.yAt(0)
  return (
    <>
      {props.series.map((series) => {
        const points = series.values.map((value, index) => `${props.xAt(index).toFixed(1)},${props.yAt(value).toFixed(1)}`).join(' ')
        return (
          <g key={series.key}>
            <polygon points={`${props.xAt(0)},${floor} ${points} ${props.xAt(props.count - 1)},${floor}`} style={{ fill: series.color, opacity: 0.06 }} />
            <polyline points={points} fill='none' strokeLinejoin='round' style={{ stroke: series.color, strokeWidth: 1.75 }} />
            {props.count <= 48
              ? series.values.map((value, index) => <circle key={index} cx={props.xAt(index)} cy={props.yAt(value)} r={2} style={{ fill: series.color }} />)
              : null}
          </g>
        )
      })}
    </>
  )
}

function Tooltip(props: {
  title: string
  total: string | null
  rows: Array<{ key: string; label: string; color: string; value: number }>
  format: (value: number) => string
  at: number
}) {
  const { t } = useI18n()
  const side = props.at > 55 ? { right: `${100 - props.at}%` } : { left: `${props.at}%` }
  const hidden = props.rows.length - TOOLTIP_ROWS
  return (
    <div
      className='border-or-line bg-or-card text-or-fg pointer-events-none absolute top-2 z-10 mx-2 min-w-[180px] max-w-[280px] rounded-[8px] border px-3 py-2 text-[12px] shadow-xl'
      style={side}
    >
      <div className='mb-1 font-semibold'>{props.title}</div>
      {props.total !== null ? (
        <div className='text-or-muted flex justify-between gap-4'>
          <span>{t('合计')}</span>
          <span className='tabular-nums'>{props.total}</span>
        </div>
      ) : null}
      {props.rows.slice(0, TOOLTIP_ROWS).map((row) => (
        <div key={row.key} className='flex items-center justify-between gap-4'>
          <span className='flex min-w-0 items-center gap-1.5'>
            <span aria-hidden='true' className='size-2 shrink-0 rounded-full' style={{ background: row.color }} />
            <span className='truncate'>{row.label}</span>
          </span>
          <span className='shrink-0 tabular-nums'>{props.format(row.value)}</span>
        </div>
      ))}
      {hidden > 0 ? <div className='text-or-dim mt-0.5'>{t('另有 {count} 项', { count: hidden })}</div> : null}
    </div>
  )
}
