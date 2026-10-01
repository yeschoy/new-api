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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, within } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'

import { api } from '@/lib/api'
import { authStore } from '@/lib/auth-store'

import { ConsoleLayout } from '../console-layout'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}))

// The live site's console switches on 2026-10-01: task and drawing logs are off.
const STATUS = {
  enable_data_export: true,
  SidebarModulesAdmin: JSON.stringify({
    chat: { enabled: true, playground: true, chat: false },
    console: { enabled: true, detail: true, token: true, log: true, midjourney: false, task: false, audit: true },
    personal: { enabled: true, topup: true, personal: true, security: true },
    admin: { enabled: true, channel: true, models: true, redemption: true, user: true, setting: true, subscription: true },
  }),
}

function renderAs(role: number) {
  const user = { id: 3, username: 'u', role }
  authStore.applyBundle({
    user,
    access_token: 'tok',
    token_type: 'Bearer',
    access_expires_at: 9_999_999_999,
    session: { sid: 's', current: true, login_method: 'password', expires_at: 9_999_999_999 },
  })
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => ({
    data: { success: true, data: url === '/api/status' ? STATUS : { ...user, sidebar_modules: '' } },
  }))
  const router = createMemoryRouter(
    [{ path: '*', element: <ConsoleLayout active='keys' title='API 密钥'>page</ConsoleLayout> }],
    { initialEntries: ['/settings/keys'] }
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return screen.getByRole('navigation', { name: '设置导航' })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
})

describe('console navigation', () => {
  it('shows a customer the sections the admin left on, and no admin section', async () => {
    const nav = renderAs(1)
    expect(await within(nav).findByRole('link', { name: '概览' })).toHaveAttribute('href', '/dashboard')
    for (const name of ['API 密钥', '对话', '使用记录', '用量与费用', '分流', '钱包', '账户设置', '账户安全']) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument()
    }
    expect(within(nav).queryByRole('link', { name: '任务记录' })).toBeNull()
    expect(within(nav).queryByRole('link', { name: '绘图记录' })).toBeNull()
    expect(within(nav).queryByText('管理')).toBeNull()
    expect(within(nav).getByRole('link', { name: 'API 密钥' })).toHaveAttribute('aria-current', 'page')
  })

  it('adds the admin section for admins, without the root-only pages', async () => {
    const nav = renderAs(10)
    expect(await within(nav).findByRole('link', { name: '渠道' })).toHaveAttribute('href', '/admin/channels')
    for (const name of ['模型', '用户', '兑换码', '订阅']) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument()
    }
    expect(within(nav).queryByRole('link', { name: '系统设置' })).toBeNull()
  })

  it('gives the root user system settings, system info and task plugins', async () => {
    const nav = renderAs(100)
    expect(await within(nav).findByRole('link', { name: '系统设置' })).toHaveAttribute('href', '/admin/settings')
    expect(within(nav).getByRole('link', { name: '系统信息' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: '任务插件' })).toBeInTheDocument()
  })
})
