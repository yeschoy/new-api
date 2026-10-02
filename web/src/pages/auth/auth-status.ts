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
import { useStatus } from '@/lib/queries'
import type { SiteStatus } from '@/lib/services'

/** An OAuth provider the administrator added (status.custom_oauth_providers). */
export type CustomOAuthProvider = {
  id: number
  name: string
  slug: string
  icon?: string
  client_id: string
  authorization_endpoint: string
  scopes?: string
}

/** The sign-in switches of /api/status (controller/misc.go GetStatus) beyond SiteStatus. */
export type AuthStatus = SiteStatus & {
  github_client_id?: string
  discord_oauth?: boolean
  discord_client_id?: string
  oidc_enabled?: boolean
  oidc_client_id?: string
  oidc_authorization_endpoint?: string
  oidc_display_name?: string
  linuxdo_oauth?: boolean
  linuxdo_client_id?: string
  telegram_oauth?: boolean
  telegram_bot_name?: string
  wechat_login?: boolean
  wechat_qrcode?: string
  passkey_login?: boolean
  turnstile_site_key?: string
  self_use_mode_enabled?: boolean
  checkin_enabled?: boolean
  custom_oauth_providers?: CustomOAuthProvider[]
}

export function useAuthStatus(): AuthStatus | undefined {
  return useStatus().data as AuthStatus | undefined
}
