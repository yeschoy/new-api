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
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { getCashbackConfig } from '../api'
import { SettingsSection } from '../components/settings-section'
import { CashbackCampaigns } from './cashback-campaigns'
import { CashbackSettingsForm } from './cashback-settings-form'

export function CashbackSettingsSection() {
  const { t } = useTranslation()
  const query = useQuery({
    queryKey: ['cashback', 'config'],
    queryFn: async () => {
      const response = await getCashbackConfig()
      if (!response.success || !response.data) {
        throw new Error(response.message || 'Failed to load cashback settings')
      }
      return response.data
    },
  })

  if (query.isPending) {
    return (
      <SettingsSection title={t('Top-up and inviter cashback')}>
        <div aria-label={t('Loading cashback settings')} className='space-y-4'>
          <Skeleton className='h-24 w-full' />
          <Skeleton className='h-40 w-full' />
        </div>
      </SettingsSection>
    )
  }

  if (query.isError || !query.data) {
    return (
      <SettingsSection title={t('Top-up and inviter cashback')}>
        <Alert variant='destructive'>
          <AlertTitle>{t('Unable to load cashback settings')}</AlertTitle>
          <AlertDescription className='flex flex-wrap items-center justify-between gap-3'>
            <span>{t('Check the server connection and try again.')}</span>
            <Button
              type='button'
              variant='outline'
              onClick={() => query.refetch()}
            >
              {t('Retry')}
            </Button>
          </AlertDescription>
        </Alert>
      </SettingsSection>
    )
  }

  return (
    <div className='space-y-6'>
      <CashbackSettingsForm key={query.data.version} config={query.data} />
      <CashbackCampaigns />
    </div>
  )
}
