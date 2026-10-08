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
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { authStore } from '@/lib/auth-store'

import { GROUPS, apiKey, renderKeysPage, serveGets, signIn } from './keys-test-utils'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div data-shell='router'>{props.children}</div>,
}))

const DATA = {
  '/api/status': { quota_per_unit: 500_000 },
  '/api/token/': { items: [apiKey()], total: 45 },
  '/api/token/search': { items: [apiKey()], total: 45 },
  '/api/user/self/groups': GROUPS,
}

beforeEach(() => {
  signIn()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
})

describe('the address of the keys page', () => {
  it('opens on the page, size, search and status it names', async () => {
    const get = serveGets(DATA)
    renderKeysPage('/settings/keys?page=2&pageSize=50&filter=prod&token=sk-abc&status=2')
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith('/api/token/search', { params: { keyword: 'prod', token: 'sk-abc', p: 2, page_size: 50 } })
    )
    expect(screen.getByRole('searchbox', { name: '搜索名称' })).toHaveValue('prod')
    expect(screen.getByRole('searchbox', { name: '搜索密钥' })).toHaveValue('sk-abc')
    expect(screen.getByRole('combobox', { name: '状态' })).toHaveValue('2')
  })

  it('ignores values it does not know', async () => {
    const get = serveGets(DATA)
    renderKeysPage('/settings/keys?page=-3&pageSize=7&status=9')
    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/token/', { params: { p: 1, page_size: 20 } }))
    expect(screen.getByRole('combobox', { name: '状态' })).toHaveValue('')
  })

  it('remembers the page, size and filter that were picked', async () => {
    serveGets(DATA)
    const user = userEvent.setup()
    const { router } = renderKeysPage()
    await user.click(await screen.findByRole('button', { name: /下一页/ }))
    await user.selectOptions(screen.getByRole('combobox', { name: '状态' }), '已禁用')
    const params = new URLSearchParams(router.state.location.search)
    expect(params.get('page')).toBe('2')
    expect(params.get('status')).toBe('2')
    await user.selectOptions(screen.getByRole('combobox', { name: '每页条数' }), '50')
    const sized = new URLSearchParams(router.state.location.search)
    expect(sized.get('pageSize')).toBe('50')
    expect(sized.get('page')).toBeNull()
  })

  it('remembers what was searched once typing pauses', async () => {
    serveGets(DATA)
    const user = userEvent.setup()
    const { router } = renderKeysPage()
    await user.type(await screen.findByRole('searchbox', { name: '搜索名称' }), 'prod')
    await waitFor(() => expect(new URLSearchParams(router.state.location.search).get('filter')).toBe('prod'), { timeout: 2000 })
  })
})

describe('the tip above the keys', () => {
  it('links to the guide on using a key', async () => {
    serveGets(DATA)
    renderKeysPage()
    expect(await screen.findByText('一键复制——这就是你的 AI 工具需要的密码')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /怎么使用？/ })).toHaveAttribute('href', '/guide')
  })
})
