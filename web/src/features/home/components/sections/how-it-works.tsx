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
import { Key, Link2, MessageSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'

export function HowItWorks() {
  const { t } = useTranslation()

  const steps = [
    {
      num: '1',
      title: t('Create a key'),
      desc: t(
        'Sign in, open API Keys, and create one key per app. Copy it before the dialog closes.'
      ),
      icon: <Key className='size-6' strokeWidth={1.5} />,
    },
    {
      num: '2',
      title: t('Copy the address'),
      desc: t(
        'Pick mainland or global, then copy Base URL, Host, or Full URL depending on the box in your app.'
      ),
      icon: <Link2 className='size-6' strokeWidth={1.5} />,
    },
    {
      num: '3',
      title: t('Send 你好'),
      desc: t(
        'Paste the exact model ID, save, and send a short hello. If it replies, you are done.'
      ),
      icon: <MessageSquare className='size-6' strokeWidth={1.5} />,
    },
  ]

  return (
    <section className='border-border/40 relative z-10 border-t px-4 py-20 sm:px-6 md:py-28'>
      <div className='mx-auto max-w-6xl'>
        <AnimateInView className='mb-14 text-center md:mb-16'>
          <p className='text-primary mb-3 text-xs font-medium'>
            {t('First three minutes')}
          </p>
          <h2 className='font-serif text-3xl tracking-tight md:text-4xl'>
            {t('Three steps. No server knowledge required.')}
          </h2>
        </AnimateInView>

        <div className='grid gap-8 md:grid-cols-3 md:gap-10'>
          {steps.map((step, i) => (
            <AnimateInView
              key={step.num}
              delay={i * 150}
              animation='fade-up'
              className='relative flex flex-col items-center text-center'
            >
              <div className='relative mb-6'>
                <div className='text-primary border-primary/20 bg-primary/8 flex size-16 items-center justify-center rounded-2xl border'>
                  {step.icon}
                </div>
                <div className='bg-foreground text-background absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full text-xs font-bold'>
                  {step.num}
                </div>
              </div>
              <h3 className='mb-2 text-base font-semibold'>{step.title}</h3>
              <p className='text-muted-foreground max-w-[280px] text-sm leading-relaxed'>
                {step.desc}
              </p>
            </AnimateInView>
          ))}
        </div>
      </div>
    </section>
  )
}
