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
const DEVICE_SEED_STORAGE_KEY = 'new-api:device-seed:v1'
export const DEVICE_SIGNAL_HEADER = 'X-Device-Signal'

let cachedSignal: Promise<string | undefined> | undefined

const DEVICE_SIGNAL_POST_PATHS = new Set([
  '/api/user/login',
  '/api/user/login/2fa',
  '/api/user/register',
  '/api/user/passkey/login/finish',
  '/api/oauth/domain-handoff',
  '/api/oauth/domain-handoff-fallback',
  '/api/user/pay',
  '/api/user/stripe/pay',
  '/api/user/creem/pay',
  '/api/user/waffo/pay',
  '/api/user/waffo-pancake/pay',
])

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  )
}

function getOrCreateDeviceSeed(): string | undefined {
  try {
    const existing = window.localStorage.getItem(DEVICE_SEED_STORAGE_KEY)
    if (existing && /^[0-9a-f]{64}$/.test(existing)) return existing

    const bytes = new Uint8Array(32)
    window.crypto.getRandomValues(bytes)
    const seed = bytesToHex(bytes)
    window.localStorage.setItem(DEVICE_SEED_STORAGE_KEY, seed)
    return seed
  } catch {
    return undefined
  }
}

async function createDeviceSignal(): Promise<string | undefined> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    return undefined
  }
  const seed = getOrCreateDeviceSeed()
  if (!seed) return undefined

  const digest = await window.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(seed)
  )
  return `v1:${bytesToHex(new Uint8Array(digest))}`
}

export function getDeviceSignal(): Promise<string | undefined> {
  cachedSignal ??= createDeviceSignal().catch(() => undefined)
  return cachedSignal
}

export function shouldAttachDeviceSignal(
  method: string | undefined,
  url: string | undefined
): boolean {
  if (method?.toUpperCase() !== 'POST' || !url) return false
  return DEVICE_SIGNAL_POST_PATHS.has(url.split('?')[0])
}
