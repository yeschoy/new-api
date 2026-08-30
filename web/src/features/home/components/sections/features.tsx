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
import {
  AppWindow,
  ArrowLeftRight,
  CircleAlert,
  Key,
  MousePointerClick,
  Sprout,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'

export function Features() {
  const { t } = useTranslation()

  const features = [
    {
      title: t('Written for first-time users'),
      desc: t(
        'You start with a key, an address, and a model. The rest can wait.'
      ),
      icon: Sprout,
    },
    {
      title: t('Works in the apps you already have'),
      desc: t(
        'Cherry Studio, WorkBuddy, Cline, and more. The three fields are the same.'
      ),
      icon: AppWindow,
    },
    {
      title: t('Two lines, same paste'),
      desc: t(
        'Mainland and global use the same three fields. Switch the domain, keep everything else.'
      ),
      icon: ArrowLeftRight,
    },
    {
      title: t('Pick a use first'),
      desc: t('Tell us what you want to do. We will only show matching apps.'),
      icon: MousePointerClick,
    },
    {
      title: t('If something goes wrong'),
      desc: t(
        '401, 404, and 429 are explained in plain language, with the first thing to try.'
      ),
      icon: CircleAlert,
    },
    {
      title: t('One key per app'),
      desc: t(
        'If the WorkBuddy key leaks, delete that one. Cline keeps running.'
      ),
      icon: Key,
    },
  ]

  return (
    <section className='relative z-10 px-4 py-20 sm:px-6 md:py-24'>
      <div className='mx-auto max-w-6xl'>
        <AnimateInView className='mb-12 max-w-2xl'>
          <p className='text-primary mb-2 text-xs font-medium'>
            {t('How we help you get started')}
          </p>
          <h2 className='font-serif text-3xl tracking-tight md:text-4xl'>
            {t('You do not need to learn the admin panel first.')}
          </h2>
        </AnimateInView>
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <AnimateInView
                key={feature.title}
                delay={index * 70}
                className='bg-card/80 rounded-2xl border p-5'
              >
                <span className='bg-primary/10 text-primary mb-4 flex size-10 items-center justify-center rounded-xl'>
                  <Icon className='size-5' aria-hidden='true' />
                </span>
                <h3 className='font-medium'>{feature.title}</h3>
                <p className='text-muted-foreground mt-2 text-sm leading-relaxed'>
                  {feature.desc}
                </p>
              </AnimateInView>
            )
          })}
        </div>
      </div>
    </section>
  )
}
