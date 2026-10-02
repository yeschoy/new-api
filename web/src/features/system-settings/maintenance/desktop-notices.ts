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

export type DesktopNoticesValidationError =
  | { kind: 'invalid-json' }
  | { kind: 'not-array' }
  | { kind: 'not-object'; position: number }
  | { kind: 'missing-title'; position: number }
  | { kind: 'duplicate-id'; position: number; id: string }

export const DESKTOP_NOTICES_EXAMPLE = `[
  {
    "id": "2026-10-maintenance",
    "title": "Scheduled maintenance",
    "body": "Service will be briefly unavailable.\\nThank you for your patience.",
    "severity": "info",
    "publishedAtEpochMs": 1790000000000,
    "expiresAtEpochMs": 0,
    "banner": true,
    "action": { "kind": "wallet", "label": "Top up" }
  }
]`

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
