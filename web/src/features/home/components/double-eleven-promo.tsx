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
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, ChevronDown, Gift, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { getPublicCashbackOffers } from '@/features/cashback/api'
import { formatCashbackCents } from '@/features/cashback/lib/format'
import { toIntlLocale } from '@/i18n/languages'

import { useDoubleElevenWindow } from '../hooks/use-double-eleven-window'
import { useOfferSpotlight } from '../hooks/use-offer-spotlight'

import './double-eleven-promo.css'

export function DoubleElevenPromo(props: { isAuthenticated: boolean }) {
  const { t, i18n } = useTranslation()
  const { visible, upcoming } = useDoubleElevenWindow()
  const spotlightRef = useOfferSpotlight(visible)
  const offers = useQuery({
    queryKey: ['cashback', 'public-offers'],
    queryFn: getPublicCashbackOffers,
    enabled: visible,
    retry: false,
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: 'always',
    meta: { errorToast: false },
  })

  if (!visible) return null

  // Never promote an inviter-only offer, or a previously cached payer offer
  // while its refresh is pending or failed. Do not hardcode the gift amount.
  const payer =
    !offers.isFetching && !offers.isError && offers.data?.active
      ? offers.data.invitee
      : undefined
  const giftCents = (payer?.fixed_per_hundred ?? 0) * 100
  const showPerHundred =
    payer?.strategy === 'per_hundred' &&
    Number.isSafeInteger(giftCents) &&
    giftCents > 0
  let message = t('Check your wallet for current rewards.')
  if (offers.isError) {
    message = t('Current offers are temporarily unavailable.')
  } else if (offers.isPending || offers.isFetching) {
    message = t('Checking current offers…')
  } else if (!payer) {
    message = upcoming
      ? t('Offer details will appear when the campaign starts.')
      : t('No active top-up payer offer right now.')
  }

  let actionTo: '/activity' | '/wallet' | '/sign-up' = '/activity'
  let actionLabel = t('Offers')
  if (payer) {
    actionTo = props.isAuthenticated ? '/wallet' : '/sign-up'
    actionLabel = props.isAuthenticated ? t('Top up now') : t('Get started')
  }

  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const reward = formatCashbackCents(giftCents, locale, { wholeYuan: true })

  return (
    <section
      ref={spotlightRef}
      className='ci-doubleEleven'
      aria-labelledby='double-eleven-title'
    >
      <span className='ci-doubleElevenSpotlight' aria-hidden='true' />
      <div className='ci-doubleElevenHeader'>
        <div className='ci-doubleElevenEyebrow'>
          <span className='ci-doubleElevenIcon' aria-hidden='true'>
            <Gift size={15} />
          </span>
          <h2 id='double-eleven-title'>{t('Double 11 top-up special')}</h2>
        </div>
        <span className='ci-doubleElevenDates'>
          <time dateTime='2026-11-11'>11.11</time>
          <span aria-hidden='true'>—</span>
          <time dateTime='2026-11-18'>11.18</time>
          <span className='ci-doubleElevenTimezone'>{t('Beijing time')}</span>
        </span>
      </div>

      <div className='ci-doubleElevenArtwork' aria-hidden='true'>
        <span className='ci-doubleElevenOrbit ci-doubleElevenOrbit--one' />
        <span className='ci-doubleElevenOrbit ci-doubleElevenOrbit--two' />
        <span className='ci-doubleElevenOrbit ci-doubleElevenOrbit--three' />
        <span className='ci-doubleElevenEdition'>11.11</span>
        <span className='ci-doubleElevenStar ci-doubleElevenStar--one'>✦</span>
        <span className='ci-doubleElevenStar ci-doubleElevenStar--two'>✦</span>
      </div>

      <div className='ci-doubleElevenMain'>
        <div className='ci-doubleElevenCopy'>
          {showPerHundred ? (
            <>
              <p className='sr-only' role='status'>
                {t('Every CNY 100 topped up earns {{reward}} in bonus credit', {
                  reward,
                })}
              </p>
              <div className='ci-doubleElevenAmounts' aria-hidden='true'>
                <div className='ci-doubleElevenAmount'>
                  <span>{t('For each full top-up of')}</span>
                  <strong>
                    {formatCashbackCents(10_000, locale, { wholeYuan: true })}
                  </strong>
                </div>
                <span className='ci-doubleElevenPlus'>
                  <Plus size={18} />
                </span>
                <div className='ci-doubleElevenAmount ci-doubleElevenGift'>
                  <span>{t('Bonus usage credit')}</span>
                  <strong>{reward}</strong>
                </div>
              </div>
            </>
          ) : (
            <p className='ci-doubleElevenStatus' role='status'>
              {message}
            </p>
          )}
          {payer?.payer_scope === 'first_top_up' ? (
            <span className='ci-doubleElevenScope'>
              {t('First top-up only')}
            </span>
          ) : null}
        </div>
        <Link to={actionTo} className='ci-doubleElevenAction'>
          {actionLabel}
          <ArrowRight size={16} aria-hidden='true' />
        </Link>
      </div>

      <details className='ci-doubleElevenRules'>
        <summary>
          <span className='ci-doubleElevenRuleHint'>
            {t('Per order · Bonus credit is not withdrawable')}
          </span>
          <span className='ci-doubleElevenRulesToggle'>
            {t('Offer rules')}
            <ChevronDown size={13} aria-hidden='true' />
          </span>
        </summary>
        <div className='ci-doubleElevenRuleContent'>
          {showPerHundred ? (
            <p>
              {t(
                'Complete hundreds per order only; remainders do not carry over.'
              )}
            </p>
          ) : null}
          <p>
            {t(
              'Gift credit cannot be withdrawn. Eligibility and limits are shown in your wallet.'
            )}
          </p>
        </div>
      </details>
    </section>
  )
}
