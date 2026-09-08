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
import { Link } from '@tanstack/react-router'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { useTheme } from '@/context/theme-provider'
import { CiMark } from '@/features/home/components/ci-mark'
import {
  buildSavingsCatalog,
  formatPerMillionTokens,
  type SavingsModel,
} from '@/features/home/lib/pricing-savings'
import {
  vendorAvatar,
  vendorAvatarIsMono,
} from '@/features/home/lib/vendor-avatar'
import { usePricingData } from '@/features/pricing/hooks'
import { PRODUCT_NAME } from '@/lib/product-brand'

type TickerRow = {
  name: string
  vendor: string
  off: number
  price: string
  src: string
  mono: boolean
}

function toTickerRow(model: SavingsModel): TickerRow {
  const priceValue = model.siteInputPrice
  return {
    name: model.modelName,
    vendor: model.vendorName,
    off: model.savingsPercent,
    price: Number.isFinite(priceValue)
      ? formatPerMillionTokens(priceValue)
      : '',
    src: vendorAvatar(model),
    mono: vendorAvatarIsMono(model),
  }
}

type AccessAuthLayoutProps = {
  title?: string
  children: React.ReactNode
}

export function AccessAuthLayout(props: AccessAuthLayoutProps) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const { models, priceRate } = usePricingData(true, { publicPreview: true })
  const catalog = useMemo(
    () => buildSavingsCatalog(models, priceRate),
    [models, priceRate]
  )
  const ticker = useMemo(() => {
    const live = [...catalog]
      .sort((a, b) => b.savingsPercent - a.savingsPercent)
      .slice(0, 12)
      .map(toTickerRow)
    return live
  }, [catalog])
  const belowCount = ticker.filter((row) => row.off > 0).length
  const lanes = [0, 1]

  return (
    <div
      className='ci-landing ci-theme ci-auth'
      data-theme={isDark ? 'dark' : 'light'}
    >
      <header className='ci-header'>
        <div className='ci-headerInner'>
          <Link to='/' className='ci-logo' aria-label={`${PRODUCT_NAME} home`}>
            <CiMark size={22} withWordmark />
          </Link>
        </div>
      </header>
      <main className='ci-authMain'>
        <section className='ci-authTicker' aria-hidden='true'>
          <p>
            {PRODUCT_NAME} · {t('Access terminal')}
          </p>
          <div className='ci-authTickerMeta'>
            <span className='ci-liveBadge ci-liveBadgeNoDot'>
              {t('Live prices')}
            </span>
            <small>
              {t('{{count}} models · {{below}} below list', {
                count: ticker.length,
                below: belowCount,
              })}
            </small>
          </div>
          {ticker.length === 0 ? <p>{t('No models available')}</p> : null}
          <div className='ci-authTickerViewport'>
            <div className='ci-authTickerTrack'>
              {lanes.flatMap((lane) =>
                ticker.map((item) => (
                  <article key={`${lane}-${item.name}`}>
                    <img
                      src={item.src}
                      alt=''
                      width={36}
                      height={36}
                      className={item.mono ? 'is-mono' : undefined}
                    />
                    <div>
                      <strong>{item.name}</strong>
                      <span>
                        {item.vendor}
                        {item.price ? ` · ${item.price}` : null}
                      </span>
                    </div>
                    <b>{item.off > 0 ? `−${item.off}%` : t('List price')}</b>
                  </article>
                ))
              )}
            </div>
          </div>
          <div className='ci-authTickerFoot'>
            <span>{t('Live catalog · Never above published list')}</span>
            <Link to='/pricing'>{t('Browse catalog')}</Link>
          </div>
        </section>
        <section className='ci-authPanel'>
          {props.title ? <h1>{props.title}</h1> : null}
          {props.children}
        </section>
      </main>
    </div>
  )
}
