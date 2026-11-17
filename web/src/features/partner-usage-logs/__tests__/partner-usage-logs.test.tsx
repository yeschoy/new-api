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
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosAdapter } from 'axios'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import vi_ from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'
import { api } from '@/lib/api'
import { isOperatorRoute } from '@/lib/operator-route'
import { ROLE } from '@/lib/roles'
import { Route as PartnerUsageRoute } from '@/routes/_authenticated/partner-usage-logs/index'
import { useAuthStore } from '@/stores/auth-store'
import { createTestAuthBundle } from '@/test-utils/auth-bundle'

import { PartnerUsageLogs } from '../index'
import {
  partnerUsageLogsSearchSchema,
  type PartnerUsageLogsSearch,
} from '../lib/filters'

// These tests replace the HTTP transport with a mock: they prove what the UI
// sends and renders, not that the backend honours the contract.

const LIST_URL = '/api/log/partner-tenants'
const STAT_URL = '/api/log/partner-tenants/stat'
const OPTIONS_URL = '/api/log/partner-tenants/options'
const BIG_ID = '9007199254740993'
const BIG_QUOTA = '18446744073709551617'

const SCOPE_NOTICE =
  'Only merchant records written to the dedicated store after the cut-over appear here. Earlier merchant records remain on the default usage logs page and are not migrated, so this history is not complete.'

type Recorded = { url: string; params: Record<string, unknown> }
type Failure = { status: number; data: unknown }

const originalAdapter = api.defaults.adapter
const requests: Recorded[] = []
const searches: PartnerUsageLogsSearch[] = []
let listData: unknown
let statData: unknown
let optionsData: unknown
let failure: Failure | undefined

function logItem(overrides: Record<string, unknown> = {}) {
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
    other: '{"billing_source":"subscription"}',
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

function stat(overrides: Record<string, unknown> = {}) {
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

function setViewer(role: number, id = 12, sid = 'fixture-session') {
  const bundle = createTestAuthBundle()
  useAuthStore.getState().auth.setBundle({
    ...bundle,
    user: { ...bundle.user, id, role },
    session: { ...bundle.session, sid },
  })
}

function Harness(props: { initial?: PartnerUsageLogsSearch }) {
  const [search, setSearch] = useState<PartnerUsageLogsSearch>(
    props.initial ?? {}
  )
  return (
    <PartnerUsageLogs
      search={search}
      onSearchChange={(next) => {
        searches.push(next)
        setSearch(next)
      }}
    />
  )
}

function renderPage(
  initial?: PartnerUsageLogsSearch,
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
) {
  const view = render(
    <QueryClientProvider client={client}>
      <Harness initial={initial} />
    </QueryClientProvider>
  )
  return { ...view, client }
}

const sent = (url: string) => requests.filter((entry) => entry.url === url)

beforeEach(() => {
  setViewer(ROLE.ADMIN)
  requests.length = 0
  searches.length = 0
  listData = listPage([])
  statData = stat()
  optionsData = { page: 1, page_size: 20, total: 0, items: [], selected: null }
  failure = undefined
  api.defaults.adapter = (async (config) => {
    const url = String(config.url)
    requests.push({ url, params: { ...config.params } })
    if (failure && url !== OPTIONS_URL) {
      throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, {
        config,
        data: failure.data,
        headers: {},
        status: failure.status,
        statusText: 'Error',
      })
    }
    let data: unknown = optionsData
    if (url === LIST_URL) data = listData
    if (url === STAT_URL) data = statData
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
  vi.restoreAllMocks()
})

describe('merchant usage logs page', () => {
  it('requests the list and the totals with one explicit window and the same filters', async () => {
    renderPage({ tenant: BIG_ID, type: 'consume' })
    await waitFor(() => {
      expect(sent(LIST_URL)).toHaveLength(1)
      expect(sent(STAT_URL)).toHaveLength(1)
    })
    const list = sent(LIST_URL)[0].params
    const totals = sent(STAT_URL)[0].params
    // The ID above 2^53 is re-sent as its exact text.
    expect(list.tenant_id).toBe(BIG_ID)
    expect(list.type).toBe('consume')
    expect(list.start_timestamp).toMatch(/^[1-9]\d*$/)
    expect(list.end_timestamp).toMatch(/^[1-9]\d*$/)
    expect(list.p).toBe('1')
    expect(list.page_size).toBe('20')
    // Unset filters are omitted and nothing is sent as an empty string.
    expect(Object.keys(list).sort()).toEqual(
      [
        'end_timestamp',
        'p',
        'page_size',
        'start_timestamp',
        'tenant_id',
        'type',
      ].sort()
    )
    expect(Object.values(list)).not.toContain('')
    // The totals carry exactly the filter: same window, no paging keys.
    const { p: _p, page_size: _size, ...filterOnly } = list
    expect(totals).toEqual(filterOnly)
    expect(totals).not.toHaveProperty('p')
    expect(totals).not.toHaveProperty('page_size')
  })

  it('renders identifiers, quota and aggregates above 2^53 as exact strings', async () => {
    listData = listPage([
      logItem({
        id: BIG_ID,
        tenant_id: BIG_ID,
        tenant_name: '',
        user_id: '9223372036854775807',
        quota: BIG_QUOTA,
        prompt_tokens: '9007199254740995',
      }),
    ])
    statData = stat({ quota: BIG_QUOTA, tokens: '9007199254740997' })
    renderPage()
    // Without a snapshot name the raw merchant ID is shown, not a guess.
    expect((await screen.findAllByText(`Merchant #${BIG_ID}`))[0]).toBeVisible()
    expect(screen.getAllByText('#9223372036854775807')[0]).toBeVisible()
    expect(screen.getAllByText('9007199254740995')[0]).toBeVisible()
    expect(screen.getAllByText(BIG_QUOTA).length).toBeGreaterThan(0)
    expect(
      within(screen.getByTestId('summary-quota')).getByText(BIG_QUOTA)
    ).toBeVisible()
    expect(
      within(screen.getByTestId('summary-tokens')).getByText('9007199254740997')
    ).toBeVisible()
  })

  it('shows an unavailable CNY amount as unavailable and a tiny one as less than the unit', async () => {
    listData = listPage([
      logItem({ event_id: 'a', quota: '250000', quota_cny: '3.650000' }),
      logItem({ event_id: 'b', quota: '5', quota_cny: '0.000000' }),
      logItem({ event_id: 'c', quota: '7', quota_cny: null }),
    ])
    statData = stat({
      quota: '250012',
      quota_cny: {
        currency: 'CNY',
        available: false,
        reason: 'invalid_conversion_config',
        quota_per_unit: null,
        usd_to_cny_rate: '7.3',
        scale: 6,
        rounding: 'half_away_from_zero',
        amount: null,
      },
    })
    renderPage()
    expect((await screen.findAllByText('¥3.650000'))[0]).toBeVisible()
    expect(screen.getAllByText('Less than ¥0.000001')[0]).toBeVisible()
    const summary = screen.getByTestId('summary-cny')
    expect(within(summary).getByText('Unavailable')).toBeVisible()
    // Neither state may be presented as a zero amount.
    expect(document.body.textContent).not.toContain('¥0.000000')
    expect(summary.textContent).not.toMatch(/¥\s*0/)
    expect(
      document.querySelectorAll('[data-cny-state="unavailable"]').length
    ).toBeGreaterThanOrEqual(2)
  })

  it('labels records and folded requests separately and keeps a charged failure visible', async () => {
    renderPage()
    const requestsCard = await screen.findByTestId('summary-requests')
    await within(requestsCard).findByText('3')
    expect(
      within(requestsCard).getByText('Requests (retries folded)')
    ).toBeVisible()
    expect(within(requestsCard).getByText('Succeeded: 2')).toBeVisible()
    expect(within(requestsCard).getByText('Failed: 1')).toBeVisible()
    expect(
      within(requestsCard).getByText(
        'A failed request may still have been charged; its quota stays in the totals.'
      )
    ).toBeVisible()
    const records = screen.getByTestId('summary-records')
    expect(within(records).getByText('Records (every attempt)')).toBeVisible()
    expect(within(records).getByText('4')).toBeVisible()
    // The failed request's charge is part of the totals, not shown as free.
    expect(
      within(screen.getByTestId('summary-quota')).getByText('750000')
    ).toBeVisible()
    expect(
      within(screen.getByTestId('summary-cny')).getByText('¥10.950000')
    ).toBeVisible()
  })

  it('always shows the scope notice, including the empty and the error state', async () => {
    renderPage()
    expect(
      await screen.findByText('No merchant usage records in this window')
    ).toBeVisible()
    expect(screen.getByTestId('partner-usage-scope-notice')).toHaveTextContent(
      SCOPE_NOTICE
    )
  })

  it('reports a 503 with a retry and never shows invented totals', async () => {
    failure = {
      status: 503,
      data: {
        success: false,
        message: 'Database error, please contact the administrator',
      },
    }
    renderPage()
    expect(
      await screen.findByText(
        'Database error, please contact the administrator'
      )
    ).toBeVisible()
    expect(screen.getByTestId('partner-usage-scope-notice')).toHaveTextContent(
      SCOPE_NOTICE
    )
    expect(screen.getByTestId('summary-quota')).toHaveTextContent('—')
    expect(screen.getByTestId('summary-cny').textContent).not.toMatch(/¥/)
    failure = undefined
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(
      await within(screen.getByTestId('summary-quota')).findByText('750000')
    ).toBeVisible()
  })

  it('shows the day limit of an over-long window', async () => {
    failure = {
      status: 400,
      data: {
        success: false,
        message: 'The time range cannot exceed 7 days',
        message_key: 'The time range cannot exceed {{days}} days',
        message_params: { days: 7 },
      },
    }
    renderPage({ start: 1790000000, end: 1794886400 })
    expect(
      await screen.findByText('The time range cannot exceed 7 days')
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
  })

  it('returns to page 1 in the same update as a filter change and never sends an invalid ID', async () => {
    renderPage({ page: 3 })
    await waitFor(() => expect(sent(LIST_URL)).toHaveLength(1))
    expect(sent(LIST_URL)[0].params.p).toBe('3')

    const userId = screen.getByRole('textbox', { name: 'User ID' })
    await userEvent.type(userId, '0123')
    expect(userId).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled()
    expect(sent(LIST_URL)).toHaveLength(1)

    await userEvent.clear(userId)
    await userEvent.type(userId, BIG_ID)
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Username' }),
      'pt_u_1{Enter}'
    )
    await waitFor(() => expect(sent(LIST_URL).length).toBeGreaterThan(1))
    expect(searches.at(-1)).toEqual({ userId: BIG_ID, username: 'pt_u_1' })
    const filtered = sent(LIST_URL).filter(
      (entry) => entry.params.username === 'pt_u_1'
    )
    expect(filtered.length).toBeGreaterThan(0)
    for (const entry of filtered) {
      expect(entry.params.p).toBe('1')
      expect(entry.params.user_id).toBe(BIG_ID)
    }
    const totals = sent(STAT_URL).at(-1)?.params
    expect(totals?.user_id).toBe(BIG_ID)
    expect(totals?.username).toBe('pt_u_1')
  })

  it('does not show another viewer cached rows or totals', async () => {
    listData = listPage([logItem({ username: 'first-viewer-row' })])
    statData = stat({ quota: '111111' })
    const first = renderPage({ start: 1794800000, end: 1794886400 })
    expect((await screen.findAllByText('first-viewer-row'))[0]).toBeVisible()
    first.unmount()

    // Same filter, shared cache, different administrator session.
    setViewer(ROLE.SUPER_ADMIN, 99, 'other-session')
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const adapter = api.defaults.adapter as AxiosAdapter
    api.defaults.adapter = (async (config) => {
      await gate
      return adapter(config)
    }) as AxiosAdapter
    listData = listPage([logItem({ username: 'second-viewer-row' })])
    statData = stat({ quota: '222222' })
    renderPage({ start: 1794800000, end: 1794886400 }, first.client)
    expect(screen.queryByText('first-viewer-row')).toBeNull()
    expect(screen.getByTestId('summary-quota')).not.toHaveTextContent('111111')
    release?.()
    expect((await screen.findAllByText('second-viewer-row'))[0]).toBeVisible()
    expect(screen.queryByText('first-viewer-row')).toBeNull()
    first.client.clear()
  })

  it('resolves the selected merchant through the log-side options endpoint', async () => {
    optionsData = {
      page: 1,
      page_size: 20,
      total: 1,
      items: [],
      selected: { id: BIG_ID, name: 'Selected Merchant' },
    }
    const view = renderPage({ tenant: BIG_ID })
    expect(await screen.findByText('Selected Merchant')).toBeVisible()
    const options = sent(OPTIONS_URL)
    expect(options.length).toBeGreaterThan(0)
    expect(options[0].params.selected_id).toBe(BIG_ID)
    // Neither the user-side entry nor the root-only management API is used.
    expect(
      requests.some(
        (entry) =>
          entry.url.startsWith('/api/user/') ||
          entry.url.startsWith('/api/partner-tenants')
      )
    ).toBe(false)
    view.unmount()

    // `selected: null` falls back to the raw ID, never a guessed name.
    optionsData = { ...(optionsData as object), selected: null }
    renderPage({ tenant: '77' })
    await waitFor(() =>
      expect(
        sent(OPTIONS_URL).some((entry) => entry.params.selected_id === '77')
      ).toBe(true)
    )
    expect(await screen.findByText('77')).toBeVisible()
  })

  it('opens read-only details by keyboard and shows the metadata text exactly as delivered', async () => {
    listData = listPage([
      logItem({
        other: `{"admin_note":${BIG_ID},"billing_source":"subscription"}`,
      }),
    ])
    renderPage()
    // Wait for the row: the column header is a "Details" button as well.
    await screen.findAllByText('example-model')
    const triggers = screen.getAllByRole('button', { name: 'Details' })
    triggers.at(-1)?.focus()
    expect(triggers.at(-1)).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText('Merchant usage record details')
    ).toBeVisible()
    // The role-shaped text is not parsed, so a large number is not rounded.
    expect(dialog).toHaveTextContent(
      `{"admin_note":${BIG_ID},"billing_source":"subscription"}`
    )
    expect(within(dialog).getByText('Example Merchant (#12)')).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('reports other invalid input as invalid parameters', async () => {
    failure = {
      status: 400,
      data: { success: false, message: 'Invalid parameters' },
    }
    renderPage()
    expect(await screen.findByText('Invalid parameters')).toBeVisible()
    expect(screen.getByTestId('summary-records')).toHaveTextContent('—')
  })

  it('clears every filter and the page on reset', async () => {
    renderPage({ page: 4, tenant: BIG_ID, username: 'pt_u_1', type: 'error' })
    await waitFor(() => expect(sent(LIST_URL)).toHaveLength(1))
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(searches.at(-1)).toEqual({})
    await waitFor(() => {
      const last = sent(LIST_URL).at(-1)?.params
      expect(last?.p).toBe('1')
      expect(last).not.toHaveProperty('tenant_id')
      expect(last).not.toHaveProperty('username')
      expect(last).not.toHaveProperty('type')
    })
    expect(screen.getByRole('textbox', { name: 'Username' })).toHaveValue('')
  })

  it('refuses a non-administrator without any request', () => {
    setViewer(ROLE.USER)
    renderPage()
    expect(screen.getByText('Access denied')).toBeVisible()
    expect(requests).toHaveLength(0)
  })
})

describe('merchant usage logs route and URL state', () => {
  async function landing(role: number): Promise<string | undefined> {
    setViewer(role)
    const root = createRootRoute()
    const forbidden = createRoute({ getParentRoute: () => root, path: '/403' })
    const page = createRoute({
      getParentRoute: () => root,
      path: '/partner-usage-logs',
      beforeLoad: () => PartnerUsageRoute.options.beforeLoad?.({} as never),
    })
    const router = createRouter({
      routeTree: root.addChildren([page, forbidden]),
      history: createMemoryHistory({ initialEntries: ['/403'] }),
    })
    await router.load()
    const matches = await router.preloadRoute({ to: '/partner-usage-logs' })
    return matches?.at(-1)?.pathname
  }

  it('redirects ordinary users and admits administrators and root', async () => {
    expect(await landing(ROLE.USER)).toBe('/403')
    expect(await landing(ROLE.ADMIN)).toBe('/partner-usage-logs')
    expect(await landing(ROLE.SUPER_ADMIN)).toBe('/partner-usage-logs')
    expect(isOperatorRoute('/partner-usage-logs')).toBe(true)
  })

  it('round-trips valid URL state and drops values that must not be sent', () => {
    const valid = {
      page: 2,
      pageSize: 50,
      tenant: BIG_ID,
      userId: '42',
      username: 'pt_u_1',
      model: 'example-model',
      requestId: 'req-1',
      type: 'error' as const,
      start: 1794800000,
      end: 1794886400,
    }
    expect(partnerUsageLogsSearchSchema.parse(valid)).toEqual(valid)
    // A hand-typed unquoted ID reaches the schema as a rounded Number.
    expect(
      partnerUsageLogsSearchSchema.parse({
        tenant: Number(BIG_ID),
        userId: '007',
        username: '',
        model: 'bad\u0000name',
        requestId: 'x'.repeat(65),
        type: 'topup',
        page: 0,
        pageSize: 101,
        start: -1,
      })
    ).toEqual({})
    expect(
      partnerUsageLogsSearchSchema.parse({ tenant: '9223372036854775808' })
    ).toEqual({})
  })
})

describe('merchant usage logs locales', () => {
  const KEYS = [
    'Merchant usage logs',
    SCOPE_NOTICE,
    'No merchant usage records in this window',
    'An empty result is expected until merchant usage logging is cut over to the dedicated store; it does not mean the merchant had no earlier usage.',
    'Failed to load merchant usage logs',
    'Amount (CNY, current rate)',
    'A display equivalent at the current rate, not a historical charge, wallet balance or plan price.',
    'Raw quota',
    'Internal metering units, not money or tokens.',
    'Requests (retries folded)',
    'Succeeded: {{value}}',
    'Failed: {{value}}',
    'A failed request may still have been charged; its quota stays in the totals.',
    'Records (every attempt)',
    'Input: {{input}} · Output: {{output}}',
    'Less than ¥0.000001',
    'Less than the smallest displayed unit, not free.',
    'All types',
    'Effective window: {{start}} – {{end}}',
    'Check the user ID, text filters and time range.',
    'Merchant usage record details',
    'Event ID',
    'Upstream request ID',
    'Identity source',
    'Recorded metadata',
    'Summary',
    'The time range cannot exceed {{days}} days',
  ]
  const locales: Record<string, Record<string, string>> = {
    en: en.translation,
    zh: zh.translation,
    'zh-TW': zhTW.translation,
    fr: fr.translation,
    ja: ja.translation,
    ru: ru.translation,
    vi: vi_.translation,
  }

  it('defines every key in all seven locales with its placeholders', () => {
    for (const [locale, translation] of Object.entries(locales)) {
      for (const key of KEYS) {
        const value = translation[key]
        expect(value, `${locale}: ${key}`).toBeTruthy()
        const placeholders = key.match(/\{\{\w+\}\}/g) ?? []
        for (const placeholder of placeholders) {
          expect(value, `${locale}: ${key}`).toContain(placeholder)
        }
        if (locale !== 'en' && key.length > 12) {
          expect(value, `${locale}: ${key}`).not.toBe(key)
        }
      }
    }
  })
})
