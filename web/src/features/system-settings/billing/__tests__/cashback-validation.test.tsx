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
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { SettingsPageProvider } from '../../components/settings-page-context'
import type { CashbackConfig } from '../../types'
import { CashbackSettingsForm } from '../cashback-settings-form'

const config: CashbackConfig = {
  inviter_enabled: false,
  invitee_enabled: false,
  inviter_rate_bps: 0,
  invitee_rate_bps: 0,
  settlement_days: 7,
  max_reward_quota: 1000,
  daily_reward_quota: 5000,
  ip_account_threshold: 3,
  device_account_threshold: 2,
  daily_topup_count_threshold: 5,
  first_enabled_at: 0,
  version: 1,
  compliance_confirmed: true,
}

let actionsContainer: HTMLDivElement | null = null
let queryClient: QueryClient | null = null

afterEach(() => {
  queryClient?.clear()
  actionsContainer?.remove()
  actionsContainer = null
  queryClient = null
})

function renderForm() {
  actionsContainer = document.createElement('div')
  document.body.append(actionsContainer)
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <SettingsPageProvider actionsContainer={actionsContainer}>
        <CashbackSettingsForm config={config} />
      </SettingsPageProvider>
    </QueryClientProvider>
  )
}

describe('cashback settings validation', () => {
  it('associates the immutable first-enable label with its read-only value', () => {
    renderForm()

    expect(screen.getByLabelText('First enabled at')).toHaveAttribute(
      'readonly'
    )
  })

  it('rejects an enabled direction with a zero rate', async () => {
    renderForm()

    fireEvent.click(screen.getByRole('switch', { name: 'Reward the inviter' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'Save cashback settings' })
    )

    expect(
      await screen.findByText(
        'Enabled inviter cashback requires a positive rate'
      )
    ).toBeInTheDocument()
  })

  it('rejects a combined rate above one hundred percent', async () => {
    renderForm()

    fireEvent.click(screen.getByRole('switch', { name: 'Reward the inviter' }))
    fireEvent.click(
      screen.getByRole('switch', { name: 'Reward the invited user' })
    )
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Inviter cashback rate (%)' }),
      {
        target: { value: '60' },
      }
    )
    fireEvent.change(
      screen.getByRole('spinbutton', {
        name: 'Invited user cashback rate (%)',
      }),
      { target: { value: '50' } }
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Save cashback settings' })
    )

    expect(
      await screen.findByText('Combined cashback rate cannot exceed 100%')
    ).toBeInTheDocument()
  })
})
