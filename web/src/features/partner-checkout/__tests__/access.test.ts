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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  forgetCashierAccess,
  isPartnerCheckoutPath,
  prepareCashierEntry,
  readCashierAccess,
  saveCashierAccess,
} from '../lib/access'
import { NOW, ORDER_NO, OTHER_ORDER_NO, TOKEN } from './fixtures'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  sessionStorage.clear()
  forgetCashierAccess(ORDER_NO)
  forgetCashierAccess(OTHER_ORDER_NO)
})
afterEach(() => {
  forgetCashierAccess(ORDER_NO)
  forgetCashierAccess(OTHER_ORDER_NO)
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.useRealTimers()
})

describe('order-only cashier access', () => {
  it.each([
    '/partner/checkout',
    '/partner/checkout/',
    '/partner/%63heckout',
    '/%70artner/checkout',
    '/partner%2Fcheckout',
    '/partner/%63heckout%2f',
  ])(
    'canonicalizes and scrubs cashier entry %s before router creation',
    (pathname) => {
      window.history.replaceState(
        null,
        '',
        `${pathname}?order_no=${ORDER_NO}&extra=a%2Fb#token=${TOKEN}`
      )
      expect(isPartnerCheckoutPath(window.location.pathname)).toBe(true)
      prepareCashierEntry()
      expect(window.location.pathname).toBe('/partner/checkout')
      expect(window.location.search).toBe(`?order_no=${ORDER_NO}&extra=a%2Fb`)
      expect(window.location.hash).toBe('')
      expect(readCashierAccess(ORDER_NO)?.token).toBe(TOKEN)
      expect(
        JSON.parse(
          sessionStorage.getItem(`partner-checkout:v1:${ORDER_NO}`) || '{}'
        ).token
      ).toBe(TOKEN)
    }
  )

  it('canonicalizes a static-host alias on reload without discarding stored access', () => {
    saveCashierAccess({
      orderNo: ORDER_NO,
      token: TOKEN,
      expiresAt: NOW + 10000,
    })
    window.history.replaceState(
      null,
      '',
      `/partner/%63heckout?order_no=${ORDER_NO}`
    )
    prepareCashierEntry()
    expect(window.location.pathname).toBe('/partner/checkout')
    expect(window.location.hash).toBe('')
    expect(readCashierAccess(ORDER_NO)?.token).toBe(TOKEN)
  })

  it.each([
    '/partner/checkout-other',
    '/partner/checkout/child',
    '/partner/%2563heckout',
    '/partner/%',
    '/partner/%FFcheckout',
    '/other',
  ])('does not reinterpret unrelated or malformed entry %s', (pathname) => {
    window.history.replaceState(
      null,
      '',
      `${pathname}?order_no=${ORDER_NO}#token=${TOKEN}`
    )
    expect(isPartnerCheckoutPath(window.location.pathname)).toBe(false)
    expect(() => prepareCashierEntry()).not.toThrow()
    expect(window.location.pathname).toBe(pathname)
    expect(window.location.hash).toBe(`#token=${TOKEN}`)
    expect(readCashierAccess(ORDER_NO)).toBeNull()
  })

  it('scrubs the fragment before generic code and recovers access on same-tab reload', async () => {
    const localWrite = vi.spyOn(Storage.prototype, 'setItem')
    window.history.replaceState(
      null,
      '',
      `/partner/checkout?order_no=${ORDER_NO}#token=${TOKEN}`
    )
    prepareCashierEntry()
    expect(window.location.hash).toBe('')
    expect(window.location.href).not.toContain(TOKEN)
    expect(document.querySelector('meta[name="referrer"]')).toHaveAttribute(
      'content',
      'no-referrer'
    )
    expect(localWrite).toHaveBeenCalledTimes(1)
    expect(localWrite.mock.instances[0]).toBe(sessionStorage)
    vi.resetModules()
    const reloaded = await import('../lib/access')
    reloaded.prepareCashierEntry()
    expect(reloaded.readCashierAccess(ORDER_NO)?.token).toBe(TOKEN)
    expect(reloaded.readCashierAccess(OTHER_ORDER_NO)).toBeNull()
  })

  it.each(['pt_secret', 'pc_short', `${TOKEN}&token=${TOKEN}`])(
    'scrubs and refuses malformed or duplicate fragment %s',
    (token) => {
      window.history.replaceState(
        null,
        '',
        `/partner/checkout?order_no=${ORDER_NO}#token=${token}`
      )
      prepareCashierEntry()
      expect(window.location.hash).toBe('')
      expect(readCashierAccess(ORDER_NO)).toBeNull()
    }
  )

  it('does not accept a token in the query or another order’s stored access', () => {
    window.history.replaceState(
      null,
      '',
      `/partner/checkout?order_no=${ORDER_NO}&token=${TOKEN}`
    )
    prepareCashierEntry()
    expect(readCashierAccess(ORDER_NO)).toBeNull()
    saveCashierAccess({
      orderNo: OTHER_ORDER_NO,
      token: TOKEN,
      expiresAt: NOW + 10000,
    })
    expect(readCashierAccess(ORDER_NO)).toBeNull()
  })

  it('forgets expired access rather than reusing it on reload', () => {
    saveCashierAccess({
      orderNo: ORDER_NO,
      token: TOKEN,
      expiresAt: NOW + 1000,
    })
    vi.setSystemTime(NOW + 1001)
    expect(readCashierAccess(ORDER_NO)).toBeNull()
    expect(sessionStorage.length).toBe(0)
  })

  it('fails safely on corrupt storage and still supports blocked storage in memory', () => {
    sessionStorage.setItem(`partner-checkout:v1:${ORDER_NO}`, '{broken')
    expect(readCashierAccess(ORDER_NO)).toBeNull()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    saveCashierAccess({
      orderNo: ORDER_NO,
      token: TOKEN,
      expiresAt: NOW + 1000,
    })
    expect(readCashierAccess(ORDER_NO)?.token).toBe(TOKEN)
  })
})
