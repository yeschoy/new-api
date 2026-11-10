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
import { ArrowRight, CalendarDays, Gift } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { getPublicCashbackOffers } from '@/features/cashback/api'
import { formatCashbackCents } from '@/features/cashback/lib/format'
import { toIntlLocale } from '@/i18n/languages'

import './double-eleven-promo.css'

// Announcement dates only, not payment eligibility. The server owns the live
// offer; announce one day ahead and remove after November 18 in Beijing time.
const ANNOUNCE_AT = Date.parse('2026-11-10T00:00:00+08:00')
const START_AT = Date.parse('2026-11-11T00:00:00+08:00')
const END_AT = Date.parse('2026-11-19T00:00:00+08:00')

export function DoubleElevenPromo(props: { isAuthenticated: boolean }) {
  const { t, i18n } = useTranslation()
  const [now, setNow] = useState(Date.now)
  const visible = now >= ANNOUNCE_AT && now < END_AT
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

  useEffect(() => {
    let timer: number
    const checkDates = () => {
      const current = Date.now()
      setNow(current)
      window.clearTimeout(timer)
      const next = [ANNOUNCE_AT, START_AT, END_AT].find(
        (boundary) => boundary > current
      )
      if (next) {
        timer = window.setTimeout(
          checkDates,
          Math.min(next - current, 2_147_483_647)
        )
      }
    }
    const checkWhenVisible = () => {
      if (!document.hidden) checkDates()
    }
    checkDates()
    window.addEventListener('focus', checkDates)
    document.addEventListener('visibilitychange', checkWhenVisible)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', checkDates)
      document.removeEventListener('visibilitychange', checkWhenVisible)
    }
  }, [])

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
    message =
      now < START_AT
        ? t('Offer details will appear when the campaign starts.')
        : t('No active top-up payer offer right now.')
  }

  let actionTo: '/activity' | '/wallet' | '/sign-up' = '/activity'
  let actionLabel = t('Offers')
  if (payer) {
    actionTo = props.isAuthenticated ? '/wallet' : '/sign-up'
    actionLabel = props.isAuthenticated ? t('Top up now') : t('Get started')
  }

  return (
    <section className='ci-doubleEleven' aria-labelledby='double-eleven-title'>
      <div className='ci-doubleElevenCopy'>
        <div className='ci-doubleElevenEyebrow'>
          <Gift size={16} aria-hidden='true' />
          <h2 id='double-eleven-title'>{t('Double 11 top-up special')}</h2>
          {payer?.payer_scope === 'first_top_up' ? (
            <span className='ci-doubleElevenScope'>
              {t('First top-up only')}
            </span>
          ) : null}
        </div>
        <p
          className={
            showPerHundred ? 'ci-doubleElevenOffer' : 'ci-doubleElevenStatus'
          }
          role='status'
        >
          {showPerHundred
            ? t('Every CNY 100 topped up earns {{reward}} in bonus credit', {
                reward: formatCashbackCents(
                  giftCents,
                  toIntlLocale(i18n.resolvedLanguage || i18n.language),
                  { wholeYuan: true }
                ),
              })
            : message}
        </p>
        {showPerHundred ? (
          <p className='ci-doubleElevenNote'>
            {t(
              'Complete hundreds per order only; remainders do not carry over.'
            )}
          </p>
        ) : null}
        <p className='ci-doubleElevenNote'>
          {t(
            'Gift credit cannot be withdrawn. Eligibility and limits are shown in your wallet.'
          )}
        </p>
      </div>
      <div className='ci-doubleElevenActions'>
        <span className='ci-doubleElevenDates'>
          <CalendarDays size={14} aria-hidden='true' />
          <span>
            <time dateTime='2026-11-11'>11.11</time>
            {' – '}
            <time dateTime='2026-11-18'>11.18</time>
            {' · '}
            {t('Beijing time')}
          </span>
        </span>
        <Link
          to={actionTo}
          className='ci-button ci-button--default ci-button--size-sm'
        >
          {actionLabel}
          <ArrowRight size={16} aria-hidden='true' />
        </Link>
      </div>
    </section>
  )
}
