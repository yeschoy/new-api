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

import { Moved } from '@/components/moved'
import { api } from '@/lib/api'
import { authStore } from '@/lib/auth-store'

import { SignUpPage } from '../sign-up-page'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}))

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/register', element: <Moved to='/sign-up' /> },
      { path: '/sign-up', element: <SignUpPage /> },
      { path: '/sign-in', element: <p>sign-in page</p> },
    ],
    { initialEntries: [path] }
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
  window.localStorage.clear()
})

describe('SignUpPage', () => {
  it('signs the new account up under the inviter from an old /register?aff= link', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true, data: null } })
    const user = userEvent.setup()
    renderAt('/register?aff=AB12')

    await user.type(await screen.findByLabelText('用户名'), 'newbie')
    await user.type(screen.getByLabelText('密码'), 'password1')
    await user.type(screen.getByLabelText('确认密码'), 'password1')
    await user.click(screen.getByRole('button', { name: '创建账号' }))

    expect(await screen.findByText('sign-in page')).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith('/api/user/register', expect.objectContaining({ username: 'newbie', aff_code: 'AB12' }), expect.anything())
  })
})
