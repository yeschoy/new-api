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
import { BarChart3 } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { buildSavingsCatalog } from '@/features/home/lib/pricing-savings'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import { getUserLogs } from '@/features/usage-logs/api'
import { usageLogSchema } from '@/features/usage-logs/data/schema'
import {
  estimateGatewayListSavings,
  formatConsoleMoney,
} from '@/lib/console-money'

type TerminalBillingProps = {
  remainQuota: number
  usedQuota: number
  children: React.ReactNode
}

export function TerminalBilling(props: TerminalBillingProps) {
  const { t } = useTranslation()
  const { models, priceRate } = usePricingData()
  const logsQuery = useQuery({
    queryKey: ['terminal', 'billing', 'logs'],
    queryFn: async () => {
      const result = await getUserLogs({ p: 1, page_size: 100, type: 2 })
      if (!result.success) return []
      return (result.data?.items ?? []).flatMap((item) => {
        const parsed = usageLogSchema.safeParse(item)
        return parsed.success ? [parsed.data] : []
      })
    },
    staleTime: 60 * 1000,
  })
  const catalog = useMemo(
    () => buildSavingsCatalog(models || [], priceRate),
    [models, priceRate]
  )
  const logs = logsQuery.data ?? []
  const saved = estimateGatewayListSavings(logs, catalog)
  const billed = logs.reduce((sum, log) => sum + log.quota, 0)
  const percent =
    billed + saved > 0 ? Math.round((saved / (billed + saved)) * 100) : null

  return (
    <>
      <section className='ci-panel'>
        <header className='ci-panelHeader'>
          <h2>{t('How much you saved')}</h2>
          <p>{t("Compared with this site's list prices.")}</p>
        </header>
        <div
          className='ci-statGrid'
          style={{ margin: 0, border: 0, borderRadius: 0 }}
        >
          <article>
            <span>{t('Saved in total')}</span>
            <strong className='is-saved'>{formatConsoleMoney(saved)}</strong>
          </article>
          <article>
            <span>{t('If you paid list price')}</span>
            <strong>{formatConsoleMoney(billed + saved)}</strong>
          </article>
          <article>
            <span>{t('You actually paid')}</span>
            <strong>{formatConsoleMoney(billed)}</strong>
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
