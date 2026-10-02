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
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { KeyRound, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { useStatus } from '@/lib/queries'
import { AccelerationUrls } from '@/pages/keys/acceleration-urls'
import { fetchKeys, getUserGroups, type KeyQuery } from '@/pages/keys/keys-api'
import { KeysFooter } from '@/pages/keys/keys-footer'
import { KeysList } from '@/pages/keys/keys-list'
import { KeysToolbar, type SearchTerms } from '@/pages/keys/keys-toolbar'
import { useNow } from '@/pages/keys/time-labels'

import { useConsoleKey } from './console-hooks'
import { ConsolePage } from './console-page'
import { CreateKeyDialog } from './key-create-dialog'

/** API keys: search, filter and page through keys; reveal / copy, enable / disable, delete, create. */
export function KeysPage() {
  const { t } = useI18n()
  const { data: status } = useStatus()
  const [creating, setCreating] = useState(false)

  const baseUrl = `${(status?.server_address || window.location.origin).replace(/\/+$/, '')}/v1`
  const create = (
    <Button variant='primary' onClick={() => setCreating(true)}>
      <Plus className='size-4' aria-hidden='true' />
      {t('创建密钥')}
    </Button>
  )

  return (
    <ConsolePage
      active='keys'
      title={t('API 密钥')}
      description={
        <>
          {t('使用密钥调用本站接口，请勿泄露给他人。接口地址')}{' '}
          <code className='font-geist text-or-fg text-[13px]'>{baseUrl}</code>
        </>
      }
      actions={create}
    >
      <KeysContent create={create} />
      {creating ? <CreateKeyDialog onClose={() => setCreating(false)} /> : null}
    </ConsolePage>
  )
}

/** Signed-in part of the page: the queries only run once the visitor is known. */
function KeysContent(props: { create: React.ReactNode }) {
  const { t } = useI18n()
  const [view, setView] = useState<KeyQuery>({ page: 1, size: 20, keyword: '', token: '' })
  const [statusFilter, setStatusFilter] = useState('')
  const now = useNow()
  const keys = useQuery({
    queryKey: useConsoleKey('keys', view),
    queryFn: () => fetchKeys(view),
    placeholderData: keepPreviousData,
  })
  const groups = useQuery({ queryKey: useConsoleKey('key-groups'), queryFn: getUserGroups, staleTime: 60_000 })
  const groupMap = useMemo(() => new Map((groups.data ?? []).map((group) => [group.name, group])), [groups.data])
  const items = keys.data?.items ?? []
  const shown = statusFilter ? items.filter((item) => String(item.status) === statusFilter) : items

  // Deleting the last key on a later page would leave an empty page behind.
  useEffect(() => {
    if (view.page > 1 && keys.isSuccess && !keys.isPlaceholderData && items.length === 0) {
      setView((current) => ({ ...current, page: current.page - 1 }))
    }
  }, [view.page, keys.isSuccess, keys.isPlaceholderData, items.length])

  const onSearch = useCallback((terms: SearchTerms) => {
    setView((current) =>
      current.keyword === terms.keyword && current.token === terms.token ? current : { ...current, ...terms, page: 1 }
    )
  }, [])

  const empty = (
    <div className='flex flex-col items-center gap-3'>
      <KeyRound className='size-6' aria-hidden='true' />
      <span>{t('还没有 API 密钥，创建一个开始调用模型。')}</span>
      {props.create}
    </div>
  )

  return (
    <>
      <AccelerationUrls />
      <KeysToolbar status={statusFilter} onStatus={setStatusFilter} onSearch={onSearch} />
      <KeysList
        items={shown}
        state={{
          loading: keys.isLoading,
          error: keys.error,
          loaded: keys.isSuccess,
          pageCount: items.length,
          searching: Boolean(view.keyword || view.token),
        }}
        groups={groupMap}
        now={now}
        empty={empty}
      />
      <KeysFooter
        page={view.page}
        size={view.size}
        total={keys.data?.total ?? 0}
        onPage={(page) => setView((current) => ({ ...current, page }))}
        onSize={(size) => setView((current) => ({ ...current, size, page: 1 }))}
      />
    </>
  )
}
