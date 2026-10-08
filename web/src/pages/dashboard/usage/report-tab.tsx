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
import { Download } from 'lucide-react'
import { useState } from 'react'

import { Button, Notice, Table, TableMessage, Td, Tr, type Column } from '@/components/ui'
import { tk, useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { useConsoleKey, useMoney } from '@/pages/console/console-hooks'

import { getLogSummary, type LogSummary, type TimeWindow } from '../dashboard-api'
import { useAmount } from '../dashboard-money'
import { toLocalInput } from '../dashboard-time'
import { StatTile, formatCount } from '../dashboard-ui'

const COLUMNS: Column[] = [
  { label: tk('日期') },
  { label: tk('请求数'), right: true },
  { label: tk('Token 用量'), right: true },
  { label: tk('消费'), right: true },
]

/** From local midnight nine days ago until now, kept under the server's ten-day limit. */
function lastTenDays(): TimeWindow {
  const now = new Date()
  const first = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 9)
  const end = Math.floor(now.getTime() / 1000)
  return { start: Math.max(Math.floor(first.getTime() / 1000), end - 10 * 86_400 + 1), end }
}

type Daily = NonNullable<LogSummary['daily']>

/** Date, requests, tokens and the amount in the display currency per day; a BOM so spreadsheet apps read it as UTF-8. */
function reportCsv(header: string[], days: Daily, amountOf: (quota: number) => number): string {
  const rows = days.map((day) => [day.date, day.requests, day.tokens, Number(amountOf(day.quota).toFixed(6))].join(','))
  return `﻿${[header.join(','), ...rows].join('\n')}\n`
}

function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

/** The viewer's own last ten days from the request logs: totals, each day, and a CSV export. */
export function ReportTab() {
  const { t } = useI18n()
  const money = useMoney()
  const amount = useAmount()
  const [span] = useState(lastTenDays)
  const summary = useQuery({
    queryKey: useConsoleKey('dashboard', 'report', span.start),
    queryFn: () => getLogSummary(span),
    retry: false,
  })
  const data = summary.data
  const days = data?.daily ?? []
  const show = (text: (value: LogSummary) => string) => (data ? text(data) : '—')
  const exportCsv = () => {
    const header = [t('日期'), t('请求数'), t('Token 用量'), `${t('消费')} (${amount.symbol})`]
    download(reportCsv(header, days, amount.of), 'usage-report.csv')
  }

  return (
    <div className='flex flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <p className='text-or-muted text-[13px]'>
          {t('你自己账户近 10 天的每日用量（{start} – {end}），可导出为 CSV。', {
            start: toLocalInput(span.start).slice(0, 10),
            end: toLocalInput(span.end).slice(0, 10),
          })}
        </p>
        <Button onClick={exportCsv} disabled={days.length === 0}>
          <Download className='size-4' aria-hidden='true' />
          {t('导出 CSV')}
        </Button>
      </div>
      {summary.isError ? <Notice tone='error'>{errorMessage(summary.error, t('获取用量统计失败'))}</Notice> : null}
      <div className='grid grid-cols-2 gap-4 lg:grid-cols-4'>
        <StatTile label={t('请求数')} value={show((value) => formatCount(value.requests))} />
        <StatTile label={t('节省')} value={show((value) => money.format(value.saved_quota ?? 0))} caption={t('按分组倍率相对原价节省')} />
        <StatTile label={t('消费')} value={show((value) => money.format(value.quota))} />
        <StatTile label={t('Token 用量')} value={show((value) => formatCount(value.tokens))} />
      </div>
      <div className='border-or-line bg-or-card overflow-hidden rounded-[8px] border'>
        <Table columns={COLUMNS} minWidth={520}>
          {summary.isLoading ? <TableMessage colSpan={COLUMNS.length}>{t('加载中…')}</TableMessage> : null}
          {summary.isSuccess && days.length === 0 ? <TableMessage colSpan={COLUMNS.length}>{t('这段时间没有请求。')}</TableMessage> : null}
          {days.map((day) => (
            <Tr key={day.date}>
              <Td mono>{day.date}</Td>
              <Td right>{formatCount(day.requests)}</Td>
              <Td right>{formatCount(day.tokens)}</Td>
              <Td right>{money.format(day.quota)}</Td>
            </Tr>
          ))}
        </Table>
      </div>
    </div>
  )
}
