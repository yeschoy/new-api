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
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'

import { api } from '@/lib/api'
import { authStore } from '@/lib/auth-store'

import { browser } from '../oauth-flow'
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
  session: { sid: 's', current: true, login_method: 'oauth', expires_at: 9_999_999_999 },
}

function renderSignIn(status: Record<string, unknown>, path = '/sign-in') {
  const get = vi.spyOn(api, 'get').mockImplementation(async (url: string) => (url === '/api/status' ? ok(status) : ok(bundle)))
  const router = createMemoryRouter(
    [
      { path: '/sign-in', element: <SignInPage /> },
      { path: '/settings/keys', element: <p>keys page</p> },
    ],
    { initialEntries: [path] }
  )
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
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'credentials')
  authStore.clear()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe('third-party sign-in', () => {
  it('shows a button for each sign-in the site switched on', async () => {
    renderSignIn({ github_oauth: true, github_client_id: 'gh-client', linuxdo_oauth: true, linuxdo_client_id: 'ld-client' })

    expect(await screen.findByRole('button', { name: '使用 GitHub 继续' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '使用 LinuxDO 继续' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '使用 Discord 继续' })).toBeNull()
    expect(screen.queryByRole('button', { name: '使用微信继续' })).toBeNull()
    expect(screen.queryByRole('button', { name: '使用 Passkey 登录' })).toBeNull()
  })

  it('sends the visitor to GitHub with a fresh state and remembers where to return', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(ok({ flow_token: 'state-1', expires_at: 1 }))
    const assign = vi.spyOn(browser, 'assign').mockImplementation(() => undefined)
    const user = userEvent.setup()
    renderSignIn({ github_oauth: true, github_client_id: 'gh-client' }, '/sign-in?redirect=%2Factivity')

    await user.click(await screen.findByRole('button', { name: '使用 GitHub 继续' }))

    expect(post).toHaveBeenCalledWith('/api/oauth/state', { provider: 'github', intent: 'login' })
    const target = new URL(assign.mock.calls[0][0])
    expect(target.origin + target.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(target.searchParams.get('client_id')).toBe('gh-client')
    expect(target.searchParams.get('state')).toBe('state-1')
    expect(window.sessionStorage.getItem('oauth_sign_in_redirect')).toBe('/activity')
  })

  it('carries a remembered invite code into a third-party sign-up', async () => {
    window.localStorage.setItem('aff', 'AB12')
    const post = vi.spyOn(api, 'post').mockResolvedValue(ok({ flow_token: 'state-2' }))
    vi.spyOn(browser, 'assign').mockImplementation(() => undefined)
    const user = userEvent.setup()
    renderSignIn({ linuxdo_oauth: true, linuxdo_client_id: 'ld-client' })

    await user.click(await screen.findByRole('button', { name: '使用 LinuxDO 继续' }))

    expect(post).toHaveBeenCalledWith('/api/oauth/state', { provider: 'linuxdo', intent: 'login', aff: 'AB12' })
  })

  it('names OIDC after the operator and sends custom providers back to their own callback', async () => {
    vi.spyOn(api, 'post').mockResolvedValue(ok({ flow_token: 'state-3' }))
    const assign = vi.spyOn(browser, 'assign').mockImplementation(() => undefined)
    const user = userEvent.setup()
    renderSignIn({
      oidc_enabled: true,
      oidc_client_id: 'oidc-client',
      oidc_authorization_endpoint: 'https://sso.example.com/auth',
      oidc_display_name: 'Company SSO',
      custom_oauth_providers: [
        { id: 3, name: 'Acme', slug: 'acme', client_id: 'acme-client', authorization_endpoint: 'https://acme.example.com/authorize', scopes: 'openid email' },
      ],
    })

    expect(await screen.findByRole('button', { name: '使用 Company SSO 继续' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '使用 Acme 继续' }))

    const target = new URL(assign.mock.calls[0][0])
    expect(target.host).toBe('acme.example.com')
    expect(target.searchParams.get('redirect_uri')).toBe(`${window.location.origin}/oauth/acme`)
    expect(target.searchParams.get('scope')).toBe('openid email')
    expect(target.searchParams.get('state')).toBe('state-3')
  })

  it('signs in with the code sent by the WeChat official account', async () => {
    const user = userEvent.setup()
    const get = renderSignIn({ wechat_login: true, wechat_qrcode: 'https://example.com/qr.png' })

    await user.click(await screen.findByRole('button', { name: '使用微信继续' }))
    const dialog = screen.getByRole('dialog', { name: '微信登录' })
    expect(within(dialog).getByRole('img', { name: '微信公众号二维码' })).toHaveAttribute('src', 'https://example.com/qr.png')
    await user.type(within(dialog).getByLabelText('验证码'), '654321')
    await user.click(within(dialog).getByRole('button', { name: '登录' }))

    expect(await screen.findByText('keys page')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/api/oauth/wechat', expect.objectContaining({ params: { code: '654321' } }))
  })

  it('signs in through the Telegram login widget', async () => {
    const user = userEvent.setup()
    const get = renderSignIn({ telegram_oauth: true, telegram_bot_name: 'yeschoy_bot' })

    await user.click(await screen.findByRole('button', { name: '使用 Telegram 继续' }))
    const script = document.querySelector<HTMLScriptElement>('script[data-telegram-login]')
    expect(script?.dataset.telegramLogin).toBe('yeschoy_bot')
    const callback = (script?.dataset.onauth ?? '').replace('(user)', '')
    await act(async () => {
      ;(window as unknown as Record<string, (user: unknown) => void>)[callback]({ id: 42, auth_date: 1_700_000_000, hash: 'abc', username: 'tg' })
    })

    expect(await screen.findByText('keys page')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith(
      '/api/oauth/telegram/login',
      expect.objectContaining({ params: { id: 42, auth_date: 1_700_000_000, hash: 'abc', username: 'tg' } })
    )
  })

  it('signs in with a passkey', async () => {
    vi.stubGlobal('PublicKeyCredential', { isUserVerifyingPlatformAuthenticatorAvailable: async () => true })
    const assertion = {
      id: 'cred-1',
      rawId: new Uint8Array([1, 2, 3]).buffer,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      response: {
        authenticatorData: new Uint8Array([4]).buffer,
        clientDataJSON: new Uint8Array([5]).buffer,
        signature: new Uint8Array([6]).buffer,
        userHandle: null,
      },
      getClientExtensionResults: () => ({}),
    }
    const credentialsGet = vi.fn(async () => assertion)
    Object.defineProperty(navigator, 'credentials', { value: { get: credentialsGet }, configurable: true })
    const post = vi.spyOn(api, 'post').mockImplementation(async (url: string) =>
      url === '/api/user/passkey/login/begin'
        ? ok({ options: { publicKey: { challenge: 'AQID', allowCredentials: [{ id: 'BAUG', type: 'public-key' }] } }, flow_token: 'pk-flow' })
        : ok(bundle)
    )
    const user = userEvent.setup()
    renderSignIn({ passkey_login: true })

    await user.click(await screen.findByRole('button', { name: '使用 Passkey 登录' }))

    expect(await screen.findByText('keys page')).toBeInTheDocument()
    const options = (credentialsGet.mock.calls[0] as unknown as [{ publicKey: PublicKeyCredentialRequestOptions }])[0].publicKey
    expect(new Uint8Array(options.challenge as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]))
    expect(post).toHaveBeenLastCalledWith(
      '/api/user/passkey/login/finish',
      { flow_token: 'pk-flow', credential: expect.objectContaining({ id: 'cred-1', rawId: 'AQID', type: 'public-key' }) },
      expect.anything()
    )
  })
})
