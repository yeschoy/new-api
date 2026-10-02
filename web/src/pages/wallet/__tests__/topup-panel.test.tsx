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
import { TopUpPanel } from '../topup-panel'
import { parseWalletInfo } from '../topup-rules'
import { answerGets, renderPage, signIn } from './render'

const INFO = {
  enable_online_topup: true,
  enable_stripe_topup: true,
  enable_creem_topup: false,
  enable_waffo_topup: true,
  enable_waffo_pancake_topup: true,
  enable_redemption: true,
  payment_compliance_confirmed: true,
  pay_methods: [
    { name: '支付宝', type: 'alipay', icon: 'SiAlipay' },
    { name: '自定义1', type: 'custom1', min_topup: '50' },
    { name: 'Stripe', type: 'stripe', color: '#635BFF', min_topup: '1' },
    { name: 'Waffo Pancake', type: 'waffo_pancake', min_topup: '1' },
    { name: 'Waffo (Global Payment)', type: 'waffo', min_topup: '1' },
  ],
  waffo_pay_methods: [
    { name: 'Card', icon: 'credit-card', payMethodType: 'CREDITCARD', payMethodName: '' },
    { name: 'Apple Pay', icon: 'apple', payMethodType: 'APPLEPAY', payMethodName: 'APPLEPAY' },
  ],
  creem_products: '',
  min_topup: 5,
  stripe_min_topup: 1,
  waffo_min_topup: 1,
  waffo_pancake_min_topup: 1,
  amount_options: [10, 50],
  discount: { 50: 0.9 },
  topup_link: '',
}

/** Quotes 0.9 per unit on every gateway; other paths answer from `replies`. */
function answerPosts(replies: Record<string, unknown> = {}) {
  return vi.spyOn(api, 'post').mockImplementation(async (url: string, body?: unknown) => {
    if (url.endsWith('/amount')) {
      const amount = (body as { amount: number }).amount
      return { data: { message: 'success', data: (amount * 0.9).toFixed(2) } }
    }
    return { data: replies[url] ?? { message: 'error', data: `unexpected ${url}` } }
  })
}

beforeEach(() => {
  answerGets({ '/api/status': { quota_per_unit: 500_000 } })
  signIn()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
})

async function confirmPayment() {
  const dialog = await screen.findByRole('dialog', { name: '确认支付' })
  const confirm = within(dialog).getByRole('button', { name: '确认支付' })
  await waitFor(() => expect(confirm).toBeEnabled())
  await userEvent.click(confirm)
  return dialog
}

describe('online top-up', () => {
  it('fills the amount from a picked preset and marks its discount', async () => {
    answerPosts()
    renderPage(<TopUpPanel info={parseWalletInfo(INFO)} />)
    const preset = await screen.findByRole('button', { name: /\$50/ })
    expect(within(preset).getByText('-10%')).toBeInTheDocument()

    await userEvent.click(preset)

    expect(screen.getByLabelText('充值数量')).toHaveValue('50')
    expect(preset).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows what the first method charges for the chosen amount', async () => {
    answerPosts()
    renderPage(<TopUpPanel info={parseWalletInfo(INFO)} />)
    await userEvent.click(await screen.findByRole('button', { name: /\$50/ }))

    expect(await screen.findByText('45.00')).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith('/api/user/amount', { amount: 50 })
  })

  it('holds a method back while the amount is under its minimum', async () => {
    answerPosts()
    renderPage(<TopUpPanel info={parseWalletInfo(INFO)} />)
    const custom = await screen.findByRole('button', { name: /自定义1/ })
    expect(custom).toBeDisabled()
    expect(within(custom).getByText('最低 50')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /\$50/ }))

    expect(custom).toBeEnabled()
  })

  it('leaves out epay channels when epay itself is not configured', async () => {
    answerPosts()
    renderPage(<TopUpPanel info={parseWalletInfo({ ...INFO, enable_online_topup: false })} />)
    expect(await screen.findByRole('button', { name: 'Stripe' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '支付宝' })).toBeNull()
  })

  it('posts an epay order to the gateway once the payment is confirmed', async () => {
    answerPosts({
      '/api/user/pay': { message: 'success', data: { pid: '1001', money: '9.00' }, url: 'https://pay.example.com/submit.php' },
    })
    const posted: Array<{ action: string; fields: Record<string, string> }> = []
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
      posted.push({ action: this.action, fields: Object.fromEntries([...this.querySelectorAll('input')].map((input) => [input.name, input.value])) })
    })
    renderPage(<TopUpPanel info={parseWalletInfo(INFO)} />)
    await userEvent.click(await screen.findByRole('button', { name: /\$10/ }))
    await userEvent.click(screen.getByRole('button', { name: '支付宝' }))

    const dialog = await confirmPayment()

    await waitFor(() => expect(posted).toEqual([{ action: 'https://pay.example.com/submit.php', fields: { pid: '1001', money: '9.00' } }]))
    expect(api.post).toHaveBeenCalledWith('/api/user/pay', { amount: 10, payment_method: 'alipay' })
    expect(dialog).not.toBeInTheDocument()
  })

  it('opens Stripe checkout in a new tab', async () => {
    answerPosts({ '/api/user/stripe/pay': { message: 'success', data: { pay_link: 'https://checkout.stripe.com/c/pay/cs_1' } } })
    const open = vi.spyOn(browser, 'open').mockImplementation(() => true)
    renderPage(<TopUpPanel info={parseWalletInfo(INFO)} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Stripe' }))

    await confirmPayment()

    await waitFor(() => expect(open).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_1'))
    expect(api.post).toHaveBeenCalledWith('/api/user/stripe/pay', { amount: 5, payment_method: 'stripe' })
  })

  it('pays a Waffo method by its place in the list', async () => {
    answerPosts({ '/api/user/waffo/pay': { message: 'success', data: { payment_url: 'https://pay.waffo.com/o/1', order_id: 'WAFFO1' } } })
    const open = vi.spyOn(browser, 'open').mockImplementation(() => true)
    renderPage(<TopUpPanel info={parseWalletInfo(INFO)} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Apple Pay' }))

    await confirmPayment()

    await waitFor(() => expect(open).toHaveBeenCalledWith('https://pay.waffo.com/o/1'))
    expect(api.post).toHaveBeenCalledWith('/api/user/waffo/pay', { amount: 5, pay_method_index: 1 })
  })

  it('checks Waffo Pancake out in this tab', async () => {
    answerPosts({ '/api/user/waffo-pancake/pay': { message: 'success', data: { checkout_url: 'https://checkout.waffo.ai/s/1', order_id: 'P1' } } })
    const go = vi.spyOn(browser, 'go').mockImplementation(() => undefined)
    renderPage(<TopUpPanel info={parseWalletInfo(INFO)} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Waffo Pancake' }))

    await confirmPayment()

    await waitFor(() => expect(go).toHaveBeenCalledWith('https://checkout.waffo.ai/s/1'))
  })

  it('shows why the gateway refused the order and stays open', async () => {
    answerPosts({ '/api/user/pay': { message: 'error', data: '当前管理员未配置支付信息' } })
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => undefined)
    renderPage(<TopUpPanel info={parseWalletInfo(INFO)} />)
    await userEvent.click(await screen.findByRole('button', { name: '支付宝' }))

    const dialog = await confirmPayment()

    expect(await within(dialog).findByText('当前管理员未配置支付信息')).toBeInTheDocument()
    expect(submit).not.toHaveBeenCalled()
  })

  it('sells Creem products at their own price', async () => {
    answerPosts({ '/api/user/creem/pay': { message: 'success', data: { checkout_url: 'https://creem.io/checkout/1', order_id: 'ref_1' } } })
    const open = vi.spyOn(browser, 'open').mockImplementation(() => true)
    const info = parseWalletInfo({
      enable_creem_topup: true,
      creem_products: [{ name: 'Starter', productId: 'prod_1', price: 9.9, quota: 5_000_000, currency: 'EUR' }],
    })
    renderPage(<TopUpPanel info={info} />)
    const product = await screen.findByRole('button', { name: /Starter/ })
    expect(within(product).getByText('€9.90')).toBeInTheDocument()
    expect(within(product).getByText('到账 $10')).toBeInTheDocument()
    await userEvent.click(product)

    await confirmPayment()

    await waitFor(() => expect(open).toHaveBeenCalledWith('https://creem.io/checkout/1'))
    expect(api.post).toHaveBeenCalledWith('/api/user/creem/pay', { product_id: 'prod_1', payment_method: 'creem' })
  })

  it('points to redemption codes when no online gateway is on', async () => {
    renderPage(<TopUpPanel info={parseWalletInfo({ enable_redemption: true })} />)
    expect(await screen.findByText('本站未开启在线充值，可以使用兑换码充值。')).toBeInTheDocument()
    expect(screen.queryByLabelText('充值数量')).toBeNull()
  })
})
