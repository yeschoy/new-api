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
import { ArrowRight, Leaf, ReceiptText, Sparkles, Wallet } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { YecaiMetric, YecaiPanel, YecaiPriceFlow } from '@/components/yecai'
import { getApiKeys } from '@/features/keys/api'
import { getUserLogs } from '@/features/usage-logs/api'
import { usageLogSchema } from '@/features/usage-logs/data/schema'
import { useStatus } from '@/hooks/use-status'
import { formatQuota } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { EasyConnectFlow } from './easy-connect-flow'
import {
  estimateEasySavings,
  formatEasySavingsCny,
  type EasySavingsSummary,
} from './easy-savings'

type EasyOverviewDashboardViewProps = {
  remainQuota: number
  usedQuota: number
  savings: EasySavingsSummary
  connectPanel: ReactNode
}

function SavingsReceipt(props: { savings: EasySavingsSummary }) {
  const { t } = useTranslation()
  const hasComparableRequests = props.savings.comparableRequests > 0

  return (
    <YecaiPanel
      as='aside'
      tone='money'
      layer='raised'
      className='ed-receipt'
      data-testid='easy-savings-receipt'
    >
      <div className='flex items-center justify-between gap-3'>
        <p className='ed-eyebrow'>
          <ReceiptText size={13} aria-hidden='true' />
          {t('Savings receipt')}
        </p>
        <span className='ed-badge'>{t('Automatically estimated')}</span>
      </div>

      <div>
        <p className='text-muted-foreground m-0 text-xs font-medium'>
          {t('Savings versus base price')}
        </p>
        <p className='ed-receiptAmount ed-savings mt-2'>
          <span key={props.savings.savings} className='ed-pop inline-block'>
            {formatEasySavingsCny(props.savings.savings)}
          </span>
        </p>
      </div>

      <YecaiPriceFlow
        accessibleLabel={t('Savings receipt')}
        officialLabel={t('Base billing estimate')}
        officialValue={formatEasySavingsCny(props.savings.baseCost)}
        siteLabel={t('Yecai billing')}
        siteValue={formatEasySavingsCny(props.savings.siteCost)}
      />

      <p className='ed-panelNote'>
        {t(
          'Compared with site base prices before group discounts, not official provider prices.'
        )}
      </p>

      <div className='flex items-end justify-between gap-4'>
        <p className='ed-panelNote'>
          {hasComparableRequests
            ? t(
                'Based on {{count}} recent comparable requests and their recorded group rates.',
                { count: props.savings.comparableRequests }
              )
            : t(
                'After your first comparable request, savings will appear here automatically.'
              )}
        </p>
        <Link
          to='/pricing'
          className='text-foreground inline-flex shrink-0 items-center gap-1 text-xs font-semibold'
        >
          {t('Model prices')}
          <ArrowRight className='size-3.5' aria-hidden='true' />
        </Link>
      </div>
    </YecaiPanel>
  )
}

export function EasyOverviewDashboardView(
  props: EasyOverviewDashboardViewProps
) {
  const { t } = useTranslation()

  return (
    <div className='flex flex-col gap-5' data-testid='easy-overview'>
      <section className='ed-paper ed-deck' data-testid='easy-setup-runway'>
        <header className='ed-deckHead'>
          <div>
            <p className='ed-eyebrow'>
              <Leaf size={13} aria-hidden='true' />
              {t('Easy mode')}
            </p>
          </div>
          <div className='ed-metricGrid w-full sm:w-auto sm:min-w-[24rem]'>
            <YecaiMetric
              icon={Wallet}
              label={t('Credit remaining')}
              value={formatQuota(props.remainQuota)}
              tone='leaf'
            />
            <YecaiMetric
              icon={Sparkles}
              label={t('Used')}
              value={formatQuota(props.usedQuota)}
              tone='model'
            />
          </div>
        </header>

        <div className='ed-easyGrid'>
          {props.connectPanel}
          <SavingsReceipt savings={props.savings} />
        </div>
      </section>
    </div>
  )
}

export function EasyOverviewDashboard() {
  const user = useAuthStore((state) => state.auth.user)
  const quotaPerUnit = useSystemConfigStore(
    (state) => state.config.currency.quotaPerUnit
  )
  const { status } = useStatus()
  const requestCount = Number(user?.request_count ?? 0)
  const apiKeysQuery = useQuery({
    queryKey: ['dashboard', 'easy-overview', 'api-keys'],
    queryFn: async () => {
      const result = await getApiKeys({ p: 1, size: 10 })
      return result.success ? (result.data?.items ?? []) : []
    },
    staleTime: 60 * 1000,
  })
  const usageLogsQuery = useQuery({
    queryKey: ['dashboard', 'easy-overview', 'recent-consume-logs'],
    queryFn: async () => {
      const result = await getUserLogs({ p: 1, page_size: 100, type: 2 })
      if (!result.success) return []

      return (result.data?.items ?? []).flatMap((item) => {
        const parsed = usageLogSchema.safeParse(item)
        return parsed.success ? [parsed.data] : []
      })
    },
    enabled: requestCount > 0,
    staleTime: 60 * 1000,
  })
  const savings = useMemo(
    () =>
      estimateEasySavings(usageLogsQuery.data ?? [], {
        priceRate: Math.max(Number(status?.price ?? 1), 0.001),
        quotaPerUnit,
      }),
    [quotaPerUnit, status?.price, usageLogsQuery.data]
  )

  return (
    <EasyOverviewDashboardView
      remainQuota={Number(user?.quota ?? 0)}
      usedQuota={Number(user?.used_quota ?? 0)}
      savings={savings}
      connectPanel={
        <EasyConnectFlow
          existingKey={
            apiKeysQuery.data?.find((apiKey) => apiKey.status === 1) ?? null
          }
        />
      }
    />
  )
}
