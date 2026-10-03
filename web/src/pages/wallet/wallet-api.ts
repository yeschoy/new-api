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

import { paymentFailure, type CheckoutAction, type PaymentReply } from './checkout'
import { parseWalletInfo, type WalletInfo } from './topup-rules'

// ── Top-up options (controller/topup.go GetTopUpInfo) ─────────────────────
export async function getWalletInfo(): Promise<WalletInfo> {
  const res = await api.get<ApiEnvelope<unknown>>('/api/user/topup/info')
  return parseWalletInfo(unwrap(res.data, t('获取充值信息失败')))
}

// ── Paying an amount (controller/topup*.go) ───────────────────────────────
/** The amount-based gateways; every other method type is an epay channel. */
export type Gateway = 'epay' | 'stripe' | 'waffo' | 'waffo_pancake'

const QUOTE_PATHS: Record<Gateway, string> = {
  epay: '/api/user/amount',
  stripe: '/api/user/stripe/amount',
  waffo: '/api/user/waffo/amount',
  waffo_pancake: '/api/user/waffo-pancake/amount',
}

export function gatewayOf(type: string): Gateway {
  if (type === 'stripe' || type === 'waffo' || type === 'waffo_pancake') return type
  return 'epay'
}

/** What the gateway charges for `amount` once price, group ratio and discount apply. */
export async function quoteTopUp(gateway: Gateway, amount: number): Promise<number> {
  const res = await api.post<PaymentReply>(QUOTE_PATHS[gateway], { amount })
  const failure = paymentFailure(res.data, t('获取支付金额失败'))
  if (failure) throw new Error(failure)
  const price = Number.parseFloat(String(res.data.data))
  if (!Number.isFinite(price)) throw new Error(t('获取支付金额失败'))
  return price
}

function fields(data: unknown): Record<string, unknown> {
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : {}
}

/** The checkout address in a successful reply's data; the reply's reason as an error otherwise. */
export function replyUrl(body: PaymentReply | undefined, field: string): string {
  const failure = paymentFailure(body, t('支付请求失败'))
  if (failure) throw new Error(failure)
  const value = fields(body?.data)[field]
  if (typeof value !== 'string' || !value) throw new Error(t('支付请求失败'))
  return value
}

/** Epay replies with the gateway address and the signed fields to post to it. */
export function epayForm(body: PaymentReply | undefined): CheckoutAction {
  const failure = paymentFailure(body, t('支付请求失败'))
  if (failure) throw new Error(failure)
  return { kind: 'form', url: body?.url ?? '', params: fields(body?.data) }
}

/** Creates the order; `waffoIndex` picks one of `waffo_pay_methods`. */
export async function startTopUp(order: { type: string; amount: number; waffoIndex?: number }): Promise<CheckoutAction> {
  const amount = Math.floor(order.amount)
  const gateway = gatewayOf(order.type)
  if (gateway === 'stripe') {
    const res = await api.post<PaymentReply>('/api/user/stripe/pay', { amount, payment_method: 'stripe' })
    return { kind: 'open', url: replyUrl(res.data, 'pay_link') }
  }
  if (gateway === 'waffo') {
    const res = await api.post<PaymentReply>('/api/user/waffo/pay', { amount, pay_method_index: order.waffoIndex })
    return { kind: 'open', url: replyUrl(res.data, 'payment_url') }
  }
  if (gateway === 'waffo_pancake') {
    // A new tab opened after the request would be blocked, so Pancake checks out in place.
    const res = await api.post<PaymentReply>('/api/user/waffo-pancake/pay', { amount })
    return { kind: 'redirect', url: replyUrl(res.data, 'checkout_url') }
  }
  const res = await api.post<PaymentReply>('/api/user/pay', { amount, payment_method: order.type })
  return epayForm(res.data)
}

/** Creem sells fixed products instead of amounts. */
export async function startCreemCheckout(productId: string): Promise<CheckoutAction> {
  const res = await api.post<PaymentReply>('/api/user/creem/pay', { product_id: productId, payment_method: 'creem' })
  return { kind: 'open', url: replyUrl(res.data, 'checkout_url') }
}

// ── Invitations (controller/user.go GetAffCode / TransferAffQuota) ────────
/** The user's invite code; the server creates one on first use. */
export async function getInviteCode(): Promise<string> {
  const res = await api.get<ApiEnvelope<string>>('/api/user/aff')
  return unwrap(res.data, t('获取邀请码失败'))
}

/** Moves `quota` units of invite rewards into the balance; resolves with the server's message. */
export async function transferInviteReward(quota: number): Promise<string> {
  const res = await api.post<ApiEnvelope<unknown>>('/api/user/aff_transfer', { quota })
  unwrap(res.data, t('转入失败'))
  return res.data.message ?? ''
}

// ── Top-up orders (controller/topup.go GetUserTopUps / GetAllTopUps) ──────
/** model/topup.go TopUp. `amount` is in USD units, except Creem orders, which store quota units. */
export type TopUpOrder = {
  id: number
  user_id: number
  amount: number
  money: number
  trade_no: string
  payment_method: string
  create_time: number
  complete_time: number
  status: string
}

/** The user's own orders, or every user's for an administrator (`all`). */
export async function listTopUpOrders(query: { all: boolean; page: number; size: number; keyword: string }) {
  const res = await api.get<ApiEnvelope<{ items: TopUpOrder[] | null; total: number }>>(
    query.all ? '/api/user/topup' : '/api/user/topup/self',
    { params: { p: query.page, page_size: query.size, keyword: query.keyword || undefined } }
  )
  const data = unwrap(res.data, t('充值记录加载失败'))
  return { items: data.items ?? [], total: data.total ?? 0 }
}

/** Administrator: marks a pending order paid and credits its user. */
export async function completeTopUpOrder(tradeNo: string): Promise<void> {
  const res = await api.post<ApiEnvelope<unknown>>('/api/user/topup/complete', { trade_no: tradeNo })
  unwrap(res.data, t('补单失败'))
}

// ── Savings (controller/log_summary.go, window under 10 days) ─────────────
export type Savings = { quota: number; saved_quota: number }

export async function getSavings(start: number, end: number): Promise<Savings> {
  const res = await api.get<ApiEnvelope<Savings>>('/api/log/self/summary', {
    params: { start_timestamp: start, end_timestamp: end, timezone_offset: -new Date().getTimezoneOffset() },
  })
  return unwrap(res.data, t('获取用量统计失败'))
}
