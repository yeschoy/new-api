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
import { useMemo, useState } from 'react'

import { Notice, Panel } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { useConsoleKey } from '@/pages/console/console-hooks'

import { MySubscriptionList } from './my-subscriptions'
import { PlanCard } from './plan-card'
import { PlanPurchase } from './plan-purchase'
import { getMySubscriptions, listPlans, type Plan } from './subscription-api'
import type { WalletInfo } from './topup-rules'

/**
 * "订阅套餐": the user's subscriptions and the plans on sale. Left out while
 * the site sells no plan and the user never had one.
 */
export function SubscriptionPanel(props: { info: WalletInfo }) {
  const { t } = useI18n()
  const plans = useQuery({ queryKey: useConsoleKey('plans'), queryFn: listPlans, retry: false })
  const mine = useQuery({ queryKey: useConsoleKey('subscriptions'), queryFn: getMySubscriptions, retry: false })
  const [buying, setBuying] = useState<Plan | null>(null)

  const purchases = useMemo(() => {
    const counts = new Map<number, number>()
    for (const sub of mine.data?.all ?? []) counts.set(sub.plan_id, (counts.get(sub.plan_id) ?? 0) + 1)
    return counts
  }, [mine.data])
  const titles = useMemo(() => new Map((plans.data ?? []).map((plan) => [plan.id, plan.title])), [plans.data])

  if (plans.isError || mine.isError) {
    return (
      <Panel title={t('订阅套餐')}>
        <Notice tone='error'>{errorMessage(plans.error ?? mine.error, t('获取订阅信息失败'))}</Notice>
      </Panel>
    )
  }
  if (!plans.data || !mine.data) return null
  if (!plans.data.length && !mine.data.all.length) return null
  const onSale = plans.data

  return (
    <Panel title={t('订阅套餐')}>
      <div className='flex flex-col gap-4'>
        <MySubscriptionList mine={mine.data} titles={titles} onRefresh={() => void mine.refetch()} refreshing={mine.isFetching} />
        {onSale.length ? (
          <div className='grid gap-3 md:grid-cols-2'>
            {onSale.map((plan, index) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                recommended={index === 0 && onSale.length > 1}
                purchased={purchases.get(plan.id) ?? 0}
                onBuy={() => setBuying(plan)}
              />
            ))}
          </div>
        ) : (
          <p className='text-or-muted text-[13px]'>{t('暂无可购买的套餐')}</p>
        )}
      </div>
      {buying ? (
        <PlanPurchase plan={buying} info={props.info} purchased={purchases.get(buying.id) ?? 0} onClose={() => setBuying(null)} />
      ) : null}
    </Panel>
  )
}
