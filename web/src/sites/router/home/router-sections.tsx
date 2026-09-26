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
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { ProviderIcon } from '@/components/provider-icon'
import { tk, useI18n } from '@/i18n/i18n'
import { cn, compactNumber, shortDate } from '@/lib/format'
import { priceSummary } from '@/lib/pricing'
import { useCurrency, type CatalogModel } from '@/lib/queries'
import type { ModelRanking } from '@/lib/services'

/** Opens and closes the rest of a section's cards in place. */
type SectionToggle = { expanded: boolean; onToggle: () => void }

export function SectionHeader(props: {
  title: string
  subtitle?: string
  toggle?: SectionToggle
  chevron?: boolean
}) {
  const { t } = useI18n()
  return (
    <div className='flex items-end justify-between gap-4'>
      <div>
        <h2 className='flex items-center gap-1 text-[16px] leading-[21.6px] font-medium'>
          {props.title}
          {props.chevron ? <ChevronRight className='text-or-muted size-4' /> : null}
        </h2>
        {props.subtitle ? (
          <p className='text-or-muted mt-0.5 text-[14px] leading-[22.75px]'>{props.subtitle}</p>
        ) : null}
      </div>
      {props.toggle ? (
        <button
          type='button'
          onClick={props.toggle.onToggle}
          aria-expanded={props.toggle.expanded}
          className='text-or-muted hover:text-or-fg flex items-center gap-1 text-[14px]'
        >
          {props.toggle.expanded ? t('收起') : t('展开')}
          <ChevronDown className={cn('size-3.5 transition-transform', props.toggle.expanded && 'rotate-180')} />
        </button>
      ) : null}
    </div>
  )
}

export function NewBadge() {
  const { t } = useI18n()
  return (
    <span className='rounded-full border border-[#4d8dff]/15 bg-[#4d8dff]/12 px-2.5 py-0.5 text-[12px] leading-[19.5px] font-medium text-[#4d8dff]'>
      {t('新')}
    </span>
  )
}

/** A home-page model: every catalog entry, with its usage when rankings are on. */
export type FeaturedEntry = { model: CatalogModel; ranking?: ModelRanking }

/** Ranked models first, in rank order, then the rest of the catalog; rankings of models no longer listed are dropped. */
export function featuredEntries(catalog: CatalogModel[], rows: ModelRanking[]): FeaturedEntry[] {
  const byName = new Map(catalog.map((model) => [model.model_name, model]))
  const ranked = rows.flatMap((row) => {
    const model = byName.get(row.model_name)
    return model ? [{ model, ranking: row }] : []
  })
  const listed = new Set(ranked.map((entry) => entry.model.model_name))
  return [...ranked, ...catalog.filter((model) => !listed.has(model.model_name)).map((model) => ({ model }))]
}

/** 411×181 cards for every model, three until expanded. */
export function FeaturedModels(props: {
  rows: ModelRanking[]
  catalog: CatalogModel[]
  modelCount: number
  vendorCount: number
}) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const entries = featuredEntries(props.catalog, props.rows)
  if (entries.length === 0) return null
  return (
    <section className='mx-auto mt-20 max-w-[1280px] px-6 xl:px-0'>
      <SectionHeader
        title={t('精选模型')}
        subtitle={t('{models}+ 个在线模型，来自 {vendors}+ 家厂商', { models: props.modelCount, vendors: props.vendorCount })}
        toggle={entries.length > 3 ? { expanded, onToggle: () => setExpanded((value) => !value) } : undefined}
      />
      <div className='mt-6 grid gap-6 md:grid-cols-3'>
        {(expanded ? entries : entries.slice(0, 3)).map((entry) => (
          <FeaturedCard key={entry.model.model_name} entry={entry} />
        ))}
      </div>
    </section>
  )
}

/** Icon tile, name + author, then usage and weekly trend, or prices for a model without usage. */
function FeaturedCard(props: { entry: FeaturedEntry }) {
  const { t } = useI18n()
  const { model, ranking } = props.entry
  return (
    <article className='border-or-line bg-or-card flex h-[181px] flex-col justify-between rounded-[8px] border p-6'>
      <div className='flex items-start gap-3'>
        <span className='flex size-10 shrink-0 items-center justify-center rounded-[6px] bg-white text-black'>
          <ProviderIcon name={ranking?.vendor_icon || model.vendorIcon} fallback={model.vendor} size={22} />
        </span>
        <div className='min-w-0'>
          <div className='flex items-center gap-2 text-[14px] font-medium'>
            <span className='truncate'>{model.model_name}</span>
            {ranking && ranking.previous_rank === undefined ? <NewBadge /> : null}
          </div>
          <p className='text-or-muted text-[14px]'>
            {t('来自')} <span className='underline underline-offset-2'>{model.vendor.toLowerCase()}</span>
          </p>
        </div>
      </div>
      {ranking ? <UsageFigures ranking={ranking} /> : <PriceFigures model={model} />}
    </article>
  )
}

function UsageFigures(props: { ranking: ModelRanking }) {
  const { t } = useI18n()
  const trend = props.ranking.growth_pct
  let trendClass = 'text-or-muted'
  if (trend < 0) trendClass = 'text-or-red'
  if (trend > 0) trendClass = 'text-[#22c55e]'
  return (
    <div className='flex justify-between text-[14px]'>
      <div>
        <div className='text-or-muted'>{t('Token 用量')}</div>
        <div className='font-medium'>{compactNumber(props.ranking.total_tokens)}</div>
      </div>
      <div className='text-right'>
        <div className='text-or-muted'>{t('周趋势')}</div>
        <div className={cn('font-medium', trendClass)}>
          {trend === 0 ? '--' : `${trend > 0 ? '+' : ''}${Math.round(trend)}%`}
        </div>
      </div>
    </div>
  )
}

/** Input and output price per 1M tokens, or the price per request, as on the model page. */
function PriceFigures(props: { model: CatalogModel }) {
  const { t } = useI18n()
  const price = priceSummary(props.model, useCurrency())
  const unit = price.perRequest ? t('/次') : '/M'
  return (
    <div className='flex justify-between text-[14px]'>
      <div>
        <div className='text-or-muted'>{t('输入价格')}</div>
        <div className='font-medium'>
          {price.perRequest ?? price.input}
          <span className='text-or-muted text-[12px] font-normal'> {unit}</span>
        </div>
      </div>
      {price.perRequest ? null : (
        <div className='text-right'>
          <div className='text-or-muted'>{t('输出价格')}</div>
          <div className='font-medium'>
            {price.output}
            <span className='text-or-muted text-[12px] font-normal'> {unit}</span>
          </div>
        </div>
      )}
    </div>
  )
}

const TOOLS = [
  { name: 'Claude Code', icon: 'ClaudeCode', body: tk('在终端里写代码的智能体') },
  { name: 'Cursor', icon: 'Cursor', body: tk('为 AI 结对编程打造的编辑器') },
  { name: 'Cherry Studio', icon: 'CherryStudio', body: tk('多模型桌面对话客户端') },
]

/** Three 411×270 cards: preview band, then icon + name + one-liner. */
export function FeaturedApps() {
  const { t } = useI18n()
  return (
    <section className='mx-auto mt-20 max-w-[1280px] px-6 xl:px-0'>
      <SectionHeader title={t('常用应用')} subtitle={t('这些工具都能直接接入本站接口')} chevron />
      <div className='mt-6 grid gap-6 md:grid-cols-3'>
        {TOOLS.map((tool) => (
          <article key={tool.name} className='border-or-line bg-or-card flex h-[270px] flex-col overflow-hidden rounded-[8px] border'>
            <div className='flex flex-1 items-center justify-center bg-or-thumb'>
              <ProviderIcon name={tool.icon} fallback={tool.name} size={56} />
            </div>
            <div className='flex items-center gap-3 px-6 py-4'>
              <span className='border-or-line flex size-8 items-center justify-center rounded-[6px] border'>
                <ProviderIcon name={tool.icon} fallback={tool.name} size={18} />
              </span>
              <div>
                <div className='text-[14px] font-medium'>{tool.name}</div>
                <div className='text-or-muted text-[13px]'>{t(tool.body)}</div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

/** Newest catalog entries laid out like the reference's post list. */
export function RecentModels(props: { models: CatalogModel[] }) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const recent = [...props.models]
    .filter((m) => m.release_date)
    .sort((a, b) => (b.release_date ?? '').localeCompare(a.release_date ?? ''))
  if (recent.length === 0) return null
  return (
    <section className='mx-auto mt-24 max-w-[768px] px-6 md:px-0'>
      <SectionHeader
        title={t('最新上线')}
        toggle={recent.length > 3 ? { expanded, onToggle: () => setExpanded((value) => !value) } : undefined}
      />
      <div className='mt-8 flex flex-col gap-10'>
        {(expanded ? recent : recent.slice(0, 3)).map((model) => (
          <article key={model.model_name} className='flex gap-5'>
            <span className='flex h-[90px] w-[160px] shrink-0 items-center justify-center rounded-[6px] bg-or-thumb'>
              <ProviderIcon name={model.vendorIcon} fallback={model.vendor} size={40} />
            </span>
            <div className='min-w-0'>
              <h3 className='text-[16px] leading-[21.6px] font-medium'>
                {model.vendor}: {model.model_name}
              </h3>
              <p className='text-or-muted mt-2 line-clamp-4 text-[14px] leading-[22.75px]'>
                {model.description || t('暂无介绍')}
              </p>
              <div className='mt-2 flex items-center gap-2'>
                <time className='text-or-dim text-[12px] font-medium'>
                  {shortDate(model.release_date)}
                </time>
                <NewBadge />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
