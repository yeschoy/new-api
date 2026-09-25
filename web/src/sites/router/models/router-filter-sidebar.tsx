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
import { Check, ChevronDown, Code2, DollarSign, Layers, MessageSquareText, Ruler, Users } from 'lucide-react'
import { useState } from 'react'

import { tk, useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'
import {
  CAPABILITY_LABELS,
  MODALITY_LABELS,
  countBy,
  inputsOf,
  toggle,
  type ModelFilters,
} from '@/lib/model-filters'
import type { CatalogModel } from '@/lib/queries'
import type { Modality } from '@/lib/services'

function Group(props: { icon: React.ReactNode; title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(props.defaultOpen ?? false)
  return (
    <div>
      <button
        type='button'
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className='flex h-[47px] w-full items-center gap-2 px-2 py-3 text-left text-[14px] font-medium'
      >
        <span className='text-or-fg'>{props.icon}</span>
        <span className='flex-1'>{props.title}</span>
        <ChevronDown className={cn('text-or-muted size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? <div className='pb-2'>{props.children}</div> : null}
    </div>
  )
}

function CheckRow(props: { label: string; checked: boolean; count?: number; onToggle: () => void }) {
  return (
    <button
      type='button'
      role='checkbox'
      aria-checked={props.checked}
      onClick={props.onToggle}
      className='hover:bg-or-fill flex h-8 w-full items-center gap-2 rounded-[6px] px-2 text-left text-[14px]'
    >
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-[4px] border',
          props.checked ? 'border-or-primary bg-or-primary text-or-bg' : 'border-or-fg/30'
        )}
      >
        {props.checked ? <Check className='size-3' strokeWidth={3} /> : null}
      </span>
      <span className={cn('flex-1 truncate', props.checked ? 'text-or-fg' : 'text-or-muted')}>{props.label}</span>
      {props.count !== undefined ? <span className='text-or-dim text-[12px]'>{props.count}</span> : null}
    </button>
  )
}

const CONTEXTS = [
  { label: tk('不限'), value: 0 },
  { label: '≥ 32K', value: 32_000 },
  { label: '≥ 128K', value: 128_000 },
  { label: '≥ 1M', value: 1_000_000 },
]

const PRICES: Array<{ label: string; value: number | null }> = [
  { label: tk('不限'), value: null },
  { label: tk('免费'), value: 0 },
  { label: tk('≤ $1 / 百万 tokens'), value: 1 },
  { label: tk('≤ $5 / 百万 tokens'), value: 5 },
]

/** Left rail: 219px of collapsible filter groups, checkbox rows 32px tall. */
export function RouterFilterSidebar(props: {
  models: CatalogModel[]
  filters: ModelFilters
  onChange: (next: ModelFilters) => void
}) {
  const { t } = useI18n()
  const f = props.filters
  const set = (patch: Partial<ModelFilters>) => props.onChange({ ...f, ...patch })
  const vendorCounts = countBy(props.models, (m) => [m.vendor])
  const inputCounts = countBy(props.models, inputsOf)
  const capCounts = countBy(props.models, (m) => m.capabilities ?? [])
  const vendors = [...vendorCounts.entries()].sort((a, b) => b[1] - a[1])

  return (
    <div className='flex flex-col'>
      <Group icon={<MessageSquareText className='size-4' />} title={t('输入模态')} defaultOpen>
        {(Object.keys(MODALITY_LABELS) as Modality[]).map((m) => (
          <CheckRow
            key={m}
            label={t(MODALITY_LABELS[m])}
            count={inputCounts.get(m) ?? 0}
            checked={f.inputModalities.includes(m)}
            onToggle={() => set({ inputModalities: toggle(f.inputModalities, m) })}
          />
        ))}
      </Group>
      <Group icon={<Ruler className='size-4' />} title={t('上下文长度')}>
        {CONTEXTS.map((c) => (
          <CheckRow key={c.label} label={t(c.label)} checked={f.minContext === c.value} onToggle={() => set({ minContext: c.value })} />
        ))}
      </Group>
      <Group icon={<DollarSign className='size-4' />} title={t('输入价格')}>
        {PRICES.map((p) => (
          <CheckRow key={p.label} label={t(p.label)} checked={f.maxInputUsd === p.value} onToggle={() => set({ maxInputUsd: p.value })} />
        ))}
      </Group>
      <Group icon={<Code2 className='size-4' />} title={t('支持的功能')}>
        {Object.entries(CAPABILITY_LABELS).map(([key, label]) => (
          <CheckRow
            key={key}
            label={t(label)}
            count={capCounts.get(key) ?? 0}
            checked={f.capabilities.includes(key)}
            onToggle={() => set({ capabilities: toggle(f.capabilities, key) })}
          />
        ))}
      </Group>
      <Group icon={<Users className='size-4' />} title={t('模型厂商')} defaultOpen>
        {vendors.map(([vendor, count]) => (
          <CheckRow key={vendor} label={vendor} count={count} checked={f.vendors.includes(vendor)} onToggle={() => set({ vendors: toggle(f.vendors, vendor) })} />
        ))}
      </Group>
      <Group icon={<Layers className='size-4' />} title={t('系列')}>
        <p className='text-or-dim px-2 py-1 text-[13px]'>{t('按厂商筛选即可查看同系列模型。')}</p>
      </Group>
    </div>
  )
}
