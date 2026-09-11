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
import {
  useAuthStore,
  type AuthBundle,
  type AuthUser,
} from '@/stores/auth-store'

export function createTestAuthBundle(): AuthBundle {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  return {
    access_token: 'fixture-access-token',
    token_type: 'Bearer',
    access_expires_at: expiresAt,
    user: { id: 12, username: 'test-user', role: 1 },
    session: {
      sid: 'fixture-session',
      current: true,
      login_method: 'password',
      ip: '127.0.0.1',
      user_agent: 'test-browser',
      created_at: 1,
      last_active_at: 1,
      expires_at: expiresAt,
    },
  }
}

/** Establish a complete authenticated fixture without weakening setUser guards. */
export function setTestAuthUser(user: AuthUser | null): void {
  if (!user) {
    useAuthStore.getState().auth.reset()
    return
  }

  const bundle = createTestAuthBundle()
  useAuthStore.getState().auth.setBundle({
    ...bundle,
    user,
    session: {
      ...bundle.session,
      sid: `fixture-session-${user.id}`,
    },
  })
}
