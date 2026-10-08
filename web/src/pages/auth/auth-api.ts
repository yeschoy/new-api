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
import { t, tk } from '@/i18n/i18n'
import { api, type ApiEnvelope } from '@/lib/api'
import { authStore, isAuthBundle } from '@/lib/auth-store'
import { unwrap } from '@/lib/console-api'
import { clearPasswordEncryptionCache, encryptPassword } from '@/lib/password-encryption'
import type { LoginResult } from '@/lib/services'
import { assertionResult, requestOptions } from '@/pages/account/webauthn'

import { rememberedInviteCode } from './invite-code'

/** `?turnstile=` for the routes behind the human check (middleware/turnstile-check.go). */
function humanCheck(token: string): Record<string, string> {
  return token ? { turnstile: token } : {}
}

/** Sign-ins answer with HTTP errors too; read the body either way. */
const ANY_STATUS = { validateStatus: () => true }

// Codes from controller/auth_session.go writeAuthSessionError, worded for people.
const AUTH_CODES: Record<string, string> = {
  AUTH_SESSION_LIMIT: tk('登录设备过多。请在已登录的设备上打开账户安全，退出其他设备后再试；若无法访问已登录设备，可重置密码以退出全部设备。'),
  AUTH_SESSION_ISSUANCE_LIMIT: tk('近期登录次数过多，请稍后再试。'),
}

/** The reason a sign-in failed, from an `{ success, code, message }` body. */
export function authFailure(body: { code?: string; message?: string } | undefined, fallback: string): string {
  const known = body?.code ? AUTH_CODES[body.code] : undefined
  if (known) return t(known)
  return body?.message || fallback
}

// Codes of a failed Telegram binding (controller/telegram.go telegramBindFailure).
const TELEGRAM_BIND_CODES: Record<string, string> = {
  TELEGRAM_BIND_DISABLED: tk('管理员未开启 Telegram 绑定。'),
  TELEGRAM_BIND_INVALID_REQUEST: tk('Telegram 授权无效或已过期。'),
  TELEGRAM_BIND_FLOW_INVALID: tk('本次绑定请求已过期或已被使用。'),
  TELEGRAM_BIND_SESSION_INVALID: tk('发起绑定的登录状态已失效，请重新登录。'),
  TELEGRAM_BIND_ALREADY_BOUND: tk('该 Telegram 账号已被其他账户绑定。'),
  TELEGRAM_BIND_USER_DELETED: tk('该账户已不存在。'),
  TELEGRAM_BIND_USER_DISABLED: tk('该账户已被禁用。'),
}

export function telegramBindFailure(code: string | undefined): string {
  const known = code ? TELEGRAM_BIND_CODES[code] : undefined
  if (known) return t(known)
  return t('Telegram 绑定失败，请重试。')
}

/** Applies the session from a sign-in answer, or throws its reason. */
function signInWith(body: ApiEnvelope<unknown> | undefined, fallback: string) {
  if (!body?.success || !isAuthBundle(body.data)) throw new Error(authFailure(body, fallback))
  authStore.applyBundle(body.data)
}

// ── Password sign-in and sign-up (controller/user.go) ─────────────────────

export async function passwordSignIn(input: { username: string; password: string; encrypt: boolean; turnstile: string }): Promise<LoginResult> {
  const passwordFields = input.encrypt ? await encryptPassword(input.password) : { password: input.password }
  const res = await api.post<ApiEnvelope<unknown>>(
    '/api/user/login',
    { username: input.username, ...passwordFields },
    { params: humanCheck(input.turnstile), ...ANY_STATUS }
  )
  const body = res.data
  if (body?.success && isAuthBundle(body.data)) {
    authStore.applyBundle(body.data)
    return { kind: 'signed-in' }
  }
  const pending = body?.data as { require_2fa?: boolean; flow_token?: string } | undefined
  if (body?.success && pending?.require_2fa) return { kind: 'two-factor', flowToken: pending.flow_token ?? '' }
  if (input.encrypt) clearPasswordEncryptionCache()
  return { kind: 'error', message: authFailure(body, t('登录失败')) }
}

export async function signUp(
  input: { username: string; password: string; email?: string; verification_code?: string; aff_code?: string },
  turnstile: string
): Promise<LoginResult | { kind: 'registered' }> {
  const res = await api.post<ApiEnvelope<unknown>>(
    '/api/user/register',
    { ...input, password2: input.password },
    { params: humanCheck(turnstile), ...ANY_STATUS }
  )
  if (!res.data?.success) return { kind: 'error', message: authFailure(res.data, t('注册失败')) }
  if (isAuthBundle(res.data.data)) {
    authStore.applyBundle(res.data.data)
    return { kind: 'signed-in' }
  }
  return { kind: 'registered' }
}

export async function sendVerificationEmail(email: string, turnstile: string): Promise<void> {
  const res = await api.get<ApiEnvelope<unknown>>('/api/verification', { params: { email, ...humanCheck(turnstile) } })
  unwrap(res.data, t('发送失败'))
}

// ── Password recovery (controller/misc.go) ────────────────────────────────

/** Mails a reset link; the server answers the same whether or not the address is registered. */
export async function sendResetEmail(email: string, turnstile: string): Promise<void> {
  const res = await api.get<ApiEnvelope<unknown>>('/api/reset_password', { params: { email, ...humanCheck(turnstile) } })
  unwrap(res.data, t('发送失败'))
}

/** Redeems the emailed link; the server sets and returns a new random password. */
export async function confirmReset(email: string, token: string): Promise<string> {
  const res = await api.post<ApiEnvelope<string>>('/api/user/reset', { email, token })
  return unwrap(res.data, t('重置失败'))
}

// ── Third-party sign-in (controller/oauth.go, wechat.go, telegram.go, passkey.go) ──

/** A one-time state for a provider round trip; sign-ins carry the remembered invite code. */
export async function createOAuthState(provider: string, intent: 'login' | 'bind'): Promise<string> {
  const aff = intent === 'login' ? rememberedInviteCode() : ''
  const res = await api.post<ApiEnvelope<string | { flow_token?: string }>>('/api/oauth/state', {
    provider,
    intent,
    ...(aff ? { aff } : {}),
  })
  const data = unwrap(res.data, t('无法发起授权，请稍后重试'))
  const state = typeof data === 'string' ? data : data?.flow_token
  if (!state) throw new Error(t('无法发起授权，请稍后重试'))
  return state
}

/** Signs in with the code the WeChat official account replied with. */
export async function wechatSignIn(code: string): Promise<void> {
  const res = await api.get<ApiEnvelope<unknown>>('/api/oauth/wechat', { params: { code }, ...ANY_STATUS })
  signInWith(res.data, t('登录失败'))
}

const TELEGRAM_FIELDS = ['first_name', 'last_name', 'username', 'photo_url', 'lang'] as const

/** The signed fields of the Telegram widget's answer, or null when it is not one. */
export function telegramAuthorization(value: unknown): Record<string, string | number> | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = record.id
  const authDate = record.auth_date
  const hash = typeof record.hash === 'string' ? record.hash.trim() : ''
  const valid = (field: unknown) => (typeof field === 'number' && Number.isFinite(field)) || (typeof field === 'string' && field.trim() !== '')
  if (!valid(id) || !valid(authDate) || !hash) return null
  const fields: Record<string, string | number> = { id: id as string | number, auth_date: authDate as string | number, hash }
  for (const name of TELEGRAM_FIELDS) {
    const field = record[name]
    if (typeof field === 'string' && field) fields[name] = field
  }
  return fields
}

export async function telegramSignIn(authorization: Record<string, string | number>): Promise<void> {
  const res = await api.get<ApiEnvelope<unknown>>('/api/oauth/telegram/login', { params: authorization, ...ANY_STATUS })
  signInWith(res.data, t('登录失败'))
}

type PasskeyChallenge = { options?: unknown; flow_token?: string }

/** Asks the browser for this site's passkey and signs in with it. */
export async function passkeySignIn(): Promise<void> {
  const begin = await api.post<ApiEnvelope<PasskeyChallenge>>('/api/user/passkey/login/begin')
  const challenge = unwrap(begin.data, t('Passkey 登录失败'))
  if (!challenge?.flow_token) throw new Error(t('登录已过期，请重新登录'))
  const credential = await navigator.credentials.get({ publicKey: requestOptions(challenge.options ?? challenge) })
  if (!credential) throw new DOMException('cancelled', 'NotAllowedError')
  const finish = await api.post<ApiEnvelope<unknown>>(
    '/api/user/passkey/login/finish',
    { flow_token: challenge.flow_token, credential: assertionResult(credential as PublicKeyCredential) },
    ANY_STATUS
  )
  signInWith(finish.data, t('Passkey 登录失败'))
}
