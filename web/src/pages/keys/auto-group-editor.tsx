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
import { ArrowDown, ArrowRight, ArrowUp, X } from 'lucide-react'

import { Button, Select, Tag } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'

import type { AutoMode } from './key-form'
import { ICON_BUTTON } from './key-value'
import type { UserGroup } from './keys-api'

export type AutoOrder = { mode: AutoMode; groups: string[] }

function Ratio(props: { group?: UserGroup }) {
  if (!props.group || props.group.ratio === null) return null
  return <Tag>{`×${props.group.ratio}`}</Tag>
}

/**
 * Which groups an auto key tries, in order: the account's global order, or
 * the key's own list (added, moved up / down, removed) up to the server's limit.
 */
export function AutoGroupEditor(props: {
  value: AutoOrder
  /** Groups the account can use, auto excluded. */
  options: UserGroup[]
  /** The account's global auto order. */
  global: string[]
  max: number
  onChange: (value: AutoOrder) => void
}) {
  const { t } = useI18n()
  const byName = new Map(props.options.map((group) => [group.name, group]))
  const inherit = props.value.mode === 'inherit'
  const chosen = props.value.groups
  const atLimit = !inherit && chosen.length >= props.max
  const candidates = props.options.filter((group) => !chosen.includes(group.name))
  const global = props.global.filter((name) => byName.has(name))
  const shown = inherit ? global : chosen

  function add(name: string) {
    if (!name) return
    props.onChange({ mode: 'custom', groups: inherit ? [name] : [...chosen, name] })
  }

  function move(index: number, step: number) {
    const next = [...chosen]
    const target = index + step
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    props.onChange({ mode: 'custom', groups: next })
  }

  const addLabel = atLimit ? t('最多 {max} 个分组', { max: props.max }) : t('添加分组')
  return (
    <div className='border-or-line flex flex-col gap-3 rounded-[8px] border p-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='text-or-muted text-[12px]' aria-live='polite'>
          {inherit
            ? t('正在使用全局自动分组顺序（{count} 个分组）', { count: global.length })
            : t('已选 {count} / {max} 个分组', { count: chosen.length, max: props.max })}
        </p>
        <Button size='sm' disabled={inherit} onClick={() => props.onChange({ mode: 'inherit', groups: [] })}>
          {t('恢复全局顺序')}
        </Button>
      </div>
      <Select
        ariaLabel={t('添加分组')}
        value=''
        onChange={add}
        disabled={atLimit || candidates.length === 0}
        options={[{ value: '', label: addLabel }, ...candidates.map((group) => ({ value: group.name, label: group.name }))]}
      />
      {shown.length === 0 ? (
        <p className='text-or-muted rounded-[6px] border border-dashed border-or-line px-3 py-4 text-center text-[13px]'>
          {inherit ? t('全局自动分组顺序中没有可用的分组。') : t('没有有效的自定义分组，请添加分组或恢复全局顺序。')}
        </p>
      ) : (
        <ol aria-label={t('自动分组顺序')} className={inherit ? 'flex flex-wrap items-center gap-1.5' : 'flex flex-col gap-1.5'}>
          {shown.map((name, index) => (
            <li key={name} data-group={name} className='flex min-w-0 items-center gap-1.5'>
              {inherit && index > 0 ? <ArrowRight className='text-or-dim size-3.5 shrink-0' aria-hidden='true' /> : null}
              <span
                className={
                  inherit
                    ? 'border-or-line bg-or-fill flex min-w-0 items-center gap-1.5 rounded-[6px] border px-2 py-1 text-[13px]'
                    : 'border-or-line flex min-w-0 flex-1 items-center gap-2 rounded-[6px] border px-2 py-1.5 text-[14px]'
                }
                title={byName.get(name)?.desc || undefined}
              >
                <span className='bg-or-primary-soft text-or-primary flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums'>
                  {index + 1}
                </span>
                <span className='min-w-0 flex-1 truncate font-medium'>{name}</span>
                <Ratio group={byName.get(name)} />
                {inherit ? null : (
                  <span className='flex shrink-0 items-center'>
                    <button type='button' className={ICON_BUTTON} disabled={index === 0} onClick={() => move(index, -1)} aria-label={t('上移 {group}', { group: name })}>
                      <ArrowUp className='size-3.5' aria-hidden='true' />
                    </button>
                    <button type='button' className={ICON_BUTTON} disabled={index === chosen.length - 1} onClick={() => move(index, 1)} aria-label={t('下移 {group}', { group: name })}>
                      <ArrowDown className='size-3.5' aria-hidden='true' />
                    </button>
                    <button
                      type='button'
                      className={ICON_BUTTON}
                      onClick={() => props.onChange({ mode: 'custom', groups: chosen.filter((item) => item !== name) })}
                      aria-label={t('移除 {group}', { group: name })}
                    >
                      <X className='size-3.5' aria-hidden='true' />
                    </button>
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
