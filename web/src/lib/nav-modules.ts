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

/** Sections an administrator can switch off in the header-navigation setting (`HeaderNavModules`). */
export type NavModule = 'home' | 'console' | 'pricing' | 'rankings' | 'docs' | 'about'

/** Reads a switch the way middleware/header_nav.go does; anything else keeps the fallback. */
function asSwitch(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
    return fallback
  }
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase()
    if (text === 'true' || text === '1') return true
    if (text === 'false' || text === '0') return false
  }
  return fallback
}

/**
 * Whether a section belongs in the navigation: shown unless the administrator
 * switched it off, and sections marked "sign-in required" only to signed-in
 * visitors. The backend rejects the same requests, so hidden links would only
 * lead to errors.
 */
export function showNavModule(raw: string | undefined, module: NavModule, signedIn: boolean): boolean {
  if (!raw?.trim()) return true
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return true
  }
  if (!parsed || typeof parsed !== 'object') return true
  const value = (parsed as Record<string, unknown>)[module]
  if (value && typeof value === 'object') {
    const access = value as { enabled?: unknown; requireAuth?: unknown }
    if (!asSwitch(access.enabled, true)) return false
    return signedIn || !asSwitch(access.requireAuth, false)
  }
  return asSwitch(value, true)
}
