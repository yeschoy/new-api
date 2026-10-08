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
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { api } from '@/lib/api'
import { authStore } from '@/lib/auth-store'

import { SecurityPage } from '../security-page'
import { SESSION, USER, ok, renderAccountPage, signIn } from './render-account'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
}))

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

const RESPONSES = {
  '/api/status': {},
  '/api/user/self': USER,
  '/api/user/2fa/status': { enabled: false, locked: false },
  '/api/user/sessions': [
    { ...SESSION, ip: '1.2.3.4', user_agent: CHROME, created_at: 1, last_active_at: Math.floor(Date.now() / 1000) - 120 },
    { sid: 'sid-phone', current: false, login_method: 'oauth:github', ip: '5.6.7.8', user_agent: SAFARI, created_at: 1, last_active_at: 1, expires_at: 9_999_999_999 },
  ],
}

beforeEach(() => signIn())

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
})

describe('SecurityPage password', () => {
  it('changes the password and keeps this device signed in with the new token', async () => {
    const rotation = { access_token: 'rotated', token_type: 'Bearer', access_expires_at: 9_999_999_999, session: SESSION }
    const put = vi.spyOn(api, 'put').mockResolvedValue(ok(rotation))
    const user = userEvent.setup()
    renderAccountPage(<SecurityPage />, RESPONSES)

    await user.click(await screen.findByRole('button', { name: '修改密码' }))
    const dialog = screen.getByRole('dialog', { name: '修改密码' })
    await user.type(within(dialog).getByLabelText('当前密码'), 'old-pass-1')
    await user.type(within(dialog).getByLabelText('新密码'), 'new-pass-2')
    await user.type(within(dialog).getByLabelText('确认新密码'), 'new-pass-2')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    expect(await screen.findByText('密码已修改')).toBeInTheDocument()
    expect(put).toHaveBeenCalledWith('/api/user/self', { original_password: 'old-pass-1', password: 'new-pass-2' })
    expect(authStore.get().accessToken).toBe('rotated')
  })

  it('refuses a new password that is the same as the current one', async () => {
    const put = vi.spyOn(api, 'put')
    const user = userEvent.setup()
    renderAccountPage(<SecurityPage />, RESPONSES)

    await user.click(await screen.findByRole('button', { name: '修改密码' }))
    const dialog = screen.getByRole('dialog', { name: '修改密码' })
    await user.type(within(dialog).getByLabelText('当前密码'), 'same-pass-1')
    await user.type(within(dialog).getByLabelText('新密码'), 'same-pass-1')
    await user.type(within(dialog).getByLabelText('确认新密码'), 'same-pass-1')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))

    expect(within(dialog).getByRole('alert')).toHaveTextContent('新密码不能与当前密码相同')
    expect(put).not.toHaveBeenCalled()
  })
})

describe('SecurityPage access token', () => {
  it('shows a regenerated access token once', async () => {
    const user = userEvent.setup()
    const get = renderAccountPage(<SecurityPage />, { ...RESPONSES, '/api/user/token': 'fresh-access-token' })

    await user.click(await screen.findByRole('button', { name: '重新生成' }))
    await user.click(screen.getByRole('button', { name: '确认' }))

    expect(await screen.findByText('fresh-access-token')).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('/api/user/token')
  })
})

describe('SecurityPage devices', () => {
  it('lists signed-in devices with this one marked', async () => {
    renderAccountPage(<SecurityPage />, RESPONSES)

    expect(await screen.findByText('Chrome · Windows')).toBeInTheDocument()
    expect(screen.getByText('当前设备')).toBeInTheDocument()
    expect(screen.getByText('Safari · iOS')).toBeInTheDocument()
    expect(screen.getByText(/第三方登录 · GitHub/)).toBeInTheDocument()
  })

  it('signs the other devices out after confirming', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(ok({ revoked_count: 1 }))
    const user = userEvent.setup()
    renderAccountPage(<SecurityPage />, RESPONSES)

    await user.click(await screen.findByRole('button', { name: '退出其他设备' }))
    await user.click(screen.getByRole('button', { name: '确认' }))

    expect(await screen.findByText('已退出其他设备')).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith('/api/user/sessions/revoke-others')
  })

  it('signs out here when this device is removed', async () => {
    const remove = vi.spyOn(api, 'delete').mockResolvedValue(ok({ revoked_sid: SESSION.sid, current: true }))
    const user = userEvent.setup()
    renderAccountPage(<SecurityPage />, RESPONSES)

    await screen.findByText('Chrome · Windows')
    await user.click(screen.getByRole('button', { name: '退出' }))
    await user.click(screen.getByRole('button', { name: '确认' }))

    expect(await screen.findByText('sign-in page')).toBeInTheDocument()
    expect(remove).toHaveBeenCalledWith(`/api/user/sessions/${SESSION.sid}`)
    expect(authStore.get().status).toBe('anonymous')
  })
})

describe('SecurityPage account deletion', () => {
  it('deletes the account only once the username is typed', async () => {
    const remove = vi.spyOn(api, 'delete').mockResolvedValue(ok(null))
    vi.spyOn(api, 'post').mockResolvedValue(ok(null))
    const user = userEvent.setup()
    renderAccountPage(<SecurityPage />, RESPONSES)

    await user.click(await screen.findByRole('button', { name: '删除账户' }))
    const dialog = screen.getByRole('dialog', { name: '删除账户' })
    const confirm = within(dialog).getByRole('button', { name: '删除账户' })
    expect(confirm).toBeDisabled()
    await user.type(within(dialog).getByRole('textbox'), 'alice')
    await user.click(confirm)

    expect(await screen.findByText('sign-in page')).toBeInTheDocument()
    expect(remove).toHaveBeenCalledWith('/api/user/self')
  })

  it('offers no deletion to the super administrator', async () => {
    authStore.clear()
    signIn({ ...USER, role: 100 })
    renderAccountPage(<SecurityPage />, { ...RESPONSES, '/api/user/self': { ...USER, role: 100 } })

    await screen.findByRole('button', { name: '修改密码' })
    expect(screen.queryByRole('button', { name: '删除账户' })).toBeNull()
  })
})
