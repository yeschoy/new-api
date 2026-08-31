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

import { LiquidGlassButton } from '@/components/liquid-glass'

import { LandingGlow } from '../landing-glow'
import { ToolLogoRow } from '../tool-logo-row'

interface HeroProps {
  isAuthenticated?: boolean
}

export function Hero(props: HeroProps) {
  const { t } = useTranslation()

  return (
    <section className='relative isolate overflow-hidden px-4 pt-28 pb-20 sm:px-6 md:pt-40 md:pb-28'>
      <LandingGlow />
      <div className='mx-auto flex max-w-5xl flex-col items-center text-center'>
        <p
          className='landing-animate-fade-up text-muted-foreground mb-6 text-sm tracking-wide'
          style={{ animationDelay: '0ms' }}
        >
          {t('First three minutes')}
        </p>

        <h1
          className='landing-animate-fade-up text-[clamp(2.6rem,7vw,5.4rem)] font-semibold tracking-[-0.045em] text-balance'
          style={{ animationDelay: '60ms' }}
        >
          {t('Connect AI to the app you already use.')}
        </h1>
        <p
          className='landing-animate-fade-up text-muted-foreground mt-6 max-w-2xl text-base leading-relaxed text-balance md:text-lg'
          style={{ animationDelay: '120ms' }}
        >
          {t(
            'You do not need to know how servers work. Create a key, copy an address, paste a model name, then send 你好.'
          )}
        </p>

        <div
          className='landing-animate-fade-up mt-10 flex flex-wrap items-center justify-center gap-3'
          style={{ animationDelay: '180ms' }}
        >
          {props.isAuthenticated ? (
            <LiquidGlassButton
              className='group h-12 rounded-full border px-6 text-sm font-medium'
              render={<Link to='/dashboard' />}
            >
              {t('Get Started')}
              <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
            </LiquidGlassButton>
          ) : (
            <LiquidGlassButton
              className='group h-12 rounded-full border px-6 text-sm font-medium'
              render={<Link to='/sign-up' />}
            >
              {t('Create a free account')}
              <ArrowRight className='ml-1.5 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
            </LiquidGlassButton>
          )}
          <LiquidGlassButton
            glass='default'
            variant='outline'
            className='h-12 rounded-full px-6 text-sm font-medium'
            render={<Link to='/guide' />}
          >
            {t('Usage guide')}
          </LiquidGlassButton>
        </div>

        <div
          className='landing-animate-fade-up mt-16 w-full'
          style={{ animationDelay: '240ms' }}
        >
          <ToolLogoRow />
        </div>
      </div>
    </section>
  )
}
