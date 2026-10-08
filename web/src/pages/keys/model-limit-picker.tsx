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

import { Button, TextInput } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'

import { CHECKBOX } from './bulk-actions'

/**
 * Ticks the models a key may call (none ticked: every model). Models the key
 * already lists stay offered even when the account no longer has them.
 */
export function ModelLimitPicker(props: {
  id: string
  models: string[]
  loading: boolean
  value: string[]
  onChange: (value: string[]) => void
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const all = [...props.value.filter((model) => !props.models.includes(model)), ...props.models]
  const needle = query.trim().toLowerCase()
  const shown = needle ? all.filter((model) => model.toLowerCase().includes(needle)) : all

  function toggle(model: string, checked: boolean) {
    props.onChange(checked ? [...props.value, model] : props.value.filter((item) => item !== model))
  }

  return (
    <div className='border-or-line rounded-[6px] border'>
      <div className='border-or-line flex items-center gap-2 border-b p-2'>
        <TextInput id={props.id} type='search' value={query} onChange={setQuery} placeholder={t('搜索模型')} className='h-8' />
        <span className='text-or-muted text-[12px] whitespace-nowrap'>{t('已选 {count} 个', { count: props.value.length })}</span>
        {props.value.length ? (
          <Button size='sm' variant='ghost' onClick={() => props.onChange([])}>
            {t('清空')}
          </Button>
        ) : null}
      </div>
      <ul className='max-h-48 overflow-y-auto p-1'>
        {shown.map((model) => (
          <li key={model}>
            <label className='hover:bg-or-fill flex cursor-pointer items-center gap-2 rounded-[4px] px-2 py-1.5'>
              <input type='checkbox' className={CHECKBOX} checked={props.value.includes(model)} onChange={(event) => toggle(model, event.target.checked)} />
              <span className='font-geist min-w-0 truncate text-[13px]'>{model}</span>
            </label>
          </li>
        ))}
        {shown.length === 0 ? (
          <li className='text-or-muted px-2 py-3 text-center text-[13px]'>{props.loading ? t('加载中…') : t('没有匹配的模型')}</li>
        ) : null}
      </ul>
    </div>
  )
}
