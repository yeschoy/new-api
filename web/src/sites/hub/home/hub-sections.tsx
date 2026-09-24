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
import { BadgePercent } from 'lucide-react'
import { Link } from 'react-router'

import { ProviderIcon } from '@/components/provider-icon'
import { shortDate } from '@/lib/format'
import type { CatalogModel } from '@/lib/queries'

const APPS = [
  { name: 'Claude Code', icon: 'ClaudeCode' },
  { name: 'LobeHub', icon: 'LobeHub' },
  { name: 'Cursor', icon: 'Cursor' },
  { name: 'Cherry Studio', icon: 'CherryStudio' },
]

/** 78px pills on #f5f5f5, last one is the green "view all". */
export function HubApps() {
  return (
    <section className='mt-10 px-6 text-center'>
      <h2 className='font-serif-display pt-10 text-[24px] leading-8 font-bold text-[rgba(0,0,0,0.88)]'>
        这些应用都在用
      </h2>
      <p className='mt-2 text-[14px] text-[#555]'>在下面这些工具里填入本站地址和密钥即可使用全部模型。</p>
      <div className='mt-8 flex flex-wrap justify-center gap-4'>
        {APPS.map((app) => (
          <span
            key={app.name}
            className='flex h-[78px] items-center gap-3 rounded-[16px] bg-[#f5f5f5] px-6 text-[18px] font-semibold text-[#333]'
          >
            <ProviderIcon name={app.icon} fallback={app.name} size={28} />
            {app.name}
          </span>
        ))}
        <Link
          to='/models'
          className='flex h-[78px] w-[200px] items-center justify-center gap-2 rounded-[16px] bg-[rgba(164,229,34,0.1)] px-6 text-[18px] font-semibold text-[rgb(92,153,31)]'
        >
          <BadgePercent className='size-6' />
          查看全部模型
        </Link>
      </div>
    </section>
  )
}

/** Three 411×164 bordered cards with a 2-line title, excerpt and date. */
export function HubRecent(props: { models: CatalogModel[] }) {
  const recent = [...props.models]
    .filter((m) => m.release_date)
    .sort((a, b) => (b.release_date ?? '').localeCompare(a.release_date ?? ''))
    .slice(0, 3)
  if (recent.length === 0) return null
  return (
    <section className='mx-auto mt-20 max-w-[1280px] px-6 xl:px-0'>
      <h2 className='font-serif-display text-center text-[24px] leading-[30.4px] font-bold text-[rgba(0,0,0,0.88)]'>最新上线</h2>
      <div className='mt-6 grid gap-6 md:grid-cols-3'>
        {recent.map((model) => (
          <Link
            key={model.model_name}
            to={`/models?q=${encodeURIComponent(model.model_name)}`}
            className='flex h-[164px] flex-col rounded-[12px] border border-[#e5e7eb] bg-white p-[19px] transition-shadow hover:shadow-md'
          >
            <h3 className='line-clamp-2 text-[18px] leading-[25.2px] font-semibold text-[#1a1a1a]'>
              {model.vendor} {model.model_name} 现已上线
            </h3>
            <p className='mt-2 line-clamp-2 text-[14px] leading-[22.4px] text-[#555]'>{model.description || '暂无介绍'}</p>
            <div className='mt-auto pt-1 text-[13px] text-[#888]'>{shortDate(model.release_date, 'zh-CN')}</div>
          </Link>
        ))}
      </div>
      <div className='mt-6 text-center'>
        <Link to='/models' className='text-hub-blue text-[15px]'>
          查看全部 →
        </Link>
      </div>
    </section>
  )
}

