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
import { useId } from 'react'

import { Button, Field, TextInput } from '@/components/ui'
import { tk, useI18n } from '@/i18n/i18n'

import { expiryAfter } from './key-form'

const PRESETS = [
  { label: tk('永不过期'), span: {} },
  { label: tk('1 个月'), span: { months: 1 } },
  { label: tk('1 天'), span: { days: 1 } },
  { label: tk('1 小时'), span: { hours: 1 } },
]

/** When the key stops working: a date and time, or one of the quick presets. */
export function ExpiryField(props: { value: string; onChange: (value: string) => void }) {
  const { t } = useI18n()
  const id = useId()
  return (
    <Field label={t('过期时间')} htmlFor={id} hint={props.value ? undefined : t('留空表示永不过期')}>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
        <TextInput id={id} type='datetime-local' value={props.value} onChange={props.onChange} className='sm:max-w-[240px]' />
        <div className='grid grid-cols-4 gap-1 sm:flex'>
          {PRESETS.map((preset) => (
            <Button key={preset.label} size='sm' onClick={() => props.onChange(expiryAfter(new Date(), preset.span))}>
              {t(preset.label)}
            </Button>
          ))}
        </div>
      </div>
    </Field>
  )
}
