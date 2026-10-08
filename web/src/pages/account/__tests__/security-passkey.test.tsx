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
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { api } from '@/lib/api'
import { authStore } from '@/lib/auth-store'

import { SecurityPage } from '../security-page'
import { SESSION, USER, ok, renderAccountPage, signIn } from './render-account'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}))

const ROTATION = { access_token: 'rotated', token_type: 'Bearer', access_expires_at: 9_999_999_999, session: SESSION }

const attestation = {
  id: 'cred-new',
  rawId: new Uint8Array([9]).buffer,
  type: 'public-key',
  authenticatorAttachment: 'platform',
  response: { attestationObject: new Uint8Array([1]).buffer, clientDataJSON: new Uint8Array([2]).buffer, getTransports: () => ['internal'] },
  getClientExtensionResults: () => ({}),
}

function responses(extra: Record<string, unknown>) {
  return {
    '/api/status': { passkey_login: true },
    '/api/user/self': USER,
    '/api/user/2fa/status': { enabled: false, locked: false },
    '/api/user/passkey': { enabled: false },
    '/api/user/sessions': [],
    ...extra,
  }
}

function mockRegistration() {
  return vi.spyOn(api, 'post').mockImplementation(async (url: string) => {
    if (url === '/api/verify') return ok({ proof_token: 'proof-1', method: '2fa', scope: 'passkey.register' })
    if (url === '/api/user/passkey/register/begin') {
      return ok({ options: { publicKey: { challenge: 'AQID', user: { id: 'BAUG', name: 'alice' }, rp: { name: 'yeschoy' } } }, flow_token: 'reg-1' })
    }
    return ok(ROTATION)
  })
}

beforeEach(() => {
  signIn()
  vi.stubGlobal('PublicKeyCredential', { isUserVerifyingPlatformAuthenticatorAvailable: async () => true })
  Object.defineProperty(navigator, 'credentials', { value: { create: vi.fn(async () => attestation), get: vi.fn() }, configurable: true })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'credentials')
  authStore.clear()
})

describe('SecurityPage passkeys', () => {
  it('adds a passkey straight away when two-step verification is off', async () => {
    const post = mockRegistration()
    const user = userEvent.setup()
    renderAccountPage(<SecurityPage />, responses({}))

    await user.click(await screen.findByRole('button', { name: '添加 Passkey' }))

    expect(await screen.findByText('Passkey 已添加')).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith(
      '/api/user/passkey/register/finish',
      { flow_token: 'reg-1', credential: expect.objectContaining({ id: 'cred-new', rawId: 'CQ' }) },
      { headers: undefined }
    )
    expect(authStore.get().accessToken).toBe('rotated')
  })

  it('asks for an authenticator code first when two-step verification is on', async () => {
    const post = mockRegistration()
    const user = userEvent.setup()
    renderAccountPage(<SecurityPage />, responses({ '/api/user/2fa/status': { enabled: true, locked: false, backup_codes_remaining: 4 } }))

    await user.click(await screen.findByRole('button', { name: '添加 Passkey' }))
    const dialog = screen.getByRole('dialog', { name: '安全验证' })
    await user.type(within(dialog).getByLabelText('验证码'), '123456')
    await user.click(within(dialog).getByRole('button', { name: '验证' }))

    // Toasts outlive a test, so wait for the registration itself.
    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/user/passkey/register/finish', expect.anything(), expect.anything()))
    expect(post).toHaveBeenCalledWith('/api/verify', { method: '2fa', code: '123456', scope: 'passkey.register' })
    expect(post).toHaveBeenCalledWith('/api/user/passkey/register/begin', undefined, { headers: { 'X-Security-Proof': 'proof-1' } })
  })

  it('shows nothing about passkeys when the site has them off and none is registered', async () => {
    renderAccountPage(<SecurityPage />, responses({ '/api/status': {} }))

    await screen.findByRole('button', { name: '修改密码' })
    expect(screen.queryByRole('button', { name: '添加 Passkey' })).toBeNull()
  })
})
