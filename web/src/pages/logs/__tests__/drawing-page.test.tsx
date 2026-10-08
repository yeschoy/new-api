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
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'

import { api } from '@/lib/api'
import { authStore } from '@/lib/auth-store'

import { DrawingPage } from '../drawing-page'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div data-shell='router'>{props.children}</div>,
}))

const USER = { id: 7, username: 'alice', role: 1, quota: 0, used_quota: 0, request_count: 0 }

const IMAGINE = {
  id: 1,
  user_id: 7,
  code: 1,
  action: 'IMAGINE',
  mj_id: 'mj-imagine',
  prompt: '一只在月光下奔跑的猫',
  prompt_en: 'a cat running under the moonlight',
  submit_time: 1_760_000_000_000,
  start_time: 1_760_000_001_000,
  finish_time: 1_760_000_034_500,
  image_url: 'https://cdn.example.com/mj/imagine.png',
  status: 'SUCCESS',
  progress: '100%',
  fail_reason: '',
  channel_id: 5,
}

const FAILED = {
  ...IMAGINE,
  id: 2,
  code: 22,
  action: 'UPSCALE',
  mj_id: 'mj-upscale',
  prompt: '',
  prompt_en: '',
  image_url: '',
  status: 'FAILURE',
  progress: '0%',
  finish_time: 0,
  fail_reason: 'banned prompt detected by the upstream moderation service',
}

const ok = (data: unknown) => ({ data: { success: true, message: '', data } })
let responses: Record<string, unknown>

beforeEach(() => {
  responses = {
    '/api/status': ok({}),
    '/api/mj/self': ok({ items: [IMAGINE, FAILED], total: 2 }),
    '/api/mj/': ok({ items: [IMAGINE, FAILED], total: 2 }),
  }
  vi.spyOn(api, 'get').mockImplementation(async (url: string) => (url in responses ? responses[url] : ok({})))
  signIn(1)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  authStore.clear()
})

function signIn(role: number) {
  responses['/api/user/self'] = ok({ ...USER, role })
  authStore.applyBundle({
    user: { ...USER, role },
    access_token: 'token',
    token_type: 'Bearer',
    access_expires_at: 9_999_999_999,
    session: { sid: 'sid', current: true, login_method: 'password', expires_at: 9_999_999_999 },
  })
}

function renderPage() {
  const router = createMemoryRouter([{ path: '/activity/drawing', element: <DrawingPage /> }], { initialEntries: ['/activity/drawing'] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

function paramsOf(url: string): Record<string, unknown> | undefined {
  const calls = vi.mocked(api.get).mock.calls.filter((call) => call[0] === url)
  return (calls.at(-1)?.[1] as { params?: Record<string, unknown> } | undefined)?.params
}

function rowOf(text: string): HTMLElement {
  return screen.getByText(text).closest('tr') as HTMLElement
}

describe('drawing logs', () => {
  it('lists the user’s own drawings since midnight in milliseconds', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 2, 9, 30, 0))
    renderPage()
    expect(await screen.findByText('mj-imagine')).toBeInTheDocument()
    expect(paramsOf('/api/mj/self')).toEqual({
      p: 1,
      page_size: 20,
      start_timestamp: new Date(2026, 9, 2, 0, 0, 0).getTime(),
      end_timestamp: new Date(2026, 9, 2, 10, 30, 0).getTime(),
    })
    expect(screen.queryByRole('columnheader', { name: '提交结果' })).toBeNull()
  })

  it('shows the type, status, progress and duration of a drawing', async () => {
    renderPage()
    await screen.findByText('mj-imagine')
    const row = rowOf('mj-imagine')
    expect(within(row).getByText('绘图')).toBeInTheDocument()
    expect(within(row).getByText('成功')).toBeInTheDocument()
    expect(within(row).getByText('100%')).toBeInTheDocument()
    expect(within(row).getByText('34.5s')).toBeInTheDocument()
    expect(within(rowOf('mj-upscale')).getByText('放大')).toBeInTheDocument()
  })

  it('searches by task id', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('mj-imagine')
    await user.type(screen.getByRole('textbox', { name: '任务 ID' }), 'mj-upscale')
    await user.click(screen.getByRole('button', { name: '搜索' }))
    await waitFor(() => expect(paramsOf('/api/mj/self')).toMatchObject({ mj_id: 'mj-upscale' }))
  })

  it('previews the generated image', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('mj-imagine')
    await user.click(within(rowOf('mj-imagine')).getByRole('button', { name: '查看图片' }))
    const dialog = screen.getByRole('dialog', { name: '图片预览' })
    expect(within(dialog).getByRole('img')).toHaveAttribute('src', IMAGINE.image_url)
    expect(within(dialog).getByText(IMAGINE.image_url)).toBeInTheDocument()
  })

  it('opens the full prompt with its English version', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('mj-imagine')
    await user.click(within(rowOf('mj-imagine')).getByRole('button', { name: IMAGINE.prompt }))
    const dialog = screen.getByRole('dialog', { name: '提示词详情' })
    expect(within(dialog).getByText(IMAGINE.prompt_en)).toBeInTheDocument()
  })

  it('opens the full failure reason', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('mj-upscale')
    await user.click(within(rowOf('mj-upscale')).getByRole('button', { name: FAILED.fail_reason }))
    const dialog = screen.getByRole('dialog', { name: '失败原因' })
    expect(within(dialog).getByText(FAILED.fail_reason)).toBeInTheDocument()
  })
})

describe('drawing logs for admins', () => {
  beforeEach(() => signIn(10))

  it('lists every user’s drawings with the channel and submit result', async () => {
    renderPage()
    await screen.findByText('mj-imagine')
    expect(paramsOf('/api/mj/')).toMatchObject({ p: 1 })
    expect(screen.getByRole('columnheader', { name: '渠道' })).toBeInTheDocument()
    expect(within(rowOf('mj-imagine')).getByText('已提交')).toBeInTheDocument()
    expect(within(rowOf('mj-upscale')).getByText('重复提交')).toBeInTheDocument()
  })
})
