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
import { useStatus } from '@/lib/queries'
import type { SiteStatus } from '@/lib/services'

// ── Status (controller/misc.go GetStatus) ─────────────────────────────────
export type AnnouncementItem = { id?: number; content: string; publishDate?: string; type?: string; extra?: string }
export type ApiInfoItem = { url: string; route: string; description?: string; color?: string }
export type FaqItem = { id?: number; question: string; answer: string }

/** The console fields of /api/status that SiteStatus leaves out. */
export type DashboardStatus = SiteStatus & {
  announcements_enabled?: boolean
  announcements?: AnnouncementItem[]
  api_info_enabled?: boolean
  api_info?: ApiInfoItem[]
  faq_enabled?: boolean
  faq?: FaqItem[]
  uptime_kuma_enabled?: boolean
  /** The operator's default chart granularity: hour, day or week. */
  data_export_default_time?: string
}

export function useDashboardStatus() {
  const query = useStatus()
  return { ...query, data: query.data as DashboardStatus | undefined }
}

// ── Usage data (controller/usedata.go, model/usedata.go) ──────────────────
/** One hour of usage for a model (and, for per-user queries, a user). */
export type QuotaRow = {
  user_id?: number
  username?: string
  model_name?: string
  created_at: number
  token_used?: number
  count?: number
  quota?: number
}

export type TimeWindow = { start: number; end: number }

/** Admins read every account (optionally one username); everyone else their own. */
export async function getQuotaRows(window: TimeWindow, options: { admin: boolean; username?: string }): Promise<QuotaRow[]> {
  const params: Record<string, string | number> = { start_timestamp: window.start, end_timestamp: window.end }
  if (options.admin && options.username) params.username = options.username
  const res = await api.get<ApiEnvelope<QuotaRow[] | null>>(options.admin ? '/api/data/' : '/api/data/self', { params })
  return unwrap(res.data, t('用量数据加载失败')) ?? []
}

/** Admin only: every account's usage per hour, by username. */
export async function getUserQuotaRows(window: TimeWindow): Promise<QuotaRow[]> {
  const res = await api.get<ApiEnvelope<QuotaRow[] | null>>('/api/data/users', {
    params: { start_timestamp: window.start, end_timestamp: window.end },
  })
  return unwrap(res.data, t('用量数据加载失败')) ?? []
}

/** model/usedata_flow.go FlowQuotaData: which fields come back depends on the role. */
export type FlowRow = {
  user_id?: number
  username?: string
  node_name?: string
  token_id?: number
  token_name?: string
  use_group?: string
  channel_id?: number
  channel_name?: string
  model_name?: string
  token_used?: number
  count?: number
  quota?: number
}

export async function getFlowRows(window: TimeWindow, options: { admin: boolean; username?: string }): Promise<FlowRow[]> {
  const params: Record<string, string | number> = { start_timestamp: window.start, end_timestamp: window.end }
  if (options.admin && options.username) params.username = options.username
  const res = await api.get<ApiEnvelope<FlowRow[] | null>>(options.admin ? '/api/data/flow' : '/api/data/flow/self', { params })
  return unwrap(res.data, t('分流数据加载失败')) ?? []
}

// ── Request log summary (controller/log_summary.go, max 10 days) ──────────
export type SummaryTotals = {
  requests: number
  succeeded?: number
  failed: number
  /** Wallet spending only. */
  quota: number
  subscription_quota?: number
  tokens: number
  saved_quota?: number
  comparable_requests?: number
}

export type LogSummary = SummaryTotals & { daily: Array<SummaryTotals & { date: string }> | null }

export async function getLogSummary(window: TimeWindow): Promise<LogSummary> {
  const res = await api.get<ApiEnvelope<LogSummary>>('/api/log/self/summary', {
    params: { start_timestamp: window.start, end_timestamp: window.end, timezone_offset: -new Date().getTimezoneOffset() },
  })
  return unwrap(res.data, t('获取用量统计失败'))
}

// ── Uptime Kuma (controller/uptime_kuma.go) ───────────────────────────────
/** status: 1 up, 0 down, 2 pending, 3 maintenance; uptime is the 24-hour ratio (0–1). */
export type UptimeMonitor = { name: string; uptime: number; status: number; group?: string }
export type UptimeGroup = { categoryName: string; monitors: UptimeMonitor[] | null }

export async function getUptime(): Promise<UptimeGroup[]> {
  const res = await api.get<ApiEnvelope<UptimeGroup[] | null>>('/api/uptime/status')
  return unwrap(res.data, t('服务状态加载失败')) ?? []
}

// ── Model performance (controller/perf_metrics.go, sorted by requests) ────
export type PerfModel = {
  model_name: string
  avg_latency_ms: number
  success_rate: number
  avg_tps: number
  request_count?: number
}

export async function getPerfSummary(hours: number): Promise<PerfModel[]> {
  const res = await api.get<ApiEnvelope<{ models: PerfModel[] | null }>>('/api/perf-metrics/summary', { params: { hours } })
  return unwrap(res.data, t('性能数据加载失败')).models ?? []
}
