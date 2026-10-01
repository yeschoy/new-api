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
import { parseSseChunk, readErrorMessage, type StreamEvent } from '../chat-stream'

function delta(content: string) {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content } }] })}\n\n`
}

/** Feeds chunks through the parser the way the network reader does. */
function feed(chunks: string[]): { events: StreamEvent[]; rest: string } {
  const events: StreamEvent[] = []
  let rest = ''
  for (const chunk of chunks) {
    const parsed = parseSseChunk(rest, chunk)
    events.push(...parsed.events)
    rest = parsed.rest
  }
  return { events, rest }
}

describe('parseSseChunk', () => {
  it('emits one content event per data line in a single chunk', () => {
    const { events, rest } = feed([delta('你') + delta('好')])
    expect(events).toEqual([
      { type: 'content', text: '你' },
      { type: 'content', text: '好' },
    ])
    expect(rest).toBe('')
  })

  it('reassembles data lines split across chunk boundaries', () => {
    const stream = delta('Hello') + delta(', world') + delta('!')
    const chunks = [stream.slice(0, 7), stream.slice(7, 40), stream.slice(40, 41), stream.slice(41)]
    const { events } = feed(chunks)
    expect(events.map((e) => (e.type === 'content' ? e.text : e.type)).join('')).toBe('Hello, world!')
    expect(events).toHaveLength(3)
  })

  it('keeps an incomplete trailing line as the remainder', () => {
    const parsed = parseSseChunk('', 'data: {"choices":[{"delta":{"content":"a"}}]}\ndata: {"cho')
    expect(parsed.events).toEqual([{ type: 'content', text: 'a' }])
    expect(parsed.rest).toBe('data: {"cho')
  })

  it('emits done for [DONE]', () => {
    const { events } = feed([delta('x'), 'data: [DONE]\n\n'])
    expect(events).toEqual([{ type: 'content', text: 'x' }, { type: 'done' }])
  })

  it('handles CRLF line endings', () => {
    const { events } = feed(['data: {"choices":[{"delta":{"content":"hi"}}]}\r\n\r\ndata: [DONE]\r\n'])
    expect(events).toEqual([{ type: 'content', text: 'hi' }, { type: 'done' }])
  })

  it('ignores comments, event/id lines, blank data and empty deltas', () => {
    const { events } = feed([
      ': keep-alive\n',
      'event: message\nid: 1\nretry: 1000\n',
      'data:\n',
      'data: {"choices":[{"delta":{"role":"assistant"}}]}\n',
      'data: {"choices":[{"delta":{"content":""}}]}\n',
      'data: {"choices":[],"usage":{"total_tokens":3}}\n',
      delta('ok'),
    ])
    expect(events).toEqual([{ type: 'content', text: 'ok' }])
  })

  it('emits reasoning deltas separately from content', () => {
    const { events } = feed([
      'data: {"choices":[{"delta":{"reasoning_content":"先想一下"}}]}\n',
      'data: {"choices":[{"delta":{"reasoning":"再想"}}]}\n',
      'data: {"choices":[{"delta":{"reasoning_content":null,"content":"答案"}}]}\n',
    ])
    expect(events).toEqual([
      { type: 'reasoning', text: '先想一下' },
      { type: 'reasoning', text: '再想' },
      { type: 'content', text: '答案' },
    ])
  })

  it('surfaces an in-stream error payload', () => {
    const { events } = feed(['data: {"error":{"message":"额度不足","type":"new_api_error"}}\n'])
    expect(events).toEqual([{ type: 'error', message: '额度不足' }])
  })

  it('skips data lines that are not valid JSON', () => {
    const { events } = feed(['data: not-json\n', delta('y')])
    expect(events).toEqual([{ type: 'content', text: 'y' }])
  })
})

describe('readErrorMessage', () => {
  it('reads the OpenAI-style error envelope', () => {
    expect(readErrorMessage('{"error":{"message":"模型不存在","type":"x"}}', 404)).toBe('模型不存在')
  })

  it('reads the dashboard envelope', () => {
    expect(readErrorMessage('{"success":false,"message":"未登录"}', 401)).toBe('未登录')
  })

  it('falls back to the status code for empty or non-JSON bodies', () => {
    expect(readErrorMessage('', 502)).toBe('请求失败（HTTP 502）')
    expect(readErrorMessage('<html>Bad Gateway</html>', 502)).toBe('请求失败（HTTP 502）')
  })
})
