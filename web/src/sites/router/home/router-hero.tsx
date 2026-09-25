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
import { Sparkles } from 'lucide-react'
import { Link } from 'react-router'

import { useAuth } from '@/lib/auth-store'
import { compactNumber } from '@/lib/format'

export type HeroStat = { value: string; label: string }

/** Hero figures backed by live data; empty until the catalog has loaded. */
export function heroStats(input: { weeklyTokens: number; modelCount: number; vendorCount: number }): HeroStat[] {
  const result: HeroStat[] = []
  if (input.weeklyTokens > 0) result.push({ value: `${compactNumber(input.weeklyTokens)}+`, label: '本周 Token' })
  if (input.modelCount > 0) {
    result.push({ value: `${input.modelCount}+`, label: '模型' })
    result.push({ value: `${input.vendorCount}+`, label: '厂商' })
  }
  return result
}

/** 1440px reference: h1 at y=120 (64px below the bar), buttons 205×44. */
export function RouterHero() {
  const auth = useAuth()
  const keyHref = auth.status === 'authenticated' ? '/settings/keys' : '/sign-up'

  return (
    <section className='px-6 pt-16 text-center'>
      {/* hero-copy: at night it lets the map's lights show through until pointed at (styles.css). */}
      <div className='hero-copy mx-auto w-fit'>
        <h1 className='mx-auto max-w-[896px] text-[40px] leading-[1.2] font-bold tracking-[-1.4px] md:text-[56px] dark:[text-shadow:0_0_14px_var(--or-bg),0_0_4px_var(--or-bg)]'>
          一个接口
          <br />
          接入所有模型
        </h1>
        <p className='text-or-muted mx-auto max-w-[896px] pt-2 text-[16px] leading-[21.6px] dark:[text-shadow:0_0_14px_var(--or-bg),0_0_4px_var(--or-bg)]'>
          更低<span className='text-or-fg'>价格</span>，更高
          <span className='text-or-fg'>可用</span>，无需订阅。
        </p>
      </div>
      <div className='mt-6 flex flex-wrap justify-center gap-4'>
        <Link
          to={keyHref}
          className='bg-or-primary text-or-bg flex h-11 w-[205px] items-center justify-center gap-2 rounded-[6px] px-8 text-[14px] font-medium transition-opacity hover:opacity-90'
        >
          获取 API Key
        </Link>
        <Link
          to='/models'
          className='border-or-line bg-or-bg text-or-fg hover:bg-or-fill flex h-11 w-[205px] items-center justify-center gap-2 rounded-[6px] border px-8 text-[14px] font-medium transition-colors'
        >
          探索模型
          <Sparkles className='text-or-blue size-4' aria-hidden='true' />
        </Link>
      </div>
    </section>
  )
}

/** Live figures under the buttons, over the map; nothing until data has loaded. */
export function HeroStats(props: { stats: HeroStat[] }) {
  if (props.stats.length === 0) return null
  return (
    <dl className='mx-auto mt-16 flex max-w-[696px] flex-wrap justify-center gap-6 px-6 py-6'>
      {props.stats.map((stat) => (
        <div key={stat.label} className='flex w-[156px] flex-col items-center gap-2'>
          <dt className='text-or-muted order-2 text-[12px] leading-[16.2px]'>{stat.label}</dt>
          <dd className='order-1 text-[36px] leading-[43.2px] font-bold'>{stat.value}</dd>
        </div>
      ))}
    </dl>
  )
}
