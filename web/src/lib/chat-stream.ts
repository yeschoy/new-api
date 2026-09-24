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
import { refreshSession } from './api'
import { authStore } from './auth-store'

export type StreamEvent =
  | { type: 'content'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'error'; message: string }
  | { type: 'done' }

export type ChatRole = 'system' | 'user' | 'assistant'

/** Body of POST /pg/chat/completions (OpenAI chat completions). */
export type ChatCompletionBody = {
  model: string
  messages: Array<{ role: ChatRole; content: string }>
  stream: true
  temperature?: number
  max_tokens?: number
}

type ChunkPayload = {
  error?: string | { message?: string }
  choices?: Array<{
    delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null }
  }>
}

function eventsFromPayload(payload: ChunkPayload): StreamEvent[] {
  if (payload.error) {
    const message = typeof payload.error === 'string' ? payload.error : payload.error.message
    return [{ type: 'error', message: message || '请求失败' }]
  }
  const delta = payload.choices?.[0]?.delta
  const events: StreamEvent[] = []
  const reasoning = delta?.reasoning_content || delta?.reasoning
  if (reasoning) events.push({ type: 'reasoning', text: reasoning })
  if (delta?.content) events.push({ type: 'content', text: delta.content })
  return events
}

/**
 * Pure SSE step: appends `chunk` to the unfinished `buffer`, turns every
 * complete `data:` line into events and returns the incomplete tail as `rest`.
 */
export function parseSseChunk(buffer: string, chunk: string): { events: StreamEvent[]; rest: string } {
  const lines = (buffer + chunk).split('\n')
  const rest = lines.pop() ?? ''
  const events: StreamEvent[] = []
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.startsWith('data:')) continue
    const data = line.slice(5).trim()
    if (!data) continue
    if (data === '[DONE]') {
      events.push({ type: 'done' })
      continue
    }
    try {
      events.push(...eventsFromPayload(JSON.parse(data) as ChunkPayload))
    } catch {
      // Not JSON (e.g. a proxy banner); nothing to render.
    }
  }
  return { events, rest }
}

/** User-facing message from a non-2xx response body. */
export function readErrorMessage(body: string, status: number): string {
  try {
    const json = JSON.parse(body) as { error?: { message?: string } | string; message?: string }
    const message = typeof json.error === 'string' ? json.error : json.error?.message || json.message
    if (message) return message
  } catch {
    // Fall through to the generic message.
  }
  return `请求失败（HTTP ${status}）`
}

function post(body: ChatCompletionBody, signal: AbortSignal): Promise<Response> {
  const token = authStore.get().accessToken
  return fetch('/pg/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
    credentials: 'same-origin',
  })
}

/**
 * Streams a playground completion, calling `onEvent` for every delta.
 * Refreshes an expired access token once. Rejects with an Error carrying a
 * readable message; an abort rejects with the DOMException from fetch.
 */
export async function streamChatCompletion(options: {
  body: ChatCompletionBody
  signal: AbortSignal
  onEvent: (event: StreamEvent) => void
}): Promise<void> {
  let response = await post(options.body, options.signal)
  if (response.status === 401 && (await refreshSession())) {
    response = await post(options.body, options.signal)
  }
  if (!response.ok) throw new Error(readErrorMessage(await response.text(), response.status))
  if (!response.body) throw new Error('当前浏览器不支持流式响应')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let rest = ''
  for (;;) {
    const { value, done } = await reader.read()
    const text = done ? decoder.decode() + '\n' : decoder.decode(value, { stream: true })
    const parsed = parseSseChunk(rest, text)
    rest = parsed.rest
    for (const event of parsed.events) {
      options.onEvent(event)
      if (event.type === 'done') {
        await reader.cancel().catch(() => undefined)
        return
      }
    }
    if (done) return
  }
}
