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

import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'

import { getPerfSummary, type PerfModel } from './dashboard-api'
import { EmptyNote, Section, StatusDot, type DotTone } from './dashboard-ui'

const WINDOW_HOURS = 24
const TOP_MODELS = 6

/** Plain mean over the models that report a usable value (as the old dashboard did). */
function mean(models: PerfModel[], pick: (model: PerfModel) => number, usable: (value: number) => boolean): number {
  const values = models.map(pick).filter((value) => Number.isFinite(value) && usable(value))
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : Number.NaN
}

export function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.round(ms)}ms`
}

export function formatThroughput(tps: number): string {
  if (!Number.isFinite(tps) || tps <= 0) return '—'
  if (tps >= 1000) return `${(tps / 1000).toFixed(1)}K t/s`
  return `${tps.toFixed(tps < 10 ? 2 : 1)} t/s`
}

export function formatPercent(value: number): string {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : '—'
}

/** Green from 90%, amber from 70%, red below. */
function rateTone(rate: number): DotTone {
  if (!Number.isFinite(rate)) return 'neutral'
  if (rate >= 90) return 'good'
  if (rate >= 70) return 'warn'
  return 'bad'
}

/** Admin view of the last 24 hours: success rate, latency, throughput and the busiest models. */
export function PerfHealth() {
  const { t } = useI18n()
  const perf = useQuery({
    queryKey: ['dashboard', 'perf-summary', WINDOW_HOURS],
    queryFn: () => getPerfSummary(WINDOW_HOURS),
    staleTime: 60_000,
    retry: false,
  })
  const models = perf.data ?? []
  const successRate = mean(models, (model) => model.success_rate, () => true)
  const latency = Math.round(mean(models, (model) => model.avg_latency_ms, (value) => value > 0))
  const throughput = mean(models, (model) => model.avg_tps, (value) => value > 0)

  let body: React.ReactNode
  if (perf.isLoading) body = <EmptyNote>{t('加载中…')}</EmptyNote>
  else if (perf.isError) body = <EmptyNote className='text-or-red'>{errorMessage(perf.error, t('性能数据加载失败'))}</EmptyNote>
  else if (models.length === 0) body = <EmptyNote>{t('暂无性能数据')}</EmptyNote>
  else {
    body = (
      <div className='flex flex-col gap-4 p-5'>
        <dl className='grid grid-cols-3 gap-2'>
          <Metric label={t('成功率')} value={formatPercent(successRate)} />
          <Metric label={t('平均延迟')} value={formatLatency(latency)} />
          <Metric label={t('吞吐量')} value={formatThroughput(throughput)} />
        </dl>
        <div>
          <h3 className='text-or-muted mb-1.5 text-[12px] font-medium'>{t('流量最高的模型')}</h3>
          <ul className='grid gap-x-6 sm:grid-cols-2'>
            {models.slice(0, TOP_MODELS).map((model) => (
              <li key={model.model_name} className='flex items-center justify-between gap-3 py-1 text-[13px]'>
                <span className='font-geist min-w-0 truncate'>{model.model_name}</span>
                <span className='flex shrink-0 items-center gap-1.5 tabular-nums'>
                  <StatusDot tone={rateTone(model.success_rate)} />
                  {formatPercent(model.success_rate)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  return (
    <Section title={t('性能健康')} description={t('近 24 小时')} flush>
      {body}
    </Section>
  )
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className='bg-or-fill min-w-0 rounded-[6px] px-3 py-2.5'>
      <dt className='text-or-muted truncate text-[12px]'>{props.label}</dt>
      <dd className='mt-1 truncate text-[16px] font-semibold tabular-nums'>{props.value}</dd>
    </div>
  )
}
