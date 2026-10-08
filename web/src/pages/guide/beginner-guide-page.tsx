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
import { useEffect, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router'

import { useI18n } from '@/i18n/i18n'
import { RouterShell } from '@/sites/router/router-shell'

import { Essentials } from './beginner-essentials'
import { Troubleshoot, UseCasePicker } from './beginner-help-sections'
import { ToolExplorer } from './beginner-tools'
import type { UseCase } from './beginner-types'
import { useGuideAddress } from './guide-address'

/**
 * The beginner guide: the three values every tool needs, a picker from
 * "what do you want to do", every tool's steps with this site's address
 * filled in, and common errors explained. ?q filters the tools and ?tool
 * opens one, so a helper can send a ready link.
 */
export function BeginnerGuidePage() {
  const { t } = useI18n()
  const address = useGuideAddress()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const [useCase, setUseCase] = useState<UseCase | null>(null)
  const toolsRef = useRef<HTMLElement>(null)

  const pick = (row: UseCase) => {
    setUseCase(row)
    toolsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  const clearQuery = () => {
    setParams(
      (current) => {
        const copy = new URLSearchParams(current)
        copy.delete('q')
        return copy
      },
      { replace: true, preventScrollReset: true }
    )
  }

  // A link to a section (#tools, #troubleshoot…) lands on it once the page is drawn.
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1))
    if (!id) return
    const timer = window.setTimeout(() => document.getElementById(id)?.scrollIntoView?.({ block: 'start' }), 0)
    return () => window.clearTimeout(timer)
  }, [location.hash])

  return (
    <RouterShell>
      <div className='mx-auto flex max-w-[1100px] flex-col gap-16 px-6 pt-12 pb-24 break-words md:pt-16'>
        <header>
          <h1 className='text-[32px] leading-[1.2] font-bold tracking-[-0.8px] md:text-[40px]'>{t('新手指南')}</h1>
          <p className='text-or-muted mt-3 text-[16px] leading-7'>{t('先抄好这三样，再选工具按步骤做。')}</p>
        </header>

        <Essentials address={address} />

        <UseCasePicker active={useCase?.useCase} onPick={pick} />

        <section id='tools' ref={toolsRef} aria-labelledby='tools-title' className='scroll-mt-20 xl:scroll-mt-[102px]'>
          <h2 id='tools-title' className='text-[24px] leading-8 font-bold tracking-[-0.4px]'>
            {t('选好工具，照步骤做')}
          </h2>
          <p className='text-or-muted mt-2 text-[15px] leading-6'>
            {t('点击任意卡片查看分步设置。步骤中的地址已自动填入本站的真实地址。')}
          </p>
          <ToolExplorer
            address={address}
            query={params.get('q') ?? ''}
            onClearQuery={clearQuery}
            openToolId={params.get('tool')}
            focus={useCase}
            onClearFocus={() => setUseCase(null)}
          />
        </section>

        <Troubleshoot />
      </div>
    </RouterShell>
  )
}
