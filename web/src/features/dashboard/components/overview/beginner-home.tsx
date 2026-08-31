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
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LiquidGlassButton } from '@/components/liquid-glass'
import { Button } from '@/components/ui/button'
import { GuideDrawer } from '@/features/guide/components/guide-drawer'
import { getApiKeys } from '@/features/keys/api'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { useAuthStore } from '@/stores/auth-store'

import { BeginnerSetup } from './beginner-setup'

export type BeginnerHomeViewProps = {
  greetingName: string
  hasKey: boolean
  keyCount: number
  balanceText: string
  requestCount: number
}

export function BeginnerHomeView(props: BeginnerHomeViewProps) {
  const { t } = useTranslation()
  const [guideOpen, setGuideOpen] = useState(false)

  return (
    <div className='mx-auto flex max-w-3xl flex-col gap-10 px-1 py-6 sm:py-10'>
      <header className='max-w-2xl'>
        <p className='text-muted-foreground mb-3 text-sm tracking-wide'>
          {t('First three minutes')}
        </p>
        <h1 className='text-3xl font-semibold tracking-tight text-balance sm:text-4xl'>
          {t('Put AI into the app you already use')}
        </h1>
        <p className='text-muted-foreground mt-4 text-base leading-relaxed'>
          {t(
            'Pick a model, choose a rate group, then create a key. Paste the three fields into your software and send 你好.'
          )}
        </p>
      </header>

      <BeginnerSetup />

      <div className='flex flex-wrap gap-2'>
        <LiquidGlassButton
          glass='default'
          variant='outline'
          className='rounded-full'
          onClick={() => setGuideOpen(true)}
        >
          {t('How to fill this into an app')}
        </LiquidGlassButton>
        {props.hasKey ? (
          <Button variant='ghost' render={<Link to='/keys' />}>
            {t('Manage keys')}
          </Button>
        ) : null}
      </div>
      <GuideDrawer open={guideOpen} onOpenChange={setGuideOpen} />

      <div className='text-muted-foreground flex flex-wrap gap-x-6 gap-y-2 text-sm'>
        <Link to='/wallet' className='hover:text-foreground'>
          {t('Balance')}: {props.balanceText}
        </Link>
        <Link
          to='/usage-logs/$section'
          params={{ section: 'common' }}
          className='hover:text-foreground'
        >
          {t('Used {{count}} times', { count: props.requestCount })}
        </Link>
      </div>
    </div>
  )
}

export function BeginnerHome() {
  const user = useAuthStore((state) => state.auth.user)
  const greetingName =
    user?.display_name?.trim() || user?.username?.trim() || ''

  const apiKeysQuery = useQuery({
    queryKey: ['dashboard', 'beginner-home', 'api-keys'],
    queryFn: async () => {
      const result = await getApiKeys({ p: 1, size: 10 })
      return result.success ? (result.data?.items ?? []) : []
    },
    staleTime: 60 * 1000,
  })

  const keyCount = apiKeysQuery.data?.length ?? 0
  const hasKey = keyCount > 0
  const balanceText = formatQuotaWithCurrency(Number(user?.quota ?? 0))
  const requestCount = Number(user?.request_count ?? 0)

  const viewProps = useMemo<BeginnerHomeViewProps>(
    () => ({
      greetingName,
      hasKey,
      keyCount,
      balanceText,
      requestCount,
    }),
    [balanceText, greetingName, hasKey, keyCount, requestCount]
  )

  return <BeginnerHomeView {...viewProps} />
}
