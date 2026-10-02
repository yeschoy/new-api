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
import { cleanup, screen, waitFor } from '@testing-library/react'

import { api } from '@/lib/api'
import { authStore } from '@/lib/auth-store'
import { CreditsPage } from '@/pages/console/credits-page'

import { USER, ok, renderPage, signIn } from './render'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div data-shell='router'>{props.children}</div>,
}))

const INFO = {
  enable_online_topup: true,
  enable_stripe_topup: false,
  enable_creem_topup: false,
  enable_waffo_topup: false,
  enable_waffo_pancake_topup: false,
  enable_redemption: true,
  payment_compliance_confirmed: true,
  pay_methods: [{ name: '支付宝', type: 'alipay' }],
  min_topup: 1,
  amount_options: [10],
  discount: {},
}

function answer(overrides: Record<string, unknown> = {}) {
  const responses: Record<string, unknown> = {
    '/api/status': { quota_per_unit: 500_000 },
    '/api/user/self': USER,
    '/api/user/topup/info': INFO,
    '/api/user/topup/self': { items: [], total: 0 },
    '/api/user/aff': 'AB12',
    '/api/subscription/plans': [],
    '/api/subscription/self': { billing_preference: 'subscription_first', subscriptions: [], all_subscriptions: [] },
    '/api/log/self/summary': { requests: 0, quota: 0, saved_quota: 0, daily: [] },
    ...overrides,
  }
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => ok(responses[url] ?? {}))
  vi.spyOn(api, 'post').mockImplementation(async () => ({ data: { message: 'success', data: '1.00' } }))
}

beforeEach(() => signIn())

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
})

describe('wallet page', () => {
  it('is called 钱包 and offers online top-up when a gateway is on', async () => {
    answer()
    renderPage(<CreditsPage />)
    expect(await screen.findByRole('heading', { name: '钱包' })).toBeInTheDocument()
    expect(await screen.findByLabelText('充值数量')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '支付宝' })).toBeInTheDocument()
  })

  it('offers subscription plans when the site sells them', async () => {
    const plan = {
      id: 1, title: 'Pro', price_amount: 9.9, currency: 'USD', duration_unit: 'month', duration_value: 1,
      quota_reset_period: 'never', max_purchase_per_user: 0, total_amount: 0,
    }
    answer({ '/api/subscription/plans': [{ plan }] })
    renderPage(<CreditsPage />)
    expect(await screen.findByRole('heading', { name: '订阅套餐' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Pro' })).toBeInTheDocument()
  })

  it('shows the user’s invite link', async () => {
    answer()
    renderPage(<CreditsPage />)
    expect(await screen.findByRole('heading', { name: '邀请奖励' })).toBeInTheDocument()
    expect(await screen.findByDisplayValue(`${window.location.origin}/sign-up?aff=AB12`)).toBeInTheDocument()
  })

  it('scrolls to the orders when a payment sends the user back with ?show_history', async () => {
    answer({ '/api/user/topup/self': { items: [], total: 0 } })
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    try {
      renderPage(<CreditsPage />, '/settings/credits?show_history=true')
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
      expect(scrollIntoView.mock.contexts[0]).toHaveAttribute('id', 'orders')
    } finally {
      // jsdom has no scrollIntoView of its own.
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
    }
  })

  it('no longer says online payment is still being set up', async () => {
    answer()
    renderPage(<CreditsPage />)
    await screen.findByLabelText('充值数量')
    expect(screen.queryByText('在线支付通道正在接入中，暂时请使用兑换码充值。')).toBeNull()
  })
})
