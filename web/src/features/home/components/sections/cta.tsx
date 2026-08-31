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

import { AnimateInView } from '@/components/animate-in-view'
import { LiquidGlassButton } from '@/components/liquid-glass'

import { LandingGlow } from '../landing-glow'

interface CTAProps {
  isAuthenticated?: boolean
}

export function CTA(props: CTAProps) {
  const { t } = useTranslation()

  return (
    <section className='relative isolate overflow-hidden px-4 py-24 sm:px-6 md:py-32'>
      <LandingGlow />
      <AnimateInView
        className='mx-auto max-w-3xl text-center'
        animation='scale-in'
      >
        <h2 className='text-4xl font-semibold tracking-tight text-balance md:text-6xl'>
          {t('Start with one app today.')}
        </h2>
        <p className='text-muted-foreground mx-auto mt-6 max-w-lg text-base leading-relaxed'>
          {props.isAuthenticated
            ? t(
                'Create a key for the app you will actually use, then open the beginner guide and paste the three fields.'
              )
            : t(
                'Create an account, make one key, and paste it into Cherry Studio or WorkBuddy. You can grow from there.'
              )}
        </p>
        <div className='mt-10 flex flex-wrap items-center justify-center gap-3'>
          <LiquidGlassButton
            className='group h-12 rounded-full border px-6'
            render={
              <Link to={props.isAuthenticated ? '/dashboard' : '/sign-up'} />
            }
          >
            {props.isAuthenticated
              ? t('Get Started')
              : t('Create a free account')}
            <ArrowRight className='ml-1 size-4 transition-transform duration-200 group-hover:translate-x-0.5' />
          </LiquidGlassButton>
          <LiquidGlassButton
            glass='default'
            variant='outline'
            className='h-12 rounded-full px-6'
            render={<Link to='/guide' />}
          >
            {t('Usage guide')}
          </LiquidGlassButton>
        </div>
      </AnimateInView>
    </section>
  )
}
