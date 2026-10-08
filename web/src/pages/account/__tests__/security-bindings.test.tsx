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
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { api } from '@/lib/api'
import { authStore } from '@/lib/auth-store'

import { SecurityPage } from '../security-page'
import { USER, ok, renderAccountPage, signIn } from './render-account'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}))

const STATUS = {
  github_oauth: true,
  github_client_id: 'gh-client',
  linuxdo_oauth: true,
  linuxdo_client_id: 'ld-client',
  wechat_login: true,
  wechat_qrcode: 'https://example.com/qr.png',
  custom_oauth_providers: [{ id: 3, name: 'Acme', slug: 'acme', client_id: 'acme-client', authorization_endpoint: 'https://acme.example.com/authorize' }],
}

function responses(user: Record<string, unknown> = USER) {
  return {
    '/api/status': STATUS,
    '/api/user/self': user,
    '/api/user/2fa/status': { enabled: false, locked: false },
    '/api/user/sessions': [],
    '/api/user/oauth/bindings': [{ provider_id: 3, provider_name: 'Acme', provider_slug: 'acme', provider_user_id: 'acme-user-1' }],
  }
}

/** A stand-in for the popup window.open returns. */
function fakePopup() {
  const items = new Map<string, string>()
  const popup = {
    closed: false,
    close: vi.fn(),
    postMessage: vi.fn(),
    location: { replace: vi.fn() },
    sessionStorage: { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) },
  }
  vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window)
  return popup
}

function messageFrom(source: unknown, data: unknown) {
  const event = new Event('message')
  Object.defineProperties(event, { data: { value: data }, origin: { value: window.location.origin }, source: { value: source } })
  window.dispatchEvent(event)
}

beforeEach(() => signIn())

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
})

describe('SecurityPage linked accounts', () => {
  it('shows each sign-in the site offers with whether it is linked', async () => {
    renderAccountPage(<SecurityPage />, responses({ ...USER, github_id: '12345' }))

    expect(await screen.findByText('12345')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '绑定 GitHub' })).toBeNull()
    expect(screen.getByRole('button', { name: '绑定 LinuxDO' })).toBeInTheDocument()
    expect(await screen.findByText('acme-user-1')).toBeInTheDocument()
  })

  it('links GitHub through a popup and reports the result back to it', async () => {
    const popup = fakePopup()
    const post = vi.spyOn(api, 'post').mockResolvedValue(ok({ flow_token: 'bind-state' }))
    const user = userEvent.setup()
    const get = renderAccountPage(<SecurityPage />, responses())

    await user.click(await screen.findByRole('button', { name: '绑定 GitHub' }))
    await waitFor(() => expect(popup.location.replace).toHaveBeenCalled())
    expect(post).toHaveBeenCalledWith('/api/oauth/state', { provider: 'github', intent: 'bind' })
    expect(new URL(popup.location.replace.mock.calls[0][0]).searchParams.get('state')).toBe('bind-state')
    expect(popup.sessionStorage.getItem('oauth_bind_flow:github')).toBe('bind-state')

    await act(async () => messageFrom(popup, { type: 'oauth:binding:callback', provider: 'github', state: 'bind-state', code: 'c9' }))

    expect(await screen.findByText('绑定成功')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/api/oauth/github', expect.objectContaining({ params: { state: 'bind-state', code: 'c9' } }))
    expect(popup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'oauth:binding:result', provider: 'github', state: 'bind-state', success: true }),
      window.location.origin
    )
  })

  it('unlinks a custom provider after confirming', async () => {
    const remove = vi.spyOn(api, 'delete').mockResolvedValue(ok(null))
    const user = userEvent.setup()
    renderAccountPage(<SecurityPage />, responses())

    await screen.findByText('acme-user-1')
    await user.click(screen.getByRole('button', { name: '解绑' }))
    await user.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() => expect(remove).toHaveBeenCalledWith('/api/user/oauth/bindings/3'))
  })

  it('links WeChat with the code from the official account', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(ok(null))
    const user = userEvent.setup()
    renderAccountPage(<SecurityPage />, responses())

    await user.click(await screen.findByRole('button', { name: '绑定 微信' }))
    const dialog = screen.getByRole('dialog', { name: '绑定微信' })
    await user.type(within(dialog).getByLabelText('验证码'), '777777')
    await user.click(within(dialog).getByRole('button', { name: '绑定' }))

    // Toasts outlive a test, so wait for the dialog to close after the binding.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(post).toHaveBeenCalledWith('/api/oauth/wechat/bind', { code: '777777' })
  })
})
