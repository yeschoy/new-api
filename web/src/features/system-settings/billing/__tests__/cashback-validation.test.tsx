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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import dayjs from 'dayjs'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAppQueryClient } from '@/lib/query-client'

import { SettingsPageProvider } from '../../components/settings-page-context'
import type { CashbackConfig } from '../../types'
import { CashbackCampaigns } from '../cashback-campaigns'
import { CashbackSettingsForm } from '../cashback-settings-form'

const {
  updateCashbackConfig,
  listCashbackCampaigns,
  createCashbackCampaign,
  stopCashbackCampaign,
} = vi.hoisted(() => ({
  updateCashbackConfig: vi.fn(),
  listCashbackCampaigns: vi.fn(),
  createCashbackCampaign: vi.fn(),
  stopCashbackCampaign: vi.fn(),
}))

vi.mock('../../api', () => ({
  updateCashbackConfig,
  listCashbackCampaigns,
  createCashbackCampaign,
  stopCashbackCampaign,
}))

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
  auto_review_enabled: false,
  low_review_required: false,
  medium_review_required: false,
  high_review_required: true,
  severe_review_required: true,
  auto_review_immediate_issue: true,
  first_enabled_at: 0,
  version: 1,
  compliance_confirmed: true,
}

let actionsContainer: HTMLDivElement | null = null
let queryClient: QueryClient | null = null

beforeEach(() => {
  updateCashbackConfig.mockReset()
  listCashbackCampaigns.mockReset()
  createCashbackCampaign.mockReset()
  stopCashbackCampaign.mockReset()
  listCashbackCampaigns.mockResolvedValue({ success: true, data: [] })
})

afterEach(() => {
  vi.restoreAllMocks()
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

  it('presents malformed configuration errors as an accessible form error', async () => {
    updateCashbackConfig.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        data: { field: 'config', message: 'Malformed cashback configuration' },
      },
    })
    renderForm()

    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Settlement delay (days)' }),
      { target: { value: '8' } }
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Save cashback settings' })
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Malformed cashback configuration'
    )
  })

  it('sends all risk bands and immediate issuance independently when automatic payer review is enabled', async () => {
    updateCashbackConfig.mockResolvedValue({ success: true, data: config })
    renderForm()

    fireEvent.click(
      screen.getByRole('switch', { name: 'Enable automatic payer review' })
    )
    fireEvent.click(
      screen.getByRole('switch', { name: 'Manual review: high risk' })
    )
    fireEvent.click(
      screen.getByRole('switch', {
        name: 'Issue automatically approved payer rewards immediately',
      })
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Save cashback settings' })
    )

    await waitFor(() =>
      expect(updateCashbackConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          auto_review_enabled: true,
          low_review_required: false,
          medium_review_required: false,
          high_review_required: false,
          severe_review_required: true,
          auto_review_immediate_issue: false,
        }),
        expect.anything()
      )
    )
  })

  it('rejects a combined rate above one hundred percent', async () => {
    renderForm()

    fireEvent.click(screen.getByRole('switch', { name: 'Reward the inviter' }))
    fireEvent.click(
      screen.getByRole('switch', { name: 'Reward the top-up payer' })
    )
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Inviter cashback rate (%)' }),
      {
        target: { value: '60' },
      }
    )
    fireEvent.change(
      screen.getByRole('spinbutton', {
        name: 'Top-up payer cashback rate (%)',
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

describe('cashback campaigns', () => {
  function renderCampaigns() {
    queryClient = createAppQueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <CashbackCampaigns />
      </QueryClientProvider>
    )
  }

  it('rejects an invalid window and count before calling the campaign API', async () => {
    renderCampaigns()
    fireEvent.change(screen.getByLabelText('Campaign start'), {
      target: { value: dayjs().add(2, 'hour').format('YYYY-MM-DDTHH:mm') },
    })
    fireEvent.change(screen.getByLabelText('Campaign end'), {
      target: { value: dayjs().add(1, 'hour').format('YYYY-MM-DDTHH:mm') },
    })
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Rewards per payer' }),
      { target: { value: '0' } }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create campaign' }))
    expect(
      await screen.findByText('Campaign end must be after the start')
    ).toBeVisible()
    expect(
      screen.getByText('Reward limit must be between 1 and 100000')
    ).toBeVisible()
    expect(createCashbackCampaign).not.toHaveBeenCalled()
  })

  it('shows the backend reason instead of the HTTP status when creating a campaign fails', async () => {
    const errorToast = vi.spyOn(toast, 'error').mockReturnValue('error')
    createCashbackCampaign.mockRejectedValueOnce(
      Object.assign(new Error('Request failed with status code 409'), {
        isAxiosError: true,
        response: {
          status: 409,
          data: { success: false, message: 'Campaign window overlaps' },
        },
      })
    )
    renderCampaigns()
    await screen.findByText('No campaigns created yet')
    fireEvent.change(screen.getByLabelText('Campaign start'), {
      target: { value: dayjs().add(2, 'hour').format('YYYY-MM-DDTHH:mm') },
    })
    fireEvent.change(screen.getByLabelText('Campaign end'), {
      target: { value: dayjs().add(1, 'day').format('YYYY-MM-DDTHH:mm') },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create campaign' }))

    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith('Campaign window overlaps')
    )
    expect(errorToast).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('Campaign start')).not.toHaveValue('')
  })

  it('shows the backend reason and keeps confirmation open when stopping a campaign fails', async () => {
    const errorToast = vi.spyOn(toast, 'error').mockReturnValue('error')
    const start = dayjs().add(2, 'hour').startOf('minute')
    listCashbackCampaigns.mockResolvedValueOnce({
      success: true,
      data: [
        {
          id: 3,
          start_at: start.unix(),
          end_at: start.add(1, 'day').unix(),
          stopped_at: 0,
          stopped_by: 0,
          created_by: 9,
          max_rewards_per_user: 1,
          created_at: start.unix(),
          status: 'planned',
        },
      ],
    })
    stopCashbackCampaign.mockRejectedValueOnce(
      Object.assign(new Error('Request failed with status code 409'), {
        isAxiosError: true,
        response: {
          status: 409,
          data: { success: false, message: 'Campaign cannot be stopped' },
        },
      })
    )
    renderCampaigns()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Stop campaign' })
    )
    fireEvent.click(screen.getByRole('button', { name: 'Stop campaign' }))

    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith('Campaign cannot be stopped')
    )
    expect(errorToast).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Stop campaign early?')).toBeVisible()
  })

  it('allows dismissing a pending stop while keeping confirmation disabled and refreshing after success', async () => {
    const successToast = vi.spyOn(toast, 'success').mockReturnValue('success')
    const start = dayjs().add(2, 'hour').startOf('minute')
    const campaign = {
      id: 3,
      start_at: start.unix(),
      end_at: start.add(1, 'day').unix(),
      stopped_at: 0,
      stopped_by: 0,
      created_by: 9,
      max_rewards_per_user: 1,
      created_at: start.unix(),
      status: 'planned' as const,
    }
    listCashbackCampaigns.mockResolvedValue({ success: true, data: [campaign] })
    let finishStop = () => {}
    stopCashbackCampaign.mockImplementation(() => new Promise((resolve) => {
      finishStop = () => resolve({ success: true, data: { ...campaign, status: 'ended' } })
    }))
    renderCampaigns()
    fireEvent.click(await screen.findByRole('button', { name: 'Stop campaign' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stop campaign' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop campaign' })).toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByText('Stop campaign early?')).not.toBeInTheDocument())

    finishStop()
    await waitFor(() => expect(successToast).toHaveBeenCalledWith('Campaign stopped'))
    await waitFor(() => expect(listCashbackCampaigns).toHaveBeenCalledTimes(2))
    expect(stopCashbackCampaign).toHaveBeenCalledTimes(1)
  })

  it('reports a stop failure even after the pending dialog is dismissed', async () => {
    const errorToast = vi.spyOn(toast, 'error').mockReturnValue('error')
    const start = dayjs().add(2, 'hour').unix()
    listCashbackCampaigns.mockResolvedValue({
      success: true,
      data: [{ id: 3, start_at: start, end_at: start + 86400,
        stopped_at: 0, stopped_by: 0, created_by: 9,
        max_rewards_per_user: 1, created_at: start, status: 'planned' }],
    })
    let failStop = () => {}
    stopCashbackCampaign.mockImplementation(() => new Promise((_resolve, reject) => {
      failStop = () => reject(new Error('Campaign cannot be stopped'))
    }))
    renderCampaigns()
    fireEvent.click(await screen.findByRole('button', { name: 'Stop campaign' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stop campaign' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop campaign' })).toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByText('Stop campaign early?')).not.toBeInTheDocument())

    failStop()
    await waitFor(() => expect(errorToast).toHaveBeenCalledWith('Campaign cannot be stopped'))
    expect(errorToast).toHaveBeenCalledTimes(1)
    expect(listCashbackCampaigns).toHaveBeenCalledTimes(1)
  })

  it.each(['Escape', 'Close'])(
    'dismisses the pending stop with %s while leaving the request in flight',
    async (dismiss) => {
      const start = dayjs().add(2, 'hour').unix()
      listCashbackCampaigns.mockResolvedValue({
        success: true,
        data: [{ id: 3, start_at: start, end_at: start + 86400,
          stopped_at: 0, stopped_by: 0, created_by: 9,
          max_rewards_per_user: 1, created_at: start, status: 'planned' }],
      })
      stopCashbackCampaign.mockImplementation(() => new Promise(() => {}))
      renderCampaigns()
      fireEvent.click(await screen.findByRole('button', { name: 'Stop campaign' }))
      fireEvent.click(screen.getByRole('button', { name: 'Stop campaign' }))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Stop campaign' })).toBeDisabled())

      if (dismiss === 'Escape') {
        fireEvent.keyDown(document, { key: 'Escape' })
      } else {
        fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      }
      await waitFor(() => expect(screen.queryByText('Stop campaign early?')).not.toBeInTheDocument())
      expect(stopCashbackCampaign).toHaveBeenCalledTimes(1)
    }
  )

  it('creates a bounded campaign then confirms an early stop without editing its window', async () => {
    const start = dayjs().add(2, 'hour').startOf('minute')
    const end = start.add(1, 'day')
    const campaign = {
      id: 3,
      start_at: start.unix(),
      end_at: end.unix(),
      stopped_at: 0,
      stopped_by: 0,
      created_by: 9,
      max_rewards_per_user: 1,
      created_at: start.unix(),
      status: 'planned',
    }
    createCashbackCampaign.mockResolvedValue({ success: true, data: campaign })
    stopCashbackCampaign.mockResolvedValue({
      success: true,
      data: { ...campaign, stopped_at: start.unix(), status: 'ended' },
    })
    listCashbackCampaigns
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [campaign] })
    renderCampaigns()
    await screen.findByText('No campaigns created yet')
    fireEvent.change(screen.getByLabelText('Campaign start'), {
      target: { value: start.format('YYYY-MM-DDTHH:mm') },
    })
    fireEvent.change(screen.getByLabelText('Campaign end'), {
      target: { value: end.format('YYYY-MM-DDTHH:mm') },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create campaign' }))
    await waitFor(() =>
      expect(createCashbackCampaign).toHaveBeenCalledWith(
        { start_at: start.unix(), end_at: end.unix(), max_rewards_per_user: 1 },
        expect.anything()
      )
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Stop campaign' })
    )
    expect(stopCashbackCampaign).not.toHaveBeenCalled()
    await screen.findByText('Stop campaign early?')
    fireEvent.click(screen.getByRole('button', { name: 'Stop campaign' }))
    await waitFor(() =>
      expect(stopCashbackCampaign).toHaveBeenCalledWith(3)
    )
  })
})
