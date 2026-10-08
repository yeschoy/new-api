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
import { useMemo } from 'react'

import { Panel, Table, TableMessage, Td, type Column } from '@/components/ui'
import { tk, useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { cn } from '@/lib/format'
import { LOG_TYPE, parseOther } from '@/pages/logs/log-format'
import type { LogEntry } from '@/pages/logs/log-types'

import { ChannelCell, KeyCell, ModelCell, StreamCell, TimeCell, UserCell } from './activity-cells'
import { CostCell, DetailsCell, TimingCell, TokensCell } from './activity-usage-cells'

const TIME: Column = { label: tk('时间') }
const ADMIN: Column[] = [{ label: tk('渠道|表头') }, { label: tk('用户|表头') }]
const REST: Column[] = [
  { label: tk('密钥') },
  { label: tk('模型|表头') },
  { label: tk('流式') },
  { label: 'Tokens' },
  { label: tk('费用'), right: true },
  { label: tk('耗时') },
  { label: tk('详情') },
]

function ActivityRow(props: { log: LogEntry; admin: boolean }) {
  const log = props.log
  const other = useMemo(() => parseOther(log.other), [log.other])
  // Admins see a warning tint where a quota conversion was clamped; errors get a faint red.
  const clamped = props.admin && !!other?.admin_info?.quota_saturation
  return (
    <tr
      className={cn(
        'border-or-line hover:bg-or-fill border-t text-[13px]',
        log.type === LOG_TYPE.ERROR && 'bg-or-red/[0.04]',
        clamped && 'bg-amber-500/[0.07]'
      )}
    >
      <Td className='py-2.5'>
        <TimeCell log={log} />
      </Td>
      {props.admin ? (
        <>
          <Td className='py-2.5'>
            <ChannelCell log={log} other={other} />
          </Td>
          <Td className='py-2.5'>
            <UserCell log={log} />
          </Td>
        </>
      ) : null}
      <Td className='py-2.5'>
        <KeyCell log={log} other={other} />
      </Td>
      <Td className='py-2.5'>
        <ModelCell log={log} other={other} />
      </Td>
      <Td className='py-2.5'>
        <StreamCell log={log} other={other} />
      </Td>
      <Td className='py-2.5'>
        <TokensCell log={log} other={other} />
      </Td>
      <Td right className='py-2.5'>
        <CostCell log={log} other={other} />
      </Td>
      <Td className='py-2.5'>
        <TimingCell log={log} other={other} />
      </Td>
      <Td className='py-2.5'>
        <DetailsCell log={log} other={other} />
      </Td>
    </tr>
  )
}

/** The usage log table; admins also see the channel and user of each row. */
export function ActivityTable(props: {
  items: LogEntry[]
  admin: boolean
  loading: boolean
  error: unknown
  success: boolean
}) {
  const { t } = useI18n()
  const columns = props.admin ? [TIME, ...ADMIN, ...REST] : [TIME, ...REST]
  return (
    <Panel flush>
      <Table columns={columns} minWidth={props.admin ? 1180 : 960}>
        {props.loading ? <TableMessage colSpan={columns.length}>{t('加载中…')}</TableMessage> : null}
        {props.error ? (
          <TableMessage colSpan={columns.length}>
            <span className='text-or-red'>{errorMessage(props.error, t('使用记录加载失败'))}</span>
          </TableMessage>
        ) : null}
        {props.success && props.items.length === 0 ? (
          <TableMessage colSpan={columns.length}>{t('这段时间没有符合条件的记录。')}</TableMessage>
        ) : null}
        {props.items.map((log) => (
          <ActivityRow key={`${log.id}-${log.created_at}`} log={log} admin={props.admin} />
        ))}
      </Table>
    </Panel>
  )
}
