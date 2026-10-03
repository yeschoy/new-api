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

/** The groups the account may use, each with its description and price multiplier. */
export type UserGroups = Record<string, { desc: string; ratio: number | string }>

/** The models the signed-in account can call: across its usable groups, or within one group. */
export async function getUserModels(group?: string): Promise<string[]> {
  const res = await api.get<ApiEnvelope<string[] | null>>('/api/user/models', group ? { params: { group } } : undefined)
  return unwrap(res.data, t('请求失败')) ?? []
}

export async function getUserGroups(): Promise<UserGroups> {
  const res = await api.get<ApiEnvelope<UserGroups | null>>('/api/user/self/groups')
  return unwrap(res.data, t('请求失败')) ?? {}
}
