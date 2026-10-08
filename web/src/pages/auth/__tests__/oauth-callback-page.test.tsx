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
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'

import { api } from '@/lib/api'
import { authStore } from '@/lib/auth-store'

import { OAuthCallbackPage } from '../oauth-callback-page'
import { browser } from '../oauth-flow'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}))

const ok = (data: unknown) => ({ data: { success: true, message: '', data } })

const bundle = {
  user: { id: 7, username: 'u', role: 1 },
  access_token: 'tok-7',
  token_type: 'Bearer',
  access_expires_at: 9_999_999_999,
  session: { sid: 's', current: true, login_method: 'oauth:github', expires_at: 9_999_999_999 },
}

function renderAt(path: string, answer: unknown = ok(bundle)) {
  const get = vi.spyOn(api, 'get').mockImplementation(async (url: string) => (url === '/api/status' ? ok({}) : answer))
  const router = createMemoryRouter(
    [
      { path: '/oauth/:provider', element: <OAuthCallbackPage /> },
      { path: '/activity', element: <p>activity page</p> },
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

/** A stand-in for the window that opened this popup. */
function fakeOpener() {
  const opener = { closed: false, postMessage: vi.fn() }
  Object.defineProperty(window, 'opener', { value: opener, configurable: true })
  return opener
}

function messageFrom(source: unknown, data: unknown) {
  const event = new Event('message')
  Object.defineProperties(event, {
    data: { value: data },
    origin: { value: window.location.origin },
    source: { value: source },
  })
  window.dispatchEvent(event)
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
  window.sessionStorage.clear()
  Object.defineProperty(window, 'opener', { value: null, configurable: true })
})

describe('OAuthCallbackPage', () => {
  it('signs in with the provider code and opens the page remembered before leaving', async () => {
    window.sessionStorage.setItem('oauth_sign_in_redirect', '/activity')
    const get = renderAt('/oauth/github?code=c1&state=s1')

    expect(await screen.findByText('activity page')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/api/oauth/github', expect.objectContaining({ params: { code: 'c1', state: 's1' } }))
    expect(authStore.get().user?.id).toBe(7)
  })

  it('shows why the provider sign-in failed', async () => {
    renderAt('/oauth/github?code=c1&state=s1', { data: { success: false, message: '该 GitHub 账户已被封禁' } })

    expect(await screen.findByText('该 GitHub 账户已被封禁')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回登录' })).toHaveAttribute('href', '/sign-in')
  })

  it('sends a custom-domain sign-in back to its own domain', async () => {
    const replace = vi.spyOn(browser, 'replace').mockImplementation(() => undefined)
    renderAt('/oauth/linuxdo?code=c1&state=s1', ok({ action: 'domain_login_handoff', target_origin: 'https://custom.example.com', ticket: 'tk-1' }))

    await waitFor(() => expect(replace).toHaveBeenCalledWith('https://custom.example.com/oauth/handoff#ticket=tk-1'))
  })

  it('passes a binding code back to the page that opened the popup', async () => {
    const opener = fakeOpener()
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined)
    window.sessionStorage.setItem('oauth_bind_flow:github', 's1')
    const get = renderAt('/oauth/github?code=c1&state=s1')

    await waitFor(() =>
      expect(opener.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'oauth:binding:callback', provider: 'github', code: 'c1', state: 's1' }),
        window.location.origin
      )
    )
    expect(screen.getByText('正在绑定 GitHub 账号')).toBeInTheDocument()
    await act(async () => messageFrom(opener, { type: 'oauth:binding:result', provider: 'github', state: 's1', success: true }))
    expect(close).toHaveBeenCalled()
    expect(get).not.toHaveBeenCalledWith('/api/oauth/github', expect.anything())
  })

  it('relays a Telegram binding result to the page that opened it', async () => {
    const opener = fakeOpener()
    vi.spyOn(window, 'close').mockImplementation(() => undefined)
    renderAt('/oauth/telegram?telegram_bind=error&flow_token=f1&error_code=TELEGRAM_BIND_ALREADY_BOUND')

    await waitFor(() =>
      expect(opener.postMessage).toHaveBeenCalledWith(
        { type: 'telegram:binding:result', flow_token: 'f1', success: false, code: 'TELEGRAM_BIND_ALREADY_BOUND' },
        window.location.origin
      )
    )
  })
})
