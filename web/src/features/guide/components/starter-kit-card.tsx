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
import { Link } from '@tanstack/react-router'
import { Box, Key, Link2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import {
  ADDRESS_KIND_HINT_KEYS,
  ADDRESS_KIND_LABEL_KEYS,
  ROUTE_HINT_KEYS,
  ROUTE_LABEL_KEYS,
} from '../constants'
import {
  getAddressValue,
  getRouteAddresses,
  matchOfficialRoute,
  visibleRouteIds,
} from '../lib/endpoints'
import type { AddressKind, RouteId } from '../types'

type StarterKitCardProps = {
  className?: string
  origin?: string
  compact?: boolean
}

function currentOrigin(): string {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}

export function StarterKitCard(props: StarterKitCardProps) {
  const { t } = useTranslation()
  const isAuthenticated = !!useAuthStore((state) => state.auth.user)
  const origin = props.origin ?? currentOrigin()
  const routeOptions = visibleRouteIds(origin)
  const [routeId, setRouteId] = useState<RouteId>(() =>
    matchOfficialRoute(origin)
  )
  const [addressKind, setAddressKind] = useState<AddressKind>('baseUrl')

  const addresses = useMemo(
    () => getRouteAddresses(routeId, origin),
    [origin, routeId]
  )
  const addressValue = getAddressValue(addresses, addressKind)

  return (
    <section
      data-starter-kit
      className={cn(
        'yecao-kit relative overflow-hidden rounded-2xl p-px shadow-[0_0_40px_-18px_color-mix(in_oklch,var(--primary)_70%,transparent)]',
        props.className
      )}
    >
      <div
        className={cn(
          'bg-card/95 relative z-10 rounded-[inherit] backdrop-blur-xl',
          props.compact ? 'p-4' : 'p-5 sm:p-6'
        )}
      >
        <div className='flex flex-col gap-1'>
          <p className='text-primary text-xs font-medium'>
            {t('The only three fields')}
          </p>
          <h2
            className={cn(
              'font-serif tracking-tight',
              props.compact ? 'text-xl' : 'text-2xl sm:text-3xl'
            )}
          >
            {t('Key, address, model')}
          </h2>
          <p className='text-muted-foreground mt-1 max-w-2xl text-sm leading-relaxed'>
            {t('Fill these three things into the app you already use.')}
          </p>
        </div>

        <div
          className='mt-5 flex flex-wrap gap-2'
          role='radiogroup'
          aria-label={t('Network line')}
        >
          {routeOptions.map((id) => {
            const selected = routeId === id
            return (
              <button
                key={id}
                type='button'
                role='radio'
                aria-checked={selected}
                data-route={id}
                onClick={() => setRouteId(id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm transition-colors',
                  selected
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground'
                )}
              >
                {t(ROUTE_LABEL_KEYS[id])}
              </button>
            )
          })}
        </div>
        <p className='text-muted-foreground mt-2 text-xs'>
          {t(ROUTE_HINT_KEYS[routeId])}
        </p>

        <div
          className='mt-4 flex flex-wrap gap-2'
          role='radiogroup'
          aria-label={t('Address box type')}
        >
          {(Object.keys(ADDRESS_KIND_LABEL_KEYS) as AddressKind[]).map(
            (kind) => {
              const selected = addressKind === kind
              return (
                <button
                  key={kind}
                  type='button'
                  role='radio'
                  aria-checked={selected}
                  data-address-kind={kind}
                  onClick={() => setAddressKind(kind)}
                  className={cn(
                    'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                    selected
                      ? 'border-primary/40 bg-primary/10 text-foreground'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t(ADDRESS_KIND_LABEL_KEYS[kind])}
                </button>
              )
            }
          )}
        </div>
        <p className='text-muted-foreground mt-2 text-xs'>
          {t(ADDRESS_KIND_HINT_KEYS[addressKind])}
        </p>

        <div className='mt-5 grid gap-3'>
          <KitField
            icon={<Link2 className='size-4' aria-hidden='true' />}
            label={t(ADDRESS_KIND_LABEL_KEYS[addressKind])}
            value={addressValue}
            hint={t('Never paste Base URL and Full URL into the same box.')}
          />
          <KitField
            icon={<Key className='size-4' aria-hidden='true' />}
            label={t('API Key')}
            value='sk-...'
            copyValue=''
            hint={
              isAuthenticated
                ? t(
                    'Create one key per app. Copy it immediately after it appears.'
                  )
                : t(
                    'Sign in, create a key, then come back and copy these fields.'
                  )
            }
            action={
              <Button
                size='sm'
                variant='outline'
                className='h-7'
                render={<Link to={isAuthenticated ? '/keys' : '/sign-in'} />}
              >
                {isAuthenticated ? t('Create API Key') : t('Sign in')}
              </Button>
            }
          />
          <KitField
            icon={<Box className='size-4' aria-hidden='true' />}
            label={t('Model ID')}
            value={t('Copy the exact ID from the pricing page')}
            copyValue=''
            hint={t(
              'The model ID must match the pricing page character for character.'
            )}
            action={
              <Button
                size='sm'
                variant='outline'
                className='h-7'
                render={<Link to='/pricing' />}
              >
                {t('Model Square')}
              </Button>
            }
          />
        </div>
      </div>
    </section>
  )
}

function KitField(props: {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
  copyValue?: string
  action?: ReactNode
}) {
  const { t } = useTranslation()
  const canCopy = props.copyValue !== ''

  return (
    <div className='bg-background/70 rounded-xl border px-3 py-3'>
      <div className='flex items-start justify-between gap-3'>
        <div className='flex min-w-0 items-start gap-2.5'>
          <span className='bg-muted text-primary mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg'>
            {props.icon}
          </span>
          <div className='min-w-0'>
            <div className='text-muted-foreground text-xs font-medium'>
              {props.label}
            </div>
            <div
              data-kit-value
              className='mt-0.5 truncate font-mono text-sm'
              title={props.value}
            >
              {props.value}
            </div>
            <p className='text-muted-foreground mt-1 text-xs leading-relaxed'>
              {props.hint}
            </p>
          </div>
        </div>
        <div className='flex shrink-0 items-center gap-1.5'>
          {props.action}
          {canCopy ? (
            <CopyButton
              value={props.copyValue ?? props.value}
              variant='outline'
              tooltip={t('Copy to clipboard')}
              successTooltip={t('Copied!')}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
