/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { QueryClient } from '@tanstack/react-query'
import { act, screen, within } from '@testing-library/react'
import i18next from 'i18next'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { CashbackActivityPage } from '@/features/cashback-activity'
import zh from '@/i18n/locales/zh.json'
import { Route } from '@/routes/activity'
import { useAuthStore } from '@/stores/auth-store'
import { createTestAuthBundle } from '@/test-utils/auth-bundle'
import { renderApp } from '@/test-utils/render-app'

let client: QueryClient
const originalAuth = useAuthStore.getState()

beforeEach(() => {
  useAuthStore.getState().auth.reset()
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  client.setQueryData(['status'], {}, { updatedAt: Date.now() + 60_000 })
})

afterEach(async () => {
  client.clear()
  useAuthStore.setState(originalAuth)
  await act(() => i18next.changeLanguage('en'))
})

describe('public cashback activity page', () => {
  it('registers a public route and links guests to registration without claiming fixed rewards', async () => {
    expect(Route.options.component).toBe(CashbackActivityPage)
    await renderApp(<CashbackActivityPage />, client)

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Top-up and inviter cashback',
      })
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Top-up rewards' })
    ).toBeVisible()
    expect(
      screen.getByRole('heading', { name: 'Invite rewards' })
    ).toBeVisible()
    expect(
      screen.getByText(/current campaign, eligibility and limits/)
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'Get started' })).toHaveAttribute(
      'href',
      '/sign-up'
    )
    expect(
      within(
        screen.getByRole('navigation', { name: 'Main navigation' })
      ).getByRole('link', { name: 'Offers' })
    ).toHaveAttribute('aria-current', 'page')
  })

  it('updates the navigation and both offer descriptions when language changes', async () => {
    i18next.addResourceBundle('zhCN', 'translation', zh.translation, true, true)
    await renderApp(<CashbackActivityPage />, client)

    await act(() => i18next.changeLanguage('zhCN'))

    expect(
      within(screen.getByRole('navigation', { name: '主导航' })).getByRole(
        'link',
        { name: '活动' }
      )
    ).toHaveAttribute('href', '/activity')
    expect(screen.getByRole('heading', { name: '充值返现' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '邀请返现' })).toBeVisible()
  })

  it('sends signed-in users to the wallet for their own offer and referral link', async () => {
    useAuthStore.getState().auth.setBundle(createTestAuthBundle())
    await renderApp(<CashbackActivityPage />, client)

    expect(screen.getByRole('link', { name: 'Wallet' })).toHaveAttribute(
      'href',
      '/wallet'
    )
    expect(
      screen.getByRole('link', { name: 'Your Referral Link' })
    ).toHaveAttribute('href', '/wallet')
  })
})
