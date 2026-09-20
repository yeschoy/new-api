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
/**
 * Application-wide constants
 */

// System Configuration Defaults
export const DEFAULT_SYSTEM_NAME = 'New API'
export const DEFAULT_LOGO = '/brand-mark.svg'

/** Logo paths shipped by earlier releases; they map onto the current mark. */
const LEGACY_DEFAULT_LOGOS = new Set([
  'logo.png',
  '/logo.png',
  'yecai-logo.svg',
  '/yecai-logo.svg',
  'yecai-logo-mascot.svg',
  '/yecai-logo-mascot.svg',
])

/**
 * Preserve the protected project default and operator-defined names.
 */
export function resolveSystemName(name?: string | null): string {
  const normalized = name?.trim()

  return normalized || DEFAULT_SYSTEM_NAME
}

/** Resolve the selected default logo while accepting operator overrides. */
export function resolveLogoUrl(logo?: string | null): string {
  const normalized = logo?.trim()

  if (!normalized || LEGACY_DEFAULT_LOGOS.has(normalized)) {
    return DEFAULT_LOGO
  }

  return normalized
}

// LocalStorage Keys
export const STORAGE_KEYS = {
  SYSTEM_NAME: 'system_name',
  LOGO: 'logo',
  FOOTER_HTML: 'footer_html',
} as const
