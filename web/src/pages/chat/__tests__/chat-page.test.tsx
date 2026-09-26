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
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'

import { api } from '@/lib/api'
import { authStore } from '@/lib/auth-store'

import { ChatPage } from '../chat-page'

// The real shell and provider icons pull in the icon library (not loadable
// under jsdom); the chat only needs them as a frame and a placeholder here.
vi.mock('@/sites/router/router-shell', () => ({
  RouterShell: (props: { children: React.ReactNode }) => <div data-shell='router'>{props.children}</div>,
}))
vi.mock('@/components/provider-icon', () => ({
  ProviderIcon: () => <span aria-hidden='true' />,
}))

const fetchMock = vi.fn<typeof fetch>()

function sseResponse(lines: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

function signIn() {
  authStore.applyBundle({
    user: { id: 1, username: 'u', role: 1 },
    access_token: 'tok-123',
    token_type: 'Bearer',
    access_expires_at: 9_999_999_999,
    session: { sid: 's', current: true, login_method: 'password', expires_at: 9_999_999_999 },
  })
}

function renderChat(path: string) {
  const router = createMemoryRouter([{ path: '/chat', element: <ChatPage /> }], { initialEntries: [path] })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  vi.spyOn(api, 'get').mockResolvedValue({ data: { success: true, data: [] } })
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  authStore.clear()
})

describe('ChatPage', () => {
  it('shows an in-page sign-in notice to signed-out visitors', () => {
    authStore.clear()
    renderChat('/chat?model=gpt-test')
    expect(screen.getByRole('link', { name: '登录' })).toHaveAttribute('href', '/sign-in?redirect=%2Fchat%3Fmodel%3Dgpt-test')
    expect(screen.queryByRole('textbox', { name: '消息' })).toBeNull()
  })

  it('sends with the temperature, max tokens and system prompt set in the settings popover', async () => {
    signIn()
    fetchMock.mockResolvedValue(sseResponse(['data: {"choices":[{"delta":{"content":"好"}}]}\n\n', 'data: [DONE]\n\n']))
    const user = userEvent.setup()
    renderChat('/chat?model=gpt-test')

    await user.click(screen.getByRole('button', { name: '对话设置' }))
    const panel = screen.getByRole('dialog', { name: '对话设置' })
    fireEvent.change(within(panel).getByLabelText('温度（Temperature）'), { target: { value: '0.4' } })
    expect(within(panel).getByText('0.4')).toBeInTheDocument()
    await user.type(within(panel).getByLabelText('最大输出 Tokens'), '256')
    await user.type(within(panel).getByLabelText('系统提示词'), '简洁')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '对话设置' })).toBeNull()

    await user.type(screen.getByRole('textbox', { name: '消息' }), 'hi{Enter}')
    expect(await screen.findByText('好')).toBeInTheDocument()
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      model: 'gpt-test',
      messages: [
        { role: 'system', content: '简洁' },
        { role: 'user', content: 'hi' },
      ],
      stream: true,
      temperature: 0.4,
      max_tokens: 256,
    })
  })

  it('keeps the settings and the model inside the message box, like GPT and Claude', () => {
    signIn()
    renderChat('/chat?model=gpt-test')
    const box = screen.getByRole('group', { name: '对话' })
    expect(within(box).getByRole('textbox', { name: '消息' })).toBeInTheDocument()
    expect(within(box).getByRole('button', { name: '对话设置' })).toBeInTheDocument()
    expect(within(box).getByRole('button', { name: /gpt-test/ })).toBeInTheDocument()
  })

  it('copies a reply', async () => {
    signIn()
    fetchMock.mockResolvedValue(sseResponse(['data: {"choices":[{"delta":{"content":"好"}}]}\n\n', 'data: [DONE]\n\n']))
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
    renderChat('/chat?model=gpt-test')

    await user.type(screen.getByRole('textbox', { name: '消息' }), 'hi{Enter}')
    await screen.findByText('好')
    await user.click(await screen.findByRole('button', { name: '复制' }))
    expect(writeText).toHaveBeenCalledWith('好')
    expect(await screen.findByRole('button', { name: '已复制' })).toBeInTheDocument()
  })

  it('resets the settings to their defaults', async () => {
    signIn()
    const user = userEvent.setup()
    renderChat('/chat?model=gpt-test')

    await user.click(screen.getByRole('button', { name: '对话设置' }))
    const panel = screen.getByRole('dialog', { name: '对话设置' })
    await user.type(within(panel).getByLabelText('系统提示词'), '简洁')
    await user.type(within(panel).getByLabelText('最大输出 Tokens'), '64')
    await user.click(within(panel).getByRole('button', { name: /重置/ }))
    expect(within(panel).getByLabelText('系统提示词')).toHaveValue('')
    expect(within(panel).getByLabelText('最大输出 Tokens')).toHaveValue(null)
    expect(within(panel).getByText('1.0')).toBeInTheDocument()
  })
})
