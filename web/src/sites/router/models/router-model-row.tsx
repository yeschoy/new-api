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
import { AudioLines, FileText, Image, Info, Type, Video } from 'lucide-react'
import { Link } from 'react-router'

import { ProviderIcon } from '@/components/provider-icon'
import { compactNumber, contextLabel, shortDate } from '@/lib/format'
import { outputsOf } from '@/lib/model-filters'
import { priceSummary, type CurrencyDisplay } from '@/lib/pricing'
import type { CatalogModel } from '@/lib/queries'
import type { Modality } from '@/lib/services'

const BADGE: Record<Modality, { icon: React.ReactNode; className: string }> = {
  text: { icon: <Type className='size-3' />, className: 'bg-[#4d8dff]/15 text-[#4d8dff]' },
  image: { icon: <Image className='size-3' />, className: 'bg-[#22c55e]/15 text-[#22c55e]' },
  audio: { icon: <AudioLines className='size-3' />, className: 'bg-[#e879f9]/15 text-[#e879f9]' },
  video: { icon: <Video className='size-3' />, className: 'bg-[#f59e0b]/15 text-[#f59e0b]' },
  file: { icon: <FileText className='size-3' />, className: 'bg-[#94a3b8]/15 text-[#94a3b8]' },
}

export function ModalityBadges(props: { model: CatalogModel }) {
  return (
    <span className='flex gap-1'>
      {outputsOf(props.model).map((m) => (
        <span key={m} title={m} className={`flex size-5 items-center justify-center rounded-[4px] ${BADGE[m].className}`}>
          {BADGE[m].icon}
        </span>
      ))}
    </span>
  )
}

/** One catalog entry: title row, two-line summary, metadata line. */
export function RouterModelRow(props: { model: CatalogModel; tokens?: number; currency: CurrencyDisplay }) {
  const m = props.model
  const price = priceSummary(m, props.currency)
  const context = contextLabel(m.context_length)
  return (
    <Link
      to={`/models/${encodeURIComponent(m.model_name)}`}
      className='border-or-line bg-or-card hover:border-or-fg/15 block rounded-[8px] border px-5 py-4 transition-colors'
    >
      <div className='flex items-center gap-1.5'>
        <ProviderIcon name={m.vendorIcon} fallback={m.vendor} size={18} className='mr-1' />
        <h3 className='truncate text-[16px] leading-[26px] font-semibold'>
          {m.vendor}: {m.model_name}
        </h3>
        <ModalityBadges model={m} />
        <span className='text-or-muted ml-auto flex shrink-0 items-center gap-1 text-[14px]'>
          {props.tokens ? `${compactNumber(props.tokens)} tokens` : '—'}
          <Info className='size-3.5' aria-hidden='true' />
        </span>
      </div>
      <p className='text-or-muted mt-2 line-clamp-2 text-[14px] leading-[22.75px]'>{m.description || '暂无介绍'}</p>
      <div className='text-or-muted mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[14px] leading-[22.75px]'>
        <span>
          来自 <span className='underline underline-offset-2'>{m.vendor.toLowerCase()}</span>
        </span>
        {m.release_date ? <span>{shortDate(m.release_date)}</span> : null}
        {context ? <span>{context} 上下文</span> : null}
        {price.perRequest ? (
          <span>{price.perRequest}/次</span>
        ) : (
          <>
            <span>{price.input}/M 输入 tokens</span>
            <span>{price.output}/M 输出 tokens</span>
          </>
        )}
      </div>
    </Link>
  )
}

export function RouterModelTable(props: { models: CatalogModel[]; tokens: Map<string, number>; currency: CurrencyDisplay }) {
  return (
    <div className='border-or-line overflow-x-auto rounded-[8px] border'>
      <table className='w-full min-w-[760px] text-left text-[14px]'>
        <thead className='text-or-muted border-or-line border-b'>
          <tr>
            {['模型', '输入价格', '输出价格', '上下文', '本周 tokens'].map((h) => (
              <th key={h} className='px-4 py-3 font-medium'>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.models.map((m) => {
            const price = priceSummary(m, props.currency)
            return (
              <tr key={m.model_name} className='border-or-line hover:bg-or-fill border-b last:border-b-0'>
                <td className='px-4 py-3'>
                  <Link to={`/models/${encodeURIComponent(m.model_name)}`} className='flex items-center gap-2 font-medium'>
                    <ProviderIcon name={m.vendorIcon} fallback={m.vendor} size={16} />
                    {m.vendor}: {m.model_name}
                  </Link>
                </td>
                <td className='text-or-muted px-4 py-3'>{price.perRequest ? `${price.perRequest}/次` : `${price.input}/M`}</td>
                <td className='text-or-muted px-4 py-3'>{price.perRequest ? '—' : `${price.output}/M`}</td>
                <td className='text-or-muted px-4 py-3'>{contextLabel(m.context_length) ?? '—'}</td>
                <td className='text-or-muted px-4 py-3'>{props.tokens.get(m.model_name) ? compactNumber(props.tokens.get(m.model_name) ?? 0) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
