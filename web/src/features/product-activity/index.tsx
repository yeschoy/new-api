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
import { ArrowRight, Bot, Sparkles, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Footer } from '@/components/layout/components/footer'
import { MarketingHeader } from '@/components/layout/components/marketing-header'
import { useTheme } from '@/context/theme-provider'
import { useAuthStore } from '@/stores/auth-store'

import '@/features/home/components/home-glass.css'
import '@/styles/activity-landing.css'

export function ProductActivityPage() {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const isAuthenticated = useAuthStore((state) => !!state.auth.user)
  const destination = isAuthenticated ? '/wallet' : '/sign-up'
  const action = isAuthenticated
    ? t('View plans in wallet')
    : t('Sign up to explore plans')

  return (
    <div
      className='ci-landing ci-theme ci-liquidHome activity-landing'
      data-theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
    >
      <div className='ci-handoffRoot'>
        <MarketingHeader
          isAuthenticated={isAuthenticated}
          currentPage='activity'
        />
        <main>
          <section
            className='activity-hero'
            id='top'
            aria-labelledby='activity-title'
          >
            <div className='activity-hero__content'>
              <p className='activity-kicker'>
                {t('Explore subscription cards')}
              </p>
              <h1 id='activity-title'>{t('DeepSeek and GPT Power Cards')}</h1>
              <p className='activity-hero__intro'>
                {t(
                  'Explore the cards below, then check your wallet for currently available plans and their details.'
                )}
              </p>
            </div>
          </section>
          <section
            className='activity-details'
            aria-label={t('DeepSeek and GPT Power Cards')}
          >
            <article className='activity-card'>
              <span className='activity-card__icon' aria-hidden='true'>
                <Sparkles size={26} />
              </span>
              <span className='activity-card__index' aria-hidden='true'>
                01
              </span>
              <h2>{t('DeepSeek Power Card')}</h2>
              <p>
                {t(
                  'Interested in DeepSeek? Check the wallet for available subscription plans and their current details.'
                )}
              </p>
              <Link to={destination} className='activity-card__link'>
                {action} <ArrowRight size={17} aria-hidden='true' />
              </Link>
            </article>
            <article className='activity-card activity-card--invite'>
              <span className='activity-card__icon' aria-hidden='true'>
                <Bot size={26} />
              </span>
              <span className='activity-card__index' aria-hidden='true'>
                02
              </span>
              <h2>{t('GPT Power Card')}</h2>
              <p>
                {t(
                  'Interested in GPT? Check the wallet for available subscription plans and their current details.'
                )}
              </p>
              <Link to={destination} className='activity-card__link'>
                {action} <ArrowRight size={17} aria-hidden='true' />
              </Link>
            </article>
          </section>
          <p className='activity-disclaimer'>
            <Wallet size={19} aria-hidden='true' />
            {t(
              'Check the wallet for current availability and plan details before purchasing.'
            )}
          </p>
        </main>
        <Footer />
      </div>
    </div>
  )
}
