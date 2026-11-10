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
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'

import { buildIQPreviewDocument, IQ_PREVIEW_SANDBOX } from './preview-document'
import { useIQArtifact } from './queries'
import type { IQResult } from './types'

export function IQPreview(props: {
  scope: string
  result: IQResult
  expanded?: boolean
}) {
  const { t } = useTranslation()
  const query = useIQArtifact(props.scope, props.result)
  const srcDoc = useMemo(() => {
    if (!query.data || query.isError) return null
    try {
      return buildIQPreviewDocument(query.data.artifact)
    } catch {
      return null
    }
  }, [query.data, query.isError])
  if (query.isPending) return <LoadingState className='min-h-40' />
  if (!srcDoc) {
    return (
      <ErrorState
        className='min-h-40'
        title={t('Preview unavailable. Refresh the gallery.')}
      />
    )
  }
  const title = t('Artwork by {{model}}', { model: props.result.model })
  if (!props.expanded) return <IQThumbnail srcDoc={srcDoc} title={title} />
  return (
    <iframe
      title={title}
      sandbox={IQ_PREVIEW_SANDBOX}
      referrerPolicy='no-referrer'
      srcDoc={srcDoc}
      className='h-[65dvh] w-full border-0 bg-white'
    />
  )
}

// Render at a desktop viewport, then scale the whole scene. Giving the artwork
// the card's narrow viewport breaks fixed-width scenes, vh layouts and typography.
function IQThumbnail(props: { srcDoc: string; title: string }) {
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)
  useEffect(() => {
    const element = container.current
    if (!element) return
    const measure = () => {
      const next = element.getBoundingClientRect().width
      if (next > 0) setWidth(next)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return (
    <div
      ref={container}
      className='relative aspect-[4/3] w-full overflow-hidden'
    >
      <iframe
        title={props.title}
        sandbox={IQ_PREVIEW_SANDBOX}
        referrerPolicy='no-referrer'
        srcDoc={props.srcDoc}
        tabIndex={-1}
        className='pointer-events-none absolute top-0 left-0 border-0 bg-white'
        style={{
          width: 1280,
          height: 960,
          transform: `scale(${width / 1280})`,
          transformOrigin: 'top left',
        }}
      />
    </div>
  )
}
