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
import { Eye } from 'lucide-react'
import { useState } from 'react'

import { Tag, Td } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { cn, dateTime } from '@/lib/format'

import type { TaskLog } from './log-types'
import { useLogsView } from './logs-context'
import { CopyButton, Dash } from './logs-ui'
import { PluginAuthor } from './plugin-author'
import { TaskArtifactsCell } from './task-artifacts'
import { TaskDetailsDialog } from './task-details-dialog'
import { taskAction, taskDuration, taskStatus } from './task-labels'

/** Seconds a task took; long ones (past the threshold) read red. */
export function DurationText(props: { seconds: number | null; slowAfter: number }) {
  if (props.seconds === null) return <Dash />
  return (
    <span className={cn('tabular-nums', props.seconds > props.slowAfter ? 'text-or-red' : 'text-emerald-600 dark:text-emerald-400')}>
      {`${props.seconds.toFixed(1)}s`}
    </span>
  )
}

/** A short pill for upstream progress such as "100%". */
export function Progress(props: { value?: string }) {
  if (!props.value) return <Dash />
  return <span className='border-or-line font-geist inline-flex rounded-[4px] border px-1.5 text-[12px]'>{props.value}</span>
}

/** Admins: who submitted the task; opens the user's details. */
export function TaskUser(props: { userId: number; name?: string }) {
  const view = useLogsView()
  const label = props.name || String(props.userId || '?')
  return (
    <button type='button' onClick={() => view.showUser(props.userId)} className='text-or-muted hover:text-or-fg max-w-[120px] truncate hover:underline'>
      {label}
    </button>
  )
}

function PluginCell(props: { log: TaskLog }) {
  const plugin = props.log.admin_info?.task_plugin
  if (!plugin) return <Dash />
  return (
    <div className='flex max-w-[170px] flex-col gap-0.5'>
      <span className='truncate font-medium'>{plugin.name || plugin.key}</span>
      <span className='text-or-dim font-geist truncate text-[11px]'>
        {plugin.key}
        {plugin.version ? ` @ ${plugin.version}` : ''}
      </span>
      {plugin.author ? <PluginAuthor author={plugin.author} className='text-or-muted text-[12px]' /> : null}
    </div>
  )
}

/** One async task: when, who, what, how long, its state, progress, artifacts and details. */
export function TaskRow(props: { log: TaskLog; admin: boolean }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const log = props.log
  const status = taskStatus(log.status)

  return (
    <tr className='border-or-line hover:bg-or-fill border-t text-[13px]'>
      <Td className='py-2.5'>
        <div className='flex flex-col gap-0.5 whitespace-nowrap tabular-nums'>
          <span>{dateTime(log.submit_time)}</span>
          <span className='text-or-dim text-[12px]'>{log.finish_time ? dateTime(log.finish_time) : '—'}</span>
        </div>
      </Td>
      {props.admin ? (
        <>
          <Td className='font-geist py-2.5 text-[12px]'>{log.channel_id ? `#${log.channel_id}` : <Dash />}</Td>
          <Td className='py-2.5'>
            <TaskUser userId={log.user_id} name={log.username} />
          </Td>
          <Td className='py-2.5'>
            <PluginCell log={log} />
          </Td>
        </>
      ) : null}
      <Td className='py-2.5'>
        {log.task_id ? (
          <div className='flex max-w-[200px] flex-col gap-0.5'>
            <span className='flex min-w-0 items-center gap-1'>
              <span className='font-geist truncate text-[12px]'>{log.task_id}</span>
              <CopyButton text={log.task_id} label={t('复制任务 ID')} />
            </span>
            <span className='text-or-dim truncate text-[12px]'>{`${log.platform} · ${taskAction(log.action)}`}</span>
          </div>
        ) : (
          <Dash />
        )}
      </Td>
      <Td className='py-2.5'>
        <DurationText seconds={taskDuration(log.submit_time, log.finish_time, 'seconds')} slowAfter={300} />
      </Td>
      <Td className='py-2.5'>
        <Tag tone={status.tone}>{status.text}</Tag>
      </Td>
      <Td className='py-2.5'>
        <Progress value={log.progress} />
      </Td>
      <Td className='py-2.5'>
        <TaskArtifactsCell log={log} />
      </Td>
      <Td className='py-2.5'>
        <div className='flex max-w-[220px] flex-col items-start gap-1'>
          <button type='button' onClick={() => setOpen(true)} className='inline-flex items-center gap-1 font-medium hover:underline'>
            <Eye className='size-3.5' aria-hidden='true' />
            {t('查看详情')}
          </button>
          {log.fail_reason ? <span className='text-or-red max-w-full truncate text-[12px]' title={log.fail_reason}>{log.fail_reason}</span> : null}
        </div>
        {open ? <TaskDetailsDialog log={log} onClose={() => setOpen(false)} /> : null}
      </Td>
    </tr>
  )
}
