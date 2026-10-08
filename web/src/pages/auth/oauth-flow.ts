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

/** Full-page navigations, on one object so tests can stand in for them. */
export const browser = {
  assign(url: string) {
    window.location.assign(url)
  },
  replace(url: string) {
    window.location.replace(url)
  },
}

const REDIRECT_KEY = 'oauth_sign_in_redirect'

/** Keeps the page to open after a third-party sign-in across the round trip to the provider. */
export function rememberSignInRedirect(path: string) {
  try {
    window.sessionStorage.setItem(REDIRECT_KEY, path)
  } catch {
    // Without storage the visitor lands on the default page.
  }
}

/** The page remembered before leaving for the provider, read once. */
export function takeSignInRedirect(): string | null {
  try {
    const path = window.sessionStorage.getItem(REDIRECT_KEY)
    window.sessionStorage.removeItem(REDIRECT_KEY)
    return path
  } catch {
    return null
  }
}

// ── Binding popups ────────────────────────────────────────────────────────
// A binding runs in a popup the security page opens; the provider sends that
// popup back to /oauth/:provider, which hands the code to the page through
// these messages (and the Go bridge page at /oauth/handoff posts the last two).

export const BIND_CALLBACK = 'oauth:binding:callback'
export const BIND_RESULT = 'oauth:binding:result'
export const BIND_HANDOFF = 'oauth:binding:handoff'
export const BIND_RETURN = 'oauth:binding:return'
export const TELEGRAM_BIND_RESULT = 'telegram:binding:result'

type StampStorage = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void }

const BIND_STAMP = 'oauth_bind_flow:'

/** A window's sessionStorage, or null where privacy settings forbid it. */
export function storageOf(owner: { sessionStorage: StampStorage } | null | undefined): StampStorage | null {
  try {
    return owner?.sessionStorage ?? null
  } catch {
    return null
  }
}

/**
 * Stamps a freshly opened (still same-origin) popup as a binding for this
 * provider and state, before it leaves for the provider.
 */
export function markBindPopup(storage: StampStorage | null, provider: string, state: string): boolean {
  if (!storage || !provider || !state) return false
  try {
    storage.setItem(BIND_STAMP + provider, state)
    return storage.getItem(BIND_STAMP + provider) === state
  } catch {
    return false
  }
}

/**
 * A callback is a binding only with our stamp for this provider and state and
 * a live opener to report to; anything else is a sign-in, which recovers on
 * its own (an opener alone proves nothing: any link opened in a new tab has one).
 */
export function callbackMode(
  provider: string,
  state: string,
  context: { opener: { closed: boolean } | null | undefined; storage: StampStorage | null }
): 'login' | 'bind' {
  if (!context.opener || context.opener.closed || !context.storage || !state) return 'login'
  try {
    return context.storage.getItem(BIND_STAMP + provider) === state ? 'bind' : 'login'
  } catch {
    return 'login'
  }
}

// ── Custom domains (controller/domain_oauth_handoff.go) ───────────────────

const PROVIDER_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/
const BIND_RESULTS = new Set(['cancelled', 'failed', 'target_unavailable'])

/** A plain https origin (no path, query, hash or credentials), or null. */
function httpsOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    const plain = url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash
    return plain ? url.origin : null
  } catch {
    return null
  }
}

function handoffUrl(origin: string, query: Record<string, string>, hash: Record<string, string>): string {
  const url = new URL('/oauth/handoff', origin)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value)
  url.hash = new URLSearchParams(hash).toString()
  return url.toString()
}

/**
 * Where to send the browser when a callback belongs to a custom domain: the
 * domain's own /oauth/handoff bridge (or its sign-in page after a failure).
 */
export function handoffTarget(data: unknown, success: boolean): string | null {
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  const origin = httpsOrigin(record.target_origin)
  if (!origin) return null
  const ticket = typeof record.ticket === 'string' && record.ticket.trim() ? record.ticket : ''
  const provider = typeof record.provider === 'string' && PROVIDER_PATTERN.test(record.provider) ? record.provider : ''
  switch (record.action) {
    case 'domain_bind_handoff':
      return success && provider && ticket ? handoffUrl(origin, { mode: 'bind', provider }, { ticket }) : null
    case 'domain_bind_return':
      return provider && BIND_RESULTS.has(String(record.result)) ? handoffUrl(origin, { mode: 'bind-return', provider }, { result: String(record.result) }) : null
    case 'domain_login_handoff':
      return success && ticket ? handoffUrl(origin, {}, { ticket }) : null
    case 'domain_oauth_return':
      return new URL('/sign-in', origin).toString()
    default:
      return null
  }
}

export function isBindReturnResult(value: unknown): boolean {
  return typeof value === 'string' && BIND_RESULTS.has(value)
}
