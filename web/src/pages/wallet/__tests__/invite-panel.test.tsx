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

import { InvitePanel } from '../invite-panel'
import { USER, ok, renderPage, signIn } from './render'

function answer(user: Record<string, unknown> = USER) {
  const responses: Record<string, unknown> = {
    '/api/status': { quota_per_unit: 500_000 },
    '/api/user/self': user,
    '/api/user/aff': 'AB12',
  }
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => ok(responses[url] ?? {}))
}

beforeEach(() => signIn())

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
})

const LINK = `${window.location.origin}/sign-up?aff=AB12`

describe('invitations', () => {
  it('shows the invite link and what invites have earned', async () => {
    answer()
    renderPage(<InvitePanel complianceConfirmed />)
    expect(await screen.findByDisplayValue(LINK)).toBeInTheDocument()
    expect(within(screen.getByText('待转入').parentElement as HTMLElement).getByText('$3')).toBeInTheDocument()
    expect(within(screen.getByText('累计奖励').parentElement as HTMLElement).getByText('$5')).toBeInTheDocument()
    expect(within(screen.getByText('邀请人数').parentElement as HTMLElement).getByText('3')).toBeInTheDocument()
  })

  it('copies the invite link', async () => {
    answer()
    const user = userEvent.setup()
    renderPage(<InvitePanel complianceConfirmed />)
    await screen.findByDisplayValue(LINK)

    await user.click(screen.getByRole('button', { name: '复制链接' }))

    expect(await navigator.clipboard.readText()).toBe(LINK)
  })

  it('moves rewards into the balance', async () => {
    answer()
    const post = vi.spyOn(api, 'post').mockImplementation(async () => ({ data: { success: true, message: '划转成功', data: null } }))
    renderPage(<InvitePanel complianceConfirmed />)
    await userEvent.click(await screen.findByRole('button', { name: '转入余额' }))
    const dialog = await screen.findByRole('dialog', { name: '转入余额' })
    const amount = within(dialog).getByLabelText('转入金额')
    expect(amount).toHaveValue('1')

    await userEvent.clear(amount)
    await userEvent.type(amount, '2')
    await userEvent.click(within(dialog).getByRole('button', { name: '转入' }))

    await waitFor(() => expect(post).toHaveBeenCalledWith('/api/user/aff_transfer', { quota: 1_000_000 }))
    expect(await screen.findByText('划转成功')).toBeInTheDocument()
    expect(dialog).not.toBeInTheDocument()
  })

  it('will not move less than the minimum or more than was earned', async () => {
    answer()
    renderPage(<InvitePanel complianceConfirmed />)
    await userEvent.click(await screen.findByRole('button', { name: '转入余额' }))
    const dialog = await screen.findByRole('dialog', { name: '转入余额' })
    const amount = within(dialog).getByLabelText('转入金额')
    const confirm = within(dialog).getByRole('button', { name: '转入' })

    await userEvent.clear(amount)
    await userEvent.type(amount, '0.5')
    expect(within(dialog).getByText('最少转入 $1')).toBeInTheDocument()
    expect(confirm).toBeDisabled()

    await userEvent.clear(amount)
    await userEvent.type(amount, '5')
    expect(within(dialog).getByText('超过可转入的奖励')).toBeInTheDocument()
    expect(confirm).toBeDisabled()
  })

  it('holds transfers while the site has not confirmed its payment terms', async () => {
    answer()
    renderPage(<InvitePanel complianceConfirmed={false} />)
    expect(await screen.findByRole('button', { name: '转入余额' })).toBeDisabled()
    expect(screen.getByText('管理员确认合规条款前，邀请奖励暂不能转入余额。')).toBeInTheDocument()
  })

  it('offers no transfer while there is nothing to move', async () => {
    answer({ ...USER, aff_quota: 0 })
    signIn({ ...USER, aff_quota: 0 })
    renderPage(<InvitePanel complianceConfirmed />)
    await screen.findByDisplayValue(LINK)
    expect(screen.queryByRole('button', { name: '转入余额' })).toBeNull()
  })
})
