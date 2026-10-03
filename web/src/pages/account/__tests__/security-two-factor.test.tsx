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

const ROTATION = { access_token: 'rotated', token_type: 'Bearer', access_expires_at: 9_999_999_999, session: SESSION }

function responses(twoFactor: Record<string, unknown>) {
  return { '/api/status': {}, '/api/user/self': USER, '/api/user/2fa/status': twoFactor, '/api/user/sessions': [] }
}

beforeEach(() => signIn())

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
})

describe('SecurityPage two-step verification', () => {
  it('walks through turning it on: key, backup codes, then a code', async () => {
    const post = vi.spyOn(api, 'post').mockImplementation(async (url: string) =>
      url === '/api/user/2fa/setup'
        ? ok({ secret: 'SECRETKEY234', qr_code_data: 'otpauth://totp/yeschoy:alice?secret=SECRETKEY234', backup_codes: ['AAAA-BBBB', 'CCCC-DDDD'] })
        : ok(ROTATION)
    )
    const user = userEvent.setup()
    renderAccountPage(<SecurityPage />, responses({ enabled: false, locked: false }))

    await user.click(await screen.findByRole('button', { name: '启用两步验证' }))
    const dialog = screen.getByRole('dialog', { name: '启用两步验证' })
    expect(await within(dialog).findByText('SECRETKEY234')).toBeInTheDocument()
    expect(within(dialog).getByText('otpauth://totp/yeschoy:alice?secret=SECRETKEY234')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '下一步' }))
    expect(within(dialog).getByText('AAAA-BBBB')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '下一步' }))
    await user.type(within(dialog).getByLabelText('验证码'), '123456')
    await user.click(within(dialog).getByRole('button', { name: '启用' }))

    expect(await screen.findByText('两步验证已启用')).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith('/api/user/2fa/enable', { code: '123456' })
    expect(post.mock.calls.filter((call) => call[0] === '/api/user/2fa/setup')).toHaveLength(1)
    expect(authStore.get().accessToken).toBe('rotated')
  })

  it('shows the backup codes left and makes new ones after a code', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(ok({ ...ROTATION, backup_codes: ['NEWA-0001', 'NEWB-0002'] }))
    const user = userEvent.setup()
    renderAccountPage(<SecurityPage />, responses({ enabled: true, locked: false, backup_codes_remaining: 3 }))

    expect(await screen.findByText('剩余备用码 3 个。')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重新生成备用码' }))
    const dialog = screen.getByRole('dialog', { name: '重新生成备用码' })
    await user.type(within(dialog).getByLabelText('验证码'), '654321')
    await user.click(within(dialog).getByRole('button', { name: '生成新备用码' }))

    expect(await within(dialog).findByText('NEWA-0001')).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith('/api/user/2fa/backup_codes', { code: '654321' })
  })

  it('turns it off only after the risk is acknowledged', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue(ok(ROTATION))
    const user = userEvent.setup()
    renderAccountPage(<SecurityPage />, responses({ enabled: true, locked: false, backup_codes_remaining: 4 }))

    await user.click(await screen.findByRole('button', { name: '关闭两步验证' }))
    const dialog = screen.getByRole('dialog', { name: '关闭两步验证' })
    const confirm = within(dialog).getByRole('button', { name: '关闭两步验证' })
    await user.type(within(dialog).getByLabelText('验证码或备用码'), 'AAAA-BBBB')
    expect(confirm).toBeDisabled()
    await user.click(within(dialog).getByRole('checkbox'))
    await user.click(confirm)

    expect(await screen.findByText('两步验证已关闭')).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith('/api/user/2fa/disable', { code: 'AAAA-BBBB' })
  })
})
