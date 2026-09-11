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
import { api, type ApiRequestConfig } from '@/lib/api'

import { LOG_TYPE_ENUM } from './constants'
import type { UsageLog } from './data/schema'
import { buildQueryParams } from './lib/query-params'
import { parseTaskArtifactsResponse } from './lib/task-artifacts'
import type {
  GetLogsParams,
  UserLogSummary,
  UserLogSummaryParams,
  GetLogsResponse,
  GetLogStatsParams,
  GetLogStatsResponse,
  GetMidjourneyLogsParams,
  GetTaskLogsParams,
  TaskArtifactsResponse,
  UserInfo,
} from './types'

// ============================================================================
// Generic API Helpers
// ============================================================================

function buildApiPath(endpoint: string, isAdmin: boolean): string {
  return isAdmin ? endpoint : `${endpoint}/self`
}

async function fetchLogs<T>(
  endpoint: string,
  params: T,
  isAdmin: boolean
): Promise<GetLogsResponse> {
  const paramRecord = params as unknown as Record<string, unknown>
  const queryParams = buildQueryParams({
    p: paramRecord.p || 1,
    page_size: paramRecord.page_size || 20,
    ...params,
  })
  const path = buildApiPath(endpoint, isAdmin)
  const res = await api.get(`${path}?${queryParams}`)
  return res.data
}

async function fetchLogStats<T>(
  endpoint: string,
  params: T,
  isAdmin: boolean
): Promise<GetLogStatsResponse> {
  const queryParams = buildQueryParams(
    params as unknown as Record<string, unknown>
  )
  const path = buildApiPath(endpoint, isAdmin)
  const res = await api.get(`${path}/stat?${queryParams}`)
  return res.data
}

// ============================================================================
// Common Log APIs
// ============================================================================

export const getAllLogs = (params: GetLogsParams = {}) =>
  fetchLogs('/api/log', params, true)

export const getUserLogs = (
  params: Omit<GetLogsParams, 'username' | 'channel'> = {}
) => fetchLogs('/api/log', params, false)

type UserRequestLogsParams = Omit<
  GetLogsParams,
  'username' | 'channel' | 'type'
>

const REQUEST_LOG_TYPES = [LOG_TYPE_ENUM.CONSUME, LOG_TYPE_ENUM.ERROR] as const
const MAX_LOG_PAGE_SIZE = 100

async function getUserLogPrefix(
  params: Omit<UserRequestLogsParams, 'p' | 'page_size'>,
  type: (typeof REQUEST_LOG_TYPES)[number],
  itemCount: number
) {
  const pageSize = Math.min(itemCount, MAX_LOG_PAGE_SIZE)
  const items: UsageLog[] = []
  let total = 0

  for (
    let page = 1;
    items.length < Math.min(itemCount, total || itemCount);
    page++
  ) {
    const response = await getUserLogs({
      ...params,
      type,
      p: page,
      page_size: pageSize,
    })
    if (!response.success || !response.data) {
      return { response }
    }

    total = response.data.total
    const pageItems = response.data.items as UsageLog[]
    items.push(...pageItems)
    if (pageItems.length === 0) break
  }

  return { items, total }
}

export async function getUserRequestLogs(
  params: UserRequestLogsParams = {}
): Promise<GetLogsResponse> {
  const page = Math.max(1, Math.trunc(params.p ?? 1))
  const pageSize = Math.max(1, Math.trunc(params.page_size ?? 20))
  const prefixSize = page * pageSize
  const { p: _page, page_size: _pageSize, ...filters } = params
  const streams = await Promise.all(
    REQUEST_LOG_TYPES.map((type) => getUserLogPrefix(filters, type, prefixSize))
  )
  const failedStream = streams.find((stream) => stream.response)
  if (failedStream?.response) return failedStream.response

  const allItems = streams.flatMap((stream) => stream.items ?? [])
  allItems.sort(
    (left, right) =>
      right.created_at - left.created_at ||
      right.type - left.type ||
      // The self-log endpoint rewrites IDs to ascending display positions.
      left.id - right.id
  )

  return {
    success: true,
    data: {
      items: allItems.slice((page - 1) * pageSize, prefixSize),
      total: streams.reduce((sum, stream) => sum + (stream.total ?? 0), 0),
      page,
      page_size: pageSize,
    },
  }
}

export const getLogStats = (params: GetLogStatsParams = {}) =>
  fetchLogStats('/api/log', params, true)

export const getUserLogStats = (
  params: Omit<GetLogStatsParams, 'username' | 'channel'> = {}
) => fetchLogStats('/api/log', params, false)

export async function getUserInfo(
  userId: number
): Promise<{ success: boolean; message?: string; data?: UserInfo }> {
  const res = await api.get(`/api/user/${userId}`)
  return res.data
}

// ============================================================================
// MjProxy (Drawing) Logs API
// ============================================================================

export const getAllMidjourneyLogs = (params: GetMidjourneyLogsParams) =>
  fetchLogs('/api/mj', params, true)

export const getUserMidjourneyLogs = (params: GetMidjourneyLogsParams) =>
  fetchLogs('/api/mj', params, false)

// ============================================================================
// Task Logs API
// ============================================================================

export const getAllTaskLogs = (params: GetTaskLogsParams) =>
  fetchLogs('/api/task', params, true)

export const getUserTaskLogs = (params: GetTaskLogsParams) =>
  fetchLogs('/api/task', params, false)

const taskArtifactRequestConfig = {
  skipBusinessError: true,
  skipErrorHandler: true,
} satisfies ApiRequestConfig

export async function getTaskArtifacts(taskId: string) {
  const response = await api.get<TaskArtifactsResponse>(
    `/api/task/${encodeURIComponent(taskId)}/artifacts`,
    taskArtifactRequestConfig
  )
  return parseTaskArtifactsResponse(response.data)
}

export async function getUserLogSummary(
  params: UserLogSummaryParams
): Promise<UserLogSummary> {
  const response = await api.get<{
    success: boolean
    message?: string
    data?: UserLogSummary
  }>('/api/log/self/summary', { params })
  if (!response.data.success || !response.data.data) {
    throw new Error(response.data.message || 'Failed to load usage report')
  }
  return response.data.data
}
