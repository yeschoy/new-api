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
import { useTranslation } from 'react-i18next'

import { RichContent } from '@/components/rich-content'
import { useStatus } from '@/hooks/use-status'
import { useSystemConfig } from '@/hooks/use-system-config'
import { resolveProductName } from '@/lib/product-brand'
import { cn } from '@/lib/utils'

interface FooterProps {
  className?: string
}

export function Footer(props: FooterProps) {
  const { t } = useTranslation()
  const { status } = useStatus()
  const { footerHtml, logo, systemName } = useSystemConfig()
  const productName = resolveProductName(systemName)
  const currentYear = new Date().getFullYear()
  const legalLinks = [
    status?.user_agreement_enabled
      ? { href: '/user-agreement', label: t('User Agreement') }
      : null,
    status?.privacy_policy_enabled
      ? { href: '/privacy-policy', label: t('Privacy Policy') }
      : null,
  ].filter((link): link is { href: string; label: string } => link !== null)

  return (
    <footer className={cn('ed-footer', props.className)}>
      <div className='ed-container ed-footerInner'>
        <div className='ed-footerBrand'>
          <a href='/' className='ed-brand'>
            <span
              className='ed-brandMark'
              style={{ inlineSize: 26, blockSize: 26 }}
              aria-hidden='true'
            >
              <img src={logo} alt='' width={26} height={26} />
            </span>
            <span className='ed-brandName'>{productName}</span>
          </a>
          <p>{t('Professional AI model platform')}</p>
          {footerHtml ? (
            <RichContent
              mode='html'
              content={footerHtml}
              className='custom-footer min-w-0 text-sm'
            />
          ) : null}
        </div>
        {legalLinks.length > 0 ? (
          <nav className='ed-footerLinks' aria-label={t('Legal')}>
            {legalLinks.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
        ) : null}
        <div className='ed-footerMeta'>
          <span>
            &copy; {currentYear} {productName}. {t('footer.defaultCopyright')}
          </span>
          <span>
            {t('Built on')}{' '}
            <a
              href='https://github.com/QuantumNous/new-api'
              target='_blank'
              rel='noopener noreferrer'
            >
              {t('New API')}
            </a>
          </span>
        </div>
      </div>
    </footer>
  )
}
