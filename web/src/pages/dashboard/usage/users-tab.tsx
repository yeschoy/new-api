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
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { Notice, Select } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { useConsoleKey, useMoney } from '@/pages/console/console-hooks'

import { ChartLegend } from '../charts/chart-legend'
import { RankBars } from '../charts/rank-bars'
import { TimeChart } from '../charts/time-chart'
import { getUserQuotaRows } from '../dashboard-api'
import { useAmount } from '../dashboard-money'
import { GRANULARITIES, RANGE_DAYS, daysFor, isGranularity, rangeLabel, rollingWindow, type Granularity } from '../dashboard-time'
import { EmptyNote, Section } from '../dashboard-ui'
import { Segmented } from '../segmented'
import { namedSeries, namedShares, useIsolation } from './chart-series'
import { breakdown, totalsOf } from './usage-data'

const TOP_LIMITS = [5, 10, 20, 50]

/** Admin view: which accounts spend the most, and how their spend moves over time. */
export function UsersTab(props: { initialGranularity: Granularity }) {
  const { t, lang } = useI18n()
  const money = useMoney()
  const amount = useAmount()
  const [granularity, setGranularity] = useState(props.initialGranularity)
  const [days, setDays] = useState(() => daysFor(props.initialGranularity))
  const [span, setSpan] = useState(() => rollingWindow(daysFor(props.initialGranularity)))
  const [limit, setLimit] = useState(10)

  const rows = useQuery({
    queryKey: useConsoleKey('dashboard', 'usage-users', span.start, span.end),
    queryFn: () => getUserQuotaRows(span),
    placeholderData: keepPreviousData,
  })
  const current = rows.isError ? undefined : rows.data
  // lang: unnamed accounts are labelled in the page language.
  const data = useMemo(() => breakdown(current ?? [], span, granularity, (row) => row.username || t('未知')), [current, span, granularity, t, lang])
  const total = useMemo(() => totalsOf(current ?? []).quota, [current])
  const series = namedSeries(data, 'quota', limit)
  const isolation = useIsolation(series)
  const empty = rows.isLoading ? t('加载中…') : t('暂无数据')

  const pickDays = (next: number) => {
    setDays(next)
    setSpan(rollingWindow(next))
  }
  // A new granularity brings its own range, as in the old dashboard.
  const pickGranularity = (value: string) => {
    if (!isGranularity(value)) return
    setGranularity(value)
    pickDays(daysFor(value))
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <Segmented ariaLabel={t('时间范围')} items={RANGE_DAYS.map((item) => ({ id: item, label: rangeLabel(item) }))} value={days} onChange={pickDays} />
        <Select
          ariaLabel={t('时间粒度')}
          value={granularity}
          onChange={pickGranularity}
          options={GRANULARITIES.map((item) => ({ value: item.id, label: t(item.label) }))}
          className='w-[112px]'
        />
        <Segmented
          ariaLabel={t('显示数量')}
          items={TOP_LIMITS.map((item) => ({ id: item, label: t('前 {count} 名', { count: item }) }))}
          value={limit}
          onChange={setLimit}
        />
      </div>
      {rows.isError ? <Notice tone='error'>{errorMessage(rows.error, t('用量数据加载失败'))}</Notice> : null}

      <Section title={t('用户消费排行')} description={t('合计 {amount}', { amount: money.format(total) })} flush>
        {series.length === 0 ? (
          <EmptyNote>{empty}</EmptyNote>
        ) : (
          <RankBars items={namedShares(data, 'quota', limit)} format={money.format} ariaLabel={t('用户消费排行')} />
        )}
      </Section>

      <Section title={t('用户消费趋势')} flush>
        {series.length === 0 ? (
          <EmptyNote>{empty}</EmptyNote>
        ) : (
          <>
            <div className='px-2 pt-4 sm:px-3'>
              <TimeChart
                kind='line'
                buckets={data.buckets}
                granularity={granularity}
                series={isolation.shown.map((item) => ({ ...item, values: item.values.map(amount.of) }))}
                format={amount.format}
                ariaLabel={t('用户消费趋势')}
              />
            </div>
            <ChartLegend
              items={series.map((item) => ({ key: item.key, label: item.label, color: item.color, value: money.format(item.total) }))}
              selected={isolation.selected}
              onSelect={isolation.setOnly}
            />
          </>
        )}
      </Section>
    </div>
  )
}
