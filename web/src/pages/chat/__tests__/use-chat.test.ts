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
import { act, renderHook, waitFor } from '@testing-library/react'

import { authStore } from '@/lib/auth-store'

import { useChat } from '../use-chat'

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

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  window.localStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  authStore.applyBundle({
    user: { id: 1, username: 'u', role: 1 },
    access_token: 'tok-123',
    token_type: 'Bearer',
    access_expires_at: 0,
    session: { sid: 's', current: true, login_method: 'password', expires_at: 0 },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  authStore.clear()
})

describe('useChat', () => {
  it('posts an OpenAI chat body to /pg/chat/completions and streams the reply', async () => {
    fetchMock.mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"reasoning_content":"想"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"你"}}]}\n\ndata: {"choices":[{"delta":{"content":"好"}}]}\n\n',
        'data: [DONE]\n\n',
      ])
    )
    const { result } = renderHook(() => useChat('gpt-test'))
    act(() => result.current.setSettings({ reasoningEffort: 'medium', maxTokens: 256, systemPrompt: '简洁' }))

    await act(() => result.current.send('  hi  '))

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/pg/chat/completions')
    expect(init?.method).toBe('POST')
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok-123')
    expect(JSON.parse(init?.body as string)).toEqual({
      model: 'gpt-test',
      messages: [
        { role: 'system', content: '简洁' },
        { role: 'user', content: 'hi' },
      ],
      stream: true,
      reasoning_effort: 'medium',
      max_tokens: 256,
    })

    const reply = result.current.active?.messages[1]
    expect(reply).toMatchObject({ role: 'assistant', content: '你好', reasoning: '想', model: 'gpt-test' })
    expect(result.current.streaming).toBe(false)
    const stored = JSON.parse(window.localStorage.getItem('chat-conversations') ?? '[]')
    expect(stored[0].messages[1].content).toBe('你好')
  })

  it('shows the backend error message on a non-2xx response', async () => {
    fetchMock.mockResolvedValue(new Response('{"error":{"message":"额度不足"}}', { status: 403 }))
    const { result } = renderHook(() => useChat('gpt-test'))
    await act(() => result.current.send('hi'))
    expect(result.current.active?.messages[1].error).toBe('额度不足')
  })

  it('aborts the request when stopped', async () => {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
    )
    const { result } = renderHook(() => useChat('gpt-test'))
    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = result.current.send('hi')
    })
    await waitFor(() => expect(result.current.streaming).toBe(true))
    await act(async () => {
      result.current.stop()
      await pending
    })
    expect(result.current.streaming).toBe(false)
    expect(result.current.active?.messages[1].error).toBe('已停止生成')
  })

  it('omits max_tokens and the system message when unset, and keeps history', async () => {
    fetchMock.mockImplementation(async () => sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n', 'data: [DONE]\n']))
    const { result } = renderHook(() => useChat('gpt-test'))
    await act(() => result.current.send('one'))
    await act(() => result.current.send('two'))
    const body = JSON.parse(fetchMock.mock.calls[1][1]?.body as string)
    expect(body.max_tokens).toBeUndefined()
    expect(body.messages).toEqual([
      { role: 'user', content: 'one' },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: 'two' },
    ])
    expect(result.current.conversations).toHaveLength(1)
  })
})
