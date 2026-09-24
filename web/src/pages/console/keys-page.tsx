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
import { useEffect, useState } from 'react'

import { RequireAuth } from '@/components/require-auth'
import { errorMessage } from '@/lib/api'
import { useStatus } from '@/lib/queries'
import { listKeys } from '@/lib/services'

import { useConsoleKey } from './console-hooks'
import { ConsoleLayout } from './console-layout'
import { Pager, Table, TableMessage, type Column } from './console-table'
import { Button, Panel } from './console-ui'
import { CreateKeyDialog } from './key-create-dialog'
import { KeyRow } from './key-row'

const PAGE_SIZE = 20

const COLUMNS: Column[] = [
  { label: '名称' },
  { label: '密钥' },
  { label: '额度上限', right: true },
  { label: '已用', right: true },
  { label: '创建时间' },
  { label: '操作', right: true },
]

/** API keys: list, reveal / copy, enable / disable, delete, create. */
export function KeysPage() {
  return (
    <RequireAuth framed>
      <KeysContent />
    </RequireAuth>
  )
}

function KeysContent() {
  const { data: status } = useStatus()
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const queryKey = useConsoleKey('keys', page)
  const keys = useQuery({
    queryKey,
    queryFn: () => listKeys(page, PAGE_SIZE),
    placeholderData: keepPreviousData,
  })
  const items = keys.data?.items ?? []
  const total = keys.data?.total ?? 0

  // Deleting the last key on a later page would leave an empty page behind.
  useEffect(() => {
    if (page > 1 && keys.isSuccess && !keys.isPlaceholderData && items.length === 0) setPage(page - 1)
  }, [page, keys.isSuccess, keys.isPlaceholderData, items.length])

  const baseUrl = `${(status?.server_address || window.location.origin).replace(/\/+$/, '')}/v1`
  const create = (
    <Button variant='primary' onClick={() => setCreating(true)}>
      <Plus className='size-4' aria-hidden='true' />
      创建密钥
    </Button>
  )

  return (
    <ConsoleLayout
      active='keys'
      title='API 密钥'
      description={
        <>
          使用密钥调用本站接口，请勿泄露给他人。接口地址{' '}
          <code className='font-geist text-or-fg text-[13px]'>{baseUrl}</code>
        </>
      }
      actions={create}
    >
      <Panel flush>
        <Table columns={COLUMNS} minWidth={880}>
          {keys.isLoading ? <TableMessage colSpan={COLUMNS.length}>加载中…</TableMessage> : null}
          {keys.isError ? (
            <TableMessage colSpan={COLUMNS.length}>
              <span className='text-or-red'>{errorMessage(keys.error, '密钥加载失败')}</span>
            </TableMessage>
          ) : null}
          {keys.isSuccess && items.length === 0 ? (
            <TableMessage colSpan={COLUMNS.length}>
              <div className='flex flex-col items-center gap-3'>
                <KeyRound className='size-6' aria-hidden='true' />
                <span>还没有 API 密钥，创建一个开始调用模型。</span>
                {create}
              </div>
            </TableMessage>
          ) : null}
          {items.map((apiKey) => (
            <KeyRow key={apiKey.id} apiKey={apiKey} />
          ))}
        </Table>
      </Panel>
      <Pager page={page} size={PAGE_SIZE} total={total} onChange={setPage} />
      {creating ? <CreateKeyDialog onClose={() => setCreating(false)} /> : null}
    </ConsoleLayout>
  )
}
