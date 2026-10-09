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
import { isObjectRecord } from '../utils/json-validators'

export type DesktopNoticeAction = {
  kind: 'wallet' | 'link'
  label?: string
  url?: string
}

export type DesktopNotice = {
  id?: string
  title: string
  body?: string
  severity?: '' | 'info' | 'warning'
  publishedAtEpochMs?: number
  expiresAtEpochMs?: number
  banner?: boolean
  action?: DesktopNoticeAction | null
}

export type DesktopNoticesValidationError =
  | { kind: 'invalid-json' }
  | { kind: 'not-array' }
  | { kind: 'not-object'; position: number }
  | { kind: 'missing-title'; position: number }
  | { kind: 'duplicate-id'; position: number; id: string }

export const DESKTOP_NOTICES_EXAMPLE = `[
  {
    "id": "2026-10-maintenance",
    "title": "计划维护通知",
    "body": "服务将短暂不可用。\\n感谢您的耐心等待。",
    "severity": "info",
    "publishedAtEpochMs": 1790000000000,
    "expiresAtEpochMs": 0,
    "banner": true,
    "action": { "kind": "wallet", "label": "去充值" }
  }
]`

export function createEmptyDesktopNotice(): DesktopNotice {
  const now = Date.now()
  return {
    id: `notice-${now}`,
    title: '',
    body: '',
    severity: 'info',
    publishedAtEpochMs: now,
    expiresAtEpochMs: 0,
    banner: false,
    action: null,
  }
}

export function parseDesktopNotices(raw: string): DesktopNotice[] {
  const trimmed = raw.trim()
  if (trimmed === '' || trimmed === '[]') return []
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(isObjectRecord)
      .map((item) => normalizeDesktopNotice(item))
      .filter((item) => item.title.trim() !== '' || Boolean(item.id))
  } catch {
    return []
  }
}

export function serializeDesktopNotices(notices: DesktopNotice[]): string {
  const cleaned = notices.map(cleanDesktopNoticeForSave)
  return JSON.stringify(cleaned, null, 2)
}

function normalizeDesktopNotice(item: Record<string, unknown>): DesktopNotice {
  const actionRaw = item.action
  let action: DesktopNoticeAction | null = null
  if (isObjectRecord(actionRaw) && typeof actionRaw.kind === 'string') {
    if (actionRaw.kind === 'wallet' || actionRaw.kind === 'link') {
      action = {
        kind: actionRaw.kind,
        label: typeof actionRaw.label === 'string' ? actionRaw.label : '',
        url: typeof actionRaw.url === 'string' ? actionRaw.url : '',
      }
    }
  }
  // Keep unknown severities so advanced JSON can round-trip to the server gate.
  const severity =
    typeof item.severity === 'string'
      ? (item.severity as DesktopNotice['severity'])
      : 'info'
  return {
    id: typeof item.id === 'string' ? item.id : '',
    title: typeof item.title === 'string' ? item.title : '',
    body: typeof item.body === 'string' ? item.body : '',
    severity,
    publishedAtEpochMs:
      typeof item.publishedAtEpochMs === 'number' ? item.publishedAtEpochMs : 0,
    expiresAtEpochMs:
      typeof item.expiresAtEpochMs === 'number' ? item.expiresAtEpochMs : 0,
    banner: Boolean(item.banner),
    action,
  }
}

function cleanDesktopNoticeForSave(notice: DesktopNotice): Record<string, unknown> {
  const out: Record<string, unknown> = {
    title: notice.title.trim(),
  }
  const id = notice.id?.trim()
  if (id) out.id = id
  const body = notice.body?.trim()
  if (body) out.body = notice.body
  if (notice.severity) {
    out.severity = notice.severity
  }
  if (notice.publishedAtEpochMs && notice.publishedAtEpochMs > 0) {
    out.publishedAtEpochMs = notice.publishedAtEpochMs
  }
  if (notice.expiresAtEpochMs && notice.expiresAtEpochMs > 0) {
    out.expiresAtEpochMs = notice.expiresAtEpochMs
  }
  if (notice.banner) out.banner = true
  if (notice.action?.kind === 'wallet') {
    out.action = {
      kind: 'wallet',
      ...(notice.action.label?.trim()
        ? { label: notice.action.label.trim() }
        : {}),
    }
  } else if (notice.action?.kind === 'link') {
    out.action = {
      kind: 'link',
      ...(notice.action.label?.trim()
        ? { label: notice.action.label.trim() }
        : {}),
      url: notice.action.url?.trim() ?? '',
    }
  }
  return out
}

/**
 * Mirrors the server-side save gate for the most common mistakes so admins
 * get inline feedback; the server remains the authority on field limits.
 * An empty value means "no notices".
 */
export function validateDesktopNotices(
  value: string
): DesktopNoticesValidationError | null {
  const trimmed = value.trim()
  if (trimmed === '') return null

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { kind: 'invalid-json' }
  }
  if (!Array.isArray(parsed)) return { kind: 'not-array' }

  const seenIds = new Set<string>()
  for (const [index, item] of parsed.entries()) {
    const position = index + 1
    if (!isObjectRecord(item)) return { kind: 'not-object', position }
    if (typeof item.title !== 'string' || item.title.trim() === '') {
      return { kind: 'missing-title', position }
    }
    if (typeof item.id === 'string' && item.id !== '') {
      if (seenIds.has(item.id)) {
        return { kind: 'duplicate-id', position, id: item.id }
      }
      seenIds.add(item.id)
    }
  }
  return null
}

export function epochMsToDatetimeLocal(ms?: number): string {
  if (!ms || ms <= 0) return ''
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function datetimeLocalToEpochMs(value: string): number {
  const trimmed = value.trim()
  if (!trimmed) return 0
  const ms = new Date(trimmed).getTime()
  return Number.isNaN(ms) ? 0 : ms
}
