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
import { afterEach, describe, expect, it, vi } from 'vitest'

import { decodeCashierOrder, getCashierOrder, safePaymentUrl } from '../api'
import { ORDER_NO, OTHER_ORDER_NO, TOKEN, order, response } from './fixtures'

afterEach(() => vi.unstubAllGlobals())

describe('cashier HTTP boundary', () => {
  it('uses a same-origin GET with header-only access and no cookies/cache/referrer/redirect', async () => {
    const fetcher = vi.fn().mockResolvedValue(response())
    vi.stubGlobal('fetch', fetcher)
    const signal = new AbortController().signal
    const result = await getCashierOrder(
      { orderNo: ORDER_NO, token: TOKEN, expiresAt: Date.now() + 10000 },
      signal
    )
    expect(result).toEqual(order)
    expect(fetcher).toHaveBeenCalledWith(`/api/partner/checkout/${ORDER_NO}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      signal,
    })
  })

  it.each([401, 403, 404, 410, 429, 500, 503])(
    'keeps HTTP %s local, without following a login/refresh flow',
    async (status) => {
      const fetcher = vi
        .fn()
        .mockResolvedValue(response({ error: 'secret-error-payload' }, status))
      vi.stubGlobal('fetch', fetcher)
      const promise = getCashierOrder(
        { orderNo: ORDER_NO, token: TOKEN, expiresAt: Date.now() + 10000 },
        new AbortController().signal
      )
      let kind = 'retry'
      if ([401, 403, 404].includes(status)) kind = 'invalid'
      if (status === 410) kind = 'expired'
      await expect(promise).rejects.toMatchObject({
        kind,
        message: 'Cashier request unavailable',
      })
      expect(fetcher).toHaveBeenCalledTimes(1)
    }
  )
})

describe('strict public order decoding', () => {
  it('accepts the backend plain DTO without an envelope', () => {
    expect(decodeCashierOrder(order, ORDER_NO)).toEqual(order)
  })
  it.each([
    { data: order },
    { ...order, amount: 9.99 },
    { ...order, amount: 'NaN' },
    { ...order, currency: 'USD' },
    { ...order, payment_status: 'success' },
    { ...order, fulfillment_status: 'unknown' },
    { ...order, created_at: -1 },
    { ...order, external_user_id: 'private-buyer' },
    { ...order, api_key: 'private-key' },
    { ...order, expires_at: order.created_at },
    { ...order, fulfillment_status: 'fulfilled' },
    { ...order, qr_code: 'x'.repeat(8193) },
    null,
  ])(
    'rejects malformed, private or inconsistent DTOs without retaining their data',
    (value) => {
      expect(() => decodeCashierOrder(value, ORDER_NO)).toThrow(
        'Cashier request unavailable'
      )
    }
  )
  it('rejects an otherwise valid response for another order', () => {
    expect(() => decodeCashierOrder(order, OTHER_ORDER_NO)).toThrow()
  })
})

describe('safe payment URLs', () => {
  it.each([
    'http://gateway.example/pay',
    'javascript:alert(1)',
    'data:text/html,bad',
    '//gateway.example/pay',
    'https://user:password@gateway.example/pay',
    'https://gateway.example/\\evil',
    ' https://gateway.example/pay',
    'https://gateway.example/\nattack',
    'not a url',
  ])('refuses unsafe link %s', (url) => {
    expect(safePaymentUrl(url)).toBeUndefined()
  })
  it('allows HTTPS payment links without userinfo', () => {
    expect(safePaymentUrl('https://gateway.example/pay?id=123')).toBe(
      'https://gateway.example/pay?id=123'
    )
  })
})
