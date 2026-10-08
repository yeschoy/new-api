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
import { ExternalLink } from 'lucide-react'

import { cn } from '@/lib/format'

import type { TaskPluginAuthor } from './log-types'

/** Only http(s) author links are followed; anything else shows as plain text. */
export function safeAuthorUrl(author: TaskPluginAuthor | undefined): string | undefined {
  if (!author?.url) return undefined
  try {
    const url = new URL(author.url)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

/** A task plugin's author, linked when the plugin declares a safe homepage. */
export function PluginAuthor(props: { author: TaskPluginAuthor; showUrl?: boolean; className?: string }) {
  const name = props.author.name.trim()
  if (!name) return null
  const url = safeAuthorUrl(props.author)
  if (!url) return <span className={props.className}>{name}</span>
  return (
    <span className={cn('inline-flex min-w-0 flex-col', props.className)}>
      <a href={url} target='_blank' rel='noopener noreferrer' className='inline-flex min-w-0 items-center gap-1 hover:underline'>
        <span className='truncate'>{name}</span>
        <ExternalLink className='size-3 shrink-0' aria-hidden='true' />
      </a>
      {props.showUrl ? <span className='text-or-dim font-geist truncate text-[11px]'>{url}</span> : null}
    </span>
  )
}
