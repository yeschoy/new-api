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
import { t } from '@/i18n/i18n'
import { api, type ApiEnvelope } from '@/lib/api'
import { unwrap } from '@/lib/console-api'

/** controller/custom_oauth.go GetUserOAuthBindings. */
export type OAuthBinding = {
  provider_id: number
  provider_name: string
  provider_slug: string
  provider_icon?: string
  provider_user_id: string
}

export async function listOAuthBindings(): Promise<OAuthBinding[]> {
  const res = await api.get<ApiEnvelope<OAuthBinding[] | null>>('/api/user/oauth/bindings')
  return unwrap(res.data, t('获取绑定信息失败')) ?? []
}

export async function unbindOAuth(providerId: number): Promise<void> {
  const res = await api.delete<ApiEnvelope<unknown>>(`/api/user/oauth/bindings/${providerId}`)
  unwrap(res.data, t('解绑失败'))
}

export async function bindWeChat(code: string): Promise<void> {
  const res = await api.post<ApiEnvelope<unknown>>('/api/oauth/wechat/bind', { code })
  unwrap(res.data, t('绑定失败'))
}

export type TelegramBindFlow = { flow_token: string; callback_url: string }

export async function startTelegramBind(): Promise<TelegramBindFlow> {
  const res = await api.post<ApiEnvelope<TelegramBindFlow>>('/api/oauth/telegram/bind/start')
  const flow = unwrap(res.data, t('Telegram 绑定失败，请重试。'))
  if (!flow?.callback_url || !flow.flow_token) throw new Error(t('Telegram 绑定失败，请重试。'))
  return flow
}

/** What the binding popup reported back from the provider. */
export type BindCallback = { state: string; code?: unknown; error?: unknown; errorDescription?: unknown }

/** Completes a binding with this page's own session (GET /api/oauth/:provider). */
export async function finishOAuthBind(provider: string, callback: BindCallback): Promise<void> {
  const params: Record<string, string> = { state: callback.state }
  if (typeof callback.code === 'string' && callback.code) params.code = callback.code
  if (typeof callback.error === 'string' && callback.error) params.error = callback.error
  if (typeof callback.errorDescription === 'string' && callback.errorDescription) params.error_description = callback.errorDescription
  const res = await api.get<ApiEnvelope<unknown>>(`/api/oauth/${encodeURIComponent(provider)}`, { params, validateStatus: () => true })
  unwrap(res.data, t('授权失败'))
}

/** Completes a binding started on a custom domain, from the ticket its bridge page passed back. */
export async function redeemBindHandoff(ticket: string): Promise<void> {
  const res = await api.post<ApiEnvelope<unknown>>('/api/oauth/domain-bind-handoff', { ticket }, { validateStatus: () => true })
  unwrap(res.data, t('授权失败'))
}
