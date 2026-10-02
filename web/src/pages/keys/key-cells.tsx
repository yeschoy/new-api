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
import { Tag } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { KEY_STATUS_DISABLED } from '@/lib/console-api'
import { cn, dateTime } from '@/lib/format'
import { keyStatusLabel } from '@/pages/console/console-helpers'
import { useMoney } from '@/pages/console/console-hooks'

import type { KeyDetail, UserGroup } from './keys-api'
import { STALE_SECONDS, relativeTime } from './time-labels'

/** Disabled, expired or used up; nothing for a usable key. */
export function StatusTag(props: { status: number }) {
  const label = keyStatusLabel(props.status)
  if (!label) return null
  return <Tag tone={props.status === KEY_STATUS_DISABLED ? 'neutral' : 'danger'}>{label}</Tag>
}

/** Limit and what is left (with a bar), or "unlimited" and what was used. */
export function QuotaInfo(props: { apiKey: KeyDetail; alignStart?: boolean }) {
  const { t } = useI18n()
  const money = useMoney()
  const key = props.apiKey
  const used = t('已用 {amount}', { amount: money.format(key.used_quota) })
  const column = cn('flex flex-col', props.alignStart ? 'items-start' : 'items-end')
  if (key.unlimited_quota) {
    return (
      <div className={column}>
        <span className='text-or-muted'>{t('无限制')}</span>
        <span className='text-or-muted text-[12px]'>{used}</span>
      </div>
    )
  }
  const total = key.remain_quota + key.used_quota
  const left = total > 0 ? Math.min(1, Math.max(0, key.remain_quota / total)) : 0
  return (
    <div className={column} title={used}>
      <span>{money.format(total)}</span>
      <span className='text-or-muted text-[12px]'>{t('剩余 {amount}', { amount: money.format(key.remain_quota) })}</span>
      <span className='bg-or-fill mt-1 block h-1 w-20 overflow-hidden rounded-full' aria-hidden='true'>
        <span className={cn('block h-full rounded-full', left <= 0.1 ? 'bg-or-red' : 'bg-or-primary')} style={{ width: `${left * 100}%` }} />
      </span>
    </div>
  )
}

/** The key's group with its price ratio; auto shows whether it retries across groups. */
export function GroupInfo(props: { apiKey: KeyDetail; groups: Map<string, UserGroup> }) {
  const { t } = useI18n()
  const name = props.apiKey.group ?? ''
  if (name === 'auto') {
    return (
      <div className='flex flex-col' title={t('按顺序自动选择可用的分组')}>
        <span className='font-medium whitespace-nowrap'>{t('自动分组')}</span>
        {props.apiKey.cross_group_retry ? <span className='text-or-muted text-[12px] whitespace-nowrap'>{t('跨分组重试')}</span> : null}
      </div>
    )
  }
  if (!name) return <span className='text-or-muted'>{t('默认')}</span>
  const group = props.groups.get(name)
  return (
    <div className='flex items-center gap-1.5' title={group?.desc || undefined}>
      <span className='max-w-[120px] truncate font-medium'>{name}</span>
      {group && group.ratio !== null ? <Tag>{`×${group.ratio}`}</Tag> : null}
    </div>
  )
}

export function modelLimits(key: KeyDetail): string[] {
  if (!key.model_limits_enabled || !key.model_limits) return []
  return key.model_limits.split(',').map((model) => model.trim()).filter(Boolean)
}

export function ipLimits(key: KeyDetail): string[] {
  return (key.allow_ips ?? '').split('\n').map((ip) => ip.trim()).filter(Boolean)
}

/** Which models and IPs the key is limited to; nothing when it is not. */
export function LimitTags(props: { apiKey: KeyDetail }) {
  const { t } = useI18n()
  const models = modelLimits(props.apiKey)
  const ips = ipLimits(props.apiKey)
  if (!models.length && !ips.length) return null
  return (
    <div className='mt-1 flex flex-wrap gap-1'>
      {models.length ? (
        <span title={models.join('\n')}>
          <Tag>{t('{count} 个模型', { count: models.length })}</Tag>
        </span>
      ) : null}
      {ips.length ? (
        <span title={ips.join('\n')}>
          <Tag>{t('{count} 个 IP', { count: ips.length })}</Tag>
        </span>
      ) : null}
    </div>
  )
}

/** "Never" or how long until (red: since) the key expires; the exact time on hover. */
export function ExpiryInfo(props: { expiredTime: number; now: number }) {
  const { t, lang } = useI18n()
  if (props.expiredTime <= 0) return <span className='text-or-muted whitespace-nowrap'>{t('永不过期')}</span>
  const past = props.expiredTime * 1000 <= props.now
  return (
    <time
      dateTime={new Date(props.expiredTime * 1000).toISOString()}
      title={dateTime(props.expiredTime, lang)}
      className={cn('whitespace-nowrap', past && 'text-or-red')}
    >
      {relativeTime(props.expiredTime, props.now, lang)}
    </time>
  )
}

/** Created at, and when the key was last used (flagged when that was long ago). */
export function UsageTimes(props: { apiKey: KeyDetail; now: number }) {
  const { t, lang } = useI18n()
  const accessed = props.apiKey.accessed_time
  const stale = accessed > 0 && accessed < props.now / 1000 - STALE_SECONDS
  return (
    <div className='flex flex-col items-start'>
      <span className='text-or-muted whitespace-nowrap'>{dateTime(props.apiKey.created_time, lang)}</span>
      {accessed > 0 ? (
        <span className='text-or-dim flex items-center gap-1 text-[12px] whitespace-nowrap' title={dateTime(accessed, lang)}>
          {t('最近使用 {time}', { time: relativeTime(accessed, props.now, lang) })}
          {stale ? <Tag tone='warning'>{t('久未使用')}</Tag> : null}
        </span>
      ) : null}
    </div>
  )
}
