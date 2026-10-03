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
import { t } from '@/i18n/i18n'
import { api, type ApiEnvelope } from '@/lib/api'
import { unwrap } from '@/lib/console-api'

import type { CheckoutAction, PaymentReply } from './checkout'
import { epayForm, replyUrl } from './wallet-api'

/** model/subscription.go SubscriptionPlan, as /api/subscription/plans lists the enabled ones. */
export type Plan = {
  id: number
  title: string
  subtitle?: string
  /** In `currency` (USD by default); paying with balance costs price × quota_per_unit. */
  price_amount: number
  currency?: string
  duration_unit: 'year' | 'month' | 'day' | 'hour' | 'custom'
  duration_value: number
  custom_seconds?: number
  quota_reset_period?: 'never' | 'daily' | 'weekly' | 'monthly' | 'custom'
  quota_reset_custom_seconds?: number
  allow_balance_pay?: boolean
  /** 0 = unlimited. */
  max_purchase_per_user: number
  /** Quota units; 0 = unlimited. */
  total_amount: number
  upgrade_group?: string
  stripe_price_id?: string
  creem_product_id?: string
  waffo_pancake_product_id?: string
}

/** model/subscription.go UserSubscription. */
export type UserSubscription = {
  id: number
  plan_id: number
  /** active, expired or cancelled. */
  status: string
  start_time: number
  end_time: number
  amount_total: number
  amount_used: number
  next_reset_time?: number
}

/** How requests are paid: subscription_first, wallet_first, subscription_only or wallet_only. */
export type BillingPreference = 'subscription_first' | 'wallet_first' | 'subscription_only' | 'wallet_only'

export type MySubscriptions = {
  preference: BillingPreference
  active: UserSubscription[]
  /** Active and past subscriptions. */
  all: UserSubscription[]
}

type Summary = { subscription?: UserSubscription | null }

function subscriptions(list: Summary[] | null | undefined): UserSubscription[] {
  return (list ?? []).flatMap((item) => (item.subscription ? [item.subscription] : []))
}

export async function listPlans(): Promise<Plan[]> {
  const res = await api.get<ApiEnvelope<Array<{ plan?: Plan | null }> | null>>('/api/subscription/plans')
  const data = unwrap(res.data, t('获取订阅套餐失败'))
  return (data ?? []).flatMap((item) => (item.plan ? [item.plan] : []))
}

export async function getMySubscriptions(): Promise<MySubscriptions> {
  const res = await api.get<
    ApiEnvelope<{ billing_preference?: BillingPreference; subscriptions?: Summary[] | null; all_subscriptions?: Summary[] | null }>
  >('/api/subscription/self')
  const data = unwrap(res.data, t('获取订阅信息失败'))
  return {
    preference: data.billing_preference ?? 'subscription_first',
    active: subscriptions(data.subscriptions),
    all: subscriptions(data.all_subscriptions),
  }
}

export async function setBillingPreference(preference: BillingPreference): Promise<void> {
  const res = await api.put<ApiEnvelope<unknown>>('/api/subscription/self/preference', { billing_preference: preference })
  unwrap(res.data, t('保存失败'))
}

/** Deducts ceil(price × quota_per_unit) from the balance and starts the plan right away. */
export async function payPlanWithBalance(planId: number): Promise<void> {
  const res = await api.post<ApiEnvelope<unknown>>('/api/subscription/balance/pay', { plan_id: planId })
  unwrap(res.data, t('购买失败'))
}

export type PlanGateway = 'stripe' | 'creem' | 'waffo_pancake' | 'epay'

/** Creates a plan order and returns how its checkout opens; `epayMethod` picks the epay channel. */
export async function startPlanCheckout(gateway: PlanGateway, planId: number, epayMethod?: string): Promise<CheckoutAction> {
  if (gateway === 'stripe') {
    const res = await api.post<PaymentReply>('/api/subscription/stripe/pay', { plan_id: planId })
    return { kind: 'open', url: replyUrl(res.data, 'pay_link') }
  }
  if (gateway === 'creem') {
    const res = await api.post<PaymentReply>('/api/subscription/creem/pay', { plan_id: planId })
    return { kind: 'open', url: replyUrl(res.data, 'checkout_url') }
  }
  if (gateway === 'waffo_pancake') {
    const res = await api.post<PaymentReply>('/api/subscription/waffo-pancake/pay', { plan_id: planId })
    return { kind: 'redirect', url: replyUrl(res.data, 'checkout_url') }
  }
  const res = await api.post<PaymentReply>('/api/subscription/epay/pay', { plan_id: planId, payment_method: epayMethod })
  return epayForm(res.data)
}
