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
import { ArrowRight, Apple, Download, MonitorDown } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MarketingHeader } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import { useTheme } from '@/context/theme-provider'
import { PRODUCT_NAME } from '@/lib/product-brand'
import { useAuthStore } from '@/stores/auth-store'

import {
  getDownloadUrl,
  resolveDownload,
  type DownloadEnvironment,
} from './lib/downloads'

export type DesktopClientRuntime = {
  hostname: string
  environment: DownloadEnvironment
}

export type DesktopClientPageProps = {
  runtime?: DesktopClientRuntime
}

const LIGHT_OVERVIEW = {
  src: '/client/yecai-client-apps-light-showcase.webp',
  width: 1820,
  height: 880,
} as const

const DARK_OVERVIEW = {
  src: '/client/yecai-client-apps-dark-showcase.webp',
  width: 1826,
  height: 873,
} as const

function getBrowserRuntime(): DesktopClientRuntime {
  if (typeof window === 'undefined') {
    return {
      hostname: '',
      environment: { userAgent: '', platform: '', maxTouchPoints: 0 },
    }
  }

  return {
    hostname: window.location.hostname,
    environment: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
    },
  }
}

function Screenshot(props: {
  src: string
  alt: string
  width: number
  height: number
  caption: string
  priority?: boolean
}) {
  return (
    <figure className='ed-paper m-0 overflow-hidden'>
      <figcaption className='ed-codeHead'>
        <span>{props.caption}</span>
      </figcaption>
      <img
        src={props.src}
        alt={props.alt}
        width={props.width}
        height={props.height}
        className='block h-auto w-full'
        fetchPriority={props.priority ? 'high' : undefined}
        loading={props.priority ? undefined : 'lazy'}
        decoding='async'
      />
    </figure>
  )
}

/** Desktop client marketing page: download call, three feature stories. */
export function DesktopClientPage(props: DesktopClientPageProps = {}) {
  const { t } = useTranslation()
  const { resolvedTheme } = useTheme()
  const isAuthenticated = useAuthStore((state) => !!state.auth.user)
  const manualHeadingRef = useRef<HTMLHeadingElement>(null)
  const [platformMessage, setPlatformMessage] = useState('')
  const runtime = props.runtime ?? getBrowserRuntime()
  const automaticDownload = resolveDownload(
    runtime.environment,
    runtime.hostname
  )
  const isDark = resolvedTheme === 'dark'
  const heroOverview = isDark ? DARK_OVERVIEW : LIGHT_OVERVIEW
  const alternateOverview = isDark ? LIGHT_OVERVIEW : DARK_OVERVIEW
  const heroOverviewAlt = isDark
    ? t('Yecai Client application overview in dark theme')
    : t('Yecai Client application overview in light theme')
  const alternateOverviewAlt = isDark
    ? t('Yecai Client application overview in light theme')
    : t('Yecai Client application overview in dark theme')

  let automaticLabel = t('Download desktop client')
  if (automaticDownload?.platform === 'windows') {
    automaticLabel = t('Download for Windows')
  } else if (automaticDownload?.platform === 'macos') {
    automaticLabel = t('Download for macOS')
  }

  const handleAutomaticDownload = (
    event: React.MouseEvent<HTMLAnchorElement>
  ) => {
    const currentRuntime = props.runtime ?? getBrowserRuntime()
    const currentDownload = resolveDownload(
      currentRuntime.environment,
      currentRuntime.hostname
    )

    if (currentDownload) {
      event.currentTarget.href = currentDownload.url
      return
    }

    event.preventDefault()
    setPlatformMessage(
      t(
        'We could not detect a supported desktop system. Choose Windows or macOS below.'
      )
    )

    const manualHeading = manualHeadingRef.current
    if (!manualHeading) return
    manualHeading.focus({ preventScroll: true })
    if (typeof manualHeading.scrollIntoView === 'function') {
      const behavior = window.matchMedia('(prefers-reduced-motion: reduce)')
        .matches
        ? 'auto'
        : 'smooth'
      manualHeading.scrollIntoView({ behavior, block: 'center' })
    }
  }

  const features = [
    {
      id: 'client-access-title',
      index: '01',
      kicker: t('Client'),
      title: t('Your apps, ready to connect'),
      copy: t(
        'Find supported desktop apps and finish setup without copying settings by hand.'
      ),
      image: {
        src: '/client/yecai-client-app-connection-showcase.webp',
        alt: t('Yecai Client application access setup'),
        width: 1825,
        height: 982,
      },
    },
    {
      id: 'client-pricing-title',
      index: '02',
      kicker: t('Client'),
      title: t('Choose with the full picture'),
      copy: t(
        'Compare complete model IDs, routes, and billing groups before connecting.'
      ),
      note: t(
        'Pricing shown in the product preview is illustrative and may change.'
      ),
      image: {
        src: '/client/yecai-client-model-pricing-showcase.webp',
        alt: t('Yecai Client model and pricing choices'),
        width: 1820,
        height: 1344,
      },
    },
    {
      id: 'client-theme-title',
      index: '03',
      kicker: t('Theme'),
      title: t('Comfortable in light or dark'),
      copy: t(
        'Follow your system theme while keeping the same clear application workspace.'
      ),
      image: {
        src: alternateOverview.src,
        alt: alternateOverviewAlt,
        width: alternateOverview.width,
        height: alternateOverview.height,
      },
    },
  ]

  return (
    <div className='ed-site'>
      <MarketingHeader isAuthenticated={isAuthenticated} currentPage='client' />
      <main>
        <section className='ed-hero' aria-labelledby='client-hero-title'>
          <div className='ed-container ed-heroGrid'>
            <div className='ed-heroCopy ed-rise'>
              <p className='ed-eyebrow'>
                {PRODUCT_NAME} · {t('Desktop client')}
              </p>
              <h1 id='client-hero-title' className='ed-display'>
                {t('AI workspace, now on your desktop')}
              </h1>
              <p className='ed-lede'>
                {t(
                  'Use one client to connect apps, choose models, and understand every price.'
                )}
              </p>
              <div className='ed-heroActions'>
                <a
                  className='ed-btn ed-btn--accent ed-btn--lg'
                  href={automaticDownload?.url ?? '#manual-downloads'}
                  onClick={handleAutomaticDownload}
                >
                  <Download aria-hidden='true' />
                  {automaticLabel}
                  <ArrowRight aria-hidden='true' />
                </a>
                <a
                  className='ed-btn ed-btn--outline ed-btn--lg'
                  href='#manual-downloads'
                >
                  {t('Choose another version')}
                  <ArrowRight aria-hidden='true' />
                </a>
              </div>
            </div>
            <div className='ed-rise ed-rise--2'>
              <Screenshot
                src={heroOverview.src}
                alt={heroOverviewAlt}
                width={heroOverview.width}
                height={heroOverview.height}
                caption={`${PRODUCT_NAME} ${t('Client')}`}
                priority
              />
            </div>
          </div>
        </section>

        {features.map((feature) => (
          <section
            key={feature.id}
            className='ed-section'
            aria-labelledby={feature.id}
          >
            <div className='ed-container ed-integration'>
              <div className='ed-integrationCopy'>
                <p className='ed-eyebrow'>
                  {feature.index} / {feature.kicker}
                </p>
                <h2 id={feature.id} className='ed-display'>
                  {feature.title}
                </h2>
                <p className='ed-lede'>{feature.copy}</p>
                {feature.note ? (
                  <p className='ed-panelNote'>{feature.note}</p>
                ) : null}
              </div>
              <Screenshot
                src={feature.image.src}
                alt={feature.image.alt}
                width={feature.image.width}
                height={feature.image.height}
                caption={feature.title}
              />
            </div>
          </section>
        ))}

        <section
          id='manual-downloads'
          className='ed-section'
          aria-labelledby='manual-download-title'
        >
          <div className='ed-container'>
            <div className='ed-sectionHead'>
              <p className='ed-eyebrow'>04 / {t('Client')}</p>
              <h2
                id='manual-download-title'
                ref={manualHeadingRef}
                tabIndex={-1}
                className='ed-display'
              >
                {t('Choose your download')}
              </h2>
              <p className='ed-lede' role='status' aria-live='polite'>
                {platformMessage}
              </p>
            </div>
            <div className='ed-trustGrid'>
              <a
                className='ed-trustCard'
                href={getDownloadUrl('windows', runtime.hostname)}
              >
                <span className='ed-emptyIcon'>
                  <MonitorDown size={20} aria-hidden='true' />
                </span>
                <h3>{t('Windows installer')}</h3>
                <p>{t('Windows 10 or later')} · x86_64</p>
                <span>
                  {t('Download')} <ArrowRight aria-hidden='true' />
                </span>
              </a>
              <a
                className='ed-trustCard'
                href={getDownloadUrl('macos', runtime.hostname)}
              >
                <span className='ed-emptyIcon'>
                  <Apple size={20} aria-hidden='true' />
                </span>
                <h3>{t('Universal macOS DMG')}</h3>
                <p>{t('Intel and Apple silicon')}</p>
                <span>
                  {t('Download')} <ArrowRight aria-hidden='true' />
                </span>
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
