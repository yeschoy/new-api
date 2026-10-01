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

import { SignInPage } from '../sign-in-page'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}))

const bundle = {
  user: { id: 7, username: 'u', role: 1 },
  access_token: 'tok-7',
  token_type: 'Bearer',
  access_expires_at: 9_999_999_999,
  session: { sid: 's', current: true, login_method: 'password', expires_at: 9_999_999_999 },
}

function renderSignIn() {
  const router = createMemoryRouter(
    [
      { path: '/sign-in', element: <SignInPage /> },
      { path: '/settings/keys', element: <p>keys page</p> },
    ],
    { initialEntries: ['/sign-in'] }
  )
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: {} } })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
})

describe('SignInPage', () => {
  it('sends the flow token from the password step with the two-factor code', async () => {
    const post = vi.spyOn(api, 'post').mockImplementation(async (url: string) => {
      if (url === '/api/user/login') return { data: { success: true, data: { require_2fa: true, flow_token: 'flow-1' } } }
      return { data: { success: true, data: bundle } }
    })
    const user = userEvent.setup()
    renderSignIn()

    await user.type(screen.getByLabelText('用户名或邮箱'), 'u')
    await user.type(screen.getByLabelText('密码'), 'secret')
    await user.click(screen.getByRole('button', { name: '继续' }))
    await user.type(await screen.findByLabelText('验证码'), '123456')
    await user.click(screen.getByRole('button', { name: '验证' }))

    expect(await screen.findByText('keys page')).toBeInTheDocument()
    expect(post).toHaveBeenLastCalledWith('/api/user/login/2fa', { code: '123456', flow_token: 'flow-1' }, expect.anything())
  })
})
