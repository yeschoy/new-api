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
export type HandbookHeading = {
  id: string
  level: 1 | 2
  text: string
}

/** Headings from the raw Markdown, used for the table of contents. */
export function parseHandbookHeadings(source: string): HandbookHeading[] {
  const headings: HandbookHeading[] = []
  let inFence = false
  let skippedTitle = false
  for (const line of source.split('\n')) {
    if (line.startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const match = /^(#{1,2})\s+(.+?)\s*$/.exec(line)
    if (!match) continue
    const level = match[1].length as 1 | 2
    // The first H1 is the document title and is rendered as the page heading.
    if (level === 1 && !skippedTitle) {
      skippedTitle = true
      continue
    }
    headings.push({
      id: `hb-${headings.length + 1}`,
      level,
      text: match[2].replaceAll(/\\([\\`*_{}[\]()#+\-.!|])/g, '$1'),
    })
  }
  return headings
}

/** Body of the handbook without its leading H1 line. */
export function stripHandbookTitle(source: string): string {
  return source.replace(/^#\s+[^\n]*\n/, '')
}
