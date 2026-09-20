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
import { Link } from '@tanstack/react-router'
import { KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TerminalPage } from '@/components/layout/components/terminal-page'
import { useGuideAddress } from '@/features/guide/use-guide-address'

import { AddressKit } from './components/address-kit'
import { Troubleshoot, UseCasePicker } from './components/help-sections'
import { ToolExplorer } from './components/tool-explorer'
import type { UseCaseRow } from './data'

export type BeginnerGuidePageProps = {
  query?: string
  toolId?: string
}

export function BeginnerGuidePage(props: BeginnerGuidePageProps) {
  const { t } = useTranslation()
  const address = useGuideAddress()
  const [pickedUseCase, setPickedUseCase] = useState<UseCaseRow | null>(null)

  useEffect(() => {
    const hash = window.location.hash.replace('#', '')
    if (!hash) return
    document
      .querySelector<HTMLElement>(`#${CSS.escape(hash)}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [props.query, props.toolId])

  const handleUseCasePick = (row: UseCaseRow) => {
    setPickedUseCase(row)
    document
      .querySelector<HTMLElement>('#tools')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <TerminalPage
      title={t('Beginner guide')}
      description={t(
        'Three things to fill in, then pick a tool and follow the steps.'
      )}
      wide
    >
      <div className='ed-guideBody'>
        <section className='ed-panel' id='essentials'>
          <header className='ed-panelHead'>
            <div>
              <h2>{t('The three things every tool asks for')}</h2>
              <p>
                {t(
                  'Every tool only ever asks you for three things. Grab them below, pick your tool, and follow the steps — done in about three minutes.'
                )}
              </p>
            </div>
          </header>
          <div className='ed-panelBody'>
            <AddressKit address={address} />
            <div className='ed-onboardActions'>
              <Link to='/keys' className='ed-btn ed-btn--accent ed-btn--sm'>
                <KeyRound aria-hidden='true' />
                {t('Create my key')}
              </Link>
            </div>
          </div>
        </section>

        <section className='ed-panel' id='usecases'>
          <div className='ed-panelBody'>
            <UseCasePicker
              onPick={handleUseCasePick}
              activeUseCase={pickedUseCase?.useCase}
            />
          </div>
        </section>

        <section className='ed-panel' id='tools'>
          <header className='ed-panelHead'>
            <div>
              <h2>{t('Pick your tool, follow the steps')}</h2>
              <p>
                {t(
                  'Click any card for step-by-step setup. Addresses in the steps are already filled in with the real address of this site.'
                )}
              </p>
            </div>
          </header>
          <div className='ed-panelBody'>
            <ToolExplorer
              address={address}
              query={props.query}
              openToolId={props.toolId}
              focusToolIds={pickedUseCase?.toolIds}
              focusLabel={pickedUseCase ? t(pickedUseCase.useCase) : undefined}
              onClearFocus={() => setPickedUseCase(null)}
            />
          </div>
        </section>

        <section className='ed-panel' id='troubleshoot'>
          <div className='ed-panelBody'>
            <Troubleshoot />
          </div>
        </section>
      </div>
    </TerminalPage>
  )
}
