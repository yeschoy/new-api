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
import { api } from '@/lib/api'

export type OAuthClientScope = 'profile' | 'offline_access' | 'sessions'

export interface OAuthAuthorizationView {
  client_id: 'yeschoy-desktop'
  client_name: string
  scopes: OAuthClientScope[]
  expires_at: string
}

interface OAuthBrowserResponse<T> {
  success: boolean
  data?: T
  code?: string
  message?: string
}

export async function getOAuthAuthorizationRequest(
  requestToken: string
): Promise<OAuthAuthorizationView> {
  const response = await api.get<OAuthBrowserResponse<OAuthAuthorizationView>>(
    '/api/oauth/authorize/request',
    {
      params: { request: requestToken },
      skipBusinessError: true,
      skipErrorHandler: true,
    }
  )
  if (!response.data.success || !response.data.data) {
    throw new Error(
      response.data.message || 'This authorization request is unavailable'
    )
  }
  return response.data.data
}

export async function decideOAuthAuthorization(
  requestToken: string,
  decision: 'approve' | 'deny'
): Promise<{ redirect_to: string }> {
  const response = await api.post<
    OAuthBrowserResponse<{ redirect_to: string }>
  >(
    '/api/oauth/authorize/decision',
    { flow_token: requestToken, decision },
    { skipBusinessError: true, skipErrorHandler: true }
  )
  if (!response.data.success || !response.data.data?.redirect_to) {
    throw new Error(response.data.message || 'Could not complete authorization')
  }
  return response.data.data
}

export function validateOAuthLoopbackRedirect(raw: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  const port = Number(parsed.port)
  if (
    parsed.protocol !== 'http:' ||
    parsed.hostname !== '127.0.0.1' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.pathname !== '/oauth/callback' ||
    parsed.hash !== '' ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    parsed.port !== String(port) ||
    parsed.href !== raw
  ) {
    return null
  }
  const allowed = new Set(['code', 'error', 'error_description', 'state'])
  for (const key of parsed.searchParams.keys()) {
    if (!allowed.has(key)) return null
  }
  const codes = parsed.searchParams.getAll('code')
  const errors = parsed.searchParams.getAll('error')
  const states = parsed.searchParams.getAll('state')
  const descriptions = parsed.searchParams.getAll('error_description')
  if (
    states.length !== 1 ||
    states[0] === '' ||
    (codes.length === 1) === (errors.length === 1) ||
    codes.length > 1 ||
    errors.length > 1 ||
    descriptions.length > 1 ||
    (codes.length === 1 && (codes[0] === '' || descriptions.length !== 0)) ||
    (errors.length === 1 && errors[0] === '')
  ) {
    return null
  }
  return raw
}
