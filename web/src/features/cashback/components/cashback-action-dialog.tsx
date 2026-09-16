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
import axios from 'axios'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'

import {
  useRecordCashbackIncident,
  useResolveCashbackPrincipalDebt,
  useResolveCashbackRewardDebt,
  useReviewCashbackReward,
} from '../hooks/use-cashback'
import type { CashbackIncidentKind, CashbackRewardDetail } from '../types'

export type CashbackDialogAction =
  | 'approve'
  | 'reject'
  | 'incident'
  | 'reward-debt'
  | 'principal-debt'

type CashbackActionDialogProps = {
  action: CashbackDialogAction
  detail: CashbackRewardDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CashbackActionDialog(props: CashbackActionDialogProps) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const [incidentKind, setIncidentKind] =
    useState<CashbackIncidentKind>('refund')
  const [refundPercent, setRefundPercent] = useState(
    props.detail.order.cumulative_refund_rate_bps / 100
  )
  const [evidenceRef, setEvidenceRef] = useState('')
  const reviewMutation = useReviewCashbackReward()
  const incidentMutation = useRecordCashbackIncident()
  const rewardDebtMutation = useResolveCashbackRewardDebt()
  const principalDebtMutation = useResolveCashbackPrincipalDebt()
  const isPending =
    reviewMutation.isPending ||
    incidentMutation.isPending ||
    rewardDebtMutation.isPending ||
    principalDebtMutation.isPending

  const titleMap: Record<CashbackDialogAction, string> = {
    approve: t('Approve cashback reward'),
    reject: t('Reject cashback reward'),
    incident: t('Record payment incident'),
    'reward-debt': t('Resolve reward debt'),
    'principal-debt': t('Resolve principal debt'),
  }
  const descriptionMap: Record<CashbackDialogAction, string> = {
    approve: t(
      'Approval only authorizes settlement. The configured hold period still applies.'
    ),
    reject: t('Rejected rewards remain traceable and can never be issued.'),
    incident: t(
      'This cancels or reclaims both cashback directions before reversing top-up principal.'
    ),
    'reward-debt': t(
      'Resolving debt records an explicit administrative disposition and unblocks future cashback.'
    ),
    'principal-debt': t(
      'Resolving principal debt records an explicit administrative disposition and unblocks future cashback.'
    ),
  }
  const reasonRequired =
    props.action !== 'approve' ||
    props.detail.reward.risk_level === 'high' ||
    props.detail.reward.risk_level === 'severe'
  const minimumPercent = props.detail.order.cumulative_refund_rate_bps / 100
  const incidentRateValid =
    refundPercent >= minimumPercent &&
    refundPercent <= 100 &&
    (incidentKind !== 'refund' || refundPercent > 0)
  const canSubmit =
    (!reasonRequired || reason.trim().length > 0) &&
    reason.length <= 1000 &&
    (props.action !== 'incident' ||
      (incidentRateValid && evidenceRef.length <= 1000))

  async function handleSubmit() {
    try {
      let response: { success: boolean; message: string }
      let issueError = ''
      switch (props.action) {
        case 'approve':
        case 'reject': {
          const reviewResponse = await reviewMutation.mutateAsync({
            rewardId: props.detail.reward.id,
            action: props.action,
            reason: reason.trim(),
          })
          response = reviewResponse
          issueError = reviewResponse.data?.issue_error ?? ''
          break
        }
        case 'incident':
          response = await incidentMutation.mutateAsync({
            rewardId: props.detail.reward.id,
            topUpId: props.detail.reward.top_up_id,
            kind: incidentKind,
            cumulativeRefundRateBPS:
              incidentKind === 'chargeback'
                ? 10000
                : Math.round(refundPercent * 100),
            reason: reason.trim(),
            evidenceRef: evidenceRef.trim(),
          })
          break
        case 'reward-debt':
          response = await rewardDebtMutation.mutateAsync({
            rewardId: props.detail.reward.id,
            reason: reason.trim(),
          })
          break
        case 'principal-debt':
          response = await principalDebtMutation.mutateAsync({
            rewardId: props.detail.reward.id,
            topUpId: props.detail.reward.top_up_id,
            reason: reason.trim(),
          })
          break
      }
      if (!response.success) {
        throw new Error(response.message || 'Cashback operation failed')
      }
      if (issueError) {
        toast.warning(`${t('Cashback operation completed')}: ${issueError}`)
      } else {
        toast.success(t('Cashback operation completed'))
      }
      props.onOpenChange(false)
    } catch (error: unknown) {
      let message: string | undefined
      if (axios.isAxiosError(error)) {
        const payload = error.response?.data as
          | {
              code?: string
              message?: string
              blocking_reason?: string
            }
          | undefined
        if (payload?.code === 'CASHBACK_HARD_BLOCKED') {
          message = t('Cashback is blocked: {{reason}}', {
            reason: payload.blocking_reason
              ? t(payload.blocking_reason)
              : t('Unknown blocking reason'),
          })
        } else if (payload?.code === 'CASHBACK_REASON_REQUIRED') {
          message = t('A reason is required for this cashback action.')
        } else if (payload?.code === 'CASHBACK_REFUND_RATE_INVALID') {
          message = t('Refund percentage is invalid.')
        } else if (payload?.code === 'CASHBACK_STATE_CONFLICT') {
          message = t('Cashback state changed. Refresh and try again.')
        } else {
          message = payload?.message
        }
      } else if (error instanceof Error) {
        message = error.message
      }
      toast.error(message || t('Cashback operation failed'))
    }
  }

  const incidentOptions = [
    { value: 'refund', label: t('Refund') },
    { value: 'chargeback', label: t('Chargeback') },
    { value: 'dispute', label: t('Dispute') },
  ]

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{titleMap[props.action]}</DialogTitle>
          <DialogDescription>{descriptionMap[props.action]}</DialogDescription>
        </DialogHeader>

        {props.action === 'incident' && (
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='cashback-incident-kind'>
                {t('Incident type')}
              </Label>
              <Select
                items={incidentOptions}
                value={incidentKind}
                onValueChange={(value) => {
                  if (!value) return
                  const kind = value as CashbackIncidentKind
                  setIncidentKind(kind)
                  if (kind === 'chargeback') setRefundPercent(100)
                }}
              >
                <SelectTrigger id='cashback-incident-kind' className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {incidentOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='cashback-refund-percent'>
                {t('Cumulative refund percentage')}
              </Label>
              <Input
                id='cashback-refund-percent'
                type='number'
                min={minimumPercent}
                max={100}
                step={0.01}
                disabled={incidentKind === 'chargeback'}
                value={refundPercent}
                aria-invalid={!incidentRateValid}
                aria-describedby={
                  incidentRateValid
                    ? undefined
                    : 'cashback-refund-percent-error'
                }
                onChange={(event) =>
                  setRefundPercent(event.target.valueAsNumber || 0)
                }
              />
              {!incidentRateValid && (
                <p
                  id='cashback-refund-percent-error'
                  className='text-destructive text-xs'
                >
                  {t('Refund percentage cannot decrease or exceed 100%.')}
                </p>
              )}
            </div>
            <div className='space-y-2 sm:col-span-2'>
              <Label htmlFor='cashback-evidence-reference'>
                {t('Evidence reference (optional)')}
              </Label>
              <Input
                id='cashback-evidence-reference'
                maxLength={1000}
                value={evidenceRef}
                onChange={(event) => setEvidenceRef(event.target.value)}
              />
            </div>
          </div>
        )}

        <div className='space-y-2'>
          <Label htmlFor='cashback-action-reason'>
            {reasonRequired ? t('Reason') : t('Reason (optional)')}
          </Label>
          <Textarea
            id='cashback-action-reason'
            value={reason}
            maxLength={1000}
            aria-required={reasonRequired}
            aria-invalid={reasonRequired && reason.trim().length === 0}
            aria-describedby={
              reasonRequired && reason.trim().length === 0
                ? 'cashback-action-reason-error'
                : undefined
            }
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('Record the evidence and decision rationale')}
          />
          {reasonRequired && reason.trim().length === 0 && (
            <p
              id='cashback-action-reason-error'
              className='text-destructive text-xs'
            >
              {t('A reason is required for this cashback action.')}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            disabled={isPending}
            onClick={() => props.onOpenChange(false)}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='button'
            variant={props.action === 'approve' ? 'default' : 'destructive'}
            disabled={!canSubmit || isPending}
            onClick={() => void handleSubmit()}
          >
            {isPending && <Spinner data-icon='inline-start' />}
            {t('Confirm action')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
