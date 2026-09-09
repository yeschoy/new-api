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
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { AuthenticatedLayout } from '@/components/layout/components/authenticated-layout'
import { Footer } from '@/components/layout/components/footer'
import { TerminalPage } from '@/components/layout/components/terminal-page'
import { useTheme } from '@/context/theme-provider'
import { useAuthStore } from '@/stores/auth-store'

import { AddressKit } from './components/address-kit'
import { Troubleshoot, UseCasePicker } from './components/help-sections'
import { ToolExplorer } from './components/tool-explorer'
import { useGuideAddress } from './use-guide-address'

type GuideProps = {
  query?: string
  toolId?: string
}

function GuideBody(props: GuideProps) {
  const { t } = useTranslation()
  const address = useGuideAddress()

  useEffect(() => {
    const hash = window.location.hash.replace('#', '')
    if (!hash) return
    document
      .getElementById(hash)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [props.query, props.toolId])

  return (
    <div className='ci-guideBody'>
      <section className='ci-panel' id='essentials'>
        <header className='ci-panelHeader'>
          <h2>{t('The three things every tool asks for')}</h2>
          <p>
            {t(
              'Every tool only ever asks you for three things. Grab them below, pick your tool, and follow the steps — done in about three minutes.'
            )}
          </p>
        </header>
        <div className='ci-panelBody'>
          <AddressKit address={address} />
          <div className='ci-guideActions'>
            <Link to='/keys' className='ci-button ci-button--size-sm'>
              <KeyRound size={16} />
              {t('Create my key')}
            </Link>
          </div>
        </div>
      </section>

      <section className='ci-panel' id='usecases'>
        <div className='ci-panelBody'>
          <UseCasePicker />
        </div>
      </section>

      <section className='ci-panel' id='tools'>
        <header className='ci-panelHeader'>
          <h2>{t('Pick your tool, follow the steps')}</h2>
          <p>
            {t(
              'Click any card for step-by-step setup. Addresses in the steps are already filled in with the real address of this site.'
            )}
          </p>
        </header>
        <div className='ci-panelBody'>
          <ToolExplorer
            address={address}
            query={props.query}
            openToolId={props.toolId}
          />
        </div>
      </section>

      <section className='ci-panel' id='troubleshoot'>
        <div className='ci-panelBody'>
          <Troubleshoot />
        </div>
      </section>
    </div>
  )
}

export function Guide(props: GuideProps) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const page = (
    <TerminalPage
      title={t('Docs')}
      description={t(
        'Three things to fill in, then pick a tool and follow the steps.'
      )}
      wide
    >
      <GuideBody query={props.query} toolId={props.toolId} />
    </TerminalPage>
  )

  if (user) {
    return <AuthenticatedLayout>{page}</AuthenticatedLayout>
  }

  return (
    <PublicLayout showMainContainer={false}>
      <div
        className='ci-landing ci-theme'
        data-theme={isDark ? 'dark' : 'light'}
      >
        <div className='ci-handoffRoot'>
          {page}
          <Footer />
        </div>
      </div>
    </PublicLayout>
  )
}
