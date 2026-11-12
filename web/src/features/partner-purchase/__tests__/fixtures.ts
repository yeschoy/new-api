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
import type { PurchaseCatalog } from '../api'
import type { PurchaseAccess } from '../lib/access'

export const SESSION_ID = `PPS${'s'.repeat(32)}`
export const LAUNCH = `pl_${'a'.repeat(64)}`
export const ACCESS = `ps_${'b'.repeat(64)}`
export const ORDER_NO = `PTO${'o'.repeat(32)}`
export const CHECKOUT = `${window.location.origin}/partner/checkout?order_no=${ORDER_NO}#token=pc_${'c'.repeat(64)}`
export function access(): PurchaseAccess {
  return {
    kind: 'access',
    sessionId: SESSION_ID,
    token: ACCESS,
    expiresAt: Date.now() + 300000,
  }
}
export function catalog(): PurchaseCatalog {
  return {
    session_id: SESSION_ID,
    expires_at: Math.floor(Date.now() / 1000) + 300,
    merchant_name: 'Merchant with a very long name '.repeat(5),
    plans: [
      {
        id: 42,
        title: 'Monthly plan '.repeat(20),
        subtitle: '<script>not HTML</script>',
        amount: '19.99',
        currency: 'CNY',
        duration_unit: 'month',
        duration_value: 1,
        total_amount: '1234567',
        quota_unlimited: false,
        requests_per_minute: 60,
      },
      {
        id: 43,
        title: 'Unlimited plan',
        subtitle: '',
        amount: '99.00',
        currency: 'CNY',
        duration_unit: 'month',
        duration_value: 1,
        total_amount: '0',
        quota_unlimited: true,
        requests_per_minute: 0,
      },
    ],
    payment_methods: [
      { id: 'alipay', name: 'Alipay' },
      { id: 'wxpay', name: 'WeChat Pay' },
    ],
    order: null,
  }
}
export function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}
export const aliases = [
  '/partner/purchase',
  '/partner/purchase/',
  '/partner/%70urchase',
  '/%70artner/purchase',
  '/partner%2Fpurchase',
  '/partner/%70urchase%2f',
]
export const negatives = [
  '/',
  '/sign-in',
  '/partner/purchase-other',
  '/partner/purchase/child',
  '/partner/%2570urchase',
  '/partner/%',
  '/partner/%FFpurchase',
]
