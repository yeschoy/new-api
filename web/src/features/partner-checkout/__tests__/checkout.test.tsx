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
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PartnerCheckoutPage } from '..'
import {
  forgetCashierAccess,
  readCashierAccess,
  saveCashierAccess,
} from '../lib/access'
import { NOW, ORDER_NO, TOKEN, order, response } from './fixtures'

const fetcher = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.stubGlobal('fetch', fetcher)
  fetcher.mockReset()
  saveCashierAccess({
    orderNo: ORDER_NO,
    token: TOKEN,
    expiresAt: NOW + 1800000,
  })
})
afterEach(() => {
  forgetCashierAccess(ORDER_NO)
  sessionStorage.clear()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function showCheckout() {
  const view = render(<PartnerCheckoutPage orderNo={ORDER_NO} />)
  await act(async () => {
    await Promise.resolve()
  })
  return view
}

describe('public cashier rendering', () => {
  it('shows trusted pending terms, encoded QR and safe payment link without leaking access', async () => {
    fetcher.mockResolvedValue(
      response({ ...order, plan_title: '<img src=x onerror=alert(1)>' })
    )
    const view = await showCheckout()
    expect(
      screen.getByRole('heading', { name: 'Subscription checkout' })
    ).toBeVisible()
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible()
    expect(screen.getByText('9.99')).toBeVisible()
    expect(
      screen.getByRole('img', { name: 'Payment QR code' }).querySelector('svg')
    ).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Open secure payment page' })
    expect(link).toHaveAttribute('href', order.pay_url)
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(view.container.innerHTML).not.toContain(TOKEN)
    expect(view.container.querySelector('img')).toBeNull()
    expect(screen.getByRole('main')).toHaveClass('min-h-svh', 'px-4')
    expect(screen.getByText(ORDER_NO)).toHaveClass('break-all')
  })

  it.each(['pending', 'failed_retryable'] as const)(
    'shows paid + %s without requesting another payment',
    async (fulfillment) => {
      fetcher.mockResolvedValue(
        response({
          ...order,
          payment_status: 'paid',
          fulfillment_status: fulfillment,
        })
      )
      await showCheckout()
      expect(screen.getByText('Payment received')).toBeVisible()
      expect(screen.getByText(/Delivery is pending/)).toBeVisible()
      expect(screen.queryByRole('link')).toBeNull()
      expect(screen.queryByRole('img')).toBeNull()
    }
  )

  it('shows fulfilled and stops polling but preserves short-lived access for reload', async () => {
    fetcher.mockImplementation(async () =>
      response({
        ...order,
        payment_status: 'paid',
        fulfillment_status: 'fulfilled',
      })
    )
    const view = await showCheckout()
    expect(
      screen.getByText(
        'Subscription delivered. You can return to the merchant.'
      )
    ).toBeVisible()
    await act(() => vi.advanceTimersByTimeAsync(30000))
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(readCashierAccess(ORDER_NO)).not.toBeNull()
    view.unmount()
    await showCheckout()
    expect(
      screen.getByText(
        'Subscription delivered. You can return to the merchant.'
      )
    ).toBeVisible()
  })

  it.each(['failed', 'expired'] as const)(
    'shows %s payment without any actionable payment UI',
    async (payment) => {
      fetcher.mockResolvedValue(response({ ...order, payment_status: payment }))
      await showCheckout()
      expect(
        screen.getByText(/This payment is no longer available/)
      ).toBeVisible()
      expect(screen.queryByRole('link')).toBeNull()
      await act(() => vi.advanceTimersByTimeAsync(30000))
      expect(fetcher).toHaveBeenCalledTimes(1)
    }
  )

  it('does not fetch when access is missing and offers no platform login or arbitrary return link', async () => {
    forgetCashierAccess(ORDER_NO)
    await showCheckout()
    expect(
      screen.getByText('Checkout access is missing, invalid or expired')
    ).toBeVisible()
    expect(
      screen.getByText(/Return to the merchant to check this order/)
    ).toBeVisible()
    expect(fetcher).not.toHaveBeenCalled()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('turns unauthorized access into a safe local error, without refresh or redirects', async () => {
    fetcher.mockResolvedValue(response({}, 401))
    await showCheckout()
    expect(
      screen.getByText('Checkout access is missing, invalid or expired')
    ).toBeVisible()
    expect(readCashierAccess(ORDER_NO)).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('separates a server failure from payment failure and allows a status-only retry', async () => {
    fetcher
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValue(response())
    await showCheckout()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Payment is not marked as failed'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await act(async () => {
      await Promise.resolve()
    })
    expect(
      screen.getByRole('link', { name: 'Open secure payment page' })
    ).toBeVisible()
    expect(fetcher).toHaveBeenCalledTimes(2)
    for (const [, options] of fetcher.mock.calls) {
      expect(options?.method).toBe('GET')
    }
  })

  it.each([
    'javascript:alert(1)',
    'http://gateway.example/pay',
    'https://user:password@gateway.example/pay',
  ])('never renders unsafe payment link %s', async (payUrl) => {
    fetcher.mockResolvedValue(
      response({ ...order, pay_url: payUrl, qr_code: undefined })
    )
    await showCheckout()
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(/Payment details are not ready/)).toBeVisible()
  })

  it('renders an oversized QR as unavailable rather than crashing the page', async () => {
    fetcher.mockResolvedValue(
      response({ ...order, qr_code: 'x'.repeat(8192), pay_url: undefined })
    )
    await showCheckout()
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText(/Payment details are not ready/)).toBeVisible()
  })
})

describe('bounded cancellable order polling', () => {
  it('waits for each request before scheduling another and aborts on unmount', async () => {
    let resolveRequest: ((value: Response) => void) | undefined
    fetcher.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve
        })
    )
    const view = await showCheckout()
    const signal = fetcher.mock.calls[0][1]?.signal
    await act(() => vi.advanceTimersByTimeAsync(9000))
    expect(fetcher).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolveRequest?.(response())
    })
    await act(() => vi.advanceTimersByTimeAsync(2999))
    expect(fetcher).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(fetcher).toHaveBeenCalledTimes(2)
    view.unmount()
    expect(signal?.aborted).toBe(false)
    expect(fetcher.mock.calls[1][1]?.signal?.aborted).toBe(true)
    await act(async () => {
      resolveRequest?.(response())
    })
    await act(() => vi.advanceTimersByTimeAsync(30000))
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('expires access independently of a slow request and removes all payment actions', async () => {
    fetcher
      .mockResolvedValueOnce(response({ ...order, expires_at: NOW / 1000 + 5 }))
      .mockImplementation(() => new Promise(() => {}))
    await showCheckout()
    expect(screen.getByRole('link')).toBeVisible()
    await act(() => vi.advanceTimersByTimeAsync(5000))
    expect(screen.getByText('Checkout access has expired')).toBeVisible()
    expect(screen.queryByRole('link')).toBeNull()
    expect(fetcher.mock.calls[1][1]?.signal?.aborted).toBe(true)
    expect(readCashierAccess(ORDER_NO)).toBeNull()
  })

  it('retains paid delivery information after a transport failure without offering payment', async () => {
    fetcher
      .mockResolvedValueOnce(
        response({
          ...order,
          payment_status: 'paid',
          fulfillment_status: 'failed_retryable',
        })
      )
      .mockRejectedValue(new TypeError('offline'))
    await showCheckout()
    await act(() => vi.advanceTimersByTimeAsync(3000))
    expect(screen.getByText('Payment received')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Payment is not marked as failed'
    )
    expect(screen.queryByRole('link')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText('Payment received')).toBeVisible()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('aborts a timed-out request before retrying status and never overlaps requests', async () => {
    fetcher
      .mockImplementationOnce(
        (_input, options) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true }
            )
          })
      )
      .mockImplementation(async () => response())
    await showCheckout()
    await act(() => vi.advanceTimersByTimeAsync(10000))
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Payment is not marked as failed'
    )
    await act(() => vi.advanceTimersByTimeAsync(3000))
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(
      screen.getByRole('link', { name: 'Open secure payment page' })
    ).toBeVisible()
  })

  it('bounds automatic server retries to five failures and cleans up timers', async () => {
    fetcher.mockResolvedValue(response({}, 503))
    const view = await showCheckout()
    await act(() => vi.advanceTimersByTimeAsync(30000))
    expect(fetcher).toHaveBeenCalledTimes(5)
    view.unmount()
    await act(() => vi.advanceTimersByTimeAsync(1800000))
    expect(fetcher).toHaveBeenCalledTimes(5)
  })
})
