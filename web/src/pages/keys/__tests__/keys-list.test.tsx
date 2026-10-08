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

import { authStore } from '@/lib/auth-store'

import { GROUPS, apiKey, ok, renderKeysPage, resetWidth, serveGets, signIn, usePhoneWidth } from './keys-test-utils'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div data-shell='router'>{props.children}</div>,
}))

const PROD = apiKey({ id: 1, name: 'prod', group: 'vip', model_limits_enabled: true, model_limits: 'gpt-a,gpt-b', allow_ips: '10.0.0.1' })
const CI = apiKey({ id: 2, name: 'ci', key: 'efgh**********ijkl', status: 2, group: 'auto', cross_group_retry: true, unlimited_quota: true, remain_quota: 0, used_quota: 100_000 })

const DATA = {
  '/api/status': { quota_per_unit: 500_000 },
  '/api/token/': { items: [PROD, CI], total: 2 },
  '/api/user/self/groups': GROUPS,
}

beforeEach(() => {
  signIn()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
  resetWidth()
})

describe('key list', () => {
  it('shows the group, ratio and limits of a key', async () => {
    serveGets(DATA)
    renderKeysPage()
    const row = await screen.findByRole('row', { name: /abcd/ })
    expect(within(row).getByText('vip')).toBeInTheDocument()
    // The ratio comes with the account's groups, which may arrive after the keys.
    expect(await within(row).findByText('×0.5')).toBeInTheDocument()
    expect(within(row).getByText('2 个模型')).toBeInTheDocument()
    expect(within(row).getByText('1 个 IP')).toBeInTheDocument()
    expect(within(row).getByText('永不过期')).toBeInTheDocument()
  })

  it('shows auto keys with cross-group retry and what unlimited keys used', async () => {
    serveGets(DATA)
    renderKeysPage()
    const row = await screen.findByRole('row', { name: /efgh/ })
    expect(within(row).getByText('自动分组')).toBeInTheDocument()
    expect(within(row).getByText('跨分组重试')).toBeInTheDocument()
    expect(within(row).getByText('无限制')).toBeInTheDocument()
    expect(within(row).getByText('已用 $0.2')).toBeInTheDocument()
  })

  it('names the base URL and both acceleration URLs', async () => {
    serveGets({ ...DATA, '/api/status': { quota_per_unit: 500_000, server_address: 'https://yeschoy.com' } })
    renderKeysPage()
    expect(await screen.findByText('https://yeschoy.com/v1')).toBeInTheDocument()
    expect(screen.getByText('https://api.yeschoy.com')).toBeInTheDocument()
  })

  it('copies an acceleration URL', async () => {
    serveGets(DATA)
    const user = userEvent.setup()
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    renderKeysPage()
    await user.click(await screen.findByRole('button', { name: '复制全球加速 URL' }))
    expect(write).toHaveBeenCalledWith('https://api.yeschoy.com')
  })

  it('filters the page by status', async () => {
    serveGets(DATA)
    const user = userEvent.setup()
    renderKeysPage()
    await screen.findByRole('row', { name: /abcd/ })
    await user.selectOptions(screen.getByRole('combobox', { name: '状态' }), '已禁用')
    expect(screen.queryByRole('row', { name: /abcd/ })).toBeNull()
    expect(screen.getByRole('row', { name: /efgh/ })).toBeInTheDocument()
  })

  it('loads more keys per page on request', async () => {
    const get = serveGets({ ...DATA, '/api/token/': { items: [PROD, CI], total: 45 } })
    const user = userEvent.setup()
    renderKeysPage()
    await user.selectOptions(await screen.findByRole('combobox', { name: '每页条数' }), '50')
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/token/', { params: { p: 1, page_size: 50 } }))
  })

  it('lists keys as cards on phones', async () => {
    usePhoneWidth()
    serveGets(DATA)
    renderKeysPage()
    const card = await screen.findByRole('listitem', { name: 'prod' })
    expect(within(card).getByText('sk-abcd**********wxyz')).toBeInTheDocument()
    expect(within(card).getByText('vip')).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('searching keys', () => {
  it('searches names once typing pauses', async () => {
    const get = serveGets(DATA)
    const user = userEvent.setup()
    renderKeysPage()
    await user.type(await screen.findByRole('searchbox', { name: '搜索名称' }), 'prod')
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/token/search', { params: { keyword: 'prod', p: 1, page_size: 20 } }), { timeout: 2000 })
    expect(get).not.toHaveBeenCalledWith('/api/token/search', { params: { keyword: 'p', p: 1, page_size: 20 } })
  })

  it('finds a key by its full value', async () => {
    const get = serveGets(DATA)
    const user = userEvent.setup()
    renderKeysPage()
    await user.type(await screen.findByRole('searchbox', { name: '搜索密钥' }), 'sk-abc')
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/token/search', { params: { token: 'sk-abc', p: 1, page_size: 20 } }), { timeout: 2000 })
  })

  it('explains exact matching when a search finds nothing', async () => {
    serveGets(DATA, (url) => (url === '/api/token/search' ? ok({ items: [], total: 0 }) : undefined))
    const user = userEvent.setup()
    renderKeysPage()
    await user.type(await screen.findByRole('searchbox', { name: '搜索名称' }), 'pro')
    expect(await screen.findByText('没有匹配的密钥', {}, { timeout: 2000 })).toBeInTheDocument()
    expect(screen.getByText('按完整名称或完整密钥匹配，可用 % 模糊匹配，例如 %prod%。')).toBeInTheDocument()
  })

  it('shows why a search failed', async () => {
    serveGets(DATA, (url) => (url === '/api/token/search' ? { data: { success: false, message: '搜索模式中最多允许包含 2 个 % 通配符' } } : undefined))
    const user = userEvent.setup()
    renderKeysPage()
    await user.type(await screen.findByRole('searchbox', { name: '搜索名称' }), '%a%b%')
    expect(await screen.findByText('搜索模式中最多允许包含 2 个 % 通配符', {}, { timeout: 2000 })).toBeInTheDocument()
  })
})
