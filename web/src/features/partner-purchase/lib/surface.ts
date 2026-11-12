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
// Keep the early document policy in index.html aligned with this bounded decode.
export function partnerPublicSurface(
  pathname: string
): 'checkout' | 'purchase' | null {
  try {
    const decoded = decodeURIComponent(pathname)
    if (/^\/partner\/checkout\/?$/.test(decoded)) return 'checkout'
    if (/^\/partner\/purchase\/?$/.test(decoded)) return 'purchase'
  } catch {
    // Malformed paths are not public capability surfaces. Never decode twice.
  }
  return null
}

export function isPartnerPublicPath(pathname: string): boolean {
  return partnerPublicSurface(pathname) !== null
}

export function isPartnerPurchasePath(pathname: string): boolean {
  return partnerPublicSurface(pathname) === 'purchase'
}
