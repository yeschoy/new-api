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
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosAdapter } from 'axios'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'
import { createTestAuthBundle } from '@/test-utils/auth-bundle'

import { PartnerUsageLogs } from '../index'
import type { PartnerUsageLogsSearch } from '../lib/filters'

// The HTTP transport is a mock: these tests prove what the UI sends and
// renders for each interaction, not that the backend honours the contract.

const LIST_URL = '/api/log/partner-tenants'
const STAT_URL = '/api/log/partner-tenants/stat'
const OPTIONS_URL = '/api/log/partner-tenants/options'
const BIG_ID = '9007199254740993'
const SCOPE_NOTICE_START = 'Only merchant records written to the dedicated'

type Params = Record<string, unknown>
type Recorded = { url: string; params: Params }
type Failure = { status: number; data: unknown }
type Source = unknown | ((params: Params) => unknown)

const originalAdapter = api.defaults.adapter
const requests: Recorded[] = []
const searches: PartnerUsageLogsSearch[] = []
let listData: Source
let statData: Source
let optionsData: Source
let failures: Record<string, Failure | undefined>
let gate: Promise<void> | undefined

function logItem(overrides: Params = {}) {
  return {
    id: '1',
    event_id: 'ptu_1',
    created_at: 1794880000,
    type: 2,
    tenant_id: '12',
    tenant_name: 'Example Merchant',
    account_id: '345',
    identity_source: 'subscription_key',
    user_id: '6789',
    username: 'pt_u_6789',
    token_id: '4321',
    token_name: 'default',
    model_name: 'example-model',
    channel_id: '7',
    channel_name: 'Example Channel',
    group: 'merchant-12',
    ip: '',
    request_id: 'req-1',
    upstream_request_id: '',
    subscription_id: '',
    quota: '250000',
    quota_cny: '3.650000',
    prompt_tokens: '1200',
    completion_tokens: '800',
    use_time: 3,
    is_stream: true,
    content: '',
    other: '',
    ...overrides,
  }
}

function listPage(items: unknown[], total = items.length) {
  return {
    page: 1,
    page_size: 20,
    total,
    items,
    start_timestamp: 1794800000,
    end_timestamp: 1794886400,
  }
}

function stat(overrides: Params = {}) {
  return {
    record_count: '4',
    request_count: '3',
    succeeded_count: '2',
    failed_count: '1',
    quota: '750000',
    prompt_tokens: '3600',
    completion_tokens: '2400',
    tokens: '6000',
    quota_cny: {
      currency: 'CNY',
      available: true,
      quota_per_unit: '500000',
      usd_to_cny_rate: '7.3',
      scale: 6,
      rounding: 'half_away_from_zero',
      amount: '10.950000',
    },
    start_timestamp: 1794800000,
    end_timestamp: 1794886400,
    ...overrides,
  }
}

function Harness(props: {
  initial?: PartnerUsageLogsSearch
  /** Commits the URL state in a later task, as a router navigation does. */
  deferred?: boolean
}) {
  const [search, setSearch] = useState<PartnerUsageLogsSearch>(
    props.initial ?? {}
  )
  return (
    <PartnerUsageLogs
      search={search}
      onSearchChange={(next) => {
        searches.push(next)
        if (props.deferred) setTimeout(() => setSearch(next), 0)
        else setSearch(next)
      }}
    />
  )
}

function renderPage(
  initial?: PartnerUsageLogsSearch,
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
) {
  return render(
    <QueryClientProvider client={client}>
      <Harness initial={initial} />
    </QueryClientProvider>
  )
}

const sent = (url: string) => requests.filter((entry) => entry.url === url)
const resolve = (source: Source, params: Params) =>
  typeof source === 'function' ? source(params) : source

/** The list and the totals of one filter must carry one identical filter. */
function expectSameFilter(
  list: Params | undefined,
  totals: Params | undefined
) {
  expect(list).toBeDefined()
  expect(totals).toBeDefined()
  const { p: _p, page_size: _size, ...filterOnly } = list as Params
  expect(totals).toEqual(filterOnly)
  expect(totals).not.toHaveProperty('p')
  expect(totals).not.toHaveProperty('page_size')
  expect(Object.values(list as Params)).not.toContain('')
}

beforeEach(() => {
  const bundle = createTestAuthBundle()
  useAuthStore.getState().auth.setBundle({
    ...bundle,
    user: { ...bundle.user, id: 12, role: ROLE.ADMIN },
    session: { ...bundle.session, sid: 'fixture-session' },
  })
  requests.length = 0
  searches.length = 0
  listData = listPage([])
  statData = stat()
  optionsData = { page: 1, page_size: 20, total: 0, items: [], selected: null }
  failures = {}
  gate = undefined
  api.defaults.adapter = (async (config) => {
    const url = String(config.url)
    const params: Params = { ...config.params }
    requests.push({ url, params })
    if (gate) await gate
    const failure = failures[url]
    if (failure) {
      throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, {
        config,
        data: failure.data,
        headers: {},
        status: failure.status,
        statusText: 'Error',
      })
    }
    let data: unknown = resolve(optionsData, params)
    if (url === LIST_URL) data = resolve(listData, params)
    if (url === STAT_URL) data = resolve(statData, params)
    return {
      config,
      data: { success: true, message: '', data },
      headers: {},
      status: 200,
      statusText: 'OK',
    }
  }) as AxiosAdapter
})

afterEach(() => {
  api.defaults.adapter = originalAdapter
  useAuthStore.getState().auth.reset()
})

describe('merchant usage logs interactions', () => {
  it('searches, pages, selects and clears a merchant with the page reset and one shared filter', async () => {
    const user = userEvent.setup()
    optionsData = (params: Params) => ({
      page: Number(params.p ?? 1),
      page_size: 20,
      total: params.q === 'acme' ? 1 : 45,
      items:
        params.q === 'acme'
          ? [{ id: BIG_ID, name: 'Acme Travel' }]
          : [{ id: '7', name: 'First Merchant' }],
      selected: params.selected_id
        ? { id: String(params.selected_id), name: 'Acme Travel' }
        : null,
    })
    renderPage({ page: 3 })
    await waitFor(() => expect(sent(LIST_URL)).toHaveLength(1))

    // Opening the picker neither submits the filter form nor re-requests.
    await user.click(screen.getByRole('button', { name: /^Owning merchant/ }))
    expect(
      await screen.findByRole('option', { name: 'First Merchant' })
    ).toBeVisible()
    expect(sent(LIST_URL)).toHaveLength(1)
    expect(searches).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() =>
      expect(sent(OPTIONS_URL).some((entry) => entry.params.p === 2)).toBe(true)
    )
    await user.type(screen.getByPlaceholderText('Search merchants...'), 'acme')
    await user.click(await screen.findByRole('option', { name: 'Acme Travel' }))
    const searched = sent(OPTIONS_URL).filter(
      (entry) => entry.params.q === 'acme'
    )
    expect(searched.length).toBeGreaterThan(0)
    // The search restarts at the first option page; no empty parameter.
    expect(searched[0].params.p).toBe(1)
    for (const entry of sent(OPTIONS_URL)) {
      expect(Object.values(entry.params)).not.toContain('')
    }
    expect(sent(LIST_URL)).toHaveLength(2)
    expect(searches.at(-1)).toEqual({ tenant: BIG_ID })

    await waitFor(() =>
      expect(sent(LIST_URL).at(-1)?.params.tenant_id).toBe(BIG_ID)
    )
    // No request combined the new merchant with the old page.
    for (const entry of sent(LIST_URL)) {
      if (entry.params.tenant_id) expect(entry.params.p).toBe('1')
    }
    await waitFor(() =>
      expect(sent(STAT_URL).at(-1)?.params.tenant_id).toBe(BIG_ID)
    )
    expectSameFilter(
      sent(LIST_URL).at(-1)?.params,
      sent(STAT_URL).at(-1)?.params
    )

    await user.click(screen.getByRole('button', { name: /^Owning merchant/ }))
    await user.click(
      await screen.findByRole('option', { name: 'Clear filters' })
    )
    expect(searches.at(-1)).toEqual({})
    await waitFor(() => {
      expect(sent(LIST_URL).at(-1)?.params).not.toHaveProperty('tenant_id')
      expect(sent(STAT_URL).at(-1)?.params).not.toHaveProperty('tenant_id')
    })
    expectSameFilter(
      sent(LIST_URL).at(-1)?.params,
      sent(STAT_URL).at(-1)?.params
    )
  })

  it('switches the type by keyboard between error, consume and all', async () => {
    const user = userEvent.setup()
    renderPage({ page: 2 })
    await waitFor(() => expect(sent(LIST_URL)).toHaveLength(1))

    const type = screen.getByRole('combobox', { name: 'Type' })
    await user.click(type)
    await user.click(await screen.findByRole('option', { name: 'Error' }))
    expect(searches.at(-1)).toEqual({ type: 'error' })
    await waitFor(() => {
      expect(sent(LIST_URL).at(-1)?.params.type).toBe('error')
      expect(sent(STAT_URL).at(-1)?.params.type).toBe('error')
    })
    expect(sent(LIST_URL).at(-1)?.params.p).toBe('1')
    expectSameFilter(
      sent(LIST_URL).at(-1)?.params,
      sent(STAT_URL).at(-1)?.params
    )

    await user.click(screen.getByRole('combobox', { name: 'Type' }))
    await user.click(await screen.findByRole('option', { name: 'Consume' }))
    await waitFor(() =>
      expect(sent(STAT_URL).at(-1)?.params.type).toBe('consume')
    )

    await user.click(screen.getByRole('combobox', { name: 'Type' }))
    await user.click(await screen.findByRole('option', { name: 'All types' }))
    expect(searches.at(-1)).toEqual({})
    await waitFor(() => {
      expect(sent(LIST_URL).at(-1)?.params).not.toHaveProperty('type')
      expect(sent(STAT_URL).at(-1)?.params).not.toHaveProperty('type')
    })
  })

  it('applies a picked time range to the list and the totals only on search', async () => {
    const user = userEvent.setup()
    renderPage({ page: 2 })
    await waitFor(() => expect(sent(LIST_URL)).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: 'Date Range' }))
    await user.click(await screen.findByRole('button', { name: '7 Days' }))
    // The window is a draft until Search is pressed.
    expect(sent(LIST_URL)).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(sent(LIST_URL).length).toBeGreaterThan(1))
    const applied = searches.at(-1)
    expect(applied?.start).toBeTypeOf('number')
    expect(applied?.end).toBeTypeOf('number')
    expect(applied).not.toHaveProperty('page')
    const list = sent(LIST_URL).at(-1)?.params
    expect(list?.start_timestamp).toBe(String(applied?.start))
    expect(list?.end_timestamp).toBe(String(applied?.end))
    expect(list?.p).toBe('1')
    await waitFor(() =>
      expect(sent(STAT_URL).at(-1)?.params.start_timestamp).toBe(
        String(applied?.start)
      )
    )
    expectSameFilter(list, sent(STAT_URL).at(-1)?.params)
  })

  it('pages forward and back without paging keys on the totals and without a false empty state', async () => {
    const user = userEvent.setup()
    listData = (params: Params) =>
      listPage([logItem({ username: `row-of-page-${params.p}` })], 45)
    // The application default: cached data stays fresh for ten seconds.
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 10 * 1000 } },
    })
    renderPage(undefined, client)
    expect((await screen.findAllByText('row-of-page-1'))[0]).toBeVisible()
    const statBefore = sent(STAT_URL).length

    await user.click(
      screen.getAllByRole('button', { name: 'Go to next page' })[0]
    )
    expect(searches.at(-1)).toEqual({ page: 2 })
    expect((await screen.findAllByText('row-of-page-2'))[0]).toBeVisible()
    expect(sent(LIST_URL).at(-1)?.params.p).toBe('2')
    expect(sent(LIST_URL).at(-1)?.params.page_size).toBe('20')
    // Paging does not change the filter, so the totals are not re-read.
    expect(sent(STAT_URL)).toHaveLength(statBefore)
    for (const entry of sent(STAT_URL)) {
      expect(entry.params).not.toHaveProperty('p')
      expect(entry.params).not.toHaveProperty('page_size')
    }

    // Back to a page read seconds ago: its rows are shown, never "no records".
    await user.click(
      screen.getAllByRole('button', { name: 'Go to previous page' })[0]
    )
    expect(searches.at(-1)).toEqual({})
    expect((await screen.findAllByText('row-of-page-1'))[0]).toBeVisible()
    expect(
      screen.queryByText('No merchant usage records in this window')
    ).toBeNull()
    expect(screen.getByTestId('summary-quota')).toHaveTextContent('750000')
    client.clear()
  })

  it('keeps the rows when only the totals fail', async () => {
    listData = listPage([logItem({ username: 'kept-row' })])
    failures[STAT_URL] = {
      status: 503,
      data: {
        success: false,
        message: 'Database error, please contact the administrator',
      },
    }
    renderPage()
    expect((await screen.findAllByText('kept-row'))[0]).toBeVisible()
    expect(
      await screen.findByText(
        'Database error, please contact the administrator'
      )
    ).toBeVisible()
    expect(screen.getByTestId('summary-quota')).toHaveTextContent('—')
    expect(screen.getByTestId('summary-cny').textContent).not.toMatch(/¥/)
    expect(screen.getByTestId('partner-usage-scope-notice')).toHaveTextContent(
      SCOPE_NOTICE_START
    )
  })

  it('keeps the totals when only the list fails and does not call it an empty window', async () => {
    failures[LIST_URL] = {
      status: 503,
      data: {
        success: false,
        message: 'Database error, please contact the administrator',
      },
    }
    renderPage()
    expect(
      await within(screen.getByTestId('summary-quota')).findByText('750000')
    ).toBeVisible()
    expect(
      (await screen.findAllByText('Failed to load merchant usage logs'))[0]
    ).toBeVisible()
    expect(
      screen.queryByText('No merchant usage records in this window')
    ).toBeNull()
    // A failed read is not explained as an expected empty result.
    expect(screen.queryByText(/An empty result is expected/)).toBeNull()
    expect(screen.getByTestId('partner-usage-scope-notice')).toHaveTextContent(
      SCOPE_NOTICE_START
    )
  })

  it('announces loading, shows no empty state meanwhile and keeps the scope notice', async () => {
    let release: (() => void) | undefined
    gate = new Promise<void>((done) => {
      release = done
    })
    renderPage()
    expect(await screen.findByRole('status')).toHaveTextContent('Loading...')
    expect(
      screen.queryByText('No merchant usage records in this window')
    ).toBeNull()
    expect(screen.getByTestId('summary-quota')).toHaveTextContent('—')
    expect(screen.getByTestId('partner-usage-scope-notice')).toHaveTextContent(
      SCOPE_NOTICE_START
    )
    release?.()
    expect(
      await screen.findByText('No merchant usage records in this window')
    ).toBeVisible()
  })

  it('re-requests both endpoints with the same filter on retry after a 503', async () => {
    const user = userEvent.setup()
    const unavailable = {
      status: 503,
      data: {
        success: false,
        message: 'Database error, please contact the administrator',
      },
    }
    failures = { [LIST_URL]: unavailable, [STAT_URL]: unavailable }
    renderPage({ tenant: BIG_ID })
    const retry = await screen.findByRole('button', { name: 'Retry' })
    const listBefore = sent(LIST_URL).length
    const statBefore = sent(STAT_URL).length
    failures = {}
    // Keyboard operation of the retry control.
    retry.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => {
      expect(sent(LIST_URL)).toHaveLength(listBefore + 1)
      expect(sent(STAT_URL)).toHaveLength(statBefore + 1)
    })
    expect(sent(LIST_URL).at(-1)?.params).toEqual(sent(LIST_URL)[0].params)
    expectSameFilter(
      sent(LIST_URL).at(-1)?.params,
      sent(STAT_URL).at(-1)?.params
    )
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
    )
  })

  it('renders the totals of an invalid conversion configuration as delivered by the server', async () => {
    // Exact server shape: a factor whose configuration is invalid is null.
    statData = stat({
      quota: '250012',
      quota_cny: {
        currency: 'CNY',
        available: false,
        reason: 'invalid_conversion_config',
        quota_per_unit: null,
        usd_to_cny_rate: null,
        scale: 6,
        rounding: 'half_away_from_zero',
        amount: null,
      },
    })
    renderPage()
    expect(
      await within(screen.getByTestId('summary-quota')).findByText('250012')
    ).toBeVisible()
    const cny = screen.getByTestId('summary-cny')
    expect(within(cny).getByText('Unavailable')).toBeVisible()
    expect(cny.textContent).not.toMatch(/¥/)
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('reads the day limit from the body the server really sends', async () => {
    const tooLong = {
      status: 400,
      data: {
        success: false,
        message: 'The time range cannot exceed 30 days',
        message_key: 'The time range cannot exceed {{days}} days',
        message_params: { days: 30 },
      },
    }
    failures = { [LIST_URL]: tooLong, [STAT_URL]: tooLong }
    renderPage({ start: 1790000000, end: 1794886400 })
    expect(
      await screen.findByText('The time range cannot exceed 30 days')
    ).toBeVisible()
  })

  it('rejects a number where the contract requires a decimal string', async () => {
    listData = listPage([logItem({ quota: 250000 })])
    statData = stat({ quota: 750000 })
    renderPage()
    expect(
      (await screen.findAllByText('Failed to load merchant usage logs'))[0]
    ).toBeVisible()
    expect(screen.getByTestId('summary-quota')).toHaveTextContent('—')
    expect(screen.queryByText('250000')).toBeNull()
  })

  it('operates the merchant picker and the type switch by keyboard', async () => {
    const user = userEvent.setup()
    optionsData = {
      page: 1,
      page_size: 20,
      total: 1,
      items: [{ id: '7', name: 'First Merchant' }],
      selected: null,
    }
    renderPage()
    await waitFor(() => expect(sent(LIST_URL)).toHaveLength(1))
    const trigger = screen.getByRole('button', { name: /^Owning merchant/ })
    trigger.focus()
    await user.keyboard('{Enter}')
    expect(
      await screen.findByRole('option', { name: 'First Merchant' })
    ).toBeVisible()
    // Opening by keyboard does not submit the surrounding filter form.
    expect(sent(LIST_URL)).toHaveLength(1)
    await user.keyboard('{Escape}')

    const type = screen.getByRole('combobox', { name: 'Type' })
    type.focus()
    await user.keyboard('{ArrowDown}')
    await screen.findByRole('option', { name: 'Error' })
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    await waitFor(() => expect(searches.at(-1)?.type).toBeDefined())
    const chosen = searches.at(-1)?.type
    await waitFor(() => {
      expect(sent(LIST_URL).at(-1)?.params.type).toBe(chosen)
      expect(sent(STAT_URL).at(-1)?.params.type).toBe(chosen)
    })
  })

  it('changes the page size from the first page without paging keys on the totals', async () => {
    const user = userEvent.setup()
    listData = listPage([logItem()], 95)
    renderPage({ page: 3 })
    await screen.findAllByText('example-model')
    const size = screen
      .getAllByRole('combobox')
      .find((element) => element.textContent?.trim() === '20')
    expect(size).toBeDefined()
    await user.click(size as HTMLElement)
    await user.click(await screen.findByRole('option', { name: '50' }))
    expect(searches.at(-1)).toEqual({ pageSize: 50 })
    await waitFor(() =>
      expect(sent(LIST_URL).at(-1)?.params.page_size).toBe('50')
    )
    expect(sent(LIST_URL).at(-1)?.params.p).toBe('1')
    for (const entry of sent(STAT_URL)) {
      expect(entry.params).not.toHaveProperty('p')
      expect(entry.params).not.toHaveProperty('page_size')
    }
  })

  it('issues one request pair per search or reset when the URL state commits later', async () => {
    const user = userEvent.setup()
    let now = 1794886400000
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => now)
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <Harness deferred />
      </QueryClientProvider>
    )
    await waitFor(() => expect(sent(LIST_URL)).toHaveLength(1))

    now += 90000
    await user.type(
      screen.getByRole('textbox', { name: 'Username' }),
      'pt_u_1{Enter}'
    )
    await waitFor(() =>
      expect(sent(LIST_URL).at(-1)?.params.username).toBe('pt_u_1')
    )
    await waitFor(() =>
      expect(sent(STAT_URL).at(-1)?.params.username).toBe('pt_u_1')
    )
    // The rolling window is re-anchored with the filter, in one request pair:
    // nothing was requested for the old filter with the new window.
    expect(sent(LIST_URL).at(-1)?.params.end_timestamp).toBe(
      String(Math.floor(now / 1000))
    )
    expect(sent(LIST_URL)).toHaveLength(2)
    expect(sent(STAT_URL)).toHaveLength(2)
    expectSameFilter(
      sent(LIST_URL).at(-1)?.params,
      sent(STAT_URL).at(-1)?.params
    )

    now += 90000
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    await waitFor(() => {
      expect(sent(LIST_URL)).toHaveLength(3)
      expect(sent(STAT_URL)).toHaveLength(3)
    })
    expect(sent(LIST_URL).at(-1)?.params).not.toHaveProperty('username')
    expect(sent(LIST_URL).at(-1)?.params.end_timestamp).toBe(
      String(Math.floor(now / 1000))
    )
    expectSameFilter(
      sent(LIST_URL).at(-1)?.params,
      sent(STAT_URL).at(-1)?.params
    )

    // Searching again without any change still re-reads the newest window.
    now += 90000
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => {
      expect(sent(LIST_URL)).toHaveLength(4)
      expect(sent(STAT_URL)).toHaveLength(4)
    })
    expect(sent(STAT_URL).at(-1)?.params.end_timestamp).toBe(
      String(Math.floor(now / 1000))
    )
    clock.mockRestore()
  })

  it('never sends a blank text filter and trims surrounding spaces', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => expect(sent(LIST_URL)).toHaveLength(1))
    await user.type(screen.getByRole('textbox', { name: 'Model name' }), '   ')
    await user.type(
      screen.getByRole('textbox', { name: 'Request ID' }),
      '  req-9  {Enter}'
    )
    await waitFor(() =>
      expect(sent(LIST_URL).at(-1)?.params.request_id).toBe('req-9')
    )
    expect(searches.at(-1)).toEqual({ requestId: 'req-9' })
    for (const entry of requests) {
      expect(entry.params).not.toHaveProperty('model_name')
      expect(Object.values(entry.params)).not.toContain('')
    }
  })
})
