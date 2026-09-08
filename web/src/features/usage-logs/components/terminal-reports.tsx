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
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { TerminalPage } from '@/components/layout/components/terminal-page'
import { buildSavingsCatalog } from '@/features/home/lib/pricing-savings'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import {
  estimateGatewayListSavings,
  formatConsoleMoney,
} from '@/lib/console-money'
import dayjs from '@/lib/dayjs'

import { getUserLogs } from '../api'
import { usageLogSchema } from '../data/schema'

export function TerminalReports() {
  const { t } = useTranslation()
  const { models, priceRate } = usePricingData()
  const start = dayjs().subtract(27, 'day').startOf('day')
  const end = dayjs().endOf('day')

  const logsQuery = useQuery({
    queryKey: ['terminal', 'reports', start.unix(), end.unix()],
    queryFn: async () => {
      const result = await getUserLogs({
        p: 1,
        page_size: 100,
        type: 2,
        start_timestamp: start.unix(),
        end_timestamp: end.unix(),
      })
      if (!result.success) return []
      return (result.data?.items ?? []).flatMap((item) => {
        const parsed = usageLogSchema.safeParse(item)
        return parsed.success ? [parsed.data] : []
      })
    },
  })

  const catalog = useMemo(
    () => buildSavingsCatalog(models || [], priceRate),
    [models, priceRate]
  )
  const logs = logsQuery.data ?? []
  const billed = logs.reduce((sum, log) => sum + log.quota, 0)
  const tokens = logs.reduce(
    (sum, log) => sum + log.prompt_tokens + log.completion_tokens,
    0
  )
  const saved = estimateGatewayListSavings(logs, catalog)
  const byDay = useMemo(() => {
    const source = logsQuery.data ?? []
    const rows = new Map<
      string,
      { date: string; requests: number; tokens: number; billed: number }
    >()
    for (const log of source) {
      const date = dayjs.unix(log.created_at).format('YYYY-MM-DD')
      const current = rows.get(date) ?? {
        date,
        requests: 0,
        tokens: 0,
        billed: 0,
      }
      current.requests += 1
      current.tokens += log.prompt_tokens + log.completion_tokens
      current.billed += log.quota
      rows.set(date, current)
    }
    return [...rows.values()].sort((left, right) =>
      right.date.localeCompare(left.date)
    )
  }, [logsQuery.data])

  const exportCsv = () => {
    const header = 'Date,Requests,Tokens,Billed\n'
    const body = byDay
      .map((row) => `${row.date},${row.requests},${row.tokens},${row.billed}`)
      .join('\n')
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'usage-report.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <TerminalPage
      title={t('Reports')}
      description={t(
        'Review spend by day for any date range, then export the report.'
      )}
      actions={
        <button
          type='button'
          className='ci-button ci-button--size-xs'
          onClick={exportCsv}
          disabled={byDay.length === 0}
        >
          {t('Export report')}
        </button>
      }
    >
      <section className='ci-statGrid'>
        <article>
          <span>{t('Requests')}</span>
          <strong>{logs.length.toLocaleString()}</strong>
          <small>
            {start.format('MMM D')} – {end.format('MMM D, YYYY')}
          </small>
        </article>
        <article>
          <span>{t('Saved')}</span>
          <strong className='is-saved'>{formatConsoleMoney(saved)}</strong>
          <small>{t("vs. this gateway's list rates")}</small>
        </article>
        <article>
          <span>{t('Billed')}</span>
          <strong>{formatConsoleMoney(billed)}</strong>
          <small>{t('Charged to this workspace')}</small>
        </article>
        <article>
          <span>{t('Tokens')}</span>
          <strong>{tokens.toLocaleString()}</strong>
          <small>{t('{{count}} active days', { count: byDay.length })}</small>
        </article>
      </section>

      <section className='ci-panel'>
        {byDay.length === 0 ? (
          <div className='ci-empty'>
            <p>
              {t(
                'No requests in this window. Pick a wider range, or send your first request from the playground.'
              )}
            </p>
          </div>
        ) : (
          <table className='ci-catalogTable'>
            <thead>
              <tr>
                <th>{t('Date')}</th>
                <th>{t('Requests')}</th>
                <th>{t('Tokens')}</th>
                <th>{t('Billed')}</th>
              </tr>
            </thead>
            <tbody>
              {byDay.map((row) => (
                <tr key={row.date}>
                  <td>{row.date}</td>
                  <td>{row.requests}</td>
                  <td>{row.tokens.toLocaleString()}</td>
                  <td>{formatConsoleMoney(row.billed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </TerminalPage>
  )
}
