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
import type { TaskLog } from './log-types'

export type ArtifactType = 'image' | 'video' | 'audio' | 'file'
export type TaskArtifact = { key: string; type: ArtifactType; mime_type?: string; content_url: string }
export type ArtifactSet = { artifacts: TaskArtifact[]; legacyContentUrl?: string }

const TYPES = new Set(['image', 'video', 'audio', 'file'])
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/
const CONTENT_PATH = /\/v1\/tasks\/[^/]+\/artifacts\/[^/]+\/content$/
const ACCESS_TOKEN = /^[A-Za-z0-9_-]{43}$/
const MAX_ARTIFACTS = 64

class ArtifactError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Only links the backend signs for its own artifact endpoint are shown
 * (https/http, `/v1/tasks/<id>/artifacts/<key>/content?access=<token>`, no
 * credentials or fragments), so a tampered response cannot point the page
 * anywhere else.
 */
function contentUrl(value: unknown): string {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.includes('#') || !/^https?:\/\//i.test(value)) {
    throw new ArtifactError('invalid_content_url')
  }
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code <= 0x1f || code === 0x7f || char === '\\') throw new ArtifactError('invalid_content_url')
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ArtifactError('invalid_content_url')
  }
  const authorityEnd = value.indexOf('/', value.indexOf('//') + 2)
  const authority = value.slice(value.indexOf('//') + 2, authorityEnd === -1 ? value.length : authorityEnd)
  const access = url.searchParams.get('access')
  if (
    !url.hostname ||
    authority.includes('@') ||
    url.username ||
    url.password ||
    !CONTENT_PATH.test(url.pathname) ||
    access === null ||
    !ACCESS_TOKEN.test(access) ||
    url.search !== `?access=${access}`
  ) {
    throw new ArtifactError('invalid_content_url')
  }
  return value
}

function artifact(value: unknown): TaskArtifact {
  if (!isRecord(value)) throw new ArtifactError('invalid_artifact')
  const key = typeof value.key === 'string' ? value.key : ''
  const type = typeof value.type === 'string' ? value.type : ''
  if (!SAFE_KEY.test(key) || !TYPES.has(type)) throw new ArtifactError('invalid_artifact')
  const item: TaskArtifact = { key, type: type as ArtifactType, content_url: contentUrl(value.content_url) }
  if (typeof value.mime_type === 'string' && value.mime_type.trim()) {
    const mime = value.mime_type.trim()
    if (mime.length > 255 || /[\r\n]/.test(mime)) throw new ArtifactError('invalid_artifact')
    item.mime_type = mime
  }
  return item
}

/** Checks the `data` of GET /api/task/:id/artifacts; throws on anything unexpected. */
export function parseArtifacts(data: unknown): ArtifactSet {
  const raw = isRecord(data) ? data.artifacts : undefined
  if (raw != null && !Array.isArray(raw)) throw new ArtifactError('invalid_artifact_response')
  const list = (raw ?? []) as unknown[]
  if (list.length > MAX_ARTIFACTS) throw new ArtifactError('invalid_artifact_response')
  const artifacts = list.map(artifact)
  if (new Set(artifacts.map((item) => item.key)).size !== artifacts.length) throw new ArtifactError('duplicate_artifact_key')
  const legacy = isRecord(data) ? data.legacy_content_url : undefined
  return legacy == null ? { artifacts } : { artifacts, legacyContentUrl: contentUrl(legacy) }
}

/** How a finished task previews: plugin artifacts, old Suno clips or an old video. */
export function previewMode(log: TaskLog): 'plugin' | 'legacy-suno' | 'legacy-video' | 'none' {
  if (log.status !== 'SUCCESS') return 'none'
  if (log.admin_info?.task_plugin) return 'plugin'
  if (log.platform === 'suno') return 'legacy-suno'
  if (log.legacy_video_available) return 'legacy-video'
  return 'plugin'
}

export type AudioClip = {
  id?: string
  clip_id?: string
  title?: string
  tags?: string
  duration?: number
  audio_url: string
  image_url?: string
  image_large_url?: string
  metadata?: { tags?: string; duration?: number }
}

/** The clips an old Suno task stored in `data` (an array or its JSON text). */
export function audioClips(data: unknown): AudioClip[] {
  let values: unknown = data
  if (typeof data === 'string') {
    try {
      values = JSON.parse(data)
    } catch {
      return []
    }
  }
  if (!Array.isArray(values)) return []
  return values.filter((value): value is AudioClip => isRecord(value) && typeof value.audio_url === 'string' && value.audio_url !== '')
}
