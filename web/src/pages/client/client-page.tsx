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
import { ArrowRight, Download } from 'lucide-react'
import { useRef, useState } from 'react'

import { BrandMark } from '@/components/brand-mark'
import { useI18n } from '@/i18n/i18n'
import { useBrand } from '@/lib/queries'
import { useTheme } from '@/site/theme'
import { RouterShell } from '@/sites/router/router-shell'

import { MANUAL_DOWNLOADS_ID, ManualDownloads } from './client-downloads'
import { SCREENSHOTS, Shot, type Screenshot } from './client-shot'
import { detectDownloadPlatform, downloadUrl, type DownloadPlatform } from './downloads'

function browserPlatform(): DownloadPlatform | null {
  return detectDownloadPlatform({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  })
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function Feature(props: { id: string; title: string; text: string; note?: string; shot: Screenshot; alt: string; caption: string }) {
  return (
    <section aria-labelledby={props.id} className='grid items-center gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-14'>
      <div>
        <h2 id={props.id} className='text-[28px] leading-[1.2] font-bold tracking-[-0.6px] md:text-[32px]'>
          {props.title}
        </h2>
        <p className='text-or-muted mt-3 text-[16px] leading-[26px]'>{props.text}</p>
        {props.note ? <p className='text-or-dim mt-3 text-[13px] leading-5'>{props.note}</p> : null}
      </div>
      <Shot shot={props.shot} alt={props.alt} caption={props.caption} />
    </section>
  )
}

/** The desktop client: what it does, a download for this computer, and both installers. */
export function ClientPage() {
  const { t } = useI18n()
  const brand = useBrand()
  const theme = useTheme()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [noInstaller, setNoInstaller] = useState(false)
  const hostname = window.location.hostname
  const platform = browserPlatform()
  const dark = theme.theme === 'dark'
  const appName = t('{brand}客户端', { brand: brand.name })
  const darkAlt = t('{brand}客户端深色主题下的“我的应用”总览', { brand: brand.name })
  const lightAlt = t('{brand}客户端浅色主题下的“我的应用”总览', { brand: brand.name })

  let label = t('下载桌面客户端')
  if (platform === 'windows') label = t('下载 Windows 版')
  if (platform === 'macos') label = t('下载 macOS 版')

  // No installer fits this system: point at the choices below instead of downloading.
  const onMainClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (platform) return
    event.preventDefault()
    setNoInstaller(true)
    const heading = headingRef.current
    if (!heading) return
    heading.focus({ preventScroll: true })
    heading.scrollIntoView?.({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' })
  }

  return (
    <RouterShell>
      <div className='mx-auto flex max-w-[1280px] flex-col gap-24 px-6 pt-12 pb-24 md:pt-16'>
        <section aria-labelledby='client-hero-title' className='grid items-center gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14'>
          <div>
            <div className='flex items-center gap-2 text-[15px] font-semibold'>
              <BrandMark size={28} />
              <span>{brand.name}</span>
              <span className='text-or-muted font-normal'>{t('客户端')}</span>
            </div>
            <p className='text-or-muted mt-8 text-[13px] font-medium'>{t('桌面客户端')}</p>
            <h1 id='client-hero-title' className='mt-2 text-[40px] leading-[1.15] font-bold tracking-[-1.4px] md:text-[56px]'>
              {t('AI 工作台，现在就在桌面')}
            </h1>
            <p className='text-or-muted mt-4 text-[16px] leading-[26px]'>{t('一个客户端，完成应用接入、模型选择与价格查看。')}</p>
            <div className='mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap'>
              <a
                href={platform ? downloadUrl(platform, hostname) : `#${MANUAL_DOWNLOADS_ID}`}
                onClick={onMainClick}
                className='bg-or-primary text-or-bg flex h-11 items-center justify-center gap-2 rounded-[6px] px-5 text-[14px] font-medium whitespace-nowrap transition-opacity hover:opacity-90'
              >
                <Download className='size-4' aria-hidden='true' />
                {label}
                <ArrowRight className='size-4' aria-hidden='true' />
              </a>
              <a
                href={`#${MANUAL_DOWNLOADS_ID}`}
                className='border-or-line bg-or-bg hover:bg-or-fill flex h-11 items-center justify-center gap-2 rounded-[6px] border px-5 text-[14px] font-medium whitespace-nowrap transition-colors'
              >
                {t('选择其他版本')}
                <ArrowRight className='size-4' aria-hidden='true' />
              </a>
            </div>
          </div>
          <Shot shot={dark ? SCREENSHOTS.appsDark : SCREENSHOTS.appsLight} alt={dark ? darkAlt : lightAlt} caption={appName} first />
        </section>

        <Feature
          id='client-access-title'
          title={t('你的应用，随时接入')}
          text={t('自动发现支持的桌面应用，无需手动复制设置即可完成接入。')}
          shot={SCREENSHOTS.connection}
          alt={t('{brand}客户端应用接入设置', { brand: brand.name })}
          caption={t('你的应用，随时接入')}
        />
        <Feature
          id='client-pricing-title'
          title={t('看清全貌，再做选择')}
          text={t('接入前即可比较完整模型 ID、线路与计费分组。')}
          note={t('产品预览中的价格仅作示意，可能随时调整。')}
          shot={SCREENSHOTS.pricing}
          alt={t('{brand}客户端的模型与价格选择', { brand: brand.name })}
          caption={t('看清全貌，再做选择')}
        />
        <Feature
          id='client-theme-title'
          title={t('浅色或深色，都能舒适专注')}
          text={t('跟随系统主题，始终保持同样清晰的应用工作台。')}
          shot={dark ? SCREENSHOTS.appsLight : SCREENSHOTS.appsDark}
          alt={dark ? lightAlt : darkAlt}
          caption={`${dark ? t('浅色') : t('深色')} · ${t('主题')}`}
        />

        <ManualDownloads
          hostname={hostname}
          headingRef={headingRef}
          message={noInstaller ? t('无法识别受支持的桌面系统，请在下方选择 Windows 或 macOS 版本。') : ''}
        />
      </div>
    </RouterShell>
  )
}
