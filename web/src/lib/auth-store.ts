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
import { useSyncExternalStore } from 'react'

export type AuthUser = {
  id: number
  username: string
  display_name?: string
  role: number
  email?: string
  quota?: number
  used_quota?: number
  request_count?: number
  group?: string
}

export type LoginSession = {
  sid: string
  current: boolean
  login_method: string
  expires_at: number
}

/** Response body `data` of login / refresh / register-with-sign-in. */
export type AuthBundle = {
  user: AuthUser
  access_token: string
  token_type: string
  access_expires_at: number
  session: LoginSession
}

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export type AuthState = {
  status: AuthStatus
  user: AuthUser | null
  accessToken: string | null
  session: LoginSession | null
}

const ANONYMOUS: AuthState = {
  status: 'anonymous',
  user: null,
  accessToken: null,
  session: null,
}

let state: AuthState = { ...ANONYMOUS, status: 'loading' }
const listeners = new Set<() => void>()

function emit(next: AuthState) {
  state = next
  for (const listener of listeners) listener()
}

export const authStore = {
  get: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  applyBundle(bundle: AuthBundle) {
    emit({
      status: 'authenticated',
      user: bundle.user,
      accessToken: bundle.access_token,
      session: bundle.session,
    })
  },
  updateUser(user: AuthUser) {
    if (state.status !== 'authenticated') return
    emit({ ...state, user })
  },
  clear() {
    emit({ ...ANONYMOUS })
  },
}

export function isAuthBundle(value: unknown): value is AuthBundle {
  if (!value || typeof value !== 'object') return false
  const bundle = value as Record<string, unknown>
  const user = bundle.user as Record<string, unknown> | undefined
  const session = bundle.session as Record<string, unknown> | undefined
  return (
    typeof bundle.access_token === 'string' &&
    bundle.access_token.length > 0 &&
    typeof bundle.access_expires_at === 'number' &&
    !!user &&
    typeof user.id === 'number' &&
    typeof user.username === 'string' &&
    !!session &&
    typeof session.sid === 'string'
  )
}

export function useAuth(): AuthState {
  return useSyncExternalStore(authStore.subscribe, authStore.get, authStore.get)
}
