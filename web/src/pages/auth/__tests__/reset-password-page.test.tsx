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

import { ResetPasswordPage } from '../reset-password-page'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}))

function renderAt(path: string) {
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: {} } })
  const router = createMemoryRouter([{ path: '/user/reset', element: <ResetPasswordPage /> }], { initialEntries: [path] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ResetPasswordPage', () => {
  it('confirms the emailed link and shows the generated password', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { success: true, message: '', data: 'Fresh-Pass-42' } })
    const user = userEvent.setup()
    renderAt('/user/reset?email=alice%40example.com&token=tok-9')

    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认重置' }))

    expect(await screen.findByText('Fresh-Pass-42')).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith('/api/user/reset', { email: 'alice@example.com', token: 'tok-9' })
    expect(screen.getByRole('link', { name: '返回登录' })).toHaveAttribute('href', '/sign-in')
  })

  it('shows why an expired link was refused', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: { success: false, message: '重置链接非法或已过期' } })
    const user = userEvent.setup()
    renderAt('/user/reset?email=alice%40example.com&token=old')

    await user.click(screen.getByRole('button', { name: '确认重置' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('重置链接非法或已过期')
    expect(screen.queryByText('新密码')).toBeNull()
  })

  it('explains that a link without its email or token cannot be used', () => {
    renderAt('/user/reset?email=alice%40example.com')

    expect(screen.getByText('重置链接无效，请重新找回密码。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认重置' })).toBeNull()
    expect(screen.getByRole('link', { name: '重新找回密码' })).toHaveAttribute('href', '/forgot-password')
  })
})
