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
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AxiosRequestConfig } from 'axios'

import { api } from '@/lib/api'
import { authStore } from '@/lib/auth-store'

import { TopUpHistory } from '../topup-history'
import { USER, ok, renderPage, signIn } from './render'

const ORDERS = [
  { id: 2, user_id: 7, amount: 10, money: 9, trade_no: 'USR7NOabc1', payment_method: 'alipay', create_time: 1_760_000_000, complete_time: 1_760_000_100, status: 'success' },
  { id: 3, user_id: 7, amount: 5_000_000, money: 9.9, trade_no: 'ref_creem1', payment_method: 'creem', create_time: 1_760_000_200, complete_time: 0, status: 'pending' },
  { id: 4, user_id: 7, amount: 0, money: 19.9, trade_no: 'SUBUSR7NO1', payment_method: 'stripe', create_time: 1_760_000_300, complete_time: 1_760_000_400, status: 'success' },
]

/** Answers order lists from `pages` by path; records every query. */
function answerOrders(pages: Record<string, { items: unknown[]; total: number }>) {
  return vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
    if (url === '/api/status') return ok({ quota_per_unit: 500_000 })
    return ok(pages[url] ?? { items: [], total: 0 })
  })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
})

function row(text: string): HTMLElement {
  const cell = screen.getByText(text)
  const tr = cell.closest('tr')
  if (!tr) throw new Error(`no row for ${text}`)
  return tr
}

describe('top-up orders', () => {
  it('shows what each order credited, reading Creem orders in quota units', async () => {
    signIn()
    answerOrders({ '/api/user/topup/self': { items: ORDERS, total: 3 } })
    renderPage(<TopUpHistory />)

    await screen.findByText('USR7NOabc1')
    expect(within(row('USR7NOabc1')).getByText('$10')).toBeInTheDocument()
    expect(within(row('ref_creem1')).getByText('$10')).toBeInTheDocument()
    expect(within(row('SUBUSR7NO1')).getByText('19.90')).toBeInTheDocument()
    expect(within(row('SUBUSR7NO1')).queryByText('$0')).toBeNull()
  })

  it('searches orders by their number', async () => {
    signIn()
    const get = answerOrders({ '/api/user/topup/self': { items: ORDERS, total: 3 } })
    renderPage(<TopUpHistory />)
    await screen.findByText('USR7NOabc1')

    await userEvent.type(screen.getByRole('searchbox', { name: '搜索订单号' }), 'abc')

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/api/user/topup/self', { params: { p: 1, page_size: 10, keyword: 'abc' } })
    )
  })

  it('says when a search finds nothing', async () => {
    signIn()
    vi.spyOn(api, 'get').mockImplementation(async (url: string, config?: AxiosRequestConfig) => {
      if (url === '/api/status') return ok({ quota_per_unit: 500_000 })
      const keyword = (config?.params as { keyword?: string } | undefined)?.keyword
      return ok(keyword ? { items: [], total: 0 } : { items: ORDERS, total: 3 })
    })
    renderPage(<TopUpHistory />)
    await screen.findByText('USR7NOabc1')

    await userEvent.type(screen.getByRole('searchbox', { name: '搜索订单号' }), 'zzz')

    expect(await screen.findByText('没有找到匹配的订单')).toBeInTheDocument()
  })

  it('pages through long order lists', async () => {
    signIn()
    const get = answerOrders({ '/api/user/topup/self': { items: ORDERS, total: 25 } })
    renderPage(<TopUpHistory />)
    await screen.findByText('USR7NOabc1')

    await userEvent.click(screen.getByRole('button', { name: /下一页/ }))

    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/user/topup/self', { params: { p: 2, page_size: 10, keyword: undefined } }))
  })

  it('copies an order number', async () => {
    signIn()
    answerOrders({ '/api/user/topup/self': { items: ORDERS, total: 3 } })
    const user = userEvent.setup()
    renderPage(<TopUpHistory />)
    await screen.findByText('USR7NOabc1')

    await user.click(within(row('USR7NOabc1')).getByRole('button', { name: '复制订单号' }))

    expect(await navigator.clipboard.readText()).toBe('USR7NOabc1')
  })

  it('lets an administrator see every user and complete a pending order', async () => {
    signIn({ ...USER, role: 10 })
    answerOrders({ '/api/user/topup': { items: ORDERS, total: 3 } })
    const post = vi.spyOn(api, 'post').mockImplementation(async () => ok(null))
    renderPage(<TopUpHistory />)

    expect(await screen.findByRole('heading', { name: '全站充值记录' })).toBeInTheDocument()
    await screen.findByText('ref_creem1')
    expect(within(row('ref_creem1')).getByText('7')).toBeInTheDocument()
    expect(within(row('USR7NOabc1')).queryByRole('button', { name: '补单' })).toBeNull()

    await userEvent.click(within(row('ref_creem1')).getByRole('button', { name: '补单' }))
    await userEvent.click(within(row('ref_creem1')).getByRole('button', { name: '确认' }))

    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/user/topup/complete', { trade_no: 'ref_creem1' }))
    expect(await screen.findByText('补单成功')).toBeInTheDocument()
  })
})
