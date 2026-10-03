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

/**
 * Reply of the payment endpoints. Most answer `{ message: 'success', data }`
 * and fail with `{ message: 'error', data: reason }`; the rest use the standard
 * `{ success, message, data }` envelope.
 */
export type PaymentReply = { success?: boolean; message?: string; data?: unknown; url?: string }

/** How the provider's checkout opens once the server has created the order. */
export type CheckoutAction =
  /** Epay: the signed fields are posted to the gateway. */
  | { kind: 'form'; url: string; params: Record<string, unknown> }
  /** Hosted checkout (Stripe, Creem, Waffo) in a new tab. */
  | { kind: 'open'; url: string }
  /** Hosted checkout in this tab (Waffo Pancake). */
  | { kind: 'redirect'; url: string }

/** The reason a payment reply failed, or null when it succeeded. */
export function paymentFailure(body: PaymentReply | undefined, fallback: string): string | null {
  if (body?.success === true || body?.message === 'success') return null
  if (typeof body?.data === 'string' && body.data.trim()) return body.data
  if (body?.message && body.message !== 'error') return body.message
  return fallback
}

/** Navigation, kept in one place so tests can stand in for the browser. */
export const browser = {
  /** Opens a new tab; false when the browser blocked it. */
  open(url: string): boolean {
    const tab = window.open(url, '_blank')
    if (!tab) return false
    tab.opener = null
    return true
  },
  go(url: string) {
    window.location.assign(url)
  },
}

export function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

// Safari blocks a new tab opened after an await, so the form posts in place there.
function isSafari(): boolean {
  const agent = navigator.userAgent
  return agent.includes('Safari') && !agent.includes('Chrome')
}

function postForm(url: string, params: Record<string, unknown>) {
  const form = document.createElement('form')
  form.action = url
  form.method = 'POST'
  if (!isSafari()) form.target = '_blank'
  for (const [name, value] of Object.entries(params)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = String(value)
    form.appendChild(input)
  }
  document.body.appendChild(form)
  form.submit()
  form.remove()
}

/** Opens the provider's checkout; throws when the address it was given is not a web page. */
export function runCheckout(action: CheckoutAction) {
  if (!isWebUrl(action.url)) throw new Error(t('支付地址无效'))
  if (action.kind === 'form') {
    postForm(action.url, action.params)
    return
  }
  if (action.kind === 'redirect' || !browser.open(action.url)) browser.go(action.url)
}
