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
import type { UsageLog } from './services'

/** Returns `data`, or throws the backend message when `success` is false. */
export function unwrap<T>(body: ApiEnvelope<T> | undefined, fallback: string): T {
  if (!body?.success) throw new Error(body?.message || fallback)
  return body.data
}

// ── Top-up (controller/topup.go GetTopUpInfo / GetUserTopUps) ─────────────
export type TopUpInfo = {
  enable_online_topup: boolean
  enable_stripe_topup: boolean
  enable_creem_topup: boolean
  enable_waffo_topup: boolean
  enable_waffo_pancake_topup: boolean
  enable_redemption: boolean
  topup_link?: string
}

export async function getTopUpInfo(): Promise<TopUpInfo> {
  const res = await api.get<ApiEnvelope<TopUpInfo>>('/api/user/topup/info')
  return unwrap(res.data, '获取充值信息失败')
}

export function onlineTopUpEnabled(info: TopUpInfo | undefined): boolean {
  if (!info) return false
  return (
    info.enable_online_topup ||
    info.enable_stripe_topup ||
    info.enable_creem_topup ||
    info.enable_waffo_topup ||
    info.enable_waffo_pancake_topup
  )
}

/** model/topup.go TopUp; `amount` is in USD units, `money` is what was paid. */
export type TopUpRecord = {
  id: number
  amount: number
  money: number
  trade_no: string
  payment_method: string
  create_time: number
  complete_time: number
  status: string
}

export async function listTopUps(page = 1, size = 10) {
  const res = await api.get<ApiEnvelope<{ items: TopUpRecord[] | null; total: number }>>(
    '/api/user/topup/self',
    { params: { p: page, page_size: size } }
  )
  const data = unwrap(res.data, '获取充值记录失败')
  return { items: data.items ?? [], total: data.total }
}

// ── API keys (controller/token.go UpdateToken, ?status_only) ──────────────
export const KEY_STATUS_ENABLED = 1
export const KEY_STATUS_DISABLED = 2

export async function setKeyStatus(id: number, status: number): Promise<void> {
  const res = await api.put<ApiEnvelope<unknown>>(
    '/api/token/',
    { id, status },
    { params: { status_only: true } }
  )
  unwrap(res.data, '更新密钥状态失败')
}

// ── Profile (controller/user.go UpdateSelf) ───────────────────────────────
/** Only non-empty username / display_name / password are applied by the handler. */
export async function updateDisplayName(displayName: string): Promise<void> {
  const res = await api.put<ApiEnvelope<unknown>>('/api/user/self', {
    display_name: displayName,
  })
  unwrap(res.data, '保存失败')
}

// ── Usage (controller/log.go GetUserLogs, controller/log_summary.go) ──────
/** Consume (2) and error (5) logs — the rows that correspond to API requests. */
const REQUEST_LOG_TYPES = '2,5'

export async function listRequestLogs(page = 1, size = 20) {
  const res = await api.get<ApiEnvelope<{ items: UsageLog[] | null; total: number }>>(
    '/api/log/self',
    { params: { p: page, page_size: size, types: REQUEST_LOG_TYPES } }
  )
  const data = unwrap(res.data, '获取使用记录失败')
  return { items: data.items ?? [], total: data.total }
}

export type DailyUsage = {
  date: string
  requests: number
  quota: number
  tokens: number
}

/** model/log_summary.go UserLogSummary (window must be under 10 days). */
export type UsageSummary = {
  requests: number
  failed: number
  quota: number
  tokens: number
  daily: DailyUsage[] | null
}

export async function getUsageSummary(start: number, end: number): Promise<UsageSummary> {
  const res = await api.get<ApiEnvelope<UsageSummary>>('/api/log/self/summary', {
    params: {
      start_timestamp: start,
      end_timestamp: end,
      timezone_offset: -new Date().getTimezoneOffset(),
    },
  })
  return unwrap(res.data, '获取用量统计失败')
}
