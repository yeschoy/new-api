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

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

import { useCashbackSummary } from '../hooks/use-cashback'

export function CashbackSummary() {
  const { t } = useTranslation()
  const query = useCashbackSummary()

  if (query.isPending) {
    return (
      <div
        aria-label={t('Loading cashback summary')}
        className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'
      >
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className='h-24 w-full' />
        ))}
      </div>
    )
  }
  if (query.isError || !query.data) {
    return (
      <Alert variant='destructive'>
        <AlertTitle>{t('Unable to load cashback summary')}</AlertTitle>
        <AlertDescription>
          {t('Refresh the page to try again.')}
        </AlertDescription>
      </Alert>
    )
  }

  const metrics = [
    [t('Pending review quota'), query.data.pending_review_quota],
    [t('Awaiting maturity quota'), query.data.awaiting_maturity_quota],
    [t('Issued cashback quota'), query.data.issued_quota],
    [
      t('Open cashback debt'),
      query.data.outstanding_reward_debt +
        query.data.outstanding_principal_debt,
    ],
  ] as const
  const severeCount = query.data.risk_counts.severe ?? 0
  const highCount = query.data.risk_counts.high ?? 0

  return (
    <div className='space-y-3'>
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        {metrics.map(([label, value]) => (
          <Card key={label}>
            <CardHeader className='pb-2'>
              <CardTitle className='text-muted-foreground text-sm font-medium'>
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent className='text-2xl font-semibold tabular-nums'>
              {value.toLocaleString()}
            </CardContent>
          </Card>
        ))}
      </div>
      {(severeCount > 0 ||
        highCount > 0 ||
        query.data.incident_count > 0 ||
        query.data.settlement_failure_count > 0 ||
        query.data.reconciliation_issues > 0) && (
        <Alert variant='destructive'>
          <AlertTitle>
            {t('Cashback risk and reconciliation alerts')}
          </AlertTitle>
          <AlertDescription>
            {t(
              '{{high}} high-risk, {{severe}} severe-risk, {{incidents}} incidents, {{failures}} settlement failures, {{issues}} reconciliation issues.',
              {
                high: highCount,
                severe: severeCount,
                incidents: query.data.incident_count,
                failures: query.data.settlement_failure_count,
                issues: query.data.reconciliation_issues,
              }
            )}
          </AlertDescription>
        </Alert>
      )}
      <div className='text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-xs'>
        <span>
          {t('Rejected')} / {t('Canceled')}:{' '}
          {query.data.rejected_or_canceled_count.toLocaleString()}
        </span>
        <span>
          {t('Incidents')}: {query.data.incident_count.toLocaleString()}
        </span>
        <span>
          {t('Settlement')} {t('Failed')}:{' '}
          {query.data.settlement_failure_count.toLocaleString()}
        </span>
        <span>
          {t('Recovered quota')}: {query.data.recovered_quota.toLocaleString()}
        </span>
      </div>
      {(query.data.inviter_clusters.length > 0 ||
        query.data.device_clusters.length > 0) && (
        <div className='grid gap-3 lg:grid-cols-2'>
          {query.data.inviter_clusters.length > 0 && (
            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm'>
                  {t('Inviter clusters')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className='space-y-2 text-xs'>
                  {query.data.inviter_clusters.map((cluster) => (
                    <li
                      key={cluster.inviter_id}
                      className='flex flex-wrap justify-between gap-x-3 gap-y-1'
                    >
                      <span className='font-medium'>#{cluster.inviter_id}</span>
                      <span className='text-muted-foreground'>
                        {cluster.distinct_invitees.toLocaleString()}{' '}
                        {t('Invited user')} ·{' '}
                        {t(
                          cluster.reward_count === 1
                            ? '{{count}} reward'
                            : '{{count}} rewards',
                          {
                            count: cluster.reward_count.toLocaleString(),
                          }
                        )}{' '}
                        · {t('Payable reward')}:{' '}
                        {cluster.reward_quota.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {query.data.device_clusters.length > 0 && (
            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm'>
                  {t('Shared device clusters')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className='space-y-2 text-xs'>
                  {query.data.device_clusters.map((cluster) => (
                    <li
                      key={cluster.device_hash_short}
                      className='flex flex-wrap justify-between gap-x-3 gap-y-1'
                    >
                      <code>{cluster.device_hash_short}</code>
                      <span className='text-muted-foreground'>
                        {t('Device-associated accounts')}:{' '}
                        {cluster.account_count.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
