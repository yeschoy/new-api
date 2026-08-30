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
import { Button } from '@/components/ui/button'
import { FieldBackdrop } from '@/features/guide/components/field-backdrop'

interface CTAProps {
  className?: string
  isAuthenticated?: boolean
}

export function CTA(props: CTAProps) {
  const { t } = useTranslation()

  return (
    <section className='relative z-10 overflow-hidden px-4 py-20 sm:px-6 md:py-28'>
      <FieldBackdrop />
      <AnimateInView
        className='mx-auto max-w-2xl text-center'
        animation='scale-in'
      >
        <h2 className='font-serif text-3xl leading-tight tracking-tight md:text-5xl'>
          {t('Start with one app today.')}
        </h2>
        <p className='text-muted-foreground mx-auto mt-5 max-w-md text-sm leading-relaxed md:text-base'>
          {props.isAuthenticated
            ? t(
                'Create a key for the app you will actually use, then open the beginner guide and paste the three fields.'
              )
            : t(
                'Create an account, make one key, and paste it into Cherry Studio or WorkBuddy. You can grow from there.'
              )}
        </p>
        <div className='mt-8 flex items-center justify-center gap-3'>
          <Button
            className='group rounded-lg'
            render={<Link to={props.isAuthenticated ? '/keys' : '/sign-up'} />}
          >
            {props.isAuthenticated
              ? t('Create API Key')
              : t('Create a free account')}
            <ArrowRight className='ml-1 size-3.5 transition-transform duration-200 group-hover:translate-x-0.5' />
          </Button>
          <Button
            variant='outline'
            className='rounded-lg'
            render={<Link to='/guide' />}
          >
            {t('Usage guide')}
          </Button>
        </div>
      </AnimateInView>
    </section>
  )
}
