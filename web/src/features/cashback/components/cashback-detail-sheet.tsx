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
import dayjs from 'dayjs'
import type { TFunction } from 'i18next'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'

import { useCashbackReward } from '../hooks/use-cashback'
import {
  CashbackActionDialog,
  type CashbackDialogAction,
} from './cashback-action-dialog'
import { CashbackStatusBadge } from './cashback-status-badge'

type CashbackDetailSheetProps = {
  rewardId: number | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatTime(timestamp: number): string {
  return timestamp > 0
    ? dayjs.unix(timestamp).format('YYYY-MM-DD HH:mm:ss')
    : '—'
}

function formatCapReason(reason: string, t: TFunction): string {
  if (!reason) return '—'
  return reason
    .split(',')
    .filter(Boolean)
    .map((item) => t(item))
    .join(', ')
}

function formatBlockingReason(reason: string, t: TFunction): string {
  if (!reason) return '—'
  if (reason.startsWith('payment_incident:')) {
    const kind = reason.slice('payment_incident:'.length)
    return t('Payment incident: {{kind}}', { kind: t(kind) })
  }
  return t(reason)
}

function formatDisposition(
  timestamp: number,
  operatorId: number,
  reason: string
): string {
  const parts = [formatTime(timestamp)]
  if (operatorId > 0) {
    parts.push(`#${operatorId}`)
  }
  if (reason) {
    parts.push(reason)
  }
  return parts.join(' · ')
}

function riskCount(
  snapshot: Record<string, unknown>,
  key: string
): string | number {
  const value = snapshot[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : '—'
}

function DetailRow(props: { label: string; value: string | number }) {
  return (
    <div className='grid grid-cols-[minmax(8rem,0.8fr)_minmax(0,1.2fr)] gap-3 py-1.5'>
      <dt className='text-muted-foreground'>{props.label}</dt>
      <dd className='text-right font-medium break-all'>{props.value}</dd>
    </div>
  )
}

export function CashbackDetailSheet(props: CashbackDetailSheetProps) {
  const { t } = useTranslation()
  const query = useCashbackReward(props.open ? props.rewardId : null)
  const [action, setAction] = useState<CashbackDialogAction | null>(null)
  const detail = query.data
  let reviewSource = '—'
  if (detail?.reward.review_source === 'automatic') {
    reviewSource = t('Automatic review')
  } else if (
    detail?.reward.review_source === 'manual' ||
    (detail?.reward.reviewed_by ?? 0) > 0
  ) {
    reviewSource = t('Manual review')
  }

  return (
    <>
      <Sheet
        open={props.open}
        onOpenChange={(open) => {
          if (!open) setAction(null)
          props.onOpenChange(open)
        }}
      >
        <SheetContent className='w-full sm:max-w-2xl'>
          <SheetHeader>
            <SheetTitle>{t('Cashback reward details')}</SheetTitle>
            <SheetDescription>
              {t(
                'Sensitive IP and device access is recorded in the audit log.'
              )}
            </SheetDescription>
          </SheetHeader>
          <ScrollArea className='min-h-0 flex-1 px-4 pb-6'>
            {query.isPending && (
              <div
                aria-label={t('Loading cashback details')}
                className='space-y-3'
              >
                <Skeleton className='h-28 w-full' />
                <Skeleton className='h-48 w-full' />
              </div>
            )}
            {query.isError && (
              <Alert variant='destructive'>
                <AlertTitle>{t('Unable to load cashback details')}</AlertTitle>
                <AlertDescription>
                  {t('Close the panel and try again.')}
                </AlertDescription>
              </Alert>
            )}
            {detail && (
              <div className='space-y-5'>
                <div className='flex flex-wrap gap-2'>
                  <CashbackStatusBadge
                    kind='review'
                    value={detail.reward.review_status}
                  />
                  <CashbackStatusBadge
                    kind='settlement'
                    value={detail.reward.settlement_status}
                  />
                  <CashbackStatusBadge
                    kind='risk'
                    value={detail.reward.risk_level}
                  />
                </div>

                <section aria-labelledby='cashback-detail-financial'>
                  <h3 id='cashback-detail-financial' className='font-semibold'>
                    {t('Reward and order')}
                  </h3>
                  <dl className='divide-y'>
                    <DetailRow
                      label={t('Reward ID')}
                      value={detail.reward.id}
                    />
                    <DetailRow
                      label={t('Top-up ID')}
                      value={detail.reward.top_up_id}
                    />
                    <DetailRow
                      label={t('Order number')}
                      value={detail.reward.trade_no}
                    />
                    <DetailRow
                      label={t('Provider')}
                      value={detail.order.payment_provider || '—'}
                    />
                    <DetailRow
                      label={t('Direction')}
                      value={t(
                        detail.reward.direction === 'inviter'
                          ? 'Inviter'
                          : 'Top-up payer'
                      )}
                    />
                    <DetailRow
                      label={t('Campaign ID')}
                      value={
                        detail.order.campaign_id > 0
                          ? `#${detail.order.campaign_id}`
                          : '—'
                      }
                    />
                    <DetailRow
                      label={t('Face value quota')}
                      value={detail.reward.base_quota.toLocaleString()}
                    />
                    <DetailRow
                      label={t('Cashback rate')}
                      value={`${(detail.reward.rate_bps / 100).toFixed(2)}%`}
                    />
                    <DetailRow
                      label={t('Calculated reward')}
                      value={detail.reward.calculated_quota.toLocaleString()}
                    />
                    <DetailRow
                      label={t('Payable reward')}
                      value={detail.reward.reward_quota.toLocaleString()}
                    />
                    <DetailRow
                      label={t('Cap reason')}
                      value={formatCapReason(detail.reward.cap_reason, t)}
                    />
                    <DetailRow
                      label={t('Actually credited top-up quota')}
                      value={detail.order.credited_quota.toLocaleString()}
                    />
                    <DetailRow
                      label={t('Available at')}
                      value={formatTime(detail.reward.available_at)}
                    />
                  </dl>
                </section>

                <Separator />
                <section aria-labelledby='cashback-detail-relationship'>
                  <h3
                    id='cashback-detail-relationship'
                    className='font-semibold'
                  >
                    {t('Referral relationship')}
                  </h3>
                  <dl className='divide-y'>
                    <DetailRow
                      label={t('Top-up payer')}
                      value={`${detail.invitee_username || '—'} (#${detail.reward.invitee_id})`}
                    />
                    <DetailRow
                      label={t('Inviter')}
                      value={`${detail.inviter_username || '—'} (#${detail.reward.inviter_id})`}
                    />
                    <DetailRow
                      label={t('Beneficiary')}
                      value={`${detail.beneficiary_username || '—'} (#${detail.reward.beneficiary_id})`}
                    />
                  </dl>
                </section>

                <Separator />
                <section aria-labelledby='cashback-detail-risk'>
                  <h3 id='cashback-detail-risk' className='font-semibold'>
                    {t('Risk evidence')}
                  </h3>
                  <div className='my-2 flex flex-wrap gap-1.5'>
                    {detail.reward.risk_flags.length > 0 ? (
                      detail.reward.risk_flags.map((flag) => (
                        <Badge key={flag} variant='outline'>
                          {t(flag)}
                        </Badge>
                      ))
                    ) : (
                      <span className='text-muted-foreground text-sm'>
                        {t('No risk flags')}
                      </span>
                    )}
                  </div>
                  <dl className='divide-y'>
                    <DetailRow
                      label={t('Full request IP')}
                      value={detail.order.request_ip || '—'}
                    />
                    <DetailRow
                      label={t('Device signal status')}
                      value={t(detail.order.device_signal_status || 'missing')}
                    />
                    <DetailRow
                      label={t('Device fingerprint hash')}
                      value={detail.order.device_fingerprint_hash || '—'}
                    />
                    <DetailRow
                      label={t('IP-associated accounts')}
                      value={riskCount(
                        detail.risk_snapshot,
                        'ip_associated_account_count'
                      )}
                    />
                    <DetailRow
                      label={t('Device-associated accounts')}
                      value={riskCount(
                        detail.risk_snapshot,
                        'device_associated_account_count'
                      )}
                    />
                    <DetailRow
                      label={t('Recent devices')}
                      value={riskCount(
                        detail.risk_snapshot,
                        'recent_device_count'
                      )}
                    />
                    <DetailRow
                      label={t('User-Agent hash')}
                      value={detail.order.request_user_agent_hash || '—'}
                    />
                    <DetailRow
                      label={t('Completion source')}
                      value={
                        detail.order.completion_source
                          ? t(detail.order.completion_source)
                          : '—'
                      }
                    />
                    <DetailRow
                      label={t('Blocking reason')}
                      value={formatBlockingReason(
                        detail.reward.blocking_reason,
                        t
                      )}
                    />
                    {detail.reward.last_settlement_error && (
                      <DetailRow
                        label={t('Error')}
                        value={detail.reward.last_settlement_error}
                      />
                    )}
                  </dl>
                </section>

                <Separator />
                <section aria-labelledby='cashback-detail-compensation'>
                  <h3
                    id='cashback-detail-compensation'
                    className='font-semibold'
                  >
                    {t('Incident and recovery')}
                  </h3>
                  <dl className='divide-y'>
                    <DetailRow
                      label={t('Incident type')}
                      value={
                        detail.order.incident_kind
                          ? t(detail.order.incident_kind)
                          : '—'
                      }
                    />
                    {detail.order.incident_reason && (
                      <DetailRow
                        label={t('Reason')}
                        value={detail.order.incident_reason}
                      />
                    )}
                    {detail.order.incident_evidence_ref && (
                      <DetailRow
                        label={t('Evidence reference (optional)')}
                        value={detail.order.incident_evidence_ref}
                      />
                    )}
                    <DetailRow
                      label={t('Cumulative refund percentage')}
                      value={`${(detail.order.cumulative_refund_rate_bps / 100).toFixed(2)}%`}
                    />
                    <DetailRow
                      label={t('Reward recovered')}
                      value={detail.reward.recovered_quota.toLocaleString()}
                    />
                    <DetailRow
                      label={t('Reward debt')}
                      value={detail.reward.outstanding_debt_quota.toLocaleString()}
                    />
                    <DetailRow
                      label={t('Principal reversal target')}
                      value={detail.order.principal_reversal_target_quota.toLocaleString()}
                    />
                    <DetailRow
                      label={t('Principal recovered')}
                      value={detail.order.principal_recovered_quota.toLocaleString()}
                    />
                    <DetailRow
                      label={t('Principal debt')}
                      value={detail.order.principal_outstanding_debt_quota.toLocaleString()}
                    />
                  </dl>
                </section>

                <Separator />
                <section aria-labelledby='cashback-detail-timeline'>
                  <h3 id='cashback-detail-timeline' className='font-semibold'>
                    {t('Timeline')}
                  </h3>
                  <dl className='divide-y'>
                    <DetailRow
                      label={t('Paid at')}
                      value={formatTime(detail.reward.paid_at)}
                    />
                    <DetailRow
                      label={t('Review source')}
                      value={reviewSource}
                    />
                    {detail.reward.reviewed_at > 0 && (
                      <DetailRow
                        label={t('Review')}
                        value={formatDisposition(
                          detail.reward.reviewed_at,
                          detail.reward.reviewed_by,
                          detail.reward.review_reason
                        )}
                      />
                    )}
                    <DetailRow
                      label={t('Issued at')}
                      value={formatTime(detail.reward.issued_at)}
                    />
                    <DetailRow
                      label={t('Incident reported at')}
                      value={formatTime(detail.order.incident_reported_at)}
                    />
                    {detail.reward.debt_resolved_at > 0 && (
                      <DetailRow
                        label={t('Resolve reward debt')}
                        value={formatDisposition(
                          detail.reward.debt_resolved_at,
                          detail.reward.debt_resolved_by,
                          detail.reward.debt_resolution_reason
                        )}
                      />
                    )}
                    {detail.order.principal_debt_resolved_at > 0 && (
                      <DetailRow
                        label={t('Resolve principal debt')}
                        value={formatDisposition(
                          detail.order.principal_debt_resolved_at,
                          detail.order.principal_debt_resolved_by,
                          detail.order.principal_debt_resolution_reason
                        )}
                      />
                    )}
                    {detail.reward.next_settlement_attempt_at > 0 && (
                      <DetailRow
                        label={t('Next settlement attempt')}
                        value={formatTime(
                          detail.reward.next_settlement_attempt_at
                        )}
                      />
                    )}
                  </dl>
                </section>

                <details className='rounded-lg border p-3'>
                  <summary className='cursor-pointer font-medium'>
                    {t('Configuration and risk snapshots')}
                  </summary>
                  <div className='mt-3 grid gap-3'>
                    <pre className='bg-muted max-h-64 overflow-auto rounded-md p-3 text-xs'>
                      {JSON.stringify(detail.config_snapshot, null, 2)}
                    </pre>
                    <pre className='bg-muted max-h-64 overflow-auto rounded-md p-3 text-xs'>
                      {JSON.stringify(detail.risk_snapshot, null, 2)}
                    </pre>
                  </div>
                </details>

                <div className='flex flex-wrap gap-2'>
                  {detail.reward.review_status === 'pending' &&
                    detail.reward.settlement_status === 'frozen' &&
                    detail.reward.reward_quota > 0 && (
                      <>
                        <Button
                          type='button'
                          onClick={() => setAction('approve')}
                        >
                          {t('Approve')}
                        </Button>
                        <Button
                          type='button'
                          variant='destructive'
                          onClick={() => setAction('reject')}
                        >
                          {t('Reject')}
                        </Button>
                      </>
                    )}
                  <Button
                    type='button'
                    variant='outline'
                    onClick={() => setAction('incident')}
                  >
                    {t('Record incident')}
                  </Button>
                  {detail.reward.outstanding_debt_quota > 0 && (
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() => setAction('reward-debt')}
                    >
                      {t('Resolve reward debt')}
                    </Button>
                  )}
                  {detail.order.principal_outstanding_debt_quota > 0 && (
                    <Button
                      type='button'
                      variant='outline'
                      onClick={() => setAction('principal-debt')}
                    >
                      {t('Resolve principal debt')}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {detail && action && (
        <CashbackActionDialog
          key={`${detail.reward.id}-${action}`}
          action={action}
          detail={detail}
          open
          onOpenChange={(open) => !open && setAction(null)}
        />
      )}
    </>
  )
}
