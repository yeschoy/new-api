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
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { api } from '@/lib/api'
import { authStore } from '@/lib/auth-store'
import { RedeemPanel } from '@/pages/console/credits-redeem'

import { parseWalletInfo } from '../topup-rules'
import { answerGets, ok, renderPage, signIn } from './render'

beforeEach(() => {
  answerGets({ '/api/status': { quota_per_unit: 500_000 } })
  signIn()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
})

describe('redemption codes', () => {
  it('hides the code form while the site has codes switched off', async () => {
    renderPage(<RedeemPanel info={parseWalletInfo({ enable_redemption: false })} />)
    expect(await screen.findByText('本站暂未开放兑换码充值，请联系管理员。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '兑换' })).toBeNull()
    expect(screen.queryByPlaceholderText('兑换码')).toBeNull()
  })

  it('adds the redeemed credit and says how much', async () => {
    const post = vi.spyOn(api, 'post').mockImplementation(async () => ok(2_500_000))
    renderPage(<RedeemPanel info={parseWalletInfo({ enable_redemption: true })} />)

    await userEvent.type(await screen.findByPlaceholderText('兑换码'), 'CODE-1')
    await userEvent.click(screen.getByRole('button', { name: '兑换' }))

    expect(await screen.findByText('兑换成功，已到账 $5')).toBeInTheDocument()
    expect(post).toHaveBeenCalledWith('/api/user/topup', { key: 'CODE-1' })
  })
})
