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
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

import { Panel } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { useAuth } from '@/lib/auth-store'
import { cn } from '@/lib/format'
import { recentWindow } from '@/pages/console/console-helpers'
import { useConsoleKey, useMoney, useSelf } from '@/pages/console/console-hooks'

import { getSavings } from './wallet-api'

/** The summary endpoint takes windows under 10 days: today and the 9 before it. */
const SAVINGS_DAYS = 10

/** Balance, lifetime spending, request count, and what recent requests saved against list prices. */
export function BalancePanel() {
  const { t } = useI18n()
  const money = useMoney()
  const auth = useAuth()
  const self = useSelf()
  const user = self.data ?? auth.user

  return (
    <Panel>
      <div className='flex flex-wrap items-end justify-between gap-6'>
        <div>
          <div className='text-or-muted text-[13px]'>{t('可用余额')}</div>
          <div className='mt-1 text-[40px] leading-[48px] font-semibold tracking-[-0.02em] tabular-nums'>
            {user ? money.format(user.quota) : '—'}
          </div>
        </div>
        <dl className='flex gap-10'>
          <Stat label={t('已用额度')} value={user ? money.format(user.used_quota) : '—'} />
          <Stat label={t('请求次数')} value={user ? (user.request_count ?? 0).toLocaleString('zh-CN') : '—'} />
        </dl>
      </div>
      <SavingsLine />
    </Panel>
  )
}

function Stat(props: { label: string; value: string }) {
  return (
    <div>
      <dt className='text-or-muted text-[13px]'>{props.label}</dt>
      <dd className='mt-1 text-[18px] font-semibold tabular-nums'>{props.value}</dd>
    </div>
  )
}

/** Shown only when recent requests were billed below list price. */
function SavingsLine() {
  const { t } = useI18n()
  const money = useMoney()
  const [range] = useState(() => recentWindow(new Date(), SAVINGS_DAYS))
  const [open, setOpen] = useState(false)
  const savings = useQuery({
    queryKey: useConsoleKey('wallet-savings', range.start),
    queryFn: () => getSavings(range.start, range.end),
    retry: false,
  })
  const saved = savings.data?.saved_quota ?? 0
  if (!(saved > 0)) return null
  const billed = savings.data?.quota ?? 0
  const percent = Math.round((saved / (billed + saved)) * 100)

  return (
    <div className='border-or-line mt-5 border-t pt-4 text-[13px]'>
      <button
        type='button'
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className='text-or-muted hover:text-or-fg flex items-center gap-1 text-left transition-colors'
      >
        {t('近 {days} 天节省 {amount}（{percent}%）', { days: SAVINGS_DAYS, amount: money.format(saved), percent })}
        <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden='true' />
      </button>
      {open ? (
        <dl className='mt-2 grid max-w-[320px] grid-cols-[1fr_auto] gap-x-6 gap-y-1'>
          <dt className='text-or-muted'>{t('实际支付')}</dt>
          <dd className='text-right tabular-nums'>{money.format(billed)}</dd>
          <dt className='text-or-muted'>{t('按原价计')}</dt>
          <dd className='text-right tabular-nums'>{money.format(billed + saved)}</dd>
        </dl>
      ) : null}
    </div>
  )
}
