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
import { Check } from 'lucide-react'
import { useId } from 'react'

import { Button, Tag } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'
import { useMoney } from '@/pages/console/console-hooks'

import type { Plan } from './subscription-api'
import { durationLabel, resetLabel } from './subscription-format'
import { priceLabel } from './topup-rules'

/** A plan on sale: price, what it includes, and the buy button (off once the user's limit is reached). */
export function PlanCard(props: { plan: Plan; recommended: boolean; purchased: number; onBuy: () => void }) {
  const { t } = useI18n()
  const money = useMoney()
  const headingId = useId()
  const plan = props.plan
  const limit = plan.max_purchase_per_user
  const reached = limit > 0 && props.purchased >= limit
  const reset = resetLabel(plan)

  const benefits = [t('有效期 {duration}', { duration: durationLabel(plan) })]
  if (reset) benefits.push(t('额度重置 {period}', { period: reset }))
  benefits.push(plan.total_amount > 0 ? t('总额度 {amount}', { amount: money.format(plan.total_amount) }) : t('总额度 不限'))
  if (limit > 0) benefits.push(t('限购 {count} 次', { count: limit }))
  if (plan.upgrade_group) benefits.push(t('升级分组 {group}', { group: plan.upgrade_group }))

  return (
    <article
      aria-labelledby={headingId}
      className={cn('flex flex-col gap-3 rounded-[8px] border p-4', props.recommended ? 'border-or-primary/60' : 'border-or-line')}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <h3 id={headingId} className='truncate text-[15px] font-semibold'>
            {plan.title || t('订阅套餐')}
          </h3>
          {plan.subtitle ? <p className='text-or-muted truncate text-[13px]'>{plan.subtitle}</p> : null}
        </div>
        {props.recommended ? <Tag tone='success'>{t('推荐')}</Tag> : null}
      </div>
      <div className='text-[24px] leading-8 font-semibold tabular-nums'>{priceLabel(plan.price_amount, plan.currency || 'USD')}</div>
      <ul className='flex flex-1 flex-col gap-1.5 text-[13px]'>
        {benefits.map((benefit) => (
          <li key={benefit} className='text-or-muted flex items-center gap-2'>
            <Check className='text-or-primary size-3.5 shrink-0' aria-hidden='true' />
            <span>{benefit}</span>
          </li>
        ))}
      </ul>
      {reached ? (
        <Button disabled title={t('已购买 {count}/{limit}', { count: props.purchased, limit })} className='w-full'>
          {t('已达购买上限')}
        </Button>
      ) : (
        <Button variant='primary' onClick={props.onBuy} className='w-full'>
          {t('立即订阅')}
        </Button>
      )}
    </article>
  )
}
