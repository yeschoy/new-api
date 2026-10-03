import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createInstance } from 'i18next'
import { I18nextProvider } from 'react-i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import { api } from '@/lib/api'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { UserQuotaDialog } from '../user-quota-dialog'

const i18n = createInstance()
await i18n.init({ lng: 'en', resources: { en }, initAsync: false })

beforeEach(() => {
  useSystemConfigStore.getState().setConfig({
    currency: {
      ...DEFAULT_CURRENCY_CONFIG,
      quotaDisplayType: 'CNY',
      usdExchangeRate: 7.3,
    },
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  useSystemConfigStore
    .getState()
    .setConfig({ currency: { ...DEFAULT_CURRENCY_CONFIG } })
})

function showDialog() {
  render(
    <I18nextProvider i18n={i18n}>
      <UserQuotaDialog
        open
        onOpenChange={vi.fn()}
        userId={42}
        currentQuota={0}
        onSuccess={vi.fn()}
      />
    </I18nextProvider>
  )
}

it.each([
  { rate: 7.3, credited: 6849315 },
  { rate: 1, credited: 50000000 },
])(
  'keeps the original CNY conversion at rate $rate and records the entered cents',
  async ({ rate, credited }) => {
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaDisplayType: 'CNY',
        usdExchangeRate: rate,
      },
    })
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { success: true } })
    showDialog()
    const dialog = screen.getByRole('dialog', { name: 'Adjust Quota' })
    await userEvent.type(
      screen.getByRole('spinbutton', { name: 'Amount (CNY)' }),
      '100'
    )
    expect(dialog).toHaveTextContent('Current quota: ¥0 +¥100 = ¥100')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/user/manage', {
        id: 42,
        action: 'add_quota',
        mode: 'add',
        value: credited,
        cny_cents: 10000,
      })
    )
  }
)

it('records exact cents for a positive fractional CNY input without changing the quota formula', async () => {
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true } })
  showDialog()
  await userEvent.type(
    screen.getByRole('spinbutton', { name: 'Amount (CNY)' }),
    '.01'
  )
  await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/user/manage', {
      id: 42,
      action: 'add_quota',
      mode: 'add',
      value: 685,
      cny_cents: 1,
    })
  )
})

it('recalculates the original conversion preview when the display rate changes while open', async () => {
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true } })
  showDialog()
  await userEvent.type(
    screen.getByRole('spinbutton', { name: 'Amount (CNY)' }),
    '100'
  )
  act(() =>
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaDisplayType: 'CNY',
        usdExchangeRate: 1,
      },
    })
  )
  expect(screen.getByRole('dialog')).toHaveTextContent(
    'Current quota: ¥0 +¥100 = ¥100'
  )
  await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      '/api/user/manage',
      expect.objectContaining({
        value: 50000000,
        cny_cents: 10000,
      })
    )
  )
})

it.each([
  {
    display: 'USD' as const,
    amount: '1',
    value: 500000,
    label: 'Amount (USD)',
  },
  {
    display: 'TOKENS' as const,
    amount: '100',
    value: 100,
    label: 'Amount (Tokens)',
  },
  {
    display: 'CUSTOM' as const,
    amount: '1',
    value: 500000,
    label: 'Amount (¤)',
  },
])(
  'keeps $display add as quota-only without claiming a CNY face value',
  async ({ display, amount, value, label }) => {
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaDisplayType: display,
        customCurrencyExchangeRate: 1,
      },
    })
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { success: true } })
    showDialog()
    await userEvent.type(
      screen.getByRole('spinbutton', { name: label }),
      amount
    )
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/user/manage', {
        id: 42,
        action: 'add_quota',
        mode: 'add',
        value,
      })
    )
  }
)

it.each([
  { amount: '0.001', value: 68 },
  { amount: '1.234567', value: 84559 },
  { amount: '1e-3', value: 68 },
])(
  'keeps sub-cent CNY $amount as quota-only rather than rounding a cash face value',
  async ({ amount, value }) => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { success: true } })
    showDialog()
    await userEvent.type(
      screen.getByRole('spinbutton', { name: 'Amount (CNY)' }),
      amount
    )
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/user/manage', {
        id: 42,
        action: 'add_quota',
        mode: 'add',
        value,
      })
    )
  }
)

it.each([
  { amount: '1e2', value: 6849315, cents: 10000 },
  { amount: '2.9e-1', value: 19863, cents: 29 },
  { amount: '1.2300', value: 84247, cents: 123 },
])(
  'records exact cents for representable CNY input $amount',
  async ({ amount, value, cents }) => {
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { success: true } })
    showDialog()
    await userEvent.type(
      screen.getByRole('spinbutton', { name: 'Amount (CNY)' }),
      amount
    )
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/user/manage', {
        id: 42,
        action: 'add_quota',
        mode: 'add',
        value,
        cny_cents: cents,
      })
    )
  }
)

it('clears an in-progress amount when the display currency changes, without relabeling it CNY', async () => {
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true } })
  useSystemConfigStore.getState().setConfig({
    currency: { ...DEFAULT_CURRENCY_CONFIG, quotaDisplayType: 'USD' },
  })
  showDialog()
  const amount = screen.getByRole('spinbutton', { name: 'Amount (USD)' })
  await userEvent.type(amount, '10')
  act(() =>
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaDisplayType: 'CNY',
        usdExchangeRate: 7.3,
      },
    })
  )
  expect(screen.getByRole('spinbutton', { name: 'Amount (CNY)' })).toHaveValue(
    null
  )
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled()
  expect(post).not.toHaveBeenCalled()
  await userEvent.type(
    screen.getByRole('spinbutton', { name: 'Amount (CNY)' }),
    '1'
  )
  await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/user/manage', {
      id: 42,
      action: 'add_quota',
      mode: 'add',
      value: 68493,
      cny_cents: 100,
    })
  )
})

it('clears CNY input on switching to USD and never resurrects it on switching back', async () => {
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true } })
  showDialog()
  await userEvent.type(
    screen.getByRole('spinbutton', { name: 'Amount (CNY)' }),
    '10'
  )
  act(() =>
    useSystemConfigStore.getState().setConfig({
      currency: { ...DEFAULT_CURRENCY_CONFIG, quotaDisplayType: 'USD' },
    })
  )
  expect(screen.getByRole('spinbutton', { name: 'Amount (USD)' })).toHaveValue(
    null
  )
  act(() =>
    useSystemConfigStore.getState().setConfig({
      currency: {
        ...DEFAULT_CURRENCY_CONFIG,
        quotaDisplayType: 'CNY',
        usdExchangeRate: 7.3,
      },
    })
  )
  expect(screen.getByRole('spinbutton', { name: 'Amount (CNY)' })).toHaveValue(
    null
  )
  await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  expect(post).not.toHaveBeenCalled()
})

it('keeps subtract quota-only after an unrepresentable CNY add', async () => {
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true } })
  showDialog()
  await userEvent.click(screen.getByRole('button', { name: 'Subtract' }))
  await userEvent.type(
    screen.getByRole('spinbutton', { name: 'Amount (CNY)' }),
    '1'
  )
  await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/user/manage', {
      id: 42,
      action: 'add_quota',
      mode: 'subtract',
      value: 68493,
    })
  )
})

it('keeps override on its original display conversion without sending CNY cents', async () => {
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true } })
  showDialog()
  await userEvent.click(screen.getByRole('button', { name: 'Override' }))
  await userEvent.type(
    screen.getByRole('spinbutton', { name: 'Amount (CNY)' }),
    '1'
  )
  await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith('/api/user/manage', {
      id: 42,
      action: 'add_quota',
      mode: 'override',
      value: 68493,
    })
  )
})
