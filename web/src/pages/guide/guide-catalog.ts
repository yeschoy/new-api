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
import { tk } from '@/i18n/i18n'

import { CLAUDE_CODE_DOCS } from './guide-docs-claude-code'
import { CODEX_DOCS } from './guide-docs-codex'
import { HELP_DOCS } from './guide-docs-help'
import { START_DOCS } from './guide-docs-start'
import type { GuideBlock, GuideDoc, GuideDocSlug, GuideGroup, GuidePlatform, GuideSection } from './guide-types'

export const GUIDE_DOCS: ReadonlyArray<GuideDoc> = [...START_DOCS, ...CLAUDE_CODE_DOCS, ...CODEX_DOCS, ...HELP_DOCS]

/** Sidebar headings, in order. */
export const GUIDE_GROUPS: ReadonlyArray<{ id: GuideGroup; label: string }> = [
  { id: 'start', label: tk('从这里开始') },
  { id: 'coding', label: tk('编程工具') },
  { id: 'desktop', label: tk('桌面应用') },
  { id: 'help', label: tk('帮助') },
]

export const PLATFORM_LABELS: Record<GuidePlatform, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  vscode: 'VS Code',
  jetbrains: 'JetBrains',
}

export function getGuideDoc(slug: string): GuideDoc | undefined {
  return GUIDE_DOCS.find((doc) => doc.slug === slug)
}

/** The quick start is the guide's front page; the others live under it. */
export function guideHref(slug: GuideDocSlug): string {
  return slug === 'quick-start' ? '/guide' : `/guide/${slug}`
}

export function guideNeighbors(slug: GuideDocSlug): { previous: GuideDoc | null; next: GuideDoc | null } {
  const index = GUIDE_DOCS.findIndex((doc) => doc.slug === slug)
  return { previous: GUIDE_DOCS[index - 1] ?? null, next: GUIDE_DOCS[index + 1] ?? null }
}

/** The platforms the article has separate instructions for, in the order they first appear. */
export function guidePlatforms(doc: GuideDoc): GuidePlatform[] {
  const found = new Set<GuidePlatform>()
  for (const section of doc.sections) {
    for (const block of section.blocks) {
      if (block.type === 'platform') for (const platform of Object.keys(block.platforms) as GuidePlatform[]) found.add(platform)
    }
  }
  return [...found]
}

function blockTexts(block: GuideBlock, out: string[]) {
  if (block.type === 'paragraph') out.push(block.text)
  if (block.type === 'code') out.push(block.label)
  if (block.type === 'callout') out.push(block.title, block.text)
  if (block.type === 'table') out.push(...block.columns, ...block.rows.flat())
  if (block.type === 'context-window') out.push(block.supportedTitle, block.supportedText, block.unavailableTitle, block.unavailableText)
  if (block.type === 'steps') {
    for (const item of block.items) {
      out.push(item.title, item.text ?? '', item.code?.label ?? '', item.action?.label ?? '')
    }
  }
  if (block.type === 'platform') {
    for (const blocks of Object.values(block.platforms)) for (const inner of blocks ?? []) blockTexts(inner, out)
  }
}

function sectionText(section: GuideSection, translate: (text: string) => string): string {
  const texts = [section.title]
  for (const block of section.blocks) blockTexts(block, texts)
  return texts.filter(Boolean).map(translate).join(' ')
}

export type GuideHit = { slug: GuideDocSlug; sectionId: string; title: string; snippet: string }

/** Up to ten articles whose words (as shown in the current language) contain the query, one hit each. */
export function searchGuide(query: string, translate: (text: string) => string): GuideHit[] {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return []
  const hits: GuideHit[] = []
  for (const doc of GUIDE_DOCS) {
    if (hits.length >= 10) break
    const title = translate(doc.title)
    const summary = translate(doc.summary)
    if (`${title} ${summary}`.toLocaleLowerCase().includes(needle)) {
      hits.push({ slug: doc.slug, sectionId: doc.sections[0]?.id ?? '', title, snippet: summary })
      continue
    }
    const section = doc.sections.find((item) => sectionText(item, translate).toLocaleLowerCase().includes(needle))
    if (section) hits.push({ slug: doc.slug, sectionId: section.id, title, snippet: translate(section.title) })
  }
  return hits
}
