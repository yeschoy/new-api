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
import { ExternalLink } from 'lucide-react'
import { Link } from 'react-router'

import { FanOut, IconScatter, PerfPanes, PolicyShield } from './router-feature-visuals'

type Card = {
  title: string
  body: string
  link: { label: string; to: string; external?: boolean }
  visual: React.ReactNode
}

/** Four 302×377 cards, 24px gap, 8px radius, visual band then copy. */
export function RouterFeatures(props: { icons: string[]; slug: string }) {
  const cards: Card[] = [
    {
      title: '文本、图像、视频与音频',
      body: '一个统一接口生成一切，主流模型尽在一处。',
      link: { label: '查看全部', to: '/models' },
      visual: <IconScatter icons={props.icons} />,
    },
    {
      title: '更高可用性',
      body: '分布式渠道调度，单个渠道故障时自动切换到其他渠道。',
      link: { label: '了解更多', to: '/rankings' },
      visual: <FanOut slug={props.slug} icons={props.icons} />,
    },
    {
      title: '价格与性能',
      body: '控制成本的同时不牺牲速度，按 Token 透明计价，用多少付多少。',
      link: { label: '了解更多', to: '/models' },
      visual: <PerfPanes />,
    },
    {
      title: '自定义访问策略',
      body: '为每个密钥限定可用模型、分组与 IP，请求只发往你信任的渠道。',
      link: { label: '查看密钥', to: '/settings/keys' },
      visual: <PolicyShield />,
    },
  ]

  return (
    <section className='mx-auto mt-20 grid max-w-[1280px] gap-6 px-6 sm:grid-cols-2 xl:grid-cols-4 xl:px-0'>
      {cards.map((card) => (
        <article
          key={card.title}
          className='border-or-line bg-or-card flex h-[377px] flex-col overflow-hidden rounded-[8px] border'
        >
          <div className='flex h-[184px] items-start justify-center overflow-hidden'>
            {card.visual}
          </div>
          <div className='flex flex-1 flex-col px-6 pt-6 pb-6'>
            <h3 className='text-[16px] leading-[21.6px] font-semibold'>{card.title}</h3>
            <p className='text-or-muted mt-2 text-[14px] leading-[22.75px]'>{card.body}</p>
            <Link
              to={card.link.to}
              className='text-or-fg mt-auto flex w-fit items-center gap-1 text-[14px] font-medium underline decoration-or-fg/40 underline-offset-4 hover:decoration-or-fg'
            >
              {card.link.label}
              <ExternalLink className='size-3.5' aria-hidden='true' />
            </Link>
          </div>
        </article>
      ))}
    </section>
  )
}
