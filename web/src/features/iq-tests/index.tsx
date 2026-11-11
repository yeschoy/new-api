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
import {
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Dialog } from '@/components/dialog'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { Main } from '@/components/layout/components/main'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { hasPermission } from '@/lib/admin-permissions'
import { handleServerError } from '@/lib/handle-server-error'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { deleteIQConfig, runIQTests } from './api'
import { IQPreview } from './preview'
import {
  iqKeys,
  isCurrentIQScope,
  useIQResults,
  useIQScopeCleanup,
  useIQViewerScope,
} from './queries'
import { IQResultCard, IQStatusLabel, IQTime } from './result-card'
import { IQSettings } from './settings'
import { artifactRevision, type IQResults } from './types'
import { useLiveIQPreviews } from './use-live-previews'

export function IQTestsPage() {
  const scope = useIQViewerScope()
  // Synchronous key changes unmount dialogs, form input, frames and observers
  // before another viewer can render. No previous-data placeholders are used.
  if (!scope) return null
  return <IQGallery key={scope} scope={scope} />
}

function IQGallery(props: { scope: string }) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const canRead = Boolean(
    user && user.role >= ROLE.ADMIN && hasPermission(user, 'channel', 'read')
  )
  const canWrite = Boolean(
    user && user.role >= ROLE.ADMIN && hasPermission(user, 'channel', 'write')
  )
  const canRun = Boolean(
    user && user.role >= ROLE.ADMIN && hasPermission(user, 'channel', 'operate')
  )
  const client = useQueryClient()
  const query = useIQResults(props.scope)
  useIQScopeCleanup(props.scope)
  const [selected, setSelected] = useState<string | null>(null)
  const [settings, setSettings] = useState<{
    group: string
    creating: boolean
  } | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [confirmRun, setConfirmRun] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{
    group: string
    version: number
  } | null>(null)
  const pages = query.isError ? undefined : query.data?.pages
  const data = pages?.[0]
    ? {
        ...pages[0],
        groups: [
          ...new Map(
            pages
              .flatMap((page) => page.groups)
              .map((row) => [`${row.task_id}\0${row.group}`, row])
          ).values(),
        ],
      }
    : undefined
  const firstRows = new Map<string, IQResults['groups'][number]>()
  for (const row of data?.groups ?? []) {
    if (!firstRows.has(row.group)) firstRows.set(row.group, row)
  }
  const groupRank = new Map(
    (data?.group_order ?? []).map((group, index) => [group, index])
  )
  const visibleRows = showHistory
    ? (data?.groups ?? [])
    : [...firstRows.values()].sort(
        (a, b) =>
          (groupRank.get(a.group) ?? groupRank.size) -
          (groupRank.get(b.group) ?? groupRank.size)
      )
  const results = visibleRows.flatMap((group) =>
    group.models.flatMap((card) => (card.latest ? [card.latest] : []))
  )
  const expanded = results.find(
    (result) =>
      result.status === 'success' && artifactRevision(result) === selected
  )
  const previews = useLiveIQPreviews(
    results
      .filter((result) => result.status === 'success')
      .map(artifactRevision),
    Boolean(expanded) ||
      settings !== null ||
      confirmRun !== null ||
      confirmDelete !== null ||
      !data
  )
  const run = useMutation({
    mutationFn: runIQTests,
    retry: false,
    onSuccess: (result) => {
      if (!isCurrentIQScope(props.scope)) return
      setConfirmRun(null)
      toast.success(
        result.created ? t('IQ run queued') : t('An IQ run is already active')
      )
      void client.invalidateQueries({ queryKey: iqKeys.results(props.scope) })
    },
  })
  const remove = useMutation({
    mutationFn: deleteIQConfig,
    retry: false,
    onSuccess: async (_, input) => {
      if (!isCurrentIQScope(props.scope)) return
      await client.cancelQueries({ queryKey: iqKeys.scope(props.scope) })
      if (!isCurrentIQScope(props.scope)) return
      setConfirmDelete(null)
      setSelected(null)
      client.removeQueries({
        queryKey: iqKeys.config(props.scope, input.group),
      })
      client.removeQueries({
        queryKey: [...iqKeys.scope(props.scope), 'artifact'],
      })
      client.setQueryData<InfiniteData<IQResults>>(
        iqKeys.results(props.scope),
        (previous) =>
          previous && {
            ...previous,
            pages: previous.pages.map((page) => ({
              ...page,
              groups: page.groups.filter((row) => row.group !== input.group),
            })),
          }
      )
      void client.invalidateQueries({ queryKey: iqKeys.configs(props.scope) })
      void client.invalidateQueries({ queryKey: iqKeys.results(props.scope) })
      toast.success(t('Deleted successfully'))
    },
    onError: (error) => handleServerError(error),
  })
  return (
    <Main className='min-w-0 overflow-y-auto'>
      <div className='mx-auto w-full max-w-7xl min-w-0 space-y-8 p-4 pb-16 sm:p-8'>
        <header className='flex flex-wrap items-start justify-between gap-4'>
          <div className='max-w-2xl space-y-2'>
            <h1 className='text-2xl font-semibold'>{t('IQ tests')}</h1>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Compare the latest HTML/SVG artwork from selected text models, grouped by routing group. Not a standardized IQ score.'
              )}
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button
              variant='outline'
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              {t('Refresh')}
            </Button>
            <Button
              variant='outline'
              onClick={() => setShowHistory((value) => !value)}
            >
              {showHistory ? t('Hide run history') : t('Show run history')}
            </Button>
            {canRead && (
              <Button
                variant='outline'
                onClick={() => setSettings({ group: '', creating: false })}
              >
                {t('IQ test settings')}
              </Button>
            )}
            {canRead && canWrite && (
              <Button
                onClick={() => setSettings({ group: '', creating: true })}
              >
                {t('New plan')}
              </Button>
            )}
          </div>
        </header>
        {query.isPending && <LoadingState />}
        {query.isError && <ErrorState onRetry={() => void query.refetch()} />}
        {data && (
          <>
            <section
              aria-label={t('Run status')}
              className='bg-card flex flex-wrap items-center gap-3 rounded-xl border p-4 text-sm'
            >
              <Badge variant='secondary'>
                {data.schedule_enabled
                  ? t('Schedule enabled')
                  : t('Schedule disabled')}
              </Badge>
              <p>
                {t('Next run')}: <IQTime seconds={data.next_run_at} /> ·{' '}
                {t('Beijing time')}
              </p>
            </section>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Each saved plan has one group row. Run history is hidden until opened. Times are shown in Beijing time.'
              )}
            </p>
            {data.groups.length === 0 && (
              <EmptyState
                title={t('No IQ results available')}
                description={t(
                  'Create and save a plan to show its group here. Available groups are not added automatically.'
                )}
              />
            )}
            <div ref={previews.root} className='space-y-8'>
              {visibleRows.map((group) => (
                <section
                  key={`${group.task_id}:${group.group}`}
                  className='min-w-0 space-y-4'
                  aria-label={group.group}
                >
                  <div className='flex flex-wrap items-center justify-between gap-3'>
                    <div className='space-y-1'>
                      <h2 className='text-xl font-semibold break-all'>
                        {group.group}
                      </h2>
                      {group.created_at > 0 && (
                        <p className='text-muted-foreground text-sm'>
                          <IQTime seconds={group.created_at} /> ·{' '}
                          {t('Beijing time')}
                        </p>
                      )}
                    </div>
                    {firstRows.get(group.group) === group && (
                      <div className='flex flex-wrap gap-2'>
                        {canRead && (
                          <Button
                            variant='outline'
                            onClick={() =>
                              setSettings({
                                group: group.group,
                                creating: false,
                              })
                            }
                          >
                            {t('IQ test settings')}
                          </Button>
                        )}
                        {canWrite && (
                          <Button
                            variant='destructive'
                            disabled={remove.isPending}
                            onClick={() =>
                              setConfirmDelete({
                                group: group.group,
                                version: group.config_version,
                              })
                            }
                          >
                            {t('Delete plan')}
                          </Button>
                        )}
                        {canRun && (
                          <Button
                            onClick={() => setConfirmRun(group.group)}
                            disabled={
                              run.isPending ||
                              data.groups.some(
                                (row) =>
                                  row.group === group.group &&
                                  Boolean(row.active_run)
                              )
                            }
                          >
                            {t('Run now')}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className='text-muted-foreground flex flex-wrap items-center gap-3 text-sm'>
                    <Badge variant='secondary'>
                      {group.schedule_enabled
                        ? t('Schedule enabled')
                        : t('Schedule disabled')}
                    </Badge>
                    <p>
                      {t('Next run')}: <IQTime seconds={group.next_run_at} /> ·{' '}
                      {t('Beijing time')}
                    </p>
                    {group.active_run && (
                      <p role='status'>
                        {t('Current run')}:{' '}
                        <IQStatusLabel status={group.active_run.status} /> ·{' '}
                        {t('{{completed}} / {{total}} completed', {
                          completed: group.active_run.completed,
                          total: group.active_run.total,
                        })}
                      </p>
                    )}
                  </div>
                  <div
                    role='region'
                    aria-label={t('Models in {{group}}', {
                      group: group.group,
                    })}
                    tabIndex={0}
                    className='focus-visible:ring-ring overflow-x-auto rounded-lg pb-3 focus-visible:ring-2 focus-visible:outline-none'
                  >
                    <ul className='grid auto-cols-[min(100%,22rem)] grid-flow-col gap-5'>
                      {group.models.map((card) => (
                        <li key={card.model} className='min-w-0'>
                          <IQResultCard
                            scope={props.scope}
                            card={card}
                            live={Boolean(
                              card.latest &&
                              previews.live.includes(
                                artifactRevision(card.latest)
                              )
                            )}
                            onOpen={setSelected}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              ))}
            </div>
            {showHistory && query.hasNextPage && (
              <Button
                variant='outline'
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {t('Load older runs')}
              </Button>
            )}
          </>
        )}
        {expanded && (
          <Dialog
            open
            onOpenChange={(open) => {
              if (!open) setSelected(null)
            }}
            title={t('Artwork by {{model}}', { model: expanded.model })}
            description={
              <>
                {expanded.group} · <IQTime seconds={expanded.completed_at} /> ·{' '}
                {t('Beijing time')}
              </>
            }
            contentClassName='sm:max-w-6xl'
            showCloseButton={false}
            footer={
              <Button variant='outline' onClick={() => setSelected(null)}>
                {t('Close')}
              </Button>
            }
          >
            <p className='text-muted-foreground mb-3 text-xs'>
              {t(
                'Isolated active artwork. External assets are blocked; scripts may still consume browser resources or navigate their own frame.'
              )}
            </p>
            <IQPreview
              key={artifactRevision(expanded)}
              scope={props.scope}
              result={expanded}
              expanded
            />
          </Dialog>
        )}
        {settings !== null && canRead && (
          <IQSettings
            scope={props.scope}
            canWrite={canWrite}
            group={settings.group}
            creating={settings.creating}
            onClose={() => setSettings(null)}
          />
        )}
        {canWrite && (
          <ConfirmDialog
            open={confirmDelete !== null}
            onOpenChange={(open) => {
              if (!open) setConfirmDelete(null)
            }}
            title={t('Delete plan {{group}}?', {
              group: confirmDelete?.group ?? '',
            })}
            desc={t(
              'Remove this plan from the gallery and stop its schedule and unsent requests. Saved artwork is kept. Requests already started may finish.'
            )}
            confirmText={t('Delete plan')}
            destructive
            isLoading={remove.isPending}
            handleConfirm={() => {
              if (confirmDelete) remove.mutate(confirmDelete)
            }}
          />
        )}
        {canRun && (
          <ConfirmDialog
            open={confirmRun !== null}
            onOpenChange={(open) => {
              if (!open) setConfirmRun(null)
            }}
            title={`${t('Run IQ tests?')} ${confirmRun ?? ''}`}
            desc={t(
              'Run the saved targets once using site resources. This may incur provider costs. No retries or extra samples.'
            )}
            confirmText={t('Run now')}
            isLoading={run.isPending}
            handleConfirm={() => {
              if (confirmRun) run.mutate(confirmRun)
            }}
          />
        )}
      </div>
    </Main>
  )
}
