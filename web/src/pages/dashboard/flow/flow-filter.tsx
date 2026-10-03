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

import { Button, Modal, TextInput } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'

import { EmptyNote } from '../dashboard-ui'
import type { FlowOption, NodeRef } from './flow-data'
import { STAGE_INFO } from './flow-controls'
import type { FlowKind } from './flow-paths'

/**
 * Picks users and nodes to keep: within a column any picked node passes,
 * across columns all must. Values follow the width metric.
 */
export function FlowFilterDialog(props: {
  stages: FlowKind[]
  options: FlowOption[]
  chosen: NodeRef[]
  format: (value: number) => string
  onToggle: (node: NodeRef) => void
  onClear: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const isChosen = (option: FlowOption) => props.chosen.some((item) => item.kind === option.kind && item.id === option.id)
  const groups = props.stages
    .map((stage) => ({
      stage,
      options: props.options.filter((option) => option.kind === stage && (!needle || option.label.toLowerCase().includes(needle))),
    }))
    .filter((group) => group.options.length > 0)

  return (
    <Modal
      title={t('筛选节点')}
      onClose={props.onClose}
      size='lg'
      footer={
        <>
          <Button onClick={props.onClear} disabled={props.chosen.length === 0}>
            {t('清除全部')}
          </Button>
          <Button variant='primary' onClick={props.onClose}>
            {t('完成')}
          </Button>
        </>
      }
    >
      <TextInput value={query} onChange={setQuery} placeholder={t('搜索节点')} ariaLabel={t('搜索节点')} />
      {groups.length === 0 ? <EmptyNote>{t('没有匹配的节点')}</EmptyNote> : null}
      {groups.map((group) => (
        <fieldset key={group.stage} className='mt-4'>
          <legend className='text-or-muted text-[12px] font-medium'>{t(STAGE_INFO[group.stage].label)}</legend>
          <ul className='mt-1 flex flex-col'>
            {group.options.map((option) => (
              <li key={option.id}>
                <label className='hover:bg-or-fill flex cursor-pointer items-center gap-2.5 rounded-[6px] px-2 py-1.5 text-[14px]'>
                  <input type='checkbox' checked={isChosen(option)} onChange={() => props.onToggle({ kind: option.kind, id: option.id })} className='accent-or-primary size-4 shrink-0' />
                  <span className='min-w-0 flex-1 truncate'>{option.label}</span>
                  <span className='text-or-dim shrink-0 text-[13px] tabular-nums'>{props.format(option.value)}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ))}
    </Modal>
  )
}
