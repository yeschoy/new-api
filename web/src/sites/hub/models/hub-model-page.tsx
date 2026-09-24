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
import { ChevronRight, Copy, MessageSquare } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { ProviderIcon } from '@/components/provider-icon'
import { apiSample, type SampleLanguage } from '@/lib/api-sample'
import { cn, contextLabel, shortDate } from '@/lib/format'
import { CAPABILITY_LABELS, MODALITY_LABELS, inputsOf, outputsOf } from '@/lib/model-filters'
import { formatAmount, isTokenPriced, usdPerMillion } from '@/lib/pricing'
import { useCatalog, useCurrency, useStatus } from '@/lib/queries'

import { HubShell } from '../hub-shell'

const card = 'rounded-[24px] border border-black/10 bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.06)]'

export function HubModelPage() {
  const { name = '' } = useParams()
  const modelName = decodeURIComponent(name)
  const { models, groupRatio, isLoading } = useCatalog()
  const { data: status } = useStatus()
  const currency = useCurrency()
  const [lang, setLang] = useState<SampleLanguage>('curl')
  const [copied, setCopied] = useState(false)
  const model = models.find((m) => m.model_name === modelName)

  if (!model) {
    return (
      <HubShell solidHeader>
        <div className='py-32 text-center text-[14px] text-[#888]'>
          {isLoading ? '加载中…' : '找不到这个模型'}
          {!isLoading ? (
            <div className='mt-4'>
              <Link to='/models' className='text-hub-link'>返回模型列表</Link>
            </div>
          ) : null}
        </div>
      </HubShell>
    )
  }

  const baseUrl = status?.server_address || window.location.origin
  const tags = [
    ...inputsOf(model).map((m) => `输入 · ${MODALITY_LABELS[m]}`),
    ...outputsOf(model).map((m) => `输出 · ${MODALITY_LABELS[m]}`),
    ...(model.capabilities ?? []).map((c) => CAPABILITY_LABELS[c] ?? c),
  ]

  return (
    <HubShell solidHeader>
      <div className='mx-auto max-w-[1100px] px-6 pt-8'>
        <nav className='flex items-center gap-1 text-[14px] text-[#888]'>
          <Link to='/models' className='hover:text-hub-link'>模型</Link>
          <ChevronRight className='size-3.5' />
          <span className='text-[rgba(0,0,0,0.88)]'>{model.model_name}</span>
        </nav>

        <div className={cn(card, 'mt-4')}>
          <div className='flex flex-wrap items-center gap-3'>
            <span className='flex size-11 items-center justify-center rounded-full border border-black/5'>
              <ProviderIcon name={model.vendorIcon} fallback={model.vendor} size={26} />
            </span>
            <div className='min-w-0 flex-1'>
              <h1 className='font-serif-display text-[28px] leading-9 font-bold text-[rgba(0,0,0,0.88)]'>{model.model_name}</h1>
              <div className='text-[13px] text-[#888]'>
                {model.vendor}
                {model.release_date ? ` · 发布于 ${shortDate(model.release_date, 'zh-CN')}` : ''}
                {contextLabel(model.context_length) ? ` · ${contextLabel(model.context_length)} 上下文` : ''}
              </div>
            </div>
            <button
              type='button'
              onClick={() => {
                void navigator.clipboard?.writeText(model.model_name)
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1200)
              }}
              className='flex h-8 items-center gap-1.5 rounded-[8px] border border-[#e3e3e3] bg-white px-3 text-[13px] font-medium hover:border-hub-blue hover:text-hub-blue'
            >
              <Copy className='size-3.5' />
              {copied ? '已复制' : '复制 ID'}
            </button>
            <Link to={`/chat?model=${encodeURIComponent(model.model_name)}`} className='bg-hub-blue flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium text-white'>
              <MessageSquare className='size-3.5' /> 在对话中试用
            </Link>
          </div>
          <div className='mt-4 flex flex-wrap gap-2'>
            {tags.map((tag) => (
              <span key={tag} className='rounded-[8px] border border-black/10 px-2 text-[12px] leading-5 text-[#555]'>{tag}</span>
            ))}
          </div>
          <p className='mt-4 text-[14px] leading-[22px] text-[rgba(0,0,0,0.88)]'>{model.description || '暂无介绍'}</p>
        </div>

        <div className={cn(card, 'mt-6')}>
          <h2 className='font-serif-display text-[20px] font-bold text-[rgba(0,0,0,0.88)]'>价格</h2>
          <div className='mt-4 overflow-x-auto rounded-[12px] border border-[#f0f0f0]'>
            <table className='w-full min-w-[520px] text-left text-[14px]'>
              <thead className='bg-[#fafafa] text-[rgba(0,0,0,0.88)]'>
                <tr>
                  {['分组', '倍率', '输入', '输出', '缓存读取'].map((h) => (
                    <th key={h} className='border-b border-[#f0f0f0] px-4 py-3 font-semibold'>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {model.enable_groups.map((group) => {
                  const ratio = groupRatio[group] ?? 1
                  const cache = usdPerMillion(model, 'cache', ratio)
                  const tokenPriced = isTokenPriced(model)
                  return (
                    <tr key={group} className='border-b border-[#f0f0f0] last:border-b-0'>
                      <td className='px-4 py-3'>{group}</td>
                      <td className='px-4 py-3 text-[#888]'>×{ratio}</td>
                      <td className='px-4 py-3'>{tokenPriced ? `${formatAmount(usdPerMillion(model, 'input', ratio) ?? 0, currency)} /M` : `${formatAmount((model.model_price ?? 0) * ratio, currency)} /次`}</td>
                      <td className='px-4 py-3'>{tokenPriced ? `${formatAmount(usdPerMillion(model, 'output', ratio) ?? 0, currency)} /M` : '—'}</td>
                      <td className='px-4 py-3'>{cache === null || !tokenPriced ? '—' : `${formatAmount(cache, currency)} /M`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className={cn(card, 'mt-6')}>
          <h2 className='font-serif-display text-[20px] font-bold text-[rgba(0,0,0,0.88)]'>调用示例</h2>
          <div className='mt-4 flex w-fit gap-0.5 rounded-[8px] bg-[#f5f5f5] p-0.5'>
            {(['curl', 'python', 'typescript'] as SampleLanguage[]).map((l) => (
              <button key={l} type='button' onClick={() => setLang(l)} className={cn('rounded-[6px] px-3 py-1 text-[12px]', lang === l ? 'bg-white text-[#111] shadow-sm' : 'text-[#888]')}>
                {l}
              </button>
            ))}
          </div>
          <pre className='mt-3 overflow-x-auto rounded-[16px] bg-[#f5f5f5] p-4 font-mono text-[12px] leading-5 text-[#353941]'>{apiSample(lang, baseUrl, model.model_name)}</pre>
        </div>
      </div>
    </HubShell>
  )
}
