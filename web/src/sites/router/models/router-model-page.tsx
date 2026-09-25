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
import { Activity, ArrowRight, Code2, Copy, DollarSign, Layers, Server } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { ProviderIcon } from '@/components/provider-icon'
import { apiSample, type SampleLanguage } from '@/lib/api-sample'
import { cn, compactNumber, contextLabel, shortDate } from '@/lib/format'
import { inputsOf } from '@/lib/model-filters'
import { formatAmount, isTokenPriced, priceSummary, usdPerMillion } from '@/lib/pricing'
import { useCatalog, useCurrency, useRankings, useStatus } from '@/lib/queries'

import { RouterShell } from '../router-shell'
import { ModalityBadges } from './router-model-row'

const SECTIONS = [
  { id: 'providers', label: '分组价格', icon: Server },
  { id: 'pricing', label: '定价', icon: DollarSign },
  { id: 'api', label: 'API', icon: Code2 },
  { id: 'activity', label: '用量', icon: Activity },
]

function Stat(props: { label: string; children: React.ReactNode }) {
  return (
    <div className='border-or-line bg-or-card min-w-[180px] flex-1 rounded-[8px] border px-4 py-3'>
      <div className='text-or-muted text-[11px] font-medium tracking-wider'>{props.label}</div>
      <div className='mt-1 text-[16px] font-semibold'>{props.children}</div>
    </div>
  )
}

export function RouterModelPage() {
  const { name = '' } = useParams()
  const modelName = decodeURIComponent(name)
  const { models, groupRatio, isLoading } = useCatalog()
  const { data: status } = useStatus()
  const currency = useCurrency()
  const week = useRankings('week')
  const [expanded, setExpanded] = useState(false)
  const [lang, setLang] = useState<SampleLanguage>('curl')
  const [copied, setCopied] = useState(false)
  const model = models.find((m) => m.model_name === modelName)

  if (!model) {
    return (
      <RouterShell>
        <div className='text-or-muted px-6 py-32 text-center text-[14px]'>
          {isLoading ? '加载中…' : '找不到这个模型'}
          {!isLoading ? (
            <div className='mt-6'>
              <Link to='/models' className='text-or-fg underline underline-offset-2'>返回模型列表</Link>
            </div>
          ) : null}
        </div>
      </RouterShell>
    )
  }

  const slug = `${model.vendor.toLowerCase()}/${model.model_name}`
  const price = priceSummary(model, currency)
  const weekly = week.data?.models.find((r) => r.model_name === model.model_name)
  const baseUrl = status?.server_address || window.location.origin
  const code = apiSample(lang, baseUrl, model.model_name)

  return (
    <RouterShell>
      <div className='mx-auto max-w-[1280px] px-6 pt-6 pb-24'>
        <div className='flex flex-wrap items-start justify-between gap-4'>
          <div>
            <h1 className='flex items-center gap-3 text-[24px] leading-8 font-bold'>
              <span className='flex size-7 items-center justify-center rounded-[6px] bg-white text-black'>
                <ProviderIcon name={model.vendorIcon} fallback={model.vendor} size={18} />
              </span>
              {model.vendor}: {model.model_name}
            </h1>
            <div className='text-or-muted mt-1 flex items-center gap-2 text-[13px]'>
              <span className='text-or-fg underline underline-offset-2'>{slug}</span>
              <button
                type='button'
                aria-label='复制模型 ID'
                onClick={() => {
                  void navigator.clipboard?.writeText(model.model_name)
                  setCopied(true)
                  window.setTimeout(() => setCopied(false), 1200)
                }}
                className='hover:text-or-fg'
              >
                <Copy className='size-3.5' />
              </button>
              {copied ? <span className='text-or-primary text-[12px]'>已复制</span> : null}
            </div>
          </div>
          <div className='flex gap-2'>
            <a href='#api' className='border-or-line bg-or-bg hover:bg-or-fill flex h-9 items-center gap-2 rounded-[6px] border px-3 text-[14px] font-medium'>
              <Code2 className='size-4' /> API
            </a>
            <Link to={`/chat?model=${encodeURIComponent(model.model_name)}`} className='border-or-primary/40 bg-or-primary-soft text-or-primary flex h-9 items-center gap-2 rounded-[6px] border px-3 text-[14px] font-medium'>
              试用这个模型 <ArrowRight className='size-4' />
            </Link>
          </div>
        </div>

        <p className={cn('mt-5 max-w-[1100px] text-[16px] leading-[26px]', !expanded && 'line-clamp-2')}>{model.description || '暂无介绍'}</p>
        {model.description && model.description.length > 120 ? (
          <button type='button' onClick={() => setExpanded((v) => !v)} className='text-or-muted hover:text-or-fg mt-1 text-[13px]'>
            {expanded ? '收起' : '显示更多'}
          </button>
        ) : null}

        <div className='mt-6 flex flex-wrap gap-3'>
          <Stat label='模态'>
            <span className='flex items-center gap-2 text-[13px]'>
              {inputsOf(model).join(' · ')} <ArrowRight className='text-or-muted size-3.5' /> <ModalityBadges model={model} />
            </span>
          </Stat>
          <Stat label='输入 / 输出价格'>
            {price.perRequest ? `${price.perRequest} / 次` : (
              <>
                {price.input} / {price.output} <span className='text-or-muted text-[12px] font-normal'>每百万 tokens</span>
              </>
            )}
          </Stat>
          <Stat label='上下文'>{contextLabel(model.context_length) ?? '—'}</Stat>
          <Stat label='发布时间'>{shortDate(model.release_date) || '—'}</Stat>
        </div>

        <div className='border-or-line mt-8 flex gap-8 border-t pt-8'>
          <nav className='sticky top-20 hidden xl:top-[102px] h-fit w-[180px] shrink-0 flex-col gap-0.5 md:flex'>
            {SECTIONS.map((s, i) => (
              <a key={s.id} href={`#${s.id}`} className={cn('flex h-8 items-center gap-2 rounded-[6px] px-3 text-[14px] font-medium', i === 0 ? 'bg-or-primary-soft text-or-primary' : 'text-or-muted hover:text-or-fg')}>
                <s.icon className='size-4' />
                {s.label}
              </a>
            ))}
          </nav>

          <main className='min-w-0 flex-1 space-y-14'>
            <section id='providers' className='scroll-mt-20 xl:scroll-mt-[102px]'>
              <h2 className='flex items-center gap-2 text-[18px] font-bold'><Server className='size-4' /> 分组价格</h2>
              <p className='text-or-muted mt-1 max-w-[560px] text-[14px]'>同一个模型可以通过不同分组调用，各分组倍率不同，请求会按你的密钥所在分组计费。</p>
              <div className='border-or-line mt-4 overflow-x-auto rounded-[8px] border'>
                <table className='w-full min-w-[560px] text-[14px]'>
                  <thead className='text-or-muted border-or-line border-b text-left'>
                    <tr>
                      {['分组', '倍率', '输入 /M', '输出 /M', '缓存读取 /M'].map((h) => (
                        <th key={h} className='px-4 py-3 font-medium'>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {model.enable_groups.map((group) => {
                      const ratio = groupRatio[group] ?? 1
                      const cache = usdPerMillion(model, 'cache', ratio)
                      return (
                        <tr key={group} className='border-or-line border-b last:border-b-0'>
                          <td className='px-4 py-3 font-medium'>{group}</td>
                          <td className='text-or-muted px-4 py-3'>×{ratio}</td>
                          <td className='px-4 py-3'>{isTokenPriced(model) ? formatAmount(usdPerMillion(model, 'input', ratio) ?? 0, currency) : '—'}</td>
                          <td className='px-4 py-3'>{isTokenPriced(model) ? formatAmount(usdPerMillion(model, 'output', ratio) ?? 0, currency) : '—'}</td>
                          <td className='px-4 py-3'>{cache === null ? '—' : formatAmount(cache, currency)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section id='pricing' className='scroll-mt-20 xl:scroll-mt-[102px]'>
              <h2 className='flex items-center gap-2 text-[18px] font-bold'><DollarSign className='size-4' /> 定价</h2>
              <div className='mt-4 grid gap-4 md:grid-cols-2'>
                {[
                  ['输入价格', price.perRequest ?? price.input, price.perRequest ? '/次' : '/M tokens'],
                  ['输出价格', price.perRequest ? '—' : price.output, price.perRequest ? '' : '/M tokens'],
                ].map(([label, value, unit]) => (
                  <div key={label} className='border-or-line bg-or-card rounded-[8px] border p-4'>
                    <div className='text-or-muted text-[13px]'>{label}</div>
                    <div className='mt-1 text-[24px] font-bold'>{value}</div>
                    <div className='text-or-muted text-[12px]'>{unit}</div>
                  </div>
                ))}
              </div>
            </section>

            <section id='api' className='scroll-mt-20 xl:scroll-mt-[102px]'>
              <h2 className='flex items-center gap-2 text-[18px] font-bold'><Code2 className='size-4' /> API</h2>
              <p className='text-or-muted mt-1 text-[14px]'>完全兼容 OpenAI SDK，替换接口地址和密钥即可。</p>
              <div className='mt-4 flex gap-1'>
                {(['curl', 'python', 'typescript'] as SampleLanguage[]).map((l) => (
                  <button key={l} type='button' onClick={() => setLang(l)} className={cn('h-7 rounded-[4px] px-2.5 text-[13px] font-medium', lang === l ? 'bg-or-primary-soft text-or-primary' : 'text-or-muted')}>
                    {l}
                  </button>
                ))}
              </div>
              <pre className='border-or-line bg-or-card mt-2 overflow-x-auto rounded-[8px] border p-4 font-geist text-[13px] leading-6'>{code}</pre>
            </section>

            <section id='activity' className='scroll-mt-20 xl:scroll-mt-[102px]'>
              <h2 className='flex items-center gap-2 text-[18px] font-bold'><Layers className='size-4' /> 用量</h2>
              <div className='border-or-line bg-or-card mt-4 rounded-[8px] border p-4'>
                <div className='text-or-muted text-[13px]'>本周 Token 用量</div>
                <div className='mt-1 text-[24px] font-bold'>{weekly ? compactNumber(weekly.total_tokens) : '—'}</div>
                {weekly ? <div className='text-or-muted text-[12px]'>本周排名第 {weekly.rank} 位</div> : null}
              </div>
            </section>
          </main>
        </div>
      </div>
    </RouterShell>
  )
}
