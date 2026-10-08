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
import { Wrench } from 'lucide-react'
import { useState } from 'react'

import { Tag } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'
import { formatAmount } from '@/lib/pricing'
import { useStatus } from '@/lib/queries'
import { LogDetailDialog } from '@/pages/logs/log-detail-dialog'
import { OFFICIAL_USD_TO_CNY, chargedQuota, costComparison } from '@/pages/logs/log-billing'
import {
  TONE_TEXT,
  cacheWriteTokens,
  firstTokenTone,
  hasToolSurcharge,
  isDisplayableType,
  isTimingType,
  responseTone,
  secondsLabel,
} from '@/pages/logs/log-format'
import { detailSegments, type Segment } from '@/pages/logs/log-segments'
import type { LogEntry, LogOther } from '@/pages/logs/log-types'
import { useLogsView } from '@/pages/logs/logs-context'
import { Dash } from '@/pages/logs/logs-ui'

import { DEFAULT_QUOTA_PER_UNIT } from './console-helpers'
import { useMoney } from './console-hooks'

type CellProps = { log: LogEntry; other: LogOther | null }

const count = (value: number) => value.toLocaleString('en-US')

/** Input / output tokens and the cache read (↓) and written (↑). */
export function TokensCell(props: CellProps) {
  const { t } = useI18n()
  if (!isDisplayableType(props.log.type)) return null
  const input = props.log.prompt_tokens || 0
  const output = props.log.completion_tokens || 0
  if (!input && !output) return <Dash />
  const read = props.other?.cache_tokens || 0
  const write = cacheWriteTokens(props.other)
  return (
    <div className='flex flex-col gap-0.5'>
      <span className='whitespace-nowrap tabular-nums'>
        <span>{count(input)}</span>
        <span className='text-or-dim'> / </span>
        <span>{count(output)}</span>
      </span>
      {read || write ? (
        <span className='text-or-dim text-[12px] whitespace-nowrap tabular-nums'>
          {t('缓存')}
          {read ? ` ↓${count(read)}` : ''}
          {write ? ` ↑${count(write)}` : ''}
        </span>
      ) : null}
    </div>
  )
}

/** The charge, how much below the recorded base price it came out, and subscription / tool marks. */
export function CostCell(props: CellProps) {
  const { t } = useI18n()
  const money = useMoney()
  const { data: status } = useStatus()
  if (!isDisplayableType(props.log.type)) return null
  const other = props.other
  const subscription = other?.billing_source === 'subscription'
  const comparison = costComparison(props.log.quota, other, props.log.model_name, {
    priceRate: Math.max(Number(status?.price ?? 1), 0.001),
    quotaPerUnit: status?.quota_per_unit || DEFAULT_QUOTA_PER_UNIT,
  })
  const official =
    comparison?.currency === 'USD'
      ? formatAmount(comparison.baseCost / OFFICIAL_USD_TO_CNY, { symbol: '$', rate: 1 })
      : formatAmount(comparison?.baseCost ?? 0, { symbol: '¥', rate: 1 })
  const percent = comparison ? Math.round((comparison.savings / comparison.baseCost) * 10_000) / 100 : 0

  return (
    <div className='flex flex-col items-end gap-0.5'>
      <span className='inline-flex items-center gap-1 whitespace-nowrap'>
        {hasToolSurcharge(other) ? (
          <span role='img' aria-label={t('含工具调用附加费')} title={t('含工具调用附加费')}>
            <Wrench className='size-3.5 text-amber-600 dark:text-amber-400' aria-hidden='true' />
          </span>
        ) : null}
        {subscription ? (
          <span title={t('由订阅抵扣：{amount}', { amount: money.format(props.log.quota) })}>
            <Tag tone='success'>{t('订阅|计费')}</Tag>
          </span>
        ) : (
          <span className='tabular-nums'>{money.format(chargedQuota(props.log.quota, other))}</span>
        )}
      </span>
      {comparison && !subscription ? (
        <span
          className='text-[12px] text-emerald-600 dark:text-emerald-400'
          title={t('官方价约 {price}，按记录的基础价估算，未经厂商核实。', { price: official })}
        >
          {t('省 {percent}%', { percent })}
        </span>
      ) : null}
    </div>
  )
}

/** Time to the first token (streams) and the whole request, coloured by speed. */
export function TimingCell(props: CellProps) {
  const { t } = useI18n()
  const log = props.log
  if (!isTimingType(log.type)) return null
  const firstToken = props.other?.frt && props.other.frt > 0 ? props.other.frt / 1000 : null
  return (
    <div className='flex flex-col gap-0.5 text-[12px] leading-tight whitespace-nowrap'>
      {log.is_stream ? (
        <span>
          <span className='text-or-muted'>{t('首字')} </span>
          <span className={firstToken === null ? 'text-or-dim' : TONE_TEXT[firstTokenTone(firstToken)]}>
            {firstToken === null ? '—' : secondsLabel(firstToken)}
          </span>
        </span>
      ) : null}
      <span>
        <span className='text-or-muted'>{t('总计')} </span>
        <span className={TONE_TEXT[responseTone(log.use_time, log.completion_tokens)]}>{secondsLabel(log.use_time)}</span>
      </span>
    </div>
  )
}

const SEGMENT_TONE: Record<NonNullable<Segment['tone']>, string> = {
  muted: 'text-or-muted',
  danger: 'text-or-red',
}

/** A one-line summary; opens the full details of the log. */
export function DetailsCell(props: CellProps) {
  const { t } = useI18n()
  const money = useMoney()
  const view = useLogsView()
  const [open, setOpen] = useState(false)
  const segments = detailSegments(props.log, props.other, { format: money.format, formatUsd: money.formatUsd, admin: view.admin })
  const first = segments[0]

  let preview: React.ReactNode = <span className='text-or-dim'>—</span>
  if (first) {
    preview = (
      <span className={cn('truncate', first.tone ? SEGMENT_TONE[first.tone] : null)}>
        {first.text}
        {segments.length > 1 ? <span className='text-or-dim'> +{segments.length - 1}</span> : null}
      </span>
    )
  } else if (props.log.content) {
    preview = <span className='text-or-muted truncate'>{props.log.content}</span>
  }

  return (
    <>
      <button
        type='button'
        onClick={() => setOpen(true)}
        title={t('查看详情')}
        className='flex max-w-[220px] min-w-0 items-center text-left hover:underline'
      >
        {preview}
      </button>
      {open ? <LogDetailDialog log={props.log} other={props.other} onClose={() => setOpen(false)} /> : null}
    </>
  )
}
