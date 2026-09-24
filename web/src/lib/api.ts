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
import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'

import { authStore, isAuthBundle, type AuthBundle } from './auth-store'

/** Standard `{ success, message, data }` envelope used by every endpoint. */
export type ApiEnvelope<T> = {
  success: boolean
  message?: string
  code?: string
  data: T
}

type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean }

export const api = axios.create({
  withCredentials: true,
  headers: { 'Cache-Control': 'no-store' },
})

// Refresh uses its own client so it never re-enters the interceptors below.
const authClient = axios.create({ withCredentials: true })

let refreshing: Promise<boolean> | null = null

/**
 * Exchanges the httpOnly refresh cookie for a new access token.
 * Resolves true when signed in, false when the visitor is anonymous.
 */
export function refreshSession(): Promise<boolean> {
  if (refreshing) return refreshing
  const sid = authStore.get().session?.sid
  refreshing = authClient
    .post<ApiEnvelope<AuthBundle>>('/api/user/auth/refresh', undefined, {
      headers: sid ? { 'X-Auth-Session': sid } : undefined,
      validateStatus: () => true,
    })
    .then((response) => {
      if (response.data?.success && isAuthBundle(response.data.data)) {
        authStore.applyBundle(response.data.data)
        return true
      }
      authStore.clear()
      return false
    })
    .catch(() => {
      authStore.clear()
      return false
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

api.interceptors.request.use((config) => {
  const token = authStore.get().accessToken
  if (token) config.headers.set('Authorization', `Bearer ${token}`)
  return config
})

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as RetriableConfig | undefined
  const isAuthCall = config?.url?.startsWith('/api/user/auth/')
  if (
    error.response?.status === 401 &&
    config &&
    !config._retried &&
    !isAuthCall &&
    authStore.get().accessToken
  ) {
    config._retried = true
    if (await refreshSession()) return api(config)
  }
  return Promise.reject(error)
})

/** Pulls a user-facing message out of an axios error or envelope. */
export function errorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined
    return data?.message || error.message || fallback
  }
  if (error instanceof Error) return error.message || fallback
  return fallback
}
