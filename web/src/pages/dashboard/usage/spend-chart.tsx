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
import { useMoney } from '@/pages/console/console-hooks'

import { ChartLegend } from '../charts/chart-legend'
import { SERIES_LIMIT } from '../charts/chart-scale'
import { TimeChart } from '../charts/time-chart'
import { useAmount } from '../dashboard-money'
import type { Granularity } from '../dashboard-time'
import { EmptyNote, Section } from '../dashboard-ui'
import { Segmented } from '../segmented'
import { namedSeries, useIsolation } from './chart-series'
import type { Breakdown } from './usage-data'
import { SPEND_CHARTS, type SpendChartKind } from './usage-prefs'

/** Spend per time bucket by model, as stacked bars or an area chart. */
export function SpendChart(props: {
  data: Breakdown
  granularity: Granularity
  kind: SpendChartKind
  onKind: (kind: SpendChartKind) => void
  total: number
}) {
  const { t } = useI18n()
  const money = useMoney()
  const amount = useAmount()
  const series = namedSeries(props.data, 'quota', SERIES_LIMIT, t('其他'))
  const isolation = useIsolation(series)
  const kinds = SPEND_CHARTS.map((item) => ({ id: item.id, label: t(item.label) }))
  const chartKind = props.kind === 'bar' ? 'bar' : 'line'

  return (
    <Section
      title={t('消费分布')}
      description={t('合计 {amount}', { amount: money.format(props.total) })}
      extra={<Segmented ariaLabel={t('图表类型')} items={kinds} value={props.kind} onChange={props.onKind} />}
      flush
    >
      {series.length === 0 ? (
        <EmptyNote>{t('暂无数据')}</EmptyNote>
      ) : (
        <>
          <div className='px-2 pt-4 sm:px-3'>
            <TimeChart
              kind={chartKind}
              buckets={props.data.buckets}
              granularity={props.granularity}
              series={isolation.shown.map((item) => ({ ...item, values: item.values.map(amount.of) }))}
              format={amount.format}
              ariaLabel={t('消费分布')}
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
  )
}
