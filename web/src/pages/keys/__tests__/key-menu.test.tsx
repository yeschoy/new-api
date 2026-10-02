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

import { api } from '@/lib/api'
import { authStore } from '@/lib/auth-store'

import { GROUPS, apiKey, ok, renderKeysPage, serveGets, signIn } from './keys-test-utils'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div data-shell='router'>{props.children}</div>,
}))

const ADDRESS = 'https://yeschoy.com'

const STATUS = {
  quota_per_unit: 500_000,
  server_address: ADDRESS,
  chats: [
    { 'Cherry Studio': 'cherrystudio://providers/api-keys?v=1&data={cherryConfig}' },
    { 流畅阅读: 'fluentread' },
    { 'CC Switch': 'ccswitch' },
    { 'AI as Workspace': 'https://aiaw.app/set-provider?key={key}&url={address}' },
  ],
}

const DATA = {
  '/api/status': STATUS,
  '/api/token/': { items: [apiKey()], total: 1 },
  '/api/user/self/groups': GROUPS,
  '/api/user/models': ['claude-sonnet', 'gpt-x'],
}

beforeEach(() => {
  signIn()
  serveGets(DATA)
  vi.spyOn(api, 'post').mockImplementation(async (url: string) => (url === '/api/token/1/key' ? ok({ key: 'FULL' }) : ok(null)))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  authStore.clear()
  document.getElementById('fluent-new-api-container')?.remove()
})

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  renderKeysPage()
  const row = await screen.findByRole('row', { name: /abcd/ })
  await user.click(within(row).getByRole('button', { name: '更多操作' }))
  return screen.getByRole('menu')
}

describe('key menu', () => {
  it('copies the full key', async () => {
    const user = userEvent.setup()
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const menu = await openMenu(user)
    await user.click(within(menu).getByRole('menuitem', { name: '复制密钥' }))
    expect(write).toHaveBeenCalledWith('sk-FULL')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('copies the connection info another site can import', async () => {
    const user = userEvent.setup()
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const menu = await openMenu(user)
    await user.click(within(menu).getByRole('menuitem', { name: '复制连接信息' }))
    expect(JSON.parse(write.mock.calls[0][0])).toEqual({ _type: 'newapi_channel_conn', key: 'sk-FULL', url: ADDRESS })
  })

  it('opens a web app with the key and address filled in', async () => {
    const user = userEvent.setup()
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const menu = await openMenu(user)
    await user.click(within(menu).getByRole('menuitem', { name: 'AI as Workspace' }))
    expect(open).toHaveBeenCalledWith(`https://aiaw.app/set-provider?key=sk-FULL&url=${encodeURIComponent(ADDRESS)}`, '_blank', 'noopener')
  })

  it('opens a desktop app in place so no blank tab is left', async () => {
    const user = userEvent.setup()
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const menu = await openMenu(user)
    await user.click(within(menu).getByRole('menuitem', { name: 'Cherry Studio' }))
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/^cherrystudio:\/\/providers\/api-keys\?v=1&data=/), '_self')
  })

  it('hands the key to FluentRead when its extension is on the page', async () => {
    const container = document.createElement('div')
    container.id = 'fluent-new-api-container'
    document.body.appendChild(container)
    const received: unknown[] = []
    container.addEventListener('fluent:prefill', (event) => received.push((event as CustomEvent).detail))
    const user = userEvent.setup()
    const menu = await openMenu(user)
    await user.click(within(menu).getByRole('menuitem', { name: '流畅阅读' }))
    expect(received).toEqual([{ id: 'new-api', baseUrl: ADDRESS, apiKey: 'sk-FULL' }])
  })

  it('says when the FluentRead extension is missing', async () => {
    const user = userEvent.setup()
    const menu = await openMenu(user)
    await user.click(within(menu).getByRole('menuitem', { name: '流畅阅读' }))
    expect(await screen.findByText('未检测到流畅阅读扩展，请确认已安装并启用。')).toBeInTheDocument()
  })

  it('closes on Escape and hands focus back to its button', async () => {
    const user = userEvent.setup()
    await openMenu(user)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: '更多操作' })).toHaveFocus()
  })
})

describe('CC Switch import', () => {
  it('lists the import once, without the status marker entry', async () => {
    const user = userEvent.setup()
    const menu = await openMenu(user)
    expect(within(menu).getAllByRole('menuitem', { name: /CC Switch/ })).toHaveLength(1)
  })

  it('asks for a primary model first', async () => {
    const user = userEvent.setup()
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const menu = await openMenu(user)
    await user.click(within(menu).getByRole('menuitem', { name: '填入 CC Switch' }))
    const dialog = await screen.findByRole('dialog', { name: '填入 CC Switch' })
    await user.click(within(dialog).getByRole('button', { name: '打开 CC Switch' }))
    expect(within(dialog).getByText('请选择主模型')).toBeInTheDocument()
    expect(open).not.toHaveBeenCalled()
  })

  it('opens CC Switch with the key, the address and the chosen models', async () => {
    const user = userEvent.setup()
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const menu = await openMenu(user)
    await user.click(within(menu).getByRole('menuitem', { name: '填入 CC Switch' }))
    const dialog = await screen.findByRole('dialog', { name: '填入 CC Switch' })
    await user.click(within(dialog).getByRole('radio', { name: 'Codex' }))
    await user.type(within(dialog).getByRole('combobox', { name: '主模型' }), 'gpt-x')
    await user.click(within(dialog).getByRole('button', { name: '打开 CC Switch' }))
    const url = new URL(open.mock.calls[0][0] as string)
    expect(open.mock.calls[0][1]).toBe('_self')
    expect(url.searchParams.get('app')).toBe('codex')
    expect(url.searchParams.get('name')).toBe('My Codex')
    expect(url.searchParams.get('endpoint')).toBe(`${ADDRESS}/v1`)
    expect(url.searchParams.get('apiKey')).toBe('sk-FULL')
    expect(url.searchParams.get('model')).toBe('gpt-x')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
