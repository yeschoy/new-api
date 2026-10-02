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
import { ccSwitchUrl, connectionInfo, parseChatPresets, resolveChatUrl, sendToFluent } from '../chat-links'

const ADDRESS = 'https://yeschoy.com'

function decodeConfig(url: string, prefix: string): unknown {
  return JSON.parse(atob(decodeURIComponent(url.slice(prefix.length))))
}

describe('chat presets from the site status', () => {
  it('reads the JSON list of one-entry objects the admin saved', () => {
    const presets = parseChatPresets(
      JSON.stringify([
        { 'Cherry Studio': 'cherrystudio://providers/api-keys?v=1&data={cherryConfig}' },
        { 流畅阅读: 'fluentread' },
        { 'Lobe Chat': 'https://chat.example.com/?key={key}' },
      ])
    )
    expect(presets).toEqual([
      { id: '0', name: 'Cherry Studio', url: 'cherrystudio://providers/api-keys?v=1&data={cherryConfig}', type: 'app' },
      { id: '1', name: '流畅阅读', url: 'fluentread', type: 'fluent' },
      { id: '2', name: 'Lobe Chat', url: 'https://chat.example.com/?key={key}', type: 'web' },
    ])
  })

  it('skips malformed entries and unreadable lists', () => {
    expect(parseChatPresets('not json')).toEqual([])
    expect(parseChatPresets(undefined)).toEqual([])
    expect(parseChatPresets([{ a: 'x', b: 'y' }, { c: 1 }, { d: '  ' }, null, { ok: 'https://ok.example' }])).toEqual([
      { id: '4', name: 'ok', url: 'https://ok.example', type: 'web' },
    ])
  })

  it('leaves out the CC Switch marker, which opens its own import dialog', () => {
    expect(parseChatPresets([{ 'CC Switch': 'ccswitch' }])).toEqual([])
  })
})

describe('deep links', () => {
  it('fills {address} and {key} into ordinary links', () => {
    const url = resolveChatUrl({ template: 'ama://set-api-key?server={address}&key={key}', apiKey: 'abc', address: ADDRESS, siteName: 'yeschoy' })
    expect(url).toBe('ama://set-api-key?server=https%3A%2F%2Fyeschoy.com&key=sk-abc')
  })

  it('packs the base URL and key for Cherry Studio', () => {
    const url = resolveChatUrl({ template: 'cherrystudio://providers/api-keys?v=1&data={cherryConfig}', apiKey: 'sk-abc', address: ADDRESS, siteName: 'yeschoy' })
    expect(decodeConfig(url, 'cherrystudio://providers/api-keys?v=1&data=')).toEqual({ id: 'new-api', baseUrl: ADDRESS, apiKey: 'sk-abc' })
  })

  it('packs the base URL and key for AionUI and DeepChat', () => {
    const aionui = resolveChatUrl({ template: 'aionui://provider/add?v=1&data={aionuiConfig}', apiKey: 'abc', address: ADDRESS, siteName: 'yeschoy' })
    expect(decodeConfig(aionui, 'aionui://provider/add?v=1&data=')).toEqual({ platform: 'new-api', baseUrl: ADDRESS, apiKey: 'sk-abc' })
    const deepchat = resolveChatUrl({ template: 'deepchat://provider/install?v=1&data={deepchatConfig}', apiKey: 'abc', address: ADDRESS, siteName: 'yeschoy' })
    expect(decodeConfig(deepchat, 'deepchat://provider/install?v=1&data=')).toEqual({ id: 'new-api', baseUrl: ADDRESS, apiKey: 'sk-abc' })
  })

  it('names the provider after the site for AQBot', () => {
    const url = resolveChatUrl({ template: 'aqbot://providers?{aqbotConfig}', apiKey: 'abc', address: ADDRESS, siteName: '野菜' })
    expect(url).toBe(`aqbot://providers?name=${encodeURIComponent('野菜')}&baseurl=${encodeURIComponent(ADDRESS)}&apikey=sk-abc&type=openai`)
  })
})

describe('CC Switch import link', () => {
  it('points Claude at the site root with the chosen models', () => {
    const url = new URL(ccSwitchUrl({ app: 'claude', name: 'My Claude', models: { model: 'claude-a', haikuModel: '', opusModel: 'claude-o' }, apiKey: 'sk-abc', address: ADDRESS }))
    expect(url.protocol).toBe('ccswitch:')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      resource: 'provider',
      app: 'claude',
      name: 'My Claude',
      endpoint: ADDRESS,
      apiKey: 'sk-abc',
      model: 'claude-a',
      opusModel: 'claude-o',
      homepage: ADDRESS,
      enabled: 'true',
    })
  })

  it('points Codex at the /v1 base URL', () => {
    const url = new URL(ccSwitchUrl({ app: 'codex', name: 'My Codex', models: { model: 'gpt-x' }, apiKey: 'sk-abc', address: ADDRESS }))
    expect(url.searchParams.get('endpoint')).toBe(`${ADDRESS}/v1`)
  })
})

describe('connection info', () => {
  it('is the JSON a channel form can import', () => {
    expect(JSON.parse(connectionInfo('sk-abc', ADDRESS))).toEqual({ _type: 'newapi_channel_conn', key: 'sk-abc', url: ADDRESS })
  })
})

describe('sending a key to FluentRead', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('reports that the extension is missing', () => {
    expect(sendToFluent('sk-abc', ADDRESS)).toBe(false)
  })

  it('hands the key to the extension once prefixed', () => {
    const container = document.createElement('div')
    container.id = 'fluent-new-api-container'
    document.body.appendChild(container)
    const received: unknown[] = []
    container.addEventListener('fluent:prefill', (event) => received.push((event as CustomEvent).detail))
    expect(sendToFluent('sk-abc', ADDRESS)).toBe(true)
    expect(received).toEqual([{ id: 'new-api', baseUrl: ADDRESS, apiKey: 'sk-abc' }])
  })
})
