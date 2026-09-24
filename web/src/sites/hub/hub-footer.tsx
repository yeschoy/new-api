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
import { useBrand, useStatus } from '@/lib/queries'

type FooterLink = { label: string; to: string; external?: boolean }

function Column(props: { title: string; links: FooterLink[] }) {
  const cls = 'text-[14px] leading-[22px] text-[#626773] transition-colors hover:text-hub-blue'
  return (
    <div>
      <h3 className='text-[14px] leading-[22px] font-semibold text-[#1a1a1a]'>{props.title}</h3>
      <ul className='mt-3 flex flex-col gap-2'>
        {props.links.map((link) => (
          <li key={link.label}>
            {link.external ? (
              <a href={link.to} target='_blank' rel='noopener noreferrer' className={cls}>
                {link.label}
              </a>
            ) : (
              <Link to={link.to} className={cls}>
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Brand + copyright on the left, four link columns (≈205px) on the right. */
export function HubFooter() {
  const brand = useBrand()
  const { data: status } = useStatus()
  const policies: FooterLink[] = []
  if (status?.user_agreement_enabled) policies.push({ label: '用户协议', to: '/user-agreement' })
  if (status?.privacy_policy_enabled) policies.push({ label: '隐私政策', to: '/privacy-policy' })
  policies.push({ label: '关于我们', to: '/about' })

  return (
    <footer className='mt-20 px-6 pt-10 pb-24 md:px-[97px]'>
      <div className='mx-auto grid max-w-[1232px] gap-10 md:grid-cols-[412px_repeat(4,1fr)]'>
        <div>
          <Link to='/' className='flex items-center gap-2 text-[16px] font-bold text-[#1a1a1a]'>
            <BrandMark tone='blue' size={24} className='rounded-full' />
            {brand.name}
          </Link>
          <p className='mt-2 text-[14px] text-[#626773]'>
            © {new Date().getFullYear()} {brand.name}
          </p>
        </div>
        <Column
          title='产品'
          links={[
            { label: '模型', to: '/models' },
            { label: '排行榜', to: '/rankings' },
            { label: '对话', to: '/chat' },
            { label: '充值', to: '/settings/credits' },
          ]}
        />
        <Column
          title='开发者'
          links={[
            ...(status?.docs_link ? [{ label: '文档', to: status.docs_link, external: true }] : []),
            { label: 'API 密钥', to: '/settings/keys' },
            { label: '使用记录', to: '/activity' },
            { label: '控制台', to: '/settings/keys' },
          ]}
        />
        <Column
          title='社区'
          links={[{ label: 'GitHub', to: 'https://github.com/QuantumNous/new-api', external: true }]}
        />
        <Column title='条款与政策' links={policies} />
      </div>
    </footer>
  )
}
