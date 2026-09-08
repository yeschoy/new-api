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
import {
  ComputerProtectionIcon,
  RefreshIcon,
  ShieldUserIcon,
  UserAccountIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Main } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useAuthStore } from '@/stores/auth-store'

import {
  decideOAuthAuthorization,
  getOAuthAuthorizationRequest,
  type OAuthClientScope,
  validateOAuthLoopbackRedirect,
} from './api'

interface OAuthClientAuthorizationProps {
  requestToken: string
}

export function OAuthClientAuthorization(props: OAuthClientAuthorizationProps) {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const [unsafeRedirect, setUnsafeRedirect] = useState(false)
  const requestQuery = useQuery({
    queryKey: ['oauth-client-authorization', props.requestToken],
    queryFn: () => getOAuthAuthorizationRequest(props.requestToken),
    retry: false,
  })
  const decisionMutation = useMutation({
    mutationFn: (decision: 'approve' | 'deny') =>
      decideOAuthAuthorization(props.requestToken, decision),
    onSuccess: (result) => {
      const callback = validateOAuthLoopbackRedirect(result.redirect_to)
      if (!callback) {
        setUnsafeRedirect(true)
        return
      }
      const link = document.createElement('a')
      link.href = callback
      link.rel = 'noreferrer'
      link.referrerPolicy = 'no-referrer'
      link.click()
    },
  })

  useEffect(() => {
    const current = new URL(window.location.href)
    if (!current.searchParams.has('request')) return
    current.searchParams.delete('request')
    window.history.replaceState(null, '', current.pathname + current.search)
  }, [])

  let content: React.ReactNode
  if (requestQuery.isLoading) {
    content = (
      <div
        className='flex flex-col gap-4'
        aria-label={t('Loading authorization request')}
      >
        <Skeleton className='h-5 w-2/3' />
        <Skeleton className='h-16 w-full' />
        <Skeleton className='h-28 w-full' />
      </div>
    )
  } else if (requestQuery.isError || !requestQuery.data) {
    content = (
      <Alert variant='destructive'>
        <HugeiconsIcon icon={ComputerProtectionIcon} strokeWidth={2} />
        <AlertTitle>
          {t('This authorization request is unavailable')}
        </AlertTitle>
        <AlertDescription>
          {t('Return to the desktop app and start authorization again.')}
        </AlertDescription>
      </Alert>
    )
  } else {
    const displayName =
      user?.display_name || user?.username || t('Unknown account')
    const failed = unsafeRedirect || decisionMutation.isError
    content = (
      <div className='flex flex-col gap-6'>
        <div className='flex flex-col gap-1'>
          <p className='text-muted-foreground text-xs font-medium tracking-[0.16em] uppercase'>
            {t('Current account')}
          </p>
          <p className='text-base font-semibold'>{displayName}</p>
          {user?.username && user.username !== displayName ? (
            <p className='text-muted-foreground text-sm'>@{user.username}</p>
          ) : null}
        </div>

        <Separator />

        <div className='flex flex-col gap-3'>
          <p className='text-sm font-semibold'>{t('Requested permissions')}</p>
          <ul className='flex flex-col gap-3'>
            {requestQuery.data.scopes.map((scope) => (
              <ScopeItem key={scope} scope={scope} />
            ))}
          </ul>
        </div>

        <Alert>
          <HugeiconsIcon icon={ComputerProtectionIcon} strokeWidth={2} />
          <AlertTitle>{t('Your credentials stay private')}</AlertTitle>
          <AlertDescription>
            {t('Authorization does not reveal your password or API key.')}
          </AlertDescription>
        </Alert>

        {failed ? (
          <Alert variant='destructive'>
            <HugeiconsIcon icon={ComputerProtectionIcon} strokeWidth={2} />
            <AlertTitle>{t('Could not return to the desktop app')}</AlertTitle>
            <AlertDescription>
              {t(
                'No additional access was granted. Start authorization again from the desktop app.'
              )}
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    )
  }

  const ready = Boolean(requestQuery.data) && !requestQuery.isError
  return (
    <Main className='overflow-auto'>
      <div className='relative flex min-h-full items-center justify-center overflow-hidden px-4 py-10 sm:px-8'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_48%)]'
        />
        <Card className='animate-in fade-in slide-in-from-bottom-2 relative w-full max-w-xl duration-300'>
          <CardHeader>
            <div className='bg-primary/10 text-primary mb-3 flex size-12 items-center justify-center rounded-xl'>
              <HugeiconsIcon
                icon={ComputerProtectionIcon}
                className='size-6'
                strokeWidth={2}
              />
            </div>
            <CardTitle>{t('Authorize desktop connection')}</CardTitle>
            <CardDescription>
              {requestQuery.data?.client_name || t('Desktop client')}{' '}
              {t('is requesting access to your New API account.')}
            </CardDescription>
            {requestQuery.data ? (
              <p className='text-muted-foreground text-xs'>
                {requestQuery.data.client_id}
              </p>
            ) : null}
          </CardHeader>
          <CardContent aria-live='polite'>{content}</CardContent>
          <CardFooter className='flex flex-col-reverse gap-3 sm:flex-row'>
            <Button
              type='button'
              variant='outline'
              size='lg'
              className='w-full sm:flex-1'
              disabled={!ready || decisionMutation.isPending}
              onClick={() => decisionMutation.mutate('deny')}
            >
              {t('Do not authorize')}
            </Button>
            <Button
              type='button'
              size='lg'
              className='w-full sm:flex-1'
              disabled={!ready || decisionMutation.isPending}
              onClick={() => decisionMutation.mutate('approve')}
            >
              {decisionMutation.isPending ? (
                <Spinner data-icon='inline-start' aria-hidden='true' />
              ) : null}
              {decisionMutation.isPending
                ? t('Authorizing...')
                : t('Authorize')}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </Main>
  )
}

function ScopeItem(props: { scope: OAuthClientScope }) {
  const { t } = useTranslation()
  let icon = UserAccountIcon
  let label = t('Read your basic account profile')
  if (props.scope === 'offline_access') {
    icon = RefreshIcon
    label = t('Keep this client signed in')
  } else if (props.scope === 'sessions') {
    icon = ShieldUserIcon
    label = t("View and revoke this client's authorized devices")
  }
  return (
    <li className='flex items-center gap-3'>
      <span className='bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg'>
        <HugeiconsIcon icon={icon} strokeWidth={2} aria-hidden='true' />
      </span>
      <span className='text-sm'>{label}</span>
    </li>
  )
}
