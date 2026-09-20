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
import { PRODUCT_NAME } from '@/lib/product-brand'
import { cn } from '@/lib/utils'

type TerminalPageProps = {
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  wide?: boolean
}

/** Page frame for the easy-mode console: editorial title, rule, body. */
export function TerminalPage(props: TerminalPageProps) {
  return (
    <div
      className={cn('ed-page', props.wide && 'ed-page--wide', props.className)}
    >
      <header className='ed-pageHead'>
        <div>
          <p className='ed-eyebrow'>{PRODUCT_NAME}</p>
          <h1 className='ed-display'>{props.title}</h1>
          {props.description ? <p>{props.description}</p> : null}
        </div>
        {props.actions ? (
          <div className='ed-pageActions'>{props.actions}</div>
        ) : null}
      </header>
      <div className='ed-pageBody'>{props.children}</div>
    </div>
  )
}
