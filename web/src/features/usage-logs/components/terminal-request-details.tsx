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
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import {
  sideDrawerContentClassName,
  sideDrawerFormClassName,
} from '@/components/drawer-layout'
import {
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useTheme } from '@/context/theme-provider'
import {
  formatBillingCurrencyFromUSD,
  formatQuotaWithCurrency,
} from '@/lib/currency'
import dayjs from '@/lib/dayjs'

import { LOG_TYPE_ENUM } from '../constants'
import type { UsageLog } from '../data/schema'
import {
  getLogGroupRatio,
  getLogQuotaComparison,
  getLogChargedQuota,
} from '../lib/cost-comparison'
import { parseLogOther } from '../lib/format'
import {
  getRecordedUnitPrices,
  getRequestErrorText,
  isFailedRequest,
} from '../lib/request-details'

const moneyOptions = { digitsLarge: 6, digitsSmall: 6, abbreviate: false }

export function TerminalRequestDetails(props: { log: UsageLog }) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const log = props.log
  const other = parseLogOther(log.other)
  const failed = isFailedRequest(log)
  const error = getRequestErrorText(log)
  const billed = log.type === LOG_TYPE_ENUM.CONSUME
  const subscription = other?.billing_source === 'subscription'
  const comparison = billed ? getLogQuotaComparison(log.quota, other) : null
  const ratio = getLogGroupRatio(other)
  const prices = getRecordedUnitPrices(other)
  const cacheRead = other?.cache_tokens ?? 0
  const cacheWrite = other?.cache_creation_tokens ?? 0
  const cacheWrite5m = other?.cache_creation_tokens_5m ?? 0
  const cacheWrite1h = other?.cache_creation_tokens_1h ?? 0
  const firstResponseMs = other?.frt
  let charged = t('No charge')
  if (billed) {
    charged = subscription
      ? t('Subscription')
      : formatQuotaWithCurrency(
          getLogChargedQuota(log.quota, other),
          moneyOptions
        )
  }
  let discount = '—'
  if (billed && !subscription && prices.mode !== 'fee' && ratio !== null) {
    discount = `${Number((Math.max(0, 1 - ratio) * 100).toFixed(2))}%`
  }
  const requestFacts = [
    { label: t('Model'), value: log.model_name || t('Unknown model') },
    {
      label: t('Time'),
      value: dayjs.unix(log.created_at).format('YYYY-MM-DD HH:mm:ss'),
    },
    { label: t('API key'), value: log.token_name || '—' },
    { label: t('Status'), value: failed ? t('Failed') : t('Worked') },
  ]
  const usageFacts = [
    { label: t('Input Tokens'), value: log.prompt_tokens.toLocaleString() },
    {
      label: t('Output Tokens'),
      value: log.completion_tokens.toLocaleString(),
    },
  ]
  if (Number.isFinite(cacheRead) && cacheRead > 0) {
    usageFacts.push({
      label: t('Cache Read'),
      value: cacheRead.toLocaleString(),
    })
  }
  if (
    Number.isFinite(cacheWrite) &&
    cacheWrite > 0 &&
    cacheWrite5m <= 0 &&
    cacheWrite1h <= 0
  ) {
    usageFacts.push({
      label: t('Cache Write'),
      value: cacheWrite.toLocaleString(),
    })
  }

  if (Number.isFinite(cacheWrite5m) && cacheWrite5m > 0) {
    usageFacts.push({
      label: t('Cache Write (5m)'),
      value: cacheWrite5m.toLocaleString(),
    })
  }
  if (Number.isFinite(cacheWrite1h) && cacheWrite1h > 0) {
    usageFacts.push({
      label: t('Cache Write (1h)'),
      value: cacheWrite1h.toLocaleString(),
    })
  }

  return (
    <SheetContent
      side='right'
      overlayClassName='z-[65]'
      className={sideDrawerContentClassName(
        'ci-landing ci-theme ci-requestDetails z-[70] sm:max-w-[560px]'
      )}
      data-theme={resolvedTheme}
      showCloseButton={false}
    >
      <SheetHeader className='ci-requestDetailsHeader'>
        <SheetTitle>{t('Request details')}</SheetTitle>
        <SheetDescription>
          {log.model_name || t('Unknown model')}
        </SheetDescription>
        <SheetClose
          className='ci-appIconBtn ci-requestDetailsClose'
          aria-label={t('Close')}
        >
          <X size={16} aria-hidden='true' />
        </SheetClose>
      </SheetHeader>
      <div className={sideDrawerFormClassName('ci-requestDetailsBody')}>
        {failed && (
          <section className='ci-requestFailure' aria-label={t('Error')}>
            <h3>{t('Failed')}</h3>
            <p>
              {log.is_stream && other?.stream_status?.status === 'error'
                ? t('The response was interrupted before it finished.')
                : t(
                    'The request did not complete. Review the error message for details.'
                  )}
            </p>
            {error ? (
              <details>
                <summary>{t('Original error')}</summary>
                <pre>{error}</pre>
              </details>
            ) : (
              <p>{t('Failed, but no error text was saved.')}</p>
            )}
          </section>
        )}
        <section className='ci-requestDetailsSection'>
          <h3>{t('Request overview')}</h3>
          <dl className='ci-requestFacts'>
            {requestFacts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className='ci-requestDetailsSection'>
          <h3>{t('Billing Details')}</h3>
          <dl className='ci-requestFacts'>
            <div>
              <dt>{t('Original price')}</dt>
              <dd>
                {comparison
                  ? formatQuotaWithCurrency(comparison.baseQuota, moneyOptions)
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>{t('You actually paid')}</dt>
              <dd>{charged}</dd>
            </div>
            <div>
              <dt>
                {comparison && comparison.savedQuota < 0
                  ? t('Above base price')
                  : t('Saved')}
              </dt>
              <dd
                className={
                  comparison && comparison.savedQuota > 0
                    ? 'text-success'
                    : undefined
                }
              >
                {comparison
                  ? formatQuotaWithCurrency(
                      Math.abs(comparison.savedQuota),
                      moneyOptions
                    )
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>{t('Discount on this request')}</dt>
              <dd>{discount}</dd>
            </div>
          </dl>
          {subscription && (
            <p className='ci-requestDetailsNote'>
              {t(
                'This request used a subscription; cash savings are not comparable.'
              )}
            </p>
          )}
          {!subscription && !comparison && billed && prices.mode !== 'fee' && (
            <p className='ci-requestDetailsNote'>
              {t(
                'The recorded price is incomplete, so savings cannot be calculated.'
              )}
            </p>
          )}
          {prices.mode === 'tokens' && (
            <>
              <dl className='ci-requestFacts'>
                <div>
                  <dt>{t('Base input price')}</dt>
                  <dd>
                    {prices.input === null
                      ? '—'
                      : formatBillingCurrencyFromUSD(
                          prices.input,
                          moneyOptions
                        )}
                  </dd>
                </div>
                <div>
                  <dt>{t('Base output price')}</dt>
                  <dd>
                    {prices.output === null
                      ? '—'
                      : formatBillingCurrencyFromUSD(
                          prices.output,
                          moneyOptions
                        )}
                  </dd>
                </div>
              </dl>
              <p className='ci-requestDetailsNote'>
                {t(
                  'Unit prices are per million tokens, before the request discount, using the rates recorded at the time.'
                )}
              </p>
            </>
          )}
          {prices.mode === 'request' && (
            <dl className='ci-requestFacts'>
              <div>
                <dt>{t('Base price per request')}</dt>
                <dd>
                  {prices.perRequest === null
                    ? '—'
                    : formatBillingCurrencyFromUSD(
                        prices.perRequest,
                        moneyOptions
                      )}
                </dd>
              </div>
            </dl>
          )}
          {prices.mode === 'dynamic' && (
            <p className='ci-requestDetailsNote'>
              {t(
                'This request used dynamic pricing. The recorded charge above includes its usage-based calculation.'
              )}
            </p>
          )}
          {prices.mode === 'fee' && (
            <p className='ci-requestDetailsNote'>{t('Violation Fee')}</p>
          )}
        </section>
        <section className='ci-requestDetailsSection'>
          <h3>{t('Token Breakdown')}</h3>
          <dl className='ci-requestFacts'>
            {usageFacts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className='ci-requestDetailsSection'>
          <h3>{t('Timing')}</h3>
          <dl className='ci-requestFacts'>
            <div>
              <dt>{t('Time taken')}</dt>
              <dd>{log.use_time > 0 ? `${log.use_time.toFixed(1)}s` : '—'}</dd>
            </div>
            {log.is_stream &&
              typeof firstResponseMs === 'number' &&
              Number.isFinite(firstResponseMs) &&
              firstResponseMs > 0 && (
                <div>
                  <dt>{t('First response time')}</dt>
                  <dd>{`${(firstResponseMs / 1000).toFixed(3)}s`}</dd>
                </div>
              )}
          </dl>
        </section>
        <section className='ci-requestDetailsSection'>
          <h3>{t('Request ID')}</h3>
          <div className='ci-requestId'>
            <code>{log.request_id || '—'}</code>
            {log.request_id && (
              <CopyButton
                value={log.request_id}
                aria-label={t('Copy request ID')}
                className='ci-appIconBtn'
              />
            )}
          </div>
        </section>
      </div>
    </SheetContent>
  )
}
