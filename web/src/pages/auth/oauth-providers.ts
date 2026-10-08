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
import type { AuthStatus } from './auth-status'

/** A provider reached by sending the browser away and back to /oauth/:id. */
export type RedirectProvider = {
  /** The provider name the backend knows: github, discord, oidc, linuxdo or a custom slug. */
  id: string
  name: string
  custom: boolean
  /** Custom providers' row id, for their bindings. */
  customId?: number
  authorizeUrl: (state: string) => string
}

function withParams(base: string, params: Record<string, string>): string {
  const url = new URL(base)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return url.toString()
}

/** Every redirect provider the site switched on, in the old site's order; custom ones last. */
export function redirectProviders(status: AuthStatus | undefined, origin = window.location.origin): RedirectProvider[] {
  if (!status) return []
  const list: RedirectProvider[] = []
  const github = status.github_client_id
  if (status.github_oauth && github) {
    list.push({
      id: 'github',
      name: 'GitHub',
      custom: false,
      authorizeUrl: (state) => withParams('https://github.com/login/oauth/authorize', { client_id: github, state, scope: 'user:email' }),
    })
  }
  const discord = status.discord_client_id
  if (status.discord_oauth && discord) {
    list.push({
      id: 'discord',
      name: 'Discord',
      custom: false,
      authorizeUrl: (state) =>
        withParams('https://discord.com/oauth2/authorize', {
          client_id: discord,
          redirect_uri: `${origin}/oauth/discord`,
          response_type: 'code',
          scope: 'identify openid',
          state,
        }),
    })
  }
  const oidcEndpoint = status.oidc_authorization_endpoint
  const oidcClient = status.oidc_client_id
  if (status.oidc_enabled && oidcEndpoint && oidcClient) {
    list.push({
      id: 'oidc',
      name: status.oidc_display_name?.trim() || 'OIDC',
      custom: false,
      authorizeUrl: (state) =>
        withParams(oidcEndpoint, {
          client_id: oidcClient,
          redirect_uri: `${origin}/oauth/oidc`,
          response_type: 'code',
          scope: 'openid profile email',
          state,
        }),
    })
  }
  const linuxdo = status.linuxdo_client_id
  if (status.linuxdo_oauth && linuxdo) {
    list.push({
      id: 'linuxdo',
      name: 'LinuxDO',
      custom: false,
      authorizeUrl: (state) => withParams('https://connect.linux.do/oauth2/authorize', { response_type: 'code', client_id: linuxdo, state }),
    })
  }
  for (const provider of status.custom_oauth_providers ?? []) {
    if (!provider.authorization_endpoint || !provider.client_id) continue
    list.push({
      id: provider.slug,
      name: provider.name,
      custom: true,
      customId: provider.id,
      authorizeUrl: (state) =>
        withParams(provider.authorization_endpoint, {
          client_id: provider.client_id,
          redirect_uri: `${origin}/oauth/${provider.slug}`,
          response_type: 'code',
          state,
          ...(provider.scopes ? { scope: provider.scopes } : {}),
        }),
    })
  }
  return list
}

/** Whether any sign-in besides the password can be offered; passkeys only sign in, they never sign up. */
export function thirdPartyAvailable(status: AuthStatus | undefined, withPasskey: boolean): boolean {
  if (!status) return false
  return (
    redirectProviders(status).length > 0 ||
    Boolean(status.wechat_login) ||
    Boolean(status.telegram_oauth && status.telegram_bot_name) ||
    (withPasskey && Boolean(status.passkey_login))
  )
}

const BUILT_IN_NAMES: Record<string, string> = { github: 'GitHub', discord: 'Discord', linuxdo: 'LinuxDO', telegram: 'Telegram' }

/** The name to show for /oauth/:provider; WeChat is named by the caller in the visitor's language. */
export function providerName(id: string, status: AuthStatus | undefined): string {
  if (id === 'oidc') return status?.oidc_display_name?.trim() || 'OIDC'
  const custom = status?.custom_oauth_providers?.find((provider) => provider.slug === id)
  return custom?.name ?? BUILT_IN_NAMES[id] ?? id
}
