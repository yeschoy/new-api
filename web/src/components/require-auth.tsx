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
import { Navigate, useLocation } from 'react-router'

import { useAuth } from '@/lib/auth-store'

/**
 * Renders children only for signed-in visitors. While the session is being
 * restored it renders nothing; anonymous visitors go to /sign-in and come
 * back afterwards via ?redirect=.
 */
export function RequireAuth(props: { children: React.ReactNode }) {
  const auth = useAuth()
  const location = useLocation()
  if (auth.status === 'loading') return null
  if (auth.status === 'anonymous') {
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/sign-in?redirect=${redirect}`} replace />
  }
  return <>{props.children}</>
}
