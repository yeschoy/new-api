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
import { ArrowRight, ChevronRight } from 'lucide-react'
import { Link } from 'react-router'

import { ProviderIcon } from '@/components/provider-icon'
import { cn, compactNumber, shortDate } from '@/lib/format'
import type { CatalogModel } from '@/lib/queries'
import type { ModelRanking } from '@/lib/services'

export function SectionHeader(props: {
  title: string
  subtitle?: string
  to?: string
  chevron?: boolean
}) {
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
      {props.to ? (
        <Link to={props.to} className='text-or-muted hover:text-or-fg flex items-center gap-1 text-[14px]'>
          查看全部 <ArrowRight className='size-3.5' />
        </Link>
      ) : null}
    </div>
  )
}

export function NewBadge() {
  return (
    <span className='rounded-full border border-[#4d8dff]/15 bg-[#4d8dff]/12 px-2.5 py-0.5 text-[12px] leading-[19.5px] font-medium text-[#4d8dff]'>
      新
    </span>
  )
}

/** Three 411×181 cards: icon tile, name + author, tokens and weekly trend. */
export function FeaturedModels(props: {
  rows: ModelRanking[]
  catalog: CatalogModel[]
  modelCount: number
  vendorCount: number
}) {
  if (props.rows.length === 0) return null
  return (
    <section className='mx-auto mt-20 max-w-[1280px] px-6 xl:px-0'>
      <SectionHeader
        title='精选模型'
        subtitle={`${props.modelCount}+ 个在线模型，来自 ${props.vendorCount}+ 家厂商`}
        to='/models'
      />
      <div className='mt-6 grid gap-6 md:grid-cols-3'>
        {props.rows.slice(0, 3).map((row) => {
          const model = props.catalog.find((m) => m.model_name === row.model_name)
          const trend = row.growth_pct
          let trendClass = 'text-or-muted'
          if (trend < 0) trendClass = 'text-or-red'
          if (trend > 0) trendClass = 'text-[#22c55e]'
          return (
            <Link
              key={row.model_name}
              to={`/models?q=${encodeURIComponent(row.model_name)}`}
              className='border-or-line bg-or-card hover:border-or-fg/15 flex h-[181px] flex-col justify-between rounded-[8px] border p-6 transition-colors'
            >
              <div className='flex items-start gap-3'>
                <span className='flex size-10 shrink-0 items-center justify-center rounded-[6px] bg-white text-black'>
                  <ProviderIcon name={row.vendor_icon || model?.vendorIcon} fallback={row.vendor} size={22} />
                </span>
                <div className='min-w-0'>
                  <div className='flex items-center gap-2 text-[14px] font-medium'>
                    <span className='truncate'>{row.model_name}</span>
                    {row.previous_rank === undefined ? <NewBadge /> : null}
                  </div>
                  <p className='text-or-muted text-[14px]'>
                    来自 <span className='underline underline-offset-2'>{row.vendor.toLowerCase()}</span>
                  </p>
                </div>
              </div>
              <div className='flex justify-between text-[14px]'>
                <div>
                  <div className='text-or-muted'>Token 用量</div>
                  <div className='font-medium'>{compactNumber(row.total_tokens)}</div>
                </div>
                <div className='text-right'>
                  <div className='text-or-muted'>周趋势</div>
                  <div className={cn('font-medium', trendClass)}>
                    {trend === 0 ? '--' : `${trend > 0 ? '+' : ''}${Math.round(trend)}%`}
                  </div>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

const TOOLS = [
  { name: 'Claude Code', icon: 'ClaudeCode', body: '在终端里写代码的智能体' },
  { name: 'Cursor', icon: 'Cursor', body: '为 AI 结对编程打造的编辑器' },
  { name: 'Cherry Studio', icon: 'CherryStudio', body: '多模型桌面对话客户端' },
]

/** Three 411×270 cards: preview band, then icon + name + one-liner. */
export function FeaturedApps() {
  return (
    <section className='mx-auto mt-20 max-w-[1280px] px-6 xl:px-0'>
      <SectionHeader title='常用应用' subtitle='这些工具都能直接接入本站接口' chevron />
      <div className='mt-6 grid gap-6 md:grid-cols-3'>
        {TOOLS.map((tool) => (
          <article key={tool.name} className='border-or-line bg-or-card flex h-[270px] flex-col overflow-hidden rounded-[8px] border'>
            <div className='flex flex-1 items-center justify-center bg-[#0c1214]'>
              <ProviderIcon name={tool.icon} fallback={tool.name} size={56} />
            </div>
            <div className='flex items-center gap-3 px-6 py-4'>
              <span className='border-or-line flex size-8 items-center justify-center rounded-[6px] border'>
                <ProviderIcon name={tool.icon} fallback={tool.name} size={18} />
              </span>
              <div>
                <div className='text-[14px] font-medium'>{tool.name}</div>
                <div className='text-or-muted text-[13px]'>{tool.body}</div>
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
  const recent = [...props.models]
    .filter((m) => m.release_date)
    .sort((a, b) => (b.release_date ?? '').localeCompare(a.release_date ?? ''))
    .slice(0, 3)
  if (recent.length === 0) return null
  return (
    <section className='mx-auto mt-24 max-w-[768px] px-6 md:px-0'>
      <SectionHeader title='最新上线' to='/models' />
      <div className='mt-8 flex flex-col gap-10'>
        {recent.map((model) => (
          <Link key={model.model_name} to={`/models?q=${encodeURIComponent(model.model_name)}`} className='group flex gap-5'>
            <span className='flex h-[90px] w-[160px] shrink-0 items-center justify-center rounded-[6px] bg-[#0c1214]'>
              <ProviderIcon name={model.vendorIcon} fallback={model.vendor} size={40} />
            </span>
            <div className='min-w-0'>
              <h3 className='text-[16px] leading-[21.6px] font-medium group-hover:underline'>
                {model.vendor}: {model.model_name}
              </h3>
              <p className='text-or-muted mt-2 line-clamp-4 text-[14px] leading-[22.75px]'>
                {model.description || '暂无介绍'}
              </p>
              <div className='mt-2 flex items-center gap-2'>
                <time className='text-or-dim text-[12px] font-medium'>
                  {shortDate(model.release_date, 'zh-CN')}
                </time>
                <NewBadge />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
