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
import { CHECKBOX } from '@/pages/keys/bulk-actions'
import { KeyActions } from '@/pages/keys/key-actions'
import { ExpiryInfo, GroupInfo, LimitTags, QuotaInfo, StatusTag, UsageTimes } from '@/pages/keys/key-cells'
import { KeyValue } from '@/pages/keys/key-value'
import type { KeyDetail, UserGroup } from '@/pages/keys/keys-api'
import { useFullKey } from '@/pages/keys/use-full-key'

import { Td, Tr } from './console-table'

export type KeyRowProps = {
  apiKey: KeyDetail
  groups: Map<string, UserGroup>
  now: number
  selected: boolean
  onSelect: (checked: boolean) => void
}

/** One key in the table: name and limits, masked key with reveal / copy, group, credit, times and actions. */
export function KeyRow(props: KeyRowProps) {
  const { t } = useI18n()
  const key = props.apiKey
  const full = useFullKey(key.id)
  const name = key.name || t('未命名')

  return (
    <Tr>
      <Td className='w-10 pr-0'>
        <input
          type='checkbox'
          className={CHECKBOX}
          checked={props.selected}
          onChange={(event) => props.onSelect(event.target.checked)}
          aria-label={t('选择 {name}', { name })}
        />
      </Td>
      <Td>
        <div className='flex items-center gap-2'>
          <span className='max-w-[180px] truncate font-medium' title={key.name}>
            {name}
          </span>
          <StatusTag status={key.status} />
        </div>
        <LimitTags apiKey={key} />
      </Td>
      <Td>
        <KeyValue masked={key.key} full={full} />
      </Td>
      <Td>
        <GroupInfo apiKey={key} groups={props.groups} />
      </Td>
      <Td right>
        <QuotaInfo apiKey={key} />
      </Td>
      <Td>
        <ExpiryInfo expiredTime={key.expired_time} now={props.now} />
      </Td>
      <Td>
        <UsageTimes apiKey={key} now={props.now} />
      </Td>
      <Td right>
        <KeyActions apiKey={key} full={full} />
      </Td>
    </Tr>
  )
}
