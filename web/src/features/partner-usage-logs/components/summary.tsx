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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { PartnerUsageLogStat } from '../types'
import { CnyAmount } from './cny-amount'

type SummaryProps = {
  /** Undefined while loading or after a failed read: nothing is invented. */
  stat: PartnerUsageLogStat | undefined
}

function SummaryCard(props: {
  label: string
  value: ReactNode
  hint?: ReactNode
  testId: string
}) {
  return (
    <div
      className='bg-card min-w-0 rounded-md border p-3'
      data-testid={props.testId}
    >
      <div className='text-muted-foreground text-xs'>{props.label}</div>
      <div className='mt-1 truncate text-base font-semibold tabular-nums'>
        {props.value}
      </div>
      {props.hint && (
        <div className='text-muted-foreground mt-1 text-xs break-words'>
          {props.hint}
        </div>
      )}
    </div>
  )
}

/**
 * Totals of the current filter. Records (rows) and folded requests are
 * labelled separately, and every aggregate is shown as the server's exact
 * decimal string.
 */
export function PartnerUsageSummary({ stat }: SummaryProps) {
  const { t } = useTranslation()
  const missing = '—'
  return (
    <section
      aria-label={t('Summary')}
      className='grid grid-cols-2 gap-2 lg:grid-cols-5'
    >
      <SummaryCard
        testId='summary-cny'
        label={t('Amount (CNY, current rate)')}
        value={
          stat ? (
            <CnyAmount
              amount={stat.quota_cny.available ? stat.quota_cny.amount : null}
              rawQuota={stat.quota}
            />
          ) : (
            missing
          )
        }
        hint={t(
          'A display equivalent at the current rate, not a historical charge, wallet balance or plan price.'
        )}
      />
      <SummaryCard
        testId='summary-quota'
        label={t('Raw quota')}
        value={stat ? stat.quota : missing}
        hint={t('Internal metering units, not money or tokens.')}
      />
      <SummaryCard
        testId='summary-requests'
        label={t('Requests (retries folded)')}
        value={stat ? stat.request_count : missing}
        hint={
          stat && (
            <>
              <span>
                {t('Succeeded: {{value}}', { value: stat.succeeded_count })}
              </span>
              {' · '}
              <span>
                {t('Failed: {{value}}', { value: stat.failed_count })}
              </span>
              <span className='block'>
                {t(
                  'A failed request may still have been charged; its quota stays in the totals.'
                )}
              </span>
            </>
          )
        }
      />
      <SummaryCard
        testId='summary-records'
        label={t('Records (every attempt)')}
        value={stat ? stat.record_count : missing}
      />
      <SummaryCard
        testId='summary-tokens'
        label={t('Tokens')}
        value={stat ? stat.tokens : missing}
        hint={
          stat &&
          t('Input: {{input}} · Output: {{output}}', {
            input: stat.prompt_tokens,
            output: stat.completion_tokens,
          })
        }
      />
    </section>
  )
}
