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

import { TextInput } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'

import { LogFilterBar } from './log-filter-bar'
import type { TaskQuery } from './logs-api'
import type { TimeRange } from './time-range'
import { TimeRangePicker } from './time-range-picker'
import { toSeconds, type LogSearch } from './use-log-search'

/** Address-bar names of the task and drawing filters, as on the old site. */
export const TASK_KEYS = ['filter', 'channel'] as const

export type TaskKey = (typeof TASK_KEYS)[number]

/** Task logs count in seconds, drawing (Midjourney) logs in milliseconds. */
export function taskQuery(search: LogSearch<TaskKey>, admin: boolean, unit: 'seconds' | 'ms'): TaskQuery {
  const time = (ms: number | null) => (unit === 'ms' ? (ms ?? undefined) : toSeconds(ms))
  return {
    id: search.values.filter || undefined,
    channel: admin ? search.values.channel || undefined : undefined,
    start_timestamp: time(search.start),
    end_timestamp: time(search.end),
  }
}

/** Time window, task id and (admins) channel; key it on search.signature. */
export function TaskFilters(props: { search: LogSearch<TaskKey>; admin: boolean; busy: boolean; onSearch: () => void }) {
  const { t } = useI18n()
  const [values, setValues] = useState(props.search.values)
  const [range, setRange] = useState<TimeRange>({ start: props.search.start, end: props.search.end })
  const set = (key: TaskKey) => (value: string) => setValues((current) => ({ ...current, [key]: value }))

  return (
    <LogFilterBar
      busy={props.busy}
      onSearch={() => {
        props.search.apply(values, range)
        props.onSearch()
      }}
      onReset={() => {
        props.search.reset()
        props.onSearch()
      }}
    >
      <TimeRangePicker value={range} onChange={setRange} />
      <TextInput value={values.filter} onChange={set('filter')} placeholder={t('任务 ID')} ariaLabel={t('任务 ID')} />
      {props.admin ? (
        <TextInput value={values.channel} onChange={set('channel')} placeholder={t('渠道 ID')} ariaLabel={t('渠道 ID')} />
      ) : null}
    </LogFilterBar>
  )
}
