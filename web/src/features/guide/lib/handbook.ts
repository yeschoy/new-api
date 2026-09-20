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

/**
 * Splits the handbook Markdown into a card-friendly structure.
 *
 * The document is organised as `# N、Category` chapters containing
 * `## N. Tool … STATUS` sections. Chapters whose sections are not tools
 * (the intro, error table, security notes) are kept as general Markdown.
 */

export type HandbookToolStatus =
  | 'supported'
  | 'converted'
  | 'limited'
  | 'unsupported'
  | 'other'

export type HandbookTool = {
  id: string
  /** Display name without numbering or status suffix. */
  name: string
  status: HandbookToolStatus
  /** Short intro paragraph shown on the card, if the section has one. */
  summary: string
  /** Full section body as Markdown, heading removed. */
  body: string
  categoryId: string
}

export type HandbookCategory = {
  id: string
  title: string
  tools: HandbookTool[]
}

export type HandbookChapter = {
  id: string
  title: string
  body: string
}

export type ParsedHandbook = {
  title: string
  intro: string
  categories: HandbookCategory[]
  chapters: HandbookChapter[]
}

const STATUS_MARKERS: Array<[RegExp, HandbookToolStatus]> = [
  [/✅/u, 'supported'],
  [/🔄/u, 'converted'],
  [/⚠️|⚠/u, 'limited'],
  [/❌/u, 'unsupported'],
]

function unescapeMarkdown(text: string): string {
  return text.replaceAll(/\\([\\`*_{}[\]()#+\-.!|])/g, '$1')
}

function detectStatus(heading: string): HandbookToolStatus {
  for (const [pattern, status] of STATUS_MARKERS) {
    if (pattern.test(heading)) return status
  }
  return 'other'
}

/** "12. Roo Code（VS Code）✅ 直接支持" → "Roo Code（VS Code）" */
function cleanToolName(heading: string): string {
  return unescapeMarkdown(heading)
    .replace(/^\d+\.\s*/, '')
    .replace(/\s*(✅|🔄|⚠️|⚠|❌)[^]*$/u, '')
    .trim()
}

/** "💬 一、聊天与办公软件" → "聊天与办公软件" */
function cleanChapterTitle(heading: string): string {
  return unescapeMarkdown(heading)
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/^[一二三四五六七八九十]+、\s*/, '')
    .trim()
}

function firstParagraph(body: string): string {
  for (const block of body.split(/\n{2,}/)) {
    const line = block.trim()
    if (!line || line.startsWith('**') || line.startsWith('>')) continue
    if (line.startsWith('|') || line.startsWith('```') || line.startsWith('#')) {
      continue
    }
    if (/^\d+\./.test(line) || line.startsWith('-')) continue
    return unescapeMarkdown(line).replaceAll('**', '')
  }
  return ''
}

type RawSection = { level: 1 | 2; heading: string; body: string }

function splitSections(source: string): RawSection[] {
  const sections: RawSection[] = []
  let current: RawSection | null = null
  let inFence = false
  const buffer: string[] = []
  const flush = () => {
    if (current) current.body = buffer.join('\n').trim()
    buffer.length = 0
  }
  for (const line of source.split('\n')) {
    if (line.startsWith('```')) inFence = !inFence
    const match = inFence ? null : /^(#{1,2})\s+(.+?)\s*$/.exec(line)
    if (match) {
      flush()
      current = {
        level: match[1].length as 1 | 2,
        heading: match[2],
        body: '',
      }
      sections.push(current)
      continue
    }
    buffer.push(line)
  }
  flush()
  return sections
}

export function parseHandbook(source: string): ParsedHandbook {
  const [titleLine, ...rest] = source.split('\n')
  const title = unescapeMarkdown(titleLine.replace(/^#\s+/, '')).trim()
  const sections = splitSections(rest.join('\n'))

  const intro: string[] = []
  const categories: HandbookCategory[] = []
  const chapters: HandbookChapter[] = []
  let chapterIndex = 0
  let category: HandbookCategory | null = null
  let chapter: HandbookChapter | null = null
  let introDone = false

  for (const section of sections) {
    if (section.level === 1) {
      introDone = true
      chapterIndex += 1
      const id = `chapter-${chapterIndex}`
      const heading = cleanChapterTitle(section.heading)
      category = { id, title: heading, tools: [] }
      chapter = { id, title: heading, body: section.body }
      continue
    }
    if (!introDone) {
      intro.push(`## ${section.heading}\n\n${section.body}`)
      continue
    }
    if (!category || !chapter) continue
    const status = detectStatus(section.heading)
    const looksLikeTool = /^\d+\\?\./.test(section.heading)
    if (looksLikeTool) {
      if (category.tools.length === 0) categories.push(category)
      category.tools.push({
        id: `${category.id}-tool-${category.tools.length + 1}`,
        name: cleanToolName(section.heading),
        status,
        summary: firstParagraph(section.body),
        body: section.body,
        categoryId: category.id,
      })
    } else {
      if (!chapters.includes(chapter)) chapters.push(chapter)
      chapter.body += `\n\n## ${section.heading}\n\n${section.body}`
    }
  }

  // Chapters without tools but with their own body (e.g. error tables).
  for (const section of sections) {
    if (section.level !== 1) continue
    const heading = cleanChapterTitle(section.heading)
    const known =
      categories.some((item) => item.title === heading) ||
      chapters.some((item) => item.title === heading)
    if (!known && section.body.trim()) {
      chapters.push({
        id: `chapter-extra-${chapters.length + 1}`,
        title: heading,
        body: section.body,
      })
    }
  }

  return {
    title,
    intro: intro.join('\n\n').trim(),
    categories,
    chapters,
  }
}
