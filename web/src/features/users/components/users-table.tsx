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
import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type {
  ColumnFiltersState,
  OnChangeFn,
  SortingState,
} from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DISABLED_ROW_DESKTOP,
  DISABLED_ROW_MOBILE,
  DataTablePage,
  useDataTable,
} from '@/components/data-table'
import { listPartnerOAuthClients } from '@/features/partner-oauth-clients/api'
import { useMediaQuery } from '@/hooks'
import { useTableUrlState } from '@/hooks/use-table-url-state'
import {
  ADMIN_PERMISSION_ACTIONS,
  ADMIN_PERMISSION_RESOURCES,
  hasPermission,
} from '@/lib/admin-permissions'
import {
  createServerError,
  requireServerSuccess,
} from '@/lib/server-error-message'
import { useAuthStore } from '@/stores/auth-store'

import { getGroups, getUsers, searchUsers } from '../api'
import {
  USER_STATUS,
  getUserStatusOptions,
  getUserRoleOptions,
  isUserDeleted,
} from '../constants'
import {
  USER_CATEGORY_COLUMN_ID,
  USER_TENANT_COLUMN_ID,
  applyUserTenantFilterChange,
  normalizeUserTenantColumnFilters,
  readUserTenantFilter,
  resolveUserTenantFilter,
} from '../lib/tenant-filter'
import type { User, UserSortBy } from '../types'
import { DataTableBulkActions } from './data-table-bulk-actions'
import { useUsersColumns } from './users-columns'
import { useUsers } from './users-provider'
import { UserTenantFilter } from './users-tenant-filter'

const route = getRouteApi('/_authenticated/users/')

const USER_SORTABLE_COLUMNS = new Set<UserSortBy>([
  'id',
  'username',
  'quota',
  'group',
  'created_at',
  'last_login_at',
])

function isDisabledUserRow(user: User) {
  return isUserDeleted(user) || user.status === USER_STATUS.DISABLED
}

export function UsersTable() {
  const { t } = useTranslation()
  const columns = useUsersColumns()
  const { refreshTrigger } = useUsers()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const [sorting, setSorting] = useState<SortingState>([])

  const search = route.useSearch()
  const {
    globalFilter,
    onGlobalFilterChange,
    columnFilters: urlColumnFilters,
    onColumnFiltersChange: onUrlColumnFiltersChange,
    pagination,
    onPaginationChange,
    ensurePageInRange,
  } = useTableUrlState({
    search,
    navigate: route.useNavigate(),
    pagination: { defaultPage: 1, defaultPageSize: isMobile ? 10 : 20 },
    globalFilter: { enabled: true, key: 'filter' },
    columnFilters: [
      { columnId: 'status', searchKey: 'status', type: 'array' },
      { columnId: 'role', searchKey: 'role', type: 'array' },
      { columnId: 'group', searchKey: 'group', type: 'array' },
      { columnId: 'partner', searchKey: 'partner', type: 'array' },
      // Merchant (Tenant) dimension: its own URL keys, never the OAuth one.
      {
        columnId: USER_CATEGORY_COLUMN_ID,
        searchKey: 'userCategory',
        type: 'array',
      },
      { columnId: USER_TENANT_COLUMN_ID, searchKey: 'tenant', type: 'array' },
    ],
  })
  // Contradictory or hand-edited URL state is normalised before it reaches
  // the table or a request.
  const columnFilters = useMemo(
    () => normalizeUserTenantColumnFilters(urlColumnFilters),
    [urlColumnFilters]
  )
  const onColumnFiltersChange: OnChangeFn<ColumnFiltersState> = (updater) => {
    const next =
      typeof updater === 'function' ? updater(columnFilters) : updater
    // One navigation writes the filters and resets the page together.
    onUrlColumnFiltersChange(applyUserTenantFilterChange(next, columnFilters))
  }
  // The request reads the merchant filter from the same URL snapshot as the
  // page index, so a new filter is never requested with an old page.
  const urlCategory = search.userCategory?.[0]
  const urlTenantId = search.tenant?.[0]
  const tenantFilter = useMemo(
    () => resolveUserTenantFilter(urlCategory, urlTenantId),
    [urlCategory, urlTenantId]
  )
  const userCategoryParam =
    tenantFilter.category && tenantFilter.category !== 'all'
      ? tenantFilter.category
      : undefined
  const tenantIdParam = tenantFilter.tenantId
  const statusFilter =
    (columnFilters.find((filter) => filter.id === 'status')?.value as
      | string[]
      | undefined) ?? []
  const roleFilter =
    (columnFilters.find((filter) => filter.id === 'role')?.value as
      | string[]
      | undefined) ?? []
  const groupFilter =
    (columnFilters.find((filter) => filter.id === 'group')?.value as
      | string[]
      | undefined) ?? []

  const partnerFilter =
    (columnFilters.find((filter) => filter.id === 'partner')?.value as
      | string[]
      | undefined) ?? []
  const authUser = useAuthStore((state) => state.auth.user)
  const sessionId = useAuthStore((state) => state.auth.session?.sid)
  // Cached rows and options belong to one viewer (account, role, session).
  const viewerKey = `${authUser?.id ?? 0}:${authUser?.role ?? 0}:${sessionId ?? ''}`
  const canReadPartners = hasPermission(
    authUser,
    ADMIN_PERMISSION_RESOURCES.PARTNER_OAUTH_CLIENT,
    ADMIN_PERMISSION_ACTIONS.READ
  )
  const { data: partnerClients } = useQuery({
    queryKey: ['admin', 'partner-oauth-clients'],
    queryFn: listPartnerOAuthClients,
    enabled: canReadPartners,
    staleTime: 5 * 60 * 1000,
  })

  const { data: groupsData } = useQuery({
    queryKey: ['groups'],
    queryFn: async () => requireServerSuccess(await getGroups()),
    staleTime: 5 * 60 * 1000,
  })

  const sortParams = useMemo(() => {
    const activeSort = sorting[0]
    if (
      !activeSort ||
      !USER_SORTABLE_COLUMNS.has(activeSort.id as UserSortBy)
    ) {
      return {}
    }

    return {
      sort_by: activeSort.id as UserSortBy,
      sort_order: activeSort.desc ? 'desc' : 'asc',
    } as const
  }, [sorting])

  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    setSorting(updater)
    if (pagination.pageIndex > 0) {
      onPaginationChange({ ...pagination, pageIndex: 0 })
    }
  }

  // Placeholder scope: viewer plus the merchant (Tenant) dimension only.
  // Rows cached for another viewer or another merchant filter are never
  // shown as placeholder data. Every pre-existing input (keyword, status,
  // role, group, OAuth partner, page, page size, sort, refresh) keeps the
  // previous rows while loading, exactly as before this dimension existed.
  const placeholderScope = JSON.stringify([
    viewerKey,
    userCategoryParam ?? '',
    tenantIdParam ?? '',
  ])

  // Fetch data with React Query
  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      'users',
      placeholderScope,
      pagination.pageIndex + 1,
      pagination.pageSize,
      globalFilter,
      statusFilter,
      roleFilter,
      groupFilter,
      partnerFilter,
      sortParams,
      refreshTrigger,
    ],
    queryFn: async () => {
      const hasFilter = globalFilter?.trim()
      const hasColumnFilter =
        statusFilter.length > 0 ||
        roleFilter.length > 0 ||
        groupFilter.length > 0 ||
        partnerFilter.length > 0
      const params = {
        p: pagination.pageIndex + 1,
        page_size: pagination.pageSize,
        ...sortParams,
        // Sent on both endpoints when set and omitted when unset.
        ...(userCategoryParam ? { user_category: userCategoryParam } : {}),
        ...(tenantIdParam ? { tenant_id: tenantIdParam } : {}),
      }

      const result =
        hasFilter || hasColumnFilter
          ? await searchUsers({
              ...params,
              keyword: globalFilter,
              status: statusFilter[0] ?? '',
              role: roleFilter[0] ?? '',
              group: groupFilter[0] ?? '',
              partner: partnerFilter[0] ?? '',
            })
          : await getUsers(params)

      if (!result.success) {
        throw createServerError(
          result,
          t(hasFilter ? 'Failed to search users' : 'Failed to load users')
        )
      }

      return {
        items: result.data?.items || [],
        total: result.data?.total || 0,
      }
    },
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[1] === placeholderScope
        ? previousData
        : undefined,
  })

  const users = data?.items || []

  const { table } = useDataTable({
    data: users,
    columns,
    enableRowSelection: true,
    columnFilters,
    globalFilter,
    pagination,
    sorting,
    globalFilterFn: (row, _columnId, filterValue) => {
      const searchValue = String(filterValue).toLowerCase()
      const fields = [
        row.getValue('username'),
        row.original.display_name,
        row.original.email,
      ]
      return fields.some((field) =>
        String(field || '')
          .toLowerCase()
          .includes(searchValue)
      )
    },
    onPaginationChange,
    onGlobalFilterChange,
    onColumnFiltersChange,
    onSortingChange: handleSortingChange,
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
    totalCount: data?.total || 0,
    ensurePageInRange,
  })

  return (
    <DataTablePage
      table={table}
      columns={columns}
      isLoading={isLoading}
      isFetching={isFetching}
      emptyTitle={t('No Users Found')}
      emptyDescription={t(
        'No users available. Try adjusting your search or filters.'
      )}
      skeletonKeyPrefix='users-skeleton'
      applyHeaderSize
      toolbarProps={{
        searchPlaceholder: t('Filter by username, name or email...'),
        searchDebounceMs: 500,
        additionalSearch: (
          <UserTenantFilter
            value={readUserTenantFilter(columnFilters).tenantId}
            onChange={(tenantId) =>
              onColumnFiltersChange((current) => [
                ...current.filter(
                  (filter) => filter.id !== USER_TENANT_COLUMN_ID
                ),
                ...(tenantId
                  ? [{ id: USER_TENANT_COLUMN_ID, value: [tenantId] }]
                  : []),
              ])
            }
            viewerKey={viewerKey}
          />
        ),
        filters: [
          {
            columnId: USER_CATEGORY_COLUMN_ID,
            title: t('User category'),
            options: [
              { label: t('All users'), value: 'all' },
              { label: t('Ordinary user'), value: 'ordinary' },
              { label: t('Merchant user'), value: 'merchant' },
            ],
            singleSelect: true,
          },
          {
            columnId: 'status',
            title: t('Status'),
            options: getUserStatusOptions(t),
            singleSelect: true,
          },
          {
            columnId: 'role',
            title: t('Role'),
            options: getUserRoleOptions(t),
            singleSelect: true,
          },
          {
            columnId: 'group',
            title: t('User Group'),
            options: (groupsData?.data ?? []).map((group) => ({
              label: group,
              value: group,
            })),
            singleSelect: true,
          },
          ...(canReadPartners
            ? [
                {
                  columnId: 'partner',
                  title: t('Partner'),
                  options: (partnerClients ?? []).map((client) => ({
                    label: client.name,
                    value: client.client_id,
                  })),
                  singleSelect: true,
                },
              ]
            : []),
        ],
      }}
      getRowClassName={(row, { isMobile }) => {
        if (!isDisabledUserRow(row.original)) return undefined
        return isMobile ? DISABLED_ROW_MOBILE : DISABLED_ROW_DESKTOP
      }}
      bulkActions={<DataTableBulkActions table={table} />}
    />
  )
}
