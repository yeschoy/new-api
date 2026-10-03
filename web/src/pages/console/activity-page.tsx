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
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { useI18n } from '@/i18n/i18n'
import { LogPager, ScopeSwitch } from '@/pages/logs/log-controls'
import { LOG_TYPE } from '@/pages/logs/log-format'
import type { LogScope } from '@/pages/logs/log-types'
import { LogsViewProvider } from '@/pages/logs/logs-context'
import { listLogs } from '@/pages/logs/logs-api'
import { useEmptyPageReset, useLogScope } from '@/pages/logs/use-log-scope'
import { useLogSearch } from '@/pages/logs/use-log-search'

import { ACTIVITY_KEYS, ActivityFilters, activityQuery } from './activity-filters'
import { ActivityStats } from './activity-stats'
import { UsageTiles } from './activity-summary'
import { ActivityTable } from './activity-table'
import { useConsoleKey } from './console-hooks'
import { ConsolePage } from './console-page'

/**
 * Usage logs: every request, top-up, refund, sign-in and admin action, with
 * filters, spend / RPM / TPM for the filters and a detail view per row.
 * Admins start on everyone's logs and can switch to their own.
 */
export function ActivityPage() {
  const { t } = useI18n()
  const view = useLogScope()
  return (
    <ConsolePage
      active='activity'
      title={t('使用记录')}
      description={t('查看每一次 API 调用的模型、Token 用量与费用。')}
      actions={view.canSeeAll ? <ScopeSwitch value={view.scope} onChange={view.choose} /> : undefined}
    >
      <ActivityContent key={view.scope} scope={view.scope} admin={view.admin} root={view.root} />
    </ConsolePage>
  )
}

function ActivityContent(props: { scope: LogScope; admin: boolean; root: boolean }) {
  const search = useLogSearch(ACTIVITY_KEYS)
  const query = activityQuery(search, props.admin)
  const client = useQueryClient()
  const baseKey = useConsoleKey('logs', props.scope)
  const [masked, setMasked] = useState(false)
  const logs = useQuery({
    queryKey: [...baseKey, query, search.page, search.pageSize],
    queryFn: () => listLogs(props.scope, query, search.page, search.pageSize),
    placeholderData: keepPreviousData,
  })
  const items = logs.data?.items ?? []
  useEmptyPageReset(search.page, search.setPage, logs.isSuccess && !logs.isPlaceholderData, items.length === 0)

  return (
    <LogsViewProvider masked={masked} admin={props.admin} root={props.root}>
      <div className='flex flex-col gap-6'>
        {props.admin ? null : <UsageTiles logs={items.filter((log) => log.type === LOG_TYPE.CONSUME)} />}
        <ActivityFilters
          key={search.signature}
          search={search}
          admin={props.admin}
          busy={logs.isFetching}
          masked={masked}
          onMask={setMasked}
          onSearch={() => client.invalidateQueries({ queryKey: baseKey })}
          stats={<ActivityStats scope={props.scope} query={query} queryKey={baseKey} masked={masked} />}
        />
        <div>
          <ActivityTable
            items={items}
            admin={props.admin}
            loading={logs.isLoading}
            error={logs.isError ? logs.error : null}
            success={logs.isSuccess}
          />
          <LogPager page={search.page} size={search.pageSize} total={logs.data?.total ?? 0} onPage={search.setPage} onSize={search.setPageSize} />
        </div>
      </div>
    </LogsViewProvider>
  )
}
