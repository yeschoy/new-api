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
import z from 'zod'

import { isCanonicalTenantId } from '@/features/users/lib/tenant-filter'

/** Canonical positive signed-int64 decimal text; never converted to Number. */
export const isCanonicalId = isCanonicalTenantId

export const PARTNER_USAGE_LOG_TYPES = ['consume', 'error'] as const
export type PartnerUsageLogType = (typeof PARTNER_USAGE_LOG_TYPES)[number]

/** Default window: the statistics endpoint scans the whole window. */
export const DEFAULT_WINDOW_SECONDS = 24 * 60 * 60
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

const USERNAME_MAX_BYTES = 191
const MODEL_NAME_MAX_BYTES = 255
const REQUEST_ID_MAX_BYTES = 64

const encoder = new TextEncoder()

/** Non-empty text without control characters, bounded by its UTF-8 size. */
export function isFilterText(value: unknown, maxBytes: number): boolean {
  if (typeof value !== 'string' || value === '' || value !== value.trim()) {
    return false
  }
  // oxlint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value)) return false
  return encoder.encode(value).length <= maxBytes
}

export const isUsernameFilter = (value: unknown) =>
  isFilterText(value, USERNAME_MAX_BYTES)
export const isModelNameFilter = (value: unknown) =>
  isFilterText(value, MODEL_NAME_MAX_BYTES)
export const isRequestIdFilter = (value: unknown) =>
  isFilterText(value, REQUEST_ID_MAX_BYTES)

const timestampSchema = z.number().int().positive().max(253402300799)

/**
 * URL state of the merchant usage page. IDs are strings: a hand-typed
 * unquoted number is parsed by the router as a Number and dropped here
 * instead of being rounded and sent.
 */
export const partnerUsageLogsSearchSchema = z.object({
  page: z.number().int().min(1).max(1000000).optional().catch(undefined),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .optional()
    .catch(undefined),
  tenant: z.string().refine(isCanonicalId).optional().catch(undefined),
  userId: z.string().refine(isCanonicalId).optional().catch(undefined),
  username: z.string().refine(isUsernameFilter).optional().catch(undefined),
  model: z.string().refine(isModelNameFilter).optional().catch(undefined),
  requestId: z.string().refine(isRequestIdFilter).optional().catch(undefined),
  type: z.enum(PARTNER_USAGE_LOG_TYPES).optional().catch(undefined),
  start: timestampSchema.optional().catch(undefined),
  end: timestampSchema.optional().catch(undefined),
})

export type PartnerUsageLogsSearch = z.infer<
  typeof partnerUsageLogsSearchSchema
>

/** Filter shared by the list and the statistics; the window is explicit. */
export type PartnerUsageLogFilters = {
  tenantId?: string
  userId?: string
  username?: string
  modelName?: string
  requestId?: string
  type?: PartnerUsageLogType
  start: number
  end: number
}

/**
 * Resolves the explicit window sent to both endpoints. Without a complete
 * valid pair in the URL it is the recent default ending at `anchor`.
 */
export function resolveWindow(
  search: Pick<PartnerUsageLogsSearch, 'start' | 'end'>,
  anchor: number
): { start: number; end: number } {
  const end = search.end ?? anchor
  const start = search.start ?? Math.max(1, end - DEFAULT_WINDOW_SECONDS)
  if (start > end) {
    return { start: Math.max(1, anchor - DEFAULT_WINDOW_SECONDS), end: anchor }
  }
  return { start, end }
}

export function resolveFilters(
  search: PartnerUsageLogsSearch,
  anchor: number
): PartnerUsageLogFilters {
  return {
    tenantId: search.tenant,
    userId: search.userId,
    username: search.username,
    modelName: search.model,
    requestId: search.requestId,
    type: search.type,
    ...resolveWindow(search, anchor),
  }
}

/**
 * Query parameters of the shared filter. Unset values are omitted because the
 * server rejects empty parameters; every value is sent as its exact text.
 */
export function buildFilterParams(
  filters: PartnerUsageLogFilters
): Record<string, string> {
  const params: Record<string, string> = {}
  if (filters.tenantId) params.tenant_id = filters.tenantId
  if (filters.userId) params.user_id = filters.userId
  if (filters.username) params.username = filters.username
  if (filters.modelName) params.model_name = filters.modelName
  if (filters.requestId) params.request_id = filters.requestId
  if (filters.type) params.type = filters.type
  params.start_timestamp = String(filters.start)
  params.end_timestamp = String(filters.end)
  return params
}

/** True for decimal text that is zero ("0", "0.000000"). */
export function isZeroDecimal(value: string): boolean {
  return /^0*(\.0*)?$/.test(value)
}

export type CnyDisplay =
  | { kind: 'unavailable' }
  | { kind: 'below-minimum' }
  | { kind: 'amount'; amount: string }

/**
 * Display state of a CNY equivalent. A missing amount is never shown as zero
 * and a positive raw quota that rounds to zero is never shown as free.
 */
export function resolveCnyDisplay(
  amount: string | null | undefined,
  rawQuota: string
): CnyDisplay {
  if (amount === null || amount === undefined || amount === '') {
    return { kind: 'unavailable' }
  }
  if (isZeroDecimal(amount) && !isZeroDecimal(rawQuota)) {
    return { kind: 'below-minimum' }
  }
  return { kind: 'amount', amount }
}
