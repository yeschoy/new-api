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
import { useEffect } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router'

import { useBrand } from '@/lib/queries'
import { NotFoundPage } from '@/pages/not-found'
import { RouterShell } from '@/sites/router/router-shell'

import { useGuideAddress } from './guide-address'
import { GuideArticle } from './guide-article'
import { getGuideDoc, guidePlatforms } from './guide-catalog'
import { API_KEY_PLACEHOLDER, type GuideValues } from './guide-runtime'
import { GuideSidebar } from './guide-sidebar'
import { GuideToc } from './guide-toc'
import type { GuideDoc } from './guide-types'
import { useGuideEnvironment } from './use-guide-environment'

/**
 * One article with the article list on the left and its sections on the
 * right. The search, platform, model and group live in the address
 * (?q, ?platform, ?model, ?group) so a filled-in page can be shared.
 */
function GuideLayout(props: { doc: GuideDoc }) {
  const brand = useBrand()
  const address = useGuideAddress()
  const location = useLocation()
  const [params, setParams] = useSearchParams()

  const update = (next: Record<string, string | undefined>) => {
    setParams(
      (current) => {
        const copy = new URLSearchParams(current)
        for (const [key, value] of Object.entries(next)) {
          if (value) copy.set(key, value)
          else copy.delete(key)
        }
        return copy
      },
      { replace: true, preventScrollReset: true }
    )
  }

  const platforms = guidePlatforms(props.doc)
  const fallback = platforms.includes('macos') ? 'macos' : (platforms[0] ?? 'macos')
  const platform = platforms.find((item) => item === params.get('platform')) ?? fallback
  const environment = useGuideEnvironment(
    props.doc.audience,
    { model: params.get('model') ?? undefined, group: params.get('group') ?? undefined },
    (selection) => update(selection)
  )
  const values: GuideValues = { ...address, model: environment.model, group: environment.group, apiKey: API_KEY_PLACEHOLDER, brand: brand.name }
  const query = params.get('q') ?? ''

  // A link to a section lands on it once the article is drawn (the root layout scrolls to the top first).
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1))
    if (!id) return
    const timer = window.setTimeout(() => document.getElementById(id)?.scrollIntoView?.({ block: 'start' }), 0)
    return () => window.clearTimeout(timer)
  }, [location.hash])

  return (
    <RouterShell>
      <div className='mx-auto grid max-w-[1440px] gap-x-10 px-6 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_12rem]'>
        <aside className='border-or-line sticky top-14 hidden h-[calc(100vh-3.5rem)] overflow-y-auto border-r py-10 pr-6 lg:block xl:top-[78px] xl:h-[calc(100vh-78px)]'>
          <GuideSidebar active={props.doc.slug} query={query} onQuery={(q) => update({ q })} />
        </aside>
        <GuideArticle
          doc={props.doc}
          environment={environment}
          values={values}
          platform={platform}
          platforms={platforms}
          onPlatform={(next) => update({ platform: next })}
          query={query}
          onQuery={(q) => update({ q })}
        />
        <GuideToc doc={props.doc} />
      </div>
    </RouterShell>
  )
}

/** /guide is the quick start; /guide/:slug the other articles. Unknown slugs get the 404 page. */
export function GuidePage() {
  const params = useParams()
  const doc = getGuideDoc(params.slug ?? 'quick-start')
  if (!doc || params.slug === 'quick-start') return <NotFoundPage />
  return <GuideLayout key={doc.slug} doc={doc} />
}
