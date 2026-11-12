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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PartnerPurchasePage } from '..'
import quotaPlans from '../../../../../controller/testdata/partner_purchase_quota_plans.json'
import {
  freezePurchaseDraft,
  preparePurchaseEntry,
  readPurchaseEntry,
  savePurchaseAccess,
} from '../lib/access'
import {
  access,
  ACCESS,
  catalog,
  CHECKOUT,
  LAUNCH,
  ORDER_NO,
  response,
} from './fixtures'

let sequence = 0
let sessionId = ''
beforeEach(() => {
  sessionId = `PPS${String(++sequence).padStart(32, '0')}`
  savePurchaseAccess({ ...access(), sessionId })
})
afterEach(() => {
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
  sessionStorage.clear()
})
function data() {
  return { ...catalog(), session_id: sessionId }
}
async function choose() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('radio', { name: /Monthly plan/ }))
  await user.click(screen.getByRole('radio', { name: 'Alipay' }))
  return user
}
describe('hosted purchase interactions', () => {
  it('renders real prices/raw quota and long plain copy, never creates on mount or selection, and submits once', async () => {
    let finish!: (value: Response) => void
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(data()))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve
          })
      )
    vi.stubGlobal('fetch', fetcher)
    const navigate = vi.fn()
    render(<PartnerPurchasePage sessionId={sessionId} navigate={navigate} />)
    const user = await choose()
    expect(screen.getByText('19.99 CNY')).toBeVisible()
    expect(screen.getByText('Internal quota units: 1234567')).toBeVisible()
    expect(screen.getByText('<script>not HTML</script>')).toBeVisible()
    expect(document.querySelector('main script')).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
    await user.dblClick(
      screen.getByRole('button', { name: 'Continue to checkout' })
    )
    expect(fetcher).toHaveBeenCalledTimes(2)
    fireEvent.submit(
      screen
        .getByRole('button', { name: 'Opening checkout…' })
        .closest('form') ?? document.body
    )
    expect(fetcher).toHaveBeenCalledTimes(2)
    await act(async () =>
      finish(response({ order_no: ORDER_NO, checkout_url: CHECKOUT }, 201))
    )
    expect(navigate).toHaveBeenCalledExactlyOnceWith(CHECKOUT)
  })
  it('renders the shared backend quota strings exactly and keeps the full catalog purchasable', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ ...data(), plans: quotaPlans }))
      .mockResolvedValueOnce(
        response({ order_no: ORDER_NO, checkout_url: CHECKOUT })
      )
    vi.stubGlobal('fetch', fetcher)
    const navigate = vi.fn()
    render(<PartnerPurchasePage sessionId={sessionId} navigate={navigate} />)
    await screen.findByRole('radio', { name: 'Quota 9223372036854775807' })
    expect(screen.getByText('Unlimited quota')).toBeVisible()
    for (const amount of [
      '9007199254740991',
      '9007199254740992',
      '9223372036854775807',
    ]) {
      expect(screen.getByText(`Internal quota units: ${amount}`)).toBeVisible()
    }
    const user = userEvent.setup()
    await user.click(
      screen.getByRole('radio', { name: 'Quota 9223372036854775807' })
    )
    await user.click(screen.getByRole('radio', { name: 'Alipay' }))
    await user.click(
      screen.getByRole('button', { name: 'Continue to checkout' })
    )
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledExactlyOnceWith(CHECKOUT)
    )
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
      plan_id: 101,
      payment_method: 'alipay',
    })
  })
  it('keeps the original draft after a lost response, locks changes and safely retries after remount', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(data()))
      .mockRejectedValueOnce(new TypeError('timeout'))
      .mockResolvedValueOnce(response(data()))
      .mockResolvedValueOnce(
        response({ order_no: ORDER_NO, checkout_url: CHECKOUT })
      )
    vi.stubGlobal('fetch', fetcher)
    const navigate = vi.fn()
    const first = render(
      <PartnerPurchasePage sessionId={sessionId} navigate={navigate} />
    )
    const user = await choose()
    await user.click(
      screen.getByRole('button', { name: 'Continue to checkout' })
    )
    expect(
      await screen.findByText(/The request could not be confirmed/)
    ).toBeVisible()
    expect(
      screen.getByRole('radio', { name: 'Unlimited plan' })
    ).toHaveAttribute('aria-disabled', 'true')
    first.unmount()
    render(<PartnerPurchasePage sessionId={sessionId} navigate={navigate} />)
    const retry = await screen.findByRole('button', {
      name: 'Retry original purchase',
    })
    await waitFor(() => expect(retry).toBeEnabled())
    await user.click(retry)
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledExactlyOnceWith(CHECKOUT)
    )
    const posts = fetcher.mock.calls.filter(
      ([, options]) => options.method === 'POST'
    )
    expect(posts).toHaveLength(2)
    expect(posts[0][1].body).toBe(posts[1][1].body)
    expect(JSON.parse(posts[1][1].body)).toEqual({
      plan_id: 42,
      payment_method: 'alipay',
    })
  })
  it.each(['status refresh', 'remount'])(
    'explicitly prepares the persisted pending order after a 503 and %s',
    async (recovery) => {
      const original = data()
      const pending = {
        order_no: ORDER_NO,
        plan_id: 42,
        payment_method: 'alipay',
        payment_status: 'pending' as const,
        fulfillment_status: 'not_ready' as const,
        expires_at: Math.floor(Date.now() / 1000) + 1200,
        checkout_url: CHECKOUT,
      }
      // Simulate the actual boundary: POST commits an order, then preparation
      // fails. Every later GET returns that persisted order, not order:null.
      let persisted: typeof pending | null = null
      let orderCount = 0
      let finish!: (value: Response) => void
      const fetcher = vi.fn().mockImplementation((_url, options) => {
        if (options.method === 'GET') {
          return Promise.resolve(
            response(
              persisted
                ? {
                    ...original,
                    plans: [],
                    payment_methods: [],
                    order: persisted,
                  }
                : original
            )
          )
        }
        if (!persisted) {
          persisted = pending
          orderCount++
          return Promise.resolve(response({}, 503))
        }
        return new Promise<Response>((resolve) => {
          finish = resolve
        })
      })
      vi.stubGlobal('fetch', fetcher)
      const navigate = vi.fn()
      const first = render(
        <PartnerPurchasePage sessionId={sessionId} navigate={navigate} />
      )
      const user = await choose()
      await user.click(
        screen.getByRole('button', { name: 'Continue to checkout' })
      )
      await screen.findByText(/The request could not be confirmed/)
      expect(orderCount).toBe(1)
      expect(navigate).not.toHaveBeenCalled()
      if (recovery === 'remount') {
        first.unmount()
        render(
          <PartnerPurchasePage sessionId={sessionId} navigate={navigate} />
        )
      } else {
        await user.click(
          screen.getByRole('button', { name: 'Check purchase status' })
        )
      }
      const resume = await screen.findByRole('button', {
        name: 'Resume checkout / view order',
      })
      expect(fetcher).toHaveBeenCalledTimes(3)
      expect(screen.queryByRole('radio')).toBeNull()
      expect(screen.queryByRole('link')).toBeNull()
      expect(navigate).not.toHaveBeenCalled()
      await user.dblClick(resume)
      expect(fetcher).toHaveBeenCalledTimes(4)
      const posts = fetcher.mock.calls.filter(
        ([, options]) => options.method === 'POST'
      )
      expect(posts).toHaveLength(2)
      expect(posts[0][1].body).toBe(posts[1][1].body)
      expect(JSON.parse(posts[1][1].body)).toEqual({
        plan_id: 42,
        payment_method: 'alipay',
      })
      await act(async () =>
        finish(response({ order_no: ORDER_NO, checkout_url: CHECKOUT }))
      )
      expect(navigate).toHaveBeenCalledExactlyOnceWith(CHECKOUT)
      expect(orderCount).toBe(1)
      expect(persisted).toBe(pending)
      expect(persisted).toMatchObject({ expires_at: pending.expires_at })
    }
  )
  it('uses the persisted order instead of a conflicting local draft', async () => {
    freezePurchaseDraft(sessionId, { plan_id: 43, payment_method: 'wxpay' })
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          ...data(),
          plans: quotaPlans,
          order: {
            order_no: ORDER_NO,
            plan_id: 42,
            payment_method: 'alipay',
            payment_status: 'pending',
            fulfillment_status: 'not_ready',
            expires_at: Math.floor(Date.now() / 1000) + 300,
            checkout_url: CHECKOUT,
          },
        })
      )
      .mockResolvedValueOnce(
        response({ order_no: ORDER_NO, checkout_url: CHECKOUT })
      )
    vi.stubGlobal('fetch', fetcher)
    const navigate = vi.fn()
    render(<PartnerPurchasePage sessionId={sessionId} navigate={navigate} />)
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Resume checkout / view order',
      })
    )
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledExactlyOnceWith(CHECKOUT)
    )
    expect(screen.queryByRole('radio')).toBeNull()
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
      plan_id: 42,
      payment_method: 'alipay',
    })
  })
  it('retries the original draft even if current channels or plans disappear', async () => {
    freezePurchaseDraft(sessionId, { plan_id: 42, payment_method: 'alipay' })
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({ ...data(), plans: [], payment_methods: [] })
      )
      .mockResolvedValueOnce(
        response({ order_no: ORDER_NO, checkout_url: CHECKOUT })
      )
    vi.stubGlobal('fetch', fetcher)
    const navigate = vi.fn()
    render(<PartnerPurchasePage sessionId={sessionId} navigate={navigate} />)
    const button = await screen.findByRole('button', {
      name: 'Retry original purchase',
    })
    await userEvent.click(button)
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledExactlyOnceWith(CHECKOUT)
    )
  })
  it.each(['pending', 'paid'] as const)(
    'resumes pending via original POST but keeps paid order view read-only (%s)',
    async (payment) => {
      const value = {
        ...data(),
        order: {
          order_no: ORDER_NO,
          plan_id: 42,
          payment_method: 'alipay',
          payment_status: payment,
          fulfillment_status:
            payment === 'paid' ? 'failed_retryable' : 'not_ready',
          expires_at: Math.floor(Date.now() / 1000) + 300,
          checkout_url: CHECKOUT,
        },
      }
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(response(value))
        .mockResolvedValueOnce(
          response({ order_no: ORDER_NO, checkout_url: CHECKOUT })
        )
      vi.stubGlobal('fetch', fetcher)
      const navigate = vi.fn()
      render(<PartnerPurchasePage sessionId={sessionId} navigate={navigate} />)
      if (payment === 'pending') {
        const resume = await screen.findByRole('button', {
          name: 'Resume checkout / view order',
        })
        expect(fetcher).toHaveBeenCalledTimes(1)
        await userEvent.click(resume)
        await waitFor(() =>
          expect(navigate).toHaveBeenCalledExactlyOnceWith(CHECKOUT)
        )
        expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({
          plan_id: 42,
          payment_method: 'alipay',
        })
      } else {
        expect(
          await screen.findByRole('link', {
            name: 'Resume checkout / view order',
          })
        ).toHaveAttribute('href', CHECKOUT)
        expect(navigate).not.toHaveBeenCalled()
        expect(fetcher).toHaveBeenCalledTimes(1)
      }
      expect(screen.queryByRole('radio')).toBeNull()
      if (payment === 'paid') {
        expect(
          screen.getByText(/Do not pay again; delivery continues/)
        ).toBeVisible()
      }
    }
  )
  it('does not invent an expired order link or a second-purchase action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          ...data(),
          order: {
            order_no: ORDER_NO,
            plan_id: 42,
            payment_method: 'alipay',
            payment_status: 'expired',
            fulfillment_status: 'not_ready',
            expires_at: Math.floor(Date.now() / 1000) - 5,
          },
        })
      )
    )
    render(<PartnerPurchasePage sessionId={sessionId} />)
    expect(
      await screen.findByText('Checkout access is missing, invalid or expired')
    ).toBeVisible()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('radio')).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Resume checkout / view order' })
    ).toBeNull()
  })
  it.each(['plans', 'payment_methods'] as const)(
    'honestly displays empty %s',
    async (key) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(response({ ...data(), [key]: [] }))
      )
      render(<PartnerPurchasePage sessionId={sessionId} />)
      expect(
        await screen.findByText('No purchase options are available')
      ).toBeVisible()
      expect(screen.queryByRole('radio')).toBeNull()
    }
  )
  it.each([
    [401, /invalid, revoked or already used/],
    [410, /Purchase access has expired/],
  ])(
    'shows unavailable access HTTP %s without login or order writes',
    async (status, message) => {
      const fetcher = vi.fn().mockResolvedValue(response({}, Number(status)))
      vi.stubGlobal('fetch', fetcher)
      render(<PartnerPurchasePage sessionId={sessionId} />)
      expect(await screen.findByText(message)).toBeVisible()
      expect(screen.queryByRole('radio')).toBeNull()
      expect(screen.queryByRole('link')).toBeNull()
      expect(fetcher).toHaveBeenCalledTimes(1)
    }
  )
  it('keeps nonce stable through lost exchange replies, including StrictMode mounts', async () => {
    window.history.replaceState(
      null,
      '',
      `/partner/purchase?session_id=${sessionId}#launch=${LAUNCH}`
    )
    preparePurchaseEntry()
    const original = readPurchaseEntry(sessionId)
    const fetcher = vi.fn().mockRejectedValue(new TypeError('lost response'))
    vi.stubGlobal('fetch', fetcher)
    render(
      <StrictMode>
        <PartnerPurchasePage sessionId={sessionId} />
      </StrictMode>
    )
    await screen.findByText(/The request could not be confirmed/)
    fetcher
      .mockResolvedValueOnce(
        response({
          session_id: sessionId,
          expires_at: Math.floor(Date.now() / 1000) + 300,
          access_token: ACCESS,
        })
      )
      .mockResolvedValueOnce(response(data()))
    await userEvent.click(
      screen.getByRole('button', { name: 'Check purchase status' })
    )
    await screen.findByRole('radio', { name: /Monthly plan/ })
    const exchanges = fetcher.mock.calls.filter(([url]) =>
      url.endsWith('/exchange')
    )
    expect(exchanges.length).toBeGreaterThanOrEqual(2)
    expect(new Set(exchanges.map(([, options]) => options.body)).size).toBe(1)
    expect(
      original?.kind === 'launch' &&
        JSON.parse(exchanges[0][1].body).client_nonce
    ).toBe(original?.kind === 'launch' && original.nonce)
    expect(readPurchaseEntry(sessionId)?.kind).toBe('access')
  })
  it('conflicts never offer another order, and status refresh never submits', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(data()))
      .mockResolvedValueOnce(
        response(
          {
            error: { code: 'idempotency_conflict', message: 'conflict' },
            request_id: 'test',
          },
          409
        )
      )
      .mockResolvedValueOnce(response(data()))
    vi.stubGlobal('fetch', fetcher)
    render(<PartnerPurchasePage sessionId={sessionId} />)
    const user = await choose()
    await user.click(
      screen.getByRole('button', { name: 'Continue to checkout' })
    )
    expect(
      await screen.findByText(/already uses different options/)
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Retry original purchase' })
    ).toBeDisabled()
    await user.click(
      screen.getByRole('button', { name: 'Check purchase status' })
    )
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3))
    expect(
      fetcher.mock.calls.filter(([, options]) => options.method === 'POST')
    ).toHaveLength(1)
  })
  it('supports keyboard plan selection and never buys on arrow navigation', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(data()))
    vi.stubGlobal('fetch', fetcher)
    render(<PartnerPurchasePage sessionId={sessionId} />)
    const first = await screen.findByRole('radio', { name: /Monthly plan/ })
    const user = userEvent.setup()
    await user.tab()
    expect(first).toHaveFocus()
    await user.keyboard('[ArrowDown]')
    expect(
      screen.getByRole('radio', { name: 'Unlimited plan' })
    ).toHaveAttribute('aria-checked', 'true')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('bounds a hanging order request, retaining the exact draft on timeout', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(data()))
      .mockImplementationOnce(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            )
          })
      )
    vi.stubGlobal('fetch', fetcher)
    const view = render(<PartnerPurchasePage sessionId={sessionId} />)
    await choose()
    vi.useFakeTimers()
    try {
      fireEvent.submit(
        screen
          .getByRole('button', { name: 'Continue to checkout' })
          .closest('form') ?? document.body
      )
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20001)
      })
      expect(
        screen.getByText(/The request could not be confirmed/)
      ).toBeVisible()
      expect(
        screen.getByRole('button', { name: 'Retry original purchase' })
      ).toBeEnabled()
      expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true)
      view.unmount()
    } finally {
      vi.useRealTimers()
    }
  })
  it('aborts in-flight submission on unmount and does not navigate a stale result', async () => {
    let finish!: (value: Response) => void
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(data()))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve
          })
      )
    vi.stubGlobal('fetch', fetcher)
    const navigate = vi.fn()
    const view = render(
      <PartnerPurchasePage sessionId={sessionId} navigate={navigate} />
    )
    await choose()
    fireEvent.submit(
      screen
        .getByRole('button', { name: 'Continue to checkout' })
        .closest('form') ?? document.body
    )
    view.unmount()
    expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true)
    await act(async () =>
      finish(response({ order_no: ORDER_NO, checkout_url: CHECKOUT }))
    )
    expect(navigate).not.toHaveBeenCalled()
  })
})
