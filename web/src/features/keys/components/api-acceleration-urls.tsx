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
import { Check, Copy, Globe2, RadioTower } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { cn } from '@/lib/utils'

const API_ACCELERATION_URLS = {
  china: 'https://yeschoy.com',
  global: 'https://api.yeschoy.com',
} as const

type ApiAccelerationUrlsProps = {
  className?: string
}

export function ApiAccelerationUrls({ className }: ApiAccelerationUrlsProps) {
  const { t } = useTranslation()
  const { copiedText, copyToClipboard } = useCopyToClipboard({ notify: false })
  const endpoints = [
    {
      label: t('Mainland China acceleration URL'),
      url: API_ACCELERATION_URLS.china,
      icon: RadioTower,
    },
    {
      label: t('Global acceleration URL'),
      url: API_ACCELERATION_URLS.global,
      icon: Globe2,
    },
  ]

  return (
    <div
      className={cn(
        'grid w-full min-w-0 gap-2 sm:w-[32rem] sm:grid-cols-2',
        className
      )}
    >
      {endpoints.map((endpoint) => {
        const Icon = endpoint.icon
        const copied = copiedText === endpoint.url

        return (
          <div
            key={endpoint.url}
            className='border-border bg-background/85 flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2 shadow-xs'
          >
            <Icon className='text-primary size-4 shrink-0' aria-hidden='true' />
            <div className='min-w-0 flex-1'>
              <span className='text-muted-foreground block truncate text-[10px] leading-4 font-semibold'>
                {endpoint.label}
              </span>
              <code
                className='text-foreground block truncate font-mono text-xs leading-4 font-medium'
                title={endpoint.url}
              >
                {endpoint.url}
              </code>
            </div>
            <Button
              type='button'
              variant='ghost'
              size='icon-xs'
              className='shrink-0'
              aria-label={t('Copy {{label}}', { label: endpoint.label })}
              onClick={() => void copyToClipboard(endpoint.url)}
            >
              {copied ? (
                <Check className='text-success' />
              ) : (
                <Copy aria-hidden='true' />
              )}
            </Button>
          </div>
        )
      })}
    </div>
  )
}
