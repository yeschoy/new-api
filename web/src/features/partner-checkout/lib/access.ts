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
const STORAGE_PREFIX = 'partner-checkout:v1:'
const MAX_ACCESS_MS = 30 * 60 * 1000
const TOKEN_PATTERN = /^pc_[a-f0-9]{64}$/
export const ORDER_PATTERN = /^PTO[A-Za-z0-9]{32}$/

export interface CashierAccess {
  orderNo: string
  token: string
  expiresAt: number
}

// Memory fallback permits checkout when sessionStorage is unavailable. Never use
// router state, query caches or localStorage for this order-only capability.
let memoryAccess: CashierAccess | null = null

export function isPartnerCheckoutPath(pathname: string): boolean {
  return pathname === '/partner/checkout' || pathname === '/partner/checkout/'
}

export function forgetCashierAccess(orderNo: string): void {
  if (memoryAccess?.orderNo === orderNo) memoryAccess = null
  try {
    sessionStorage.removeItem(STORAGE_PREFIX + orderNo)
  } catch {
    // Storage may be blocked.
  }
}

export function saveCashierAccess(access: CashierAccess): void {
  memoryAccess = access
  try {
    sessionStorage.setItem(
      STORAGE_PREFIX + access.orderNo,
      JSON.stringify(access)
    )
  } catch {
    // Keep the in-memory access for this page only.
  }
}

export function readCashierAccess(orderNo: string): CashierAccess | null {
  if (!ORDER_PATTERN.test(orderNo)) return null
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + orderNo)
    const value: unknown = raw ? JSON.parse(raw) : memoryAccess
    if (
      typeof value === 'object' &&
      value !== null &&
      'orderNo' in value &&
      value.orderNo === orderNo &&
      'token' in value &&
      typeof value.token === 'string' &&
      TOKEN_PATTERN.test(value.token) &&
      'expiresAt' in value &&
      typeof value.expiresAt === 'number' &&
      Number.isFinite(value.expiresAt) &&
      value.expiresAt > Date.now() &&
      value.expiresAt <= Date.now() + MAX_ACCESS_MS
    ) {
      return { orderNo, token: value.token, expiresAt: value.expiresAt }
    }
  } catch {
    if (
      memoryAccess?.orderNo === orderNo &&
      memoryAccess.expiresAt > Date.now()
    ) {
      return memoryAccess
    }
  }
  forgetCashierAccess(orderNo)
  return null
}

// Called BEFORE createRouter: the capability must never enter router history,
// devtools, login bootstrap, status requests or generic root effects.
export function prepareCashierEntry(): void {
  if (!isPartnerCheckoutPath(window.location.pathname)) return
  const params = new URLSearchParams(window.location.search)
  const orderNo = params.get('order_no') || ''
  const fragment = window.location.hash
  const tokens = new URLSearchParams(fragment.slice(1)).getAll('token')
  if (fragment) {
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search
    )
    if (ORDER_PATTERN.test(orderNo)) {
      forgetCashierAccess(orderNo)
      if (
        params.getAll('order_no').length === 1 &&
        tokens.length === 1 &&
        TOKEN_PATTERN.test(tokens[0])
      ) {
        saveCashierAccess({
          orderNo,
          token: tokens[0],
          expiresAt: Date.now() + MAX_ACCESS_MS,
        })
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
