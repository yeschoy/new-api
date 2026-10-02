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
import { useI18n } from '@/i18n/i18n'

import { ChartLegend } from '../charts/chart-legend'
import { SERIES_LIMIT } from '../charts/chart-scale'
import { DonutChart } from '../charts/donut-chart'
import { RankBars } from '../charts/rank-bars'
import { TimeChart } from '../charts/time-chart'
import type { Granularity } from '../dashboard-time'
import { EmptyNote, Section, formatCount } from '../dashboard-ui'
import { Segmented } from '../segmented'
import { namedSeries, namedShares, useIsolation } from './chart-series'
import type { Breakdown } from './usage-data'
import { CALLS_CHARTS, type CallsChartKind } from './usage-prefs'

const RANK_LIMIT = 20

/** Requests by model: the trend over time, each model's share, or a ranking. */
export function CallsChart(props: {
  data: Breakdown
  granularity: Granularity
  kind: CallsChartKind
  onKind: (kind: CallsChartKind) => void
  total: number
}) {
  const { t } = useI18n()
  const series = namedSeries(props.data, 'requests', SERIES_LIMIT, t('其他'))
  const isolation = useIsolation(series)
  const kinds = CALLS_CHARTS.map((item) => ({ id: item.id, label: t(item.label) }))

  let body: React.ReactNode
  if (series.length === 0) body = <EmptyNote>{t('暂无数据')}</EmptyNote>
  else if (props.kind === 'proportion') {
    body = <DonutChart slices={namedShares(props.data, 'requests', SERIES_LIMIT, t('其他'))} format={formatCount} ariaLabel={t('调用占比')} />
  } else if (props.kind === 'top') {
    body = <RankBars items={namedShares(props.data, 'requests', RANK_LIMIT, t('其他'))} format={formatCount} ariaLabel={t('调用排行')} />
  } else {
    body = (
      <>
        <div className='px-2 pt-4 sm:px-3'>
          <TimeChart kind='line' buckets={props.data.buckets} granularity={props.granularity} series={isolation.shown} format={formatCount} ariaLabel={t('调用趋势')} />
        </div>
        <ChartLegend
          items={series.map((item) => ({ key: item.key, label: item.label, color: item.color, value: formatCount(item.total) }))}
          selected={isolation.selected}
          onSelect={isolation.setOnly}
        />
      </>
    )
  }

  return (
    <Section
      title={t('模型调用分析')}
      description={t('合计 {count} 次', { count: formatCount(props.total) })}
      extra={<Segmented ariaLabel={t('图表类型')} items={kinds} value={props.kind} onChange={props.onKind} />}
      flush
    >
      {body}
    </Section>
  )
}
