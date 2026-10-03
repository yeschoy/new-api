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
import { browser, paymentFailure, runCheckout } from '../checkout'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('payment replies', () => {
  it('accepts both success shapes the payment endpoints use', () => {
    expect(paymentFailure({ message: 'success', data: '9.90' }, 'fallback')).toBeNull()
    expect(paymentFailure({ success: true, message: '', data: null }, 'fallback')).toBeNull()
  })

  it('reads the reason from data when the message is just "error"', () => {
    expect(paymentFailure({ message: 'error', data: '充值数量不能小于 5' }, 'fallback')).toBe('充值数量不能小于 5')
  })

  it('reads the reason from the message of a standard or Stripe failure', () => {
    expect(paymentFailure({ success: false, message: '余额不足' }, 'fallback')).toBe('余额不足')
    expect(paymentFailure({ message: '充值数量不能大于 10000', data: 10 }, 'fallback')).toBe('充值数量不能大于 10000')
  })

  it('falls back when the reply says nothing useful', () => {
    expect(paymentFailure({ message: 'error' }, 'fallback')).toBe('fallback')
    expect(paymentFailure(undefined, 'fallback')).toBe('fallback')
  })
})

describe('opening the checkout', () => {
  it('posts the epay fields to the gateway in a new tab and removes the form', () => {
    const posted: Array<{ action: string; method: string; target: string; fields: Record<string, string> }> = []
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
      const fields = Object.fromEntries([...this.querySelectorAll('input')].map((input) => [input.name, input.value]))
      posted.push({ action: this.action, method: this.method, target: this.target, fields })
    })

    runCheckout({ kind: 'form', url: 'https://pay.example.com/submit.php', params: { pid: '1001', money: '10.00' } })

    expect(posted).toEqual([
      { action: 'https://pay.example.com/submit.php', method: 'post', target: '_blank', fields: { pid: '1001', money: '10.00' } },
    ])
    expect(document.querySelector('form')).toBeNull()
  })

  it('opens a hosted checkout in a new tab', () => {
    const open = vi.spyOn(browser, 'open').mockImplementation(() => true)
    runCheckout({ kind: 'open', url: 'https://checkout.stripe.com/c/pay/cs_1' })
    expect(open).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_1')
  })

  it('goes to the checkout in this tab when the browser blocks the new one', () => {
    vi.spyOn(browser, 'open').mockImplementation(() => false)
    const go = vi.spyOn(browser, 'go').mockImplementation(() => undefined)
    runCheckout({ kind: 'open', url: 'https://checkout.stripe.com/c/pay/cs_1' })
    expect(go).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_1')
  })

  it('refuses a checkout address that is not a web page', () => {
    const go = vi.spyOn(browser, 'go').mockImplementation(() => undefined)
    expect(() => runCheckout({ kind: 'redirect', url: 'javascript:alert(1)' })).toThrow()
    expect(go).not.toHaveBeenCalled()
  })
})
