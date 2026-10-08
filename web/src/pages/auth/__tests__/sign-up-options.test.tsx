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

import { SignUpPage } from '../sign-up-page'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}))

const ok = (data: unknown) => ({ data: { success: true, message: '', data } })

function renderSignUp(status: Record<string, unknown>) {
  const get = vi.spyOn(api, 'get').mockImplementation(async (url: string) => (url === '/api/status' ? ok(status) : ok(null)))
  const router = createMemoryRouter([{ path: '/sign-up', element: <SignUpPage /> }], { initialEntries: ['/sign-up'] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  return get
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
  window.localStorage.clear()
})

describe('SignUpPage options', () => {
  it('offers third-party sign-up when only password registration is off', async () => {
    renderSignUp({ password_register_enabled: false, github_oauth: true, github_client_id: 'gh-client' })

    expect(await screen.findByRole('button', { name: '使用 GitHub 继续' })).toBeInTheDocument()
    expect(screen.queryByLabelText('用户名')).toBeNull()
    expect(screen.queryByText('管理员已关闭新用户注册。')).toBeNull()
  })

  it('tells visitors sign-up is closed when the site takes no new accounts', async () => {
    renderSignUp({ register_enabled: false, github_oauth: true, github_client_id: 'gh-client' })

    expect(await screen.findByText('管理员已关闭新用户注册。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '使用 GitHub 继续' })).toBeNull()
  })

  it('waits before another email code can be sent', async () => {
    const user = userEvent.setup()
    const get = renderSignUp({ email_verification: true })

    await user.type(await screen.findByLabelText('邮箱'), 'new@example.com')
    await user.click(screen.getByRole('button', { name: '发送验证码' }))

    expect(await screen.findByText('验证码已发送，请查收邮件')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/api/verification', { params: { email: 'new@example.com' } })
    expect(screen.getByRole('button', { name: '30 秒后可重新发送' })).toBeDisabled()
  })
})
