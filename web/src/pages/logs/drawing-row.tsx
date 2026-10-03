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
import { useState } from 'react'

import { Tag, Td } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { dateTime } from '@/lib/format'

import { drawingAction, drawingStatus, submitResult } from './drawing-labels'
import { FailReasonDialog, ImagePreviewDialog, PromptDialog } from './drawing-dialogs'
import type { DrawingLog } from './log-types'
import { CopyButton, Dash } from './logs-ui'
import { taskDuration } from './task-labels'
import { DurationText, Progress } from './task-row'

type Open = 'image' | 'prompt' | 'reason' | null

/** One Midjourney task: when, which action, how long, its state, image, prompt and failure. */
export function DrawingRow(props: { log: DrawingLog; admin: boolean }) {
  const { t } = useI18n()
  const [open, setOpen] = useState<Open>(null)
  const log = props.log
  const status = drawingStatus(log.status)
  const action = drawingAction(log.action)
  const Icon = action.icon
  const submit = submitResult(log.code)
  const close = () => setOpen(null)

  return (
    <tr className='border-or-line hover:bg-or-fill border-t text-[13px]'>
      <Td className='py-2.5'>
        <div className='flex flex-col items-start gap-1'>
          <span className='whitespace-nowrap tabular-nums'>{dateTime(Math.floor(log.submit_time / 1000))}</span>
          <Tag tone={status.tone}>{status.text}</Tag>
        </div>
      </Td>
      {props.admin ? <Td className='font-geist py-2.5 text-[12px]'>{log.channel_id ? `#${log.channel_id}` : <Dash />}</Td> : null}
      <Td className='py-2.5'>
        <span className='inline-flex items-center gap-1.5 whitespace-nowrap'>
          <Icon className='text-or-muted size-3.5' aria-hidden='true' />
          {action.text}
        </span>
      </Td>
      <Td className='py-2.5'>
        {log.mj_id ? (
          <span className='flex max-w-[180px] min-w-0 items-center gap-1'>
            <span className='font-geist truncate text-[12px]'>{log.mj_id}</span>
            <CopyButton text={log.mj_id} label={t('复制任务 ID')} />
          </span>
        ) : (
          <Dash />
        )}
      </Td>
      <Td className='py-2.5'>
        <DurationText seconds={taskDuration(log.submit_time, log.finish_time, 'ms')} slowAfter={60} />
      </Td>
      {props.admin ? (
        <Td className='py-2.5'>
          <Tag tone={submit.tone}>{submit.text}</Tag>
        </Td>
      ) : null}
      <Td className='py-2.5'>
        <Progress value={log.progress} />
      </Td>
      <Td className='py-2.5'>
        {log.image_url ? (
          <button type='button' onClick={() => setOpen('image')} className='font-medium whitespace-nowrap hover:underline'>
            {t('查看图片')}
          </button>
        ) : (
          <Dash />
        )}
      </Td>
      <Td className='py-2.5'>
        {log.prompt ? (
          <button type='button' onClick={() => setOpen('prompt')} title={t('查看完整提示词')} className='text-or-muted block max-w-[220px] truncate text-left hover:underline'>
            {log.prompt}
          </button>
        ) : (
          <Dash />
        )}
      </Td>
      <Td className='py-2.5'>
        {log.fail_reason ? (
          <button type='button' onClick={() => setOpen('reason')} title={t('查看完整错误信息')} className='text-or-red block max-w-[200px] truncate text-left hover:underline'>
            {log.fail_reason}
          </button>
        ) : (
          <Dash />
        )}
        {open === 'image' && log.image_url ? <ImagePreviewDialog url={log.image_url} taskId={log.mj_id} onClose={close} /> : null}
        {open === 'prompt' ? <PromptDialog prompt={log.prompt} promptEn={log.prompt_en} onClose={close} /> : null}
        {open === 'reason' && log.fail_reason ? <FailReasonDialog reason={log.fail_reason} onClose={close} /> : null}
      </Td>
    </tr>
  )
}
