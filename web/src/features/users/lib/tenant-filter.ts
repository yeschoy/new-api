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
import type { ColumnFiltersState } from '@tanstack/react-table'

/** Table column / filter ids of the merchant (Tenant) dimension. */
export const USER_CATEGORY_COLUMN_ID = 'user_category'
export const USER_TENANT_COLUMN_ID = 'partner_tenant'

export const USER_CATEGORIES = ['all', 'ordinary', 'merchant'] as const
export type UserCategory = (typeof USER_CATEGORIES)[number]

const MAX_INT64 = '9223372036854775807'

/**
 * Merchant IDs are signed 64-bit integers that can exceed 2^53, so they stay
 * decimal strings end to end and are validated without numeric conversion.
 */
export function isCanonicalTenantId(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,18}$/.test(value)) return false
  return value.length < MAX_INT64.length || value <= MAX_INT64
}

export function isUserCategory(value: unknown): value is UserCategory {
  return (
    typeof value === 'string' &&
    (USER_CATEGORIES as readonly string[]).includes(value)
  )
}

export type UserTenantFilter = {
  category?: UserCategory
  tenantId?: string
}

/**
 * Normalises a possibly hand-edited filter pair. Invalid values are dropped,
 * `ordinary` never keeps a merchant, and a merchant implies `merchant`.
 */
export function resolveUserTenantFilter(
  category: unknown,
  tenantId: unknown
): UserTenantFilter {
  const resolved: UserTenantFilter = {}
  if (isUserCategory(category)) resolved.category = category
  if (isCanonicalTenantId(tenantId) && resolved.category !== 'ordinary') {
    resolved.tenantId = tenantId
    resolved.category = 'merchant'
  }
  return resolved
}

function firstValue(filters: ColumnFiltersState, id: string): unknown {
  const value = filters.find((filter) => filter.id === id)?.value
  return Array.isArray(value) && value.length === 1 ? value[0] : undefined
}

export function readUserTenantFilter(
  filters: ColumnFiltersState
): UserTenantFilter {
  return resolveUserTenantFilter(
    firstValue(filters, USER_CATEGORY_COLUMN_ID),
    firstValue(filters, USER_TENANT_COLUMN_ID)
  )
}

function writeUserTenantFilter(
  filters: ColumnFiltersState,
  resolved: UserTenantFilter
): ColumnFiltersState {
  const next = filters.filter(
    (filter) =>
      filter.id !== USER_CATEGORY_COLUMN_ID &&
      filter.id !== USER_TENANT_COLUMN_ID
  )
  if (resolved.category) {
    next.push({ id: USER_CATEGORY_COLUMN_ID, value: [resolved.category] })
  }
  if (resolved.tenantId) {
    next.push({ id: USER_TENANT_COLUMN_ID, value: [resolved.tenantId] })
  }
  return next
}

/** Normalised copy of the table filters (other filters are kept untouched). */
export function normalizeUserTenantColumnFilters(
  filters: ColumnFiltersState
): ColumnFiltersState {
  return writeUserTenantFilter(filters, readUserTenantFilter(filters))
}

/**
 * Applies the interaction rules to a filter change: picking a merchant
 * switches the category to `merchant`; moving the category away from
 * `merchant` (ordinary, all or cleared) clears the merchant.
 */
export function applyUserTenantFilterChange(
  next: ColumnFiltersState,
  previous: ColumnFiltersState
): ColumnFiltersState {
  const before = readUserTenantFilter(previous)
  const category = firstValue(next, USER_CATEGORY_COLUMN_ID)
  const tenantId = firstValue(next, USER_TENANT_COLUMN_ID)
  const pickedMerchant =
    isCanonicalTenantId(tenantId) && tenantId !== before.tenantId
  if (pickedMerchant) {
    return writeUserTenantFilter(next, { category: 'merchant', tenantId })
  }
  if (category !== before.category && category !== 'merchant') {
    return writeUserTenantFilter(
      next,
      resolveUserTenantFilter(category, undefined)
    )
  }
  return writeUserTenantFilter(
    next,
    resolveUserTenantFilter(category, tenantId)
  )
}
