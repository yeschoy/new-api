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
import { Link } from '@tanstack/react-router'
import { Inbox } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TerminalPage } from '@/components/layout/components/terminal-page'
import { formatConsoleMoney } from '@/lib/console-money'
import dayjs from '@/lib/dayjs'
import { cn } from '@/lib/utils'

import { getUserLogs } from '../api'
import { LOG_TYPE_ENUM } from '../constants'
import { usageLogSchema, type UsageLog } from '../data/schema'
import { parseLogOther } from '../lib/format'

type RequestFilter = 'all' | 'ok' | 'error'

function isErrorLog(log: UsageLog): boolean {
  return log.type === LOG_TYPE_ENUM.ERROR
}

function isVisibleLog(log: UsageLog): boolean {
  return log.type === LOG_TYPE_ENUM.CONSUME || log.type === LOG_TYPE_ENUM.ERROR
}

function errorText(log: UsageLog): string {
  const other = parseLogOther(log.other)
  const stream = other?.stream_status
  const parts = [
    other?.reject_reason,
    stream?.end_error,
    ...(Array.isArray(stream?.errors) ? stream.errors : []),
    log.content,
  ]
  return parts
    .filter((part) => typeof part === 'string' && part.trim())
    .join('\n')
}

export function TerminalRequests() {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<RequestFilter>('all')
  const [openId, setOpenId] = useState<number | null>(null)
  const start = dayjs().subtract(6, 'day').startOf('day')
  const end = dayjs().endOf('day')

  const logsQuery = useQuery({
    queryKey: ['terminal', 'requests', start.unix(), end.unix()],
    queryFn: async () => {
      const result = await getUserLogs({
        p: 1,
        page_size: 50,
        type: 0,
        start_timestamp: start.unix(),
        end_timestamp: end.unix(),
      })
      if (!result.success) return []
      return (result.data?.items ?? []).flatMap((item) => {
        const parsed = usageLogSchema.safeParse(item)
        return parsed.success && isVisibleLog(parsed.data) ? [parsed.data] : []
      })
    },
  })

  const logs = logsQuery.data ?? []
  const errorCount = logs.filter(isErrorLog).length
  const okCount = logs.length - errorCount
  const billed = logs.reduce(
    (sum, log) => (isErrorLog(log) ? sum : sum + log.quota),
    0
  )
  const visible = logs.filter((log) => {
    if (filter === 'error') return isErrorLog(log)
    if (filter === 'ok') return !isErrorLog(log)
    return true
  })
  const empty = logs.length === 0

  return (
    <TerminalPage
      title={t('Requests')}
      description={t('See each call, what it cost, and why it failed.')}
    >
      <section className='ci-statGrid'>
        <article>
          <span>{t('Last 7 days')}</span>
          <strong>{logs.length.toLocaleString()}</strong>
          <small>{t('Calls')}</small>
        </article>
        <article>
          <span>{t('Worked')}</span>
          <strong>{okCount.toLocaleString()}</strong>
          <small>{t('Finished normally')}</small>
        </article>
        <article>
          <span>{t('Failed')}</span>
          <strong className={errorCount > 0 ? 'is-empty' : undefined}>
            {errorCount.toLocaleString()}
          </strong>
          <small>{t('Tap a row to read the error')}</small>
        </article>
        <article>
          <span>{t('Spent')}</span>
          <strong>{formatConsoleMoney(billed)}</strong>
          <small>{t('Charged in yuan')}</small>
        </article>
      </section>

      <section className='ci-panel'>
        <div className='ci-requestFilters'>
          {(
            [
              ['all', t('All'), logs.length],
              ['ok', t('Worked'), okCount],
              ['error', t('Failed'), errorCount],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type='button'
              className={cn('ci-chip', filter === value && 'is-active')}
              onClick={() => setFilter(value)}
            >
              {label} {count}
            </button>
          ))}
        </div>
        {empty ? (
          <div className='ci-empty'>
            <span className='ci-emptyIcon'>
              <Inbox size={18} />
            </span>
            <h3>{t('No requests yet')}</h3>
            <p>
              {t('Create a key, fill it into your tool, then come back here.')}
            </p>
            <Link
              to='/keys'
              className='ci-button ci-button--size-sm'
              style={{ marginTop: 12 }}
            >
              {t('Go create a key')}
            </Link>
          </div>
        ) : (
          <div className='ci-requestList'>
            {visible.map((log) => {
              const failed = isErrorLog(log)
              const reason = failed ? errorText(log) : ''
              const other = parseLogOther(log.other)
              const cacheRead = other?.cache_tokens || 0
              const open = openId === log.id
              return (
                <article
                  key={log.id}
                  className={cn('ci-requestRow', failed && 'is-failed')}
                >
                  <button
                    type='button'
                    className='ci-requestMain'
                    onClick={() => setOpenId(open ? null : log.id)}
                  >
                    <div>
                      <strong>{log.model_name || t('Unknown model')}</strong>
                      <span>
                        {dayjs.unix(log.created_at).format('M月D日 HH:mm')}
                        {log.token_name ? ` · ${log.token_name}` : ''}
                      </span>
                    </div>
                    <b className={failed ? 'is-failed' : 'is-ok'}>
                      {failed ? t('Failed') : t('Worked')}
                    </b>
                    <dl>
                      <div>
                        <dt>{t('Tokens')}</dt>
                        <dd>
                          {(
                            log.prompt_tokens + log.completion_tokens
                          ).toLocaleString()}
                          {cacheRead > 0
                            ? ` · ${t('cache {{count}}', { count: cacheRead.toLocaleString() })}`
                            : ''}
                        </dd>
                      </div>
                      <div>
                        <dt>{t('Spend')}</dt>
                        <dd>{failed ? '—' : formatConsoleMoney(log.quota)}</dd>
                      </div>
                      <div>
                        <dt>{t('Time taken')}</dt>
                        <dd>
                          {log.use_time > 0
                            ? `${log.use_time.toFixed(1)}s`
                            : '—'}
                        </dd>
                      </div>
                    </dl>
                  </button>
                  {open && reason ? (
                    <pre className='ci-requestError'>{reason}</pre>
                  ) : null}
                  {open && !reason && failed ? (
                    <p className='ci-requestError'>
                      {t('Failed, but no error text was saved.')}
                    </p>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </TerminalPage>
  )
}
