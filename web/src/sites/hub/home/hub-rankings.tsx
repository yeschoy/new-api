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
import { useMemo, useState } from 'react'

import { HUB_CHART, StackedBars } from '@/components/stacked-bars'
import { cn, compactNumber } from '@/lib/format'
import { useRankings } from '@/lib/queries'
import type { ModelRanking, RankingPeriod } from '@/lib/services'

const PERIODS: Array<{ id: string; label: string; period: RankingPeriod; sort?: 'growth' }> = [
  { id: 'week', label: '近一周', period: 'week' },
  { id: 'month', label: '近一月', period: 'month' },
  { id: 'trending', label: '趋势', period: 'week', sort: 'growth' },
  { id: 'featured', label: '精选', period: 'month', sort: 'growth' },
]

export function RankingList(props: { rows: ModelRanking[] }) {
  const [expanded, setExpanded] = useState(false)
  const rows = expanded ? props.rows : props.rows.slice(0, 10)
  return (
    <>
      <ol>
        {rows.map((row, index) => (
          <li key={row.model_name} className='flex items-center justify-between border-b border-[#f0f0f0] px-2 py-3.5'>
            <span className='text-[13px] font-semibold text-[#1a1a1a]'>
              {index + 1}、{row.model_name}
            </span>
            <span className='text-[12px] text-[#888]'>{compactNumber(row.total_tokens)} tokens</span>
          </li>
        ))}
      </ol>
      {props.rows.length > 10 ? (
        <button type='button' onClick={() => setExpanded((v) => !v)} className='mx-auto mt-3 flex items-center gap-1 text-[12px] text-[#888]'>
          {expanded ? '收起' : '展开'} <ChevronDown className={cn('size-3.5', expanded && 'rotate-180')} />
        </button>
      ) : null}
    </>
  )
}

export function HubRankings() {
  const [tab, setTab] = useState(PERIODS[0])
  const [only, setOnly] = useState<string | null>(null)
  const history = useRankings('month')
  const listQuery = useRankings(tab.period)

  const chartModels = history.data?.models_history.models.map((m) => m.name) ?? []
  const rows = useMemo(() => {
    const list = [...(listQuery.data?.models ?? [])]
    if (tab.sort === 'growth') list.sort((a, b) => b.growth_pct - a.growth_pct)
    return list
  }, [listQuery.data, tab.sort])

  if (history.isSuccess && chartModels.length === 0 && rows.length === 0) return null

  return (
    <section className='mx-auto mt-24 max-w-[1232px] px-6 xl:px-0'>
      <h2 className='font-serif-display text-center text-[24px] leading-[30.4px] font-bold text-[rgba(0,0,0,0.88)]'>模型排行</h2>
      <div className='mt-6 flex w-fit overflow-hidden rounded-[6px] border border-[#d9d9d9] text-[12px]'>
        <span className='bg-white px-3 py-1 text-[#1a1a1a] shadow-[inset_0_0_0_1px_#1a1a1a]'>Token</span>
        <span className='px-3 py-1 text-[#bbb]' title='暂未提供请求数统计'>请求数</span>
      </div>
      <div className='mt-4 flex flex-wrap gap-2'>
        {[null, ...chartModels].map((name) => (
          <button
            key={name ?? 'all'}
            type='button'
            onClick={() => setOnly(name)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-[11px]',
              only === name ? 'border-hub-blue bg-hub-blue text-white' : 'border-[#e5e7eb] bg-white text-[#555]'
            )}
          >
            {name ?? '全部'}
          </button>
        ))}
      </div>
      <div className='mt-4'>
        <StackedBars
          points={history.data?.models_history.points ?? []}
          models={only ? [only] : chartModels}
          theme={HUB_CHART}
          height={320}
          showTotals
        />
      </div>
      <div className='mt-6 rounded-[12px] border border-[#e5e7eb] bg-white px-4 pt-3 pb-4'>
        <div className='mx-auto flex w-fit gap-0.5 rounded-[8px] bg-[#f5f5f5] p-0.5'>
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type='button'
              onClick={() => setTab(p)}
              className={cn('rounded-[6px] px-2.5 py-0.5 text-[12px]', tab.id === p.id ? 'bg-white text-[#1a1a1a] shadow-sm' : 'text-[#888]')}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className='mt-2'>
          <RankingList rows={rows} />
        </div>
      </div>
    </section>
  )
}
