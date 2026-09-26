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
import { Check, ChevronDown, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { ProviderIcon } from '@/components/provider-icon'
import { useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'
import type { CatalogModel } from '@/lib/queries'

const s = {
  trigger: 'text-or-muted hover:text-or-fg hover:bg-or-fill h-9 rounded-full px-3 text-[13px] font-medium',
  panel: 'border-or-line bg-or-card rounded-[8px] border shadow-xl',
  search: 'border-or-line text-or-fg placeholder:text-or-dim border-b',
  item: 'text-or-fg hover:bg-or-fill rounded-[6px]',
  active: 'bg-or-fill',
  muted: 'text-or-muted',
}

type VendorGroup = { vendor: string; icon?: string; models: CatalogModel[] }

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

/** Models under their vendor: vendors A–Z with `other` last, model names in natural order. */
export function groupByVendor(models: CatalogModel[], other: string): VendorGroup[] {
  const lists = new Map<string, CatalogModel[]>()
  for (const model of models) lists.set(model.vendor, [...(lists.get(model.vendor) ?? []), model])
  const vendors = [...lists.keys()].sort((a, b) => {
    if (a === other) return 1
    if (b === other) return -1
    return byName(a, b)
  })
  return vendors.map((vendor) => {
    const list = lists.get(vendor) ?? []
    return {
      vendor,
      icon: list.find((model) => model.vendorIcon)?.vendorIcon,
      models: [...list].sort((a, b) => byName(a.model_name, b.model_name)),
    }
  })
}

/** Searchable model menu at the bottom right of the message box, grouped by vendor; it opens upwards. */
export function ModelPicker(props: {
  models: CatalogModel[]
  value: string
  onChange: (model: string) => void
  loading?: boolean
  className?: string
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const current = props.models.find((m) => m.model_name === props.value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return props.models
    return props.models.filter((m) => m.model_name.toLowerCase().includes(q) || m.vendor.toLowerCase().includes(q))
  }, [props.models, query])
  const groups = useMemo(() => groupByVendor(filtered, t('其他')), [filtered, t])
  const first = groups[0]?.models[0]

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (name: string) => {
    props.onChange(name)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={rootRef} className={cn('relative', props.className)}>
      <button
        type='button'
        aria-haspopup='listbox'
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn('flex max-w-full min-w-0 items-center gap-1.5 transition-colors', s.trigger)}
      >
        {props.value ? (
          <ProviderIcon name={current?.vendorIcon} fallback={current?.vendor ?? props.value} size={15} />
        ) : null}
        <span className='max-w-[150px] min-w-0 truncate text-left sm:max-w-[240px]'>
          {props.value || (props.loading ? t('加载模型中…') : t('选择模型'))}
        </span>
        <ChevronDown className='size-3.5 shrink-0' aria-hidden='true' />
      </button>

      {open ? (
        <div className={cn('absolute right-0 bottom-full z-50 mb-2 w-[360px] max-w-[calc(100vw-32px)]', s.panel)}>
          <label className={cn('flex h-10 items-center gap-2 px-3', s.search)}>
            <Search className={cn('size-4 shrink-0', s.muted)} aria-hidden='true' />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && first) choose(first.model_name)
              }}
              placeholder={t('搜索模型或厂商')}
              aria-label={t('搜索模型')}
              className='w-full bg-transparent text-[14px] outline-none'
            />
          </label>
          <div className={cn('px-3 pt-2 text-[12px]', s.muted)}>{t('共 {count} 个模型', { count: filtered.length })}</div>
          <ul role='listbox' aria-label={t('模型')} className='max-h-[min(460px,55vh)] overflow-y-auto px-1 pb-1'>
            {filtered.length === 0 ? (
              <li className={cn('px-3 py-6 text-center text-[13px]', s.muted)}>{t('没有匹配的模型')}</li>
            ) : null}
            {groups.map((group) => (
              <li key={group.vendor} role='group' aria-label={group.vendor}>
                <div
                  aria-hidden='true'
                  className={cn('bg-or-card sticky top-0 z-10 flex items-center gap-2 px-2.5 pt-2.5 pb-1 text-[12px] font-medium', s.muted)}
                >
                  <ProviderIcon name={group.icon} fallback={group.vendor} size={14} />
                  <span className='truncate'>{group.vendor}</span>
                  <span className='text-or-dim'>{group.models.length}</span>
                </div>
                <ul role='presentation'>
                  {group.models.map((m) => {
                    const selected = m.model_name === props.value
                    return (
                      <li key={m.model_name} role='option' aria-selected={selected}>
                        <button
                          type='button'
                          onClick={() => choose(m.model_name)}
                          className={cn('flex w-full items-center gap-2.5 px-2.5 py-2 text-left text-[14px]', s.item, selected && s.active)}
                        >
                          <ProviderIcon name={m.vendorIcon} fallback={m.vendor} size={16} />
                          <span className='min-w-0 flex-1 truncate'>{m.model_name}</span>
                          {selected ? <Check className='size-4 shrink-0' aria-hidden='true' /> : null}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
