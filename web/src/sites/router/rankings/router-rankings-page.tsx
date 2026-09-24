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
import {
  ArrowDown,
  ArrowUp,
  AudioLines,
  BarChart3,
  ChevronDown,
  FileStack,
  Image,
  Layers,
  LineChart,
  Mic,
  PieChart,
  Trophy,
  TrendingUp,
  Type,
  Video,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { ProviderIcon } from '@/components/provider-icon'
import { ROUTER_CHART, StackedBars } from '@/components/stacked-bars'
import { cn, compactNumber } from '@/lib/format'
import { useRankings } from '@/lib/queries'
import type { ModelRanking, RankingPeriod } from '@/lib/services'

import { RouterShell } from '../router-shell'

const TABS = [
  { label: '文本', icon: Type },
  { label: '图像', icon: Image },
  { label: '嵌入', icon: Layers },
  { label: '重排序', icon: FileStack },
  { label: '视频', icon: Video },
  { label: '语音', icon: AudioLines },
  { label: '转写', icon: Mic },
]

const SECTIONS = [
  { id: 'top-models', label: '热门模型', icon: BarChart3 },
  { id: 'leaderboard', label: '排行榜', icon: Trophy },
  { id: 'market-share', label: '市场份额', icon: PieChart },
  { id: 'movers', label: '涨跌榜', icon: TrendingUp },
]

const PERIOD_LABEL: Record<RankingPeriod, string> = { today: '今天', week: '本周', month: '本月', year: '今年' }

function SectionTitle(props: { icon: React.ReactNode; title: string; subtitle: string; right?: React.ReactNode }) {
  return (
    <div className='flex items-start justify-between gap-4'>
      <div>
        <h2 className='flex items-center gap-2 text-[18px] leading-6 font-bold'>
          {props.icon}
          {props.title}
        </h2>
        <p className='text-or-muted mt-1 text-[13px]'>{props.subtitle}</p>
      </div>
      {props.right}
    </div>
  )
}

function Growth(props: { value: number }) {
  if (!props.value) return <span className='text-or-muted text-[13px]'>--</span>
  const up = props.value > 0
  return (
    <span className={cn('flex items-center justify-end gap-0.5 text-[13px]', up ? 'text-[#22c55e]' : 'text-or-red')}>
      {up ? <ArrowUp className='size-3' /> : <ArrowDown className='size-3' />}
      {Math.abs(Math.round(props.value))}%
    </span>
  )
}

function LeaderRow(props: { row: ModelRanking; index: number }) {
  return (
    <li className='border-or-line flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0'>
      <span className='text-or-muted w-6 text-[13px]'>{props.index + 1}.</span>
      <span className='flex size-6 items-center justify-center'>
        <ProviderIcon name={props.row.vendor_icon} fallback={props.row.vendor} size={18} />
      </span>
      <div className='min-w-0 flex-1'>
        <Link to={`/models/${encodeURIComponent(props.row.model_name)}`} className='block truncate text-[14px] font-medium underline decoration-or-fg/30 underline-offset-2 hover:decoration-or-fg'>
          {props.row.model_name}
        </Link>
        <div className='text-or-muted text-[13px]'>
          来自 <span className='underline underline-offset-2'>{props.row.vendor.toLowerCase()}</span>
        </div>
      </div>
      <div className='text-right'>
        <div className='text-[13px]'>{compactNumber(props.row.total_tokens)} tokens</div>
        <Growth value={props.row.growth_pct} />
      </div>
    </li>
  )
}

const select = 'border-or-line bg-or-bg text-or-fg h-8 rounded-[6px] border px-2 text-[12px] outline-none'

export function RouterRankingsPage() {
  const [tab, setTab] = useState(0)
  const [period, setPeriod] = useState<RankingPeriod>('week')
  const [expanded, setExpanded] = useState(false)
  const [active, setActive] = useState(SECTIONS[0].id)
  const query = useRankings(period)
  const history = useRankings('month')
  const data = tab === 0 ? query.data : undefined
  const rows = data?.models ?? []
  const shown = expanded ? rows : rows.slice(0, 10)
  const half = Math.ceil(shown.length / 2)
  const chartModels = history.data?.models_history.models.map((m) => m.name) ?? []

  const jump = (id: string) => {
    setActive(id)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <RouterShell>
      <div className='mx-auto max-w-[1278px] px-6 pb-24'>
        <div role='tablist' className='border-or-line flex overflow-x-auto overflow-y-hidden border-b'>
          {TABS.map((t, index) => (
            <button
              key={t.label}
              type='button'
              role='tab'
              aria-selected={tab === index}
              onClick={() => setTab(index)}
              className={cn('-mb-px flex items-center gap-1.5 border-b-2 px-4 py-3 text-[14px] font-medium whitespace-nowrap', tab === index ? 'border-or-lime text-or-fg' : 'text-or-muted hover:text-or-fg border-transparent')}
            >
              <t.icon className={cn('size-4', tab === index && 'text-or-lime')} />
              {t.label}
            </button>
          ))}
        </div>

        <div className='flex gap-8 pt-6'>
          <nav className='sticky top-20 hidden h-fit w-[200px] shrink-0 flex-col gap-0.5 md:flex'>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type='button'
                onClick={() => jump(s.id)}
                className={cn('flex h-8 items-center gap-2 rounded-[6px] px-3 text-left text-[14px] font-medium', active === s.id ? 'bg-or-lime-soft text-or-lime' : 'text-or-muted hover:text-or-fg')}
              >
                <s.icon className='size-4' />
                {s.label}
              </button>
            ))}
          </nav>

          <main className='min-w-0 flex-1'>
            <h1 className='text-[20px] leading-7 font-bold'>AI 模型排行</h1>
            <p className='text-or-muted mt-1 max-w-[760px] text-[14px] leading-[22.75px]'>
              基于真实调用量的实时排行，按本站接口处理的 Token 数排序。{' '}
              <Link to='/models' className='text-or-fg underline underline-offset-2'>查看全部模型</Link>
            </p>
            <p className='text-or-muted mt-2 text-[13px]'>数据统计周期：{PERIOD_LABEL[period]}</p>

            {tab !== 0 ? (
              <div className='border-or-line text-or-muted mt-10 rounded-[8px] border px-6 py-16 text-center text-[14px]'>该类别暂无排行数据</div>
            ) : (
              <>
                <section id='top-models' className='mt-10 scroll-mt-20'>
                  <SectionTitle icon={<BarChart3 className='size-4' />} title='热门模型' subtitle='各模型每天在本站的 Token 用量' />
                  <div className='mt-4'>
                    <StackedBars points={history.data?.models_history.points ?? []} models={chartModels} theme={ROUTER_CHART} height={300} />
                  </div>
                </section>

                <section id='leaderboard' className='mt-14 scroll-mt-20'>
                  <SectionTitle
                    icon={<Trophy className='size-4' />}
                    title='模型排行榜'
                    subtitle='对比本站最热门的模型'
                    right={
                      <select value={period} onChange={(e) => setPeriod(e.target.value as RankingPeriod)} className={select} aria-label='统计周期'>
                        {(Object.keys(PERIOD_LABEL) as RankingPeriod[]).map((p) => (
                          <option key={p} value={p}>{PERIOD_LABEL[p]}</option>
                        ))}
                      </select>
                    }
                  />
                  {rows.length === 0 ? (
                    <p className='text-or-muted mt-6 text-[14px]'>{query.isLoading ? '加载中…' : '暂无数据'}</p>
                  ) : (
                    <div className='mt-5 grid gap-6 md:grid-cols-2'>
                      {[shown.slice(0, half), shown.slice(half)].map((col, ci) => (
                        <ol key={ci} className='border-or-line bg-or-card rounded-[8px] border'>
                          {col.map((row, i) => (
                            <LeaderRow key={row.model_name} row={row} index={ci * half + i} />
                          ))}
                        </ol>
                      ))}
                    </div>
                  )}
                  {rows.length > 10 ? (
                    <button type='button' onClick={() => setExpanded((v) => !v)} className='text-or-muted hover:text-or-fg mx-auto mt-4 flex items-center gap-1 text-[13px]'>
                      {expanded ? '收起' : '显示更多'} <ChevronDown className={cn('size-3.5', expanded && 'rotate-180')} />
                    </button>
                  ) : null}
                </section>

                <section id='market-share' className='mt-14 scroll-mt-20'>
                  <SectionTitle icon={<PieChart className='size-4' />} title='市场份额' subtitle='各厂商模型在本站的 Token 占比' />
                  <div className='mt-5 flex flex-col gap-3'>
                    {(data?.vendors ?? []).map((v, index) => (
                      <div key={v.vendor} className='flex items-center gap-3'>
                        <span className='flex w-40 items-center gap-2 text-[14px]'>
                          <ProviderIcon name={v.vendor_icon} fallback={v.vendor} size={16} />
                          {v.vendor}
                        </span>
                        <div className='bg-or-fill h-2 flex-1 overflow-hidden rounded-full'>
                          <div className='h-full rounded-full' style={{ width: `${Math.max(2, v.share * 100)}%`, background: ROUTER_CHART.palette[index % ROUTER_CHART.palette.length] }} />
                        </div>
                        <span className='text-or-muted w-14 text-right text-[13px]'>{(v.share * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section id='movers' className='mt-14 scroll-mt-20'>
                  <SectionTitle icon={<LineChart className='size-4' />} title='涨跌榜' subtitle='排名变化最大的模型' />
                  <div className='mt-5 grid gap-6 md:grid-cols-2'>
                    {[
                      { title: '上升最快', list: data?.top_movers ?? [] },
                      { title: '下降最多', list: data?.top_droppers ?? [] },
                    ].map((group) => (
                      <div key={group.title} className='border-or-line bg-or-card rounded-[8px] border p-4'>
                        <div className='text-or-muted mb-2 text-[13px]'>{group.title}</div>
                        {group.list.length === 0 ? <div className='text-or-dim text-[13px]'>暂无</div> : null}
                        {group.list.map((m) => (
                          <div key={m.model_name} className='flex items-center justify-between py-1.5 text-[14px]'>
                            <span className='flex items-center gap-2'>
                              <ProviderIcon name={m.vendor_icon} fallback={m.vendor} size={16} />
                              {m.model_name}
                            </span>
                            <span className={m.rank_delta >= 0 ? 'text-[#22c55e]' : 'text-or-red'}>
                              {m.rank_delta >= 0 ? '↑' : '↓'} {Math.abs(m.rank_delta)} 名
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </main>
        </div>
      </div>
    </RouterShell>
  )
}
