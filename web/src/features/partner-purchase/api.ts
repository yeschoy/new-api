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

import { ORDER_PATTERN } from '@/features/partner-checkout/lib/access'

import {
  SESSION_PATTERN,
  type PurchaseAccess,
  type PurchaseDraft,
  type PurchaseEntry,
} from './lib/access'

const timestamp = z.number().int().positive().max(8640000000000)
const method = z.string().regex(/^[a-zA-Z0-9_-]{1,16}$/)
const orderSchema = z
  .object({
    order_no: z.string().regex(ORDER_PATTERN),
    plan_id: z.number().int().positive(),
    payment_method: method,
    payment_status: z.enum(['pending', 'paid', 'failed', 'expired']),
    fulfillment_status: z.enum([
      'not_ready',
      'pending',
      'fulfilled',
      'failed_retryable',
    ]),
    expires_at: timestamp,
    checkout_url: z.string().max(8192).optional(),
  })
  .strict()
  .refine(
    (order) =>
      order.payment_status === 'paid' ||
      order.fulfillment_status === 'not_ready'
  )
const planSchema = z
  .object({
    id: z.number().int().positive(),
    title: z.string().min(1).max(1024),
    subtitle: z.string().max(4096),
    amount: z
      .string()
      .regex(/^(0|[1-9]\d{0,12})\.\d{2}$/)
      .refine((value) => value !== '0.00'),
    currency: z.literal('CNY'),
    duration_unit: z.literal('month'),
    duration_value: z.literal(1),
    // Canonical decimal digits permit exact length/lexical int64 validation;
    // never pass quota through Number (even when only rendering it).
    total_amount: z
      .string()
      .regex(/^(0|[1-9]\d{0,18})$/)
      .refine(
        (value) =>
          value === value.trim() &&
          (value.length < 19 || value <= '9223372036854775807')
      ),
    quota_unlimited: z.boolean(),
    requests_per_minute: z.number().int().nonnegative(),
  })
  .strict()
  .refine((plan) => plan.quota_unlimited === (plan.total_amount === '0'))
const catalogSchema = z
  .object({
    session_id: z.string().regex(SESSION_PATTERN),
    expires_at: timestamp,
    merchant_name: z.string().max(1024),
    plans: z.array(planSchema),
    payment_methods: z.array(
      z.object({ id: method, name: z.string().min(1).max(1024) }).strict()
    ),
    order: orderSchema.nullable(),
  })
  .strict()
  .refine(
    (catalog) =>
      new Set(catalog.plans.map((plan) => plan.id)).size ===
      catalog.plans.length
  )
  .refine(
    (catalog) =>
      new Set(catalog.payment_methods.map((item) => item.id)).size ===
      catalog.payment_methods.length
  )
const exchangeSchema = z
  .object({
    session_id: z.string().regex(SESSION_PATTERN),
    expires_at: timestamp,
    access_token: z.string().regex(/^ps_[a-f0-9]{64}$/),
  })
  .strict()
const createdSchema = z
  .object({
    order_no: z.string().regex(ORDER_PATTERN),
    checkout_url: z.string().max(8192),
  })
  .strict()
const errorSchema = z
  .object({
    error: z.object({ code: z.string(), message: z.string() }).strict(),
    request_id: z.string(),
  })
  .strict()
export type PurchaseCatalog = z.infer<typeof catalogSchema>
export type PurchaseErrorKind =
  | 'invalid'
  | 'expired'
  | 'conflict'
  | 'unavailable'
  | 'retry'
export class PurchaseError extends Error {
  constructor(public readonly kind: PurchaseErrorKind) {
    super('Purchase request unavailable')
  }
}

// Validate the ORIGINAL absolute URL, not a normalized attacker-controlled URL.
// Only the canonical same-origin cashier and exact order/token pair is allowed.
export function safeCheckoutUrl(
  raw: string,
  orderNo: string
): string | undefined {
  if (
    !ORDER_PATTERN.test(orderNo) ||
    [...raw].some(
      (character) =>
        character.charCodeAt(0) <= 32 ||
        character.charCodeAt(0) === 127 ||
        /\s/.test(character) ||
        character === '\\'
    )
  ) {
    return undefined
  }
  try {
    const url = new URL(raw)
    const expected = `${window.location.origin}/partner/checkout?order_no=${orderNo}#token=`
    if (
      url.origin !== window.location.origin ||
      url.username ||
      url.password ||
      url.pathname !== '/partner/checkout' ||
      !raw.startsWith(expected) ||
      !/^pc_[a-f0-9]{64}$/.test(raw.slice(expected.length))
    ) {
      return undefined
    }
    return raw
  } catch {
    return undefined
  }
}
function validExpiry(expiresAt: number): void {
  if (expiresAt * 1000 <= Date.now()) throw new PurchaseError('expired')
  if (expiresAt * 1000 > Date.now() + 30 * 60 * 1000) {
    throw new PurchaseError('retry')
  }
}
export function decodePurchaseCatalog(
  value: unknown,
  sessionId: string
): PurchaseCatalog {
  const parsed = catalogSchema.safeParse(value)
  if (!parsed.success || parsed.data.session_id !== sessionId) {
    throw new PurchaseError('retry')
  }
  validExpiry(parsed.data.expires_at)
  const order = parsed.data.order
  if (
    order?.checkout_url &&
    !safeCheckoutUrl(order.checkout_url, order.order_no)
  ) {
    throw new PurchaseError('retry')
  }
  return parsed.data
}
async function request(
  sessionId: string,
  suffix: string,
  signal: AbortSignal,
  token?: string,
  body?: unknown
): Promise<unknown> {
  if (!SESSION_PATTERN.test(sessionId)) throw new PurchaseError('invalid')
  try {
    const response = await fetch(
      `/api/partner/purchase-sessions/${sessionId}${suffix}`,
      {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        signal,
      }
    )
    if ([401, 403].includes(response.status)) throw new PurchaseError('invalid')
    if (response.status === 410) throw new PurchaseError('expired')
    if (!response.ok) {
      const error = errorSchema.safeParse(
        await response.json().catch(() => null)
      )
      if (error.success && error.data.error.code === 'idempotency_conflict') {
        throw new PurchaseError('conflict')
      }
      if ([400, 404, 409].includes(response.status)) {
        throw new PurchaseError('unavailable')
      }
      throw new PurchaseError('retry')
    }
    return await response.json()
  } catch (error) {
    if (error instanceof PurchaseError) throw error
    // Do not retain raw JSON parse errors, response bodies or request options.
    throw new PurchaseError('retry')
  }
}
export async function exchangePurchase(
  entry: Extract<PurchaseEntry, { kind: 'launch' }>,
  signal: AbortSignal
): Promise<PurchaseAccess> {
  const result = exchangeSchema.safeParse(
    await request(entry.sessionId, '/exchange', signal, undefined, {
      launch_code: entry.launchCode,
      client_nonce: entry.nonce,
    })
  )
  if (!result.success || result.data.session_id !== entry.sessionId) {
    throw new PurchaseError('retry')
  }
  validExpiry(result.data.expires_at)
  return {
    kind: 'access',
    sessionId: entry.sessionId,
    token: result.data.access_token,
    expiresAt: result.data.expires_at * 1000,
  }
}
export async function getPurchaseCatalog(
  access: PurchaseAccess,
  signal: AbortSignal
): Promise<PurchaseCatalog> {
  if (access.expiresAt <= Date.now()) throw new PurchaseError('expired')
  return decodePurchaseCatalog(
    await request(access.sessionId, '', signal, access.token),
    access.sessionId
  )
}
export async function createPurchaseOrder(
  access: PurchaseAccess,
  draft: PurchaseDraft,
  signal: AbortSignal
): Promise<string> {
  if (access.expiresAt <= Date.now()) throw new PurchaseError('expired')
  const result = createdSchema.safeParse(
    await request(access.sessionId, '/orders', signal, access.token, draft)
  )
  if (!result.success) throw new PurchaseError('retry')
  const url = safeCheckoutUrl(result.data.checkout_url, result.data.order_no)
  if (!url) throw new PurchaseError('retry')
  return url
}
