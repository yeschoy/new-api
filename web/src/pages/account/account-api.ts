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
import { authStore, type AuthUser, type LoginSession } from '@/lib/auth-store'
import { unwrap } from '@/lib/console-api'

/** /api/user/self (controller/user.go buildSelfUserData) beyond AuthUser. */
export type AccountUser = AuthUser & {
  github_id?: string
  discord_id?: string
  oidc_id?: string
  wechat_id?: string
  telegram_id?: string
  linux_do_id?: string
  /** The user's settings as a JSON string (notifications, language, menu). */
  setting?: string
  permissions?: { sidebar_settings?: boolean }
}

/**
 * Password, two-step and passkey changes sign every other device out and give
 * this one a new token for the same session.
 */
export function applyRotation(data: unknown) {
  const current = authStore.get()
  const value = data as Partial<{ access_token: string; token_type: string; access_expires_at: number; session: LoginSession }> | null
  if (!current.user || !value?.access_token || typeof value.access_expires_at !== 'number') return
  if (!value.session || value.session.sid !== current.session?.sid) return
  authStore.applyBundle({
    user: current.user,
    access_token: value.access_token,
    token_type: value.token_type ?? 'Bearer',
    access_expires_at: value.access_expires_at,
    session: value.session,
  })
}

// ── Password (controller/user.go UpdateSelf) ──────────────────────────────

export async function changePassword(originalPassword: string, password: string): Promise<void> {
  const res = await api.put<ApiEnvelope<unknown>>('/api/user/self', { original_password: originalPassword, password })
  applyRotation(unwrap(res.data, t('修改失败')))
}

// ── Two-step verification (controller/twofa.go) ───────────────────────────

export type TwoFactorStatus = { enabled: boolean; locked: boolean; backup_codes_remaining?: number }

export async function getTwoFactorStatus(): Promise<TwoFactorStatus> {
  const res = await api.get<ApiEnvelope<TwoFactorStatus>>('/api/user/2fa/status')
  return unwrap(res.data, t('获取两步验证状态失败'))
}

/** A pending setup: the TOTP secret, its otpauth:// link and the backup codes. */
export type TwoFactorSetup = { secret: string; qr_code_data: string; backup_codes: string[] }

export async function startTwoFactorSetup(): Promise<TwoFactorSetup> {
  const res = await api.post<ApiEnvelope<TwoFactorSetup>>('/api/user/2fa/setup')
  return unwrap(res.data, t('无法开始设置两步验证'))
}

export async function enableTwoFactor(code: string): Promise<void> {
  const res = await api.post<ApiEnvelope<unknown>>('/api/user/2fa/enable', { code })
  applyRotation(unwrap(res.data, t('启用失败')))
}

export async function disableTwoFactor(code: string): Promise<void> {
  const res = await api.post<ApiEnvelope<unknown>>('/api/user/2fa/disable', { code })
  applyRotation(unwrap(res.data, t('关闭失败')))
}

export async function regenerateBackupCodes(code: string): Promise<string[]> {
  const res = await api.post<ApiEnvelope<{ backup_codes?: string[] }>>('/api/user/2fa/backup_codes', { code })
  const data = unwrap(res.data, t('生成失败'))
  applyRotation(data)
  return data?.backup_codes ?? []
}

// ── Access token, devices, deletion (controller/user.go, auth_session.go) ──

/** A new system access token; the old one stops working. */
export async function regenerateAccessToken(): Promise<string> {
  const res = await api.get<ApiEnvelope<string>>('/api/user/token')
  return unwrap(res.data, t('生成失败'))
}

export type DeviceSession = LoginSession & { ip: string; user_agent: string; created_at: number; last_active_at: number }

export async function listSessions(): Promise<DeviceSession[]> {
  const res = await api.get<ApiEnvelope<DeviceSession[] | null>>('/api/user/sessions')
  return unwrap(res.data, t('获取登录设备失败')) ?? []
}

export async function revokeSession(sid: string): Promise<void> {
  const res = await api.delete<ApiEnvelope<unknown>>(`/api/user/sessions/${encodeURIComponent(sid)}`)
  unwrap(res.data, t('操作失败'))
}

export async function revokeOtherSessions(): Promise<void> {
  const res = await api.post<ApiEnvelope<unknown>>('/api/user/sessions/revoke-others')
  unwrap(res.data, t('操作失败'))
}

export async function deleteAccount(): Promise<void> {
  const res = await api.delete<ApiEnvelope<unknown>>('/api/user/self')
  unwrap(res.data, t('删除失败'))
}
