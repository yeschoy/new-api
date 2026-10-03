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
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { api } from '@/lib/api'
import { authStore } from '@/lib/auth-store'

import { browser } from '../checkout'
import { SubscriptionPanel } from '../subscription-panel'
import { parseWalletInfo } from '../topup-rules'
import { USER, ok, renderPage, signIn } from './render'

const NOW = Math.floor(Date.now() / 1000)
const DAY = 86_400

const PRO = {
  id: 1, title: 'Pro', subtitle: 'For teams', price_amount: 9.9, currency: 'USD',
  duration_unit: 'month', duration_value: 1, custom_seconds: 0,
  quota_reset_period: 'daily', quota_reset_custom_seconds: 0,
  enabled: true, sort_order: 0, allow_balance_pay: true, allow_wallet_overflow: true,
  stripe_price_id: 'price_1', creem_product_id: '', waffo_pancake_product_id: '',
  max_purchase_per_user: 2, upgrade_group: 'vip', downgrade_group: '', total_amount: 5_000_000,
  created_at: 0, updated_at: 0,
}
const BASIC = { ...PRO, id: 2, title: 'Basic', subtitle: '', price_amount: 20, quota_reset_period: 'never', max_purchase_per_user: 0, upgrade_group: '', stripe_price_id: '', total_amount: 0 }

const ACTIVE = {
  id: 11, user_id: 7, plan_id: 1, amount_total: 5_000_000, amount_used: 1_250_000,
  start_time: NOW - DAY, end_time: NOW + 5 * DAY - 60, status: 'active', source: 'order',
  last_reset_time: 0, next_reset_time: NOW + 3_600, upgrade_group: 'vip', prev_user_group: 'default',
  downgrade_group: '', allow_wallet_overflow: true, created_at: 0, updated_at: 0,
}
const EXPIRED = { ...ACTIVE, id: 9, plan_id: 2, amount_total: 0, amount_used: 0, start_time: NOW - 40 * DAY, end_time: NOW - 10 * DAY, status: 'expired', next_reset_time: 0 }

const INFO = parseWalletInfo({
  enable_online_topup: true,
  enable_stripe_topup: true,
  enable_redemption: true,
  pay_methods: [{ name: '支付宝', type: 'alipay' }, { name: 'Stripe', type: 'stripe' }],
  min_topup: 1,
})

type Mine = { billing_preference: string; subscriptions: unknown[]; all_subscriptions: unknown[] }

const MINE: Mine = {
  billing_preference: 'subscription_first',
  subscriptions: [{ subscription: ACTIVE }],
  all_subscriptions: [{ subscription: ACTIVE }, { subscription: EXPIRED }],
}

function answer(plans: unknown[] = [{ plan: PRO }, { plan: BASIC }], mine: Mine = MINE) {
  const responses: Record<string, unknown> = {
    '/api/status': { quota_per_unit: 500_000 },
    '/api/user/self': USER,
    '/api/subscription/plans': plans,
    '/api/subscription/self': mine,
  }
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => ok(responses[url] ?? {}))
}

beforeEach(() => signIn())

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
})

async function openPlan(title: string) {
  const card = await screen.findByRole('article', { name: title })
  await userEvent.click(within(card).getByRole('button', { name: '立即订阅' }))
  return screen.findByRole('dialog', { name: '购买订阅' })
}

describe('subscription plans', () => {
  it('lists each plan with its price and what it includes', async () => {
    answer()
    renderPage(<SubscriptionPanel info={INFO} />)
    const card = await screen.findByRole('article', { name: 'Pro' })
    for (const text of ['$9.90', '推荐', '有效期 1 个月', '额度重置 每天', '总额度 $10', '限购 2 次', '升级分组 vip']) {
      expect(within(card).getByText(text)).toBeInTheDocument()
    }
    expect(within(screen.getByRole('article', { name: 'Basic' })).getByText('总额度 不限')).toBeInTheDocument()
  })

  it('shows the user’s subscriptions with usage and time left', async () => {
    answer()
    renderPage(<SubscriptionPanel info={INFO} />)
    expect(await screen.findByText('1 个生效中')).toBeInTheDocument()
    expect(screen.getByText('1 个已失效')).toBeInTheDocument()
    const active = screen.getByRole('listitem', { name: 'Pro · 订阅 #11' })
    for (const text of ['生效中', '剩余 5 天', '额度 $2.5 / $10 · 剩余 $7.5', '已用 25%']) {
      expect(within(active).getByText(text)).toBeInTheDocument()
    }
    expect(within(active).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25')
    expect(within(screen.getByRole('listitem', { name: 'Basic · 订阅 #9' })).getByText('已过期')).toBeInTheDocument()
  })

  it('shows past subscriptions even when no plan is on sale', async () => {
    answer([], { billing_preference: 'wallet_first', subscriptions: [], all_subscriptions: [{ subscription: EXPIRED }] })
    renderPage(<SubscriptionPanel info={INFO} />)
    expect(await screen.findByRole('listitem', { name: '订阅 #9' })).toBeInTheDocument()
    expect(screen.getByText('暂无可购买的套餐')).toBeInTheDocument()
  })

  it('stops selling a plan once the user reached its purchase limit', async () => {
    answer(undefined, { ...MINE, all_subscriptions: [{ subscription: ACTIVE }, { subscription: { ...ACTIVE, id: 12 } }] })
    renderPage(<SubscriptionPanel info={INFO} />)
    const card = await screen.findByRole('article', { name: 'Pro' })
    expect(within(card).getByRole('button', { name: '已达购买上限' })).toBeDisabled()
  })

  it('buys a plan with the balance', async () => {
    answer()
    const post = vi.spyOn(api, 'post').mockImplementation(async () => ok(null))
    renderPage(<SubscriptionPanel info={INFO} />)
    const dialog = await openPlan('Pro')
    expect(within(dialog).getByText('$9.9')).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: '用余额支付' }))

    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/subscription/balance/pay', { plan_id: 1 }))
    expect(await screen.findByText('订阅成功')).toBeInTheDocument()
    expect(dialog).not.toBeInTheDocument()
  })

  it('holds back paying with the balance when it does not cover the plan', async () => {
    answer()
    renderPage(<SubscriptionPanel info={INFO} />)
    const dialog = await openPlan('Basic')
    expect(within(dialog).getByText('余额不足')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '用余额支付' })).toBeDisabled()
  })

  it('opens the plan’s Stripe checkout', async () => {
    answer()
    vi.spyOn(api, 'post').mockImplementation(async () => ({ data: { message: 'success', data: { pay_link: 'https://checkout.stripe.com/c/pay/cs_2' } } }))
    const open = vi.spyOn(browser, 'open').mockImplementation(() => true)
    renderPage(<SubscriptionPanel info={INFO} />)
    const dialog = await openPlan('Pro')

    await userEvent.click(within(dialog).getByRole('button', { name: 'Stripe' }))

    await waitFor(() => expect(open).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_2'))
    expect(api.post).toHaveBeenCalledWith('/api/subscription/stripe/pay', { plan_id: 1 })
  })

  it('pays a plan through an epay channel', async () => {
    answer()
    vi.spyOn(api, 'post').mockImplementation(async () => ({
      data: { message: 'success', data: { pid: '1001' }, url: 'https://pay.example.com/submit.php' },
    }))
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => undefined)
    renderPage(<SubscriptionPanel info={INFO} />)
    const dialog = await openPlan('Pro')
    expect(within(dialog).getByRole('combobox', { name: '支付渠道' })).toHaveValue('alipay')

    await userEvent.click(within(dialog).getByRole('button', { name: '支付' }))

    await waitFor(() => expect(submit).toHaveBeenCalled())
    expect(api.post).toHaveBeenCalledWith('/api/subscription/epay/pay', { plan_id: 1, payment_method: 'alipay' })
  })
})

describe('billing preference', () => {
  it('saves the chosen way to pay for requests', async () => {
    answer()
    const put = vi.spyOn(api, 'put').mockImplementation(async () => ok({ billing_preference: 'subscription_only' }))
    renderPage(<SubscriptionPanel info={INFO} />)

    await userEvent.selectOptions(await screen.findByRole('combobox', { name: '扣费方式' }), 'subscription_only')

    await waitFor(() => expect(put).toHaveBeenCalledWith('/api/subscription/self/preference', { billing_preference: 'subscription_only' }))
  })

  it('falls back to the wallet while no subscription is active', async () => {
    answer(undefined, { billing_preference: 'subscription_first', subscriptions: [], all_subscriptions: [{ subscription: EXPIRED }] })
    renderPage(<SubscriptionPanel info={INFO} />)
    const select = await screen.findByRole('combobox', { name: '扣费方式' })
    expect(select).toHaveValue('wallet_first')
    expect(within(select).getByRole('option', { name: '优先使用订阅（无生效订阅）' })).toBeDisabled()
    expect(screen.getByText('已保存为「优先使用订阅」，但当前没有生效的订阅，将自动使用钱包余额。')).toBeInTheDocument()
  })
})
