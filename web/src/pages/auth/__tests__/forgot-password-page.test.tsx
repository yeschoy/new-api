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

import { ForgotPasswordPage } from '../forgot-password-page'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}))

const ok = (data: unknown) => ({ data: { success: true, message: '', data } })

function renderPage(status: Record<string, unknown> = {}, reset: unknown = ok(null)) {
  const get = vi.spyOn(api, 'get').mockImplementation(async (url: string) => (url === '/api/status' ? ok(status) : reset))
  const router = createMemoryRouter([{ path: '/forgot-password', element: <ForgotPasswordPage /> }], {
    initialEntries: ['/forgot-password'],
  })
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
  delete window.turnstile
})

describe('ForgotPasswordPage', () => {
  it('sends the reset email to the typed address and then waits before another send', async () => {
    const get = renderPage()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('邮箱'), 'alice@example.com')
    await user.click(screen.getByRole('button', { name: '发送重置邮件' }))

    expect(await screen.findByText('如果该邮箱已注册，重置邮件已发出，请查收。')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/api/reset_password', { params: { email: 'alice@example.com' } })
    expect(screen.getByRole('button', { name: '30 秒后可重新发送' })).toBeDisabled()
  })

  it('shows why the reset email could not be sent', async () => {
    renderPage({}, { data: { success: false, message: '邮件服务未配置' } })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('邮箱'), 'alice@example.com')
    await user.click(screen.getByRole('button', { name: '发送重置邮件' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('邮件服务未配置')
    expect(screen.getByRole('button', { name: '发送重置邮件' })).toBeEnabled()
  })

  it('sends the human-check token when the site asks for one', async () => {
    window.turnstile = {
      render: (_element: HTMLElement, options: Record<string, unknown>) => {
        ;(options.callback as (token: string) => void)('human-1')
        return 'widget-1'
      },
    }
    const get = renderPage({ turnstile_check: true, turnstile_site_key: 'site-key' })
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('邮箱'), 'alice@example.com')
    await user.click(await screen.findByRole('button', { name: '发送重置邮件' }))

    await screen.findByText('如果该邮箱已注册，重置邮件已发出，请查收。')
    expect(get).toHaveBeenCalledWith('/api/reset_password', { params: { email: 'alice@example.com', turnstile: 'human-1' } })
  })

  it('links back to sign-in', () => {
    renderPage()
    expect(screen.getByRole('link', { name: '返回登录' })).toHaveAttribute('href', '/sign-in')
  })
})
