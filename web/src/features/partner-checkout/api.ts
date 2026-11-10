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
import { z } from 'zod'

import { ORDER_PATTERN, type CashierAccess } from './lib/access'

const timestamp = z.number().int().positive().max(8640000000000)
const cashierSchema = z
  .object({
    order_no: z.string().regex(ORDER_PATTERN),
    plan_title: z.string().min(1).max(1024),
    amount: z
      .string()
      .regex(/^(0|[1-9]\d{0,12})\.\d{2}$/)
      .refine((value) => value !== '0.00'),
    currency: z.literal('CNY'),
    payment_method: z.string().regex(/^[a-zA-Z0-9_-]{1,16}$/),
    payment_status: z.enum(['pending', 'paid', 'failed', 'expired']),
    fulfillment_status: z.enum([
      'not_ready',
      'pending',
      'fulfilled',
      'failed_retryable',
    ]),
    created_at: timestamp,
    expires_at: timestamp,
    qr_code: z.string().max(8192).optional(),
    pay_url: z.string().max(8192).optional(),
  })
  .strict()
  .refine((order) => order.expires_at > order.created_at)
  .refine(
    (order) =>
      order.payment_status === 'paid' ||
      order.fulfillment_status === 'not_ready'
  )

export type CashierOrder = z.infer<typeof cashierSchema>
export type CashierErrorKind = 'invalid' | 'expired' | 'retry'

export class CashierError extends Error {
  constructor(public readonly kind: CashierErrorKind) {
    // Never attach response data, capability or request options to an error.
    super('Cashier request unavailable')
  }
}

export function safePaymentUrl(raw?: string): string | undefined {
  if (
    !raw ||
    raw !== raw.trim() ||
    [...raw].some(
      (character) => character.charCodeAt(0) <= 32 || character === '\\'
    )
  ) {
    return undefined
  }
  try {
    const url = new URL(raw)
    if (
      url.protocol === 'https:' &&
      url.hostname &&
      !url.username &&
      !url.password
    ) {
      return url.href
    }
  } catch {
    // Invalid gateway links are never clickable.
  }
  return undefined
}

export function decodeCashierOrder(
  value: unknown,
  orderNo: string
): CashierOrder {
  const result = cashierSchema.safeParse(value)
  if (!result.success || result.data.order_no !== orderNo) {
    throw new CashierError('retry')
  }
  return result.data
}

export async function getCashierOrder(
  access: CashierAccess,
  signal: AbortSignal
): Promise<CashierOrder> {
  if (access.expiresAt <= Date.now()) throw new CashierError('expired')
  // Deliberately independent of axios/auth interceptors and React Query caches.
  const response = await fetch(
    `/api/partner/checkout/${encodeURIComponent(access.orderNo)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${access.token}`,
        Accept: 'application/json',
      },
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      signal,
    }
  )
  if ([401, 403, 404].includes(response.status)) {
    throw new CashierError('invalid')
  }
  if (response.status === 410) throw new CashierError('expired')
  if (!response.ok) throw new CashierError('retry')
  return decodeCashierOrder(await response.json(), access.orderNo)
}
