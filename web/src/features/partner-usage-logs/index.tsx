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
import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout/components/section-page-layout'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { CompactDateTimeRangePicker } from '@/features/usage-logs/components/compact-date-time-range-picker'
import { UserTenantFilter } from '@/features/users/components/users-tenant-filter'
import { formatTimestamp } from '@/lib/format'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import {
  classifyPartnerUsageLogError,
  getPartnerUsageLogStat,
  getPartnerUsageTenantOptions,
  listPartnerUsageLogs,
} from './api'
import { buildPartnerUsageColumns } from './components/columns'
import { PartnerUsageDetailDialog } from './components/detail-dialog'
import { PartnerUsageSummary } from './components/summary'
import {
  DEFAULT_PAGE_SIZE,
  isCanonicalId,
  isModelNameFilter,
  isRequestIdFilter,
  isUsernameFilter,
  resolveFilters,
  type PartnerUsageLogType,
  type PartnerUsageLogsSearch,
} from './lib/filters'
import type { PartnerUsageLog } from './types'

const EMPTY_LOGS: PartnerUsageLog[] = []

type PartnerUsageLogsProps = {
  /** Validated URL state (filters, window and page). */
  search: PartnerUsageLogsSearch
  /** Replaces the URL state; the next request follows the new state. */
  onSearchChange: (next: PartnerUsageLogsSearch) => void
}

type Draft = {
  userId: string
  username: string
  model: string
  requestId: string
  start?: number
  end?: number
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function draftFromSearch(search: PartnerUsageLogsSearch): Draft {
  return {
    userId: search.userId ?? '',
    username: search.username ?? '',
    model: search.model ?? '',
    requestId: search.requestId ?? '',
    start: search.start,
    end: search.end,
  }
}

function draftSignature(search: PartnerUsageLogsSearch): string {
  return JSON.stringify(draftFromSearch(search))
}

/** Drops unset keys so the URL carries only the active filters. */
function compactSearch(search: PartnerUsageLogsSearch): PartnerUsageLogsSearch {
  return Object.fromEntries(
    Object.entries(search).filter(([, value]) => value !== undefined)
  ) as PartnerUsageLogsSearch
}

/**
 * Administrator page of the dedicated merchant usage store: read-only list
 * and totals for one shared filter and one explicit time window.
 */
export function PartnerUsageLogs({
  search,
  onSearchChange,
}: PartnerUsageLogsProps) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const sessionId = useAuthStore((state) => state.auth.session?.sid)
  const accessToken = useAuthStore((state) => state.auth.accessToken)
  const canRead =
    !!user && !!sessionId && !!accessToken && user.role >= ROLE.ADMIN

  // End of the default window. Fixed per search so the list and the totals
  // are requested with exactly the same explicit pair.
  // A new end chosen together with a URL change is adopted when that change
  // arrives (a navigation commits later), so nothing is requested for the
  // old filter with the new window.
  const [windowAnchor, setWindowAnchor] = useState(() => ({
    anchor: nowSeconds(),
    pending: undefined as number | undefined,
    search,
  }))
  let anchor = windowAnchor.anchor
  if (windowAnchor.search !== search) {
    anchor = windowAnchor.pending ?? windowAnchor.anchor
    setWindowAnchor({ anchor, pending: undefined, search })
  }
  const reAnchor = (next: number, withUrlChange: boolean) =>
    setWindowAnchor((current) =>
      withUrlChange
        ? { ...current, pending: next }
        : { ...current, anchor: next, pending: undefined }
    )
  const filters = useMemo(
    () => resolveFilters(search, anchor),
    [search, anchor]
  )
  const page = search.page ?? 1
  const pageSize = search.pageSize ?? DEFAULT_PAGE_SIZE

  const [draft, setDraft] = useState(() => draftFromSearch(search))
  const signature = draftSignature(search)
  const [syncedSignature, setSyncedSignature] = useState(signature)
  if (syncedSignature !== signature) {
    // The URL changed elsewhere (deep link, back/forward): follow it.
    setSyncedSignature(signature)
    setDraft(draftFromSearch(search))
  }

  const [selected, setSelected] = useState<PartnerUsageLog | null>(null)

  const userIdText = draft.userId.trim()
  const usernameText = draft.username.trim()
  const modelText = draft.model.trim()
  const requestIdText = draft.requestId.trim()
  const invalidUserId = userIdText !== '' && !isCanonicalId(userIdText)
  const invalidUsername = usernameText !== '' && !isUsernameFilter(usernameText)
  const invalidModel = modelText !== '' && !isModelNameFilter(modelText)
  const invalidRequestId =
    requestIdText !== '' && !isRequestIdFilter(requestIdText)
  const invalidRange =
    draft.start !== undefined &&
    draft.end !== undefined &&
    draft.start > draft.end
  const invalidDraft =
    invalidUserId ||
    invalidUsername ||
    invalidModel ||
    invalidRequestId ||
    invalidRange

  // Viewer (id, role, session) + every filter, the window and the page: data
  // cached for another viewer or filter is never reused for this one.
  const viewerKey = `${user?.id ?? ''}:${user?.role ?? ''}:${sessionId ?? ''}`
  const listQuery = useQuery({
    queryKey: [
      'admin',
      'partner-usage-logs',
      'list',
      viewerKey,
      filters,
      page,
      pageSize,
    ],
    queryFn: () => listPartnerUsageLogs(filters, page, pageSize),
    enabled: canRead,
    // Rows are shown only after a read made by this mount, so a revisited
    // page or filter must be read again instead of resting on fresh cache
    // (which would render as an empty window).
    staleTime: 0,
    refetchOnMount: 'always',
    // The totals scan the whole window; do not repeat it on every focus.
    refetchOnWindowFocus: false,
    retry: false,
    meta: { errorToast: false },
  })
  const statQuery = useQuery({
    queryKey: ['admin', 'partner-usage-logs', 'stat', viewerKey, filters],
    queryFn: () => getPartnerUsageLogStat(filters),
    enabled: canRead,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    retry: false,
    meta: { errorToast: false },
  })

  const columns = useMemo(() => buildPartnerUsageColumns(t, setSelected), [t])

  const showRows =
    canRead && listQuery.isFetchedAfterMount && !listQuery.isError
  const showStat =
    canRead && statQuery.isFetchedAfterMount && !statQuery.isError
  const isLoadingRows =
    listQuery.isPending ||
    (listQuery.isFetching && !listQuery.isFetchedAfterMount)

  const applySearch = (patch: Partial<PartnerUsageLogsSearch>) => {
    // Any filter change returns to page 1 in the same URL update, so the
    // next request is already for the first page.
    onSearchChange(compactSearch({ ...search, ...patch, page: undefined }))
  }

  const { table } = useDataTable({
    data: showRows ? (listQuery.data?.items ?? EMPTY_LOGS) : EMPTY_LOGS,
    columns,
    getRowId: (log) => log.event_id || log.id,
    totalCount: showRows ? (listQuery.data?.total ?? 0) : 0,
    pagination: { pageIndex: page - 1, pageSize },
    onPaginationChange: (updater) => {
      if (!canRead) return
      const current = { pageIndex: page - 1, pageSize }
      const next = typeof updater === 'function' ? updater(current) : updater
      const nextPage = next.pageSize === pageSize ? next.pageIndex + 1 : 1
      onSearchChange(
        compactSearch({
          ...search,
          page: nextPage > 1 ? nextPage : undefined,
          pageSize:
            next.pageSize === DEFAULT_PAGE_SIZE ? undefined : next.pageSize,
        })
      )
    },
    enableRowSelection: false,
    enableSorting: false,
    manualFiltering: true,
    manualPagination: true,
  })

  if (!canRead) {
    return <ErrorState title={t('Access denied')} />
  }

  const refetchAll = () => {
    void listQuery.refetch()
    void statQuery.refetch()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (invalidDraft) return
    const next = compactSearch({
      ...search,
      userId: userIdText || undefined,
      username: usernameText || undefined,
      model: modelText || undefined,
      requestId: requestIdText || undefined,
      start: draft.start,
      end: draft.end,
      page: undefined,
    })
    const unchanged =
      JSON.stringify(next) === JSON.stringify(compactSearch(search))
    const explicitWindow = next.start !== undefined && next.end !== undefined
    const nextAnchor = nowSeconds()
    // A rolling default window is re-anchored to now on every search.
    if (!explicitWindow) reAnchor(nextAnchor, !unchanged)
    onSearchChange(next)
    if (unchanged && (explicitWindow || nextAnchor === anchor)) refetchAll()
  }

  const reset = () => {
    const next = compactSearch({ pageSize: search.pageSize })
    const unchanged =
      JSON.stringify(next) === JSON.stringify(compactSearch(search))
    reAnchor(nowSeconds(), !unchanged)
    setDraft(draftFromSearch({}))
    onSearchChange(next)
  }

  const failure = listQuery.error ?? statQuery.error
  let failureText = ''
  if (failure) {
    const classified = classifyPartnerUsageLogError(failure)
    if (classified.kind === 'range') {
      failureText = t('The time range cannot exceed {{days}} days', {
        days: classified.days,
      })
    } else if (classified.kind === 'invalid') {
      failureText = t('Invalid parameters')
    } else if (classified.kind === 'unavailable') {
      failureText = t('Database error, please contact the administrator')
    } else {
      failureText = t('Failed to load merchant usage logs')
    }
  }

  // Effective window as reported by the server, else the one requested.
  const effective = (showRows && listQuery.data) ||
    (showStat && statQuery.data) || {
      start_timestamp: filters.start,
      end_timestamp: filters.end,
    }

  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>
        {t('Merchant usage logs')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='flex h-full min-h-0 flex-col'>
          <DataTablePage
            table={table}
            columns={columns}
            isLoading={isLoadingRows}
            isFetching={listQuery.isFetching}
            emptyTitle={
              listQuery.isError
                ? t('Failed to load merchant usage logs')
                : t('No merchant usage records in this window')
            }
            // A failed read is not an empty window: no "expected empty" hint.
            emptyDescription={
              listQuery.isError
                ? undefined
                : t(
                    'An empty result is expected until merchant usage logging is cut over to the dedicated store; it does not mean the merchant had no earlier usage.'
                  )
            }
            className='min-h-0 flex-1'
            toolbar={
              <div className='shrink-0 space-y-2'>
                <Alert data-testid='partner-usage-scope-notice'>
                  <AlertDescription>
                    {t(
                      'Only merchant records written to the dedicated store after the cut-over appear here. Earlier merchant records remain on the default usage logs page and are not migrated, so this history is not complete.'
                    )}
                  </AlertDescription>
                </Alert>
                {(listQuery.isPending || statQuery.isPending) && (
                  <span role='status' className='sr-only'>
                    {t('Loading...')}
                  </span>
                )}
                <form className='space-y-2' onSubmit={submit} noValidate>
                  <div className='flex flex-wrap items-center gap-2'>
                    <UserTenantFilter
                      value={search.tenant}
                      onChange={(tenantId) => applySearch({ tenant: tenantId })}
                      viewerKey={viewerKey}
                      fetchOptions={getPartnerUsageTenantOptions}
                      queryScope='partner-usage-logs'
                    />
                    <Combobox
                      aria-label={t('Type')}
                      className='w-40'
                      options={[
                        { value: 'all', label: t('All types') },
                        { value: 'consume', label: t('Consume') },
                        { value: 'error', label: t('Error') },
                      ]}
                      value={search.type ?? 'all'}
                      onValueChange={(value) =>
                        applySearch({
                          type:
                            value === 'consume' || value === 'error'
                              ? (value as PartnerUsageLogType)
                              : undefined,
                        })
                      }
                    />
                    <CompactDateTimeRangePicker
                      start={
                        draft.start ? new Date(draft.start * 1000) : undefined
                      }
                      end={draft.end ? new Date(draft.end * 1000) : undefined}
                      onChange={({ start, end }) =>
                        setDraft((current) => ({
                          ...current,
                          start: start
                            ? Math.floor(start.getTime() / 1000)
                            : undefined,
                          end: end
                            ? Math.floor(end.getTime() / 1000)
                            : undefined,
                        }))
                      }
                    />
                  </div>
                  <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-4'>
                    <Input
                      aria-label={t('User ID')}
                      placeholder={t('User ID')}
                      inputMode='numeric'
                      value={draft.userId}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          userId: event.target.value,
                        }))
                      }
                      aria-invalid={invalidUserId}
                    />
                    <Input
                      aria-label={t('Username')}
                      placeholder={t('Username')}
                      value={draft.username}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          username: event.target.value,
                        }))
                      }
                      aria-invalid={invalidUsername}
                    />
                    <Input
                      aria-label={t('Model name')}
                      placeholder={t('Model name')}
                      value={draft.model}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          model: event.target.value,
                        }))
                      }
                      aria-invalid={invalidModel}
                    />
                    <Input
                      aria-label={t('Request ID')}
                      placeholder={t('Request ID')}
                      value={draft.requestId}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          requestId: event.target.value,
                        }))
                      }
                      aria-invalid={invalidRequestId}
                    />
                  </div>
                  <div className='flex flex-wrap items-center gap-2'>
                    <Button type='submit' disabled={invalidDraft}>
                      {t('Search')}
                    </Button>
                    <Button type='button' variant='outline' onClick={reset}>
                      {t('Reset')}
                    </Button>
                    <span
                      className='text-muted-foreground text-xs'
                      data-testid='partner-usage-window'
                    >
                      {t('Effective window: {{start}} – {{end}}', {
                        start: formatTimestamp(effective.start_timestamp),
                        end: formatTimestamp(effective.end_timestamp),
                      })}
                    </span>
                  </div>
                </form>
                {invalidDraft && (
                  <Alert variant='destructive'>
                    <AlertDescription>
                      {t('Check the user ID, text filters and time range.')}
                    </AlertDescription>
                  </Alert>
                )}
                {failure && (
                  <Alert variant='destructive'>
                    <AlertDescription className='flex items-center justify-between gap-2'>
                      <span>{failureText}</span>
                      <Button variant='outline' size='sm' onClick={refetchAll}>
                        {t('Retry')}
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
                <PartnerUsageSummary
                  stat={showStat ? statQuery.data : undefined}
                />
              </div>
            }
          />
          {/* Inside the content slot: the layout renders only its slots. */}
          <PartnerUsageDetailDialog
            log={selected}
            onClose={() => setSelected(null)}
          />
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
