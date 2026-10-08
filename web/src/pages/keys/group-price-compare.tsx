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

import { Button, Select, Tag } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { priceSummary } from '@/lib/pricing'
import { useCatalog, useCurrency } from '@/lib/queries'

import type { UserGroup } from './keys-api'

/**
 * What one model costs in each group the account can use (the group ratio
 * applied), so a key can be put in the cheapest lane that serves it.
 */
export function GroupPriceCompare(props: { groups: UserGroup[]; value: string; onPick: (group: string) => void }) {
  const { t } = useI18n()
  const currency = useCurrency()
  const catalog = useCatalog()
  const [modelName, setModelName] = useState('')
  const model = catalog.models.find((item) => item.model_name === modelName) ?? catalog.models[0]

  if (catalog.isLoading) return <p className='text-or-muted text-[13px]'>{t('加载中…')}</p>
  if (!model) return <p className='text-or-muted text-[13px]'>{t('暂无数据')}</p>

  const serves = (group: UserGroup) => model.enable_groups.includes('all') || model.enable_groups.includes(group.name)
  const rows = props.groups.filter(serves)
  return (
    <div className='flex flex-col gap-2'>
      <Select
        ariaLabel={t('参考模型')}
        value={model.model_name}
        onChange={setModelName}
        options={catalog.models.map((item) => ({ value: item.model_name, label: item.model_name }))}
      />
      {rows.length === 0 ? (
        <p className='text-or-muted text-[13px]'>{t('这个模型没有你可用的分组。')}</p>
      ) : (
        <div className='border-or-line overflow-x-auto rounded-[6px] border'>
          <table className='w-full min-w-[420px] text-left text-[13px]'>
            <thead className='text-or-muted'>
              <tr>
                {[t('分组'), t('倍率'), t('输入 /M'), t('输出 /M')].map((label) => (
                  <th key={label} scope='col' className='px-3 py-2 font-medium whitespace-nowrap'>
                    {label}
                  </th>
                ))}
                <th scope='col' className='px-3 py-2'>
                  <span className='sr-only'>{t('操作')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((group) => {
                const ratio = group.ratio ?? 1
                const price = priceSummary(model, currency, ratio)
                return (
                  <tr key={group.name} className='border-or-line border-t'>
                    <td className='px-3 py-2 font-medium'>{group.name}</td>
                    <td className='px-3 py-2'>
                      <Tag>{`×${ratio}`}</Tag>
                    </td>
                    <td className='px-3 py-2 tabular-nums'>{price.perRequest ? t('{price} / 次', { price: price.perRequest }) : price.input}</td>
                    <td className='px-3 py-2 tabular-nums'>{price.output}</td>
                    <td className='px-3 py-2 text-right'>
                      {props.value === group.name ? (
                        <span className='text-or-primary text-[12px] font-medium whitespace-nowrap'>{t('当前分组')}</span>
                      ) : (
                        <Button size='sm' onClick={() => props.onPick(group.name)} ariaLabel={t('选用 {group}', { group: group.name })}>
                          {t('选用')}
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
