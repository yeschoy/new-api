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
import { listKeys, type ApiKey } from '@/lib/services'
import { withKeyPrefix } from '@/pages/console/console-helpers'

/** controller/token.go tokenResponse: the masked key with its limits and routing. */
export type KeyDetail = ApiKey & {
  model_limits_enabled?: boolean
  model_limits?: string | null
  allow_ips?: string | null
  cross_group_retry?: boolean
  /** The key's own auto order; empty or null follows the account's global order. */
  auto_groups?: string[] | null
}

export type KeyPage = { items: KeyDetail[]; total: number }

/** Body of POST and PUT /api/token/ (controller/token.go tokenRequest). */
export type KeyPayload = {
  name: string
  remain_quota: number
  expired_time: number
  unlimited_quota: boolean
  model_limits_enabled: boolean
  model_limits: string
  allow_ips: string
  group: string
  auto_groups: string[]
  cross_group_retry: boolean
}

export type KeyQuery = { page: number; size: number; keyword: string; token: string }

/** One page of keys; with a name or key typed in, the server's search (exact unless it holds %). */
export async function fetchKeys(query: KeyQuery): Promise<KeyPage> {
  const keyword = query.keyword.trim()
  const token = query.token.trim()
  if (!keyword && !token) return listKeys(query.page, query.size)
  const params: Record<string, string | number> = {}
  if (keyword) params.keyword = keyword
  if (token) params.token = token
  params.p = query.page
  params.page_size = query.size
  const res = await api.get<ApiEnvelope<{ items: KeyDetail[] | null; total: number }>>('/api/token/search', { params })
  const data = unwrap(res.data, t('搜索密钥失败'))
  return { items: data?.items ?? [], total: data?.total ?? 0 }
}

export async function getKey(id: number): Promise<KeyDetail> {
  const res = await api.get<ApiEnvelope<KeyDetail>>(`/api/token/${id}`)
  return unwrap(res.data, t('密钥加载失败'))
}

/** Creates one key; the reply is the masked key (older servers may send nothing). */
export async function addKey(payload: KeyPayload): Promise<KeyDetail | null> {
  const res = await api.post<ApiEnvelope<KeyDetail | null>>('/api/token/', payload)
  return unwrap(res.data, t('创建失败'))
}

/** Saves every field of an existing key (the server overwrites them all). */
export async function updateKey(id: number, payload: KeyPayload): Promise<void> {
  const res = await api.put<ApiEnvelope<unknown>>('/api/token/', { ...payload, id })
  unwrap(res.data, t('保存失败'))
}

/** Deletes up to 100 keys; resolves to how many the server removed. */
export async function deleteKeys(ids: number[]): Promise<number> {
  const res = await api.post<ApiEnvelope<number>>('/api/token/batch', { ids })
  return unwrap(res.data, t('删除失败')) ?? ids.length
}

/** Full keys (sk-…) of up to 100 keys, by id. */
export async function revealKeys(ids: number[]): Promise<Record<number, string>> {
  const res = await api.post<ApiEnvelope<{ keys?: Record<string, string> }>>('/api/token/batch/keys', { ids })
  const data = unwrap(res.data, t('获取密钥失败'))
  const keys: Record<number, string> = {}
  for (const [id, key] of Object.entries(data?.keys ?? {})) keys[Number(id)] = withKeyPrefix(key)
  return keys
}

const BATCH = 100

/**
 * Deletes every key of the account. All ids are collected first: deleting while
 * paging would shift later keys onto pages already read and leave them active.
 */
export async function deleteAllKeys(): Promise<number> {
  const ids = new Set<number>()
  for (let page = 1; ; page++) {
    const data = await listKeys(page, BATCH)
    for (const item of data.items) ids.add(item.id)
    if (page * BATCH >= data.total) break
    if (data.items.length === 0) throw new Error(t('密钥加载失败'))
  }
  const all = [...ids]
  for (let index = 0; index < all.length; index += BATCH) await deleteKeys(all.slice(index, index + BATCH))
  const rest = await listKeys(1, 1)
  if (rest.total !== 0) throw new Error(t('仍有密钥未删除，请重试'))
  return all.length
}

/** A group the account may put keys in; `ratio` is null for auto, which has none of its own. */
export type UserGroup = { name: string; desc: string; ratio: number | null }

export async function getUserGroups(): Promise<UserGroup[]> {
  const res = await api.get<ApiEnvelope<Record<string, { desc?: unknown; ratio?: unknown }> | null>>('/api/user/self/groups')
  const data = unwrap(res.data, t('分组加载失败'))
  return Object.entries(data ?? {}).map(([name, info]) => ({
    name,
    desc: typeof info?.desc === 'string' ? info.desc : '',
    ratio: typeof info?.ratio === 'number' && Number.isFinite(info.ratio) ? info.ratio : null,
  }))
}

/** The account's global auto order and how many groups a key's own order may hold. */
export type AutoGroupConfig = { groups: string[]; max: number }

export async function getAutoGroupConfig(): Promise<AutoGroupConfig> {
  const res = await api.get<ApiEnvelope<{ groups?: string[] | null; max_count?: number } | null>>('/api/token/auto-groups')
  const data = unwrap(res.data, t('分组加载失败'))
  const max = Number(data?.max_count)
  return { groups: Array.isArray(data?.groups) ? data.groups : [], max: Number.isInteger(max) && max > 0 ? max : 5 }
}

/** Models the account may call, for the model limit picker. */
export async function getUserModels(): Promise<string[]> {
  const res = await api.get<ApiEnvelope<unknown>>('/api/user/models')
  const data = unwrap(res.data, t('模型列表加载失败'))
  return Array.isArray(data) ? data.filter((item): item is string => typeof item === 'string') : []
}
