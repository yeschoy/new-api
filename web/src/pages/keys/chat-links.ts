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
import { withKeyPrefix } from '@/pages/console/console-helpers'

/** web: an https link; app: a custom protocol that opens a desktop app; fluent: the FluentRead extension. */
export type ChatLinkType = 'web' | 'app' | 'fluent'

/** One "use in app" entry from the admin's chat settings (status.chats). */
export type ChatPreset = { id: string; name: string; url: string; type: ChatLinkType }

/** The status.chats marker for CC Switch, which has its own import dialog. */
const CC_SWITCH_MARKER = 'ccswitch'

function linkType(url: string): ChatLinkType {
  if (/^https?:\/\//i.test(url)) return 'web'
  if (url.toLowerCase().startsWith('fluent')) return 'fluent'
  return 'app'
}

/** status.chats: a list (or its JSON) of one-entry objects, name → link template. */
export function parseChatPresets(raw: unknown): ChatPreset[] {
  let list = raw
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(list)) return []
  const presets: ChatPreset[] = []
  list.forEach((entry: unknown, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return
    const pairs = Object.entries(entry as Record<string, unknown>)
    if (pairs.length !== 1) return
    const [name, value] = pairs[0]
    const url = typeof value === 'string' ? value.trim() : ''
    if (!url || url.toLowerCase() === CC_SWITCH_MARKER) return
    presets.push({ id: String(index), name, url, type: linkType(url) })
  })
  return presets
}

function encodeConfig(payload: Record<string, string>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return encodeURIComponent(btoa(binary))
}

/**
 * A preset's link with the key and the site filled in: {cherryConfig},
 * {aionuiConfig}, {deepchatConfig} carry both as base64 JSON, {aqbotConfig} as a
 * query; otherwise {address} (URL-encoded) and {key} are replaced.
 */
export function resolveChatUrl(input: { template: string; apiKey: string; address: string; siteName: string }): string {
  const key = withKeyPrefix(input.apiKey.trim())
  const template = input.template
  if (template.includes('{cherryConfig}')) {
    return template.split('{cherryConfig}').join(encodeConfig({ id: 'new-api', baseUrl: input.address, apiKey: key }))
  }
  if (template.includes('{aionuiConfig}')) {
    return template.split('{aionuiConfig}').join(encodeConfig({ platform: 'new-api', baseUrl: input.address, apiKey: key }))
  }
  if (template.includes('{deepchatConfig}')) {
    return template.split('{deepchatConfig}').join(encodeConfig({ id: 'new-api', baseUrl: input.address, apiKey: key }))
  }
  if (template.includes('{aqbotConfig}')) {
    const query = [
      `name=${encodeURIComponent(input.siteName)}`,
      `baseurl=${encodeURIComponent(input.address)}`,
      `apikey=${encodeURIComponent(key)}`,
      'type=openai',
    ].join('&')
    return template.split('{aqbotConfig}').join(query)
  }
  let url = template
  if (input.address) url = url.split('{address}').join(encodeURIComponent(input.address))
  if (key) url = url.split('{key}').join(key)
  return url
}

/** Opens a resolved link: web pages in a new tab, app links in place so no blank tab is left. */
export function openChatLink(url: string, type: ChatLinkType) {
  if (type === 'web') {
    window.open(url, '_blank', 'noopener')
    return
  }
  window.location.href = url
}

/** Hands the key to the FluentRead extension; false when the extension is not on the page. */
export function sendToFluent(apiKey: string, address: string): boolean {
  const container = document.getElementById('fluent-new-api-container')
  if (!container) return false
  container.dispatchEvent(
    new CustomEvent('fluent:prefill', { detail: { id: 'new-api', baseUrl: address, apiKey: withKeyPrefix(apiKey) } })
  )
  return true
}

/** What a channel form on another new-api site can paste to fill in this key and address. */
export function connectionInfo(key: string, address: string): string {
  return JSON.stringify({ _type: 'newapi_channel_conn', key, url: address })
}

export type CcApp = 'claude' | 'codex' | 'gemini'

/** ccswitch://v1/import link that adds this site as a provider in CC Switch. */
export function ccSwitchUrl(input: { app: CcApp; name: string; models: Record<string, string>; apiKey: string; address: string }): string {
  const params = new URLSearchParams()
  params.set('resource', 'provider')
  params.set('app', input.app)
  params.set('name', input.name)
  params.set('endpoint', input.app === 'codex' ? `${input.address}/v1` : input.address)
  params.set('apiKey', input.apiKey)
  for (const [field, model] of Object.entries(input.models)) if (model) params.set(field, model)
  params.set('homepage', input.address)
  params.set('enabled', 'true')
  return `ccswitch://v1/import?${params.toString()}`
}
