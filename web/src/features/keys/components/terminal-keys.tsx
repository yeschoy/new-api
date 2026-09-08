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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { Copy, KeyRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { TerminalPage } from '@/components/layout/components/terminal-page'
import {
  buildSavingsCatalog,
  formatPerMillionTokens,
} from '@/features/home/lib/pricing-savings'
import { usePricingData } from '@/features/pricing/hooks'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { getUserGroups } from '@/lib/api'
import { cn } from '@/lib/utils'

import {
  batchDeleteApiKeys,
  createApiKey,
  deleteApiKey,
  fetchTokenKey,
  getApiKeys,
} from '../api'
import { getApiKeyFormDefaultValues, transformFormDataToPayload } from '../lib'
import {
  describeGroupDiscount,
  parseGroupRatio,
  quoteGroupUsage,
  type GroupDiscount,
} from '../lib/group-quote'

function discountLabel(t: TFunction, discount: GroupDiscount) {
  if (discount.kind === 'original') return t('List price')
  if (discount.kind === 'markup') {
    return t('{{times}}× list price', { times: discount.times })
  }
  return t('{{zhe}} off', { zhe: discount.zhe })
}

type UserGroup = {
  value: string
  label: string
  desc: string
  ratio: number
}

export function TerminalKeys() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const clipboard = useCopyToClipboard({ notify: true })
  const [name, setName] = useState('日常用')
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [modelName, setModelName] = useState('')
  const [groupName, setGroupName] = useState('')
  const { models, priceRate } = usePricingData()
  const catalog = useMemo(
    () => buildSavingsCatalog(models || [], priceRate),
    [models, priceRate]
  )
  const selectedModel =
    catalog.find((model) => model.modelName === modelName) ?? catalog[0] ?? null

  const groupsQuery = useQuery({
    queryKey: ['user-groups'],
    queryFn: getUserGroups,
  })
  const groups = useMemo<UserGroup[]>(() => {
    const entries = Object.entries(groupsQuery.data?.data || {})
    return entries
      .map(([value, info]) => ({
        value,
        label: value,
        desc: String(info.desc || value),
        ratio: parseGroupRatio(info.ratio),
      }))
      .filter((group) => group.value !== 'auto')
      .sort((a, b) => a.ratio - b.ratio)
  }, [groupsQuery.data])
  const selectedGroup =
    groups.find((group) => group.value === groupName) ?? groups[0] ?? null

  const keysQuery = useQuery({
    queryKey: ['terminal', 'keys'],
    queryFn: async () => {
      const result = await getApiKeys({ p: 1, size: 100 })
      return result.success ? (result.data?.items ?? []) : []
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = transformFormDataToPayload({
        ...getApiKeyFormDefaultValues(false),
        name: name.trim() || t('Daily key'),
        group: selectedGroup?.value || '',
        auto_groups_mode: 'inherit',
        auto_groups: [],
        cross_group_retry: false,
      })
      const created = await createApiKey(payload)
      if (!created.success || !created.data) {
        throw new Error(created.message || t('Failed to create API key'))
      }
      const revealed = await fetchTokenKey(created.data.id)
      return {
        itemsNeedRefresh: true,
        key: revealed.data?.key ?? created.data.key,
      }
    },
    onSuccess: async (result) => {
      setCreatedKey(result.key)
      await queryClient.invalidateQueries({ queryKey: ['terminal'] })
      await queryClient.invalidateQueries({ queryKey: ['keys'] })
      toast.success(t('API key created'))
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  const revokeOne = useMutation({
    mutationFn: (id: number) => deleteApiKey(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['terminal'] })
      await queryClient.invalidateQueries({ queryKey: ['keys'] })
    },
  })

  const revokeAll = useMutation({
    mutationFn: async () => {
      const ids = (keysQuery.data ?? []).map((item) => item.id)
      if (ids.length === 0) return
      await batchDeleteApiKeys(ids)
    },
    onSuccess: async () => {
      setCreatedKey(null)
      await queryClient.invalidateQueries({ queryKey: ['terminal'] })
      await queryClient.invalidateQueries({ queryKey: ['keys'] })
      toast.success(t('All keys revoked'))
    },
  })

  const keys = keysQuery.data ?? []

  return (
    <TerminalPage
      title={t('API keys')}
      description={t(
        'Pick a model to see the price, then pick a group. The key bills at that group rate.'
      )}
      actions={
        keys.length > 0 ? (
          <button
            type='button'
            className='ci-button ci-button--danger-quiet ci-button--size-xs'
            onClick={() => revokeAll.mutate()}
            disabled={revokeAll.isPending}
          >
            {t('Revoke all active keys')}
          </button>
        ) : null
      }
    >
      <section className='ci-panel'>
        <header className='ci-panelHeader'>
          <h2>{t('1. Pick a model')}</h2>
          <p>
            {t(
              'This is only for quoting. The key can still call other models in the same group.'
            )}
          </p>
        </header>
        <div className='ci-panelBody'>
          <label className='ci-field'>
            <span>{t('Model')}</span>
            <select
              className='ci-input ci-input--sm'
              value={selectedModel?.modelName ?? ''}
              onChange={(event) => setModelName(event.target.value)}
            >
              {catalog.length === 0 ? (
                <option value=''>{t('No models yet')}</option>
              ) : (
                catalog.map((model) => (
                  <option key={model.modelName} value={model.modelName}>
                    {model.modelName} · {model.vendorName}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>
      </section>

      <section className='ci-panel'>
        <header className='ci-panelHeader'>
          <h2>{t('2. Pick a billing group')}</h2>
          <p>
            {t(
              'Groups are price lanes. The discount applies to this key’s requests.'
            )}
          </p>
        </header>
        <div className='ci-panelBody'>
          {groups.length === 0 ? (
            <p className='ci-formNote'>
              {t('No groups yet. A new key will use the default lane.')}
            </p>
          ) : (
            <div className='ci-quoteGrid'>
              {groups.map((group) => {
                const groupQuote = selectedModel
                  ? quoteGroupUsage(selectedModel, group.ratio)
                  : null
                const discount = describeGroupDiscount(group.ratio)
                const selected = selectedGroup?.value === group.value
                return (
                  <button
                    key={group.value}
                    type='button'
                    className={cn('ci-quoteCard', selected && 'is-selected')}
                    onClick={() => setGroupName(group.value)}
                  >
                    <strong>{group.desc || group.label}</strong>
                    <span className='ci-quoteLane'>
                      {group.label}
                      {' · '}
                      {discountLabel(t, discount)}
                    </span>
                    {groupQuote ? (
                      <dl>
                        <div>
                          <dt>{t('Input / million tokens')}</dt>
                          <dd>{formatPerMillionTokens(groupQuote.input)}</dd>
                        </div>
                        <div>
                          <dt>{t('Output / million tokens')}</dt>
                          <dd>{formatPerMillionTokens(groupQuote.output)}</dd>
                        </div>
                        <div>
                          <dt>{t('95% cache hit on input')}</dt>
                          <dd>
                            {groupQuote.cacheHitInput == null
                              ? t('No cache price for this model')
                              : formatPerMillionTokens(
                                  groupQuote.cacheHitInput
                                )}
                          </dd>
                        </div>
                        <div>
                          <dt>{t('Versus list price')}</dt>
                          <dd>
                            {groupQuote.savingsPercent > 0
                              ? t('Save about {{percent}}%', {
                                  percent: groupQuote.savingsPercent,
                                })
                              : t('No extra discount')}
                          </dd>
                        </div>
                      </dl>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <section className='ci-panel'>
        <header className='ci-panelHeader'>
          <h2>{t('3. Create the key')}</h2>
          <p>{t('Give it a name you will recognize later.')}</p>
        </header>
        <div className='ci-panelBody'>
          <label className='ci-field'>
            <span>{t('Key name')}</span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                className='ci-input ci-input--sm'
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('Daily key')}
              />
              <button
                type='button'
                className='ci-button ci-button--size-xs'
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
              >
                <KeyRound size={14} />
                {t('Create key')}
              </button>
            </div>
          </label>
        </div>
      </section>

      {createdKey ? (
        <div className='ci-createdKey'>
          <code>{createdKey}</code>
          <button
            type='button'
            className='ci-button ci-button--ghost ci-button--size-icon-xs'
            onClick={() => {
              void clipboard.copyToClipboard(createdKey)
            }}
          >
            <Copy size={14} />
          </button>
        </div>
      ) : null}

      <section className='ci-panel'>
        {keys.length === 0 ? (
          <div className='ci-empty'>
            <span className='ci-emptyIcon'>
              <KeyRound size={18} />
            </span>
            <h3>{t('No API keys yet')}</h3>
            <p>
              {t(
                'Create a key above, then fill the base URL and this key into your tool.'
              )}
            </p>
          </div>
        ) : (
          <table className='ci-catalogTable'>
            <thead>
              <tr>
                <th>{t('Name')}</th>
                <th>{t('Key')}</th>
                <th>{t('Group')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id}>
                  <td>{key.name}</td>
                  <td>
                    <code>{key.key}</code>
                  </td>
                  <td>{key.group || t('Default')}</td>
                  <td>
                    <button
                      type='button'
                      className='ci-button ci-button--ghost ci-button--size-xs'
                      onClick={() => revokeOne.mutate(key.id)}
                    >
                      {t('Revoke')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </TerminalPage>
  )
}
