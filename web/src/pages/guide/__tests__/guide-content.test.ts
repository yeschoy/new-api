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
import { GUIDE_DOCS, getGuideDoc, guideHref, guideNeighbors, guidePlatforms, searchGuide } from '../guide-catalog'
import { fillTemplate, filterModelsForAudience } from '../guide-runtime'

const same = (text: string) => text

describe('guide catalog', () => {
  it('lists the seven articles in reading order', () => {
    expect(GUIDE_DOCS.map((doc) => doc.slug)).toEqual([
      'quick-start',
      'essentials',
      'claude-code',
      'codex',
      'cc-switch',
      'cherry-studio',
      'troubleshooting',
    ])
  })

  it('links each article to its neighbours, with none before the first or after the last', () => {
    expect(guideNeighbors('codex').previous?.slug).toBe('claude-code')
    expect(guideNeighbors('codex').next?.slug).toBe('cc-switch')
    expect(guideNeighbors('quick-start').previous).toBeNull()
    expect(guideNeighbors('troubleshooting').next).toBeNull()
  })

  it('knows no article for an unknown slug', () => {
    expect(getGuideDoc('missing')).toBeUndefined()
  })

  it('serves the quick start at /guide and the others under it', () => {
    expect(guideHref('quick-start')).toBe('/guide')
    expect(guideHref('codex')).toBe('/guide/codex')
  })

  it('offers the platforms an article has instructions for, in order', () => {
    expect(guidePlatforms(getGuideDoc('codex')!)).toEqual(['windows', 'macos', 'linux', 'vscode', 'jetbrains'])
    expect(guidePlatforms(getGuideDoc('quick-start')!)).toEqual([])
  })
})

describe('searchGuide', () => {
  it('finds every article that mentions the words, once each, in reading order', () => {
    expect(searchGuide('404', same).map((hit) => hit.slug)).toEqual(['essentials', 'cherry-studio', 'troubleshooting'])
  })

  it('points a hit at the section that matched', () => {
    const hit = searchGuide('invalid_api_key', same)[0]
    expect(hit).toMatchObject({ slug: 'troubleshooting', sectionId: 'errors' })
  })

  it('finds nothing for a blank query', () => {
    expect(searchGuide('   ', same)).toEqual([])
  })
})

describe('fillTemplate', () => {
  const values = {
    host: 'https://api.example.test',
    baseUrl: 'https://api.example.test/v1',
    fullUrl: 'https://api.example.test/v1/chat/completions',
    model: 'model-a',
    group: 'default',
    apiKey: 'sk-••••••',
    brand: 'yeschoy',
  }

  it('fills the address, selection, masked key and brand', () => {
    expect(fillTemplate('{host} {baseUrl} {fullUrl} {model} {group} {apiKey} {brand}', values)).toBe(
      'https://api.example.test https://api.example.test/v1 https://api.example.test/v1/chat/completions model-a default sk-•••••• yeschoy'
    )
  })

  it('leaves JSON braces and unknown names untouched', () => {
    expect(fillTemplate('{"model":"{model}"} {unknown}', values)).toBe('{"model":"model-a"} {unknown}')
  })
})

describe('filterModelsForAudience', () => {
  const pricing = [
    { model_name: 'chat', supported_endpoint_types: ['openai'] },
    { model_name: 'agent', supported_endpoint_types: ['openai-response'] },
  ]

  it('keeps only the account models that speak the article protocol', () => {
    expect(filterModelsForAudience(['missing-metadata', 'chat', 'agent'], pricing, 'openai-response')).toEqual(['agent'])
  })

  it('keeps every account model, sorted, for articles that work with any protocol', () => {
    expect(filterModelsForAudience(['zeta', 'alpha', 'zeta'], [], 'all')).toEqual(['alpha', 'zeta'])
  })
})
