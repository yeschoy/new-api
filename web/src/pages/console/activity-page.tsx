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
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { RequireAuth } from '@/components/require-auth'
import { errorMessage } from '@/lib/api'
import { listRequestLogs } from '@/lib/console-api'
import { dateTime } from '@/lib/format'
import type { UsageLog } from '@/lib/services'

import { UsageTiles } from './activity-summary'
import { durationLabel } from './console-helpers'
import { useConsoleKey, useMoney } from './console-hooks'
import { ConsoleLayout } from './console-layout'
import { Pager, Table, TableMessage, Td, Tr, type Column } from './console-table'
import { Panel, Tag } from './console-ui'

const PAGE_SIZE = 20
const LOG_TYPE_ERROR = 5

const COLUMNS: Column[] = [
  { label: '时间' },
  { label: '模型' },
  { label: '密钥' },
  { label: '输入 tokens', right: true },
  { label: '输出 tokens', right: true },
  { label: '费用', right: true },
  { label: '耗时', right: true },
]

/** Usage: 7-day summary tiles and the paginated request log. */
export function ActivityPage() {
  return (
    <RequireAuth framed>
      <ActivityContent />
    </RequireAuth>
  )
}

function ActivityContent() {
  const [page, setPage] = useState(1)
  const logs = useQuery({
    queryKey: useConsoleKey('logs', page),
    queryFn: () => listRequestLogs(page, PAGE_SIZE),
    placeholderData: keepPreviousData,
  })
  const items = logs.data?.items ?? []

  return (
    <ConsoleLayout active='activity' title='使用记录' description='查看每一次 API 调用的模型、Token 用量与费用。'>
      <UsageTiles logs={items} />
      <Panel title='请求明细' flush className='mt-6'>
        <Table columns={COLUMNS} minWidth={920}>
          {logs.isLoading ? <TableMessage colSpan={COLUMNS.length}>加载中…</TableMessage> : null}
          {logs.isError ? (
            <TableMessage colSpan={COLUMNS.length}>{errorMessage(logs.error, '使用记录加载失败')}</TableMessage>
          ) : null}
          {logs.isSuccess && items.length === 0 ? (
            <TableMessage colSpan={COLUMNS.length}>暂无调用记录，使用 API 密钥发起请求后会显示在这里。</TableMessage>
          ) : null}
          {items.map((log) => (
            <LogRow key={log.id} log={log} />
          ))}
        </Table>
      </Panel>
      <Pager page={page} size={PAGE_SIZE} total={logs.data?.total ?? 0} onChange={setPage} />
    </ConsoleLayout>
  )
}

function LogRow(props: { log: UsageLog }) {
  const log = props.log
  const money = useMoney()
  return (
    <Tr>
      <Td muted className='whitespace-nowrap'>{dateTime(log.created_at)}</Td>
      <Td>
        <div className='flex items-center gap-2'>
          <span className='font-medium break-all'>{log.model_name || '—'}</span>
          {log.type === LOG_TYPE_ERROR ? <Tag tone='danger'>失败</Tag> : null}
          {log.is_stream ? <Tag>流式</Tag> : null}
        </div>
      </Td>
      <Td muted>{log.token_name || '—'}</Td>
      <Td right>{(log.prompt_tokens || 0).toLocaleString('zh-CN')}</Td>
      <Td right>{(log.completion_tokens || 0).toLocaleString('zh-CN')}</Td>
      <Td right>{money.format(log.quota)}</Td>
      <Td right muted>{durationLabel(log.use_time)}</Td>
    </Tr>
  )
}
