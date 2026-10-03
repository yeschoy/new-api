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

import { GROUPS, ok, renderKeysPage, serveGets, signIn } from './keys-test-utils'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div data-shell='router'>{props.children}</div>,
}))

const DATA = {
  '/api/status': { quota_per_unit: 500_000, default_use_auto_group: true },
  '/api/token/': { items: [], total: 0 },
  '/api/user/self/groups': GROUPS,
  '/api/token/auto-groups': { groups: ['vip', 'default'], max_count: 2 },
  '/api/user/models': [],
}

type Body = Record<string, unknown>
let created: Body[] = []

beforeEach(() => {
  signIn()
  serveGets(DATA)
  created = []
  vi.spyOn(api, 'post').mockImplementation(async (url: string, body?: unknown) => {
    if (url !== '/api/token/') return ok({ key: 'NEWKEY' })
    created.push(body as Body)
    return ok({ id: 9, name: 'auto' })
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
})

async function openCreate(user: ReturnType<typeof userEvent.setup>) {
  renderKeysPage()
  await user.click((await screen.findAllByRole('button', { name: /创建密钥/ }))[0])
  const dialog = await screen.findByRole('dialog', { name: '创建 API 密钥' })
  await user.type(within(dialog).getByPlaceholderText('例如：生产环境'), 'auto')
  return dialog
}

function order(dialog: HTMLElement): string[] {
  const list = within(dialog).getByRole('list', { name: '自动分组顺序' })
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.getAttribute('data-group') ?? '')
}

describe('auto group order', () => {
  it('follows the global order and retries across groups by default', async () => {
    const user = userEvent.setup()
    const dialog = await openCreate(user)
    expect(within(dialog).getByRole('combobox', { name: '分组' })).toHaveValue('auto')
    expect(await within(dialog).findByText('正在使用全局自动分组顺序（2 个分组）')).toBeInTheDocument()
    expect(order(dialog)).toEqual(['vip', 'default'])
    expect(within(dialog).getByRole('button', { name: '恢复全局顺序' })).toBeDisabled()
    await user.click(within(dialog).getByRole('button', { name: '创建' }))
    await waitFor(() => expect(created).toHaveLength(1))
    expect(created[0]).toMatchObject({ group: 'auto', auto_groups: [], cross_group_retry: true })
  })

  it('sends a custom order in the order chosen', async () => {
    const user = userEvent.setup()
    const dialog = await openCreate(user)
    const add = await within(dialog).findByRole('combobox', { name: '添加分组' })
    await user.selectOptions(add, 'vip')
    await user.selectOptions(add, 'default')
    expect(within(dialog).getByText('已选 2 / 2 个分组')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '上移 default' }))
    expect(order(dialog)).toEqual(['default', 'vip'])
    await user.click(within(dialog).getByRole('button', { name: '创建' }))
    await waitFor(() => expect(created).toHaveLength(1))
    expect(created[0].auto_groups).toEqual(['default', 'vip'])
  })

  it('stops adding groups at the server limit', async () => {
    const user = userEvent.setup()
    const dialog = await openCreate(user)
    const add = await within(dialog).findByRole('combobox', { name: '添加分组' })
    await user.selectOptions(add, 'vip')
    await user.selectOptions(add, 'default')
    expect(add).toBeDisabled()
    expect(within(add).getByRole('option', { name: '最多 2 个分组' })).toBeInTheDocument()
  })

  it('goes back to the global order', async () => {
    const user = userEvent.setup()
    const dialog = await openCreate(user)
    await user.selectOptions(await within(dialog).findByRole('combobox', { name: '添加分组' }), 'default')
    await user.click(within(dialog).getByRole('button', { name: '恢复全局顺序' }))
    expect(within(dialog).getByText('正在使用全局自动分组顺序（2 个分组）')).toBeInTheDocument()
    expect(order(dialog)).toEqual(['vip', 'default'])
  })

  it('refuses an empty custom order', async () => {
    const user = userEvent.setup()
    const dialog = await openCreate(user)
    await user.selectOptions(await within(dialog).findByRole('combobox', { name: '添加分组' }), 'vip')
    await user.click(within(dialog).getByRole('button', { name: '移除 vip' }))
    expect(within(dialog).getByText('没有有效的自定义分组，请添加分组或恢复全局顺序。')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '创建' }))
    expect(within(dialog).getByText('请至少选择一个自动分组，或恢复全局顺序')).toBeInTheDocument()
    expect(created).toHaveLength(0)
  })

  it('keeps a custom order while another group is tried', async () => {
    const user = userEvent.setup()
    const dialog = await openCreate(user)
    await user.selectOptions(await within(dialog).findByRole('combobox', { name: '添加分组' }), 'vip')
    const group = within(dialog).getByRole('combobox', { name: '分组' })
    await user.selectOptions(group, 'default')
    expect(within(dialog).queryByRole('list', { name: '自动分组顺序' })).toBeNull()
    await user.selectOptions(group, 'auto')
    expect(order(dialog)).toEqual(['vip'])
    expect(within(dialog).getByText('已选 1 / 2 个分组')).toBeInTheDocument()
  })

  it('sends cross-group retry switched off', async () => {
    const user = userEvent.setup()
    const dialog = await openCreate(user)
    await user.click(within(dialog).getByRole('switch', { name: '跨分组重试' }))
    await user.click(within(dialog).getByRole('button', { name: '创建' }))
    await waitFor(() => expect(created).toHaveLength(1))
    expect(created[0].cross_group_retry).toBe(false)
  })
})
