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
import { BarChart3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useUsageSummary } from '@/features/usage-logs/hooks/use-usage-summary'
import { formatConsoleMoney } from '@/lib/console-money'

type TerminalBillingProps = {
  remainQuota: number
  usedQuota: number
  children: React.ReactNode
}

export function TerminalBilling(props: TerminalBillingProps) {
  const { t } = useTranslation()
  const summary = useUsageSummary(10)
  const saved = summary.data?.saved_quota ?? 0
  const billed = summary.data?.quota ?? 0
  const percent =
    billed + saved > 0 ? Math.round((saved / (billed + saved)) * 100) : null

  return (
    <>
      {summary.error ? (
        <p role='alert' className='text-destructive'>
          {t(summary.error.message)}
        </p>
      ) : null}
      <section className='ci-panel'>
        <header className='ci-panelHeader'>
          <h2>{t('How much you saved')}</h2>
          <p>{t('Last 10 days · recorded request rates')}</p>
        </header>
        <div
          className='ci-statGrid'
          style={{ margin: 0, border: 0, borderRadius: 0 }}
        >
          <article>
            <span>{t('Saved in the last 10 days')}</span>
            <strong className='is-saved'>
              {summary.data ? formatConsoleMoney(saved) : '—'}
            </strong>
          </article>
          <article>
            <span>{t('If you paid list price')}</span>
            <strong>
              {summary.data ? formatConsoleMoney(billed + saved) : '—'}
            </strong>
          </article>
          <article>
            <span>{t('You actually paid')}</span>
            <strong>{summary.data ? formatConsoleMoney(billed) : '—'}</strong>
          </article>
          <article>
            <span>{t('Share you saved')}</span>
            <strong className='is-saved'>
              {percent == null ? '—' : `${percent}%`}
            </strong>
          </article>
        </div>
      </section>

      <section className='ci-panel'>
        <header className='ci-panelHeader'>
          <h2>{t('What you spent')}</h2>
          <p>{t('Total from requests that already billed.')}</p>
        </header>
        {billed <= 0 && props.usedQuota <= 0 ? (
          <div className='ci-empty'>
            <span className='ci-emptyIcon'>
              <BarChart3 size={18} />
            </span>
            <h3>{t('Nothing spent yet')}</h3>
            <p>{t('This fills in after you start calling models.')}</p>
          </div>
        ) : (
          <div className='ci-panelBody'>
            <p>
              {t('Charged')}:{' '}
              {formatConsoleMoney(Math.max(billed, props.usedQuota))}
            </p>
          </div>
        )}
      </section>

      {props.children}
    </>
  )
}
