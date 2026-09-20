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
import {
  ArrowRight,
  CalendarOff,
  Copy,
  ExternalLink,
  Gauge,
  Search,
  Wallet,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Footer } from '@/components/layout/components/footer'
import { MarketingHeader } from '@/components/layout/components/marketing-header'
import { useGuideAddress } from '@/features/guide/use-guide-address'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { PRODUCT_NAME } from '@/lib/product-brand'

import {
  filterCatalog,
  sortCatalog,
  uniqueVendors,
  type CatalogModality,
  type CatalogSort,
  type CatalogEntry,
} from '../lib/catalog'
import { formatPerMillionTokens } from '../lib/pricing-savings'
import { CatalogPrice } from './catalog-price'
import { CatalogVendorIcon } from './catalog-vendor-icon'

const PROVIDERS = [
  { name: 'OpenAI', src: '/ci/lobe/openai-avatar.svg' },
  { name: 'Anthropic', src: '/ci/lobe/claude-avatar.svg' },
  { name: 'Google', src: '/ci/lobe/gemini-avatar.svg' },
  { name: 'DeepSeek', src: '/ci/lobe/deepseek-avatar.svg' },
  { name: 'Meta', src: '/ci/lobe/meta-avatar.svg' },
  { name: 'Black Forest Labs', src: '/ci/landing-handoff/lobe/flux.svg' },
  { name: 'ElevenLabs', src: '/ci/landing-handoff/lobe/elevenlabs.svg' },
  { name: 'Kuaishou', src: '/ci/landing-handoff/lobe/kling-color.svg' },
] as const

function AnimatedPercent(props: { value: number }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const target = props.value
    const start = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 900)
      setShown(Math.round(target * (1 - (1 - t) ** 3)))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [props.value])
  return <em data-testid='hero-savings-percent'>{shown}%</em>
}

interface LandingPageProps {
  isAuthenticated: boolean
  models: CatalogEntry[]
  maxSavingsPercent: number
}

/** Public home page: hero, live catalog, integration, trust, closing call. */
export function LandingPage(props: LandingPageProps) {
  const { t } = useTranslation()
  const address = useGuideAddress()
  const clipboard = useCopyToClipboard({ notify: false })
  const primaryTo = props.isAuthenticated ? '/dashboard' : '/sign-up'

  const featured = useMemo(
    () =>
      props.models
        .filter((model) => model.quote)
        .sort((a, b) => b.savingsPercent - a.savingsPercent)[0],
    [props.models]
  )

  return (
    <div className='ed-site' id='top'>
      <MarketingHeader
        isAuthenticated={props.isAuthenticated}
        currentPage='home'
      />

      <main>
        <section className='ed-hero'>
          <div className='ed-container ed-heroGrid'>
            <div className='ed-heroCopy ed-rise'>
              <p className='ed-eyebrow'>
                {PRODUCT_NAME} · {t('AI model gateway')}
              </p>
              <h1 className='ed-display'>
                {props.maxSavingsPercent > 0 ? (
                  <>
                    {t('Save up to')} <AnimatedPercent value={props.maxSavingsPercent} />
                    <br />
                    {t('on AI models')}
                  </>
                ) : (
                  <>
                    {t('Pay in yuan across models')}
                    <br />
                    <em>{t('through one API')}</em>
                  </>
                )}
              </h1>
              <p className='ed-lede'>
                {t(
                  'Access leading discounted AI models from multiple providers through one OpenAI-compatible API,'
                )}{' '}
                <strong className='text-foreground font-medium'>
                  {t('without changing your request format.')}
                </strong>
              </p>
              <div className='ed-heroActions'>
                <Link to={primaryTo} className='ed-btn ed-btn--accent ed-btn--lg'>
                  {t('Start saving')}
                  <ArrowRight aria-hidden='true' />
                </Link>
                <Link to='/client' className='ed-btn ed-btn--outline ed-btn--lg'>
                  {t('Client')}
                </Link>
              </div>
              <ul className='ed-heroFacts'>
                <li>
                  <Wallet aria-hidden='true' /> {t('Fund from $5')}
                </li>
                <li>
                  <Gauge aria-hidden='true' /> {t('Usage-based pricing')}
                </li>
                <li>
                  <CalendarOff aria-hidden='true' /> {t('No monthly commitment')}
                </li>
              </ul>
            </div>

            <aside className='ed-heroAside ed-rise ed-rise--2'>
              {featured?.quote ? (
                <div className='ed-paper ed-quote' data-testid='live-comparison'>
                  <div className='ed-quoteHead'>
                    <strong>
                      <CatalogVendorIcon model={featured} />
                      {featured.modelName}
                    </strong>
                    <span className='ed-badge ed-badge--live'>{t('Live')}</span>
                  </div>
                  <div className='ed-quoteRow is-site'>
                    <span>{PRODUCT_NAME}</span>
                    <div className='ed-bar'>
                      <i
                        style={{
                          inlineSize: `${Math.min(
                            100,
                            (featured.quote.siteOutputPrice /
                              Math.max(featured.quote.baseOutputPrice, 0.01)) *
                              100
                          )}%`,
                        }}
                      />
                    </div>
                    <strong>
                      {formatPerMillionTokens(featured.quote.siteOutputPrice)}
                    </strong>
                  </div>
                  <div className='ed-quoteRow'>
                    <span>{t('List price')}</span>
                    <div className='ed-bar'>
                      <i style={{ inlineSize: '100%' }} />
                    </div>
                    <strong>
                      {formatPerMillionTokens(featured.quote.baseOutputPrice)}
                    </strong>
                  </div>
                  <p className='ed-quoteFoot'>
                    {t('Live rate comparison')} · {t('Output')} / 1M tokens
                  </p>
                </div>
              ) : null}
              <div className='ed-paper ed-paper--tint ed-endpoint'>
                <span>{t('Base URL')}</span>
                <button
                  type='button'
                  aria-label={`Copy the ${PRODUCT_NAME} base URL`}
                  onClick={() => {
                    void clipboard.copyToClipboard(address.baseUrl)
                  }}
                >
                  <Copy size={15} aria-hidden='true' />
                  <code>{address.baseUrl}</code>
                  <small aria-live='polite'>
                    {clipboard.copiedText === address.baseUrl
                      ? t('Copied')
                      : t('Copy')}
                  </small>
                </button>
              </div>
            </aside>
          </div>
        </section>

        <div className='ed-container'>
          <div className='ed-providers' aria-label={t('Upstream providers')}>
            <span>{t('Upstream providers')}</span>
            <ul>
              {PROVIDERS.map((provider) => (
                <li key={provider.name}>
                  <img alt='' width={22} height={22} src={provider.src} />
                  {provider.name}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Catalog models={props.models} />

        <section className='ed-section' id='connect'>
          <div className='ed-container ed-integration'>
            <div className='ed-integrationCopy'>
              <p className='ed-eyebrow'>{t('Integration')}</p>
              <h2 className='ed-display'>
                {t('Change two values. Access every leading provider.')}
              </h2>
              <p className='ed-lede'>
                {t(
                  'Replace your base URL and API key. Keep your messages, tools, streaming, and response handling exactly where they are.'
                )}
              </p>
              <ul className='ed-facts'>
                <li>{t('OpenAI SDK compatible')}</li>
                <li>{t('Model selected per request')}</li>
                <li>{t('Every request visible in History')}</li>
              </ul>
              <button
                type='button'
                className='ed-btn ed-btn--outline ed-btn--sm'
                onClick={() => {
                  void clipboard.copyToClipboard(
                    `baseURL: "${address.baseUrl}"\napiKey: "sk-..."`
                  )
                }}
              >
                <Copy aria-hidden='true' />
                {t('Copy configuration')}
              </button>
            </div>
            <div className='ed-paper ed-code'>
              <div className='ed-codeHead'>
                <span>client.ts</span>
                <span className='ed-badge'>{t('OpenAI SDK compatible')}</span>
              </div>
              <div className='ed-codeBody'>
                <p>
                  <span className='ed-codeMuted'>
                    {'// '}
                    {t('Live configuration update')}
                  </span>
                </p>
                <p>
                  <span className='ed-codeKeyword'>const</span> client ={' '}
                  <span className='ed-codeKeyword'>new</span> OpenAI({'{'}
                </p>
                <p>
                  {'  '}baseURL:{' '}
                  <span className='ed-codeString'>&quot;{address.baseUrl}&quot;</span>,
                </p>
                <p>
                  {'  '}apiKey:{' '}
                  <span className='ed-codeString'>&quot;sk-...&quot;</span>,
                </p>
                <p>{'})'}</p>
              </div>
            </div>
          </div>
        </section>

        <Trust />

        <section className='ed-section'>
          <div className='ed-container'>
            <div className='ed-paper ed-paper--ink ed-cta'>
              <h2 className='ed-display'>
                {t('Lower the cost of your')} <em>{t('next API request')}</em>
              </h2>
              <p>
                {t(
                  'Create an account, fund from $5, and keep your current request format.'
                )}
              </p>
              <div className='ed-heroActions'>
                <Link to={primaryTo} className='ed-btn ed-btn--accent ed-btn--lg'>
                  {t('Start saving')}
                  <ArrowRight aria-hidden='true' />
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  )
}

function Catalog(props: { models: CatalogEntry[] }) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [vendor, setVendor] = useState('all')
  const [sort, setSort] = useState<CatalogSort>('discount-desc')
  const [modality, setModality] = useState<CatalogModality>('all')
  const vendors = useMemo(() => uniqueVendors(props.models), [props.models])
  const counts = useMemo(
    () => ({
      all: props.models.length,
      text: filterCatalog(props.models, '', 'all', 'text').length,
      image: filterCatalog(props.models, '', 'all', 'image').length,
      video: filterCatalog(props.models, '', 'all', 'video').length,
    }),
    [props.models]
  )
  const rows = useMemo(
    () =>
      sortCatalog(
        filterCatalog(props.models, query, vendor, modality),
        sort
      ).slice(0, 8),
    [modality, props.models, query, sort, vendor]
  )

  return (
    <section className='ed-section' id='models'>
      <div className='ed-container'>
        <div className='ed-sectionHead ed-sectionHead--split'>
          <div>
            <p className='ed-eyebrow'>
              <span className='ed-badge ed-badge--live'>{t('Live')}</span>
            </p>
            <h2 className='ed-display'>{t('See our live catalog rates')}</h2>
          </div>
          <p className='ed-lede'>
            {t(
              'Browse available model capacity, compare market discounts, and inspect current activity across providers.'
            )}
          </p>
        </div>

        <div className='ed-catalogFilters'>
          <label className='ed-field'>
            <span>{t('Search')}</span>
            <span className='relative'>
              <Search
                size={15}
                aria-hidden='true'
                className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2'
              />
              <input
                className='ed-input ed-input--sm pl-9'
                placeholder={t('Search models or providers')}
                aria-label={t('Search models or providers')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </span>
          </label>
          <label className='ed-field'>
            <span>{t('Provider')}</span>
            <select
              aria-label={t('Filter by provider')}
              className='ed-input ed-input--sm'
              value={vendor}
              onChange={(event) => setVendor(event.target.value)}
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
              aria-label={t('Sort models')}
              className='ed-input ed-input--sm'
              value={sort}
              onChange={(event) => setSort(event.target.value as CatalogSort)}
            >
              <option value='price-asc'>{t('Lowest price')}</option>
              <option value='discount-desc'>{t('Biggest savings')}</option>
              <option value='discount-asc'>{t('Smallest savings')}</option>
            </select>
          </label>
        </div>

        <div className='ed-paper'>
          <div className='ed-catalogTabs'>
            <div className='ed-chipRow' role='tablist' aria-label={t('Model type')}>
              {(
                [
                  ['all', t('All models'), counts.all],
                  ['text', t('Text'), counts.text],
                  ['image', t('Image'), counts.image],
                  ['video', t('Video'), counts.video],
                ] as const
              ).map(([id, label, count]) => (
                <button
                  key={id}
                  type='button'
                  role='tab'
                  aria-selected={modality === id}
                  className='ed-chip'
                  onClick={() => setModality(id)}
                >
                  {label}
                  <span>{count}</span>
                </button>
              ))}
            </div>
            <p className='ed-panelNote'>
              {t(
                'Usage based. No separate routing surcharge. Never above direct list price.'
              )}
            </p>
          </div>
          <div className='ed-tableWrap' data-testid='live-catalog'>
            <table className='ed-table'>
              <thead>
                <tr>
                  <th>{t('Model')}</th>
                  <th>{t('Input')}</th>
                  <th>{t('Output')}</th>
                  <th>{t('Discount')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className='ed-empty'>
                        <p>{t('No models match these filters.')}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((model) => (
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
                      <td>
                        <Link
                          to='/pricing/$modelId'
                          params={{ modelId: model.modelName }}
                          aria-label={model.modelName}
                          className='ed-iconBtn ed-iconBtn--xs'
                        >
                          <ArrowRight size={15} aria-hidden='true' />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className='ed-pager'>
          <span>{t('Live gateway rates')}</span>
          <Link to='/pricing' className='ed-btn ed-btn--outline ed-btn--sm'>
            {t('View all {{count}} models', { count: props.models.length })}
            <ArrowRight aria-hidden='true' />
          </Link>
        </div>
      </div>
    </section>
  )
}

function Trust() {
  const { t } = useTranslation()
  return (
    <section className='ed-section' id='trust'>
      <div className='ed-container'>
        <div className='ed-sectionHead ed-sectionHead--split'>
          <div>
            <p className='ed-eyebrow'>{t('Trust')}</p>
            <h2 className='ed-display'>
              {t('Your data boundaries, clearly explained.')}
            </h2>
          </div>
          <p className='ed-lede'>
            {t(
              'See what the marketplace records, where caching can occur, and which routes support zero-data-retention controls.'
            )}
          </p>
        </div>
        <div className='ed-trustGrid'>
          <a className='ed-trustCard' href='/privacy-policy'>
            <b>01</b>
            <h3>{t('Application records')}</h3>
            <p>
              {t(
                'Usage and billing metadata only; never prompt or response bodies.'
              )}
            </p>
            <span>
              {t('Read the privacy policy')} <ExternalLink aria-hidden='true' />
            </span>
          </a>
          <div className='ed-trustCard'>
            <b>02</b>
            <h3>{t('Zero data retention available')}</h3>
            <p>
              {t(
                'Choose supported routes when your workload requires zero-retention controls.'
              )}
            </p>
            <span>{t('Check current security status')}</span>
          </div>
          <div className='ed-trustCard'>
            <b>03</b>
            <h3>{t('Upstream providers')}</h3>
            <p>
              {t(
                'Each request reaches only the provider selected to serve that route.'
              )}
            </p>
            <span>{t('Review subprocessors')}</span>
          </div>
          <div className='ed-trustCard'>
            <b>04</b>
            <h3>{t('Optional caching')}</h3>
            <p>
              {t(
                'Cache controls pass through when the selected model supports them.'
              )}
            </p>
            <span>{t('Review caching guidance')}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
