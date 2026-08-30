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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  sideDrawerContentClassName,
  sideDrawerFormClassName,
  sideDrawerHeaderClassName,
} from '@/components/drawer-layout'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import { GUIDE_UPDATED_AT } from '../constants'
import { isUseCaseId } from '../lib/use-case'
import type { UseCaseId } from '../types'
import { FirstPicks } from './first-picks'
import { ToolList } from './tool-list'
import { UseCasePicker } from './use-case-picker'

type GuideDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialUseCase?: string
}

export function GuideDrawer(props: GuideDrawerProps) {
  const { t } = useTranslation()
  const [useCase, setUseCase] = useState<UseCaseId | 'all'>(() =>
    isUseCaseId(props.initialUseCase) ? props.initialUseCase : 'chat'
  )

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side='right'
        className={sideDrawerContentClassName('sm:max-w-2xl')}
      >
        <SheetHeader className={sideDrawerHeaderClassName()}>
          <SheetTitle>{t('How to fill this into an app')}</SheetTitle>
          <SheetDescription>
            {t(
              'Pick what you want to do. Then follow the steps for that software.'
            )}{' '}
            {t('Updated {{date}}', { date: GUIDE_UPDATED_AT })}
          </SheetDescription>
        </SheetHeader>
        <div className={sideDrawerFormClassName()}>
          <FirstPicks
            onPick={(id) => {
              setUseCase('all')
              window.setTimeout(() => {
                document
                  .querySelector(`#tool-${id}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
              }, 50)
            }}
          />
          <UseCasePicker value={useCase} onChange={setUseCase} />
          <ToolList useCase={useCase} />
        </div>
        <SheetFooter className='border-t'>
          <Button
            variant='outline'
            className='w-full'
            render={<Link to='/guide' />}
          >
            {t('Open the usage guide')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
