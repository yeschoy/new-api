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
import { Apple, ArrowRight, MonitorDown } from 'lucide-react'

import { useI18n } from '@/i18n/i18n'

import { downloadUrl } from './downloads'

export const MANUAL_DOWNLOADS_ID = 'manual-downloads'

function Option(props: { href: string; icon: React.ReactNode; title: string; detail: string }) {
  return (
    <a
      href={props.href}
      className='border-or-line bg-or-card hover:bg-or-fill flex min-w-0 items-center gap-4 rounded-[8px] border p-5 transition-colors'
    >
      <span className='bg-or-fill text-or-fg flex size-11 shrink-0 items-center justify-center rounded-[8px]'>{props.icon}</span>
      <span className='min-w-0 flex-1'>
        <strong className='block text-[15px] font-semibold'>{props.title}</strong>
        <span className='text-or-muted mt-0.5 block text-[13px]'>{props.detail}</span>
      </span>
      <ArrowRight className='text-or-muted size-[18px] shrink-0' aria-hidden='true' />
    </a>
  )
}

/** Both installers, for any computer; the main button falls back here when it cannot tell the system. */
export function ManualDownloads(props: {
  hostname: string
  message: string
  headingRef: React.RefObject<HTMLHeadingElement | null>
}) {
  const { t } = useI18n()
  return (
    <section id={MANUAL_DOWNLOADS_ID} aria-labelledby='manual-download-title' className='border-or-line scroll-mt-24 border-t pt-16'>
      <h2
        id='manual-download-title'
        ref={props.headingRef}
        tabIndex={-1}
        className='text-[28px] leading-[1.2] font-bold tracking-[-0.6px] outline-none md:text-[32px]'
      >
        {t('选择下载版本')}
      </h2>
      <p role='status' aria-live='polite' className='text-or-muted mt-2 min-h-[22px] text-[14px] leading-[22px]'>
        {props.message}
      </p>
      <div className='mt-6 grid gap-4 md:grid-cols-2'>
        <Option
          href={downloadUrl('windows', props.hostname)}
          icon={<MonitorDown className='size-6' aria-hidden='true' />}
          title={t('Windows 安装程序')}
          detail={`${t('Windows 10 或更高版本')} · x86_64`}
        />
        <Option
          href={downloadUrl('macos', props.hostname)}
          icon={<Apple className='size-6' aria-hidden='true' />}
          title={t('macOS 通用版 DMG')}
          detail={t('Intel 与 Apple 芯片')}
        />
      </div>
    </section>
  )
}
