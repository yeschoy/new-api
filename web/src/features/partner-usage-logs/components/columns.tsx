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
import type { ColumnDef } from '@tanstack/react-table'
import type { TFunction } from 'i18next'

import { TruncatedCell } from '@/components/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatTimestamp } from '@/lib/format'

import {
  PARTNER_USAGE_LOG_TYPE_CONSUME,
  PARTNER_USAGE_LOG_TYPE_ERROR,
  type PartnerUsageLog,
} from '../types'
import { CnyAmount } from './cny-amount'

function knownId(id: string): string {
  return id && id !== '0' ? `#${id}` : ''
}

/**
 * Columns of the merchant usage table. IDs, quota and token counts are the
 * server's decimal strings and are rendered as text, never as numbers.
 */
export function buildPartnerUsageColumns(
  t: TFunction,
  onOpenDetails: (log: PartnerUsageLog) => void
): ColumnDef<PartnerUsageLog>[] {
  return [
    {
      accessorKey: 'created_at',
      header: t('Time'),
      cell: ({ row }) => formatTimestamp(row.original.created_at),
      meta: { label: t('Time'), mobileTitle: true },
    },
    {
      accessorKey: 'tenant_name',
      header: t('Owning merchant'),
      cell: ({ row }) => {
        const { tenant_id: id, tenant_name: name } = row.original
        // The name is the snapshot frozen at write time; without one the
        // raw ID is shown instead of a guessed name.
        return (
          <div className='min-w-0'>
            <TruncatedCell className='max-w-40'>
              {name || t('Merchant #{{id}}', { id })}
            </TruncatedCell>
            {name && (
              <div className='text-muted-foreground font-mono text-xs'>
                {knownId(id)}
              </div>
            )}
          </div>
        )
      },
      meta: { label: t('Owning merchant') },
    },
    {
      accessorKey: 'username',
      header: t('Account'),
      cell: ({ row }) => (
        <div className='min-w-0'>
          <TruncatedCell className='max-w-40'>
            {row.original.username || '—'}
          </TruncatedCell>
          <div className='text-muted-foreground font-mono text-xs'>
            {knownId(row.original.user_id)}
          </div>
        </div>
      ),
      meta: { label: t('Account') },
    },
    {
      accessorKey: 'model_name',
      header: t('Model'),
      cell: ({ row }) => (
        <TruncatedCell className='max-w-48 font-mono'>
          {row.original.model_name || '—'}
        </TruncatedCell>
      ),
      meta: { label: t('Model') },
    },
    {
      accessorKey: 'type',
      header: t('Type'),
      cell: ({ row }) => {
        const { type } = row.original
        if (type === PARTNER_USAGE_LOG_TYPE_CONSUME) {
          return <Badge variant='secondary'>{t('Consume')}</Badge>
        }
        if (type === PARTNER_USAGE_LOG_TYPE_ERROR) {
          return <Badge variant='destructive'>{t('Error')}</Badge>
        }
        return <Badge variant='outline'>{String(type)}</Badge>
      },
      meta: { label: t('Type') },
    },
    {
      id: 'tokens',
      header: t('Tokens'),
      cell: ({ row }) => (
        <span className='font-mono tabular-nums'>
          <span title={t('Input tokens')}>{row.original.prompt_tokens}</span>
          {' / '}
          <span title={t('Output tokens')}>
            {row.original.completion_tokens}
          </span>
        </span>
      ),
      meta: { label: t('Tokens') },
    },
    {
      accessorKey: 'quota',
      header: t('Quota'),
      cell: ({ row }) => (
        <div className='tabular-nums'>
          <CnyAmount
            amount={row.original.quota_cny}
            rawQuota={row.original.quota}
          />
          <div
            className='text-muted-foreground font-mono text-xs'
            title={t('Raw quota')}
          >
            {row.original.quota}
          </div>
        </div>
      ),
      meta: { label: t('Quota') },
    },
    {
      accessorKey: 'use_time',
      header: t('Duration'),
      cell: ({ row }) => (
        <span className='tabular-nums'>
          {row.original.use_time} {t('s')} ·{' '}
          {row.original.is_stream ? t('Stream') : t('Non-stream')}
        </span>
      ),
      meta: { label: t('Duration') },
    },
    {
      accessorKey: 'request_id',
      header: t('Request ID'),
      cell: ({ row }) => (
        <TruncatedCell className='max-w-40 font-mono'>
          {row.original.request_id || '—'}
        </TruncatedCell>
      ),
      meta: { label: t('Request ID') },
    },
    {
      id: 'details',
      header: t('Details'),
      cell: ({ row }) => (
        <Button
          variant='outline'
          size='sm'
          onClick={() => onOpenDetails(row.original)}
        >
          {t('Details')}
        </Button>
      ),
      meta: { label: t('Details') },
    },
  ]
}
