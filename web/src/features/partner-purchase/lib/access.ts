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

import { isPartnerPurchasePath } from './surface'

export const SESSION_PATTERN = /^PPS[A-Za-z0-9]{32}$/
const PREFIX = 'partner-purchase:v1:'
const MAX_SESSION_MS = 30 * 60 * 1000
const draftSchema = z
  .object({
    plan_id: z.number().int().positive(),
    payment_method: z.string().regex(/^[a-zA-Z0-9_-]{1,16}$/),
  })
  .strict()
export type PurchaseDraft = z.infer<typeof draftSchema>
const entrySchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('launch'),
      sessionId: z.string().regex(SESSION_PATTERN),
      launchCode: z.string().regex(/^pl_[a-f0-9]{64}$/),
      nonce: z.string().regex(/^[a-f0-9]{64}$/),
      expiresAt: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('access'),
      sessionId: z.string().regex(SESSION_PATTERN),
      token: z.string().regex(/^ps_[a-f0-9]{64}$/),
      expiresAt: z.number().int().positive(),
    })
    .strict(),
])
export type PurchaseEntry = z.infer<typeof entrySchema>
export type PurchaseAccess = Extract<PurchaseEntry, { kind: 'access' }>
// No global auth, localStorage, router state or Query cache. Keys and memory are
// scoped to the session; a blocked-storage browser can continue in this document.
const memory = new Map<string, string>()
let storageUnavailable = false

function write(key: string, value: unknown): void {
  const raw = JSON.stringify(value)
  memory.set(key, raw)
  try {
    sessionStorage.setItem(key, raw)
  } catch {
    storageUnavailable = true
  }
}
function read(key: string): unknown {
  try {
    return JSON.parse(memory.get(key) ?? sessionStorage.getItem(key) ?? 'null')
  } catch {
    storageUnavailable = true
    try {
      return JSON.parse(memory.get(key) ?? 'null')
    } catch {
      return null
    }
  }
}
function remove(key: string): void {
  memory.delete(key)
  try {
    sessionStorage.removeItem(key)
  } catch {
    storageUnavailable = true
  }
}
export function purchaseStorageUnavailable(): boolean {
  return storageUnavailable
}

export function forgetPurchaseEntry(sessionId: string): void {
  remove(PREFIX + sessionId)
}
export function purchaseEntryExpired(sessionId: string): boolean {
  const result = entrySchema.safeParse(read(PREFIX + sessionId))
  return (
    result.success &&
    result.data.sessionId === sessionId &&
    result.data.expiresAt <= Date.now()
  )
}
export function readPurchaseEntry(sessionId: string): PurchaseEntry | null {
  if (!SESSION_PATTERN.test(sessionId)) return null
  const result = entrySchema.safeParse(read(PREFIX + sessionId))
  if (
    result.success &&
    result.data.sessionId === sessionId &&
    result.data.expiresAt > Date.now() &&
    result.data.expiresAt <= Date.now() + MAX_SESSION_MS
  ) {
    return result.data
  }
  forgetPurchaseEntry(sessionId)
  return null
}
export function savePurchaseAccess(access: PurchaseAccess): void {
  // Replaces the launch+nonce, which are no longer needed after exchange.
  write(PREFIX + access.sessionId, access)
}
export function readPurchaseDraft(sessionId: string): PurchaseDraft | null {
  const result = draftSchema.safeParse(read(`${PREFIX}${sessionId}:draft`))
  return result.success ? result.data : null
}
export function freezePurchaseDraft(
  sessionId: string,
  draft: PurchaseDraft
): PurchaseDraft {
  const original = readPurchaseDraft(sessionId)
  if (original) return original
  write(`${PREFIX}${sessionId}:draft`, draftSchema.parse(draft))
  return draft
}

// Must run before createRouter. A fragment always replaces access for THIS
// session (even an invalid fragment); it must never revive a previous purchase.
export function preparePurchaseEntry(): void {
  if (!isPartnerPurchasePath(window.location.pathname)) return
  const params = new URLSearchParams(window.location.search)
  const ids = params.getAll('session_id')
  const sessionId = ids[0] ?? ''
  const fragment = window.location.hash
  const previous = fragment ? readPurchaseEntry(sessionId) : null
  if (fragment || window.location.pathname !== '/partner/purchase') {
    window.history.replaceState(
      window.history.state,
      '',
      `/partner/purchase${window.location.search}`
    )
  }
  const validQuery =
    ids.length === 1 && params.size === 1 && SESSION_PATTERN.test(sessionId)
  if (!validQuery || fragment) {
    for (const id of ids) forgetPurchaseEntry(id)
  }
  if (validQuery && fragment) {
    const hash = new URLSearchParams(fragment.slice(1))
    const code = hash.get('launch') ?? ''
    if (
      hash.size === 1 &&
      hash.getAll('launch').length === 1 &&
      /^pl_[a-f0-9]{64}$/.test(code)
    ) {
      try {
        // Reopening an unconfirmed launch in the same tab is still the same
        // exchange attempt. Preserve its nonce and local deadline.
        if (previous?.kind === 'launch' && previous.launchCode === code) {
          write(PREFIX + sessionId, previous)
        } else {
          const nonce = Array.from(
            crypto.getRandomValues(new Uint8Array(32)),
            (byte) => byte.toString(16).padStart(2, '0')
          ).join('')
          write(PREFIX + sessionId, {
            kind: 'launch',
            sessionId,
            launchCode: code,
            nonce,
            expiresAt: Date.now() + 5 * 60 * 1000,
          })
        }
      } catch {
        // Without cryptographic randomness, fail closed. Never use Math.random.
      }
    }
  }
  let referrer = document.querySelector<HTMLMetaElement>(
    'meta[name="referrer"]'
  )
  if (!referrer) {
    referrer = document.createElement('meta')
    referrer.name = 'referrer'
    document.head.append(referrer)
  }
  referrer.content = 'no-referrer'
}
