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

import { Select, TextInput } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { MaskToggle } from '@/pages/logs/log-controls'
import { LogFilterBar } from '@/pages/logs/log-filter-bar'
import { LOG_TYPE, LOG_TYPE_FILTERS } from '@/pages/logs/log-format'
import type { LogQuery } from '@/pages/logs/logs-api'
import type { TimeRange } from '@/pages/logs/time-range'
import { TimeRangePicker } from '@/pages/logs/time-range-picker'
import { toSeconds, type LogSearch } from '@/pages/logs/use-log-search'

/** Address-bar names of the usage log filters, as on the old site. */
export const ACTIVITY_KEYS = ['type', 'model', 'token', 'group', 'channel', 'username', 'requestId', 'upstreamRequestId'] as const

export type ActivityKey = (typeof ACTIVITY_KEYS)[number]

/** The applied filters as the log and stat endpoints take them; user and channel only for admins. */
export function activityQuery(search: LogSearch<ActivityKey>, admin: boolean): LogQuery {
  const values = search.values
  const type = Number(values.type)
  const channel = Number(values.channel)
  return {
    type: Number.isInteger(type) && type > LOG_TYPE.UNKNOWN && type <= LOG_TYPE.LOGIN ? type : undefined,
    model_name: values.model || undefined,
    token_name: values.token || undefined,
    group: values.group || undefined,
    request_id: values.requestId || undefined,
    upstream_request_id: values.upstreamRequestId || undefined,
    username: admin ? values.username || undefined : undefined,
    channel: admin && Number.isInteger(channel) && channel > 0 ? channel : undefined,
    start_timestamp: toSeconds(search.start),
    end_timestamp: toSeconds(search.end),
  }
}

/** Filters of the usage log; key it on search.signature so the draft follows the address bar. */
export function ActivityFilters(props: {
  search: LogSearch<ActivityKey>
  admin: boolean
  busy: boolean
  masked: boolean
  onMask: (masked: boolean) => void
  stats: React.ReactNode
  onSearch: () => void
}) {
  const { t } = useI18n()
  const [values, setValues] = useState(props.search.values)
  const [range, setRange] = useState<TimeRange>({ start: props.search.start, end: props.search.end })
  const set = (key: ActivityKey) => (value: string) => setValues((current) => ({ ...current, [key]: value }))
  const secret = props.masked ? '[-webkit-text-security:disc]' : undefined
  const advancedKeys: ActivityKey[] = props.admin ? ['token', 'username', 'channel', 'requestId', 'upstreamRequestId'] : ['token', 'requestId', 'upstreamRequestId']

  const field = (key: ActivityKey, label: string, className?: string) => (
    <TextInput value={values[key]} onChange={set(key)} placeholder={label} ariaLabel={label} className={className} />
  )

  return (
    <LogFilterBar
      busy={props.busy}
      stats={props.stats}
      tools={<MaskToggle masked={props.masked} onChange={props.onMask} />}
      advancedCount={advancedKeys.filter((key) => values[key]).length}
      onSearch={() => {
        props.search.apply({ ...values, type: values.type === '0' ? '' : values.type }, range)
        props.onSearch()
      }}
      onReset={() => {
        props.search.reset()
        props.onSearch()
      }}
      advanced={
        <>
          {field('token', t('密钥名称'), secret)}
          {props.admin ? field('username', t('用户名'), secret) : null}
          {props.admin ? field('channel', t('渠道 ID')) : null}
          {field('requestId', t('请求 ID'))}
          {field('upstreamRequestId', t('上游请求 ID'))}
        </>
      }
    >
      <TimeRangePicker value={range} onChange={setRange} />
      {field('model', t('模型名称'))}
      {field('group', t('分组'), secret)}
      <Select
        value={values.type || '0'}
        onChange={set('type')}
        options={LOG_TYPE_FILTERS.map((option) => ({ value: option.value, label: t(option.label) }))}
        ariaLabel={t('日志类型')}
      />
    </LogFilterBar>
  )
}
