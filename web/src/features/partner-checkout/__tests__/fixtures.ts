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
import type { CashierOrder } from '../api'

export const ORDER_NO = 'PTO1234567890abcdefghijklmnopqrstuv'
export const OTHER_ORDER_NO = 'PTOabcdefghijklmnopqrstuv1234567890'
export const TOKEN = `pc_${'a'.repeat(64)}`
export const NOW = 1800000000000
export const order: CashierOrder = {
  order_no: ORDER_NO,
  plan_title: 'Model subscription',
  amount: '9.99',
  currency: 'CNY',
  payment_method: 'alipay',
  payment_status: 'pending',
  fulfillment_status: 'not_ready',
  created_at: NOW / 1000,
  expires_at: NOW / 1000 + 1800,
  qr_code: 'https://gateway.example/qr/order',
  pay_url: 'https://gateway.example/pay/order',
}

export function response(value: unknown = order, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
