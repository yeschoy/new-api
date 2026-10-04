import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

import { getCashbackRecordedSpend } from '../api'

type ReportRequest = {
  userId: number
  startAt: number
  endAt: number
  confirmedIds: number[]
}

export function RecordedSpendReport() {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [userId, setUserId] = useState('')
  const [request, setRequest] = useState<ReportRequest | null>(null)
  const parsedUserId = Number(userId.trim())
  const validUserId = Number.isSafeInteger(parsedUserId) && parsedUserId > 0
  const query = useQuery({
    queryKey: ['cashback', 'recorded-spend', request],
    enabled: request !== null,
    queryFn: async () => {
      if (!request) throw new Error(t('User ID is required'))
      const response = await getCashbackRecordedSpend(
        request.userId,
        request.startAt,
        request.endAt,
        request.confirmedIds
      )
      if (!response.success || !response.data) {
        throw new Error(
          response.message || t('Failed to load recorded spending')
        )
      }
      return response.data
    },
  })

  // The currency library follows the mutable site display currency/rate. These
  // are historical CNY cents, so it cannot format them without changing value.
  const cny = (cents: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'CNY',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100)

  let results: ReactNode = null
  if (request && (query.isPending || query.isFetching)) {
    results = <LoadingState />
  } else if (request && (query.isError || !query.data)) {
    results = <ErrorState onRetry={() => void query.refetch()} />
  } else if (request && query.data && query.data.user_id === request.userId) {
    const report = query.data
    let reconciliationReason = t('Requires manual reconciliation')
    if (report.manual_reason === 'missing_or_legacy_opening') {
      reconciliationReason = t(
        'Historical wallet balance requires manual reconciliation'
      )
    } else if (report.manual_reason === 'cash_amount_or_currency_unconfirmed') {
      reconciliationReason = t(
        'Payment amount or currency requires manual confirmation'
      )
    }
    results = (
      <div className='space-y-4'>
        <Alert>
          <AlertTitle>
            {report.refund_status === 'reference'
              ? t('FIFO and CNY manual reference')
              : t('Manual refund reconciliation required')}
          </AlertTitle>
          <AlertDescription>
            {report.refund_status === 'reference'
              ? t(
                  'Ordered credits and the final wallet balance determine the FIFO reference, not consumption logs. This is not a payout or a verified refundable balance.'
                )
              : t(
                  'No complete cash total is available; reconcile the funding evidence and payment currency manually.'
                )}
            {report.manual_reason && (
              <span className='block'>
                {t('Reconciliation reason')}: {reconciliationReason}
              </span>
            )}
            {report.refund_status === 'manual_reconciliation' &&
              report.credits.some(
                (credit) => credit.reference_cny_cents != null
              ) && (
                <span className='block'>
                  {t(
                    'Individual CNY amounts shown are partial manual references, not a complete refund total.'
                  )}
                </span>
              )}
          </AlertDescription>
        </Alert>
        {report.wallet_quota != null && report.net_spent_quota != null && (
          <p className='text-sm tabular-nums'>
            {t('Final wallet quota (assumed settled)')}:{' '}
            {formatNumber(report.wallet_quota, locale)} ·{' '}
            {t('Net wallet consumption (FIFO inference)')}:{' '}
            {formatNumber(report.net_spent_quota, locale)}
          </p>
        )}
        {report.refund_status === 'reference' &&
          report.total_reference_cny_cents != null && (
            <p className='font-semibold tabular-nums' aria-live='polite'>
              {t('Total CNY manual refund reference')}:{' '}
              {cny(report.total_reference_cny_cents)}
            </p>
          )}
        {report.top_ups.length > 0 && (
          <section
            className='space-y-2'
            aria-label={t('Completed top-ups in selected period')}
          >
            <h3 className='font-medium'>
              {t('Completed top-ups in selected period')}
            </h3>
            <ul className='space-y-1 text-sm'>
              {report.top_ups.map((topUp) => (
                <li key={topUp.id} className='rounded-lg border p-3'>
                  <p className='font-medium break-all'>
                    #{formatNumber(topUp.id, locale)} · {topUp.trade_no} ·{' '}
                    {topUp.payment_provider}
                  </p>
                  {topUp.purchased_quota != null &&
                    topUp.remaining_purchase_quota != null && (
                      <p className='tabular-nums'>
                        {t('Purchased quota')}:{' '}
                        {formatNumber(topUp.purchased_quota, locale)} ·{' '}
                        {t('Remaining purchased quota')}:{' '}
                        {formatNumber(topUp.remaining_purchase_quota, locale)} ·{' '}
                        {t('Remaining gift quota (nonrefundable)')}:{' '}
                        {formatNumber(topUp.remaining_gift_quota ?? 0, locale)}
                      </p>
                    )}
                </li>
              ))}
            </ul>
          </section>
        )}
        {report.credits.length > 0 && (
          <section
            className='space-y-2'
            aria-label={t('Ordered wallet credits and FIFO remaining')}
          >
            <h3 className='font-medium'>
              {t('Ordered wallet credits and FIFO remaining')}
            </h3>
            {request.confirmedIds.length >= 50 && (
              <p
                id='cashback-cny-confirm-limit'
                role='status'
                className='text-muted-foreground text-sm'
              >
                {t(
                  'You can confirm up to 50 Epay orders per query. Uncheck an order to confirm another.'
                )}
              </p>
            )}
            <ol className='space-y-2'>
              {report.credits.map((credit) => {
                let source = t('Other nonrefundable wallet credit')
                if (credit.kind === 'opening') {
                  source = t('Nonrefundable opening balance')
                } else if (credit.kind === 'gift') {
                  source = t('Issued cashback gift (nonrefundable)')
                } else if (credit.source_type === 'redemption') {
                  source = t('Wallet redemption code (nonrefundable)')
                } else if (credit.source_type === 'admin_add') {
                  source = t('Administrator CNY-declared credit')
                } else if (credit.kind === 'purchase') {
                  source = t('Purchased wallet credit')
                }
                const canConfirm =
                  credit.kind === 'purchase' &&
                  credit.source_type === 'topup' &&
                  credit.payment_provider === 'epay' &&
                  credit.signed_amount_available &&
                  credit.remaining_quota > 0
                const checked = request.confirmedIds.includes(credit.source_id)
                return (
                  <li
                    key={credit.event_id}
                    className='space-y-1 rounded-lg border p-3 text-sm'
                  >
                    <p className='font-medium'>
                      #{formatNumber(credit.event_id, locale)} · {source}
                    </p>
                    <p className='text-muted-foreground break-all'>
                      {credit.trade_no ||
                        `${credit.source_type} #${formatNumber(credit.source_id, locale)}`}
                      {credit.payment_provider &&
                        ` · ${credit.payment_provider}`}
                    </p>
                    <p className='tabular-nums'>
                      {t('Credited quota')}:{' '}
                      {formatNumber(credit.quota, locale)} ·{' '}
                      {t('FIFO remaining quota')}:{' '}
                      {formatNumber(credit.remaining_quota, locale)}
                    </p>
                    {credit.kind === 'purchase' &&
                      credit.remaining_quota > 0 && (
                        <p className='tabular-nums'>
                          {t('Per-credit CNY manual reference')}:{' '}
                          {credit.reference_cny_cents != null
                            ? cny(credit.reference_cny_cents)
                            : t('Requires manual reconciliation')}
                        </p>
                      )}
                    {canConfirm && (
                      <div className='flex items-start gap-2 pt-1'>
                        <Checkbox
                          id={`cashback-cny-${credit.event_id}`}
                          checked={checked}
                          disabled={
                            !checked && request.confirmedIds.length >= 50
                          }
                          aria-describedby={
                            !checked && request.confirmedIds.length >= 50
                              ? 'cashback-cny-confirm-limit'
                              : undefined
                          }
                          onCheckedChange={(value) => {
                            setRequest((current) => {
                              if (!current) {
                                return current
                              }
                              if (value === true) {
                                if (
                                  current.confirmedIds.length >= 50 ||
                                  current.confirmedIds.includes(
                                    credit.source_id
                                  )
                                ) {
                                  return current
                                }
                                return {
                                  ...current,
                                  confirmedIds: [
                                    ...current.confirmedIds,
                                    credit.source_id,
                                  ].sort((a, b) => a - b),
                                }
                              }
                              return {
                                ...current,
                                confirmedIds: current.confirmedIds.filter(
                                  (id) => id !== credit.source_id
                                ),
                              }
                            })
                          }}
                        />
                        <Label
                          htmlFor={`cashback-cny-${credit.event_id}`}
                          className='leading-snug'
                        >
                          {t(
                            'I confirm this order’s merchant actually received CNY (not certified by Epay signature)'
                          )}
                        </Label>
                      </div>
                    )}
                  </li>
                )
              })}
            </ol>
          </section>
        )}
        <section
          className='space-y-2'
          aria-label={t('Recorded consumption intervals (reference)')}
        >
          <h3 className='font-medium'>
            {t('Recorded consumption intervals (reference)')}
          </h3>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Only recorded consumption (reference); zero does not prove no spending. Same-second top-ups cannot establish the order of events.'
            )}
          </p>
          {report.top_ups.length === 0 && (
            <EmptyState
              title={t('No completed top-ups in this period')}
              className='min-h-24'
            />
          )}
          {report.log_status === 'unavailable' ? (
            <Alert>
              <AlertTitle>{t('Consumption logs unavailable')}</AlertTitle>
              <AlertDescription>
                {t(
                  'No interval totals can be shown; FIFO references, if available, are independent of logs.'
                )}
              </AlertDescription>
            </Alert>
          ) : (
            <ol className='space-y-2'>
              {report.intervals.map((interval, index) => {
                const previousTopUp = report.top_ups[index - 1]
                let intervalLabel = t(
                  'Entire selected period (by log timestamp)'
                )
                if (previousTopUp) {
                  intervalLabel = t(
                    'From top-up #{{id}} timestamp (order within the second unknown)',
                    { id: previousTopUp.id }
                  )
                } else if (report.top_ups.length > 0) {
                  intervalLabel = t('Until first top-up timestamp (exclusive)')
                }
                return (
                  <li
                    key={previousTopUp?.id ?? 'start'}
                    className='rounded-lg border p-3'
                  >
                    <p className='font-medium'>{intervalLabel}</p>
                    <p className='text-muted-foreground text-xs'>
                      {new Date(interval.start_at * 1000).toLocaleString(
                        locale
                      )}{' '}
                      —{' '}
                      {new Date(interval.end_at * 1000).toLocaleString(locale)}
                    </p>
                    <p className='tabular-nums'>
                      {t(
                        'Recorded log consumption, including subscriptions (reference)'
                      )}
                      :{' '}
                      {formatNumber(
                        interval.recorded_all_consume_log_quota,
                        locale
                      )}
                    </p>
                    <p className='text-muted-foreground text-xs'>
                      {t('Recorded entries')}:{' '}
                      {formatNumber(interval.recorded_consume_count, locale)}
                    </p>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Recorded spending (reference)')}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <Alert>
          <AlertTitle>{t('Read-only refund reference')}</AlertTitle>
          <AlertDescription>
            {t(
              'Stop new usage and confirm all reservations, refunds and batched wallet updates have settled before querying. The system does not verify settlement. Check prior external payouts manually; viewing this report does not refund, deduct quota or reclaim cashback.'
            )}
          </AlertDescription>
        </Alert>
        <form
          className='flex flex-wrap items-end gap-3'
          onSubmit={(event) => {
            event.preventDefault()
            if (!validUserId) return
            const endAt = Math.floor(Date.now() / 1000)
            setRequest({
              userId: parsedUserId,
              startAt: endAt - 30 * 86400,
              endAt,
              confirmedIds: [],
            })
          }}
        >
          <div className='space-y-1.5'>
            <Label htmlFor='cashback-report-user'>{t('User ID')}</Label>
            <Input
              id='cashback-report-user'
              inputMode='numeric'
              required
              pattern='[1-9][0-9]*'
              value={userId}
              onChange={(event) => {
                setUserId(event.target.value)
                setRequest(null) // Never carry a per-order CNY assertion into another query/user.
              }}
            />
          </div>
          <Button type='submit' disabled={!validUserId}>
            {t('View last 30 days')}
          </Button>
        </form>
        {results}
      </CardContent>
    </Card>
  )
}
