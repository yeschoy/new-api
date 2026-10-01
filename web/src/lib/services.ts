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
import { api, type ApiEnvelope } from './api'
import {
  authStore,
  isAuthBundle,
  type AuthBundle,
  type AuthUser,
} from './auth-store'
import {
  clearPasswordEncryptionCache,
  encryptPassword,
} from './password-encryption'

// ── Status ────────────────────────────────────────────────────────────────
export type SiteStatus = {
  system_name?: string
  logo?: string
  footer_html?: string
  server_address?: string
  docs_link?: string
  quota_per_unit?: number
  quota_display_type?: 'USD' | 'CNY' | 'TOKENS' | 'CUSTOM'
  custom_currency_symbol?: string
  custom_currency_exchange_rate?: number
  usd_exchange_rate?: number
  price?: number
  register_enabled?: boolean
  password_login_enabled?: boolean
  password_register_enabled?: boolean
  password_login_encryption_enabled?: boolean
  email_verification?: boolean
  turnstile_check?: boolean
  github_oauth?: boolean
  /** The admin's header-navigation switches, as a JSON string (see showNavModule). */
  HeaderNavModules?: string
  /** The admin's console menu switches, as JSON (see consoleModuleOn). */
  SidebarModulesAdmin?: string
  /** Usage data for the analytics pages is being collected. */
  enable_data_export?: boolean
  /** New API keys go in the auto group, which routes each request to a usable group. */
  default_use_auto_group?: boolean
  setup?: boolean
  user_agreement_enabled?: boolean
  privacy_policy_enabled?: boolean
}

export async function getStatus(): Promise<SiteStatus> {
  const res = await api.get<ApiEnvelope<SiteStatus>>('/api/status')
  return res.data.data ?? {}
}

// ── Setup ─────────────────────────────────────────────────────────────────
export type SetupState = {
  status: boolean
  root_init: boolean
  database_type: string
}

export async function getSetup(): Promise<SetupState> {
  const res = await api.get<ApiEnvelope<SetupState>>('/api/setup', {
    params: { t: Date.now() },
  })
  return res.data.data
}

export async function submitSetup(payload: {
  username: string
  password: string
  confirmPassword: string
  SelfUseModeEnabled: boolean
  DemoSiteEnabled: boolean
}): Promise<ApiEnvelope<unknown>> {
  const res = await api.post<ApiEnvelope<unknown>>('/api/setup', payload)
  return res.data
}

// ── Catalog ───────────────────────────────────────────────────────────────
export type Modality = 'text' | 'image' | 'audio' | 'video' | 'file'

export type PricingModel = {
  id: number
  model_name: string
  description?: string
  icon?: string
  tags?: string
  vendor_id?: number
  vendor_name?: string
  vendor_icon?: string
  quota_type: number
  model_ratio: number
  completion_ratio: number
  model_price?: number
  cache_ratio?: number | null
  enable_groups: string[]
  supported_endpoint_types?: string[]
  context_length?: number
  max_output_tokens?: number
  release_date?: string
  input_modalities?: Modality[]
  output_modalities?: Modality[]
  capabilities?: string[]
}

export type PricingVendor = { id: number; name: string; icon?: string }

export type PricingResponse = {
  success: boolean
  data: PricingModel[]
  vendors: PricingVendor[]
  group_ratio: Record<string, number>
  usable_group: Record<string, string | { desc: string; ratio: number }>
}

export async function getPricing(): Promise<PricingResponse> {
  const res = await api.get<PricingResponse>('/api/pricing')
  return res.data
}

// ── Rankings ──────────────────────────────────────────────────────────────
export type RankingPeriod = 'today' | 'week' | 'month' | 'year'

export type ModelRanking = {
  rank: number
  previous_rank?: number
  model_name: string
  vendor: string
  vendor_icon?: string
  total_tokens: number
  share: number
  growth_pct: number
}

export type VendorRanking = {
  rank: number
  vendor: string
  vendor_icon?: string
  total_tokens: number
  share: number
  growth_pct: number
  models_count: number
  top_model: string
}

export type ModelHistoryPoint = {
  ts: string
  label: string
  model: string
  vendor: string
  tokens: number
}

export type RankingMover = {
  model_name: string
  vendor: string
  vendor_icon?: string
  rank_delta: number
  current_rank: number
  growth_pct: number
}

export type RankingsSnapshot = {
  models: ModelRanking[]
  vendors: VendorRanking[]
  top_movers: RankingMover[]
  top_droppers: RankingMover[]
  models_history: {
    points: ModelHistoryPoint[]
    models: Array<{ name: string; vendor: string; total: number }>
    buckets: number
  }
}

export async function getRankings(
  period: RankingPeriod
): Promise<RankingsSnapshot> {
  const res = await api.get<ApiEnvelope<RankingsSnapshot>>('/api/rankings', {
    params: { period },
  })
  return res.data.data
}

// ── Auth ──────────────────────────────────────────────────────────────────
export type LoginResult =
  | { kind: 'signed-in' }
  /** The password was right; the 2FA code must be sent back with this flow token. */
  | { kind: 'two-factor'; flowToken: string }
  | { kind: 'error'; message: string }

export async function login(input: {
  username: string
  password: string
  encrypt: boolean
}): Promise<LoginResult> {
  const passwordFields = input.encrypt
    ? await encryptPassword(input.password)
    : { password: input.password }
  const res = await api.post<ApiEnvelope<AuthBundle | { require_2fa?: boolean; flow_token?: string }>>(
    '/api/user/login',
    { username: input.username, ...passwordFields },
    { validateStatus: () => true }
  )
  const body = res.data
  if (body?.success && isAuthBundle(body.data)) {
    authStore.applyBundle(body.data)
    return { kind: 'signed-in' }
  }
  const pending = body?.data as { require_2fa?: boolean; flow_token?: string } | undefined
  if (body?.success && pending?.require_2fa) {
    return { kind: 'two-factor', flowToken: pending.flow_token ?? '' }
  }
  if (input.encrypt) clearPasswordEncryptionCache()
  return { kind: 'error', message: body?.message || 'Sign in failed' }
}

export async function loginTwoFactor(code: string, flowToken: string): Promise<LoginResult> {
  const res = await api.post<ApiEnvelope<AuthBundle>>(
    '/api/user/login/2fa',
    { code, flow_token: flowToken },
    { validateStatus: () => true }
  )
  if (res.data?.success && isAuthBundle(res.data.data)) {
    authStore.applyBundle(res.data.data)
    return { kind: 'signed-in' }
  }
  return { kind: 'error', message: res.data?.message || 'Verification failed' }
}

export async function register(input: {
  username: string
  password: string
  email?: string
  verification_code?: string
  /** The inviter's code, from a ?aff= invite link. */
  aff_code?: string
}): Promise<LoginResult | { kind: 'registered' }> {
  const res = await api.post<ApiEnvelope<unknown>>(
    '/api/user/register',
    { ...input, password2: input.password },
    { validateStatus: () => true }
  )
  if (!res.data?.success) {
    return { kind: 'error', message: res.data?.message || 'Sign up failed' }
  }
  if (isAuthBundle(res.data.data)) {
    authStore.applyBundle(res.data.data)
    return { kind: 'signed-in' }
  }
  return { kind: 'registered' }
}

export async function logout(): Promise<void> {
  const sid = authStore.get().session?.sid
  try {
    await api.post('/api/user/auth/logout', undefined, {
      headers: sid ? { 'X-Auth-Session': sid } : undefined,
    })
  } finally {
    authStore.clear()
  }
}

export async function getSelf(): Promise<AuthUser> {
  const res = await api.get<ApiEnvelope<AuthUser>>('/api/user/self')
  return res.data.data
}

// ── API keys ──────────────────────────────────────────────────────────────
export type ApiKey = {
  id: number
  name: string
  key: string
  status: number
  created_time: number
  accessed_time: number
  expired_time: number
  remain_quota: number
  unlimited_quota: boolean
  used_quota: number
  group?: string
}

export async function listKeys(page = 1, size = 50) {
  const res = await api.get<
    ApiEnvelope<{ items: ApiKey[]; total: number } | ApiKey[]>
  >('/api/token/', { params: { p: page, page_size: size } })
  // Failures come back as HTTP 200 with success: false; surface them instead of an empty list.
  if (!res.data?.success) throw new Error(res.data?.message || '')
  const data = res.data.data
  return Array.isArray(data) ? { items: data, total: data.length } : data
}

export async function createKey(input: {
  name: string
  remain_quota: number
  unlimited_quota: boolean
  expired_time: number
  group?: string
}) {
  const res = await api.post<ApiEnvelope<unknown>>('/api/token/', input)
  return res.data
}

export async function deleteKey(id: number) {
  const res = await api.delete<ApiEnvelope<unknown>>(`/api/token/${id}`)
  return res.data
}

export async function revealKey(id: number): Promise<string> {
  const res = await api.post<ApiEnvelope<{ key: string }>>(
    `/api/token/${id}/key`
  )
  return res.data.data?.key ?? ''
}

// ── Usage logs ────────────────────────────────────────────────────────────
export type UsageLog = {
  id: number
  created_at: number
  model_name: string
  token_name: string
  prompt_tokens: number
  completion_tokens: number
  quota: number
  use_time: number
  is_stream: boolean
  type: number
  content?: string
}

export async function listLogs(page = 1, size = 20) {
  const res = await api.get<
    ApiEnvelope<{ items: UsageLog[]; total: number; page: number }>
  >('/api/log/self', { params: { p: page, page_size: size, type: 0 } })
  return res.data.data
}

// ── Credits ───────────────────────────────────────────────────────────────
export async function redeemCode(key: string) {
  const res = await api.post<ApiEnvelope<number>>('/api/user/topup', { key })
  return res.data
}
