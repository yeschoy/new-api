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
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'

import { useI18n } from '@/i18n/i18n'

import { useAuth } from './auth-store'
import { guessIcon } from './model-icons'
import { currencyDisplay } from './pricing'
import {
  getPricing,
  getRankings,
  getStatus,
  type PricingModel,
  type RankingPeriod,
} from './services'

export function useStatus() {
  return useQuery({
    queryKey: ['status'],
    queryFn: getStatus,
    staleTime: 5 * 60_000,
  })
}

/**
 * The site's name, 野菜 in Chinese and yeschoy in every other language (the
 * system name setting is not used), and the operator's logo if one is set.
 */
export function useBrand(): { name: string; logo: string | null } {
  const { t } = useI18n()
  const { data } = useStatus()
  return {
    name: t('野菜|品牌'),
    logo: data?.logo?.trim() || null,
  }
}

/** The tab icon that ships with the site (index.html). */
const SITE_ICON = '/favicon.svg'

/** Names the browser tab after the brand, in the current language, with the operator's logo as its icon when one is set. */
export function useBrandTab() {
  const { name, logo } = useBrand()
  useEffect(() => {
    document.title = name
  }, [name])
  useEffect(() => {
    let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!icon) {
      if (!logo) return
      icon = document.createElement('link')
      icon.rel = 'icon'
      document.head.appendChild(icon)
    }
    icon.setAttribute('href', logo ?? SITE_ICON)
    // The operator's logo may be any image type; the bundled one is SVG.
    if (logo) icon.removeAttribute('type')
    else icon.setAttribute('type', 'image/svg+xml')
  }, [logo])
}

export function useCurrency() {
  const { data } = useStatus()
  return useMemo(() => currencyDisplay(data), [data])
}

export type CatalogModel = PricingModel & {
  vendor: string
  vendorIcon?: string
}

export function useCatalog() {
  const { lang, t } = useI18n()
  // The server filters models and group prices by the account, so each viewer has their own copy.
  const viewer = useAuth().user?.id ?? null
  const query = useQuery({
    queryKey: ['pricing', viewer],
    queryFn: getPricing,
    staleTime: 5 * 60_000,
    retry: false,
  })
  const models = useMemo<CatalogModel[]>(() => {
    const data = query.data
    if (!data?.data) return []
    const vendors = new Map((data.vendors ?? []).map((v) => [v.id, v]))
    return data.data.map((model) => {
      const vendor = model.vendor_id ? vendors.get(model.vendor_id) : undefined
      const vendorName = vendor?.name || model.vendor_name
      return {
        ...model,
        // Models the operator left without a vendor are filed under 其他.
        vendor: vendorName || t('其他'),
        vendorIcon: vendor?.icon || model.vendor_icon || model.icon || guessIcon(model.model_name, vendorName),
      }
    })
  }, [query.data, lang, t])
  const groupRatio = query.data?.group_ratio ?? {}
  const usableGroups = useMemo(() => Object.keys(query.data?.usable_group ?? {}), [query.data])
  return { ...query, models, groupRatio, usableGroups }
}

export function useRankings(period: RankingPeriod) {
  return useQuery({
    queryKey: ['rankings', period],
    queryFn: () => getRankings(period),
    staleTime: 5 * 60_000,
    retry: false,
  })
}
