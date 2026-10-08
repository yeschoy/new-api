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
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'

import { getLang, setLang } from '@/i18n/i18n'
import { api } from '@/lib/api'
import { authStore } from '@/lib/auth-store'

import { SignInPage } from '../sign-in-page'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}))

const ok = (data: unknown) => ({ data: { success: true, message: '', data } })

const bundle = {
  user: { id: 7, username: 'u', role: 1 },
  access_token: 'tok-7',
  token_type: 'Bearer',
  access_expires_at: 9_999_999_999,
  session: { sid: 's', current: true, login_method: 'password', expires_at: 9_999_999_999 },
}

function renderSignIn(status: Record<string, unknown> = {}) {
  vi.spyOn(api, 'get').mockImplementation(async () => ok(status))
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

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
  delete window.turnstile
  await setLang('zh')
  window.localStorage.clear()
})

describe('SignInPage options', () => {
  it('links to password recovery from the password form', () => {
    renderSignIn()
    expect(screen.getByRole('link', { name: '忘记密码？' })).toHaveAttribute('href', '/forgot-password')
  })

  it('shows only third-party sign-in when password sign-in is switched off', async () => {
    renderSignIn({ password_login_enabled: false, github_oauth: true, github_client_id: 'gh-client' })

    expect(await screen.findByRole('button', { name: '使用 GitHub 继续' })).toBeInTheDocument()
    expect(screen.queryByLabelText('用户名或邮箱')).toBeNull()
  })

  it('keeps sign-in disabled until the visitor accepts the terms', async () => {
    const user = userEvent.setup()
    renderSignIn({ user_agreement_enabled: true, privacy_policy_enabled: true })

    const consent = await screen.findByRole('checkbox')
    expect(screen.getByRole('button', { name: '继续' })).toBeDisabled()
    expect(screen.getByRole('link', { name: '用户协议' })).toHaveAttribute('href', '/user-agreement')
    await user.click(consent)
    expect(screen.getByRole('button', { name: '继续' })).toBeEnabled()
  })

  it('sends the human-check token with the password', async () => {
    const draw = vi.fn((_element: HTMLElement, options: Record<string, unknown>) => {
      ;(options.callback as (token: string) => void)('human-1')
      return 'widget-1'
    })
    window.turnstile = { render: draw }
    const post = vi.spyOn(api, 'post').mockResolvedValue(ok(bundle))
    const user = userEvent.setup()
    renderSignIn({ turnstile_check: true, turnstile_site_key: 'site-key' })

    await waitFor(() => expect(draw).toHaveBeenCalled())
    await user.type(screen.getByLabelText('用户名或邮箱'), 'u')
    await user.type(screen.getByLabelText('密码'), 'secret12')
    await user.click(screen.getByRole('button', { name: '继续' }))

    expect(await screen.findByText('keys page')).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith(
      '/api/user/login',
      { username: 'u', password: 'secret12' },
      expect.objectContaining({ params: { turnstile: 'human-1' } })
    )
  })

  it('accepts a backup code at the two-factor step', async () => {
    const post = vi.spyOn(api, 'post').mockImplementation(async (url: string) =>
      url === '/api/user/login' ? ok({ require_2fa: true, flow_token: 'flow-1' }) : ok(bundle)
    )
    const user = userEvent.setup()
    renderSignIn()

    await user.type(screen.getByLabelText('用户名或邮箱'), 'u')
    await user.type(screen.getByLabelText('密码'), 'secret12')
    await user.click(screen.getByRole('button', { name: '继续' }))
    await user.click(await screen.findByRole('button', { name: '改用备用码' }))
    await user.type(screen.getByLabelText('备用码'), 'ABCD-1234')
    await user.click(screen.getByRole('button', { name: '验证' }))

    expect(await screen.findByText('keys page')).toBeInTheDocument()
    expect(post).toHaveBeenLastCalledWith('/api/user/login/2fa', { code: 'ABCD-1234', flow_token: 'flow-1' }, expect.anything())
  })

  it('switches to the language saved in the account after signing in', async () => {
    vi.spyOn(api, 'post').mockResolvedValue(ok({ ...bundle, user: { ...bundle.user, setting: '{"language":"en"}' } }))
    const user = userEvent.setup()
    renderSignIn()

    await user.type(screen.getByLabelText('用户名或邮箱'), 'u')
    await user.type(screen.getByLabelText('密码'), 'secret12')
    await user.click(screen.getByRole('button', { name: '继续' }))

    expect(await screen.findByText('keys page')).toBeInTheDocument()
    expect(getLang()).toBe('en')
  })
})
