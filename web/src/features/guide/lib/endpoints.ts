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
import type { AddressKind, RouteAddresses, RouteId } from '../types'

export const PATH_CHAT_COMPLETIONS = '/v1/chat/completions'

export const OFFICIAL_HOSTS = {
  mainland: 'https://yeschoy.com',
  global: 'https://api.yeschoy.com',
} as const

export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

export function normalizeOrigin(origin: string): string {
  const trimmed = stripTrailingSlash(origin.trim())
  if (!trimmed) return OFFICIAL_HOSTS.mainland
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

export function hostnameOf(origin: string): string {
  return normalizeOrigin(origin)
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .toLowerCase()
}

export function matchOfficialRoute(origin: string): RouteId {
  const host = hostnameOf(origin)
  if (host === 'yeschoy.com' || host === 'www.yeschoy.com') return 'mainland'
  if (host === 'api.yeschoy.com') return 'global'
  return 'current'
}

export function getRouteAddresses(
  routeId: RouteId,
  origin: string
): RouteAddresses {
  let host = normalizeOrigin(origin)
  if (routeId === 'mainland') {
    host = OFFICIAL_HOSTS.mainland
  } else if (routeId === 'global') {
    host = OFFICIAL_HOSTS.global
  }

  return {
    host,
    baseUrl: `${host}/v1`,
    path: PATH_CHAT_COMPLETIONS,
    fullUrl: `${host}${PATH_CHAT_COMPLETIONS}`,
  }
}

export function getAddressValue(
  addresses: RouteAddresses,
  kind: AddressKind
): string {
  return addresses[kind]
}

export function isDoubleV1(url: string): boolean {
  return /\/v1\/v1(\/|$)/.test(url.trim())
}

export function visibleRouteIds(origin: string): RouteId[] {
  if (matchOfficialRoute(origin) === 'current') {
    return ['current', 'mainland', 'global']
  }
  return ['mainland', 'global']
}
