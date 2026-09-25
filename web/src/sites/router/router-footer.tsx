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
import { Link } from 'react-router'

import { BrandMark } from '@/components/brand-mark'
import { useI18n } from '@/i18n/i18n'
import { useBrand, useStatus } from '@/lib/queries'

type FooterLink = { label: string; to: string; external?: boolean }

function FooterColumn(props: { title: string; links: FooterLink[] }) {
  return (
    <div className='flex flex-col gap-2'>
      <h3 className='text-or-fg text-[14px] leading-[22.75px] font-medium'>
        {props.title}
      </h3>
      {props.links.map((link) =>
        link.external ? (
          <a
            key={link.label}
            href={link.to}
            target='_blank'
            rel='noopener noreferrer'
            className='text-or-muted hover:text-or-fg text-[14px] leading-[22.75px] transition-colors'
          >
            {link.label}
          </a>
        ) : (
          <Link
            key={link.label}
            to={link.to}
            className='text-or-muted hover:text-or-fg text-[14px] leading-[22.75px] transition-colors'
          >
            {link.label}
          </Link>
        )
      )}
    </div>
  )
}

export function RouterFooter() {
  const brand = useBrand()
  const { t } = useI18n()
  const { data: status } = useStatus()
  const legal: FooterLink[] = [{ label: t('关于'), to: '/about' }]
  if (status?.privacy_policy_enabled) legal.push({ label: t('隐私政策'), to: '/privacy-policy' })
  if (status?.user_agreement_enabled) legal.push({ label: t('用户协议'), to: '/user-agreement' })

  return (
    <footer className='border-or-line bg-or-bg border-t px-6 py-16 md:px-12'>
      <div className='mx-auto grid max-w-[1280px] gap-8 sm:grid-cols-2 md:grid-cols-5'>
        <div className='flex flex-col gap-4'>
          <Link to='/' className='text-or-fg flex items-center gap-2 text-[15px] font-semibold'>
            <BrandMark size={20} />
            {brand.name}
          </Link>
          <div className='text-or-muted text-[14px]'>
            © {new Date().getFullYear()} {brand.name}
          </div>
        </div>
        <FooterColumn
          title={t('产品')}
          links={[
            { label: t('对话'), to: '/chat' },
            { label: t('排行榜'), to: '/rankings' },
            { label: t('模型'), to: '/models' },
            { label: t('定价'), to: '/settings/credits' },
          ]}
        />
        <FooterColumn title={t('公司')} links={legal} />
        <FooterColumn
          title={t('开发者')}
          links={[
            ...(status?.docs_link
              ? [{ label: t('文档'), to: status.docs_link, external: true }]
              : []),
            { label: t('API 密钥'), to: '/settings/keys' },
            { label: t('使用记录'), to: '/activity' },
          ]}
        />
        <FooterColumn
          title={t('社区')}
          links={[
            {
              label: 'GitHub',
              to: 'https://github.com/QuantumNous/new-api',
              external: true,
            },
          ]}
        />
      </div>
    </footer>
  )
}
