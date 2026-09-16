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
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type { CashbackRewardPage } from '../types'
import { CashbackStatusBadge } from './cashback-status-badge'

type CashbackTableProps = {
  page: CashbackRewardPage | undefined
  isLoading: boolean
  isError: boolean
  onSelect: (rewardId: number) => void
  onPageChange: (page: number) => void
}

function formatTime(timestamp: number): string {
  return timestamp > 0 ? dayjs.unix(timestamp).format('YYYY-MM-DD HH:mm') : '—'
}

export function CashbackTable(props: CashbackTableProps) {
  const { t } = useTranslation()
  const rows = props.page?.items ?? []
  const currentPage = props.page?.page ?? 1
  const pageSize = props.page?.page_size ?? 20
  const total = props.page?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  if (props.isError) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t('Unable to load cashback rewards')}</EmptyTitle>
          <EmptyDescription>
            {t('Adjust the filters or try again.')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (!props.isLoading && rows.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>{t('No cashback rewards found')}</EmptyTitle>
          <EmptyDescription>
            {t(
              'New eligible online top-ups will appear here after payment succeeds.'
            )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className='space-y-4'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Order')}</TableHead>
            <TableHead>{t('Direction')}</TableHead>
            <TableHead>{t('Beneficiary')}</TableHead>
            <TableHead>{t('Base / rate')}</TableHead>
            <TableHead>{t('Calculated / payable')}</TableHead>
            <TableHead>{t('Risk')}</TableHead>
            <TableHead>{t('Review')}</TableHead>
            <TableHead>{t('Settlement')}</TableHead>
            <TableHead>{t('Available at')}</TableHead>
            <TableHead className='text-right'>{t('Actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.isLoading
            ? Array.from({ length: 5 }, (_, index) => (
                <TableRow key={index}>
                  <TableCell colSpan={10}>
                    <Skeleton className='h-8 w-full' />
                  </TableCell>
                </TableRow>
              ))
            : rows.map((reward) => (
                <TableRow key={reward.id}>
                  <TableCell>
                    <div
                      className='max-w-48 truncate font-mono text-xs'
                      title={reward.trade_no}
                    >
                      {reward.trade_no}
                    </div>
                    <div className='text-muted-foreground text-xs'>
                      #{reward.top_up_id}
                    </div>
                  </TableCell>
                  <TableCell>
                    {reward.direction === 'inviter'
                      ? t('Inviter')
                      : t('Invited user')}
                  </TableCell>
                  <TableCell>#{reward.beneficiary_id}</TableCell>
                  <TableCell>
                    <div>{reward.base_quota.toLocaleString()}</div>
                    <div className='text-muted-foreground text-xs'>
                      {(reward.rate_bps / 100).toFixed(2)}%
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{reward.calculated_quota.toLocaleString()}</div>
                    <div className='text-muted-foreground text-xs'>
                      {reward.reward_quota.toLocaleString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <CashbackStatusBadge
                      kind='risk'
                      value={reward.risk_level}
                    />
                  </TableCell>
                  <TableCell>
                    <CashbackStatusBadge
                      kind='review'
                      value={reward.review_status}
                    />
                  </TableCell>
                  <TableCell>
                    <CashbackStatusBadge
                      kind='settlement'
                      value={reward.settlement_status}
                    />
                  </TableCell>
                  <TableCell>{formatTime(reward.available_at)}</TableCell>
                  <TableCell className='text-right'>
                    <Button
                      type='button'
                      size='sm'
                      variant='outline'
                      onClick={() => props.onSelect(reward.id)}
                    >
                      {t('View')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <span className='text-muted-foreground text-sm'>
          {t('{{count}} rewards', { count: total.toLocaleString() })}
        </span>
        <div className='flex items-center gap-2'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={currentPage <= 1 || props.isLoading}
            onClick={() => props.onPageChange(currentPage - 1)}
          >
            {t('Previous')}
          </Button>
          <span className='text-sm tabular-nums'>
            {currentPage} / {totalPages}
          </span>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={currentPage >= totalPages || props.isLoading}
            onClick={() => props.onPageChange(currentPage + 1)}
          >
            {t('Next')}
          </Button>
        </div>
      </div>
    </div>
  )
}
