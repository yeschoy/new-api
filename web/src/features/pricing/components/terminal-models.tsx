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
import { ArrowUpRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { TerminalPage } from '@/components/layout/components/terminal-page'
import { CatalogPrice } from '@/features/home/components/catalog-price'
import { CatalogVendorIcon } from '@/features/home/components/catalog-vendor-icon'
import {
  buildModelCatalog,
  filterCatalog,
  getCatalogModality,
  sortCatalog,
  uniqueVendors,
  type CatalogModality,
  type CatalogSort,
} from '@/features/home/lib/catalog'
import { getMaximumSavingsPercent } from '@/features/home/lib/pricing-savings'

import { usePricingData } from '../hooks/use-pricing-data'

const PAGE_SIZE = 20

const MODALITIES: CatalogModality[] = ['all', 'text', 'image', 'video']
const MODALITY_LABEL: Record<CatalogModality, string> = {
  all: 'All models',
  text: 'Text',
  image: 'Image',
  video: 'Video',
}

export function TerminalModels() {
  const { t } = useTranslation()
  const { models, priceRate, isLoading } = usePricingData()
  const [query, setQuery] = useState('')
  const [vendor, setVendor] = useState('all')
  const [sort, setSort] = useState<CatalogSort>('discount-desc')
  const [modality, setModality] = useState<CatalogModality>('all')
  const [page, setPage] = useState(0)

  const catalog = useMemo(
    () => buildModelCatalog(models || [], priceRate),
    [models, priceRate]
  )
  const vendors = useMemo(() => uniqueVendors(catalog), [catalog])
  const filtered = useMemo(() => {
    const next = sortCatalog(
      filterCatalog(catalog, query, vendor === 'all' ? '' : vendor, modality),
      sort
    )
    return next
  }, [catalog, modality, query, sort, vendor])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE
  )
  const maxSavings = getMaximumSavingsPercent(catalog)

  return (
    <TerminalPage
      wide
      title={t('Models')}
      description={t(
        'Find available models and compare prices and integration options.'
      )}
    >
      <section className='ed-stats ed-stats--three'>
        <article>
          <span>{t('Available models')}</span>
          <strong>{catalog.length}</strong>
          <small>{t('One API key, across modalities')}</small>
        </article>
        <article>
          <span>{t('Model companies')}</span>
          <strong>{vendors.length}</strong>
          <small>{t('Live catalog')}</small>
        </article>
        <article>
          <span>{t('Maximum savings')}</span>
          <strong className='is-saved'>{maxSavings}%</strong>
          <small>{t('Compared with pre-discount prices')}</small>
        </article>
      </section>

      <div className='ed-catalogFilters'>
        <label className='ed-field'>
          <span>{t('Search catalog')}</span>
          <input
            className='ed-input ed-input--sm'
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(0)
            }}
            placeholder={t('Search models or providers')}
          />
        </label>
        <label className='ed-field'>
          <span>{t('Provider')}</span>
          <select
            className='ed-input ed-input--sm'
            value={vendor}
            onChange={(event) => {
              setVendor(event.target.value)
              setPage(0)
            }}
          >
            <option value='all'>{t('All providers')}</option>
            {vendors.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className='ed-field'>
          <span>{t('Sort by')}</span>
          <select
            className='ed-input ed-input--sm'
            value={sort}
            onChange={(event) => setSort(event.target.value as CatalogSort)}
          >
            <option value='discount-desc'>{t('Biggest savings')}</option>
            <option value='discount-asc'>{t('Smallest savings')}</option>
            <option value='price-asc'>{t('Lowest price')}</option>
          </select>
        </label>
      </div>

      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='ed-chipRow'>
          {MODALITIES.map((item) => (
            <button
              key={item}
              type='button'
              className={item === modality ? 'ed-chip is-active' : 'ed-chip'}
              onClick={() => {
                setModality(item)
                setPage(0)
              }}
            >
              {t(MODALITY_LABEL[item])}
              {item === 'all' ? <span>{filtered.length}</span> : null}
            </button>
          ))}
        </div>
        <p className='ed-panelNote'>
          {t('{{count}} results', { count: filtered.length })}
        </p>
      </div>

      <section className='ed-panel'>
        {isLoading ? (
          <div className='ed-empty'>
            <p>{t('Loading catalog...')}</p>
          </div>
        ) : (
          <>
            <div className='ed-tableWrap'>
              <table className='ed-table'>
                <thead>
                  <tr>
                    <th>{t('Model')}</th>
                    <th>{t('Input')}</th>
                    <th>{t('Output')}</th>
                    <th>{t('Discount')}</th>
                    <th>{t('Modality')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((model) => (
                    <tr key={model.modelName}>
                      <td>
                        <div className='ed-modelCell'>
                          <CatalogVendorIcon model={model} />
                          <div>
                            <strong>{model.modelName}</strong>
                            <small>{model.vendorName}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <CatalogPrice model={model} side='input' />
                      </td>
                      <td>
                        <CatalogPrice model={model} side='output' />
                      </td>
                      <td>
                        {model.savingsPercent > 0 ? (
                          <span className='ed-savings'>
                            {t('Save {{percent}}%', {
                              percent: model.savingsPercent,
                            })}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>{getCatalogModality(model)}</td>
                      <td>
                        <Link
                          to='/pricing/$modelId'
                          params={{ modelId: model.modelName }}
                          aria-label={model.modelName}
                          className='ed-iconBtn ed-iconBtn--xs'
                        >
                          <ArrowUpRight size={15} aria-hidden='true' />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className='ed-pager px-5 pb-4'>
              <span>{t('Live gateway rates')}</span>
              <span>
                <button
                  type='button'
                  className='ed-btn ed-btn--ghost ed-btn--xs'
                  disabled={safePage === 0}
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                >
                  {t('Previous')}
                </button>
                {safePage + 1} / {pageCount}
                <button
                  type='button'
                  className='ed-btn ed-btn--ghost ed-btn--xs'
                  disabled={safePage + 1 >= pageCount}
                  onClick={() =>
                    setPage((current) => Math.min(pageCount - 1, current + 1))
                  }
                >
                  {t('Next')}
                </button>
              </span>
            </div>
          </>
        )}
      </section>
    </TerminalPage>
  )
}
