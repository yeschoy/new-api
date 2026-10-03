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
import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'

import { Field, Select, Switch } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'

import { AutoGroupEditor } from './auto-group-editor'
import { GroupPriceCompare } from './group-price-compare'
import type { KeyForm } from './key-form'
import type { AutoGroupConfig, UserGroup } from './keys-api'

type Translate = ReturnType<typeof useI18n>['t']

function groupLabel(group: UserGroup, t: Translate): string {
  const desc = group.desc && group.desc !== group.name ? ` · ${group.desc}` : ''
  if (group.name === 'auto') return `${t('自动分组')}${desc}`
  const ratio = group.ratio === null ? '' : ` ×${group.ratio}`
  return `${group.name}${ratio}${desc}`
}

function groupHint(name: string, groups: UserGroup[], t: Translate): string | undefined {
  if (!name) return t('使用账户所在的分组。')
  const desc = groups.find((group) => group.name === name)?.desc
  if (name === 'auto') return desc || t('按顺序自动选择可用的分组')
  return desc || undefined
}

/**
 * The key's group (with each group's ratio and description), a price
 * comparison to pick one, and for auto the group order and cross-group retry.
 */
export function GroupField(props: {
  form: KeyForm
  groups: UserGroup[]
  auto?: AutoGroupConfig
  onGroup: (group: string) => void
  onChange: (patch: Partial<KeyForm>) => void
}) {
  const { t } = useI18n()
  const id = useId()
  const [comparing, setComparing] = useState(false)
  const group = props.form.group
  const known = group === '' || props.groups.some((item) => item.name === group)
  const plain = props.groups.filter((item) => item.name !== 'auto')
  const options = [
    { value: '', label: t('账户默认分组') },
    ...props.groups.map((item) => ({ value: item.name, label: groupLabel(item, t) })),
    // Shown until the account's groups are in, so the choice is never hidden.
    ...(known ? [] : [{ value: group, label: group === 'auto' ? t('自动分组') : group }]),
  ]

  return (
    <div className='flex flex-col gap-3'>
      <Field label={t('分组')} htmlFor={id} hint={groupHint(group, props.groups, t)}>
        <Select id={id} value={group} onChange={props.onGroup} options={options} />
      </Field>
      {plain.length ? (
        <div>
          <button
            type='button'
            aria-expanded={comparing}
            onClick={() => setComparing(!comparing)}
            className='text-or-muted hover:text-or-fg inline-flex items-center gap-1 text-[13px] font-medium'
          >
            {t('比较各分组价格')}
            <ChevronDown className={cn('size-3.5 transition-transform', comparing && 'rotate-180')} aria-hidden='true' />
          </button>
          {comparing ? (
            <div className='mt-2'>
              <GroupPriceCompare groups={plain} value={group} onPick={props.onGroup} />
            </div>
          ) : null}
        </div>
      ) : null}
      {group === 'auto' ? (
        <>
          <div className='flex flex-col gap-1.5'>
            <span className='text-or-fg text-[13px] font-medium'>{t('自动分组顺序')}</span>
            <span className='text-or-dim text-[12px]'>{t('选择并排列这个密钥依次尝试的分组。')}</span>
            <AutoGroupEditor
              value={{ mode: props.form.autoMode, groups: props.form.autoGroups }}
              options={plain}
              global={props.auto?.groups ?? []}
              max={props.auto?.max ?? 5}
              onChange={(value) => props.onChange({ autoMode: value.mode, autoGroups: value.groups })}
            />
          </div>
          <div className='flex items-start justify-between gap-4'>
            <div className='min-w-0'>
              <div className='text-or-fg text-[13px] font-medium'>{t('跨分组重试')}</div>
              <p className='text-or-dim text-[12px]'>{t('当前分组的渠道都失败时，按顺序尝试下一个分组。')}</p>
            </div>
            <Switch
              checked={props.form.crossGroupRetry}
              onChange={(checked) => props.onChange({ crossGroupRetry: checked })}
              label={t('跨分组重试')}
              hideLabel
            />
          </div>
        </>
      ) : null}
    </div>
  )
}
