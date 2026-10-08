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
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'

import { api } from '@/lib/api'
import { authStore } from '@/lib/auth-store'

import { ActivityPage } from '../activity-page'
import { CreditsPage } from '../credits-page'
import { KeysPage } from '../keys-page'
import { ProfilePage } from '../profile-page'

// The real shell pulls in the icon library (not loadable under jsdom); the
// console only needs it as a frame here.
vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div data-shell='router'>{props.children}</div>,
}))

const USER = {
  id: 7,
  username: 'alice',
  display_name: 'Alice',
  role: 1,
  email: 'alice@example.com',
  quota: 5_000_000,
  used_quota: 1_000_000,
  request_count: 42,
  group: 'default',
}

const ok = (data: unknown) => ({ data: { success: true, message: '', data } })

const RESPONSES: Record<string, unknown> = {
  '/api/status': { quota_per_unit: 500_000 },
  '/api/user/self': USER,
  '/api/token/': {
    items: [
      { id: 1, name: 'prod', key: 'abcd**********wxyz', status: 1, created_time: 1_760_000_000, accessed_time: 0, expired_time: -1, remain_quota: 500_000, unlimited_quota: false, used_quota: 250_000 },
    ],
    total: 1,
  },
  '/api/user/topup/info': { enable_online_topup: false, enable_stripe_topup: false, enable_creem_topup: false, enable_waffo_topup: false, enable_waffo_pancake_topup: false, enable_redemption: true },
  '/api/user/topup/self': { items: [], total: 0 },
  '/api/log/self': {
    items: [{ id: 3, created_at: 1_760_000_000, model_name: 'gpt-test', token_name: 'prod', prompt_tokens: 1200, completion_tokens: 300, quota: 50_000, use_time: 2, is_stream: true, type: 2 }],
    total: 1,
  },
  '/api/log/self/summary': { requests: 9, failed: 1, quota: 1_500_000, tokens: 12_345, daily: [] },
}

beforeEach(() => {
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => ok(RESPONSES[url] ?? {}))
  authStore.applyBundle({
    user: USER,
    access_token: 'token',
    token_type: 'Bearer',
    access_expires_at: 9_999_999_999,
    session: { sid: 'sid', current: true, login_method: 'password', expires_at: 9_999_999_999 },
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
  window.localStorage.clear()
})

function renderPage(element: React.ReactNode, path = '/') {
  const router = createMemoryRouter([{ path: '*', element }], { initialEntries: [path] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

describe('console pages', () => {
  it('lists keys with masked value and limits', async () => {
    renderPage(<KeysPage />)
    expect(await screen.findByText('sk-abcd**********wxyz')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'API 密钥' })).toBeInTheDocument()
    expect(screen.getByText('$1.5')).toBeInTheDocument()
    expect(screen.getByText('剩余 $1')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /钱包/ }).length).toBeGreaterThan(0)
  })

  it('shows why the key list failed instead of an empty list', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) =>
      url === '/api/token/' ? { data: { success: false, message: '数据库连接失败' } } : ok(RESPONSES[url] ?? {})
    )
    renderPage(<KeysPage />)
    expect(await screen.findByText('数据库连接失败')).toBeInTheDocument()
    expect(screen.queryByText('还没有 API 密钥，创建一个开始调用模型。')).toBeNull()
  })

  it('shows the balance and redeem form', async () => {
    renderPage(<CreditsPage />)
    expect(await screen.findByText('$10')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('兑换码')).toBeInTheDocument()
    expect(await screen.findByText('暂无在线充值记录')).toBeInTheDocument()
  })

  it('shows 7-day tiles and request rows', async () => {
    renderPage(<ActivityPage />)
    expect(await screen.findByText('gpt-test')).toBeInTheDocument()
    expect(await screen.findByText('$3')).toBeInTheDocument()
    expect(screen.getByText('12.3K')).toBeInTheDocument()
    expect(screen.getByText('1,200')).toBeInTheDocument()
  })

  it('shows account details', async () => {
    renderPage(<ProfilePage />)
    expect(await screen.findByText('alice@example.com')).toBeInTheDocument()
    expect(screen.getByText('普通用户')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /退出登录/ })).toBeInTheDocument()
  })
})

describe('signed-out visitors', () => {
  it.each([
    ['/settings/keys', <KeysPage />, '创建密钥'],
    ['/settings/credits', <CreditsPage />, '可用余额'],
    ['/activity', <ActivityPage />, '请求明细'],
    ['/settings/profile', <ProfilePage />, '基本信息'],
  ])('stay on %s and see a framed sign-in notice', (path, element, signedInText) => {
    authStore.clear()
    const { container } = renderPage(element, path)
    expect(screen.getByRole('link', { name: '登录' })).toHaveAttribute('href', `/sign-in?redirect=${encodeURIComponent(path)}`)
    expect(screen.getByRole('link', { name: '注册' })).toHaveAttribute('href', `/sign-up?redirect=${encodeURIComponent(path)}`)
    expect(screen.queryByText(signedInText)).toBeNull()
    expect(container.querySelector('[data-shell="router"]')).not.toBeNull()
  })
})

describe('key actions', () => {
  it('asks inline before deleting', async () => {
    const remove = vi.spyOn(api, 'delete').mockResolvedValue(ok(null))
    const user = userEvent.setup()
    renderPage(<KeysPage />)
    await user.click(await screen.findByRole('button', { name: '删除' }))
    expect(screen.getByText('确认删除？')).toBeInTheDocument()
    expect(remove).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '删除' }))
    expect(remove).toHaveBeenCalledWith('/api/token/1')
  })

  it('creates a limited key and shows the full key once', async () => {
    const post = vi.spyOn(api, 'post').mockImplementation(async (url: string) =>
      url === '/api/token/' ? ok({ id: 9, name: 'ci' }) : ok({ key: 'FULLKEY' })
    )
    const user = userEvent.setup()
    renderPage(<KeysPage />)
    await user.click(await screen.findByRole('button', { name: /创建密钥/ }))
    await user.type(screen.getByPlaceholderText('例如：生产环境'), 'ci')
    await user.click(screen.getByRole('switch', { name: '不限额度' }))
    await user.type(screen.getByPlaceholderText('10'), '2')
    await user.click(screen.getByRole('button', { name: '创建' }))
    expect(await screen.findByText('sk-FULLKEY')).toBeInTheDocument()
    // The form sends every field of the key, as the old keys page did.
    expect(post).toHaveBeenCalledWith('/api/token/', {
      name: 'ci',
      remain_quota: 1_000_000,
      unlimited_quota: false,
      expired_time: -1,
      model_limits_enabled: false,
      model_limits: '',
      allow_ips: '',
      group: '',
      auto_groups: [],
      cross_group_retry: false,
    })
    expect(post).toHaveBeenCalledWith('/api/token/9/key')
  })

  it('puts new keys in the auto group when the site defaults to it', async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) =>
      ok(url === '/api/status' ? { quota_per_unit: 500_000, default_use_auto_group: true } : (RESPONSES[url] ?? {}))
    )
    const post = vi.spyOn(api, 'post').mockImplementation(async (url: string) =>
      url === '/api/token/' ? ok({ id: 9, name: 'ci' }) : ok({ key: 'FULLKEY' })
    )
    const user = userEvent.setup()
    renderPage(<KeysPage />)
    await user.click(await screen.findByRole('button', { name: /创建密钥/ }))
    await user.type(screen.getByPlaceholderText('例如：生产环境'), 'ci')
    await user.click(screen.getByRole('button', { name: '创建' }))
    expect(await screen.findByText('sk-FULLKEY')).toBeInTheDocument()
    // Auto keys follow the global order and retry across groups unless told otherwise.
    expect(post).toHaveBeenCalledWith('/api/token/', {
      name: 'ci',
      remain_quota: 0,
      unlimited_quota: true,
      expired_time: -1,
      model_limits_enabled: false,
      model_limits: '',
      allow_ips: '',
      group: 'auto',
      auto_groups: [],
      cross_group_retry: true,
    })
  })
})
