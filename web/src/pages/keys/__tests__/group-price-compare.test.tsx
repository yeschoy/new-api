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
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { authStore } from '@/lib/auth-store'

import { GROUPS, renderKeysPage, serveGets, signIn } from './keys-test-utils'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div data-shell='router'>{props.children}</div>,
}))

function model(name: string, enableGroups: string[]) {
  return { id: 1, model_name: name, quota_type: 0, model_ratio: 1, completion_ratio: 2, enable_groups: enableGroups }
}

const DATA = {
  '/api/status': { quota_per_unit: 500_000 },
  '/api/token/': { items: [], total: 0 },
  '/api/user/self/groups': GROUPS,
  '/api/token/auto-groups': { groups: ['vip', 'default'], max_count: 3 },
  '/api/user/models': [],
  '/api/pricing': [model('gpt-a', ['default', 'vip']), model('gpt-only-default', ['default'])],
}

beforeEach(() => {
  signIn()
  serveGets(DATA)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
})

async function openCompare(user: ReturnType<typeof userEvent.setup>) {
  renderKeysPage()
  await user.click((await screen.findAllByRole('button', { name: /创建密钥/ }))[0])
  const dialog = await screen.findByRole('dialog', { name: '创建 API 密钥' })
  await user.click(within(dialog).getByRole('button', { name: '比较各分组价格' }))
  return dialog
}

describe('group price comparison', () => {
  it('prices the chosen model in every group the account can use', async () => {
    const user = userEvent.setup()
    const dialog = await openCompare(user)
    const vip = await within(dialog).findByRole('row', { name: /vip/ })
    expect(within(vip).getByText('×0.5')).toBeInTheDocument()
    expect(within(vip).getByText('$1')).toBeInTheDocument()
    expect(within(vip).getByText('$2')).toBeInTheDocument()
    const standard = within(dialog).getByRole('row', { name: /^default/ })
    expect(within(standard).getByText('$4')).toBeInTheDocument()
  })

  it('only offers groups that serve the chosen model', async () => {
    const user = userEvent.setup()
    const dialog = await openCompare(user)
    await user.selectOptions(await within(dialog).findByRole('combobox', { name: '参考模型' }), 'gpt-only-default')
    expect(within(dialog).queryByRole('row', { name: /vip/ })).toBeNull()
    expect(within(dialog).getByRole('row', { name: /^default/ })).toBeInTheDocument()
  })

  it('puts the key in the group picked from the comparison', async () => {
    const user = userEvent.setup()
    const dialog = await openCompare(user)
    const vip = await within(dialog).findByRole('row', { name: /vip/ })
    await user.click(within(vip).getByRole('button', { name: '选用 vip' }))
    expect(within(dialog).getByRole('combobox', { name: '分组' })).toHaveValue('vip')
  })
})
