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
import { useQueryClient } from '@tanstack/react-query'
import { RefreshCcw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'

import { CashbackDetailSheet } from './components/cashback-detail-sheet'
import { CashbackFilters } from './components/cashback-filters'
import { CashbackSummary } from './components/cashback-summary'
import { CashbackTable } from './components/cashback-table'
import { cashbackQueryKeys, useCashbackRewards } from './hooks/use-cashback'
import type { CashbackRewardFilters } from './types'

function defaultFilters(): CashbackRewardFilters {
  return {
    page: 1,
    pageSize: 20,
    tradeNo: '',
    userId: '',
    direction: '',
    reviewStatus: '',
    settlementStatus: '',
    riskLevel: '',
  }
}

export function Cashback() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [draftFilters, setDraftFilters] = useState(defaultFilters)
  const [filters, setFilters] = useState(defaultFilters)
  const [selectedRewardId, setSelectedRewardId] = useState<number | null>(null)
  const query = useCashbackRewards(filters)

  return (
    <>
      <SectionPageLayout fixedContent>
        <SectionPageLayout.Title>
          {t('Referral Cashback Review')}
        </SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <Button
            type='button'
            size='sm'
            variant='outline'
            disabled={query.isFetching}
            onClick={() =>
              queryClient.invalidateQueries({ queryKey: cashbackQueryKeys.all })
            }
          >
            <RefreshCcw data-icon='inline-start' />
            {t('Refresh')}
          </Button>
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <div className='space-y-4 pb-6'>
            <CashbackSummary />
            <CashbackFilters
              value={draftFilters}
              onChange={setDraftFilters}
              onApply={() =>
                setFilters({
                  ...draftFilters,
                  page: 1,
                  userId: draftFilters.userId.trim(),
                  tradeNo: draftFilters.tradeNo.trim(),
                })
              }
              onReset={() => {
                const reset = defaultFilters()
                setDraftFilters(reset)
                setFilters(reset)
              }}
            />
            <CashbackTable
              page={query.data}
              isLoading={query.isPending || query.isFetching}
              isError={query.isError}
              onSelect={setSelectedRewardId}
              onPageChange={(page) => setFilters({ ...filters, page })}
            />
          </div>
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <CashbackDetailSheet
        rewardId={selectedRewardId}
        open={selectedRewardId !== null}
        onOpenChange={(open) => !open && setSelectedRewardId(null)}
      />
    </>
  )
}
