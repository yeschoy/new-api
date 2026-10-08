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
import DOMPurify from 'dompurify'

import { cn } from '@/lib/format'

function looksLikeHtml(text: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(text)
}

/** Operator-written text: sanitised HTML when it is HTML, otherwise plain text with its line breaks. */
export function RichText(props: { text: string; className?: string }) {
  if (looksLikeHtml(props.text)) {
    return (
      <div
        className={cn('[&_a]:text-or-primary [&_a]:underline [&_li]:ml-5 [&_ol]:list-decimal [&_p]:mb-2 [&_ul]:list-disc', props.className)}
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(props.text) }}
      />
    )
  }
  return <p className={cn('break-words whitespace-pre-wrap', props.className)}>{props.text}</p>
}

/** One line of plain text for lists: tags, Markdown marks and runs of space removed. */
export function plainText(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
