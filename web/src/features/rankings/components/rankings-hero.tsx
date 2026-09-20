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
import { useTranslation } from 'react-i18next'

import type { RankingPeriod } from '../types'

const PERIODS: { id: RankingPeriod; labelKey: string }[] = [
  { id: 'today', labelKey: 'Today' },
  { id: 'week', labelKey: 'Week' },
  { id: 'month', labelKey: 'Month' },
  { id: 'year', labelKey: 'Year' },
]

type RankingsHeroProps = {
  period: RankingPeriod
  onPeriodChange: (period: RankingPeriod) => void
}

/**
 * Hero strip for the rankings page. Intentionally minimal — title +
 * subtitle + period tabs only.
 */
export function RankingsHero(props: RankingsHeroProps) {
  const { t } = useTranslation()

  return (
    <section className='ed-pageHead'>
      <div>
        <p className='ed-eyebrow'>{t('Live usage data')}</p>
        <h1 className='ed-display'>{t('Rankings')}</h1>
        <p>
          {t(
            'Discover the most-used models and rising vendors on the platform, updated from live usage data.'
          )}
        </p>
      </div>

      <div role='tablist' aria-label={t('Period')} className='ed-chipRow'>
        {PERIODS.map((p) => (
          <button
            key={p.id}
            role='tab'
            type='button'
            aria-selected={props.period === p.id}
            onClick={() => props.onPeriodChange(p.id)}
            className='ed-chip'
          >
            {t(p.labelKey)}
          </button>
        ))}
      </div>
    </section>
  )
}
