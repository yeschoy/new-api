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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { Button, Modal, Notice, Select, toast } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth-store'
import { useMoney, useSelf } from '@/pages/console/console-hooks'

import { payPlanWithBalance, startPlanCheckout, type Plan, type PlanGateway } from './subscription-api'
import { durationLabel, resetLabel } from './subscription-format'
import { isEpayMethod, priceLabel, type WalletInfo } from './topup-rules'
import { useCheckout, useQuotaPerUnit } from './wallet-hooks'

/** The plan's own checkouts the site has configured: Stripe, Creem and Waffo Pancake need a product id each. */
function planGateways(plan: Plan, info: WalletInfo): Array<{ id: PlanGateway; name: string }> {
  const gateways: Array<{ id: PlanGateway; name: string }> = []
  if (info.enable_stripe_topup && plan.stripe_price_id) gateways.push({ id: 'stripe', name: 'Stripe' })
  if (info.enable_creem_topup && plan.creem_product_id) gateways.push({ id: 'creem', name: 'Creem' })
  if (info.enable_waffo_pancake_topup && plan.waffo_pancake_product_id) gateways.push({ id: 'waffo_pancake', name: 'Waffo Pancake' })
  return gateways
}

/** "购买订阅": the plan, then paying with the balance or through a gateway. */
export function PlanPurchase(props: { plan: Plan; info: WalletInfo; purchased: number; onClose: () => void }) {
  const { t } = useI18n()
  const money = useMoney()
  const auth = useAuth()
  const self = useSelf()
  const perUnit = useQuotaPerUnit()
  const queryClient = useQueryClient()
  const plan = props.plan
  const epayMethods = props.info.enable_online_topup ? props.info.pay_methods.filter((method) => isEpayMethod(method.type)) : []
  const gateways = planGateways(plan, props.info)
  const [epay, setEpay] = useState(epayMethods[0]?.type ?? '')

  const byBalance = useMutation({
    mutationFn: () => payPlanWithBalance(plan.id),
    onSuccess: () => {
      toast.success(t('订阅成功'))
      void queryClient.invalidateQueries({ queryKey: ['console'] })
      props.onClose()
    },
  })
  const checkout = useCheckout(t('已打开支付页面，支付完成后订阅会自动生效'), props.onClose)

  const balance = (self.data ?? auth.user)?.quota ?? 0
  const cost = Math.max(0, Math.ceil(plan.price_amount * perUnit))
  const limit = plan.max_purchase_per_user
  const reached = limit > 0 && props.purchased >= limit
  const balanceAllowed = plan.allow_balance_pay !== false
  const short = balance < cost
  const busy = byBalance.isPending || checkout.isPending
  const reset = resetLabel(plan)

  let error: string | null = null
  if (byBalance.isError) error = errorMessage(byBalance.error, t('购买失败'))
  if (checkout.isError) error = errorMessage(checkout.error, t('支付请求失败'))

  const rows: Array<[string, React.ReactNode]> = [
    [t('套餐名称'), plan.title],
    [t('有效期'), durationLabel(plan)],
  ]
  if (reset) rows.push([t('重置周期'), reset])
  rows.push([t('套餐额度'), plan.total_amount > 0 ? money.format(plan.total_amount) : t('不限')])
  if (plan.upgrade_group) rows.push([t('升级分组'), plan.upgrade_group])
  rows.push([t('应付金额'), priceLabel(plan.price_amount, plan.currency || 'USD')])

  return (
    <Modal title={t('购买订阅')} onClose={props.onClose}>
      <div className='flex flex-col gap-4 text-[14px]'>
        <dl className='bg-or-fill flex flex-col gap-2.5 rounded-[8px] p-3'>
          {rows.map(([label, value]) => (
            <div key={label} className='flex items-baseline justify-between gap-4'>
              <dt className='text-or-muted shrink-0'>{label}</dt>
              <dd className='min-w-0 text-right font-medium break-words'>{value}</dd>
            </div>
          ))}
        </dl>

        {reached ? <Notice tone='error'>{t('已达到该套餐的购买上限（{count}/{limit}）', { count: props.purchased, limit })}</Notice> : null}

        <div className='border-or-line flex flex-col gap-2 rounded-[8px] border p-3 text-[13px]'>
          <div className='flex justify-between gap-4'>
            <span className='text-or-muted'>{t('需要')}</span>
            <span className='tabular-nums'>{money.format(cost)}</span>
          </div>
          <div className='flex justify-between gap-4'>
            <span className='text-or-muted'>{t('可用余额')}</span>
            <span className='tabular-nums'>{money.format(balance)}</span>
          </div>
          {balanceAllowed ? null : <Notice tone='error'>{t('该套餐不支持用余额购买')}</Notice>}
          {balanceAllowed && short ? <Notice tone='error'>{t('余额不足')}</Notice> : null}
          <Button busy={byBalance.isPending} disabled={busy || reached || !balanceAllowed || short} onClick={() => byBalance.mutate()}>
            {t('用余额支付')}
          </Button>
        </div>

        {gateways.length || epayMethods.length ? (
          <div className='flex flex-col gap-2'>
            <div className='text-or-muted text-[13px]'>{t('其他支付方式')}</div>
            {gateways.length ? (
              <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
                {gateways.map((gateway) => (
                  <Button key={gateway.id} disabled={busy || reached} onClick={() => checkout.mutate(() => startPlanCheckout(gateway.id, plan.id))}>
                    {gateway.name}
                  </Button>
                ))}
              </div>
            ) : null}
            {epayMethods.length ? (
              <div className='flex gap-2'>
                <Select
                  value={epay}
                  onChange={setEpay}
                  options={epayMethods.map((method) => ({ value: method.type, label: method.name }))}
                  ariaLabel={t('支付渠道')}
                  disabled={reached}
                  className='min-w-0 flex-1'
                />
                <Button variant='primary' busy={checkout.isPending} disabled={busy || reached || !epay} onClick={() => checkout.mutate(() => startPlanCheckout('epay', plan.id, epay))}>
                  {t('支付')}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {error ? <Notice tone='error'>{error}</Notice> : null}
      </div>
    </Modal>
  )
}
