/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { Link } from '@tanstack/react-router'
import { ArrowRight, Gift, Users, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Footer } from '@/components/layout/components/footer'
import { MarketingHeader } from '@/components/layout/components/marketing-header'
import { useTheme } from '@/context/theme-provider'
import { useAuthStore } from '@/stores/auth-store'

import '@/features/home/components/home-glass.css'
import '@/styles/activity-landing.css'

export function CashbackActivityPage() {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const isAuthenticated = useAuthStore((state) => !!state.auth.user)
  const destination = isAuthenticated ? '/wallet' : '/sign-up'

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
          <section className='activity-hero' aria-labelledby='activity-title'>
            <div className='activity-hero__content'>
              <p className='activity-kicker'>{t('Offers')}</p>
              <h1 id='activity-title'>{t('Top-up and inviter cashback')}</h1>
              <p className='activity-hero__intro'>
                {t(
                  'Depending on the activity, an eligible top-up may reward the payer and inviter separately. Rewards follow the rules active when payment succeeds.'
                )}
              </p>
              <Link
                to={destination}
                className='ci-button ci-button--default ci-button--size-sm activity-hero__action'
              >
                {isAuthenticated ? t('Wallet') : t('Get started')}
                <ArrowRight size={17} aria-hidden='true' />
              </Link>
            </div>
          </section>

          <section
            className='activity-details'
            aria-label={t('Top-up and inviter cashback')}
          >
            <article className='activity-card'>
              <span className='activity-card__icon' aria-hidden='true'>
                <Wallet size={26} />
              </span>
              <span className='activity-card__index' aria-hidden='true'>
                01
              </span>
              <h2>{t('Top-up rewards')}</h2>
              <p>
                {t(
                  'Check the current estimate in your wallet before paying. Eligibility and the final gift are recalculated when payment succeeds.'
                )}
              </p>
            </article>
            <article className='activity-card activity-card--invite'>
              <span className='activity-card__icon' aria-hidden='true'>
                <Users size={26} />
              </span>
              <span className='activity-card__index' aria-hidden='true'>
                02
              </span>
              <h2>{t('Invite rewards')}</h2>
              <p>
                {t(
                  'Share your referral link. When an invited friend makes an eligible online top-up, your separate gift goes through review before settlement.'
                )}
              </p>
              <Link to={destination} className='activity-card__link'>
                {isAuthenticated ? t('Your Referral Link') : t('Sign up')}
                <ArrowRight size={17} aria-hidden='true' />
              </Link>
            </article>
          </section>
          <p className='activity-disclaimer'>
            <Gift size={19} aria-hidden='true' />
            {t(
              'Offers depend on the current campaign, eligibility and limits. Orders below the configured threshold receive no gift.'
            )}
          </p>
        </main>
        <Footer />
      </div>
    </div>
  )
}
