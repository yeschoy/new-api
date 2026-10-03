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

import { Panel, Table, TableMessage, type Column } from '@/components/ui'
import { tk, useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { useConsoleKey } from '@/pages/console/console-hooks'
import { ConsolePage } from '@/pages/console/console-page'

import { LogPager, ScopeSwitch } from './log-controls'
import type { LogScope } from './log-types'
import { LogsViewProvider } from './logs-context'
import { listTaskLogs } from './logs-api'
import { TASK_KEYS, TaskFilters, taskQuery } from './task-filters'
import { TaskRow } from './task-row'
import { useEmptyPageReset, useLogScope } from './use-log-scope'
import { useLogSearch } from './use-log-search'

const TIME: Column = { label: tk('提交时间') }
const ADMIN: Column[] = [{ label: tk('渠道|表头') }, { label: tk('用户|表头') }, { label: tk('插件') }]
const REST: Column[] = [
  { label: tk('任务 ID') },
  { label: tk('耗时') },
  { label: tk('状态') },
  { label: tk('进度') },
  { label: tk('制品') },
  { label: tk('详情') },
]

/** Async task logs (music, video…): progress, results and failures; admins see every user's. */
export function TasksPage() {
  const { t } = useI18n()
  const view = useLogScope()
  return (
    <ConsolePage
      active='tasks'
      title={t('任务记录')}
      description={t('查看音乐、视频等异步任务的进度、结果与失败原因。')}
      actions={view.canSeeAll ? <ScopeSwitch value={view.scope} onChange={view.choose} /> : undefined}
    >
      <TasksContent key={view.scope} scope={view.scope} admin={view.admin} root={view.root} />
    </ConsolePage>
  )
}

function TasksContent(props: { scope: LogScope; admin: boolean; root: boolean }) {
  const { t } = useI18n()
  const search = useLogSearch(TASK_KEYS)
  const query = taskQuery(search, props.admin, 'seconds')
  const client = useQueryClient()
  const baseKey = useConsoleKey('task-logs', props.scope)
  const tasks = useQuery({
    queryKey: [...baseKey, query, search.page, search.pageSize],
    queryFn: () => listTaskLogs(props.scope, query, search.page, search.pageSize),
    placeholderData: keepPreviousData,
  })
  const items = tasks.data?.items ?? []
  const columns = props.admin ? [TIME, ...ADMIN, ...REST] : [TIME, ...REST]
  useEmptyPageReset(search.page, search.setPage, tasks.isSuccess && !tasks.isPlaceholderData, items.length === 0)

  return (
    <LogsViewProvider masked={false} admin={props.admin} root={props.root}>
      <div className='flex flex-col gap-6'>
        <TaskFilters
          key={search.signature}
          search={search}
          admin={props.admin}
          busy={tasks.isFetching}
          onSearch={() => client.invalidateQueries({ queryKey: baseKey })}
        />
        <div>
          <Panel flush>
            <Table columns={columns} minWidth={props.admin ? 1180 : 900}>
              {tasks.isLoading ? <TableMessage colSpan={columns.length}>{t('加载中…')}</TableMessage> : null}
              {tasks.isError ? (
                <TableMessage colSpan={columns.length}>
                  <span className='text-or-red'>{errorMessage(tasks.error, t('获取任务记录失败'))}</span>
                </TableMessage>
              ) : null}
              {tasks.isSuccess && items.length === 0 ? (
                <TableMessage colSpan={columns.length}>{t('这段时间没有符合条件的记录。')}</TableMessage>
              ) : null}
              {items.map((log) => (
                <TaskRow key={`${log.id}-${log.task_id}`} log={log} admin={props.admin} />
              ))}
            </Table>
          </Panel>
          <LogPager page={search.page} size={search.pageSize} total={tasks.data?.total ?? 0} onPage={search.setPage} onSize={search.setPageSize} />
        </div>
      </div>
    </LogsViewProvider>
  )
}
