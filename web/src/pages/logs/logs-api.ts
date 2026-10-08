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

import type { ChannelAffinity, DrawingLog, LogEntry, LogPage, LogScope, LogStats, LogUserInfo, TaskLog } from './log-types'
import { parseArtifacts, type ArtifactSet } from './task-artifacts-lib'

type Params = Record<string, string | number | undefined>

/** Drops empty filters so the backend applies none for them. */
function clean(params: Params): Record<string, string | number> {
  const out: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') out[key] = value
  }
  return out
}

async function getPage<T>(url: string, params: Params, fallback: string): Promise<LogPage<T>> {
  const res = await api.get<ApiEnvelope<{ items: T[] | null; total: number }>>(url, { params: clean(params) })
  const data = unwrap(res.data, fallback)
  return { items: data?.items ?? [], total: data?.total ?? 0 }
}

/** Filters of the usage log (controller/log.go GetAllLogs / GetUserLogs); times in seconds. */
export type LogQuery = {
  type?: number
  model_name?: string
  token_name?: string
  group?: string
  request_id?: string
  upstream_request_id?: string
  start_timestamp?: number
  end_timestamp?: number
  /** Admin view only. */
  username?: string
  channel?: number
}

function scopedQuery(scope: LogScope, query: LogQuery): Params {
  const params: Params = { ...query, type: query.type || undefined }
  if (scope === 'self') {
    params.username = undefined
    params.channel = undefined
  }
  return params
}

export function listLogs(scope: LogScope, query: LogQuery, page: number, size: number): Promise<LogPage<LogEntry>> {
  const url = scope === 'all' ? '/api/log/' : '/api/log/self'
  return getPage<LogEntry>(url, { ...scopedQuery(scope, query), p: page, page_size: size }, t('获取使用记录失败'))
}

/** Spend, RPM and TPM for the same filters. */
export async function getLogStats(scope: LogScope, query: LogQuery): Promise<LogStats> {
  const url = scope === 'all' ? '/api/log/stat' : '/api/log/self/stat'
  const res = await api.get<ApiEnvelope<Partial<LogStats> | null>>(url, { params: clean(scopedQuery(scope, query)) })
  const data = unwrap(res.data, t('获取统计数据失败'))
  return { quota: data?.quota ?? 0, rpm: data?.rpm ?? 0, tpm: data?.tpm ?? 0 }
}

/** Filters of the task and drawing logs: one id, the time window and (admins) a channel. */
export type TaskQuery = { id?: string; channel?: string; start_timestamp?: number; end_timestamp?: number }

/** controller/task.go GetAllTask / GetUserTask; times in seconds. */
export function listTaskLogs(scope: LogScope, query: TaskQuery, page: number, size: number): Promise<LogPage<TaskLog>> {
  const url = scope === 'all' ? '/api/task' : '/api/task/self'
  const params: Params = {
    p: page,
    page_size: size,
    task_id: query.id,
    channel_id: scope === 'all' ? query.channel : undefined,
    start_timestamp: query.start_timestamp,
    end_timestamp: query.end_timestamp,
  }
  return getPage<TaskLog>(url, params, t('获取任务记录失败'))
}

/** controller/midjourney.go GetAllMidjourney / GetUserMidjourney; times in milliseconds. */
export function listDrawingLogs(scope: LogScope, query: TaskQuery, page: number, size: number): Promise<LogPage<DrawingLog>> {
  const url = scope === 'all' ? '/api/mj/' : '/api/mj/self'
  const params: Params = {
    p: page,
    page_size: size,
    mj_id: query.id,
    channel_id: scope === 'all' ? query.channel : undefined,
    start_timestamp: query.start_timestamp,
    end_timestamp: query.end_timestamp,
  }
  return getPage<DrawingLog>(url, params, t('获取绘图记录失败'))
}

/** What a finished task produced (GET /api/task/:id/artifacts); links are checked before use. */
export async function getTaskArtifacts(taskId: string): Promise<ArtifactSet> {
  const res = await api.get<ApiEnvelope<unknown>>(`/api/task/${encodeURIComponent(taskId)}/artifacts`)
  return parseArtifacts(unwrap(res.data, t('制品加载失败')))
}

/** GET /api/user/:id (admins). */
export async function getLogUser(id: number): Promise<LogUserInfo> {
  const res = await api.get<ApiEnvelope<LogUserInfo>>(`/api/user/${id}`)
  return unwrap(res.data, t('获取用户信息失败'))
}

/** Upstream cache hits of one channel-affinity key (GET /api/log/channel_affinity_usage_cache, admins). */
export async function getAffinityUsage(target: ChannelAffinity): Promise<Record<string, unknown>> {
  const res = await api.get<ApiEnvelope<Record<string, unknown> | null>>('/api/log/channel_affinity_usage_cache', {
    params: {
      rule_name: target.rule_name || '',
      using_group: target.using_group || target.selected_group || '',
      key_hint: target.key_hint || '',
      key_fp: target.key_fp || '',
    },
  })
  return unwrap(res.data, t('请求失败')) ?? {}
}
