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
import { CircleAlert, CornerDownRight, GitBranch, Sparkles } from 'lucide-react'

import { ProviderIcon } from '@/components/provider-icon'
import { Tag } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { cn, dateTime } from '@/lib/format'
import { guessIcon } from '@/lib/model-icons'
import {
  displayGroupRatio,
  formatRatio,
  isDisplayableType,
  isTimingType,
  logTypeOf,
  mappedModel,
} from '@/pages/logs/log-format'
import type { LogEntry, LogOther } from '@/pages/logs/log-types'
import { useLogsView, useMask } from '@/pages/logs/logs-context'

type CellProps = { log: LogEntry; other: LogOther | null }

/** When it happened and what kind of log it is. */
export function TimeCell(props: { log: LogEntry }) {
  const { t } = useI18n()
  const type = logTypeOf(props.log.type)
  return (
    <div className='flex flex-col items-start gap-1'>
      <span className='whitespace-nowrap tabular-nums'>{dateTime(props.log.created_at)}</span>
      <Tag tone={type.tone}>{t(type.label)}</Tag>
    </div>
  )
}

/** Admins: the channel that served the request, its key index, retries and affinity. */
export function ChannelCell(props: CellProps) {
  const { t } = useI18n()
  const view = useLogsView()
  const mask = useMask()
  if (!isDisplayableType(props.log.type)) return null
  const admin = props.other?.admin_info
  const chain = (admin?.use_channel ?? []).map(String).filter(Boolean)
  const keyIndex = admin?.is_multi_key && typeof admin.multi_key_index === 'number' ? admin.multi_key_index : null
  const affinity = admin?.channel_affinity
  const chainText = `${t('重试链路')}: ${chain.join(' → ')}`

  return (
    <div className='flex max-w-[160px] flex-col gap-0.5'>
      <span className='flex items-center gap-1'>
        <span className='font-geist text-[12px]'>#{props.log.channel}</span>
        {keyIndex !== null ? (
          <span
            title={t('多密钥序号 {index}', { index: keyIndex })}
            className='border-or-line text-or-muted inline-flex h-4 min-w-4 items-center justify-center rounded-full border px-1 text-[11px]'
          >
            {keyIndex}
          </span>
        ) : null}
        {chain.length > 1 ? (
          <span role='img' aria-label={chainText} title={chainText}>
            <GitBranch className='size-3.5 text-amber-600 dark:text-amber-400' aria-hidden='true' />
          </span>
        ) : null}
        {affinity ? (
          <button
            type='button'
            aria-label={t('渠道亲和')}
            title={`${t('渠道亲和')}: ${affinity.rule_name || '—'}`}
            onClick={() => view.showAffinity(affinity)}
            className='text-amber-600 dark:text-amber-400'
          >
            <Sparkles className='size-3.5' aria-hidden='true' />
          </button>
        ) : null}
      </span>
      {props.log.channel_name ? <span className='text-or-dim truncate text-[12px]'>{mask(props.log.channel_name)}</span> : null}
    </div>
  )
}

/** Admins: who made the request; opens the user's details. */
export function UserCell(props: { log: LogEntry }) {
  const view = useLogsView()
  const mask = useMask()
  if (!props.log.username) return null
  return (
    <button
      type='button'
      onClick={() => view.showUser(props.log.user_id)}
      className='text-or-muted hover:text-or-fg max-w-[120px] truncate text-left hover:underline'
    >
      {mask(props.log.username)}
    </button>
  )
}

/** The API key, its group and the group ratio that applied. */
export function KeyCell(props: CellProps) {
  const view = useLogsView()
  const mask = useMask()
  if (!isDisplayableType(props.log.type) || !props.log.token_name) return null
  const group = props.log.group || props.other?.group || ''
  const ratio = displayGroupRatio(props.other)
  return (
    <div className='flex max-w-[180px] flex-col gap-0.5'>
      <span className='truncate font-medium' title={view.masked ? undefined : props.log.token_name}>
        {mask(props.log.token_name)}
      </span>
      {group || ratio !== null ? (
        <span className='text-or-dim flex items-center gap-1 text-[12px]'>
          {group ? <span className='truncate'>{mask(group)}</span> : null}
          {ratio !== null ? <span className='tabular-nums'>{formatRatio(ratio)}x</span> : null}
        </span>
      ) : null}
    </div>
  )
}

/** The requested model and, when it was mapped, the model that answered. */
export function ModelCell(props: CellProps) {
  const { t } = useI18n()
  if (!isDisplayableType(props.log.type)) return null
  const actual = mappedModel(props.other)
  return (
    <div className='flex flex-col gap-0.5'>
      <span className='flex items-center gap-1.5 whitespace-nowrap'>
        <ProviderIcon name={guessIcon(props.log.model_name)} fallback={props.log.model_name} size={16} />
        <span className='font-medium'>{props.log.model_name || '—'}</span>
      </span>
      {actual ? (
        <span className='text-or-dim flex items-center gap-1 text-[12px] whitespace-nowrap' title={t('实际模型')}>
          <CornerDownRight className='size-3' aria-hidden='true' />
          {actual}
        </span>
      ) : null}
    </div>
  )
}

/** Stream or not, output speed, and whether the stream broke off. */
export function StreamCell(props: CellProps) {
  const { t } = useI18n()
  const log = props.log
  if (!isTimingType(log.type)) return null
  const perSecond = log.use_time > 0 && log.completion_tokens > 0 ? log.completion_tokens / log.use_time : null
  const broken = log.is_stream && !!props.other?.stream_status && props.other.stream_status.status !== 'ok'
  let label = log.is_stream ? t('流式') : t('非流式')
  if (props.other?.is_task) label = t('异步')
  const brokenText = `${t('流状态')}: ${props.other?.stream_status?.end_reason || t('错误')}`

  return (
    <div className='flex flex-col gap-0.5 text-[12px] leading-tight'>
      <span className={cn('inline-flex items-center gap-1 font-medium whitespace-nowrap', log.is_stream ? 'text-or-fg' : 'text-or-muted')}>
        {label}
        {broken ? (
          <span role='img' aria-label={brokenText} title={brokenText}>
            <CircleAlert className='text-or-red size-3' aria-hidden='true' />
          </span>
        ) : null}
      </span>
      <span className='text-or-dim tabular-nums'>{perSecond === null ? '—' : `${Math.round(perSecond)} t/s`}</span>
    </div>
  )
}
