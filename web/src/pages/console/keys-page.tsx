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
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { useStatus } from '@/lib/queries'
import { AccelerationUrls } from '@/pages/keys/acceleration-urls'
import { BulkBar, DeleteAllKeys, SelectAll } from '@/pages/keys/bulk-actions'
import { KeyTip } from '@/pages/keys/key-tip'
import { fetchKeys, getUserGroups } from '@/pages/keys/keys-api'
import { KeysFooter } from '@/pages/keys/keys-footer'
import { KeysList } from '@/pages/keys/keys-list'
import { KeysToolbar } from '@/pages/keys/keys-toolbar'
import { useNow } from '@/pages/keys/time-labels'
import { useKeysView } from '@/pages/keys/use-keys-view'

import { useConsoleKey } from './console-hooks'
import { ConsolePage } from './console-page'
import { KeyDialog } from './key-create-dialog'

/** The open create (no id) or edit dialog. */
type DialogState = { keyId?: number } | null

/** API keys: search, filter and page through keys; reveal / copy, edit, enable / disable, delete, create. */
export function KeysPage() {
  const { t } = useI18n()
  const { data: status } = useStatus()
  const [dialog, setDialog] = useState<DialogState>(null)

  const baseUrl = `${(status?.server_address || window.location.origin).replace(/\/+$/, '')}/v1`
  const create = (
    <Button variant='primary' onClick={() => setDialog({})}>
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
      <KeysContent create={create} onEdit={(keyId) => setDialog({ keyId })} />
      {dialog ? <KeyDialog keyId={dialog.keyId} onClose={() => setDialog(null)} /> : null}
    </ConsolePage>
  )
}

const NONE: ReadonlySet<number> = new Set()

/** Signed-in part of the page: the queries only run once the visitor is known. */
function KeysContent(props: { create: React.ReactNode; onEdit: (keyId: number) => void }) {
  const { t } = useI18n()
  const [view, update] = useKeysView()
  const query = { page: view.page, size: view.size, keyword: view.keyword, token: view.token }
  // Ticks belong to what is on screen: another page, search or filter starts with none.
  const viewKey = `${view.page}|${view.size}|${view.keyword}|${view.token}|${view.status}`
  const [selection, setSelection] = useState<{ view: string; ids: ReadonlySet<number> }>({ view: '', ids: NONE })
  const now = useNow()
  const keys = useQuery({
    queryKey: useConsoleKey('keys', query),
    queryFn: () => fetchKeys(query),
    placeholderData: keepPreviousData,
  })
  const groups = useQuery({ queryKey: useConsoleKey('key-groups'), queryFn: getUserGroups, staleTime: 60_000 })
  const groupMap = useMemo(() => new Map((groups.data ?? []).map((group) => [group.name, group])), [groups.data])
  const items = keys.data?.items ?? []
  const shown = view.status ? items.filter((item) => String(item.status) === view.status) : items
  const selectedIds = selection.view === viewKey ? selection.ids : NONE
  const selected = shown.filter((item) => selectedIds.has(item.id))
  const searching = Boolean(view.keyword || view.token)

  function select(ids: number[], checked: boolean) {
    const next = new Set(selectedIds)
    for (const id of ids) {
      if (checked) next.add(id)
      else next.delete(id)
    }
    setSelection({ view: viewKey, ids: next })
  }

  // Deleting the last key on a later page would leave an empty page behind.
  useEffect(() => {
    if (view.page > 1 && keys.isSuccess && !keys.isPlaceholderData && items.length === 0) update({ page: view.page - 1 })
  }, [view.page, keys.isSuccess, keys.isPlaceholderData, items.length, update])

  const empty = (
    <div className='flex flex-col items-center gap-3'>
      <KeyRound className='size-6' aria-hidden='true' />
      <span>{t('还没有 API 密钥，创建一个开始调用模型。')}</span>
      {props.create}
    </div>
  )

  return (
    <>
      <KeyTip />
      <AccelerationUrls />
      <KeysToolbar
        search={{ keyword: view.keyword, token: view.token }}
        status={view.status}
        onStatus={(status) => update({ status })}
        onSearch={(terms) => update({ ...terms, page: 1 })}
      >
        <SelectAll shown={shown.length} selected={selected.length} onChange={(all) => select(shown.map((item) => item.id), all)} />
      </KeysToolbar>
      {selected.length ? <BulkBar selected={selected} onDone={() => setSelection({ view: viewKey, ids: NONE })} /> : null}
      <KeysList
        items={shown}
        state={{
          loading: keys.isLoading,
          error: keys.error,
          loaded: keys.isSuccess,
          pageCount: items.length,
          searching,
        }}
        groups={groupMap}
        now={now}
        empty={empty}
        selected={selectedIds}
        onSelect={(id, checked) => select([id], checked)}
        onEdit={props.onEdit}
      />
      <KeysFooter
        page={view.page}
        size={view.size}
        total={keys.data?.total ?? 0}
        onPage={(page) => update({ page })}
        onSize={(size) => update({ size, page: 1 })}
      >
        <DeleteAllKeys total={searching ? 0 : (keys.data?.total ?? 0)} />
      </KeysFooter>
    </>
  )
}
