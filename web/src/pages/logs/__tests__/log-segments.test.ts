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
import { detailSegments } from '../log-segments'
import type { LogEntry, LogOther } from '../log-types'

const LOG: LogEntry = {
  id: 1,
  user_id: 1,
  created_at: 1_760_000_000,
  type: 2,
  content: '',
  username: 'alice',
  token_name: 'prod',
  model_name: 'gpt-4o',
  quota: 500_000,
  prompt_tokens: 10,
  completion_tokens: 5,
  use_time: 1,
  is_stream: false,
  channel: 3,
  token_id: 1,
  group: 'default',
  ip: '',
  other: '',
}

const money = {
  formatUsd: (usd: number) => `$${usd}`,
  format: (quota: number | undefined) => `$${(quota ?? 0) / 500_000}`,
}

function texts(log: LogEntry, other: LogOther | null, admin = false) {
  return detailSegments(log, other, { ...money, admin }).map((segment) => segment.text)
}

describe('detailSegments', () => {
  it('summarises token prices per million with the cache prices that applied', () => {
    const other = { model_ratio: 1.25, completion_ratio: 4, cache_ratio: 0.1, cache_tokens: 64 }
    expect(texts(LOG, other)).toEqual(['标准 · $2.5 / $10/M', '缓存 $0.25'])
  })

  it('shows the per-call price', () => {
    expect(texts(LOG, { model_price: 0.04 })).toEqual(['按次 · $0.04'])
  })

  it('falls back to the group ratio when no model price was recorded', () => {
    expect(texts(LOG, { user_group_ratio: 0.8 })).toEqual(['专属倍率 0.8x'])
  })

  it('leads with the violation fee', () => {
    expect(texts(LOG, { violation_fee: true, violation_fee_code: 'csam', fee_quota: 250_000 })).toEqual(['违规扣费', 'csam', '扣费 $0.5'])
  })

  it('names refunds and audit operations', () => {
    expect(texts({ ...LOG, type: 6 }, null)).toEqual(['异步任务退款'])
    expect(texts({ ...LOG, type: 7 }, { op: { action: 'login', params: { method: 'password' } } })).toEqual(['登录成功（通过 password）'])
  })

  it('puts the admin-only quota clamp and plugin first', () => {
    const other = { model_price: 0.04, admin_info: { quota_saturation: { op: 'x', kind: 'overflow' as const, original: 1, clamped: 0 }, task_plugin: { key: 'suno', name: 'Suno', version: '1.2' } } }
    expect(texts(LOG, other, true)).toEqual(['额度已钳制', '插件: Suno @ 1.2', '按次 · $0.04'])
    expect(texts(LOG, other, false)).toEqual(['按次 · $0.04'])
  })

  it('flags an overwritten system prompt', () => {
    expect(texts(LOG, { model_price: 0.04, is_system_prompt_overwritten: true })).toEqual(['按次 · $0.04', '系统提示词已覆盖'])
  })
})
