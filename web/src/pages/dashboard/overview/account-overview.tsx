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

import { useI18n } from '@/i18n/i18n'
import { useAuth } from '@/lib/auth-store'
import { recentWindow } from '@/pages/console/console-helpers'
import { useConsoleKey, useMoney, useSelf } from '@/pages/console/console-hooks'

import { Sparkline } from '../charts/sparkline'
import { getLogSummary, getQuotaRows, type TimeWindow } from '../dashboard-api'
import { LinkButton, Section, StatTile, StatusDot, formatCount } from '../dashboard-ui'
import { balanceHealth, runwayLabel, sliceUsage } from './overview-stats'

function lastDay(): TimeWindow {
  const end = Math.floor(Date.now() / 1000)
  return { start: end - 86_400, end }
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

/** Balance with how long it lasts, lifetime spend and requests, then the last 24 hours and today's savings. */
export function AccountOverview() {
  const { t } = useI18n()
  const money = useMoney()
  const auth = useAuth()
  const self = useSelf()
  const user = self.data ?? auth.user
  // The account's own usage, for admins too: the same figures the balance pays for.
  const [day] = useState(lastDay)
  const usage = useQuery({
    queryKey: useConsoleKey('dashboard', 'day-usage', day.start),
    queryFn: () => getQuotaRows(day, { admin: false }),
  })
  const [today] = useState(() => recentWindow(new Date(), 1))
  const summary = useQuery({
    queryKey: useConsoleKey('dashboard', 'today-summary', today.start),
    queryFn: () => getLogSummary({ start: today.start, end: today.end }),
    retry: false,
  })

  const slices = sliceUsage(usage.data ?? [], day)
  const daySpend = sum(slices.quota)
  const balance = Number(user?.quota ?? 0)
  const health = balanceHealth(balance, daySpend)
  const subscription = summary.data?.subscription_quota ?? 0
  const usageCaption = usage.isError ? <span className='text-or-red'>{t('用量数据加载失败')}</span> : null

  return (
    <div className='flex flex-col gap-4'>
      <Section title={t('账户概览')}>
        <div className='flex flex-wrap items-end justify-between gap-6'>
          <div className='min-w-0'>
            <div className='text-or-muted text-[13px]'>{t('可用余额')}</div>
            <div className='mt-1 text-[40px] leading-[48px] font-semibold tracking-[-0.02em] tabular-nums'>
              {user ? money.format(balance) : '—'}
            </div>
            <div className='mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]'>
              <span className='flex items-center gap-1.5'>
                <StatusDot tone={health.tone} />
                {t(health.label)}
              </span>
              {balance > 0 && usage.isSuccess ? <span className='text-or-muted'>{runwayLabel(balance, daySpend)}</span> : null}
            </div>
          </div>
          <div className='flex flex-wrap items-end gap-x-10 gap-y-4'>
            <dl className='flex gap-10'>
              <Figure label={t('历史消费')} value={user ? money.format(user.used_quota) : '—'} />
              <Figure label={t('请求次数')} value={user ? formatCount(user.request_count ?? 0) : '—'} />
            </dl>
            <LinkButton to='/settings/credits' variant='primary'>
              {t('充值')}
            </LinkButton>
          </div>
        </div>
      </Section>

      <div className='grid gap-4 md:grid-cols-3'>
        <StatTile label={t('近 24 小时消费')} value={usage.isSuccess ? money.format(daySpend) : '—'} caption={usageCaption}>
          <Sparkline values={slices.quota} />
        </StatTile>
        <StatTile label={t('近 24 小时请求')} value={usage.isSuccess ? formatCount(sum(slices.requests)) : '—'} caption={usageCaption}>
          <Sparkline values={slices.requests} />
        </StatTile>
        <StatTile
          label={t('今日节省')}
          value={summary.data ? money.format(summary.data.saved_quota ?? 0) : '—'}
          caption={
            <>
              <span className='block'>{t('按分组倍率相对原价节省')}</span>
              {subscription > 0 ? <span className='block'>{t('订阅消耗 {amount}', { amount: money.format(subscription) })}</span> : null}
            </>
          }
        />
      </div>
    </div>
  )
}

function Figure(props: { label: string; value: string }) {
  return (
    <div>
      <dt className='text-or-muted text-[13px]'>{props.label}</dt>
      <dd className='mt-1 text-[18px] font-semibold tabular-nums'>{props.value}</dd>
    </div>
  )
}
