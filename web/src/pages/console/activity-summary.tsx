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
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { getUsageSummary, type DailyUsage } from '@/lib/console-api'
import { cn, compactNumber } from '@/lib/format'
import type { UsageLog } from '@/lib/services'

import { recentWindow, sumLogs } from './console-helpers'
import { useConsoleKey, useMoney } from './console-hooks'
import { Panel } from './console-ui'

const DAYS = 7

/**
 * Spend / tokens / requests for the last 7 days with a per-day bar strip.
 * Falls back to totals of the visible log page if the summary endpoint fails.
 */
export function UsageTiles(props: { logs: UsageLog[] }) {
  const money = useMoney()
  const [range] = useState(() => recentWindow(new Date(), DAYS))
  const summary = useQuery({
    queryKey: useConsoleKey('usage-summary', range.start),
    queryFn: () => getUsageSummary(range.start, range.end),
    retry: false,
  })
  const totals = summary.data ?? (summary.isError ? sumLogs(props.logs) : null)
  const caption = summary.isError ? '当前页' : `近 ${DAYS} 天`
  const byDate = new Map((summary.data?.daily ?? []).map((day) => [day.date, day]))
  const series = (pick: (day: DailyUsage) => number) => range.dates.map((date) => {
    const day = byDate.get(date)
    return day ? pick(day) : 0
  })
  const count = (value: number) => value.toLocaleString('zh-CN')

  const tiles = [
    { label: '消费', value: totals ? money.format(totals.quota) : '—', values: series((day) => day.quota), format: money.format },
    { label: 'Token', value: totals ? compactNumber(totals.tokens) : '—', values: series((day) => day.tokens), format: count },
    { label: '请求数', value: totals ? count(totals.requests) : '—', values: series((day) => day.requests), format: count },
  ]

  return (
    <div className='grid gap-4 md:grid-cols-3'>
      {tiles.map((tile) => (
        <Panel key={tile.label}>
          <div className='flex items-baseline justify-between gap-2'>
            <span className='text-or-muted text-[13px] font-medium'>{tile.label}</span>
            <span className='text-or-muted text-[12px]'>{caption}</span>
          </div>
          <div className='mt-1 text-[28px] leading-9 font-semibold tabular-nums'>{tile.value}</div>
          {summary.data ? <DayBars dates={range.dates} values={tile.values} format={tile.format} /> : <div className='mt-4 h-12' />}
        </Panel>
      ))}
    </div>
  )
}

function DayBars(props: { dates: string[]; values: number[]; format: (value: number) => string }) {
  const max = Math.max(0, ...props.values)
  return (
    <div className='mt-4 flex h-12 items-end gap-1'>
      {props.values.map((value, index) => (
        <div
          key={props.dates[index]}
          title={`${props.dates[index]}：${props.format(value)}`}
          className={cn('flex-1 rounded-[2px]', value > 0 ? 'bg-or-primary/80' : 'bg-or-line')}
          style={{ height: value > 0 && max > 0 ? `${Math.max(8, (value / max) * 100)}%` : '3px' }}
        />
      ))}
    </div>
  )
}
