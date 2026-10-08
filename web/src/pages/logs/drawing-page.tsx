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

import { DrawingRow } from './drawing-row'
import { LogPager, ScopeSwitch } from './log-controls'
import type { LogScope } from './log-types'
import { LogsViewProvider } from './logs-context'
import { listDrawingLogs } from './logs-api'
import { TASK_KEYS, TaskFilters, taskQuery } from './task-filters'
import { useEmptyPageReset, useLogScope } from './use-log-scope'
import { useLogSearch } from './use-log-search'

function drawingColumns(admin: boolean): Column[] {
  const columns: Column[] = [{ label: tk('提交时间') }]
  if (admin) columns.push({ label: tk('渠道|表头') })
  columns.push({ label: tk('类型') }, { label: tk('任务 ID') }, { label: tk('耗时') })
  if (admin) columns.push({ label: tk('提交结果') })
  columns.push({ label: tk('进度') }, { label: tk('图片') }, { label: tk('提示词') }, { label: tk('失败原因') })
  return columns
}

/** Midjourney drawing logs: action, progress, image, prompt and failures; admins see every user's. */
export function DrawingPage() {
  const { t } = useI18n()
  const view = useLogScope()
  return (
    <ConsolePage
      active='drawing'
      title={t('绘图记录')}
      description={t('查看 Midjourney 绘图任务的进度、图片与提示词。')}
      actions={view.canSeeAll ? <ScopeSwitch value={view.scope} onChange={view.choose} /> : undefined}
    >
      <DrawingContent key={view.scope} scope={view.scope} admin={view.admin} root={view.root} />
    </ConsolePage>
  )
}

function DrawingContent(props: { scope: LogScope; admin: boolean; root: boolean }) {
  const { t } = useI18n()
  const search = useLogSearch(TASK_KEYS)
  const query = taskQuery(search, props.admin, 'ms')
  const client = useQueryClient()
  const baseKey = useConsoleKey('drawing-logs', props.scope)
  const drawings = useQuery({
    queryKey: [...baseKey, query, search.page, search.pageSize],
    queryFn: () => listDrawingLogs(props.scope, query, search.page, search.pageSize),
    placeholderData: keepPreviousData,
  })
  const items = drawings.data?.items ?? []
  const columns = drawingColumns(props.admin)
  useEmptyPageReset(search.page, search.setPage, drawings.isSuccess && !drawings.isPlaceholderData, items.length === 0)

  return (
    <LogsViewProvider masked={false} admin={props.admin} root={props.root}>
      <div className='flex flex-col gap-6'>
        <TaskFilters
          key={search.signature}
          search={search}
          admin={props.admin}
          busy={drawings.isFetching}
          onSearch={() => client.invalidateQueries({ queryKey: baseKey })}
        />
        <div>
          <Panel flush>
            <Table columns={columns} minWidth={props.admin ? 1180 : 1040}>
              {drawings.isLoading ? <TableMessage colSpan={columns.length}>{t('加载中…')}</TableMessage> : null}
              {drawings.isError ? (
                <TableMessage colSpan={columns.length}>
                  <span className='text-or-red'>{errorMessage(drawings.error, t('获取绘图记录失败'))}</span>
                </TableMessage>
              ) : null}
              {drawings.isSuccess && items.length === 0 ? (
                <TableMessage colSpan={columns.length}>{t('这段时间没有符合条件的记录。')}</TableMessage>
              ) : null}
              {items.map((log) => (
                <DrawingRow key={`${log.id}-${log.mj_id}`} log={log} admin={props.admin} />
              ))}
            </Table>
          </Panel>
          <LogPager page={search.page} size={search.pageSize} total={drawings.data?.total ?? 0} onPage={search.setPage} onSize={search.setPageSize} />
        </div>
      </div>
    </LogsViewProvider>
  )
}
