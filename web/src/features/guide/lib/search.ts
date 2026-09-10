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
import { guideTools, troubleshootRows } from '../data'

export type GuideSearchHit = {
  id: string
  kind: 'tool' | 'section'
  title: string
  snippet: string
  toolId?: string
  hash?: string
}

export function searchGuideDocs(
  query: string,
  t: (key: string) => string
): GuideSearchHit[] {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return []

  const hits: GuideSearchHit[] = []

  const sections: GuideSearchHit[] = [
    {
      id: 'essentials',
      kind: 'section',
      title: t('The three things every tool asks for'),
      snippet: t('Fill this when a tool asks for Base URL / API address'),
      hash: 'essentials',
    },
    {
      id: 'tools',
      kind: 'section',
      title: t('Pick your tool, follow the steps'),
      snippet: t(
        'Click any card for step-by-step setup. Addresses in the steps are already filled in with the real address of this site.'
      ),
      hash: 'tools',
    },
    {
      id: 'troubleshoot',
      kind: 'section',
      title: t('Saw an error? Decode it here'),
      snippet: t(troubleshootRows[0]?.error ?? 'The model list is empty'),
      hash: 'troubleshoot',
    },
  ]

  for (const section of sections) {
    const extra =
      section.id === 'essentials'
        ? ` ${t('Interface address')} ${t('API key')} ${t('Model ID')}`
        : ''
    const hay = `${section.title} ${section.snippet}${extra}`.toLowerCase()
    if (hay.includes(needle)) hits.push(section)
  }

  for (const tool of guideTools) {
    const summary = t(tool.summary)
    const steps = tool.steps.map((step) => t(step)).join(' ')
    const hay = `${tool.name} ${summary} ${steps}`.toLowerCase()
    if (!hay.includes(needle)) continue
    hits.push({
      id: tool.id,
      kind: 'tool',
      title: tool.name,
      snippet: summary,
      toolId: tool.id,
    })
  }

  return hits.slice(0, 8)
}
