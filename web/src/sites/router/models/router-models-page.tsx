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
import { ArrowDownWideNarrow, BarChart3, List, MessageSquare, Search, Table2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { tk, useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'
import {
  EMPTY_FILTERS,
  MODALITY_LABELS,
  applyFilters,
  countBy,
  outputsOf,
  type ModelFilters,
  type SortKey,
} from '@/lib/model-filters'
import { useCatalog, useCurrency, useRankings } from '@/lib/queries'
import type { Modality } from '@/lib/services'

import { RouterShell } from '../router-shell'
import { RouterFilterSidebar } from './router-filter-sidebar'
import { RouterModelRow, RouterModelTable } from './router-model-row'

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: 'newest', label: tk('最新') },
  { id: 'price-asc', label: tk('价格从低到高') },
  { id: 'price-desc', label: tk('价格从高到低') },
  { id: 'context', label: tk('上下文最长') },
  { id: 'name', label: tk('名称') },
]

const control = 'border-or-line bg-or-fg/4 h-9 rounded-[6px] border text-[14px]'
const outlineButton = 'border-or-line bg-or-bg hover:bg-or-fill flex h-9 items-center gap-2 rounded-[6px] border px-3 text-[14px] font-medium'

export function RouterModelsPage() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const { models, isLoading } = useCatalog()
  const currency = useCurrency()
  const week = useRankings('week')
  const [filters, setFilters] = useState<ModelFilters>({ ...EMPTY_FILTERS, query: params.get('q') ?? '' })
  const [view, setView] = useState<'list' | 'table'>('list')

  const tokens = useMemo(() => new Map((week.data?.models ?? []).map((r) => [r.model_name, r.total_tokens])), [week.data])
  const filtered = useMemo(() => applyFilters(models, filters), [models, filters])
  const outputCounts = useMemo(() => countBy(applyFilters(models, { ...filters, outputModality: 'all' }), outputsOf), [models, filters])
  const tabs: Array<{ id: Modality | 'all'; label: string }> = [
    { id: 'all', label: t('全部') },
    ...(['text', 'image', 'audio', 'video'] as Modality[]).map((m) => ({ id: m, label: `${t(MODALITY_LABELS[m])} ${outputCounts.get(m) ?? 0}` })),
  ]

  return (
    <RouterShell footer={false}>
      <div className='flex'>
        <aside className='border-or-line sticky top-14 hidden h-[calc(100vh-56px)] xl:top-[78px] xl:h-[calc(100vh-78px)] w-[267px] shrink-0 overflow-y-auto border-r px-6 py-3 lg:block'>
          <RouterFilterSidebar models={models} filters={filters} onChange={setFilters} />
        </aside>
        <div className='min-w-0 flex-1 px-6 py-3 lg:pl-[21px] lg:pr-6'>
          <div className='flex h-[48px] items-center justify-between'>
            <h1 className='text-[22px] font-semibold tracking-[-0.01em]'>{t('模型')}</h1>
            <div className='flex gap-2'>
              <Link to='/rankings' className={outlineButton}>
                <BarChart3 className='size-4' /> {t('排行榜')}
              </Link>
              <Link to='/chat' className={outlineButton}>
                <MessageSquare className='size-4' /> {t('开始对话')}
              </Link>
            </div>
          </div>

          <div className='mt-3 flex flex-wrap items-center gap-2'>
            <div className='relative w-full max-w-[499px] flex-1'>
              <Search className='text-or-muted absolute top-1/2 left-3 size-4 -translate-y-1/2' aria-hidden='true' />
              <input
                value={filters.query}
                onChange={(e) => setFilters({ ...filters, query: e.target.value })}
                placeholder={t('搜索模型…')}
                aria-label={t('搜索模型')}
                className={cn(control, 'text-or-fg placeholder:text-or-dim w-full pr-3 pl-9 outline-none focus:border-or-fg/25')}
              />
            </div>
            <label className={cn(control, 'text-or-muted relative flex w-[192px] items-center gap-2 px-3')}>
              <ArrowDownWideNarrow className='size-4' />
              <select
                value={filters.sort}
                onChange={(e) => setFilters({ ...filters, sort: e.target.value as SortKey })}
                className='bg-or-bg text-or-muted flex-1 appearance-none outline-none'
                aria-label={t('排序')}
              >
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>{t(s.label)}</option>
                ))}
              </select>
            </label>
            <div className='border-or-line ml-auto flex h-9 items-center gap-0.5 rounded-[6px] border p-0.5'>
              {([
                ['list', t('列表'), <List key='l' className='size-4' />],
                ['table', t('表格'), <Table2 key='t' className='size-4' />],
              ] as const).map(([id, label, icon]) => (
                <button
                  key={id}
                  type='button'
                  aria-pressed={view === id}
                  onClick={() => setView(id)}
                  className={cn('flex h-[31px] items-center gap-1.5 rounded-[4px] px-2.5 text-[14px] font-medium', view === id ? 'bg-or-fill text-or-primary' : 'text-or-muted')}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div role='tablist' className='border-or-line mt-4 flex overflow-x-auto overflow-y-hidden border-b'>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type='button'
                role='tab'
                aria-selected={filters.outputModality === tab.id}
                onClick={() => setFilters({ ...filters, outputModality: tab.id })}
                className={cn(
                  '-mb-px border-b-2 px-4 py-2 text-[14px] font-medium whitespace-nowrap',
                  filters.outputModality === tab.id ? 'border-or-primary text-or-primary' : 'text-or-muted hover:text-or-fg border-transparent'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className='text-or-muted mt-4 mb-3 text-[13px]'>{isLoading ? t('加载中…') : t('{count} 个模型', { count: filtered.length })}</div>
          {view === 'list' ? (
            <div className='flex flex-col gap-4 pb-16'>
              {filtered.map((m) => (
                <RouterModelRow key={m.model_name} model={m} tokens={tokens.get(m.model_name)} currency={currency} />
              ))}
            </div>
          ) : (
            <div className='pb-16'>
              <RouterModelTable models={filtered} tokens={tokens} currency={currency} />
            </div>
          )}
          {!isLoading && filtered.length === 0 ? (
            <div className='text-or-muted py-24 text-center text-[14px]'>{t('没有符合条件的模型')}</div>
          ) : null}
        </div>
      </div>
    </RouterShell>
  )
}
