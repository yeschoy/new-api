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

import { TasksPage } from '../tasks-page'

vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div data-shell='router'>{props.children}</div>,
}))

const USER = { id: 7, username: 'alice', role: 1, quota: 0, used_quota: 0, request_count: 0 }
const ACCESS = 'a'.repeat(43)

const MUSIC = {
  id: 1,
  user_id: 7,
  username: 'alice',
  platform: 'suno',
  task_id: 'task-music',
  action: 'MUSIC',
  channel_id: 3,
  group: 'default',
  quota: 250_000,
  submit_time: 1_760_000_000,
  start_time: 1_760_000_002,
  finish_time: 1_760_000_012,
  progress: '100%',
  status: 'SUCCESS',
  data: [{ id: 'clip-1', title: 'Night drive', audio_url: 'https://cdn.example.com/clip-1.mp3', duration: 125 }],
}

// The backend adds admin_info only for admins.
const MUSIC_FOR_ADMIN = { ...MUSIC, admin_info: { task_plugin: { key: 'suno-pro', name: 'Suno Pro', version: '1.2.0' } } }

const VIDEO = {
  ...MUSIC,
  id: 2,
  platform: 'kling',
  task_id: 'task-video',
  action: 'textGenerate',
  data: null,
  fail_reason: '',
}

const FAILED = { ...VIDEO, id: 3, task_id: 'task-failed', status: 'FAILURE', progress: '0%', finish_time: 0, fail_reason: 'upstream timeout' }

const ok = (data: unknown) => ({ data: { success: true, message: '', data } })
let responses: Record<string, unknown>

beforeEach(() => {
  responses = {
    '/api/status': ok({ quota_per_unit: 500_000 }),
    '/api/task/self': ok({ items: [MUSIC, VIDEO, FAILED], total: 3 }),
    '/api/task': ok({ items: [MUSIC_FOR_ADMIN], total: 1 }),
    '/api/task/task-video/artifacts': ok({
      artifacts: [
        { key: 'video', type: 'video', mime_type: 'video/mp4', content_url: `https://cdn.example.com/v1/tasks/task-video/artifacts/video/content?access=${ACCESS}` },
      ],
    }),
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

function renderPage(path = '/activity/tasks') {
  const router = createMemoryRouter([{ path: '/activity/tasks', element: <TasksPage /> }], { initialEntries: [path] })
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

describe('task logs', () => {
  it('lists the user’s own tasks since midnight in seconds', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 2, 9, 30, 0))
    renderPage()
    expect(await screen.findByText('task-music')).toBeInTheDocument()
    expect(paramsOf('/api/task/self')).toEqual({
      p: 1,
      page_size: 20,
      start_timestamp: new Date(2026, 9, 2, 0, 0, 0).getTime() / 1000,
      end_timestamp: new Date(2026, 9, 2, 10, 30, 0).getTime() / 1000,
    })
    expect(screen.queryByRole('columnheader', { name: '用户' })).toBeNull()
  })

  it('shows the platform, action, status, progress and duration of a task', async () => {
    renderPage()
    await screen.findByText('task-music')
    const row = rowOf('task-music')
    expect(within(row).getByText('suno · 生成音乐')).toBeInTheDocument()
    expect(within(row).getByText('成功')).toBeInTheDocument()
    expect(within(row).getByText('100%')).toBeInTheDocument()
    expect(within(row).getByText('12.0s')).toBeInTheDocument()
    expect(within(rowOf('task-failed')).getByText('upstream timeout')).toBeInTheDocument()
  })

  it('searches by task id', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('task-music')
    await user.type(screen.getByRole('textbox', { name: '任务 ID' }), 'task-video')
    await user.click(screen.getByRole('button', { name: '搜索' }))
    await waitFor(() => expect(paramsOf('/api/task/self')).toMatchObject({ task_id: 'task-video' }))
  })

  it('opens the details of a task', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('task-failed')
    await user.click(within(rowOf('task-failed')).getByRole('button', { name: '查看详情' }))
    const dialog = screen.getByRole('dialog', { name: /任务详情/ })
    expect(within(dialog).getByText('文生视频')).toBeInTheDocument()
    expect(within(dialog).getAllByText('upstream timeout').length).toBeGreaterThan(0)
    expect(within(dialog).queryByRole('heading', { name: '仅管理员可见' })).toBeNull()
  })

  it('loads the artifacts of a finished task with a download link', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('task-video')
    await user.click(within(rowOf('task-video')).getByRole('button', { name: '制品' }))
    const dialog = screen.getByRole('dialog', { name: /制品/ })
    const download = await within(dialog).findByRole('link', { name: /下载/ })
    expect(download).toHaveAttribute('href', `https://cdn.example.com/v1/tasks/task-video/artifacts/video/content?access=${ACCESS}`)
  })

  it('refuses artifact links that do not point at the artifact endpoint', async () => {
    responses['/api/task/task-video/artifacts'] = ok({
      artifacts: [{ key: 'video', type: 'video', content_url: 'https://evil.example.com/steal' }],
    })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('task-video')
    await user.click(within(rowOf('task-video')).getByRole('button', { name: '制品' }))
    const dialog = screen.getByRole('dialog', { name: /制品/ })
    expect(await within(dialog).findByText('制品加载失败')).toBeInTheDocument()
    expect(within(dialog).queryByRole('link')).toBeNull()
  })

  it('plays the clips of a legacy Suno task', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('task-music')
    await user.click(within(rowOf('task-music')).getByRole('button', { name: '试听' }))
    const dialog = screen.getByRole('dialog', { name: '音乐预览' })
    expect(within(dialog).getByText('Night drive')).toBeInTheDocument()
    expect(within(dialog).getByText('2:05')).toBeInTheDocument()
  })
})

describe('task logs for admins', () => {
  beforeEach(() => signIn(10))

  it('lists every user’s tasks with channel, user and plugin', async () => {
    renderPage()
    expect(await screen.findByText('Suno Pro')).toBeInTheDocument()
    expect(paramsOf('/api/task')).toMatchObject({ p: 1 })
    expect(screen.getByRole('columnheader', { name: '渠道' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '用户' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '渠道 ID' })).toBeInTheDocument()
  })
})
