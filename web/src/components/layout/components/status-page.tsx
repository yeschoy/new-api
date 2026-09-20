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

import { BrandMark } from '@/components/brand-mark'
import { PRODUCT_NAME } from '@/lib/product-brand'

import { CommunityHelp } from './community-help'

type StatusPageProps = {
  code?: string | number
  title: string
  description: React.ReactNode
  actions?: React.ReactNode
}

/** Full-page status layout for 401 / 403 / 404 / 500 / maintenance. */
export function StatusPage(props: StatusPageProps) {
  return (
    <div className='ed-site'>
      <header className='ed-header'>
        <div className='ed-container ed-headerInner'>
          <Link to='/' className='ed-brand' aria-label={`${PRODUCT_NAME} home`}>
            <BrandMark size={28} withWordmark />
          </Link>
          <CommunityHelp variant='header' />
        </div>
      </header>
      <main className='ed-status ed-container'>
        <p className='ed-eyebrow'>{PRODUCT_NAME}</p>
        {props.code != null ? (
          <h1 className='ed-display'>{props.code}</h1>
        ) : null}
        <h2 className='ed-display'>{props.title}</h2>
        <div>{props.description}</div>
        {props.actions ? (
          <div className='ed-heroActions'>{props.actions}</div>
        ) : null}
      </main>
    </div>
  )
}
