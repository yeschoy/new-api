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
import { Key } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { useApiKeys } from './api-keys-provider'

export function ApiKeysBeginnerEmpty() {
  const { t } = useTranslation()
  const { setOpen } = useApiKeys()

  return (
    <div
      data-keys-empty
      className='bg-card/80 mx-auto flex max-w-xl flex-col items-center rounded-3xl border px-6 py-12 text-center'
    >
      <span className='bg-primary/10 text-primary mb-4 flex size-14 items-center justify-center rounded-2xl'>
        <Key className='size-7' aria-hidden='true' />
      </span>
      <h3 className='font-serif text-2xl tracking-tight'>
        {t('Create your first key')}
      </h3>
      <p className='text-muted-foreground mt-3 max-w-md text-sm leading-relaxed'>
        {t(
          'A key is like a password for one app. Create one, copy it immediately, then paste it into your software.'
        )}
      </p>
      <div className='mt-6 flex flex-wrap items-center justify-center gap-3'>
        <Button
          size='lg'
          className='h-11 rounded-xl'
          onClick={() => setOpen('create')}
        >
          {t('Create your first key')}
        </Button>
      </div>
    </div>
  )
}
