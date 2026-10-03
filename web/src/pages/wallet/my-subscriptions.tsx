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
import { RefreshCw } from 'lucide-react'

import { Button, Tag, type TagTone } from '@/components/ui'
import { tk, useI18n } from '@/i18n/i18n'
import { cn, dateTime } from '@/lib/format'
import { useMoney } from '@/pages/console/console-hooks'

import { BillingPreferenceSelect, fallbackNote } from './billing-preference'
import type { MySubscriptions, UserSubscription } from './subscription-api'
import { daysLeft, subscriptionState, usagePercent, type SubscriptionState } from './subscription-format'

const STATES: Record<SubscriptionState, { label: string; tone: TagTone }> = {
  active: { label: tk('生效中'), tone: 'success' },
  cancelled: { label: tk('已取消'), tone: 'neutral' },
  expired: { label: tk('已过期'), tone: 'neutral' },
}

/** "我的订阅": how many are active, the billing preference, and every subscription with its usage. */
export function MySubscriptionList(props: {
  mine: MySubscriptions
  /** Plan titles by id, for naming each subscription. */
  titles: Map<number, string>
  onRefresh: () => void
  refreshing: boolean
}) {
  const { t } = useI18n()
  const active = props.mine.active.length
  const past = props.mine.all.length - active
  const note = fallbackNote(props.mine.preference, active > 0)

  return (
    <section className='border-or-line rounded-[8px] border p-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]'>
          <h3 className='text-or-fg text-[14px] font-medium'>{t('我的订阅')}</h3>
          <span className={active ? 'text-or-primary' : 'text-or-muted'}>
            {active ? t('{count} 个生效中', { count: active }) : t('暂无生效的订阅')}
          </span>
          {past > 0 ? <span className='text-or-muted'>{t('{count} 个已失效', { count: past })}</span> : null}
        </div>
        <div className='flex w-full items-center gap-2 sm:w-auto'>
          <BillingPreferenceSelect preference={props.mine.preference} hasActive={active > 0} />
          <Button size='sm' variant='ghost' ariaLabel={t('刷新')} title={t('刷新')} onClick={props.onRefresh}>
            <RefreshCw className={cn('size-4', props.refreshing && 'animate-spin')} aria-hidden='true' />
          </Button>
        </div>
      </div>
      {note ? <p className='text-or-muted mt-2 text-[12px]'>{note}</p> : null}
      {props.mine.all.length ? (
        <ul className='mt-3 flex max-h-[360px] flex-col gap-2 overflow-y-auto'>
          {props.mine.all.map((sub) => (
            <SubscriptionItem key={sub.id} sub={sub} title={props.titles.get(sub.plan_id)} />
          ))}
        </ul>
      ) : (
        <p className='text-or-muted mt-2 text-[13px]'>{t('还没有订阅，购买下方的套餐即可开通。')}</p>
      )}
    </section>
  )
}

function SubscriptionItem(props: { sub: UserSubscription; title?: string }) {
  const { t } = useI18n()
  const money = useMoney()
  const sub = props.sub
  const now = Math.floor(Date.now() / 1000)
  const state = subscriptionState(sub, now)
  const percent = usagePercent(sub)
  const name = props.title ? t('{plan} · 订阅 #{id}', { plan: props.title, id: sub.id }) : t('订阅 #{id}', { id: sub.id })

  let ends = t('已于 {time} 过期', { time: dateTime(sub.end_time) })
  if (state === 'active') ends = t('有效期至 {time}', { time: dateTime(sub.end_time) })
  if (state === 'cancelled') ends = t('已于 {time} 取消', { time: dateTime(sub.end_time) })

  let quota = t('额度 不限')
  if (sub.amount_total > 0) {
    quota = t('额度 {used} / {total} · 剩余 {left}', {
      used: money.format(sub.amount_used),
      total: money.format(sub.amount_total),
      left: money.format(Math.max(0, sub.amount_total - sub.amount_used)),
    })
  }

  return (
    <li aria-label={name} className='border-or-line rounded-[8px] border px-3 py-2.5 text-[13px]'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex min-w-0 items-center gap-2'>
          <span className='text-or-fg truncate text-[14px] font-medium'>{name}</span>
          <Tag tone={STATES[state].tone}>{t(STATES[state].label)}</Tag>
        </div>
        {state === 'active' ? <span className='text-or-muted'>{t('剩余 {days} 天', { days: daysLeft(sub, now) })}</span> : null}
      </div>
      <div className='text-or-muted mt-1 flex flex-col gap-0.5'>
        <span>{ends}</span>
        {state === 'active' && (sub.next_reset_time ?? 0) > 0 ? (
          <span>{t('下次重置 {time}', { time: dateTime(sub.next_reset_time ?? 0) })}</span>
        ) : null}
        <div className='flex flex-wrap gap-x-3'>
          <span>{quota}</span>
          {sub.amount_total > 0 ? <span>{t('已用 {percent}%', { percent })}</span> : null}
        </div>
      </div>
      {state === 'active' && sub.amount_total > 0 ? (
        <div
          role='progressbar'
          aria-label={t('已用 {percent}%', { percent })}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className='bg-or-fill mt-2 h-1.5 overflow-hidden rounded-full'
        >
          <div className='bg-or-primary h-full rounded-full' style={{ width: `${percent}%` }} />
        </div>
      ) : null}
    </li>
  )
}
