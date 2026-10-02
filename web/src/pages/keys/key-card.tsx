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
import { useI18n } from '@/i18n/i18n'
import type { KeyRowProps } from '@/pages/console/key-row'

import { KeyActions } from './key-actions'
import { ExpiryInfo, GroupInfo, LimitTags, QuotaInfo, StatusTag, UsageTimes } from './key-cells'
import { KeyValue } from './key-value'
import { useFullKey } from './use-full-key'

function Detail(props: { label: string; children: React.ReactNode }) {
  return (
    <div className='min-w-0'>
      <dt className='text-or-dim text-[12px]'>{props.label}</dt>
      <dd className='mt-0.5'>{props.children}</dd>
    </div>
  )
}

/** A key on a phone: the same facts and actions as a table row, stacked. */
export function KeyCard(props: KeyRowProps) {
  const { t } = useI18n()
  const key = props.apiKey
  const full = useFullKey(key.id)
  const name = key.name || t('未命名')

  return (
    <li aria-label={name} className='border-or-line border-t px-4 py-3 first:border-t-0'>
      <div className='flex min-w-0 items-center gap-2'>
        <span className='min-w-0 truncate font-medium'>{name}</span>
        <StatusTag status={key.status} />
      </div>
      <div className='mt-1'>
        <KeyValue masked={key.key} full={full} />
      </div>
      <LimitTags apiKey={key} />
      <dl className='mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]'>
        <Detail label={t('额度上限')}>
          <QuotaInfo apiKey={key} alignStart />
        </Detail>
        <Detail label={t('分组')}>
          <GroupInfo apiKey={key} groups={props.groups} />
        </Detail>
        <Detail label={t('到期')}>
          <ExpiryInfo expiredTime={key.expired_time} now={props.now} />
        </Detail>
        <Detail label={t('创建时间')}>
          <UsageTimes apiKey={key} now={props.now} />
        </Detail>
      </dl>
      <div className='mt-2'>
        <KeyActions apiKey={key} full={full} />
      </div>
    </li>
  )
}
