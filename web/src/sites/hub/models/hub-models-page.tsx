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
import { AudioLines, ChevronRight, Copy, FileText, Image, Search, Type, Video } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { ProviderIcon } from '@/components/provider-icon'
import { cn } from '@/lib/format'
import {
  CAPABILITY_LABELS,
  EMPTY_FILTERS,
  MODALITY_LABELS,
  applyFilters,
  countBy,
  toggle,
  type ModelFilters,
  type SortKey,
} from '@/lib/model-filters'
import { formatAmount, isTokenPriced, usdPerMillion, type CurrencyDisplay } from '@/lib/pricing'
import { useCatalog, useCurrency, useStatus, type CatalogModel } from '@/lib/queries'
import type { Modality } from '@/lib/services'

import { HubShell } from '../hub-shell'

const chip = 'inline-flex h-[22px] items-center gap-1 rounded-[8px] border border-black/10 px-[7px] text-[12px] leading-5 transition-colors'

function Chip(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type='button'
      aria-pressed={props.active}
      onClick={props.onClick}
      className={cn(chip, props.active ? 'bg-hub-blue border-hub-blue text-white' : 'bg-white/10 text-[rgba(0,0,0,0.88)] hover:border-hub-blue hover:text-hub-blue')}
    >
      {props.children}
    </button>
  )
}

function Row(props: { label: string; children: React.ReactNode }) {
  return (
    <div className='flex gap-4 py-1.5'>
      <span className='w-[70px] shrink-0 pt-0.5 text-[12px] leading-[18.9px] font-semibold text-[#111]'>{props.label}</span>
      <div className='flex flex-wrap gap-2'>{props.children}</div>
    </div>
  )
}

const MODALITY_ICON: Record<Modality, React.ReactNode> = {
  text: <Type className='size-3' />,
  image: <Image className='size-3' />,
  audio: <AudioLines className='size-3' />,
  video: <Video className='size-3' />,
  file: <FileText className='size-3' />,
}

function HubModelCard(props: { model: CatalogModel; currency: CurrencyDisplay; isNew: boolean }) {
  const m = props.model
  const [copied, setCopied] = useState(false)
  const lines: Array<[string, string]> = []
  if (isTokenPriced(m)) {
    lines.push(['输入', `${formatAmount(usdPerMillion(m, 'input') ?? 0, props.currency)} /M`])
    lines.push(['输出', `${formatAmount(usdPerMillion(m, 'output') ?? 0, props.currency)} /M`])
    const cache = usdPerMillion(m, 'cache')
    if (cache !== null) lines.push(['缓存读取', `${formatAmount(cache, props.currency)} /M`])
  } else {
    lines.push(['按次', `${formatAmount(m.model_price ?? 0, props.currency)} /次`])
  }
  return (
    <article className='rounded-[24px] border border-black/10 bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)]'>
      <div className='flex items-center gap-3'>
        <span className='flex size-8 items-center justify-center rounded-full border border-black/5'>
          <ProviderIcon name={m.vendorIcon} fallback={m.vendor} size={20} />
        </span>
        <Link to={`/models/${encodeURIComponent(m.model_name)}`} className='min-w-0 flex-1 truncate text-[16px] leading-[22px] font-medium text-[#111] hover:text-hub-blue'>
          {m.model_name}
        </Link>
        {props.isNew ? <span className='rounded-[6px] border border-[#87e8de] bg-[#e6fffb] px-2 text-[12px] leading-5 text-[#08979c]'>新</span> : null}
        <button
          type='button'
          onClick={() => {
            void navigator.clipboard?.writeText(m.model_name)
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1200)
          }}
          className='flex h-6 items-center gap-1 rounded-[8px] border border-[#e3e3e3] bg-white px-1.5 text-[12px] font-medium text-[rgba(0,0,0,0.88)] hover:border-hub-blue hover:text-hub-blue'
        >
          <Copy className='size-3' />
          {copied ? '已复制' : '复制 ID'}
        </button>
      </div>
      <ul className='mt-4 list-inside list-disc rounded-[12px] bg-[#f7f7f8] px-4 py-3 text-[12px] leading-[18.9px] text-[#353941]'>
        {lines.map(([label, value]) => (
          <li key={label}>
            {label}：<b className='font-semibold'>{value.split(' ')[0]}</b> {value.split(' ').slice(1).join(' ')}
          </li>
        ))}
      </ul>
      <p className='mt-4 line-clamp-2 text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)]'>{m.description || '暂无介绍'}</p>
    </article>
  )
}

const SORTS: Array<{ id: SortKey; label: string }> = [
  { id: 'newest', label: '最新' },
  { id: 'price-asc', label: '价格最低' },
  { id: 'price-desc', label: '价格最高' },
  { id: 'context', label: '上下文最长' },
  { id: 'name', label: '名称' },
]

export function HubModelsPage() {
  const [params] = useSearchParams()
  const { models, isLoading } = useCatalog()
  const { data: status } = useStatus()
  const currency = useCurrency()
  const [filters, setFilters] = useState<ModelFilters>({ ...EMPTY_FILTERS, query: params.get('q') ?? '' })
  const set = (patch: Partial<ModelFilters>) => setFilters({ ...filters, ...patch })
  const filtered = useMemo(() => applyFilters(models, filters), [models, filters])
  const vendors = [...countBy(models, (m) => [m.vendor]).entries()].sort((a, b) => b[1] - a[1])
  const newest = useMemo(() => new Set([...models].sort((a, b) => (b.release_date ?? '').localeCompare(a.release_date ?? '')).slice(0, 4).map((m) => m.model_name)), [models])

  return (
    <HubShell solidHeader>
      <div className='mx-auto max-w-[1280px] px-6 pt-10 xl:px-0'>
        <div className='flex flex-wrap items-center gap-4'>
          <h1 className='font-serif-display text-[32px] font-bold text-[rgba(0,0,0,0.88)]'>筛选</h1>
          <label className='flex h-8 w-[160px] items-center gap-1.5 rounded-[8px] border border-[#d9d9d9] bg-white px-2.5 focus-within:border-hub-link'>
            <input
              value={filters.query}
              onChange={(e) => set({ query: e.target.value })}
              placeholder='搜索模型…'
              aria-label='搜索模型'
              className='min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-black/25'
            />
            <Search className='size-3.5 text-black/45' aria-hidden='true' />
          </label>
          <span className='ml-auto text-[14px] text-[#353941]'>
            {filtered.length} <span className='text-black/45'>个模型</span>
          </span>
          {status?.docs_link ? (
            <a href={status.docs_link} target='_blank' rel='noopener noreferrer' className='flex items-center text-[14px] text-[#4096ff]'>
              模型接口 <ChevronRight className='size-4' />
            </a>
          ) : null}
        </div>

        <div className='mt-6 rounded-[24px] border border-black/10 bg-white px-6 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]'>
          <Row label='输出模态'>
            <Chip active={filters.outputModality === 'all'} onClick={() => set({ outputModality: 'all' })}>全部</Chip>
            {(['text', 'image', 'audio', 'video'] as Modality[]).map((m) => (
              <Chip key={m} active={filters.outputModality === m} onClick={() => set({ outputModality: m })}>
                {MODALITY_ICON[m]}
                {MODALITY_LABELS[m]}
              </Chip>
            ))}
          </Row>
          <Row label='能力'>
            <Chip active={filters.capabilities.length === 0} onClick={() => set({ capabilities: [] })}>全部</Chip>
            {Object.entries(CAPABILITY_LABELS).map(([key, label]) => (
              <Chip key={key} active={filters.capabilities.includes(key)} onClick={() => set({ capabilities: toggle(filters.capabilities, key) })}>
                {label}
              </Chip>
            ))}
          </Row>
          <Row label='模型厂商'>
            <Chip active={filters.vendors.length === 0} onClick={() => set({ vendors: [] })}>全部</Chip>
            {vendors.map(([vendor]) => (
              <Chip key={vendor} active={filters.vendors.includes(vendor)} onClick={() => set({ vendors: toggle(filters.vendors, vendor) })}>
                {vendor}
              </Chip>
            ))}
          </Row>
          <div className='flex flex-wrap items-center gap-4 pt-3'>
            <span className='w-[70px] text-[12px] font-semibold text-[#111]'>排序</span>
            <select
              value={filters.sort}
              onChange={(e) => set({ sort: e.target.value as SortKey })}
              aria-label='排序'
              className='h-9 w-[180px] rounded-[8px] border border-[#d9d9d9] bg-white px-3 text-[14px] outline-none'
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <span className='text-[14px] text-[#353941]'>输入模态</span>
            <div className='flex gap-1 rounded-[8px] border border-black/10 p-1'>
              {(['text', 'image', 'audio', 'video'] as Modality[]).map((m) => (
                <button
                  key={m}
                  type='button'
                  title={MODALITY_LABELS[m]}
                  aria-pressed={filters.inputModalities.includes(m)}
                  onClick={() => set({ inputModalities: toggle(filters.inputModalities, m) })}
                  className={cn('flex size-6 items-center justify-center rounded-[6px]', filters.inputModalities.includes(m) ? 'bg-hub-blue text-white' : 'text-[#555] hover:bg-black/5')}
                >
                  {MODALITY_ICON[m]}
                </button>
              ))}
            </div>
            <button type='button' onClick={() => setFilters(EMPTY_FILTERS)} className='text-hub-blue ml-auto text-[14px]'>
              重置
            </button>
          </div>
        </div>

        <div className='mt-8 grid gap-8 md:grid-cols-2'>
          {filtered.map((m) => (
            <HubModelCard key={m.model_name} model={m} currency={currency} isNew={newest.has(m.model_name)} />
          ))}
        </div>
        {!isLoading && filtered.length === 0 ? <div className='py-24 text-center text-[14px] text-black/45'>没有符合条件的模型</div> : null}
      </div>
    </HubShell>
  )
}
