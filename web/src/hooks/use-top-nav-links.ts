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
import { useTranslation } from 'react-i18next'

import { useIsAdmin } from '@/hooks/use-admin'
import { useStatus } from '@/hooks/use-status'
import { parseHeaderNavModulesFromStatus } from '@/lib/nav-modules'
import { useAuthStore } from '@/stores/auth-store'

export type TopNavLink = {
  title: string
  href: string
  disabled?: boolean
  requiresAuth?: boolean
  external?: boolean
}

export function useTopNavLinks(): TopNavLink[] {
  const { t } = useTranslation()
  const { status } = useStatus()
  const { auth } = useAuthStore()
  const isAdmin = useIsAdmin()

  const modules = useMemo(() => {
    return parseHeaderNavModulesFromStatus(
      status as Record<string, unknown> | null
    )
  }, [status])

  const isAuthed = !!auth?.user
  const links: TopNavLink[] = []

  if (!isAuthed) {
    if (modules?.home !== false) {
      links.push({ title: t('Home'), href: '/' })
    }
    if (modules?.docs !== false) {
      links.push({ title: t('Usage guide'), href: '/guide' })
    }
    const pricing = modules?.pricing
    if (pricing && typeof pricing === 'object' && pricing.enabled) {
      links.push({
        title: t('Pick a model'),
        href: '/pricing',
        requiresAuth: pricing.requireAuth,
      })
    }
    return links
  }

  links.push({ title: t('Start using'), href: '/dashboard/overview' })
  links.push({ title: t('Keys'), href: '/keys' })
  links.push({ title: t('Balance'), href: '/wallet' })

  const pricing = modules?.pricing
  if (pricing && typeof pricing === 'object' && pricing.enabled) {
    links.push({ title: t('Pick a model'), href: '/pricing' })
  }

  if (modules?.docs !== false) {
    links.push({ title: t('Usage guide'), href: '/guide' })
  }

  if (isAdmin) {
    links.push({ title: t('Admin'), href: '/channels' })
  }

  return links
}
