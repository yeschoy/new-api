import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import i18next from 'i18next'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'
import { api } from '@/lib/api'

import { RecordedSpendReport } from '../components/recorded-spend-report'

const getReport = vi.hoisted(() => vi.fn())
vi.mock('../api', () => ({ getCashbackRecordedSpend: getReport }))

function renderReport() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <RecordedSpendReport />
    </QueryClientProvider>
  )
}

function search(user = '42') {
  fireEvent.change(screen.getByRole('textbox', { name: 'User ID' }), {
    target: { value: user },
  })
  fireEvent.click(screen.getByRole('button', { name: 'View last 30 days' }))
}

const opening = {
  event_id: 1,
  kind: 'opening',
  source_type: 'registration',
  source_id: 0,
  quota: 0,
  remaining_quota: 0,
  signed_amount_available: false,
}
const purchase = {
  event_id: 2,
  kind: 'purchase',
  source_type: 'topup',
  source_id: 7,
  trade_no: 'old-epay-order',
  payment_provider: 'epay',
  quota: 100,
  remaining_quota: 50,
  signed_amount_available: true,
}
const gift = {
  event_id: 3,
  kind: 'gift',
  source_type: 'cashback_reward',
  source_id: 8,
  quota: 10,
  remaining_quota: 10,
  signed_amount_available: false,
}
const code = {
  event_id: 4,
  kind: 'nonrefundable',
  source_type: 'redemption',
  source_id: 9,
  quota: 5,
  remaining_quota: 5,
  signed_amount_available: false,
}

function report(confirmed = false) {
  return {
    success: true,
    data: {
      user_id: 42,
      start_at: 100,
      end_at: 200,
      calculated_at: 200,
      source: 'optional_log_db_consume',
      log_status: 'available',
      settlement_assumed: true,
      refund_status: confirmed ? 'reference' : 'manual_reconciliation',
      manual_reason: confirmed
        ? undefined
        : 'cash_amount_or_currency_unconfirmed',
      wallet_quota: 65,
      net_spent_quota: 50,
      total_reference_cny_cents: confirmed ? 4500 : undefined,
      credits: [
        opening,
        { ...purchase, reference_cny_cents: confirmed ? 4500 : undefined },
        gift,
        code,
      ],
      top_ups: [], // The outstanding Epay purchase predates the display window.
      intervals: [
        {
          start_at: 100,
          end_at: 200,
          recorded_all_consume_log_quota: 20,
          recorded_consume_count: 1,
        },
      ],
    },
  }
}

beforeEach(async () => {
  i18next.addResourceBundle('zhCN', 'translation', zh.translation, true, true)
  i18next.addResourceBundle('zhTW', 'translation', zhTW.translation, true, true)
  await act(() => i18next.changeLanguage('en'))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('recorded spending report', () => {
  it('confirms an Epay order outside the window, then hides its CNY amount immediately on withdrawal and user change', async () => {
    getReport.mockImplementation(
      async (_id: number, _start: number, _end: number, ids: number[]) =>
        report(ids.includes(7))
    )
    renderReport()
    search()
    expect(
      await screen.findByText('old-epay-order', { exact: false })
    ).toBeVisible()
    expect(
      screen.getByText('Nonrefundable opening balance', { exact: false })
    ).toBeVisible()
    expect(
      screen.getByText('Wallet redemption code (nonrefundable)', {
        exact: false,
      })
    ).toBeVisible()
    expect(
      screen.getByText('Issued cashback gift (nonrefundable)', { exact: false })
    ).toBeVisible()
    expect(
      screen.queryByText('Total CNY manual refund reference:', { exact: false })
    ).not.toBeInTheDocument()
    const checkbox = screen.getByRole('checkbox', {
      name: /merchant actually received CNY/i,
    })
    fireEvent.click(checkbox)
    expect(
      await screen.findByText(/Total CNY manual refund reference:.*CN¥45\.00/)
    ).toBeVisible()
    expect(getReport).toHaveBeenLastCalledWith(
      42,
      expect.any(Number),
      expect.any(Number),
      [7]
    )

    fireEvent.click(
      screen.getByRole('checkbox', { name: /merchant actually received CNY/i })
    )
    expect(
      screen.queryByText(/Total CNY manual refund reference:/)
    ).not.toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.getByRole('checkbox', {
          name: /merchant actually received CNY/i,
        })
      ).not.toBeChecked()
    )
    expect(getReport).toHaveBeenLastCalledWith(
      42,
      expect.any(Number),
      expect.any(Number),
      []
    )

    fireEvent.click(
      screen.getByRole('checkbox', { name: /merchant actually received CNY/i })
    )
    expect(
      await screen.findByText(/Total CNY manual refund reference:/)
    ).toBeVisible()
    fireEvent.change(screen.getByRole('textbox', { name: 'User ID' }), {
      target: { value: '43' },
    })
    expect(
      screen.queryByText(/Total CNY manual refund reference:/)
    ).not.toBeInTheDocument()
    search('43')
    await waitFor(() =>
      expect(getReport).toHaveBeenLastCalledWith(
        43,
        expect.any(Number),
        expect.any(Number),
        []
      )
    )
  })

  it('shows observed intervals independently of FIFO while unavailable logs never become zero consumption', async () => {
    getReport.mockResolvedValueOnce({
      ...report(true),
      data: {
        ...report(true).data,
        log_status: 'unavailable',
        intervals: [],
        top_ups: [
          {
            id: 7,
            trade_no: 'old-epay-order',
            complete_time: 150,
            payment_provider: 'epay',
            purchased_quota: 100,
            remaining_purchase_quota: 50,
            remaining_gift_quota: 10,
          },
        ],
      },
    })
    renderReport()
    search()
    expect(
      await screen.findByText('Consumption logs unavailable')
    ).toBeVisible()
    expect(screen.getByText(/Total CNY manual refund reference:/)).toBeVisible()
    expect(
      screen.getByText(/Remaining gift quota \(nonrefundable\): 10/)
    ).toBeVisible()
    expect(
      screen.queryByText(
        /Recorded log consumption, including subscriptions \(reference\):/
      )
    ).not.toBeInTheDocument()
    expect(screen.getByText(/Stop new usage and confirm/)).toBeVisible()
  })

  it('shows a manual reason without a false amount when evidence is missing', async () => {
    getReport.mockResolvedValue({
      ...report(),
      data: {
        ...report().data,
        credits: [],
        wallet_quota: undefined,
        net_spent_quota: undefined,
        manual_reason: 'missing_or_legacy_opening',
        log_status: 'available',
      },
    })
    renderReport()
    search()
    expect(
      await screen.findByText(
        /Historical wallet balance requires manual reconciliation/
      )
    ).toBeVisible()
    expect(
      screen.queryByText(/missing_or_legacy_opening/)
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(
        /Recorded log consumption, including subscriptions \(reference\): 20/
      )
    ).toBeVisible()
    expect(
      screen.queryByText(/Total CNY manual refund reference:/)
    ).not.toBeInTheDocument()
  })

  it('shows supported per-credit CNY references without mislabeling them as a complete total', async () => {
    getReport.mockResolvedValue({
      ...report(),
      data: {
        ...report().data,
        manual_reason: 'cash_amount_or_currency_unconfirmed',
        credits: [
          opening,
          { ...purchase, reference_cny_cents: 4500 },
          {
            ...code,
            kind: 'purchase',
            source_type: 'admin_add',
            reference_cny_cents: 3000,
          },
          {
            ...purchase,
            event_id: 5,
            source_id: 11,
            payment_provider: 'stripe',
            signed_amount_available: false,
            reference_cny_cents: undefined,
          },
        ],
      },
    })
    renderReport()
    search()
    expect(await screen.findByText(/CN¥45\.00/)).toBeVisible()
    expect(screen.getByText(/CN¥30\.00/)).toBeVisible()
    expect(
      screen.getByText(
        /Individual CNY amounts shown are partial manual references/
      )
    ).toBeVisible()
    expect(
      screen.getByText(
        /Payment amount or currency requires manual confirmation/
      )
    ).toBeVisible()
    expect(
      screen.queryByText(/cash_amount_or_currency_unconfirmed/)
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText(/Total CNY manual refund reference:/)
    ).not.toBeInTheDocument()
    await act(() => i18next.changeLanguage('zhCN'))
    expect(screen.getByText(/单笔人民币金额仅作部分人工参考/)).toBeVisible()
    expect(
      screen.queryByText(/cash_amount_or_currency_unconfirmed/)
    ).not.toBeInTheDocument()
  })

  it('hides an unrecognized internal reconciliation code behind a safe localized explanation', async () => {
    getReport.mockResolvedValue({
      ...report(),
      data: { ...report().data, manual_reason: 'internal_future_code' },
    })
    renderReport()
    search()
    expect(
      await screen.findByText(
        /Reconciliation reason: Requires manual reconciliation/
      )
    ).toBeVisible()
    expect(screen.queryByText(/internal_future_code/)).not.toBeInTheDocument()
  })

  it('caps Epay confirmations at 50 and allows replacing a selected order', async () => {
    const credits = Array.from({ length: 51 }, (_, index) => ({
      ...purchase,
      event_id: index + 2,
      source_id: index + 7,
      trade_no: `epay-${index + 7}`,
    }))
    getReport.mockImplementation(
      async (_user: number, _start: number, _end: number, ids: number[]) => ({
        ...report(),
        data: {
          ...report().data,
          credits,
          manual_reason:
            ids.length === 50
              ? undefined
              : 'cash_amount_or_currency_unconfirmed',
        },
      })
    )
    renderReport()
    search()
    for (let index = 0; index < 50; index++) {
      const checkboxes = await screen.findAllByRole('checkbox', {
        name: /merchant actually received CNY/i,
      })
      fireEvent.click(checkboxes[index])
      await waitFor(() =>
        expect(
          screen.getAllByRole('checkbox', {
            name: /merchant actually received CNY/i,
          })[index]
        ).toBeChecked()
      )
    }
    const full = screen.getAllByRole('checkbox', {
      name: /merchant actually received CNY/i,
    })
    expect(full[50]).toHaveAttribute('aria-disabled', 'true')
    expect(full[50]).toHaveAttribute('tabindex', '-1')
    expect(full[50]).toHaveAccessibleDescription(
      /up to 50 Epay orders per query/i
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      /Uncheck an order to confirm another/
    )
    fireEvent.click(full[50])
    expect(getReport).toHaveBeenLastCalledWith(
      42,
      expect.any(Number),
      expect.any(Number),
      expect.arrayContaining([7, 56])
    )
    expect(getReport.mock.lastCall?.[3]).toHaveLength(50)
    fireEvent.click(full[0])
    await waitFor(() =>
      expect(
        screen.getAllByRole('checkbox', {
          name: /merchant actually received CNY/i,
        })[50]
      ).not.toHaveAttribute('aria-disabled', 'true')
    )
    fireEvent.click(
      screen.getAllByRole('checkbox', {
        name: /merchant actually received CNY/i,
      })[50]
    )
    await waitFor(() => expect(getReport.mock.lastCall?.[3]).toHaveLength(50))
    expect(getReport.mock.lastCall?.[3]).toContain(57)
    expect(getReport.mock.lastCall?.[3]).not.toContain(7)
  }, 30000)

  it('uses localized CNY rather than the site display currency after switching language', async () => {
    getReport.mockResolvedValue(report(true))
    renderReport()
    search()
    expect(
      await screen.findByText(/Total CNY manual refund reference:.*CN¥45\.00/)
    ).toBeVisible()
    await act(() => i18next.changeLanguage('zhCN'))
    expect(screen.getByText(/人民币手工退款总参考额.*¥45\.00/)).toBeVisible()
    await act(() => i18next.changeLanguage('zhTW'))
    expect(
      screen.getByText(/人民幣人工退款總參考額.*(?:CN)?¥45\.00/)
    ).toBeVisible()
  })

  it('serializes repeated Epay confirmations as the backend query parameter, without array brackets', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: report(true) })
    const actual = await vi.importActual<typeof import('../api')>('../api')
    await actual.getCashbackRecordedSpend(42, 100, 200, [7, 12])
    const params = get.mock.calls[0]?.[1]?.params
    expect(params).toBeInstanceOf(URLSearchParams)
    expect((params as URLSearchParams).getAll('confirm_cny_top_up_id')).toEqual(
      ['7', '12']
    )
  })
})
