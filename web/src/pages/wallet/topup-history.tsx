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
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Pager, Panel, Table, TableMessage, TextInput, toast, type Column } from '@/components/ui'
import { tk, useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth-store'
import { useConsoleKey } from '@/pages/console/console-hooks'
import { ROLE_ADMIN } from '@/pages/console/console-nav'

import { TopUpOrderRow } from './topup-order-row'
import { completeTopUpOrder, listTopUpOrders } from './wallet-api'
import { useDebounced } from './wallet-hooks'

const PAGE_SIZE = 10

const COLUMNS: Column[] = [
  { label: tk('时间') },
  { label: tk('订单号') },
  { label: tk('支付方式') },
  { label: tk('充值额度'), right: true },
  { label: tk('支付金额'), right: true },
  { label: tk('状态'), right: true },
]

const ADMIN_COLUMNS: Column[] = [
  { label: tk('时间') },
  { label: tk('订单号') },
  { label: tk('用户 ID') },
  { label: tk('支付方式') },
  { label: tk('充值额度'), right: true },
  { label: tk('支付金额'), right: true },
  { label: tk('状态'), right: true },
  { label: tk('操作'), right: true },
]

/**
 * Top-up orders, searchable by number. Administrators see every user's orders
 * and can complete a pending one. `focus` scrolls here once they have loaded
 * (the server sends payers back with ?show_history).
 */
export function TopUpHistory(props: { focus?: boolean }) {
  const { t } = useI18n()
  const auth = useAuth()
  const queryClient = useQueryClient()
  const admin = (auth.user?.role ?? 0) >= ROLE_ADMIN
  const [search, setSearch] = useState('')
  const keyword = useDebounced(search.trim(), 300)
  // A new search starts again from the first page.
  const [paging, setPaging] = useState({ keyword: '', page: 1 })
  const page = paging.keyword === keyword ? paging.page : 1
  const orders = useQuery({
    queryKey: useConsoleKey('topup-orders', admin, keyword, page),
    queryFn: () => listTopUpOrders({ all: admin, page, size: PAGE_SIZE, keyword }),
    placeholderData: keepPreviousData,
    retry: false,
  })
  const complete = useMutation({
    mutationFn: completeTopUpOrder,
    onSuccess: () => {
      toast.success(t('补单成功'))
      void queryClient.invalidateQueries({ queryKey: ['console'] })
    },
    onError: (err) => toast.error(errorMessage(err, t('补单失败'))),
  })

  const anchor = useRef<HTMLDivElement>(null)
  const scrolled = useRef(false)
  useEffect(() => {
    if (!props.focus || !orders.isSuccess || scrolled.current) return
    scrolled.current = true
    anchor.current?.scrollIntoView({ block: 'start' })
  }, [props.focus, orders.isSuccess])

  const columns = admin ? ADMIN_COLUMNS : COLUMNS
  const items = orders.data?.items ?? []
  let empty: string | null = null
  if (orders.isSuccess && items.length === 0) empty = keyword ? t('没有找到匹配的订单') : t('暂无在线充值记录')

  return (
    <div id='orders' ref={anchor} className='scroll-mt-24'>
      <Panel title={admin ? t('全站充值记录') : t('充值记录')} flush>
        <div className='border-or-line border-b px-4 py-3'>
          <div className='relative max-w-[320px]'>
            <Search className='text-or-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2' aria-hidden='true' />
            <TextInput type='search' value={search} onChange={setSearch} placeholder={t('搜索订单号')} ariaLabel={t('搜索订单号')} className='pl-9' />
          </div>
        </div>
        <Table columns={columns} minWidth={admin ? 960 : 760}>
          {orders.isLoading ? <TableMessage colSpan={columns.length}>{t('加载中…')}</TableMessage> : null}
          {orders.isError ? (
            <TableMessage colSpan={columns.length}>
              <span className='text-or-red'>{errorMessage(orders.error, t('充值记录加载失败'))}</span>
            </TableMessage>
          ) : null}
          {empty ? <TableMessage colSpan={columns.length}>{empty}</TableMessage> : null}
          {items.map((order) => (
            <TopUpOrderRow
              key={order.id}
              order={order}
              admin={admin}
              completing={complete.isPending && complete.variables === order.trade_no}
              onComplete={(tradeNo) => complete.mutate(tradeNo)}
            />
          ))}
        </Table>
      </Panel>
      <Pager page={page} size={PAGE_SIZE} total={orders.data?.total ?? 0} onChange={(next) => setPaging({ keyword, page: next })} />
    </div>
  )
}
