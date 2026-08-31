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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Box, Key, Link2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { CopyButton } from '@/components/copy-button'
import { LiquidGlass, LiquidGlassButton } from '@/components/liquid-glass'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import {
  getRouteAddresses,
  matchOfficialRoute,
} from '@/features/guide/lib/endpoints'
import { createApiKey, fetchTokenKey } from '@/features/keys/api'
import { ERROR_MESSAGES } from '@/features/keys/constants'
import { usePricingData } from '@/features/pricing/hooks/use-pricing-data'
import { formatPrice } from '@/features/pricing/lib/price'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

import {
  modelsForUser,
  rateGroupsForModel,
  ratioTone,
} from '../../lib/beginner-setup'

export function BeginnerSetup() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.auth.user)
  const {
    models,
    groupRatio,
    usableGroup,
    isLoading,
    priceRate,
    usdExchangeRate,
  } = usePricingData()

  const availableModels = useMemo(
    () => modelsForUser(models, usableGroup),
    [models, usableGroup]
  )
  const [modelName, setModelName] = useState('')
  const [groupId, setGroupId] = useState('')
  const [createdKey, setCreatedKey] = useState('')

  const selectedModel = useMemo(
    () =>
      availableModels.find((model) => model.model_name === modelName) ?? null,
    [availableModels, modelName]
  )
  const rateGroups = useMemo(
    () => rateGroupsForModel(selectedModel, usableGroup, groupRatio),
    [groupRatio, selectedModel, usableGroup]
  )

  const selectedGroup =
    rateGroups.find((group) => group.id === groupId) ?? rateGroups[0] ?? null

  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const addresses = getRouteAddresses(matchOfficialRoute(origin), origin)

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedModel || !selectedGroup) {
        throw new Error('missing-selection')
      }
      const created = await createApiKey({
        name: selectedModel.model_name,
        remain_quota: 0,
        expired_time: -1,
        unlimited_quota: true,
        model_limits_enabled: false,
        model_limits: '',
        allow_ips: '',
        group: selectedGroup.id,
        auto_groups: [],
        cross_group_retry: false,
      })
      if (!created.success || !created.data) {
        throw new Error(created.message || ERROR_MESSAGES.CREATE_FAILED)
      }
      const secret = await fetchTokenKey(created.data.id)
      const raw = secret.data?.key
      if (!secret.success || !raw) {
        throw new Error(secret.message || ERROR_MESSAGES.CREATE_FAILED)
      }
      return raw.startsWith('sk-') ? raw : `sk-${raw}`
    },
    onSuccess: async (fullKey) => {
      setCreatedKey(fullKey)
      toast.success(
        t('Key created. Copy it now. It will not be shown in full again.')
      )
      await queryClient.invalidateQueries({
        queryKey: ['dashboard', 'beginner-home', 'api-keys'],
      })
      await queryClient.invalidateQueries({ queryKey: ['keys'] })
    },
    onError: (error) => {
      const message =
        error instanceof Error &&
        error.message &&
        error.message !== 'missing-selection'
          ? error.message
          : t(ERROR_MESSAGES.CREATE_FAILED)
      toast.error(message)
    },
  })

  const modelOptions = availableModels.map((model) => ({
    value: model.model_name,
    label: model.vendor_name
      ? `${model.model_name} · ${model.vendor_name}`
      : model.model_name,
  }))

  const ratioLabel = (tone: ReturnType<typeof ratioTone>) => {
    if (tone === 'cheaper') return t('cheaper')
    if (tone === 'costlier') return t('costlier')
    return t('list price')
  }

  return (
    <div className='grid gap-5'>
      <LiquidGlass className='rounded-2xl border p-6'>
        <p className='text-muted-foreground font-mono text-xs tracking-widest'>
          01
        </p>
        <h2 className='mt-2 text-lg font-semibold tracking-tight'>
          {t('Pick a model')}
        </h2>
        <p className='text-muted-foreground mt-1 text-sm'>
          {t('This list only includes models your account can use.')}
        </p>
        <div className='mt-3 flex flex-col gap-2 sm:flex-row sm:items-center'>
          <Combobox
            options={modelOptions}
            value={modelName}
            onValueChange={(value) => {
              setModelName(value ?? '')
              setGroupId('')
              setCreatedKey('')
            }}
            placeholder={
              isLoading ? t('Loading...') : t('Search or pick a model')
            }
            searchPlaceholder={t('Search or pick a model')}
            emptyText={t('No matching models')}
            className='sm:min-w-72'
          />
          <Button variant='ghost' size='sm' render={<Link to='/pricing' />}>
            {t('Open the model square')}
          </Button>
        </div>
      </LiquidGlass>

      {selectedModel ? (
        <LiquidGlass className='rounded-2xl border p-6'>
          <p className='text-muted-foreground font-mono text-xs tracking-widest'>
            02
          </p>
          <h2 className='mt-2 text-lg font-semibold tracking-tight'>
            {t('Pick a rate group')}
          </h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t(
              'Each group has a ratio. The key will bill at that group’s rate for this model.'
            )}
          </p>
          <div className='mt-3 grid gap-2'>
            {rateGroups.map((group) => {
              const selected = (selectedGroup?.id ?? '') === group.id
              const tone = ratioTone(group.ratio)
              const inputPrice = formatPrice(
                selectedModel,
                'input',
                'M',
                false,
                priceRate,
                usdExchangeRate,
                group.id
              )
              const outputPrice = formatPrice(
                selectedModel,
                'output',
                'M',
                false,
                priceRate,
                usdExchangeRate,
                group.id
              )
              return (
                <button
                  key={group.id}
                  type='button'
                  onClick={() => {
                    setGroupId(group.id)
                    setCreatedKey('')
                  }}
                  className={cn(
                    'liquid-glass-inset rounded-xl border px-4 py-3 text-left transition-colors',
                    selected ? 'border-primary' : 'hover:border-primary/40'
                  )}
                >
                  <div className='flex flex-wrap items-baseline justify-between gap-2'>
                    <span className='font-medium'>
                      {group.desc}
                      <span className='text-muted-foreground ml-2 text-xs'>
                        {group.id}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'text-xs font-medium',
                        tone === 'cheaper' && 'text-success',
                        tone === 'costlier' && 'text-warning',
                        tone === 'same' && 'text-muted-foreground'
                      )}
                    >
                      {t('{{ratio}}× rate', { ratio: group.ratio })}
                      {' · '}
                      {ratioLabel(tone)}
                    </span>
                  </div>
                  <p className='text-muted-foreground mt-1 text-xs'>
                    {t('Input {{input}} / 1M · Output {{output}} / 1M', {
                      input: inputPrice,
                      output: outputPrice,
                    })}
                  </p>
                </button>
              )
            })}
          </div>
        </LiquidGlass>
      ) : null}

      {selectedModel && selectedGroup ? (
        <LiquidGlass className='rounded-2xl border p-6'>
          <p className='text-muted-foreground font-mono text-xs tracking-widest'>
            03
          </p>
          <h2 className='mt-2 text-lg font-semibold tracking-tight'>
            {t('Create the key')}
          </h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t(
              'The key is bound to this rate group. Copy it immediately after it appears.'
            )}
          </p>
          {user ? (
            <LiquidGlassButton
              className='mt-5 h-11 rounded-full border px-5'
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending
                ? t('Creating...')
                : t('Create this key')}
            </LiquidGlassButton>
          ) : (
            <LiquidGlassButton
              className='mt-5 h-11 rounded-full border px-5'
              render={<Link to='/sign-in' />}
            >
              {t('Sign in')}
            </LiquidGlassButton>
          )}
        </LiquidGlass>
      ) : null}

      {createdKey && selectedModel ? (
        <LiquidGlass className='rounded-2xl border p-6'>
          <h2 className='text-lg font-semibold tracking-tight'>
            {t('Paste these three fields')}
          </h2>
          <p className='text-muted-foreground mt-1 mb-4 text-sm'>
            {t('Fill these three things into the app you already use.')}
          </p>
          <div className='grid gap-3'>
            <CopyRow
              icon={<Link2 className='size-4' />}
              label={t('Base URL')}
              value={addresses.baseUrl}
            />
            <CopyRow
              icon={<Key className='size-4' />}
              label={t('API Key')}
              value={createdKey}
            />
            <CopyRow
              icon={<Box className='size-4' />}
              label={t('Model ID')}
              value={selectedModel.model_name}
            />
          </div>
        </LiquidGlass>
      ) : null}
    </div>
  )
}

function CopyRow(props: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  const { t } = useTranslation()
  return (
    <div className='liquid-glass-inset flex items-center gap-3 rounded-xl border px-3 py-3'>
      <span className='bg-muted text-primary flex size-8 shrink-0 items-center justify-center rounded-lg'>
        {props.icon}
      </span>
      <div className='min-w-0 flex-1'>
        <div className='text-muted-foreground text-xs'>{props.label}</div>
        <div className='truncate font-mono text-sm' title={props.value}>
          {props.value}
        </div>
      </div>
      <CopyButton
        value={props.value}
        variant='outline'
        tooltip={t('Copy to clipboard')}
        successTooltip={t('Copied!')}
      />
    </div>
  )
}
