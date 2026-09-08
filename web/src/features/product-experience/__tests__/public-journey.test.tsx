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
import { QueryClient } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { CiLandingPage } from '@/features/home/components/ci-landing-page'
import { renderApp } from '@/test-utils/render-app'

let client: QueryClient | undefined
afterEach(() => client?.clear())
describe('public product journey', () => {
  it('offers account creation, model discovery, setup and manual supplier contact on the current landing', async () => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    client.setQueryData(['status'], {}, { updatedAt: Date.now() + 60000 })
    await renderApp(
      <CiLandingPage
        isAuthenticated={false}
        models={[]}
        maxSavingsPercent={0}
      />,
      client
    )
    expect(
      screen
        .getAllByRole('link', { name: 'Start saving' })
        .every((link) => link.getAttribute('href') === '/sign-up')
    ).toBe(true)
    expect(screen.getByRole('link', { name: 'Model Price' })).toHaveAttribute(
      'href',
      '/pricing'
    )
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute(
      'href',
      '/guide'
    )
    expect(
      screen.getByRole('heading', {
        name: 'Change two values. Access every leading provider.',
      })
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Copy application details' })
    ).toBeVisible()
  })
})
