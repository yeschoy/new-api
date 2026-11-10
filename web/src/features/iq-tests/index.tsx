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
import { useMutation, useQueryClient } from '@tanstack/react-query'
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
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { runIQTests } from './api'
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
import { artifactRevision } from './types'
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
  const [settings, setSettings] = useState<string | null>(null)
  const [confirmRun, setConfirmRun] = useState<string | null>(null)
  const pages = query.isError ? undefined : query.data?.pages
  const data = pages?.[0]
    ? {
        ...pages[0],
        groups: pages.flatMap((page) => page.groups),
      }
    : undefined
  const results =
    data?.groups.flatMap((group) =>
      group.models.flatMap((card) => (card.latest ? [card.latest] : []))
    ) ?? []
  const expanded = results.find(
    (result) =>
      result.status === 'success' && artifactRevision(result) === selected
  )
  const previews = useLiveIQPreviews(
    results
      .filter((result) => result.status === 'success')
      .map(artifactRevision),
    Boolean(expanded) || settings !== null || confirmRun !== null || !data
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
            {canRead && (
              <Button variant='outline' onClick={() => setSettings('')}>
                {t('IQ test settings')}
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
                'Every run is saved separately, newest first. Each row is one group run. Times are shown in Beijing time.'
              )}
            </p>
            {data.groups.length === 0 && (
              <EmptyState
                title={t('No IQ results available')}
                description={t(
                  'An administrator can select models and run a test. Only your accessible groups appear here.'
                )}
              />
            )}
            <div ref={previews.root} className='space-y-8'>
              {data.groups.map((group, index) => (
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
                    {data.groups.findIndex(
                      (row) => row.group === group.group
                    ) === index && (
                      <div className='flex flex-wrap gap-2'>
                        {canRead && (
                          <Button
                            variant='outline'
                            onClick={() => setSettings(group.group)}
                          >
                            {t('IQ test settings')}
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
            {query.hasNextPage && (
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
            group={settings}
            onClose={() => setSettings(null)}
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
