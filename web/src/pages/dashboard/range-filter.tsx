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
import { Search } from 'lucide-react'
import { useState } from 'react'

import { Button, Select, TextInput } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'

import type { TimeWindow } from './dashboard-api'
import {
  GRANULARITIES,
  RANGE_DAYS,
  fromLocalInput,
  isGranularity,
  rangeLabel,
  rollingWindow,
  toLocalInput,
  type Granularity,
} from './dashboard-time'
import { Segmented } from './segmented'

/** A quick range (days) or a custom window (days = null). */
export type RangeState = { days: number | null; window: TimeWindow }

export function presetRange(days: number): RangeState {
  return { days, window: rollingWindow(days) }
}

const CUSTOM = 'custom'

/**
 * Time range for the analytics pages: quick ranges, a custom start and end,
 * and optionally the chart granularity and (for admins) one username.
 */
export function RangeFilter(props: {
  range: RangeState
  onRange: (range: RangeState) => void
  granularity?: Granularity
  onGranularity?: (granularity: Granularity) => void
  username?: string
  onUsername?: (username: string) => void
}) {
  const { t } = useI18n()
  const [start, setStart] = useState(() => toLocalInput(props.range.window.start))
  const [end, setEnd] = useState(() => toLocalInput(props.range.window.end))
  const [name, setName] = useState(props.username ?? '')

  const choose = (id: string) => {
    if (id !== CUSTOM) {
      props.onRange(presetRange(Number(id)))
      return
    }
    // A custom range starts from the window on screen.
    setStart(toLocalInput(props.range.window.start))
    setEnd(toLocalInput(props.range.window.end))
    props.onRange({ days: null, window: props.range.window })
  }

  const custom = (nextStart: string, nextEnd: string) => {
    setStart(nextStart)
    setEnd(nextEnd)
    const from = fromLocalInput(nextStart)
    const to = fromLocalInput(nextEnd)
    if (from !== null && to !== null && from < to) props.onRange({ days: null, window: { start: from, end: to } })
  }

  const ranges = [...RANGE_DAYS.map((days) => ({ id: String(days), label: rangeLabel(days) })), { id: CUSTOM, label: t('自定义') }]

  return (
    <div className='flex min-w-0 flex-wrap items-center gap-2'>
      <Segmented ariaLabel={t('时间范围')} items={ranges} value={props.range.days === null ? CUSTOM : String(props.range.days)} onChange={choose} />
      {props.range.days === null ? (
        <div className='flex flex-wrap items-center gap-2'>
          <TextInput type='datetime-local' value={start} onChange={(value) => custom(value, end)} ariaLabel={t('开始时间')} className='w-[200px]' />
          <span aria-hidden='true' className='text-or-dim'>
            –
          </span>
          <TextInput type='datetime-local' value={end} onChange={(value) => custom(start, value)} ariaLabel={t('结束时间')} className='w-[200px]' />
        </div>
      ) : null}
      {props.onGranularity ? (
        <Select
          ariaLabel={t('时间粒度')}
          value={props.granularity ?? 'hour'}
          onChange={(value) => {
            if (isGranularity(value)) props.onGranularity?.(value)
          }}
          options={GRANULARITIES.map((item) => ({ value: item.id, label: t(item.label) }))}
          className='w-[112px]'
        />
      ) : null}
      {props.onUsername ? (
        <form
          className='flex items-center gap-1'
          onSubmit={(event) => {
            event.preventDefault()
            props.onUsername?.(name.trim())
          }}
        >
          <TextInput value={name} onChange={setName} ariaLabel={t('用户名')} placeholder={t('全部用户')} className='w-[150px]' />
          <Button type='submit' ariaLabel={t('筛选')} title={t('筛选')}>
            <Search className='size-4' aria-hidden='true' />
          </Button>
        </form>
      ) : null}
    </div>
  )
}
