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
// Transport is mocked: these tests prove UI behaviour (request parameters,
// URL state, rendering). They are not evidence of backend correctness.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import en from '@/i18n/locales/en.json'
import fr from '@/i18n/locales/fr.json'
import ja from '@/i18n/locales/ja.json'
import ru from '@/i18n/locales/ru.json'
import viLocale from '@/i18n/locales/vi.json'
import zhTW from '@/i18n/locales/zh-TW.json'
import zh from '@/i18n/locales/zh.json'
import { api } from '@/lib/api'
import { Route as UsersRoute } from '@/routes/_authenticated/users/index'
import { useAuthStore, type AuthUser } from '@/stores/auth-store'

import type { User } from '../../types'
import { useUsersColumns } from '../users-columns'
import { UsersProvider } from '../users-provider'
import { UsersTable } from '../users-table'

// Above 2^53: Number() would round it to ...992.
const BIG_ID = '9007199254740993'
const clients: QueryClient[] = []

const baseUser = {
  display_name: '',
  role: 1,
  status: 1,
  quota: 0,
  used_quota: 0,
  request_count: 0,
  group: 'default',
}

type TenantOptions = {
  page: number
  page_size: number
  total: number
  items: { id: string; name: string }[]
  selected: { id: string; name: string } | null
}

type Handlers = {
  users?: (url: string, config?: unknown) => unknown
  options?: (params: Record<string, unknown>) => TenantOptions | Promise<never>
}

function setViewer(user: AuthUser | null) {
  act(() => {
    useAuthStore.setState((state) => ({ auth: { ...state.auth, user } }))
  })
}

beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  setViewer({ id: 1, username: 'admin', role: 10 })
})

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear())
  localStorage.clear()
  act(() => useAuthStore.getState().auth.reset())
  vi.restoreAllMocks()
})

const defaultRows = [
  {
    ...baseUser,
    id: 2,
    username: 'row-user',
    user_category: 'ordinary',
    partner_tenant_id: '',
    partner_tenant_name: '',
  },
]

function mockApi(handlers: Handlers = {}) {
  return vi.spyOn(api, 'get').mockImplementation(async (url, config) => {
    if (url === '/api/group/') {
      return { data: { success: true, data: ['default'] } }
    }
    if (url === '/api/partner-oauth/clients') {
      return { data: { success: true, data: [] } }
    }
    if (url === '/api/user/tenant-options') {
      const params = (config as { params: Record<string, unknown> }).params
      const data = handlers.options
        ? await handlers.options(params)
        : { page: 1, page_size: 20, total: 0, items: [], selected: null }
      return { data: { success: true, data } }
    }
    const custom = handlers.users?.(String(url), config)
    if (custom !== undefined) return custom
    return {
      data: { success: true, data: { items: defaultRows, total: 200 } },
    }
  })
}

async function renderUsers(initialEntry = '/users/', waitForRow = true) {
  const root = createRootRoute()
  const auth = createRoute({ getParentRoute: () => root, id: '_authenticated' })
  const users = createRoute({
    getParentRoute: () => auth,
    path: 'users/',
    validateSearch: UsersRoute.options.validateSearch,
    component: () => (
      <TooltipProvider>
        <UsersProvider>
          <UsersTable />
        </UsersProvider>
      </TooltipProvider>
    ),
  })
  const router = createRouter({
    routeTree: root.addChildren([auth.addChildren([users])]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  await router.load()
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
  if (waitForRow) await within(view.container).findByText('row-user')
  return { router }
}

type GetSpy = ReturnType<typeof mockApi>

/** Every user list/search request as [path, params]. */
function userRequests(get: GetSpy) {
  return get.mock.calls
    .filter(
      ([url]) =>
        url === '/api/user/' || String(url).startsWith('/api/user/search')
    )
    .map(([url, config]) => {
      if (url === '/api/user/') {
        const params = (config as { params: Record<string, unknown> }).params
        return {
          path: 'list',
          params: Object.fromEntries(
            Object.entries(params).filter(([, value]) => value !== undefined)
          ) as Record<string, unknown>,
        }
      }
      const query = new URLSearchParams(String(url).split('?')[1])
      return { path: 'search', params: Object.fromEntries(query.entries()) }
    })
}

function optionRequests(get: GetSpy) {
  return get.mock.calls
    .filter(([url]) => url === '/api/user/tenant-options')
    .map(([, config]) => (config as { params: Record<string, unknown> }).params)
}

function filterChip(name: RegExp) {
  const trigger = screen
    .getAllByRole('button', { name })
    .find((button) => button.getAttribute('aria-haspopup') === 'dialog')
  expect(trigger).toBeDefined()
  return trigger as HTMLElement
}

const search = (value: Record<string, unknown>) =>
  `/users/?${Object.entries(value)
    .map(
      ([key, entry]) => `${key}=${encodeURIComponent(JSON.stringify(entry))}`
    )
    .join('&')}`

it('omits the merchant filter parameters when unset and never sends an empty one', async () => {
  const get = mockApi()
  await renderUsers('/users/?filter=alice')
  await renderUsers()

  const requests = userRequests(get)
  expect(requests.map((request) => request.path).sort()).toEqual([
    'list',
    'search',
  ])
  for (const request of requests) {
    expect(request.params).not.toHaveProperty('user_category')
    expect(request.params).not.toHaveProperty('tenant_id')
  }
  // No options request without an open filter or a selection.
  expect(optionRequests(get)).toEqual([])
})

it('sends the same category and exact merchant ID on the list and search paths from a deep link', async () => {
  const get = mockApi({
    options: () => ({
      page: 1,
      page_size: 20,
      total: 0,
      items: [],
      selected: { id: BIG_ID, name: 'Acme Travel' },
    }),
  })
  const state = { userCategory: ['merchant'], tenant: [BIG_ID] }
  const { router } = await renderUsers(search(state))
  await renderUsers(search({ ...state, filter: 'alice' }))

  const [list, searched] = userRequests(get)
  expect(list).toEqual({
    path: 'list',
    params: {
      p: 1,
      page_size: 20,
      user_category: 'merchant',
      tenant_id: BIG_ID,
    },
  })
  expect(searched.path).toBe('search')
  expect(searched.params).toMatchObject({
    keyword: 'alice',
    user_category: 'merchant',
    tenant_id: BIG_ID,
  })
  // The ID stays the exact string in the URL state and the options request,
  // and the label of a selection outside the page comes from selected_id.
  expect(router.state.location.search).toMatchObject(state)
  await waitFor(() =>
    expect(filterChip(/^Owning merchant/)).toHaveTextContent('Acme Travel')
  )
  expect(optionRequests(get)[0]).toEqual({
    p: 1,
    page_size: 20,
    selected_id: BIG_ID,
  })
  expect(filterChip(/^User category/)).toHaveTextContent('Merchant user')
})

it('shows the raw ID when the server cannot resolve the selected merchant', async () => {
  mockApi()
  await renderUsers(search({ tenant: [BIG_ID] }))
  expect(filterChip(/^Owning merchant/)).toHaveTextContent(BIG_ID)
  expect(filterChip(/^Owning merchant/)).not.toHaveTextContent('Merchant #')
})

it('normalises contradictory and invalid URL state before requesting', async () => {
  const get = mockApi()
  // ordinary + merchant is contradictory: the merchant is dropped.
  await renderUsers(search({ userCategory: ['ordinary'], tenant: ['5'] }))
  // A merchant without a category implies the merchant category.
  await renderUsers(search({ tenant: ['5'] }))
  // Unknown category, non-canonical / out-of-range / numeric IDs are dropped.
  await renderUsers(search({ userCategory: ['vip'], tenant: ['05'] }))
  await renderUsers(search({ tenant: ['9223372036854775808'] }))
  await renderUsers(`/users/?tenant=${BIG_ID}`)
  await renderUsers(search({ userCategory: ['all'] }))

  const plain = { path: 'list', params: { p: 1, page_size: 20 } }
  expect(userRequests(get)).toEqual([
    {
      path: 'list',
      params: { p: 1, page_size: 20, user_category: 'ordinary' },
    },
    {
      path: 'list',
      params: {
        p: 1,
        page_size: 20,
        user_category: 'merchant',
        tenant_id: '5',
      },
    },
    plain,
    plain,
    plain,
    plain,
  ])
})

it('resets to the first page before requesting a new category', async () => {
  const user = userEvent.setup()
  const get = mockApi()
  const { router } = await renderUsers('/users/?page=3')
  expect(userRequests(get)).toEqual([
    { path: 'list', params: { p: 3, page_size: 20 } },
  ])

  await user.click(filterChip(/^User category/))
  await user.click(
    await screen.findByRole('option', { name: /^Merchant user/ })
  )

  await waitFor(() =>
    expect(userRequests(get).at(-1)).toEqual({
      path: 'list',
      params: { p: 1, page_size: 20, user_category: 'merchant' },
    })
  )
  // The old page index is never requested under the new filter.
  expect(
    userRequests(get).filter(
      (request) => request.params.user_category && request.params.p !== 1
    )
  ).toEqual([])
  expect(router.state.location.search).not.toHaveProperty('page')
  expect(router.state.location.search).toMatchObject({
    userCategory: ['merchant'],
  })
})

it('picks a merchant from server-searched options, switches to the merchant category, and clears it for ordinary users', async () => {
  const user = userEvent.setup()
  const get = mockApi({
    options: (params) => ({
      page: Number(params.p ?? 1),
      page_size: 20,
      total: 45,
      items:
        params.q === 'acme'
          ? [{ id: BIG_ID, name: 'Acme Travel' }]
          : [
              { id: '7', name: 'First Merchant' },
              { id: '8', name: '' },
            ],
      selected: params.selected_id
        ? { id: String(params.selected_id), name: 'Acme Travel' }
        : null,
    }),
  })
  const { router } = await renderUsers('/users/?page=2')

  await user.click(filterChip(/^Owning merchant/))
  expect(
    await screen.findByRole('option', { name: 'First Merchant' })
  ).toBeVisible()
  // A merchant with an empty name is listed by its ID, not hidden.
  expect(screen.getByRole('option', { name: 'Merchant #8' })).toBeVisible()
  expect(optionRequests(get)[0]).toEqual({ p: 1, page_size: 20 })

  // Bounded paging is done by the server.
  expect(screen.getByText('Page 1 of 3')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Next page' }))
  await waitFor(() =>
    expect(optionRequests(get).at(-1)).toEqual({ p: 2, page_size: 20 })
  )
  // Going back stays inside the bounded page range.
  expect(await screen.findByText('Page 2 of 3')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Previous page' }))
  expect(await screen.findByText('Page 1 of 3')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Next page' }))
  expect(await screen.findByText('Page 2 of 3')).toBeVisible()

  // Searching is sent to the server and restarts at its first page.
  await user.type(screen.getByPlaceholderText('Search merchants...'), 'acme')
  await waitFor(() =>
    expect(optionRequests(get).at(-1)).toEqual({
      q: 'acme',
      p: 1,
      page_size: 20,
    })
  )
  await user.click(await screen.findByRole('option', { name: 'Acme Travel' }))

  await waitFor(() =>
    expect(userRequests(get).at(-1)).toEqual({
      path: 'list',
      params: {
        p: 1,
        page_size: 20,
        user_category: 'merchant',
        tenant_id: BIG_ID,
      },
    })
  )
  expect(router.state.location.search).toMatchObject({
    userCategory: ['merchant'],
    tenant: [BIG_ID],
  })
  expect(router.state.location.search).not.toHaveProperty('page')
  await waitFor(() =>
    expect(filterChip(/^Owning merchant/)).toHaveTextContent('Acme Travel')
  )

  await user.click(filterChip(/^User category/))
  await user.click(
    await screen.findByRole('option', { name: /^Ordinary user/ })
  )
  await waitFor(() =>
    expect(userRequests(get).at(-1)).toEqual({
      path: 'list',
      params: { p: 1, page_size: 20, user_category: 'ordinary' },
    })
  )
  expect(router.state.location.search).not.toHaveProperty('tenant')
  expect(filterChip(/^Owning merchant/)).not.toHaveTextContent('Acme Travel')
  // No request ever carried an empty-string parameter of the new dimension.
  for (const params of optionRequests(get)) {
    expect(Object.values(params)).not.toContain('')
  }
  for (const request of userRequests(get)) {
    expect(request.params.user_category).not.toBe('')
    expect(request.params.tenant_id).not.toBe('')
  }
})

it('operates the merchant filter with the keyboard and restores the selection after a refresh', async () => {
  const user = userEvent.setup()
  const get = mockApi({
    options: (params) => ({
      page: 1,
      page_size: 20,
      total: 1,
      items: [{ id: BIG_ID, name: 'Acme Travel' }],
      selected: params.selected_id
        ? { id: String(params.selected_id), name: 'Acme Travel' }
        : null,
    }),
  })
  const { router } = await renderUsers()

  filterChip(/^Owning merchant/).focus()
  await user.keyboard('{Enter}')
  await screen.findByRole('option', { name: 'Acme Travel' })
  await user.keyboard('{ArrowDown}{Enter}')

  const expected = {
    path: 'list',
    params: {
      p: 1,
      page_size: 20,
      user_category: 'merchant',
      tenant_id: BIG_ID,
    },
  }
  await waitFor(() => expect(userRequests(get).at(-1)).toEqual(expected))

  // A refresh is a fresh mount (new cache) on the URL the router produced.
  const count = userRequests(get).length
  const reloaded = await renderUsers(router.state.location.href)
  expect(reloaded.router.state.location.search).toMatchObject({
    userCategory: ['merchant'],
    tenant: [BIG_ID],
  })
  expect(userRequests(get).slice(count)).toEqual([expected])
})

it('shows the empty and error states of the merchant options', async () => {
  const user = userEvent.setup()
  let fail = false
  mockApi({
    options: () => {
      if (fail) return Promise.reject(new Error('boom'))
      return { page: 1, page_size: 20, total: 0, items: [], selected: null }
    },
  })
  await renderUsers()
  await user.click(filterChip(/^Owning merchant/))
  expect(await screen.findByText('No merchants found')).toBeVisible()

  fail = true
  await user.type(screen.getByPlaceholderText('Search merchants...'), 'x')
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Failed to load merchants'
  )
  expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
})

it('keeps the OAuth partner filter on its own URL key and does not request its options without the permission', async () => {
  const get = mockApi()
  await renderUsers(search({ partner: ['pc_abc'], userCategory: ['merchant'] }))

  const [request] = userRequests(get)
  expect(request.path).toBe('search')
  expect(request.params).toMatchObject({
    partner_client_id: 'pc_abc',
    user_category: 'merchant',
  })
  expect(request.params).not.toHaveProperty('tenant_id')
  // Role 10 without the partner_oauth_client permission.
  expect(get).not.toHaveBeenCalledWith('/api/partner-oauth/clients')
  expect(
    screen
      .queryAllByRole('button', { name: /^Partner/ })
      .filter((button) => button.getAttribute('aria-haspopup') === 'dialog')
  ).toEqual([])
})

it('requests the OAuth partner options for a viewer holding the permission', async () => {
  setViewer({ id: 1, username: 'root', role: 100 })
  const get = mockApi()
  await renderUsers()
  await waitFor(() =>
    expect(get).toHaveBeenCalledWith('/api/partner-oauth/clients')
  )
  expect(filterChip(/^Partner/)).toBeVisible()
})

it('does not show rows or options cached for another viewer', async () => {
  let pending = false
  const get = mockApi({
    users: () => (pending ? new Promise(() => {}) : undefined),
    options: (params) =>
      pending
        ? (new Promise(() => {}) as Promise<never>)
        : {
            page: 1,
            page_size: 20,
            total: 0,
            items: [],
            selected: { id: String(params.selected_id), name: 'Acme Travel' },
          },
  })
  await renderUsers(search({ tenant: ['5'] }))
  await waitFor(() =>
    expect(filterChip(/^Owning merchant/)).toHaveTextContent('Acme Travel')
  )
  const before = userRequests(get).length

  pending = true
  setViewer({ id: 9, username: 'other-admin', role: 100 })

  await waitFor(() => expect(userRequests(get).length).toBe(before + 1))
  expect(screen.queryByText('row-user')).not.toBeInTheDocument()
  expect(filterChip(/^Owning merchant/)).not.toHaveTextContent('Acme Travel')
  expect(filterChip(/^Owning merchant/)).toHaveTextContent('5')
})

it('does not reuse cached rows when only the viewer role changes', async () => {
  let pending = false
  const get = mockApi({
    users: () => (pending ? new Promise(() => {}) : undefined),
  })
  await renderUsers(search({ userCategory: ['merchant'] }))
  const before = userRequests(get).length

  pending = true
  setViewer({ id: 1, username: 'admin', role: 100 })

  await waitFor(() => expect(userRequests(get).length).toBe(before + 1))
  expect(screen.queryByText('row-user')).not.toBeInTheDocument()
})

it('does not reuse cached rows when only the login session changes', async () => {
  let pending = false
  const get = mockApi({
    users: () => (pending ? new Promise(() => {}) : undefined),
  })
  await renderUsers()
  const before = userRequests(get).length

  // Same account and role, different login session.
  pending = true
  act(() => {
    useAuthStore.setState((state) => ({
      auth: {
        ...state.auth,
        session: {
          sid: 'session-b',
          current: true,
          login_method: 'password',
          ip: '',
          user_agent: '',
          created_at: 0,
          last_active_at: 0,
          expires_at: 0,
        },
      },
    }))
  })

  await waitFor(() => expect(userRequests(get).length).toBe(before + 1))
  expect(screen.queryByText('row-user')).not.toBeInTheDocument()
})

it('keeps the previous rows while a pre-existing filter or page change loads, as before the merchant dimension', async () => {
  const user = userEvent.setup()
  let pending = false
  const get = mockApi({
    users: () => (pending ? new Promise(() => {}) : undefined),
  })
  const { router } = await renderUsers(search({ userCategory: ['merchant'] }))
  const before = userRequests(get).length

  // Status is a pre-existing filter: the new request never resolves, yet
  // the rows of the previous query stay visible as placeholder data.
  pending = true
  await user.click(filterChip(/^Status/))
  await user.click((await screen.findAllByRole('option'))[0])
  await waitFor(() => expect(userRequests(get).length).toBe(before + 1))
  expect(userRequests(get).at(-1)?.path).toBe('search')
  expect(userRequests(get).at(-1)?.params).toMatchObject({
    user_category: 'merchant',
  })
  expect(screen.getByText('row-user')).toBeInTheDocument()

  // Same for a page change under the unchanged filters.
  await act(async () => {
    await router.navigate({
      to: '/users/',
      search: { ...router.state.location.search, page: 2 },
    } as never)
  })
  await waitFor(() => expect(userRequests(get).length).toBe(before + 2))
  expect(userRequests(get).at(-1)?.params).toMatchObject({
    p: '2',
    user_category: 'merchant',
  })
  expect(screen.getByText('row-user')).toBeInTheDocument()
})

it('does not show the rows of the previous merchant filter while a new one loads', async () => {
  const user = userEvent.setup()
  let pending = false
  const get = mockApi({
    users: () => (pending ? new Promise(() => {}) : undefined),
  })
  await renderUsers(search({ userCategory: ['merchant'] }))
  const before = userRequests(get).length

  pending = true
  await user.click(filterChip(/^User category/))
  await user.click(
    await screen.findByRole('option', { name: /^Ordinary user/ })
  )

  await waitFor(() => expect(userRequests(get).length).toBe(before + 1))
  expect(userRequests(get).at(-1)).toEqual({
    path: 'list',
    params: { p: 1, page_size: 20, user_category: 'ordinary' },
  })
  expect(screen.queryByText('row-user')).not.toBeInTheDocument()
})

it('clears both merchant filters with the toolbar reset', async () => {
  const user = userEvent.setup()
  const get = mockApi()
  const { router } = await renderUsers(
    search({ userCategory: ['merchant'], tenant: ['5'] })
  )

  await user.click(screen.getByRole('button', { name: /^Reset/ }))

  await waitFor(() =>
    expect(userRequests(get).at(-1)).toEqual({
      path: 'list',
      params: { p: 1, page_size: 20 },
    })
  )
  expect(router.state.location.search).not.toHaveProperty('userCategory')
  expect(router.state.location.search).not.toHaveProperty('tenant')
  expect(filterChip(/^Owning merchant/)).not.toHaveTextContent('5')
})

it('shows the no-match state for an empty result and after a failed request', async () => {
  let fail = false
  mockApi({
    users: () => {
      if (fail) throw new Error('boom')
      return { data: { success: true, data: { items: [], total: 0 } } }
    },
  })
  await renderUsers(search({ userCategory: ['merchant'] }), false)
  expect(await screen.findByText('No Users Found')).toBeVisible()

  fail = true
  await renderUsers(search({ userCategory: ['ordinary'] }), false)
  await waitFor(() =>
    expect(screen.getAllByText('No Users Found').length).toBe(2)
  )
  expect(screen.queryByText('row-user')).not.toBeInTheDocument()
})

function Columns(props: { users: User[] }) {
  const ids = new Set(['user_category', 'partner_tenant', 'partner'])
  const columns = useUsersColumns().filter((column) =>
    ids.has(String(column.id))
  )
  const table = useReactTable({
    columns,
    data: props.users,
    getCoreRowModel: getCoreRowModel(),
  })
  return (
    <table>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id} data-testid={row.original.username}>
            {row.getVisibleCells().map((cell) => (
              <td key={cell.id} data-testid={cell.column.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

it('renders the category and owning merchant from the server fields only', () => {
  const merchant = { user_category: 'merchant', partner_tenant_id: BIG_ID }
  render(
    <Columns
      users={[
        {
          ...baseUser,
          ...merchant,
          id: 1,
          username: 'named',
          partner_tenant_name: 'Acme Travel',
        } as User,
        {
          ...baseUser,
          ...merchant,
          id: 2,
          username: 'unnamed',
          partner_tenant_name: '',
        } as User,
        {
          ...baseUser,
          id: 3,
          // A merchant-looking username is not a classification signal.
          username: 'p_fake',
          user_category: 'ordinary',
          partner_tenant_id: '',
          partner_tenant_name: '',
        } as User,
        {
          ...baseUser,
          ...merchant,
          id: 4,
          username: 'both',
          partner_tenant_name: 'Acme Travel',
          partner_client_id: 'pc_abc',
          partner_client_name: 'Kede Finance',
        } as User,
        { ...baseUser, id: 5, username: 'legacy-server' } as User,
      ]}
    />
  )
  const cell = (row: string, column: string) =>
    within(screen.getByTestId(row)).getByTestId(column)

  expect(cell('named', 'user_category')).toHaveTextContent('Merchant user')
  expect(cell('named', 'partner_tenant')).toHaveTextContent('Acme Travel')
  expect(
    within(cell('named', 'partner_tenant'))
      .getByText('Acme Travel')
      .closest('[title]')
  ).toHaveAttribute('title', `Merchant ID: ${BIG_ID}`)
  expect(cell('unnamed', 'partner_tenant')).toHaveTextContent(
    `Merchant #${BIG_ID}`
  )
  expect(cell('p_fake', 'user_category')).toHaveTextContent('Ordinary user')
  expect(cell('p_fake', 'partner_tenant')).toHaveTextContent('')
  expect(cell('p_fake', 'partner')).toHaveTextContent('')
  // Both identity dimensions are shown independently.
  expect(cell('both', 'partner_tenant')).toHaveTextContent('Acme Travel')
  expect(cell('both', 'partner')).toHaveTextContent('Kede Finance')
  // Fields absent (older server): nothing is guessed.
  expect(cell('legacy-server', 'user_category')).toHaveTextContent('')
  expect(cell('legacy-server', 'partner_tenant')).toHaveTextContent('')
})

it('has every new key translated in all seven locales', () => {
  const keys = [
    'User category',
    'Owning merchant',
    'Ordinary user',
    'Merchant user',
    'Merchant #{{id}}',
    'Merchant ID: {{id}}',
    'Unknown merchant',
    'Search merchants...',
    'No merchants found',
    'Failed to load merchants',
    'user_category must be exactly one of all, ordinary or merchant',
    'tenant_id must be exactly one positive integer in canonical decimal form',
    'user_category=ordinary cannot be combined with tenant_id',
  ]
  const locales: Record<string, Record<string, string>> = {
    en: en.translation,
    zh: zh.translation,
    'zh-TW': zhTW.translation,
    fr: fr.translation,
    ja: ja.translation,
    ru: ru.translation,
    vi: viLocale.translation,
  }
  expect(Object.keys(locales)).toHaveLength(7)
  for (const [locale, translation] of Object.entries(locales)) {
    for (const key of keys) {
      expect(translation[key], `${locale}: ${key}`).toEqual(expect.any(String))
      expect(translation[key].trim(), `${locale}: ${key}`).not.toBe('')
      if (key.includes('{{id}}')) {
        expect(translation[key], `${locale}: ${key}`).toContain('{{id}}')
      }
      if (locale !== 'en') {
        expect(translation[key], `${locale}: ${key}`).not.toBe(locales.en[key])
      }
    }
  }
})
