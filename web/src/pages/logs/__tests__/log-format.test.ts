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
import {
  cacheWriteTokens,
  displayGroupRatio,
  firstTokenTone,
  formatRatio,
  isFailedRequest,
  parseOther,
  responseTone,
  secondsLabel,
} from '../log-format'
import type { LogEntry } from '../log-types'

function entry(patch: Partial<LogEntry>): LogEntry {
  return {
    id: 1,
    user_id: 1,
    created_at: 1_760_000_000,
    type: 2,
    content: '',
    username: 'alice',
    token_name: 'prod',
    model_name: 'gpt-test',
    quota: 1000,
    prompt_tokens: 10,
    completion_tokens: 5,
    use_time: 1,
    is_stream: false,
    channel: 3,
    token_id: 1,
    group: 'default',
    ip: '',
    other: '',
    ...patch,
  }
}

describe('parseOther', () => {
  it('returns null for an empty or malformed other field', () => {
    expect(parseOther('')).toBeNull()
    expect(parseOther('{not json')).toBeNull()
    expect(parseOther('[1,2]')).toBeNull()
  })

  it('reads the JSON object the backend stores', () => {
    expect(parseOther('{"cache_tokens":12,"frt":340}')).toEqual({ cache_tokens: 12, frt: 340 })
  })
})

describe('displayGroupRatio', () => {
  it('prefers the user exclusive ratio unless it is the -1 sentinel', () => {
    expect(displayGroupRatio({ user_group_ratio: 0.8, group_ratio: 0.5 })).toBe(0.8)
    expect(displayGroupRatio({ user_group_ratio: -1, group_ratio: 0.5 })).toBe(0.5)
  })

  it('hides the default group ratio of 1', () => {
    expect(displayGroupRatio({ group_ratio: 1 })).toBeNull()
    expect(displayGroupRatio(null)).toBeNull()
  })
})

describe('formatRatio', () => {
  it('keeps whole numbers and trims trailing zeros', () => {
    expect(formatRatio(2)).toBe('2')
    expect(formatRatio(0.125)).toBe('0.125')
    expect(formatRatio(0.33333333)).toBe('0.3333')
  })
})

describe('isFailedRequest', () => {
  it('flags error rows, violation fees and broken streams', () => {
    expect(isFailedRequest(entry({ type: 5 }), null)).toBe(true)
    expect(isFailedRequest(entry({}), { violation_fee: true })).toBe(true)
    expect(isFailedRequest(entry({ is_stream: true }), { stream_status: { status: 'error' } })).toBe(true)
  })

  it('treats a settled consume row as a success', () => {
    expect(isFailedRequest(entry({ is_stream: true }), { stream_status: { status: 'ok' } })).toBe(false)
  })
})

describe('cacheWriteTokens', () => {
  it('adds the 5m and 1h writes when the split is recorded', () => {
    expect(cacheWriteTokens({ cache_creation_tokens: 99, cache_creation_tokens_5m: 10, cache_creation_tokens_1h: 5 })).toBe(15)
  })

  it('falls back to the total write count', () => {
    expect(cacheWriteTokens({ cache_creation_tokens: 99 })).toBe(99)
    expect(cacheWriteTokens(null)).toBe(0)
  })
})

describe('timing', () => {
  it('labels seconds and minutes', () => {
    expect(secondsLabel(2.5)).toBe('2.5s')
    expect(secondsLabel(75)).toBe('1m 15s')
  })

  it('grades the response by throughput once enough tokens were generated', () => {
    expect(responseTone(10, 400)).toBe('good')
    expect(responseTone(10, 200)).toBe('warn')
    expect(responseTone(40, 50)).toBe('bad')
    expect(responseTone(5, 50)).toBe('good')
  })

  it('grades the first token latency', () => {
    expect(firstTokenTone(1)).toBe('good')
    expect(firstTokenTone(7)).toBe('warn')
    expect(firstTokenTone(12)).toBe('bad')
  })
})
