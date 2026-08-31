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
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { FieldBackdrop } from '@/features/guide/components/field-backdrop'
import { StarterKitCard } from '@/features/guide/components/starter-kit-card'

interface HeroProps {
  className?: string
  isAuthenticated?: boolean
}

export function Hero(props: HeroProps) {
  const { t } = useTranslation()

  return (
    <section className='relative z-10 overflow-hidden px-4 pt-24 pb-12 sm:px-6 md:pt-32 md:pb-20'>
      <FieldBackdrop />
      <div className='mx-auto grid max-w-6xl items-start gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-12'>
        <div className='flex flex-col items-start text-left'>
          <div
            className='landing-animate-fade-up border-primary/20 bg-primary/8 text-primary mb-5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium'
            style={{ animationDelay: '0ms' }}
          >
            <span className='relative flex size-1.5'>
              <span className='bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75' />
              <span className='bg-primary relative inline-flex size-1.5 rounded-full' />
            </span>
            <span>{t('First time here? Start with these three fields.')}</span>
          </div>

          <h1
            className='landing-animate-fade-up font-serif text-[clamp(2.4rem,5vw,4.1rem)] leading-[1.08] tracking-tight'
            style={{ animationDelay: '60ms' }}
          >
            {t('Three things.')}
            <br />
            {t('Connect AI to the app you already use.')}
          </h1>
          <p
            className='landing-animate-fade-up text-muted-foreground mt-5 max-w-xl text-base leading-relaxed md:text-lg'
            style={{ animationDelay: '120ms' }}
          >
            {t(
              'You do not need to know how servers work. Create a key, copy an address, paste a model name, then send 你好.'
            )}
          </p>

          <div
            className='landing-animate-fade-up mt-8 flex flex-wrap items-center gap-3'
            style={{ animationDelay: '180ms' }}
          >
            {props.isAuthenticated ? (
              <>
                <Button
                  className='group h-11 rounded-lg px-5 text-sm font-medium shadow-[0_0_24px_-6px_color-mix(in_oklch,var(--primary)_80%,transparent)]'
                  render={<Link to='/keys' />}
                >
                  {t('Create API Key')}
                  <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
                </Button>
                <Button
                  variant='outline'
                  className='h-11 rounded-lg px-5 text-sm font-medium'
                  render={<Link to='/guide' />}
                >
                  {t('Usage guide')}
                </Button>
              </>
            ) : (
              <>
                <Button
                  className='group h-11 rounded-lg px-5 text-sm font-medium shadow-[0_0_24px_-6px_color-mix(in_oklch,var(--primary)_80%,transparent)]'
                  render={<Link to='/sign-up' />}
                >
                  {t('Create a free account')}
                  <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
                </Button>
                <Button
                  variant='outline'
                  className='h-11 rounded-lg px-5 text-sm font-medium'
                  render={<Link to='/guide' />}
                >
                  {t('Usage guide')}
                </Button>
              </>
            )}
          </div>
        </div>

        <div
          className='landing-animate-fade-up'
          style={{ animationDelay: '220ms' }}
        >
          <StarterKitCard compact />
        </div>
      </div>
    </section>
  )
}
