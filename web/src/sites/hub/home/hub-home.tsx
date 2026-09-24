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
import { ArrowRight } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'

import { useAuth } from '@/lib/auth-store'
import { useCatalog, useStatus } from '@/lib/queries'

import { HubShell } from '../hub-shell'
import { WorldDots } from '../world-dots'
import { HubCards } from './hub-cards'
import { HubRankings } from './hub-rankings'
import { HubApps, HubRecent } from './hub-sections'

const FALLBACK_ICONS = ['OpenAI', 'Claude.Color', 'Gemini.Color', 'DeepSeek.Color', 'Qwen.Color', 'Kimi.Color']

const pill =
  'flex h-12 items-center gap-2 rounded-[24px] border px-[15px] text-[16px] transition-colors'

export function HubHome() {
  const auth = useAuth()
  const { data: status } = useStatus()
  const { models } = useCatalog()

  const icons = useMemo(() => {
    const own = [...new Set(models.map((m) => m.vendorIcon).filter(Boolean))] as string[]
    return own.length >= 5 ? own : [...own, ...FALLBACK_ICONS.filter((i) => !own.includes(i))]
  }, [models])
  const vendors = useMemo(() => {
    const names = [...new Set(models.map((m) => m.vendor))]
    return names.length >= 3 ? names : ['OpenAI', 'Anthropic', 'Google']
  }, [models])

  const baseUrl = status?.server_address || window.location.origin
  const keyHref = auth.status === 'authenticated' ? '/settings/keys' : '/sign-in'

  return (
    <HubShell>
      <div className='relative -mt-16 pt-16'>
        <WorldDots className='pointer-events-none absolute inset-x-0 top-16 mx-auto h-[620px] w-full max-w-[1400px] text-black/[0.11]' />
        <section className='relative px-6 pt-[134px] text-center'>
          <h1 className='font-serif-display text-[40px] leading-[1.21] font-bold text-[rgba(0,0,0,0.88)] md:text-[56px]'>
            一个接口，接入所有模型
          </h1>
          <p className='mt-6 text-[14px] text-[#353941]'>通过一个统一的、兼容 OpenAI 的接口访问主流 AI 模型。</p>
          <div className='mt-6 flex justify-center gap-4'>
            {status?.docs_link ? (
              <a href={status.docs_link} target='_blank' rel='noopener noreferrer' className={`${pill} border-[#d9d9d9] bg-white text-[rgba(0,0,0,0.88)] shadow-[0_2px_0_rgba(0,0,0,0.02)] hover:border-hub-blue hover:text-hub-blue`}>
                查看文档
              </a>
            ) : (
              <Link to='/models' className={`${pill} border-[#d9d9d9] bg-white text-[rgba(0,0,0,0.88)] shadow-[0_2px_0_rgba(0,0,0,0.02)] hover:border-hub-blue hover:text-hub-blue`}>
                查看模型
              </Link>
            )}
            <Link to={keyHref} className={`${pill} bg-hub-blue border-transparent text-white shadow-[0_2px_0_rgba(5,122,255,0.06)] hover:bg-[#1d4ed8]`}>
              获取 API Key <ArrowRight className='size-4' />
            </Link>
          </div>
        </section>
        <div className='relative mt-8'>
          <HubCards icons={icons} vendors={vendors} baseUrl={baseUrl} model={models[0]?.model_name ?? 'gpt-4o-mini'} />
        </div>
      </div>
      <HubApps />
      <HubRankings />
      <HubRecent models={models} />
    </HubShell>
  )
}
