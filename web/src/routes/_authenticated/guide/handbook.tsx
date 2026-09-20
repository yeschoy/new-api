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
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { DocsShell } from '@/features/guide/components/docs-shell'
import { DocsSidebar } from '@/features/guide/components/docs-sidebar'
import { HandbookArticle } from '@/features/guide/components/handbook-article'

export const Route = createFileRoute('/_authenticated/guide/handbook')({
  component: GuideHandbookRoute,
})

function GuideHandbookRoute() {
  const [query, setQuery] = useState('')

  return (
    <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
      <DocsShell
        sidebar={
          <DocsSidebar
            activeSlug='quick-start'
            activeHandbook
            query={query}
            onQueryChange={setQuery}
          />
        }
      >
        <HandbookArticle mobileQuery={query} onMobileQueryChange={setQuery} />
      </DocsShell>
    </div>
  )
}
