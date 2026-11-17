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
import type {
  ApiResponse,
  GetUserTenantOptionsParams,
  UserTenantOptions,
} from '@/features/users/types'
import { api } from '@/lib/api'
import {
  createServerError,
  getServerErrorSources,
  getServerErrorStatus,
} from '@/lib/server-error-message'

import { buildFilterParams, type PartnerUsageLogFilters } from './lib/filters'
import {
  partnerUsageLogPageSchema,
  partnerUsageLogStatSchema,
  type PartnerUsageLogPage,
  type PartnerUsageLogStat,
} from './types'

// Administrator read endpoints of the dedicated merchant usage store. The
// root-only management API (/api/partner-tenants) is never called from here.
const LIST_URL = '/api/log/partner-tenants'
const STAT_URL = '/api/log/partner-tenants/stat'
const OPTIONS_URL = '/api/log/partner-tenants/options'

type Envelope = { success?: boolean; message?: string; data?: unknown }

function unwrap(envelope: Envelope): unknown {
  if (!envelope.success || envelope.data === undefined) {
    throw createServerError(envelope, 'Failed to load merchant usage logs')
  }
  return envelope.data
}

/** Paged records. `total` counts records (rows), not folded requests. */
export async function listPartnerUsageLogs(
  filters: PartnerUsageLogFilters,
  page: number,
  pageSize: number
): Promise<PartnerUsageLogPage> {
  const response = await api.get<Envelope>(LIST_URL, {
    params: {
      ...buildFilterParams(filters),
      p: String(page),
      page_size: String(pageSize),
    },
  })
  return partnerUsageLogPageSchema.parse(unwrap(response.data))
}

/**
 * Aggregates for exactly the list filter. The endpoint rejects `p` and
 * `page_size`, so only the shared filter parameters are sent.
 */
export async function getPartnerUsageLogStat(
  filters: PartnerUsageLogFilters
): Promise<PartnerUsageLogStat> {
  const response = await api.get<Envelope>(STAT_URL, {
    params: buildFilterParams(filters),
  })
  return partnerUsageLogStatSchema.parse(unwrap(response.data))
}

/** Log-side safe merchant options (id and name only, disabled included). */
export async function getPartnerUsageTenantOptions(
  params: GetUserTenantOptionsParams = {}
): Promise<ApiResponse<UserTenantOptions>> {
  const query: Record<string, string | number> = {}
  if (params.q) query.q = params.q
  if (params.p) query.p = params.p
  if (params.page_size) query.page_size = params.page_size
  if (params.selected_id) query.selected_id = params.selected_id
  const response = await api.get(OPTIONS_URL, { params: query })
  return response.data
}

export type PartnerUsageLogError =
  | { kind: 'range'; days: number }
  | { kind: 'invalid' }
  | { kind: 'unavailable' }
  | { kind: 'unknown' }

/** Classifies a failed read into the documented error cases. */
export function classifyPartnerUsageLogError(
  error: unknown
): PartnerUsageLogError {
  const status = getServerErrorStatus(error)
  if (status === 400) {
    for (const source of getServerErrorSources(error)) {
      // The over-long window body is { message, message_key,
      // message_params: { days } }; `days` is a small JSON integer.
      const params = source.message_params
      const days =
        params && typeof params === 'object'
          ? (params as Record<string, unknown>).days
          : undefined
      if (typeof days === 'number' && Number.isFinite(days) && days > 0) {
        return { kind: 'range', days }
      }
    }
    return { kind: 'invalid' }
  }
  if (status === 503) return { kind: 'unavailable' }
  return { kind: 'unknown' }
}
