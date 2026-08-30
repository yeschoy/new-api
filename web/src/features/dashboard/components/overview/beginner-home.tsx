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
import { Link, type LinkProps } from '@tanstack/react-router'
import { ArrowRight, FileText, Key, Wallet } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FieldBackdrop } from '@/features/guide/components/field-backdrop'
import { GuideDrawer } from '@/features/guide/components/guide-drawer'
import { StarterKitCard } from '@/features/guide/components/starter-kit-card'
import { getApiKeys } from '@/features/keys/api'
import { formatQuotaWithCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

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
    <div className='relative mx-auto flex max-w-5xl flex-col gap-8 overflow-hidden rounded-3xl px-4 py-6 sm:px-6 sm:py-8'>
      <FieldBackdrop />
      <header className='relative max-w-2xl min-w-0'>
        <h1 className='font-serif text-3xl tracking-tight break-words sm:text-4xl'>
          {props.greetingName
            ? t('Hello, {{name}}', { name: props.greetingName })
            : t('Hello')}
        </h1>
        <p className='text-muted-foreground mt-3 text-base leading-relaxed'>
          {t(
            'Today you only need three steps: create a key, copy the address, then send 你好 in your app.'
          )}
        </p>
      </header>

      <StarterKitCard />

      <div className='flex flex-wrap items-center gap-3'>
        <Button
          size='lg'
          className='h-12 rounded-xl px-5'
          render={<Link to='/keys' />}
        >
          {props.hasKey ? t('Manage keys') : t('Create your first key')}
          <ArrowRight className='size-4' />
        </Button>
        <Button
          size='lg'
          variant='ghost'
          className='h-12 rounded-xl px-5'
          onClick={() => setGuideOpen(true)}
        >
          {t('How to fill this into an app')}
        </Button>
      </div>
      <GuideDrawer open={guideOpen} onOpenChange={setGuideOpen} />

      <div className='grid gap-3 sm:grid-cols-3'>
        <StatusCard
          icon={<Key className='size-4' aria-hidden='true' />}
          label={t('My API Keys')}
          value={
            props.hasKey
              ? t('You have {{count}} keys', { count: props.keyCount })
              : t('You do not have a key yet')
          }
          to='/keys'
          tone={props.hasKey ? 'ready' : 'todo'}
        />
        <StatusCard
          icon={<Wallet className='size-4' aria-hidden='true' />}
          label={t('Balance')}
          value={props.balanceText}
          to='/wallet'
          action={t('Add balance')}
        />
        <StatusCard
          icon={<FileText className='size-4' aria-hidden='true' />}
          label={t('Usage')}
          value={t('Used {{count}} times', { count: props.requestCount })}
          to='/usage-logs/$section'
          params={{ section: 'common' }}
        />
      </div>
    </div>
  )
}

function StatusCard(props: {
  icon: ReactNode
  label: string
  value: string
  to: LinkProps['to']
  params?: LinkProps['params']
  action?: string
  tone?: 'ready' | 'todo'
}) {
  return (
    <Link
      to={props.to}
      params={props.params}
      className={cn(
        'bg-card/90 hover:border-primary/40 block rounded-2xl border p-4 transition-colors',
        props.tone === 'todo' && 'border-primary/30 bg-primary/5'
      )}
    >
      <div className='text-muted-foreground flex items-center gap-2 text-xs font-medium'>
        {props.icon}
        <span>{props.label}</span>
      </div>
      <div className='mt-2 text-sm font-medium'>{props.value}</div>
      {props.action ? (
        <div className='text-primary mt-2 text-xs'>{props.action}</div>
      ) : null}
    </Link>
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
