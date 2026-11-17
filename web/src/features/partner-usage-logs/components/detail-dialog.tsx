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

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatTimestamp } from '@/lib/format'

import {
  PARTNER_USAGE_LOG_TYPE_CONSUME,
  PARTNER_USAGE_LOG_TYPE_ERROR,
  type PartnerUsageLog,
} from '../types'
import { CnyAmount } from './cny-amount'

type DetailDialogProps = {
  log: PartnerUsageLog | null
  onClose: () => void
}

function withId(name: string, id: string): string {
  if (!id || id === '0') return name || '—'
  return name ? `${name} (#${id})` : `#${id}`
}

/**
 * Read-only details of one record. Every value is shown as delivered: the
 * role-shaped `other` text is not parsed (parsing would round large numbers)
 * and nothing beyond the server projection is requested.
 */
export function PartnerUsageDetailDialog({ log, onClose }: DetailDialogProps) {
  const { t } = useTranslation()
  let rows: [string, ReactNode][] = []
  if (log) {
    let typeLabel = String(log.type)
    if (log.type === PARTNER_USAGE_LOG_TYPE_CONSUME) typeLabel = t('Consume')
    if (log.type === PARTNER_USAGE_LOG_TYPE_ERROR) typeLabel = t('Error')
    rows = [
      [t('Time'), formatTimestamp(log.created_at)],
      [t('Type'), typeLabel],
      [t('Owning merchant'), withId(log.tenant_name, log.tenant_id)],
      [t('Account'), withId(log.username, log.user_id)],
      [t('Identity source'), log.identity_source || '—'],
      [t('Model'), log.model_name || '—'],
      [t('Token'), withId(log.token_name, log.token_id)],
      [t('Channel'), withId(log.channel_name, log.channel_id)],
      [t('Group'), log.group || '—'],
      [t('Subscription ID'), log.subscription_id || '—'],
      [t('Raw quota'), log.quota],
      [
        t('Amount (CNY, current rate)'),
        <CnyAmount key='cny' amount={log.quota_cny} rawQuota={log.quota} />,
      ],
      [t('Input tokens'), log.prompt_tokens],
      [t('Output tokens'), log.completion_tokens],
      [
        t('Duration'),
        `${log.use_time} ${t('s')} · ${log.is_stream ? t('Stream') : t('Non-stream')}`,
      ],
      [t('Request ID'), log.request_id || '—'],
      [t('Upstream request ID'), log.upstream_request_id || '—'],
      [t('Event ID'), log.event_id || '—'],
      [t('IP'), log.ip || '—'],
      [t('Content'), log.content || '—'],
    ]
  }
  return (
    <Dialog
      open={log !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className='max-h-[85vh] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('Merchant usage record details')}</DialogTitle>
          <DialogDescription>
            {t(
              'A display equivalent at the current rate, not a historical charge, wallet balance or plan price.'
            )}
          </DialogDescription>
        </DialogHeader>
        {log && (
          <dl className='grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]'>
            {rows.map(([label, value]) => (
              <div key={label} className='contents'>
                <dt className='text-muted-foreground'>{label}</dt>
                <dd className='min-w-0 font-mono break-all'>{value}</dd>
              </div>
            ))}
            <div className='contents'>
              <dt className='text-muted-foreground'>
                {t('Recorded metadata')}
              </dt>
              <dd className='min-w-0'>
                <pre className='bg-muted max-h-64 overflow-auto rounded-md p-2 text-xs break-all whitespace-pre-wrap'>
                  {log.other || '—'}
                </pre>
              </dd>
            </div>
          </dl>
        )}
      </DialogContent>
    </Dialog>
  )
}
