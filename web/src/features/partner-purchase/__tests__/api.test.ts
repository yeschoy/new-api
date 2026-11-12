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

import quotaPlans from '../../../../../controller/testdata/partner_purchase_quota_plans.json'
import {
  createPurchaseOrder,
  decodePurchaseCatalog,
  exchangePurchase,
  getPurchaseCatalog,
  safeCheckoutUrl,
} from '../api'
import {
  access,
  ACCESS,
  catalog,
  CHECKOUT,
  LAUNCH,
  ORDER_NO,
  response,
  SESSION_ID,
} from './fixtures'

afterEach(() => vi.unstubAllGlobals())
describe('strict purchase API boundary', () => {
  it('exchanges only launch+stable nonce and uses the dedicated public fetch policy', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          session_id: SESSION_ID,
          expires_at: Math.floor(Date.now() / 1000) + 300,
          access_token: ACCESS,
        })
      )
      .mockResolvedValueOnce(response(catalog()))
      .mockResolvedValueOnce(
        response({ order_no: ORDER_NO, checkout_url: CHECKOUT }, 201)
      )
    vi.stubGlobal('fetch', fetcher)
    const signal = new AbortController().signal
    const value = await exchangePurchase(
      {
        kind: 'launch',
        sessionId: SESSION_ID,
        launchCode: LAUNCH,
        nonce: 'a'.repeat(64),
        expiresAt: Date.now() + 300000,
      },
      signal
    )
    expect(value.token).toBe(ACCESS)
    await getPurchaseCatalog(value, signal)
    expect(
      await createPurchaseOrder(
        value,
        { plan_id: 42, payment_method: 'alipay' },
        signal
      )
    ).toBe(CHECKOUT)
    for (const [url, options] of fetcher.mock.calls) {
      expect(url).toMatch(
        new RegExp(`^/api/partner/purchase-sessions/${SESSION_ID}`)
      )
      expect(url).not.toContain(ACCESS)
      expect(url).not.toContain(LAUNCH)
      expect(options).toMatchObject({
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        signal,
      })
    }
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBeUndefined()
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      launch_code: LAUNCH,
      client_nonce: 'a'.repeat(64),
    })
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe(
      `Bearer ${ACCESS}`
    )
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual({
      plan_id: 42,
      payment_method: 'alipay',
    })
  })
  it.each([
    (data: ReturnType<typeof catalog>) => ({ ...data, secret: 'forbidden' }),
    (data: ReturnType<typeof catalog>) => ({
      ...data,
      session_id: `PPS${'x'.repeat(32)}`,
    }),
    (data: ReturnType<typeof catalog>) => ({
      ...data,
      plans: [{ ...data.plans[0], currency: 'USD' }],
    }),
    (data: ReturnType<typeof catalog>) => ({
      ...data,
      plans: [{ ...data.plans[0], amount: 19.99 }],
    }),
    (data: ReturnType<typeof catalog>) => ({
      ...data,
      plans: [{ ...data.plans[0], amount: '19.999' }],
    }),
    (data: ReturnType<typeof catalog>) => ({
      ...data,
      plans: [{ ...data.plans[0], total_amount: Number.MAX_SAFE_INTEGER + 1 }],
    }),
    (data: ReturnType<typeof catalog>) => ({
      ...data,
      plans: [{ ...data.plans[0], quota_unlimited: true }],
    }),
    (data: ReturnType<typeof catalog>) => ({
      ...data,
      plans: [data.plans[0], data.plans[0]],
    }),
    (data: ReturnType<typeof catalog>) => ({
      ...data,
      expires_at: Math.floor(Date.now() / 1000) - 1,
    }),
  ])('rejects untrusted catalog shapes %#', (mutate) => {
    expect(() => decodePurchaseCatalog(mutate(catalog()), SESSION_ID)).toThrow()
  })
  it('decodes the exact backend-output fixture across the full signed int64 quota range', () => {
    const value = decodePurchaseCatalog(
      { ...catalog(), plans: quotaPlans },
      SESSION_ID
    )
    expect(value.plans.map((plan) => plan.total_amount)).toEqual([
      '0',
      '9007199254740991',
      '9007199254740992',
      '9223372036854775807',
    ])
    expect(value.plans.map((plan) => plan.quota_unlimited)).toEqual([
      true,
      false,
      false,
      false,
    ])
  })
  it.each([
    null,
    0,
    9007199254740992,
    '',
    '-1',
    '-0',
    '+1',
    '00',
    '01',
    '1.0',
    '1e3',
    ' 1',
    '1 ',
    '1\n',
    'NaN',
    'Infinity',
    'bad',
    '9223372036854775808',
    '18446744073709551615',
    '999999999999999999999999999999999999',
  ])('rejects a noncanonical or out-of-range quota %j', (total_amount) => {
    const original = catalog()
    expect(() =>
      decodePurchaseCatalog(
        {
          ...original,
          plans: [{ ...original.plans[0], total_amount }],
        },
        SESSION_ID
      )
    ).toThrow()
  })
  it.each([
    ['0', false],
    ['1', true],
    ['9223372036854775807', true],
  ])(
    'rejects inconsistent unlimited metadata for quota %s',
    (total_amount, quota_unlimited) => {
      const original = catalog()
      expect(() =>
        decodePurchaseCatalog(
          {
            ...original,
            plans: [{ ...original.plans[0], total_amount, quota_unlimited }],
          },
          SESSION_ID
        )
      ).toThrow()
    }
  )
  it.each([
    CHECKOUT.replace('/partner/checkout', '/partner/%63heckout'),
    CHECKOUT.replace('/partner/checkout', '/partner/checkout/'),
    CHECKOUT.replace('/partner/checkout', '/x/../partner/checkout'),
    CHECKOUT.replace('/partner/checkout', '/partner\\checkout'),
    CHECKOUT.replace(window.location.origin, 'https://evil.example'),
    CHECKOUT.replace(
      window.location.origin,
      `http://user@${window.location.host}`
    ),
    CHECKOUT.replace(`order_no=${ORDER_NO}`, `order_no=${ORDER_NO}&extra=1`),
    CHECKOUT.replace('pc_', 'ps_'),
    `${CHECKOUT}\n`,
    `${CHECKOUT}&extra=1`,
    CHECKOUT.replace('/partner/checkout', '/partner/checkout-other'),
    CHECKOUT.slice(window.location.origin.length),
  ])('rejects noncanonical original checkout link %s', (url) => {
    expect(safeCheckoutUrl(url, ORDER_NO)).toBeUndefined()
  })
  it.each([
    [401, 'invalid'],
    [403, 'invalid'],
    [410, 'expired'],
    [409, 'conflict'],
    [503, 'retry'],
  ])(
    'maps HTTP %s without leaking raw response or capability',
    async (status, kind) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          response(
            {
              error: {
                code: status === 409 ? 'idempotency_conflict' : 'server_error',
                message: ACCESS,
              },
              request_id: 'test',
            },
            Number(status)
          )
        )
      )
      await expect(
        getPurchaseCatalog(access(), new AbortController().signal)
      ).rejects.toMatchObject({ kind, message: 'Purchase request unavailable' })
    }
  )
  it('does not send an expired capability', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await expect(
      getPurchaseCatalog(
        { ...access(), expiresAt: Date.now() - 1 },
        new AbortController().signal
      )
    ).rejects.toMatchObject({ kind: 'expired' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('does not expose malformed upstream JSON in its error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError(`secret response ${ACCESS}`)
        },
      })
    )
    await expect(
      getPurchaseCatalog(access(), new AbortController().signal)
    ).rejects.toMatchObject({
      kind: 'retry',
      message: 'Purchase request unavailable',
    })
  })
})
