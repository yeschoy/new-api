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
import { useMemo } from 'react'
import { useSearchParams } from 'react-router'

import { RequireAuth } from '@/components/require-auth'
import { outputsOf } from '@/lib/model-filters'
import { defaultModel } from '@/lib/pinned-models'
import { useCatalog } from '@/lib/queries'
import { RouterShell } from '@/sites/router/router-shell'

import { RouterChat } from './router-chat'
import { useChat } from './use-chat'

/**
 * /chat — playground for signed-in users. `?model=` preselects a model;
 * otherwise the site's favourite (see pinned-models.ts).
 */
export function ChatPage() {
  const [params] = useSearchParams()
  const catalog = useCatalog()
  const models = useMemo(() => catalog.models.filter((m) => outputsOf(m).includes('text')), [catalog.models])
  const chat = useChat(params.get('model')?.trim() || defaultModel(models))

  return (
    <RouterShell footer={false}>
      <RequireAuth>
        <RouterChat chat={chat} models={models} loading={catalog.isLoading} />
      </RequireAuth>
    </RouterShell>
  )
}
